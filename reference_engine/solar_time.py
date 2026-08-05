"""Paper solar-geometry nighttime classification with explicit constants."""

from __future__ import annotations

import math
from datetime import date, timedelta


class SolarTimeError(ValueError):
    """Raised for invalid solar-geometry inputs."""


def month_from_day_of_year(day_of_year: int, base_year: int) -> int:
    if day_of_year < 1:
        raise SolarTimeError("day_of_year must be at least 1")
    return (date(int(base_year), 1, 1) + timedelta(days=int(day_of_year) - 1)).month


def sunrise_sunset_utc(
    latitude_deg: float,
    longitude_deg: float,
    day_of_year: int,
    solar_declination_amplitude_deg: float,
    day_phase_offset: float,
    days_per_year: float,
    longitude_degrees_per_hour: float,
    solar_noon_hour_utc_at_zero_longitude: float,
    minimum_cosine_hour_angle: float,
    maximum_cosine_hour_angle: float,
) -> tuple[float, float]:
    if days_per_year <= 0 or longitude_degrees_per_hour <= 0:
        raise SolarTimeError("Year length and longitude conversion must be positive")
    latitude_rad = math.radians(float(latitude_deg))
    declination_deg = float(solar_declination_amplitude_deg) * math.sin(
        2.0 * math.pi * (float(day_phase_offset) + float(day_of_year)) / days_per_year
    )
    declination_rad = math.radians(declination_deg)
    cosine_hour_angle = -math.tan(latitude_rad) * math.tan(declination_rad)
    cosine_hour_angle = min(
        float(maximum_cosine_hour_angle),
        max(float(minimum_cosine_hour_angle), cosine_hour_angle),
    )
    half_day_hours = (
        math.degrees(math.acos(cosine_hour_angle)) / longitude_degrees_per_hour
    )
    solar_noon = solar_noon_hour_utc_at_zero_longitude - (
        float(longitude_deg) / longitude_degrees_per_hour
    )
    return solar_noon - half_day_hours, solar_noon + half_day_hours


def is_night_solar_geometry(
    hour_utc: float,
    sunrise_utc: float,
    sunset_utc: float,
    hours_before_sunset: float,
    hours_after_sunrise: float,
    hours_per_day: float,
) -> bool:
    if hours_per_day <= 0:
        raise SolarTimeError("hours_per_day must be positive")
    start = (sunset_utc - hours_before_sunset + hours_per_day) % hours_per_day
    end = (sunrise_utc + hours_after_sunrise + hours_per_day) % hours_per_day
    hour = float(hour_utc) % hours_per_day
    if start < end:
        return start <= hour <= end
    return hour >= start or hour <= end


def is_night_fixed_period(
    hour_utc: float,
    start_local_hour: float,
    end_local_hour: float,
    utc_offset_hours: float,
    hours_per_day: float,
) -> bool:
    if hours_per_day <= 0:
        raise SolarTimeError("hours_per_day must be positive")
    local_hour = (float(hour_utc) + float(utc_offset_hours)) % hours_per_day
    start = float(start_local_hour) % hours_per_day
    end = float(end_local_hour) % hours_per_day
    if start < end:
        return start <= local_hour <= end
    return local_hour >= start or local_hour <= end
