import { ElectricityError } from "./errors";

export function compressorElectricity(
  thermalLoadsKwh: readonly number[],
  cops: readonly (number | null)[],
  invalidHourPolicy: "stop" | "clip" | "ignore",
  absoluteTolerance: number,
): [number[], number] {
  if (thermalLoadsKwh.length !== cops.length) {
    throw new ElectricityError("thermal loads and COPs must have the same length");
  }
  const tolerance = Math.abs(absoluteTolerance);
  const values: number[] = [];
  let invalidCount = 0;
  thermalLoadsKwh.forEach((thermal, index) => {
    const cop = cops[index];
    if (!Number.isFinite(thermal) || thermal < -tolerance) {
      throw new ElectricityError(`Thermal load at index ${index} is invalid`);
    }
    if (thermal <= tolerance) {
      values.push(0);
    } else if (cop === undefined || cop === null || !Number.isFinite(cop) || cop <= tolerance) {
      invalidCount += 1;
      if (invalidHourPolicy === "ignore") values.push(0);
      else throw new ElectricityError(`Invalid COP at active-load index ${index}`);
    } else {
      values.push(thermal / cop);
    }
  });
  return [values, invalidCount];
}

export function addAuxiliaryElectricity(
  compressorValuesKwh: readonly number[],
  recordWeightsHours: readonly number[],
  pumpFractionOfCompressor: number,
  fanFractionOfCompressor: number,
  miscFractionOfCompressor: number,
  fixedAuxiliaryKwhPerYear: number,
  absoluteTolerance: number,
): number[] {
  if (compressorValuesKwh.length !== recordWeightsHours.length) {
    throw new ElectricityError("compressor values and weights must have the same length");
  }
  const fractions = [
    pumpFractionOfCompressor,
    fanFractionOfCompressor,
    miscFractionOfCompressor,
  ];
  if (fractions.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new ElectricityError("Auxiliary fractions must be finite and non-negative");
  }
  if (!Number.isFinite(fixedAuxiliaryKwhPerYear) || fixedAuxiliaryKwhPerYear < 0) {
    throw new ElectricityError("Fixed auxiliary electricity must be finite and non-negative");
  }
  const totalWeight = recordWeightsHours.reduce((sum, weight) => sum + weight, 0);
  if (fixedAuxiliaryKwhPerYear > absoluteTolerance && totalWeight <= absoluteTolerance) {
    throw new ElectricityError("Cannot allocate fixed auxiliary electricity with zero weight");
  }
  const multiplier = 1 + fractions.reduce((sum, value) => sum + value, 0);
  return compressorValuesKwh.map(
    (compressor, index) =>
      compressor * multiplier +
      (fixedAuxiliaryKwhPerYear <= absoluteTolerance
        ? 0
        : fixedAuxiliaryKwhPerYear * recordWeightsHours[index]! / totalWeight),
  );
}

export function performanceFactor(
  deliveredThermalEnergyKwh: number,
  systemElectricityKwh: number,
  absoluteTolerance: number,
): number | null {
  if (systemElectricityKwh <= Math.abs(absoluteTolerance)) return null;
  return deliveredThermalEnergyKwh / systemElectricityKwh;
}
