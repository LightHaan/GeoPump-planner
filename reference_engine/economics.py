"""Simple and discounted economic calculations with explicit assumptions."""

from __future__ import annotations

import math
from collections.abc import Sequence


class EconomicsError(ValueError):
    """Raised for invalid economic assumptions."""


def annual_energy_cost(
    annual_electricity_kwh: float, electricity_price_per_kwh: float | None
) -> float | None:
    if electricity_price_per_kwh is None:
        return None
    energy = float(annual_electricity_kwh)
    price = float(electricity_price_per_kwh)
    if not math.isfinite(energy) or energy < 0.0:
        raise EconomicsError("Annual electricity must be finite and non-negative")
    if not math.isfinite(price) or price < 0.0:
        raise EconomicsError("Electricity price must be finite and non-negative")
    return energy * price


def simple_payback_years(
    incremental_installed_cost: float,
    annual_operating_cost_saving: float,
    absolute_tolerance: float,
) -> float | None:
    incremental = float(incremental_installed_cost)
    saving = float(annual_operating_cost_saving)
    if incremental <= absolute_tolerance:
        return 0.0
    if saving <= absolute_tolerance:
        return None
    return incremental / saving


def lifecycle_cost(
    installed_cost: float,
    annual_energy_cost_year_one: float,
    annual_maintenance_cost: float,
    analysis_period_years: int,
    discount_rate_fraction: float,
    energy_price_escalation_fraction: float,
    replacements: Sequence[dict[str, float]],
    residual_value: float,
) -> float:
    years = int(analysis_period_years)
    rate = float(discount_rate_fraction)
    escalation = float(energy_price_escalation_fraction)
    if years < 0:
        raise EconomicsError("analysis_period_years must be non-negative")
    if rate <= -1.0 or escalation <= -1.0:
        raise EconomicsError("Discount and escalation fractions must exceed -1")
    replacement_by_year: dict[int, float] = {}
    for replacement in replacements:
        year = int(replacement["year"])
        cost = float(replacement["cost"])
        if year < 1 or year > years:
            raise EconomicsError("Replacement year must be inside the analysis period")
        replacement_by_year[year] = replacement_by_year.get(year, 0.0) + cost
    total = float(installed_cost)
    for year in range(1, years + 1):
        energy = float(annual_energy_cost_year_one) * (1.0 + escalation) ** (year - 1)
        annual = energy + float(annual_maintenance_cost) + replacement_by_year.get(year, 0.0)
        total += annual / (1.0 + rate) ** year
    total -= float(residual_value) / (1.0 + rate) ** years if years else float(residual_value)
    return total


def compare_lifecycle_costs(
    gshp_installed_cost: float | None,
    ashp_installed_cost: float | None,
    gshp_annual_energy_cost: float | None,
    ashp_annual_energy_cost: float | None,
    gshp_annual_maintenance_cost: float,
    ashp_annual_maintenance_cost: float,
    analysis_period_years: int,
    discount_rate_fraction: float,
    energy_price_escalation_fraction: float,
    gshp_replacements: Sequence[dict[str, float]],
    ashp_replacements: Sequence[dict[str, float]],
    gshp_residual_value: float,
    ashp_residual_value: float,
    absolute_tolerance: float,
) -> dict[str, float | None]:
    if None in (
        gshp_installed_cost,
        ashp_installed_cost,
        gshp_annual_energy_cost,
        ashp_annual_energy_cost,
    ):
        return {
            "incremental_installed_cost": None,
            "annual_operating_cost_saving": None,
            "simple_payback_years": None,
            "gshp_lifecycle_cost": None,
            "ashp_lifecycle_cost": None,
            "npv_of_gshp_choice": None,
        }
    incremental = float(gshp_installed_cost) - float(ashp_installed_cost)
    annual_saving = (
        float(ashp_annual_energy_cost)
        + float(ashp_annual_maintenance_cost)
        - float(gshp_annual_energy_cost)
        - float(gshp_annual_maintenance_cost)
    )
    gshp_lcc = lifecycle_cost(
        float(gshp_installed_cost),
        float(gshp_annual_energy_cost),
        gshp_annual_maintenance_cost,
        analysis_period_years,
        discount_rate_fraction,
        energy_price_escalation_fraction,
        gshp_replacements,
        gshp_residual_value,
    )
    ashp_lcc = lifecycle_cost(
        float(ashp_installed_cost),
        float(ashp_annual_energy_cost),
        ashp_annual_maintenance_cost,
        analysis_period_years,
        discount_rate_fraction,
        energy_price_escalation_fraction,
        ashp_replacements,
        ashp_residual_value,
    )
    return {
        "incremental_installed_cost": incremental,
        "annual_operating_cost_saving": annual_saving,
        "simple_payback_years": simple_payback_years(
            incremental, annual_saving, absolute_tolerance
        ),
        "gshp_lifecycle_cost": gshp_lcc,
        "ashp_lifecycle_cost": ashp_lcc,
        "npv_of_gshp_choice": ashp_lcc - gshp_lcc,
    }
