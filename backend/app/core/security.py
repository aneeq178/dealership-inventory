"""Password hashing and access-token signing.

Passwords: PBKDF2-HMAC-SHA256, stored as  pbkdf2_sha256$<iterations>$<salt_b64>$<hash_b64>.
The iteration count travels with each hash, so it can be raised later without invalidating
existing hashes.

Two interchangeable implementations of the same function:
- CPython (local, CI, seeding): hashlib.pbkdf2_hmac.
- Cloudflare Python Workers (Pyodide/WebAssembly): the runtime's native WebCrypto
  crypto.subtle.deriveBits. Hashing in WebAssembly would be far too slow for the free plan's
  10 ms CPU budget; WebCrypto runs natively. Both produce identical bytes for the same input
  (verified in tests/test_security.py and scripts/check_webcrypto_parity.mjs).

Tokens: HS256 JWTs carrying the user id (sub) and session id (sid). The JWT proves the
token was issued by us and is not past `exp`; the session row decides whether it is still
valid (see app.api.deps.current_user).
"""

import base64
import hashlib
import hmac
import secrets
import sys
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

import jwt

ALGORITHM = "pbkdf2_sha256"
JWT_ALGORITHM = "HS256"
_DUMMY_SALT = b"timing-equalizer"


async def _pbkdf2_webcrypto(password: bytes, salt: bytes, iterations: int) -> bytes:
    import js  # type: ignore[import-not-found]  # Pyodide only
    from pyodide.ffi import to_js  # type: ignore[import-not-found]  # Pyodide only

    subtle = js.crypto.subtle
    key = await subtle.importKey("raw", to_js(password), "PBKDF2", False, to_js(["deriveBits"]))
    params = to_js(
        {"name": "PBKDF2", "hash": "SHA-256", "salt": to_js(salt), "iterations": iterations},
        dict_converter=js.Object.fromEntries,
    )
    bits = await subtle.deriveBits(params, key, 256)
    return bytes(js.Uint8Array.new(bits).to_bytes())


def _running_on_workers() -> bool:
    # Pyodide (Cloudflare Python Workers) reports itself as emscripten.
    return sys.platform == "emscripten"


async def pbkdf2_sha256(password: bytes, salt: bytes, iterations: int) -> bytes:
    if _running_on_workers():
        return await _pbkdf2_webcrypto(password, salt, iterations)
    return hashlib.pbkdf2_hmac("sha256", password, salt, iterations)


def hash_password(password: str, iterations: int) -> str:
    """Create a new hash (seeding only, runs on CPython)."""
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


async def verify_password(password: str, stored: str) -> bool:
    try:
        algorithm, iterations, salt_b64, hash_b64 = stored.split("$")
        if algorithm != ALGORITHM:
            return False
        salt = base64.b64decode(salt_b64)
        expected = base64.b64decode(hash_b64)
        rounds = int(iterations)
    except (ValueError, TypeError):
        return False
    digest = await pbkdf2_sha256(password.encode(), salt, rounds)
    return hmac.compare_digest(digest, expected)


async def burn_password_check(password: str, iterations: int) -> None:
    """Spend the same work as a real check when the email does not exist, so wrong-email and
    wrong-password responses take the same time (prevents account enumeration by timing)."""
    await pbkdf2_sha256(password.encode(), _DUMMY_SALT, iterations)


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
