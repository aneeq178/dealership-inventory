"""Login, logout, and every way an access token can be missing or invalid."""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import asyncpg
import httpx
import jwt

from app.core.config import get_settings
from scripts.seed import SEED_PASSWORD

from .helpers import Accounts as A
from .helpers import error_code

ME = "/api/auth/me"


async def test_login_valid_returns_token_and_user(client: httpx.AsyncClient) -> None:
    resp = await client.post(
        "/api/auth/login", json={"email": A.NORTH_ADMIN_1, "password": SEED_PASSWORD}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]
    assert body["user"]["email"] == A.NORTH_ADMIN_1
    assert body["user"]["role"] == "admin"
    assert body["user"]["dealership"]["name"] == "Northside Motors"
    assert "password_hash" not in resp.text


async def test_login_email_is_case_insensitive(client: httpx.AsyncClient) -> None:
    resp = await client.post(
        "/api/auth/login", json={"email": A.NORTH_ADMIN_1.upper(), "password": SEED_PASSWORD}
    )
    assert resp.status_code == 200


async def test_login_wrong_password_rejected(client: httpx.AsyncClient) -> None:
    resp = await client.post(
        "/api/auth/login", json={"email": A.NORTH_ADMIN_1, "password": "wrong-password"}
    )
    assert resp.status_code == 401
    assert error_code(resp) == "invalid_credentials"
    assert "access_token" not in resp.text


async def test_login_unknown_email_gets_same_error(client: httpx.AsyncClient) -> None:
    resp = await client.post(
        "/api/auth/login", json={"email": "nobody@nowhere.test", "password": SEED_PASSWORD}
    )
    assert resp.status_code == 401
    assert error_code(resp) == "invalid_credentials"


async def test_login_missing_fields_is_validation_error(client: httpx.AsyncClient) -> None:
    resp = await client.post("/api/auth/login", json={"email": A.NORTH_ADMIN_1})
    assert resp.status_code == 422
    assert error_code(resp) == "validation_error"


async def test_me_returns_current_user(client: httpx.AsyncClient, north_viewer: dict) -> None:
    resp = await client.get(ME, headers=north_viewer)
    assert resp.status_code == 200
    assert resp.json()["role"] == "viewer"


async def test_missing_token_rejected(client: httpx.AsyncClient) -> None:
    resp = await client.get(ME)
    assert resp.status_code == 401
    assert error_code(resp) == "unauthenticated"
    assert resp.headers["www-authenticate"] == "Bearer"


async def test_garbage_token_rejected(client: httpx.AsyncClient) -> None:
    resp = await client.get(ME, headers={"Authorization": "Bearer not-a-jwt"})
    assert resp.status_code == 401
    assert error_code(resp) == "invalid_token"


async def test_token_signed_with_other_secret_rejected(client: httpx.AsyncClient) -> None:
    forged = jwt.encode(
        {"sub": str(uuid4()), "sid": str(uuid4()), "exp": datetime.now(UTC) + timedelta(hours=1)},
        "attacker-controlled-secret-0123456789abcdef",
        algorithm="HS256",
    )
    resp = await client.get(ME, headers={"Authorization": f"Bearer {forged}"})
    assert resp.status_code == 401
    assert error_code(resp) == "invalid_token"


async def test_expired_jwt_rejected(client: httpx.AsyncClient, north_admin: dict) -> None:
    # Re-sign the real token's claims with an exp in the past.
    token = north_admin["Authorization"].removeprefix("Bearer ")
    claims = jwt.decode(token, options={"verify_signature": False})
    claims["exp"] = int((datetime.now(UTC) - timedelta(minutes=1)).timestamp())
    expired = jwt.encode(claims, get_settings().jwt_secret, algorithm="HS256")
    resp = await client.get(ME, headers={"Authorization": f"Bearer {expired}"})
    assert resp.status_code == 401
    assert error_code(resp) == "token_expired"


async def test_expired_session_rejected(
    client: httpx.AsyncClient, db: asyncpg.Connection, north_admin: dict
) -> None:
    # Server-side expiry: the session row expires even though the JWT exp has not passed.
    await db.execute("UPDATE sessions SET expires_at = now() - interval '1 second'")
    resp = await client.get(ME, headers=north_admin)
    assert resp.status_code == 401
    assert error_code(resp) == "token_expired"


async def test_logout_revokes_token(client: httpx.AsyncClient, north_admin: dict) -> None:
    assert (await client.get(ME, headers=north_admin)).status_code == 200

    resp = await client.post("/api/auth/logout", headers=north_admin)
    assert resp.status_code == 204

    # Same token, still before its JWT exp, is now rejected.
    resp = await client.get(ME, headers=north_admin)
    assert resp.status_code == 401
    assert error_code(resp) == "token_revoked"


async def test_logout_only_revokes_that_session(client: httpx.AsyncClient) -> None:
    from .helpers import login_headers

    first = await login_headers(client, A.NORTH_ADMIN_1)
    second = await login_headers(client, A.NORTH_ADMIN_1)
    await client.post("/api/auth/logout", headers=first)
    assert (await client.get(ME, headers=first)).status_code == 401
    assert (await client.get(ME, headers=second)).status_code == 200


async def test_deleted_session_rejected(
    client: httpx.AsyncClient, db: asyncpg.Connection, north_admin: dict
) -> None:
    await db.execute("DELETE FROM sessions")
    resp = await client.get(ME, headers=north_admin)
    assert resp.status_code == 401
    assert error_code(resp) == "invalid_token"
