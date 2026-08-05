# Confirmed release decisions

The data/method owner confirmed the following decisions on 5 August 2026. No
manual GIS work is currently required for continued implementation.

1. `standerd_error` is the prediction-standard-error raster produced by EBK of
   ΔT20. It is exposed only as partial interpolation uncertainty for ΔT20, not
   total reconstructed ground-temperature uncertainty.
2. `Dwelling_Count` is the number of certificates with records and is exposed
   as `certificate_count`.
3. The two temperature sources are the CSIRO *Hourly near-surface air
   temperature grids for Australia* collection and Geoscience Australia's
   *Australian mean land-surface temperature* dataset.
4. The project owner confirmed redistribution permission for the application
   datasets. Source-specific attribution remains in the manifest and data
   documentation.

## Borehole release choice

Use the current cleaned borehole layer with 8,388 eligible records for the app.
The difference from the manuscript value of 8,380 is fully traceable: eight
source depths recorded as negative magnitudes in the old supplementary CSV were
corrected to positive depths (20.0–66.81 m) in the revised CSV. If strict
reproduction of the earlier manuscript snapshot is needed, retain the 8,380
record dataset as a separately labelled legacy data version rather than mixing
the two.

## Not required for the MVP

- ArcGIS Online, ArcGIS Server, or an ArcGIS account;
- a postcode map (search works without it);
- state/locality names (postcode search can use the four-character code);
- user accounts, a backend, or a database;
- live raster processing after deployment.
