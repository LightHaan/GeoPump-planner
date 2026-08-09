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

- Explore all 2,641 spatial postcodes on a free Leaflet map, colour the map by
  five decision-oriented local temperature or demand indicators, and click a
  postcode to model it. Technical evidence is kept off the home page.
- Use a concise Planner home page, with full results, model customisation, the
  user guide and a plain-English glossary kept on separate pages.
- Search 2,641 spatial postcodes and load climate files only when selected.
- Choose either *Australian mean land-surface temperature* from Geoscience
  Australia or *Hourly near-surface air temperature grids for Australia
  (long-term climatology)* from CSIRO.
- Calculate ground temperature from surface temperature and an estimated
  underground warming rate, interpolate a user-supplied borehole measurement,
  or enter ground temperature directly. The warming rate is explicitly labelled
  as a postcode-scale approximation rather than a measured geothermal gradient.
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

GitHub Actions verifies every push to `main` and publishes the static build at:

<https://lighthaan.github.io/GeoPump-planner/>

The initial release was published only after the TypeScript, Python regression,
data-package and browser checks passed. The active workflow is defined in
`.github/workflows/pages.yml`; contributors only need to work with `main`.

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

The calculation sequence is:

```text
ground temperature = surface temperature + estimated warming rate × target depth

heating degree-hours_t = max(0, heating threshold - outdoor temperature_t) × weight_t
cooling degree-hours_t = max(0, outdoor temperature_t - cooling threshold) × weight_t

requested annual load = certificate load intensity × conditioned area
                        × building count × scaling factor × occupancy factor
allocated load_t = requested annual load × degree-hours_t / annual degree-hours

compressor electricity_t = allocated thermal load_t / COP_t
relative GSHP saving = (ASHP electricity - GSHP electricity) / ASHP electricity
NPV of choosing GSHP = ASHP lifecycle cost - GSHP lifecycle cost
```

The ground equation can be replaced by surface-to-borehole interpolation or a
direct temperature input. GSHP and ASHP can independently use scaled-Carnot,
constant or linear source-temperature COP models. System electricity adds
editable pump, fan, miscellaneous and fixed annual auxiliaries; tariffs and
lifecycle economics are then applied using the user's assumptions.

The default 1 m² heated/cooled floor area produces a normalised comparison that
is numerically equivalent to a per-square-metre result. Users should enter the
actual floor area they heat or cool before interpreting the output as a
whole-home estimate. Annual system electricity and running cost cover the
modelled heat-pump heating and cooling only, not all property electricity use or
the full electricity bill.

The warming rate starts with borehole observations. The measured underground
temperature is compared with the selected surface temperature, and the
difference is divided by the borehole measurement depth to estimate temperature
change per metre. Borehole-based estimates are spatially prepared for each
postcode. The app then applies the rate linearly:

```text
ground temperature at depth = surface temperature + warming rate × depth
```

The 20 m temperature difference and 20 m ground temperature are derived from
this rate. The rate remains a screening approximation rather than a site-
measured geothermal gradient; establishing a physical geothermal gradient
requires more complete, quality-controlled downhole measurements and site
interpretation.

If the annual heating or cooling degree-hour denominator is zero, the default
policy allocates zero load for that demand type even when its certificate input
is positive. The requested amount is retained as unallocated load in the
calculation trace. Alternative error and uniform-allocation policies are
available on the Customise page.

`Dwelling_Count` is published as `certificate_count`: the number of certificates
with records, not the number of dwellings in the postcode. Building count and
conditioned area are separate editable scenario inputs.

Annual kWh and cost outputs are totals for the current scenario's heated/cooled
floor area, building count and load factors. The paper default uses 1 m² and one
building as a normalised starting point; users should enter their actual area
for a home-scale estimate.

The ΔT20 EBK prediction standard error applies only to the *Australian mean
land-surface temperature* + ΔT20 interpolation chain. It is not applied to the
*Hourly near-surface air temperature grids for Australia (long-term
climatology)* + ΔT20New chain and is not presented as total ground-temperature
uncertainty.

## Documentation

- [User guide](docs/user-guide.md): page-by-page workflow, demand interpretation
  and the most important cautions.
- **In-app Glossary**: plain-English explanations of heat-pump, ground,
  climate, performance, cost and data-quality terminology.
- [Calculation and parameter reference](docs/calculation-reference.md): complete
  equations, output definitions, decision logic, validation behaviour and all
  109 editable parameter defaults.
- [Frozen data dictionary](public/data/data-dictionary.md): prepared postcode
  field definitions and units.
- [Frozen data manifest](public/data/manifest.json): data version, source URLs,
  coverage and file checksums.
- [Third-party notices](THIRD_PARTY_NOTICES.md): source attribution and terms.

## Map

The map uses Leaflet with Canvas rendering and the prepared postcode GeoJSON in
`public/data/postcode-boundaries.geojson`. It has no commercial basemap, API key
or ArcGIS runtime dependency. Map features are joined in the browser to the
published postcode attribute index; climate calculation files are still loaded
only for the selected postcode.

## Scope and disclaimer

GeoPump Planner is an early-stage technical and economic screening framework.
It is not a borehole design, ground-loop sizing tool, thermal-response test,
engineering quotation or substitute for site-specific professional assessment.

## License

Application code is released under the [MIT License](LICENSE). Source datasets
and derived data remain subject to their respective source terms and attribution
requirements; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
