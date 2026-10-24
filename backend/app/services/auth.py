"""Login and logout."""

import asyncpg

from app.core.config import Settings
from app.core.errors import InvalidCredentials
from app.core.security import (
    burn_password_check,
    create_access_token,
    session_expiry,
    verify_password,
)
from app.repositories import sessions, users
from app.schemas.auth import DealershipOut, LoginResponse, UserOut


def to_user_out(row: asyncpg.Record) -> UserOut:
    return UserOut(
        id=row["id"],
        email=row["email"],
        name=row["name"],
        role=row["role"],
        dealership=DealershipOut(id=row["dealership_id"], name=row["dealership_name"]),
    )


async def login(
    conn: asyncpg.Connection, *, email: str, password: str, settings: Settings
) -> LoginResponse:
    user = await users.get_by_email(conn, email.strip())
    if user is None:
        # Same work as a real check, so a wrong email and a wrong password take equal time.
        await burn_password_check(password, settings.password_hash_iterations)
        raise InvalidCredentials()
    if not await verify_password(password, user["password_hash"]):
        raise InvalidCredentials()

    expires_at = session_expiry(settings.access_token_ttl_minutes)
    session_id = await sessions.create(conn, user_id=user["id"], expires_at=expires_at)
    token = create_access_token(
        user_id=user["id"],
        session_id=session_id,
        expires_at=expires_at,
        secret=settings.jwt_secret,
    )
    return LoginResponse(access_token=token, expires_at=expires_at, user=to_user_out(user))
