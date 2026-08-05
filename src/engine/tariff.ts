import type { TariffParameters } from "../parameters/types";
import { TariffError } from "./errors";
import type { TariffCostBreakdown } from "./types";

function nonNegative(name: string, value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new TariffError(`${name} must be finite and non-negative`);
  }
  return value;
}

export function annualTariffCost(
  annualElectricityKwh: number,
  selectedPeriodElectricityKwh: number,
  tariff: TariffParameters,
  daysPerYear: number,
  absoluteTolerance: number,
): TariffCostBreakdown {
  const annual = nonNegative("annualElectricityKwh", annualElectricityKwh);
  const selected = nonNegative(
    "selectedPeriodElectricityKwh",
    selectedPeriodElectricityKwh,
  );
  if (selected > annual + Math.abs(absoluteTolerance)) {
    throw new TariffError("Selected-period electricity cannot exceed annual electricity");
  }
  const fixedCharge =
    nonNegative("fixedDailyCharge", tariff.fixed_daily_charge) *
      nonNegative("daysPerYear", daysPerYear) +
    nonNegative("annualFixedCharge", tariff.annual_fixed_charge);
  let energyCharge: number | null;
  if (tariff.mode === "single") {
    energyCharge = tariff.single_price_per_kwh === null
      ? null
      : annual * nonNegative("singlePricePerKwh", tariff.single_price_per_kwh);
  } else if (tariff.mode === "selected_period_two_rate") {
    if (
      tariff.selected_period_price_per_kwh === null ||
      tariff.other_period_price_per_kwh === null
    ) {
      energyCharge = null;
    } else {
      energyCharge =
        selected *
          nonNegative(
            "selectedPeriodPricePerKwh",
            tariff.selected_period_price_per_kwh,
          ) +
        (annual - selected) *
          nonNegative("otherPeriodPricePerKwh", tariff.other_period_price_per_kwh);
    }
  } else {
    throw new TariffError(`Unsupported tariff mode: ${String(tariff.mode)}`);
  }
  return {
    energyCharge,
    fixedCharge,
    totalCost: energyCharge === null ? null : energyCharge + fixedCharge,
  };
}
