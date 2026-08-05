# Phase 0: ArcGIS data freeze

## Frozen temperature chains

The current ArcGIS project contains two postcode-level surface baselines and
two paired interpolated temperature increments. They are frozen as:

- `air_t`: `AirT + deltaT20New`
- `surface_t`: `surfaceT + deltaT20`

For either chain at reference depth `z_ref`:

```text
gradient = delta_temperature / z_ref
ground_temperature(z) = surface_temperature + gradient * z
```

The default `z_ref` is 20 m and is recorded in the manifest. Dataset labels are
metadata and can be renamed later without changing the numeric data.

## Climate records

`Supp_File_3_PostCodeHourlyTair.csv` contains 73 representative days per
postcode at five-day spacing, not 365 independent days. Each temperature is
stored as degrees Celsius multiplied by 100. The later climate-file builder
must therefore divide `tair` by 100 and assign `weight_hours = 5` to every
record, producing 8,760 represented hours per postcode.

## Quality fields

The freeze exports the available postcode mean from the ArcGIS raster named
`standerd_error` as `delta_t20_ebk_prediction_se_c`. It represents prediction
standard error for the EBK interpolation of ΔT20 used by the `surface_t` chain.
It is useful as a partial interpolation-quality indicator, but it is not the
total uncertainty of reconstructed 20 m ground temperature because it does not
include uncertainty in the land-surface-temperature raster or model structure.
It must not be applied automatically to the separate `air_t` chain.

Nearest-observation distance and nearby-observation count are calculated from
the current `BoreholeTemp` records with depth at least the reference depth and a
non-null derived reference-depth temperature.

## Acceptance criteria

- postcode is a unique four-character string;
- all temperatures are in degrees Celsius;
- all gradients are in degrees Celsius per metre;
- loads are in kWh/m2/year;
- missing values are explicit JSON `null` values;
- both temperature chains are present and never mixed implicitly;
- open CSV, JSON, and GeoJSON files are readable without ArcGIS;
- every frozen file has a SHA-256 checksum;
- source counts, missingness, assumptions, and warnings are recorded.
