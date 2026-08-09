# User guide

This guide explains the normal app workflow and the assumptions that most often
change a result. For every equation, output definition, validation rule and
default value, see the [complete calculation and parameter
reference](calculation-reference.md).

## App pages

- **Planner** contains the postcode search, essential inputs, interactive map and
  headline result only. Change the map colour setting to inspect the five useful
  local temperature or demand indicators; click a boundary to select that postcode.
- **Results** contains the full GSHP/ASHP comparison, monthly charts, exports and
  a collapsible data-evidence section.
- **Customise** contains all editable inputs, formula parameters, COP settings,
  time periods, tariffs and investment assumptions, plus scenario import/export.
- **Guide** provides the short in-app instructions and model cautions.
- **Glossary** provides plain-English definitions for the technical terms used
  throughout the app.

The map shows five selectable indicators for the active temperature source:
estimated ground temperature at 20 m, the selected surface or near-surface air
temperature, estimated underground warming rate, typical annual heating need
and typical annual cooling need. Expanding **Local estimates for postcode** shows
the same decision-oriented values. Certificate counts, borehole evidence,
climate-record checks and ΔT20 interpolation uncertainty are intentionally kept
off the home page and remain available in the Results page's optional data-
evidence panel.

## Recommended workflow

1. Select a postcode by search or by clicking its map boundary.
2. Review the prepared temperature, estimated underground warming rate and
   typical heating and cooling need shown for that postcode.
3. Choose one of the two fully named temperature datasets and enter a target
   depth. The prepared 20 m data are starting values, not a site measurement.
4. Enter conditioned area and the number of buildings being modelled. These
   values convert the certificate load intensity into an annual thermal-load
   total.
5. Enter an electricity tariff for annual cost, and installed costs for payback
   and lifecycle results. Blank prices or installed costs deliberately produce
   “Not assessed” economic outputs.
6. Read warnings and evidence quality on Results. Export scenario JSON when an
   auditable record of all inputs, parameters and outputs is required.
7. Use Customise only for assumptions you understand. Restore defaults is always
   available.

## Ground temperature used by the GSHP

The default method uses the selected prepared surface temperature and estimated
underground warming rate:

```text
ground_temperature_at_depth = surface_temperature
                              + estimated_warming_rate × target_depth
```

Customise also provides:

```text
surface/borehole method:
ground_temperature = surface_temperature
                     + (borehole_temperature - surface_temperature)
                       × target_depth / borehole_depth

direct method:
ground_temperature = user_input
```

The prepared warming rate is the borehole-informed, spatially interpolated
temperature difference between the chosen surface baseline and 20 m divided by
20 m. The app assumes that rate continues in a straight line to the selected
depth. It is only an approximation for postcode screening, not a measured
geothermal gradient. Determining a true geothermal gradient generally requires
quality-controlled downhole temperatures at suitable depths and corrections or
interpretation for drilling disturbance, groundwater, terrain and local geology.

The calculated value is used as a constant GSHP source/sink temperature for all
representative hours. The ASHP instead uses each record's outdoor air
temperature. The app does not simulate ground-loop sizing, seasonal ground drift
or long-term extraction limits.

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

First, certificate intensity is converted to the requested system load:

```text
requested_annual_load = certificate_load_per_m²
                        × conditioned_floor_area
                        × building_count
                        × load_scaling_factor
                        × occupancy_use_factor
```

Certificate count does not appear in this formula.

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

The paper-default scaled-Carnot equations are:

```text
heating COP = efficiency × condenser_temperature_K
              / (condenser_temperature_K - evaporator_temperature_K)

cooling COP = efficiency × evaporator_temperature_K
              / (condenser_temperature_K - evaporator_temperature_K)
```

Supply temperature, heat-exchanger approach, empirical efficiency, Kelvin
offset, COP bounds and invalid-COP handling are editable. Constant-COP and
linear source-temperature models can be selected independently for GSHP and
ASHP. The annual performance factor is:

```text
APF = total allocated heating and cooling load / total system electricity
```

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

## Cost, comparison and decision outputs

```text
GSHP electricity saving = ASHP annual electricity - GSHP annual electricity
relative saving = electricity saving / ASHP annual electricity

annual tariff cost = energy charge + daily fixed charges + annual fixed charge
NPV of choosing GSHP = ASHP lifecycle cost - GSHP lifecycle cost
```

Positive electricity saving and positive NPV favour GSHP. Lifecycle cost adds
installed cost, discounted annual tariff cost, annual maintenance and scheduled
replacements, then subtracts discounted residual value. Electricity price can
escalate annually; maintenance does not escalate in the current formula.

The headline recommendation is not based on saving alone. The app separately
checks the editable minimum technical saving, maximum payback and NPV threshold,
then reports the worst applicable evidence quality from interpolation standard
error, nearest-borehole distance and certificate count. A result proceeds to
“recommended” only when both technical and economic checks pass and evidence is
good; other non-failing combinations are conditional.

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

The JSON parameter identifiers `surface_t` and `air_t` are internal compatibility
codes for the Geoscience Australia and CSIRO datasets respectively. User-facing
choices use the full dataset names.
