import type { CopResult } from "../engine/types";
import type { CopModelParameters } from "../parameters/types";
import { applyCopBounds } from "./bounds";

export function linearSourceTemperatureCop(
  mode: "heating" | "cooling",
  sourceTemperatureC: number,
  parameters: CopModelParameters,
): CopResult {
  const raw = mode === "heating"
    ? parameters.linear_heating_intercept
      + parameters.linear_heating_slope_per_c * sourceTemperatureC
    : parameters.linear_cooling_intercept
      + parameters.linear_cooling_slope_per_c * sourceTemperatureC;
  return applyCopBounds(
    raw,
    parameters.minimum_cop,
    parameters.maximum_cop,
    parameters.invalid_cop_policy,
  );
}
