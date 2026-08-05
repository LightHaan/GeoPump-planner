import type { AnalysisPeriodParameters, TimeParameters } from "../parameters/types";
import { AnalysisPeriodError } from "./errors";
import { isInFixedLocalWindow, isInSolarGeometryWindow, sunriseSunsetUtc } from "./solar-time";
import type { ClimateRecord } from "./types";

export function analysisPeriodFlags(
  records: readonly ClimateRecord[],
  latitudeDeg: number,
  longitudeDeg: number,
  parameters: AnalysisPeriodParameters,
  time: TimeParameters,
): boolean[] {
  if (!parameters.enabled) return records.map(() => false);
  if (parameters.mode === "all_hours") return records.map(() => true);
  if (parameters.mode === "fixed_local_time") {
    return records.map((record) =>
      isInFixedLocalWindow(
        record.hourUtc,
        parameters.fixed_start_local_hour,
        parameters.fixed_end_local_hour,
        parameters.fixed_utc_offset_hours,
        parameters.hours_per_day,
      ),
    );
  }
  if (parameters.mode === "solar_geometry") {
    return records.map((record) => {
      const [sunrise, sunset] = sunriseSunsetUtc(
        latitudeDeg,
        longitudeDeg,
        record.dayOfYear,
        parameters.solar_declination_amplitude_deg,
        parameters.day_phase_offset,
        time.days_per_year,
        parameters.longitude_degrees_per_hour,
        parameters.solar_noon_hour_utc_at_zero_longitude,
        parameters.minimum_cosine_hour_angle,
        parameters.maximum_cosine_hour_angle,
      );
      return isInSolarGeometryWindow(
        record.hourUtc,
        sunrise,
        sunset,
        parameters.hours_before_sunset,
        parameters.hours_after_sunrise,
        parameters.hours_per_day,
      );
    });
  }
  throw new AnalysisPeriodError(`Unsupported analysis-period mode: ${String(parameters.mode)}`);
}
