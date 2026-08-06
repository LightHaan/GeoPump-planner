# User guide: demand detection and certificate-load allocation

## App pages

- **Planner** contains the postcode search, essential inputs, interactive map and
  headline result only. Change the map metric to inspect local ground, load,
  borehole and evidence data; click a boundary to select that postcode.
- **Results** contains the full GSHP/ASHP comparison, monthly charts, exports and
  a collapsible data-evidence section.
- **Customise** contains all editable inputs, formula parameters, COP settings,
  time periods, tariffs and investment assumptions, plus scenario import/export.
- **Guide** provides the short in-app instructions and model cautions.

The map shows 13 selectable metrics. Expanding **All mapped data for postcode**
shows both *Australian mean land-surface temperature* (Geoscience Australia) and
*Hourly near-surface air temperature grids for Australia (long-term
climatology)* (CSIRO), ground temperature at 20 m, gradients, annual
heating/cooling loads, certificate count, borehole evidence, climate records and
the applicable ΔT20 prediction standard error.

## How the model interprets certificate load

Annual postcode heating and cooling loads are certificate-based statistical
inputs in `kWh/m²/year`. They are annual loads waiting to be allocated by the
model; they do not imply that demand occurs in every hour.

`certificate_count` (source field `Dwelling_Count`) is the number of certificates
with records in the postcode. It is used as sample-size evidence only. It is not
the postcode dwelling population and never multiplies the load. Use the separate
building-count and conditioned-area inputs to model one or more buildings.

## Step 1: identify hourly demand

For each climate record, editable balance temperatures determine weighted
degree-hours:

```text
heating_degree_hours_t = max(0, heating_balance_temperature - outdoor_temperature_t) × record_weight_t
cooling_degree_hours_t = max(0, outdoor_temperature_t - cooling_balance_temperature) × record_weight_t
```

The paper defaults are 12°C for heating and 24°C for cooling. Both can be edited.

Current climate files contain 1,752 representative hourly records for each
available postcode: one representative day every five days. Each record has a
default weight of five hours, so the annual total is 8,760 represented hours. A
future true 8,760-hour dataset should use a weight of one hour per record.

## Step 2: allocate annual certificate load

When annual degree-hours for a demand type are greater than zero:

```text
allocated_load_t = certificate_annual_load × weighted_degree_hours_t / annual_weighted_degree_hours
```

The allocated hourly values therefore sum to the certificate annual input.

### When annual degree-hours are zero

This project deliberately applies the following rule:

- zero annual heating degree-hours produce zero allocated annual heating load;
- zero annual cooling degree-hours produce zero allocated annual cooling load.

This remains true when the corresponding certificate field is non-zero. The
selected climate sequence and threshold have not identified demand, so the
certificate value is retained as requested/unallocated load but does not enter
COP, electricity or cost calculations. The default
`discard_with_warning` policy makes this behaviour explicit in the results.

## Electricity and COP

Only allocated loads participate in electricity calculations:

```text
compressor_electricity_t = allocated_thermal_load_t / COP_t
```

GSHP uses the selected-depth ground temperature as its source/sink temperature;
ASHP uses each record's outdoor air temperature. Pump, fan, miscellaneous and
fixed annual auxiliary electricity are independent editable parameters.

## Custom analysis period

The paper describes two hours before sunset to two hours after sunrise as a
night window. In the app this is an editable preset, not a hard-coded night
field. Users can rename the period and choose:

- `solar_geometry`: editable hours before sunset and after sunrise;
- `fixed_local_time`: editable start/end time and UTC offset, including periods
  that cross midnight or occur during the day;
- `all_hours`: every representative hour;
- disabled: no selected-period subtotal.

Single-rate or selected-period/other-period tariffs can then be entered. The
same mechanism supports off-peak, peak or any user-defined continuous period.

## Imports, exports and data quality

Scenario JSON contains model parameters, manual inputs, the frozen source
snapshot and calculated outcome. Import validates the schema and parameters,
then recalculates using the current published climate and frozen dataset version.
CSV export provides annual summary, economics and monthly load/electricity rows.

The collapsible data-evidence section on the Results page shows the active dataset version, climate coverage,
invalid or unrepresented records, borehole evidence, certificate count and all
manual overrides. ΔT20 EBK prediction standard error is shown only for the
*Australian mean land-surface temperature* chain and is explicitly described as
partial interpolation uncertainty.
