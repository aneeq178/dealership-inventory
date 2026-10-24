import httpx


async def test_health_reports_db_ok(client: httpx.AsyncClient) -> None:
    resp = await client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok", "db": "ok", "version": "dev"}


async def test_health_exposes_no_secrets(client: httpx.AsyncClient) -> None:
    text = (await client.get("/api/health")).text.lower()
    for forbidden in ("secret", "password", "postgresql://", "dealer:dealer", "jwt"):
        assert forbidden not in text
