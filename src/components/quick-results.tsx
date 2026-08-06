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
  recommended: "Proceed to detailed assessment",
  conditional: "Conditional result",
  not_recommended: "Not recommended with current inputs",
  not_assessed: "Not assessed",
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
  return (
    <section className="quick-results" aria-live="polite">
      <div className="quick-results-heading">
        <div>
          <span>Postcode {scenario.postcode}</span>
          <h2>Screening result</h2>
        </div>
        <div className="decision-summary" role="status">
          <span className="decision-kicker">Decision status</span>
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
          <span>Ground temperature</span>
          <strong>{number(ground.groundTemperatureC, 2)} °C</strong>
          <small>At the selected depth</small>
        </article>
        <article>
          <span>GSHP electricity</span>
          <strong>{number(scenario.gshp.systemElectricity.annual)} kWh/year</strong>
          <small>ASHP: {number(scenario.ashp.systemElectricity.annual)} kWh/year</small>
        </article>
        <article>
          <span>Electricity saving</span>
          <strong>{saving === null ? "Undefined" : `${number(saving * 100)}%`}</strong>
          <small>GSHP compared with ASHP</small>
        </article>
        <article>
          <span>Annual energy cost</span>
          <strong>{number(scenario.comparison.gshpAnnualEnergyCost)} {currency}</strong>
          <small>
            {scenario.comparison.gshpAnnualEnergyCost === null
              ? "Enter an electricity price to assess"
              : `ASHP: ${number(scenario.comparison.ashpAnnualEnergyCost)} ${currency}`}
          </small>
        </article>
      </div>
      <a className="text-link" href="#results">View the full comparison →</a>
    </section>
  );
}
