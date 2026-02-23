from datetime import datetime, timedelta, date
from typing import Any

import requests
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, text
from sqlalchemy.orm import Session
from sqlalchemy.exc import ProgrammingError

from auth import get_current_user
from config import settings
from db import get_db
from market_utils import CRYPTO_BOARD_ID, MOEX_TYPE_CODES, is_crypto_type, is_moex_type
from models import MarketInstrument, MarketPrice, User
from coingecko import (
    get_coin_by_id,
    get_market_chart_range,
    get_simple_price,
    search_coins,
)
from schemas import (
    MarketBoardOut,
    MarketInstrumentDetailsOut,
    MarketInstrumentOut,
    MarketPriceOut,
)

router = APIRouter(prefix="/market", tags=["market"])

_PRICE_CACHE: dict[str, tuple[datetime, MarketPriceOut]] = {}
_PRICE_CACHE_TTL = timedelta(minutes=15)

# Популярные криптовалюты: русское название по CoinGecko id (для отображения «Код — название»)
COIN_ID_TO_RU: dict[str, str] = {
    "bitcoin": "Биткоин",
    "ethereum": "Эфириум",
    "tether": "Тезер",
    "binancecoin": "Бинанс Коин",
    "solana": "Солана",
    "ripple": "Рипл",
    "usd-coin": "USD Coin",
    "cardano": "Кардано",
    "dogecoin": "Догикоин",
    "avalanche-2": "Аваланч",
    "polkadot": "Полкадот",
    "chainlink": "Чейнлинк",
    "tron": "Трон",
    "shiba-inu": "Шиба Ину",
    "litecoin": "Лайткоин",
    "bitcoin-cash": "Биткоин Кэш",
    "uniswap": "Юнисвап",
    "stellar": "Стеллар",
    "monero": "Монеро",
    "cosmos": "Космос",
    "ethereum-classic": "Эфириум Классик",
    "aptos": "Аптос",
    "filecoin": "Файлкоин",
    "hedera-hashgraph": "Хедера",
    "internet-computer": "Интернет Компьютер",
    "arbitrum": "Арбитрум",
    "optimism": "Оптимизм",
    "immutable-x": "Иммутабл",
    "near": "NEAR",
    "matic-network": "Полигон",
    "quant-network": "Квант",
    "aave": "Аавэ",
    "maker": "Мейкер",
    "the-graph": "Граф",
    "algorand": "Алгоранд",
    "vechain": "Ветчейн",
    "axie-infinity": "Экси Инфинити",
    "eos": "EOS",
    "tezos": "Теzos",
    "flow": "Флоу",
    "theta-network": "Тета",
    "elrond-erd-2": "МультиверсX",
    "pancakeswap-token": "ПанкейкСвап",
    "klay-token": "Клайтон",
    "neo": "Нео",
    "kucoin-shares": "Кукоин Шерс",
    "curve-dao-token": "Керв",
    "rocket-pool-eth": "Рокет Пул",
    "true-usd": "TrueUSD",
    "gatechain-token": "Гейт",
    "gemini-dollar": "Джемini Доллар",
    "frax": "Фракс",
    "usdd": "USDD",
    "tokenize-xchange": "Токениз",
    "whitebit": "Вайтбит",
    "paxos-standard": "Pax Dollar",
    "first-digital-usd": "First Digital USD",
    "dai": "Dai",
    "leo-token": "LEO",
    "wrapped-bitcoin": "Обёрнутый Биткоин",
    "staked-ether": "Стейкированный Эфир",
    "okb": "OKB",
    "crypto-com-chain": "Кронос",
}


def _table_rows(payload: dict[str, Any], key: str) -> list[dict[str, Any]]:
    block = payload.get(key) or {}
    columns = block.get("columns") or []
    rows = block.get("data") or []
    return [dict(zip(columns, row)) for row in rows]


