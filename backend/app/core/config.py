from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration, read from environment variables (or backend/.env locally)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    # HS256 needs at least 256 bits of key material (RFC 7518 3.2); refuse to start otherwise.
    jwt_secret: str = Field(min_length=32)
    access_token_ttl_minutes: int = 30
    password_hash_iterations: int = 600_000
    cors_origins: str = ""
    app_version: str = "dev"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]  # required values come from the environment
