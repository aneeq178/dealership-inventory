"""Application factory.

Local / CI:   uvicorn app.main:create_app --factory
Cloudflare:   cloudflare/src/entry.py calls create_app(AppOptions(manage_pool=False)) and
              swaps the database and settings dependencies for Worker-native ones.

Nothing here reads configuration at import time, because on Cloudflare the module is imported
(and snapshotted) at deploy time, before any secrets are available.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.routes import auth, health, vehicles
from app.core.config import Settings, get_settings
from app.core.db import create_pool
from app.core.errors import install_error_handlers

logging.basicConfig(level=logging.INFO)


@dataclass(frozen=True)
class AppOptions:
    """Build-time options. Request-time settings (secrets, DB) come from dependencies."""

    cors_origins: tuple[str, ...] = ()
    static_dir: str = ""
    # True for long-running servers: open a connection pool in the lifespan.
    # False on Cloudflare, where each request connects through Hyperdrive instead.
    manage_pool: bool = True

    @classmethod
    def from_settings(cls, settings: Settings) -> AppOptions:
        return cls(cors_origins=tuple(settings.cors_origin_list), static_dir=settings.static_dir)


@asynccontextmanager
async def pool_lifespan(app: FastAPI) -> AsyncIterator[None]:
    app.state.pool = await create_pool(get_settings().database_url)
    try:
        yield
    finally:
        await app.state.pool.close()


def create_app(options: AppOptions | None = None) -> FastAPI:
    opts = options or AppOptions.from_settings(get_settings())
    app = FastAPI(
        title="Dealership Inventory API",
        version="1.0.0",
        lifespan=pool_lifespan if opts.manage_pool else None,
    )

    if opts.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=list(opts.cors_origins),
            allow_methods=["GET", "POST", "PUT", "OPTIONS"],
            allow_headers=["Authorization", "Content-Type"],
        )

    install_error_handlers(app)
    app.include_router(health.router)
    app.include_router(auth.router)
    app.include_router(vehicles.router)

    if opts.static_dir:
        # Mounted last so every /api route above takes precedence.
        app.mount("/", StaticFiles(directory=opts.static_dir, html=True), name="frontend")
    return app
