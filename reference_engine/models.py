"""Shared immutable data structures for the reference calculations."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class ClimateRecord:
    day_of_year: int
    hour_utc: float
    month: int
    air_temp_c: float
    weight_hours: float


@dataclass(frozen=True)
class GroundTemperatureResult:
    mode: str
    ground_temperature_c: float
    target_depth_m: float | None
    surface_temperature_c: float | None
    gradient_c_per_m: float | None
    borehole_temperature_c: float | None
    borehole_depth_m: float | None
    extrapolated: bool
    warnings: tuple[str, ...]
    trace: dict[str, Any]


@dataclass(frozen=True)
class CopResult:
    value: float | None
    raw_value: float
    valid: bool
    clipped: bool
    warnings: tuple[str, ...]
