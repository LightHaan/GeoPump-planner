"""COP models used by the Python reference engine."""

from __future__ import annotations

import math

from .models import CopResult


class CopError(ValueError):
    """Raised when a COP calculation is invalid under the selected policy."""


def _apply_bounds(
    raw_value: float,
    minimum_cop: float,
    maximum_cop: float,
    invalid_cop_policy: str,
) -> CopResult:
    valid_number = math.isfinite(raw_value) and raw_value > 0.0
    in_range = valid_number and minimum_cop <= raw_value <= maximum_cop
    if in_range:
        return CopResult(raw_value, raw_value, True, False, ())
    warnings: list[str] = []
    if not valid_number:
        warnings.append("COP is zero, negative, NaN, or infinite.")
    else:
        warnings.append(
            f"COP {raw_value:g} is outside configured bounds "
            f"[{minimum_cop:g}, {maximum_cop:g}]."
        )
    if invalid_cop_policy == "clip" and valid_number:
        clipped = min(max(raw_value, minimum_cop), maximum_cop)
        return CopResult(clipped, raw_value, True, True, tuple(warnings))
    if invalid_cop_policy == "ignore":
        return CopResult(None, raw_value, False, False, tuple(warnings))
    if invalid_cop_policy == "stop":
        raise CopError(" ".join(warnings))
    raise CopError("invalid_cop_policy must be 'stop', 'clip', or 'ignore'")


def scaled_carnot_cop(
    mode: str,
    source_temperature_c: float,
    heating_supply_temperature_c: float,
    cooling_supply_temperature_c: float,
    approach_temperature_k: float,
    empirical_carnot_efficiency: float,
    kelvin_offset: float,
    minimum_cop: float,
    maximum_cop: float,
    invalid_cop_policy: str,
    absolute_tolerance: float,
) -> CopResult:
    source_k = float(source_temperature_c) + float(kelvin_offset)
    approach = float(approach_temperature_k)
    efficiency = float(empirical_carnot_efficiency)
    tolerance = abs(float(absolute_tolerance))
    if mode == "heating":
        condenser_k = float(heating_supply_temperature_c) + kelvin_offset + approach
        evaporator_k = source_k - approach
        denominator = condenser_k - evaporator_k
        if abs(denominator) <= tolerance:
            raise CopError("Heating Carnot denominator is zero")
        raw = efficiency * condenser_k / denominator
    elif mode == "cooling":
        evaporator_k = float(cooling_supply_temperature_c) + kelvin_offset - approach
        condenser_k = source_k + approach
        denominator = condenser_k - evaporator_k
        if abs(denominator) <= tolerance:
            raise CopError("Cooling Carnot denominator is zero")
        raw = efficiency * evaporator_k / denominator
    else:
        raise CopError("mode must be 'heating' or 'cooling'")
    return _apply_bounds(raw, minimum_cop, maximum_cop, invalid_cop_policy)


def constant_cop(
    mode: str,
    heating_cop: float,
    cooling_cop: float,
    minimum_cop: float,
    maximum_cop: float,
    invalid_cop_policy: str,
) -> CopResult:
    if mode == "heating":
        raw = float(heating_cop)
    elif mode == "cooling":
        raw = float(cooling_cop)
    else:
        raise CopError("mode must be 'heating' or 'cooling'")
    return _apply_bounds(raw, minimum_cop, maximum_cop, invalid_cop_policy)


def linear_source_temperature_cop(
    mode: str,
    source_temperature_c: float,
    heating_intercept: float,
    heating_slope_per_c: float,
    cooling_intercept: float,
    cooling_slope_per_c: float,
    minimum_cop: float,
    maximum_cop: float,
    invalid_cop_policy: str,
) -> CopResult:
    source = float(source_temperature_c)
    if mode == "heating":
        raw = float(heating_intercept) + float(heating_slope_per_c) * source
    elif mode == "cooling":
        raw = float(cooling_intercept) + float(cooling_slope_per_c) * source
    else:
        raise CopError("mode must be 'heating' or 'cooling'")
    return _apply_bounds(raw, minimum_cop, maximum_cop, invalid_cop_policy)


def calculate_cop(
    mode: str,
    source_temperature_c: float,
    parameters: dict[str, float | str],
    absolute_tolerance: float,
) -> CopResult:
    """Dispatch to an explicit COP model registry entry."""

    model_id = parameters["model_id"]
    common = {
        "minimum_cop": float(parameters["minimum_cop"]),
        "maximum_cop": float(parameters["maximum_cop"]),
        "invalid_cop_policy": str(parameters["invalid_cop_policy"]),
    }
    if model_id == "scaled_carnot":
        return scaled_carnot_cop(
            mode,
            source_temperature_c,
            float(parameters["heating_supply_temperature_c"]),
            float(parameters["cooling_supply_temperature_c"]),
            float(parameters["approach_temperature_k"]),
            float(parameters["empirical_carnot_efficiency"]),
            float(parameters["kelvin_offset"]),
            common["minimum_cop"],
            common["maximum_cop"],
            common["invalid_cop_policy"],
            absolute_tolerance,
        )
    if model_id == "constant":
        return constant_cop(
            mode,
            float(parameters["constant_heating_cop"]),
            float(parameters["constant_cooling_cop"]),
            common["minimum_cop"],
            common["maximum_cop"],
            common["invalid_cop_policy"],
        )
    if model_id == "linear_source_temperature":
        return linear_source_temperature_cop(
            mode,
            source_temperature_c,
            float(parameters["linear_heating_intercept"]),
            float(parameters["linear_heating_slope_per_c"]),
            float(parameters["linear_cooling_intercept"]),
            float(parameters["linear_cooling_slope_per_c"]),
            common["minimum_cop"],
            common["maximum_cop"],
            common["invalid_cop_policy"],
        )
    raise CopError(
        "model_id must be 'scaled_carnot', 'constant', or "
        "'linear_source_temperature'"
    )
