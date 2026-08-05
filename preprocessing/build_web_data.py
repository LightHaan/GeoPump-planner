"""Build the static, postcode-addressable browser data package.

This script performs no spatial processing. It consumes the Phase 0 frozen
postcode files and the existing representative-hour climate CSV.
"""

from __future__ import annotations

import argparse
import datetime as datetime_module
import hashlib
import json
import math
import shutil
from pathlib import Path
from typing import Any

import pandas as pd

from web_data_models import (
    ClimateFile,
    PostcodeAttributesFile,
    PostcodeIndexFile,
    WebManifest,
    json_schemas,
)


PROJECT_DIR = Path(__file__).resolve().parents[1]
FREEZE_DIR = PROJECT_DIR / "data-freeze"
DEFAULT_OUTPUT = PROJECT_DIR / "public" / "data"
SCHEMA_VERSION = "1.0.0"
CLIMATE_LAYOUT = ["day_of_year", "hour_utc", "air_temp_c", "weight_hours"]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-root", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    return parser.parse_args()


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: Any, *, compact: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(
            value,
            ensure_ascii=False,
            indent=None if compact else 2,
            separators=(",", ":") if compact else None,
            allow_nan=False,
        )
        + "\n",
        encoding="utf-8",
    )


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def postcode(value: Any) -> str:
    text = str(value).strip()
    if not text.isdigit():
        raise ValueError(f"Invalid postcode in climate CSV: {value!r}")
    return text.zfill(4)


def copy_frozen_files(staging: Path) -> None:
    for name in (
        "postcode-index.json",
        "postcode-attributes.json",
        "postcode-boundaries.geojson",
        "data-dictionary.md",
        "source-notes.md",
    ):
        shutil.copy2(FREEZE_DIR / name, staging / name)
    preset_dir = staging / "presets"
    preset_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(
        PROJECT_DIR / "reference_engine" / "paper-defaults.json",
        preset_dir / "paper-default.json",
    )
    schema_dir = staging / "schemas"
    schema_dir.mkdir(parents=True, exist_ok=True)
    for name, schema in json_schemas().items():
        write_json(schema_dir / name, schema)


def load_climate_csv(
    climate_csv: Path,
    known_codes: set[str],
    temperature_divisor: float,
) -> tuple[pd.DataFrame, set[str]]:
    frame = pd.read_csv(
        climate_csv,
        dtype={
            "POSCODE": "int32",
            "utc_day": "int16",
            "utc_hour": "int8",
            "tair": "float64",
        },
    )
    if list(frame.columns) != ["POSCODE", "utc_day", "utc_hour", "tair"]:
        raise ValueError("Unexpected climate CSV columns")
    if not frame["tair"].map(math.isfinite).all():
        raise ValueError("Climate CSV contains a non-finite temperature")
    frame["tair"] = frame["tair"] / float(temperature_divisor)
    seen = {f"{int(value):04d}" for value in frame["POSCODE"].unique()}
    unknown = seen - known_codes
    if unknown:
        raise ValueError(
            "Climate postcodes absent from postcode-index: "
            + ", ".join(sorted(unknown)[:20])
        )
    print(
        f"Loaded {len(frame):,} climate rows for {len(seen):,} postcodes in memory.",
        flush=True,
    )
    return frame, seen


def write_climate_files(
    staging: Path,
    climate_frame: pd.DataFrame,
    available_codes: list[str],
    expected_record_count: int,
    weight_hours: float,
) -> tuple[list[str], int]:
    climate_dir = staging / "climate"
    climate_dir.mkdir(parents=True, exist_ok=True)
    checksum_lines: list[str] = []
    total_bytes = 0
    grouped = climate_frame.groupby("POSCODE", sort=True, observed=True)
    for position, (raw_code, group) in enumerate(grouped, start=1):
        code = f"{int(raw_code):04d}"
        ordered = group.sort_values(["utc_day", "utc_hour"], kind="stable")
        records = [
            [int(day), float(hour), float(temperature), weight_hours]
            for day, hour, temperature in ordered[
                ["utc_day", "utc_hour", "tair"]
            ].itertuples(index=False, name=None)
        ]
        document = {
            "schema_version": SCHEMA_VERSION,
            "postcode": code,
            "time_basis": "UTC",
            "record_type": "weighted_representative_hour",
            "record_layout": CLIMATE_LAYOUT,
            "record_count": len(records),
            "represented_hours": sum(record[3] for record in records),
            "records": records,
        }
        ClimateFile.model_validate(document)
        if len(records) != expected_record_count:
            raise ValueError(
                f"{code} has {len(records)} climate records, expected {expected_record_count}"
            )
        path = climate_dir / f"{code}.json"
        write_json(path, document, compact=True)
        digest = sha256(path)
        checksum_lines.append(f"{digest}  climate/{code}.json")
        total_bytes += path.stat().st_size
        if position % 250 == 0 or position == len(available_codes):
            print(
                f"Wrote {position:,}/{len(available_codes):,} postcode climate files...",
                flush=True,
            )
    (staging / "climate-checksums.sha256").write_text(
        "\n".join(checksum_lines) + "\n", encoding="utf-8"
    )
    return checksum_lines, total_bytes


def relative_files(staging: Path) -> list[Path]:
    return sorted(
        (
            path
            for path in staging.rglob("*")
            if path.is_file()
            and path.name not in {"manifest.json", "checksums.sha256"}
            and "climate" not in path.relative_to(staging).parts
        ),
        key=lambda path: path.relative_to(staging).as_posix(),
    )


