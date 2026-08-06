# Third-party notices

## Leaflet

The postcode map bundles Leaflet 1.9.4 under the BSD 2-Clause License:

Copyright (c) 2010-2023, Volodymyr Agafonkin

Copyright (c) 2010-2011, CloudMade
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

## Data

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
