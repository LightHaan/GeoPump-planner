# Calculation and parameter reference

This document explains exactly how GeoPump Planner converts prepared postcode
data and user inputs into ground temperature, thermal-load allocation, heat-pump
electricity, cost and decision outputs. It describes the current browser
implementation, not a proposed future method.

## 1. Scope and calculation sequence

The app is a postcode-scale screening calculator. Raster sampling, zonal
statistics, postcode joins and borehole-distance calculations are completed
before publication. Selecting a postcode loads those prepared attributes and a
prepared weighted climate sequence; it does not run GIS processing.

For each scenario, the browser performs these steps:

1. Select prepared postcode inputs or accept manual replacements.
2. Calculate one ground source/sink temperature for the chosen depth.
3. Detect heating and cooling demand from weighted outdoor-air degree-hours.
4. Scale the annual certificate loads and allocate them across demand records.
5. Calculate GSHP and ASHP COP only where allocated thermal load is positive.
6. Convert thermal load to compressor and auxiliary electricity.
7. Aggregate annual, monthly, seasonal and selected-period results.
8. Apply the selected electricity tariff and lifecycle assumptions.
9. Compare GSHP with ASHP and apply the configurable decision thresholds.

The GSHP uses the calculated ground temperature as a constant source/sink
temperature throughout the year. The ASHP uses the outdoor air temperature in
each climate record. This ground-versus-air temperature matching is the central
technical comparison.

## 2. Prepared data and editable scenario inputs

### 2.1 Temperature dataset choices

The ground-temperature starting value can come from either prepared chain:

- **Geoscience Australia — Australian mean land-surface temperature**, paired
  with the prepared `deltaT20` product;
- **CSIRO — Hourly near-surface air temperature grids for Australia (long-term
  climatology)**, paired with the prepared `deltaT20New` product.

The JSON identifiers `surface_t` and `air_t` are retained only for data and
scenario-file compatibility. They refer to the full dataset names above.
Changing this choice changes the prepared surface temperature and estimated
underground warming rate used to initialise the ground calculation. The rate is
stored internally in a legacy `gradient` field, but the public interface does
not describe it as a measured geothermal gradient. It does not change the
hourly climate sequence used to identify demand.

The scientific preparation starts with the borehole observations. For each
usable observation, the measured underground temperature is compared with the
selected surface-temperature baseline at that location, and the difference is
spread over the measurement depth:

```text
borehole_warming_rate = (borehole_temperature - surface_temperature)
                        / borehole_measurement_depth

estimated_temperature_at_depth = surface_temperature
                                 + postcode_warming_rate * target_depth

prepared_temperature_difference_at_20_m = postcode_warming_rate * 20 m
prepared_ground_temperature_at_20_m = prepared_surface_temperature
                                      + postcode_warming_rate * 20 m
```

The borehole-based rates are spatially prepared to produce postcode estimates.
The published 20 m temperature difference and 20 m ground temperature are
reference-depth results calculated from that postcode rate. These are
publication-time calculations: the map displays the frozen values, and scenario
changes do not recolour or recalculate it.

Applying the postcode rate linearly at another depth is a screening
approximation. A physical geothermal gradient requires suitable
quality-controlled downhole measurements and more complete site interpretation.

### 2.2 Editable postcode inputs outside the 109-parameter registry

| Input | Unit | Used when | Meaning |
|---|---:|---|---|
| Surface temperature | &deg;C | Surface + estimated warming rate; borehole interpolation | Prepared value for the selected dataset, or a manual replacement. |
| Estimated underground warming rate | &deg;C/m | Surface + estimated warming rate | Prepared linear rate, or a manual replacement; not a site-measured geothermal gradient. |
| Borehole temperature | &deg;C | Borehole interpolation | User-supplied temperature observation. |
| Borehole measurement depth | m | Borehole interpolation | Depth associated with the user-supplied observation. |
| Direct ground temperature | &deg;C | Direct mode | User-supplied source/sink temperature; no depth formula is applied. |
| Annual heating load intensity | kWh/m&sup2;/year | All calculations | Certificate-based postcode input, or a manual replacement. |
| Annual cooling load intensity | kWh/m&sup2;/year | All calculations | Certificate-based postcode input, or a manual replacement. |

