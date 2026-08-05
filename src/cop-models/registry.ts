import { CopError } from "../engine/errors";
import type { CopResult } from "../engine/types";
import type { CopModelParameters } from "../parameters/types";
import { constantCop } from "./constant";
import { linearSourceTemperatureCop } from "./linear-source-temperature";
import { scaledCarnotCop } from "./scaled-carnot";

export function calculateCop(
  mode: "heating" | "cooling",
  sourceTemperatureC: number,
  parameters: CopModelParameters,
  absoluteTolerance: number,
): CopResult {
  if (parameters.model_id === "scaled_carnot") {
    return scaledCarnotCop(mode, sourceTemperatureC, parameters, absoluteTolerance);
  }
  if (parameters.model_id === "constant") return constantCop(mode, parameters);
  if (parameters.model_id === "linear_source_temperature") {
    return linearSourceTemperatureCop(mode, sourceTemperatureC, parameters);
  }
  throw new CopError(`Unsupported COP model: ${String(parameters.model_id)}`);
}
