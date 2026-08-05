"""End-to-end deterministic GSHP/ASHP comparison for one postcode."""

from __future__ import annotations

from copy import deepcopy
from typing import Any

from .analysis_period import analysis_period_flags
from .cop import calculate_cop
from .degree_hours import (
    aggregate_values,
    allocate_annual_load,
    validate_climate_records,
    weighted_degree_hours,
)
from .economics import compare_lifecycle_costs
from .electricity import (
    add_auxiliary_electricity,
    compressor_electricity,
    performance_factor,
)
from .models import ClimateRecord
from .tariff import annual_tariff_cost


def _cop_series(
    mode: str,
    sources_c: list[float],
    thermal_loads_kwh: list[float],
    parameters: dict[str, Any],
    absolute_tolerance: float,
) -> tuple[list[float | None], list[str]]:
    values: list[float | None] = []
    warnings: list[str] = []
    for source, thermal_load in zip(sources_c, thermal_loads_kwh):
        if thermal_load <= absolute_tolerance:
            values.append(None)
            continue
        result = calculate_cop(mode, source, parameters, absolute_tolerance)
        values.append(result.value)
        warnings.extend(result.warnings)
    return values, warnings


def _seasonal_amount(
    aggregate: dict[str, Any], months: list[int], *, selected_period: bool = False
) -> float:
    key = "monthly_selected_period" if selected_period else "monthly"
    return sum(float(aggregate[key][str(month)]) for month in months)


def _seasonal_loads(
    heating: dict[str, Any],
    cooling: dict[str, Any],
    season_months: dict[str, list[int]],
) -> dict[str, dict[str, float]]:
    output: dict[str, dict[str, float]] = {}
    for season, months in season_months.items():
        heat = _seasonal_amount(heating, months)
        cool = _seasonal_amount(cooling, months)
        heat_selected = _seasonal_amount(heating, months, selected_period=True)
        cool_selected = _seasonal_amount(cooling, months, selected_period=True)
        output[season] = {
            "heating": heat,
            "cooling": cool,
            "total": heat + cool,
            "heating_selected_period": heat_selected,
            "cooling_selected_period": cool_selected,
            "total_selected_period": heat_selected + cool_selected,
        }
    return output


