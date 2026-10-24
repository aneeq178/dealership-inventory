"""Access boundaries, exercised directly against the API (no frontend involved).

Every rejected write also asserts the stored row is byte-for-byte unchanged.
"""

import asyncpg
import httpx
import pytest

from .helpers import Vehicles as V
from .helpers import edit_payload, error_code, stored_vehicle

# --- unauthenticated -------------------------------------------------------------------


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("GET", "/api/vehicles"),
        ("GET", f"/api/vehicles/{V.NORTH_CAMRY}"),
        ("PUT", f"/api/vehicles/{V.NORTH_CAMRY}"),
        ("POST", "/api/auth/logout"),
        ("GET", "/api/auth/me"),
    ],
)
async def test_protected_routes_require_auth(
    client: httpx.AsyncClient, method: str, path: str
) -> None:
    resp = await client.request(method, path, json=edit_payload())
    assert resp.status_code == 401
    assert error_code(resp) == "unauthenticated"


async def test_unauthenticated_update_leaves_data_unchanged(
    client: httpx.AsyncClient, db: asyncpg.Connection
) -> None:
    before = await stored_vehicle(db, V.NORTH_CAMRY)
    resp = await client.put(
        f"/api/vehicles/{V.NORTH_CAMRY}",
        json=edit_payload(make="Hacked"),
        headers={"Authorization": "Bearer garbage"},
    )
    assert resp.status_code == 401
    assert await stored_vehicle(db, V.NORTH_CAMRY) == before


# --- role: viewer ----------------------------------------------------------------------


async def test_viewer_can_read_own_dealership(
    client: httpx.AsyncClient, north_viewer: dict
) -> None:
    resp = await client.get("/api/vehicles", headers=north_viewer)
    assert resp.status_code == 200
    stock = {v["stock_number"] for v in resp.json()["items"]}
    assert stock == {"N-1001", "N-1002", "N-1003", "N-1004"}


async def test_viewer_cannot_update(
    client: httpx.AsyncClient, db: asyncpg.Connection, north_viewer: dict
) -> None:
    before = await stored_vehicle(db, V.NORTH_CAMRY)
    resp = await client.put(
        f"/api/vehicles/{V.NORTH_CAMRY}",
        json=edit_payload(make="ViewerEdit"),
        headers=north_viewer,
    )
    assert resp.status_code == 403
    assert error_code(resp) == "forbidden"
    assert await stored_vehicle(db, V.NORTH_CAMRY) == before


# --- dealership isolation --------------------------------------------------------------


async def test_list_only_shows_own_dealership(
    client: httpx.AsyncClient, north_admin: dict, south_admin: dict
) -> None:
    north = {
        v["id"] for v in (await client.get("/api/vehicles", headers=north_admin)).json()["items"]
    }
    south = {
        v["id"] for v in (await client.get("/api/vehicles", headers=south_admin)).json()["items"]
    }
    assert len(north) == 4 and len(south) == 4
    assert north.isdisjoint(south)
    assert str(V.SOUTH_MALIBU) not in north


async def test_cannot_read_other_dealership_vehicle(
    client: httpx.AsyncClient, north_admin: dict
) -> None:
    resp = await client.get(f"/api/vehicles/{V.SOUTH_MALIBU}", headers=north_admin)
    # 404, not 403: the response does not confirm the vehicle exists elsewhere.
    assert resp.status_code == 404
    assert error_code(resp) == "not_found"


async def test_cannot_update_other_dealership_vehicle(
    client: httpx.AsyncClient, db: asyncpg.Connection, north_admin: dict
) -> None:
    before = await stored_vehicle(db, V.SOUTH_MALIBU)
    resp = await client.put(
        f"/api/vehicles/{V.SOUTH_MALIBU}",
        json=edit_payload(make="CrossDealer", version=before["version"]),
        headers=north_admin,
    )
    assert resp.status_code == 404
    assert await stored_vehicle(db, V.SOUTH_MALIBU) == before


async def test_other_dealership_and_nonexistent_look_identical(
    client: httpx.AsyncClient, north_admin: dict
) -> None:
    other = await client.get(f"/api/vehicles/{V.SOUTH_MALIBU}", headers=north_admin)
    missing = await client.get(
        "/api/vehicles/00000000-0000-4000-8000-000000000000", headers=north_admin
    )
    assert other.status_code == missing.status_code == 404
    assert other.json() == missing.json()


async def test_body_cannot_smuggle_dealership_id(
    client: httpx.AsyncClient, db: asyncpg.Connection, north_admin: dict
) -> None:
    before = await stored_vehicle(db, V.NORTH_CAMRY)
    resp = await client.put(
        f"/api/vehicles/{V.NORTH_CAMRY}",
        json={**edit_payload(), "dealership_id": "22222222-2222-4222-8222-222222222222"},
        headers=north_admin,
    )
    assert resp.status_code == 422
    assert await stored_vehicle(db, V.NORTH_CAMRY) == before
