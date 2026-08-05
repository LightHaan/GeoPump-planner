"""Compressor, auxiliary electricity, and performance-factor calculations."""

from __future__ import annotations

import math
from collections.abc import Sequence


class ElectricityError(ValueError):
    """Raised when electricity cannot be calculated safely."""


def compressor_electricity(
    thermal_loads_kwh: Sequence[float],
    cops: Sequence[float | None],
    invalid_hour_policy: str,
    absolute_tolerance: float,
) -> tuple[list[float], int]:
    if len(thermal_loads_kwh) != len(cops):
        raise ElectricityError("thermal loads and COPs must have the same length")
    tolerance = abs(float(absolute_tolerance))
    values: list[float] = []
    invalid_count = 0
    for index, (load, cop) in enumerate(zip(thermal_loads_kwh, cops)):
        thermal = float(load)
        if thermal < -tolerance or not math.isfinite(thermal):
            raise ElectricityError(f"Thermal load at index {index} is invalid")
        if thermal <= tolerance:
            values.append(0.0)
            continue
        if cop is None or not math.isfinite(float(cop)) or float(cop) <= tolerance:
            invalid_count += 1
            if invalid_hour_policy == "ignore":
                values.append(0.0)
                continue
            raise ElectricityError(f"Invalid COP at active-load index {index}")
        values.append(thermal / float(cop))
    return values, invalid_count


def add_auxiliary_electricity(
    compressor_values_kwh: Sequence[float],
    record_weights_hours: Sequence[float],
    pump_fraction_of_compressor: float,
    fan_fraction_of_compressor: float,
    misc_fraction_of_compressor: float,
    fixed_auxiliary_kwh_per_year: float,
    absolute_tolerance: float,
) -> list[float]:
    if len(compressor_values_kwh) != len(record_weights_hours):
        raise ElectricityError("compressor values and weights must have the same length")
    fractions = [
        float(pump_fraction_of_compressor),
        float(fan_fraction_of_compressor),
        float(misc_fraction_of_compressor),
    ]
    if any(not math.isfinite(value) or value < 0.0 for value in fractions):
        raise ElectricityError("Auxiliary fractions must be finite and non-negative")
    fixed = float(fixed_auxiliary_kwh_per_year)
    if not math.isfinite(fixed) or fixed < 0.0:
        raise ElectricityError("Fixed auxiliary electricity must be finite and non-negative")
    total_weight = sum(float(weight) for weight in record_weights_hours)
    if fixed > absolute_tolerance and total_weight <= absolute_tolerance:
        raise ElectricityError("Cannot allocate fixed auxiliary electricity with zero weight")
    multiplier = 1.0 + sum(fractions)
    return [
        float(compressor) * multiplier
        + (0.0 if fixed <= absolute_tolerance else fixed * float(weight) / total_weight)
        for compressor, weight in zip(compressor_values_kwh, record_weights_hours)
    ]


def performance_factor(
    delivered_thermal_energy_kwh: float,
    system_electricity_kwh: float,
    absolute_tolerance: float,
) -> float | None:
    thermal = float(delivered_thermal_energy_kwh)
    electricity = float(system_electricity_kwh)
    if electricity <= abs(float(absolute_tolerance)):
        return None
    return thermal / electricity
