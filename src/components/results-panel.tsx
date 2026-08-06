import type { PostcodeScenarioOutcome } from "../app/model";
import { MonthlyChart } from "./monthly-chart";

interface ResultsPanelProps {
  outcome: PostcodeScenarioOutcome | null;
  calculationError: string | null;
  loading: boolean;
  currency: string;
}

function number(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return "Not assessed";
  const displayValue = Math.abs(value) < 1e-9 ? 0 : value;
  return displayValue.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

const decisionLabels = {
  recommended: "Proceed to detailed assessment",
  conditional: "Conditionally recommended",
  not_recommended: "Not recommended with current inputs",
  not_assessed: "Not assessed",
} as const;

export function ResultsPanel({ outcome, calculationError, loading, currency }: ResultsPanelProps) {
  if (loading) {
    return <section className="results-placeholder" aria-live="polite">Loading climate data for this postcode…</section>;
  }
  if (calculationError !== null) {
    return (
      <section className="results-placeholder error-panel" role="alert">
        <strong>Calculation unavailable</strong>
        <p>{calculationError}</p>
        <p>Complete the missing inputs or select another postcode with climate data.</p>
      </section>
    );
  }
  if (outcome === null) {
    return <section className="results-placeholder">Select a postcode to display results.</section>;
  }
  const { scenario, decision, ground } = outcome;
  const monthly = (values: Record<string, number>) =>
    Array.from({ length: 12 }, (_, index) => values[String(index + 1)] ?? 0);
  const saving = scenario.comparison.relativeElectricitySavingFraction;
  const allWarnings = [...new Set([...ground.warnings, ...scenario.warnings])];
  return (
    <section className="results-section" aria-live="polite">
      <header className="results-header">
        <div>
          <p className="eyebrow">Calculated results · {scenario.postcode}</p>
          <h2>GSHP and ASHP comparison</h2>
        </div>
        <span className={`decision-badge decision-${decision.overall}`}>
          {decisionLabels[decision.overall]}
        </span>
      </header>

      <div className="metric-grid">
        <article className="metric-card highlight">
          <span>Ground temperature at target depth</span>
          <strong>{number(ground.groundTemperatureC, 2)}°C</strong>
          <small>{ground.mode}</small>
        </article>
        <article className="metric-card">
          <span>Model-allocated load</span>
          <strong>{number(scenario.loads.totalAnnual)} kWh/year</strong>
          <small>Heating {number(scenario.loads.heating.annual)} · Cooling {number(scenario.loads.cooling.annual)}</small>
        </article>
        <article className="metric-card gshp-card">
          <span>GSHP annual electricity</span>
          <strong>{number(scenario.gshp.systemElectricity.annual)} kWh</strong>
          <small>APF {number(scenario.gshp.annualPerformanceFactor, 2)}</small>
        </article>
        <article className="metric-card ashp-card">
          <span>ASHP annual electricity</span>
          <strong>{number(scenario.ashp.systemElectricity.annual)} kWh</strong>
          <small>APF {number(scenario.ashp.annualPerformanceFactor, 2)}</small>
        </article>
        <article className="metric-card">
          <span>GSHP relative electricity saving</span>
          <strong>{saving === null ? "Undefined" : `${number(saving * 100, 1)}%`}</strong>
          <small>{number(scenario.comparison.annualElectricitySavingKwh)} kWh/year</small>
        </article>
        <article className="metric-card">
          <span>Annual energy cost (GSHP / ASHP)</span>
          <strong>
            {number(scenario.comparison.gshpAnnualEnergyCost)} / {number(scenario.comparison.ashpAnnualEnergyCost)}
          </strong>
          <small>{scenario.comparison.gshpAnnualEnergyCost === null ? `${currency}; enter a tariff to assess` : `${currency}; calculated with current tariff`}</small>
        </article>
        <article className="metric-card">
          <span>NPV of choosing GSHP</span>
          <strong>{number(scenario.economics.npvOfGshpChoice)} {currency}</strong>
          <small>Payback {number(scenario.economics.simplePaybackYears, 1)} years</small>
        </article>
        <article className="metric-card">
          <span>Evidence quality</span>
          <strong>{decision.evidenceQuality}</strong>
          <small>Technical {decision.technical} · Economic {decision.economic}</small>
        </article>
      </div>

      <div className="trace-strip">
        <span>Certificate heating input: {number(scenario.calculationTrace.requestedAnnualHeatingKwh)} kWh</span>
        <span>Unallocated heating: {number(scenario.calculationTrace.unallocatedAnnualHeatingKwh)} kWh</span>
        <span>Certificate cooling input: {number(scenario.calculationTrace.requestedAnnualCoolingKwh)} kWh</span>
        <span>Unallocated cooling: {number(scenario.calculationTrace.unallocatedAnnualCoolingKwh)} kWh</span>
      </div>

      <div className="chart-grid-layout">
        <MonthlyChart
          title="Monthly thermal load"
          unit="kWh"
          series={[
            { label: "Heating", color: "#df7b47", values: monthly(scenario.loads.heating.monthly) },
            { label: "Cooling", color: "#4a9fbd", values: monthly(scenario.loads.cooling.monthly) },
          ]}
        />
        <MonthlyChart
          title="Monthly system electricity"
          unit="kWh"
          series={[
            { label: "GSHP", color: "#296f67", values: monthly(scenario.gshp.systemElectricity.monthly) },
            { label: "ASHP", color: "#8574b8", values: monthly(scenario.ashp.systemElectricity.monthly) },
          ]}
        />
      </div>

      <details className="result-method-note">
        <summary>How the headline indicators are calculated</summary>
        <div className="result-method-grid">
          <p><strong>Allocated load</strong><span>Certificate load is scaled by area, building count and factors, then distributed in proportion to weighted degree-hours.</span></p>
          <p><strong>System electricity</strong><span>Allocated thermal load ÷ COP, plus the configured proportional and fixed auxiliaries.</span></p>
          <p><strong>APF</strong><span>Total allocated heating + cooling load ÷ total system electricity.</span></p>
          <p><strong>Relative saving</strong><span>(ASHP electricity − GSHP electricity) ÷ ASHP electricity.</span></p>
          <p><strong>Annual cost</strong><span>Energy charge plus daily and annual fixed charges under the selected tariff.</span></p>
          <p><strong>NPV of choosing GSHP</strong><span>ASHP lifecycle cost − GSHP lifecycle cost; a positive value favours GSHP.</span></p>
        </div>
      </details>

      {(allWarnings.length > 0 || decision.reasons.length > 0) && (
        <details className="warning-list" open={allWarnings.some((item) => item.includes("degree-hours are zero"))}>
          <summary>Assumptions, warnings and decision notes ({allWarnings.length + decision.reasons.length})</summary>
          <ul>
            {[...allWarnings, ...decision.reasons].map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        </details>
      )}
      <p className="screening-note">This postcode-level screening result is not a borehole design, thermal-response test or engineering quotation.</p>
    </section>
  );
}
