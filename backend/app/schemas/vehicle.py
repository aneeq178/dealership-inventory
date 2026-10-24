from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

VehicleStatus = Literal["available", "reserved", "sold"]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)]


class VehicleOut(BaseModel):
    id: UUID
    stock_number: str
    make: str
    model: str
    year: int
    status: VehicleStatus
    version: int
    updated_at: datetime
    updated_by_name: str | None


class VehicleUpdate(BaseModel):
    """Full replacement of the four editable fields, plus the version the client started from.

    extra="forbid": fields like dealership_id or id in the body are rejected (422), so a client
    cannot even attempt to move a vehicle between dealerships.
    """

    model_config = ConfigDict(extra="forbid")

    make: Name
    model: Name
    year: int = Field(ge=1900, le=2100)
    status: VehicleStatus
    version: int = Field(ge=1, description="The vehicle version the client loaded before editing.")


class VehicleList(BaseModel):
    items: list[VehicleOut]
