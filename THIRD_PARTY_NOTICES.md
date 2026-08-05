# Third-party data notices

GeoPump Planner contains derived, postcode-level values prepared from the
following sources. The project owner confirmed redistribution permission for the
application datasets on 5 August 2026. Users who redistribute or repurpose the
data should also review the current terms on each source record.

## Surface and climate temperature

- CSIRO, *Hourly near-surface air temperature grids for Australia*, version 4,
  1990–2019 climatology. Source record:
  <https://data.csiro.au/collection/csiro:60405>
- Geoscience Australia, *Australian mean land-surface temperature*, based on
  2003–2015 MODIS imagery. Dataset record:
  <https://ecat.ga.gov.au/geonetwork/srv/api/records/1b827cce-acca-4d06-87b2-e8512d86b956?language=eng>
- Haynes, M. W., Horowitz, F. G., Sambridge, M., Gerner, E. J. and Beardsmore,
  G. R. (2018), “Australian mean land-surface temperature”, *Geothermics* 72,
  156–162. <https://doi.org/10.1016/j.geothermics.2017.10.008>

## Project supplementary data

- Postcode annual heating and cooling loads were prepared from
  `Supp_File_2_POA_info.csv` supplied with the research project.
- Weighted representative-hour climate records were prepared from
  `Supp_File_3_PostCodeHourlyTair.csv` supplied with the research project.
- Borehole-derived temperature increments use the cleaned project borehole
  dataset described in `docs/manual-decisions.md`.

The app publishes aggregated postcode values rather than the ArcGIS project,
source rasters or geodatabase. Source identifiers, generation dates, temporal
coverage and checksums are retained in `public/data/manifest.json` and the
data-freeze documentation.
