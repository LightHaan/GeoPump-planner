# Phase 4: minimum frontend and release hardening

## Outcome

Phase 4 provides a responsive React, TypeScript and Vite application with no
account, backend, database, ArcGIS runtime or external upload of postcode inputs
or results. It includes:

- search and availability indicators for 2,641 postcodes;
- four hash-routed pages: concise Planner, detailed Results, full Customise and
  a separate Guide;
- a Leaflet postcode map with click selection, zoom controls, robust colour
  scales, 13 selectable metrics and an all-data drawer for the selected postcode;
- independently loaded climate JSON for the selected postcode;
- switching between *Australian mean land-surface temperature* (Geoscience
  Australia) and *Hourly near-surface air temperature grids for Australia
  (long-term climatology)* (CSIRO), with three ground-temperature input methods;
- editable depth, temperature, gradient, annual loads, balance temperatures,
  building scale, selected period, COP, tariffs and installed cost;
- automatically generated advanced and equation-constant controls for every
  registered parameter;
- annual/monthly electricity and load results, APF, savings, tariffs, NPV,
  payback and evidence-quality decisions;
- calculation trace showing requested, allocated and unallocated loads;
- complete scenario JSON export/import and results CSV export;
- a data provenance/quality panel showing the data version, climate coverage,
  invalid/unrepresented hours, certificate and borehole evidence, active
  overrides and dataset-specific ΔT20 uncertainty;
- paper-default reset and English-only public interface/documentation.

## Runtime boundary

The app loads `postcode-index.json`, `postcode-attributes.json` and
`manifest.json` at startup, then loads `climate/{postcode}.json` on selection. It
does not open the ArcGIS project, raster or geodatabase, and does not run zonal
statistics, interpolation or other spatial processing.

## Local operation

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Production verification:

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm preview
```

## GitHub Pages

`vite.config.ts` derives the project base path from `GITHUB_REPOSITORY` during
the production build. `.github/workflows/pages.yml` runs the test suite, builds
`dist` and deploys the verified static site on every push to `main`. Pull requests
run the same verification without publishing a site.

## Postcode map

The implemented map uses Leaflet Canvas with no basemap API key. It loads the
prepared postcode GeoJSON, joins each feature to `postcode-attributes.json` and
colours the boundaries using robust 5th-to-95th percentile scales. Selecting a
postcode through the map uses the same calculation path as the text search.

ArcGIS can later publish a FeatureLayer, while QGIS can continue desktop
preprocessing and export GeoJSON, GeoPackage or vector tiles. Replacing the map
data source does not affect degree-hours, ground temperature, COP, electricity
or economics.

Additional COP formulas remain an optional future extension.