`certificate_count`, sourced from `Dwelling_Count`, is the number of
certificates with records. It is evidence about the load sample only. It is not
the postcode dwelling population and never multiplies the load.

## 3. Ground-temperature calculation

Let:

- `T_s` = selected or manually entered surface temperature (&deg;C);
- `g` = estimated underground warming rate (&deg;C/m);
- `z` = target depth (m);
- `T_b` = manually entered borehole temperature (&deg;C);
- `z_b` = borehole measurement depth (m).

### 3.1 Surface temperature + estimated warming with depth

```text
T_ground(z) = T_s + g * z
```

The target depth must be at least `ground.minimum_depth_m`. A warning is added
when it is shallower than `ground.shallow_warning_depth_m`.

### 3.2 Surface-to-borehole interpolation or extrapolation

```text
g_observed = (T_b - T_s) / z_b
T_ground(z) = T_s + (T_b - T_s) * z / z_b
```

`z_b` must be greater than the absolute numerical tolerance. If `z > z_b`, the
same straight line is extrapolated only when
`ground.allow_extrapolation_below_borehole` is enabled; the result is flagged as
extrapolated.

### 3.3 Direct entry

```text
T_ground = user_entered_ground_temperature
```

Depth, surface temperature and the estimated warming rate are not used in direct mode.

## 4. Demand detection and annual-load allocation

Each climate record `t` contains outdoor air temperature `T_air,t`, represented
hours `w_t`, day of year and UTC hour. The current files normally contain 1,752
records with `w_t = 5 h`, representing 8,760 hours.

### 4.1 Weighted degree-hours

```text
HDH_t = max(0, T_balance,heating - T_air,t) * w_t
CDH_t = max(0, T_air,t - T_balance,cooling) * w_t

HDH_annual = sum_t(HDH_t)
CDH_annual = sum_t(CDH_t)
```

The paper defaults, 12&deg;C for heating and 24&deg;C for cooling, are editable
balance temperatures. They are not hard-coded demand limits.

### 4.2 Scale certificate load intensity to requested annual load

For heating and cooling separately:

```text
absolute_multiplier = conditioned_floor_area
                      * building_count
                      * load_scaling_factor
                      * occupancy_use_factor

requested_annual_load = certificate_load_intensity * absolute_multiplier
```

With all four multiplier inputs at their default of 1, the numeric annual kWh
equals the numeric kWh/m&sup2;/year input. This is a one-square-metre normalisation,
not an estimate of the entire postcode. Enter the intended conditioned area and
building count for a building or portfolio total.

### 4.3 Allocate the requested annual load

When the relevant annual degree-hour total is positive:

```text
heating_load_t = requested_annual_heating_load * HDH_t / HDH_annual
cooling_load_t = requested_annual_cooling_load * CDH_t / CDH_annual
```

The allocated record values then sum to the requested annual load, apart from
floating-point rounding.

When the annual degree-hour total is zero, the selected policy is applied:

| Policy | Behaviour |
|---|---|
| `discard_with_warning` (default) | Allocated load is zero. The positive certificate input remains visible as requested but unallocated load, and a warning is produced. |
| `error` | The calculation stops if the requested load is positive. |
| `uniform` | The requested load is distributed in proportion to record weights, despite zero detected degree-hour demand. |

Therefore, under the default method, zero annual degree-hours mean zero demand
and zero allocated load even when the certificate field is positive. Only
allocated load enters COP, electricity and cost calculations.

## 5. User-defined analysis period

The selected period is a reporting and tariff subset. It does not decide whether
heating or cooling demand exists; the degree-hour equations do that.

Available modes are:

- `solar_geometry`: a window from a configurable number of hours before sunset
  to a configurable number of hours after sunrise;
- `fixed_local_time`: any continuous daily interval using an entered UTC offset;
- `all_hours`: every record;
- disabled: no records are placed in the selected-period subtotal.

The label is editable, so the period need not be called “night”. The paper's two
hours before sunset and two hours after sunrise are defaults only.

### 5.1 Solar-geometry equations

