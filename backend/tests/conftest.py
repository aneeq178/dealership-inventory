"""Test fixtures.

Tests run against a real Postgres (docker-compose locally, a service container in CI), never
mocks: the behaviour under test (scoping, atomic updates) lives in SQL.

- Tests use their own database (TEST_DATABASE_URL, default `dealership_test`), created on
  demand, so running them never touches development data.
- Once per test session: drop and rebuild the schema (scripts.reset).
- Before every test: truncate and reseed, so each test starts from the same known data.
"""

import asyncio
import os
from collections.abc import AsyncIterator, Iterator

import asyncpg
import httpx
import pytest

# Pin every setting the tests depend on; real env vars beat backend/.env, so a developer's
# local .env cannot change test behaviour.
os.environ["DATABASE_URL"] = os.environ.get(
    "TEST_DATABASE_URL", "postgresql://dealer:dealer@localhost:5432/dealership_test"
)
os.environ["JWT_SECRET"] = "test-only-jwt-secret-0123456789abcdef"
# Production uses 600k PBKDF2 iterations; tests use fewer so logins are fast. Verification
# reads the iteration count from each stored hash, so the code path is identical.
os.environ["PASSWORD_HASH_ITERATIONS"] = "1000"
os.environ["CORS_ORIGINS"] = ""
os.environ["STATIC_DIR"] = ""
os.environ["APP_VERSION"] = "dev"

from app.core.config import get_settings  # noqa: E402
from app.main import create_app  # noqa: E402
from scripts.reset import ensure_database, reset  # noqa: E402
from scripts.seed import seed  # noqa: E402

from .helpers import Accounts as A  # noqa: E402
from .helpers import Headers, login_headers  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def _schema() -> Iterator[None]:
    async def run() -> None:
        await ensure_database(get_settings().database_url)
        conn = await asyncpg.connect(get_settings().database_url)
        try:
            await reset(conn)
        finally:
            await conn.close()

    asyncio.run(run())
    yield


@pytest.fixture
async def db() -> AsyncIterator[asyncpg.Connection]:
    """A direct DB connection, used to reseed and to assert what is actually stored."""
    conn = await asyncpg.connect(get_settings().database_url)
    try:
        await seed(conn)
        yield conn
    finally:
        await conn.close()


@pytest.fixture
async def client(db: asyncpg.Connection) -> AsyncIterator[httpx.AsyncClient]:
    app = create_app()
    async with app.router.lifespan_context(app):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
            yield c


@pytest.fixture
async def north_admin(client: httpx.AsyncClient) -> Headers:
    return await login_headers(client, A.NORTH_ADMIN_1)


@pytest.fixture
async def north_admin_2(client: httpx.AsyncClient) -> Headers:
    return await login_headers(client, A.NORTH_ADMIN_2)


@pytest.fixture
async def north_viewer(client: httpx.AsyncClient) -> Headers:
    return await login_headers(client, A.NORTH_VIEWER)


@pytest.fixture
async def south_admin(client: httpx.AsyncClient) -> Headers:
    return await login_headers(client, A.SOUTH_ADMIN_1)
