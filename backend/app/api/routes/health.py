from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from app.core.config import Settings, get_settings
from app.core.db import DbReachable

router = APIRouter(tags=["health"])


@router.get("/api/health")
async def health(
    db_ok: DbReachable, settings: Annotated[Settings, Depends(get_settings)]
) -> JSONResponse:
    """Liveness plus database reachability. Exposes no configuration or secrets."""
    return JSONResponse(
        {
            "status": "ok" if db_ok else "degraded",
            "db": "ok" if db_ok else "unavailable",
            "version": settings.app_version,
        },
        status_code=200 if db_ok else 503,
    )
