from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    port: int = 3001

    environment: Literal["development", "test", "production"] = "development"
    cors_origin: str = "http://localhost:3000"

    jwt_access_secret: str
    jwt_access_ttl_seconds: int = 900
    jwt_refresh_secret: str
    jwt_refresh_ttl_seconds: int = 60 * 60 * 24 * 30

    otp_ttl_seconds: int = 300
    otp_max_attempts: int = 5

    telegram_bot_token: str
    telegram_bot_username: str

    owner_phone: str
    owner_name: str
    owner_password: str

    cycle_timezone: str = "Asia/Almaty"
    currency: str = "KZT"

    storage_driver: Literal["local"] = "local"
    upload_dir: str = "./uploads"
    public_files_base_url: str = "http://localhost:3001/files"


settings = Settings()  # type: ignore[call-arg]  # fields are sourced from env/.env at runtime
