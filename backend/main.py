from fastapi import FastAPI, Depends, HTTPException, UploadFile, File
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, date as date_type
import requests
from pathlib import Path
from io import BytesIO
from PIL import Image
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import select, delete, func, or_, text
from sqlalchemy.exc import SQLAlchemyError

from db import get_db
from models import (
    Item,
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
)
from auth import get_current_user, create_access_token, hash_password, verify_password

from transactions import (
    router as transactions_router,
    purge_card_transactions as purge_card_transactions_fn,
)
from transaction_chains import router as transaction_chains_router
from categories import router as categories_router
from limits import router as limits_router
from counterparties import router as counterparties_router
from market import router as market_router, resolve_market_instrument
from onboarding import router as onboarding_router
from market_utils import is_moex_item, is_moex_type
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

app = FastAPI(title="FinApp API", version="0.1.0")

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
app.include_router(limits_router)
app.include_router(counterparties_router)
app.include_router(market_router)
app.include_router(onboarding_router)

UPLOADS_DIR = Path(__file__).resolve().parent / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")

from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
    rates = _get_fx_rates(date_req, db)
    for rate in rates:
        if rate.char_code == currency_code:
            return rate.rate
    return None


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


def _compute_market_value_rub(
    item: Item,
    price: MarketPrice | None,
    db: Session,
) -> int | None:
    if not price:
        return None
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


