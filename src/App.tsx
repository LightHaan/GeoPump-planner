import { useEffect, useMemo, useRef, useState } from "react";

import {
  calculateGroundTemperature,
  calculatePostcodeOutcome,
  createResultsCsv,
  createScenarioExport,
  groundInputsForDataset,
  inputsFromAttributes,
  listScenarioOverrides,
  parseScenarioImport,
  type PostcodeModelInputs,
} from "./app/model";
import { DataQualityPanel } from "./components/data-quality-panel";
import { GlossaryPage } from "./components/glossary-page";
import { PostcodeMap } from "./components/postcode-map";
import { QuickResults } from "./components/quick-results";
import { ResultsPanel } from "./components/results-panel";
import { SettingsPanel } from "./components/settings-panel";
import {
  loadPostcodeCatalog,
  loadPostcodeClimate,
  type DataManifest,
  type PostcodeAttributeIndex,
  type PostcodeIndexEntry,
  type SurfaceDatasetId,
} from "./data/postcode";
import { TEMPERATURE_DATASET_LABELS } from "./data/temperature-datasets";
import type { ClimateRecord } from "./engine/types";
import { clonePaperDefaults } from "./parameters/defaults";
import { setParameterValue } from "./parameters/definitions";
import type { ScenarioParameters } from "./parameters/types";
import { validateScenarioParameters } from "./parameters/validation";

type PageId = "planner" | "results" | "customise" | "guide" | "glossary";

const EMPTY_INPUTS: PostcodeModelInputs = {
  surfaceTemperatureC: null,
  gradientCPerM: null,
  boreholeTemperatureC: null,
  boreholeDepthM: null,
  directGroundTemperatureC: null,
  annualHeatingKwhM2: null,
  annualCoolingKwhM2: null,
};

