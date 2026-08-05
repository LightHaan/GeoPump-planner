export type GroundMode =
  | "surface_gradient"
  | "surface_borehole_interpolation"
  | "direct";
export type ZeroDegreeHourPolicy =
  | "error"
  | "uniform"
  | "discard_with_warning";
export type AnalysisPeriodMode =
  | "solar_geometry"
  | "fixed_local_time"
  | "all_hours";
export type CopModelId =
  | "scaled_carnot"
  | "constant"
  | "linear_source_temperature";
export type InvalidCopPolicy = "stop" | "clip" | "ignore";
export type TariffMode = "single" | "selected_period_two_rate";

export interface GroundParameters {
  mode: GroundMode;
  surface_dataset_id: "air_t" | "surface_t";
  reference_depth_m: number;
  target_depth_m: number;
  minimum_depth_m: number;
  shallow_warning_depth_m: number;
  allow_extrapolation_below_borehole: boolean;
}

export interface LoadParameters {
  heating_balance_temperature_c: number;
  cooling_balance_temperature_c: number;
  conditioned_floor_area_m2: number;
  building_count: number;
  load_scaling_factor: number;
  occupancy_use_factor: number;
  zero_degree_hour_policy: ZeroDegreeHourPolicy;
}

export interface TimeParameters {
  base_year: number;
  days_per_year: number;
  stored_air_temperature_scale_divisor: number;
  representative_record_weight_hours: number;
  expected_annual_weight_hours: number;
  season_months: Record<string, number[]>;
}

export interface AnalysisPeriodParameters {
  enabled: boolean;
  label: string;
  mode: AnalysisPeriodMode;
  hours_before_sunset: number;
  hours_after_sunrise: number;
  solar_declination_amplitude_deg: number;
  day_phase_offset: number;
  longitude_degrees_per_hour: number;
  hours_per_day: number;
  solar_noon_hour_utc_at_zero_longitude: number;
  minimum_cosine_hour_angle: number;
  maximum_cosine_hour_angle: number;
  fixed_start_local_hour: number;
  fixed_end_local_hour: number;
  fixed_utc_offset_hours: number;
}

export interface CopModelParameters {
  model_id: CopModelId;
  heating_supply_temperature_c: number;
  cooling_supply_temperature_c: number;
  approach_temperature_k: number;
  empirical_carnot_efficiency: number;
  kelvin_offset: number;
  constant_heating_cop: number;
  constant_cooling_cop: number;
  linear_heating_intercept: number;
  linear_heating_slope_per_c: number;
  linear_cooling_intercept: number;
  linear_cooling_slope_per_c: number;
  minimum_cop: number;
  maximum_cop: number;
  invalid_cop_policy: InvalidCopPolicy;
}

export interface AuxiliaryElectricityParameters {
  pump_fraction_of_compressor: number;
  fan_fraction_of_compressor: number;
  misc_fraction_of_compressor: number;
  fixed_auxiliary_kwh_per_year: number;
}

export interface TariffParameters {
  mode: TariffMode;
  currency: string;
  single_price_per_kwh: number | null;
  selected_period_price_per_kwh: number | null;
  other_period_price_per_kwh: number | null;
  fixed_daily_charge: number;
  annual_fixed_charge: number;
}

export interface Replacement {
  year: number;
  cost: number;
}

export interface EconomicsParameters {
  gshp_installed_cost: number | null;
  ashp_installed_cost: number | null;
  gshp_annual_maintenance_cost: number;
  ashp_annual_maintenance_cost: number;
  analysis_period_years: number;
  discount_rate_fraction: number;
  electricity_price_escalation_fraction: number;
  gshp_residual_value: number;
  ashp_residual_value: number;
  gshp_replacements: Replacement[];
  ashp_replacements: Replacement[];
}

export interface DecisionParameters {
  minimum_technical_saving_fraction: number;
  maximum_acceptable_payback_years: number;
  npv_threshold: number;
  delta_t20_ebk_prediction_se_good_max_c: number;
  delta_t20_ebk_prediction_se_moderate_max_c: number;
  nearest_borehole_good_max_km: number;
  nearest_borehole_moderate_max_km: number;
  minimum_certificate_count: number;
}

export interface NumericalParameters {
  absolute_tolerance: number;
  relative_tolerance: number;
  cop_regression_relative_tolerance: number;
  electricity_regression_relative_tolerance: number;
  cost_regression_relative_tolerance: number;
}

export interface MonteCarloParameters {
  default_simulations: number;
  random_seed: number;
}

export interface ScenarioParameters {
  schema_version: string;
  preset_id: string;
  preset_label: string;
  ground: GroundParameters;
  load: LoadParameters;
  time: TimeParameters;
  analysis_period: AnalysisPeriodParameters;
  cop: {
    gshp: CopModelParameters;
    ashp: CopModelParameters;
  };
  electricity: {
    gshp: AuxiliaryElectricityParameters;
    ashp: AuxiliaryElectricityParameters;
  };
  tariff: TariffParameters;
  economics: EconomicsParameters;
  decision: DecisionParameters;
  numerical: NumericalParameters;
  monte_carlo: MonteCarloParameters;
}
