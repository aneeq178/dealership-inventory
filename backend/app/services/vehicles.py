"""Vehicle use cases. Dealership and role always come from the authenticated user."""

from uuid import UUID

import asyncpg

from app.core.errors import NotFound, VersionConflict
from app.repositories import vehicles as repo
from app.schemas.vehicle import VehicleOut, VehicleUpdate


def to_vehicle_out(row: asyncpg.Record) -> VehicleOut:
    return VehicleOut.model_validate(dict(row))


async def list_vehicles(conn: asyncpg.Connection, *, dealership_id: UUID) -> list[VehicleOut]:
    rows = await repo.list_for_dealership(conn, dealership_id)
    return [to_vehicle_out(r) for r in rows]


async def get_vehicle(
    conn: asyncpg.Connection, *, vehicle_id: UUID, dealership_id: UUID
) -> VehicleOut:
    row = await repo.get_for_dealership(conn, vehicle_id=vehicle_id, dealership_id=dealership_id)
    if row is None:
        # Also the answer for another dealership's vehicle: 404 does not reveal it exists.
        raise NotFound("Vehicle not found.")
    return to_vehicle_out(row)


async def update_vehicle(
    conn: asyncpg.Connection,
    *,
    vehicle_id: UUID,
    dealership_id: UUID,
    changes: VehicleUpdate,
    user_id: UUID,
) -> VehicleOut:
    row = await repo.update_if_version_matches(
        conn,
        vehicle_id=vehicle_id,
        dealership_id=dealership_id,
        changes=changes,
        updated_by=user_id,
    )
    if row is not None:
        return to_vehicle_out(row)

    # Nothing was written. Work out why, still scoped to the caller's dealership.
    current = await repo.get_for_dealership(
        conn, vehicle_id=vehicle_id, dealership_id=dealership_id
    )
    if current is None:
        raise NotFound("Vehicle not found.")
    raise VersionConflict(
        details={
            "your_version": changes.version,
            "current": to_vehicle_out(current).model_dump(mode="json"),
        }
    )
