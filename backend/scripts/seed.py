"""Deterministic seed data: 2 dealerships, 6 users (2 admins + 1 viewer each), 8 vehicles.

Usage (from backend/):  python -m scripts.seed

Repeatable: it truncates the data tables and re-inserts the same rows with the same fixed
UUIDs every time, so tests, the README and the smoke test can all refer to known records.
It does NOT touch the schema; use scripts.reset for a full rebuild.
"""

import asyncio
from functools import lru_cache
from uuid import UUID

import asyncpg

from app.core.config import get_settings
from app.core.security import hash_password

# Synthetic reviewer password shared by every seeded account. Not a real credential.
SEED_PASSWORD = "Dealer#2026"

NORTH = UUID("11111111-1111-4111-8111-111111111111")
SOUTH = UUID("22222222-2222-4222-8222-222222222222")

DEALERSHIPS = [
    (NORTH, "Northside Motors"),
    (SOUTH, "Southgate Auto Group"),
]

# (id, dealership, email, name, role)
USERS = [
    (
        UUID("a1111111-0000-4000-8000-000000000001"),
        NORTH,
        "alice.admin@northside.test",
        "Alice Morgan",
        "admin",
    ),
    (
        UUID("a1111111-0000-4000-8000-000000000002"),
        NORTH,
        "bob.admin@northside.test",
        "Bob Chen",
        "admin",
    ),
    (
        UUID("a1111111-0000-4000-8000-000000000003"),
        NORTH,
        "victor.viewer@northside.test",
        "Victor Reyes",
        "viewer",
    ),
    (
        UUID("b2222222-0000-4000-8000-000000000001"),
        SOUTH,
        "sara.admin@southgate.test",
        "Sara Patel",
        "admin",
    ),
    (
        UUID("b2222222-0000-4000-8000-000000000002"),
        SOUTH,
        "tom.admin@southgate.test",
        "Tom Walker",
        "admin",
    ),
    (
        UUID("b2222222-0000-4000-8000-000000000003"),
        SOUTH,
        "uma.viewer@southgate.test",
        "Uma Brooks",
        "viewer",
    ),
]

# (id, dealership, stock_number, make, model, year, status)
VEHICLES = [
    (
        UUID("c1111111-0000-4000-8000-000000000001"),
        NORTH,
        "N-1001",
        "Toyota",
        "Camry",
        2022,
        "available",
    ),
    (
        UUID("c1111111-0000-4000-8000-000000000002"),
        NORTH,
        "N-1002",
        "Honda",
        "Civic",
        2021,
        "reserved",
    ),
    (
        UUID("c1111111-0000-4000-8000-000000000003"),
        NORTH,
        "N-1003",
        "Ford",
        "F-150",
        2023,
        "available",
    ),
    (
        UUID("c1111111-0000-4000-8000-000000000004"),
        NORTH,
        "N-1004",
        "Tesla",
        "Model 3",
        2022,
        "sold",
    ),
    (
        UUID("d2222222-0000-4000-8000-000000000001"),
        SOUTH,
        "S-2001",
        "Chevrolet",
        "Malibu",
        2020,
        "available",
    ),
    (
        UUID("d2222222-0000-4000-8000-000000000002"),
        SOUTH,
        "S-2002",
        "Nissan",
        "Altima",
        2021,
        "available",
    ),
    (
        UUID("d2222222-0000-4000-8000-000000000003"),
        SOUTH,
        "S-2003",
        "Jeep",
        "Wrangler",
        2023,
        "reserved",
    ),
    (
        UUID("d2222222-0000-4000-8000-000000000004"),
        SOUTH,
        "S-2004",
        "Hyundai",
        "Tucson",
        2022,
        "sold",
    ),
]


@lru_cache
def _password_hash(iterations: int) -> str:
    # Hashing is deliberately slow; compute once per process and reuse for all seed users.
    # Each user still gets a properly salted hash in production because the salt is random
    # per call — here all seed users intentionally share one synthetic password and hash.
    return hash_password(SEED_PASSWORD, iterations)


async def seed(conn: asyncpg.Connection) -> None:
    pw_hash = _password_hash(get_settings().password_hash_iterations)
    async with conn.transaction():
        await conn.execute("TRUNCATE sessions, vehicles, users, dealerships CASCADE")
        await conn.executemany("INSERT INTO dealerships (id, name) VALUES ($1, $2)", DEALERSHIPS)
        await conn.executemany(
            """INSERT INTO users (id, dealership_id, email, name, role, password_hash)
               VALUES ($1, $2, $3, $4, $5, $6)""",
            [(*u, pw_hash) for u in USERS],
        )
        await conn.executemany(
            """INSERT INTO vehicles (id, dealership_id, stock_number, make, model, year, status)
               VALUES ($1, $2, $3, $4, $5, $6, $7)""",
            VEHICLES,
        )


async def main() -> None:
    conn = await asyncpg.connect(get_settings().database_url)
    try:
        await seed(conn)
        print(
            f"seeded {len(DEALERSHIPS)} dealerships, {len(USERS)} users, {len(VEHICLES)} vehicles"
        )
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
