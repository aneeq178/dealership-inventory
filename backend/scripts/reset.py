"""Create the database if needed, drop every table, re-run migrations, then seed.

Local development, tests and CI only. Never point this at a shared database.

Usage (from backend/):  python -m scripts.reset
"""

import asyncio
from urllib.parse import urlparse, urlunparse

import asyncpg

from app.core.config import get_settings
from scripts.migrate import apply_migrations
from scripts.seed import seed


async def ensure_database(database_url: str) -> None:
    """CREATE DATABASE if it does not exist (connects to the server's `postgres` database)."""
    parsed = urlparse(database_url)
    name = parsed.path.lstrip("/")
    admin_url = urlunparse(parsed._replace(path="/postgres"))
    conn = await asyncpg.connect(admin_url)
    try:
        exists = await conn.fetchval("SELECT 1 FROM pg_database WHERE datname = $1", name)
        if not exists:
            # Identifier comes from our own config, quoted to be safe.
            await conn.execute(f'CREATE DATABASE "{name}"')
    finally:
        await conn.close()


async def reset(conn: asyncpg.Connection) -> None:
    await conn.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
    await apply_migrations(conn)
    await seed(conn)


async def main() -> None:
    url = get_settings().database_url
    await ensure_database(url)
    conn = await asyncpg.connect(url)
    try:
        await reset(conn)
        print("database reset: schema rebuilt and seed data loaded")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
