import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  calculatePostcodeOutcome,
  createResultsCsv,
  createScenarioExport,
  groundInputsForDataset,
  inputsFromAttributes,
  listScenarioOverrides,
  parseScenarioImport,
} from "../../src/app/model";
import { fromPublishedClimateFile, type PublishedClimateFile } from "../../src/data/climate";
import type { PostcodeAttributeIndex } from "../../src/data/postcode";
import { clonePaperDefaults } from "../../src/parameters/defaults";

function json<T>(relativePath: string): T {
  return JSON.parse(readFileSync(join(process.cwd(), relativePath), "utf8")) as T;
}

describe("Phase 4 browser model", () => {
  it("uses frozen postcode defaults, supports A/B ground datasets, and exports a reproducible scenario", () => {
    const attributes = json<PostcodeAttributeIndex>("public/data/postcode-attributes.json")["3000"]!;
    const climateFile = json<PublishedClimateFile>("public/data/climate/3000.json");
    const climate = fromPublishedClimateFile(climateFile, 2023);
    const parameters = clonePaperDefaults();
    let inputs = inputsFromAttributes(attributes, "surface_t");
    expect(inputs.surfaceTemperatureC).toBeCloseTo(18.1585865, 8);
    inputs = groundInputsForDataset(inputs, attributes, "air_t");
    expect(inputs.surfaceTemperatureC).toBeCloseTo(16.62328815, 8);
    parameters.ground.surface_dataset_id = "air_t";
    parameters.tariff.single_price_per_kwh = 0.3;
    const outcome = calculatePostcodeOutcome("3000", attributes, climate, inputs, parameters);
    expect(outcome.scenario.postcode).toBe("3000");
    expect(outcome.scenario.gshp.systemElectricity.annual).toBeGreaterThan(0);
    const exported = createScenarioExport(
      "3000",
      attributes,
      inputs,
      parameters,
      outcome,
      "2026-08-05T00:00:00.000Z",
    );
    expect(exported).toMatchObject({
      schemaVersion: "1.0.0",
      exportedAt: "2026-08-05T00:00:00.000Z",
      postcode: "3000",
    });
    expect(exported.parameters.ground.surface_dataset_id).toBe("air_t");
    const imported = parseScenarioImport(JSON.stringify(exported));
    expect(imported.postcode).toBe("3000");
    expect(imported.parameters.ground.surface_dataset_id).toBe("air_t");
    const csv = createResultsCsv("3000", outcome, "AUD");
    expect(csv).toContain('"postcode","scope","period","metric","system","value","unit"');
    expect(csv).toContain('"3000","monthly","12","system_electricity","GSHP"');
    expect(listScenarioOverrides(attributes, inputs, parameters)).toContain(
      "Parameter: ground.surface_dataset_id",
    );
  });

  it("rejects malformed or incomplete scenario imports", () => {
    expect(() => parseScenarioImport("not json")).toThrow(/not valid JSON/);
    expect(() => parseScenarioImport(JSON.stringify({ schemaVersion: "9.0.0" })))
      .toThrow(/Unsupported scenario schema/);
  });
});
