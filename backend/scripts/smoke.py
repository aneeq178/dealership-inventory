"""Smoke test against a running deployment (or local server). Standard library only.

Usage:
    python scripts/smoke.py https://your-app.example.workers.dev
    python scripts/smoke.py http://localhost:8000

Covers the assessment's deployed checks: health, login, an allowed update, rejected access
(viewer edit, cross-dealership read/update, missing token), a stale-edit conflict, and logout
revocation. Every change it makes is reverted at the end. Exit code 0 only if all pass.

Uses the synthetic seed accounts. Override the password with SMOKE_PASSWORD if needed.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Any

PASSWORD = os.environ.get("SMOKE_PASSWORD", "Dealer#2026")
NORTH_ADMIN = "alice.admin@northside.test"
NORTH_ADMIN_2 = "bob.admin@northside.test"
NORTH_VIEWER = "victor.viewer@northside.test"
SOUTH_ADMIN = "sara.admin@southgate.test"
TARGET_STOCK = "N-1003"
EDITABLE = ("make", "model", "year", "status")


@dataclass
class Response:
    status: int
    body: Any


@dataclass
class Smoke:
    base: str
    results: list[tuple[bool, str, str]] = field(default_factory=list)

    def call(
        self, method: str, path: str, *, token: str | None = None, body: Any = None
    ) -> Response:
        data = None if body is None else json.dumps(body).encode()
        req = urllib.request.Request(f"{self.base}{path}", data=data, method=method)
        req.add_header("Accept", "application/json")
        if body is not None:
            req.add_header("Content-Type", "application/json")
        if token:
            req.add_header("Authorization", f"Bearer {token}")
        try:
            with urllib.request.urlopen(req, timeout=20) as res:
                raw = res.read()
                return Response(res.status, json.loads(raw) if raw else None)
        except urllib.error.HTTPError as err:
            raw = err.read()
            try:
                return Response(err.code, json.loads(raw) if raw else None)
            except json.JSONDecodeError:
                return Response(err.code, raw.decode(errors="replace"))

    def check(self, ok: bool, name: str, detail: str = "") -> bool:
        self.results.append((ok, name, detail))
        print(f"  {'PASS' if ok else 'FAIL'}  {name}" + (f"  ({detail})" if detail else ""))
        return ok

    def login(self, email: str) -> str | None:
        r = self.call("POST", "/api/auth/login", body={"email": email, "password": PASSWORD})
        if r.status == 200:
            return str(r.body["access_token"])
        return None


def code_of(r: Response) -> str:
    if isinstance(r.body, dict):
        return str(r.body.get("error", {}).get("code", ""))
    return ""


def editable(v: dict[str, Any]) -> dict[str, Any]:
    return {k: v[k] for k in EDITABLE}


def run(base: str) -> int:
    s = Smoke(base.rstrip("/"))
    print(f"Smoke test against {s.base}\n")

    # Health
    r = s.call("GET", "/api/health")
    s.check(
        r.status == 200 and r.body.get("db") == "ok",
        "health endpoint reports DB ok",
        f"HTTP {r.status}",
    )
    s.check("secret" not in json.dumps(r.body).lower(), "health exposes no secrets")

    # Login
    bad = s.call("POST", "/api/auth/login", body={"email": NORTH_ADMIN, "password": "wrong"})
    s.check(
        bad.status == 401 and code_of(bad) == "invalid_credentials",
        "invalid login rejected",
        f"HTTP {bad.status}",
    )
    alice = s.login(NORTH_ADMIN)
    bob = s.login(NORTH_ADMIN_2)
    victor = s.login(NORTH_VIEWER)
    sara = s.login(SOUTH_ADMIN)
    if not s.check(all([alice, bob, victor, sara]), "valid login for admin, viewer, other dealer"):
        return summary(s)

    # Missing token
    r = s.call("GET", "/api/vehicles")
    s.check(r.status == 401, "request without token rejected", f"HTTP {r.status}")

    # Scoped list
    r = s.call("GET", "/api/vehicles", token=alice)
    items = r.body["items"] if r.status == 200 else []
    s.check(
        r.status == 200
        and len(items) > 0
        and all(v["stock_number"].startswith("N-") for v in items),
        "admin list shows only own dealership",
        f"{len(items)} vehicles",
    )
    target = next((v for v in items if v["stock_number"] == TARGET_STOCK), None)
    if not s.check(target is not None, f"target vehicle {TARGET_STOCK} present"):
        return summary(s)
    assert target is not None
    vid, original, v0 = target["id"], editable(target), target["version"]

    try:
        # Allowed update
        change = {**original, "model": f"{original['model']} Smoke", "version": v0}
        r = s.call("PUT", f"/api/vehicles/{vid}", token=alice, body=change)
        s.check(
            r.status == 200 and r.body["version"] == v0 + 1,
            "admin update allowed",
            f"HTTP {r.status}, version {v0} -> {r.body.get('version') if r.status == 200 else '?'}",
        )
        after = s.call("GET", f"/api/vehicles/{vid}", token=alice).body
        s.check(after["model"] == change["model"], "update persisted (fresh read)")

        # Viewer edit rejected, data unchanged
        r = s.call(
            "PUT",
            f"/api/vehicles/{vid}",
            token=victor,
            body={**original, "model": "Viewer Edit", "version": after["version"]},
        )
        unchanged = s.call("GET", f"/api/vehicles/{vid}", token=alice).body
        s.check(
            r.status == 403 and unchanged == after,
            "viewer edit rejected, data unchanged",
            f"HTTP {r.status}",
        )

        # Cross-dealership read and update rejected
        r = s.call("GET", f"/api/vehicles/{vid}", token=sara)
        s.check(r.status == 404, "other dealership cannot read vehicle", f"HTTP {r.status}")
        r = s.call(
            "PUT",
            f"/api/vehicles/{vid}",
            token=sara,
            body={**original, "model": "Cross Dealer", "version": after["version"]},
        )
        unchanged = s.call("GET", f"/api/vehicles/{vid}", token=alice).body
        s.check(
            r.status == 404 and unchanged == after,
            "other dealership cannot update vehicle, data unchanged",
            f"HTTP {r.status}",
        )

        # Stale edit conflict: Bob submits from the version before Alice's update.
        r = s.call(
            "PUT",
            f"/api/vehicles/{vid}",
            token=bob,
            body={**original, "model": "Stale Edit", "version": v0},
        )
        unchanged = s.call("GET", f"/api/vehicles/{vid}", token=alice).body
        s.check(
            r.status == 409 and code_of(r) == "version_conflict" and unchanged == after,
            "stale edit gets 409, newer update kept",
            f"HTTP {r.status}",
        )
    finally:
        # Restore the original values on top of whatever the current version is.
        current = s.call("GET", f"/api/vehicles/{vid}", token=alice).body
        r = s.call(
            "PUT",
            f"/api/vehicles/{vid}",
            token=alice,
            body={**original, "version": current["version"]},
        )
        s.check(
            r.status == 200 and editable(r.body) == original,
            "test data restored",
            f"HTTP {r.status}",
        )

    # Logout revokes the token
    r = s.call("POST", "/api/auth/logout", token=victor)
    reuse = s.call("GET", "/api/auth/me", token=victor)
    s.check(
        r.status == 204 and reuse.status == 401 and code_of(reuse) == "token_revoked",
        "logout revokes token server-side",
        f"logout HTTP {r.status}, reuse HTTP {reuse.status}",
    )
    for token in (alice, bob, sara):
        s.call("POST", "/api/auth/logout", token=token)

    return summary(s)


def summary(s: Smoke) -> int:
    failed = [name for ok, name, _ in s.results if not ok]
    print(f"\n{len(s.results) - len(failed)}/{len(s.results)} checks passed")
    if failed:
        print("FAILED: " + "; ".join(failed))
        return 1
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(2)
    sys.exit(run(sys.argv[1]))
