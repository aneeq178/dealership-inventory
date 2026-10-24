"""Authentication and authorization dependencies.

Every protected route depends on `current_user` (authenticated) or `require_admin`
(authenticated + admin). The returned CurrentUser is the only trusted source of the caller's
role and dealership; nothing in the request body or URL can change them.
"""

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import Settings, get_settings
from app.core.db import Conn
from app.core.errors import Forbidden, InvalidToken, TokenExpired, TokenRevoked, Unauthenticated
from app.core.security import decode_access_token
from app.repositories import users

_bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class CurrentUser:
    id: UUID
    email: str
    name: str
    role: str
    dealership_id: UUID
    dealership_name: str
    session_id: UUID

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"


async def current_user(
    conn: Conn,
    settings: Annotated[Settings, Depends(get_settings)],
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> CurrentUser:
    # 1. A bearer token must be present.
    if credentials is None or not credentials.credentials:
        raise Unauthenticated()

    # 2. It must be a JWT we signed, not past its exp.
    try:
        claims = decode_access_token(credentials.credentials, settings.jwt_secret)
        session_id = UUID(claims["sid"])
        user_id = UUID(claims["sub"])
    except jwt.ExpiredSignatureError as exc:
        raise TokenExpired() from exc
    except (jwt.InvalidTokenError, ValueError, KeyError) as exc:
        raise InvalidToken() from exc

    # 3. Its session must still exist, be unrevoked (logout) and unexpired.
    row = await users.get_by_session(conn, session_id=session_id, user_id=user_id)
    if row is None:
        raise InvalidToken()
    if row["revoked_at"] is not None:
        raise TokenRevoked()
    if row["expires_at"] <= datetime.now(UTC):
        raise TokenExpired()

    return CurrentUser(
        id=row["id"],
        email=row["email"],
        name=row["name"],
        role=row["role"],
        dealership_id=row["dealership_id"],
        dealership_name=row["dealership_name"],
        session_id=row["session_id"],
    )


async def require_admin(
    user: Annotated[CurrentUser, Depends(current_user)],
) -> CurrentUser:
    if not user.is_admin:
        raise Forbidden("Viewers have read-only access. Only administrators can edit vehicles.")
    return user


AuthUser = Annotated[CurrentUser, Depends(current_user)]
AdminUser = Annotated[CurrentUser, Depends(require_admin)]
