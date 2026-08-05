from __future__ import annotations

import math
import unittest

from reference_engine.analysis_period import analysis_period_flags
from reference_engine.cop import CopError, calculate_cop, scaled_carnot_cop
from reference_engine.degree_hours import (
    DegreeHourError,
    aggregate_values,
    allocate_annual_load,
    validate_climate_records,
    weighted_degree_hours,
)
from reference_engine.economics import (
    annual_energy_cost,
    compare_lifecycle_costs,
    lifecycle_cost,
    simple_payback_years,
)
from reference_engine.electricity import (
    ElectricityError,
    add_auxiliary_electricity,
    compressor_electricity,
    performance_factor,
)
from reference_engine.ground_temperature import (
    GroundTemperatureError,
    direct_ground_temperature,
    ground_temperature_from_interpolation,
    ground_temperature_from_surface_gradient,
)
from reference_engine.models import ClimateRecord
from reference_engine.solar_time import (
    is_night_fixed_period,
    is_night_solar_geometry,
    month_from_day_of_year,
    sunrise_sunset_utc,
)
from reference_engine.tariff import TariffError, annual_tariff_cost


def climate(
    temperature: float,
    weight: float,
    month: int,
) -> ClimateRecord:
    return ClimateRecord(1, 0.0, month, temperature, weight)


class GroundTemperatureTests(unittest.TestCase):
    def test_surface_gradient(self) -> None:
        result = ground_temperature_from_surface_gradient(15.0, 0.03, 20.0, 0.0, 20.0)
        self.assertAlmostEqual(result.ground_temperature_c, 15.6)
        self.assertEqual(result.trace["equation"], "T_z = T_s + g * z")
        self.assertFalse(result.warnings)

    def test_surface_borehole_interpolation_and_extrapolation_warning(self) -> None:
        result = ground_temperature_from_interpolation(
            10.0, 16.0, 20.0, 30.0, 0.0, 20.0, True, 1e-12
        )
        self.assertAlmostEqual(result.ground_temperature_c, 19.0)
        self.assertAlmostEqual(result.gradient_c_per_m, 0.3)
        self.assertTrue(result.extrapolated)
        self.assertTrue(result.warnings)

    def test_extrapolation_can_be_stopped(self) -> None:
        with self.assertRaises(GroundTemperatureError):
            ground_temperature_from_interpolation(
                10.0, 16.0, 20.0, 30.0, 0.0, 20.0, False, 1e-12
            )

    def test_direct_mode_rejects_non_finite_value(self) -> None:
        with self.assertRaises(GroundTemperatureError):
            direct_ground_temperature(math.nan)


class DegreeHourTests(unittest.TestCase):
    def setUp(self) -> None:
        self.records = [
            climate(10.0, 2.0, 1),
            climate(26.0, 3.0, 2),
        ]

    def test_weighted_degree_hours(self) -> None:
        result = weighted_degree_hours(self.records, 12.0, 24.0)
        self.assertEqual(result, {"heating": 4.0, "cooling": 6.0})

    def test_load_allocation_preserves_annual_total(self) -> None:
        loads = allocate_annual_load(
            self.records, 100.0, 12.0, "heating", "error", 1e-12
        )
        self.assertAlmostEqual(sum(loads), 100.0)
        self.assertEqual(loads[1], 0.0)

    def test_zero_degree_hour_policies(self) -> None:
        with self.assertRaises(DegreeHourError):
            allocate_annual_load(
                self.records, 10.0, -20.0, "heating", "error", 1e-12
            )
        discarded = allocate_annual_load(
            self.records,
            10.0,
            -20.0,
            "heating",
            "discard_with_warning",
            1e-12,
        )
        self.assertEqual(discarded, [0.0, 0.0])
        uniform = allocate_annual_load(
            self.records, 10.0, -20.0, "heating", "uniform", 1e-12
        )
        self.assertEqual(uniform, [4.0, 6.0])

    def test_climate_validation_and_aggregation(self) -> None:
        warnings = validate_climate_records(self.records, 8760.0, 1e-12)
        self.assertEqual(len(warnings), 1)
        aggregate = aggregate_values(self.records, [4.0, 6.0], [True, False])
        self.assertEqual(aggregate["annual"], 10.0)
        self.assertEqual(aggregate["selected_period"], 4.0)
        self.assertEqual(aggregate["monthly"]["2"], 6.0)
        self.assertEqual(aggregate["monthly_selected_period"]["1"], 4.0)


