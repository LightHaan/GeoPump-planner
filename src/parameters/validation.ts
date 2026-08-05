import { getParameterValue, PARAMETER_REGISTRY } from "./definitions";
import type { ScenarioParameters } from "./types";

export interface ParameterValidationIssue {
  path: string;
  severity: "error" | "warning";
  message: string;
}

const STRICTLY_POSITIVE_PATHS = new Set([
  "time.days_per_year",
  "time.stored_air_temperature_scale_divisor",
  "time.representative_record_weight_hours",
  "time.expected_annual_weight_hours",
  "analysis_period.longitude_degrees_per_hour",
  "analysis_period.hours_per_day",
  "cop.gshp.empirical_carnot_efficiency",
  "cop.ashp.empirical_carnot_efficiency",
  "cop.gshp.minimum_cop",
  "cop.ashp.minimum_cop",
  "cop.gshp.maximum_cop",
  "cop.ashp.maximum_cop",
  "numerical.absolute_tolerance",
  "numerical.relative_tolerance",
  "numerical.cop_regression_relative_tolerance",
  "numerical.electricity_regression_relative_tolerance",
  "numerical.cost_regression_relative_tolerance",
  "monte_carlo.default_simulations",
]);

const NON_NEGATIVE_PATH_PARTS = [
  "depth_m",
  "floor_area_m2",
  "building_count",
  "load_scaling_factor",
  "occupancy_use_factor",
  "fraction_of_compressor",
  "fixed_auxiliary_kwh_per_year",
  "installed_cost",
  "maintenance_cost",
  "residual_value",
  "price_per_kwh",
  "fixed_daily_charge",
  "annual_fixed_charge",
  "maximum_acceptable_payback_years",
  "prediction_se_",
  "nearest_borehole_",
  "minimum_certificate_count",
];

function error(path: string, message: string): ParameterValidationIssue {
  return { path, severity: "error", message };
}

export function validateScenarioParameters(
  parameters: ScenarioParameters,
): ParameterValidationIssue[] {
  const issues: ParameterValidationIssue[] = [];
  for (const definition of PARAMETER_REGISTRY) {
    const value = getParameterValue(parameters, definition.path);
    if (
      definition.valueType === "number" &&
      (typeof value !== "number" || !Number.isFinite(value))
    ) {
      issues.push(error(definition.path, "Value must be a finite number."));
      continue;
    }
    if (
      definition.valueType === "nullable_number" &&
      value !== null &&
      (typeof value !== "number" || !Number.isFinite(value))
    ) {
      issues.push(error(definition.path, "Value must be null or a finite number."));
    }
    if (definition.options !== null && !definition.options.includes(String(value))) {
      issues.push(error(definition.path, "Value is not a registered option."));
    }
    if (typeof value === "number") {
      if (definition.hardMin !== null && value < definition.hardMin) {
        issues.push(error(definition.path, `Value is below the hard minimum (${definition.hardMin}).`));
      }
      if (definition.hardMax !== null && value > definition.hardMax) {
        issues.push(error(definition.path, `Value is above the hard maximum (${definition.hardMax}).`));
      }
      if (STRICTLY_POSITIVE_PATHS.has(definition.path) && value <= 0) {
        issues.push(error(definition.path, "Value must be greater than zero."));
      } else if (
        NON_NEGATIVE_PATH_PARTS.some((part) => definition.path.includes(part)) &&
        value < 0
      ) {
        issues.push(error(definition.path, "Value must be non-negative."));
      }
      if (
        definition.recommendedMin !== null &&
        value < definition.recommendedMin
      ) {
        issues.push({
          path: definition.path,
          severity: "warning",
          message: `Value is below the paper sensitivity range (${definition.recommendedMin}).`,
        });
      }
      if (
        definition.recommendedMax !== null &&
        value > definition.recommendedMax
      ) {
        issues.push({
          path: definition.path,
          severity: "warning",
          message: `Value is above the paper sensitivity range (${definition.recommendedMax}).`,
        });
      }
    }
  }
  for (const system of ["gshp", "ashp"] as const) {
    const cop = parameters.cop[system];
    if (cop.maximum_cop < cop.minimum_cop) {
      issues.push(
        error(`cop.${system}.maximum_cop`, "Maximum COP must not be below minimum COP."),
      );
    }
  }
  if (parameters.ground.target_depth_m < parameters.ground.minimum_depth_m) {
    issues.push(error("ground.target_depth_m", "Target depth is below the minimum depth."));
  }
  if (parameters.economics.discount_rate_fraction <= -1) {
    issues.push(error("economics.discount_rate_fraction", "Discount rate must exceed -1."));
  }
  if (parameters.economics.electricity_price_escalation_fraction <= -1) {
    issues.push(
      error(
        "economics.electricity_price_escalation_fraction",
        "Electricity-price escalation must exceed -1.",
      ),
    );
  }
  for (const [season, months] of Object.entries(parameters.time.season_months)) {
    if (
      months.length === 0 ||
      months.some((month) => !Number.isInteger(month) || month < 1 || month > 12)
    ) {
      issues.push(error(`time.season_months.${season}`, "Season months must be integers from 1 to 12."));
    }
  }
  return issues;
}

export function assertValidScenarioParameters(parameters: ScenarioParameters): void {
  const errors = validateScenarioParameters(parameters).filter(
    (issue) => issue.severity === "error",
  );
  if (errors.length > 0) {
    throw new Error(errors.map((issue) => `${issue.path}: ${issue.message}`).join("\n"));
  }
}
