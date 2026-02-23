"""
CoinGecko API client with in-memory cache and rate limiting (30 req/min when no API key).
"""
from __future__ import annotations

import logging
import time
from collections import deque
from datetime import date, datetime
from typing import Any

import requests

from config import settings

logger = logging.getLogger(__name__)

# Rate limit: 30 requests per minute for public API
RATE_LIMIT_PER_MINUTE = 30
PRICE_CACHE_TTL_SECONDS = 10 * 60  # 10 minutes
CHART_CACHE_TTL_SECONDS = 15 * 60  # 15 minutes


class RateLimiter:
    """Sliding window: at most N requests per 60 seconds."""

    def __init__(self, max_per_minute: int = RATE_LIMIT_PER_MINUTE):
        self._max = max_per_minute
        self._timestamps: deque[float] = deque()

    def acquire(self) -> None:
        now = time.monotonic()
        cutoff = now - 60.0
        while self._timestamps and self._timestamps[0] < cutoff:
            self._timestamps.popleft()
        if len(self._timestamps) >= self._max:
            sleep_for = self._timestamps[0] + 60.0 - now
            if sleep_for > 0:
                logger.warning("CoinGecko rate limit: sleeping %.1fs", sleep_for)
                time.sleep(sleep_for)
            self._timestamps.popleft()
        self._timestamps.append(now)


_rate_limiter = RateLimiter()


class CoinGeckoCache:
    """Simple TTL cache for price and chart responses."""

    def __init__(self, ttl_seconds: int):
        self._ttl = ttl_seconds
        self._data: dict[str, tuple[float, Any]] = {}

    def get(self, key: str) -> Any | None:
        now = time.time()
        if key in self._data:
            ts, value = self._data[key]
            if now - ts < self._ttl:
                return value
            del self._data[key]
        return None

    def set(self, key: str, value: Any) -> None:
        self._data[key] = (time.time(), value)


_price_cache = CoinGeckoCache(PRICE_CACHE_TTL_SECONDS)
_chart_cache = CoinGeckoCache(CHART_CACHE_TTL_SECONDS)


def _request(
    path: str,
    params: dict[str, str | int] | None = None,
) -> dict[str, Any] | list[Any]:
    _rate_limiter.acquire()
    url = f"{settings.coingecko_base_url.rstrip('/')}/{path.lstrip('/')}"
    req_params = dict(params) if params else {}
    if settings.coingecko_api_key:
        req_params["x_cg_demo_api_key"] = settings.coingecko_api_key
    try:
        r = requests.get(
            url,
            params=req_params,
            timeout=settings.coingecko_timeout_seconds,
        )
        r.raise_for_status()
        return r.json()
    except requests.RequestException as e:
        logger.exception("CoinGecko request failed: %s", e)
        raise


def search_coins(query: str) -> list[dict[str, Any]]:
    """Search coins by query. Returns list of {id, name, symbol, market_cap_rank, thumb, ...}."""
    if not query or not query.strip():
        return []
    data = _request("search", params={"query": query.strip()})
    if not isinstance(data, dict):
        return []
    coins = data.get("coins") or []
    return [c for c in coins if isinstance(c, dict) and c.get("id")]


def get_simple_price(
    ids: list[str],
    vs_currencies: str = "rub",
) -> dict[str, dict[str, float]]:
    """
    Get current price for coin ids in given currency(ies).
    vs_currencies can be "rub", "usd", or "usd,rub" etc.
    Returns e.g. {"bitcoin": {"rub": 5_000_000.0}} or {"bitcoin": {"usd": 50000.0, "rub": 5_000_000.0}}
    """
    if not ids:
        return {}
    cache_key = f"price:{vs_currencies}:{','.join(sorted(ids))}"
    cached = _price_cache.get(cache_key)
    if cached is not None:
        return cached
    data = _request(
        "simple/price",
        params={
            "ids": ",".join(ids),
            "vs_currencies": vs_currencies,
        },
    )
    if not isinstance(data, dict):
        return {}
    currencies = [c.strip() for c in vs_currencies.split(",") if c.strip()]
    result: dict[str, dict[str, float]] = {}
    for k, v in data.items():
        if not isinstance(v, dict):
            continue
        row = {}
        for cur in currencies:
            val = v.get(cur)
            if isinstance(val, (int, float)):
                row[cur] = float(val)
        if row:
            result[k] = row
    _price_cache.set(cache_key, result)
    return result


def get_market_chart_range(
    coin_id: str,
    from_date: date,
    to_date: date,
    vs_currency: str = "rub",
) -> list[tuple[date, float]]:
    """
    Get historical daily prices for a coin in the date range.
    Returns list of (date, price_rub) ordered by date.
    """
    from_str = from_date.isoformat()
    to_str = to_date.isoformat()
    cache_key = f"chart:{coin_id}:{vs_currency}:{from_str}:{to_str}"
    cached = _chart_cache.get(cache_key)
    if cached is not None:
        return cached
    data = _request(
        f"coins/{coin_id}/market_chart/range",
        params={
            "vs_currency": vs_currency,
            "from": from_str,
            "to": to_str,
        },
    )
    if not isinstance(data, dict):
        return []
    prices_raw = data.get("prices") or []
    result: list[tuple[date, float]] = []
    for pair in prices_raw:
        if not isinstance(pair, (list, tuple)) or len(pair) < 2:
            continue
        ts_ms, price = pair[0], pair[1]
        try:
            dt = datetime.utcfromtimestamp(int(ts_ms) / 1000.0)
            d = dt.date()
            if from_date <= d <= to_date and isinstance(price, (int, float)):
                result.append((d, float(price)))
        except (ValueError, TypeError, OSError):
            continue
    result.sort(key=lambda x: x[0])
    _chart_cache.set(cache_key, result)
    return result


def get_coin_by_id(coin_id: str) -> dict[str, Any] | None:
    """Fetch minimal coin metadata by id (for resolve)."""
    try:
        data = _request(f"coins/{coin_id}", params={"localization": "false", "tickers": "false", "community_data": "false", "developer_data": "false"})
        if isinstance(data, dict) and data.get("id"):
            return data
    except Exception:
        pass
    return None
