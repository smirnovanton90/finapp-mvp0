from contextlib import asynccontextmanager
import logging
from fastapi import FastAPI, Depends, HTTPException, Request, UploadFile, File
from fastapi.responses import Response, JSONResponse
from fastapi.staticfiles import StaticFiles
import xml.etree.ElementTree as ET
import bisect
from datetime import datetime, timedelta, date as date_type
import requests
from pathlib import Path
from io import BytesIO
from PIL import Image
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import select, delete, func, or_, text
from sqlalchemy.exc import SQLAlchemyError, ProgrammingError

from db import get_db
from models import (
    Item,
    ItemMarketValue,
    User,
    OnboardingState,
    Currency,
    FxRate,
    Counterparty,
    CounterpartyIndustry,
    Transaction,
    MarketPrice,
)
from config import settings
from schemas import (
    ItemCreate,
    ItemOut,
    ItemSynonymsAdd,
    CurrencyOut,
    FxRateOut,
    BankOut,
    FxRatesBatchRequest,
    AuthRegister,
    AuthLogin,
    AuthResponse,
    AuthUserOut,
    UserMeOut,
    UserProfileUpdate,
    AccountingStartDateUpdate,
    ItemCloseRequest,
    ItemMarketValueCreate,
    ItemMarketValueOut,
    ItemCostsOut,
    ItemCostHistoryPoint,
    ItemCostHistoryOut,
)
from auth import get_current_user, create_access_token, hash_password, verify_password

from transactions import (
    router as transactions_router,
    purge_card_transactions as purge_card_transactions_fn,
    transfer_delta,
)
from transaction_chains import router as transaction_chains_router
from categories import router as categories_router
from goals import router as goals_router
from counterparties import router as counterparties_router
from receipts import router as receipts_router
from coingecko import get_market_chart_range, get_simple_price
from market import router as market_router, resolve_coingecko_instrument, resolve_market_instrument, ensure_moex_history_prices
from onboarding import router as onboarding_router
from telegram_router import router as telegram_router
from tg_bot.bot import run_bot as telegram_run_bot, stop_bot as telegram_stop_bot
from tg_bot.scheduler import start_scheduler as telegram_start_scheduler, stop_scheduler as telegram_stop_scheduler
from market_utils import CRYPTO_BOARD_ID, is_crypto_item, is_crypto_type, is_moex_item, is_moex_type
from item_plan_service import (
    create_item_chains,
    delete_auto_chains,
    plan_signature,
    rebuild_item_chains,
    upsert_plan_settings,
)
from item_opening_service import (
    create_commission_transaction,
    create_opening_transactions,
    delete_commission_transactions,
    delete_opening_transactions,
    _create_transfer,
    _create_income_expense,
    AUTO_CLOSING_SOURCE,
    _build_item_comment,
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # startup
    await telegram_run_bot()
    telegram_start_scheduler()
    yield
    # shutdown
    await telegram_stop_bot()
    telegram_stop_scheduler()


app = FastAPI(title="FinApp API", version="0.1.0", lifespan=lifespan)

_FX_CACHE: dict[str, tuple[datetime, list[FxRateOut]]] = {}
_FX_CACHE_TTL = timedelta(hours=1)
_BANK_LICENSE_STATUSES = ("Действующая", "Отозванная")
_BANK_COUNTERPARTY_TYPE_CODES = {
    "bank_account",
    "bank_card",
    "deposit",
    "savings_account",
    "brokerage",
    "consumer_loan",
    "mortgage",
    "car_loan",
    "education_loan",
}

_MANDATORY_COUNTERPARTY_TYPE_CODES = {
    "bank_account",
    "bank_card",
    "deposit",
    "savings_account",
    "consumer_loan",
    "mortgage",
    "car_loan",
    "education_loan",
    "loan_to_third_party",
    "third_party_receivables",
    "private_loan",
    "third_party_payables",
}

_OPTIONAL_COUNTERPARTY_TYPE_CODES = {
    "brokerage",
    "installment",
    "microloan",
    "e_wallet",
    "npf",
    "investment_life_insurance",
    "utilities_debt",
    "telecom_debt",
    "tax_debt",
    "fns_debt",
    "traffic_fines_debt",
    "enforcement_debt",
    "alimony_debt",
    "court_debt",
    "court_fine_debt",
    "personal_income_tax_debt",
    "property_tax_debt",
    "land_tax_debt",
    "transport_tax_debt",
}

_BANK_INDUSTRY_NAME = "Банки"

app.include_router(transactions_router)
app.include_router(transaction_chains_router)
app.include_router(categories_router)
app.include_router(goals_router)
app.include_router(counterparties_router)
app.include_router(receipts_router)
app.include_router(market_router)
app.include_router(onboarding_router)
app.include_router(telegram_router)

UPLOADS_DIR = Path(__file__).resolve().parent / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")

from fastapi.middleware.cors import CORSMiddleware

_CORS_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000", "http://157.22.230.201", "https://157.22.230.201"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _cors_headers(origin: str | None) -> dict:
    if origin and origin in _CORS_ORIGINS:
        return {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Credentials": "true",
            "Access-Control-Allow-Methods": "*",
            "Access-Control-Allow-Headers": "*",
        }
    return {}


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    origin = request.headers.get("origin")
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
        headers=_cors_headers(origin),
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logging.exception("Unhandled exception: %s", exc)
    origin = request.headers.get("origin")
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc)},
        headers=_cors_headers(origin),
    )


def _parse_date_req(date_req: str | None) -> date_type | None:
    if not date_req:
        return None
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d.%m.%Y"):
        try:
            return datetime.strptime(date_req, fmt).date()
        except ValueError:
            continue
    return None


def _fetch_cbr_rates(date_req: str | None) -> tuple[date_type, list[FxRateOut]]:
    params = {"date_req": date_req} if date_req else None
    response = requests.get("https://cbr.ru/scripts/XML_daily.asp", params=params, timeout=20)
    response.raise_for_status()

    root = ET.fromstring(response.content)
    response_date_text = (root.attrib.get("Date") or "").strip()
    response_date = None
    if response_date_text:
        try:
            response_date = datetime.strptime(response_date_text, "%d.%m.%Y").date()
        except ValueError:
            response_date = None

    rates: list[FxRateOut] = []

    for valute in root.findall("Valute"):
        char_code = (valute.findtext("CharCode") or "").strip()
        if not char_code:
            continue

        nominal_text = (valute.findtext("Nominal") or "").strip()
        value_text = (valute.findtext("Value") or "").strip()

        try:
            nominal = int(nominal_text)
        except ValueError:
            nominal = 1

        try:
            value = float(value_text.replace(",", "."))
        except ValueError:
            value = 0.0

        rate = value / nominal if nominal else 0.0
        rates.append(FxRateOut(char_code=char_code, nominal=nominal, value=value, rate=rate))

    rates.append(FxRateOut(char_code="RUB", nominal=1, value=1.0, rate=1.0))
    rates.sort(key=lambda r: r.char_code)
    fallback_date = _parse_date_req(date_req) or datetime.utcnow().date()
    return (response_date or fallback_date), rates


def _load_fx_rates(date_req: date_type, db: Session) -> list[FxRateOut] | None:
    rows = db.execute(
        select(FxRate)
        .where(FxRate.rate_date == date_req)
        .order_by(FxRate.char_code.asc())
    ).scalars().all()
    if not rows:
        return None
    return [
        FxRateOut(
            char_code=row.char_code,
            nominal=row.nominal,
            value=row.value,
            rate=row.rate,
        )
        for row in rows
    ]


def _store_fx_rates(date_req: date_type, rates: list[FxRateOut], db: Session) -> None:
    db.execute(delete(FxRate).where(FxRate.rate_date == date_req))
    for rate in rates:
        db.add(
            FxRate(
                rate_date=date_req,
                char_code=rate.char_code,
                nominal=rate.nominal,
                value=rate.value,
                rate=rate.rate,
            )
        )
    db.commit()


def _get_fx_rates(date_req: str | None, db: Session) -> list[FxRateOut]:
    cache_key = date_req or "latest"
    cached = _FX_CACHE.get(cache_key)
    now = datetime.utcnow()
    today = now.date()

    if cached and (now - cached[0]) < _FX_CACHE_TTL:
        return cached[1]

    parsed_date = _parse_date_req(date_req)
    requested_date = parsed_date if parsed_date and parsed_date <= today else None
    stored: list[FxRateOut] | None = None
    try:
        if requested_date:
            stored = _load_fx_rates(requested_date, db)
        else:
            latest_date = db.execute(
                select(func.max(FxRate.rate_date)).where(FxRate.rate_date <= today)
            ).scalar()
            if latest_date:
                stored = _load_fx_rates(latest_date, db)
        if stored:
            _FX_CACHE[cache_key] = (now, stored)
            return stored
    except SQLAlchemyError:
        stored = None

    try:
        fetched_date, rates = _fetch_cbr_rates(date_req if requested_date else None)
    except requests.RequestException:
        if cached:
            return cached[1]
        if stored:
            return stored
        # Fallback: most recent rates in DB before requested_date
        if requested_date:
            try:
                fallback_date = db.execute(
                    select(func.max(FxRate.rate_date))
                    .where(FxRate.rate_date < requested_date)
                ).scalar()
                if fallback_date:
                    fallback_rates = _load_fx_rates(fallback_date, db)
                    if fallback_rates:
                        _FX_CACHE[cache_key] = (now, fallback_rates)
                        return fallback_rates
            except SQLAlchemyError:
                pass
        raise

    store_date = requested_date or fetched_date
    if store_date > today:
        store_date = today
    try:
        _store_fx_rates(store_date, rates, db)
    except SQLAlchemyError:
        db.rollback()
    _FX_CACHE[cache_key] = (now, rates)
    return rates


def _get_fx_rate_for_date(
    rate_date: date_type,
    currency_code: str,
    db: Session,
) -> float | None:
    if currency_code == "RUB":
        return 1.0
    date_req = rate_date.strftime("%d/%m/%Y")
    try:
        rates = _get_fx_rates(date_req, db)
    except Exception:
        rates = []
    for rate in rates:
        if rate.char_code == currency_code and rate.rate > 0:
            return rate.rate
    # Fallback: most recent valid rate on or before this date
    row = db.execute(
        select(FxRate.rate)
        .where(
            FxRate.char_code == currency_code,
            FxRate.rate_date <= rate_date,
            FxRate.rate > 0,
        )
        .order_by(FxRate.rate_date.desc())
        .limit(1)
    ).scalar()
    return row


def _convert_amount_between_currencies(
    amount_minor: int,
    from_currency: str | None,
    to_currency: str | None,
    rate_date: date_type,
    db: Session,
) -> int:
    """Convert amount between currencies via FX rates (both in minor units).

    from_currency/to_currency are ISO codes like 'RUB', 'USD'. If rates are missing,
    falls back to the original amount.
    """
    from_code = (from_currency or "RUB").upper()
    to_code = (to_currency or "RUB").upper()
    if amount_minor == 0 or from_code == to_code:
        return amount_minor

    rate_from = _get_fx_rate_for_date(rate_date, from_code, db)
    rate_to = _get_fx_rate_for_date(rate_date, to_code, db)
    if not rate_from or not rate_to or rate_from <= 0 or rate_to <= 0:
        return amount_minor

    # amount is in minor units of from_currency; convert via RUB pivot into to_currency
    return int(round(amount_minor * rate_from / rate_to))


def _get_latest_market_price(
    db: Session,
    instrument_id: str,
    board_id: str | None,
) -> MarketPrice | None:
    if not board_id:
        return None
    return (
        db.execute(
            select(MarketPrice)
            .where(
                MarketPrice.instrument_id == instrument_id,
                MarketPrice.board_id == board_id,
            )
            .order_by(MarketPrice.price_date.desc())
        )
        .scalars()
        .first()
    )


def _get_market_price_on_or_before(
    db: Session,
    instrument_id: str,
    board_id: str | None,
    on_or_before: date_type,
) -> MarketPrice | None:
    """Return the latest market price for instrument/board with price_date <= on_or_before."""
    if not board_id:
        return None
    return (
        db.execute(
            select(MarketPrice)
            .where(
                MarketPrice.instrument_id == instrument_id,
                MarketPrice.board_id == board_id,
                MarketPrice.price_date <= on_or_before,
            )
            .order_by(MarketPrice.price_date.desc())
        )
        .scalars()
        .first()
    )


def _get_latest_item_market_value_rub(
    db: Session, item_id: int, user_id: int, item: "Item | None" = None
) -> int | None:
    """Последняя рыночная стоимость по item_market_values в рублях. Для не-MOEX активов."""
    row = (
        db.query(ItemMarketValue)
        .filter(
            ItemMarketValue.item_id == item_id,
            ItemMarketValue.user_id == user_id,
            ItemMarketValue.value_date <= date_type.today(),
        )
        .order_by(ItemMarketValue.value_date.desc())
        .limit(1)
        .first()
    )
    if not row:
        return None
    if getattr(row, "value_currency_cents", None) is not None:
        it = item or db.get(Item, item_id)
        if not it:
            return None
        currency = (it.currency_code or "RUB").upper()
        if currency == "RUB":
            return row.value_currency_cents
        rate = _get_fx_rate_for_date(row.value_date, currency, db)
        if rate is None:
            return None
        return int(round((row.value_currency_cents / 100) * rate * 100))
    return row.value_rub


