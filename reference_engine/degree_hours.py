"""Weighted degree-hour calculations and annual-load disaggregation."""

from __future__ import annotations

import math
from collections import defaultdict
from collections.abc import Sequence

from .models import ClimateRecord


class DegreeHourError(ValueError):
    """Raised when climate weights and annual loads are inconsistent."""


def heating_degree_hour(air_temp_c: float, balance_temperature_c: float) -> float:
    return max(0.0, float(balance_temperature_c) - float(air_temp_c))


def cooling_degree_hour(air_temp_c: float, balance_temperature_c: float) -> float:
    return max(0.0, float(air_temp_c) - float(balance_temperature_c))


def validate_climate_records(
    records: Sequence[ClimateRecord],
    expected_annual_weight_hours: float,
    absolute_tolerance: float,
) -> tuple[str, ...]:
    if not records:
        raise DegreeHourError("At least one climate record is required")
    tolerance = abs(float(absolute_tolerance))
    total_weight = 0.0
    warnings: list[str] = []
    for index, record in enumerate(records):
        if not math.isfinite(record.air_temp_c):
            raise DegreeHourError(f"Record {index} has a non-finite air temperature")
        if not math.isfinite(record.weight_hours) or record.weight_hours <= tolerance:
            raise DegreeHourError(f"Record {index} must have positive finite weight_hours")
        if record.month < 1 or record.month > 12:
            raise DegreeHourError(f"Record {index} has an invalid month")
        total_weight += record.weight_hours
    if abs(total_weight - expected_annual_weight_hours) > tolerance:
        warnings.append(
            f"Climate weights sum to {total_weight:g} h, not the configured "
            f"{expected_annual_weight_hours:g} h."
        )
    return tuple(warnings)


def weighted_degree_hours(
    records: Sequence[ClimateRecord],
    heating_balance_temperature_c: float,
    cooling_balance_temperature_c: float,
) -> dict[str, float]:
    heating = sum(
        heating_degree_hour(record.air_temp_c, heating_balance_temperature_c)
        * record.weight_hours
        for record in records
    )
    cooling = sum(
        cooling_degree_hour(record.air_temp_c, cooling_balance_temperature_c)
        * record.weight_hours
        for record in records
    )
    return {"heating": heating, "cooling": cooling}


def allocate_annual_load(
    records: Sequence[ClimateRecord],
    annual_load_kwh: float,
    balance_temperature_c: float,
    mode: str,
    zero_degree_hour_policy: str,
    absolute_tolerance: float,
) -> list[float]:
    load = float(annual_load_kwh)
    tolerance = abs(float(absolute_tolerance))
    if not math.isfinite(load) or load < -tolerance:
        raise DegreeHourError("annual_load_kwh must be finite and non-negative")
    if mode == "heating":
        degrees = [
            heating_degree_hour(record.air_temp_c, balance_temperature_c)
            for record in records
        ]
    elif mode == "cooling":
        degrees = [
            cooling_degree_hour(record.air_temp_c, balance_temperature_c)
            for record in records
        ]
    else:
        raise DegreeHourError("mode must be 'heating' or 'cooling'")
    weighted = [degree * record.weight_hours for degree, record in zip(degrees, records)]
    denominator = sum(weighted)
    if load <= tolerance:
        return [0.0 for _ in records]
    if denominator > tolerance:
        return [load * contribution / denominator for contribution in weighted]
    if zero_degree_hour_policy == "uniform":
        total_weight = sum(record.weight_hours for record in records)
        if total_weight <= tolerance:
            raise DegreeHourError("Cannot uniformly allocate load with zero total weight")
        return [load * record.weight_hours / total_weight for record in records]
    if zero_degree_hour_policy == "discard_with_warning":
        return [0.0 for _ in records]
    if zero_degree_hour_policy == "error":
        raise DegreeHourError(
            f"Annual {mode} load is positive but weighted {mode} degree-hours are zero"
        )
    raise DegreeHourError(
        "zero_degree_hour_policy must be 'error', 'uniform', or "
        "'discard_with_warning' in the reference engine"
    )


def aggregate_values(
    records: Sequence[ClimateRecord],
    values: Sequence[float],
    selected_period_flags: Sequence[bool] | None = None,
) -> dict[str, object]:
    if len(records) != len(values):
        raise DegreeHourError("records and values must have the same length")
    flags = (
        [False for _ in records]
        if selected_period_flags is None
        else list(selected_period_flags)
    )
    if len(records) != len(flags):
        raise DegreeHourError(
            "records and selected_period_flags must have the same length"
        )
    monthly: dict[int, float] = defaultdict(float)
    monthly_selected: dict[int, float] = defaultdict(float)
    annual = 0.0
    selected = 0.0
    for record, value, is_selected in zip(records, values, flags):
        amount = float(value)
        annual += amount
        monthly[record.month] += amount
        if is_selected:
            selected += amount
            monthly_selected[record.month] += amount
    return {
        "annual": annual,
        "selected_period": selected,
        "monthly": {str(month): monthly[month] for month in range(1, 13)},
        "monthly_selected_period": {
            str(month): monthly_selected[month] for month in range(1, 13)
        },
    }