def _apply_logo_url(counterparty: Counterparty) -> None:
    counterparty.logo_url = (
        f"{settings.public_base_url}/counterparties/{counterparty.id}/logo"
        if counterparty.logo_data
        else None
    )


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
    if user.accounting_start_date is not None:
        raise HTTPException(status_code=400, detail="Accounting start date is already set.")
    if payload.accounting_start_date > date_type.today():
        raise HTTPException(
            status_code=400,
            detail="Accounting start date cannot be later than today.",
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
        if not is_moex_item(item):
            continue
        price = _get_latest_market_price(db, item.instrument_id, item.instrument_board_id)
        value = _compute_market_value_rub(item, price, db)
        if value is not None:
            item.current_value_rub = value
    return items


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
        Counterparty.ogrn.isnot(None),
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


@app.post("/items", response_model=ItemOut)
def create_item(
    payload: ItemCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    accounting_start_date = _ensure_accounting_start_date(user)
    is_moex = is_moex_type(payload.type_code)
    instrument_id = None
    instrument_board_id = None
    position_lots = None
    lot_size = None
    face_value_cents = None
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
    else:
        if payload.instrument_id is not None:
            raise HTTPException(status_code=400, detail="instrument_id is only allowed for MOEX items")
        if payload.instrument_board_id is not None:
            raise HTTPException(status_code=400, detail="instrument_board_id is only allowed for MOEX items")
        if payload.position_lots is not None:
            raise HTTPException(status_code=400, detail="position_lots is only allowed for MOEX items")
        if payload.opening_price_cents is not None:
            raise HTTPException(status_code=400, detail="opening_price_cents is only allowed for MOEX items")
        if (
            payload.commission_enabled is not None
            or payload.commission_amount_rub is not None
            or payload.commission_payment_item_id is not None
        ):
            raise HTTPException(
                status_code=400,
                detail="commission fields are only allowed for MOEX items",
            )
        if payload.opening_price_cents is not None:
            raise HTTPException(status_code=400, detail="opening_price_cents is only allowed for MOEX items")
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
        opening_quantity_lots is not None and opening_quantity_lots > 0
        if is_moex
        else payload.initial_value_rub > 0
    )
    opening_price_cents = payload.opening_price_cents if is_moex else None
    opening_amount_rub = payload.initial_value_rub
    if is_moex and opening_price_cents is not None and opening_quantity_lots is not None:
        opening_amount_rub = int(opening_price_cents * opening_quantity_lots * (lot_size or 1))
    commission_requested = (
        payload.commission_enabled is not None
        or payload.commission_amount_rub is not None
        or payload.commission_payment_item_id is not None
    )
    commission_enabled = bool(payload.commission_enabled)
    commission_amount_rub = payload.commission_amount_rub
    commission_payment_item = None
    if commission_requested:
        if not is_moex:
            raise HTTPException(
                status_code=400,
                detail="commission fields are only allowed for MOEX items",
            )
        if commission_enabled:
            if history_status != "NEW":
                raise HTTPException(
                    status_code=400,
                    detail="commission is only allowed for NEW MOEX items",
                )
            if opening_quantity_lots is None or opening_quantity_lots <= 0:
                raise HTTPException(
                    status_code=400,
                    detail="commission requires position_lots > 0",
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
    if payload.initial_value_rub < min_balance:
        detail = "Initial balance must be non-negative."
        if min_balance < 0:
            detail = "Initial balance cannot be below credit limit."
        raise HTTPException(status_code=400, detail=detail)

    # Для элементов, созданных в день начала учета, current_value_rub должен быть равен initial_value_rub,
    # так как транзакции открытия не создаются (create_opening_transactions возвращается раньше).
    # Для элементов, созданных после дня начала учета, current_value_rub устанавливается в 0,
    # и транзакция открытия обновит его.
    will_create_opening_tx = (
        history_status == "NEW"
        and has_opening_value
        and payload.open_date > accounting_start_date
    )
    initial_current_value_rub = (
        0 if will_create_opening_tx else payload.initial_value_rub
    )

    item = Item(
        user_id=user.id,
        kind=item_kind,
        type_code=payload.type_code,
        name=payload.name,
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
        initial_value_rub=payload.initial_value_rub,
        current_value_rub=initial_current_value_rub,
        start_date=accounting_start_date,
        history_status=history_status,
        opening_counterparty_item_id=opening_counterparty.id
        if opening_counterparty
        else None,
    )
    db.add(item)
    db.flush()

    settings = upsert_plan_settings(db, item, payload.plan_settings)
    if settings and settings.enabled:
        create_item_chains(db, user, item, settings)

    if history_status == "NEW" and has_opening_value:
        create_opening_transactions(
            db=db,
            user=user,
            item=item,
            counterparty=opening_counterparty,
            amount_rub=opening_amount_rub,
            quantity_lots=opening_quantity_lots,
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

    if is_moex and item.instrument_id:
        price = _get_latest_market_price(db, item.instrument_id, item.instrument_board_id)
        value = _compute_market_value_rub(item, price, db)
        if value is not None:
            item.current_value_rub = value

    db.commit()
    db.refresh(item)
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
    if item.archived_at is not None:
        raise HTTPException(status_code=400, detail="Cannot edit archived item")
    if item.closed_at is not None:
        raise HTTPException(status_code=400, detail="Cannot edit closed item")

    accounting_start_date = _ensure_accounting_start_date(user)
    existing_settings = item.plan_settings
    old_signature = plan_signature(item, existing_settings)
    was_plan_enabled = existing_settings.enabled if existing_settings else False
    is_moex = is_moex_type(payload.type_code)
    instrument_id = None
    instrument_board_id = None
    position_lots = None
    lot_size = None
    face_value_cents = None
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
    else:
        if payload.instrument_id is not None:
            raise HTTPException(status_code=400, detail="instrument_id is only allowed for MOEX items")
        if payload.instrument_board_id is not None:
            raise HTTPException(status_code=400, detail="instrument_board_id is only allowed for MOEX items")
        if payload.position_lots is not None:
            raise HTTPException(status_code=400, detail="position_lots is only allowed for MOEX items")

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
    if changing_instrument or changing_position:
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
                detail="MOEX instrument/position can only be changed via transactions.",
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
        opening_quantity_lots is not None and opening_quantity_lots > 0
        if is_moex
        else payload.initial_value_rub > 0
    )
    opening_price_cents = payload.opening_price_cents if is_moex else None
    opening_amount_rub = payload.initial_value_rub
    if is_moex and opening_price_cents is not None and opening_quantity_lots is not None:
        opening_amount_rub = int(opening_price_cents * opening_quantity_lots * (lot_size or 1))
    commission_requested = (
        payload.commission_enabled is not None
        or payload.commission_amount_rub is not None
        or payload.commission_payment_item_id is not None
    )
    commission_enabled = bool(payload.commission_enabled)
    commission_amount_rub = payload.commission_amount_rub
    commission_payment_item = None
    if commission_requested:
        if not is_moex:
            raise HTTPException(
                status_code=400,
                detail="commission fields are only allowed for MOEX items",
            )
        if commission_enabled:
            if new_history_status != "NEW":
                raise HTTPException(
                    status_code=400,
                    detail="commission is only allowed for NEW MOEX items",
                )
            if opening_quantity_lots is None or opening_quantity_lots <= 0:
                raise HTTPException(
                    status_code=400,
                    detail="commission requires position_lots > 0",
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
        opening_quantity_lots != item.position_lots
        if is_moex
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
    # базовое значение - это 0, так как транзакция открытия обновит current_value_rub.
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
    new_base = 0 if new_will_have_opening_tx else payload.initial_value_rub
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
        is_moex
        and new_history_status == "NEW"
        and has_opening_value
        and should_rebuild_opening
    ):
        item.position_lots = position_lots
    item.lot_size = lot_size
    item.face_value_cents = face_value_cents
    item.initial_value_rub = payload.initial_value_rub
    item.current_value_rub = next_current_value
    item.start_date = accounting_start_date
    item.history_status = new_history_status
    item.opening_counterparty_item_id = (
        opening_counterparty.id if opening_counterparty else None
    )

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

    if is_moex and item.instrument_id:
        price = _get_latest_market_price(db, item.instrument_id, item.instrument_board_id)
        value = _compute_market_value_rub(item, price, db)
        if value is not None:
            item.current_value_rub = value

    db.commit()
    db.refresh(item)
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

    if item.archived_at is None:
        item.archived_at = func.now()

    delete_auto_chains(db, user, item.id, keep_realized=True)

    db.commit()
    db.refresh(item)
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
                    linked_item_id=item.id,
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
                    linked_item_id=item.id,
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
                linked_item_id=item.id,
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
    return item

@app.get("/items/archived", response_model=list[ItemOut])
def list_archived_items(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):

    stmt = select(Item).where(
        Item.user_id == user.id,
        or_(
            Item.is_archived == False,
            Item.is_archived.is_(None),
        )
    )
    return db.scalars(stmt).all()