def _item_market_value_storage_from_payload(
    payload: ItemMarketValueCreate, item: Item, db: Session
) -> tuple[int, int | None]:
    """Returns (value_rub, value_currency_cents) for DB storage from create/update payload."""
    if payload.value_currency_cents is not None:
        vc = payload.value_currency_cents
        currency = (item.currency_code or "RUB").upper()
        if currency == "RUB":
            return (vc, vc)
        rate = _get_fx_rate_for_date(payload.value_date, currency, db)
        vr = int(round((vc / 100) * rate * 100)) if rate else 0
        return (vr, vc)
    vr = payload.value_rub or 0
    if (item.currency_code or "RUB").upper() == "RUB":
        return (vr, vr)
    return (vr, None)


def _item_market_value_to_out(row: ItemMarketValue, item: Item, db: Session) -> ItemMarketValueOut:
    """Build ItemMarketValueOut; value_rub is RUB equivalent when value_currency_cents is set."""
    vc = getattr(row, "value_currency_cents", None)
    if vc is not None:
        currency = (item.currency_code or "RUB").upper()
        if currency == "RUB":
            value_rub_out = vc
        else:
            rate = _get_fx_rate_for_date(row.value_date, currency, db)
            value_rub_out = int(round((vc / 100) * rate * 100)) if rate else row.value_rub
        return ItemMarketValueOut(
            id=row.id,
            item_id=row.item_id,
            value_date=row.value_date,
            value_rub=value_rub_out,
            value_currency_cents=vc,
            created_at=row.created_at,
        )
    return ItemMarketValueOut(
        id=row.id,
        item_id=row.item_id,
        value_date=row.value_date,
        value_rub=row.value_rub,
        value_currency_cents=None,
        created_at=row.created_at,
    )


def _get_market_price_usd_cents(db: Session, price: MarketPrice) -> int | None:
    """Читает price_usd_cents из market_prices по id (колонка может отсутствовать до миграции).
    Используется savepoint, чтобы при ошибке (нет колонки) не прерывать основную транзакцию."""
    savepoint = db.begin_nested()
    try:
        row = db.execute(
            text("SELECT price_usd_cents FROM market_prices WHERE id = :id"),
            {"id": price.id},
        ).fetchone()
        savepoint.commit()
        return int(row[0]) if row and row[0] is not None else None
    except Exception:
        savepoint.rollback()
        return None


def _compute_market_value_rub(
    item: Item,
    price: MarketPrice | None,
    db: Session,
) -> int | None:
    if not price:
        return None
    if item.type_code == "crypto" and item.quantity_units is not None:
        # Для крипты возвращаем стоимость в центах USD (валюта актива), не в рублях
        price_usd_cents = _get_market_price_usd_cents(db, price)
        if price_usd_cents is not None:
            return int(round(float(item.quantity_units) * price_usd_cents))
        if price.price_cents is None:
            return None
        return int(round(float(item.quantity_units) * price.price_cents))
    if item.position_lots is None:
        return None
    lot_size = item.lot_size or 1
    units = item.position_lots * lot_size
    if units <= 0:
        return 0
    if item.type_code == "bonds":
        if price.price_cents is not None:
            dirty_price = price.price_cents + (price.accint_cents or 0)
            value_cents = int(round(dirty_price * units))
        elif item.face_value_cents is not None and price.price_percent_bp is not None:
            clean_price = item.face_value_cents * price.price_percent_bp / 10000
            dirty_price = clean_price + (price.accint_cents or 0)
            value_cents = int(round(dirty_price * units))
        else:
            return None
    else:
        if price.price_cents is None:
            return None
        value_cents = price.price_cents * units

    currency_code = price.currency_code or item.currency_code
    rate = _get_fx_rate_for_date(price.price_date, currency_code, db)
    if rate is None:
        return None
    rub_value = int(round((value_cents / 100) * rate * 100))
    return rub_value


def _get_bank_industry_id(db: Session) -> int | None:
    return db.execute(
        select(CounterpartyIndustry.id).where(
            CounterpartyIndustry.name == _BANK_INDUSTRY_NAME
        )
    ).scalar_one_or_none()


def _default_primary_value_kind(type_code: str, kind: str) -> str:
    """Default primary_value_kind by asset/liability type (plan: п. 2.2)."""
    if kind == "LIABILITY":
        return "BALANCE"
    # ASSET
    cash = {"cash", "bank_account", "bank_card", "savings_account", "e_wallet", "brokerage"}
    investment = {"deposit", "securities", "bonds", "etf", "bpif", "pif", "iis", "precious_metals", "crypto"}
    third_party_debt = {"loan_to_third_party", "counterparty_settlements"}
    real_estate = {"real_estate", "townhouse", "land_plot", "garage", "commercial_real_estate", "real_estate_share"}
    transport = {"car", "motorcycle", "boat", "trailer", "special_vehicle"}
    valuables = {"jewelry", "electronics", "art", "collectibles", "other_valuables"}
    pension = {"npf", "investment_life_insurance"}
    other_asset = {"business_share", "sole_proprietor", "other_asset"}
    if type_code in cash or type_code in third_party_debt or type_code in pension or type_code in other_asset:
        return "BALANCE"
    if type_code in investment or type_code in real_estate or type_code in transport or type_code in valuables:
        return "MARKET"
    return "BALANCE"


def _apply_logo_url(counterparty: Counterparty) -> None:
    counterparty.logo_url = (
        f"{settings.public_base_url}/counterparties/{counterparty.id}/logo"
        if counterparty.logo_data
        else None
    )


MAX_ITEM_PHOTO_BYTES = 2 * 1024 * 1024
MAX_ITEM_PHOTO_DIM = 1024
ALLOWED_ITEM_PHOTO_FORMATS = {"PNG", "JPEG", "WEBP"}
_FORMAT_TO_MIME = {
    "PNG": "image/png",
    "JPEG": "image/jpeg",
    "WEBP": "image/webp",
}


def _apply_item_photo_url(item: Item) -> None:
    url = (
        f"{settings.public_base_url}/items/{item.id}/photo"
        if item.photo_data
        else None
    )
    setattr(item, "photo_url", url)


def _resolve_card_account_id(
    db: Session,
    user: User,
    payload: ItemCreate,
    counterparty_id: int | None,
) -> int | None:
    if payload.card_account_id is None:
        return None
    if payload.type_code != "bank_card":
        raise HTTPException(
            status_code=400,
            detail="card_account_id is only allowed for bank_card.",
        )
    linked = db.get(Item, payload.card_account_id)
    if (
        not linked
        or linked.user_id != user.id
        or linked.kind != "ASSET"
        or linked.type_code != "bank_account"
    ):
        raise HTTPException(status_code=400, detail="Invalid card_account_id")
    if counterparty_id is None or linked.counterparty_id != counterparty_id:
        raise HTTPException(
            status_code=400, detail="Card and account banks must match"
        )
    if linked.currency_code != payload.currency_code:
        raise HTTPException(
            status_code=400, detail="Card and account currencies must match"
        )
    return linked.id


def _resolve_card_kind_and_limit(
    payload: ItemCreate,
    existing_item: Item | None = None,
) -> tuple[str | None, int | None, str]:
    if payload.type_code != "bank_card":
        if payload.card_kind is not None:
            raise HTTPException(
                status_code=400, detail="card_kind is only allowed for bank_card."
            )
        if payload.credit_limit is not None:
            raise HTTPException(
                status_code=400, detail="credit_limit is only allowed for bank_card."
            )
        return None, None, payload.kind

    if payload.kind != "ASSET":
        raise HTTPException(status_code=400, detail="bank_card kind must be ASSET.")

    card_kind = payload.card_kind or "DEBIT"
    if existing_item and existing_item.type_code == "bank_card":
        existing_kind = existing_item.card_kind or "DEBIT"
        if card_kind != existing_kind:
            raise HTTPException(
                status_code=400, detail="card_kind cannot be changed for bank_card."
            )

    if card_kind == "CREDIT":
        credit_limit = (
            payload.credit_limit
            if payload.credit_limit is not None
            else existing_item.credit_limit if existing_item else None
        )
        if credit_limit is None:
            raise HTTPException(
                status_code=400, detail="credit_limit is required for credit bank_card."
            )
        return card_kind, credit_limit, "ASSET"

    if payload.credit_limit is not None:
        raise HTTPException(
            status_code=400, detail="credit_limit is only allowed for credit bank_card."
        )
    return card_kind, None, "ASSET"

def _ensure_accounting_start_date(user: User) -> date_type:
    if not user.accounting_start_date:
        raise HTTPException(
            status_code=400,
            detail="Accounting start date is not set.",
        )
    return user.accounting_start_date


def _resolve_history_status(open_date: date_type, accounting_start_date: date_type) -> str:
    # Элементы, созданные в день начала учета или раньше, считаются историческими,
    # так как они уже существовали на момент начала учета.
    # Только элементы, созданные после дня начала учета, считаются новыми.
    return "NEW" if open_date > accounting_start_date else "HISTORICAL"


def _resolve_opening_counterparty(
    db: Session,
    user: User,
    counterparty_item_id: int | None,
    currency_code: str,
) -> Item | None:
    if counterparty_item_id is None:
        return None
    counterparty = db.get(Item, counterparty_item_id)
    if (
        not counterparty
        or counterparty.user_id != user.id
        or counterparty.kind != "ASSET"
        or counterparty.archived_at is not None
        or counterparty.closed_at is not None
    ):
        raise HTTPException(status_code=400, detail="Invalid opening_counterparty_item_id")
    if counterparty.currency_code != currency_code:
        raise HTTPException(
            status_code=400,
            detail="Opening counterparty item currency must match the item currency.",
        )
    return counterparty


def _resolve_commission_payment_item(
    db: Session,
    user: User,
    payment_item_id: int | None,
) -> Item:
    if payment_item_id is None:
        raise HTTPException(status_code=400, detail="commission_payment_item_id is required")
    payment_item = db.get(Item, payment_item_id)
    if (
        not payment_item
        or payment_item.user_id != user.id
        or payment_item.archived_at is not None
        or payment_item.closed_at is not None
    ):
        raise HTTPException(status_code=400, detail="Invalid commission_payment_item_id")
    if is_moex_item(payment_item):
        raise HTTPException(
            status_code=400,
            detail="commission_payment_item_id must reference a non-MOEX item",
        )
    return payment_item

