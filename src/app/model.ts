import { evaluateDecision, type DecisionResult } from "../engine/decision";
import {
  directGroundTemperature,
  groundTemperatureFromInterpolation,
  groundTemperatureFromSurfaceGradient,
} from "../engine/ground-temperature";
import { runScenario } from "../engine/scenario";
import type {
  ClimateRecord,
  GroundTemperatureResult,
  ScenarioResult,
} from "../engine/types";
import type { ScenarioParameters } from "../parameters/types";
import { clonePaperDefaults } from "../parameters/defaults";
import { getParameterValue, PARAMETER_REGISTRY } from "../parameters/definitions";
import { validateScenarioParameters } from "../parameters/validation";
import type {
  PostcodeAttributes,
  SurfaceDatasetId,
} from "../data/postcode";

export interface PostcodeModelInputs {
  surfaceTemperatureC: number | null;
  gradientCPerM: number | null;
  boreholeTemperatureC: number | null;
  boreholeDepthM: number | null;
  directGroundTemperatureC: number | null;
  annualHeatingKwhM2: number | null;
  annualCoolingKwhM2: number | null;
}

export interface PostcodeScenarioOutcome {
  ground: GroundTemperatureResult;
  scenario: ScenarioResult;
  decision: DecisionResult;
}

function dataset(attributes: PostcodeAttributes, id: SurfaceDatasetId) {
  return attributes.ground[id];
}

export function inputsFromAttributes(
  attributes: PostcodeAttributes,
  datasetId: SurfaceDatasetId,
): PostcodeModelInputs {
  const ground = dataset(attributes, datasetId);
  return {
    surfaceTemperatureC: ground.surface_temp_c,
    gradientCPerM: ground.gradient_c_per_m,
    boreholeTemperatureC: null,
    boreholeDepthM: null,
    directGroundTemperatureC: ground.ground_temp_at_reference_depth_c,
    annualHeatingKwhM2: attributes.load.annual_heating_kwh_m2,
    annualCoolingKwhM2: attributes.load.annual_cooling_kwh_m2,
  };
}

export function groundInputsForDataset(
  inputs: PostcodeModelInputs,
  attributes: PostcodeAttributes,
  datasetId: SurfaceDatasetId,
): PostcodeModelInputs {
  const ground = dataset(attributes, datasetId);
  return {
    ...inputs,
    surfaceTemperatureC: ground.surface_temp_c,
    gradientCPerM: ground.gradient_c_per_m,
    directGroundTemperatureC: ground.ground_temp_at_reference_depth_c,
  };
}

function required(value: number | null, label: string): number {
  if (value === null || !Number.isFinite(value)) {
    throw new Error(`Enter a valid value for ${label}.`);
  }
  return value;
}

export function calculateGroundTemperature(
  inputs: PostcodeModelInputs,
  parameters: ScenarioParameters,
): GroundTemperatureResult {
  const ground = parameters.ground;
  if (ground.mode === "direct") {
    return directGroundTemperature(required(inputs.directGroundTemperatureC, "ground temperature"));
  }
  if (ground.mode === "surface_borehole_interpolation") {
    return groundTemperatureFromInterpolation(
      required(inputs.surfaceTemperatureC, "surface temperature"),
      required(inputs.boreholeTemperatureC, "borehole temperature"),
      required(inputs.boreholeDepthM, "borehole measurement depth"),
      ground.target_depth_m,
      ground.minimum_depth_m,
      ground.shallow_warning_depth_m,
      ground.allow_extrapolation_below_borehole,
      parameters.numerical.absolute_tolerance,
    );
  }
  return groundTemperatureFromSurfaceGradient(
    required(inputs.surfaceTemperatureC, "surface temperature"),
    required(inputs.gradientCPerM, "estimated underground warming rate"),
    ground.target_depth_m,
    ground.minimum_depth_m,
    ground.shallow_warning_depth_m,
  );
}

export function calculatePostcodeOutcome(
  postcode: string,
  attributes: PostcodeAttributes,
  climate: readonly ClimateRecord[],
  inputs: PostcodeModelInputs,
  parameters: ScenarioParameters,
): PostcodeScenarioOutcome {
  const ground = calculateGroundTemperature(inputs, parameters);
  const scenario = runScenario(
    {
      postcode,
      records: climate,
      latitudeDeg: attributes.location.lat,
      longitudeDeg: attributes.location.lon,
      groundTemperatureC: ground.groundTemperatureC,
      annualHeatingKwhM2: required(inputs.annualHeatingKwhM2, "annual heating load"),
      annualCoolingKwhM2: required(inputs.annualCoolingKwhM2, "annual cooling load"),
    },
    parameters,
  );
  const decision = evaluateDecision(
    scenario.comparison.relativeElectricitySavingFraction,
    scenario.economics,
    {
      surfaceDatasetId: parameters.ground.surface_dataset_id,
      deltaT20EbkPredictionSeC:
        attributes.ground.uncertainty.delta_t20_ebk_prediction_se_c,
      nearestBoreholeKm: attributes.ground.nearest_borehole_km,
      certificateCount: attributes.load.certificate_count,
    },
    parameters.decision,
  );
  return { ground, scenario, decision };
}

