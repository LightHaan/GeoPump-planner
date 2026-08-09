import type { DecisionParameters } from "../parameters/types";
import type { EconomicsResult } from "./types";

export type EvidenceQuality = "good" | "moderate" | "limited" | "unavailable";

export interface DecisionEvidenceInput {
  surfaceDatasetId: "air_t" | "surface_t";
  deltaT20EbkPredictionSeC: number | null;
  nearestBoreholeKm: number | null;
  certificateCount: number | null;
}

export interface DecisionResult {
  technical: "recommended" | "not_recommended" | "not_assessed";
  economic: "recommended" | "not_recommended" | "not_assessed";
  overall: "recommended" | "conditional" | "not_recommended" | "not_assessed";
  evidenceQuality: EvidenceQuality;
  evidence: {
    deltaT20StandardErrorApplicability: "applicable" | "not_applicable";
    deltaT20Quality: EvidenceQuality | "not_applicable";
    boreholeDistanceQuality: EvidenceQuality;
    certificateCountQuality: EvidenceQuality;
  };
  reasons: string[];
}

function twoThresholdQuality(
  value: number | null,
  goodMax: number,
  moderateMax: number,
): EvidenceQuality {
  if (value === null || !Number.isFinite(value)) return "unavailable";
  if (value <= goodMax) return "good";
  if (value <= moderateMax) return "moderate";
  return "limited";
}

function worstQuality(values: readonly EvidenceQuality[]): EvidenceQuality {
  const ranks: Record<EvidenceQuality, number> = {
    good: 0,
    moderate: 1,
    limited: 2,
    unavailable: 3,
  };
  return values.reduce((worst, value) => ranks[value] > ranks[worst] ? value : worst, "good");
}

export function evaluateDecision(
  relativeElectricitySavingFraction: number | null,
  economics: EconomicsResult,
  evidence: DecisionEvidenceInput,
  parameters: DecisionParameters,
): DecisionResult {
  const reasons: string[] = [];
  const technical = relativeElectricitySavingFraction === null
    ? "not_assessed"
    : relativeElectricitySavingFraction >= parameters.minimum_technical_saving_fraction
      ? "recommended"
      : "not_recommended";
  if (technical === "not_assessed") reasons.push("Air-source reference electricity is zero, so relative technical saving is not defined.");
  if (technical === "not_recommended") reasons.push("Electricity saving is below the configured technical threshold.");

  const economic = economics.npvOfGshpChoice === null || economics.simplePaybackYears === null
    ? "not_assessed"
    : economics.npvOfGshpChoice >= parameters.npv_threshold &&
        economics.simplePaybackYears <= parameters.maximum_acceptable_payback_years
      ? "recommended"
      : "not_recommended";
  if (economic === "not_assessed") reasons.push("Economic inputs are incomplete or the simple payback is not finite.");
  if (economic === "not_recommended") reasons.push("NPV or simple payback does not meet the configured economic threshold.");

  const deltaT20Applicable = evidence.surfaceDatasetId === "surface_t";
  const deltaT20Quality = deltaT20Applicable
    ? twoThresholdQuality(
        evidence.deltaT20EbkPredictionSeC,
        parameters.delta_t20_ebk_prediction_se_good_max_c,
        parameters.delta_t20_ebk_prediction_se_moderate_max_c,
      )
    : "not_applicable";
  const boreholeDistanceQuality = twoThresholdQuality(
    evidence.nearestBoreholeKm,
    parameters.nearest_borehole_good_max_km,
    parameters.nearest_borehole_moderate_max_km,
  );
  const certificateCountQuality: EvidenceQuality = evidence.certificateCount === null
    ? "unavailable"
    : evidence.certificateCount >= parameters.minimum_certificate_count
      ? "good"
      : "limited";
  const applicableQualities: EvidenceQuality[] = [
    boreholeDistanceQuality,
    certificateCountQuality,
  ];
  if (deltaT20Quality !== "not_applicable") applicableQualities.push(deltaT20Quality);
  const evidenceQuality = worstQuality(applicableQualities);
  if (evidenceQuality === "limited" || evidenceQuality === "unavailable") {
    reasons.push("Input evidence quality requires caution under the configured thresholds.");
  }

  let overall: DecisionResult["overall"];
  if (technical === "not_recommended" || economic === "not_recommended") overall = "not_recommended";
  else if (technical === "not_assessed" && economic === "not_assessed") overall = "not_assessed";
  else if (technical === "recommended" && economic === "recommended" && evidenceQuality === "good") overall = "recommended";
  else overall = "conditional";
  return {
    technical,
    economic,
    overall,
    evidenceQuality,
    evidence: {
      deltaT20StandardErrorApplicability: deltaT20Applicable ? "applicable" : "not_applicable",
      deltaT20Quality,
      boreholeDistanceQuality,
      certificateCountQuality,
    },
    reasons,
  };
}
