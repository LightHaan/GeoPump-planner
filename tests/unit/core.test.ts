import { describe, expect, it } from "vitest";

import { calculateCop } from "../../src/cop-models/registry";
import { analysisPeriodFlags } from "../../src/engine/analysis-period";
import { evaluateDecision } from "../../src/engine/decision";
import { allocateAnnualLoad, weightedDegreeHours } from "../../src/engine/degree-hours";
import { compareLifecycleCosts, lifecycleCost } from "../../src/engine/economics";
import { addAuxiliaryElectricity, compressorElectricity } from "../../src/engine/electricity";
import {
  directGroundTemperature,
  groundTemperatureFromInterpolation,
  groundTemperatureFromSurfaceGradient,
} from "../../src/engine/ground-temperature";
import { annualTariffCost } from "../../src/engine/tariff";
import type { ClimateRecord } from "../../src/engine/types";
import { clonePaperDefaults } from "../../src/parameters/defaults";

const records: ClimateRecord[] = [
  { dayOfYear: 1, hourUtc: 0, month: 1, airTempC: 10, weightHours: 2 },
  { dayOfYear: 1, hourUtc: 12, month: 1, airTempC: 26, weightHours: 2 },
];

describe("ground temperature", () => {
  it("supports all three input modes", () => {
    expect(groundTemperatureFromSurfaceGradient(20, 0.03, 20, 0, 20).groundTemperatureC)
      .toBeCloseTo(20.6, 12);
    expect(
      groundTemperatureFromInterpolation(20, 21, 40, 20, 0, 20, false, 1e-12)
        .groundTemperatureC,
    ).toBeCloseTo(20.5, 12);
    expect(directGroundTemperature(19).groundTemperatureC).toBe(19);
  });
});

describe("degree-hour demand and allocation", () => {
  it("uses editable heating and cooling thresholds", () => {
    expect(weightedDegreeHours(records, 12, 24)).toEqual({ heating: 4, cooling: 4 });
  });

  it("sets allocated load to zero when annual degree-hours are zero", () => {
    const noHeating = records.map((record) => ({ ...record, airTempC: 20 }));
    expect(allocateAnnualLoad(noHeating, 500, 12, "heating", "discard_with_warning", 1e-12))
      .toEqual([0, 0]);
  });
});

describe("analysis period", () => {
  it("supports any fixed local time window and all-hours mode", () => {
    const parameters = clonePaperDefaults();
    parameters.analysis_period.mode = "fixed_local_time";
    parameters.analysis_period.fixed_start_local_hour = 11;
    parameters.analysis_period.fixed_end_local_hour = 13;
    expect(analysisPeriodFlags(records, 0, 150, parameters.analysis_period, parameters.time))
      .toEqual([false, true]);
    parameters.analysis_period.mode = "all_hours";
    expect(analysisPeriodFlags(records, 0, 150, parameters.analysis_period, parameters.time))
      .toEqual([true, true]);
  });
});

describe("COP registry", () => {
  it("switches among scaled Carnot, constant, and linear models", () => {
    const parameters = clonePaperDefaults().cop.gshp;
    expect(calculateCop("heating", 20, parameters, 1e-12).value).toBeCloseTo(3.71175, 5);
    parameters.model_id = "constant";
    parameters.constant_heating_cop = 4.2;
    expect(calculateCop("heating", 20, parameters, 1e-12).value).toBe(4.2);
    parameters.model_id = "linear_source_temperature";
    parameters.linear_heating_intercept = 2;
    parameters.linear_heating_slope_per_c = 0.1;
    expect(calculateCop("heating", 20, parameters, 1e-12).value).toBe(4);
  });

  it("applies the editable invalid-COP policy", () => {
    const parameters = clonePaperDefaults().cop.gshp;
    parameters.model_id = "constant";
    parameters.constant_heating_cop = 50;
    parameters.invalid_cop_policy = "clip";
    expect(calculateCop("heating", 20, parameters, 1e-12)).toMatchObject({
      value: 20,
      clipped: true,
    });
  });
});

describe("electricity, tariffs, and economics", () => {
  it("calculates compressor and editable auxiliary electricity", () => {
    const [compressor] = compressorElectricity([8, 0], [4, null], "stop", 1e-12);
    expect(compressor).toEqual([2, 0]);
    expect(addAuxiliaryElectricity(compressor, [1, 1], 0.1, 0.2, 0, 2, 1e-12))
      .toEqual([3.6, 1]);
  });

  it("calculates single and selected-period two-rate tariffs", () => {
    const parameters = clonePaperDefaults();
    parameters.tariff.single_price_per_kwh = 0.3;
    parameters.tariff.fixed_daily_charge = 1;
    parameters.tariff.annual_fixed_charge = 10;
    expect(annualTariffCost(1000, 400, parameters.tariff, 365, 1e-12).totalCost).toBe(675);
    parameters.tariff.mode = "selected_period_two_rate";
    parameters.tariff.selected_period_price_per_kwh = 0.2;
    parameters.tariff.other_period_price_per_kwh = 0.4;
    parameters.tariff.fixed_daily_charge = 0;
    parameters.tariff.annual_fixed_charge = 0;
    expect(annualTariffCost(1000, 400, parameters.tariff, 365, 1e-12).totalCost).toBe(320);
  });

  it("calculates discounted lifecycle costs and handles incomplete inputs", () => {
    expect(lifecycleCost(1000, 100, 10, 2, 0, 0, [], 0)).toBe(1220);
    const economics = clonePaperDefaults().economics;
    expect(compareLifecycleCosts(economics, null, null, 1e-12).npvOfGshpChoice).toBeNull();
    economics.gshp_installed_cost = 12000;
    economics.ashp_installed_cost = 8000;
    economics.gshp_annual_maintenance_cost = 50;
    economics.ashp_annual_maintenance_cost = 50;
    economics.analysis_period_years = 10;
    economics.discount_rate_fraction = 0;
    economics.ashp_replacements = [{ year: 5, cost: 2000 }];
    expect(compareLifecycleCosts(economics, 300, 500, 1e-12)).toMatchObject({
      incrementalInstalledCost: 4000,
      annualOperatingCostSaving: 200,
      simplePaybackYears: 20,
      npvOfGshpChoice: 0,
    });
  });
});

describe("decision framework", () => {
  it("does not treat deltaT20 EBK prediction SE as applicable to air_t", () => {
    const parameters = clonePaperDefaults();
    const economics = {
      incrementalInstalledCost: 1000,
      annualOperatingCostSaving: 200,
      simplePaybackYears: 5,
      gshpLifecycleCost: 5000,
      ashpLifecycleCost: 7000,
      npvOfGshpChoice: 2000,
    };
    const result = evaluateDecision(
      0.2,
      economics,
      {
        surfaceDatasetId: "air_t",
        deltaT20EbkPredictionSeC: 99,
        nearestBoreholeKm: 10,
        certificateCount: 20,
      },
      parameters.decision,
    );
    expect(result.evidence.deltaT20StandardErrorApplicability).toBe("not_applicable");
    expect(result.overall).toBe("recommended");
  });
});
