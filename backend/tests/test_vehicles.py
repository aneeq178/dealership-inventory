"""Permitted vehicle operations and input validation."""

import asyncpg
import httpx
import pytest

from .helpers import Vehicles as V
from .helpers import edit_payload, error_code, stored_vehicle


async def test_get_vehicle(client: httpx.AsyncClient, north_admin: dict) -> None:
    resp = await client.get(f"/api/vehicles/{V.NORTH_CAMRY}", headers=north_admin)
    assert resp.status_code == 200
    body = resp.json()
    assert (body["make"], body["model"], body["year"], body["status"], body["version"]) == (
        "Toyota",
        "Camry",
        2022,
        "available",
        1,
    )


async def test_admin_update_persists_and_bumps_version(
    client: httpx.AsyncClient, db: asyncpg.Connection, north_admin: dict
) -> None:
    resp = await client.put(
        f"/api/vehicles/{V.NORTH_CAMRY}",
        json=edit_payload(make="Toyota", model="Corolla", year=2024, status="sold", version=1),
        headers=north_admin,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["model"] == "Corolla"
    assert body["version"] == 2
    assert body["updated_by_name"] == "Alice Morgan"

    stored = await stored_vehicle(db, V.NORTH_CAMRY)
    assert (stored["model"], stored["year"], stored["status"], stored["version"]) == (
        "Corolla",
        2024,
        "sold",
        2,
    )

    # A fresh read (what a page reload does) sees the change.
    again = await client.get(f"/api/vehicles/{V.NORTH_CAMRY}", headers=north_admin)
    assert again.json()["model"] == "Corolla"


async def test_sequential_edits_with_fresh_versions_both_succeed(
    client: httpx.AsyncClient, north_admin: dict, north_admin_2: dict
) -> None:
    url = f"/api/vehicles/{V.NORTH_CAMRY}"
    first = await client.put(url, json=edit_payload(model="A", version=1), headers=north_admin)
    assert first.status_code == 200
    second = await client.put(
        url, json=edit_payload(model="B", version=first.json()["version"]), headers=north_admin_2
    )
    assert second.status_code == 200
    assert second.json()["version"] == 3


async def test_stale_version_gets_conflict_with_current_record(
    client: httpx.AsyncClient, db: asyncpg.Connection, north_admin: dict, north_admin_2: dict
) -> None:
    url = f"/api/vehicles/{V.NORTH_CAMRY}"
    ok = await client.put(url, json=edit_payload(model="Alice", version=1), headers=north_admin)
    assert ok.status_code == 200

    stale = await client.put(url, json=edit_payload(model="Bob", version=1), headers=north_admin_2)
    assert stale.status_code == 409
    assert error_code(stale) == "version_conflict"
    details = stale.json()["error"]["details"]
    assert details["your_version"] == 1
    assert details["current"]["model"] == "Alice"
    assert details["current"]["version"] == 2

    stored = await stored_vehicle(db, V.NORTH_CAMRY)
    assert stored["model"] == "Alice"
    assert stored["version"] == 2


@pytest.mark.parametrize(
    "bad",
    [
        {"year": 1800},
        {"year": 2101},
        {"year": "next year"},
        {"status": "stolen"},
        {"make": ""},
        {"make": "   "},
        {"model": "x" * 51},
        {"version": 0},
    ],
)
async def test_invalid_input_rejected_and_data_unchanged(
    client: httpx.AsyncClient, db: asyncpg.Connection, north_admin: dict, bad: dict
) -> None:
    before = await stored_vehicle(db, V.NORTH_CAMRY)
    resp = await client.put(
        f"/api/vehicles/{V.NORTH_CAMRY}", json=edit_payload(**bad), headers=north_admin
    )
    assert resp.status_code == 422
    assert error_code(resp) == "validation_error"
    assert await stored_vehicle(db, V.NORTH_CAMRY) == before


async def test_missing_version_rejected(client: httpx.AsyncClient, north_admin: dict) -> None:
    body = edit_payload()
    del body["version"]
    resp = await client.put(f"/api/vehicles/{V.NORTH_CAMRY}", json=body, headers=north_admin)
    assert resp.status_code == 422


async def test_unknown_vehicle_update_is_404(client: httpx.AsyncClient, north_admin: dict) -> None:
    resp = await client.put(
        "/api/vehicles/00000000-0000-4000-8000-000000000000",
        json=edit_payload(),
        headers=north_admin,
    )
    assert resp.status_code == 404
