import { useEffect, useMemo, useRef, useState } from "react";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";

import {
  postcodeBoundaryUrl,
  type PostcodeAttributeIndex,
  type PostcodeIndexEntry,
  type SurfaceDatasetId,
} from "../data/postcode";
import { TEMPERATURE_DATASET_LABELS } from "../data/temperature-datasets";
import {
  colourForMetricValue,
  createMetricScale,
  formatMetricValue,
  MAP_METRICS,
  mapMetric,
  prepareBoundaryCollection,
  type BoundaryFeatureCollection,
  type MapMetricId,
  type MetricScale,
} from "../map/postcode-map-data";

interface PostcodeMapProps {
  attributeIndex: PostcodeAttributeIndex;
  postcodeIndex: readonly PostcodeIndexEntry[];
  selectedPostcode: string | null;
  surfaceDatasetId: SurfaceDatasetId;
  onSelectPostcode: (postcode: string) => void;
}

const SURFACE_DATASET_METRICS = new Set<MapMetricId>([
  "ground_surface_20",
  "surface_temperature",
  "surface_gradient",
  "surface_delta_t20",
  "delta_t20_se",
]);

const AIR_DATASET_METRICS = new Set<MapMetricId>([
  "ground_air_20",
  "air_temperature",
  "air_gradient",
  "air_delta_t20",
]);

const HOME_MAP_METRICS = new Set<MapMetricId>([
  "ground_surface_20",
  "ground_air_20",
  "surface_temperature",
  "air_temperature",
  "surface_gradient",
  "air_gradient",
  "heating_load",
  "cooling_load",
]);

function defaultGroundMetric(datasetId: SurfaceDatasetId): MapMetricId {
  return datasetId === "air_t" ? "ground_air_20" : "ground_surface_20";
}

function metricMatchesDataset(metricId: MapMetricId, datasetId: SurfaceDatasetId): boolean {
  if (SURFACE_DATASET_METRICS.has(metricId)) return datasetId === "surface_t";
  if (AIR_DATASET_METRICS.has(metricId)) return datasetId === "air_t";
  return true;
}

type PostcodePath = L.Path & {
  feature?: GeoJSON.Feature;
  getBounds: () => L.LatLngBounds;
  getCenter: () => L.LatLng;
};

const POSTCODE_LABEL_MIN_ZOOM = 9;

