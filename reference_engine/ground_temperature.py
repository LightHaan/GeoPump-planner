"""Ground-temperature models with no hidden domain constants."""

from __future__ import annotations

import math

from .models import GroundTemperatureResult


class GroundTemperatureError(ValueError):
    """Raised when a ground-temperature scenario is physically invalid."""


def _finite(name: str, value: float) -> float:
    number = float(value)
    if not math.isfinite(number):
        raise GroundTemperatureError(f"{name} must be finite")
    return number


def _validate_depth(name: str, depth_m: float, minimum_depth_m: float) -> float:
    depth = _finite(name, depth_m)
    minimum = _finite("minimum_depth_m", minimum_depth_m)
    if depth < minimum:
        raise GroundTemperatureError(f"{name} must be at least {minimum} m")
    return depth


def ground_temperature_from_surface_gradient(
    surface_temperature_c: float,
    gradient_c_per_m: float,
    target_depth_m: float,
    minimum_depth_m: float,
    shallow_warning_depth_m: float,
) -> GroundTemperatureResult:
    surface = _finite("surface_temperature_c", surface_temperature_c)
    gradient = _finite("gradient_c_per_m", gradient_c_per_m)
    depth = _validate_depth("target_depth_m", target_depth_m, minimum_depth_m)
    warning_depth = _finite("shallow_warning_depth_m", shallow_warning_depth_m)
    ground = surface + gradient * depth
    warnings: list[str] = []
    if depth < warning_depth:
        warnings.append(
            "Target depth is shallower than the configured seasonal-stability warning depth."
        )
    return GroundTemperatureResult(
        mode="surface_gradient",
        ground_temperature_c=ground,
        target_depth_m=depth,
        surface_temperature_c=surface,
        gradient_c_per_m=gradient,
        borehole_temperature_c=None,
        borehole_depth_m=None,
        extrapolated=False,
        warnings=tuple(warnings),
        trace={
            "equation": "T_z = T_s + g * z",
            "surface_temperature_c": surface,
            "gradient_c_per_m": gradient,
            "target_depth_m": depth,
        },
    )


def ground_temperature_from_interpolation(
    surface_temperature_c: float,
    borehole_temperature_c: float,
    borehole_depth_m: float,
    target_depth_m: float,
    minimum_depth_m: float,
    shallow_warning_depth_m: float,
    allow_extrapolation_below_borehole: bool,
    absolute_tolerance: float,
) -> GroundTemperatureResult:
    surface = _finite("surface_temperature_c", surface_temperature_c)
    borehole_temperature = _finite("borehole_temperature_c", borehole_temperature_c)
    borehole_depth = _validate_depth(
        "borehole_depth_m", borehole_depth_m, minimum_depth_m
    )
    target_depth = _validate_depth("target_depth_m", target_depth_m, minimum_depth_m)
    tolerance = abs(_finite("absolute_tolerance", absolute_tolerance))
    if borehole_depth <= tolerance:
        raise GroundTemperatureError("borehole_depth_m must be greater than zero")
    extrapolated = target_depth > borehole_depth + tolerance
    if extrapolated and not allow_extrapolation_below_borehole:
        raise GroundTemperatureError(
            "target_depth_m exceeds borehole_depth_m and extrapolation is disabled"
        )
    gradient = (borehole_temperature - surface) / borehole_depth
    ground = surface + (borehole_temperature - surface) * target_depth / borehole_depth
    warnings: list[str] = []
    if target_depth < shallow_warning_depth_m:
        warnings.append(
            "Target depth is shallower than the configured seasonal-stability warning depth."
        )
    if extrapolated:
        warnings.append("Ground temperature is extrapolated below the borehole observation.")
    return GroundTemperatureResult(
        mode="surface_borehole_interpolation",
        ground_temperature_c=ground,
        target_depth_m=target_depth,
        surface_temperature_c=surface,
        gradient_c_per_m=gradient,
        borehole_temperature_c=borehole_temperature,
        borehole_depth_m=borehole_depth,
        extrapolated=extrapolated,
        warnings=tuple(warnings),
        trace={
            "equation": "T_z = T_s + (T_b - T_s) * z / z_b",
            "surface_temperature_c": surface,
            "borehole_temperature_c": borehole_temperature,
            "borehole_depth_m": borehole_depth,
            "target_depth_m": target_depth,
        },
    )


def direct_ground_temperature(ground_temperature_c: float) -> GroundTemperatureResult:
    ground = _finite("ground_temperature_c", ground_temperature_c)
    return GroundTemperatureResult(
        mode="direct",
        ground_temperature_c=ground,
        target_depth_m=None,
        surface_temperature_c=None,
        gradient_c_per_m=None,
        borehole_temperature_c=None,
        borehole_depth_m=None,
        extrapolated=False,
        warnings=(),
        trace={"equation": "T_z = user_input", "ground_temperature_c": ground},
    )
