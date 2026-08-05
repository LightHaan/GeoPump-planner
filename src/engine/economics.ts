import type { EconomicsParameters, Replacement } from "../parameters/types";
import { EconomicsError } from "./errors";
import type { EconomicsResult } from "./types";

export function annualEnergyCost(
  annualElectricityKwh: number,
  electricityPricePerKwh: number | null,
): number | null {
  if (electricityPricePerKwh === null) return null;
  if (!Number.isFinite(annualElectricityKwh) || annualElectricityKwh < 0) {
    throw new EconomicsError("Annual electricity must be finite and non-negative");
  }
  if (!Number.isFinite(electricityPricePerKwh) || electricityPricePerKwh < 0) {
    throw new EconomicsError("Electricity price must be finite and non-negative");
  }
  return annualElectricityKwh * electricityPricePerKwh;
}

export function simplePaybackYears(
  incrementalInstalledCost: number,
  annualOperatingCostSaving: number,
  absoluteTolerance: number,
): number | null {
  if (incrementalInstalledCost <= absoluteTolerance) return 0;
  if (annualOperatingCostSaving <= absoluteTolerance) return null;
  return incrementalInstalledCost / annualOperatingCostSaving;
}

export function lifecycleCost(
  installedCost: number,
  annualEnergyCostYearOne: number,
  annualMaintenanceCost: number,
  analysisPeriodYears: number,
  discountRateFraction: number,
  energyPriceEscalationFraction: number,
  replacements: readonly Replacement[],
  residualValue: number,
): number {
  const years = Math.trunc(analysisPeriodYears);
  if (years < 0) throw new EconomicsError("analysisPeriodYears must be non-negative");
  if (discountRateFraction <= -1 || energyPriceEscalationFraction <= -1) {
    throw new EconomicsError("Discount and escalation fractions must exceed -1");
  }
  const replacementByYear = new Map<number, number>();
  for (const replacement of replacements) {
    const year = Math.trunc(replacement.year);
    if (year < 1 || year > years) {
      throw new EconomicsError("Replacement year must be inside the analysis period");
    }
    replacementByYear.set(year, (replacementByYear.get(year) ?? 0) + replacement.cost);
  }
  let total = installedCost;
  for (let year = 1; year <= years; year += 1) {
    const energy = annualEnergyCostYearOne * (1 + energyPriceEscalationFraction) ** (year - 1);
    const annual = energy + annualMaintenanceCost + (replacementByYear.get(year) ?? 0);
    total += annual / (1 + discountRateFraction) ** year;
  }
  total -= years === 0
    ? residualValue
    : residualValue / (1 + discountRateFraction) ** years;
  return total;
}

export function compareLifecycleCosts(
  parameters: EconomicsParameters,
  gshpAnnualEnergyCost: number | null,
  ashpAnnualEnergyCost: number | null,
  absoluteTolerance: number,
): EconomicsResult {
  if (
    parameters.gshp_installed_cost === null ||
    parameters.ashp_installed_cost === null ||
    gshpAnnualEnergyCost === null ||
    ashpAnnualEnergyCost === null
  ) {
    return {
      incrementalInstalledCost: null,
      annualOperatingCostSaving: null,
      simplePaybackYears: null,
      gshpLifecycleCost: null,
      ashpLifecycleCost: null,
      npvOfGshpChoice: null,
    };
  }
  const incrementalInstalledCost =
    parameters.gshp_installed_cost - parameters.ashp_installed_cost;
  const annualOperatingCostSaving =
    ashpAnnualEnergyCost + parameters.ashp_annual_maintenance_cost -
    gshpAnnualEnergyCost - parameters.gshp_annual_maintenance_cost;
  const gshpLifecycleCost = lifecycleCost(
    parameters.gshp_installed_cost,
    gshpAnnualEnergyCost,
    parameters.gshp_annual_maintenance_cost,
    parameters.analysis_period_years,
    parameters.discount_rate_fraction,
    parameters.electricity_price_escalation_fraction,
    parameters.gshp_replacements,
    parameters.gshp_residual_value,
  );
  const ashpLifecycleCost = lifecycleCost(
    parameters.ashp_installed_cost,
    ashpAnnualEnergyCost,
    parameters.ashp_annual_maintenance_cost,
    parameters.analysis_period_years,
    parameters.discount_rate_fraction,
    parameters.electricity_price_escalation_fraction,
    parameters.ashp_replacements,
    parameters.ashp_residual_value,
  );
  return {
    incrementalInstalledCost,
    annualOperatingCostSaving,
    simplePaybackYears: simplePaybackYears(
      incrementalInstalledCost,
      annualOperatingCostSaving,
      absoluteTolerance,
    ),
    gshpLifecycleCost,
    ashpLifecycleCost,
    npvOfGshpChoice: ashpLifecycleCost - gshpLifecycleCost,
  };
}
