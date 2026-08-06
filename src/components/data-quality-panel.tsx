import type { DataManifest, PostcodeAttributes, SurfaceDatasetId } from "../data/postcode";
import { TEMPERATURE_DATASET_LABELS } from "../data/temperature-datasets";
import type { ClimateRecord } from "../engine/types";

interface DataQualityPanelProps {
  attributes: PostcodeAttributes;
  climate: readonly ClimateRecord[];
  datasetId: SurfaceDatasetId;
  expectedAnnualHours: number;
  manifest: DataManifest;
  overrides: readonly string[];
}

function display(value: number | null, digits = 1): string {
  return value === null || !Number.isFinite(value) ? "Not available" : value.toFixed(digits);
}

export function DataQualityPanel({
  attributes,
  climate,
  datasetId,
  expectedAnnualHours,
  manifest,
  overrides,
}: DataQualityPanelProps) {
  const source = manifest.surface_temperature_datasets.find((item) => item.id === datasetId);
  const validRecords = climate.filter((record) => (
    Number.isInteger(record.dayOfYear) &&
    record.dayOfYear >= 1 &&
    record.dayOfYear <= 366 &&
    Number.isFinite(record.hourUtc) &&
    record.hourUtc >= 0 &&
    record.hourUtc < 24 &&
    Number.isFinite(record.airTempC) &&
    Number.isFinite(record.weightHours) &&
    record.weightHours > 0
  ));
  const representedHours = validRecords.reduce((total, record) => total + record.weightHours, 0);
  const invalidRecords = climate.length - validRecords.length;
  const unrepresentedHours = Math.max(0, expectedAnnualHours - representedHours);
  const excessHours = Math.max(0, representedHours - expectedAnnualHours);
  const uncertainty = attributes.ground.uncertainty;
  const standardErrorApplicable = datasetId === uncertainty.applies_to_dataset_id;

  return (
    <section className="quality-section" id="data-quality">
      <div className="quality-heading">
        <div>
          <p className="eyebrow">Data provenance and quality</p>
          <h2>Evidence used by this postcode calculation</h2>
        </div>
        <span className="dataset-version">Dataset {manifest.dataset_version}</span>
      </div>

      <div className="quality-grid">
        <article>
          <span>Surface-temperature source</span>
          <strong>{source?.label ?? TEMPERATURE_DATASET_LABELS[datasetId]}</strong>
          <small>{source === undefined ? "Coverage not recorded" : `${source.provider} · ${source.temporal_coverage}`}</small>
          {source !== undefined && <a href={source.source_url} target="_blank" rel="noreferrer">Open source record</a>}
        </article>
        <article>
          <span>ΔT20 EBK prediction standard error</span>
          <strong>{standardErrorApplicable ? `${display(uncertainty.delta_t20_ebk_prediction_se_c, 3)}°C` : "Not applicable"}</strong>
          <small>
            {standardErrorApplicable
              ? "Interpolation standard error for ΔT20 only; it is not total ground-temperature uncertainty."
              : `This statistic belongs to the ${TEMPERATURE_DATASET_LABELS.surface_t} + ΔT20 chain and is not applied to the ${TEMPERATURE_DATASET_LABELS.air_t} + ΔT20New chain.`}
          </small>
        </article>
        <article>
          <span>Borehole evidence</span>
          <strong>{display(attributes.ground.nearest_borehole_km)} km nearest</strong>
          <small>
            {attributes.ground.nearby_borehole_count ?? "Not available"} boreholes within {display(attributes.ground.nearby_radius_km, 0)} km
          </small>
        </article>
        <article>
          <span>Certificate sample</span>
          <strong>{attributes.load.certificate_count ?? "Not available"} records</strong>
          <small>Dwelling_Count is the number of recorded certificates, not the postcode dwelling population.</small>
        </article>
        <article>
          <span>Climate time resolution</span>
          <strong>{attributes.climate.record_count ?? climate.length} representative hours</strong>
          <small>
            {attributes.climate.record_type ?? manifest.climate.record_type}; each record represents {display(attributes.climate.weight_hours, 1)} h
          </small>
        </article>
        <article>
          <span>Climate coverage check</span>
          <strong>{display(representedHours, 0)} / {display(expectedAnnualHours, 0)} h</strong>
          <small>{invalidRecords} invalid records · {display(unrepresentedHours, 0)} unrepresented hours · {display(excessHours, 0)} excess hours</small>
        </article>
      </div>

      <details className="override-list" open={overrides.length > 0}>
        <summary>User overrides ({overrides.length})</summary>
        {overrides.length === 0 ? (
          <p>No model inputs or registered parameters differ from the frozen postcode data and paper preset.</p>
        ) : (
          <ul>{overrides.map((item) => <li key={item}>{item}</li>)}</ul>
        )}
      </details>

      {attributes.quality.warnings.length > 0 && (
        <details className="override-list">
          <summary>Frozen-data warnings ({attributes.quality.warnings.length})</summary>
          <ul>{attributes.quality.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
        </details>
      )}
    </section>
  );
}
