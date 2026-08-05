# Frozen postcode data dictionary

| Field | Unit | Meaning |
|---|---|---|
| postcode | string | Four-character Australian postcode; leading zero retained. |
| centroid_lat / centroid_lon | decimal degrees | Internal label point in WGS84. |
| air_t_surface_temp_c | degC | Postcode mean from ArcGIS `AirT`. |
| air_t_delta_temp_at_reference_depth_c | degC | Paired `deltaT20New`. |
| air_t_gradient_c_per_m | degC/m | `deltaT20New / reference_depth_m`. |
| air_t_ground_temp_at_reference_depth_c | degC | `AirT + deltaT20New`. |
| surface_t_surface_temp_c | degC | Postcode mean from ArcGIS `surfaceT`. |
| surface_t_delta_temp_at_reference_depth_c | degC | Paired `deltaT20`. |
| surface_t_gradient_c_per_m | degC/m | `deltaT20 / reference_depth_m`. |
| surface_t_ground_temp_at_reference_depth_c | degC | `surfaceT + deltaT20`. |
| delta_t20_ebk_prediction_se_c | degC | Zonal mean of `standerd_error`; partial interpolation uncertainty for the `surface_t` chain's ΔT20 EBK raster, not total ground-temperature uncertainty. |
| nearest_borehole_km | km | Haversine distance from postcode internal point to nearest usable reference-depth borehole record. |
| nearby_borehole_count | count | Usable boreholes within `nearby_radius_km`. |
| annual_heating_kwh_m2 | kWh/m2/year | Supplementary annual heating load divided by 3.6. |
| annual_cooling_kwh_m2 | kWh/m2/year | Supplementary annual cooling load divided by 3.6. |
| certificate_count | count | Source `Dwelling_Count`; number of certificates with records, not the postcode dwelling population. |
| climate_record_count | count | Representative temperature records for the postcode. |
| climate_represented_hours | hours/year | Records multiplied by inferred weight 5. |
| data_notes | text | Explicit missing-data or provenance warnings. |