export interface ScenarioExportDocument {
  schemaVersion: "1.0.0";
  exportedAt: string;
  postcode: string;
  sourceSnapshot: PostcodeAttributes;
  inputs: PostcodeModelInputs;
  parameters: ScenarioParameters;
  outcome: PostcodeScenarioOutcome;
}

export function createScenarioExport(
  postcode: string,
  attributes: PostcodeAttributes,
  inputs: PostcodeModelInputs,
  parameters: ScenarioParameters,
  outcome: PostcodeScenarioOutcome,
  exportedAt = new Date().toISOString(),
): ScenarioExportDocument {
  return {
    schemaVersion: "1.0.0",
    exportedAt,
    postcode,
    sourceSnapshot: structuredClone(attributes),
    inputs: structuredClone(inputs),
    parameters: structuredClone(parameters),
    outcome: structuredClone(outcome),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertParameterShape(template: unknown, candidate: unknown, path: string): void {
  if (template === null) {
    if (candidate !== null && (typeof candidate !== "number" || !Number.isFinite(candidate))) {
      throw new Error(`${path} must be null or a finite number.`);
    }
    return;
  }
  if (Array.isArray(template)) {
    if (!Array.isArray(candidate)) throw new Error(`${path} must be an array.`);
    if (path.endsWith("_replacements")) {
      for (const [index, replacement] of candidate.entries()) {
        if (
          !isRecord(replacement) ||
          typeof replacement.year !== "number" ||
          !Number.isFinite(replacement.year) ||
          typeof replacement.cost !== "number" ||
          !Number.isFinite(replacement.cost)
        ) {
          throw new Error(`${path}[${index}] must contain finite year and cost values.`);
        }
      }
    } else if (candidate.some((item) => typeof item !== "number" || !Number.isFinite(item))) {
      throw new Error(`${path} must contain only finite numbers.`);
    }
    return;
  }
  if (isRecord(template)) {
    if (!isRecord(candidate)) throw new Error(`${path || "parameters"} must be an object.`);
    for (const [key, childTemplate] of Object.entries(template)) {
      if (!(key in candidate)) throw new Error(`Missing scenario parameter: ${path ? `${path}.` : ""}${key}.`);
      assertParameterShape(childTemplate, candidate[key], path ? `${path}.${key}` : key);
    }
    return;
  }
  if (typeof candidate !== typeof template) {
    throw new Error(`${path} must be a ${typeof template}.`);
  }
  if (typeof candidate === "number" && !Number.isFinite(candidate)) {
    throw new Error(`${path} must be a finite number.`);
  }
}

function assertModelInputs(value: unknown): asserts value is PostcodeModelInputs {
  if (!isRecord(value)) throw new Error("Scenario inputs must be an object.");
  const keys: Array<keyof PostcodeModelInputs> = [
    "surfaceTemperatureC",
    "gradientCPerM",
    "boreholeTemperatureC",
    "boreholeDepthM",
    "directGroundTemperatureC",
    "annualHeatingKwhM2",
    "annualCoolingKwhM2",
  ];
  for (const key of keys) {
    const candidate = value[key];
    if (candidate !== null && (typeof candidate !== "number" || !Number.isFinite(candidate))) {
      throw new Error(`inputs.${key} must be null or a finite number.`);
    }
  }
}

export function parseScenarioImport(text: string): ScenarioExportDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("The selected file is not valid JSON.");
  }
  if (!isRecord(parsed)) throw new Error("The imported scenario must be a JSON object.");
  if (parsed.schemaVersion !== "1.0.0") {
    throw new Error(`Unsupported scenario schema: ${String(parsed.schemaVersion)}.`);
  }
  if (typeof parsed.postcode !== "string" || !/^\d{4}$/.test(parsed.postcode)) {
    throw new Error("The imported scenario must contain a four-digit postcode.");
  }
  assertModelInputs(parsed.inputs);
  const defaults = clonePaperDefaults();
  assertParameterShape(defaults, parsed.parameters, "");
  const parameters = parsed.parameters as ScenarioParameters;
  const parameterErrors = validateScenarioParameters(parameters).filter(
    (issue) => issue.severity === "error",
  );
  if (parameterErrors.length > 0) {
    throw new Error(
      `The imported scenario contains invalid parameters: ${parameterErrors
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join("; ")}`,
    );
  }
  if (!isRecord(parsed.sourceSnapshot) || !isRecord(parsed.outcome)) {
    throw new Error("The imported scenario is incomplete (source snapshot or outcome missing)." );
  }
  return structuredClone(parsed) as unknown as ScenarioExportDocument;
}

