"""Build and verify ten frozen paper-regression cases.

Run from the project directory with::

    python -m reference_engine.run_reference_cases --source-root <paper4>

The source climate CSV is streamed once. Only the selected postcode records
are copied into the app repository; ArcGIS and raster processing are not used.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
from copy import deepcopy
from pathlib import Path
from typing import Any

from .engine import run_scenario
from .models import ClimateRecord
from .solar_time import month_from_day_of_year


PROJECT_DIR = Path(__file__).resolve().parents[1]
ENGINE_DIR = Path(__file__).resolve().parent
FIXTURE_DIR = ENGINE_DIR / "fixtures"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-root", type=Path, required=True)
    parser.add_argument("--fixture-dir", type=Path, default=FIXTURE_DIR)
    return parser.parse_args()


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: Any, *, compact: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    separators = (",", ":") if compact else None
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=None if compact else 2, separators=separators)
        + "\n",
        encoding="utf-8",
    )


def postcode(value: Any) -> str:
    return str(value).strip().zfill(4)


def build_climate_records(
    climate_csv: Path,
    target_codes: set[str],
    attributes: dict[str, Any],
    parameters: dict[str, Any],
) -> dict[str, list[ClimateRecord]]:
    time_config = parameters["time"]
    selected: dict[str, list[ClimateRecord]] = {code: [] for code in target_codes}
    with climate_csv.open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            code = postcode(row["POSCODE"])
            if code not in target_codes:
                continue
            day = int(row["utc_day"])
            hour = float(row["utc_hour"])
            selected[code].append(
                ClimateRecord(
                    day_of_year=day,
                    hour_utc=hour,
                    month=month_from_day_of_year(day, time_config["base_year"]),
                    air_temp_c=float(row["tair"])
                    / time_config["stored_air_temperature_scale_divisor"],
                    weight_hours=time_config["representative_record_weight_hours"],
                )
            )
    missing = [code for code, records in selected.items() if not records]
    if missing:
        raise ValueError("No climate records found for: " + ", ".join(sorted(missing)))
    return selected


def record_to_json(record: ClimateRecord) -> dict[str, Any]:
    return {
        "day_of_year": record.day_of_year,
        "hour_utc": record.hour_utc,
        "month": record.month,
        "air_temp_c": record.air_temp_c,
        "weight_hours": record.weight_hours,
    }


def expected_rows(path: Path, target_codes: set[str]) -> dict[str, dict[str, str]]:
    output: dict[str, dict[str, str]] = {}
    with path.open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            code = postcode(row["POSCODE"])
            if code in target_codes:
                output[code] = row
    missing = target_codes - output.keys()
    if missing:
        raise ValueError("No paper result found for: " + ", ".join(sorted(missing)))
    return output


def flatten_actual(result: dict[str, Any]) -> dict[str, float | None]:
    output: dict[str, float | None] = {
        "t20": result["ground_temperature_c"],
        "load_heat_annual": result["loads"]["heating"]["annual"],
        "load_cool_annual": result["loads"]["cooling"]["annual"],
        "load_total_annual": result["loads"]["total_annual"],
        "ashp_heat_all_annual": result["ashp"]["heating_compressor_electricity"]["annual"],
        "gshp_heat_all_annual": result["gshp"]["heating_compressor_electricity"]["annual"],
        "ashp_heat_night_annual": result["ashp"]["heating_compressor_electricity"][
            "selected_period"
        ],
        "gshp_heat_night_annual": result["gshp"]["heating_compressor_electricity"][
            "selected_period"
        ],
        "ashp_cool_all_annual": result["ashp"]["cooling_compressor_electricity"]["annual"],
        "gshp_cool_all_annual": result["gshp"]["cooling_compressor_electricity"]["annual"],
        "ashp_cool_night_annual": result["ashp"]["cooling_compressor_electricity"][
            "selected_period"
        ],
        "gshp_cool_night_annual": result["gshp"]["cooling_compressor_electricity"][
            "selected_period"
        ],
        "ashp_total_all_annual": result["ashp"]["system_electricity"]["annual"],
        "ashp_total_night_annual": result["ashp"]["system_electricity"][
            "selected_period"
        ],
        "gshp_total_all_annual": result["gshp"]["system_electricity"]["annual"],
        "gshp_total_night_annual": result["gshp"]["system_electricity"][
            "selected_period"
        ],
        "ashp_APF": result["ashp"]["annual_performance_factor"],
        "gshp_APF": result["gshp"]["annual_performance_factor"],
    }
    for season in ("Spring", "Summer", "Autumn", "Winter"):
        loads = result["loads"]["seasonal"][season]
        output[f"load_heat_{season}"] = loads["heating"]
        output[f"load_cool_{season}"] = loads["cooling"]
        output[f"load_total_{season}"] = loads["total"]
        for system_id in ("ashp", "gshp"):
            values = result[system_id]["seasonal"][season]
            output[f"{system_id}_heat_all_{season}"] = values["heating_electricity"]
            output[f"{system_id}_heat_night_{season}"] = values[
                "heating_selected_period_electricity"
            ]
            output[f"{system_id}_cool_all_{season}"] = values["cooling_electricity"]
            output[f"{system_id}_cool_night_{season}"] = values[
                "cooling_selected_period_electricity"
            ]
            output[f"{system_id}_SPF_{season}"] = values["performance_factor"]
    return output


def expected_metrics(row: dict[str, str], keys: set[str]) -> dict[str, float | None]:
    output: dict[str, float | None] = {}
    for key in sorted(keys):
        raw = row.get(key, "")
        output[key] = None if raw == "" else float(raw)
    return output


def tolerance_for(metric: str, parameters: dict[str, Any]) -> float:
    numerical = parameters["numerical"]
    if "APF" in metric or "SPF" in metric:
        return numerical["cop_regression_relative_tolerance"]
    return numerical["electricity_regression_relative_tolerance"]


def compare_metrics(
    actual: dict[str, float | None],
    expected: dict[str, float | None],
    parameters: dict[str, Any],
) -> tuple[bool, dict[str, Any]]:
    absolute_tolerance = parameters["numerical"]["absolute_tolerance"]
    details: dict[str, Any] = {}
    passed = True
    for metric, expected_value in expected.items():
        actual_value = actual[metric]
        relative_tolerance = tolerance_for(metric, parameters)
        if actual_value is None or expected_value is None:
            metric_passed = actual_value is None and expected_value is None
            absolute_error = None
            relative_error = None
        else:
            absolute_error = abs(actual_value - expected_value)
            denominator = max(abs(expected_value), absolute_tolerance)
            relative_error = absolute_error / denominator
            metric_passed = math.isclose(
                actual_value,
                expected_value,
                rel_tol=relative_tolerance,
                abs_tol=absolute_tolerance,
            )
        passed = passed and metric_passed
        details[metric] = {
            "expected": expected_value,
            "actual": actual_value,
            "absolute_error": absolute_error,
            "relative_error": relative_error,
            "relative_tolerance": relative_tolerance,
            "passed": metric_passed,
        }
    return passed, details


def main() -> None:
    args = parse_args()
    source_root = args.source_root.resolve()
    fixture_dir = args.fixture_dir.resolve()
    parameters = load_json(ENGINE_DIR / "paper-defaults.json")
    cases_document = load_json(ENGINE_DIR / "regression-cases.json")
    cases = cases_document["cases"]
    target_codes = {case["postcode"] for case in cases}
    attributes = load_json(PROJECT_DIR / "data-freeze" / "postcode-attributes.json")
    climate = build_climate_records(
        source_root / "Supp_File_3_PostCodeHourlyTair.csv",
        target_codes,
        attributes,
        parameters,
    )
    paper_rows = expected_rows(
        source_root / "revised" / "Supp_File_5_PostCodeResults_revised.csv",
        target_codes,
    )
    inputs: dict[str, Any] = {}
    expected_output: dict[str, Any] = {}
    report_cases: dict[str, Any] = {}
    all_passed = True
    for case in cases:
        code = case["postcode"]
        attribute = attributes[code]
        ground = attribute["ground"]["surface_t"]
        load = attribute["load"]
        if ground["ground_temp_at_reference_depth_c"] is None:
            raise ValueError(f"{code} has no frozen surface_t ground temperature")
        if load["annual_heating_kwh_m2"] is None or load["annual_cooling_kwh_m2"] is None:
            raise ValueError(f"{code} has no frozen annual load")
        case_parameters = deepcopy(parameters)
        result = run_scenario(
            code,
            climate[code],
            attribute["location"]["lat"],
            attribute["location"]["lon"],
            ground["ground_temp_at_reference_depth_c"],
            load["annual_heating_kwh_m2"],
            load["annual_cooling_kwh_m2"],
            case_parameters,
        )
        actual = flatten_actual(result)
        expected = expected_metrics(paper_rows[code], set(actual))
        passed, metric_details = compare_metrics(actual, expected, parameters)
        all_passed = all_passed and passed
        inputs[code] = {
            "label": case["label"],
            "reason": case["reason"],
            "climate_fixture": f"climate/{code}.json",
            "ground_temperature_c": ground["ground_temp_at_reference_depth_c"],
            "annual_heating_kwh_m2": load["annual_heating_kwh_m2"],
            "annual_cooling_kwh_m2": load["annual_cooling_kwh_m2"],
            "certificate_count": load["certificate_count"],
            "latitude_deg": attribute["location"]["lat"],
            "longitude_deg": attribute["location"]["lon"],
            "surface_temperature_c": ground["surface_temp_c"],
            "gradient_c_per_m": ground["gradient_c_per_m"],
        }
        expected_output[code] = expected
        report_cases[code] = {
            "passed": passed,
            "metric_count": len(metric_details),
            "metrics": metric_details,
            "warnings": result["warnings"],
        }
        write_json(
            fixture_dir / "climate" / f"{code}.json",
            [record_to_json(record) for record in climate[code]],
            compact=True,
        )
    write_json(
        fixture_dir / "regression-inputs.json",
        {"schema_version": "1.0.0", "preset_id": parameters["preset_id"], "cases": inputs},
    )
    write_json(
        fixture_dir / "expected-results.json",
        {
            "schema_version": "1.0.0",
            "source": "revised/Supp_File_5_PostCodeResults_revised.csv",
            "cases": expected_output,
        },
    )
    write_json(
        fixture_dir / "regression-report.json",
        {
            "schema_version": "1.0.0",
            "all_passed": all_passed,
            "case_count": len(cases),
            "metric_count": sum(item["metric_count"] for item in report_cases.values()),
            "cases": report_cases,
        },
    )
    if not all_passed:
        failed = [code for code, item in report_cases.items() if not item["passed"]]
        raise SystemExit("Regression failed for: " + ", ".join(failed))
    print(
        f"Validated {len(cases)} postcodes and "
        f"{sum(item['metric_count'] for item in report_cases.values())} metrics."
    )


if __name__ == "__main__":
    main()
