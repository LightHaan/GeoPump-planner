import { CopError } from "../engine/errors";
import type { CopResult } from "../engine/types";
import type { CopModelParameters } from "../parameters/types";
import { applyCopBounds } from "./bounds";

export function scaledCarnotCop(
  mode: "heating" | "cooling",
  sourceTemperatureC: number,
  parameters: CopModelParameters,
  absoluteTolerance: number,
): CopResult {
  const sourceK = sourceTemperatureC + parameters.kelvin_offset;
  const approach = parameters.approach_temperature_k;
  let raw: number;
  if (mode === "heating") {
    const condenserK =
      parameters.heating_supply_temperature_c + parameters.kelvin_offset + approach;
    const evaporatorK = sourceK - approach;
    const denominator = condenserK - evaporatorK;
    if (Math.abs(denominator) <= Math.abs(absoluteTolerance)) {
      throw new CopError("Heating Carnot denominator is zero");
    }
    raw = parameters.empirical_carnot_efficiency * condenserK / denominator;
  } else {
    const evaporatorK =
      parameters.cooling_supply_temperature_c + parameters.kelvin_offset - approach;
    const condenserK = sourceK + approach;
    const denominator = condenserK - evaporatorK;
    if (Math.abs(denominator) <= Math.abs(absoluteTolerance)) {
      throw new CopError("Cooling Carnot denominator is zero");
    }
    raw = parameters.empirical_carnot_efficiency * evaporatorK / denominator;
  }
  return applyCopBounds(
    raw,
    parameters.minimum_cop,
    parameters.maximum_cop,
    parameters.invalid_cop_policy,
  );
}