def build_package(source_root: Path, output_dir: Path) -> dict[str, Any]:
    source_root = source_root.resolve()
    output_dir = output_dir.resolve()
    staging = output_dir.with_name(output_dir.name + ".building")
    if output_dir.exists():
        raise FileExistsError(
            f"Output already exists: {output_dir}. Move or remove it before rebuilding."
        )
    if staging.exists():
        raise FileExistsError(
            f"Staging directory already exists from an earlier run: {staging}"
        )
    staging.mkdir(parents=True)
    try:
        copy_frozen_files(staging)
        index_document = load_json(staging / "postcode-index.json")
        attributes_document = load_json(staging / "postcode-attributes.json")
        validated_index = PostcodeIndexFile.model_validate(index_document)
        validated_attributes = PostcodeAttributesFile.model_validate(attributes_document)
        index_codes = [entry.postcode for entry in validated_index.root]
        attribute_codes = set(validated_attributes.root)
        if set(index_codes) != attribute_codes:
            raise ValueError("postcode-index and postcode-attributes keys do not agree")
        available_codes = sorted(
            entry.postcode for entry in validated_index.root if entry.has_climate_data
        )
        missing_codes = sorted(
            entry.postcode for entry in validated_index.root if not entry.has_climate_data
        )
        freeze_manifest = load_json(FREEZE_DIR / "manifest.json")
        weight_hours = float(freeze_manifest["climate_weight_hours"])
        expected_records = 1752
        climate_csv = source_root / "Supp_File_3_PostCodeHourlyTair.csv"
        if not climate_csv.exists():
            raise FileNotFoundError(climate_csv)
        climate_frame, seen_codes = load_climate_csv(
            climate_csv,
            set(index_codes),
            float(freeze_manifest["stored_air_temperature_scale_divisor"]),
        )
        row_count = len(climate_frame)
        if seen_codes != set(available_codes):
            raise ValueError(
                "Climate CSV postcode set does not match has_climate_data flags"
            )
        climate_checksums, climate_bytes = write_climate_files(
            staging,
            climate_frame,
            available_codes,
            expected_records,
            weight_hours,
        )
        build_report = {
            "schema_version": SCHEMA_VERSION,
            "passed": True,
            "postcode_count": len(index_codes),
            "available_climate_postcode_count": len(available_codes),
            "missing_climate_postcode_count": len(missing_codes),
            "missing_climate_postcodes": missing_codes,
            "climate_row_count": row_count,
            "records_per_available_postcode": expected_records,
            "represented_hours_per_available_postcode": expected_records * weight_hours,
            "climate_file_count": len(climate_checksums),
            "climate_uncompressed_bytes": climate_bytes,
            "schema_validation_passed_during_build": True,
        }
        write_json(staging / "build-report.json", build_report)
        non_climate_files = {
            path.relative_to(staging).as_posix(): sha256(path)
            for path in relative_files(staging)
        }
        parent_manifest = FREEZE_DIR / "manifest.json"
        version = freeze_manifest["dataset_version"].replace("phase0", "phase2-web")
        manifest_document = {
            "schema_version": SCHEMA_VERSION,
            "dataset_version": version,
            "generated_at": datetime_module.datetime.now(
                datetime_module.timezone.utc
            ).isoformat(),
            "parent_dataset_version": freeze_manifest["dataset_version"],
            "parent_manifest_sha256": sha256(parent_manifest),
            "country": freeze_manifest["country"],
            "analysis_unit": freeze_manifest["analysis_unit"],
            "runtime_spatial_processing": False,
            "postcode_count": len(index_codes),
            "temperature_unit": freeze_manifest["temperature_unit"],
            "load_unit": freeze_manifest["load_unit"],
            "depth_unit": freeze_manifest["depth_unit"],
            "gradient_internal_unit": freeze_manifest["gradient_internal_unit"],
            "reference_depth_m": freeze_manifest["reference_depth_m"],
            "surface_temperature_datasets": freeze_manifest[
                "surface_temperature_datasets"
            ],
            "redistribution_permission_confirmed_by_project_owner": freeze_manifest[
                "redistribution_permission_confirmed_by_project_owner"
            ],
            "climate": {
                "directory": "climate",
                "filename_pattern": "{postcode}.json",
                "postcode_count": len(available_codes),
                "missing_postcode_count": len(missing_codes),
                "records_per_available_postcode": expected_records,
                "represented_hours_per_available_postcode": expected_records
                * weight_hours,
                "time_basis": "UTC",
                "record_type": "weighted_representative_hour",
                "record_layout": CLIMATE_LAYOUT,
                "checksums_file": "climate-checksums.sha256",
            },
            "schemas": {
                "postcode_index": "schemas/postcode-index.schema.json",
                "postcode_attributes": "schemas/postcode-attributes.schema.json",
                "climate": "schemas/climate.schema.json",
                "manifest": "schemas/manifest.schema.json",
            },
            "files": non_climate_files,
        }
        WebManifest.model_validate(manifest_document)
        write_json(staging / "manifest.json", manifest_document)
        checksum_lines = [
            f"{digest}  {name}" for name, digest in sorted(non_climate_files.items())
        ]
        checksum_lines.append(f"{sha256(staging / 'manifest.json')}  manifest.json")
        (staging / "checksums.sha256").write_text(
            "\n".join(checksum_lines) + "\n", encoding="utf-8"
        )
        output_dir.parent.mkdir(parents=True, exist_ok=True)
        staging.replace(output_dir)
        return build_report
    except Exception:
        if staging.exists():
            shutil.rmtree(staging)
        raise


def main() -> None:
    args = parse_args()
    report = build_package(args.source_root, args.output_dir)
    print(json.dumps(report, ensure_ascii=True, indent=2), flush=True)


if __name__ == "__main__":
    main()
