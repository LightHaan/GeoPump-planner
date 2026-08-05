import { calculateCop } from "../cop-models/registry";
import type {
  AuxiliaryElectricityParameters,
  CopModelParameters,
  ScenarioParameters,
} from "../parameters/types";
import { assertValidScenarioParameters } from "../parameters/validation";
import { analysisPeriodFlags } from "./analysis-period";
import {
  aggregateValues,
  allocateAnnualLoad,
  validateClimateRecords,
  weightedDegreeHours,
} from "./degree-hours";
import { compareLifecycleCosts } from "./economics";
import {
  addAuxiliaryElectricity,
  compressorElectricity,
  performanceFactor,
} from "./electricity";
import { annualTariffCost } from "./tariff";
import type {
  ClimateRecord,
  ScenarioResult,
  SeasonalLoadResult,
  SeasonalSystemResult,
  SystemResult,
  ValueAggregate,
} from "./types";

export interface ScenarioInput {
  postcode: string;
  records: readonly ClimateRecord[];
  latitudeDeg: number;
  longitudeDeg: number;
  groundTemperatureC: number;
  annualHeatingKwhM2: number;
  annualCoolingKwhM2: number;
}

function copSeries(
  mode: "heating" | "cooling",
  sourcesC: readonly number[],
  thermalLoadsKwh: readonly number[],
  parameters: CopModelParameters,
  absoluteTolerance: number,
): { values: Array<number | null>; warnings: string[] } {
  const values: Array<number | null> = [];
  const warnings: string[] = [];
  sourcesC.forEach((source, index) => {
    if (thermalLoadsKwh[index]! <= absoluteTolerance) {
      values.push(null);
      return;
    }
    const result = calculateCop(mode, source, parameters, absoluteTolerance);
    values.push(result.value);
    warnings.push(...result.warnings);
  });
  return { values, warnings };
}

function seasonalAmount(
  aggregate: ValueAggregate,
  months: readonly number[],
  selectedPeriod = false,
): number {
  const values = selectedPeriod ? aggregate.monthlySelectedPeriod : aggregate.monthly;
  return months.reduce((sum, month) => sum + (values[String(month)] ?? 0), 0);
}

function seasonalLoads(
  heating: ValueAggregate,
  cooling: ValueAggregate,
  seasonMonths: Record<string, number[]>,
): Record<string, SeasonalLoadResult> {
  return Object.fromEntries(
    Object.entries(seasonMonths).map(([season, months]) => {
      const heat = seasonalAmount(heating, months);
      const cool = seasonalAmount(cooling, months);
      const heatSelected = seasonalAmount(heating, months, true);
      const coolSelected = seasonalAmount(cooling, months, true);
      return [
        season,
        {
          heating: heat,
          cooling: cool,
          total: heat + cool,
          heatingSelectedPeriod: heatSelected,
          coolingSelectedPeriod: coolSelected,
          totalSelectedPeriod: heatSelected + coolSelected,
        },
      ];
    }),
  );
}