For day of year `d`, latitude `phi` and longitude `lambda`:

```text
declination_deg = declination_amplitude
                  * sin(2*pi*(day_phase_offset + d)/days_per_year)

cos_hour_angle_raw = -tan(phi) * tan(declination)
cos_hour_angle = clip(cos_hour_angle_raw, configured_minimum, configured_maximum)
half_day_hours = degrees(acos(cos_hour_angle)) / longitude_degrees_per_hour

solar_noon_UTC = solar_noon_at_zero_longitude
                 - lambda / longitude_degrees_per_hour
sunrise_UTC = solar_noon_UTC - half_day_hours
sunset_UTC  = solar_noon_UTC + half_day_hours
```

The selected window starts at `sunset - hours_before_sunset` and ends at
`sunrise + hours_after_sunrise`, normalised to `hours_per_day`. Endpoints are
included and intervals crossing midnight are handled explicitly. This is a
compact screening approximation, not an astronomical ephemeris.

### 5.2 Fixed local-time equation

```text
local_hour = (hour_UTC + fixed_UTC_offset) modulo hours_per_day
```

The local hour is included between the configured start and end, with inclusive
endpoints. If the start is later than the end, the interval crosses midnight.
Daylight-saving changes are not inferred; the entered UTC offset is used for the
whole scenario.

## 6. COP models

GSHP and ASHP choose their model independently. COP is evaluated only for a
record with positive allocated thermal load. `T_source` is the calculated
constant ground temperature for GSHP and the record's outdoor air temperature
for ASHP.

### 6.1 Scaled Carnot model (paper default)

Let `K0` be the configurable Celsius-to-Kelvin offset, `A` the approach
temperature and `eta` the empirical Carnot efficiency.

Heating:

```text
T_cond,K = T_supply,heating + K0 + A
T_evap,K = T_source + K0 - A
COP_heating,raw = eta * T_cond,K / (T_cond,K - T_evap,K)
```

Cooling:

```text
T_evap,K = T_supply,cooling + K0 - A
T_cond,K = T_source + K0 + A
COP_cooling,raw = eta * T_evap,K / (T_cond,K - T_evap,K)
```

A denominator whose absolute value is no greater than
`numerical.absolute_tolerance` stops the calculation.

### 6.2 Constant model

```text
COP_heating,raw = constant_heating_COP
COP_cooling,raw = constant_cooling_COP
```

### 6.3 Linear source-temperature model

```text
COP_heating,raw = heating_intercept + heating_slope * T_source
COP_cooling,raw = cooling_intercept + cooling_slope * T_source
```

The linear and constant models are alternative calculation frameworks. Their
defaults are editable examples and should be replaced with suitable performance
data before being used for a real decision.

### 6.4 COP bounds and invalid-value policy

A raw COP is valid when it is finite, positive and between the configured
minimum and maximum inclusive.

| Policy | Behaviour |
|---|---|
| `stop` (default) | Stop on an invalid active-load COP. |
| `clip` | Clip a finite positive out-of-range value to the nearest bound. Zero, negative, NaN or infinite values still stop. |
| `ignore` | Store a null COP and zero compressor electricity for that active-load record; count it as invalid. This can understate electricity and should be used only for diagnosis. |

## 7. Electricity and performance factors

For each record and system:

```text
E_compressor,heating,t = heating_load_t / COP_heating,t
E_compressor,cooling,t = cooling_load_t / COP_cooling,t

E_compressor,total,t = E_compressor,heating,t + E_compressor,cooling,t

E_system,t = E_compressor,total,t * (1 + pump_fraction
                                       + fan_fraction
                                       + misc_fraction)
             + fixed_auxiliary_per_year * w_t / sum_t(w_t)
```

Fixed annual auxiliary electricity is distributed across all climate records in
proportion to represented hours, including records without heating or cooling
load. GSHP and ASHP have independent auxiliary assumptions.

The annual performance factor shown by the app is:

```text
APF = (allocated_heating_load + allocated_cooling_load) / system_electricity
```

The same ratio is calculated for each season and for the selected-period subset.
If the relevant system-electricity denominator is no greater than the absolute
tolerance, the performance factor is undefined rather than infinite.