class CopTests(unittest.TestCase):
    def calculate(self, mode: str, source: float, **overrides: object):
        parameters = {
            "heating_supply_temperature_c": 40.0,
            "cooling_supply_temperature_c": 7.0,
            "approach_temperature_k": 5.0,
            "empirical_carnot_efficiency": 0.35,
            "kelvin_offset": 273.15,
            "minimum_cop": 0.1,
            "maximum_cop": 20.0,
            "invalid_cop_policy": "stop",
            "absolute_tolerance": 1e-12,
        }
        parameters.update(overrides)
        return scaled_carnot_cop(mode, source, **parameters)

    def test_scaled_carnot_heating_and_cooling(self) -> None:
        heating = self.calculate("heating", 20.0)
        cooling = self.calculate("cooling", 20.0)
        self.assertAlmostEqual(heating.value, 0.35 * 318.15 / 30.0)
        self.assertAlmostEqual(cooling.value, 0.35 * 275.15 / 23.0)

    def test_bound_policy_is_explicit(self) -> None:
        clipped = self.calculate(
            "heating", 39.0, maximum_cop=5.0, invalid_cop_policy="clip"
        )
        self.assertEqual(clipped.value, 5.0)
        self.assertTrue(clipped.clipped)

    def test_invalid_and_zero_denominator(self) -> None:
        ignored = self.calculate("cooling", -10.0, invalid_cop_policy="ignore")
        self.assertIsNone(ignored.value)
        with self.assertRaises(CopError):
            self.calculate("cooling", -3.0)

    def test_model_registry_switches_formula(self) -> None:
        parameters = {
            "model_id": "constant",
            "constant_heating_cop": 4.2,
            "constant_cooling_cop": 3.8,
            "minimum_cop": 0.1,
            "maximum_cop": 20.0,
            "invalid_cop_policy": "stop",
        }
        self.assertEqual(calculate_cop("heating", 10.0, parameters, 1e-12).value, 4.2)
        parameters.update(
            {
                "model_id": "linear_source_temperature",
                "linear_heating_intercept": 2.0,
                "linear_heating_slope_per_c": 0.1,
                "linear_cooling_intercept": 5.0,
                "linear_cooling_slope_per_c": -0.05,
            }
        )
        self.assertEqual(calculate_cop("heating", 10.0, parameters, 1e-12).value, 3.0)
        self.assertEqual(calculate_cop("cooling", 20.0, parameters, 1e-12).value, 4.0)


class ElectricityTests(unittest.TestCase):
    def test_compressor_auxiliary_and_performance_factor(self) -> None:
        compressor, invalid_count = compressor_electricity(
            [10.0, 20.0], [2.0, 4.0], "stop", 1e-12
        )
        self.assertEqual(compressor, [5.0, 5.0])
        self.assertEqual(invalid_count, 0)
        system = add_auxiliary_electricity(
            compressor, [1.0, 3.0], 0.1, 0.2, 0.0, 4.0, 1e-12
        )
        self.assertEqual(system, [7.5, 9.5])
        self.assertAlmostEqual(performance_factor(30.0, sum(system), 1e-12), 30 / 17)

    def test_active_load_rejects_invalid_cop(self) -> None:
        with self.assertRaises(ElectricityError):
            compressor_electricity([1.0], [None], "stop", 1e-12)
        values, invalid = compressor_electricity([0.0], [None], "stop", 1e-12)
        self.assertEqual(values, [0.0])
        self.assertEqual(invalid, 0)


