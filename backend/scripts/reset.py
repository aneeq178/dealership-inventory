"""Drop every table, re-run all migrations, then seed. Local development and CI only.

Usage (from backend/):  python -m scripts.reset
"""

import asyncio

import asyncpg

from app.core.config import get_settings
from scripts.migrate import apply_migrations
from scripts.seed import seed


async def reset(conn: asyncpg.Connection) -> None:
    await conn.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
    await apply_migrations(conn)
    await seed(conn)


async def main() -> None:
    conn = await asyncpg.connect(get_settings().database_url)
    try:
        await reset(conn)
        print("database reset: schema rebuilt and seed data loaded")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
