"""SQL for login sessions (one row per login; logout revokes it)."""

from datetime import datetime
from uuid import UUID

import asyncpg


async def create(conn: asyncpg.Connection, *, user_id: UUID, expires_at: datetime) -> UUID:
    session_id: UUID = await conn.fetchval(
        "INSERT INTO sessions (user_id, expires_at) VALUES ($1, $2) RETURNING id",
        user_id,
        expires_at,
    )
    return session_id


async def revoke(conn: asyncpg.Connection, session_id: UUID) -> None:
    await conn.execute(
        "UPDATE sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL",
        session_id,
    )
