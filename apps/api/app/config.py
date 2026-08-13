from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    port: int = 3001

    environment: Literal["development", "test", "production"] = "development"
    cors_origin: str = "http://localhost:3000"
    # Where the bot's link buttons point. Same host as cors_origin in practice, but kept
    # apart on purpose: one is a security boundary, the other is a public address, and
    # the day the site sits behind a CDN they stop being the same string.
    website_base_url: str = "http://localhost:3000"

    jwt_access_secret: str
    jwt_access_ttl_seconds: int = 900
    jwt_refresh_secret: str
    jwt_refresh_ttl_seconds: int = 60 * 60 * 24 * 30

    # A sign-in link is meant to be opened right away; five minutes covers "let me find
    # my phone" without leaving a working key lying around in a chat.
    auth_session_ttl_seconds: int = 300

    telegram_bot_token: str
    telegram_bot_username: str

    owner_phone: str
    owner_name: str

    cycle_timezone: str = "Asia/Bishkek"
    currency: str = "KGS"

    storage_driver: Literal["local"] = "local"
    upload_dir: str = "./uploads"
    public_files_base_url: str = "http://localhost:3001/files"

    scheduler_enabled: bool = True
    scheduler_interval_seconds: int = 300


settings = Settings()  # type: ignore[call-arg]  # fields are sourced from env/.env at runtime
