"""Password hashing: known-answer test and round trips.

The Cloudflare Worker verifies passwords with WebCrypto instead of hashlib. Both must give the
same bytes as the standard; scripts/check_webcrypto_parity.mjs checks the WebCrypto side
against the same vector under Pyodide.
"""

import asyncpg

from app.core.security import (
    burn_password_check,
    hash_password,
    pbkdf2_sha256,
    verify_password,
)

# RFC 7914 section 11 test vector for PBKDF2-HMAC-SHA256 (first 32 bytes of the 64-byte output).
RFC7914_P = b"passwd"
RFC7914_S = b"salt"
RFC7914_DK = bytes.fromhex("55ac046e56e3089fec1691c22544b605f94185216dde0465e68b9d57c20dacbc")


async def test_pbkdf2_matches_rfc_7914_vector() -> None:
    assert await pbkdf2_sha256(RFC7914_P, RFC7914_S, 1) == RFC7914_DK


async def test_hash_round_trip() -> None:
    stored = hash_password("correct horse", 1000)
    assert stored.startswith("pbkdf2_sha256$1000$")
    assert await verify_password("correct horse", stored)
    assert not await verify_password("wrong horse", stored)


async def test_each_hash_has_its_own_salt() -> None:
    assert hash_password("same", 1000) != hash_password("same", 1000)


async def test_malformed_hash_is_rejected_not_raised() -> None:
    assert not await verify_password("x", "not-a-hash")
    assert not await verify_password("x", "bcrypt$10$abc$def")


async def test_burn_check_runs() -> None:
    await burn_password_check("anything", 1000)


async def test_seeded_users_have_individually_salted_hashes(db: asyncpg.Connection) -> None:
    # All demo accounts share one password; their stored hashes must still all differ.
    hashes = [r["password_hash"] for r in await db.fetch("SELECT password_hash FROM users")]
    assert len(hashes) == 6
    assert len(set(hashes)) == 6
    salts = {h.split("$")[2] for h in hashes}
    assert len(salts) == 6
