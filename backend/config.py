from pydantic_settings import BaseSettings, SettingsConfigDict

# Docker Compose публикует PostgreSQL на порту 5432 (см. docker-compose.yml)
DEFAULT_DATABASE_URL = "postgresql://finapp:finapp@localhost:5432/finapp"

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    database_url: str = DEFAULT_DATABASE_URL

    auth_secret: str = "dev-secret-change-me"
    public_base_url: str = "http://localhost:8000"
    moex_base_url: str = "https://iss.moex.com/iss"
    moex_timeout_seconds: int = 20

    # CoinGecko (optional API key; without key: 30 req/min limit)
    coingecko_base_url: str = "https://api.coingecko.com/api/v3"
    coingecko_api_key: str | None = None
    coingecko_timeout_seconds: int = 15

    # Telegram bot
    telegram_bot_token: str | None = None

    # YouGile
    yougile_api_key: str | None = None
    yougile_base_url: str = "https://ru.yougile.com/api-v2"
    yougile_column_id: str | None = None

settings = Settings()
