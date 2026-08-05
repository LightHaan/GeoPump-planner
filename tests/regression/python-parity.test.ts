import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  fromReferenceClimateFixture,
  type ReferenceClimateRecord,
} from "../../src/data/climate";
import { runScenario } from "../../src/engine/scenario";
import type { ScenarioResult } from "../../src/engine/types";
import { clonePaperDefaults } from "../../src/parameters/defaults";

interface RegressionCaseInput {
  climate_fixture: string;
  ground_temperature_c: number;
  annual_heating_kwh_m2: number;
  annual_cooling_kwh_m2: number;
  latitude_deg: number;
  longitude_deg: number;
}

interface RegressionInputs {
  cases: Record<string, RegressionCaseInput>;
}

interface RegressionExpected {
  cases: Record<string, Record<string, MetricValue>>;
}

type MetricValue = number | null;

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function flatten(result: ScenarioResult): Record<string, MetricValue> {
  const output: Record<string, MetricValue> = {
    t20: result.groundTemperatureC,
    load_heat_annual: result.loads.heating.annual,
    load_cool_annual: result.loads.cooling.annual,
    load_total_annual: result.loads.totalAnnual,
    ashp_heat_all_annual: result.ashp.heatingCompressorElectricity.annual,
    gshp_heat_all_annual: result.gshp.heatingCompressorElectricity.annual,
    ashp_heat_night_annual: result.ashp.heatingCompressorElectricity.selectedPeriod,
    gshp_heat_night_annual: result.gshp.heatingCompressorElectricity.selectedPeriod,
    ashp_cool_all_annual: result.ashp.coolingCompressorElectricity.annual,
    gshp_cool_all_annual: result.gshp.coolingCompressorElectricity.annual,
    ashp_cool_night_annual: result.ashp.coolingCompressorElectricity.selectedPeriod,
    gshp_cool_night_annual: result.gshp.coolingCompressorElectricity.selectedPeriod,
    ashp_total_all_annual: result.ashp.systemElectricity.annual,
    ashp_total_night_annual: result.ashp.systemElectricity.selectedPeriod,
    gshp_total_all_annual: result.gshp.systemElectricity.annual,
    gshp_total_night_annual: result.gshp.systemElectricity.selectedPeriod,
    ashp_APF: result.ashp.annualPerformanceFactor,
    gshp_APF: result.gshp.annualPerformanceFactor,
  };
  for (const season of ["Spring", "Summer", "Autumn", "Winter"]) {
    const loads = result.loads.seasonal[season]!;
    output[`load_heat_${season}`] = loads.heating;
    output[`load_cool_${season}`] = loads.cooling;
    output[`load_total_${season}`] = loads.total;
    for (const systemId of ["ashp", "gshp"] as const) {
      const values = result[systemId].seasonal[season]!;
      output[`${systemId}_heat_all_${season}`] = values.heatingElectricity;
      output[`${systemId}_heat_night_${season}`] = values.heatingSelectedPeriodElectricity;
      output[`${systemId}_cool_all_${season}`] = values.coolingElectricity;
      output[`${systemId}_cool_night_${season}`] = values.coolingSelectedPeriodElectricity;
      output[`${systemId}_SPF_${season}`] = values.performanceFactor;
    }
  }
  return output;
}

function closeEnough(
  actual: number,
  expected: number,
  relativeTolerance: number,
  absoluteTolerance: number,
): boolean {
  return Math.abs(actual - expected) <= Math.max(
    absoluteTolerance,
    relativeTolerance * Math.max(Math.abs(actual), Math.abs(expected)),
  );
}

describe("TypeScript engine parity with frozen Python/paper regression fixtures", () => {
  it("matches all 700 metrics across ten representative postcodes", () => {
    const fixtureRoot = join(process.cwd(), "reference_engine", "fixtures");
    const inputs = loadJson<RegressionInputs>(join(fixtureRoot, "regression-inputs.json"));
    const expectedDocument = loadJson<RegressionExpected>(
      join(fixtureRoot, "expected-results.json"),
    );
    const parameters = clonePaperDefaults();
    const failures: string[] = [];
    let metricCount = 0;
    let maximumCopRelativeError = 0;
    let maximumElectricityRelativeError = 0;
    for (const [postcode, input] of Object.entries(inputs.cases)) {
      const climate = loadJson<ReferenceClimateRecord[]>(
        join(fixtureRoot, input.climate_fixture),
      );
      const actual = flatten(runScenario({
        postcode,
        records: fromReferenceClimateFixture(climate),
        latitudeDeg: input.latitude_deg,
        longitudeDeg: input.longitude_deg,
        groundTemperatureC: input.ground_temperature_c,
        annualHeatingKwhM2: input.annual_heating_kwh_m2,
        annualCoolingKwhM2: input.annual_cooling_kwh_m2,
      }, parameters));
      const expected = expectedDocument.cases[postcode]!;
      for (const [metric, expectedValue] of Object.entries(expected)) {
        metricCount += 1;
        const actualValue = actual[metric];
        if (actualValue === undefined || actualValue === null || expectedValue === null) {
          if (actualValue !== expectedValue) failures.push(`${postcode}.${metric}`);
          continue;
        }
        const relativeTolerance = metric.includes("APF") || metric.includes("SPF")
          ? parameters.numerical.cop_regression_relative_tolerance
          : parameters.numerical.electricity_regression_relative_tolerance;
        const relativeError = Math.abs(actualValue - expectedValue) /
          Math.max(Math.abs(expectedValue), parameters.numerical.absolute_tolerance);
        if (metric.includes("APF") || metric.includes("SPF")) {
          maximumCopRelativeError = Math.max(maximumCopRelativeError, relativeError);
        } else {
          maximumElectricityRelativeError = Math.max(
            maximumElectricityRelativeError,
            relativeError,
          );
        }
        if (!closeEnough(
          actualValue,
          expectedValue,
          relativeTolerance,
          parameters.numerical.absolute_tolerance,
        )) {
          failures.push(`${postcode}.${metric}: ${actualValue} != ${expectedValue}`);
        }
      }
    }
    expect(metricCount).toBe(700);
    expect(failures).toEqual([]);
    expect(maximumCopRelativeError).toBeLessThan(
      parameters.numerical.cop_regression_relative_tolerance,
    );
    expect(maximumElectricityRelativeError).toBeLessThan(
      parameters.numerical.electricity_regression_relative_tolerance,
    );
    console.info(JSON.stringify({
      postcodeCount: Object.keys(inputs.cases).length,
      metricCount,
      maximumCopRelativeError,
      maximumElectricityRelativeError,
    }));
  });
});