@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/auth/register", response_model=AuthResponse)
def register(
    payload: AuthRegister,
    db: Session = Depends(get_db),
):
    existing = db.execute(select(User).where(User.login == payload.login)).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="Login already exists")

    user = User(
        login=payload.login,
        password_hash=hash_password(payload.password),
        name=payload.name or payload.login,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    db.add(
        OnboardingState(
            user_id=user.id,
            device_type="WEB",
            status="PENDING",
        )
    )
    db.commit()

    token = create_access_token(user.id)
    return AuthResponse(
        access_token=token,
        user=AuthUserOut(id=user.id, login=user.login, name=user.name),
    )


@app.post("/auth/login", response_model=AuthResponse)
def login(
    payload: AuthLogin,
    db: Session = Depends(get_db),
):
    user = db.execute(select(User).where(User.login == payload.login)).scalar_one_or_none()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token(user.id)
    return AuthResponse(
        access_token=token,
        user=AuthUserOut(id=user.id, login=user.login, name=user.name),
    )

MAX_PHOTO_BYTES = 2 * 1024 * 1024
MAX_PHOTO_DIM = 1024
ALLOWED_PHOTO_FORMATS = {"PNG", "JPEG", "WEBP"}
FORMAT_TO_MIME = {
    "PNG": "image/png",
    "JPEG": "image/jpeg",
    "WEBP": "image/webp",
}


def build_user_photo_url(user_id: int) -> str:
    return f"{settings.public_base_url}/users/me/photo"


def apply_user_photo_url(user: User) -> None:
    if user.photo_data:
        user.photo_url = build_user_photo_url(user.id)


@app.get("/users/me", response_model=UserMeOut)
def get_me(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    apply_user_photo_url(user)
    return user


@app.post("/users/me/accounting-start-date", response_model=UserMeOut)
def set_accounting_start_date(
    payload: AccountingStartDateUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if payload.accounting_start_date > date_type.today():
        raise HTTPException(
            status_code=400,
            detail="Accounting start date cannot be later than today.",
        )
    if user.accounting_start_date is not None and payload.accounting_start_date > user.accounting_start_date:
        raise HTTPException(
            status_code=400,
            detail="Accounting start date cannot be later than the currently set date.",
        )
    user.accounting_start_date = payload.accounting_start_date
    db.add(user)

    db.execute(
        text(
            """
            update items
               set start_date = :start_date,
                   history_status = case
                       when open_date >= :start_date then 'NEW'
                       else 'HISTORICAL'
                   end
             where user_id = :user_id
            """
        ),
        {"start_date": payload.accounting_start_date, "user_id": user.id},
    )

    db.commit()
    db.refresh(user)
    return user


@app.patch("/users/me", response_model=UserMeOut)
def update_user_profile(
    payload: UserProfileUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Валидация: first_name обязателен, если пользователь не из Google или если google_sub есть, но first_name пустое
    if payload.first_name is not None:
        user.first_name = payload.first_name.strip() if payload.first_name else None
    if payload.last_name is not None:
        user.last_name = payload.last_name.strip() if payload.last_name else None
    if payload.birth_date is not None:
        if payload.birth_date > date_type.today():
            raise HTTPException(
                status_code=400,
                detail="Дата рождения не может быть в будущем.",
            )
        user.birth_date = payload.birth_date

    # Проверка обязательности first_name (если не из Google или если из Google, но first_name пустое)
    if not user.first_name:
        raise HTTPException(
            status_code=400,
            detail="Имя является обязательным полем.",
        )

    db.commit()
    db.refresh(user)
    apply_user_photo_url(user)
    return user


@app.post("/users/me/photo", response_model=UserMeOut)
async def upload_user_photo(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Файл не загружен.")
    if len(data) > MAX_PHOTO_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"Размер фотографии не должен превышать {MAX_PHOTO_BYTES // (1024 * 1024)} МБ.",
        )

    try:
        image = Image.open(BytesIO(data))
        image.verify()
        image = Image.open(BytesIO(data))
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Неверный формат изображения.") from exc

    if image.format not in ALLOWED_PHOTO_FORMATS:
        raise HTTPException(status_code=400, detail="Недопустимый формат изображения.")

    width, height = image.size
    if width > MAX_PHOTO_DIM or height > MAX_PHOTO_DIM:
        raise HTTPException(
            status_code=400,
            detail=f"Разрешение фотографии не должно превышать {MAX_PHOTO_DIM}px.",
        )

    user.photo_mime = FORMAT_TO_MIME[image.format]
    user.photo_data = data
    apply_user_photo_url(user)
    db.commit()
    db.refresh(user)
    apply_user_photo_url(user)
    return user


@app.get("/users/me/photo")
def get_user_photo(
    user: User = Depends(get_current_user),
):
    if not user.photo_data:
        raise HTTPException(status_code=404, detail="Photo not found.")
    media_type = user.photo_mime or "application/octet-stream"
    return Response(content=user.photo_data, media_type=media_type)


@app.get("/items", response_model=list[ItemOut])
def list_items(
    include_archived: bool = False,
    include_closed: bool = False,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = select(Item).where(Item.user_id == user.id).options(
        selectinload(Item.plan_settings)
    )

    if not include_archived:
        stmt = stmt.where(Item.archived_at.is_(None))
    if not include_closed:
        stmt = stmt.where(Item.closed_at.is_(None))

    stmt = stmt.order_by(Item.created_at.desc())
    items = list(db.execute(stmt).scalars())
    for item in items:
        if not (is_moex_item(item) or is_crypto_item(item)):
            continue
        try:
            price = _get_latest_market_price(db, item.instrument_id, item.instrument_board_id)
            value = _compute_market_value_rub(item, price, db)
            if value is None and is_crypto_item(item) and item.instrument_id:
                try:
                    prices = get_simple_price([item.instrument_id], vs_currencies="usd")
                    data = prices.get(item.instrument_id) if isinstance(prices.get(item.instrument_id), dict) else None
                    usd_val = data.get("usd") if data else None
                    if usd_val is not None and isinstance(usd_val, (int, float)):
                        value = int(round(float(item.quantity_units or 0) * float(usd_val) * 100))
                except Exception:
                    pass
            if value is not None:
                if is_crypto_item(item) and (item.currency_code or "RUB").upper() != "RUB":
                    usd_cents = _get_market_price_usd_cents(db, price) if price else None
                    if usd_cents is not None:
                        setattr(item, "latest_market_value_currency_cents", value)
                        rate = _get_fx_rate_for_date(date_type.today(), (item.currency_code or "USD").upper(), db)
                        if rate is not None:
                            setattr(item, "latest_market_value_rub", int(round((value / 100) * rate * 100)))
                        else:
                            setattr(item, "latest_market_value_rub", None)
                    else:
                        setattr(item, "latest_market_value_rub", value)
                        rate = _get_fx_rate_for_date(date_type.today(), (item.currency_code or "USD").upper(), db)
                        if rate is not None and rate > 0:
                            setattr(item, "latest_market_value_currency_cents", int(round(value / rate)))
                        else:
                            setattr(item, "latest_market_value_currency_cents", None)
                else:
                    setattr(item, "latest_market_value_rub", value)
        except Exception:
            pass
    for item in items:
        if not is_moex_item(item) and not is_crypto_item(item):
            setattr(item, "latest_market_value_rub", None)
    for item in items:
        if (
            getattr(item, "primary_value_kind", None) == "MARKET"
            and not is_moex_item(item)
            and not is_crypto_item(item)
        ):
            latest = _get_latest_item_market_value_rub(db, item.id, user.id, item)
            if latest is not None:
                setattr(item, "latest_market_value_rub", latest)
    # Стоимость приобретения и вложенных — для отображения основной стоимости (ACQUISITION / INVESTED),
    # в валюте самого актива с учётом FX.
    for item in items:
        acq = _compute_acquisition_cost_basis(db, user.id, item.id, item)
        inv_q = (
            db.query(Transaction)
            .filter(
                Transaction.user_id == user.id,
                Transaction.related_item_id == item.id,
                Transaction.asset_link_type == "ASSET_INVESTMENT",
                Transaction.transaction_type == "ACTUAL",
                Transaction.deleted_at.is_(None),
            )
        )
        inv_txs = inv_q.all()
        inv_sum = 0
        if inv_txs:
            primary_ids = {t.primary_item_id for t in inv_txs}
            primary_by_id: dict[int, str | None] = {}
            if primary_ids:
                rows = db.query(Item.id, Item.currency_code).filter(Item.id.in_(primary_ids)).all()
                primary_by_id = {row.id: row.currency_code for row in rows}
            item_currency = (item.currency_code or "RUB").upper()
            for tx in inv_txs:
                rate_date = (
                    tx.transaction_date.date()
                    if hasattr(tx.transaction_date, "date")
                    else tx.transaction_date
                )
                from_currency = primary_by_id.get(tx.primary_item_id, item_currency)
                inv_sum += _convert_amount_between_currencies(
                    tx.amount_rub or 0,
                    from_currency,
                    item_currency,
                    rate_date,
                    db,
                )
        setattr(item, "acquisition_rub", acq)
        setattr(item, "invested_rub", acq + inv_sum)
    for item in items:
        _apply_item_photo_url(item)
    return items


@app.get("/items/{item_id}", response_model=ItemOut)
def get_item(
    item_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = (
        select(Item)
        .where(Item.id == item_id, Item.user_id == user.id)
        .options(selectinload(Item.plan_settings))
    )
    item = db.execute(stmt).scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    if is_moex_item(item) or is_crypto_item(item):
        try:
            price = _get_latest_market_price(db, item.instrument_id, item.instrument_board_id)
            value = _compute_market_value_rub(item, price, db)
            if value is None and is_crypto_item(item) and item.instrument_id:
                try:
                    prices = get_simple_price([item.instrument_id], vs_currencies="usd")
                    data = prices.get(item.instrument_id) if isinstance(prices.get(item.instrument_id), dict) else None
                    usd_val = data.get("usd") if data else None
                    if usd_val is not None and isinstance(usd_val, (int, float)):
                        value = int(round(float(item.quantity_units or 0) * float(usd_val) * 100))
                except Exception:
                    pass
            if value is not None:
                if is_crypto_item(item) and (item.currency_code or "RUB").upper() != "RUB":
                    usd_cents = _get_market_price_usd_cents(db, price) if price else None
                    if usd_cents is not None:
                        setattr(item, "latest_market_value_currency_cents", value)
                        rate = _get_fx_rate_for_date(date_type.today(), (item.currency_code or "USD").upper(), db)
                        if rate is not None:
                            setattr(item, "latest_market_value_rub", int(round((value / 100) * rate * 100)))
                        else:
                            setattr(item, "latest_market_value_rub", None)
                    else:
                        setattr(item, "latest_market_value_rub", value)
                        rate = _get_fx_rate_for_date(date_type.today(), (item.currency_code or "USD").upper(), db)
                        if rate is not None and rate > 0:
                            setattr(item, "latest_market_value_currency_cents", int(round(value / rate)))
                        else:
                            setattr(item, "latest_market_value_currency_cents", None)
                else:
                    setattr(item, "latest_market_value_rub", value)
        except Exception:
            pass
    elif getattr(item, "primary_value_kind", None) == "MARKET":
        latest = _get_latest_item_market_value_rub(db, item.id, user.id, item)
        if latest is not None:
            setattr(item, "latest_market_value_rub", latest)
    acq = (
        db.query(func.coalesce(func.sum(Transaction.amount_rub), 0))
        .filter(
            Transaction.user_id == user.id,
            Transaction.related_item_id == item_id,
            Transaction.asset_link_type == "ASSET_PURCHASE",
            Transaction.transaction_type == "ACTUAL",
            Transaction.deleted_at.is_(None),
        )
        .scalar()
        or 0
    )
    inv_sum = (
        db.query(func.coalesce(func.sum(Transaction.amount_rub), 0))
        .filter(
            Transaction.user_id == user.id,
            Transaction.related_item_id == item_id,
            Transaction.asset_link_type == "ASSET_INVESTMENT",
            Transaction.transaction_type == "ACTUAL",
            Transaction.deleted_at.is_(None),
        )
        .scalar()
        or 0
    )
    setattr(item, "acquisition_rub", int(acq))
    setattr(item, "invested_rub", int(acq) + int(inv_sum))
    _apply_item_photo_url(item)
    return item


@app.get("/currencies", response_model=list[CurrencyOut])
def list_currencies(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = select(Currency).order_by(Currency.iso_char_code.asc())
    return list(db.execute(stmt).scalars())


@app.get("/banks", response_model=list[BankOut])
def list_banks(
    q: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    bank_industry_id = _get_bank_industry_id(db)
    if not bank_industry_id:
        return []
    stmt = select(Counterparty).where(
        Counterparty.industry_id == bank_industry_id,
        Counterparty.entity_type == "LEGAL",
        Counterparty.license_status.in_(_BANK_LICENSE_STATUSES),
        Counterparty.inn.isnot(None),
        Counterparty.deleted_at.is_(None),
    )
    if q:
        stmt = stmt.where(Counterparty.name.ilike(f"%{q}%"))
    stmt = stmt.order_by(Counterparty.name.asc())
    rows = list(db.execute(stmt).scalars())
    for row in rows:
        _apply_logo_url(row)
    return rows


@app.get("/fx-rates", response_model=list[FxRateOut])
def list_fx_rates(
    date_req: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        return _get_fx_rates(date_req, db)
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/fx-rates/batch", response_model=dict[str, list[FxRateOut]])
def list_fx_rates_batch(
    payload: FxRatesBatchRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    results: dict[str, list[FxRateOut]] = {}
    for raw in {value.strip() for value in payload.dates if value}:
        parsed = _parse_date_req(raw)
        if not parsed:
            continue
        date_key = parsed.isoformat()
        date_req = parsed.strftime("%d/%m/%Y")
        try:
            results[date_key] = _get_fx_rates(date_req, db)
        except requests.RequestException:
            continue
    return results


COUNTERPARTY_SETTLEMENTS_TYPE = "counterparty_settlements"


@app.post("/items", response_model=ItemOut)
def create_item(
    payload: ItemCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if payload.type_code == COUNTERPARTY_SETTLEMENTS_TYPE:
        raise HTTPException(
            status_code=400,
            detail="Взаиморасчёты создаются автоматически при первой транзакции «Долги» с контрагентом.",
        )
    accounting_start_date = _ensure_accounting_start_date(user)
    is_moex = is_moex_type(payload.type_code)
    is_crypto = is_crypto_type(payload.type_code)
    instrument_id = None
    instrument_board_id = None
    position_lots = None
    lot_size = None
    face_value_cents = None
    quantity_units = None
    currency_code = payload.currency_code

    if is_moex:
        if not payload.instrument_id:
            raise HTTPException(status_code=400, detail="instrument_id is required for MOEX items")
        if payload.position_lots is None:
            raise HTTPException(status_code=400, detail="position_lots is required for MOEX items")
        instrument, boards, details = resolve_market_instrument(db, payload.instrument_id)
        instrument_id = instrument.secid
        board_candidates = {board.board_id for board in boards if board.board_id}
        selected_board = payload.instrument_board_id or instrument.default_board_id
        if not selected_board:
            raise HTTPException(status_code=400, detail="instrument_board_id is required for MOEX items")
        if board_candidates and selected_board not in board_candidates:
            raise HTTPException(status_code=400, detail="Invalid instrument_board_id")
        instrument_board_id = selected_board
        position_lots = payload.position_lots
        lot_size = instrument.lot_size or details.get("lot_size") or 1
        face_value_cents = instrument.face_value_cents
        if instrument.currency_code and instrument.currency_code != payload.currency_code:
            raise HTTPException(status_code=400, detail="instrument currency must match item currency")
        currency_code = instrument.currency_code or payload.currency_code
    elif is_crypto:
        if not payload.instrument_id:
            raise HTTPException(status_code=400, detail="instrument_id is required for crypto items")
        if payload.quantity_units is None or payload.quantity_units < 0:
            raise HTTPException(status_code=400, detail="quantity_units is required for crypto items and must be >= 0")
        try:
            instrument, boards, details = resolve_coingecko_instrument(db, payload.instrument_id)
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        instrument_id = instrument.secid
        instrument_board_id = CRYPTO_BOARD_ID
        quantity_units = payload.quantity_units
        if payload.position_lots is not None:
            raise HTTPException(status_code=400, detail="position_lots is only allowed for MOEX items")
    else:
        if payload.instrument_id is not None:
            raise HTTPException(status_code=400, detail="instrument_id is only allowed for MOEX or crypto items")
        if payload.instrument_board_id is not None:
            raise HTTPException(status_code=400, detail="instrument_board_id is only allowed for MOEX items")
        if payload.position_lots is not None:
            raise HTTPException(status_code=400, detail="position_lots is only allowed for MOEX items")
        if payload.quantity_units is not None:
            raise HTTPException(status_code=400, detail="quantity_units is only allowed for crypto items")
        if payload.opening_price_cents is not None:
            raise HTTPException(status_code=400, detail="opening_price_cents is only allowed for MOEX/crypto items")
        if (
            payload.commission_enabled is not None
            or payload.commission_amount_rub is not None
            or payload.commission_payment_item_id is not None
        ):
            raise HTTPException(
                status_code=400,
                detail="commission fields are only allowed for MOEX items",
            )
    counterparty_id = None
    if payload.counterparty_id is not None:
        counterparty = db.get(Counterparty, payload.counterparty_id)
        if not counterparty:
            raise HTTPException(status_code=400, detail="Invalid counterparty_id")
        
        # Для банковских типов проверяем, что контрагент из отрасли "Банки"
        if payload.type_code in _BANK_COUNTERPARTY_TYPE_CODES:
            bank_industry_id = _get_bank_industry_id(db)
            if not bank_industry_id or counterparty.industry_id != bank_industry_id:
                raise HTTPException(
                    status_code=400,
                    detail="Counterparty must be a bank for bank-related item types.",
                )
        
        counterparty_id = counterparty.id
    elif payload.type_code in _MANDATORY_COUNTERPARTY_TYPE_CODES:
        raise HTTPException(
            status_code=400,
            detail="counterparty_id is required for this item type.",
        )

    card_account_id = _resolve_card_account_id(db, user, payload, counterparty_id)
    card_kind, credit_limit, item_kind = _resolve_card_kind_and_limit(payload)

    interest_payout_account_id = None
    if payload.interest_payout_account_id is not None:
        if payload.type_code not in {"deposit", "savings_account"}:
            raise HTTPException(
                status_code=400,
                detail="interest_payout_account_id is only allowed for deposit or savings_account.",
            )
        payout = db.get(Item, payload.interest_payout_account_id)
        if not payout or payout.user_id != user.id or payout.kind != "ASSET":
            raise HTTPException(status_code=400, detail="Invalid interest_payout_account_id")
        interest_payout_account_id = payout.id

    deposit_end_date = None
    if payload.type_code == "deposit" and payload.deposit_term_days:
        deposit_end_date = payload.open_date + timedelta(days=payload.deposit_term_days)

    history_status = _resolve_history_status(payload.open_date, accounting_start_date)
    opening_quantity_lots = payload.position_lots if is_moex else None
    has_opening_value = (
        (opening_quantity_lots is not None and opening_quantity_lots > 0)
        if is_moex
        else (quantity_units is not None and quantity_units > 0)
        if is_crypto
        else payload.initial_value_rub > 0
    )
    opening_price_cents = payload.opening_price_cents if (is_moex or is_crypto) else None
    # У рыночных активов (MOEX, crypto, MARKET не-биржевые) баланс всегда 0 — отображается рыночная стоимость
    primary_value_kind_pre = getattr(payload, "primary_value_kind", None)
    initial_value_rub_for_item = (
        0
        if (is_moex or is_crypto or primary_value_kind_pre == "MARKET")
        else payload.initial_value_rub
    )
    opening_amount_rub = payload.initial_value_rub
    if is_moex and opening_price_cents is not None and opening_quantity_lots is not None:
        opening_amount_rub = int(opening_price_cents * opening_quantity_lots * (lot_size or 1))
    elif is_crypto and opening_price_cents is not None and quantity_units is not None and quantity_units > 0:
        # Сумма расхода в USD (центы): Количество × Цена (USD). Транзакция не переводится в рубли.
        opening_amount_rub = int(quantity_units * opening_price_cents)
    commission_requested = (
        payload.commission_enabled is not None
        or payload.commission_amount_rub is not None
        or payload.commission_payment_item_id is not None
    )
    commission_enabled = bool(payload.commission_enabled)
    commission_amount_rub = payload.commission_amount_rub
    commission_payment_item = None
    if commission_requested:
        if not is_moex and not is_crypto:
            raise HTTPException(
                status_code=400,
                detail="commission fields are only allowed for MOEX or crypto items",
            )
        if commission_enabled:
            if history_status != "NEW":
                raise HTTPException(
                    status_code=400,
                    detail="commission is only allowed for NEW MOEX or crypto items",
                )
            if is_moex and (opening_quantity_lots is None or opening_quantity_lots <= 0):
                raise HTTPException(
                    status_code=400,
                    detail="commission requires position_lots > 0",
                )
            if is_crypto and (quantity_units is None or quantity_units <= 0):
                raise HTTPException(
                    status_code=400,
                    detail="commission requires quantity_units > 0",
                )
            if commission_amount_rub is None or commission_amount_rub <= 0:
                raise HTTPException(
                    status_code=400,
                    detail="commission_amount_rub is required",
                )
            commission_payment_item = _resolve_commission_payment_item(
                db,
                user,
                payload.commission_payment_item_id,
            )
        else:
            if commission_amount_rub is not None or payload.commission_payment_item_id is not None:
                raise HTTPException(
                    status_code=400,
                    detail="commission fields require commission_enabled",
                )
    opening_counterparty = None
    if history_status == "NEW" and has_opening_value:
        opening_counterparty = _resolve_opening_counterparty(
            db,
            user,
            payload.opening_counterparty_item_id,
            currency_code,
        )

    min_balance = -credit_limit if card_kind == "CREDIT" and credit_limit is not None else 0
    if initial_value_rub_for_item < min_balance:
        detail = "Initial balance must be non-negative."
        if min_balance < 0:
            detail = "Initial balance cannot be below credit limit."
        raise HTTPException(status_code=400, detail=detail)

    # Для элементов, созданных в день начала учета, current_value_rub должен быть равен initial_value_rub,
    # так как транзакции открытия не создаются (create_opening_transactions возвращается раньше).
    # Для элементов, созданных после дня начала учета, current_value_rub устанавливается в 0,
    # и транзакция открытия обновит его. У MOEX всегда 0 до подстановки рыночной стоимости.
    will_create_opening_tx = (
        history_status == "NEW"
        and has_opening_value
        and payload.open_date > accounting_start_date
    )
    initial_current_value_rub = (
        0
        if (will_create_opening_tx or is_moex or primary_value_kind_pre == "MARKET")
        else initial_value_rub_for_item
    )

    synonyms_list = getattr(payload, "synonyms", None) or []
    primary_value_kind = (
        getattr(payload, "primary_value_kind", None)
        or _default_primary_value_kind(payload.type_code, item_kind)
    )
    item = Item(
        user_id=user.id,
        kind=item_kind,
        type_code=payload.type_code,
        name=payload.name,
        synonyms=synonyms_list,
        currency_code=currency_code,
        counterparty_id=counterparty_id,
        open_date=payload.open_date,
        account_last7=payload.account_last7,
        contract_number=payload.contract_number,
        card_last4=payload.card_last4,
        card_account_id=card_account_id,
        card_kind=card_kind,
        credit_limit=credit_limit,
        deposit_term_days=payload.deposit_term_days,
        deposit_end_date=deposit_end_date,
        interest_rate=payload.interest_rate,
        interest_payout_order=payload.interest_payout_order,
        interest_capitalization=payload.interest_capitalization,
        interest_payout_account_id=interest_payout_account_id,
        instrument_id=instrument_id,
        instrument_board_id=instrument_board_id,
        position_lots=0
        if is_moex and history_status == "NEW" and has_opening_value
        else position_lots,
        lot_size=lot_size,
        face_value_cents=face_value_cents,
        quantity_units=0
        if is_crypto and history_status == "NEW" and has_opening_value
        else quantity_units,
        initial_value_rub=initial_value_rub_for_item,
        current_value_rub=initial_current_value_rub,
        start_date=accounting_start_date,
        history_status=history_status,
        opening_counterparty_item_id=opening_counterparty.id
        if opening_counterparty
        else None,
        primary_value_kind=primary_value_kind,
        initial_acquisition_rub=(
            getattr(payload, "acquisition_value_rub", None)
            if (
                history_status == "HISTORICAL"
                and (primary_value_kind == "MARKET" or is_moex or is_crypto)
            )
            else None
        ),
    )
    db.add(item)
    db.flush()

    settings = upsert_plan_settings(db, item, payload.plan_settings)
    if history_status == "NEW" and has_opening_value:
        create_opening_transactions(
            db=db,
            user=user,
            item=item,
            counterparty=opening_counterparty,
            amount_rub=opening_amount_rub,
            quantity_lots=opening_quantity_lots,
            quantity_units=quantity_units,
            deposit_end_date=deposit_end_date,
            plan_settings=settings,
        )
        # position_lots/quantity_units обновляются в create_opening_transactions через _apply_position_delta/_apply_quantity_units_delta
    if settings and settings.enabled:
        create_item_chains(db, user, item, settings)

    if commission_requested and commission_enabled and commission_payment_item:
        instrument_label = item.instrument_id or item.name
        if item.instrument_id and item.name and item.name != item.instrument_id:
            instrument_label = f"{item.instrument_id} - {item.name}"
        create_commission_transaction(
            db=db,
            user=user,
            item=item,
            payment_item_id=commission_payment_item.id,
            amount_rub=commission_amount_rub or 0,
            tx_date=item.open_date,
            instrument_label=instrument_label,
        )

    # Для рыночных активов (MOEX/crypto) подставляем latest_market_value_rub по текущей цене
    if (is_moex or is_crypto) and item.instrument_id:
        try:
            price = _get_latest_market_price(db, item.instrument_id, item.instrument_board_id)
            value = _compute_market_value_rub(item, price, db)
            if value is None and is_crypto and item.instrument_id:
                try:
                    prices = get_simple_price([item.instrument_id], vs_currencies="usd")
                    data = prices.get(item.instrument_id) if isinstance(prices.get(item.instrument_id), dict) else None
                    usd_val = data.get("usd") if data else None
                    if usd_val is not None and isinstance(usd_val, (int, float)):
                        value = int(round(float(item.quantity_units or 0) * float(usd_val) * 100))
                except Exception:
                    pass
            if value is not None:
                setattr(item, "latest_market_value_rub", value)
        except Exception:
            pass

    db.commit()
    db.refresh(item)
    _apply_item_photo_url(item)
    return item

@app.patch("/items/{item_id}", response_model=ItemOut)
def update_item(
    item_id: int,
    payload: ItemCreate,
    purge_card_transactions: bool = False,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    item = db.get(Item, item_id)
    if not item or item.user_id != user.id:
        raise HTTPException(status_code=404, detail="Item not found")
    if item.type_code == COUNTERPARTY_SETTLEMENTS_TYPE:
        raise HTTPException(
            status_code=400,
            detail="Редактирование актива «Взаиморасчёты» недоступно.",
        )
    if item.archived_at is not None:
        raise HTTPException(status_code=400, detail="Cannot edit archived item")
    if item.closed_at is not None:
        raise HTTPException(status_code=400, detail="Cannot edit closed item")

    accounting_start_date = _ensure_accounting_start_date(user)
    existing_settings = item.plan_settings
    old_signature = plan_signature(item, existing_settings)
    was_plan_enabled = existing_settings.enabled if existing_settings else False
    is_moex = is_moex_type(payload.type_code)
    is_crypto = is_crypto_type(payload.type_code)
    instrument_id = None
    instrument_board_id = None
    position_lots = None
    lot_size = None
    face_value_cents = None
    quantity_units = None
    currency_code = payload.currency_code

    if is_moex:
        if not payload.instrument_id:
            raise HTTPException(status_code=400, detail="instrument_id is required for MOEX items")
        if payload.position_lots is None:
            raise HTTPException(status_code=400, detail="position_lots is required for MOEX items")
        instrument, boards, details = resolve_market_instrument(db, payload.instrument_id)
        instrument_id = instrument.secid
        board_candidates = {board.board_id for board in boards if board.board_id}
        selected_board = payload.instrument_board_id or instrument.default_board_id
        if not selected_board:
            raise HTTPException(status_code=400, detail="instrument_board_id is required for MOEX items")
        if board_candidates and selected_board not in board_candidates:
            raise HTTPException(status_code=400, detail="Invalid instrument_board_id")
        instrument_board_id = selected_board
        position_lots = payload.position_lots
        lot_size = instrument.lot_size or details.get("lot_size") or 1
        face_value_cents = instrument.face_value_cents
        if instrument.currency_code and instrument.currency_code != payload.currency_code:
            raise HTTPException(status_code=400, detail="instrument currency must match item currency")
        currency_code = instrument.currency_code or payload.currency_code
    elif is_crypto:
        if not payload.instrument_id:
            raise HTTPException(status_code=400, detail="instrument_id is required for crypto items")
        if payload.quantity_units is None or payload.quantity_units < 0:
            raise HTTPException(status_code=400, detail="quantity_units is required for crypto items and must be >= 0")
        try:
            instrument, boards, details = resolve_coingecko_instrument(db, payload.instrument_id)
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        instrument_id = instrument.secid
        instrument_board_id = CRYPTO_BOARD_ID
        quantity_units = payload.quantity_units
        if payload.position_lots is not None:
            raise HTTPException(status_code=400, detail="position_lots is only allowed for MOEX items")
    else:
        if payload.instrument_id is not None:
            raise HTTPException(status_code=400, detail="instrument_id is only allowed for MOEX or crypto items")
        if payload.instrument_board_id is not None:
            raise HTTPException(status_code=400, detail="instrument_board_id is only allowed for MOEX items")
        if payload.position_lots is not None:
            raise HTTPException(status_code=400, detail="position_lots is only allowed for MOEX items")
        if payload.quantity_units is not None:
            raise HTTPException(status_code=400, detail="quantity_units is only allowed for crypto items")

    counterparty_id = None
    if payload.counterparty_id is not None:
        counterparty = db.get(Counterparty, payload.counterparty_id)
        if not counterparty:
            raise HTTPException(status_code=400, detail="Invalid counterparty_id")
        
        # Для банковских типов проверяем, что контрагент из отрасли "Банки"
        if payload.type_code in _BANK_COUNTERPARTY_TYPE_CODES:
            bank_industry_id = _get_bank_industry_id(db)
            if not bank_industry_id or counterparty.industry_id != bank_industry_id:
                raise HTTPException(
                    status_code=400,
                    detail="Counterparty must be a bank for bank-related item types.",
                )
        
        counterparty_id = counterparty.id
    elif payload.type_code in _MANDATORY_COUNTERPARTY_TYPE_CODES:
        raise HTTPException(
            status_code=400,
            detail="counterparty_id is required for this item type.",
        )

    card_account_id = _resolve_card_account_id(db, user, payload, counterparty_id)
    if (
        item.type_code == "bank_card"
        and payload.card_account_id is not None
        and card_account_id != item.card_account_id
    ):
        tx_exists = (
            db.query(Transaction.id)
            .filter(
                Transaction.user_id == user.id,
                Transaction.deleted_at.is_(None),
                or_(
                    Transaction.primary_item_id == item.id,
                    Transaction.counterparty_item_id == item.id,
                    Transaction.primary_card_item_id == item.id,
                    Transaction.counterparty_card_item_id == item.id,
                ),
            )
            .first()
        )
        if tx_exists and not purge_card_transactions:
            raise HTTPException(
                status_code=409,
                detail="Card has transactions. Confirm purge to change account link.",
            )
        if tx_exists:
            purge_card_transactions_fn(db, user, item.id)

    changing_instrument = instrument_id != item.instrument_id
    changing_position = position_lots is not None and position_lots != item.position_lots
    changing_quantity_units = quantity_units is not None and quantity_units != (item.quantity_units if item.quantity_units is not None else None)
    if changing_instrument or changing_position or (is_crypto and changing_quantity_units):
        tx_exists = (
            db.query(Transaction.id)
            .filter(
                Transaction.user_id == user.id,
                Transaction.deleted_at.is_(None),
                or_(
                    Transaction.primary_item_id == item.id,
                    Transaction.counterparty_item_id == item.id,
                    Transaction.primary_card_item_id == item.id,
                    Transaction.counterparty_card_item_id == item.id,
                ),
            )
            .first()
        )
        if tx_exists:
            raise HTTPException(
                status_code=409,
                detail="MOEX/crypto instrument or quantity can only be changed via transactions.",
            )

    card_kind, credit_limit, item_kind = _resolve_card_kind_and_limit(
        payload, existing_item=item
    )

    interest_payout_account_id = None
    if payload.interest_payout_account_id is not None:
        if payload.type_code not in {"deposit", "savings_account"}:
            raise HTTPException(
                status_code=400,
                detail="interest_payout_account_id is only allowed for deposit or savings_account.",
            )
        payout = db.get(Item, payload.interest_payout_account_id)
        if not payout or payout.user_id != user.id or payout.kind != "ASSET":
            raise HTTPException(status_code=400, detail="Invalid interest_payout_account_id")
        interest_payout_account_id = payout.id

    deposit_end_date = None
    if payload.type_code == "deposit" and payload.deposit_term_days:
        deposit_end_date = payload.open_date + timedelta(days=payload.deposit_term_days)

    new_history_status = _resolve_history_status(payload.open_date, accounting_start_date)
    opening_quantity_lots = payload.position_lots if is_moex else None
    has_opening_value = (
        (opening_quantity_lots is not None and opening_quantity_lots > 0)
        if is_moex
        else (quantity_units is not None and quantity_units > 0)
        if is_crypto
        else payload.initial_value_rub > 0
    )
    opening_price_cents = payload.opening_price_cents if (is_moex or is_crypto) else None
    opening_amount_rub = payload.initial_value_rub
    if is_moex and opening_price_cents is not None and opening_quantity_lots is not None:
        opening_amount_rub = int(opening_price_cents * opening_quantity_lots * (lot_size or 1))
    elif is_crypto and opening_price_cents is not None and quantity_units is not None and quantity_units > 0:
        opening_amount_rub = int(quantity_units * opening_price_cents)
    commission_requested = (
        payload.commission_enabled is not None
        or payload.commission_amount_rub is not None
        or payload.commission_payment_item_id is not None
    )
    commission_enabled = bool(payload.commission_enabled)
    commission_amount_rub = payload.commission_amount_rub
    commission_payment_item = None
    if commission_requested:
        if not is_moex and not is_crypto:
            raise HTTPException(
                status_code=400,
                detail="commission fields are only allowed for MOEX or crypto items",
            )
        if commission_enabled:
            if new_history_status != "NEW":
                raise HTTPException(
                    status_code=400,
                    detail="commission is only allowed for NEW MOEX or crypto items",
                )
            if is_moex and (opening_quantity_lots is None or opening_quantity_lots <= 0):
                raise HTTPException(
                    status_code=400,
                    detail="commission requires position_lots > 0",
                )
            if is_crypto and (quantity_units is None or quantity_units <= 0):
                raise HTTPException(
                    status_code=400,
                    detail="commission requires quantity_units > 0",
                )
            if commission_amount_rub is None or commission_amount_rub <= 0:
                raise HTTPException(
                    status_code=400,
                    detail="commission_amount_rub is required",
                )
            commission_payment_item = _resolve_commission_payment_item(
                db,
                user,
                payload.commission_payment_item_id,
            )
        else:
            if commission_amount_rub is not None or payload.commission_payment_item_id is not None:
                raise HTTPException(
                    status_code=400,
                    detail="commission fields require commission_enabled",
                )
    opening_counterparty = None
    if new_history_status == "NEW" and has_opening_value:
        opening_counterparty = _resolve_opening_counterparty(
            db,
            user,
            payload.opening_counterparty_item_id,
            currency_code,
        )

    open_date_changed = payload.open_date != item.open_date
    amount_changed = (
        (opening_quantity_lots != item.position_lots)
        if is_moex
        else (quantity_units != (item.quantity_units if item.quantity_units is not None else None))
        if is_crypto
        else payload.initial_value_rub != item.initial_value_rub
    )
    opening_counterparty_changed = (
        payload.opening_counterparty_item_id != item.opening_counterparty_item_id
    )
    history_changed = new_history_status != item.history_status
    should_rebuild_opening = (
        (item.history_status == "NEW" or new_history_status == "NEW")
        and (open_date_changed or amount_changed or opening_counterparty_changed or history_changed)
    )
    if is_moex and new_history_status == "NEW" and payload.opening_price_cents is not None:
        should_rebuild_opening = True
    if should_rebuild_opening:
        delete_opening_transactions(db, user, item.id)
    if commission_requested:
        delete_commission_transactions(db, user, item.id)

    # Для элементов, созданных в день начала учета, базовое значение - это initial_value_rub,
    # так как транзакции открытия не создаются. Для элементов, созданных после дня начала учета,
    # базовое значение - это 0, так как транзакция открытия обновит current_value_rub. У MARKET — всегда 0.
    patch_primary_value_kind = getattr(payload, "primary_value_kind", None)
    old_will_have_opening_tx = (
        item.history_status == "NEW"
        and item.open_date > accounting_start_date
    )
    old_base = 0 if old_will_have_opening_tx else item.initial_value_rub
    delta = item.current_value_rub - old_base
    new_will_have_opening_tx = (
        new_history_status == "NEW"
        and payload.open_date > accounting_start_date
    )
    new_base = (
        0
        if (new_will_have_opening_tx or patch_primary_value_kind == "MARKET")
        else payload.initial_value_rub
    )
    next_current_value = new_base + delta
    if is_moex:
        next_current_value = item.current_value_rub
    min_balance = -credit_limit if card_kind == "CREDIT" and credit_limit is not None else 0
    if not is_moex and next_current_value < min_balance:
        detail = "New initial value would make current balance negative."
        if min_balance < 0:
            detail = "New initial value would exceed the credit limit."
        raise HTTPException(status_code=400, detail=detail)

    item.kind = item_kind
    item.type_code = payload.type_code
    item.name = payload.name
    item.currency_code = currency_code
    item.counterparty_id = counterparty_id
    item.open_date = payload.open_date
    item.account_last7 = payload.account_last7
    item.contract_number = payload.contract_number
    item.card_last4 = payload.card_last4
    item.card_account_id = card_account_id
    item.card_kind = card_kind
    item.credit_limit = credit_limit
    item.deposit_term_days = payload.deposit_term_days
    item.deposit_end_date = deposit_end_date
    item.interest_rate = payload.interest_rate
    item.interest_payout_order = payload.interest_payout_order
    item.interest_capitalization = payload.interest_capitalization
    item.interest_payout_account_id = interest_payout_account_id
    item.instrument_id = instrument_id
    item.instrument_board_id = instrument_board_id
    if not (
        (is_moex or is_crypto)
        and new_history_status == "NEW"
        and has_opening_value
        and should_rebuild_opening
    ):
        item.position_lots = position_lots
        item.quantity_units = quantity_units
    item.lot_size = lot_size
    item.face_value_cents = face_value_cents
    item.initial_value_rub = (
        0
        if (is_moex or is_crypto or patch_primary_value_kind == "MARKET")
        else payload.initial_value_rub
    )
    item.current_value_rub = next_current_value
    item.start_date = accounting_start_date
    item.history_status = new_history_status
    item.opening_counterparty_item_id = (
        opening_counterparty.id if opening_counterparty else None
    )
    item.synonyms = getattr(payload, "synonyms", None) or []
    if getattr(payload, "primary_value_kind", None) is not None:
        item.primary_value_kind = payload.primary_value_kind
    acq_val = getattr(payload, "acquisition_value_rub", None)
    if (
        new_history_status == "HISTORICAL"
        and (patch_primary_value_kind == "MARKET" or is_moex or is_crypto)
        and acq_val is not None
    ):
        item.initial_acquisition_rub = acq_val

    settings = upsert_plan_settings(db, item, payload.plan_settings)
    is_plan_enabled = settings.enabled if settings else False
    new_signature = plan_signature(item, settings)

    if is_plan_enabled:
        if old_signature != new_signature:
            rebuild_item_chains(db, user, item, settings)
    elif was_plan_enabled:
        delete_auto_chains(db, user, item.id, keep_realized=True)

    if should_rebuild_opening and new_history_status == "NEW" and has_opening_value:
        create_opening_transactions(
            db=db,
            user=user,
            item=item,
            counterparty=opening_counterparty,
            amount_rub=opening_amount_rub,
            quantity_lots=opening_quantity_lots,
            quantity_units=quantity_units,
            deposit_end_date=deposit_end_date,
            plan_settings=settings,
        )

    if commission_requested and commission_enabled and commission_payment_item:
        instrument_label = item.instrument_id or item.name
        if item.instrument_id and item.name and item.name != item.instrument_id:
            instrument_label = f"{item.instrument_id} - {item.name}"
        create_commission_transaction(
            db=db,
            user=user,
            item=item,
            payment_item_id=commission_payment_item.id,
            amount_rub=commission_amount_rub or 0,
            tx_date=item.open_date,
            instrument_label=instrument_label,
        )

    # Для рыночных активов (MOEX/crypto) подставляем latest_market_value_rub
    if (is_moex or is_crypto) and item.instrument_id:
        try:
            price = _get_latest_market_price(db, item.instrument_id, item.instrument_board_id)
            value = _compute_market_value_rub(item, price, db)
            if value is None and is_crypto and item.instrument_id:
                try:
                    prices = get_simple_price([item.instrument_id], vs_currencies="usd")
                    data = prices.get(item.instrument_id) if isinstance(prices.get(item.instrument_id), dict) else None
                    usd_val = data.get("usd") if data else None
                    if usd_val is not None and isinstance(usd_val, (int, float)):
                        value = int(round(float(item.quantity_units or 0) * float(usd_val) * 100))
                except Exception:
                    pass
            if value is not None:
                setattr(item, "latest_market_value_rub", value)
        except Exception:
            pass

    db.commit()
    db.refresh(item)
    _apply_item_photo_url(item)
    return item


@app.post("/items/{item_id}/synonyms", response_model=ItemOut)
def add_item_synonyms(
    item_id: int,
    payload: ItemSynonymsAdd,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    item = db.get(Item, item_id)
    if not item or item.user_id != user.id:
        raise HTTPException(status_code=404, detail="Item not found")
    if item.archived_at is not None:
        raise HTTPException(status_code=400, detail="Cannot edit archived item")
    current = getattr(item, "synonyms", None) or []
    if not isinstance(current, list):
        current = []
    key_seen = {str(s).strip().lower() for s in current if isinstance(s, str) and str(s).strip()}
    to_add = []
    for s in payload.add:
        t = s.strip()
        key = t.lower()
        if key and key not in key_seen:
            to_add.append(t)
            key_seen.add(key)
    if to_add:
        new_list = current + to_add
        if len(new_list) > 50:
            raise HTTPException(
                status_code=400,
                detail="Не более 50 синонимов у актива/обязательства.",
            )
        item.synonyms = new_list
        db.commit()
        db.refresh(item)
    _apply_item_photo_url(item)
    return item


@app.patch("/items/{item_id}/archive", response_model=ItemOut)
def archive_item(
    item_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    item = db.get(Item, item_id)
    if not item or item.user_id != user.id:
        raise HTTPException(status_code=404, detail="Item not found")
    if item.type_code == COUNTERPARTY_SETTLEMENTS_TYPE:
        raise HTTPException(
            status_code=400,
            detail="Архивация актива «Взаиморасчёты» недоступна.",
        )

    if item.archived_at is None:
        item.archived_at = func.now()

    delete_auto_chains(db, user, item.id, keep_realized=True)

    db.commit()
    db.refresh(item)
    _apply_item_photo_url(item)
    return item

@app.patch("/items/{item_id}/close", response_model=ItemOut)
def close_item(
    item_id: int,
    close_cards: bool = False,
    payload: ItemCloseRequest | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    item = db.get(Item, item_id)
    if not item or item.user_id != user.id:
        raise HTTPException(status_code=404, detail="Item not found")
    if item.type_code == COUNTERPARTY_SETTLEMENTS_TYPE:
        raise HTTPException(
            status_code=400,
            detail="Закрытие актива «Взаиморасчёты» недоступно; статус меняется автоматически при нулевом балансе.",
        )
    if item.archived_at is not None:
        raise HTTPException(status_code=400, detail="Cannot close deleted item")
    
    # Merge close_cards from query param and body
    if payload:
        close_cards = payload.close_cards or close_cards
    
    # Check balance
    is_moex = is_moex_item(item)
    has_balance = False
    balance_amount = 0
    balance_lots = None
    
    if is_moex:
        balance_lots = item.position_lots or 0
        has_balance = balance_lots != 0
        if has_balance and item.instrument_board_id:
            price = _get_latest_market_price(db, item.instrument_id, item.instrument_board_id)
            if price:
                value = _compute_market_value_rub(item, price, db)
                if value is not None:
                    balance_amount = value
    else:
        balance_amount = item.current_value_rub
        has_balance = item.type_code != "bank_card" and balance_amount != 0
    
    # If balance is non-zero, require closing options
    if has_balance and not payload:
        raise HTTPException(
            status_code=400,
            detail="Item balance is non-zero. Closing options are required.",
        )
    
    # Handle closing with non-zero balance
    if has_balance and payload:
        closing_date = payload.closing_date or date_type.today()
        
        if payload.transfer_to_item_id:
            # Create transfer transaction
            target_item = db.get(Item, payload.transfer_to_item_id)
            if not target_item or target_item.user_id != user.id:
                raise HTTPException(status_code=400, detail="Invalid transfer_to_item_id")
            if target_item.id == item.id:
                raise HTTPException(status_code=400, detail="Cannot transfer to the same item")
            if target_item.archived_at is not None or target_item.closed_at is not None:
                raise HTTPException(status_code=400, detail="Target item is archived or closed")
            
            comment = f"Перевод с {item.name} при закрытии"
            
            if is_moex:
                # For MOEX items, transfer position_lots
                if item.kind == "ASSET":
                    primary_id = item.id
                    counter_id = target_item.id
                    primary_lots = balance_lots
                    counter_lots = balance_lots
                else:
                    primary_id = target_item.id
                    counter_id = item.id
                    primary_lots = balance_lots
                    counter_lots = balance_lots
                
                _create_transfer(
                    db=db,
                    user=user,
                    primary_item_id=primary_id,
                    counterparty_item_id=counter_id,
                    amount_rub=balance_amount,
                    tx_date=closing_date,
                    related_item_id=item.id,
                    source=AUTO_CLOSING_SOURCE,
                    comment=comment,
                    transaction_type="ACTUAL",
                    primary_quantity_lots=primary_lots,
                    counterparty_quantity_lots=counter_lots,
                    counterparty_id=item.counterparty_id,
                )
            else:
                # For non-MOEX items, transfer balance_amount
                if item.kind == "ASSET":
                    primary_id = item.id
                    counter_id = target_item.id
                else:
                    primary_id = target_item.id
                    counter_id = item.id
                
                _create_transfer(
                    db=db,
                    user=user,
                    primary_item_id=primary_id,
                    counterparty_item_id=counter_id,
                    amount_rub=balance_amount,
                    tx_date=closing_date,
                    related_item_id=item.id,
                    source=AUTO_CLOSING_SOURCE,
                    comment=comment,
                    transaction_type="ACTUAL",
                    counterparty_id=item.counterparty_id,
                )
        elif payload.write_off:
            # Create income/expense transaction
            if item.kind == "ASSET":
                direction = "EXPENSE"
                category_name = "Прочие расходы"
            else:
                direction = "INCOME"
                category_name = "Прочие доходы"
            
            comment = f"Списание остатка с {item.name} при закрытии"
            
            _create_income_expense(
                db=db,
                user=user,
                item_id=item.id,
                amount_rub=balance_amount,
                tx_date=closing_date,
                direction=direction,
                category_name=category_name,
                related_item_id=item.id,
                comment=comment,
                primary_quantity_lots=balance_lots if is_moex else None,
                source=AUTO_CLOSING_SOURCE,
                counterparty_id=item.counterparty_id,
            )
        else:
            raise HTTPException(
                status_code=400,
                detail="Either transfer_to_item_id or write_off must be specified.",
            )

    if item.type_code == "bank_account":
        linked_cards = (
            db.query(Item)
            .filter(
                Item.user_id == user.id,
                Item.card_account_id == item.id,
                Item.closed_at.is_(None),
                Item.archived_at.is_(None),
            )
            .all()
        )
        if linked_cards and not close_cards:
            raise HTTPException(
                status_code=409,
                detail="Account has active cards. Close cards first.",
            )
        if linked_cards and close_cards:
            now = func.now()
            for card in linked_cards:
                card.closed_at = now

    if item.closed_at is None:
        item.closed_at = func.now()

    delete_auto_chains(db, user, item.id, keep_realized=True)

    db.commit()
    db.refresh(item)
    _apply_item_photo_url(item)
    return item


def _compute_acquisition_cost_basis(
    db: Session,
    user_id: int,
    item_id: int,
    item: Item,
    up_to_date: date_type | None = None,
) -> int:
    """Стоимость приобретения.
    Для НОВОГО актива — сумма всех транзакций ASSET_PURCHASE (в т.ч. комиссии).
    Для ИСТОРИЧЕСКОГО: прочие активы — сумма покупок + initial_acquisition_rub;
    MOEX/crypto — средневзвешенная база по quantity + initial_acquisition_rub.
    Если up_to_date задана, учитываются только транзакции с датой <= up_to_date (для истории по датам).
    """
    history_status = getattr(item, "history_status", None) or "NEW"
    if history_status == "NEW":
        # Новый актив: стоимость приобретения = сумма всех транзакций «Приобретение актива».
        tx_q = (
            db.query(Transaction)
            .filter(
                Transaction.user_id == user_id,
                Transaction.related_item_id == item_id,
                Transaction.asset_link_type == "ASSET_PURCHASE",
                Transaction.transaction_type == "ACTUAL",
                Transaction.deleted_at.is_(None),
            )
        )
        if up_to_date is not None:
            tx_q = tx_q.filter(Transaction.transaction_date <= up_to_date)
        txs = tx_q.all()
        total = 0
        if txs:
            primary_ids = {t.primary_item_id for t in txs}
            primary_by_id: dict[int, str | None] = {}
            if primary_ids:
                rows = db.query(Item.id, Item.currency_code).filter(Item.id.in_(primary_ids)).all()
                primary_by_id = {row.id: row.currency_code for row in rows}
            item_currency = (item.currency_code or "RUB").upper()
            for tx in txs:
                rate_date = (
                    tx.transaction_date.date()
                    if hasattr(tx.transaction_date, "date")
                    else tx.transaction_date
                )
                from_currency = primary_by_id.get(tx.primary_item_id, item_currency)
                total += _convert_amount_between_currencies(
                    tx.amount_rub or 0,
                    from_currency,
                    item_currency,
                    rate_date,
                    db,
                )
        return total

    if not (is_moex_item(item) or is_crypto_item(item)):
        # Для прочих активов — сумма покупок, приведённая к валюте актива через FX + начальная стоимость приобретения (исторические MARKET).
        tx_q = (
            db.query(Transaction)
            .filter(
                Transaction.user_id == user_id,
                Transaction.related_item_id == item_id,
                Transaction.asset_link_type == "ASSET_PURCHASE",
                Transaction.transaction_type == "ACTUAL",
                Transaction.deleted_at.is_(None),
            )
        )
        if up_to_date is not None:
            tx_q = tx_q.filter(Transaction.transaction_date <= up_to_date)
        txs = tx_q.all()

        total = 0
        if txs:
            primary_ids = {t.primary_item_id for t in txs}
            primary_by_id: dict[int, str | None] = {}
            if primary_ids:
                rows = db.query(Item.id, Item.currency_code).filter(Item.id.in_(primary_ids)).all()
                primary_by_id = {row.id: row.currency_code for row in rows}

            item_currency = (item.currency_code or "RUB").upper()
            for tx in txs:
                rate_date = (
                    tx.transaction_date.date()
                    if hasattr(tx.transaction_date, "date")
                    else tx.transaction_date
                )
                from_currency = primary_by_id.get(tx.primary_item_id, item_currency)
                total += _convert_amount_between_currencies(
                    tx.amount_rub or 0,
                    from_currency,
                    item_currency,
                    rate_date,
                    db,
                )

        initial_acq = getattr(item, "initial_acquisition_rub", None) or 0
        return total + initial_acq

    txs = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == user_id,
            Transaction.related_item_id == item_id,
            Transaction.asset_link_type.in_(["ASSET_PURCHASE", "ASSET_SALE"]),
            Transaction.transaction_type == "ACTUAL",
            Transaction.deleted_at.is_(None),
        )
    )
    if is_moex_item(item):
        txs = txs.filter(Transaction.primary_quantity_lots.isnot(None))
    else:
        txs = txs.filter(Transaction.primary_quantity_units.isnot(None))
    if up_to_date is not None:
        txs = txs.filter(Transaction.transaction_date <= up_to_date)
    txs = txs.order_by(Transaction.transaction_date.asc(), Transaction.id.asc()).all()

    cost_basis: int = 0
    running_qty: int | float = 0

    initial_acq = getattr(item, "initial_acquisition_rub", None) or 0
    if initial_acq > 0:
        cost_basis += initial_acq
        if is_moex_item(item):
            # Начальное количество = текущее - куплено + продано (вычислим из транзакций)
            total_buy: int | float = sum((tx.primary_quantity_lots or 0) for tx in txs if tx.asset_link_type == "ASSET_PURCHASE")
            total_sell: int | float = sum((tx.primary_quantity_lots or 0) for tx in txs if tx.asset_link_type == "ASSET_SALE")
            current_qty = item.position_lots or 0
            running_qty = current_qty - total_buy + total_sell
        else:
            total_buy_c: float = sum(float(tx.primary_quantity_units or 0) for tx in txs if tx.asset_link_type == "ASSET_PURCHASE")
            total_sell_c: float = sum(float(tx.primary_quantity_units or 0) for tx in txs if tx.asset_link_type == "ASSET_SALE")
            current_qty_c = float(item.quantity_units or 0)
            running_qty = current_qty_c - total_buy_c + total_sell_c

    for tx in txs:
        if tx.asset_link_type == "ASSET_PURCHASE":
            cost_basis += tx.amount_rub or 0
            if is_moex_item(item):
                running_qty += tx.primary_quantity_lots or 0
            else:
                running_qty += float(tx.primary_quantity_units or 0)
        else:
            # ASSET_SALE
            if is_moex_item(item):
                qty_sold = tx.primary_quantity_lots or 0
            else:
                qty_sold = float(tx.primary_quantity_units or 0)
            if running_qty > 0 and qty_sold > 0:
                avg_price = cost_basis / running_qty
                cost_of_sold = qty_sold * avg_price
                cost_basis = int(round(cost_basis - cost_of_sold))
                running_qty -= qty_sold
            elif qty_sold > 0:
                running_qty -= qty_sold

    return max(0, cost_basis)


@app.get("/items/{item_id}/costs", response_model=ItemCostsOut)
def get_item_costs(
    item_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    item = db.get(Item, item_id)
    if not item or item.user_id != user.id:
        raise HTTPException(status_code=404, detail="Item not found")
    balance_rub = item.current_value_rub
    acquisition_rub = _compute_acquisition_cost_basis(db, user.id, item_id, item)
    # Investment: ASSET_INVESTMENT, приведённые к валюте актива
    inv_q = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == user.id,
            Transaction.related_item_id == item_id,
            Transaction.asset_link_type == "ASSET_INVESTMENT",
            Transaction.transaction_type == "ACTUAL",
            Transaction.deleted_at.is_(None),
        )
    )
    inv_txs = inv_q.all()
    investment_sum = 0
    if inv_txs:
        primary_ids = {t.primary_item_id for t in inv_txs}
        primary_by_id: dict[int, str | None] = {}
        if primary_ids:
            rows = db.query(Item.id, Item.currency_code).filter(Item.id.in_(primary_ids)).all()
            primary_by_id = {row.id: row.currency_code for row in rows}
        item_currency = (item.currency_code or "RUB").upper()
        for tx in inv_txs:
            rate_date = (
                tx.transaction_date.date()
                if hasattr(tx.transaction_date, "date")
                else tx.transaction_date
            )
            from_currency = primary_by_id.get(tx.primary_item_id, item_currency)
            investment_sum += _convert_amount_between_currencies(
                tx.amount_rub or 0,
                from_currency,
                item_currency,
                rate_date,
                db,
            )
    invested_rub = acquisition_rub + investment_sum
    market_rub = None
    if (is_moex_item(item) or is_crypto_item(item)) and item.instrument_id and item.instrument_board_id:
        try:
            price = _get_latest_market_price(db, item.instrument_id, item.instrument_board_id)
            if price:
                if is_crypto_item(item) and _get_market_price_usd_cents(db, price) is None:
                    try:
                        prices = get_simple_price([item.instrument_id], vs_currencies="usd")
                        data = prices.get(item.instrument_id) if isinstance(prices.get(item.instrument_id), dict) else None
                        usd_val = data.get("usd") if data else None
                        if usd_val is not None and isinstance(usd_val, (int, float)):
                            price_usd_cents = int(round(float(usd_val) * 100))
                            market_rub = int(round(float(item.quantity_units or 0) * price_usd_cents))
                    except Exception:
                        market_rub = _compute_market_value_rub(item, price, db)
                else:
                    market_rub = _compute_market_value_rub(item, price, db)
            elif is_crypto_item(item):
                try:
                    prices = get_simple_price([item.instrument_id], vs_currencies="usd")
                    data = prices.get(item.instrument_id) if isinstance(prices.get(item.instrument_id), dict) else None
                    usd_val = data.get("usd") if data else None
                    if usd_val is not None and isinstance(usd_val, (int, float)):
                        price_usd_cents = int(round(float(usd_val) * 100))
                        market_rub = int(round(float(item.quantity_units or 0) * price_usd_cents))
                except Exception:
                    pass
        except Exception:
            pass
    if market_rub is None:
        latest = (
            db.query(ItemMarketValue)
            .filter(
                ItemMarketValue.item_id == item_id,
                ItemMarketValue.user_id == user.id,
                ItemMarketValue.value_date <= date_type.today(),
            )
            .order_by(ItemMarketValue.value_date.desc())
            .limit(1)
            .first()
        )
        if latest:
            if getattr(latest, "value_currency_cents", None) is not None:
                market_rub = latest.value_currency_cents
            else:
                item_currency = (item.currency_code or "RUB").upper()
                if item_currency == "RUB":
                    market_rub = latest.value_rub
                else:
                    rate = _get_fx_rate_for_date(date_type.today(), item_currency, db)
                    if rate is not None and rate > 0:
                        market_rub = int(round(latest.value_rub / rate * 100))
                    else:
                        market_rub = latest.value_rub
    # Эквивалент рыночной стоимости в рублях: для валюты != RUB пересчитываем по курсу
    market_value_rub: int | None = None
    if market_rub is not None:
        item_currency = (item.currency_code or "RUB").upper()
        if item_currency == "RUB":
            market_value_rub = market_rub
        else:
            rate = _get_fx_rate_for_date(date_type.today(), item_currency, db)
            if rate is not None:
                # market_rub в наименьших единицах валюты (центы USD и т.д.)
                market_value_rub = int(round((market_rub / 100) * rate * 100))
            else:
                market_value_rub = market_rub  # fallback: показываем как есть
    # Доходы/расходы по активу в рублях (эквивалент суммы транзакций)
    def _sum_asset_link(asset_link_type: str) -> int:
        q = (
            db.query(Transaction)
            .filter(
                Transaction.user_id == user.id,
                Transaction.related_item_id == item_id,
                Transaction.asset_link_type == asset_link_type,
                Transaction.transaction_type == "ACTUAL",
                Transaction.deleted_at.is_(None),
            )
        )
        txs = q.all()
        if not txs:
            return 0
        primary_ids = {t.primary_item_id for t in txs}
        primary_by_id: dict[int, str | None] = {}
        if primary_ids:
            rows = db.query(Item.id, Item.currency_code).filter(Item.id.in_(primary_ids)).all()
            primary_by_id = {row.id: row.currency_code for row in rows}
        total = 0
        for tx in txs:
            rate_date = (
                tx.transaction_date.date()
                if hasattr(tx.transaction_date, "date")
                else tx.transaction_date
            )
            from_currency = primary_by_id.get(tx.primary_item_id, "RUB")
            total += _convert_amount_between_currencies(
                tx.amount_rub or 0,
                from_currency,
                "RUB",
                rate_date,
                db,
            )
        return total

    income_rub = _sum_asset_link("ASSET_INCOME")
    expense_rub = _sum_asset_link("ASSET_EXPENSE")
    return ItemCostsOut(
        balance_rub=balance_rub,
        acquisition_rub=acquisition_rub,
        invested_rub=invested_rub,
        market_rub=market_rub,
        market_value_rub=market_value_rub,
        income_rub=income_rub,
        expense_rub=expense_rub,
    )


def _build_item_cost_history(
    db: Session,
    user_id: int,
    item: Item,
    date_from: date_type,
    date_to: date_type,
) -> list[ItemCostHistoryPoint]:
    """Build daily cost history for one item from date_from to date_to (inclusive)."""
    item_id = item.id
    open_date = item.open_date
    if open_date > date_to:
        return []
    start = max(date_from, open_date)
    dates = []
    current = start
    while current <= date_to:
        dates.append(current.isoformat())
        current += timedelta(days=1)

    # Balance: replay all transactions where item is primary or counterparty
    balance_txs = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == user_id,
            Transaction.transaction_type == "ACTUAL",
            Transaction.deleted_at.is_(None),
            or_(
                Transaction.primary_item_id == item_id,
                Transaction.counterparty_item_id == item_id,
            ),
        )
        .order_by(Transaction.transaction_date.asc())
        .all()
    )
    primary_ids = {t.primary_item_id for t in balance_txs}
    counter_ids = {t.counterparty_item_id for t in balance_txs if t.counterparty_item_id is not None}
    all_ids = primary_ids | counter_ids
    items_by_id = {}
    if all_ids:
        item_rows = db.query(Item).filter(Item.id.in_(all_ids)).all()
        items_by_id = {r.id: r for r in item_rows}

    def balance_delta_for_item(tx: Transaction) -> int:
        amt = tx.amount_rub or 0
        amt_counter = tx.amount_counterparty if tx.amount_counterparty is not None else amt
        if tx.primary_item_id == item_id:
            if tx.direction == "INCOME":
                return amt
            if tx.direction == "EXPENSE":
                return -amt
            if tx.direction == "TRANSFER":
                primary = items_by_id.get(tx.primary_item_id)
                kind = primary.kind if primary else "ASSET"
                return transfer_delta(kind, True, amt)
        if tx.counterparty_item_id == item_id:
            if tx.direction == "TRANSFER":
                counter = items_by_id.get(tx.counterparty_item_id)
                kind = counter.kind if counter else "ASSET"
                return transfer_delta(kind, False, amt_counter)
        return 0

    # Market: for non-MOEX use manual ItemMarketValue; for MOEX use lots × price from API
    market_rows = (
        db.query(ItemMarketValue.value_date, ItemMarketValue.value_rub, ItemMarketValue.value_currency_cents)
        .filter(
            ItemMarketValue.item_id == item_id,
            ItemMarketValue.user_id == user_id,
            ItemMarketValue.value_date <= date_to,
        )
        .order_by(ItemMarketValue.value_date.asc())
        .all()
    )
    market_by_date = {}
    for row in market_rows:
        vc = getattr(row, "value_currency_cents", None)
        market_by_date[row.value_date.isoformat()] = (vc, row.value_rub)
    market_sorted_dates = sorted(market_by_date.keys())

    # For MOEX: ensure historical prices are loaded from MOEX ISS, then preload into dict
    moex_prices_by_date: dict[str, "MarketPrice"] = {}
    if is_moex_item(item) and item.instrument_id and item.instrument_board_id:
        try:
            ensure_moex_history_prices(db, item.instrument_id, item.instrument_board_id, start, date_to)
        except Exception as e:
            logging.warning(
                "ensure_moex_history_prices failed for item %s instrument_id=%s board_id=%s: %s",
                item.id, item.instrument_id, item.instrument_board_id, e,
            )
        all_prices = (
            db.query(MarketPrice)
            .filter(
                MarketPrice.instrument_id == item.instrument_id,
                MarketPrice.board_id == item.instrument_board_id,
                MarketPrice.price_date <= date_to,
            )
            .order_by(MarketPrice.price_date.asc())
            .all()
        )
        for p in all_prices:
            moex_prices_by_date[p.price_date.isoformat()] = p
    moex_sorted_keys = sorted(moex_prices_by_date.keys())

    # For MOEX: replay lot deltas to get position_lots per date
    lot_txs = []
    lot_initial = 0
    if is_moex_item(item) and item.instrument_id and item.instrument_board_id:
        lot_txs = (
            db.query(Transaction)
            .filter(
                Transaction.user_id == user_id,
                Transaction.related_item_id == item_id,
                Transaction.asset_link_type.in_(["ASSET_PURCHASE", "ASSET_SALE"]),
                Transaction.primary_quantity_lots.isnot(None),
                Transaction.transaction_type == "ACTUAL",
                Transaction.deleted_at.is_(None),
            )
            .order_by(Transaction.transaction_date.asc())
            .all()
        )
        current_lots = item.position_lots or 0
        total_delta = sum(
            (tx.primary_quantity_lots or 0) if tx.asset_link_type == "ASSET_PURCHASE" else -(tx.primary_quantity_lots or 0)
            for tx in lot_txs
        )
        lot_initial = current_lots - total_delta

    # For crypto: replay primary_quantity_units to get quantity_units per date
    crypto_units_txs = []
    units_initial: float = 0.0
    crypto_chart_prices: dict[str, float] = {}
    if is_crypto_item(item) and item.instrument_id:
        crypto_units_txs = (
            db.query(Transaction)
            .filter(
                Transaction.user_id == user_id,
                Transaction.related_item_id == item_id,
                Transaction.asset_link_type.in_(["ASSET_PURCHASE", "ASSET_SALE"]),
                Transaction.primary_quantity_units.isnot(None),
                Transaction.transaction_type == "ACTUAL",
                Transaction.deleted_at.is_(None),
            )
            .order_by(Transaction.transaction_date.asc())
            .all()
        )
        current_units = float(item.quantity_units or 0)
        total_units_delta = sum(
            (float(tx.primary_quantity_units or 0) if tx.asset_link_type == "ASSET_PURCHASE" else -float(tx.primary_quantity_units or 0))
            for tx in crypto_units_txs
        )
        units_initial = current_units - total_units_delta
        try:
            # Для крипты берём цены в USD, чтобы рыночная стоимость в истории была в валюте актива
            chart_data = get_market_chart_range(
                item.instrument_id, start, date_to, vs_currency="usd" if is_crypto_item(item) else "rub"
            )
            crypto_chart_prices = {d.isoformat(): p for d, p in chart_data}
        except Exception:
            pass

    result = []
    # Если есть транзакция открытия, начальный баланс уже учтён в ней — не дублируем initial_value_rub
    balance_cumul = (
        0
        if item.opening_counterparty_item_id is not None
        else item.initial_value_rub
    )
    balance_tx_index = 0
    lot_balance = lot_initial
    lot_tx_index = 0
    units_balance = units_initial
    units_tx_index = 0
    for d_str in dates:
        d = date_type.fromisoformat(d_str)
        while balance_tx_index < len(balance_txs):
            tx = balance_txs[balance_tx_index]
            tx_d = tx.transaction_date.date() if hasattr(tx.transaction_date, "date") else tx.transaction_date
            if tx_d > d:
                break
            balance_cumul += balance_delta_for_item(tx)
            balance_tx_index += 1

        while lot_tx_index < len(lot_txs):
            tx = lot_txs[lot_tx_index]
            tx_d = tx.transaction_date.date() if hasattr(tx.transaction_date, "date") else tx.transaction_date
            if tx_d > d:
                break
            delta = (tx.primary_quantity_lots or 0) if tx.asset_link_type == "ASSET_PURCHASE" else -(tx.primary_quantity_lots or 0)
            lot_balance += delta
            lot_tx_index += 1

        while units_tx_index < len(crypto_units_txs):
            tx = crypto_units_txs[units_tx_index]
            tx_d = tx.transaction_date.date() if hasattr(tx.transaction_date, "date") else tx.transaction_date
            if tx_d > d:
                break
            delta = (float(tx.primary_quantity_units or 0) if tx.asset_link_type == "ASSET_PURCHASE" else -float(tx.primary_quantity_units or 0))
            units_balance += delta
            units_tx_index += 1

        # Acquisition/Investment на дату d — через cost basis и ASSET_INVESTMENT, приведённые к валюте актива.
        acq_rub = _compute_acquisition_cost_basis(
            db, user_id, item_id, item, up_to_date=d
        )
        inv_txs = (
            db.query(Transaction)
            .filter(
                Transaction.user_id == user_id,
                Transaction.related_item_id == item_id,
                Transaction.asset_link_type == "ASSET_INVESTMENT",
                Transaction.transaction_type == "ACTUAL",
                Transaction.deleted_at.is_(None),
            )
        )
        inv_txs = inv_txs.filter(Transaction.transaction_date <= d).all()
        inv_extra = 0
        if inv_txs:
            primary_ids = {t.primary_item_id for t in inv_txs}
            primary_by_id: dict[int, str | None] = {}
            if primary_ids:
                rows = db.query(Item.id, Item.currency_code).filter(Item.id.in_(primary_ids)).all()
                primary_by_id = {row.id: row.currency_code for row in rows}
            item_currency = (item.currency_code or "RUB").upper()
            for tx in inv_txs:
                rate_date = (
                    tx.transaction_date.date()
                    if hasattr(tx.transaction_date, "date")
                    else tx.transaction_date
                )
                from_currency = primary_by_id.get(tx.primary_item_id, item_currency)
                inv_extra += _convert_amount_between_currencies(
                    tx.amount_rub or 0,
                    from_currency,
                    item_currency,
                    rate_date,
                    db,
                )
        invested_rub = acq_rub + inv_extra

        market_rub = None
        market_quantity_units = None
        market_price_rub = None
        if is_moex_item(item) and item.instrument_id and item.instrument_board_id:
            price = moex_prices_by_date.get(d_str)
            if price is None and moex_sorted_keys:
                idx = bisect.bisect_right(moex_sorted_keys, d_str) - 1
                if idx >= 0:
                    price = moex_prices_by_date[moex_sorted_keys[idx]]
                elif moex_sorted_keys:
                    price = moex_prices_by_date[moex_sorted_keys[0]]
            if price is not None and lot_balance is not None and lot_balance >= 0:
                class _ItemLike:
                    pass
                item_like = _ItemLike()
                item_like.position_lots = lot_balance
                item_like.lot_size = item.lot_size
                item_like.type_code = item.type_code
                item_like.face_value_cents = item.face_value_cents
                item_like.currency_code = item.currency_code or "RUB"
                market_rub = _compute_market_value_rub(item_like, price, db)
                lot_size = item.lot_size or 1
                units = lot_balance * lot_size
                if units > 0 and market_rub is not None:
                    market_quantity_units = units
                    market_price_rub = market_rub // units
            elif lot_balance is not None and lot_balance >= 0:
                # Количество на дату — даже без цены MOEX, чтобы «На начальную дату» отображалось верно
                lot_size = item.lot_size or 1
                units = int(lot_balance * lot_size)
                if units >= 0:
                    market_quantity_units = units
        elif is_crypto_item(item) and item.instrument_id and units_balance >= 0:
            # Для крипты crypto_chart_prices в USD (см. vs_currency выше); считаем в центах USD
            price_in_currency = crypto_chart_prices.get(d_str)
            if price_in_currency is None and crypto_chart_prices:
                sorted_dates = sorted(crypto_chart_prices.keys())
                for m_date in reversed(sorted_dates):
                    if m_date <= d_str:
                        price_in_currency = crypto_chart_prices[m_date]
                        break
                if price_in_currency is None and sorted_dates:
                    price_in_currency = crypto_chart_prices[sorted_dates[0]]
            if price_in_currency is not None and price_in_currency > 0:
                market_rub = int(round(units_balance * price_in_currency * 100))
                market_quantity_units = int(round(units_balance))
                market_price_rub = int(round(price_in_currency * 100))
            elif units_balance >= 0:
                # Количество на дату — даже без цены, чтобы «На начальную дату» отображалось верно
                market_quantity_units = int(round(units_balance))
        if market_rub is None:
            for m_date in reversed(market_sorted_dates):
                if m_date <= d_str:
                    vc, vr = market_by_date[m_date]
                    if vc is not None:
                        market_rub = vc
                    else:
                        item_currency = (item.currency_code or "RUB").upper()
                        if item_currency == "RUB":
                            market_rub = vr
                        else:
                            rate = _get_fx_rate_for_date(d, item_currency, db)
                            if rate is not None and rate > 0:
                                market_rub = int(round(vr / rate * 100))
                            else:
                                market_rub = vr
                    break

        result.append(
            ItemCostHistoryPoint(
                date=d_str,
                balance_rub=balance_cumul,
                acquisition_rub=acq_rub,
                invested_rub=invested_rub,
                market_rub=market_rub,
                market_quantity_units=market_quantity_units,
                market_price_rub=market_price_rub,
            )
        )
    return result


@app.get("/items/{item_id}/cost-history", response_model=ItemCostHistoryOut)
def get_item_cost_history(
    item_id: int,
    date_from: str | None = None,
    date_to: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    item = db.get(Item, item_id)
    if not item or item.user_id != user.id:
        raise HTTPException(status_code=404, detail="Item not found")
    open_date = item.open_date
    today = date_type.today()
    start = open_date
    if date_from:
        try:
            start = date_type.fromisoformat(date_from)
        except ValueError:
            pass
    start = max(start, open_date)
    end = today
    if date_to:
        try:
            end = date_type.fromisoformat(date_to)
        except ValueError:
            pass
    if start > end:
        return ItemCostHistoryOut(points=[])
    points = _build_item_cost_history(db, user.id, item, start, end)
    return ItemCostHistoryOut(points=points)


@app.get("/items/{item_id}/market-values", response_model=list[ItemMarketValueOut])
def list_item_market_values(
    item_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    item = db.get(Item, item_id)
    if not item or item.user_id != user.id:
        raise HTTPException(status_code=404, detail="Item not found")
    rows = (
        db.query(ItemMarketValue)
        .filter(ItemMarketValue.item_id == item_id, ItemMarketValue.user_id == user.id)
        .order_by(ItemMarketValue.value_date.asc())
        .all()
    )
    return [_item_market_value_to_out(r, item, db) for r in rows]


@app.post("/items/{item_id}/market-values", response_model=ItemMarketValueOut)
def create_item_market_value(
    item_id: int,
    payload: ItemMarketValueCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    item = db.get(Item, item_id)
    if not item or item.user_id != user.id:
        raise HTTPException(status_code=404, detail="Item not found")
    value_rub, value_currency_cents = _item_market_value_storage_from_payload(payload, item, db)
    existing = (
        db.query(ItemMarketValue)
        .filter(
            ItemMarketValue.item_id == item_id,
            ItemMarketValue.user_id == user.id,
            ItemMarketValue.value_date == payload.value_date,
        )
        .first()
    )
    if existing:
        existing.value_rub = value_rub
        existing.value_currency_cents = value_currency_cents
        db.commit()
        db.refresh(existing)
        return _item_market_value_to_out(existing, item, db)
    row = ItemMarketValue(
        user_id=user.id,
        item_id=item_id,
        value_date=payload.value_date,
        value_rub=value_rub,
        value_currency_cents=value_currency_cents,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _item_market_value_to_out(row, item, db)


@app.patch("/items/{item_id}/market-values/{mv_id}", response_model=ItemMarketValueOut)
def update_item_market_value(
    item_id: int,
    mv_id: int,
    payload: ItemMarketValueCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    item = db.get(Item, item_id)
    if not item or item.user_id != user.id:
        raise HTTPException(status_code=404, detail="Item not found")
    value_rub, value_currency_cents = _item_market_value_storage_from_payload(payload, item, db)
    row = (
        db.query(ItemMarketValue)
        .filter(
            ItemMarketValue.id == mv_id,
            ItemMarketValue.item_id == item_id,
            ItemMarketValue.user_id == user.id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Market value record not found")
    row.value_date = payload.value_date
    row.value_rub = value_rub
    row.value_currency_cents = value_currency_cents
    db.commit()
    db.refresh(row)
    return _item_market_value_to_out(row, item, db)


@app.delete("/items/{item_id}/market-values/{mv_id}", status_code=204)
def delete_item_market_value(
    item_id: int,
    mv_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    item = db.get(Item, item_id)
    if not item or item.user_id != user.id:
        raise HTTPException(status_code=404, detail="Item not found")
    row = (
        db.query(ItemMarketValue)
        .filter(
            ItemMarketValue.id == mv_id,
            ItemMarketValue.item_id == item_id,
            ItemMarketValue.user_id == user.id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Market value record not found")
    db.delete(row)
    db.commit()
    return None


@app.get("/items/{item_id}/photo")
def get_item_photo(
    item_id: int,
    db: Session = Depends(get_db),
):
    item = db.get(Item, item_id)
    if not item or not item.photo_data:
        raise HTTPException(status_code=404, detail="Photo not found.")
    media_type = item.photo_mime or "application/octet-stream"
    return Response(content=item.photo_data, media_type=media_type)


@app.post("/items/{item_id}/photo", response_model=ItemOut)
async def upload_item_photo(
    item_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    item = db.get(Item, item_id)
    if not item or item.user_id != user.id:
        raise HTTPException(status_code=404, detail="Item not found.")
    if item.archived_at is not None:
        raise HTTPException(status_code=400, detail="Cannot edit archived item.")

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Файл не загружен.")
    if len(data) > MAX_ITEM_PHOTO_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"Размер фотографии не должен превышать {MAX_ITEM_PHOTO_BYTES // (1024 * 1024)} МБ.",
        )

    try:
        image = Image.open(BytesIO(data))
        image.verify()
        image = Image.open(BytesIO(data))
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Неверный формат изображения.") from exc

    if image.format not in ALLOWED_ITEM_PHOTO_FORMATS:
        raise HTTPException(status_code=400, detail="Недопустимый формат изображения.")

    width, height = image.size
    if width > MAX_ITEM_PHOTO_DIM or height > MAX_ITEM_PHOTO_DIM:
        raise HTTPException(
            status_code=400,
            detail=f"Разрешение фотографии не должно превышать {MAX_ITEM_PHOTO_DIM}px.",
        )

    item.photo_mime = _FORMAT_TO_MIME[image.format]
    item.photo_data = data
    item.photo_updated_at = func.now()
    db.commit()
    db.refresh(item)
    _apply_item_photo_url(item)
    return item


@app.get("/items/archived", response_model=list[ItemOut])
def list_archived_items(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):

    stmt = select(Item).where(
        Item.user_id == user.id,
        Item.archived_at.is_(None),
    )
    return db.scalars(stmt).all()
