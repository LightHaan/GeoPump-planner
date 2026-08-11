import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { PostcodeAttributeIndex } from "../../src/data/postcode";
import {
  colourForMetricValue,
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

  it("interpolates continuous colours between scale stops", () => {
    const scale = createMetricScale(attributes, "cooling_load");
    const first = scale.stops[0];
    const second = scale.stops[1];
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    if (first === undefined || second === undefined) return;

    const middleValue = (first[0] + second[0]) / 2;
    const middleColour = colourForMetricValue(middleValue, scale);
    expect(middleColour).toMatch(/^#[0-9a-f]{6}$/);
    expect(middleColour).not.toBe(first[1]);
    expect(middleColour).not.toBe(second[1]);
    expect(colourForMetricValue(null, scale)).toBe("#e2e5e1");
  });
});
