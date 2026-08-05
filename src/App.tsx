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
import { ResultsPanel } from "./components/results-panel";
import { SettingsPanel } from "./components/settings-panel";
import { DataQualityPanel } from "./components/data-quality-panel";
import {
  loadPostcodeCatalog,
  loadPostcodeClimate,
  type DataManifest,
  type PostcodeAttributeIndex,
  type PostcodeIndexEntry,
  type SurfaceDatasetId,
} from "./data/postcode";
import type { ClimateRecord } from "./engine/types";
import { clonePaperDefaults } from "./parameters/defaults";
import { setParameterValue } from "./parameters/definitions";
import type { ScenarioParameters } from "./parameters/types";
import { validateScenarioParameters } from "./parameters/validation";

const EMPTY_INPUTS: PostcodeModelInputs = {
  surfaceTemperatureC: null,
  gradientCPerM: null,
  boreholeTemperatureC: null,
  boreholeDepthM: null,
  directGroundTemperatureC: null,
  annualHeatingKwhM2: null,
  annualCoolingKwhM2: null,
};

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
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  downloadBlob(filename, blob);
}

function downloadText(filename: string, value: string, type: string): void {
  const blob = new Blob([value], { type });
  downloadBlob(filename, blob);
}

export default function App() {
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
    // A base-year edit changes month assignment, so reload the static tuples.
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
    setActionMessage("Paper defaults and frozen postcode inputs restored.");
  };

  const exportScenario = () => {
    if (
      calculation.outcome === null ||
      selectedPostcode === null ||
      selectedAttributes === null
    ) return;
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
      setActionMessage(`Scenario for postcode ${imported.postcode} imported. Calculations use the current frozen dataset version.`);
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

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Return to the top of the page">
          <span className="brand-mark">G</span>
          <span><strong>GroundMatch</strong><small>Postcode GSHP screening</small></span>
        </a>
        <nav aria-label="Page navigation">
          <a href="#ground-settings">Settings</a>
          <a href="#results">Results</a>
          <a href="#data-quality">Data quality</a>
          <a href="#method">Method</a>
        </nav>
        <span className="header-tag">Open source · Local calculation</span>
      </header>

      <main id="top">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">Geological supply × climate demand</p>
            <h1>One postcode.<br /><em>Match ground heat to demand.</em></h1>
            <p className="hero-lead">Select an area, adjust ground temperature, demand thresholds, COP and electricity prices, then compare ground- and air-source heat pumps. Every registered formula parameter is editable.</p>
          </div>
          <div className="postcode-card">
            <form onSubmit={(event) => { event.preventDefault(); choosePostcode(postcodeQuery); }}>
              <label htmlFor="postcode-search">Select an Australian postcode</label>
              <div className="postcode-search-row">
                <input
                  id="postcode-search"
                  inputMode="numeric"
                  maxLength={4}
                  value={postcodeQuery}
                  placeholder="For example, 3000"
                  list="postcode-options"
                  onChange={(event) => setPostcodeQuery(event.target.value.replace(/\D/g, ""))}
                />
                <button type="submit" disabled={catalogLoading}>Load</button>
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
            {selectedEntry !== null && selectedAttributes !== null && (
              <div className="postcode-summary">
                <div><span>Current area</span><strong>{selectedEntry.postcode}</strong></div>
                <div><span>Location</span><strong>{selectedEntry.lat.toFixed(2)}, {selectedEntry.lon.toFixed(2)}</strong></div>
                <div><span>Certificate records</span><strong>{selectedAttributes.load.certificate_count ?? "None"}</strong></div>
                <div><span>Nearest borehole</span><strong>{selectedAttributes.ground.nearest_borehole_km === null ? "No data" : `${selectedAttributes.ground.nearest_borehole_km.toFixed(1)} km`}</strong></div>
              </div>
            )}
            <div className="availability-row">
              <span className={selectedEntry?.has_ground_data ? "available" : "missing"}>Ground {selectedEntry?.has_ground_data ? "✓" : "—"}</span>
              <span className={selectedEntry?.has_load_data ? "available" : "missing"}>Load {selectedEntry?.has_load_data ? "✓" : "—"}</span>
              <span className={selectedEntry?.has_climate_data ? "available" : "missing"}>Climate {selectedEntry?.has_climate_data ? "✓" : "—"}</span>
            </div>
            {dataError !== null && <p className="inline-error" role="alert">{dataError}</p>}
          </div>
        </section>

        <div className="action-bar">
          <div><strong>{selectedPostcode ?? "Not selected"}</strong><span>{climateLoading ? "Loading" : calculation.outcome === null ? "Waiting for input" : "Results updated"}</span></div>
          <div className="action-buttons">
            <button className="button-secondary" type="button" onClick={reset}>Restore paper defaults</button>
            <button className="button-secondary" type="button" onClick={() => importInputRef.current?.click()}>Import scenario JSON</button>
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
            <button className="button-secondary" type="button" onClick={exportCsv} disabled={calculation.outcome === null}>Export results CSV</button>
            <button className="button-primary" type="button" onClick={exportScenario} disabled={calculation.outcome === null}>Export scenario JSON</button>
          </div>
        </div>
        {actionMessage !== null && <p className="action-message" role="status">{actionMessage}</p>}

        <SettingsPanel
          parameters={parameters}
          inputs={inputs}
          onParameterChange={onParameterChange}
          onInputChange={onInputChange}
          validationIssues={validationIssues}
          calculatedGroundTemperatureC={groundPreview}
        />

        <div id="results">
          <ResultsPanel
            outcome={calculation.outcome}
            calculationError={calculation.error}
            loading={catalogLoading || climateLoading}
            currency={parameters.tariff.currency}
          />
        </div>

        {selectedAttributes !== null && climate !== null && manifest !== null && (
          <DataQualityPanel
            attributes={selectedAttributes}
            climate={climate}
            datasetId={parameters.ground.surface_dataset_id}
            expectedAnnualHours={parameters.time.expected_annual_weight_hours}
            manifest={manifest}
            overrides={overrides}
          />
        )}

        <section className="method-section" id="method">
          <p className="eyebrow">Transparent method</p>
          <h2>Spatial processing is completed before publication; the browser runs traceable formulas only.</h2>
          <div className="method-steps">
            <article><span>1</span><h3>Climate identifies demand</h3><p>Hourly air temperatures and editable 12/24°C thresholds produce weighted degree-hours.</p></article>
            <article><span>2</span><h3>Certificate loads are allocated</h3><p>Annual loads follow the degree-hour distribution; zero annual degree-hours produce zero allocated load.</p></article>
            <article><span>3</span><h3>Ground temperature informs COP</h3><p>GSHP uses ground temperature and ASHP uses hourly air temperature with selectable COP formulas.</p></article>
            <article><span>4</span><h3>Electricity and economics are compared</h3><p>The model calculates electricity, period tariffs, lifecycle cost and evidence quality.</p></article>
          </div>
        </section>
      </main>

      <footer>
        <span>GroundMatch · open-source postcode screening framework</span>
        <span>No ArcGIS runtime · No accounts · No data uploads</span>
      </footer>
    </div>
  );
}