Annual, monthly, seasonal and selected-period totals are sums of the applicable
record values. Seasons are defined by editable month arrays.

## 8. Electricity tariffs

Fixed charge:

```text
fixed_charge = fixed_daily_charge * days_per_year + annual_fixed_charge
```

Single-rate mode:

```text
energy_charge = annual_system_electricity * single_price_per_kWh
```

Selected-period two-rate mode:

```text
energy_charge = selected_period_electricity * selected_period_price
                + (annual_electricity - selected_period_electricity)
                  * other_period_price
```

```text
annual_tariff_cost = energy_charge + fixed_charge
```

Prices are entered in the chosen currency per kWh. The currency field is a label
only; the app performs no exchange-rate or inflation conversion. If a required
energy price is blank (`null`), energy charge and total annual tariff cost are
not assessed, even when a fixed charge has been entered.

## 9. Economics

Economics are assessed only when both installed costs and both annual tariff
costs are available.

```text
incremental_installed_cost = GSHP_installed_cost - ASHP_installed_cost

annual_operating_cost_saving = (ASHP_annual_tariff_cost + ASHP_maintenance)
                               - (GSHP_annual_tariff_cost + GSHP_maintenance)
```

Simple payback:

```text
if incremental_installed_cost <= absolute_tolerance: payback = 0
else if annual_operating_cost_saving <= absolute_tolerance: payback = undefined
else: payback = incremental_installed_cost / annual_operating_cost_saving
```

For system `s`, analysis length `N`, discount rate `r`, electricity-price
escalation `e`, replacement cost `R_s,y` and residual value `V_s`:

```text
LCC_s = installed_cost_s
        + sum(y=1..N) [
            annual_tariff_cost_s,year1 * (1+e)^(y-1)
            + annual_maintenance_s
            + R_s,y
          ] / (1+r)^y
        - V_s / (1+r)^N
```

For a zero-year analysis, residual value is subtracted without discounting.
Maintenance is held constant in nominal entered currency; only the year-one
tariff cost is escalated. Replacement entries must fall within the analysis
period.

```text
NPV_of_choosing_GSHP = LCC_ASHP - LCC_GSHP
```

A positive value favours GSHP under the entered assumptions; a negative value
favours ASHP.

## 10. Decision logic and evidence quality

### 10.1 Technical assessment

```text
electricity_saving_kWh = ASHP_annual_electricity - GSHP_annual_electricity
relative_saving = electricity_saving_kWh / ASHP_annual_electricity
```

Relative saving is undefined when ASHP electricity is no greater than the
absolute tolerance. Otherwise, the technical result is recommended when
`relative_saving >= minimum_technical_saving_fraction`.

### 10.2 Economic assessment

The economic result is recommended only when both conditions hold:

```text
NPV_of_choosing_GSHP >= NPV_threshold
simple_payback_years <= maximum_acceptable_payback_years
```

It is not assessed when economic inputs are incomplete or payback is undefined.

### 10.3 Evidence quality

- The prepared `deltaT20` EBK prediction standard error is assessed only when
  the Geoscience Australia land-surface-temperature chain is selected. Values at
  or below the configurable good threshold are `good`; values at or below the
  moderate threshold are `moderate`; larger values are `limited`; missing values
  are `unavailable`. It is partial interpolation uncertainty, not total
  ground-temperature uncertainty.
- Nearest-borehole distance uses the same good/moderate/limited threshold form.
- Certificate count is `good` when it is at least the configured minimum,
  `limited` when below it and `unavailable` when missing.
- Overall evidence quality is the worst applicable component.

### 10.4 Overall label

| Conditions | Overall result |
|---|---|
| Technical or economic result is `not_recommended` | `not_recommended` |
| Both technical and economic results are `not_assessed` | `not_assessed` |
| Both are `recommended` and evidence quality is `good` | `recommended` (“Proceed to detailed assessment” in the UI) |
| Any other combination without a failed assessment | `conditional` |

This label is a screening result, not a system design or approval.

## 11. Meaning of the main result indicators

