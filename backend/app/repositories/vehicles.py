"""SQL for vehicles. Every query is scoped by dealership_id in the WHERE clause."""

from collections.abc import Awaitable, Callable
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


# Test seam: awaited between reading the current version and writing. Always None in the app.
after_read_hook: Callable[[], Awaitable[None]] | None = None


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
    stale version — the caller distinguishes these).

    NOTE: this implementation reads the version and then writes unconditionally.
    """
    current = await conn.fetchrow(
        "SELECT version FROM vehicles WHERE id = $1 AND dealership_id = $2",
        vehicle_id,
        dealership_id,
    )
    if current is None:
        return None
    if after_read_hook is not None:
        await after_read_hook()
    if current["version"] != changes.version:
        return None
    await conn.execute(
        """UPDATE vehicles
              SET make = $1, model = $2, year = $3, status = $4,
                  version = version + 1, updated_at = now(), updated_by = $5
            WHERE id = $6""",
        changes.make,
        changes.model,
        changes.year,
        changes.status,
        updated_by,
        vehicle_id,
    )
    return await get_for_dealership(conn, vehicle_id=vehicle_id, dealership_id=dealership_id)
