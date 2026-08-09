import { describe, expect, it } from "vitest";

import { runScenario } from "../../src/engine/scenario";
import { clonePaperDefaults } from "../../src/parameters/defaults";

describe("end-to-end postcode scenario", () => {
  it("reports and discards certificate load when both annual degree-hour totals are zero", () => {
    const parameters = clonePaperDefaults();
    parameters.time.expected_annual_weight_hours = 2;
    const result = runScenario(
      {
        postcode: "0000",
        records: [
          { dayOfYear: 1, hourUtc: 0, month: 1, airTempC: 20, weightHours: 1 },
          { dayOfYear: 1, hourUtc: 12, month: 1, airTempC: 20, weightHours: 1 },
        ],
        latitudeDeg: -34,
        longitudeDeg: 151,
        groundTemperatureC: 19,
        annualHeatingKwhM2: 100,
        annualCoolingKwhM2: 50,
      },
      parameters,
    );
    expect(result.degreeHours).toEqual({ heating: 0, cooling: 0 });
    expect(result.loads.totalAnnual).toBe(0);
    expect(result.calculationTrace.requestedAnnualHeatingKwh).toBe(100);
    expect(result.calculationTrace.unallocatedAnnualHeatingKwh).toBe(100);
    expect(result.warnings.join(" ")).toContain("degree-hours are zero");
  });

  it("does not report a zero-degree-hour warning for a tiny allocation rounding residual", () => {
    const parameters = clonePaperDefaults();
    parameters.load.conditioned_floor_area_m2 = 120;
    const records = Array.from({ length: 1_752 }, (_, index) => ({
      dayOfYear: Math.floor(index / 24) + 1,
      hourUtc: index % 24,
      month: Math.min(12, Math.floor(index / 146) + 1),
      airTempC: 5 + (index % 20) * 0.7,
      weightHours: 5,
    }));
    const result = runScenario(
      {
        postcode: "0000",
        records,
        latitudeDeg: -34,
        longitudeDeg: 151,
        groundTemperatureC: 19,
        annualHeatingKwhM2: 22.22222222,
        annualCoolingKwhM2: 0,
      },
      parameters,
    );
    expect(result.loads.heating.annual).toBeGreaterThan(0);
    expect(result.calculationTrace.unallocatedAnnualHeatingKwh).toBe(0);
    expect(result.warnings.join(" ")).not.toContain("degree-hours are zero");
  });
});
