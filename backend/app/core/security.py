"""Password hashing and access-token signing.

Passwords: PBKDF2-HMAC-SHA256 from the standard library (no native extensions, so it runs on
any Python host). Stored as  pbkdf2_sha256$<iterations>$<salt_b64>$<hash_b64>  so the
iteration count can be raised later without invalidating existing hashes.

Tokens: HS256 JWTs carrying the user id (sub) and session id (sid). The JWT proves the
token was issued by us and is not past `exp`; the session row decides whether it is still
valid (see app.api.deps.current_user).
"""

import base64
import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

import jwt

ALGORITHM = "pbkdf2_sha256"
JWT_ALGORITHM = "HS256"


def hash_password(password: str, iterations: int) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, iterations)
    return "$".join(
        [
            ALGORITHM,
            str(iterations),
            base64.b64encode(salt).decode(),
            base64.b64encode(digest).decode(),
        ]
    )


def verify_password(password: str, stored: str) -> bool:
    try:
        algorithm, iterations, salt_b64, hash_b64 = stored.split("$")
        if algorithm != ALGORITHM:
            return False
        salt = base64.b64decode(salt_b64)
        expected = base64.b64decode(hash_b64)
        digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, int(iterations))
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(digest, expected)


# Verified against when the email does not exist, so a wrong email and a wrong password take
# the same time (prevents account enumeration by timing).
_DUMMY_HASH = hash_password("dummy-password", 600_000)


def burn_password_check(password: str) -> None:
    verify_password(password, _DUMMY_HASH)


def create_access_token(
    *, user_id: UUID, session_id: UUID, expires_at: datetime, secret: str
) -> str:
    payload = {
        "sub": str(user_id),
        "sid": str(session_id),
        "iat": int(datetime.now(UTC).timestamp()),
        "exp": int(expires_at.timestamp()),
    }
    return jwt.encode(payload, secret, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str, secret: str) -> dict[str, Any]:
    """Raises jwt.ExpiredSignatureError or jwt.InvalidTokenError."""
    claims: dict[str, Any] = jwt.decode(
        token, secret, algorithms=[JWT_ALGORITHM], options={"require": ["sub", "sid", "exp"]}
    )
    return claims


def session_expiry(ttl_minutes: int) -> datetime:
    return datetime.now(UTC) + timedelta(minutes=ttl_minutes)
