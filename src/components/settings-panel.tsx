import type { PostcodeModelInputs } from "../app/model";
import { TEMPERATURE_DATASET_LABELS } from "../data/temperature-datasets";
import { ParameterControl, NumberField, SelectField } from "./form-controls";
import {
  PARAMETER_REGISTRY,
  getParameterValue,
  type ParameterDefinition,
} from "../parameters/definitions";
import type {
  CopModelParameters,
  ScenarioParameters,
} from "../parameters/types";
import type { ParameterValidationIssue } from "../parameters/validation";

interface SettingsPanelProps {
  parameters: ScenarioParameters;
  inputs: PostcodeModelInputs;
  onParameterChange: (path: string, value: unknown) => void;
  onInputChange: <K extends keyof PostcodeModelInputs>(key: K, value: PostcodeModelInputs[K]) => void;
  validationIssues: ParameterValidationIssue[];
  calculatedGroundTemperatureC: number | null;
}

const groundModes = [
  { value: "surface_gradient", label: "Surface temperature + estimated warming with depth" },
  { value: "surface_borehole_interpolation", label: "Surface/borehole interpolation" },
  { value: "direct", label: "Direct ground-temperature input" },
];

const copModels = [
  { value: "scaled_carnot", label: "Scaled Carnot (paper default)" },
  { value: "constant", label: "Constant COP" },
  { value: "linear_source_temperature", label: "Linear source-temperature model" },
];

interface CopQuickPanelProps {
  title: string;
  system: "gshp" | "ashp";
  parameters: CopModelParameters;
  onChange: (path: string, value: unknown) => void;
}

function CopQuickPanel({ title, system, parameters, onChange }: CopQuickPanelProps) {
  const prefix = `cop.${system}`;
  return (
    <section className="subpanel">
      <h3>{title}</h3>
      <SelectField
        id={`${system}-cop-model`}
        label="COP calculation model"
        value={parameters.model_id}
        options={copModels}
        onChange={(value) => onChange(`${prefix}.model_id`, value)}
      />
      {parameters.model_id === "scaled_carnot" && (
        <div className="field-grid compact">
          <NumberField id={`${system}-heat-supply`} label="Heating supply temperature" value={parameters.heating_supply_temperature_c} unit="°C" onChange={(value) => onChange(`${prefix}.heating_supply_temperature_c`, value)} />
          <NumberField id={`${system}-cool-supply`} label="Cooling supply temperature" value={parameters.cooling_supply_temperature_c} unit="°C" onChange={(value) => onChange(`${prefix}.cooling_supply_temperature_c`, value)} />
          <NumberField id={`${system}-approach`} label="Heat-exchanger approach" value={parameters.approach_temperature_k} unit="K" onChange={(value) => onChange(`${prefix}.approach_temperature_k`, value)} />
          <NumberField id={`${system}-efficiency`} label="Empirical Carnot efficiency" value={parameters.empirical_carnot_efficiency} step={0.01} onChange={(value) => onChange(`${prefix}.empirical_carnot_efficiency`, value)} />
        </div>
      )}
      {parameters.model_id === "constant" && (
        <div className="field-grid compact">
          <NumberField id={`${system}-constant-heat`} label="Constant heating COP" value={parameters.constant_heating_cop} step={0.1} onChange={(value) => onChange(`${prefix}.constant_heating_cop`, value)} />
          <NumberField id={`${system}-constant-cool`} label="Constant cooling COP" value={parameters.constant_cooling_cop} step={0.1} onChange={(value) => onChange(`${prefix}.constant_cooling_cop`, value)} />
        </div>
      )}
      {parameters.model_id === "linear_source_temperature" && (
        <div className="field-grid compact">
          <NumberField id={`${system}-linear-heat-intercept`} label="Heating intercept" value={parameters.linear_heating_intercept} onChange={(value) => onChange(`${prefix}.linear_heating_intercept`, value)} />
          <NumberField id={`${system}-linear-heat-slope`} label="Heating slope" value={parameters.linear_heating_slope_per_c} onChange={(value) => onChange(`${prefix}.linear_heating_slope_per_c`, value)} />
          <NumberField id={`${system}-linear-cool-intercept`} label="Cooling intercept" value={parameters.linear_cooling_intercept} onChange={(value) => onChange(`${prefix}.linear_cooling_intercept`, value)} />
          <NumberField id={`${system}-linear-cool-slope`} label="Cooling slope" value={parameters.linear_cooling_slope_per_c} onChange={(value) => onChange(`${prefix}.linear_cooling_slope_per_c`, value)} />
        </div>
      )}
      <p className="formula-inline">
        <strong>Formula:</strong>{" "}
        {parameters.model_id === "scaled_carnot" && "scaled Carnot COP using supply temperature, source temperature, approach and empirical efficiency"}
        {parameters.model_id === "constant" && "COP = the entered heating or cooling constant"}
        {parameters.model_id === "linear_source_temperature" && "COP = intercept + slope × source temperature"}
      </p>
    </section>
  );
}

