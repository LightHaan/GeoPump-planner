import type { CopResult } from "../engine/types";
import type { CopModelParameters } from "../parameters/types";
import { applyCopBounds } from "./bounds";

export function constantCop(
  mode: "heating" | "cooling",
  parameters: CopModelParameters,
): CopResult {
  const raw = mode === "heating"
    ? parameters.constant_heating_cop
    : parameters.constant_cooling_cop;
  return applyCopBounds(
    raw,
    parameters.minimum_cop,
    parameters.maximum_cop,
    parameters.invalid_cop_policy,
  );
}