def _description_map(payload: dict[str, Any]) -> dict[str, Any]:
    block = payload.get("description") or {}
    rows = block.get("data") or []
    result: dict[str, Any] = {}
    for row in rows:
        if len(row) < 3:
            continue
        key = row[0]
        if key is None:
            continue
        result[str(key)] = row[2]
    return result


def _to_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _to_cents(value: Any) -> int | None:
    num = _to_float(value)
    if num is None:
        return None
    return int(round(num * 100))


def _to_bp(value: Any) -> int | None:
    num = _to_float(value)
    if num is None:
        return None
    return int(round(num * 100))


def _normalize_text(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        cleaned = value.strip()
        return cleaned or None
    return str(value)


def _normalize_currency_code(value: Any) -> str | None:
    code = _normalize_text(value)
    if not code:
        return None
    if code in {"SUR", "RUR"}:
        return "RUB"
    return code


def _get_field(row: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in row:
            return row[key]
        lower = key.lower()
        if lower in row:
            return row[lower]
        upper = key.upper()
        if upper in row:
            return row[upper]
    return None


def _map_moex_type(row: dict[str, Any]) -> str | None:
    raw = _get_field(row, "TYPE", "GROUP", "SECTYPE", "SEC_TYPE") or ""
    if not isinstance(raw, str):
        raw = str(raw)
    raw = raw.strip().lower()
    if not raw:
        return None
    if "bond" in raw:
        return "bonds"
    if "etf" in raw:
        return "etf"
    if "bpif" in raw:
        return "bpif"
    if "pif" in raw:
        return "pif"
    if "metal" in raw or "metall" in raw:
        return "precious_metals"
    if (
        "stock" in raw
        or "share" in raw
        or "equity" in raw
        or "depositary" in raw
        or "receipt" in raw
        or raw in {"dr", "adr", "gdr"}
    ):
        return "securities"
    return None


def _parse_bool(value: Any) -> bool | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"true", "1", "yes", "y"}:
            return True
        if lowered in {"false", "0", "no", "n"}:
            return False
    return None


def _moex_get(path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
    response = requests.get(
        f"{settings.moex_base_url.rstrip('/')}/{path.lstrip('/')}",
        params=params,
        timeout=settings.moex_timeout_seconds,
    )
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, dict):
        raise HTTPException(status_code=502, detail="Unexpected MOEX response")
    return payload


def _fetch_instrument_details(secid: str) -> tuple[dict[str, Any], list[MarketBoardOut]]:
    payload = _moex_get(
        f"securities/{secid}.json",
        params={"iss.meta": "off"},
    )
    securities_rows = _table_rows(payload, "securities")
    if securities_rows:
        security = securities_rows[0]
    else:
        description = _description_map(payload)
        if not description:
            raise HTTPException(status_code=404, detail="Instrument not found")
        security = description

    marketdata_rows = _table_rows(payload, "marketdata")
    marketdata = marketdata_rows[0] if marketdata_rows else {}

    boards_rows = _table_rows(payload, "boards")
    if not boards_rows:
        try:
            boards_payload = _moex_get(
                f"securities/{secid}/boards.json", params={"iss.meta": "off"}
            )
        except requests.RequestException:
            boards_payload = {}
        boards_rows = _table_rows(boards_payload, "boards")
    boards: list[MarketBoardOut] = []
    boards_is_traded = False
    for row in boards_rows:
        if _parse_bool(_get_field(row, "IS_TRADED")):
            boards_is_traded = True
        boards.append(
            MarketBoardOut(
                board_id=_normalize_text(_get_field(row, "BOARDID", "BOARD_ID")) or "",
                title=_normalize_text(_get_field(row, "TITLE")),
                engine=_normalize_text(_get_field(row, "ENGINE")),
                market=_normalize_text(_get_field(row, "MARKET")),
                currency_code=_normalize_currency_code(
                    _get_field(row, "CURRENCYID", "CURRENCY")
                ),
                is_primary=_parse_bool(_get_field(row, "IS_PRIMARY", "PRIMARY")),
            )
        )

    default_board_id = _normalize_text(
        _get_field(marketdata, "MARKETPRICE_BOARDID")
        or _get_field(security, "PRIMARY_BOARDID")
    )
    if not default_board_id:
        for board in boards:
            if board.is_primary:
                default_board_id = board.board_id
                break
    if not default_board_id and boards:
        default_board_id = boards[0].board_id

    details = {
        "secid": secid,
        "isin": _normalize_text(_get_field(security, "ISIN")),
        "short_name": _normalize_text(_get_field(security, "SHORTNAME")),
        "name": _normalize_text(_get_field(security, "NAME", "SECNAME")),
        "type_code": _map_moex_type(security),
        "engine": _normalize_text(_get_field(security, "ENGINE")),
        "market": _normalize_text(_get_field(security, "MARKET")),
        "default_board_id": default_board_id,
        "currency_code": _normalize_currency_code(_get_field(security, "CURRENCYID")),
        "lot_size": _get_field(security, "LOTSIZE"),
        "face_value_cents": _to_cents(_get_field(security, "FACEVALUE")),
        "is_traded": _parse_bool(_get_field(security, "IS_TRADED", "IS_TRADING")),
    }
    if not details["engine"] or not details["market"]:
        for board in boards:
            if board.board_id == default_board_id:
                details["engine"] = details["engine"] or board.engine
                details["market"] = details["market"] or board.market
                break
    if not details["currency_code"]:
        for board in boards:
            if board.board_id == default_board_id:
                details["currency_code"] = _normalize_currency_code(board.currency_code)
                break
    if details["is_traded"] is None and boards:
        details["is_traded"] = boards_is_traded
    return details, boards


def _upsert_instrument(db: Session, details: dict[str, Any]) -> MarketInstrument:
    instrument = db.get(MarketInstrument, details["secid"])
    if not instrument:
        instrument = MarketInstrument(secid=details["secid"])
    instrument.provider = "MOEX"
    instrument.isin = details.get("isin")
    instrument.short_name = details.get("short_name")
    instrument.name = details.get("name")
    instrument.type_code = details.get("type_code")
    instrument.engine = details.get("engine")
    instrument.market = details.get("market")
    instrument.default_board_id = details.get("default_board_id")
    instrument.currency_code = details.get("currency_code")
    instrument.lot_size = details.get("lot_size")
    instrument.face_value_cents = details.get("face_value_cents")
    instrument.is_traded = details.get("is_traded")
    db.add(instrument)
    db.commit()
    db.refresh(instrument)
    return instrument


def _upsert_coingecko_instrument(db: Session, coin: dict[str, Any]) -> MarketInstrument:
    secid = (coin.get("id") or "").strip().lower()
    if not secid:
        raise HTTPException(status_code=400, detail="Invalid coin id")
    instrument = db.get(MarketInstrument, secid)
    if not instrument:
        instrument = MarketInstrument(secid=secid)
    instrument.provider = "COINGECKO"
    instrument.isin = None
    symbol = (coin.get("symbol") or secid).strip().upper()
    name_en = _normalize_text(coin.get("name")) or secid
    instrument.short_name = symbol
    instrument.name = COIN_ID_TO_RU.get(secid, name_en)
    instrument.type_code = "crypto"
    instrument.engine = None
    instrument.market = None
    instrument.default_board_id = CRYPTO_BOARD_ID
    instrument.currency_code = "RUB"
    instrument.lot_size = None
    instrument.face_value_cents = None
    instrument.is_traded = True
    db.add(instrument)
    db.commit()
    db.refresh(instrument)
    return instrument


def resolve_coingecko_instrument(
    db: Session, coingecko_id: str
) -> tuple[MarketInstrument, list[MarketBoardOut], dict[str, Any]]:
    coin = get_coin_by_id(coingecko_id)
    if not coin:
        raise HTTPException(status_code=404, detail="Coin not found")
    instrument = _upsert_coingecko_instrument(db, coin)
    boards = [
        MarketBoardOut(
            board_id=CRYPTO_BOARD_ID,
            title="Crypto",
            engine=None,
            market=None,
            currency_code="RUB",
            is_primary=True,
        )
    ]
    details = {
        "secid": instrument.secid,
        "short_name": instrument.short_name,
        "name": instrument.name,
        "type_code": "crypto",
        "default_board_id": CRYPTO_BOARD_ID,
        "currency_code": "RUB",
    }
    return instrument, boards, details


def resolve_market_instrument(
    db: Session, secid: str
) -> tuple[MarketInstrument, list[MarketBoardOut], dict[str, Any]]:
    details, boards = _fetch_instrument_details(secid)
    instrument = _upsert_instrument(db, details)
    return instrument, boards, details


def _select_board_id(board_id: str | None, instrument: MarketInstrument, boards: list[MarketBoardOut]) -> str:
    if board_id:
        return board_id
    if instrument.default_board_id:
        return instrument.default_board_id
    if boards:
        return boards[0].board_id
    raise HTTPException(status_code=400, detail="Board id is required")


def _fetch_latest_price(
    secid: str,
    board_id: str,
    engine: str | None = None,
    market: str | None = None,
) -> tuple[date, MarketPriceOut]:
    payload = _moex_get(
        f"securities/{secid}.json",
        params={"iss.meta": "off", "iss.only": "marketdata", "board": board_id},
    )
    rows = _table_rows(payload, "marketdata")
    if not rows and engine and market:
        payload = _moex_get(
            f"engines/{engine}/markets/{market}/boards/{board_id}/securities/{secid}.json",
            params={"iss.meta": "off", "iss.only": "marketdata"},
        )
        rows = _table_rows(payload, "marketdata")
    if not rows:
        raise HTTPException(status_code=404, detail="Price not available")
    row = rows[0]
    trade_date = _normalize_text(row.get("TRADEDATE") or row.get("TRADDATE"))
    if trade_date:
        try:
            price_date = datetime.strptime(trade_date, "%Y-%m-%d").date()
        except ValueError:
            price_date = datetime.utcnow().date()
    else:
        price_date = datetime.utcnow().date()

    price_value = (
        row.get("LAST")
        or row.get("LCURRENTPRICE")
        or row.get("MARKETPRICE")
        or row.get("CLOSE")
        or row.get("CLOSEPRICE")
        or row.get("WAPRICE")
    )
    accint_value = row.get("ACCINT")
    yield_value = row.get("YIELD")

    price_out = MarketPriceOut(
        instrument_id=secid,
        board_id=board_id,
        price_date=price_date,
        price_time=None,
        price_cents=_to_cents(price_value),
        price_percent_bp=_to_bp(price_value),
        accint_cents=_to_cents(accint_value),
        yield_bp=_to_bp(yield_value),
        currency_code=_normalize_currency_code(_get_field(row, "CURRENCYID")),
    )
    return price_date, price_out


def _apply_bond_price(price_out: MarketPriceOut, face_value_cents: int | None) -> None:
    if price_out.price_percent_bp is not None:
        if face_value_cents is not None:
            price_out.price_cents = int(
                round(face_value_cents * price_out.price_percent_bp / 10000)
            )
        else:
            price_out.price_cents = None
    price_out.price_percent_bp = None


def _coingecko_search_to_instruments(q: str, limit: int) -> list[MarketInstrumentOut]:
    coins = search_coins(q)[:limit]
    result: list[MarketInstrumentOut] = []
    for c in coins:
        coin_id = c.get("id")
        if not coin_id:
            continue
        symbol = (c.get("symbol") or coin_id).strip().upper()
        name_en = _normalize_text(c.get("name")) or coin_id
        name_ru = COIN_ID_TO_RU.get(coin_id, name_en)
        result.append(
            MarketInstrumentOut(
                secid=coin_id,
                provider="COINGECKO",
                isin=None,
                short_name=symbol,
                name=name_ru,
                type_code="crypto",
                engine=None,
                market=None,
                default_board_id=CRYPTO_BOARD_ID,
                currency_code="RUB",
                lot_size=None,
                face_value_cents=None,
                is_traded=True,
            )
        )
    return result


@router.get("/instruments", response_model=list[MarketInstrumentOut])
def search_instruments(
    q: str | None = None,
    type_code: str | None = None,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if is_crypto_type(type_code or ""):
        query = (q or "").strip()
        instruments = _coingecko_search_to_instruments(query or " ", limit)
        return instruments[offset : offset + limit]

    params: dict[str, Any] = {"iss.meta": "off", "limit": limit, "start": offset}
    if q:
        params["q"] = q
    payload = _moex_get("securities.json", params=params)
    rows = _table_rows(payload, "securities")

    candidates: list[dict[str, Any]] = []
    for row in rows:
        secid = _normalize_text(_get_field(row, "SECID"))
        if not secid:
            continue
        mapped_type = _map_moex_type(row)
        if type_code and is_moex_type(type_code) and mapped_type != type_code:
            continue
        isin = _normalize_text(_get_field(row, "ISIN"))
        marketprice_boardid = _normalize_text(_get_field(row, "MARKETPRICE_BOARDID"))
        is_traded = _parse_bool(_get_field(row, "IS_TRADED", "IS_TRADING")) or False
        score = (2 if is_traded else 0) + (1 if marketprice_boardid else 0)
        candidates.append(
            {
                "key": isin or secid,
                "score": score,
                "item": MarketInstrumentOut(
                    secid=secid,
                    provider="MOEX",
                    isin=isin,
                    short_name=_normalize_text(_get_field(row, "SHORTNAME")),
                    name=_normalize_text(_get_field(row, "NAME", "SECNAME")),
                    type_code=mapped_type,
                    engine=_normalize_text(_get_field(row, "ENGINE")),
                    market=_normalize_text(_get_field(row, "MARKET")),
                default_board_id=_normalize_text(_get_field(row, "PRIMARY_BOARDID")),
                currency_code=_normalize_currency_code(_get_field(row, "CURRENCYID")),
                lot_size=_get_field(row, "LOTSIZE"),
                face_value_cents=_to_cents(_get_field(row, "FACEVALUE")),
                is_traded=is_traded,
                ),
            }
        )

    best_score_by_key: dict[str, int] = {}
    for cand in candidates:
        key = cand["key"]
        score = cand["score"]
        prev = best_score_by_key.get(key)
        if prev is None or score > prev:
            best_score_by_key[key] = score

    results: list[MarketInstrumentOut] = []
    for cand in candidates:
        if cand["score"] == best_score_by_key.get(cand["key"]):
            results.append(cand["item"])
    return results


def _instrument_to_out(instrument: MarketInstrument) -> MarketInstrumentOut:
    return MarketInstrumentOut(
        secid=instrument.secid,
        provider=instrument.provider or "MOEX",
        isin=instrument.isin,
        short_name=instrument.short_name,
        name=instrument.name,
        type_code=instrument.type_code,
        engine=instrument.engine,
        market=instrument.market,
        default_board_id=instrument.default_board_id,
        currency_code=instrument.currency_code,
        lot_size=instrument.lot_size,
        face_value_cents=instrument.face_value_cents,
        is_traded=instrument.is_traded,
    )


@router.get("/instruments/{secid}", response_model=MarketInstrumentDetailsOut)
def get_instrument_details(
    secid: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    instrument = db.get(MarketInstrument, secid)
    if instrument and instrument.provider == "COINGECKO":
        boards = [
            MarketBoardOut(
                board_id=CRYPTO_BOARD_ID,
                title="Crypto",
                engine=None,
                market=None,
                currency_code="RUB",
                is_primary=True,
            )
        ]
        return MarketInstrumentDetailsOut(instrument=_instrument_to_out(instrument), boards=boards)
    if not instrument:
        try:
            details, boards = _fetch_instrument_details(secid)
            instrument = _upsert_instrument(db, details)
            return MarketInstrumentDetailsOut(instrument=_instrument_to_out(instrument), boards=boards)
        except (requests.RequestException, HTTPException):
            coin = get_coin_by_id(secid)
            if coin:
                instrument, boards, _ = resolve_coingecko_instrument(db, secid)
                return MarketInstrumentDetailsOut(instrument=_instrument_to_out(instrument), boards=boards)
            raise
    details, boards = _fetch_instrument_details(secid)
    instrument = _upsert_instrument(db, details)
    return MarketInstrumentDetailsOut(instrument=_instrument_to_out(instrument), boards=boards)


def get_crypto_price_rates(secid: str) -> tuple[int, int] | None:
    """Возвращает (price_rub_kopeks, price_usd_cents) для конвертации суммы в USD в рубли. None при ошибке."""
    try:
        prices = get_simple_price([secid], vs_currencies="usd,rub")
        data = prices.get(secid) if isinstance(prices.get(secid), dict) else None
        rub = data.get("rub") if data else None
        usd = data.get("usd") if data else None
        if rub is None or not isinstance(rub, (int, float)) or usd is None or not isinstance(usd, (int, float)):
            return None
        if float(usd) <= 0:
            return None
        price_rub_kopeks = int(round(float(rub) * 100))
        price_usd_cents = int(round(float(usd) * 100))
        return (price_rub_kopeks, price_usd_cents)
    except Exception:
        return None


def _fetch_coingecko_price(secid: str) -> tuple[date, MarketPriceOut]:
    prices = get_simple_price([secid], vs_currencies="usd,rub")
    data = prices.get(secid) if isinstance(prices.get(secid), dict) else None
    rub = data.get("rub") if data else None
    usd = data.get("usd") if data else None
    if rub is None or not isinstance(rub, (int, float)):
        raise HTTPException(status_code=502, detail="CoinGecko price not available")
    price_date = datetime.utcnow().date()
    price_cents = int(round(float(rub) * 100))  # RUB to kopeks
    price_usd_cents: int | None = None
    if usd is not None and isinstance(usd, (int, float)):
        price_usd_cents = int(round(float(usd) * 100))
    price_out = MarketPriceOut(
        instrument_id=secid,
        board_id=CRYPTO_BOARD_ID,
        price_date=price_date,
        price_time=None,
        price_cents=price_cents,
        price_percent_bp=None,
        accint_cents=None,
        yield_bp=None,
        currency_code="RUB",
        price_usd_cents=price_usd_cents,
    )
    return price_date, price_out


@router.get("/instruments/{secid}/price", response_model=MarketPriceOut)
def get_instrument_price(
    secid: str,
    board_id: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    instrument = db.get(MarketInstrument, secid)
    if not instrument:
        try:
            details, _ = _fetch_instrument_details(secid)
            instrument = _upsert_instrument(db, details)
        except (requests.RequestException, HTTPException):
            coin = get_coin_by_id(secid)
            if coin:
                instrument, _, _ = resolve_coingecko_instrument(db, secid)
            else:
                raise

    selected_board_id = board_id or instrument.default_board_id or ""
    if instrument.provider == "COINGECKO":
        selected_board_id = CRYPTO_BOARD_ID

    cache_key = f"{secid}|{selected_board_id}"
    cached = _PRICE_CACHE.get(cache_key)
    now = datetime.utcnow()
    if cached and now - cached[0] < _PRICE_CACHE_TTL:
        return cached[1]

    if instrument.provider == "COINGECKO":
        try:
            price_date, price_out = _fetch_coingecko_price(secid)
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        existing = db.execute(
            select(MarketPrice).where(
                MarketPrice.instrument_id == secid,
                MarketPrice.board_id == CRYPTO_BOARD_ID,
                MarketPrice.price_date == price_date,
            )
        ).scalar_one_or_none()
        if not existing:
            existing = MarketPrice(
                instrument_id=secid,
                board_id=CRYPTO_BOARD_ID,
                price_date=price_date,
            )
        existing.price_cents = price_out.price_cents
        existing.price_percent_bp = None
        existing.accint_cents = None
        existing.yield_bp = None
        existing.currency_code = "RUB"
        existing.source = "COINGECKO"
        db.add(existing)
        db.flush()
        usd_cents = getattr(price_out, "price_usd_cents", None)
        if usd_cents is not None:
            try:
                db.execute(
                    text("UPDATE market_prices SET price_usd_cents = :v WHERE id = :id"),
                    {"v": usd_cents, "id": existing.id},
                )
            except ProgrammingError:
                pass  # колонка может отсутствовать до применения миграции
        db.commit()
        _PRICE_CACHE[cache_key] = (now, price_out)
        return price_out

    boards = []
    details = {}
    try:
        details, boards = _fetch_instrument_details(secid)
    except (requests.RequestException, HTTPException):
        pass
    if not boards and instrument.default_board_id:
        boards = [MarketBoardOut(board_id=instrument.default_board_id, title=None, engine=None, market=None, currency_code=instrument.currency_code, is_primary=True)]
    selected_board_id = _select_board_id(board_id, instrument, boards)
    engine = details.get("engine") or instrument.engine
    market = details.get("market") or instrument.market
    if not engine or not market:
        for board in boards:
            if board.board_id == selected_board_id:
                engine = engine or board.engine
                market = market or board.market
                break

    try:
        price_date, price_out = _fetch_latest_price(
            secid, selected_board_id, engine=engine, market=market
        )
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    if instrument.type_code == "bonds":
        face_value_cents = instrument.face_value_cents or details.get("face_value_cents")
        _apply_bond_price(price_out, face_value_cents)
    else:
        price_out.price_percent_bp = None

    existing = db.execute(
        select(MarketPrice).where(
            MarketPrice.instrument_id == secid,
            MarketPrice.board_id == selected_board_id,
            MarketPrice.price_date == price_date,
        )
    ).scalar_one_or_none()
    if not existing:
        existing = MarketPrice(
            instrument_id=secid,
            board_id=selected_board_id,
            price_date=price_date,
        )
    existing.price_cents = price_out.price_cents
    existing.price_percent_bp = price_out.price_percent_bp
    existing.accint_cents = price_out.accint_cents
    existing.yield_bp = price_out.yield_bp
    existing.currency_code = price_out.currency_code or instrument.currency_code
    existing.source = "MOEX"
    db.add(existing)
    db.commit()

    resolved = MarketPriceOut(
        instrument_id=secid,
        board_id=selected_board_id,
        price_date=price_date,
        price_time=None,
        price_cents=existing.price_cents,
        price_percent_bp=existing.price_percent_bp,
        accint_cents=existing.accint_cents,
        yield_bp=existing.yield_bp,
        currency_code=existing.currency_code,
    )
    _PRICE_CACHE[cache_key] = (now, resolved)
    return resolved


@router.get("/instruments/{secid}/prices", response_model=list[MarketPriceOut])
def get_instrument_prices(
    secid: str,
    from_date: date = Query(..., alias="from"),
    to_date: date = Query(..., alias="to"),
    board_id: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if from_date > to_date:
        raise HTTPException(status_code=400, detail="from must be on or before to")

    instrument = db.get(MarketInstrument, secid)
    if not instrument:
        try:
            details, _ = _fetch_instrument_details(secid)
            instrument = _upsert_instrument(db, details)
        except (requests.RequestException, HTTPException):
            coin = get_coin_by_id(secid)
            if coin:
                instrument, _, _ = resolve_coingecko_instrument(db, secid)
            else:
                raise

    if instrument.provider == "COINGECKO":
        try:
            chart_data = get_market_chart_range(secid, from_date, to_date, vs_currency="rub")
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        results = []
        for d, price_rub in chart_data:
            price_cents = int(round(price_rub * 100))
            price_out = MarketPriceOut(
                instrument_id=secid,
                board_id=CRYPTO_BOARD_ID,
                price_date=d,
                price_time=None,
                price_cents=price_cents,
                price_percent_bp=None,
                accint_cents=None,
                yield_bp=None,
                currency_code="RUB",
            )
            existing = db.execute(
                select(MarketPrice).where(
                    MarketPrice.instrument_id == secid,
                    MarketPrice.board_id == CRYPTO_BOARD_ID,
                    MarketPrice.price_date == d,
                )
            ).scalar_one_or_none()
            if not existing:
                existing = MarketPrice(
                    instrument_id=secid,
                    board_id=CRYPTO_BOARD_ID,
                    price_date=d,
                )
            existing.price_cents = price_cents
            existing.price_percent_bp = None
            existing.accint_cents = None
            existing.yield_bp = None
            existing.currency_code = "RUB"
            existing.source = "COINGECKO"
            db.add(existing)
            results.append(price_out)
        db.commit()
        return results

    details, boards = _fetch_instrument_details(secid)
    instrument = _upsert_instrument(db, details)
    selected_board_id = _select_board_id(board_id, instrument, boards)

    engine = details.get("engine") or instrument.engine
    market = details.get("market") or instrument.market
    if (not engine or not market) and boards:
        for board in boards:
            if board.board_id == selected_board_id:
                engine = engine or board.engine
                market = market or board.market
                break
    if not engine or not market:
        raise HTTPException(status_code=400, detail="Engine or market is not available")
    try:
        payload = _moex_get(
            f"history/engines/{engine}/markets/{market}/boards/{selected_board_id}/securities/{secid}.json",
            params={
                "iss.meta": "off",
                "from": from_date.isoformat(),
                "till": to_date.isoformat(),
            },
        )
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    history_rows = _table_rows(payload, "history")
    results: list[MarketPriceOut] = []
    for row in history_rows:
        trade_date_raw = _normalize_text(row.get("TRADEDATE"))
        if not trade_date_raw:
            continue
        try:
            trade_date = datetime.strptime(trade_date_raw, "%Y-%m-%d").date()
        except ValueError:
            continue
        price_value = row.get("CLOSE") or row.get("MARKETPRICE") or row.get("LAST")
        accint_value = row.get("ACCINT")
        yield_value = row.get("YIELD")
        price_out = MarketPriceOut(
            instrument_id=secid,
            board_id=selected_board_id,
            price_date=trade_date,
            price_time=None,
            price_cents=_to_cents(price_value),
            price_percent_bp=_to_bp(price_value),
            accint_cents=_to_cents(accint_value),
            yield_bp=_to_bp(yield_value),
            currency_code=_normalize_currency_code(_get_field(row, "CURRENCYID"))
            or instrument.currency_code,
        )
        if instrument.type_code == "bonds":
            face_value_cents = instrument.face_value_cents or details.get("face_value_cents")
            _apply_bond_price(price_out, face_value_cents)
        else:
            price_out.price_percent_bp = None

        existing = db.execute(
            select(MarketPrice).where(
                MarketPrice.instrument_id == secid,
                MarketPrice.board_id == selected_board_id,
                MarketPrice.price_date == trade_date,
            )
        ).scalar_one_or_none()
        if not existing:
            existing = MarketPrice(
                instrument_id=secid,
                board_id=selected_board_id,
                price_date=trade_date,
            )
        existing.price_cents = price_out.price_cents
        existing.price_percent_bp = price_out.price_percent_bp
        existing.accint_cents = price_out.accint_cents
        existing.yield_bp = price_out.yield_bp
        existing.currency_code = price_out.currency_code
        existing.source = "MOEX"
        db.add(existing)
        results.append(price_out)

    db.commit()
    return results
