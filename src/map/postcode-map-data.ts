import type { PostcodeAttributeIndex, PostcodeAttributes } from "../data/postcode";
import { TEMPERATURE_DATASET_LABELS } from "../data/temperature-datasets";

export type MapMetricId =
  | "ground_surface_20"
  | "ground_air_20"
  | "surface_temperature"
  | "air_temperature"
  | "surface_gradient"
  | "air_gradient"
  | "surface_delta_t20"
  | "air_delta_t20"
  | "heating_load"
  | "cooling_load"
  | "certificate_count"
  | "nearest_borehole"
  | "delta_t20_se";

export interface MapMetricDefinition {
  id: MapMetricId;
  label: string;
  property: string;
  unit: string;
  value: (attributes: PostcodeAttributes) => number | null;
}

export interface BoundaryFeature {
  type: "Feature";
  id?: string | number;
  geometry: unknown;
  properties: Record<string, unknown> | null;
}

export interface BoundaryFeatureCollection {
  type: "FeatureCollection";
  features: BoundaryFeature[];
}

export interface MetricScale {
  stops: Array<[number, string]>;
  lower: number;
  middle: number;
  upper: number;
}

const nullable = (value: number | null | undefined): number | null => (
  value === null || value === undefined || !Number.isFinite(value) ? null : value
);

export const MAP_METRICS: readonly MapMetricDefinition[] = [
  {
    id: "ground_surface_20",
    label: `Ground temperature at 20 m — ${TEMPERATURE_DATASET_LABELS.surface_t}`,
    property: "map_ground_surface_20",
    unit: "°C",
    value: (item) => nullable(item.ground.surface_t.ground_temp_at_reference_depth_c),
  },
  {
    id: "ground_air_20",
    label: `Ground temperature at 20 m — ${TEMPERATURE_DATASET_LABELS.air_t}`,
    property: "map_ground_air_20",
    unit: "°C",
    value: (item) => nullable(item.ground.air_t.ground_temp_at_reference_depth_c),
  },
  {
    id: "surface_temperature",
    label: `Land-surface temperature — ${TEMPERATURE_DATASET_LABELS.surface_t}`,
    property: "map_surface_temperature",
    unit: "°C",
    value: (item) => nullable(item.ground.surface_t.surface_temp_c),
  },
  {
    id: "air_temperature",
    label: `Near-surface air temperature — ${TEMPERATURE_DATASET_LABELS.air_t}`,
    property: "map_air_temperature",
    unit: "°C",
    value: (item) => nullable(item.ground.air_t.surface_temp_c),
  },
  {
    id: "surface_gradient",
    label: `Ground gradient — ${TEMPERATURE_DATASET_LABELS.surface_t}`,
    property: "map_surface_gradient",
    unit: "°C/m",
    value: (item) => nullable(item.ground.surface_t.gradient_c_per_m),
  },
  {
    id: "air_gradient",
    label: `Ground gradient — ${TEMPERATURE_DATASET_LABELS.air_t}`,
    property: "map_air_gradient",
    unit: "°C/m",
    value: (item) => nullable(item.ground.air_t.gradient_c_per_m),
  },
  {
    id: "surface_delta_t20",
    label: `Temperature difference at 20 m — ${TEMPERATURE_DATASET_LABELS.surface_t}`,
    property: "map_surface_delta_t20",
    unit: "°C",
    value: (item) => nullable(item.ground.surface_t.delta_temp_at_reference_depth_c),
  },
  {
    id: "air_delta_t20",
    label: `Temperature difference at 20 m — ${TEMPERATURE_DATASET_LABELS.air_t}`,
    property: "map_air_delta_t20",
    unit: "°C",
    value: (item) => nullable(item.ground.air_t.delta_temp_at_reference_depth_c),
  },
  {
    id: "heating_load",
    label: "Annual heating load",
    property: "map_heating_load",
    unit: "kWh/m²/year",
    value: (item) => nullable(item.load.annual_heating_kwh_m2),
  },
  {
    id: "cooling_load",
    label: "Annual cooling load",
    property: "map_cooling_load",
    unit: "kWh/m²/year",
    value: (item) => nullable(item.load.annual_cooling_kwh_m2),
  },
  {
    id: "certificate_count",
    label: "Certificate records",
    property: "map_certificate_count",
    unit: "records",
    value: (item) => nullable(item.load.certificate_count),
  },
  {
    id: "nearest_borehole",
    label: "Nearest borehole distance",
    property: "map_nearest_borehole",
    unit: "km",
    value: (item) => nullable(item.ground.nearest_borehole_km),
  },
  {
    id: "delta_t20_se",
    label: "ΔT20 EBK prediction standard error",
    property: "map_delta_t20_se",
    unit: "°C",
    value: (item) => nullable(item.ground.uncertainty.delta_t20_ebk_prediction_se_c),
  },
] as const;

