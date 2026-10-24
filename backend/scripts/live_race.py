"""Race two administrators against a running deployment. Standard library only.

Usage:
    python scripts/live_race.py https://dealerdesk.aneeq02025.workers.dev [rounds]

Each round both admins of Northside Motors read the same vehicle version, then submit
different edits from that version at the same instant (a thread barrier releases both).
Expected every round: exactly one 200 and one 409, the stored record holds the winner's
values, and the version went up by exactly one. The vehicle is restored afterwards.

This is the live counterpart of tests/test_concurrency.py: that test forces the
interleaving deterministically in-process; this one shows the deployed stack (Worker,
Hyperdrive, Neon) resolving genuinely simultaneous requests.
"""

from __future__ import annotations

import json
import sys
import threading
import urllib.error
import urllib.request
from typing import Any

PASSWORD = "Dealer#2026"  # synthetic seed password
USER_AGENT = "dealerdesk-smoke-test/1.0"  # Cloudflare blocks Python's default agent
STOCK = "N-1002"
EDITABLE = ("make", "model", "year", "status")


def call(
    base: str, method: str, path: str, token: str | None = None, body: Any = None
) -> tuple[int, Any]:
    req = urllib.request.Request(
        base + path, method=method, data=None if body is None else json.dumps(body).encode()
    )
    req.add_header("User-Agent", USER_AGENT)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            return res.status, json.loads(res.read() or b"null")
    except urllib.error.HTTPError as err:
        return err.code, json.loads(err.read() or b"null")


def login(base: str, email: str) -> str:
    status, body = call(
        base, "POST", "/api/auth/login", body={"email": email, "password": PASSWORD}
    )
    if status != 200:
        raise SystemExit(f"login failed for {email}: HTTP {status}")
    return str(body["access_token"])


def _submit(
    base: str,
    vid: str,
    original: dict[str, Any],
    version: int,
    barrier: threading.Barrier,
    results: dict[str, tuple[int, Any]],
    name: str,
    token: str,
    model: str,
) -> None:
    barrier.wait()  # both threads leave this line together
    body = {**original, "model": model, "version": version}
    results[name] = call(base, "PUT", f"/api/vehicles/{vid}", token, body)


def run(base: str, rounds: int) -> int:
    alice = login(base, "alice.admin@northside.test")
    bob = login(base, "bob.admin@northside.test")
    items = call(base, "GET", "/api/vehicles", alice)[1]["items"]
    vehicle = next(v for v in items if v["stock_number"] == STOCK)
    vid, original = vehicle["id"], {k: vehicle[k] for k in EDITABLE}
    print(f"Racing alice vs bob on {STOCK} at {base}\n")

    passed = 0
    try:
        for rnd in range(1, rounds + 1):
            version = call(base, "GET", f"/api/vehicles/{vid}", alice)[1]["version"]
            barrier = threading.Barrier(2)
            results: dict[str, tuple[int, Any]] = {}

            threads = [
                threading.Thread(
                    target=_submit,
                    args=(base, vid, original, version, barrier, results, name, token, model),
                )
                for name, token, model in (
                    ("alice", alice, f"Race A{rnd}"),
                    ("bob", bob, f"Race B{rnd}"),
                )
            ]
            for t in threads:
                t.start()
            for t in threads:
                t.join()

            codes = sorted(code for code, _ in results.values())
            winner = "alice" if results["alice"][0] == 200 else "bob"
            stored = call(base, "GET", f"/api/vehicles/{vid}", alice)[1]
            ok = (
                codes == [200, 409]
                and stored["model"] == results[winner][1]["model"]
                and stored["version"] == version + 1
            )
            passed += ok
            print(
                f"  round {rnd}: from v{version} -> {codes}, stored v{stored['version']} "
                f"{stored['model']!r} (winner {winner})  {'OK' if ok else 'WRONG'}"
            )
    finally:
        latest = call(base, "GET", f"/api/vehicles/{vid}", alice)[1]
        restore = call(
            base, "PUT", f"/api/vehicles/{vid}", alice, {**original, "version": latest["version"]}
        )
        print(f"\n  restored original values: HTTP {restore[0]}")
        for token in (alice, bob):
            call(base, "POST", "/api/auth/logout", token)

    print(f"\n{passed}/{rounds} rounds: exactly one 200, one 409, winner stored")
    return 0 if passed == rounds else 1


if __name__ == "__main__":
    if len(sys.argv) not in (2, 3):
        print(__doc__)
        sys.exit(2)
    sys.exit(run(sys.argv[1].rstrip("/"), int(sys.argv[2]) if len(sys.argv) == 3 else 5))
