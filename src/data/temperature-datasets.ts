import type { SurfaceDatasetId } from "./postcode";

export const TEMPERATURE_DATASET_LABELS: Readonly<Record<SurfaceDatasetId, string>> = {
  surface_t: "Geoscience Australia — Australian mean land-surface temperature",
  air_t: "CSIRO — Hourly near-surface air temperature grids for Australia (long-term climatology)",
};