export function mapMetric(metricId: MapMetricId): MapMetricDefinition {
  const match = MAP_METRICS.find((item) => item.id === metricId);
  if (match === undefined) throw new Error(`Unknown postcode-map metric: ${metricId}`);
  return match;
}

export function prepareBoundaryCollection(
  collection: BoundaryFeatureCollection,
  attributes: PostcodeAttributeIndex,
): BoundaryFeatureCollection {
  return {
    type: "FeatureCollection",
    features: collection.features.map((feature) => {
      const properties = { ...(feature.properties ?? {}) };
      const postcode = String(properties.POA_CODE21 ?? properties.POA_NAME21 ?? "").padStart(4, "0");
      properties.postcode = postcode;
      const postcodeAttributes = attributes[postcode];
      if (postcodeAttributes !== undefined) {
        for (const metric of MAP_METRICS) {
          const value = metric.value(postcodeAttributes);
          if (value !== null) properties[metric.property] = value;
        }
        properties.map_climate_records = postcodeAttributes.climate.record_count;
        properties.map_nearby_boreholes = postcodeAttributes.ground.nearby_borehole_count;
      }
      return { ...feature, properties };
    }),
  };
}

function quantile(sortedValues: readonly number[], fraction: number): number {
  if (sortedValues.length === 0) return 0;
  const position = (sortedValues.length - 1) * fraction;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lower = sortedValues[lowerIndex] ?? 0;
  const upper = sortedValues[upperIndex] ?? lower;
  return lower + (upper - lower) * (position - lowerIndex);
}

const SCALE_COLORS = ["#3f77a8", "#73aaa4", "#d8d790", "#e29a50", "#ad4f43"] as const;

export function createMetricScale(
  attributes: PostcodeAttributeIndex,
  metricId: MapMetricId,
): MetricScale {
  const metric = mapMetric(metricId);
  const values = Object.values(attributes)
    .map((item) => metric.value(item))
    .filter((value): value is number => value !== null)
    .sort((left, right) => left - right);
  const fractions = [0.05, 0.275, 0.5, 0.725, 0.95] as const;
  const numericStops = fractions.map((fraction) => quantile(values, fraction));
  for (let index = 1; index < numericStops.length; index += 1) {
    const previous = numericStops[index - 1] ?? 0;
    if ((numericStops[index] ?? previous) <= previous) {
      numericStops[index] = previous + Math.max(Math.abs(previous) * 1e-9, 1e-9);
    }
  }
  return {
    stops: numericStops.map((value, index) => [value, SCALE_COLORS[index] ?? SCALE_COLORS[0]]),
    lower: quantile(values, 0.05),
    middle: quantile(values, 0.5),
    upper: quantile(values, 0.95),
  };
}

export function formatMetricValue(value: number | null, metric: MapMetricDefinition): string {
  if (value === null) return "No data";
  const digits = metric.id.includes("gradient") || metric.id === "delta_t20_se" ? 3 : 1;
  return `${value.toLocaleString(undefined, { maximumFractionDigits: digits })} ${metric.unit}`;
}
