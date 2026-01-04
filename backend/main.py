from fastapi import FastAPI, Depends, HTTPException
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, date as date_type
import requests
from sqlalchemy.orm import Session
from sqlalchemy import select, delete, func
from sqlalchemy.exc import SQLAlchemyError

from db import get_db
from models import Item, User, Currency, FxRate, Bank
from schemas import ItemCreate, ItemOut, CurrencyOut, FxRateOut, BankOut
from auth import get_current_user

from transactions import router as transactions_router
from transaction_chains import router as transaction_chains_router

app = FastAPI(title="FinApp API", version="0.1.0")

_FX_CACHE: dict[str, tuple[datetime, list[FxRateOut]]] = {}
_FX_CACHE_TTL = timedelta(hours=1)
_BANK_LICENSE_STATUSES = ("Действующая", "Отозванная")
_BANK_TYPE_CODES = {
    "bank_account",
    "bank_card",
    "deposit",
    "savings_account",
    "brokerage",
    "credit_card_debt",
    "consumer_loan",
    "mortgage",
    "car_loan",
}

app.include_router(transactions_router)
app.include_router(transaction_chains_router)

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

@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/items", response_model=list[ItemOut])
def list_items(
    include_archived: bool = False,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = select(Item).where(Item.user_id == user.id)

    if not include_archived:
        stmt = stmt.where(Item.archived_at.is_(None))

    stmt = stmt.order_by(Item.created_at.desc())
    return list(db.execute(stmt).scalars())


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
    stmt = select(Bank).where(Bank.license_status.in_(_BANK_LICENSE_STATUSES))
    if q:
        stmt = stmt.where(Bank.name.ilike(f"%{q}%"))
    stmt = stmt.order_by(Bank.name.asc())
    return list(db.execute(stmt).scalars())


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


@app.post("/items", response_model=ItemOut)
def create_item(
    payload: ItemCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    bank_id = None
    if payload.bank_id is not None:
        if payload.type_code not in _BANK_TYPE_CODES:
            raise HTTPException(
                status_code=400,
                detail="bank_id is only allowed for bank-related item types.",
            )
        bank = db.get(Bank, payload.bank_id)
        if not bank:
            raise HTTPException(status_code=400, detail="Invalid bank_id")
        bank_id = bank.id

    card_account_id = None
    if payload.card_account_id is not None:
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
        card_account_id = linked.id

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
    if payload.type_code == "deposit" and payload.open_date and payload.deposit_term_days:
        deposit_end_date = payload.open_date + timedelta(days=payload.deposit_term_days)

    item = Item(
        user_id=user.id,
        kind=payload.kind,
        type_code=payload.type_code,
        name=payload.name,
        currency_code=payload.currency_code,
        bank_id=bank_id,
        open_date=payload.open_date,
        account_last7=payload.account_last7,
        contract_number=payload.contract_number,
        card_last4=payload.card_last4,
        card_account_id=card_account_id,
        deposit_term_days=payload.deposit_term_days,
        deposit_end_date=deposit_end_date,
        interest_rate=payload.interest_rate,
        interest_payout_order=payload.interest_payout_order,
        interest_capitalization=payload.interest_capitalization,
        interest_payout_account_id=interest_payout_account_id,
        initial_value_rub=payload.initial_value_rub,
        current_value_rub=payload.initial_value_rub,
        start_date=payload.start_date,
    )
    db.add(item)
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
