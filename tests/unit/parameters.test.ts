import { describe, expect, it } from "vitest";

import { clonePaperDefaults } from "../../src/parameters/defaults";
import {
  NON_EDITABLE_PRESET_METADATA,
  PARAMETER_REGISTRY,
  getParameterValue,
  setParameterValue,
} from "../../src/parameters/definitions";
import { validateScenarioParameters } from "../../src/parameters/validation";

function editableLeaves(value: unknown, path = ""): string[] {
  if (NON_EDITABLE_PRESET_METADATA.has(path)) return [];
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return Object.entries(value).flatMap(([key, child]) =>
      editableLeaves(child, path ? `${path}.${key}` : key),
    );
  }
  return [path];
}

describe("complete editable parameter registry", () => {
  it("registers every model leaf except preset identity metadata", () => {
    const parameters = clonePaperDefaults();
    const leaves = editableLeaves(parameters).sort();
    expect(PARAMETER_REGISTRY.map((definition) => definition.path).sort()).toEqual(leaves);
    expect(PARAMETER_REGISTRY).toHaveLength(109);
    expect(PARAMETER_REGISTRY.every((definition) => definition.editable)).toBe(true);
    expect(new Set(PARAMETER_REGISTRY.map((definition) => definition.uiTier))).toEqual(
      new Set(["basic", "advanced", "equation_constant"]),
    );
    expect(PARAMETER_REGISTRY.every((definition) => definition.source.length > 0)).toBe(true);
  });

  it("accepts the paper-default preset and edits immutable copies", () => {
    const parameters = clonePaperDefaults();
    expect(validateScenarioParameters(parameters).filter((issue) => issue.severity === "error"))
      .toEqual([]);
    const changed = setParameterValue(parameters, "load.heating_balance_temperature_c", 13);
    expect(getParameterValue(changed, "load.heating_balance_temperature_c")).toBe(13);
    expect(parameters.load.heating_balance_temperature_c).toBe(12);
  });
});
