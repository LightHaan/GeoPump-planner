# Frozen data source notes

Generated: 2026-08-05T10:43:14.449235+00:00

Boundary geometry refreshed: 2026-08-14

- ArcGIS geodatabase: `C:\Users\yh516\OneDrive - University of Wollongong\25-26\paper1_heatPump\1st submission\paper4\HeatPump_2026Aug\HeatPump_2026Aug.gdb`
- Postcode value source feature class: `POA_2021_AUST_GDA94_ExportFeatures`
  (GCS_GDA_1994)
- Display boundary source: Australian Bureau of Statistics, *Postal Areas
  (POA) ASGS Edition 3, 2021*, `POA_2021_AUST_GDA94` shapefile (GDA94)
- Ground fields: `AirT`, `surfaceT`, `deltaT20`, `deltaT20New`
- ΔT20 EBK prediction-standard-error raster: `standerd_error`
- Borehole feature class: `BoreholeTemp`
- Load source: `Supp_File_2_POA_info.csv`
- Climate source: `Supp_File_3_PostCodeHourlyTair.csv`

The source ArcGIS project, geodatabase, and ABS shapefile were read only. The
ABS geometry was transformed to WGS 84 and simplified to approximately 200 m
for browser display. It contains the same 2,641 postcodes as the value files;
zero-area non-spatial records `9494`, `9797`, and `ZZZZ` were excluded. No
postcode-level values were recalculated or changed. See the validation report
for unresolved release decisions.