class EconomicsTests(unittest.TestCase):
    def test_energy_cost_payback_and_lifecycle(self) -> None:
        self.assertEqual(annual_energy_cost(1000.0, 0.3), 300.0)
        self.assertEqual(simple_payback_years(5000.0, 500.0, 1e-12), 10.0)
        self.assertIsNone(simple_payback_years(5000.0, 0.0, 1e-12))
        self.assertEqual(lifecycle_cost(1000, 100, 10, 2, 0, 0, [], 0), 1220)

    def test_comparison_includes_replacements_and_npv(self) -> None:
        result = compare_lifecycle_costs(
            12000,
            8000,
            300,
            500,
            50,
            50,
            10,
            0.0,
            0.0,
            [],
            [{"year": 5, "cost": 2000}],
            0,
            0,
            1e-12,
        )
        self.assertEqual(result["incremental_installed_cost"], 4000)
        self.assertEqual(result["annual_operating_cost_saving"], 200)
        self.assertEqual(result["simple_payback_years"], 20)
        self.assertEqual(result["npv_of_gshp_choice"], 0)


class TariffTests(unittest.TestCase):
    def test_single_and_selected_period_two_rate(self) -> None:
        single = annual_tariff_cost(
            1000,
            400,
            {
                "mode": "single",
                "single_price_per_kwh": 0.3,
                "fixed_daily_charge": 1.0,
                "annual_fixed_charge": 10.0,
            },
            365,
            1e-12,
        )
        self.assertEqual(single["energy_charge"], 300)
        self.assertEqual(single["fixed_charge"], 375)
        self.assertEqual(single["total_cost"], 675)
        two_rate = annual_tariff_cost(
            1000,
            400,
            {
                "mode": "selected_period_two_rate",
                "selected_period_price_per_kwh": 0.2,
                "other_period_price_per_kwh": 0.4,
                "fixed_daily_charge": 0.0,
                "annual_fixed_charge": 0.0,
            },
            365,
            1e-12,
        )
        self.assertEqual(two_rate["total_cost"], 320)

    def test_selected_energy_cannot_exceed_annual(self) -> None:
        with self.assertRaises(TariffError):
            annual_tariff_cost(
                10,
                11,
                {
                    "mode": "single",
                    "single_price_per_kwh": 0.3,
                    "fixed_daily_charge": 0.0,
                    "annual_fixed_charge": 0.0,
                },
                365,
                1e-12,
            )


class SolarTimeTests(unittest.TestCase):
    def test_month_and_solar_geometry(self) -> None:
        self.assertEqual(month_from_day_of_year(32, 2023), 2)
        sunrise, sunset = sunrise_sunset_utc(
            0.0, 150.0, 1, 23.45, 284.0, 365.0, 15.0, 12.0, -1.0, 1.0
        )
        self.assertAlmostEqual(sunrise, -4.0)
        self.assertAlmostEqual(sunset, 8.0)
        self.assertTrue(is_night_solar_geometry(7.0, sunrise, sunset, 2.0, 2.0, 24.0))
        self.assertFalse(is_night_solar_geometry(0.0, sunrise, sunset, 2.0, 2.0, 24.0))

    def test_fixed_night_period(self) -> None:
        self.assertTrue(is_night_fixed_period(12.0, 18.0, 8.0, 10.0, 24.0))
        self.assertFalse(is_night_fixed_period(1.0, 18.0, 8.0, 10.0, 24.0))

    def test_analysis_period_modes_are_parameter_driven(self) -> None:
        records = [ClimateRecord(1, 0.0, 1, 20.0, 1.0)]
        base = {
            "enabled": True,
            "label": "User label",
            "mode": "all_hours",
            "hours_before_sunset": 2.0,
            "hours_after_sunrise": 2.0,
            "solar_declination_amplitude_deg": 23.45,
            "day_phase_offset": 284.0,
            "longitude_degrees_per_hour": 15.0,
            "hours_per_day": 24.0,
            "solar_noon_hour_utc_at_zero_longitude": 12.0,
            "minimum_cosine_hour_angle": -1.0,
            "maximum_cosine_hour_angle": 1.0,
            "fixed_start_local_hour": 18.0,
            "fixed_end_local_hour": 8.0,
            "fixed_utc_offset_hours": 10.0,
        }
        self.assertEqual(
            analysis_period_flags(records, 0.0, 150.0, base, {"days_per_year": 365}),
            [True],
        )
        base["enabled"] = False
        self.assertEqual(
            analysis_period_flags(records, 0.0, 150.0, base, {"days_per_year": 365}),
            [False],
        )


if __name__ == "__main__":
    unittest.main()
