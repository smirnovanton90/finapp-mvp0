from fastapi import FastAPI, Depends, HTTPException
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
import requests
from sqlalchemy.orm import Session
from sqlalchemy import select
from sqlalchemy import func

from db import get_db
from models import Item, User, Currency
from schemas import ItemCreate, ItemOut, CurrencyOut, FxRateOut
from auth import get_current_user

from transactions import router as transactions_router

app = FastAPI(title="FinApp API", version="0.1.0")

_FX_CACHE: dict[str, tuple[datetime, list[FxRateOut]]] = {}
_FX_CACHE_TTL = timedelta(hours=1)

app.include_router(transactions_router)

from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _fetch_cbr_rates(date_req: str | None) -> list[FxRateOut]:
    params = {"date_req": date_req} if date_req else None
    response = requests.get("https://cbr.ru/scripts/XML_daily.asp", params=params, timeout=20)
    response.raise_for_status()

    root = ET.fromstring(response.content)
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
    return rates


def _get_fx_rates(date_req: str | None) -> list[FxRateOut]:
    cache_key = date_req or "latest"
    cached = _FX_CACHE.get(cache_key)
    now = datetime.utcnow()

    if cached and (now - cached[0]) < _FX_CACHE_TTL:
        return cached[1]

    rates = _fetch_cbr_rates(date_req)
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


@app.get("/fx-rates", response_model=list[FxRateOut])
def list_fx_rates(
    date_req: str | None = None,
    user: User = Depends(get_current_user),
):
    try:
        return _get_fx_rates(date_req)
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/items", response_model=ItemOut)
def create_item(
    payload: ItemCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    item = Item(
        user_id=user.id,
        kind=payload.kind,
        type_code=payload.type_code,
        name=payload.name,
        currency_code=payload.currency_code,
        initial_value_rub=payload.initial_value_rub,
        current_value_rub=payload.initial_value_rub,
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
