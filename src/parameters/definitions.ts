import { PAPER_DEFAULTS } from "./defaults";

export type ParameterValueType =
  | "number"
  | "nullable_number"
  | "string"
  | "boolean"
  | "number_array"
  | "replacement_schedule";

export type ParameterUiTier = "basic" | "advanced" | "equation_constant";

export interface ParameterDefinition {
  id: string;
  path: string;
  group: string;
  section: string;
  label: string;
  symbol: string | null;
  description: string;
  valueType: ParameterValueType;
  defaultValue: unknown;
  unit: string | null;
  options: readonly string[] | null;
  recommendedMin: number | null;
  recommendedMax: number | null;
  hardMin: number | null;
  hardMax: number | null;
  step: number | null;
  editable: true;
  advanced: boolean;
  uiTier: ParameterUiTier;
  equationRefs: readonly string[];
  source: string;
}

export const NON_EDITABLE_PRESET_METADATA = new Set([
  "schema_version",
  "preset_id",
  "preset_label",
]);

const NULLABLE_NUMBER_PATHS = new Set([
  "tariff.single_price_per_kwh",
  "tariff.selected_period_price_per_kwh",
  "tariff.other_period_price_per_kwh",
  "economics.gshp_installed_cost",
  "economics.ashp_installed_cost",
]);

const REPLACEMENT_PATHS = new Set([
  "economics.gshp_replacements",
  "economics.ashp_replacements",
]);

const ENUM_OPTIONS: Record<string, readonly string[]> = {
  "ground.mode": ["surface_gradient", "surface_borehole_interpolation", "direct"],
  "ground.surface_dataset_id": ["air_t", "surface_t"],
  "load.zero_degree_hour_policy": ["discard_with_warning", "error", "uniform"],
  "analysis_period.mode": ["solar_geometry", "fixed_local_time", "all_hours"],
  "cop.gshp.model_id": [
    "scaled_carnot",
    "constant",
    "linear_source_temperature",
  ],
  "cop.ashp.model_id": [
    "scaled_carnot",
    "constant",
    "linear_source_temperature",
  ],
  "cop.gshp.invalid_cop_policy": ["stop", "clip", "ignore"],
  "cop.ashp.invalid_cop_policy": ["stop", "clip", "ignore"],
  "tariff.mode": ["single", "selected_period_two_rate"],
};

const RECOMMENDED_RANGES: Record<string, readonly [number, number]> = {
  "cop.gshp.empirical_carnot_efficiency": [0.1, 0.6],
  "cop.ashp.empirical_carnot_efficiency": [0.1, 0.6],
};

const BASIC_PATHS = new Set([
  "ground.mode",
  "ground.surface_dataset_id",
  "ground.target_depth_m",
  "load.conditioned_floor_area_m2",
  "load.building_count",
  "cop.gshp.model_id",
  "cop.ashp.model_id",
  "tariff.mode",
  "tariff.currency",
  "tariff.single_price_per_kwh",
  "economics.gshp_installed_cost",
  "economics.ashp_installed_cost",
]);

const EQUATION_CONSTANT_PREFIXES = ["time.", "numerical."];
const EQUATION_CONSTANT_PATHS = new Set([
  "analysis_period.solar_declination_amplitude_deg",
  "analysis_period.day_phase_offset",
  "analysis_period.longitude_degrees_per_hour",
  "analysis_period.hours_per_day",
  "analysis_period.solar_noon_hour_utc_at_zero_longitude",
  "analysis_period.minimum_cosine_hour_angle",
  "analysis_period.maximum_cosine_hour_angle",
  "cop.gshp.kelvin_offset",
  "cop.ashp.kelvin_offset",
]);

const SYMBOLS: Record<string, string> = {
  "load.heating_balance_temperature_c": "T_base,h",
  "load.cooling_balance_temperature_c": "T_base,c",
  "cop.gshp.heating_supply_temperature_c": "T_supply,h,GSHP",
  "cop.gshp.cooling_supply_temperature_c": "T_supply,c,GSHP",
  "cop.ashp.heating_supply_temperature_c": "T_supply,h,ASHP",
  "cop.ashp.cooling_supply_temperature_c": "T_supply,c,ASHP",
  "cop.gshp.empirical_carnot_efficiency": "eta_Carnot,GSHP",
  "cop.ashp.empirical_carnot_efficiency": "eta_Carnot,ASHP",
};

const SOURCE_OVERRIDES: Record<string, string> = {
  "decision.delta_t20_ebk_prediction_se_good_max_c": "project_decision_default",
  "decision.delta_t20_ebk_prediction_se_moderate_max_c": "project_decision_default",
  "decision.nearest_borehole_good_max_km": "project_decision_default",
  "decision.nearest_borehole_moderate_max_km": "project_decision_default",
  "decision.minimum_certificate_count": "project_decision_default",
  "monte_carlo.random_seed": "project_reproducibility_default",
};

function uiTier(path: string): ParameterUiTier {
  if (BASIC_PATHS.has(path)) return "basic";
  if (
    EQUATION_CONSTANT_PATHS.has(path) ||
    EQUATION_CONSTANT_PREFIXES.some((prefix) => path.startsWith(prefix))
  ) {
    return "equation_constant";
  }
  return "advanced";
}

