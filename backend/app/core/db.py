"""Database access.

Route handlers never create connections themselves; they depend on `get_conn`, which yields
one asyncpg connection for the duration of the request.

- Local / CI / any long-running server: connections come from a pool created in the app
  lifespan (see app.main).
- Cloudflare Python Workers (deploy step): the Worker entrypoint overrides `get_conn` via
  FastAPI dependency_overrides to open a connection through the Hyperdrive binding instead.
  Nothing else in the app changes.
"""

from collections.abc import AsyncIterator
from typing import Annotated, cast

import asyncpg
from fastapi import Depends, Request


async def create_pool(database_url: str) -> asyncpg.Pool:
    pool = await asyncpg.create_pool(dsn=database_url, min_size=1, max_size=10)
    assert pool is not None
    return pool


async def get_conn(request: Request) -> AsyncIterator[asyncpg.Connection]:
    pool = cast(asyncpg.Pool, request.app.state.pool)
    async with pool.acquire() as conn:
        yield cast(asyncpg.Connection, conn)


async def db_ping(request: Request) -> bool:
    """True if the database answers. Never raises; used by the health endpoint."""
    try:
        pool = cast(asyncpg.Pool, request.app.state.pool)
        async with pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        return True
    except Exception:
        return False


Conn = Annotated[asyncpg.Connection, Depends(get_conn)]
DbReachable = Annotated[bool, Depends(db_ping)]
