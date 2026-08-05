import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  fromPublishedClimateFile,
  type PublishedClimateFile,
} from "../../src/data/climate";

describe("published browser climate adapter", () => {
  it("loads one postcode independently using its declared tuple layout", () => {
    const path = join(process.cwd(), "public", "data", "climate", "0810.json");
    const document = JSON.parse(readFileSync(path, "utf8")) as PublishedClimateFile;
    const records = fromPublishedClimateFile(document, 2023);
    expect(records).toHaveLength(1752);
    expect(records.reduce((sum, record) => sum + record.weightHours, 0)).toBe(8760);
    expect(records[0]).toMatchObject({ dayOfYear: 1, month: 1, hourUtc: 0 });
  });
});
