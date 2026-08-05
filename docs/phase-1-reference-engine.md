# Phase 1: parameter-explicit Python reference engine

## Purpose

The Python engine is the numerical source of truth used to verify the later
browser implementation. It performs only postcode-level model calculations.
It does not open ArcGIS, sample rasters, run zonal statistics, or aggregate
postcodes to city/climate-zone results.

`reference_engine/paper-defaults.json` contains the reproducible paper preset.
Every threshold, conversion factor, physical constant, validation bound, time
window, tariff input, and economic assumption used by the engine is explicit
in this file and is intended to become editable in the App.

## Demand and load allocation

For record `t` with represented-hour weight `w_t`:

```text
HDH_t = max(0, T_balance,heating - T_air,t) * w_t
CDH_t = max(0, T_air,t - T_balance,cooling) * w_t
```

When the annual degree-hour denominator is positive, certificate annual load
is distributed in proportion to these weighted degree hours. When the annual
denominator is zero, the paper preset deliberately assigns zero model load,
even if the certificate input is non-zero. The input, allocated amount, and
unallocated amount are all retained in the calculation trace and a warning is
returned. See `user-guide.md` for the required user-facing explanation.

The paper defaults of 12°C and 24°C are editable parameters, not constants in
the formula implementation.

## Selected-period analysis

The former "night" flag is not stored in climate fixtures. Membership is
recalculated for every scenario from the active parameters. Supported modes
are:

- solar geometry, with editable hours before sunset and after sunrise;
- an arbitrary fixed local daily window, including windows crossing midnight;
- all hours; or
- disabled.

The paper preset uses two hours before sunset and two hours after sunrise. The
user-facing label is editable, so a fixed day window need not be called night.

## COP model registry

GSHP and ASHP select their COP model independently using `model_id`. The first
implementation provides:

1. `scaled_carnot`: the paper equations with editable supply temperatures,
   approach temperature, empirical Carnot efficiency, Kelvin offset, and COP
   bounds;
2. `constant`: independent editable heating and cooling COP values;
3. `linear_source_temperature`: independent heating/cooling intercepts and
   source-temperature slopes.

Invalid-COP handling (`stop`, `clip`, or `ignore`) and minimum/maximum bounds
are explicit. COP is validated only for records with active thermal load; an
irrelevant cooling COP during a heating-only record cannot stop a scenario.
New formulas can be added as registry entries without changing the demand,
electricity, or economics modules.

## Electricity, tariffs, and economics

Compressor electricity is allocated load divided by COP. GSHP and ASHP have
separate editable pump, fan, miscellaneous, and fixed auxiliary-electricity
parameters. Tariffs support:

- a single energy price; or
- separate selected-period and other-period prices.

Daily and annual fixed charges, currency label, installed costs, annual
maintenance, analysis period, discount rate, energy-price escalation,
replacement schedules, and residual values are explicit inputs. Outputs
include annual cost, simple payback, lifecycle costs, and NPV of choosing GSHP
instead of ASHP.

## Regression evidence

Ten frozen postcodes cover cooling-only, mixed-demand, heating-dominated,
urban, remote, low-ground-temperature, high-ground-temperature, positive
saving, and negative-saving cases. The engine reproduces 700 annual,
seasonal, selected-period, electricity, load, APF, and SPF values from
`revised/Supp_File_5_PostCodeResults_revised.csv`. The largest observed relative
error is approximately `1.1e-9`, below the configured tolerances.

The regression fixture builder streams the source climate CSV once and freezes
only 1,752 representative records for each selected postcode. Tests run with
the Python standard library and require no ArcGIS installation.