def _system_results(
    system_id: str,
    records: list[ClimateRecord],
    heating_loads: list[float],
    cooling_loads: list[float],
    source_temperatures_c: list[float],
    cop_parameters: dict[str, Any],
    electricity_parameters: dict[str, Any],
    season_months: dict[str, list[int]],
    selected_period_flags: list[bool],
    absolute_tolerance: float,
) -> dict[str, Any]:
    heating_cops, heating_warnings = _cop_series(
        "heating",
        source_temperatures_c,
        heating_loads,
        cop_parameters,
        absolute_tolerance,
    )
    cooling_cops, cooling_warnings = _cop_series(
        "cooling",
        source_temperatures_c,
        cooling_loads,
        cop_parameters,
        absolute_tolerance,
    )
    invalid_policy = cop_parameters["invalid_cop_policy"]
    heating_compressor, invalid_heating = compressor_electricity(
        heating_loads, heating_cops, invalid_policy, absolute_tolerance
    )
    cooling_compressor, invalid_cooling = compressor_electricity(
        cooling_loads, cooling_cops, invalid_policy, absolute_tolerance
    )
    combined_compressor = [
        heating + cooling
        for heating, cooling in zip(heating_compressor, cooling_compressor)
    ]
    weights = [record.weight_hours for record in records]
    system_electricity = add_auxiliary_electricity(
        combined_compressor,
        weights,
        electricity_parameters["pump_fraction_of_compressor"],
        electricity_parameters["fan_fraction_of_compressor"],
        electricity_parameters["misc_fraction_of_compressor"],
        electricity_parameters["fixed_auxiliary_kwh_per_year"],
        absolute_tolerance,
    )
    heating_aggregate = aggregate_values(
        records, heating_compressor, selected_period_flags
    )
    cooling_aggregate = aggregate_values(
        records, cooling_compressor, selected_period_flags
    )
    system_aggregate = aggregate_values(
        records, system_electricity, selected_period_flags
    )
    thermal_total = sum(heating_loads) + sum(cooling_loads)
    seasonal_loads = _seasonal_loads(
        aggregate_values(records, heating_loads, selected_period_flags),
        aggregate_values(records, cooling_loads, selected_period_flags),
        season_months,
    )
    seasonal: dict[str, dict[str, float | None]] = {}
    for season, months in season_months.items():
        heating_all = _seasonal_amount(heating_aggregate, months)
        heating_selected = _seasonal_amount(
            heating_aggregate, months, selected_period=True
        )
        cooling_all = _seasonal_amount(cooling_aggregate, months)
        cooling_selected = _seasonal_amount(
            cooling_aggregate, months, selected_period=True
        )
        total_all = _seasonal_amount(system_aggregate, months)
        total_selected = _seasonal_amount(
            system_aggregate, months, selected_period=True
        )
        seasonal[season] = {
            "heating_electricity": heating_all,
            "heating_selected_period_electricity": heating_selected,
            "cooling_electricity": cooling_all,
            "cooling_selected_period_electricity": cooling_selected,
            "total_electricity": total_all,
            "total_selected_period_electricity": total_selected,
            "performance_factor": performance_factor(
                seasonal_loads[season]["total"], total_all, absolute_tolerance
            ),
            "selected_period_performance_factor": performance_factor(
                seasonal_loads[season]["total_selected_period"],
                total_selected,
                absolute_tolerance,
            ),
        }
    return {
        "system_id": system_id,
        "heating_compressor_electricity": heating_aggregate,
        "cooling_compressor_electricity": cooling_aggregate,
        "system_electricity": system_aggregate,
        "annual_performance_factor": performance_factor(
            thermal_total, system_aggregate["annual"], absolute_tolerance
        ),
        "selected_period_performance_factor": performance_factor(
            sum(
                load
                for load, selected in zip(heating_loads, selected_period_flags)
                if selected
            )
            + sum(
                load
                for load, selected in zip(cooling_loads, selected_period_flags)
                if selected
            ),
            system_aggregate["selected_period"],
            absolute_tolerance,
        ),
        "seasonal": seasonal,
        "invalid_heating_hour_count": invalid_heating,
        "invalid_cooling_hour_count": invalid_cooling,
        "warnings": sorted(set(heating_warnings + cooling_warnings)),
        "cop_trace": {
            "model_id": cop_parameters["model_id"],
            "heating_cop_ground_or_hourly_source": heating_cops,
            "cooling_cop_ground_or_hourly_source": cooling_cops,
        },
    }


