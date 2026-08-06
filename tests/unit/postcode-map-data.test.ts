import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { PostcodeAttributeIndex } from "../../src/data/postcode";
import {
  createMetricScale,
  mapMetric,
  prepareBoundaryCollection,
  type BoundaryFeatureCollection,
} from "../../src/map/postcode-map-data";

const attributes = JSON.parse(
  readFileSync(join(process.cwd(), "public/data/postcode-attributes.json"), "utf8"),
) as PostcodeAttributeIndex;

describe("postcode map data", () => {
  it("joins postcode attributes to map features without changing geometry", () => {
    const collection: BoundaryFeatureCollection = {
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [] },
        properties: { POA_CODE21: "3000" },
      }],
    };
    const prepared = prepareBoundaryCollection(collection, attributes);
    expect(prepared.features[0]?.geometry).toBe(collection.features[0]?.geometry);
    expect(prepared.features[0]?.properties?.postcode).toBe("3000");
    expect(prepared.features[0]?.properties?.map_ground_surface_20).toBeCloseTo(19.1179507);
    expect(prepared.features[0]?.properties?.map_certificate_count).toBe(395);
  });

  it("creates an ordered robust scale for every public metric", () => {
    const scale = createMetricScale(attributes, "heating_load");
    expect(scale.stops).toHaveLength(5);
    expect(scale.stops.every((stop, index) => index === 0 || stop[0] > (scale.stops[index - 1]?.[0] ?? -Infinity))).toBe(true);
    expect(scale.lower).toBeLessThanOrEqual(scale.middle);
    expect(scale.middle).toBeLessThanOrEqual(scale.upper);
    expect(mapMetric("heating_load").unit).toBe("kWh/m²/year");
  });
});
