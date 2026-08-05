import { CopError } from "../engine/errors";
import type { CopResult } from "../engine/types";
import type { InvalidCopPolicy } from "../parameters/types";

export function applyCopBounds(
  rawValue: number,
  minimumCop: number,
  maximumCop: number,
  invalidCopPolicy: InvalidCopPolicy,
): CopResult {
  const validNumber = Number.isFinite(rawValue) && rawValue > 0;
  const inRange = validNumber && rawValue >= minimumCop && rawValue <= maximumCop;
  if (inRange) {
    return { value: rawValue, rawValue, valid: true, clipped: false, warnings: [] };
  }
  const warnings = validNumber
    ? [`COP ${rawValue} is outside configured bounds [${minimumCop}, ${maximumCop}].`]
    : ["COP is zero, negative, NaN, or infinite."];
  if (invalidCopPolicy === "clip" && validNumber) {
    return {
      value: Math.min(Math.max(rawValue, minimumCop), maximumCop),
      rawValue,
      valid: true,
      clipped: true,
      warnings,
    };
  }
  if (invalidCopPolicy === "ignore") {
    return { value: null, rawValue, valid: false, clipped: false, warnings };
  }
  if (invalidCopPolicy === "stop") throw new CopError(warnings.join(" "));
  throw new CopError("invalidCopPolicy must be 'stop', 'clip', or 'ignore'");
}
