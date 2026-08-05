"""Classify records into a user-defined comparison/tariff analysis period."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from .models import ClimateRecord
from .solar_time import (
    is_night_fixed_period,
    is_night_solar_geometry,
    sunrise_sunset_utc,
)


class AnalysisPeriodError(ValueError):
    """Raised when the selected-period definition is invalid."""


def analysis_period_flags(
    records: Sequence[ClimateRecord],
    latitude_deg: float,
    longitude_deg: float,
    analysis_period: dict[str, Any],
    time_parameters: dict[str, Any],
) -> list[bool]:
    """Return one membership flag per climate record.

    The user-facing label is deliberately independent from the calculation
    mode, so a fixed daily window does not have to be described as "night".
    """

    if not bool(analysis_period["enabled"]):
        return [False for _ in records]
    mode = analysis_period["mode"]
    if mode == "all_hours":
        return [True for _ in records]
    if mode == "fixed_local_time":
        return [
            is_night_fixed_period(
                record.hour_utc,
                analysis_period["fixed_start_local_hour"],
                analysis_period["fixed_end_local_hour"],
                analysis_period["fixed_utc_offset_hours"],
                analysis_period["hours_per_day"],
            )
            for record in records
        ]
    if mode == "solar_geometry":
        output: list[bool] = []
        for record in records:
            sunrise, sunset = sunrise_sunset_utc(
                latitude_deg,
                longitude_deg,
                record.day_of_year,
                analysis_period["solar_declination_amplitude_deg"],
                analysis_period["day_phase_offset"],
                time_parameters["days_per_year"],
                analysis_period["longitude_degrees_per_hour"],
                analysis_period["solar_noon_hour_utc_at_zero_longitude"],
                analysis_period["minimum_cosine_hour_angle"],
                analysis_period["maximum_cosine_hour_angle"],
            )
            output.append(
                is_night_solar_geometry(
                    record.hour_utc,
                    sunrise,
                    sunset,
                    analysis_period["hours_before_sunset"],
                    analysis_period["hours_after_sunrise"],
                    analysis_period["hours_per_day"],
                )
            )
        return output
    raise AnalysisPeriodError(
        "analysis-period mode must be 'solar_geometry', 'fixed_local_time', "
        "or 'all_hours'"
    )
