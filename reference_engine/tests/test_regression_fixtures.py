from __future__ import annotations

import json
import math
import unittest
from pathlib import Path

from reference_engine.engine import run_scenario
from reference_engine.models import ClimateRecord
from reference_engine.run_reference_cases import flatten_actual


ENGINE_DIR = Path(__file__).resolve().parents[1]
FIXTURE_DIR = ENGINE_DIR / "fixtures"


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


class PaperRegressionFixtureTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.parameters = load_json(ENGINE_DIR / "paper-defaults.json")
        cls.inputs = load_json(FIXTURE_DIR / "regression-inputs.json")["cases"]
        cls.expected = load_json(FIXTURE_DIR / "expected-results.json")["cases"]

    def test_ten_postcodes_reproduce_seven_hundred_paper_metrics(self) -> None:
        checked = 0
        for code, inputs in self.inputs.items():
            raw_records = load_json(FIXTURE_DIR / inputs["climate_fixture"])
            records = [ClimateRecord(**record) for record in raw_records]
            result = run_scenario(
                code,
                records,
                inputs["latitude_deg"],
                inputs["longitude_deg"],
                inputs["ground_temperature_c"],
                inputs["annual_heating_kwh_m2"],
                inputs["annual_cooling_kwh_m2"],
                self.parameters,
            )
            actual = flatten_actual(result)
            for metric, expected_value in self.expected[code].items():
                checked += 1
                if expected_value is None:
                    self.assertIsNone(actual[metric], f"{code} {metric}")
                    continue
                tolerance = (
                    self.parameters["numerical"]["cop_regression_relative_tolerance"]
                    if "APF" in metric or "SPF" in metric
                    else self.parameters["numerical"][
                        "electricity_regression_relative_tolerance"
                    ]
                )
                self.assertTrue(
                    math.isclose(
                        actual[metric],
                        expected_value,
                        rel_tol=tolerance,
                        abs_tol=self.parameters["numerical"]["absolute_tolerance"],
                    ),
                    f"{code} {metric}: expected {expected_value}, got {actual[metric]}",
                )
        self.assertEqual(checked, 700)


if __name__ == "__main__":
    unittest.main()
