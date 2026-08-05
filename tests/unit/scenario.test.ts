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
});
