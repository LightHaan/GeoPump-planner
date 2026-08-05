"""Independently validate the Phase 2 browser data package."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
from typing import Any

from web_data_models import (
    ClimateFile,
    PostcodeAttributesFile,
    PostcodeIndexFile,
    WebManifest,
    json_schemas,
)


PROJECT_DIR = Path(__file__).resolve().parents[1]
DEFAULT_DATA_DIR = PROJECT_DIR / "public" / "data"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR)
    return parser.parse_args()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def parse_checksums(path: Path) -> dict[str, str]:
    checksums: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        digest, name = line.split("  ", 1)
        checksums[name] = digest
    return checksums


def validate_package(data_dir: Path) -> dict[str, Any]:
    data_dir = data_dir.resolve()
    manifest = WebManifest.model_validate_json(
        (data_dir / "manifest.json").read_text(encoding="utf-8")
    )
    index = PostcodeIndexFile.model_validate_json(
        (data_dir / "postcode-index.json").read_text(encoding="utf-8")
    )
    attributes = PostcodeAttributesFile.model_validate_json(
        (data_dir / "postcode-attributes.json").read_text(encoding="utf-8")
    )
    schemas = json_schemas()
    for name, expected in schemas.items():
        actual = json.loads((data_dir / "schemas" / name).read_text(encoding="utf-8"))
        if actual != expected:
            raise ValueError(f"Published schema differs from model schema: {name}")
    codes = [entry.postcode for entry in index.root]
    if len(codes) != manifest.postcode_count:
        raise ValueError("Manifest postcode count does not match postcode-index")
    if set(codes) != set(attributes.root):
        raise ValueError("postcode-index and postcode-attributes do not have the same keys")
    expected_available = {
        entry.postcode for entry in index.root if entry.has_climate_data
    }
    expected_missing = set(codes) - expected_available
    climate_files = sorted((data_dir / manifest.climate.directory).glob("*.json"))
    climate_file_codes = {path.stem for path in climate_files}
    if climate_file_codes != expected_available:
        raise ValueError("Climate filenames do not match postcode availability flags")
    climate_checksums = parse_checksums(data_dir / manifest.climate.checksums_file)
    if set(climate_checksums) != {
        f"climate/{code}.json" for code in expected_available
    }:
        raise ValueError("Climate checksum entries do not match climate files")
    record_total = 0
    represented_hours_min = math.inf
    represented_hours_max = -math.inf
    for position, path in enumerate(climate_files, start=1):
        document = ClimateFile.model_validate_json(path.read_text(encoding="utf-8"))
        if document.postcode != path.stem:
            raise ValueError(f"Climate postcode does not match filename: {path.name}")
        if document.record_count != manifest.climate.records_per_available_postcode:
            raise ValueError(f"Unexpected record count in {path.name}")
        if not math.isclose(
            document.represented_hours,
            manifest.climate.represented_hours_per_available_postcode,
            abs_tol=1e-9,
        ):
            raise ValueError(f"Unexpected represented hours in {path.name}")
        day_hours = [(record[0], record[1]) for record in document.records]
        if len(day_hours) != len(set(day_hours)):
            raise ValueError(f"Duplicate day/hour climate record in {path.name}")
        if day_hours != sorted(day_hours):
            raise ValueError(f"Climate records are not sorted in {path.name}")
        relative = f"climate/{path.name}"
        if sha256(path) != climate_checksums[relative]:
            raise ValueError(f"Climate checksum failed: {path.name}")
        record_total += document.record_count
        represented_hours_min = min(
            represented_hours_min, document.represented_hours
        )
        represented_hours_max = max(
            represented_hours_max, document.represented_hours
        )
        if position % 500 == 0:
            print(f"Validated {position:,}/{len(climate_files):,} climate files...", flush=True)
    file_checksums = parse_checksums(data_dir / "checksums.sha256")
    bad_files = [
        name
        for name, expected in file_checksums.items()
        if not (data_dir / name).is_file() or sha256(data_dir / name) != expected
    ]
    if bad_files:
        raise ValueError("Static-file checksum failures: " + ", ".join(bad_files))
    if manifest.files != {
        name: digest for name, digest in file_checksums.items() if name != "manifest.json"
    }:
        raise ValueError("Manifest file hashes do not match checksums.sha256")
    return {
        "passed": True,
        "schema_validation": "Pydantic models plus published Draft 2020-12 schemas",
        "postcode_count": len(codes),
        "climate_file_count": len(climate_files),
        "missing_climate_postcode_count": len(expected_missing),
        "missing_climate_postcodes": sorted(expected_missing),
        "climate_record_count": record_total,
        "represented_hours_min": represented_hours_min,
        "represented_hours_max": represented_hours_max,
        "climate_checksum_count": len(climate_checksums),
        "static_checksum_count": len(file_checksums),
        "bad_checksums": [],
    }


def main() -> None:
    args = parse_args()
    report = validate_package(args.data_dir)
    print(json.dumps(report, ensure_ascii=True, indent=2), flush=True)


if __name__ == "__main__":
    main()