function csvCell(value: string | number | null): string {
  if (value === null || (typeof value === "number" && !Number.isFinite(value))) return "";
  let text = String(value);
  if (typeof value === "string" && /^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function createResultsCsv(
  postcode: string,
  outcome: PostcodeScenarioOutcome,
  currency: string,
): string {
  const rows: Array<[string, string, string, string, number | null, string]> = [];
  const add = (
    scope: string,
    period: string,
    metric: string,
    system: string,
    value: number | null,
    unit: string,
  ) => rows.push([scope, period, metric, system, value, unit]);
  const { scenario, ground } = outcome;
  add("summary", "annual", "ground_temperature", "GSHP", ground.groundTemperatureC, "degC");
  add("summary", "annual", "allocated_heating_load", "both", scenario.loads.heating.annual, "kWh");
  add("summary", "annual", "allocated_cooling_load", "both", scenario.loads.cooling.annual, "kWh");
  add("summary", "annual", "system_electricity", "GSHP", scenario.gshp.systemElectricity.annual, "kWh");
  add("summary", "annual", "system_electricity", "ASHP", scenario.ashp.systemElectricity.annual, "kWh");
  add("summary", "annual", "annual_performance_factor", "GSHP", scenario.gshp.annualPerformanceFactor, "ratio");
  add("summary", "annual", "annual_performance_factor", "ASHP", scenario.ashp.annualPerformanceFactor, "ratio");
  add("summary", "annual", "electricity_saving", "GSHP_vs_ASHP", scenario.comparison.annualElectricitySavingKwh, "kWh");
  add("summary", "annual", "relative_electricity_saving", "GSHP_vs_ASHP", scenario.comparison.relativeElectricitySavingFraction, "fraction");
  add("economics", "annual", "energy_cost", "GSHP", scenario.comparison.gshpAnnualEnergyCost, currency);
  add("economics", "annual", "energy_cost", "ASHP", scenario.comparison.ashpAnnualEnergyCost, currency);
  add("economics", "lifecycle", "npv_of_gshp_choice", "GSHP_vs_ASHP", scenario.economics.npvOfGshpChoice, currency);
  add("economics", "lifecycle", "simple_payback", "GSHP_vs_ASHP", scenario.economics.simplePaybackYears, "years");
  for (let month = 1; month <= 12; month += 1) {
    const key = String(month);
    add("monthly", key, "heating_load", "both", scenario.loads.heating.monthly[key] ?? 0, "kWh");
    add("monthly", key, "cooling_load", "both", scenario.loads.cooling.monthly[key] ?? 0, "kWh");
    add("monthly", key, "system_electricity", "GSHP", scenario.gshp.systemElectricity.monthly[key] ?? 0, "kWh");
    add("monthly", key, "system_electricity", "ASHP", scenario.ashp.systemElectricity.monthly[key] ?? 0, "kWh");
  }
  const header = ["postcode", "scope", "period", "metric", "system", "value", "unit"];
  return [
    header.map(csvCell).join(","),
    ...rows.map((row) => [postcode, ...row].map(csvCell).join(",")),
  ].join("\r\n");
}

function equal(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function listScenarioOverrides(
  attributes: PostcodeAttributes,
  inputs: PostcodeModelInputs,
  parameters: ScenarioParameters,
): string[] {
  const overrides: string[] = [];
  const defaultInputs = inputsFromAttributes(attributes, parameters.ground.surface_dataset_id);
  const inputLabels: Record<keyof PostcodeModelInputs, string> = {
    surfaceTemperatureC: "Surface temperature",
    gradientCPerM: "Estimated underground warming rate",
    boreholeTemperatureC: "Borehole temperature",
    boreholeDepthM: "Borehole measurement depth",
    directGroundTemperatureC: "Direct ground temperature",
    annualHeatingKwhM2: "Certificate annual heating load",
    annualCoolingKwhM2: "Certificate annual cooling load",
  };
  for (const key of Object.keys(inputLabels) as Array<keyof PostcodeModelInputs>) {
    if (!equal(inputs[key], defaultInputs[key])) overrides.push(`Input: ${inputLabels[key]}`);
  }
  const defaults = clonePaperDefaults();
  for (const definition of PARAMETER_REGISTRY) {
    if (!equal(
      getParameterValue(parameters, definition.path),
      getParameterValue(defaults, definition.path),
    )) {
      overrides.push(`Parameter: ${definition.path}`);
    }
  }
  return overrides;
}
