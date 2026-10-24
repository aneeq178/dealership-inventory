from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    """Runtime configuration, read from environment variables (or backend/.env locally)."""

    # backend/.env, wherever the process is started from. Real env vars take precedence.
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", extra="ignore")

    database_url: str
    # HS256 needs at least 256 bits of key material (RFC 7518 3.2); refuse to start otherwise.
    jwt_secret: str = Field(min_length=32)
    access_token_ttl_minutes: int = 30
    password_hash_iterations: int = 600_000
    cors_origins: str = ""
    app_version: str = "dev"
    # Optional path to a built frontend (frontend/out). When set, it is served at "/" on the
    # same origin as the API. Used for local E2E tests; production serves it from Cloudflare.
    static_dir: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]  # required values come from the environment
