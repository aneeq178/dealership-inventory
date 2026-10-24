"""Cloudflare Python Worker entrypoint.

The FastAPI app in backend/app runs unchanged. At deploy time CI copies backend/app to
cloudflare/src/app (Cloudflare uploads every .py file under this src/ folder), and this module
swaps three dependencies for Worker-native versions:

- get_conn / db_ping: one asyncpg connection per request through the HYPERDRIVE binding
  (Hyperdrive keeps the pooled connections to Postgres; there is no in-process pool).
- get_settings: built from the Worker's env (secrets + vars), not os.environ or a .env file.

Static pages are not served from here: wrangler routes only /api/* to this Worker
(run_worker_first) and serves the Next.js build as static assets.

Nothing below reads secrets at import time: Cloudflare imports this module at deploy time to
snapshot it, before any request (and therefore any env) exists.
"""

from collections.abc import AsyncIterator
from typing import Any

import asyncpg
from fastapi import Request
from workers import asgi  # provided by the Workers runtime

from app.core.config import Settings, get_settings
from app.core.db import db_ping, get_conn
from app.main import AppOptions, create_app

_settings: Settings | None = None


def _env(request: Request) -> Any:
    return request.scope["env"]


def worker_settings(request: Request) -> Settings:
    """Settings from Worker secrets and vars, built once per isolate."""
    global _settings
    if _settings is None:
        env = _env(request)
        _settings = Settings(
            # Unused on Workers (connections come from HYPERDRIVE) but required by Settings.
            database_url="postgresql://via-hyperdrive-binding",
            jwt_secret=str(env.JWT_SECRET),
            access_token_ttl_minutes=int(str(env.ACCESS_TOKEN_TTL_MINUTES)),
            password_hash_iterations=int(str(env.PASSWORD_HASH_ITERATIONS)),
            app_version=str(env.APP_VERSION),
        )
    return _settings


async def _connect(request: Request) -> asyncpg.Connection:
    hd = _env(request).HYPERDRIVE
    return await asyncpg.connect(
        host=hd.host,
        port=int(hd.port),
        user=hd.user,
        password=hd.password,
        database=hd.database,
        ssl=False,  # Worker -> Hyperdrive stays inside Cloudflare; Hyperdrive -> Neon uses TLS
        statement_cache_size=0,  # connection is per request; nothing to cache
    )


async def hyperdrive_conn(request: Request) -> AsyncIterator[asyncpg.Connection]:
    conn = await _connect(request)
    try:
        yield conn
    finally:
        await conn.close()


async def hyperdrive_ping(request: Request) -> bool:
    try:
        conn = await _connect(request)
    except Exception:
        return False
    try:
        await conn.fetchval("SELECT 1")
        return True
    except Exception:
        return False
    finally:
        await conn.close()


app = create_app(AppOptions(manage_pool=False))
app.dependency_overrides[get_conn] = hyperdrive_conn
app.dependency_overrides[db_ping] = hyperdrive_ping
app.dependency_overrides[get_settings] = worker_settings

Default = asgi.entrypoint(app)