| Indicator | Calculation or interpretation |
|---|---|
| Ground temperature at target depth | One of the three equations in section 3. |
| Model-allocated load | Sum of heating and cooling loads after degree-hour allocation; may be lower than requested when a zero-degree-hour policy discards load. |
| GSHP / ASHP annual electricity | Annual sum of compressor plus configured auxiliary electricity. |
| APF | Total allocated thermal load divided by system electricity. |
| GSHP electricity saving | `ASHP electricity - GSHP electricity`; positive favours GSHP. |
| GSHP relative electricity saving | Absolute saving divided by ASHP electricity; positive favours GSHP. |
| Annual energy cost | Total tariff cost, including fixed charges, despite the compact UI label. |
| Incremental installed cost | `GSHP installed cost - ASHP installed cost`. |
| Annual operating-cost saving | ASHP tariff plus maintenance minus GSHP tariff plus maintenance. |
| Simple payback | Incremental installed cost divided by positive annual operating-cost saving, subject to the special cases in section 9. |
| GSHP / ASHP lifecycle cost | Discounted cost formula in section 9. Lower is better. |
| NPV of choosing GSHP | `ASHP LCC - GSHP LCC`; positive favours GSHP. |
| Evidence quality | Worst applicable data-evidence component, not a probability or confidence interval. |

The monthly charts sum the record allocations by calendar month. The exported
CSV contains annual summary, economics and monthly load/electricity rows. The
scenario JSON additionally preserves the full parameter set, source snapshot,
manual inputs, outcome and calculation trace.

## 12. Map indicators

The home-page map contains frozen publication-time indicators. It is an
exploration and postcode-selection layer, not a scenario-output map. To keep the
home page understandable, only five decision-oriented indicators are selectable
for the active temperature source. Technical evidence remains available in the
Results page's collapsed data-evidence panel and in the published data files.

| Home-page map indicator | Source/calculation |
|---|---|
| Estimated ground temperature at 20 m | Prepared surface-temperature value plus the postcode estimated underground warming rate multiplied by 20 m. |
| Land-surface or near-surface air temperature | Prepared postcode zonal statistic from the active named source dataset. |
| Estimated underground warming rate | Borehole temperature minus the selected surface temperature, divided by borehole measurement depth, then spatially prepared as a postcode estimate; a linear approximation, not a site-measured geothermal gradient. |
| Typical annual heating need | Frozen certificate-based intensity, converted to kWh/m&sup2;/year during data preparation. |
| Typical annual cooling need | Frozen certificate-based intensity, converted to kWh/m&sup2;/year during data preparation. |

The prepared 20 m temperature difference (warming rate multiplied by 20 m),
certificate count, nearest-borehole
distance, nearby-borehole count, climate-record checks and applicable ΔT20 EBK
prediction standard error are not shown on the home page. They remain technical
evidence rather than household decision outputs.

For each selected metric, the colour scale uses the 5th, 27.5th, 50th, 72.5th
and 95th percentiles across non-missing postcode values. Values outside the
central displayed range use the end colours. Missing values are not included in
the percentile calculation.

## 13. Complete editable parameter reference

The Customise page exposes 109 editable leaf parameters. The three preset
identity fields (`schema_version`, `preset_id`, `preset_label`) are stored but
are not part of that editable registry.

“Active” below means the parameter can affect the current deterministic
scenario when its relevant mode is selected. “Prepared-data metadata” means the
browser already receives converted values, so changing the field alone does not
rebuild the frozen data. “Verification only” means it controls automated parity
checks, not a user result. “Reserved” means the planned calculation is not yet
implemented in the UI.

### 13.1 Ground parameters (7)

| Path | Default | Unit | Current role |
|---|---:|---:|---|
| `ground.mode` | `surface_gradient` | — | Active; selects surface + estimated warming rate, borehole interpolation or direct entry. The identifier is retained for scenario compatibility. |
| `ground.surface_dataset_id` | `surface_t` | — | Active data selection; `surface_t` is the Geoscience Australia chain and `air_t` is the CSIRO chain. |
| `ground.reference_depth_m` | 20 | m | Prepared-data metadata. Changing it does not recalculate frozen 20 m attributes. |
| `ground.target_depth_m` | 20 | m | Active in both depth-based ground equations. |
| `ground.minimum_depth_m` | 0 | m | Active validation bound. |
| `ground.shallow_warning_depth_m` | 20 | m | Active warning threshold; does not alter temperature. |
| `ground.allow_extrapolation_below_borehole` | `true` | — | Active in borehole mode. |

