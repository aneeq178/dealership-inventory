from typing import Any
from uuid import UUID

import asyncpg
import httpx

from scripts.seed import SEED_PASSWORD

Headers = dict[str, str]


class Accounts:
    NORTH_ADMIN_1 = "alice.admin@northside.test"
    NORTH_ADMIN_2 = "bob.admin@northside.test"
    NORTH_VIEWER = "victor.viewer@northside.test"
    SOUTH_ADMIN_1 = "sara.admin@southgate.test"
    SOUTH_VIEWER = "uma.viewer@southgate.test"


class Vehicles:
    NORTH_CAMRY = UUID("c1111111-0000-4000-8000-000000000001")
    NORTH_CIVIC = UUID("c1111111-0000-4000-8000-000000000002")
    SOUTH_MALIBU = UUID("d2222222-0000-4000-8000-000000000001")


EDITABLE = ("make", "model", "year", "status", "version")


async def login_headers(client: httpx.AsyncClient, email: str) -> Headers:
    resp = await client.post("/api/auth/login", json={"email": email, "password": SEED_PASSWORD})
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def stored_vehicle(db: asyncpg.Connection, vehicle_id: UUID) -> dict[str, Any]:
    """What is actually in the database, bypassing the API."""
    row = await db.fetchrow(
        "SELECT make, model, year, status, version, updated_by FROM vehicles WHERE id = $1",
        vehicle_id,
    )
    assert row is not None
    return dict(row)


def edit_payload(**overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "make": "Toyota",
        "model": "Camry",
        "year": 2022,
        "status": "available",
        "version": 1,
    }
    body.update(overrides)
    return body


def error_code(resp: httpx.Response) -> str:
    code: str = resp.json()["error"]["code"]
    return code