def run_scenario(
    postcode: str,
    records: list[ClimateRecord],
    latitude_deg: float,
    longitude_deg: float,
    ground_temperature_c: float,
    annual_heating_kwh_m2: float,
    annual_cooling_kwh_m2: float,
    parameters: dict[str, Any],
) -> dict[str, Any]:
    config = deepcopy(parameters)
    tolerance = float(config["numerical"]["absolute_tolerance"])
    warnings = list(
        validate_climate_records(
            records,
            config["time"]["expected_annual_weight_hours"],
            tolerance,
        )
    )
    selected_period = analysis_period_flags(
        records,
        latitude_deg,
        longitude_deg,
        config["analysis_period"],
        config["time"],
    )
    load_parameters = config["load"]
    absolute_multiplier = (
        float(load_parameters["conditioned_floor_area_m2"])
        * float(load_parameters["building_count"])
        * float(load_parameters["load_scaling_factor"])
        * float(load_parameters["occupancy_use_factor"])
    )
    annual_heating = float(annual_heating_kwh_m2) * absolute_multiplier
    annual_cooling = float(annual_cooling_kwh_m2) * absolute_multiplier
    heating_loads = allocate_annual_load(
        records,
        annual_heating,
        load_parameters["heating_balance_temperature_c"],
        "heating",
        load_parameters["zero_degree_hour_policy"],
        tolerance,
    )
    cooling_loads = allocate_annual_load(
        records,
        annual_cooling,
        load_parameters["cooling_balance_temperature_c"],
        "cooling",
        load_parameters["zero_degree_hour_policy"],
        tolerance,
    )
    allocated_heating = sum(heating_loads)
    allocated_cooling = sum(cooling_loads)
    unallocated_heating = annual_heating - allocated_heating
    unallocated_cooling = annual_cooling - allocated_cooling
    if unallocated_heating > tolerance:
        warnings.append(
            f"Annual heating degree-hours are zero, so the model-allocated heating "
            f"load is 0 kWh despite a {annual_heating:g} kWh certificate-load input."
        )
    if unallocated_cooling > tolerance:
        warnings.append(
            f"Annual cooling degree-hours are zero, so the model-allocated cooling "
            f"load is 0 kWh despite a {annual_cooling:g} kWh certificate-load input."
        )
    loads = {
        "heating": aggregate_values(records, heating_loads, selected_period),
        "cooling": aggregate_values(records, cooling_loads, selected_period),
    }
    loads["total_annual"] = loads["heating"]["annual"] + loads["cooling"]["annual"]
    loads["seasonal"] = _seasonal_loads(
        loads["heating"], loads["cooling"], config["time"]["season_months"]
    )
    ground_sources = [float(ground_temperature_c) for _ in records]
    air_sources = [record.air_temp_c for record in records]
    gshp = _system_results(
        "gshp",
        records,
        heating_loads,
        cooling_loads,
        ground_sources,
        config["cop"]["gshp"],
        config["electricity"]["gshp"],
        config["time"]["season_months"],
        selected_period,
        tolerance,
    )
    ashp = _system_results(
        "ashp",
        records,
        heating_loads,
        cooling_loads,
        air_sources,
        config["cop"]["ashp"],
        config["electricity"]["ashp"],
        config["time"]["season_months"],
        selected_period,
        tolerance,
    )
    gshp_energy = gshp["system_electricity"]["annual"]
    ashp_energy = ashp["system_electricity"]["annual"]
    saving = ashp_energy - gshp_energy
    relative_saving = None if ashp_energy <= tolerance else saving / ashp_energy
    gshp_tariff_cost = annual_tariff_cost(
        gshp_energy,
        gshp["system_electricity"]["selected_period"],
        config["tariff"],
        config["time"]["days_per_year"],
        tolerance,
    )
    ashp_tariff_cost = annual_tariff_cost(
        ashp_energy,
        ashp["system_electricity"]["selected_period"],
        config["tariff"],
        config["time"]["days_per_year"],
        tolerance,
    )
    gshp_energy_cost = gshp_tariff_cost["total_cost"]
    ashp_energy_cost = ashp_tariff_cost["total_cost"]
    economics_config = config["economics"]
    economics = compare_lifecycle_costs(
        economics_config["gshp_installed_cost"],
        economics_config["ashp_installed_cost"],
        gshp_energy_cost,
        ashp_energy_cost,
        economics_config["gshp_annual_maintenance_cost"],
        economics_config["ashp_annual_maintenance_cost"],
        economics_config["analysis_period_years"],
        economics_config["discount_rate_fraction"],
        economics_config["electricity_price_escalation_fraction"],
        economics_config["gshp_replacements"],
        economics_config["ashp_replacements"],
        economics_config["gshp_residual_value"],
        economics_config["ashp_residual_value"],
        tolerance,
    )
    warnings.extend(gshp["warnings"])
    warnings.extend(ashp["warnings"])
    return {
        "postcode": postcode,
        "ground_temperature_c": float(ground_temperature_c),
        "degree_hours": weighted_degree_hours(
            records,
            load_parameters["heating_balance_temperature_c"],
            load_parameters["cooling_balance_temperature_c"],
        ),
        "loads": loads,
        "gshp": gshp,
        "ashp": ashp,
        "comparison": {
            "annual_electricity_saving_kwh": saving,
            "relative_electricity_saving_fraction": relative_saving,
            "gshp_annual_energy_cost": gshp_energy_cost,
            "ashp_annual_energy_cost": ashp_energy_cost,
            "gshp_tariff_cost_breakdown": gshp_tariff_cost,
            "ashp_tariff_cost_breakdown": ashp_tariff_cost,
        },
        "economics": economics,
        "warnings": sorted(set(warnings)),
        "calculation_trace": {
            "record_count": len(records),
            "weight_hours_total": sum(record.weight_hours for record in records),
            "absolute_load_multiplier": absolute_multiplier,
            "requested_annual_heating_kwh": annual_heating,
            "requested_annual_cooling_kwh": annual_cooling,
            "unallocated_annual_heating_kwh": unallocated_heating,
            "unallocated_annual_cooling_kwh": unallocated_cooling,
            "ground_source_temperature_mode": "constant",
            "ashp_source_temperature_mode": "record_air_temperature",
            "analysis_period_enabled": config["analysis_period"]["enabled"],
            "analysis_period_label": config["analysis_period"]["label"],
            "analysis_period_mode": config["analysis_period"]["mode"],
            "analysis_period_record_count": sum(selected_period),
        },
    }