### 13.2 Load parameters (7)

| Path | Default | Unit | Current role |
|---|---:|---:|---|
| `load.heating_balance_temperature_c` | 12 | &deg;C | Active heating degree-hour threshold. |
| `load.cooling_balance_temperature_c` | 24 | &deg;C | Active cooling degree-hour threshold. |
| `load.conditioned_floor_area_m2` | 1 | m&sup2; | Active annual-load multiplier. |
| `load.building_count` | 1 | count | Active annual-load multiplier; independent of certificate count. |
| `load.load_scaling_factor` | 1 | factor | Active generic calibration multiplier. |
| `load.occupancy_use_factor` | 1 | factor | Active occupancy/use multiplier. |
| `load.zero_degree_hour_policy` | `discard_with_warning` | — | Active when positive requested load has zero annual degree-hours. |

### 13.3 Time parameters (9)

| Path | Default | Unit | Current role |
|---|---:|---:|---|
| `time.base_year` | 2023 | year | Active; converts day of year to calendar month. |
| `time.days_per_year` | 365 | days | Active in solar geometry and daily fixed-charge calculation. |
| `time.stored_air_temperature_scale_divisor` | 100 | factor | Prepared-data metadata; published climate JSON already contains &deg;C and runtime does not divide it again. |
| `time.representative_record_weight_hours` | 5 | h | Prepared-data metadata; runtime uses each record's stored `weight_hours`. |
| `time.expected_annual_weight_hours` | 8760 | h | Active validation target; a mismatch creates a warning. |
| `time.season_months.Summer` | `[12,1,2]` | month numbers | Active seasonal aggregation. |
| `time.season_months.Autumn` | `[3,4,5]` | month numbers | Active seasonal aggregation. |
| `time.season_months.Winter` | `[6,7,8]` | month numbers | Active seasonal aggregation. |
| `time.season_months.Spring` | `[9,10,11]` | month numbers | Active seasonal aggregation. |

### 13.4 Analysis-period parameters (15)

| Path | Default | Unit | Current role |
|---|---:|---:|---|
| `analysis_period.enabled` | `true` | — | Active master switch. |
| `analysis_period.label` | `Night window (paper default)` | text | Reporting label only. |
| `analysis_period.mode` | `solar_geometry` | — | Active; selects solar, fixed local or all-hours membership. |
| `analysis_period.hours_before_sunset` | 2 | h | Active in solar mode. |
| `analysis_period.hours_after_sunrise` | 2 | h | Active in solar mode. |
| `analysis_period.solar_declination_amplitude_deg` | 23.45 | degree | Active solar-equation constant. |
| `analysis_period.day_phase_offset` | 284 | days | Active solar-equation phase constant. |
| `analysis_period.longitude_degrees_per_hour` | 15 | degree/h | Active solar-time conversion constant. |
| `analysis_period.hours_per_day` | 24 | h | Active time normalisation constant. |
| `analysis_period.solar_noon_hour_utc_at_zero_longitude` | 12 | UTC hour | Active solar-noon constant. |
| `analysis_period.minimum_cosine_hour_angle` | -1 | ratio | Active clipping bound before `acos`. |
| `analysis_period.maximum_cosine_hour_angle` | 1 | ratio | Active clipping bound before `acos`. |
| `analysis_period.fixed_start_local_hour` | 18 | local hour | Active in fixed-local-time mode. |
| `analysis_period.fixed_end_local_hour` | 8 | local hour | Active in fixed-local-time mode. |
| `analysis_period.fixed_utc_offset_hours` | 0 | h | Active in fixed-local-time mode. |

### 13.5 COP parameters (15 for GSHP + 15 for ASHP = 30)

Every path below exists under both `cop.gshp` and `cop.ashp`.

