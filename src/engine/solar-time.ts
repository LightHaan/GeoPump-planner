import { SolarTimeError } from "./errors";

export function monthFromDayOfYear(dayOfYear: number, baseYear: number): number {
  if (dayOfYear < 1) throw new SolarTimeError("dayOfYear must be at least 1");
  return new Date(Date.UTC(baseYear, 0, dayOfYear)).getUTCMonth() + 1;
}

export function sunriseSunsetUtc(
  latitudeDeg: number,
  longitudeDeg: number,
  dayOfYear: number,
  solarDeclinationAmplitudeDeg: number,
  dayPhaseOffset: number,
  daysPerYear: number,
  longitudeDegreesPerHour: number,
  solarNoonHourUtcAtZeroLongitude: number,
  minimumCosineHourAngle: number,
  maximumCosineHourAngle: number,
): [number, number] {
  if (daysPerYear <= 0 || longitudeDegreesPerHour <= 0) {
    throw new SolarTimeError("Year length and longitude conversion must be positive");
  }
  const latitudeRad = (latitudeDeg * Math.PI) / 180;
  const declinationDeg =
    solarDeclinationAmplitudeDeg *
    Math.sin((2 * Math.PI * (dayPhaseOffset + dayOfYear)) / daysPerYear);
  const declinationRad = (declinationDeg * Math.PI) / 180;
  const rawCosine = -Math.tan(latitudeRad) * Math.tan(declinationRad);
  const cosineHourAngle = Math.min(
    maximumCosineHourAngle,
    Math.max(minimumCosineHourAngle, rawCosine),
  );
  const halfDayHours =
    ((Math.acos(cosineHourAngle) * 180) / Math.PI) / longitudeDegreesPerHour;
  const solarNoon = solarNoonHourUtcAtZeroLongitude - longitudeDeg / longitudeDegreesPerHour;
  return [solarNoon - halfDayHours, solarNoon + halfDayHours];
}

export function isInSolarGeometryWindow(
  hourUtc: number,
  sunriseUtc: number,
  sunsetUtc: number,
  hoursBeforeSunset: number,
  hoursAfterSunrise: number,
  hoursPerDay: number,
): boolean {
  if (hoursPerDay <= 0) throw new SolarTimeError("hoursPerDay must be positive");
  const start = (sunsetUtc - hoursBeforeSunset + hoursPerDay) % hoursPerDay;
  const end = (sunriseUtc + hoursAfterSunrise + hoursPerDay) % hoursPerDay;
  const hour = ((hourUtc % hoursPerDay) + hoursPerDay) % hoursPerDay;
  return start < end ? hour >= start && hour <= end : hour >= start || hour <= end;
}

export function isInFixedLocalWindow(
  hourUtc: number,
  startLocalHour: number,
  endLocalHour: number,
  utcOffsetHours: number,
  hoursPerDay: number,
): boolean {
  if (hoursPerDay <= 0) throw new SolarTimeError("hoursPerDay must be positive");
  const localHour = (((hourUtc + utcOffsetHours) % hoursPerDay) + hoursPerDay) % hoursPerDay;
  const start = ((startLocalHour % hoursPerDay) + hoursPerDay) % hoursPerDay;
  const end = ((endLocalHour % hoursPerDay) + hoursPerDay) % hoursPerDay;
  return start < end
    ? localHour >= start && localHour <= end
    : localHour >= start || localHour <= end;
}
