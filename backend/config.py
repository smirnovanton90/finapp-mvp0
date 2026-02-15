from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    database_url: str
    auth_secret: str = "dev-secret-change-me"
    public_base_url: str = "http://localhost:8000"
    moex_base_url: str = "https://iss.moex.com/iss"
    moex_timeout_seconds: int = 20

    # Telegram bot
    telegram_bot_token: str | None = None

    # YouGile
    yougile_api_key: str | None = None
    yougile_base_url: str = "https://ru.yougile.com/api-v2"
    yougile_column_id: str | None = None

settings = Settings()
