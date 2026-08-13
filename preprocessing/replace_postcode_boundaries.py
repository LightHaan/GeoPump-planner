"""Replace postcode geometry without rebuilding postcode-level attributes.

Run this script with the ArcGIS Pro Python environment. It reads the ABS 2021
Postal Areas shapefile supplied as a ZIP, keeps exactly the postcodes already
present in ``postcode-attributes.json``, projects them to WGS 84, applies a
topology-preserving display simplification, and writes compact GeoJSON.

Only ``POA_CODE21`` and ``POA_NAME21`` are retained as GeoJSON properties. All
temperature, load, climate and borehole values continue to come from the
existing postcode attribute files and are not read or changed by this script.
"""

from __future__ import annotations

import argparse
from contextlib import contextmanager
import json
import shutil
import tempfile
import zipfile
from pathlib import Path
from typing import Any

import arcpy


PROJECT_DIR = Path(__file__).resolve().parents[1]
DEFAULT_ATTRIBUTES = PROJECT_DIR / "public" / "data" / "postcode-attributes.json"
DEFAULT_OUTPUTS = (
    PROJECT_DIR / "data-freeze" / "postcode-boundaries.geojson",
    PROJECT_DIR / "public" / "data" / "postcode-boundaries.geojson",
)


@contextmanager
def temporary_directory(prefix: str):
    """Yield a temp directory and tolerate ArcPy's short-lived Windows locks."""
    path = Path(tempfile.mkdtemp(prefix=prefix))
    try:
        yield path
    finally:
        shutil.rmtree(path, ignore_errors=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-zip", type=Path, required=True)
    parser.add_argument("--attributes", type=Path, default=DEFAULT_ATTRIBUTES)
    parser.add_argument("--output", type=Path, action="append")
    parser.add_argument(
        "--simplify-tolerance-deg",
        type=float,
        default=0.002,
        help="Display simplification in degrees (default: about 200 m).",
    )
    return parser.parse_args()


def normalise_postcode(value: Any) -> str:
    return str(value).strip().zfill(4)


def compact_boundaries(raw_path: Path, expected_codes: set[str]) -> dict[str, Any]:
    collection = json.loads(raw_path.read_text(encoding="utf-8"))
    compact_features: list[dict[str, Any]] = []
    seen: set[str] = set()
    for feature in collection.get("features", []):
        properties = feature.get("properties") or {}
        code = normalise_postcode(properties.get("POA_CODE21", ""))
        if code not in expected_codes:
            continue
        if code in seen:
            raise ValueError(f"Duplicate postcode geometry: {code}")
        geometry = feature.get("geometry")
        if not geometry or geometry.get("type") not in {"Polygon", "MultiPolygon"}:
            raise ValueError(f"Invalid polygon geometry for postcode {code}")
        seen.add(code)
        compact_features.append(
            {
                "type": "Feature",
                "properties": {
                    "POA_CODE21": code,
                    "POA_NAME21": str(properties.get("POA_NAME21") or code),
                },
                "geometry": geometry,
            }
        )

    missing = expected_codes - seen
    unexpected = seen - expected_codes
    if missing or unexpected:
        raise ValueError(
            f"Postcode mismatch: missing={sorted(missing)}, unexpected={sorted(unexpected)}"
        )
    compact_features.sort(key=lambda feature: feature["properties"]["POA_CODE21"])
    return {"type": "FeatureCollection", "features": compact_features}


def build_boundaries(
    source_zip: Path,
    attributes_path: Path,
    output_paths: list[Path],
    tolerance_deg: float,
) -> None:
    attributes = json.loads(attributes_path.read_text(encoding="utf-8"))
    expected_codes = {normalise_postcode(code) for code in attributes}
    if not expected_codes:
        raise ValueError("The postcode attribute index is empty")

    # ArcPy may briefly retain a shapefile spatial-reference lock while the
    # process exits. On Windows, ignore that harmless temporary cleanup race.
    with temporary_directory(prefix="geopump-poa-") as work_dir:
        with zipfile.ZipFile(source_zip) as archive:
            archive.extractall(work_dir / "source")
        shapefiles = list((work_dir / "source").glob("*.shp"))
        if len(shapefiles) != 1:
            raise ValueError(f"Expected one shapefile in {source_zip}, found {len(shapefiles)}")
        source = shapefiles[0]

        source_codes: set[str] = set()
        with arcpy.da.SearchCursor(str(source), ["POA_CODE21"]) as rows:
            for (value,) in rows:
                source_codes.add(normalise_postcode(value))
        missing_from_source = expected_codes - source_codes
        if missing_from_source:
            raise ValueError(
                "Source shapefile is missing existing postcodes: "
                + ", ".join(sorted(missing_from_source))
            )

        geodatabase = work_dir / "boundary-build.gdb"
        arcpy.management.CreateFileGDB(str(work_dir), geodatabase.name)
        selected = geodatabase / "poa_selected"
        projected = geodatabase / "poa_wgs84"
        simplified = geodatabase / "poa_wgs84_simplified"

        layer = arcpy.management.MakeFeatureLayer(str(source), "poa_source_layer")[0]
        code_field = arcpy.AddFieldDelimiters(str(source), "POA_CODE21")
        excluded_codes = sorted(source_codes - expected_codes)
        if excluded_codes:
            values = ",".join(f"'{code.replace(chr(39), chr(39) * 2)}'" for code in excluded_codes)
            arcpy.management.SelectLayerByAttribute(
                layer,
                "NEW_SELECTION",
                f"{code_field} NOT IN ({values})",
            )
        arcpy.management.CopyFeatures(layer, str(selected))
        selected_count = int(arcpy.management.GetCount(str(selected))[0])
        if selected_count != len(expected_codes):
            raise ValueError(
                f"Selected {selected_count} source features; expected {len(expected_codes)}"
            )

        arcpy.management.Project(str(selected), str(projected), arcpy.SpatialReference(4326))
        arcpy.cartography.SimplifyPolygon(
            str(projected),
            str(simplified),
            "POINT_REMOVE",
            f"{tolerance_deg} Degrees",
            "0 SquareKilometers",
            "RESOLVE_ERRORS",
            "KEEP_COLLAPSED_POINTS",
        )

        raw_geojson = work_dir / "postcode-boundaries.raw.geojson"
        arcpy.conversion.FeaturesToJSON(
            str(simplified),
            str(raw_geojson),
            "NOT_FORMATTED",
            "NO_Z_VALUES",
            "NO_M_VALUES",
            "GEOJSON",
            "WGS84",
            "USE_FIELD_NAME",
        )
        compact = compact_boundaries(raw_geojson, expected_codes)
        encoded = json.dumps(
            compact,
            ensure_ascii=False,
            allow_nan=False,
            separators=(",", ":"),
        ) + "\n"
        for output_path in output_paths:
            output_path.parent.mkdir(parents=True, exist_ok=True)
            staging = output_path.with_suffix(output_path.suffix + ".tmp")
            staging.write_text(encoded, encoding="utf-8")
            shutil.move(str(staging), str(output_path))

        print(
            f"Wrote {len(expected_codes):,} postcode boundaries to "
            f"{len(output_paths)} output(s); excluded {excluded_codes or 'none'}; "
            f"GeoJSON size {len(encoded.encode('utf-8')):,} bytes."
        )
        arcpy.management.Delete(layer)
        del layer
        arcpy.management.ClearWorkspaceCache()


def main() -> None:
    args = parse_args()
    outputs = args.output or list(DEFAULT_OUTPUTS)
    build_boundaries(
        args.source_zip.resolve(),
        args.attributes.resolve(),
        [path.resolve() for path in outputs],
        args.simplify_tolerance_deg,
    )


if __name__ == "__main__":
    main()
