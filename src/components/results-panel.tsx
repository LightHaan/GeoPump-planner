import type { PostcodeScenarioOutcome } from "../app/model";
import type { EvidenceQuality } from "../engine/decision";
import type { LoadParameters } from "../parameters/types";
import { MonthlyChart } from "./monthly-chart";

interface ResultsPanelProps {
  outcome: PostcodeScenarioOutcome | null;
  calculationError: string | null;
  loading: boolean;
  currency: string;
  loadParameters: LoadParameters;
  analysisPeriodYears: number;
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
  recommended: "Worth investigating further",
  conditional: "Potentially suitable — review inputs",
  not_recommended: "Unlikely to save with current inputs",
  not_assessed: "More information needed",
} as const;

const groundMethodLabels = {
  surface_gradient: "Postcode estimate using surface temperature and estimated warming with depth",
  surface_borehole_interpolation: "User-entered surface and borehole temperatures",
  direct: "User-entered ground temperature",
} as const;

const evidenceLabels: Record<EvidenceQuality, string> = {
  good: "Good",
  moderate: "Moderate",
  limited: "Limited — use caution",
  unavailable: "Not available",
};

const assessmentLabels = {
  recommended: "Favourable",
  not_recommended: "Unfavourable",
  not_assessed: "Not assessed",
} as const;

function scenarioBasis(parameters: LoadParameters): string {
  const area = number(parameters.conditioned_floor_area_m2);
  const buildings = number(parameters.building_count);
  return parameters.building_count === 1
    ? `${area} m² of heated/cooled floor area`
    : `${area} m² of heated/cooled floor area in each of ${buildings} modelled buildings`;
}

function percentageComparison(savingFraction: number | null): string {
  if (savingFraction === null) return "Not available";
  return savingFraction >= 0
    ? `${number(savingFraction * 100, 1)}% less`
    : `${number(Math.abs(savingFraction) * 100, 1)}% more`;
}

function longTermComparison(value: number | null, currency: string): string {
  if (value === null) return "Add installed costs";
  return value >= 0
    ? `${number(value)} ${currency} in favour of ground-source`
    : `${number(Math.abs(value))} ${currency} in favour of air-source`;
}

