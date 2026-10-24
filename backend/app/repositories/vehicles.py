"""SQL for vehicles. Every query is scoped by dealership_id in the WHERE clause."""

from uuid import UUID

import asyncpg

from app.schemas.vehicle import VehicleUpdate

_SELECT = """
    SELECT v.id, v.stock_number, v.make, v.model, v.year, v.status, v.version,
           v.updated_at, u.name AS updated_by_name
      FROM vehicles v
      LEFT JOIN users u ON u.id = v.updated_by
"""


async def list_for_dealership(
    conn: asyncpg.Connection, dealership_id: UUID
) -> list[asyncpg.Record]:
    return await conn.fetch(
        f"{_SELECT} WHERE v.dealership_id = $1 ORDER BY v.stock_number", dealership_id
    )


async def get_for_dealership(
    conn: asyncpg.Connection, *, vehicle_id: UUID, dealership_id: UUID
) -> asyncpg.Record | None:
    return await conn.fetchrow(
        f"{_SELECT} WHERE v.id = $1 AND v.dealership_id = $2", vehicle_id, dealership_id
    )


async def update_if_version_matches(
    conn: asyncpg.Connection,
    *,
    vehicle_id: UUID,
    dealership_id: UUID,
    changes: VehicleUpdate,
    updated_by: UUID,
) -> asyncpg.Record | None:
    """Apply `changes` only if the stored version still equals `changes.version`.

    Returns the updated row, or None if nothing was updated (missing, other dealership, or
    stale version; the caller distinguishes these).

    Atomic: the version check is part of the UPDATE's WHERE clause, so checking and writing
    are one statement. There is no window between "read the version" and "write the row".
    If two of these race, Postgres makes the second wait on the first one's row lock. When
    the lock is released, the second re-evaluates its WHERE clause against the newly
    committed row (version is now N+1), matches zero rows, and returns nothing -> 409.
    """
    return await conn.fetchrow(
        """WITH updated AS (
               UPDATE vehicles
                  SET make = $1, model = $2, year = $3, status = $4,
                      version = version + 1, updated_at = now(), updated_by = $5
                WHERE id = $6 AND dealership_id = $7 AND version = $8
            RETURNING *
           )
           SELECT up.id, up.stock_number, up.make, up.model, up.year, up.status, up.version,
                  up.updated_at, u.name AS updated_by_name
             FROM updated up
             LEFT JOIN users u ON u.id = up.updated_by""",
        changes.make,
        changes.model,
        changes.year,
        changes.status,
        updated_by,
        vehicle_id,
        dealership_id,
        changes.version,
    )
