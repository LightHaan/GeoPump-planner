import type { PostcodeScenarioOutcome } from "../app/model";
import type { LoadParameters } from "../parameters/types";

interface QuickResultsProps {
  outcome: PostcodeScenarioOutcome | null;
  loading: boolean;
  error: string | null;
  currency: string;
  loadParameters: LoadParameters;
}

function number(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return "Not assessed";
  return value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

const decisionLabels = {
  recommended: "Worth investigating further",
  conditional: "Potentially suitable — review inputs",
  not_recommended: "Unlikely to save with current inputs",
  not_assessed: "More information needed",
} as const;

function scenarioBasis(parameters: LoadParameters): string {
  const area = number(parameters.conditioned_floor_area_m2);
  const buildings = number(parameters.building_count);
  return parameters.building_count === 1
    ? `${area} m² heated/cooled floor area in one modelled building`
    : `${area} m² heated/cooled floor area per building across ${buildings} modelled buildings`;
}

function percentageComparison(savingFraction: number | null): string {
  if (savingFraction === null) return "Not available";
  return savingFraction >= 0
    ? `${number(savingFraction * 100)}% less`
    : `${number(Math.abs(savingFraction) * 100)}% more`;
}

export function QuickResults({ outcome, loading, error, currency, loadParameters }: QuickResultsProps) {
  if (loading) return <section className="quick-results quick-results-empty">Calculating…</section>;
  if (outcome === null) {
    return (
      <section className="quick-results quick-results-empty" role={error === null ? undefined : "alert"}>
        {error ?? "Select a postcode to calculate a result."}
      </section>
    );
  }
  const { scenario, ground, decision } = outcome;
  const saving = scenario.comparison.relativeElectricitySavingFraction;
  const annualCostSaving = scenario.comparison.gshpAnnualEnergyCost === null || scenario.comparison.ashpAnnualEnergyCost === null
    ? null
    : scenario.comparison.ashpAnnualEnergyCost - scenario.comparison.gshpAnnualEnergyCost;
  const customLoadAdjustment = loadParameters.load_scaling_factor !== 1 || loadParameters.occupancy_use_factor !== 1;
  return (
    <section className="quick-results" aria-live="polite">
      <div className="quick-results-heading">
        <div>
          <span>Postcode {scenario.postcode}</span>
          <h2>Screening result</h2>
        </div>
        <div className="decision-summary" role="status">
          <span className="decision-kicker">Overall indication</span>
          <strong className={`decision-pill decision-${decision.overall}`}>
            {decisionLabels[decision.overall]}
          </strong>
          {decision.overall === "conditional" && (
            <a className="decision-action" href="#customise">Review assumptions →</a>
          )}
        </div>
      </div>
      <div className="quick-result-grid">
        <article>
          <span>Estimated ground temperature</span>
          <strong>{number(ground.groundTemperatureC, 2)} °C</strong>
          <small>At the selected depth</small>
        </article>
        <article>
          <span>Ground-source annual electricity</span>
          <strong>{number(scenario.gshp.systemElectricity.annual)} kWh/year</strong>
          <small>Air-source: {number(scenario.ashp.systemElectricity.annual)} kWh/year</small>
        </article>
        <article>
          <span>Ground-source electricity use</span>
          <strong>{percentageComparison(saving)}</strong>
          <small>Ground-source compared with air-source</small>
        </article>
        <article>
          <span>Ground-source annual running cost</span>
          <strong>{annualCostSaving === null ? "Add electricity price" : `${number(scenario.comparison.gshpAnnualEnergyCost)} ${currency}/year`}</strong>
          <small>
            {annualCostSaving === null
              ? "Enter your electricity price above"
              : `Air-source: ${number(scenario.comparison.ashpAnnualEnergyCost)} ${currency}/year · ${annualCostSaving >= 0 ? "Saving" : "Extra cost"}: ${number(Math.abs(annualCostSaving))} ${currency}/year`}
          </small>
        </article>
      </div>
      <p className="result-scale-note">
        Annual electricity and cost figures are current-scenario totals for {scenarioBasis(loadParameters)}, not per-square-metre values.
        {customLoadAdjustment && " Custom load adjustment factors are also applied."} Change the floor area above or use <a href="#customise">Customise</a> for other load settings.
      </p>
      <a className="text-link" href="#results">View the full comparison →</a>
    </section>
  );
}