function systemResults(
  systemId: "gshp" | "ashp",
  records: readonly ClimateRecord[],
  heatingLoads: readonly number[],
  coolingLoads: readonly number[],
  sourceTemperaturesC: readonly number[],
  copParameters: CopModelParameters,
  electricityParameters: AuxiliaryElectricityParameters,
  seasonMonths: Record<string, number[]>,
  selectedPeriodFlags: readonly boolean[],
  absoluteTolerance: number,
): SystemResult {
  const heatingCop = copSeries(
    "heating",
    sourceTemperaturesC,
    heatingLoads,
    copParameters,
    absoluteTolerance,
  );
  const coolingCop = copSeries(
    "cooling",
    sourceTemperaturesC,
    coolingLoads,
    copParameters,
    absoluteTolerance,
  );
  const [heatingCompressor, invalidHeating] = compressorElectricity(
    heatingLoads,
    heatingCop.values,
    copParameters.invalid_cop_policy,
    absoluteTolerance,
  );
  const [coolingCompressor, invalidCooling] = compressorElectricity(
    coolingLoads,
    coolingCop.values,
    copParameters.invalid_cop_policy,
    absoluteTolerance,
  );
  const combinedCompressor = heatingCompressor.map(
    (heating, index) => heating + coolingCompressor[index]!,
  );
  const systemElectricity = addAuxiliaryElectricity(
    combinedCompressor,
    records.map((record) => record.weightHours),
    electricityParameters.pump_fraction_of_compressor,
    electricityParameters.fan_fraction_of_compressor,
    electricityParameters.misc_fraction_of_compressor,
    electricityParameters.fixed_auxiliary_kwh_per_year,
    absoluteTolerance,
  );
  const heatingAggregate = aggregateValues(records, heatingCompressor, selectedPeriodFlags);
  const coolingAggregate = aggregateValues(records, coolingCompressor, selectedPeriodFlags);
  const systemAggregate = aggregateValues(records, systemElectricity, selectedPeriodFlags);
  const heatingLoadAggregate = aggregateValues(records, heatingLoads, selectedPeriodFlags);
  const coolingLoadAggregate = aggregateValues(records, coolingLoads, selectedPeriodFlags);
  const loadsBySeason = seasonalLoads(
    heatingLoadAggregate,
    coolingLoadAggregate,
    seasonMonths,
  );
  const seasonal: Record<string, SeasonalSystemResult> = {};
  for (const [season, months] of Object.entries(seasonMonths)) {
    const heatingAll = seasonalAmount(heatingAggregate, months);
    const heatingSelected = seasonalAmount(heatingAggregate, months, true);
    const coolingAll = seasonalAmount(coolingAggregate, months);
    const coolingSelected = seasonalAmount(coolingAggregate, months, true);
    const totalAll = seasonalAmount(systemAggregate, months);
    const totalSelected = seasonalAmount(systemAggregate, months, true);
    const seasonLoads = loadsBySeason[season]!;
    seasonal[season] = {
      heatingElectricity: heatingAll,
      heatingSelectedPeriodElectricity: heatingSelected,
      coolingElectricity: coolingAll,
      coolingSelectedPeriodElectricity: coolingSelected,
      totalElectricity: totalAll,
      totalSelectedPeriodElectricity: totalSelected,
      performanceFactor: performanceFactor(seasonLoads.total, totalAll, absoluteTolerance),
      selectedPeriodPerformanceFactor: performanceFactor(
        seasonLoads.totalSelectedPeriod,
        totalSelected,
        absoluteTolerance,
      ),
    };
  }
  let selectedThermal = 0;
  heatingLoads.forEach((load, index) => {
    if (selectedPeriodFlags[index]) selectedThermal += load;
  });
  coolingLoads.forEach((load, index) => {
    if (selectedPeriodFlags[index]) selectedThermal += load;
  });
  return {
    systemId,
    heatingCompressorElectricity: heatingAggregate,
    coolingCompressorElectricity: coolingAggregate,
    systemElectricity: systemAggregate,
    annualPerformanceFactor: performanceFactor(
      heatingLoadAggregate.annual + coolingLoadAggregate.annual,
      systemAggregate.annual,
      absoluteTolerance,
    ),
    selectedPeriodPerformanceFactor: performanceFactor(
      selectedThermal,
      systemAggregate.selectedPeriod,
      absoluteTolerance,
    ),
    seasonal,
    invalidHeatingHourCount: invalidHeating,
    invalidCoolingHourCount: invalidCooling,
    warnings: [...new Set([...heatingCop.warnings, ...coolingCop.warnings])].sort(),
    copTrace: {
      modelId: copParameters.model_id,
      heatingCopGroundOrHourlySource: heatingCop.values,
      coolingCopGroundOrHourlySource: coolingCop.values,
    },
  };
}