export function ResultsPanel({
  outcome,
  calculationError,
  loading,
  currency,
  loadParameters,
  analysisPeriodYears,
}: ResultsPanelProps) {
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
  const annualCostSaving = scenario.comparison.gshpAnnualEnergyCost === null || scenario.comparison.ashpAnnualEnergyCost === null
    ? null
    : scenario.comparison.ashpAnnualEnergyCost - scenario.comparison.gshpAnnualEnergyCost;
  const customLoadAdjustment = loadParameters.load_scaling_factor !== 1 || loadParameters.occupancy_use_factor !== 1;
  const allWarnings = [...new Set([...ground.warnings, ...scenario.warnings])];
  return (
    <section className="results-section" aria-live="polite">
      <header className="results-header">
        <div>
          <p className="eyebrow">Calculated results · {scenario.postcode}</p>
          <h2>Ground-source and air-source comparison</h2>
        </div>
        {decision.overall === "conditional" ? (
          <a className={`decision-badge decision-${decision.overall}`} href="#customise">
            {decisionLabels[decision.overall]} →
          </a>
        ) : (
          <span className={`decision-badge decision-${decision.overall}`}>
            {decisionLabels[decision.overall]}
          </span>
        )}
      </header>

      <p className={`result-scale-note dark-scale-note${loadParameters.conditioned_floor_area_m2 === 1 ? " normalised-scale-note" : ""}`}>
        {loadParameters.conditioned_floor_area_m2 === 1
          ? <>The current calculation still uses the default <strong>1 m² normalised area</strong>. Enter the floor area you actually heat or cool on the <a href="#planner">Planner</a> before treating the electricity and cost as a whole-home estimate.</>
          : <>These annual heat-pump electricity and running-cost figures are totals for {scenarioBasis(loadParameters)}.</>}
        {customLoadAdjustment && " Custom load adjustment factors are also applied."} They cover modelled heating and cooling only, not the property&apos;s total electricity use or full electricity bill. Use <a href="#customise">Customise</a> for other load settings.
      </p>

      <div className="metric-grid">
        <article className="metric-card highlight">
          <span>Estimated ground temperature at selected depth</span>
          <strong>{number(ground.groundTemperatureC, 2)} °C</strong>
          <small>{groundMethodLabels[ground.mode]}</small>
        </article>
        <article className="metric-card">
          <span>Annual heating and cooling required</span>
          <strong>{number(scenario.loads.totalAnnual)} kWh/year</strong>
          <small>Heating: {number(scenario.loads.heating.annual)} kWh/year · Cooling: {number(scenario.loads.cooling.annual)} kWh/year</small>
        </article>
        <article className="metric-card gshp-card">
          <span>Ground-source annual electricity</span>
          <strong>{number(scenario.gshp.systemElectricity.annual)} kWh/year</strong>
          <small>Annual performance factor<sup className="term-marker"><a href="#results-note-apf" aria-label="Read note 1 about annual performance factor">1</a></sup>: {number(scenario.gshp.annualPerformanceFactor, 2)}</small>
        </article>
        <article className="metric-card ashp-card">
          <span>Air-source annual electricity</span>
          <strong>{number(scenario.ashp.systemElectricity.annual)} kWh/year</strong>
          <small>Annual performance factor: {number(scenario.ashp.annualPerformanceFactor, 2)}</small>
        </article>
        <article className="metric-card">
          <span>Ground-source electricity use</span>
          <strong>{percentageComparison(saving)}</strong>
          <small>{number(Math.abs(scenario.comparison.annualElectricitySavingKwh))} kWh/year {scenario.comparison.annualElectricitySavingKwh >= 0 ? "less" : "more"} than air-source</small>
        </article>
        <article className="metric-card">
          <span>Estimated heat-pump annual running cost</span>
          <strong>{annualCostSaving === null ? "Add electricity price" : `Ground-source: ${number(scenario.comparison.gshpAnnualEnergyCost)} ${currency}/year`}</strong>
          <small>{annualCostSaving === null
            ? "Enter an electricity price on Planner or Customise"
            : `Air-source: ${number(scenario.comparison.ashpAnnualEnergyCost)} ${currency}/year · ${annualCostSaving >= 0 ? "Saving" : "Extra cost"}: ${number(Math.abs(annualCostSaving))} ${currency}/year`}</small>
        </article>
        <article className="metric-card">
          <span>Long-term financial comparison</span>
          <strong>{longTermComparison(scenario.economics.npvOfGshpChoice, currency)}</strong>
          <small>{scenario.economics.npvOfGshpChoice === null
            ? "Enter electricity price and both installed costs on Customise"
            : `Today's value over ${number(analysisPeriodYears, 0)} years · ${scenario.economics.simplePaybackYears === null ? "No simple payback with current inputs" : `Payback: ${number(scenario.economics.simplePaybackYears, 1)} years`}`}</small>
        </article>
        <article className="metric-card">
          <span>Confidence in postcode data</span>
          <strong>{evidenceLabels[decision.evidenceQuality]}</strong>
          <small>Electricity comparison: {assessmentLabels[decision.technical]} · Financial comparison: {assessmentLabels[decision.economic]}</small>
        </article>
      </div>

      <details className="calculation-checks">
        <summary>Calculation checks for certificate-based demand</summary>
        <div className="trace-strip">
          <span>Certificate heating input: {number(scenario.calculationTrace.requestedAnnualHeatingKwh)} kWh</span>
          <span>Unallocated heating: {number(scenario.calculationTrace.unallocatedAnnualHeatingKwh)} kWh</span>
          <span>Certificate cooling input: {number(scenario.calculationTrace.requestedAnnualCoolingKwh)} kWh</span>
          <span>Unallocated cooling: {number(scenario.calculationTrace.unallocatedAnnualCoolingKwh)} kWh</span>
        </div>
      </details>

      <div className="chart-grid-layout">
        <MonthlyChart
          title="Monthly heating and cooling required"
          unit="kWh"
          series={[
            { label: "Heating", color: "#df7b47", values: monthly(scenario.loads.heating.monthly) },
            { label: "Cooling", color: "#4a9fbd", values: monthly(scenario.loads.cooling.monthly) },
          ]}
        />
        <MonthlyChart
          title="Monthly estimated electricity"
          unit="kWh"
          series={[
            { label: "Ground-source", color: "#296f67", values: monthly(scenario.gshp.systemElectricity.monthly) },
            { label: "Air-source", color: "#8574b8", values: monthly(scenario.ashp.systemElectricity.monthly) },
          ]}
        />
      </div>

      <details className="result-method-note">
        <summary>How the headline indicators are calculated</summary>
        <div className="result-method-grid">
          <p><strong>Allocated load</strong><span>Certificate load is scaled by area, building count and factors, then distributed in proportion to weighted degree-hours.</span></p>
          <p><strong>System electricity</strong><span>Allocated heating or cooling need ÷ COP<sup className="term-marker"><a href="#results-note-cop" aria-label="Read note 2 about COP">2</a></sup>, plus the configured supporting pump, fan and other electricity.</span></p>
          <p><strong>Annual performance factor</strong><span>Total allocated heating + cooling need ÷ total system electricity.</span></p>
          <p><strong>Relative saving</strong><span>(air-source electricity − ground-source electricity) ÷ air-source electricity.</span></p>
          <p><strong>Annual cost</strong><span>Energy charge plus daily and annual fixed charges under the selected electricity pricing.</span></p>
          <p><strong>Long-term value (NPV)</strong><span>Air-source lifecycle cost − ground-source lifecycle cost; a positive value favours ground-source.</span></p>
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
      <aside className="page-footnotes dark-footnotes" aria-label="Key result terms">
        <ol>
          <li id="results-note-apf"><strong>Annual performance factor:</strong> modelled annual heating and cooling delivered divided by total system electricity, including configured supporting equipment.</li>
          <li id="results-note-cop"><strong>Coefficient of performance (COP):</strong> heating or cooling delivered divided by compressor electricity at a particular operating condition. <a href="#glossary">See the full glossary →</a></li>
        </ol>
      </aside>
      <p className="screening-note">This postcode-level screening result is not a borehole design, thermal-response test or engineering quotation.</p>
    </section>
  );
}
