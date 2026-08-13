# Preprocessing

All spatial processing happens offline. The browser app will load only the
postcode-level files created here.

## Phase 0 data freeze

Run with the ArcGIS Pro Python launcher while the ArcGIS licence is available:

```powershell
& "C:\Program Files\ArcGIS\Pro\bin\Python\Scripts\propy.bat" `
  freeze_arcgis_data.py `
  --source-root "<paper4 folder>"
```

The script:

1. reads postcode polygons and the two paired surface-temperature/DeltaT20
   chains from `HeatPump_2026Aug.gdb`;
2. converts annual loads from MJ/m2/year to kWh/m2/year;
3. creates postcode internal points in WGS84;
4. derives ground temperature and gradient at the configurable reference depth;
5. calculates postcode mean interpolation standard error;
6. calculates nearest eligible borehole distance and the count within a
   configurable radius;
7. exports simplified postcode boundaries as GeoJSON;
8. writes CSV/JSON, a manifest, data dictionary, validation report, and SHA-256
   checksums.

The script never saves the `.aprx` file and never changes the source
geodatabase.

## ABS postcode boundary refresh

The postcode-level values and the display geometry are deliberately separate.
After a Phase 0 rebuild, replace only the geometry with the official ABS 2021
Postal Areas shapefile supplied as a ZIP:

```powershell
& "C:\Program Files\ArcGIS\Pro\bin\Python\Scripts\propy.bat" `
  replace_postcode_boundaries.py `
  --source-zip "<POA_2021_AUST_GDA94_SHP.zip>"
```

The refresh keeps exactly the postcodes already present in
`postcode-attributes.json`, transforms GDA94 to WGS 84, applies an approximately
200 m topology-preserving display simplification, and retains only
`POA_CODE21` and `POA_NAME21` in the GeoJSON. It writes identical boundary files
to `data-freeze` and `public/data`; it never reads or changes the temperature,
load, climate, or borehole values. The zero-area non-spatial records `9494`,
`9797`, and `ZZZZ` are excluded because the existing dataset has no attributes
for them.

## Phase 2 browser data package

After Phase 0 has been frozen, build the static postcode-addressable package
with the ordinary Python environment; ArcGIS is not required:

```powershell
python build_web_data.py --source-root "<paper4 folder>"
python validate_web_data.py
```

The builder validates the frozen postcode index and attributes, reads the
representative-hour CSV with narrow in-memory data types, and writes one sorted
`public/data/climate/{postcode}.json` file per available postcode. It builds in
`public/data.building` and renames the completed package only after all files
have been written and validated.

The independent validator parses all postcode climate files, checks postcode
availability flags, record ordering, record counts, represented-hour totals,
published Draft 2020-12 schemas, and both static and per-climate SHA-256 files.

Python preprocessing dependencies are listed in `requirements.txt`. They are
development dependencies only and are not required by the deployed Web App.
