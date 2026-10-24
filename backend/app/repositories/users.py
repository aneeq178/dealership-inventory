"""SQL for users and their dealership."""

from uuid import UUID

import asyncpg

_USER_COLUMNS = """
    u.id, u.email, u.name, u.role, u.password_hash, u.dealership_id,
    d.name AS dealership_name
"""


async def get_by_email(conn: asyncpg.Connection, email: str) -> asyncpg.Record | None:
    return await conn.fetchrow(
        f"""SELECT {_USER_COLUMNS}
              FROM users u JOIN dealerships d ON d.id = u.dealership_id
             WHERE lower(u.email) = lower($1)""",
        email,
    )


async def get_by_session(
    conn: asyncpg.Connection, *, session_id: UUID, user_id: UUID
) -> asyncpg.Record | None:
    """The user behind a session, plus the session's validity fields.

    Role and dealership are read here, from the database, on every request. They are never
    taken from the request body or trusted from the token alone.
    """
    return await conn.fetchrow(
        f"""SELECT {_USER_COLUMNS},
                   s.id AS session_id, s.expires_at, s.revoked_at
              FROM sessions s
              JOIN users u ON u.id = s.user_id
              JOIN dealerships d ON d.id = u.dealership_id
             WHERE s.id = $1 AND s.user_id = $2""",
        session_id,
        user_id,
    )
