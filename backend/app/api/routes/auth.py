from typing import Annotated

from fastapi import APIRouter, Depends, Response, status

from app.api.deps import AuthUser
from app.core.config import Settings, get_settings
from app.core.db import Conn
from app.repositories import sessions
from app.schemas.auth import DealershipOut, LoginRequest, LoginResponse, UserOut
from app.services import auth as auth_service

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
async def login(
    body: LoginRequest, conn: Conn, settings: Annotated[Settings, Depends(get_settings)]
) -> LoginResponse:
    return await auth_service.login(
        conn, email=body.email, password=body.password, settings=settings
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(user: AuthUser, conn: Conn) -> Response:
    """Revokes this session server-side. The same token is rejected (401) from now on."""
    await sessions.revoke(conn, user.session_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me", response_model=UserOut)
async def me(user: AuthUser) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email,
        name=user.name,
        role=user.role,  # type: ignore[arg-type]  # constrained by the DB CHECK
        dealership=DealershipOut(id=user.dealership_id, name=user.dealership_name),
    )
