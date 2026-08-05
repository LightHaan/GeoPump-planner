# Phase 3: TypeScript calculation engine

## Outcome

Phase 3 implemented a pure TypeScript engine for single-postcode scenarios. It
runs in the browser without ArcGIS, a server, a database or runtime spatial
analysis. Main entry points are:

- `src/engine/scenario.ts`: complete postcode scenario calculation;
- `src/parameters/definitions.ts`: editable parameter registry;
- `src/cop-models/registry.ts`: selectable COP model registry;
- `src/engine/decision.ts`: technical, economic and evidence-quality decisions;
- `src/data/climate.ts`: loader for preprocessed postcode climate files.

## Explicit parameters

All 109 leaf parameters in `paper-defaults.json`, excluding preset identity
metadata, are registered as editable. Each registry entry includes path, type,
default, unit, options, recommended range, hard limit, input step, source,
equation references and interface tier. Consequently, defaults such as 12°C,
24°C, 40°C, 7°C, 5 K, 0.35, 273.15, the two-hour solar offsets, year length,
solar constants, COP bounds, seasons and numerical tolerances are not immutable
business constants hidden in code.

## Demand and certificate-load rule

The engine calculates weighted hourly heating and cooling degree-hours before
allocating postcode annual certificate loads in proportion to those degree-hours.
`certificate_count` is evidence of sample size only and does not multiply load.

The default `zero_degree_hour_policy = discard_with_warning` returns zero
allocated load for a demand type whose annual degree-hours are zero. A non-zero
certificate value is retained as requested and unallocated load, but does not
enter COP, electricity or cost calculations.

## Ground, analysis period and COP

Ground temperature supports surface-plus-gradient calculation, controlled
surface/borehole interpolation or a direct user input. The engine reads prepared
postcode attributes and never reads rasters or performs zonal statistics.

The selected analysis period can use solar geometry, any continuous local-time
window, all annual hours or be disabled. “Two hours before sunset to two hours
after sunrise” is a paper preset only; result fields use the neutral term
`selectedPeriod`.

The current registry supports scaled Carnot, constant COP and linear
source-temperature formulas with independent GSHP/ASHP parameters. New models
can be added later without changing the scenario engine. Invalid-COP policy,
COP bounds and all auxiliary electricity parameters are editable.

## Economics and evidence quality

The economic engine covers single/two-rate tariffs, fixed charges, installed and
maintenance costs, discounting, electricity-price escalation, replacement
schedules, residual value, simple payback, lifecycle cost and NPV. Missing
economic inputs do not prevent technical results.

ΔT20 EBK prediction standard error is assessed only for the `surface_t` chain.
It is marked not applicable for `air_t` and is not treated as total reconstructed
ground-temperature uncertainty. Borehole distance and certificate sample size
use separate editable thresholds.

## Verification

The regression suite protects three ground-temperature modes, weighted
degree-hours, zero-degree-hour behaviour, analysis periods, COP models,
auxiliary electricity, tariffs, lifecycle economics, data loading and quality
decisions. Ten representative postcodes reproduce 700 frozen Python/paper
metrics within the published tolerances.