| Leaf path | GSHP default | ASHP default | Unit | Current role |
|---|---:|---:|---:|---|
| `model_id` | `scaled_carnot` | `scaled_carnot` | — | Active model selector. |
| `heating_supply_temperature_c` | 40 | 40 | &deg;C | Active in scaled-Carnot heating. |
| `cooling_supply_temperature_c` | 7 | 7 | &deg;C | Active in scaled-Carnot cooling. |
| `approach_temperature_k` | 5 | 5 | K | Active in scaled-Carnot heating and cooling. |
| `empirical_carnot_efficiency` | 0.35 | 0.35 | fraction | Active scaled-Carnot multiplier. Registered sensitivity range: 0.1–0.6. |
| `kelvin_offset` | 273.15 | 273.15 | K | Active Celsius-to-Kelvin equation constant. |
| `constant_heating_cop` | 3.5 | 3.0 | ratio | Active only for constant-model heating. |
| `constant_cooling_cop` | 3.5 | 3.0 | ratio | Active only for constant-model cooling. |
| `linear_heating_intercept` | 2.0 | 2.0 | ratio | Active only for linear-model heating. |
| `linear_heating_slope_per_c` | 0.05 | 0.05 | COP/&deg;C | Active only for linear-model heating. |
| `linear_cooling_intercept` | 5.0 | 5.0 | ratio | Active only for linear-model cooling. |
| `linear_cooling_slope_per_c` | -0.05 | -0.05 | COP/&deg;C | Active only for linear-model cooling. |
| `minimum_cop` | 0.1 | 0.1 | ratio | Active validity/clipping bound. |
| `maximum_cop` | 20 | 20 | ratio | Active validity/clipping bound. |
| `invalid_cop_policy` | `stop` | `stop` | — | Active invalid-value handling. |

### 13.6 Auxiliary-electricity parameters (4 for GSHP + 4 for ASHP = 8)

Every leaf exists under both `electricity.gshp` and `electricity.ashp`; all
defaults are zero and all are active.

| Leaf path | Default | Unit | Meaning |
|---|---:|---:|---|
| `pump_fraction_of_compressor` | 0 | fraction | Pump electricity as a fraction of combined compressor electricity. |
| `fan_fraction_of_compressor` | 0 | fraction | Fan electricity as a fraction of combined compressor electricity. |
| `misc_fraction_of_compressor` | 0 | fraction | Other proportional electricity. |
| `fixed_auxiliary_kwh_per_year` | 0 | kWh/year | Fixed annual electricity distributed by record weight. |

### 13.7 Tariff parameters (7)

| Path | Default | Unit | Current role |
|---|---:|---:|---|
| `tariff.mode` | `single` | — | Active; single rate or selected-period two-rate. |
| `tariff.currency` | `AUD` | text | Display/export label only. |
| `tariff.single_price_per_kwh` | blank | currency/kWh | Active in single-rate mode; blank means cost not assessed. |
| `tariff.selected_period_price_per_kwh` | blank | currency/kWh | Active in two-rate mode. |
| `tariff.other_period_price_per_kwh` | blank | currency/kWh | Active in two-rate mode. |
| `tariff.fixed_daily_charge` | 0 | currency/day | Active annual fixed charge component. |
| `tariff.annual_fixed_charge` | 0 | currency/year | Active annual fixed charge component. |

### 13.8 Economics parameters (11)

| Path | Default | Unit | Current role |
|---|---:|---:|---|
| `economics.gshp_installed_cost` | blank | currency | Required for economic assessment. |
| `economics.ashp_installed_cost` | blank | currency | Required for economic assessment. |
| `economics.gshp_annual_maintenance_cost` | 0 | currency/year | Active annual GSHP operating cost. |
| `economics.ashp_annual_maintenance_cost` | 0 | currency/year | Active annual ASHP operating cost. |
| `economics.analysis_period_years` | 20 | years | Active lifecycle horizon; fractional input is truncated to an integer. |
| `economics.discount_rate_fraction` | 0.05 | fraction/year | Active discount rate; must exceed -1. |
| `economics.electricity_price_escalation_fraction` | 0 | fraction/year | Active annual escalation of year-one tariff cost; must exceed -1. |
| `economics.gshp_residual_value` | 0 | currency | Discounted and subtracted at the end of the horizon. |
| `economics.ashp_residual_value` | 0 | currency | Discounted and subtracted at the end of the horizon. |
| `economics.gshp_replacements` | `[]` | `{year,cost}[]` | Optional GSHP replacement schedule. |
| `economics.ashp_replacements` | `[]` | `{year,cost}[]` | Optional ASHP replacement schedule. |

