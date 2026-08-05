export interface ClimateRecord {
  dayOfYear: number;
  hourUtc: number;
  month: number;
  airTempC: number;
  weightHours: number;
}

export interface GroundTemperatureResult {
  mode: "surface_gradient" | "surface_borehole_interpolation" | "direct";
  groundTemperatureC: number;
  targetDepthM: number | null;
  surfaceTemperatureC: number | null;
  gradientCPerM: number | null;
  boreholeTemperatureC: number | null;
  boreholeDepthM: number | null;
  extrapolated: boolean;
  warnings: string[];
  trace: Record<string, string | number>;
}

export interface CopResult {
  value: number | null;
  rawValue: number;
  valid: boolean;
  clipped: boolean;
  warnings: string[];
}

export interface ValueAggregate {
  annual: number;
  selectedPeriod: number;
  monthly: Record<string, number>;
  monthlySelectedPeriod: Record<string, number>;
}

export interface SeasonalLoadResult {
  heating: number;
  cooling: number;
  total: number;
  heatingSelectedPeriod: number;
  coolingSelectedPeriod: number;
  totalSelectedPeriod: number;
}

export interface SeasonalSystemResult {
  heatingElectricity: number;
  heatingSelectedPeriodElectricity: number;
  coolingElectricity: number;
  coolingSelectedPeriodElectricity: number;
  totalElectricity: number;
  totalSelectedPeriodElectricity: number;
  performanceFactor: number | null;
  selectedPeriodPerformanceFactor: number | null;
}

export interface SystemResult {
  systemId: "gshp" | "ashp";
  heatingCompressorElectricity: ValueAggregate;
  coolingCompressorElectricity: ValueAggregate;
  systemElectricity: ValueAggregate;
  annualPerformanceFactor: number | null;
  selectedPeriodPerformanceFactor: number | null;
  seasonal: Record<string, SeasonalSystemResult>;
  invalidHeatingHourCount: number;
  invalidCoolingHourCount: number;
  warnings: string[];
  copTrace: {
    modelId: string;
    heatingCopGroundOrHourlySource: Array<number | null>;
    coolingCopGroundOrHourlySource: Array<number | null>;
  };
}

export interface TariffCostBreakdown {
  energyCharge: number | null;
  fixedCharge: number;
  totalCost: number | null;
}

export interface EconomicsResult {
  incrementalInstalledCost: number | null;
  annualOperatingCostSaving: number | null;
  simplePaybackYears: number | null;
  gshpLifecycleCost: number | null;
  ashpLifecycleCost: number | null;
  npvOfGshpChoice: number | null;
}

export interface ScenarioResult {
  postcode: string;
  groundTemperatureC: number;
  degreeHours: { heating: number; cooling: number };
  loads: {
    heating: ValueAggregate;
    cooling: ValueAggregate;
    totalAnnual: number;
    seasonal: Record<string, SeasonalLoadResult>;
  };
  gshp: SystemResult;
  ashp: SystemResult;
  comparison: {
    annualElectricitySavingKwh: number;
    relativeElectricitySavingFraction: number | null;
    gshpAnnualEnergyCost: number | null;
    ashpAnnualEnergyCost: number | null;
    gshpTariffCostBreakdown: TariffCostBreakdown;
    ashpTariffCostBreakdown: TariffCostBreakdown;
  };
  economics: EconomicsResult;
  warnings: string[];
  calculationTrace: {
    recordCount: number;
    weightHoursTotal: number;
    absoluteLoadMultiplier: number;
    requestedAnnualHeatingKwh: number;
    requestedAnnualCoolingKwh: number;
    unallocatedAnnualHeatingKwh: number;
    unallocatedAnnualCoolingKwh: number;
    groundSourceTemperatureMode: "constant";
    ashpSourceTemperatureMode: "record_air_temperature";
    analysisPeriodEnabled: boolean;
    analysisPeriodLabel: string;
    analysisPeriodMode: string;
    analysisPeriodRecordCount: number;
  };
}
