"""Pydantic models and JSON Schemas for the browser data package."""

from __future__ import annotations

import math
import re
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, RootModel, model_validator


FiniteFloat = Annotated[float, Field(allow_inf_nan=False)]
NonNegativeFloat = Annotated[float, Field(ge=0, allow_inf_nan=False)]
PositiveFloat = Annotated[float, Field(gt=0, allow_inf_nan=False)]
Postcode = Annotated[str, Field(pattern=r"^\d{4}$")]
Sha256 = Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class PostcodeIndexEntry(StrictModel):
    postcode: Postcode
    locality_hint: str
    state: str | None
    lat: FiniteFloat
    lon: FiniteFloat
    has_ground_data: bool
    has_load_data: bool
    has_climate_data: bool


class PostcodeIndexFile(RootModel[list[PostcodeIndexEntry]]):
    @model_validator(mode="after")
    def unique_postcodes(self) -> "PostcodeIndexFile":
        codes = [item.postcode for item in self.root]
        if len(codes) != len(set(codes)):
            raise ValueError("postcode-index contains duplicate postcodes")
        return self


class Location(StrictModel):
    lat: FiniteFloat
    lon: FiniteFloat
    postcode_name: str


class GroundTemperatureChain(StrictModel):
    surface_temp_c: FiniteFloat | None
    delta_temp_at_reference_depth_c: FiniteFloat | None
    gradient_c_per_m: FiniteFloat | None
    ground_temp_at_reference_depth_c: FiniteFloat | None


class GroundUncertainty(StrictModel):
    delta_t20_ebk_prediction_se_c: NonNegativeFloat | None
    applies_to_dataset_id: Literal["surface_t"]
    scope: Literal["delta_t20_interpolation_only"]
    is_total_ground_temperature_uncertainty: Literal[False]


class GroundData(StrictModel):
    reference_depth_m: NonNegativeFloat
    air_t: GroundTemperatureChain
    surface_t: GroundTemperatureChain
    nearest_borehole_km: NonNegativeFloat
    nearby_borehole_count: Annotated[int, Field(ge=0)]
    nearby_radius_km: PositiveFloat
    uncertainty: GroundUncertainty


class LoadData(StrictModel):
    annual_heating_kwh_m2: NonNegativeFloat | None
    annual_cooling_kwh_m2: NonNegativeFloat | None
    certificate_count: Annotated[int, Field(ge=0)] | None


class ClimateAvailability(StrictModel):
    record_count: Annotated[int, Field(ge=1)] | None
    represented_hours: PositiveFloat | None
    record_type: Literal["weighted_representative_hour"]
    weight_hours: PositiveFloat
    stored_temperature_scale_divisor: PositiveFloat


class QualityData(StrictModel):
    ground_temperature_method: str
    load_method: str
    warnings: list[str]


class PostcodeAttribute(StrictModel):
    location: Location
    ground: GroundData
    load: LoadData
    climate: ClimateAvailability
    quality: QualityData


class PostcodeAttributesFile(RootModel[dict[str, PostcodeAttribute]]):
    @model_validator(mode="after")
    def valid_keys(self) -> "PostcodeAttributesFile":
        invalid = [key for key in self.root if re.fullmatch(r"\d{4}", key) is None]
        if invalid:
            raise ValueError(f"Invalid postcode attribute keys: {invalid[:5]}")
        return self


DayOfYear = Annotated[int, Field(ge=1, le=366)]
HourUtc = Annotated[float, Field(ge=0, lt=24, allow_inf_nan=False)]
ClimateRecord = tuple[DayOfYear, HourUtc, FiniteFloat, PositiveFloat]


class ClimateFile(StrictModel):
    schema_version: Literal["1.0.0"]
    postcode: Postcode
    time_basis: Literal["UTC"]
    record_type: Literal["weighted_representative_hour"]
    record_layout: tuple[
        Literal["day_of_year"],
        Literal["hour_utc"],
        Literal["air_temp_c"],
        Literal["weight_hours"],
    ]
    record_count: Annotated[int, Field(ge=1)]
    represented_hours: PositiveFloat
    records: list[ClimateRecord]

    @model_validator(mode="after")
    def totals_match(self) -> "ClimateFile":
        if len(self.records) != self.record_count:
            raise ValueError("record_count does not equal records length")
        represented = sum(record[3] for record in self.records)
        if not math.isclose(represented, self.represented_hours, abs_tol=1e-9):
            raise ValueError("represented_hours does not equal the record-weight sum")
        return self


class ClimatePackage(StrictModel):
    directory: Literal["climate"]
    filename_pattern: Literal["{postcode}.json"]
    postcode_count: Annotated[int, Field(ge=0)]
    missing_postcode_count: Annotated[int, Field(ge=0)]
    records_per_available_postcode: Annotated[int, Field(ge=1)]
    represented_hours_per_available_postcode: PositiveFloat
    time_basis: Literal["UTC"]
    record_type: Literal["weighted_representative_hour"]
    record_layout: list[str]
    checksums_file: Literal["climate-checksums.sha256"]


class SchemaFiles(StrictModel):
    postcode_index: str
    postcode_attributes: str
    climate: str
    manifest: str


class WebManifest(StrictModel):
    schema_version: Literal["1.0.0"]
    dataset_version: str
    generated_at: str
    parent_dataset_version: str
    parent_manifest_sha256: Sha256
    country: Literal["Australia"]
    analysis_unit: Literal["postcode"]
    runtime_spatial_processing: Literal[False]
    postcode_count: Annotated[int, Field(ge=1)]
    temperature_unit: Literal["degC"]
    load_unit: Literal["kWh_m2_year"]
    depth_unit: Literal["m"]
    gradient_internal_unit: Literal["degC_per_m"]
    reference_depth_m: NonNegativeFloat
    surface_temperature_datasets: list[dict[str, Any]]
    redistribution_permission_confirmed_by_project_owner: bool
    climate: ClimatePackage
    schemas: SchemaFiles
    files: dict[str, Sha256]


def json_schemas() -> dict[str, dict[str, Any]]:
    """Return the four publishable Draft 2020-12 JSON Schemas."""

    schemas = {
        "postcode-index.schema.json": PostcodeIndexFile.model_json_schema(),
        "postcode-attributes.schema.json": PostcodeAttributesFile.model_json_schema(),
        "climate.schema.json": ClimateFile.model_json_schema(),
        "manifest.schema.json": WebManifest.model_json_schema(),
    }
    for schema in schemas.values():
        schema["$schema"] = "https://json-schema.org/draft/2020-12/schema"
    return schemas
