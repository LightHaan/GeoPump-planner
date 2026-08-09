import type { PostcodeScenarioOutcome } from "../app/model";

interface QuickResultsProps {
  outcome: PostcodeScenarioOutcome | null;
  loading: boolean;
  error: string | null;
  currency: string;
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

export function QuickResults({ outcome, loading, error, currency }: QuickResultsProps) {
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
          <span>Estimated annual electricity</span>
          <strong>{number(scenario.gshp.systemElectricity.annual)} kWh/year</strong>
          <small>Ground-source above · Air-source: {number(scenario.ashp.systemElectricity.annual)} kWh/year</small>
        </article>
        <article>
          <span>Estimated electricity reduction</span>
          <strong>{saving === null ? "Undefined" : `${number(saving * 100)}%`}</strong>
          <small>Ground-source compared with air-source</small>
        </article>
        <article>
          <span>Estimated annual cost saving</span>
          <strong>{annualCostSaving === null ? "Add electricity price" : `${number(annualCostSaving)} ${currency}/year`}</strong>
          <small>
            {annualCostSaving === null
              ? "Enter your electricity price above"
              : `Ground-source: ${number(scenario.comparison.gshpAnnualEnergyCost)} · Air-source: ${number(scenario.comparison.ashpAnnualEnergyCost)} ${currency}`}
          </small>
        </article>
      </div>
      <a className="text-link" href="#results">View the full comparison →</a>
    </section>
  );
}
