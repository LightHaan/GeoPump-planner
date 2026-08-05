import paperDefaultsJson from "../../reference_engine/paper-defaults.json";

import type { ScenarioParameters } from "./types";

export const PAPER_DEFAULTS = paperDefaultsJson as ScenarioParameters;

export function clonePaperDefaults(): ScenarioParameters {
  return structuredClone(PAPER_DEFAULTS);
}