function equationRefs(path: string): readonly string[] {
  const section = path.split(".")[0];
  if (section === "ground") return ["ground_temperature"];
  if (section === "load") return ["degree_hours", "annual_load_allocation"];
  if (section === "time" || section === "analysis_period") {
    return ["analysis_period_membership", "seasonal_aggregation"];
  }
  if (section === "cop") return ["heating_COP", "cooling_COP"];
  if (section === "electricity") return ["system_electricity", "performance_factor"];
  if (section === "tariff") return ["annual_tariff_cost"];
  if (section === "economics") return ["simple_payback", "lifecycle_cost", "NPV"];
  if (section === "decision") return ["decision_output"];
  if (section === "numerical") return ["numeric_validation"];
  if (section === "monte_carlo") return ["monte_carlo"];
  return [];
}

function hardRange(path: string): readonly [number | null, number | null] {
  if (path.includes("temperature_c") || path.endsWith("_c")) return [-100, 100];
  if (
    path.includes("fixed_start_local_hour") ||
    path.includes("fixed_end_local_hour") ||
    path.includes("hours_before_sunset") ||
    path.includes("hours_after_sunrise") ||
    path.endsWith("hours_per_day")
  ) return [0, 24];
  if (path.includes("cosine_hour_angle")) return [-1, 1];
  if (path.includes("discount_rate_fraction") || path.includes("escalation_fraction")) {
    return [-1, null];
  }
  if (path.includes("fraction_of_compressor")) return [0, null];
  return [null, null];
}

function inputStep(path: string, value: unknown): number | null {
  if (typeof value !== "number") return null;
  if (path.includes("temperature") || path.endsWith("_c") || path.endsWith("_k")) return 0.1;
  if (path.endsWith("_fraction") || path.includes("efficiency")) return 0.01;
  if (Number.isInteger(value)) return 1;
  return 0.01;
}

function humanize(path: string): string {
  const leaf = path.split(".").at(-1) ?? path;
  return leaf
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function inferUnit(path: string): string | null {
  if (path.endsWith("_c") || path.includes("temperature_c")) return "°C";
  if (path.endsWith("_k")) return "K";
  if (path.endsWith("_c_per_m")) return "°C/m";
  if (path.endsWith("_km")) return "km";
  if (path.endsWith("_m2")) return "m²";
  if (path.endsWith("_m")) return "m";
  if (path.includes("kwh_m2")) return "kWh/m²/year";
  if (path.includes("kwh_per_year")) return "kWh/year";
  if (path.endsWith("_per_kwh")) return "currency/kWh";
  if (path.endsWith("_hours") || path.endsWith("_hour")) return "h";
  if (path.endsWith("_years")) return "year";
  if (path.endsWith("_deg")) return "degree";
  if (path.endsWith("_fraction")) return "fraction";
  if (
    path.endsWith("_cost") ||
    path.endsWith("_charge") ||
    path.endsWith("_value")
  ) {
    return "currency";
  }
  return null;
}

function valueType(path: string, value: unknown): ParameterValueType {
  if (NULLABLE_NUMBER_PATHS.has(path)) return "nullable_number";
  if (REPLACEMENT_PATHS.has(path)) return "replacement_schedule";
  if (Array.isArray(value)) return "number_array";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return "string";
}

function visit(
  value: unknown,
  path: string,
  output: ParameterDefinition[],
): void {
  if (NON_EDITABLE_PRESET_METADATA.has(path)) return;
  if (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    for (const [key, child] of Object.entries(value)) {
      visit(child, path ? `${path}.${key}` : key, output);
    }
    return;
  }
  const range = RECOMMENDED_RANGES[path];
  const tier = uiTier(path);
  const hard = hardRange(path);
  const group = path.split(".")[0] ?? "general";
  output.push({
    id: path,
    path,
    group,
    section: group,
    label: humanize(path),
    symbol: SYMBOLS[path] ?? null,
    description: `${humanize(path)} is an editable scenario parameter used by ${equationRefs(path).join(", ") || "the calculation framework"}.`,
    valueType: valueType(path, value),
    defaultValue: structuredClone(value),
    unit: inferUnit(path),
    options: ENUM_OPTIONS[path] ?? null,
    recommendedMin: range?.[0] ?? null,
    recommendedMax: range?.[1] ?? null,
    hardMin: hard[0],
    hardMax: hard[1],
    step: inputStep(path, value),
    editable: true,
    advanced: tier !== "basic",
    uiTier: tier,
    equationRefs: equationRefs(path),
    source: SOURCE_OVERRIDES[path] ?? "paper_default_or_reference_code",
  });
}

export function buildParameterRegistry(): ParameterDefinition[] {
  const output: ParameterDefinition[] = [];
  visit(PAPER_DEFAULTS, "", output);
  return output;
}

export const PARAMETER_REGISTRY = buildParameterRegistry();

export function getParameterValue(root: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => {
    if (value === null || typeof value !== "object") return undefined;
    return (value as Record<string, unknown>)[key];
  }, root);
}

export function setParameterValue<T>(root: T, path: string, value: unknown): T {
  const clone = structuredClone(root);
  const keys = path.split(".");
  let target = clone as Record<string, unknown>;
  for (const key of keys.slice(0, -1)) {
    const child = target[key];
    if (child === null || typeof child !== "object" || Array.isArray(child)) {
      throw new Error(`Cannot set parameter path: ${path}`);
    }
    target = child as Record<string, unknown>;
  }
  const leaf = keys.at(-1);
  if (leaf === undefined || !(leaf in target)) {
    throw new Error(`Unknown parameter path: ${path}`);
  }
  target[leaf] = value;
  return clone;
}
