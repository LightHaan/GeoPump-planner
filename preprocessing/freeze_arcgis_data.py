"""Freeze ArcGIS and supplementary inputs into an open postcode data package.

This script is intentionally an offline build step. It reads but never edits the
source ArcGIS project/geodatabase. Run it with ArcGIS Pro's ``propy.bat``.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
from collections import Counter, defaultdict
import datetime as datetime_module
from pathlib import Path
from typing import Any, Iterable

import arcpy
import numpy as np


SCHEMA_VERSION = "1.0.0"
DATASET_VERSION = "2026.08.05-phase0"
POSTCODE_FIELD = "POA_CODE21"
MJ_PER_KWH = 3.6
TAIR_SCALE_DIVISOR = 100.0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", type=Path, required=True)
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "data-freeze",
    )
    parser.add_argument("--reference-depth-m", type=float, default=20.0)
    parser.add_argument("--nearby-radius-km", type=float, default=50.0)
    parser.add_argument("--simplify-tolerance-deg", type=float, default=0.01)
    parser.add_argument("--dataset-version", default=DATASET_VERSION)
    return parser.parse_args()


def postcode(value: Any) -> str:
    if value is None:
        raise ValueError("Postcode cannot be null")
    text = str(value).strip()
    if text.endswith(".0"):
        text = text[:-2]
    return text.zfill(4)


def finite_or_none(value: Any) -> float | None:
    if value in (None, ""):
        return None
    number = float(value)
    return number if math.isfinite(number) else None


def rounded(value: float | None, digits: int = 8) -> float | None:
    return None if value is None else round(float(value), digits)


def add(a: float | None, b: float | None) -> float | None:
    return None if a is None or b is None else a + b


def divide(a: float | None, b: float) -> float | None:
    return None if a is None else a / b


def read_csv_lookup(path: Path, key_field: str) -> dict[str, dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return {postcode(row[key_field]): row for row in csv.DictReader(handle)}


def read_feature_lookup(
    feature_class: Path, key_field: str, fields: list[str]
) -> dict[str, dict[str, Any]]:
    lookup: dict[str, dict[str, Any]] = {}
    cursor_fields = [key_field, *fields]
    with arcpy.da.SearchCursor(str(feature_class), cursor_fields) as cursor:
        for row in cursor:
            lookup[postcode(row[0])] = dict(zip(fields, row[1:]))
    return lookup


def postcode_points(
    feature_class: Path,
) -> tuple[dict[str, dict[str, Any]], str, list[str]]:
    wgs84 = arcpy.SpatialReference(4326)
    source_sr = arcpy.Describe(str(feature_class)).spatialReference
    points: dict[str, dict[str, Any]] = {}
    excluded_null_geometry: list[str] = []
    with arcpy.da.SearchCursor(
        str(feature_class), [POSTCODE_FIELD, "POA_NAME21", "SHAPE@"]
    ) as cursor:
        for code, name, geometry in cursor:
            if geometry is None:
                excluded_null_geometry.append(postcode(code))
                continue
            label = geometry.labelPoint
            if source_sr.factoryCode != wgs84.factoryCode:
                label = arcpy.PointGeometry(label, source_sr).projectAs(wgs84).firstPoint
            points[postcode(code)] = {
                "postcode_name": str(name or postcode(code)),
                "lon": float(label.X),
                "lat": float(label.Y),
            }
    return points, source_sr.name, excluded_null_geometry


def zonal_standard_error(
    postcode_fc: Path, standard_error_raster: Path, work_gdb: Path
) -> dict[str, float]:
    arcpy.CheckOutExtension("Spatial")
    try:
        out_table = work_gdb / "postcode_standard_error"
        if arcpy.Exists(str(out_table)):
            arcpy.management.Delete(str(out_table))
        arcpy.sa.ZonalStatisticsAsTable(
            str(postcode_fc),
            POSTCODE_FIELD,
            str(standard_error_raster),
            str(out_table),
            "DATA",
            "MEAN",
        )
        return {
            postcode(code): float(mean)
            for code, mean in arcpy.da.SearchCursor(
                str(out_table), [POSTCODE_FIELD, "MEAN"]
            )
            if mean is not None
        }
    finally:
        arcpy.CheckInExtension("Spatial")


def eligible_boreholes(
    feature_class: Path, reference_depth_m: float
) -> tuple[np.ndarray, dict[str, int]]:
    coords: list[tuple[float, float]] = []
    counts = Counter(total=0, depth_eligible=0, usable=0)
    fields = ["Lat", "LNG", "depth", "t20"]
    with arcpy.da.SearchCursor(str(feature_class), fields) as cursor:
        for lat, lon, depth, ground_temp in cursor:
            counts["total"] += 1
            if depth is None or float(depth) < reference_depth_m:
                continue
            counts["depth_eligible"] += 1
            if lat is None or lon is None or ground_temp is None:
                continue
            coords.append((float(lat), float(lon)))
            counts["usable"] += 1
    return np.asarray(coords, dtype=float), dict(counts)


def haversine_quality(
    postcode_rows: dict[str, dict[str, Any]],
    boreholes_lat_lon: np.ndarray,
    radius_km: float,
) -> dict[str, dict[str, float | int]]:
    earth_radius_km = 6371.0088
    bore_lat = np.radians(boreholes_lat_lon[:, 0])
    bore_lon = np.radians(boreholes_lat_lon[:, 1])
    output: dict[str, dict[str, float | int]] = {}
    for code, row in postcode_rows.items():
        lat = math.radians(row["lat"])
        lon = math.radians(row["lon"])
        dlat = bore_lat - lat
        dlon = bore_lon - lon
        a = np.sin(dlat / 2.0) ** 2 + math.cos(lat) * np.cos(bore_lat) * (
            np.sin(dlon / 2.0) ** 2
        )
        distances = earth_radius_km * 2.0 * np.arcsin(np.sqrt(np.clip(a, 0.0, 1.0)))
        output[code] = {
            "nearest_borehole_km": float(np.min(distances)),
            "nearby_borehole_count": int(np.count_nonzero(distances <= radius_km)),
        }
    return output


def climate_inventory(path: Path) -> tuple[dict[str, dict[str, Any]], dict[str, Any]]:
    per_postcode: dict[str, dict[str, Any]] = defaultdict(
        lambda: {
            "record_count": 0,
            "days": set(),
            "hours": set(),
            "min_tair_stored": math.inf,
            "max_tair_stored": -math.inf,
        }
    )
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            code = postcode(row["POSCODE"])
            item = per_postcode[code]
            item["record_count"] += 1
            item["days"].add(int(row["utc_day"]))
            item["hours"].add(int(row["utc_hour"]))
            value = float(row["tair"])
            item["min_tair_stored"] = min(item["min_tair_stored"], value)
            item["max_tair_stored"] = max(item["max_tair_stored"], value)

    normalized: dict[str, dict[str, Any]] = {}
    record_counts = Counter()
    all_days: set[int] = set()
    for code, item in per_postcode.items():
        days = sorted(item.pop("days"))
        hours = sorted(item.pop("hours"))
        record_counts[item["record_count"]] += 1
        all_days.update(days)
        normalized[code] = {
            **item,
            "unique_day_count": len(days),
            "unique_hour_count": len(hours),
            "represented_hours_with_weight_5": item["record_count"] * 5,
            "min_air_temp_c": item["min_tair_stored"] / TAIR_SCALE_DIVISOR,
            "max_air_temp_c": item["max_tair_stored"] / TAIR_SCALE_DIVISOR,
        }
    summary = {
        "postcode_count": len(normalized),
        "record_count_distribution": {str(k): v for k, v in sorted(record_counts.items())},
        "unique_days": sorted(all_days),
        "day_spacing": sorted({b - a for a, b in zip(sorted(all_days), sorted(all_days)[1:])}),
        "stored_temperature_scale_divisor": TAIR_SCALE_DIVISOR,
        "inferred_weight_hours": 5,
    }
    return normalized, summary


def write_csv(path: Path, rows: Iterable[dict[str, Any]], fields: list[str]) -> None:
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def write_json(path: Path, value: Any, *, compact: bool = False) -> None:
    with path.open("w", encoding="utf-8") as handle:
        json.dump(
            value,
            handle,
            ensure_ascii=False,
            allow_nan=False,
            separators=(",", ":") if compact else None,
            indent=None if compact else 2,
        )
        handle.write("\n")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def export_boundaries(
    postcode_fc: Path,
    work_gdb: Path,
    output_geojson: Path,
    tolerance_deg: float,
) -> None:
    if output_geojson.exists():
        output_geojson.unlink()
    projected = work_gdb / "postcode_wgs84"
    simplified = work_gdb / "postcode_wgs84_simplified"
    for item in (projected, simplified):
        if arcpy.Exists(str(item)):
            arcpy.management.Delete(str(item))
    arcpy.management.Project(str(postcode_fc), str(projected), arcpy.SpatialReference(4326))
    arcpy.cartography.SimplifyPolygon(
        str(projected),
        str(simplified),
        "POINT_REMOVE",
        f"{tolerance_deg} Degrees",
        "0 SquareKilometers",
        "RESOLVE_ERRORS",
        "NO_KEEP",
    )
    arcpy.conversion.FeaturesToJSON(
        str(simplified),
        str(output_geojson),
        "NOT_FORMATTED",
        "NO_Z_VALUES",
        "NO_M_VALUES",
        "GEOJSON",
        "WGS84",
        "USE_FIELD_NAME",
    )


def build_attributes(
    points: dict[str, dict[str, Any]],
    ground: dict[str, dict[str, Any]],
    loads: dict[str, dict[str, str]],
    standard_error: dict[str, float],
    borehole_quality: dict[str, dict[str, float | int]],
    climate: dict[str, dict[str, Any]],
    reference_depth_m: float,
    nearby_radius_km: float,
) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]], list[dict[str, Any]]]:
    wide_rows: list[dict[str, Any]] = []
    nested: dict[str, dict[str, Any]] = {}
    index: list[dict[str, Any]] = []
    for code in sorted(points):
        p = points[code]
        g = ground.get(code, {})
        load = loads.get(code, {})
        air_surface = finite_or_none(g.get("AirT"))
        air_delta = finite_or_none(g.get("deltaT20New"))
        surface_surface = finite_or_none(g.get("surfaceT"))
        surface_delta = finite_or_none(g.get("deltaT20"))
        cooling_mj = finite_or_none(load.get("Cooling_In_Megajoules_Per_Square_Metre"))
        heating_mj = finite_or_none(load.get("Heating_In_Megajoules_Per_Square_Metre"))
        dwelling_count = finite_or_none(load.get("Dwelling_Count"))
        q = borehole_quality[code]
        notes: list[str] = []
        if code not in ground:
            notes.append("No paired ArcGIS ground-temperature attributes.")
        if heating_mj is None or cooling_mj is None:
            notes.append("Annual residential load is unavailable.")
        if code not in climate:
            notes.append("Representative-hour air-temperature data are unavailable.")
        if code not in standard_error:
            notes.append(
                "No postcode zonal mean is available from the ΔT20 EBK "
                "prediction-standard-error raster."
            )

        row = {
            "postcode": code,
            "postcode_name": p["postcode_name"],
            "centroid_lat": rounded(p["lat"]),
            "centroid_lon": rounded(p["lon"]),
            "air_t_surface_temp_c": rounded(air_surface),
            "air_t_delta_temp_at_reference_depth_c": rounded(air_delta),
            "air_t_gradient_c_per_m": rounded(divide(air_delta, reference_depth_m)),
            "air_t_ground_temp_at_reference_depth_c": rounded(add(air_surface, air_delta)),
            "surface_t_surface_temp_c": rounded(surface_surface),
            "surface_t_delta_temp_at_reference_depth_c": rounded(surface_delta),
            "surface_t_gradient_c_per_m": rounded(divide(surface_delta, reference_depth_m)),
            "surface_t_ground_temp_at_reference_depth_c": rounded(add(surface_surface, surface_delta)),
            "delta_t20_ebk_prediction_se_c": rounded(standard_error.get(code)),
            "nearest_borehole_km": rounded(float(q["nearest_borehole_km"]), 5),
            "nearby_borehole_count": int(q["nearby_borehole_count"]),
            "nearby_radius_km": nearby_radius_km,
            "annual_heating_kwh_m2": rounded(
                None if heating_mj is None else heating_mj / MJ_PER_KWH
            ),
            "annual_cooling_kwh_m2": rounded(
                None if cooling_mj is None else cooling_mj / MJ_PER_KWH
            ),
            "certificate_count": None if dwelling_count is None else int(dwelling_count),
            "climate_record_count": climate.get(code, {}).get("record_count"),
            "climate_represented_hours": climate.get(code, {}).get(
                "represented_hours_with_weight_5"
            ),
            "data_notes": " ".join(notes),
        }
        wide_rows.append(row)
        nested[code] = {
            "location": {
                "lat": row["centroid_lat"],
                "lon": row["centroid_lon"],
                "postcode_name": row["postcode_name"],
            },
            "ground": {
                "reference_depth_m": reference_depth_m,
                "air_t": {
                    "surface_temp_c": row["air_t_surface_temp_c"],
                    "delta_temp_at_reference_depth_c": row[
                        "air_t_delta_temp_at_reference_depth_c"
                    ],
                    "gradient_c_per_m": row["air_t_gradient_c_per_m"],
                    "ground_temp_at_reference_depth_c": row[
                        "air_t_ground_temp_at_reference_depth_c"
                    ],
                },
                "surface_t": {
                    "surface_temp_c": row["surface_t_surface_temp_c"],
                    "delta_temp_at_reference_depth_c": row[
                        "surface_t_delta_temp_at_reference_depth_c"
                    ],
                    "gradient_c_per_m": row["surface_t_gradient_c_per_m"],
                    "ground_temp_at_reference_depth_c": row[
                        "surface_t_ground_temp_at_reference_depth_c"
                    ],
                },
                "nearest_borehole_km": row["nearest_borehole_km"],
                "nearby_borehole_count": row["nearby_borehole_count"],
                "nearby_radius_km": nearby_radius_km,
                "uncertainty": {
                    "delta_t20_ebk_prediction_se_c": row[
                        "delta_t20_ebk_prediction_se_c"
                    ],
                    "applies_to_dataset_id": "surface_t",
                    "scope": "delta_t20_interpolation_only",
                    "is_total_ground_temperature_uncertainty": False,
                },
            },
            "load": {
                "annual_heating_kwh_m2": row["annual_heating_kwh_m2"],
                "annual_cooling_kwh_m2": row["annual_cooling_kwh_m2"],
                "certificate_count": row["certificate_count"],
            },
            "climate": {
                "record_count": row["climate_record_count"],
                "represented_hours": row["climate_represented_hours"],
                "record_type": "weighted_representative_hour",
                "weight_hours": 5,
                "stored_temperature_scale_divisor": TAIR_SCALE_DIVISOR,
            },
            "quality": {
                "ground_temperature_method": "paired surface baseline plus residual-EBK delta temperature",
                "load_method": "postcode certificate mean",
                "warnings": notes,
            },
        }
        index.append(
            {
                "postcode": code,
                "locality_hint": p["postcode_name"],
                "state": None,
                "lat": row["centroid_lat"],
                "lon": row["centroid_lon"],
                "has_ground_data": all(
                    row[name] is not None
                    for name in (
                        "air_t_ground_temp_at_reference_depth_c",
                        "surface_t_ground_temp_at_reference_depth_c",
                    )
                ),
                "has_load_data": row["annual_heating_kwh_m2"] is not None
                and row["annual_cooling_kwh_m2"] is not None,
                "has_climate_data": code in climate,
            }
        )
    return wide_rows, nested, index


def data_dictionary() -> str:
    return """# Frozen postcode data dictionary