function number(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "No data";
  return value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function legendGradient(scale: MetricScale): string {
  const denominator = Math.max(1, scale.stops.length - 1);
  const colourStops = scale.stops.map(([, colour], index) => (
    `${colour} ${(index / denominator) * 100}%`
  ));
  return `linear-gradient(90deg, ${colourStops.join(", ")})`;
}

function featurePostcode(feature: GeoJSON.Feature | undefined): string | null {
  const raw = feature?.properties?.POA_CODE21 ?? feature?.properties?.postcode;
  return typeof raw === "string" || typeof raw === "number"
    ? String(raw).padStart(4, "0")
    : null;
}

function pathStyle(
  feature: GeoJSON.Feature | undefined,
  metricId: MapMetricId,
  scale: MetricScale,
  selected: boolean,
  renderer: L.Renderer,
): L.PathOptions {
  const property = mapMetric(metricId).property;
  return {
    renderer,
    fillColor: colourForMetricValue(feature?.properties?.[property], scale),
    fillOpacity: 0.84,
    color: selected ? "#153b36" : "#ffffff",
    opacity: selected ? 1 : 0.78,
    weight: selected ? 3 : 0.55,
  };
}

export function PostcodeMap({
  attributeIndex,
  postcodeIndex,
  selectedPostcode,
  surfaceDatasetId,
  onSelectPostcode,
}: PostcodeMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.GeoJSON | null>(null);
  const rendererRef = useRef<L.Renderer | null>(null);
  const pathsRef = useRef(new Map<string, PostcodePath>());
  const labelledPostcodesRef = useRef(new Set<string>());
  const onSelectRef = useRef(onSelectPostcode);
  const previousSelectionRef = useRef<string | null>(null);
  const metricIdRef = useRef<MapMetricId>(defaultGroundMetric(surfaceDatasetId));
  const scaleRef = useRef<MetricScale | null>(null);
  const selectedPostcodeRef = useRef<string | null>(selectedPostcode);
  const [metricId, setMetricId] = useState<MapMetricId>(() => defaultGroundMetric(surfaceDatasetId));
  const [hoveredPostcode, setHoveredPostcode] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  onSelectRef.current = onSelectPostcode;

  const availableMetrics = useMemo(
    () => MAP_METRICS.filter((item) => HOME_MAP_METRICS.has(item.id) && metricMatchesDataset(item.id, surfaceDatasetId)),
    [surfaceDatasetId],
  );

  const scale = useMemo(
    () => createMetricScale(attributeIndex, metricId),
    [attributeIndex, metricId],
  );
  const metric = mapMetric(metricId);
  const hoveredAttributes = hoveredPostcode === null ? null : attributeIndex[hoveredPostcode] ?? null;
  const selectedAttributes = selectedPostcode === null ? null : attributeIndex[selectedPostcode] ?? null;
  metricIdRef.current = metricId;
  scaleRef.current = scale;
  selectedPostcodeRef.current = selectedPostcode;

  useEffect(() => {
    if (!metricMatchesDataset(metricId, surfaceDatasetId)) {
      setMetricId(defaultGroundMetric(surfaceDatasetId));
    }
  }, [metricId, surfaceDatasetId]);

  useEffect(() => {
    if (containerRef.current === null || Object.keys(attributeIndex).length === 0) return;
    const controller = new AbortController();
    let active = true;
    const initialMetricId = metricIdRef.current;
    const initialScale = createMetricScale(attributeIndex, initialMetricId);
    const renderer = L.canvas({ padding: 0.5 });
    const map = L.map(containerRef.current, {
      center: [-27, 134.5],
      zoom: 3,
      minZoom: 2,
      maxZoom: 12,
      attributionControl: false,
      zoomControl: true,
      preferCanvas: true,
      renderer,
    });
    map.fitBounds(L.latLngBounds([[-44, 112], [-10, 154]]), { padding: [14, 14] });
    mapRef.current = map;
    rendererRef.current = renderer;

    const syncPostcodeLabels = () => {
      const labels = labelledPostcodesRef.current;
      const showLabels = map.getZoom() >= POSTCODE_LABEL_MIN_ZOOM;
      const visibleBounds = map.getBounds().pad(0.12);
      const wantedLabels = new Set<string>();
      const occupiedCells = new Set<string>();
      if (showLabels) {
        const zoom = map.getZoom();
        const [cellWidth, cellHeight] = zoom >= 11
          ? [48, 20]
          : zoom === 10
            ? [80, 32]
            : [120, 48];
        const candidates = [...pathsRef.current.entries()]
          .filter(([, path]) => visibleBounds.contains(path.getCenter()))
          .sort(([left], [right]) => (
            Number(right === selectedPostcodeRef.current)
            - Number(left === selectedPostcodeRef.current)
          ));
        for (const [postcode, path] of candidates) {
          const point = map.latLngToContainerPoint(path.getCenter());
          const cell = `${Math.floor(point.x / cellWidth)}:${Math.floor(point.y / cellHeight)}`;
          if (postcode !== selectedPostcodeRef.current && occupiedCells.has(cell)) continue;
          wantedLabels.add(postcode);
          occupiedCells.add(cell);
        }
      }
      if (containerRef.current !== null) {
        containerRef.current.dataset.visibleLabelCount = String(wantedLabels.size);
      }
      for (const [postcode, path] of pathsRef.current) {
        const shouldShow = wantedLabels.has(postcode);
        if (shouldShow && !labels.has(postcode)) {
          path.bindTooltip(postcode, {
            className: "postcode-label",
            direction: "center",
            interactive: false,
            permanent: true,
            opacity: 0.92,
          });
          labels.add(postcode);
        } else if (!shouldShow && labels.has(postcode)) {
          path.unbindTooltip();
          labels.delete(postcode);
        }
      }
    };

    const initialise = async () => {
      try {
        const response = await fetch(postcodeBoundaryUrl(), { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const raw = await response.json() as BoundaryFeatureCollection;
        const prepared = prepareBoundaryCollection(raw, attributeIndex);
        if (!active) return;
        pathsRef.current.clear();
        const group = L.geoJSON(prepared as unknown as GeoJSON.GeoJsonObject, {
          style: (feature) => pathStyle(feature, initialMetricId, initialScale, false, renderer),
          onEachFeature: (feature, layer) => {
            if (!(layer instanceof L.Path)) return;
            const path = layer as PostcodePath;
            const postcode = featurePostcode(feature);
            if (postcode === null) return;
            pathsRef.current.set(postcode, path);
            path.on({
              click: () => onSelectRef.current(postcode),
              mouseover: () => {
                setHoveredPostcode(postcode);
                path.setStyle({ color: "#153b36", weight: 1.8, opacity: 1 });
              },
              mouseout: () => {
                setHoveredPostcode(null);
                const currentScale = scaleRef.current ?? initialScale;
                path.setStyle(pathStyle(
                  path.feature,
                  metricIdRef.current,
                  currentScale,
                  postcode === selectedPostcodeRef.current,
                  renderer,
                ));
              },
            });
          },
        }).addTo(map);
        layerGroupRef.current = group;
        map.on("zoomend moveend", syncPostcodeLabels);
        syncPostcodeLabels();
        if (containerRef.current !== null) {
          containerRef.current.dataset.rawFeatureCount = String(prepared.features.length);
          containerRef.current.dataset.renderedFeatureCount = String(pathsRef.current.size);
        }
        map.invalidateSize();
        setMapReady(true);
        setMapError(null);
      } catch (error) {
        if (!active || (error instanceof DOMException && error.name === "AbortError")) return;
        setMapError(error instanceof Error ? error.message : "The postcode map could not be loaded.");
      }
    };
    void initialise();

    return () => {
      active = false;
      controller.abort();
      map.off("zoomend moveend", syncPostcodeLabels);
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
      rendererRef.current = null;
      pathsRef.current.clear();
      labelledPostcodesRef.current.clear();
      setMapReady(false);
    };
  }, [attributeIndex]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!mapReady || renderer === null) return;
    for (const [postcode, path] of pathsRef.current) {
      path.setStyle(pathStyle(path.feature, metricId, scale, postcode === selectedPostcode, renderer));
    }
  }, [mapReady, metricId, scale, selectedPostcode]);

  useEffect(() => {
    const map = mapRef.current;
    const renderer = rendererRef.current;
    if (!mapReady || map === null || renderer === null) return;
    if (selectedPostcode !== null) {
      const path = pathsRef.current.get(selectedPostcode);
      path?.setStyle(pathStyle(path.feature, metricId, scale, true, renderer));
      path?.bringToFront();
    }
    if (
      previousSelectionRef.current !== null &&
      selectedPostcode !== null &&
      previousSelectionRef.current !== selectedPostcode
    ) {
      const entry = postcodeIndex.find((item) => item.postcode === selectedPostcode);
      if (entry !== undefined) {
        map.flyTo([entry.lat, entry.lon], Math.max(map.getZoom(), 5), { duration: 0.65 });
      }
    }
    previousSelectionRef.current = selectedPostcode;
  }, [mapReady, metricId, postcodeIndex, scale, selectedPostcode]);

  const hoveredValue = hoveredAttributes === null ? null : metric.value(hoveredAttributes);

  return (
    <section className="postcode-map-card" aria-labelledby="postcode-map-title">
      <div className="map-toolbar">
        <div>
          <h2 id="postcode-map-title">Explore local conditions</h2>
          <p>Choose what the colours show, then click a postcode.</p>
        </div>
        <label className="map-metric-select">
          <span>Colour map by</span>
          <select value={metricId} onChange={(event) => setMetricId(event.target.value as MapMetricId)}>
            {availableMetrics.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
      </div>

      <div className="map-frame">
        <div ref={containerRef} className="postcode-map" aria-label="Interactive Australian postcode map" />
        {!mapReady && mapError === null && <div className="map-loading">Loading postcode boundaries…</div>}
        {mapError !== null && <div className="map-loading map-error" role="alert">Map unavailable: {mapError}</div>}
        <div className="map-legend" aria-label={`${metric.label} legend`}>
          <i aria-hidden="true" style={{ background: legendGradient(scale) }} />
          <div className="map-legend-values">
            <span>{number(scale.lower, metric.id.includes("gradient") ? 3 : 1)}</span>
            <span>{number(scale.middle, metric.id.includes("gradient") ? 3 : 1)}</span>
            <span>{number(scale.upper, metric.id.includes("gradient") ? 3 : 1)} {metric.unit}</span>
          </div>
          <small className="map-legend-no-data"><i aria-hidden="true" /> No postcode data</small>
        </div>
        {hoveredPostcode !== null && (
          <div className="map-hover-card" aria-live="polite">
            <strong>{hoveredPostcode}</strong>
            <span>{formatMetricValue(hoveredValue, metric)}</span>
            <small>Click to use this postcode</small>
          </div>
        )}
      </div>

      {selectedPostcode !== null && selectedAttributes !== null && (
        <details className="postcode-data-drawer">
          <summary>Local estimates for postcode {selectedPostcode}</summary>
          <div className="postcode-data-grid">
            <div><span>Temperature source</span><strong>{TEMPERATURE_DATASET_LABELS[surfaceDatasetId]}</strong></div>
            <div><span>{surfaceDatasetId === "air_t" ? "Near-surface air temperature" : "Land-surface temperature"}</span><strong>{number(selectedAttributes.ground[surfaceDatasetId].surface_temp_c, 2)} °C</strong></div>
            <div><span>Estimated ground temperature at 20 m</span><strong>{number(selectedAttributes.ground[surfaceDatasetId].ground_temp_at_reference_depth_c, 2)} °C</strong></div>
            <div><span>Estimated underground warming rate<sup className="term-marker"><a href="#home-note-warming" aria-label="Read note 1 about estimated underground warming rate">1</a></sup></span><strong>{number(selectedAttributes.ground[surfaceDatasetId].gradient_c_per_m, 3)} °C/m</strong></div>
            <div><span>Typical annual heating need</span><strong>{number(selectedAttributes.load.annual_heating_kwh_m2, 1)} kWh/m²/year</strong></div>
            <div><span>Typical annual cooling need</span><strong>{number(selectedAttributes.load.annual_cooling_kwh_m2, 1)} kWh/m²/year</strong></div>
          </div>
        </details>
      )}
    </section>
  );
}
