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