export function runScenario(
  input: ScenarioInput,
  parameters: ScenarioParameters,
): ScenarioResult {
  const config = structuredClone(parameters);
  assertValidScenarioParameters(config);
  const tolerance = config.numerical.absolute_tolerance;
  const warnings = validateClimateRecords(
    input.records,
    config.time.expected_annual_weight_hours,
    tolerance,
  );
  const selectedPeriod = analysisPeriodFlags(
    input.records,
    input.latitudeDeg,
    input.longitudeDeg,
    config.analysis_period,
    config.time,
  );
  const absoluteMultiplier =
    config.load.conditioned_floor_area_m2 *
    config.load.building_count *
    config.load.load_scaling_factor *
    config.load.occupancy_use_factor;
  const annualHeating = input.annualHeatingKwhM2 * absoluteMultiplier;
  const annualCooling = input.annualCoolingKwhM2 * absoluteMultiplier;
  const heatingLoads = allocateAnnualLoad(
    input.records,
    annualHeating,
    config.load.heating_balance_temperature_c,
    "heating",
    config.load.zero_degree_hour_policy,
    tolerance,
  );
  const coolingLoads = allocateAnnualLoad(
    input.records,
    annualCooling,
    config.load.cooling_balance_temperature_c,
    "cooling",
    config.load.zero_degree_hour_policy,
    tolerance,
  );
  const allocatedHeating = heatingLoads.reduce((sum, value) => sum + value, 0);
  const allocatedCooling = coolingLoads.reduce((sum, value) => sum + value, 0);
  const unallocatedHeating = annualHeating - allocatedHeating;
  const unallocatedCooling = annualCooling - allocatedCooling;
  if (unallocatedHeating > tolerance) {
    warnings.push(
      `Annual heating degree-hours are zero, so the model-allocated heating load is 0 kWh despite a ${annualHeating} kWh certificate-load input.`,
    );
  }
  if (unallocatedCooling > tolerance) {
    warnings.push(
      `Annual cooling degree-hours are zero, so the model-allocated cooling load is 0 kWh despite a ${annualCooling} kWh certificate-load input.`,
    );
  }
  const heatingAggregate = aggregateValues(input.records, heatingLoads, selectedPeriod);
  const coolingAggregate = aggregateValues(input.records, coolingLoads, selectedPeriod);
  const loads = {
    heating: heatingAggregate,
    cooling: coolingAggregate,
    totalAnnual: heatingAggregate.annual + coolingAggregate.annual,
    seasonal: seasonalLoads(heatingAggregate, coolingAggregate, config.time.season_months),
  };
  const gshp = systemResults(
    "gshp",
    input.records,
    heatingLoads,
    coolingLoads,
    input.records.map(() => input.groundTemperatureC),
    config.cop.gshp,
    config.electricity.gshp,
    config.time.season_months,
    selectedPeriod,
    tolerance,
  );
  const ashp = systemResults(
    "ashp",
    input.records,
    heatingLoads,
    coolingLoads,
    input.records.map((record) => record.airTempC),
    config.cop.ashp,
    config.electricity.ashp,
    config.time.season_months,
    selectedPeriod,
    tolerance,
  );
  const gshpEnergy = gshp.systemElectricity.annual;
  const ashpEnergy = ashp.systemElectricity.annual;
  const saving = ashpEnergy - gshpEnergy;
  const relativeSaving = ashpEnergy <= tolerance ? null : saving / ashpEnergy;
  const gshpTariff = annualTariffCost(
    gshpEnergy,
    gshp.systemElectricity.selectedPeriod,
    config.tariff,
    config.time.days_per_year,
    tolerance,
  );
  const ashpTariff = annualTariffCost(
    ashpEnergy,
    ashp.systemElectricity.selectedPeriod,
    config.tariff,
    config.time.days_per_year,
    tolerance,
  );
  const economics = compareLifecycleCosts(
    config.economics,
    gshpTariff.totalCost,
    ashpTariff.totalCost,
    tolerance,
  );
  warnings.push(...gshp.warnings, ...ashp.warnings);
  return {
    postcode: input.postcode,
    groundTemperatureC: input.groundTemperatureC,
    degreeHours: weightedDegreeHours(
      input.records,
      config.load.heating_balance_temperature_c,
      config.load.cooling_balance_temperature_c,
    ),
    loads,
    gshp,
    ashp,
    comparison: {
      annualElectricitySavingKwh: saving,
      relativeElectricitySavingFraction: relativeSaving,
      gshpAnnualEnergyCost: gshpTariff.totalCost,
      ashpAnnualEnergyCost: ashpTariff.totalCost,
      gshpTariffCostBreakdown: gshpTariff,
      ashpTariffCostBreakdown: ashpTariff,
    },
    economics,
    warnings: [...new Set(warnings)].sort(),
    calculationTrace: {
      recordCount: input.records.length,
      weightHoursTotal: input.records.reduce((sum, record) => sum + record.weightHours, 0),
      absoluteLoadMultiplier: absoluteMultiplier,
      requestedAnnualHeatingKwh: annualHeating,
      requestedAnnualCoolingKwh: annualCooling,
      unallocatedAnnualHeatingKwh: unallocatedHeating,
      unallocatedAnnualCoolingKwh: unallocatedCooling,
      groundSourceTemperatureMode: "constant",
      ashpSourceTemperatureMode: "record_air_temperature",
      analysisPeriodEnabled: config.analysis_period.enabled,
      analysisPeriodLabel: config.analysis_period.label,
      analysisPeriodMode: config.analysis_period.mode,
      analysisPeriodRecordCount: selectedPeriod.filter(Boolean).length,
    },
  };
}