function pageFromHash(): PageId {
  const hash = window.location.hash.replace(/^#/, "");
  if (hash === "results" || hash.startsWith("results-note-")) return "results";
  if (hash === "customise" || hash.startsWith("custom-note-")) return "customise";
  if (hash === "guide" || hash.startsWith("guide-")) return "guide";
  if (hash === "glossary" || hash.startsWith("glossary-section-")) return "glossary";
  return "planner";
}

function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function downloadJson(filename: string, value: unknown): void {
  downloadBlob(
    filename,
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
}

function downloadText(filename: string, value: string, type: string): void {
  downloadBlob(filename, new Blob([value], { type }));
}

function PageHeading({ title, children }: { title: string; children: string }) {
  return (
    <header className="page-heading">
      <h1>{title}</h1>
      <p>{children}</p>
    </header>
  );
}

export default function App() {
  const [page, setPage] = useState<PageId>(() => pageFromHash());
  const [parameters, setParameters] = useState<ScenarioParameters>(() => clonePaperDefaults());
  const [inputs, setInputs] = useState<PostcodeModelInputs>(EMPTY_INPUTS);
  const [postcodeIndex, setPostcodeIndex] = useState<PostcodeIndexEntry[]>([]);
  const [attributeIndex, setAttributeIndex] = useState<PostcodeAttributeIndex>({});
  const [manifest, setManifest] = useState<DataManifest | null>(null);
  const [selectedPostcode, setSelectedPostcode] = useState<string | null>(null);
  const [postcodeQuery, setPostcodeQuery] = useState("3000");
  const [climate, setClimate] = useState<ClimateRecord[] | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [climateLoading, setClimateLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash.replace(/^#/, "");
      setPage(pageFromHash());
      if (hash === "" || hash === "planner" || hash === "results" || hash === "customise" || hash === "guide" || hash === "glossary") {
        window.scrollTo({ top: 0, behavior: "instant" });
      } else {
        window.setTimeout(() => document.getElementById(hash)?.scrollIntoView?.({ block: "start" }), 0);
      }
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setCatalogLoading(true);
    loadPostcodeCatalog(controller.signal)
      .then(({ index, attributes, manifest: loadedManifest }) => {
        setPostcodeIndex(index);
        setAttributeIndex(attributes);
        setManifest(loadedManifest);
        const initial = index.find((entry) => entry.postcode === "3000" && entry.has_climate_data)
          ?? index.find((entry) => entry.has_climate_data);
        if (initial !== undefined) {
          setSelectedPostcode(initial.postcode);
          setPostcodeQuery(initial.postcode);
          const initialAttributes = attributes[initial.postcode];
          if (initialAttributes !== undefined) {
            setInputs(inputsFromAttributes(initialAttributes, clonePaperDefaults().ground.surface_dataset_id));
          }
        }
        setDataError(null);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setDataError(error instanceof Error ? error.message : "Could not load postcode data.");
      })
      .finally(() => setCatalogLoading(false));
    return () => controller.abort();
  }, []);

  const selectedEntry = useMemo(
    () => postcodeIndex.find((entry) => entry.postcode === selectedPostcode) ?? null,
    [postcodeIndex, selectedPostcode],
  );
  const selectedAttributes = selectedPostcode === null
    ? null
    : (attributeIndex[selectedPostcode] ?? null);

  useEffect(() => {
    if (selectedPostcode === null || selectedAttributes === null) return;
    setClimate(null);
    if (!selectedEntry?.has_climate_data) {
      setClimateLoading(false);
      setDataError(`Postcode ${selectedPostcode} has no available climate records.`);
      return;
    }
    const controller = new AbortController();
    setClimateLoading(true);
    setDataError(null);
    loadPostcodeClimate(selectedPostcode, parameters.time.base_year, controller.signal)
      .then((records) => setClimate(records))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setDataError(error instanceof Error ? error.message : "Could not load climate data.");
      })
      .finally(() => setClimateLoading(false));
    return () => controller.abort();
  }, [selectedPostcode, selectedAttributes, selectedEntry, parameters.time.base_year]);

  const validationIssues = useMemo(
    () => validateScenarioParameters(parameters),
    [parameters],
  );
  const validationErrors = validationIssues.filter((issue) => issue.severity === "error");

  const groundPreview = useMemo(() => {
    try {
      return calculateGroundTemperature(inputs, parameters).groundTemperatureC;
    } catch {
      return null;
    }
  }, [inputs, parameters]);

  const calculation = useMemo(() => {
    if (selectedPostcode === null || selectedAttributes === null || climate === null) {
      return { outcome: null, error: dataError };
    }
    if (validationErrors.length > 0) {
      return { outcome: null, error: "Correct the parameter validation errors before calculating." };
    }
    try {
      return {
        outcome: calculatePostcodeOutcome(
          selectedPostcode,
          selectedAttributes,
          climate,
          inputs,
          parameters,
        ),
        error: null,
      };
    } catch (error) {
      return {
        outcome: null,
        error: error instanceof Error ? error.message : "The model calculation failed.",
      };
    }
  }, [
    climate,
    dataError,
    inputs,
    parameters,
    selectedAttributes,
    selectedPostcode,
    validationErrors.length,
  ]);

  const choosePostcode = (postcode: string) => {
    const normalized = postcode.trim().padStart(4, "0");
    const match = postcodeIndex.find((entry) => entry.postcode === normalized);
    if (match === undefined) {
      setDataError(`Postcode ${normalized} was not found.`);
      return;
    }
    setSelectedPostcode(match.postcode);
    setPostcodeQuery(match.postcode);
    const attributes = attributeIndex[match.postcode];
    if (attributes !== undefined) {
      setInputs(inputsFromAttributes(attributes, parameters.ground.surface_dataset_id));
    }
    setActionMessage(null);
    setDataError(null);
  };

  const onParameterChange = (path: string, value: unknown) => {
    setParameters((current) => setParameterValue(current, path, value));
    if (
      path === "ground.surface_dataset_id" &&
      selectedAttributes !== null &&
      (value === "air_t" || value === "surface_t")
    ) {
      setInputs((current) => groundInputsForDataset(
        current,
        selectedAttributes,
        value as SurfaceDatasetId,
      ));
    }
  };

  const onInputChange = <K extends keyof PostcodeModelInputs>(
    key: K,
    value: PostcodeModelInputs[K],
  ) => setInputs((current) => ({ ...current, [key]: value }));

  const reset = () => {
    const defaults = clonePaperDefaults();
    setParameters(defaults);
    if (selectedAttributes !== null) {
      setInputs(inputsFromAttributes(selectedAttributes, defaults.ground.surface_dataset_id));
    }
    setActionMessage("Paper defaults and postcode data restored.");
  };

  const exportScenario = () => {
    if (calculation.outcome === null || selectedPostcode === null || selectedAttributes === null) return;
    downloadJson(
      `gshp-scenario-${selectedPostcode}.json`,
      createScenarioExport(
        selectedPostcode,
        selectedAttributes,
        inputs,
        parameters,
        calculation.outcome,
      ),
    );
    setActionMessage("Scenario JSON downloaded.");
  };

  const exportCsv = () => {
    if (calculation.outcome === null || selectedPostcode === null) return;
    downloadText(
      `geopump-results-${selectedPostcode}.csv`,
      createResultsCsv(selectedPostcode, calculation.outcome, parameters.tariff.currency),
      "text/csv;charset=utf-8",
    );
    setActionMessage("Results CSV downloaded.");
  };

  const importScenario = async (file: File) => {
    try {
      const imported = parseScenarioImport(await file.text());
      const match = postcodeIndex.find((entry) => entry.postcode === imported.postcode);
      if (match === undefined) {
        throw new Error(`Postcode ${imported.postcode} is not available in this dataset version.`);
      }
      setParameters(imported.parameters);
      setInputs(imported.inputs);
      setSelectedPostcode(imported.postcode);
      setPostcodeQuery(imported.postcode);
      setDataError(null);
      setActionMessage(`Scenario for postcode ${imported.postcode} imported.`);
    } catch (error) {
      setActionMessage(null);
      setDataError(error instanceof Error ? error.message : "Could not import the scenario.");
    }
  };

  const overrides = useMemo(
    () => selectedAttributes === null
      ? []
      : listScenarioOverrides(selectedAttributes, inputs, parameters),
    [inputs, parameters, selectedAttributes],
  );

  const suggestions = postcodeIndex
    .filter((entry) => entry.postcode.includes(postcodeQuery.trim()))
    .slice(0, 8);

  const renderPostcodeSearch = () => (
    <div className="quick-card">
      <form onSubmit={(event) => { event.preventDefault(); choosePostcode(postcodeQuery); }}>
        <label htmlFor="postcode-search">Australian postcode</label>
        <div className="postcode-search-row">
          <input
            id="postcode-search"
            inputMode="numeric"
            maxLength={4}
            value={postcodeQuery}
            placeholder="3000"
            list="postcode-options"
            onChange={(event) => setPostcodeQuery(event.target.value.replace(/\D/g, ""))}
          />
          <button type="submit" disabled={catalogLoading}>Select</button>
        </div>
        <datalist id="postcode-options">
          {postcodeIndex.map((entry) => <option key={entry.postcode} value={entry.postcode} />)}
        </datalist>
      </form>
      {postcodeQuery.length > 0 && postcodeQuery !== selectedPostcode && suggestions.length > 0 && (
        <div className="postcode-suggestions" aria-label="Postcode suggestions">
          {suggestions.map((entry) => (
            <button key={entry.postcode} type="button" onClick={() => choosePostcode(entry.postcode)}>
              {entry.postcode}
            </button>
          ))}
        </div>
      )}
      <div className="quick-fields">
        <label>
          <span>Depth to estimate</span>
          <span className="compact-input-with-unit">
            <input
              aria-label="Depth to estimate"
              type="number"
              value={parameters.ground.target_depth_m}
              onChange={(event) => onParameterChange("ground.target_depth_m", Number(event.target.value))}
            />
            <small>m</small>
          </span>
        </label>
        <label className="dataset-field">
          <span>Temperature source</span>
          <select
            aria-label="Temperature source"
            value={parameters.ground.surface_dataset_id}
            onChange={(event) => onParameterChange("ground.surface_dataset_id", event.target.value)}
          >
            <option value="surface_t">{TEMPERATURE_DATASET_LABELS.surface_t} (recommended)</option>
            <option value="air_t">{TEMPERATURE_DATASET_LABELS.air_t}</option>
          </select>
        </label>
        <label>
          <span>Heated/cooled floor area</span>
          <span className="compact-input-with-unit">
            <input
              aria-label="Heated/cooled floor area"
              type="number"
              min="0"
              step="1"
              value={parameters.load.conditioned_floor_area_m2}
              onChange={(event) => onParameterChange("load.conditioned_floor_area_m2", Number(event.target.value))}
            />
            <small>m²</small>
          </span>
        </label>
        <label>
          <span>Electricity price</span>
          <span className="compact-input-with-unit">
            <input
              aria-label="Electricity price"
              type="number"
              min="0"
              step="0.01"
              value={parameters.tariff.single_price_per_kwh ?? ""}
              placeholder="Optional"
              onChange={(event) => onParameterChange(
                "tariff.single_price_per_kwh",
                event.target.value === "" ? null : Number(event.target.value),
              )}
            />
            <small>{parameters.tariff.currency}/kWh</small>
          </span>
        </label>
      </div>
      {selectedEntry !== null && selectedAttributes !== null && (
        <div className="selected-postcode-summary">
          <div><span>Selected</span><strong>{selectedEntry.postcode}</strong></div>
          <div><span>Estimated ground temperature</span><strong>{groundPreview === null ? "—" : `${groundPreview.toFixed(2)} °C`}</strong></div>
        </div>
      )}
      {dataError !== null && <p className="inline-error" role="alert">{dataError}</p>}
    </div>
  );

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="#planner" aria-label="GeoPump Planner home">
          <span className="brand-mark">G</span>
          <span><strong>GeoPump Planner</strong></span>
        </a>
        <nav className="page-nav" aria-label="Main navigation">
          <a className={page === "planner" ? "active" : ""} href="#planner" aria-current={page === "planner" ? "page" : undefined}>Planner</a>
          <a className={page === "results" ? "active" : ""} href="#results" aria-current={page === "results" ? "page" : undefined}>Results</a>
          <a className={page === "customise" ? "active" : ""} href="#customise" aria-current={page === "customise" ? "page" : undefined}>Customise</a>
          <a className={page === "guide" ? "active" : ""} href="#guide" aria-current={page === "guide" ? "page" : undefined}>Guide</a>
          <a className={page === "glossary" ? "active" : ""} href="#glossary" aria-current={page === "glossary" ? "page" : undefined}>Glossary</a>
        </nav>
      </header>

      <main>
        {page === "planner" && (
          <div className="planner-page">
            <section className="home-intro">
              <div>
                <h1>Plan by postcode.</h1>
                <p>See whether a ground-source heat pump may suit your area, how much electricity it could use and what it could save.</p>
              </div>
              <div className="home-help">
                <span>First visit? <a href="#guide">Read the guide</a>.</span>
                <span>Need different assumptions? <a href="#customise">Customise the model</a>.</span>
                <span>Unfamiliar term? <a href="#glossary">Open the plain-English glossary</a>.</span>
              </div>
            </section>
            <div className="planner-workspace">
              {renderPostcodeSearch()}
              <PostcodeMap
                attributeIndex={attributeIndex}
                postcodeIndex={postcodeIndex}
                selectedPostcode={selectedPostcode}
                surfaceDatasetId={parameters.ground.surface_dataset_id}
                onSelectPostcode={choosePostcode}
              />
            </div>
            <QuickResults
              outcome={calculation.outcome}
              loading={catalogLoading || climateLoading}
              error={calculation.error}
              currency={parameters.tariff.currency}
              loadParameters={parameters.load}
            />
            <aside className="page-footnotes" aria-label="Key term note">
              <ol>
                <li id="home-note-warming"><strong>Estimated underground warming rate:</strong> the app takes the difference between a measured borehole temperature and the corresponding surface temperature, then divides it by the measurement depth to estimate the change per metre. Temperature at a chosen depth is then estimated as surface temperature + this rate × depth. <a href="#glossary">Full explanation →</a></li>
              </ol>
            </aside>
          </div>
        )}

        {page === "results" && (
          <div className="results-page">
            <div className="content-page-header">
              <PageHeading title="Detailed results">Review the full technical, electricity and cost comparison.</PageHeading>
              <div className="page-actions">
                <button type="button" className="button-secondary" onClick={exportCsv} disabled={calculation.outcome === null}>Export CSV</button>
                <button type="button" className="button-primary" onClick={exportScenario} disabled={calculation.outcome === null}>Export scenario</button>
              </div>
            </div>
            {actionMessage !== null && <p className="action-message" role="status">{actionMessage}</p>}
            <ResultsPanel
              outcome={calculation.outcome}
              calculationError={calculation.error}
              loading={catalogLoading || climateLoading}
              currency={parameters.tariff.currency}
              loadParameters={parameters.load}
              analysisPeriodYears={parameters.economics.analysis_period_years}
            />
            {selectedAttributes !== null && climate !== null && manifest !== null && (
              <details className="data-evidence-drawer">
                <summary>Data evidence and quality</summary>
                <DataQualityPanel
                  attributes={selectedAttributes}
                  climate={climate}
                  datasetId={parameters.ground.surface_dataset_id}
                  expectedAnnualHours={parameters.time.expected_annual_weight_hours}
                  manifest={manifest}
                  overrides={overrides}
                />
              </details>
            )}
          </div>
        )}

        {page === "customise" && (
          <div className="customise-page">
            <div className="content-page-header">
              <PageHeading title="Customise the model">Adjust inputs, performance formulas, time periods, electricity prices and investment assumptions.</PageHeading>
              <div className="page-actions">
                <button type="button" className="button-secondary" onClick={reset}>Restore defaults</button>
                <button type="button" className="button-secondary" onClick={() => importInputRef.current?.click()}>Import scenario</button>
                <button type="button" className="button-primary" onClick={exportScenario} disabled={calculation.outcome === null}>Export scenario</button>
              </div>
            </div>
            <input
              ref={importInputRef}
              className="visually-hidden"
              type="file"
              accept="application/json,.json"
              aria-label="Import scenario JSON file"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file !== undefined) void importScenario(file);
                event.target.value = "";
              }}
            />
            {actionMessage !== null && <p className="action-message" role="status">{actionMessage}</p>}
            <SettingsPanel
              parameters={parameters}
              inputs={inputs}
              onParameterChange={onParameterChange}
              onInputChange={onInputChange}
              validationIssues={validationIssues}
              calculatedGroundTemperatureC={groundPreview}
            />
          </div>
        )}

        {page === "guide" && (
          <div className="guide-page">
            <PageHeading title="How to use GeoPump Planner">A short guide to the map, calculation and editable assumptions.</PageHeading>
            <section className="guide-steps">
              <article><span>1</span><h2>Select a postcode</h2><p>Type a postcode or click it on the map. The colour setting lets you compare useful local temperature and heating or cooling indicators.</p></article>
              <article><span>2</span><h2>Set the essentials</h2><p>Choose an estimate depth and temperature source. Enter the floor area you heat or cool, then add your electricity price to see home-scale annual electricity and running-cost estimates.</p></article>
              <article><span>3</span><h2>Read the result</h2><p>The home page shows the headline comparison. The Results page contains monthly values, decision evidence and downloads.</p></article>
              <article><span>4</span><h2>Customise if needed</h2><p>The Customise page exposes every model input, constant, time window, electricity-price setting and performance formula. The <a className="text-link" href="#glossary">glossary</a> explains unfamiliar terms.</p></article>
            </section>

            <section className="guide-section">
              <h2>What the calculation does</h2>
              <div className="guide-grid">
                <article><h3>Demand from temperature</h3><p>Hourly air temperature is converted to heating and cooling degree-hours using editable thresholds. The defaults are 12 °C and 24 °C.</p></article>
                <article><h3>Load follows demand</h3><p>Certificate annual loads are allocated across hours in proportion to degree-hours. If annual degree-hours are zero, allocated demand and load are zero.</p></article>
                <article><h3>Ground meets climate</h3><p>Estimated ground temperature and hourly outdoor temperature feed the selected heat-pump performance formulas to estimate electricity use.</p></article>
                <article><h3>Results use your home scale</h3><p>The postcode heating and cooling estimates start per square metre. The app uses your heated/cooled floor area and other load settings to produce annual electricity and cost totals for the current scenario.</p></article>
              </div>
            </section>

            <section className="guide-section core-equations">
              <div className="guide-section-heading">
                <div>
                  <p className="eyebrow">Calculation reference</p>
                  <h2>Core equations</h2>
                </div>
                <p>Every term shown here can be entered or changed on the Customise page. The ground-source system uses estimated ground temperature; the air-source comparison uses each record's outdoor air temperature.</p>
              </div>
              <div className="equation-grid">
                <article>
                  <span>01 · Ground temperature</span>
                  <h3>Surface temperature and estimated warming with depth</h3>
                  <pre><code>T_ground(z) = T_surface + estimated_warming_rate × depth</code></pre>
                  <p>Borehole mode instead uses <code>T_surface + (T_borehole - T_surface) × depth / borehole_depth</code>. Direct mode uses the entered ground temperature without a depth equation.</p>
                </article>
                <article>
                  <span>02 · Demand</span>
                  <h3>Weighted degree-hours</h3>
                  <pre><code>{`HDH_t = max(0, T_heat - T_air,t) × weight_t
CDH_t = max(0, T_air,t - T_cool) × weight_t`}</code></pre>
                  <p>The editable paper defaults are 12 °C and 24 °C. Degree-hours identify when demand exists; they do not create extra annual load.</p>
                </article>
                <article>
                  <span>03 · Load</span>
                  <h3>Scale and allocate certificate load</h3>
                  <pre><code>{`requested_load = load_per_m² × area × buildings
                 × scale_factor × occupancy_factor
load_t = requested_load × DH_t / sum(DH)`}</code></pre>
                  <p>Under the default policy, if <code>sum(DH) = 0</code>, allocated load is zero even when the certificate input is positive. The unallocated amount remains visible in the calculation trace.</p>
                </article>
                <article>
                  <span>04 · COP</span>
                  <h3>Selected COP model</h3>
                  <pre><code>{`Heating: COP = η × T_cond,K / (T_cond,K - T_evap,K)
Cooling: COP = η × T_evap,K / (T_cond,K - T_evap,K)`}</code></pre>
                  <p>These are the scaled-Carnot defaults. Constant and linear source-temperature models can be selected independently for GSHP and ASHP, with editable bounds and invalid-value handling.</p>
                </article>
                <article>
                  <span>05 · Electricity</span>
                  <h3>Compressor, auxiliaries and APF</h3>
                  <pre><code>{`compressor_electricity_t = thermal_load_t / COP_t
APF = total_allocated_thermal_load / system_electricity`}</code></pre>
                  <p>System electricity adds editable pump, fan and miscellaneous fractions plus fixed annual auxiliary electricity.</p>
                </article>
                <article>
                  <span>06 · Comparison</span>
                  <h3>Saving, cost and NPV</h3>
                  <pre><code>{`saving = ASHP_electricity - GSHP_electricity
relative_saving = saving / ASHP_electricity
NPV_GSHP = ASHP_lifecycle_cost - GSHP_lifecycle_cost`}</code></pre>
                  <p>Positive saving and positive NPV favour GSHP. The decision label also applies the editable technical, payback, NPV and evidence-quality thresholds.</p>
                </article>
              </div>
              <p className="reference-link-note">For tariff equations, lifecycle discounting, solar-time equations, decision rules, validation and all 109 parameter defaults, see the <a className="text-link" href="https://github.com/LightHaan/GeoPump-planner/blob/main/docs/calculation-reference.md" target="_blank" rel="noreferrer">complete calculation and parameter reference →</a>. For plain-language definitions, use the <a className="text-link" href="#glossary">glossary →</a></p>
            </section>

            <section className="guide-section guide-notes">
              <h2>Important notes</h2>
              <ul>
                <li>Spatial processing is completed before publication; the browser runs the calculation formulas using preprocessed postcode data.</li>
                <li><code>Dwelling_Count</code> is the number of certificate records, not the postcode dwelling population.</li>
                <li>The ΔT20 EBK prediction standard error applies only to the Australian mean land-surface temperature dataset from Geoscience Australia and is not total ground-temperature uncertainty.</li>
                <li>The default selected time period is two hours before sunset to two hours after sunrise, but any start and end time can be entered.</li>
                <li>This is a postcode screening tool, not a borehole design, thermal-response test or engineering quotation.</li>
              </ul>
              <a className="text-link" href="https://github.com/LightHaan/GeoPump-planner#readme" target="_blank" rel="noreferrer">Read the project overview →</a>
            </section>
          </div>
        )}

        {page === "glossary" && (
          <div className="glossary-page">
            <PageHeading title="Plain-English glossary">Simple explanations of the ground, climate, performance, cost and data-quality terms used by GeoPump Planner.</PageHeading>
            <GlossaryPage />
          </div>
        )}
      </main>

      <footer>
        <span>GeoPump Planner</span>
        <span><a href="#glossary">Glossary</a> · <a href="https://github.com/LightHaan/GeoPump-planner" target="_blank" rel="noreferrer">GitHub</a></span>
      </footer>
    </div>
  );
}
