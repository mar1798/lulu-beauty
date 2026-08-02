from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    port: int = 3001


settings = Settings()  # type: ignore[call-arg]  # fields are sourced from env/.env at runtime
