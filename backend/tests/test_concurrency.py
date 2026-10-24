"""Lost-update regression test.

Scenario (assessment 4.1): two administrators of the same dealership load the same vehicle at
the same version and submit different changes based on that version, at the same time.

Required outcome: exactly one 200, exactly one 409, and the stored row holds the winner's
values with version incremented exactly once. The loser's request must change nothing.

How this exposes a lost update deterministically
------------------------------------------------
A "read version, compare, then write" implementation has a window between the read and the
write. The repository awaits `after_read_hook` inside that window. The test installs a
two-party barrier there, so BOTH requests must finish reading before EITHER may write. Both
then see version 1, both pass the check, both write: two 200s, and the second write silently
overwrites the first. The test fails.

An atomic implementation (`UPDATE ... WHERE version = $expected`) has no separate read, so it
never reaches the hook. The database serialises the two UPDATEs on the row lock; the second
re-evaluates its WHERE clause against the committed row, finds version 2, matches nothing,
and the API returns 409. The test passes.
"""

import asyncio
from collections.abc import Awaitable, Callable

import asyncpg
import httpx
import pytest

from app.repositories import vehicles as vehicles_repo

from .helpers import Vehicles as V
from .helpers import edit_payload, error_code, stored_vehicle

URL = f"/api/vehicles/{V.NORTH_CAMRY}"


def _read_barrier(parties: int = 2, timeout: float = 5.0) -> Callable[[], Awaitable[None]]:
    barrier = asyncio.Barrier(parties)

    async def wait() -> None:
        # Bounded wait: never hang the suite if only one request reaches the hook.
        async with asyncio.timeout(timeout):
            await barrier.wait()

    return wait


@pytest.fixture
def force_interleaving(monkeypatch: pytest.MonkeyPatch) -> None:
    # raising=False: an implementation without a read step has no hook, which is the point.
    monkeypatch.setattr(vehicles_repo, "after_read_hook", _read_barrier(), raising=False)


@pytest.mark.usefixtures("force_interleaving")
async def test_competing_edits_from_same_version_exactly_one_wins(
    client: httpx.AsyncClient,
    db: asyncpg.Connection,
    north_admin: dict,
    north_admin_2: dict,
) -> None:
    # Both administrators load the vehicle and see the same starting version.
    alice_view = (await client.get(URL, headers=north_admin)).json()
    bob_view = (await client.get(URL, headers=north_admin_2)).json()
    assert alice_view["version"] == bob_view["version"] == 1

    alice_edit = edit_payload(model="Camry Hybrid", status="reserved", version=1)
    bob_edit = edit_payload(model="Camry XSE", year=2023, status="sold", version=1)

    # Submit both at the same time.
    alice, bob = await asyncio.gather(
        client.put(URL, json=alice_edit, headers=north_admin),
        client.put(URL, json=bob_edit, headers=north_admin_2),
    )

    statuses = sorted([alice.status_code, bob.status_code])
    assert statuses == [200, 409], (
        f"expected exactly one success and one conflict, got {statuses}: "
        "a stale edit was accepted (lost update)"
    )

    winner, loser = (alice, bob) if alice.status_code == 200 else (bob, alice)
    winning_edit = alice_edit if winner is alice else bob_edit

    # The loser gets a clear conflict that carries the winner's record.
    assert error_code(loser) == "version_conflict"
    current = loser.json()["error"]["details"]["current"]
    assert current["version"] == 2
    assert current["model"] == winning_edit["model"]

    # The database holds exactly the winner's values, version bumped exactly once.
    stored = await stored_vehicle(db, V.NORTH_CAMRY)
    assert stored["version"] == 2
    for field in ("make", "model", "year", "status"):
        assert stored[field] == winning_edit[field], field
    assert winner.json()["version"] == 2


async def test_stale_edit_after_other_admin_saved_is_rejected(
    client: httpx.AsyncClient,
    db: asyncpg.Connection,
    north_admin: dict,
    north_admin_2: dict,
) -> None:
    """Same scenario, one after the other: the readable version of the race."""
    first = await client.put(URL, json=edit_payload(model="First", version=1), headers=north_admin)
    assert first.status_code == 200

    stale = await client.put(
        URL, json=edit_payload(model="Second", version=1), headers=north_admin_2
    )
    assert stale.status_code == 409

    stored = await stored_vehicle(db, V.NORTH_CAMRY)
    assert (stored["model"], stored["version"]) == ("First", 2)
