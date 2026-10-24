"""Exercise cloudflare/src/entry.py on CPython.

The Workers runtime is replaced by two small stand-ins:
- a stub `workers` module whose asgi.entrypoint returns the app unchanged;
- an ASGI wrapper that puts a fake `env` into request.scope, the way the Workers ASGI adapter
  does, with a HYPERDRIVE binding pointing at the local test database.

This proves the Worker wiring (settings from env, per-request Hyperdrive-style connections,
no lifespan pool) end to end. What it cannot prove is Pyodide itself; that is covered by
cloudflare/tests/webcrypto_parity.mjs and the post-deploy smoke test.
"""

import importlib
import os
import sys
import types
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import httpx
import pytest
from fastapi import FastAPI

from scripts.seed import SEED_PASSWORD

ENTRY_DIR = Path(__file__).resolve().parents[2] / "cloudflare" / "src"


class FakeHyperdrive:
    def __init__(self, url: str) -> None:
        u = urlparse(url)
        self.host = u.hostname
        self.port = str(u.port or 5432)
        self.user = u.username
        self.password = u.password
        self.database = u.path.lstrip("/")


class FakeEnv:
    def __init__(self) -> None:
        self.JWT_SECRET = "worker-test-jwt-secret-0123456789abcdef"
        self.ACCESS_TOKEN_TTL_MINUTES = "30"
        self.PASSWORD_HASH_ITERATIONS = "1000"
        self.APP_VERSION = "worker-test"
        self.HYPERDRIVE = FakeHyperdrive(os.environ["DATABASE_URL"])


@pytest.fixture
def worker_app(monkeypatch: pytest.MonkeyPatch) -> FastAPI:
    stub = types.ModuleType("workers")
    stub.asgi = types.SimpleNamespace(entrypoint=lambda app: app)  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "workers", stub)
    monkeypatch.syspath_prepend(str(ENTRY_DIR))
    sys.modules.pop("entry", None)
    entry = importlib.import_module("entry")
    entry._settings = None
    app: FastAPI = entry.app
    return app


@pytest.fixture
async def worker_client(worker_app: FastAPI, db: Any) -> AsyncIterator[httpx.AsyncClient]:
    env = FakeEnv()

    async def with_env(scope: dict[str, Any], receive: Any, send: Any) -> None:
        if scope["type"] == "http":
            scope = {**scope, "env": env}
        await worker_app(scope, receive, send)

    transport = httpx.ASGITransport(app=with_env)
    async with httpx.AsyncClient(transport=transport, base_url="http://worker") as client:
        yield client


async def test_worker_has_no_lifespan_pool(worker_app: FastAPI) -> None:
    assert worker_app.router.lifespan_context.__name__ != "pool_lifespan"


async def test_worker_health_uses_env(worker_client: httpx.AsyncClient) -> None:
    resp = await worker_client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok", "db": "ok", "version": "worker-test"}


async def test_worker_login_update_and_conflict(worker_client: httpx.AsyncClient) -> None:
    login = await worker_client.post(
        "/api/auth/login",
        json={"email": "alice.admin@northside.test", "password": SEED_PASSWORD},
    )
    assert login.status_code == 200, login.text
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    vehicles = (await worker_client.get("/api/vehicles", headers=headers)).json()["items"]
    camry = next(v for v in vehicles if v["stock_number"] == "N-1001")
    body = {k: camry[k] for k in ("make", "model", "year", "status", "version")}

    ok = await worker_client.put(
        f"/api/vehicles/{camry['id']}", json={**body, "model": "Worker"}, headers=headers
    )
    assert ok.status_code == 200
    stale = await worker_client.put(
        f"/api/vehicles/{camry['id']}", json={**body, "model": "Stale"}, headers=headers
    )
    assert stale.status_code == 409


async def test_worker_rejects_missing_token(worker_client: httpx.AsyncClient) -> None:
    assert (await worker_client.get("/api/vehicles")).status_code == 401
