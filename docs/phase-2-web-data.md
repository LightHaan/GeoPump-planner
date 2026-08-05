# Phase 2: static browser data package

## Result

`public/data/` is a complete static package that the later browser application
can serve without ArcGIS, a backend, a database, or runtime spatial analysis.
The package contains:

```text
public/data/
├── manifest.json
├── postcode-index.json
├── postcode-attributes.json
├── postcode-boundaries.geojson
├── climate-checksums.sha256
├── checksums.sha256
├── climate/{postcode}.json
├── presets/paper-default.json
└── schemas/*.schema.json
```

## Climate-file format

Each available postcode is independently addressable. For example, the App
can load only `climate/3000.json` after postcode 3000 is selected.

To avoid repeating field names 1,752 times, records use a declared tuple
layout:

```json
{
  "postcode": "3000",
  "time_basis": "UTC",
  "record_type": "weighted_representative_hour",
  "record_layout": [
    "day_of_year",
    "hour_utc",
    "air_temp_c",
    "weight_hours"
  ],
  "record_count": 1752,
  "represented_hours": 8760,
  "records": [[1, 0, 20.4, 5]]
}
```

The browser loader must use `record_layout`; it must not infer tuple positions
silently. Temperatures have already been divided by the source scale divisor
and are published in degrees Celsius. Every record has an explicit weight of
five represented hours.

## Counts and missing data

- spatial postcode index and attributes: 2,641;
- postcodes with climate files: 2,634;
- total climate records: 4,614,768;
- records per available postcode: 1,752;
- represented hours per available postcode: 8,760;
- uncompressed climate JSON size: 128,187,588 bytes.

The seven postcodes without source climate records are `2293`, `2299`, `2898`,
`2899`, `6003`, `6798`, and `6799`. Their index entries explicitly set
`has_climate_data` to `false`, and no empty or fabricated climate file is
published for them.

## Schemas and integrity

Four Pydantic source models generate publishable Draft 2020-12 JSON Schemas
for the postcode index, postcode attributes, postcode climate files, and the
web manifest. The independent validation pass checks every one of the 2,634
climate files against the same strict models, including tuple types, finite
temperatures, positive weights, record counts, represented-hour totals, and
chronological ordering.

`climate-checksums.sha256` contains one checksum per postcode climate file.
`checksums.sha256` covers the manifest and the other static package files.
The final Phase 2 validation found no schema, availability, ordering, or
checksum failures.
