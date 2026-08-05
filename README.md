# GeoPump Planner

GeoPump Planner is an open-source, postcode-scale screening app that matches
shallow ground temperature with local heating and cooling demand across
Australia. It compares ground-source heat pumps (GSHP) with air-source heat
pumps (ASHP), including electricity use, tariffs and lifecycle economics.

The app is entirely static. It has no account system, backend, database,
ArcGIS runtime dependency or browser-side spatial processing. All raster,
borehole and postcode aggregation is completed before release; the browser
loads prepared postcode data and runs the calculation models only.

## Features

- Search 2,641 spatial postcodes and load climate files only when selected.
- Choose either the Geoscience Australia Surface T chain or CSIRO Air T chain.
- Calculate ground temperature from surface temperature and gradient, interpolate
  a user-supplied borehole measurement, or enter ground temperature directly.
- Allocate certificate annual loads using editable hourly heating and cooling
  degree-hour thresholds (paper defaults: 12°C and 24°C).
- Return zero allocated load when annual degree-hours are zero, even if the
  certificate load is non-zero, while retaining the unallocated value in the
  calculation trace.
- Define a solar, fixed local-time, all-hours or disabled analysis period. The
  paper's two-hours-before-sunset/two-hours-after-sunrise window is only a preset.
- Edit all 109 registered model parameters and equation constants without
  modifying source code.
- Compare COP, annual and monthly electricity, tariffs, lifecycle cost, payback,
  NPV and evidence quality for GSHP and ASHP.
- Export a complete scenario as JSON, import it again, and export results as CSV.
- Inspect data version, climate coverage, certificate sample size, borehole
  evidence, user overrides and dataset-specific ΔT20 interpolation uncertainty.

## Live site

The verified static build is published from the `gh-pages` branch at:

<https://lighthaan.github.io/GeoPump-planner/>

The first release was published only after the TypeScript, Python regression,
data-package and browser checks passed. An optional GitHub Actions template is
kept at `docs/pages-workflow.yml.example`; copy it to
`.github/workflows/pages.yml` when using a GitHub credential with `workflow`
permission.

## Local development

Requirements: Node.js 24 and pnpm 11.9 or compatible versions.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Verification and production build:

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm preview
```

## Method and data

The model uses weighted representative climate hours. Current climate files
contain 1,752 records per available postcode, each representing five hours, for
8,760 represented hours. Certificate load is an annual input to be distributed
only where climate-derived demand exists; it is not treated as demand in every
hour.

`Dwelling_Count` is published as `certificate_count`: the number of certificates
with records, not the number of dwellings in the postcode. Building count and
conditioned area are separate editable scenario inputs.

The ΔT20 EBK prediction standard error applies only to the Surface T + ΔT20
interpolation chain. It is not applied to Air T + ΔT20New and is not presented as
total ground-temperature uncertainty.

See [the user guide](docs/user-guide.md), [the frozen data manifest](public/data/manifest.json),
[the data dictionary](public/data/data-dictionary.md) and [third-party notices](THIRD_PARTY_NOTICES.md).

## Scope and disclaimer

GeoPump Planner is an early-stage technical and economic screening framework.
It is not a borehole design, ground-loop sizing tool, thermal-response test,
engineering quotation or substitute for site-specific professional assessment.

## License

Application code is released under the [MIT License](LICENSE). Source datasets
and derived data remain subject to their respective source terms and attribution
requirements; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
