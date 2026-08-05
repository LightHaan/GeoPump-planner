import { DegreeHourError } from "../engine/errors";
import { monthFromDayOfYear } from "../engine/solar-time";
import type { ClimateRecord } from "../engine/types";

export const PUBLISHED_CLIMATE_RECORD_LAYOUT = [
  "day_of_year",
  "hour_utc",
  "air_temp_c",
  "weight_hours",
] as const;

export interface PublishedClimateFile {
  schema_version: string;
  postcode: string;
  time_basis: "UTC";
  record_layout: string[];
  record_count: number;
  represented_hours: number;
  records: Array<[number, number, number, number]>;
}

export interface ReferenceClimateRecord {
  day_of_year: number;
  hour_utc: number;
  month: number;
  air_temp_c: number;
  weight_hours: number;
}

export function fromPublishedClimateFile(
  document: PublishedClimateFile,
  baseYear: number,
): ClimateRecord[] {
  if (
    document.record_layout.length !== PUBLISHED_CLIMATE_RECORD_LAYOUT.length ||
    document.record_layout.some(
      (field, index) => field !== PUBLISHED_CLIMATE_RECORD_LAYOUT[index],
    )
  ) {
    throw new DegreeHourError("Published climate tuple layout is not supported");
  }
  if (document.records.length !== document.record_count) {
    throw new DegreeHourError("Published climate record count does not match metadata");
  }
  return document.records.map(([dayOfYear, hourUtc, airTempC, weightHours]) => ({
    dayOfYear,
    hourUtc,
    month: monthFromDayOfYear(dayOfYear, baseYear),
    airTempC,
    weightHours,
  }));
}

export function fromReferenceClimateFixture(
  records: readonly ReferenceClimateRecord[],
): ClimateRecord[] {
  return records.map((record) => ({
    dayOfYear: record.day_of_year,
    hourUtc: record.hour_utc,
    month: record.month,
    airTempC: record.air_temp_c,
    weightHours: record.weight_hours,
  }));
}
