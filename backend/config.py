from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Docker Compose публикует PostgreSQL на порту 5432 (см. docker-compose.yml)
DEFAULT_DATABASE_URL = "postgresql://finapp:finapp@localhost:5432/finapp"

_BACKEND_DIR = Path(__file__).resolve().parent
_ENV_FILE = _BACKEND_DIR / ".env"


def _parse_env_bool(v: object) -> bool:
    """Надёжный разбор bool из .env (строки 'false', '0', пробелы)."""
    if isinstance(v, bool):
        return v
    if v is None:
        return False
    s = str(v).strip().lower()
    if s in ("", "0", "false", "no", "off", "n"):
        return False
    if s in ("1", "true", "yes", "on", "y"):
        return True
    return bool(v)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore",
    )
    database_url: str = DEFAULT_DATABASE_URL

    auth_secret: str = "dev-secret-change-me"
    # Optional Fernet key (44-char urlsafe base64) for encrypting integration tokens; if unset, derived from auth_secret.
    integration_token_fernet_key: str | None = None
    tbank_invest_base_url: str = "https://invest-public-api.tbank.ru"
    tbank_invest_sandbox_base_url: str = "https://sandbox-invest-public-api.tbank.ru"
    # SSL: при корпоративном MITM укажите путь к PEM с цепочкой доверенных CA (предпочтительно).
    # Если True (по умолчанию) — стандартная проверка; False — отключить проверку (только отладка, небезопасно).
    tbank_invest_verify_ssl: bool = True
    tbank_invest_ca_bundle: str | None = None

    @field_validator("tbank_invest_verify_ssl", mode="before")
    @classmethod
    def _coerce_tbank_verify_ssl(cls, v: object) -> bool:
        if v is None:
            return True
        return _parse_env_bool(v)

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
