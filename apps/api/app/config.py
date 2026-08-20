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

    # One uvicorn worker serves the shop, the bot and the scheduler off the same pool,
    # so the ceiling here is what the whole process can have open at once, not per-request
    # concurrency. Kept well under Postgres' default 100 connections.
    db_pool_size: int = 10
    db_max_overflow: int = 10

    telegram_bot_token: str
    telegram_bot_username: str

    # Webhook instead of polling. Off by default, and deliberately: a webhook needs a
    # public HTTPS address, which local development doesn't have. All three are required
    # together — with a url but no secret the endpoint would accept updates from anyone
    # who guessed its path, so `bot.start()` refuses the mode and stays on polling.
    telegram_use_webhook: bool = False
    telegram_webhook_url: str = ""
    telegram_webhook_secret: str = ""

    owner_phone: str
    owner_name: str

    cycle_timezone: str = "Asia/Bishkek"
    currency: str = "KGS"

    storage_driver: Literal["local"] = "local"
    upload_dir: str = "./uploads"
    public_files_base_url: str = "http://localhost:3001/files"

    scheduler_enabled: bool = True
    scheduler_interval_seconds: int = 300

    # Per-caller HTTP budgets (see app/common/rate_limit.py). The general one is sized for
    # a page of catalog plus its images, the strict one for signing in — which is a handful
    # of calls, and the only anonymous surface here that writes to the database.
    rate_limit_enabled: bool = True
    rate_limit_per_minute: int = 300
    rate_limit_auth_per_minute: int = 20
    # Whether `X-Forwarded-For` may be believed. True because the API is meant to sit
    # behind the website's proxy, where it is the only thing that tells two visitors
    # apart; turn it off if the API is ever reachable directly, since the header is then
    # attacker-chosen and would hand every caller unlimited identities.
    rate_limit_trust_forwarded_for: bool = True


settings = Settings()  # type: ignore[call-arg]  # fields are sourced from env/.env at runtime
