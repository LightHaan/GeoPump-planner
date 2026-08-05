from __future__ import annotations

import sys
import unittest
from pathlib import Path

from pydantic import ValidationError


PROJECT_DIR = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_DIR / "preprocessing"))

from web_data_models import (  # noqa: E402
    ClimateFile,
    PostcodeIndexFile,
    WebManifest,
)


class ClimateSchemaTests(unittest.TestCase):
    def valid_document(self):
        return {
            "schema_version": "1.0.0",
            "postcode": "0810",
            "time_basis": "UTC",
            "record_type": "weighted_representative_hour",
            "record_layout": [
                "day_of_year",
                "hour_utc",
                "air_temp_c",
                "weight_hours",
            ],
            "record_count": 1,
            "represented_hours": 5.0,
            "records": [[1, 0.0, 28.5, 5.0]],
        }

    def test_valid_climate_file(self) -> None:
        climate = ClimateFile.model_validate(self.valid_document())
        self.assertEqual(climate.postcode, "0810")
        self.assertEqual(climate.represented_hours, 5.0)

    def test_record_count_and_weight_sum_are_enforced(self) -> None:
        document = self.valid_document()
        document["record_count"] = 2
        with self.assertRaises(ValidationError):
            ClimateFile.model_validate(document)
        document = self.valid_document()
        document["represented_hours"] = 1.0
        with self.assertRaises(ValidationError):
            ClimateFile.model_validate(document)

    def test_postcode_requires_four_digits(self) -> None:
        document = self.valid_document()
        document["postcode"] = "810"
        with self.assertRaises(ValidationError):
            ClimateFile.model_validate(document)


class IndexSchemaTests(unittest.TestCase):
    def test_duplicate_postcodes_are_rejected(self) -> None:
        item = {
            "postcode": "0810",
            "locality_hint": "0810",
            "state": None,
            "lat": -12.3,
            "lon": 130.8,
            "has_ground_data": True,
            "has_load_data": True,
            "has_climate_data": True,
        }
        with self.assertRaises(ValidationError):
            PostcodeIndexFile.model_validate([item, item])


class PublishedPackageSmokeTests(unittest.TestCase):
    def test_manifest_and_representative_climate_file(self) -> None:
        data_dir = PROJECT_DIR / "public" / "data"
        manifest = WebManifest.model_validate_json(
            (data_dir / "manifest.json").read_text(encoding="utf-8")
        )
        climate = ClimateFile.model_validate_json(
            (data_dir / "climate" / "0810.json").read_text(encoding="utf-8")
        )
        self.assertEqual(manifest.postcode_count, 2641)
        self.assertEqual(manifest.climate.postcode_count, 2634)
        self.assertEqual(climate.record_count, 1752)
        self.assertEqual(climate.represented_hours, 8760.0)
        day_hours = [(record[0], record[1]) for record in climate.records]
        self.assertEqual(day_hours, sorted(day_hours))


if __name__ == "__main__":
    unittest.main()
