"""Editable single-rate and selected-period electricity tariffs."""

from __future__ import annotations

import math
from typing import Any


class TariffError(ValueError):
    """Raised when a tariff definition is incomplete or invalid."""


def _non_negative(name: str, value: float) -> float:
    number = float(value)
    if not math.isfinite(number) or number < 0.0:
        raise TariffError(f"{name} must be finite and non-negative")
    return number


def annual_tariff_cost(
    annual_electricity_kwh: float,
    selected_period_electricity_kwh: float,
    tariff: dict[str, Any],
    days_per_year: float,
    absolute_tolerance: float,
) -> dict[str, float | None]:
    annual = _non_negative("annual_electricity_kwh", annual_electricity_kwh)
    selected = _non_negative(
        "selected_period_electricity_kwh", selected_period_electricity_kwh
    )
    tolerance = abs(float(absolute_tolerance))
    if selected > annual + tolerance:
        raise TariffError("Selected-period electricity cannot exceed annual electricity")
    fixed_daily = _non_negative("fixed_daily_charge", tariff["fixed_daily_charge"])
    fixed_annual = _non_negative("annual_fixed_charge", tariff["annual_fixed_charge"])
    fixed_charge = fixed_daily * _non_negative("days_per_year", days_per_year) + fixed_annual
    mode = tariff["mode"]
    if mode == "single":
        price = tariff["single_price_per_kwh"]
        if price is None:
            return {
                "energy_charge": None,
                "fixed_charge": fixed_charge,
                "total_cost": None,
            }
        energy_charge = annual * _non_negative("single_price_per_kwh", price)
    elif mode == "selected_period_two_rate":
        selected_price = tariff["selected_period_price_per_kwh"]
        other_price = tariff["other_period_price_per_kwh"]
        if selected_price is None or other_price is None:
            return {
                "energy_charge": None,
                "fixed_charge": fixed_charge,
                "total_cost": None,
            }
        energy_charge = selected * _non_negative(
            "selected_period_price_per_kwh", selected_price
        ) + (annual - selected) * _non_negative(
            "other_period_price_per_kwh", other_price
        )
    else:
        raise TariffError(
            "tariff mode must be 'single' or 'selected_period_two_rate'"
        )
    return {
        "energy_charge": energy_charge,
        "fixed_charge": fixed_charge,
        "total_cost": energy_charge + fixed_charge,
    }