| Field | Unit | Meaning |
|---|---|---|
| postcode | string | Four-character Australian postcode; leading zero retained. |
| centroid_lat / centroid_lon | decimal degrees | Internal label point in WGS84. |
| air_t_surface_temp_c | degC | Postcode mean from ArcGIS `AirT`. |
| air_t_delta_temp_at_reference_depth_c | degC | Paired `deltaT20New`. |
| air_t_gradient_c_per_m | degC/m | `deltaT20New / reference_depth_m`. |
| air_t_ground_temp_at_reference_depth_c | degC | `AirT + deltaT20New`. |
| surface_t_surface_temp_c | degC | Postcode mean from ArcGIS `surfaceT`. |
| surface_t_delta_temp_at_reference_depth_c | degC | Paired `deltaT20`. |
| surface_t_gradient_c_per_m | degC/m | `deltaT20 / reference_depth_m`. |
| surface_t_ground_temp_at_reference_depth_c | degC | `surfaceT + deltaT20`. |
| delta_t20_ebk_prediction_se_c | degC | Zonal mean of `standerd_error`; partial interpolation uncertainty for the `surface_t` chain's ΔT20 EBK raster, not total ground-temperature uncertainty. |
| nearest_borehole_km | km | Haversine distance from postcode internal point to nearest usable reference-depth borehole record. |
| nearby_borehole_count | count | Usable boreholes within `nearby_radius_km`. |
| annual_heating_kwh_m2 | kWh/m2/year | Supplementary annual heating load divided by 3.6. |
| annual_cooling_kwh_m2 | kWh/m2/year | Supplementary annual cooling load divided by 3.6. |
| certificate_count | count | Source `Dwelling_Count`; exact label requires confirmation. |
| climate_record_count | count | Representative temperature records for the postcode. |
| climate_represented_hours | hours/year | Records multiplied by inferred weight 5. |
| data_notes | text | Explicit missing-data or provenance warnings. |
"""


def main() -> None:
    args = parse_args()
    source_root = args.source_root.resolve()
    output_dir = args.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    work_dir = Path(__file__).resolve().parent / "work"
    work_dir.mkdir(parents=True, exist_ok=True)
    work_gdb = work_dir / "phase0.gdb"
    if not arcpy.Exists(str(work_gdb)):
        arcpy.management.CreateFileGDB(str(work_dir), work_gdb.name)

    gdb = source_root / "HeatPump_2026Aug" / "HeatPump_2026Aug.gdb"
    postcode_fc = gdb / "POA_2021_AUST_GDA94_ExportFeatures"
    ground_fc = gdb / "POA_info2"
    borehole_fc = gdb / "BoreholeTemp"
    standard_error_raster = gdb / "standerd_error"
    load_csv = source_root / "Supp_File_2_POA_info.csv"
    climate_csv = source_root / "Supp_File_3_PostCodeHourlyTair.csv"
    required = [gdb, postcode_fc, ground_fc, borehole_fc, standard_error_raster, load_csv, climate_csv]
    missing = [str(path) for path in required if not (arcpy.Exists(str(path)) or path.exists())]
    if missing:
        raise FileNotFoundError("Missing source inputs: " + ", ".join(missing))
    if args.reference_depth_m <= 0:
        raise ValueError("reference-depth-m must be greater than zero")
    if args.nearby_radius_km <= 0:
        raise ValueError("nearby-radius-km must be greater than zero")

    points, postcode_source_sr, excluded_null_geometry = postcode_points(postcode_fc)
    ground = read_feature_lookup(
        ground_fc, POSTCODE_FIELD, ["AirT", "surfaceT", "deltaT20", "deltaT20New"]
    )
    loads = read_csv_lookup(load_csv, "POSCODE")
    climate, climate_summary = climate_inventory(climate_csv)
    se = zonal_standard_error(postcode_fc, standard_error_raster, work_gdb)
    boreholes, borehole_counts = eligible_boreholes(borehole_fc, args.reference_depth_m)
    borehole_quality = haversine_quality(points, boreholes, args.nearby_radius_km)
    wide_rows, nested, index = build_attributes(
        points,
        ground,
        loads,
        se,
        borehole_quality,
        climate,
        args.reference_depth_m,
        args.nearby_radius_km,
    )

    wide_csv = output_dir / "postcode-attributes.csv"
    attributes_json = output_dir / "postcode-attributes.json"
    index_json = output_dir / "postcode-index.json"
    climate_inventory_csv = output_dir / "climate-inventory.csv"
    boundaries_geojson = output_dir / "postcode-boundaries.geojson"
    dictionary_md = output_dir / "data-dictionary.md"
    validation_json = output_dir / "validation-report.json"
    source_notes_md = output_dir / "source-notes.md"
    manifest_json = output_dir / "manifest.json"
    checksum_file = output_dir / "checksums.sha256"

    write_csv(wide_csv, wide_rows, list(wide_rows[0]))
    write_json(attributes_json, nested, compact=True)
    write_json(index_json, index, compact=True)
    climate_rows = [
        {"postcode": code, **values} for code, values in sorted(climate.items())
    ]
    write_csv(climate_inventory_csv, climate_rows, list(climate_rows[0]))
    dictionary_md.write_text(data_dictionary(), encoding="utf-8")
    export_boundaries(
        postcode_fc,
        work_gdb,
        boundaries_geojson,
        args.simplify_tolerance_deg,
    )

    duplicate_codes = len(wide_rows) - len({row["postcode"] for row in wide_rows})
    missing_counts = {
        field: sum(row[field] is None for row in wide_rows)
        for field in wide_rows[0]
        if field not in {"data_notes", "postcode_name"}
    }
    warnings = [
        "The ArcGIS `standerd_error` raster represents ΔT20 EBK prediction standard error for the `surface_t` chain only. It is a partial uncertainty indicator and must not be described as total ground-temperature uncertainty.",
        f"The current cleaned ArcGIS `BoreholeTemp` release contains {borehole_counts['usable']} usable records at or below the reference-depth criterion; eight negative depth magnitudes in the earlier 8,380-record snapshot were corrected to positive depths.",
        "State and locality names are not present in the current postcode feature class; the postcode itself is retained as the locality hint.",
        f"Excluded non-spatial postcode records with null geometry: {', '.join(excluded_null_geometry)}.",
    ]
    validation = {
        "passed": duplicate_codes == 0
        and len(wide_rows) == len(index)
        and all(len(row["postcode"]) == 4 for row in wide_rows),
        "postcode_count": len(wide_rows),
        "duplicate_postcode_count": duplicate_codes,
        "four_character_postcodes": all(len(row["postcode"]) == 4 for row in wide_rows),
        "temperature_chain_fields_present": all(
            key in wide_rows[0]
            for key in (
                "air_t_surface_temp_c",
                "air_t_gradient_c_per_m",
                "air_t_ground_temp_at_reference_depth_c",
                "surface_t_surface_temp_c",
                "surface_t_gradient_c_per_m",
                "surface_t_ground_temp_at_reference_depth_c",
            )
        ),
        "missing_counts": missing_counts,
        "climate_summary": climate_summary,
        "borehole_counts": borehole_counts,
        "standard_error_postcode_count": len(se),
        "excluded_null_geometry_postcodes": excluded_null_geometry,
        "warnings": warnings,
    }
    write_json(validation_json, validation)
    source_notes_md.write_text(
        "# Frozen data source notes\n\n"
        f"Generated: {datetime_module.datetime.now(datetime_module.timezone.utc).isoformat()}\n\n"
        f"- ArcGIS geodatabase: `{gdb}`\n"
        f"- Postcode feature class: `{postcode_fc.name}` ({postcode_source_sr})\n"
        f"- Ground fields: `AirT`, `surfaceT`, `deltaT20`, `deltaT20New`\n"
        f"- ΔT20 EBK prediction-standard-error raster: `{standard_error_raster.name}`\n"
        f"- Borehole feature class: `{borehole_fc.name}`\n"
        f"- Load source: `{load_csv.name}`\n"
        f"- Climate source: `{climate_csv.name}`\n\n"
        "The source ArcGIS project and geodatabase were read only. See the validation report for unresolved release decisions.\n",
        encoding="utf-8",
    )

    data_files = [
        wide_csv,
        attributes_json,
        index_json,
        climate_inventory_csv,
        boundaries_geojson,
        dictionary_md,
        validation_json,
        source_notes_md,
    ]
    checksums = {path.name: sha256(path) for path in data_files}
    manifest = {
        "schema_version": SCHEMA_VERSION,
        "dataset_version": args.dataset_version,
        "generated_at": datetime_module.datetime.now(datetime_module.timezone.utc).isoformat(),
        "country": "Australia",
        "analysis_unit": "postcode",
        "temperature_unit": "degC",
        "load_unit": "kWh_m2_year",
        "depth_unit": "m",
        "gradient_internal_unit": "degC_per_m",
        "reference_depth_m": args.reference_depth_m,
        "nearby_borehole_radius_km": args.nearby_radius_km,
        "climate_data_mode": "weighted_representative_hours",
        "climate_weight_hours": 5,
        "stored_air_temperature_scale_divisor": TAIR_SCALE_DIVISOR,
        "surface_temperature_datasets": [
            {
                "id": "air_t",
                "label": "Hourly near-surface air temperature grids for Australia (long-term climatology)",
                "surface_field": "AirT",
                "paired_delta_field": "deltaT20New",
                "provider": "CSIRO",
                "version": "4",
                "temporal_coverage": "1990-2019 climatology",
                "source_url": "https://data.csiro.au/collection/csiro:60405",
            },
            {
                "id": "surface_t",
                "label": "Australian mean land-surface temperature",
                "surface_field": "surfaceT",
                "paired_delta_field": "deltaT20",
                "provider": "Geoscience Australia",
                "temporal_coverage": "2003-2015 MODIS imagery",
                "source_url": "https://ecat.ga.gov.au/geonetwork/srv/api/records/1b827cce-acca-4d06-87b2-e8512d86b956?language=eng",
                "delta_t20_ebk_prediction_se_field": "delta_t20_ebk_prediction_se_c",
            },
        ],
        "redistribution_permission_confirmed_by_project_owner": True,
        "files": checksums,
        "warnings": warnings,
    }
    write_json(manifest_json, manifest)
    all_checksum_paths = [*data_files, manifest_json]
    checksum_file.write_text(
        "".join(f"{sha256(path)}  {path.name}\n" for path in all_checksum_paths),
        encoding="utf-8",
    )

    print(json.dumps({"output_dir": str(output_dir), **validation}, indent=2))


if __name__ == "__main__":
    main()
