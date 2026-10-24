"""Apply pending SQL migrations in filename order.

Usage (from backend/):  python -m scripts.migrate

Each file in migrations/ runs once inside its own transaction and is recorded in
schema_migrations. Migrations are forward-only; see README "Release recovery".
"""

import asyncio
from pathlib import Path

import asyncpg

from app.core.config import get_settings

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"


async def apply_migrations(conn: asyncpg.Connection) -> list[str]:
    await conn.execute(
        """CREATE TABLE IF NOT EXISTS schema_migrations (
               version    text PRIMARY KEY,
               applied_at timestamptz NOT NULL DEFAULT now()
           )"""
    )
    applied = {r["version"] for r in await conn.fetch("SELECT version FROM schema_migrations")}
    newly_applied: list[str] = []
    for path in sorted(MIGRATIONS_DIR.glob("*.sql")):
        version = path.stem
        if version in applied:
            continue
        async with conn.transaction():
            await conn.execute(path.read_text(encoding="utf-8"))
            await conn.execute("INSERT INTO schema_migrations (version) VALUES ($1)", version)
        newly_applied.append(version)
    return newly_applied


async def main() -> None:
    conn = await asyncpg.connect(get_settings().database_url)
    try:
        done = await apply_migrations(conn)
        print(f"applied: {', '.join(done)}" if done else "no pending migrations")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