function groupDefinitions(
  definitions: readonly ParameterDefinition[],
): Map<string, ParameterDefinition[]> {
  const grouped = new Map<string, ParameterDefinition[]>();
  for (const definition of definitions) {
    const group = grouped.get(definition.group) ?? [];
    group.push(definition);
    grouped.set(definition.group, group);
  }
  return grouped;
}

export function SettingsPanel({
  parameters,
  inputs,
  onParameterChange,
  onInputChange,
  validationIssues,
  calculatedGroundTemperatureC,
}: SettingsPanelProps) {
  const advancedGroups = groupDefinitions(
    PARAMETER_REGISTRY.filter((definition) => definition.uiTier === "advanced"),
  );
  const constantGroups = groupDefinitions(
    PARAMETER_REGISTRY.filter((definition) => definition.uiTier === "equation_constant"),
  );
  return (
    <div className="settings-stack">
      <section className="settings-card" id="ground-settings">
        <div className="section-heading">
          <div><span>01</span><h2>Ground temperature</h2></div>
          <p>Select preprocessed data or override the inputs. The browser runs formulas, not raster processing.</p>
        </div>
        <div className="field-grid">
          <SelectField id="ground-mode" label="Ground-temperature method" value={parameters.ground.mode} options={groundModes} onChange={(value) => onParameterChange("ground.mode", value)} />
          <SelectField
            id="surface-dataset"
            label="Surface-temperature dataset"
            value={parameters.ground.surface_dataset_id}
            options={[
              { value: "surface_t", label: TEMPERATURE_DATASET_LABELS.surface_t },
              { value: "air_t", label: TEMPERATURE_DATASET_LABELS.air_t },
            ]}
            onChange={(value) => onParameterChange("ground.surface_dataset_id", value)}
            help="Switching datasets loads the corresponding preprocessed postcode values."
          />
          {parameters.ground.mode !== "direct" && (
            <NumberField id="target-depth" label="Target depth" value={parameters.ground.target_depth_m} unit="m" onChange={(value) => onParameterChange("ground.target_depth_m", value)} required />
          )}
          {parameters.ground.mode !== "direct" && (
            <NumberField id="surface-temperature" label="Surface temperature" value={inputs.surfaceTemperatureC} unit="°C" onChange={(value) => onInputChange("surfaceTemperatureC", value)} required />
          )}
          {parameters.ground.mode === "surface_gradient" && (
            <NumberField id="ground-gradient" label="Estimated underground warming rate" value={inputs.gradientCPerM} unit="°C/m" step={0.001} onChange={(value) => onInputChange("gradientCPerM", value)} help="Estimated from the difference between borehole and surface temperatures divided by measurement depth. See the Glossary." required />
          )}
          {parameters.ground.mode === "surface_borehole_interpolation" && (
            <>
              <NumberField id="borehole-temperature" label="Borehole temperature" value={inputs.boreholeTemperatureC} unit="°C" onChange={(value) => onInputChange("boreholeTemperatureC", value)} required />
              <NumberField id="borehole-depth" label="Borehole measurement depth" value={inputs.boreholeDepthM} unit="m" onChange={(value) => onInputChange("boreholeDepthM", value)} required />
            </>
          )}
          {parameters.ground.mode === "direct" && (
            <NumberField id="direct-ground-temperature" label="Ground temperature (direct input)" value={inputs.directGroundTemperatureC} unit="°C" onChange={(value) => onInputChange("directGroundTemperatureC", value)} required />
          )}
        </div>
        <div className="live-calculation">
          <span>Ground temperature used in the current calculation</span>
          <strong>{calculatedGroundTemperatureC === null ? "Waiting for valid input" : `${calculatedGroundTemperatureC.toFixed(2)}°C`}</strong>
        </div>
        <p className="formula-inline">
          <strong>Current method:</strong>{" "}
          {parameters.ground.mode === "surface_gradient" && "T_ground = T_surface + estimated warming rate × target depth"}
          {parameters.ground.mode === "surface_borehole_interpolation" && "T_ground = T_surface + (T_borehole - T_surface) × target depth / borehole depth"}
          {parameters.ground.mode === "direct" && "T_ground = direct user input"}
        </p>
      </section>

      <section className="settings-card" id="load-settings">
        <div className="section-heading">
          <div><span>02</span><h2>Demand and annual load</h2></div>
          <p>Hourly degree-hours identify demand before certificate annual loads are allocated to that demand.</p>
        </div>
        <div className="field-grid">
          <NumberField id="annual-heating" label="Certificate annual heating load" value={inputs.annualHeatingKwhM2} unit="kWh/m²/year" onChange={(value) => onInputChange("annualHeatingKwhM2", value)} required />
          <NumberField id="annual-cooling" label="Certificate annual cooling load" value={inputs.annualCoolingKwhM2} unit="kWh/m²/year" onChange={(value) => onInputChange("annualCoolingKwhM2", value)} required />
          <NumberField id="heating-threshold" label="Heating demand threshold" value={parameters.load.heating_balance_temperature_c} unit="°C" onChange={(value) => onParameterChange("load.heating_balance_temperature_c", value)} />
          <NumberField id="cooling-threshold" label="Cooling demand threshold" value={parameters.load.cooling_balance_temperature_c} unit="°C" onChange={(value) => onParameterChange("load.cooling_balance_temperature_c", value)} />
          <NumberField id="floor-area" label="Conditioned area per building" value={parameters.load.conditioned_floor_area_m2} unit="m²" onChange={(value) => onParameterChange("load.conditioned_floor_area_m2", value)} />
          <NumberField id="building-count" label="Number of modelled buildings" value={parameters.load.building_count} step={1} onChange={(value) => onParameterChange("load.building_count", value)} help="Independent of the certificate record count." />
          <NumberField id="load-scale" label="Load scaling factor" value={parameters.load.load_scaling_factor} step={0.01} onChange={(value) => onParameterChange("load.load_scaling_factor", value)} />
          <NumberField id="occupancy-factor" label="Occupancy/use factor" value={parameters.load.occupancy_use_factor} step={0.01} onChange={(value) => onParameterChange("load.occupancy_use_factor", value)} />
        </div>
        <div className="formula-note">
          <code>HDH = max(0, heating threshold - outdoor temperature) × record weight</code>
          <code>CDH = max(0, outdoor temperature - cooling threshold) × record weight</code>
          <code>allocated load = requested annual load × record degree-hours / annual degree-hours</code>
        </div>
        <p className="rule-note"><strong>Important:</strong> if annual degree-hours are zero for a demand type, its allocated load and electricity use are zero even when the certificate load is non-zero.</p>
      </section>

      <section className="settings-card" id="period-settings">
        <div className="section-heading">
          <div><span>03</span><h2>Custom analysis period</h2></div>
          <p>Two hours before sunset and after sunrise are defaults only; any continuous period can be selected.</p>
        </div>
        <label className="switch-row">
          <input type="checkbox" checked={parameters.analysis_period.enabled} onChange={(event) => onParameterChange("analysis_period.enabled", event.target.checked)} />
          <span>Enable selected-period analysis and two-rate electricity-price grouping</span>
        </label>
        <div className="field-grid">
          <label className="field" htmlFor="period-label"><span className="field-label">Period label</span><input id="period-label" value={parameters.analysis_period.label} onChange={(event) => onParameterChange("analysis_period.label", event.target.value)} /></label>
          <SelectField id="period-mode" label="Period definition" value={parameters.analysis_period.mode} options={[
            { value: "solar_geometry", label: "Sunrise and sunset" },
            { value: "fixed_local_time", label: "Fixed local time" },
            { value: "all_hours", label: "All annual hours" },
          ]} onChange={(value) => onParameterChange("analysis_period.mode", value)} />
          {parameters.analysis_period.mode === "solar_geometry" && (
            <>
              <NumberField id="before-sunset" label="Hours before sunset" value={parameters.analysis_period.hours_before_sunset} unit="h" onChange={(value) => onParameterChange("analysis_period.hours_before_sunset", value)} />
              <NumberField id="after-sunrise" label="Hours after sunrise" value={parameters.analysis_period.hours_after_sunrise} unit="h" onChange={(value) => onParameterChange("analysis_period.hours_after_sunrise", value)} />
            </>
          )}
          {parameters.analysis_period.mode === "fixed_local_time" && (
            <>
              <NumberField id="fixed-start" label="Local start hour" value={parameters.analysis_period.fixed_start_local_hour} unit="h" onChange={(value) => onParameterChange("analysis_period.fixed_start_local_hour", value)} />
              <NumberField id="fixed-end" label="Local end hour" value={parameters.analysis_period.fixed_end_local_hour} unit="h" onChange={(value) => onParameterChange("analysis_period.fixed_end_local_hour", value)} />
              <NumberField id="utc-offset" label="UTC offset" value={parameters.analysis_period.fixed_utc_offset_hours} unit="h" onChange={(value) => onParameterChange("analysis_period.fixed_utc_offset_hours", value)} />
            </>
          )}
        </div>
      </section>

      <section className="settings-card" id="cop-settings">
        <div className="section-heading">
          <div><span>04</span><h2>Heat-pump performance (COP)<sup className="term-marker"><a href="#custom-note-cop" aria-label="Read note 1 about COP">1</a></sup></h2></div>
          <p>Ground-source and air-source systems can use independently selected formulas and parameters.</p>
        </div>
        <div className="cop-grid">
          <CopQuickPanel title="Ground-source heat pump (GSHP)" system="gshp" parameters={parameters.cop.gshp} onChange={onParameterChange} />
          <CopQuickPanel title="Air-source heat pump (ASHP)" system="ashp" parameters={parameters.cop.ashp} onChange={onParameterChange} />
        </div>
        <p className="formula-inline"><strong>Electricity:</strong> compressor electricity = allocated thermal load / COP. Pump, fan, miscellaneous and fixed annual auxiliary electricity are editable below under Advanced model parameters.</p>
        <p className="section-term-note" id="custom-note-cop"><strong>1 · Coefficient of performance (COP):</strong> heating or cooling delivered divided by compressor electricity at a particular condition. A COP of 4 means about four units of heating or cooling for one unit of compressor electricity. <a href="#glossary">More in the Glossary →</a></p>
      </section>

      <section className="settings-card" id="cost-settings">
        <div className="section-heading">
          <div><span>05</span><h2>Electricity price and investment</h2></div>
          <p>Technical results remain available when prices or installed costs are blank, but the economic assessment will be incomplete.</p>
        </div>
        <div className="field-grid">
          <SelectField id="tariff-mode" label="Electricity pricing method" value={parameters.tariff.mode} options={[
            { value: "single", label: "Single electricity price" },
            { value: "selected_period_two_rate", label: "Selected period / other period rates" },
          ]} onChange={(value) => onParameterChange("tariff.mode", value)} />
          <label className="field" htmlFor="currency"><span className="field-label">Currency</span><input id="currency" value={parameters.tariff.currency} onChange={(event) => onParameterChange("tariff.currency", event.target.value)} /></label>
          {parameters.tariff.mode === "single" ? (
            <NumberField id="single-price" label="Electricity price" value={parameters.tariff.single_price_per_kwh} unit={`${parameters.tariff.currency}/kWh`} step={0.01} onChange={(value) => onParameterChange("tariff.single_price_per_kwh", value)} />
          ) : (
            <>
              <NumberField id="selected-price" label="Selected-period price" value={parameters.tariff.selected_period_price_per_kwh} unit={`${parameters.tariff.currency}/kWh`} step={0.01} onChange={(value) => onParameterChange("tariff.selected_period_price_per_kwh", value)} />
              <NumberField id="other-price" label="Other-period price" value={parameters.tariff.other_period_price_per_kwh} unit={`${parameters.tariff.currency}/kWh`} step={0.01} onChange={(value) => onParameterChange("tariff.other_period_price_per_kwh", value)} />
            </>
          )}
          <NumberField id="gshp-installed-cost" label="Total ground-source installed cost" value={parameters.economics.gshp_installed_cost} unit={parameters.tariff.currency} step={100} onChange={(value) => onParameterChange("economics.gshp_installed_cost", value)} />
          <NumberField id="ashp-installed-cost" label="Total air-source installed cost" value={parameters.economics.ashp_installed_cost} unit={parameters.tariff.currency} step={100} onChange={(value) => onParameterChange("economics.ashp_installed_cost", value)} />
        </div>
        <div className="formula-note compact-formula-note">
          <code>single-rate cost = annual electricity × price + fixed charges</code>
          <code>NPV of choosing ground-source = air-source lifecycle cost - ground-source lifecycle cost</code>
        </div>
      </section>

      {validationIssues.length > 0 && (
        <section className="validation-panel" role="status">
          <strong>Parameter check: {validationIssues.filter((issue) => issue.severity === "error").length} errors, {validationIssues.filter((issue) => issue.severity === "warning").length} warnings</strong>
          <ul>{validationIssues.slice(0, 12).map((issue) => <li key={`${issue.path}-${issue.message}`} className={issue.severity}>{issue.path}: {issue.message}</li>)}</ul>
        </section>
      )}

      <details className="parameter-drawer">
        <summary><span>Advanced model parameters</span><small>Pump and fan electricity, COP bounds, maintenance, replacements, discounting and quality thresholds</small></summary>
        {[...advancedGroups.entries()].map(([group, definitions]) => (
          <details className="parameter-group" key={group}>
            <summary>{group} ({definitions.length})</summary>
            <div className="field-grid">
              {definitions.map((definition) => (
                <ParameterControl key={definition.path} definition={definition} value={getParameterValue(parameters, definition.path)} onChange={(value) => onParameterChange(definition.path, value)} />
              ))}
            </div>
          </details>
        ))}
      </details>

      <details className="parameter-drawer constants-drawer">
        <summary><span>Equation constants</span><small>Year length, solar geometry, Kelvin offset, seasons and numerical tolerances; confirm the meaning before editing</small></summary>
        {[...constantGroups.entries()].map(([group, definitions]) => (
          <details className="parameter-group" key={group}>
            <summary>{group} ({definitions.length})</summary>
            <div className="field-grid">
              {definitions.map((definition) => (
                <ParameterControl key={definition.path} definition={definition} value={getParameterValue(parameters, definition.path)} onChange={(value) => onParameterChange(definition.path, value)} />
              ))}
            </div>
          </details>
        ))}
      </details>
    </div>
  );
}
