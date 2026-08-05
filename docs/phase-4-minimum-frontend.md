# Phase 4: minimum frontend and release hardening

## Outcome

Phase 4 provides a responsive React, TypeScript and Vite application with no
account, backend, database, ArcGIS runtime or external upload of postcode inputs
or results. It includes:

- search and availability indicators for 2,641 postcodes;
- independently loaded climate JSON for the selected postcode;
- Surface T/Air T switching and three ground-temperature input methods;
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
the production build. The verified static site is published from the
`gh-pages` branch. `docs/pages-workflow.yml.example` is an optional pinned
GitHub Actions template that can run the tests, build `dist` and deploy on pushes
to `main`; activating it requires a GitHub credential with `workflow` permission.

## Optional online-map extension

Map integration does not require calculation-engine changes. The repository
already contains standard GeoJSON postcode boundaries, postcode coordinates and
`src/integrations/map-adapter.ts`. A future free map can use MapLibre GL JS or
Leaflet. ArcGIS can publish a FeatureLayer, while QGIS can continue desktop
preprocessing and export GeoJSON, GeoPackage or vector tiles. These choices affect
data preparation/display only, not degree-hours, ground temperature, COP,
electricity or economics.

Additional COP formulas and a map are optional future extensions and do not
block the current release.
