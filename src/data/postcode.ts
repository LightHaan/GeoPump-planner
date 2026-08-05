import { fromPublishedClimateFile, type PublishedClimateFile } from "./climate";
import type { ClimateRecord } from "../engine/types";

export type SurfaceDatasetId = "air_t" | "surface_t";

export interface DataManifest {
  schema_version: string;
  dataset_version: string;
  generated_at: string;
  country: string;
  analysis_unit: string;
  runtime_spatial_processing: boolean;
  postcode_count: number;
  surface_temperature_datasets: Array<{
    id: SurfaceDatasetId;
    label: string;
    provider: string;
    version?: string;
    temporal_coverage: string;
    source_url: string;
  }>;
  climate: {
    postcode_count: number;
    missing_postcode_count: number;
    records_per_available_postcode: number;
    represented_hours_per_available_postcode: number;
    time_basis: string;
    record_type: string;
  };
}

export interface PostcodeIndexEntry {
  postcode: string;
  locality_hint: string;
  state: string | null;
  lat: number;
  lon: number;
  has_ground_data: boolean;
  has_load_data: boolean;
  has_climate_data: boolean;
}

export interface GroundDatasetAttributes {
  surface_temp_c: number | null;
  delta_temp_at_reference_depth_c: number | null;
  gradient_c_per_m: number | null;
  ground_temp_at_reference_depth_c: number | null;
}

export interface PostcodeAttributes {
  location: {
    lat: number;
    lon: number;
    postcode_name: string;
  };
  ground: {
    reference_depth_m: number;
    air_t: GroundDatasetAttributes;
    surface_t: GroundDatasetAttributes;
    nearest_borehole_km: number | null;
    nearby_borehole_count: number | null;
    nearby_radius_km: number;
    uncertainty: {
      delta_t20_ebk_prediction_se_c: number | null;
      applies_to_dataset_id: "surface_t";
      scope: string;
      is_total_ground_temperature_uncertainty: false;
    };
  };
  load: {
    annual_heating_kwh_m2: number | null;
    annual_cooling_kwh_m2: number | null;
    certificate_count: number | null;
  };
  climate: {
    record_count: number | null;
    represented_hours: number | null;
    record_type: string | null;
    weight_hours: number | null;
    stored_temperature_scale_divisor: number;
  };
  quality: {
    ground_temperature_method: string;
    load_method: string;
    warnings: string[];
  };
}

export type PostcodeAttributeIndex = Record<string, PostcodeAttributes>;

function dataUrl(relativePath: string): string {
  const base = import.meta.env.BASE_URL.endsWith("/")
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  return `${base}data/${relativePath}`;
}

async function fetchJson<T>(relativePath: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(
    dataUrl(relativePath),
    signal === undefined ? {} : { signal },
  );
  if (!response.ok) {
    throw new Error(`Could not load ${relativePath} (HTTP ${response.status}).`);
  }
  return await response.json() as T;
}

export async function loadPostcodeCatalog(
  signal?: AbortSignal,
): Promise<{
  index: PostcodeIndexEntry[];
  attributes: PostcodeAttributeIndex;
  manifest: DataManifest;
}> {
  const [index, attributes, manifest] = await Promise.all([
    fetchJson<PostcodeIndexEntry[]>("postcode-index.json", signal),
    fetchJson<PostcodeAttributeIndex>("postcode-attributes.json", signal),
    fetchJson<DataManifest>("manifest.json", signal),
  ]);
  return { index, attributes, manifest };
}

export async function loadPostcodeClimate(
  postcode: string,
  baseYear: number,
  signal?: AbortSignal,
): Promise<ClimateRecord[]> {
  const document = await fetchJson<PublishedClimateFile>(`climate/${postcode}.json`, signal);
  if (document.postcode !== postcode) {
    throw new Error(
      `Climate-file postcode mismatch: expected ${postcode}, received ${document.postcode}.`,
    );
  }
  return fromPublishedClimateFile(document, baseYear);
}

export function postcodeBoundaryUrl(): string {
  return dataUrl("postcode-boundaries.geojson");
}