### 13.9 Decision parameters (8)

| Path | Default | Unit | Current role |
|---|---:|---:|---|
| `decision.minimum_technical_saving_fraction` | 0 | fraction | Minimum relative GSHP electricity saving for technical recommendation. |
| `decision.maximum_acceptable_payback_years` | 20 | years | Maximum simple payback for economic recommendation. |
| `decision.npv_threshold` | 0 | currency | Minimum NPV of choosing GSHP. |
| `decision.delta_t20_ebk_prediction_se_good_max_c` | 0.25 | &deg;C | Upper bound for good applicable `deltaT20` evidence. |
| `decision.delta_t20_ebk_prediction_se_moderate_max_c` | 0.5 | &deg;C | Upper bound for moderate applicable `deltaT20` evidence. |
| `decision.nearest_borehole_good_max_km` | 25 | km | Upper bound for good borehole-distance evidence. |
| `decision.nearest_borehole_moderate_max_km` | 100 | km | Upper bound for moderate borehole-distance evidence. |
| `decision.minimum_certificate_count` | 10 | records | Minimum certificate sample for good evidence. |

### 13.10 Numerical parameters (5)

| Path | Default | Current role |
|---|---:|---|
| `numerical.absolute_tolerance` | `1e-12` | Active near-zero comparison and validation tolerance. |
| `numerical.relative_tolerance` | `1e-9` | Verification/reference tolerance; does not alter current browser scenario output. |
| `numerical.cop_regression_relative_tolerance` | `1e-6` | Automated COP regression verification only. |
| `numerical.electricity_regression_relative_tolerance` | `1e-5` | Automated electricity regression verification only. |
| `numerical.cost_regression_relative_tolerance` | `1e-5` | Automated cost regression verification only. |

### 13.11 Monte Carlo parameters (2)

| Path | Default | Current role |
|---|---:|---|
| `monte_carlo.default_simulations` | 10,000 | Reserved; Monte Carlo is not run by the current app. |
| `monte_carlo.random_seed` | 20,260,805 | Reserved reproducibility value; it does not alter deterministic results. |

## 14. Validation and interpretation cautions

- Required numeric inputs must be finite. Loads, depths, costs, prices and
  auxiliary fractions subject to non-negative constraints cannot be negative.
- COP minima and maxima must be positive, and maximum must not be below minimum.
- Climate record weights must be positive. A total different from the configured
  expected annual hours produces a warning rather than silently rescaling data.
- Season arrays must be non-empty and contain integer months 1–12. The validator
  does not require seasons to be mutually exclusive, so overlapping months will
  appear in more than one seasonal subtotal.
- Fixed local time uses a single UTC offset and does not model daylight saving.
- Ground temperature is treated as constant over all GSHP records. The model does
  not simulate ground-loop thermal interaction, extraction limits, recovery or
  long-term ground drift.
- No COP model currently includes part-load cycling, frosting/defrost, humidity,
  capacity limits, backup resistance heat or manufacturer performance maps
  unless the user represents them through entered parameters.
- The result is sensitive to certificate-load representativeness, prepared
  ground inputs, selected thresholds, COP assumptions, auxiliaries and economic
  inputs. Evidence labels do not remove the need for site investigation.

## 15. Reproducibility

Use **Export scenario JSON** to preserve the postcode, prepared source snapshot,
all manual inputs, all parameters, calculated outcome and timestamp. The Results
page lists manual overrides from the paper preset. CSV is intended for compact
result analysis; JSON is the complete audit record.

The authoritative defaults are stored in
[`public/data/presets/paper-default.json`](../public/data/presets/paper-default.json).
The frozen data fields are defined in
[`public/data/data-dictionary.md`](../public/data/data-dictionary.md), and the
dataset version and source URLs are recorded in
[`public/data/manifest.json`](../public/data/manifest.json).
