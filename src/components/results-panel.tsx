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
        <p>Follow the message above, enter missing values in <a href="#customise">Customise</a>, or select another postcode with complete data.</p>
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
      <section className="result-method-note" aria-labelledby="plain-result-method-title">
        <div className="result-method-heading">
          <h3 id="plain-result-method-title">How these results are estimated</h3>
          <p>The app links local ground conditions with the heating and cooling expected from local outdoor temperatures.</p>
        </div>
        <div className="result-method-grid">
          <p><strong>Ground temperature</strong><span>The selected surface temperature is adjusted by the estimated change with depth. A directly entered ground temperature is used instead when selected.</span></p>
          <p><strong>Heating and cooling needed</strong><span>The postcode&apos;s published need per square metre is multiplied by the floor area and other load settings, then assigned to the hours when outdoor air is cold or hot enough to create demand. The monthly chart groups those hourly estimates.</span></p>
          <p><strong>Heat-pump electricity</strong><span>For each modelled hour, the heating or cooling needed is divided by the heat pump&apos;s COP. Any pump, fan and other supporting electricity entered by the user is then added.</span></p>
          <p><strong>Annual performance factor</strong><span>The total heating and cooling delivered over the year is compared with the total modelled system electricity. A higher value means more useful heating or cooling per unit of electricity.</span></p>
          <p><strong>Ground-source versus air-source</strong><span>Both systems are asked to meet the same heating and cooling need. Their modelled electricity totals are compared to show whether ground-source uses less or more.</span></p>
          <p><strong>Running cost and saving</strong><span>Electricity use is priced with the entered tariff. Ground-source saving is the air-source estimate minus the ground-source estimate.</span></p>
          <p><strong>Long-term comparison</strong><span>When installed and future costs are entered, the app compares both systems over the chosen number of years in today&apos;s money.</span></p>
          <p><strong>Confidence in postcode data</strong><span>This reflects whether the prepared ground, demand and hourly temperature inputs are available and whether the calculation raised important warnings. It is not a guarantee of site suitability.</span></p>
        </div>
        <p className="result-method-guide">These are simplified explanations. For the formulas, default assumptions and every adjustable parameter, <a href="#guide">read the user guide →</a></p>
      </section>
      <p className="screening-note">This postcode-level screening result is not a borehole design, thermal-response test or engineering quotation.</p>
    </section>
  );
}
