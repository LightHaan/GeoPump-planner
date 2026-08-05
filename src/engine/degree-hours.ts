import { DegreeHourError } from "./errors";
import type { ClimateRecord, ValueAggregate } from "./types";

export function heatingDegreeHour(airTempC: number, balanceTemperatureC: number): number {
  return Math.max(0, balanceTemperatureC - airTempC);
}

export function coolingDegreeHour(airTempC: number, balanceTemperatureC: number): number {
  return Math.max(0, airTempC - balanceTemperatureC);
}

export function validateClimateRecords(
  records: readonly ClimateRecord[],
  expectedAnnualWeightHours: number,
  absoluteTolerance: number,
): string[] {
  if (records.length === 0) throw new DegreeHourError("At least one climate record is required");
  const tolerance = Math.abs(absoluteTolerance);
  let totalWeight = 0;
  records.forEach((record, index) => {
    if (!Number.isFinite(record.airTempC)) {
      throw new DegreeHourError(`Record ${index} has a non-finite air temperature`);
    }
    if (!Number.isFinite(record.weightHours) || record.weightHours <= tolerance) {
      throw new DegreeHourError(`Record ${index} must have positive finite weightHours`);
    }
    if (record.month < 1 || record.month > 12) {
      throw new DegreeHourError(`Record ${index} has an invalid month`);
    }
    totalWeight += record.weightHours;
  });
  return Math.abs(totalWeight - expectedAnnualWeightHours) > tolerance
    ? [
        `Climate weights sum to ${totalWeight} h, not the configured ${expectedAnnualWeightHours} h.`,
      ]
    : [];
}

export function weightedDegreeHours(
  records: readonly ClimateRecord[],
  heatingBalanceTemperatureC: number,
  coolingBalanceTemperatureC: number,
): { heating: number; cooling: number } {
  let heating = 0;
  let cooling = 0;
  for (const record of records) {
    heating +=
      heatingDegreeHour(record.airTempC, heatingBalanceTemperatureC) * record.weightHours;
    cooling +=
      coolingDegreeHour(record.airTempC, coolingBalanceTemperatureC) * record.weightHours;
  }
  return { heating, cooling };
}

export function allocateAnnualLoad(
  records: readonly ClimateRecord[],
  annualLoadKwh: number,
  balanceTemperatureC: number,
  mode: "heating" | "cooling",
  zeroDegreeHourPolicy: "error" | "uniform" | "discard_with_warning",
  absoluteTolerance: number,
): number[] {
  const tolerance = Math.abs(absoluteTolerance);
  if (!Number.isFinite(annualLoadKwh) || annualLoadKwh < -tolerance) {
    throw new DegreeHourError("annualLoadKwh must be finite and non-negative");
  }
  const degrees = records.map((record) =>
    mode === "heating"
      ? heatingDegreeHour(record.airTempC, balanceTemperatureC)
      : coolingDegreeHour(record.airTempC, balanceTemperatureC),
  );
  const weighted = degrees.map((degree, index) => degree * records[index]!.weightHours);
  const denominator = weighted.reduce((sum, value) => sum + value, 0);
  if (annualLoadKwh <= tolerance) return records.map(() => 0);
  if (denominator > tolerance) {
    return weighted.map((contribution) => (annualLoadKwh * contribution) / denominator);
  }
  if (zeroDegreeHourPolicy === "uniform") {
    const totalWeight = records.reduce((sum, record) => sum + record.weightHours, 0);
    if (totalWeight <= tolerance) {
      throw new DegreeHourError("Cannot uniformly allocate load with zero total weight");
    }
    return records.map((record) => (annualLoadKwh * record.weightHours) / totalWeight);
  }
  if (zeroDegreeHourPolicy === "discard_with_warning") return records.map(() => 0);
  throw new DegreeHourError(
    `Annual ${mode} load is positive but weighted ${mode} degree-hours are zero`,
  );
}

export function aggregateValues(
  records: readonly ClimateRecord[],
  values: readonly number[],
  selectedPeriodFlags?: readonly boolean[],
): ValueAggregate {
  if (records.length !== values.length) {
    throw new DegreeHourError("records and values must have the same length");
  }
  const flags = selectedPeriodFlags ?? records.map(() => false);
  if (flags.length !== records.length) {
    throw new DegreeHourError("records and selectedPeriodFlags must have the same length");
  }
  const monthly = Object.fromEntries(Array.from({ length: 12 }, (_, index) => [String(index + 1), 0]));
  const monthlySelectedPeriod = Object.fromEntries(
    Array.from({ length: 12 }, (_, index) => [String(index + 1), 0]),
  );
  let annual = 0;
  let selectedPeriod = 0;
  records.forEach((record, index) => {
    const amount = values[index]!;
    annual += amount;
    const month = String(record.month);
    monthly[month] = (monthly[month] ?? 0) + amount;
    if (flags[index]) {
      selectedPeriod += amount;
      monthlySelectedPeriod[month] = (monthlySelectedPeriod[month] ?? 0) + amount;
    }
  });
  return { annual, selectedPeriod, monthly, monthlySelectedPeriod };
}
