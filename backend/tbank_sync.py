"""Synchronize T-Invest data: accounts, positions (MOEX instruments), cash-flow operations."""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from category_service import resolve_category_or_none
from integration_token_crypto import decrypt_token, encrypt_token
from market import resolve_market_instrument
from models import (
    BrokerAccountLink,
    BrokerImportedOperation,
    BrokerPositionLink,
    Category,
    Counterparty,
    Currency,
    Item,
    Transaction,
    User,
    UserIntegration,
)
from tbank_invest_client import (
    account_id,
    account_name,
    account_type,
    account_opened_date_iso,
    account_status,
    currency_iso_from_currency_instrument,
    get_accounts,
    get_currency_by_figi,
    get_info,
    get_instrument_by_figi,
    get_operations,
    get_portfolio,
    get_positions,
    money_to_kopecks,
    tbank_instrument_display_name,
    operation_date_iso,
    operation_id,
    operation_payment_field_abs_kopecks,
    operation_payment_kopecks,
    operation_type,
    position_figi,
    tbank_base_url,
)
from schemas import (
    TbankAccountOut,
    TbankCompleteImportIn,
    TbankInfoOut,
    TbankOperationsPreviewOut,
    TbankOperationsPreviewResponse,
    TransactionCreate,
)
from transactions import _create_transaction_impl

logger = logging.getLogger(__name__)

PROVIDER_TBANK = "TBANK_INVEST"

TBANK_COUNTERPARTY_INN = "7710140679"
TBANK_IMPORT_SOURCE = "TBANK_IMPORT"
# Новые транзакции с импорта — в UI «Неподтверждена» (TransactionStatus.UNCONFIRMED).
TBANK_IMPORT_TX_STATUS = "UNCONFIRMED"


_ALLOWED_OPERATION_TYPES = frozenset(
    {
        "OPERATION_TYPE_BUY",
        "OPERATION_TYPE_BUY_CARD",
        "OPERATION_TYPE_BUY_MARGIN",
        "OPERATION_TYPE_DELIVERY_BUY",
        "OPERATION_TYPE_SELL",
        "OPERATION_TYPE_SELL_CARD",
        "OPERATION_TYPE_SELL_MARGIN",
        "OPERATION_TYPE_DELIVERY_SELL",
        "OPERATION_TYPE_COUPON",
        "OPERATION_TYPE_DIVIDEND",
        "OPERATION_TYPE_INPUT",
        "OPERATION_TYPE_OUTPUT",
        "OPERATION_TYPE_BROKER_FEE",
        "OPERATION_TYPE_SERVICE_FEE",
        "OPERATION_TYPE_TAX",
        "OPERATION_TYPE_TAX_CORRECTION",
        "OPERATION_TYPE_DIVIDEND_TAX",
    }
)

# For initial positions before accounting start (MVP scope per TЗ)
_INITIAL_POSITION_OPERATION_TYPES = frozenset(
    {
        "OPERATION_TYPE_BUY",
        "OPERATION_TYPE_BUY_CARD",
        "OPERATION_TYPE_BUY_MARGIN",
        "OPERATION_TYPE_DELIVERY_BUY",
        "OPERATION_TYPE_SELL",
        "OPERATION_TYPE_SELL_CARD",
        "OPERATION_TYPE_SELL_MARGIN",
        "OPERATION_TYPE_DELIVERY_SELL",
    }
)

_TBANK_CURRENCY_BUY_TYPES = frozenset(
    {
        "OPERATION_TYPE_BUY",
        "OPERATION_TYPE_BUY_CARD",
        "OPERATION_TYPE_BUY_MARGIN",
        "OPERATION_TYPE_DELIVERY_BUY",
    }
)
_TBANK_CURRENCY_SELL_TYPES = frozenset(
    {
        "OPERATION_TYPE_SELL",
        "OPERATION_TYPE_SELL_CARD",
        "OPERATION_TYPE_SELL_MARGIN",
        "OPERATION_TYPE_DELIVERY_SELL",
    }
)

_TBANK_ACCOUNT_TYPE_LABELS: dict[str, str] = {
    "ACCOUNT_TYPE_UNSPECIFIED": "Тип аккаунта не определён",
    "ACCOUNT_TYPE_TINKOFF": "Брокерский счёт Т-Инвестиций",
    "ACCOUNT_TYPE_TINKOFF_IIS": "ИИС",
    "ACCOUNT_TYPE_INVEST_BOX": "Инвесткопилка",
    "ACCOUNT_TYPE_INVEST_FUND": "Фонд денежного рынка",
    "ACCOUNT_TYPE_DEBIT": "Дебетовый карточный счёт",
    "ACCOUNT_TYPE_SAVING": "Накопительный счёт",
    "ACCOUNT_TYPE_DFA": "Смарт-счёт",
}


def _utc_iso_z(dt: datetime) -> str:
    """UTC для T-Invest REST: суффикс Z (часто стабильнее, чем +00:00)."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%S") + "Z"

# Skip trade-like operations (positions are synced separately).
_SKIP_OPERATION_TYPES = frozenset(
    {
        "OPERATION_TYPE_BUY",
        "OPERATION_TYPE_SELL",
        "OPERATION_TYPE_BUY_CARD",
    }
)

# Числовые OperationType из proto (REST может отдавать type как число, не строку).
_SKIP_TRADE_OPERATION_ENUM = frozenset(
    {
        7,  # SELL_CARD
        15,  # BUY
        16,  # BUY_CARD
        18,  # SELL_MARGIN
        20,  # BUY_MARGIN
        22,  # SELL
        28,  # DELIVERY_BUY
        29,  # DELIVERY_SELL
    }
)


def _default_category_id(db: Session, user: User, direction: str) -> int | None:
    scope_filter = "INCOME" if direction == "INCOME" else "EXPENSE"
    row = (
        db.query(Category.id)
        .filter(
            Category.archived_at.is_(None),
            or_(Category.owner_user_id.is_(None), Category.owner_user_id == user.id),
            or_(Category.scope == scope_filter, Category.scope == "BOTH"),
        )
        .order_by(Category.id.asc())
        .first()
    )
    return int(row[0]) if row else None


def _map_tbank_instrument_to_type_code(inst: dict[str, Any]) -> str:
    raw = (
        str(inst.get("instrumentType") or inst.get("InstrumentType") or "")
        .upper()
    )
    if "BOND" in raw:
        return "bonds"
    if "ETF" in raw or "EUFUND" in raw:
        return "etf"
    if "SHARE" in raw or "STOCK" in raw:
        return "securities"
    return "securities"


def _parse_ts(s: str | None) -> datetime:
    if not s:
        return datetime.now(timezone.utc)
    s = s.strip()
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        return datetime.now(timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _position_quantity_lots(pos: dict[str, Any]) -> int:
    q = pos.get("quantityLots") or pos.get("QuantityLots") or pos.get("quantity") or pos.get("balance")
    if q is None:
        return 0
    try:
        return int(str(q).split(".")[0])
    except (TypeError, ValueError):
        return 0


def _portfolio_positions_by_figi(portfolio: dict[str, Any]) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for key in ("positions", "Positions"):
        block = portfolio.get(key)
        if not isinstance(block, list):
            continue
        for p in block:
            if not isinstance(p, dict):
                continue
            f = str(p.get("figi") or p.get("Figi") or "")
            if f:
                out[f] = p
    return out


def _estimate_position_value_rub_kopecks(
    pos: dict[str, Any],
    ppos: dict[str, Any] | None,
    *,
    qty_lots: int,
    lot_size: int,
) -> int:
    """Price per unit (kopecks) × pieces; falls back to average price."""
    block = None
    for src in (ppos, pos):
        if not src:
            continue
        for key in ("currentPrice", "CurrentPrice", "averagePositionPrice", "AveragePositionPrice"):
            b = src.get(key)
            if isinstance(b, dict) and (b.get("units") is not None or b.get("nano") is not None):
                block = b
                break
        if block:
            break
    price_kop = money_to_kopecks(block) if block else 0
    pieces = max(0, qty_lots) * max(1, lot_size)
    return max(0, price_kop * pieces)


def _reaggregate_item_position_totals(db: Session, item_id: int) -> None:
    """Сумма снимков по всем связям брокера → поля позиции на Item."""
    item = db.get(Item, item_id)
    if not item:
        return
    row = (
        db.query(
            func.coalesce(func.sum(BrokerPositionLink.sync_position_lots), 0),
            func.coalesce(func.sum(BrokerPositionLink.sync_value_rub_kopecks), 0),
        )
        .filter(BrokerPositionLink.item_id == item_id)
        .one()
    )
    total_lots = int(row[0] or 0)
    total_val = int(row[1] or 0)
    item.position_lots = max(0, total_lots)
    item.current_value_rub = max(0, total_val)


def _ensure_broker_position_link(
    db: Session,
    integration: UserIntegration,
    external_account_id: str,
    figi: str,
    item_id: int,
) -> None:
    """Связь FIGI позиции со счётом интеграции (импорт без sync_positions). Не вызывает reaggregate."""
    fid = (figi or "").strip()
    if not fid:
        return
    exists = (
        db.query(BrokerPositionLink.id)
        .filter(
            BrokerPositionLink.integration_id == integration.id,
            BrokerPositionLink.external_account_id == external_account_id,
            BrokerPositionLink.figi == fid,
        )
        .first()
    )
    if exists:
        return
    db.add(
        BrokerPositionLink(
            integration_id=integration.id,
            external_account_id=external_account_id,
            figi=fid,
            item_id=item_id,
            sync_position_lots=0,
            sync_value_rub_kopecks=0,
        )
    )


def _get_or_create_moex_position_item(
    db: Session,
    user: User,
    *,
    type_code: str,
    name: str,
    instrument,
    boards,
    details: dict[str, Any],
    open_date: date,
    accounting_start: date,
) -> Item:
    """Один Item на (user, instrument_id); при повторном счёте/ручном активе — переиспользование."""
    secid = instrument.secid
    existing = (
        db.query(Item)
        .filter(
            Item.user_id == user.id,
            Item.instrument_id == secid,
            Item.archived_at.is_(None),
            Item.kind == "ASSET",
        )
        .first()
    )
    board_id = instrument.default_board_id
    if not board_id and boards:
        board_id = boards[0].board_id
    if not board_id:
        raise HTTPException(status_code=400, detail="MOEX board not resolved for instrument")
    lot_size = instrument.lot_size or details.get("lot_size") or 1
    history_status = "HISTORICAL" if open_date < accounting_start else "NEW"
    primary_value_kind = "MARKET"
    if existing:
        existing.type_code = type_code
        existing.name = name[:200]
        existing.lot_size = lot_size
        existing.instrument_board_id = existing.instrument_board_id or board_id
        # Keep the earliest open_date so UI doesn't hide earlier operations
        if existing.open_date and open_date and open_date < existing.open_date:
            existing.open_date = open_date
        if existing.face_value_cents is None and instrument.face_value_cents is not None:
            existing.face_value_cents = instrument.face_value_cents
        existing.currency_code = instrument.currency_code or existing.currency_code or "RUB"
        # Never downgrade an existing historical item back to NEW.
        # This is important for correct "Количество на начало" UX: UI shows start quantity only for HISTORICAL.
        if existing.history_status != "HISTORICAL":
            existing.history_status = history_status
        existing.primary_value_kind = primary_value_kind
        db.flush()
        return existing

    item = Item(
        user_id=user.id,
        kind="ASSET",
        type_code=type_code,
        name=name[:200],
        synonyms=[],
        currency_code=instrument.currency_code or "RUB",
        counterparty_id=None,
        open_date=open_date,
        instrument_id=secid,
        instrument_board_id=board_id,
        position_lots=0,
        lot_size=lot_size,
        face_value_cents=instrument.face_value_cents,
        quantity_units=None,
        opening_deals=None,
        initial_balance_minor=0,
        current_balance_minor=0,
        current_value_rub=0,
        start_date=accounting_start,
        history_status=history_status,
        primary_value_kind=primary_value_kind,
        initial_acquisition_rub=None,
    )
    db.add(item)
    db.flush()
    return item


def _apply_brokerage_cash_transaction(
    db: Session,
    user: User,
    *,
    primary_item: Item,
    amount_kopecks: int,
    direction: str,
    tx_date: datetime,
    comment: str | None,
) -> Transaction:
    if amount_kopecks <= 0:
        raise ValueError("amount must be positive")
    cat_id = _default_category_id(db, user, direction)
    category = resolve_category_or_none(db, user, cat_id) if cat_id else None
    if direction == "INCOME":
        primary_item.current_balance_minor = (primary_item.current_balance_minor or 0) + amount_kopecks
        if (primary_item.currency_code or "RUB").upper() == "RUB":
            primary_item.current_value_rub = primary_item.current_balance_minor
    else:
        next_b = (primary_item.current_balance_minor or 0) - amount_kopecks
        primary_item.current_balance_minor = next_b
        if (primary_item.currency_code or "RUB").upper() == "RUB":
            primary_item.current_value_rub = primary_item.current_balance_minor

    tx = Transaction(
        user_id=user.id,
        transaction_date=tx_date.replace(tzinfo=None),
        source="TBANK_IMPORT",
        primary_item_id=primary_item.id,
        primary_card_item_id=None,
        counterparty_item_id=None,
        counterparty_card_item_id=None,
        counterparty_id=None,
        amount_primary_minor=amount_kopecks,
        amount_counterparty=None,
        direction=direction,
        transaction_type="ACTUAL",
        status=TBANK_IMPORT_TX_STATUS,
        category_id=category.id if category else None,
        comment=comment,
        related_item_id=None,
        asset_link_type=None,
        is_split_parent=False,
    )
    db.add(tx)
    db.flush()
    return tx


def upsert_account_links(
    db: Session,
    integration: UserIntegration,
    accounts: list[dict[str, Any]],
) -> None:
    for acc in accounts:
        ext_id = account_id(acc)
        if not ext_id:
            continue
        row = (
            db.query(BrokerAccountLink)
            .filter(
                BrokerAccountLink.integration_id == integration.id,
                BrokerAccountLink.external_account_id == ext_id,
            )
            .first()
        )
        if row:
            row.display_name = account_name(acc) or row.display_name
            row.account_type_hint = account_type(acc) or row.account_type_hint
        else:
            db.add(
                BrokerAccountLink(
                    integration_id=integration.id,
                    external_account_id=ext_id,
                    item_id=None,
                    display_name=account_name(acc),
                    account_type_hint=account_type(acc),
                )
            )


def sync_positions_for_account(
    db: Session,
    user: User,
    integration: UserIntegration,
    token: str,
    link: BrokerAccountLink,
    accounting_start: date,
) -> None:
    if not link.item_id:
        return
    positions = get_positions(token, link.external_account_id, sandbox=integration.sandbox)
    portfolio = get_portfolio(token, link.external_account_id, sandbox=integration.sandbox)
    pf_map = _portfolio_positions_by_figi(portfolio)
    for pos in positions:
        figi = position_figi(pos)
        if not figi:
            continue
        inst_raw = get_instrument_by_figi(token, figi, sandbox=integration.sandbox)
        if not inst_raw:
            logger.warning("T-Invest: no instrument for figi %s", figi)
            continue
        type_code = _map_tbank_instrument_to_type_code(inst_raw)
        ticker = str(inst_raw.get("ticker") or inst_raw.get("Ticker") or "").strip()
        if not ticker:
            continue
        try:
            instrument, boards, details = resolve_market_instrument(db, ticker)
        except HTTPException:
            logger.warning("MOEX: instrument not found for ticker %s (figi %s)", ticker, figi)
            continue
        qty_lots = _position_quantity_lots(pos)
        ppos = pf_map.get(figi)
        lot_size = int(instrument.lot_size or details.get("lot_size") or 1)
        val_kop = _estimate_position_value_rub_kopecks(
            pos, ppos, qty_lots=qty_lots, lot_size=lot_size
        )
        open_date = accounting_start
        plink = (
            db.query(BrokerPositionLink)
            .filter(
                BrokerPositionLink.integration_id == integration.id,
                BrokerPositionLink.external_account_id == link.external_account_id,
                BrokerPositionLink.figi == figi,
            )
            .first()
        )
        name = tbank_instrument_display_name(inst_raw, fallback=ticker)[:200]
        if plink:
            item = db.get(Item, plink.item_id)
            if item:
                plink.sync_position_lots = max(0, qty_lots)
                plink.sync_value_rub_kopecks = max(0, val_kop)
                item.type_code = type_code
                item.name = name[:200]
                item.lot_size = lot_size
                item.instrument_board_id = item.instrument_board_id or instrument.default_board_id
                _reaggregate_item_position_totals(db, item.id)
        else:
            item = _get_or_create_moex_position_item(
                db,
                user,
                type_code=type_code,
                name=name,
                instrument=instrument,
                boards=boards,
                details=details,
                open_date=open_date,
                accounting_start=accounting_start,
            )
            db.add(
                BrokerPositionLink(
                    integration_id=integration.id,
                    external_account_id=link.external_account_id,
                    figi=figi,
                    item_id=item.id,
                    sync_position_lots=max(0, qty_lots),
                    sync_value_rub_kopecks=max(0, val_kop),
                )
            )
            db.flush()
            _reaggregate_item_position_totals(db, item.id)


def _should_import_operation(op_type: str, op: dict[str, Any]) -> bool:
    # op_type comes from operation_type(); may be numeric string in some payloads
    if not op_type:
        return False
    if op_type.strip().isdigit():
        return False
    return op_type in _ALLOWED_OPERATION_TYPES


def _safe_int(value: Any) -> int:
    if value is None:
        return 0
    try:
        return int(str(value).split(".")[0])
    except (TypeError, ValueError):
        return 0


def _trade_quantity_pieces(trade: dict[str, Any]) -> int:
    """Количество бумаг в одной сделке API (штуки, не лоты MOEX)."""
    return _safe_int(trade.get("quantity") or trade.get("Quantity"))


def _trade_price_kopecks(trade: dict[str, Any]) -> int:
    p = trade.get("price") or trade.get("Price")
    return money_to_kopecks(p) if isinstance(p, dict) else 0


def _trade_datetime_iso(trade: dict[str, Any]) -> str | None:
    """Дата/время исполнения сделки в trades[] (строка ISO или Timestamp как у операции)."""
    for k in ("dateTime", "DateTime", "date", "Date"):
        d = trade.get(k)
        if isinstance(d, str) and d.strip():
            return d.strip()
        if isinstance(d, dict):
            secs = d.get("seconds") if "seconds" in d else d.get("Seconds")
            if secs is not None:
                try:
                    dt = datetime.fromtimestamp(int(str(secs)), tz=timezone.utc)
                    return dt.replace(microsecond=0).isoformat().replace("+00:00", "Z")
                except (ValueError, OSError, TypeError):
                    pass
    return None


def _broker_op_already_imported(db: Session, integration_id: int, oid: str) -> bool:
    """Учёт импорта: полный id операции или любой суффикс вида ``{oid}#...`` (сделки, хвост платежа)."""
    return (
        db.query(BrokerImportedOperation.id)
        .filter(
            BrokerImportedOperation.integration_id == integration_id,
            or_(
                BrokerImportedOperation.external_operation_id == oid,
                BrokerImportedOperation.external_operation_id.like(f"{oid}#%"),
            ),
        )
        .first()
        is not None
    )


def _broker_op_import_state(
    db: Session, integration_id: int, oid: str
) -> tuple[Transaction | None, bool]:
    """Returns (exact_tx_for_oid, has_parts_with_suffix)."""
    exact = (
        db.query(BrokerImportedOperation)
        .filter(
            BrokerImportedOperation.integration_id == integration_id,
            BrokerImportedOperation.external_operation_id == oid,
        )
        .first()
    )
    exact_tx = db.get(Transaction, exact.transaction_id) if exact else None
    has_parts = (
        db.query(BrokerImportedOperation.id)
        .filter(
            BrokerImportedOperation.integration_id == integration_id,
            BrokerImportedOperation.external_operation_id.like(f"{oid}#%"),
        )
        .first()
        is not None
    )
    return exact_tx, has_parts


def _resolve_split_parent_tx_for_oid(
    db: Session, integration_id: int, oid: str, user_id: int
) -> Transaction | None:
    """Родитель split: строка с точным ``oid`` или вывод из первой ноги ``{oid}#t*``."""
    row = (
        db.query(BrokerImportedOperation)
        .filter(
            BrokerImportedOperation.integration_id == integration_id,
            BrokerImportedOperation.external_operation_id == oid,
        )
        .first()
    )
    if row:
        tx = db.get(Transaction, row.transaction_id)
        if tx and tx.user_id == user_id and tx.deleted_at is None:
            return tx
    leg_row = (
        db.query(BrokerImportedOperation)
        .filter(
            BrokerImportedOperation.integration_id == integration_id,
            BrokerImportedOperation.external_operation_id.like(f"{oid}#t%"),
        )
        .order_by(BrokerImportedOperation.id.asc())
        .first()
    )
    if not leg_row:
        return None
    ch = db.get(Transaction, leg_row.transaction_id)
    if (
        not ch
        or ch.user_id != user_id
        or ch.deleted_at is not None
        or ch.parent_transaction_id is None
    ):
        return None
    parent = db.get(Transaction, ch.parent_transaction_id)
    if not parent or parent.user_id != user_id or parent.deleted_at is not None:
        return None
    return parent


def _sum_broker_imported_trade_child_amounts(
    db: Session, integration_id: int, oid: str, parent_id: int, user_id: int
) -> int:
    """Сумма ``amount_primary_minor`` дочерних транзакций по ``{oid}#t*`` для данного родителя."""
    rows = (
        db.query(BrokerImportedOperation)
        .filter(
            BrokerImportedOperation.integration_id == integration_id,
            BrokerImportedOperation.external_operation_id.like(f"{oid}#t%"),
        )
        .all()
    )
    total = 0
    for row in rows:
        tx = db.get(Transaction, row.transaction_id)
        if (
            not tx
            or tx.user_id != user_id
            or tx.deleted_at is not None
            or tx.parent_transaction_id != parent_id
        ):
            continue
        total += int(tx.amount_primary_minor or 0)
    return total


def _repair_broker_split_rest_if_needed(
    db: Session,
    user: User,
    integration: UserIntegration,
    token: str,
    primary: Item,
    *,
    op: dict[str, Any],
    oid: str,
    parent_tx: Transaction,
    ot: str,
    tbank_counterparty_id: int,
    accounting_start: date,
) -> int:
    """Если по операции уже есть ноги ``#t*``, но нет ``#rest`` — создать хвост при расхождении.

    Остаток: в первую очередь ``родитель.amount − Σ(детей в БД)`` (брокер в ответе иногда даёт
    сумму trades, совпадающую с ``payment``, хотя ноги в приложении — «чистые» цены).
    Иначе ``payment − Σ(trades)`` по текущему ответу API.
    """
    if (
        not parent_tx.is_split_parent
        or parent_tx.deleted_at is not None
        or parent_tx.user_id != user.id
    ):
        return 0
    buy_types = (
        "OPERATION_TYPE_BUY",
        "OPERATION_TYPE_BUY_CARD",
        "OPERATION_TYPE_BUY_MARGIN",
        "OPERATION_TYPE_DELIVERY_BUY",
    )
    sell_types = (
        "OPERATION_TYPE_SELL",
        "OPERATION_TYPE_SELL_CARD",
        "OPERATION_TYPE_SELL_MARGIN",
        "OPERATION_TYPE_DELIVERY_SELL",
    )
    if ot not in buy_types and ot not in sell_types:
        return 0
    if (
        db.query(BrokerImportedOperation.id)
        .filter(
            BrokerImportedOperation.integration_id == integration.id,
            BrokerImportedOperation.external_operation_id == f"{oid}#rest",
        )
        .first()
        is not None
    ):
        return 0
    figi = str(op.get("figi") or op.get("Figi") or "").strip()
    if figi and _op_is_currency_instrument(op, token, figi, sandbox=integration.sandbox):
        return 0

    children_sum = _sum_broker_imported_trade_child_amounts(
        db, integration.id, oid, parent_tx.id, user.id
    )
    remainder_db = max(0, int(parent_tx.amount_primary_minor or 0) - children_sum)
    if remainder_db > 0 and children_sum <= 0:
        remainder_db = 0

    raw_date = operation_date_iso(op)
    tx_dt = _parse_ts(raw_date) if raw_date else parent_tx.transaction_date
    abs_pay = operation_payment_field_abs_kopecks(op)

    related_item: Item | None = None
    if figi:
        related_item = _get_or_create_related_item_for_tbank_operation(
            db,
            user,
            token=token,
            sandbox=integration.sandbox,
            figi=figi,
            accounting_start=accounting_start,
            open_date=max(accounting_start, tx_dt.date()),
            op=op,
            primary_item=primary,
            is_currency_instrument=False,
        )

    remainder_api = 0
    if related_item and abs_pay > 0:
        lot_sz = _exchange_lot_size_for_related_moex_item(
            db, token, figi, sandbox=integration.sandbox, related_item=related_item
        )
        legs = _trade_legs_for_moex_operation(
            op, figi=figi, lot_sz=lot_sz, default_tx_dt=tx_dt
        )
        if legs:
            trade_cash = sum(leg[2] for leg in legs)
            remainder_api = max(0, abs_pay - trade_cash)

    remainder = remainder_db if remainder_db > 0 else remainder_api
    if remainder <= 0:
        return 0

    base_comment_type = str(op.get("type") or "").strip() or ot
    tb_rest_ref = (
        _tbank_instrument_comment_label(token, figi, sandbox=integration.sandbox)
        if figi
        else "FIGI: —"
    )

    if remainder_db == 0 and remainder_api > 0 and abs_pay > 0:
        if int(parent_tx.amount_primary_minor or 0) != abs_pay:
            parent_tx.amount_primary_minor = abs_pay
            db.add(parent_tx)
            db.commit()
            db.refresh(parent_tx)

    if ot in buy_types:
        cat_id = _category_id_by_name(db, user, "Приобретение активов")
        rem_payload = TransactionCreate(
            transaction_date=tx_dt,
            primary_item_id=primary.id,
            counterparty_item_id=None,
            counterparty_id=tbank_counterparty_id,
            amount_primary_minor=remainder,
            amount_counterparty=None,
            primary_quantity_lots=None,
            direction="EXPENSE",
            transaction_type="ACTUAL",
            status=TBANK_IMPORT_TX_STATUS,
            category_id=cat_id,
            comment=(
                f"{base_comment_type} (НКД, комиссии и прочие составляющие платежа) "
                f"{tb_rest_ref}"
            ),
            related_item_id=related_item.id if related_item else None,
            asset_link_type="ASSET_EXPENSE" if related_item else None,
            parent_transaction_id=parent_tx.id,
        )
    else:
        cat_id = _category_id_by_name(db, user, "Продажа активов")
        rem_payload = TransactionCreate(
            transaction_date=tx_dt,
            primary_item_id=primary.id,
            counterparty_item_id=None,
            counterparty_id=tbank_counterparty_id,
            amount_primary_minor=remainder,
            amount_counterparty=None,
            primary_quantity_lots=None,
            direction="INCOME",
            transaction_type="ACTUAL",
            status=TBANK_IMPORT_TX_STATUS,
            category_id=cat_id,
            comment=(
                f"{base_comment_type} (купон, комиссии и прочие составляющие платежа) "
                f"{tb_rest_ref}"
            ),
            related_item_id=related_item.id if related_item else None,
            asset_link_type="ASSET_INCOME" if related_item else None,
            parent_transaction_id=parent_tx.id,
        )

    t_rem = _create_transaction_impl(db, user, rem_payload)
    t_rem.source = TBANK_IMPORT_SOURCE
    db.add(
        BrokerImportedOperation(
            integration_id=integration.id,
            external_operation_id=f"{oid}#rest",
            transaction_id=t_rem.id,
        )
    )
    db.commit()
    logger.info(
        "T-Invest: создан отсутствующий хвост split id=%s на %s коп. (операция %s; "
        "остаток_по_БД=%s, по_API=%s)",
        t_rem.id,
        remainder,
        oid,
        remainder_db if remainder_db > 0 else 0,
        remainder_api,
    )
    return 1


def _trade_legs_for_moex_operation(
    op: dict[str, Any],
    *,
    figi: str,
    lot_sz: int | None,
    default_tx_dt: datetime,
) -> list[tuple[str, datetime, int, int]]:
    """Сделки из ``trades``: (суффикс id, дата/время, сумма в копейках qty×price, лоты MOEX).

    Пустой список — нет пригодных сделок; использовать агрегат операции (payment, quantity).
    """
    trades_raw = op.get("trades") or op.get("Trades") or []
    if not isinstance(trades_raw, list) or not trades_raw:
        return []
    out: list[tuple[str, datetime, int, int]] = []
    for ti, tr in enumerate(trades_raw):
        if not isinstance(tr, dict):
            continue
        tr_figi = str(tr.get("figi") or tr.get("Figi") or "").strip()
        if tr_figi and figi and tr_figi != figi:
            continue
        q = max(0, _trade_quantity_pieces(tr))
        p = max(0, _trade_price_kopecks(tr))
        if q <= 0 or p <= 0:
            continue
        iso = _trade_datetime_iso(tr)
        leg_dt = _parse_ts(iso) if iso else default_tx_dt
        amt = int(q * p)
        if amt <= 0:
            continue
        # Для операций из getOperations trades.quantity приходит в том же "торговом" количестве,
        # которое ожидает UI для истории покупок/продаж (без усреднения по payment).
        # Не делим дополнительно на lot_size, иначе часть сделок становится 0 и разбивка теряется.
        qty_lots = q
        if qty_lots <= 0:
            continue
        out.append((str(ti), leg_dt, amt, qty_lots))
    return out


def _quantity_field_to_minor_units(val: Any) -> int:
    """Валютное количество из поля quantity (Quotation / число) → минорные единицы (центы и т.д.)."""
    if isinstance(val, dict):
        return money_to_kopecks(val)
    if val is None:
        return 0
    try:
        return int(round(float(str(val).strip().replace(",", ".")) * 100))
    except (TypeError, ValueError):
        return 0


def _sum_trades_quantity_minor(op: dict[str, Any]) -> int:
    """Сумма quantity по сделкам (покупка/продажа валюты); иначе quantity операции."""
    total = 0
    trades = op.get("trades") or op.get("Trades") or []
    if isinstance(trades, list):
        for t in trades:
            if isinstance(t, dict):
                q = t.get("quantity") or t.get("Quantity")
                total += max(0, _quantity_field_to_minor_units(q))
    if total == 0:
        q = op.get("quantity") or op.get("Quantity")
        total = max(0, _quantity_field_to_minor_units(q))
    return total


def _payment_minor_and_currency(op: dict[str, Any]) -> tuple[int, str | None]:
    """Сумма payment в минорных единицах и ISO валюты payment (если есть)."""
    pay = op.get("payment") or op.get("Payment")
    if isinstance(pay, dict):
        minor = money_to_kopecks(pay)
        cur = pay.get("currency") or pay.get("Currency")
        iso = str(cur).strip().upper()[:3] if isinstance(cur, str) and cur.strip() else None
        return minor, iso
    return 0, None


def _item_has_actual_transactions(db: Session, user_id: int, item_id: int) -> bool:
    return (
        db.query(Transaction.id)
        .filter(
            Transaction.user_id == user_id,
            Transaction.deleted_at.is_(None),
            Transaction.is_split_parent.is_(False),
            Transaction.transaction_type == "ACTUAL",
            or_(
                Transaction.primary_item_id == item_id,
                Transaction.counterparty_item_id == item_id,
            ),
        )
        .limit(1)
        .first()
        is not None
    )


def _apply_tbank_currency_subaccount_opening_balances(
    db: Session,
    user: User,
    integration: UserIntegration,
    token: str,
    *,
    by_id: dict[str, Any],
    links_with_items: list[BrokerAccountLink],
    accounting_start: date,
) -> None:
    """Сальдо валютных субсчетов до даты начала учёта.

    Учитываем:
    - buy/sell валюты (instrumentType=currency): по quantity из trades;
    - buy/sell не-валютных активов в этой валюте: по payment в валюте операции.
    """
    acc_start_utc = datetime.combine(accounting_start, datetime.min.time(), tzinfo=timezone.utc)
    for link in links_with_items:
        acc = by_id.get(link.external_account_id)
        if not acc or not acc.opened_date:
            continue
        primary = db.get(Item, link.item_id)
        if not primary or primary.user_id != user.id:
            continue
        ops = get_operations(
            token,
            link.external_account_id,
            date_from_iso=_utc_iso_z(acc.opened_date),
            date_to_iso=_utc_iso_z(acc_start_utc),
            sandbox=integration.sandbox,
        )
        net_by_currency: dict[str, int] = {}
        figi_by_currency: dict[str, str] = {}
        for op in ops:
            if not isinstance(op, dict):
                continue
            raw_d = operation_date_iso(op)
            if not raw_d:
                continue
            op_dt = _parse_ts(raw_d)
            if op_dt >= acc_start_utc:
                continue

            # 1) Любая операция, у которой payment в валюте (USD/EUR/...) — влияет на денежный остаток.
            pay_minor_signed, pay_iso = _payment_minor_and_currency(op)
            if pay_iso and pay_iso != "RUB" and pay_minor_signed != 0:
                net_by_currency[pay_iso] = net_by_currency.get(pay_iso, 0) + int(pay_minor_signed)

            # 2) Операции обмена валюты (instrumentType=currency) часто имеют payment в RUB,
            # поэтому изменение валютного остатка берём из quantity по trades.
            figi = str(op.get("figi") or op.get("Figi") or "").strip()
            if not figi or not _instrument_type_raw_is_currency(_op_instrument_type_raw(op)):
                continue
            ot = operation_type(op)
            if ot not in _TBANK_CURRENCY_BUY_TYPES and ot not in _TBANK_CURRENCY_SELL_TYPES:
                continue
            cur_inst = get_currency_by_figi(token, figi, sandbox=integration.sandbox)
            iso = currency_iso_from_currency_instrument(cur_inst) if cur_inst else None
            if not iso:
                continue
            qty_minor = _sum_trades_quantity_minor(op)
            if qty_minor <= 0:
                continue
            signed_qty = qty_minor if ot in _TBANK_CURRENCY_BUY_TYPES else -qty_minor
            net_by_currency[iso] = net_by_currency.get(iso, 0) + signed_qty
            figi_by_currency.setdefault(iso, figi)

        for iso, net in net_by_currency.items():
            if net == 0:
                continue
            figi = figi_by_currency.get(iso)
            if not figi:
                # Для валюты, встреченной только в payment не-валютных активов,
                # отдельный валютный счёт уже должен быть создан на шаге ensure по currency-операциям.
                cur_item = (
                    db.query(Item)
                    .filter(
                        Item.user_id == user.id,
                        Item.archived_at.is_(None),
                        Item.kind == "ASSET",
                        Item.type_code == "brokerage",
                        Item.instrument_id.is_(None),
                        Item.currency_code == iso,
                    )
                    .first()
                )
                if not cur_item:
                    continue
            else:
                cur_item = _get_or_create_brokerage_currency_item_by_figi(
                    db,
                    user,
                    token=token,
                    figi=figi,
                    sandbox=integration.sandbox,
                    accounting_start=accounting_start,
                    open_date=acc.opened_date.date(),
                    primary_item=primary,
                    force_historical_if_open_date_eq_start=True,
                )
            if not cur_item or cur_item.id == primary.id:
                continue
            if _item_has_actual_transactions(db, user.id, cur_item.id):
                continue
            cur_item.initial_balance_minor = net
            cur_item.current_balance_minor = net
        db.flush()


def _executed_quantity_pieces(op: dict[str, Any]) -> int:
    """Исполненный объём в штуках T-Invest: сумма сделок; иначе quantity − quantityRest; иначе quantity.

    У частично исполненных заявок quantity может быть больше фактически купленного/проданного;
    quantityRest — остаток по заявке (см. документацию T-Invest)."""
    trades = op.get("trades") or op.get("Trades") or []
    trade_sum = 0
    if isinstance(trades, list):
        for t in trades:
            if isinstance(t, dict):
                trade_sum += max(0, _trade_quantity_pieces(t))
    q_top = _safe_int(op.get("quantity") or op.get("Quantity"))
    q_rest_raw = op.get("quantityRest")
    if q_rest_raw is None:
        q_rest_raw = op.get("QuantityRest")
    qr = _safe_int(q_rest_raw) if q_rest_raw is not None else None

    if trade_sum > 0:
        return trade_sum
    if qr is not None:
        return max(0, q_top - qr)
    return max(0, q_top)


def _tbank_pieces_to_moex_lots(pieces: int, lot_size: int | None, *, figi: str = "") -> int:
    """Перевод штук API → лоты позиции (как в Item.position_lots)."""
    ls = max(1, int(lot_size or 1))
    if pieces <= 0:
        return 0
    if pieces % ls != 0:
        logger.warning(
            "T-Invest: количество %s не кратно lot_size=%s (FIGI %s), берём целое число лотов",
            pieces,
            ls,
            figi or "?",
        )
    return pieces // ls


def _tbank_counterparty_id(db: Session) -> int:
    row = (
        db.query(Counterparty.id)
        .filter(
            Counterparty.deleted_at.is_(None),
            Counterparty.owner_user_id.is_(None),
            Counterparty.inn == TBANK_COUNTERPARTY_INN,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=500, detail="T-Bank counterparty is not seeded")
    return int(row[0])


def _tbank_instrument_comment_label(token: str, figi: str, *, sandbox: bool) -> str:
    """Подпись для комментариев импорта: «Имя из T‑Invest (FIGI: …)»."""
    fid = (figi or "").strip()
    if not fid:
        return ""
    raw = get_instrument_by_figi(token, fid, sandbox=sandbox)
    name = tbank_instrument_display_name(raw, fallback=fid)
    return f"{name} (FIGI: {fid})"


def _tbank_currency_comment_label(token: str, figi: str, *, sandbox: bool) -> str:
    """Подпись для валютных операций по FIGI валютного инструмента."""
    fid = (figi or "").strip()
    if not fid:
        return ""
    cur = get_currency_by_figi(token, fid, sandbox=sandbox)
    name = tbank_instrument_display_name(cur, fallback=fid)
    return f"{name} (FIGI: {fid})"


def _category_id_by_name(db: Session, user: User, name: str) -> int | None:
    row = (
        db.query(Category.id)
        .filter(
            Category.archived_at.is_(None),
            Category.name == name,
            or_(Category.owner_user_id.is_(None), Category.owner_user_id == user.id),
        )
        .order_by(Category.owner_user_id.desc().nullslast(), Category.id.asc())
        .first()
    )
    return int(row[0]) if row else None


def _get_or_create_moex_item_by_figi(
    db: Session,
    user: User,
    *,
    token: str,
    figi: str,
    sandbox: bool,
    accounting_start: date,
    open_date: date,
    force_historical_if_open_date_eq_start: bool = False,
) -> Item | None:
    """Resolve FIGI→ticker→MOEX instrument and return existing/created Item."""
    fid = (figi or "").strip()
    if not fid:
        return None
    inst_raw = get_instrument_by_figi(token, fid, sandbox=sandbox)
    if not inst_raw:
        return None
    ticker = str(inst_raw.get("ticker") or inst_raw.get("Ticker") or "").strip()
    if not ticker:
        return None
    try:
        instrument, boards, details = resolve_market_instrument(db, ticker)
    except HTTPException:
        logger.warning("MOEX: instrument not found for ticker %s (figi %s)", ticker, fid)
        return None

    type_code = _map_tbank_instrument_to_type_code(inst_raw)
    name = tbank_instrument_display_name(inst_raw, fallback=ticker)[:200]
    # Use existing helper but adjust history_status rule when needed (for initial positions)
    if force_historical_if_open_date_eq_start and open_date == accounting_start:
        open_date_eff = open_date - timedelta(days=1)
    else:
        open_date_eff = open_date
    return _get_or_create_moex_position_item(
        db,
        user,
        type_code=type_code,
        name=name,
        instrument=instrument,
        boards=boards,
        details=details,
        open_date=open_date_eff,
        accounting_start=accounting_start,
    )


def _tbank_instrument_lot_from_raw(inst_raw: dict[str, Any]) -> int | None:
    """Лотность с биржи по данным GetInstrumentBy (поле lot) — для облигаций часто расходится с MOEX в БД."""
    raw = inst_raw.get("lot") if inst_raw.get("lot") is not None else inst_raw.get("Lot")
    if raw is None:
        return None
    try:
        v = int(str(raw).split(".")[0])
        return v if v > 0 else None
    except (TypeError, ValueError):
        return None


def _tbank_figi_exchange_lot_size(
    db: Session,
    token: str,
    figi: str,
    *,
    sandbox: bool,
) -> int | None:
    """Штук в одном лоте: приоритет lot из T-Invest, иначе MOEX LOTSIZE (без создания Item)."""
    fid = (figi or "").strip()
    if not fid:
        return None
    inst_raw = get_instrument_by_figi(token, fid, sandbox=sandbox)
    if not inst_raw:
        return None
    tl = _tbank_instrument_lot_from_raw(inst_raw)
    if tl is not None:
        return tl
    ticker = str(inst_raw.get("ticker") or inst_raw.get("Ticker") or "").strip()
    if not ticker:
        return None
    try:
        instrument, _boards, details = resolve_market_instrument(db, ticker)
    except HTTPException:
        return None
    return int(instrument.lot_size or details.get("lot_size") or 1)


def _exchange_lot_size_for_related_moex_item(
    db: Session,
    token: str,
    figi: str,
    *,
    sandbox: bool,
    related_item: Item,
) -> int:
    """Лот для перевода штук API → position_lots; подтягивает lot из T-Invest на Item при расхождении."""
    inst_raw = get_instrument_by_figi(token, figi, sandbox=sandbox)
    tl = _tbank_instrument_lot_from_raw(inst_raw) if inst_raw else None
    moex_l = max(1, int(related_item.lot_size or 1))
    if tl is not None and tl > 0:
        if related_item.lot_size != tl:
            related_item.lot_size = tl
        return tl
    return moex_l


def _op_instrument_type_raw(op: dict[str, Any]) -> str:
    return str(op.get("instrumentType") or op.get("InstrumentType") or "").strip()


def _instrument_type_raw_is_currency(raw: str) -> bool:
    if not raw:
        return False
    x = raw.upper().replace(" ", "_")
    return x == "CURRENCY" or x.endswith("_CURRENCY")


def _op_is_currency_instrument(
    op: dict[str, Any],
    token: str,
    figi: str,
    *,
    sandbox: bool,
) -> bool:
    if _instrument_type_raw_is_currency(_op_instrument_type_raw(op)):
        return True
    fid = (figi or "").strip()
    if not fid:
        return False
    inst_raw = get_instrument_by_figi(token, fid, sandbox=sandbox)
    if not isinstance(inst_raw, dict):
        return False
    return _instrument_type_raw_is_currency(
        str(inst_raw.get("instrumentType") or inst_raw.get("InstrumentType") or "").strip()
    )


def _ensure_currency_brokerage_items_from_ops(
    db: Session,
    user: User,
    *,
    token: str,
    sandbox: bool,
    primary_item: Item,
    accounting_start: date,
    ops: list[dict[str, Any]],
) -> None:
    """Создаёт валютные активы «Брокерский счёт» по FIGI из полной истории операций.

    Нужно, когда все валютные операции до даты начала учёта: начальные позиции их
    пропускают, а импорт с max(opened, accounting_start) их не видит.

    Валютность: только FIGI из операций с instrumentType = currency в теле ответа,
    затем CurrencyBy (кэш). Для акций/облигаций API часто отвечает 404 на CurrencyBy —
    не дергаем его по всем FIGI истории.
    """
    currency_figi_min_date: dict[str, date] = {}
    for op in ops:
        if not isinstance(op, dict):
            continue
        figi = str(op.get("figi") or "").strip()
        if not figi:
            continue
        if not _instrument_type_raw_is_currency(_op_instrument_type_raw(op)):
            continue
        op_dt = _parse_ts(operation_date_iso(op))
        od = op_dt.date() if op_dt else accounting_start
        prev = currency_figi_min_date.get(figi)
        if prev is None or od < prev:
            currency_figi_min_date[figi] = od

    for figi, od in currency_figi_min_date.items():
        cur_inst = get_currency_by_figi(token, figi, sandbox=sandbox)
        if not cur_inst:
            continue
        iso = currency_iso_from_currency_instrument(cur_inst)
        if not iso or db.get(Currency, iso) is None:
            continue
        _get_or_create_brokerage_currency_item_by_figi(
            db,
            user,
            token=token,
            figi=figi,
            sandbox=sandbox,
            accounting_start=accounting_start,
            open_date=od,
            primary_item=primary_item,
            force_historical_if_open_date_eq_start=True,
            currency_instrument=cur_inst,
        )


def _get_or_create_brokerage_currency_item_by_figi(
    db: Session,
    user: User,
    *,
    token: str,
    figi: str,
    sandbox: bool,
    accounting_start: date,
    open_date: date,
    primary_item: Item,
    force_historical_if_open_date_eq_start: bool = False,
    currency_instrument: dict[str, Any] | None = None,
) -> Item | None:
    """Актив «Брокерский счёт» в валюте инструмента (CurrencyBy / nominal.currency)."""
    fid = (figi or "").strip()
    if not fid:
        return None
    if currency_instrument is not None:
        cur_inst = currency_instrument
    else:
        cur_inst = get_currency_by_figi(token, fid, sandbox=sandbox)
        if not cur_inst:
            logger.warning("T-Invest: CurrencyBy не вернул данные для FIGI %s", fid)
            return None
    iso = currency_iso_from_currency_instrument(cur_inst)
    if not iso:
        logger.warning("T-Invest: не удалось извлечь код валюты из CurrencyBy для FIGI %s", fid)
        return None
    if db.get(Currency, iso) is None:
        logger.warning("T-Invest: валюта %s не найдена в справочнике приложения (FIGI %s)", iso, fid)
        return None

    if force_historical_if_open_date_eq_start and open_date == accounting_start:
        open_date_eff = open_date - timedelta(days=1)
    else:
        open_date_eff = open_date

    prim_cur = (primary_item.currency_code or "RUB").upper()
    if iso == prim_cur:
        if primary_item.open_date and open_date_eff < primary_item.open_date:
            primary_item.open_date = open_date_eff
        if primary_item.history_status != "HISTORICAL":
            if open_date_eff < accounting_start:
                primary_item.history_status = "HISTORICAL"
            else:
                primary_item.history_status = "NEW"
        db.flush()
        return primary_item

    history_status = "HISTORICAL" if open_date_eff < accounting_start else "NEW"
    cp_id = _tbank_counterparty_id(db)
    existing = (
        db.query(Item)
        .filter(
            Item.user_id == user.id,
            Item.archived_at.is_(None),
            Item.kind == "ASSET",
            Item.type_code == "brokerage",
            Item.instrument_id.is_(None),
            Item.currency_code == iso,
        )
        .first()
    )
    if existing:
        existing.counterparty_id = existing.counterparty_id or cp_id
        if existing.open_date and open_date_eff < existing.open_date:
            existing.open_date = open_date_eff
        if existing.history_status != "HISTORICAL":
            if open_date_eff < accounting_start:
                existing.history_status = "HISTORICAL"
            else:
                existing.history_status = "NEW"
        db.flush()
        return existing

    item = Item(
        user_id=user.id,
        kind="ASSET",
        type_code="brokerage",
        name="Брокерский счёт"[:200],
        synonyms=[],
        currency_code=iso,
        counterparty_id=cp_id,
        open_date=open_date_eff,
        start_date=accounting_start,
        history_status=history_status,
        primary_value_kind="BALANCE",
        initial_balance_minor=0,
        current_balance_minor=0,
        current_value_rub=0,
        position_lots=0,
        lot_size=None,
        face_value_cents=None,
        quantity_units=None,
        opening_deals=None,
        opening_counterparty_item_id=None,
        account_last7=None,
        contract_number=None,
        card_last4=None,
        card_account_id=None,
        card_kind=None,
        credit_limit=None,
        deposit_term_days=None,
        deposit_end_date=None,
        interest_rate=None,
        interest_payout_order=None,
        interest_capitalization=None,
        interest_payout_account_id=None,
        instrument_id=None,
        instrument_board_id=None,
        initial_acquisition_rub=None,
    )
    db.add(item)
    db.flush()
    return item


def _get_or_create_related_item_for_tbank_operation(
    db: Session,
    user: User,
    *,
    token: str,
    sandbox: bool,
    figi: str,
    accounting_start: date,
    open_date: date,
    op: dict[str, Any],
    primary_item: Item,
    is_currency_instrument: bool,
) -> Item | None:
    if is_currency_instrument:
        return _get_or_create_brokerage_currency_item_by_figi(
            db,
            user,
            token=token,
            figi=figi,
            sandbox=sandbox,
            accounting_start=accounting_start,
            open_date=open_date,
            primary_item=primary_item,
            force_historical_if_open_date_eq_start=False,
        )
    return _get_or_create_moex_item_by_figi(
        db,
        user,
        token=token,
        figi=figi,
        sandbox=sandbox,
        accounting_start=accounting_start,
        open_date=open_date,
        force_historical_if_open_date_eq_start=False,
    )


def _tbank_import_moex_single_trade_equals_payment(
    db: Session,
    user: User,
    integration: UserIntegration,
    *,
    oid: str,
    imported_tx: Transaction | None,
    primary: Item,
    related_item: Item,
    tbank_counterparty_id: int,
    leg: tuple[str, datetime, int, int],
    base_comment_type: str,
    tb_instr_ref: str,
    category_id: int | None,
    direction: str,
    asset_link_type: str,
) -> None:
    """Одна сделка на всю сумму платежа — одна транзакция без родителя «разбивка по сделкам»."""
    from transactions import _rollback_transaction_balance

    if imported_tx is not None:
        _rollback_transaction_balance(db, user, imported_tx)
        db.query(BrokerImportedOperation).filter(
            BrokerImportedOperation.integration_id == integration.id,
            BrokerImportedOperation.external_operation_id == oid,
        ).delete(synchronize_session=False)
        db.delete(imported_tx)
        db.flush()

    suf, leg_dt, amt, ql = leg
    leg_comment = f"{base_comment_type} {tb_instr_ref} ({ql} л., сделка #{suf})"
    payload = TransactionCreate(
        transaction_date=leg_dt,
        primary_item_id=primary.id,
        counterparty_item_id=None,
        counterparty_id=tbank_counterparty_id,
        amount_primary_minor=amt,
        amount_counterparty=None,
        primary_quantity_lots=ql,
        direction=direction,  # type: ignore[arg-type]
        transaction_type="ACTUAL",
        status=TBANK_IMPORT_TX_STATUS,
        category_id=category_id,
        comment=leg_comment,
        related_item_id=related_item.id,
        asset_link_type=asset_link_type,  # type: ignore[arg-type]
        is_split_parent=False,
    )
    tx_new = _create_transaction_impl(db, user, payload)
    tx_new.source = TBANK_IMPORT_SOURCE
    db.add(
        BrokerImportedOperation(
            integration_id=integration.id,
            external_operation_id=oid,
            transaction_id=tx_new.id,
        )
    )


def sync_operations_for_account(
    db: Session,
    user: User,
    integration: UserIntegration,
    token: str,
    link: BrokerAccountLink,
    date_from: datetime,
    date_to: datetime,
) -> None:
    if not link.item_id:
        return
    primary = db.get(Item, link.item_id)
    if not primary or primary.user_id != user.id:
        return
    date_to_eff = date_to + timedelta(seconds=1)
    if date_to_eff <= date_from:
        date_to_eff = date_from + timedelta(seconds=1)
    df_iso = _utc_iso_z(date_from)
    dt_iso = _utc_iso_z(date_to_eff)
    ops = get_operations(
        token,
        link.external_account_id,
        date_from_iso=df_iso,
        date_to_iso=dt_iso,
        sandbox=integration.sandbox,
    )
    # Import in chronological order (earliest -> latest) to set correct open_date
    def _op_dt(op: dict[str, Any]) -> datetime:
        return _parse_ts(operation_date_iso(op))

    try:
        ops = sorted([o for o in ops if isinstance(o, dict)], key=_op_dt)
    except Exception:
        ops = [o for o in ops if isinstance(o, dict)]
    skip_no_id = 0
    skip_exists = 0
    skip_type = 0
    skip_amount = 0
    skip_no_asset = 0
    created = 0
    tbank_counterparty_id = _tbank_counterparty_id(db)
    accounting_start = user.accounting_start_date or date.today()
    for op in ops:
        oid = operation_id(op)
        if not oid:
            skip_no_id += 1
            continue
        imported_tx, imported_has_parts = _broker_op_import_state(db, integration.id, oid)
        ot = operation_type(op)
        if not _should_import_operation(ot, op):
            skip_type += 1
            continue
        is_buy_or_sell = ot in (
            "OPERATION_TYPE_BUY",
            "OPERATION_TYPE_BUY_CARD",
            "OPERATION_TYPE_BUY_MARGIN",
            "OPERATION_TYPE_DELIVERY_BUY",
            "OPERATION_TYPE_SELL",
            "OPERATION_TYPE_SELL_CARD",
            "OPERATION_TYPE_SELL_MARGIN",
            "OPERATION_TYPE_DELIVERY_SELL",
        )
        allow_legacy_split_upgrade = bool(imported_tx) and is_buy_or_sell and not imported_has_parts
        if imported_has_parts or (imported_tx and not allow_legacy_split_upgrade):
            repaired_rest = 0
            parent_for_repair = imported_tx
            if parent_for_repair is None and imported_has_parts:
                parent_for_repair = _resolve_split_parent_tx_for_oid(
                    db, integration.id, oid, user.id
                )
            if (
                imported_has_parts
                and parent_for_repair is not None
                and parent_for_repair.is_split_parent
                and is_buy_or_sell
            ):
                repaired_rest = _repair_broker_split_rest_if_needed(
                    db,
                    user,
                    integration,
                    token,
                    primary,
                    op=op,
                    oid=oid,
                    parent_tx=parent_for_repair,
                    ot=ot,
                    tbank_counterparty_id=tbank_counterparty_id,
                    accounting_start=accounting_start,
                )
                created += repaired_rest
            if repaired_rest == 0:
                skip_exists += 1
            continue
        raw_date = operation_date_iso(op)
        if not raw_date:
            skip_amount += 1
            continue
        tx_dt = _parse_ts(raw_date)
        pay_signed = operation_payment_kopecks(op)
        if pay_signed == 0:
            skip_amount += 1
            continue
        figi = str(op.get("figi") or op.get("Figi") or "").strip()
        is_currency_instr = (
            _op_is_currency_instrument(op, token, figi, sandbox=integration.sandbox) if figi else False
        )
        base_comment_type = str(op.get("type") or "").strip() or ot
        tb_instr_ref = ""
        if figi:
            tb_instr_ref = (
                _tbank_currency_comment_label(token, figi, sandbox=integration.sandbox)
                if is_currency_instr
                else _tbank_instrument_comment_label(token, figi, sandbox=integration.sandbox)
            )

        category_name: str | None = None
        direction: str | None = None
        asset_link_type: str | None = None
        related_item: Item | None = None
        qty_lots: int | None = None

        if ot in (
            "OPERATION_TYPE_BUY",
            "OPERATION_TYPE_BUY_CARD",
            "OPERATION_TYPE_BUY_MARGIN",
            "OPERATION_TYPE_DELIVERY_BUY",
        ):
            direction = "EXPENSE"
            category_name = "Приобретение активов"
            asset_link_type = "ASSET_PURCHASE"
            related_item = _get_or_create_related_item_for_tbank_operation(
                db,
                user,
                token=token,
                sandbox=integration.sandbox,
                figi=figi,
                accounting_start=accounting_start,
                open_date=max(accounting_start, tx_dt.date()),
                op=op,
                primary_item=primary,
                is_currency_instrument=is_currency_instr,
            )
            if not related_item:
                skip_no_asset += 1
                continue
            if is_currency_instr and related_item.id != primary.id:
                qty_minor = _sum_trades_quantity_minor(op)
                rub_minor = abs(int(pay_signed))
                if qty_minor <= 0 or rub_minor <= 0:
                    skip_amount += 1
                    continue
                cx = TransactionCreate(
                    transaction_date=tx_dt,
                    primary_item_id=primary.id,
                    counterparty_item_id=related_item.id,
                    counterparty_id=None,
                    amount_primary_minor=rub_minor,
                    amount_counterparty=qty_minor,
                    primary_quantity_lots=None,
                    counterparty_quantity_lots=None,
                    direction="TRANSFER",
                    transaction_type="ACTUAL",
                    status=TBANK_IMPORT_TX_STATUS,
                    category_id=None,
                    comment=f"{base_comment_type} валюта {tb_instr_ref}",
                    related_item_id=None,
                    asset_link_type=None,
                )
                txx = _create_transaction_impl(db, user, cx)
                txx.source = TBANK_IMPORT_SOURCE
                db.add(
                    BrokerImportedOperation(
                        integration_id=integration.id,
                        external_operation_id=oid,
                        transaction_id=txx.id,
                    )
                )
                created += 1
                continue
            if is_currency_instr:
                qty_lots = None
            else:
                lot_sz = _exchange_lot_size_for_related_moex_item(
                    db, token, figi, sandbox=integration.sandbox, related_item=related_item
                )
                legs = _trade_legs_for_moex_operation(
                    op, figi=figi, lot_sz=lot_sz, default_tx_dt=tx_dt
                )
                if legs:
                    abs_pay = operation_payment_field_abs_kopecks(op)
                    trade_cash = sum(leg[2] for leg in legs)
                    remainder = max(0, abs_pay - trade_cash)
                    cat_buy_id = _category_id_by_name(db, user, "Приобретение активов")
                    if len(legs) == 1 and remainder == 0:
                        _tbank_import_moex_single_trade_equals_payment(
                            db,
                            user,
                            integration,
                            oid=oid,
                            imported_tx=imported_tx,
                            primary=primary,
                            related_item=related_item,
                            tbank_counterparty_id=tbank_counterparty_id,
                            leg=legs[0],
                            base_comment_type=base_comment_type,
                            tb_instr_ref=tb_instr_ref,
                            category_id=cat_buy_id,
                            direction="EXPENSE",
                            asset_link_type="ASSET_PURCHASE",
                        )
                        created += 1
                        continue
                    if imported_tx is not None:
                        from transactions import _rollback_transaction_balance  # local import to avoid module cycle at import time
                        _rollback_transaction_balance(db, user, imported_tx)
                        imported_tx.is_split_parent = True
                        imported_tx.amount_primary_minor = abs_pay
                        parent_tx = imported_tx
                        db.commit()
                        db.refresh(parent_tx)
                    else:
                        parent_payload = TransactionCreate(
                            transaction_date=tx_dt,
                            primary_item_id=primary.id,
                            counterparty_item_id=None,
                            counterparty_id=tbank_counterparty_id,
                            amount_primary_minor=abs_pay,
                            amount_counterparty=None,
                            primary_quantity_lots=None,
                            direction="EXPENSE",
                            transaction_type="ACTUAL",
                            status=TBANK_IMPORT_TX_STATUS,
                            category_id=cat_buy_id,
                            comment=f"{base_comment_type} {tb_instr_ref} (разбивка по сделкам)",
                            related_item_id=related_item.id,
                            asset_link_type="ASSET_PURCHASE",
                            is_split_parent=True,
                        )
                        parent_tx = _create_transaction_impl(db, user, parent_payload)
                        parent_tx.source = TBANK_IMPORT_SOURCE
                        db.add(
                            BrokerImportedOperation(
                                integration_id=integration.id,
                                external_operation_id=oid,
                                transaction_id=parent_tx.id,
                            )
                        )
                        created += 1
                    for suf, leg_dt, amt, ql in legs:
                        leg_comment = f"{base_comment_type} {tb_instr_ref} ({ql} л., сделка #{suf})"
                        leg_payload = TransactionCreate(
                            transaction_date=leg_dt,
                            primary_item_id=primary.id,
                            counterparty_item_id=None,
                            counterparty_id=tbank_counterparty_id,
                            amount_primary_minor=amt,
                            amount_counterparty=None,
                            primary_quantity_lots=ql,
                            direction="EXPENSE",
                            transaction_type="ACTUAL",
                            status=TBANK_IMPORT_TX_STATUS,
                            category_id=cat_buy_id,
                            comment=leg_comment,
                            related_item_id=related_item.id,
                            asset_link_type="ASSET_PURCHASE",
                            parent_transaction_id=parent_tx.id,
                        )
                        t_leg = _create_transaction_impl(db, user, leg_payload)
                        t_leg.source = TBANK_IMPORT_SOURCE
                        db.add(
                            BrokerImportedOperation(
                                integration_id=integration.id,
                                external_operation_id=f"{oid}#t{suf}",
                                transaction_id=t_leg.id,
                            )
                        )
                        created += 1
                    if remainder > 0:
                        rem_payload = TransactionCreate(
                            transaction_date=tx_dt,
                            primary_item_id=primary.id,
                            counterparty_item_id=None,
                            counterparty_id=tbank_counterparty_id,
                            amount_primary_minor=remainder,
                            amount_counterparty=None,
                            primary_quantity_lots=None,
                            direction="EXPENSE",
                            transaction_type="ACTUAL",
                            status=TBANK_IMPORT_TX_STATUS,
                            category_id=cat_buy_id,
                            comment=(
                                f"{base_comment_type} (НКД, комиссии и прочие составляющие платежа) "
                                f"{tb_instr_ref}"
                            ),
                            related_item_id=related_item.id,
                            asset_link_type="ASSET_EXPENSE",
                            parent_transaction_id=parent_tx.id,
                        )
                        t_rem = _create_transaction_impl(db, user, rem_payload)
                        t_rem.source = TBANK_IMPORT_SOURCE
                        db.add(
                            BrokerImportedOperation(
                                integration_id=integration.id,
                                external_operation_id=f"{oid}#rest",
                                transaction_id=t_rem.id,
                            )
                        )
                        created += 1
                    continue
                qty_pieces = max(0, _executed_quantity_pieces(op))
                qty_lots = _tbank_pieces_to_moex_lots(
                    qty_pieces,
                    lot_sz,
                    figi=figi,
                )
                if qty_pieces > 0 and qty_lots <= 0:
                    logger.warning(
                        "T-Invest: пропуск покупки — 0 лотов после конвертации (FIGI %s, штук %s, lot_size %s)",
                        figi,
                        qty_pieces,
                        lot_sz,
                    )
                    skip_no_asset += 1
                    continue
        elif ot in (
            "OPERATION_TYPE_SELL",
            "OPERATION_TYPE_SELL_CARD",
            "OPERATION_TYPE_SELL_MARGIN",
            "OPERATION_TYPE_DELIVERY_SELL",
        ):
            direction = "INCOME"
            category_name = "Продажа активов"
            asset_link_type = "ASSET_SALE"
            related_item = _get_or_create_related_item_for_tbank_operation(
                db,
                user,
                token=token,
                sandbox=integration.sandbox,
                figi=figi,
                accounting_start=accounting_start,
                open_date=max(accounting_start, tx_dt.date()),
                op=op,
                primary_item=primary,
                is_currency_instrument=is_currency_instr,
            )
            if not related_item:
                skip_no_asset += 1
                continue
            if is_currency_instr and related_item.id != primary.id:
                qty_minor = _sum_trades_quantity_minor(op)
                rub_minor = abs(int(pay_signed))
                if qty_minor <= 0 or rub_minor <= 0:
                    skip_amount += 1
                    continue
                sx = TransactionCreate(
                    transaction_date=tx_dt,
                    primary_item_id=related_item.id,
                    counterparty_item_id=primary.id,
                    counterparty_id=None,
                    amount_primary_minor=qty_minor,
                    amount_counterparty=rub_minor,
                    primary_quantity_lots=None,
                    counterparty_quantity_lots=None,
                    direction="TRANSFER",
                    transaction_type="ACTUAL",
                    status=TBANK_IMPORT_TX_STATUS,
                    category_id=None,
                    comment=f"{base_comment_type} валюта {tb_instr_ref}",
                    related_item_id=None,
                    asset_link_type=None,
                )
                txs = _create_transaction_impl(db, user, sx)
                txs.source = TBANK_IMPORT_SOURCE
                db.add(
                    BrokerImportedOperation(
                        integration_id=integration.id,
                        external_operation_id=oid,
                        transaction_id=txs.id,
                    )
                )
                created += 1
                continue
            if is_currency_instr:
                qty_lots = None
            else:
                lot_sz = _exchange_lot_size_for_related_moex_item(
                    db, token, figi, sandbox=integration.sandbox, related_item=related_item
                )
                legs = _trade_legs_for_moex_operation(
                    op, figi=figi, lot_sz=lot_sz, default_tx_dt=tx_dt
                )
                if legs:
                    abs_pay = operation_payment_field_abs_kopecks(op)
                    trade_cash = sum(leg[2] for leg in legs)
                    remainder = max(0, abs_pay - trade_cash)
                    cat_sell_id = _category_id_by_name(db, user, "Продажа активов")
                    if len(legs) == 1 and remainder == 0:
                        _tbank_import_moex_single_trade_equals_payment(
                            db,
                            user,
                            integration,
                            oid=oid,
                            imported_tx=imported_tx,
                            primary=primary,
                            related_item=related_item,
                            tbank_counterparty_id=tbank_counterparty_id,
                            leg=legs[0],
                            base_comment_type=base_comment_type,
                            tb_instr_ref=tb_instr_ref,
                            category_id=cat_sell_id,
                            direction="INCOME",
                            asset_link_type="ASSET_SALE",
                        )
                        created += 1
                        continue
                    if imported_tx is not None:
                        from transactions import _rollback_transaction_balance  # local import to avoid module cycle at import time
                        _rollback_transaction_balance(db, user, imported_tx)
                        imported_tx.is_split_parent = True
                        imported_tx.amount_primary_minor = abs_pay
                        parent_tx = imported_tx
                        db.commit()
                        db.refresh(parent_tx)
                    else:
                        parent_payload = TransactionCreate(
                            transaction_date=tx_dt,
                            primary_item_id=primary.id,
                            counterparty_item_id=None,
                            counterparty_id=tbank_counterparty_id,
                            amount_primary_minor=abs_pay,
                            amount_counterparty=None,
                            primary_quantity_lots=None,
                            direction="INCOME",
                            transaction_type="ACTUAL",
                            status=TBANK_IMPORT_TX_STATUS,
                            category_id=cat_sell_id,
                            comment=f"{base_comment_type} {tb_instr_ref} (разбивка по сделкам)",
                            related_item_id=related_item.id,
                            asset_link_type="ASSET_SALE",
                            is_split_parent=True,
                        )
                        parent_tx = _create_transaction_impl(db, user, parent_payload)
                        parent_tx.source = TBANK_IMPORT_SOURCE
                        db.add(
                            BrokerImportedOperation(
                                integration_id=integration.id,
                                external_operation_id=oid,
                                transaction_id=parent_tx.id,
                            )
                        )
                        created += 1
                    for suf, leg_dt, amt, ql in legs:
                        leg_comment = f"{base_comment_type} {tb_instr_ref} ({ql} л., сделка #{suf})"
                        leg_payload = TransactionCreate(
                            transaction_date=leg_dt,
                            primary_item_id=primary.id,
                            counterparty_item_id=None,
                            counterparty_id=tbank_counterparty_id,
                            amount_primary_minor=amt,
                            amount_counterparty=None,
                            primary_quantity_lots=ql,
                            direction="INCOME",
                            transaction_type="ACTUAL",
                            status=TBANK_IMPORT_TX_STATUS,
                            category_id=cat_sell_id,
                            comment=leg_comment,
                            related_item_id=related_item.id,
                            asset_link_type="ASSET_SALE",
                            parent_transaction_id=parent_tx.id,
                        )
                        t_leg = _create_transaction_impl(db, user, leg_payload)
                        t_leg.source = TBANK_IMPORT_SOURCE
                        db.add(
                            BrokerImportedOperation(
                                integration_id=integration.id,
                                external_operation_id=f"{oid}#t{suf}",
                                transaction_id=t_leg.id,
                            )
                        )
                        created += 1
                    if remainder > 0:
                        rem_payload = TransactionCreate(
                            transaction_date=tx_dt,
                            primary_item_id=primary.id,
                            counterparty_item_id=None,
                            counterparty_id=tbank_counterparty_id,
                            amount_primary_minor=remainder,
                            amount_counterparty=None,
                            primary_quantity_lots=None,
                            direction="INCOME",
                            transaction_type="ACTUAL",
                            status=TBANK_IMPORT_TX_STATUS,
                            category_id=cat_sell_id,
                            comment=(
                                f"{base_comment_type} (купон, комиссии и прочие составляющие платежа) "
                                f"{tb_instr_ref}"
                            ),
                            related_item_id=related_item.id,
                            asset_link_type="ASSET_INCOME",
                            parent_transaction_id=parent_tx.id,
                        )
                        t_rem = _create_transaction_impl(db, user, rem_payload)
                        t_rem.source = TBANK_IMPORT_SOURCE
                        db.add(
                            BrokerImportedOperation(
                                integration_id=integration.id,
                                external_operation_id=f"{oid}#rest",
                                transaction_id=t_rem.id,
                            )
                        )
                        created += 1
                    continue
                qty_pieces = max(0, _executed_quantity_pieces(op))
                qty_lots = _tbank_pieces_to_moex_lots(
                    qty_pieces,
                    lot_sz,
                    figi=figi,
                )
                if qty_pieces > 0 and qty_lots <= 0:
                    logger.warning(
                        "T-Invest: пропуск продажи — 0 лотов после конвертации (FIGI %s, штук %s, lot_size %s)",
                        figi,
                        qty_pieces,
                        lot_sz,
                    )
                    skip_no_asset += 1
                    continue
        elif ot == "OPERATION_TYPE_COUPON":
            direction = "INCOME"
            category_name = "Купонный доход от облигаций"
            asset_link_type = "ASSET_INCOME"
            related_item = (
                _get_or_create_related_item_for_tbank_operation(
                    db,
                    user,
                    token=token,
                    sandbox=integration.sandbox,
                    figi=figi,
                    accounting_start=accounting_start,
                    open_date=max(accounting_start, tx_dt.date()),
                    op=op,
                    primary_item=primary,
                    is_currency_instrument=is_currency_instr,
                )
                if figi
                else None
            )
            if figi and not related_item:
                skip_no_asset += 1
                continue
        elif ot == "OPERATION_TYPE_DIVIDEND":
            direction = "INCOME"
            category_name = "Дивиденды"
            asset_link_type = "ASSET_INCOME"
            related_item = (
                _get_or_create_related_item_for_tbank_operation(
                    db,
                    user,
                    token=token,
                    sandbox=integration.sandbox,
                    figi=figi,
                    accounting_start=accounting_start,
                    open_date=max(accounting_start, tx_dt.date()),
                    op=op,
                    primary_item=primary,
                    is_currency_instrument=is_currency_instr,
                )
                if figi
                else None
            )
            if figi and not related_item:
                skip_no_asset += 1
                continue
        elif ot == "OPERATION_TYPE_INPUT":
            direction = "INCOME"
            category_name = "Прочие доходы"
        elif ot == "OPERATION_TYPE_OUTPUT":
            direction = "EXPENSE"
            category_name = "Прочие расходы"
        elif ot == "OPERATION_TYPE_BROKER_FEE":
            direction = "EXPENSE"
            category_name = "Комиссии от торговли на финансовом рынке"
            if figi:
                related_item = _get_or_create_related_item_for_tbank_operation(
                    db,
                    user,
                    token=token,
                    sandbox=integration.sandbox,
                    figi=figi,
                    accounting_start=accounting_start,
                    open_date=max(accounting_start, tx_dt.date()),
                    op=op,
                    primary_item=primary,
                    is_currency_instrument=is_currency_instr,
                )
                if not related_item:
                    skip_no_asset += 1
                    continue
                asset_link_type = "ASSET_EXPENSE"
        elif ot == "OPERATION_TYPE_SERVICE_FEE":
            direction = "EXPENSE"
            category_name = "Комиссии от торговли на финансовом рынке"
        elif ot in ("OPERATION_TYPE_TAX", "OPERATION_TYPE_TAX_CORRECTION", "OPERATION_TYPE_DIVIDEND_TAX"):
            direction = "EXPENSE"
            category_name = "НДФЛ от операций на рынке ценных бумаг"
        else:
            skip_type += 1
            continue

        amount = abs(int(pay_signed))
        if amount <= 0 or not direction:
            skip_amount += 1
            continue
        cat_id = _category_id_by_name(db, user, category_name) if category_name else None

        comment = base_comment_type
        if figi and ot in (
            "OPERATION_TYPE_BUY",
            "OPERATION_TYPE_BUY_CARD",
            "OPERATION_TYPE_BUY_MARGIN",
            "OPERATION_TYPE_DELIVERY_BUY",
            "OPERATION_TYPE_SELL",
            "OPERATION_TYPE_SELL_CARD",
            "OPERATION_TYPE_SELL_MARGIN",
            "OPERATION_TYPE_DELIVERY_SELL",
        ):
            if is_currency_instr:
                qp = _executed_quantity_pieces(op)
                comment = f"{base_comment_type} {tb_instr_ref} ({qp} шт.)"
            else:
                comment = f"{base_comment_type} {tb_instr_ref} {qty_lots or 0}"
        elif figi and ot in ("OPERATION_TYPE_COUPON", "OPERATION_TYPE_DIVIDEND", "OPERATION_TYPE_BROKER_FEE"):
            comment = f"{base_comment_type} {tb_instr_ref}"

        payload = TransactionCreate(
            transaction_date=tx_dt,
            primary_item_id=primary.id,
            counterparty_item_id=None,
            counterparty_id=tbank_counterparty_id,
            amount_primary_minor=amount,
            amount_counterparty=None,
            primary_quantity_lots=qty_lots,
            direction=direction,  # type: ignore[arg-type]
            transaction_type="ACTUAL",
            status=TBANK_IMPORT_TX_STATUS,
            category_id=cat_id,
            comment=comment,
            related_item_id=related_item.id if related_item else None,
            asset_link_type=asset_link_type,  # type: ignore[arg-type]
        )

        tx = _create_transaction_impl(db, user, payload)
        tx.source = TBANK_IMPORT_SOURCE
        db.add(
            BrokerImportedOperation(
                integration_id=integration.id,
                external_operation_id=oid,
                transaction_id=tx.id,
            )
        )
        created += 1
    logger.info(
        "T-Invest operations import account=%s period=%s .. %s api_ops=%s created=%s "
        "skip_no_id=%s skip_exists=%s skip_type=%s skip_amount=%s skip_no_asset=%s",
        link.external_account_id,
        df_iso,
        dt_iso,
        len(ops),
        created,
        skip_no_id,
        skip_exists,
        skip_type,
        skip_amount,
        skip_no_asset,
    )


def run_tbank_sync(db: Session, integration: UserIntegration) -> None:
    user = db.get(User, integration.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if integration.provider != PROVIDER_TBANK:
        raise HTTPException(status_code=400, detail="Unsupported integration provider")
    if not integration.token_ciphertext:
        raise HTTPException(status_code=400, detail="Токен не сохранён. Укажите токен T-Invest.")

    try:
        token = decrypt_token(integration.token_ciphertext)
        base = tbank_base_url(sandbox=integration.sandbox)
        logger.info("T-Invest sync using %s", base)

        accounts = get_accounts(token, sandbox=integration.sandbox)
        upsert_account_links(db, integration, accounts)
        db.flush()

        accounting_start = user.accounting_start_date or date.today()

        now = datetime.now(timezone.utc)
        by_ext_opened: dict[str, datetime] = {}
        for acc in accounts:
            if not isinstance(acc, dict):
                continue
            if (account_status(acc) or "").strip() != "ACCOUNT_STATUS_OPEN":
                continue
            ext = account_id(acc)
            if not ext:
                continue
            opened_iso = account_opened_date_iso(acc)
            od = _parse_ts(opened_iso) if opened_iso else None
            if od:
                by_ext_opened[ext] = od

        date_from = now - timedelta(days=365)
        if integration.last_sync_at:
            date_from = integration.last_sync_at.replace(tzinfo=timezone.utc)
        if date_from >= now:
            date_from = now - timedelta(days=1)

        links = (
            db.query(BrokerAccountLink)
            .filter(BrokerAccountLink.integration_id == integration.id)
            .all()
        )
        for link in links:
            if not link.item_id:
                continue
            primary = db.get(Item, link.item_id)
            if not primary or primary.user_id != user.id:
                continue
            opened_at = by_ext_opened.get(link.external_account_id)
            if opened_at:
                ops_full = get_operations(
                    token,
                    link.external_account_id,
                    date_from_iso=_utc_iso_z(opened_at),
                    date_to_iso=_utc_iso_z(now + timedelta(seconds=1)),
                    sandbox=integration.sandbox,
                )
                _ensure_currency_brokerage_items_from_ops(
                    db,
                    user,
                    token=token,
                    sandbox=integration.sandbox,
                    primary_item=primary,
                    accounting_start=accounting_start,
                    ops=ops_full,
                )
        db.flush()

        for link in links:
            if link.item_id:
                sync_operations_for_account(
                    db, user, integration, token, link, date_from, now
                )

        integration.last_sync_at = now
        integration.last_error = None
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        logger.exception("T-Invest sync failed")
        db.rollback()
        err = str(e)[:2000]
        integ = db.get(UserIntegration, integration.id)
        if integ:
            integ.last_error = err
            db.commit()
        raise HTTPException(status_code=502, detail=err) from e


def set_integration_token(integration: UserIntegration, plain_token: str) -> None:
    integration.token_ciphertext = encrypt_token(plain_token.strip())


def _deep_find_first_bool(payload: Any, key_names: set[str]) -> bool | None:
    """Search nested dict/list for first boolean under any key in key_names (case-insensitive)."""
    queue: list[Any] = [payload]
    while queue:
        cur = queue.pop(0)
        if isinstance(cur, dict):
            for k, v in cur.items():
                if str(k).lower() in key_names and isinstance(v, bool):
                    return v
                if isinstance(v, (dict, list)):
                    queue.append(v)
        elif isinstance(cur, list):
            for v in cur:
                if isinstance(v, (dict, list)):
                    queue.append(v)
    return None


def _deep_find_first_str(payload: Any, key_names: set[str]) -> str | None:
    queue: list[Any] = [payload]
    while queue:
        cur = queue.pop(0)
        if isinstance(cur, dict):
            for k, v in cur.items():
                if str(k).lower() in key_names and isinstance(v, str) and v.strip():
                    return v.strip()
                if isinstance(v, (dict, list)):
                    queue.append(v)
        elif isinstance(cur, list):
            for v in cur:
                if isinstance(v, (dict, list)):
                    queue.append(v)
    return None


def fetch_tbank_info_snapshot(db: Session, integration: UserIntegration) -> TbankInfoOut:
    """Fetch UsersService/GetInfo and persist snapshot to integration row."""
    if not integration.token_ciphertext:
        raise HTTPException(status_code=400, detail="Токен не сохранён. Укажите токен T-Invest.")
    token = decrypt_token(integration.token_ciphertext)
    raw = get_info(token, sandbox=integration.sandbox)

    is_premium = _deep_find_first_bool(raw, {"ispremium", "premium", "ispremiumclient"})
    is_qualified = _deep_find_first_bool(raw, {"isqualified", "qualified", "isqualifiedinvestor"})
    risk_category = _deep_find_first_str(raw, {"riskcategory", "risk_profile", "riskprofile", "risk"})

    integration.tbank_is_premium = is_premium
    integration.tbank_is_qualified = is_qualified
    integration.tbank_risk_category = risk_category
    integration.tbank_info_raw = raw if isinstance(raw, dict) else {"raw": raw}
    integration.tbank_info_fetched_at = datetime.now(timezone.utc)
    db.commit()

    return TbankInfoOut(
        is_premium=is_premium,
        is_qualified=is_qualified,
        risk_category=risk_category,
        raw=integration.tbank_info_raw,
    )


def list_tbank_open_accounts(db: Session, integration: UserIntegration) -> list[TbankAccountOut]:
    if not integration.token_ciphertext:
        raise HTTPException(status_code=400, detail="Токен не сохранён. Укажите токен T-Invest.")
    token = decrypt_token(integration.token_ciphertext)
    rows = get_accounts(token, sandbox=integration.sandbox)
    open_accounts: list[dict[str, Any]] = []
    for acc in rows:
        if not isinstance(acc, dict):
            continue
        st = (account_status(acc) or "").strip()
        if st != "ACCOUNT_STATUS_OPEN":
            continue
        open_accounts.append(acc)

    upsert_account_links(db, integration, open_accounts)
    db.commit()

    out: list[TbankAccountOut] = []
    for acc in open_accounts:
        ext_id = account_id(acc)
        if not ext_id:
            continue
        t = (account_type(acc) or "").strip() or None
        t_label = _TBANK_ACCOUNT_TYPE_LABELS.get(t or "", t)
        opened_iso = account_opened_date_iso(acc)
        opened_dt = _parse_ts(opened_iso) if opened_iso else None
        out.append(
            TbankAccountOut(
                external_account_id=ext_id,
                type=t,
                type_label=t_label,
                name=account_name(acc),
                opened_date=opened_dt,
            )
        )
    return out


def preview_tbank_operations_import(
    db: Session,
    integration: UserIntegration,
) -> TbankOperationsPreviewResponse:
    if not integration.token_ciphertext:
        raise HTTPException(status_code=400, detail="Токен не сохранён. Укажите токен T-Invest.")
    token = decrypt_token(integration.token_ciphertext)
    accounts = list_tbank_open_accounts(db, integration)
    now = datetime.now(timezone.utc)

    previews: list[TbankOperationsPreviewOut] = []
    for a in accounts:
        opened = a.opened_date or now
        ops = get_operations(
            token,
            a.external_account_id,
            date_from_iso=_utc_iso_z(opened),
            date_to_iso=_utc_iso_z(now + timedelta(seconds=1)),
            sandbox=integration.sandbox,
        )
        importable: dict[str, int] = {}
        not_imported: dict[str, int] = {}
        for op in ops:
            if not isinstance(op, dict):
                continue
            ot = operation_type(op)
            if _should_import_operation(ot, op):
                importable[ot] = importable.get(ot, 0) + 1
            else:
                not_imported[ot] = not_imported.get(ot, 0) + 1
        previews.append(
            TbankOperationsPreviewOut(
                external_account_id=a.external_account_id,
                importable_total=sum(importable.values()),
                not_imported_total=sum(not_imported.values()),
                importable_by_type=importable,
                not_imported_by_type=not_imported,
            )
        )
    return TbankOperationsPreviewResponse(accounts=previews)


def _create_brokerage_account_item(
    db: Session,
    user: User,
    *,
    name: str,
    open_date: date,
    accounting_start: date,
    counterparty_id: int,
) -> Item:
    history_status = "HISTORICAL" if open_date <= accounting_start else "NEW"
    item = Item(
        user_id=user.id,
        kind="ASSET",
        type_code="brokerage",
        name=(name or "Брокерский счёт")[:200],
        synonyms=[],
        currency_code="RUB",
        counterparty_id=counterparty_id,
        open_date=open_date,
        start_date=accounting_start,
        history_status=history_status,
        primary_value_kind="BALANCE",
        initial_balance_minor=0,
        current_balance_minor=0,
        current_value_rub=0,
        position_lots=0,
        lot_size=None,
        face_value_cents=None,
        quantity_units=None,
        opening_deals=None,
        opening_counterparty_item_id=None,
        account_last7=None,
        contract_number=None,
        card_last4=None,
        card_account_id=None,
        card_kind=None,
        credit_limit=None,
        deposit_term_days=None,
        deposit_end_date=None,
        interest_rate=None,
        interest_payout_order=None,
        interest_capitalization=None,
        interest_payout_account_id=None,
        instrument_id=None,
        instrument_board_id=None,
        initial_acquisition_rub=None,
    )
    db.add(item)
    db.flush()
    return item


def _apply_initial_positions_before_accounting_start(
    db: Session,
    user: User,
    *,
    integration: UserIntegration,
    token: str,
    external_account_id: str,
    opened_at: datetime,
    accounting_start: date,
) -> None:
    # Period: opened_at .. accounting_start (exclusive)
    start_dt = opened_at
    end_dt = datetime.combine(accounting_start, datetime.min.time(), tzinfo=timezone.utc)
    if end_dt <= start_dt:
        return
    ops = get_operations(
        token,
        external_account_id,
        date_from_iso=_utc_iso_z(start_dt),
        date_to_iso=_utc_iso_z(end_dt),
        sandbox=integration.sandbox,
    )
    def _op_dt(op: dict[str, Any]) -> datetime:
        return _parse_ts(operation_date_iso(op))

    try:
        ops = sorted([o for o in ops if isinstance(o, dict)], key=_op_dt)
    except Exception:
        ops = [o for o in ops if isinstance(o, dict)]
    # figi -> (qty_pieces API, total_cost_kopecks для оставшихся штук)
    state: dict[str, tuple[int, int]] = {}
    for op in ops:
        if not isinstance(op, dict):
            continue
        ot = operation_type(op)
        if ot not in _INITIAL_POSITION_OPERATION_TYPES:
            continue
        figi = str(op.get("figi") or "").strip()
        if not figi:
            continue
        if _op_is_currency_instrument(op, token, figi, sandbox=integration.sandbox):
            continue
        trades = op.get("trades") or op.get("Trades") or []
        qty = _executed_quantity_pieces(op)
        cost = 0
        if isinstance(trades, list) and trades:
            for tr in trades:
                if not isinstance(tr, dict):
                    continue
                q = max(0, _trade_quantity_pieces(tr))
                p = max(0, _trade_price_kopecks(tr))
                if q <= 0:
                    continue
                if p > 0:
                    cost += q * p
        elif qty > 0:
            p = money_to_kopecks(op.get("price") if isinstance(op.get("price"), dict) else op.get("Price"))
            if p > 0:
                cost = qty * p
        if qty <= 0:
            continue
        cur_qty, cur_cost = state.get(figi, (0, 0))
        if ot.startswith("OPERATION_TYPE_BUY") or ot == "OPERATION_TYPE_DELIVERY_BUY":
            state[figi] = (cur_qty + qty, cur_cost + cost)
        else:
            # Sell / delivery sell: decrease at average cost of existing position
            if cur_qty <= 0:
                continue
            sell_qty = min(cur_qty, qty)
            new_qty = cur_qty - sell_qty
            if cur_cost > 0:
                avg = cur_cost / max(1, cur_qty)
                new_cost = int(round(cur_cost - avg * sell_qty))
            else:
                new_cost = 0
            if new_qty <= 0:
                state[figi] = (0, 0)
            else:
                state[figi] = (new_qty, max(0, new_cost))

    for figi, (qty_pieces, cost_kop) in state.items():
        if qty_pieces <= 0:
            continue
        lot_size = _tbank_figi_exchange_lot_size(
            db, token, figi, sandbox=integration.sandbox
        )
        if lot_size is None:
            logger.warning(
                "T-Invest initial positions skipped: не удалось определить lot_size для figi %s",
                figi,
            )
            continue
        lots = _tbank_pieces_to_moex_lots(qty_pieces, lot_size, figi=figi)
        if lots <= 0:
            logger.warning(
                "T-Invest initial positions: 0 лотов на дату начала учёта, актив не создаём (figi=%s pieces=%s lot_size=%s)",
                figi,
                qty_pieces,
                lot_size,
            )
            continue
        related = _get_or_create_moex_item_by_figi(
            db,
            user,
            token=token,
            figi=figi,
            sandbox=integration.sandbox,
            accounting_start=accounting_start,
            open_date=accounting_start,
            force_historical_if_open_date_eq_start=True,
        )
        if not related:
            logger.warning("T-Invest initial positions skipped: cannot resolve figi %s", figi)
            continue
        related.lot_size = lot_size
        related.position_lots = int(lots)
        if cost_kop > 0:
            # price_cents в сделках открытия — за одну бумагу (штуку), не за лот
            avg_per_share = int(round(cost_kop / max(1, qty_pieces)))
            related.opening_deals = [
                {"quantity_lots": int(lots), "price_cents": int(avg_per_share)}
            ]
        _ensure_broker_position_link(
            db,
            integration,
            external_account_id,
            figi,
            related.id,
        )
        db.flush()


def complete_tbank_import(db: Session, integration: UserIntegration, payload: TbankCompleteImportIn) -> None:
    user = db.get(User, integration.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not integration.token_ciphertext:
        raise HTTPException(status_code=400, detail="Токен не сохранён. Укажите токен T-Invest.")
    if not user.accounting_start_date:
        raise HTTPException(status_code=400, detail="Дата начала учёта не задана.")

    token = decrypt_token(integration.token_ciphertext)
    accounting_start = user.accounting_start_date
    now = datetime.now(timezone.utc)
    tbank_counterparty_id = _tbank_counterparty_id(db)

    # Refresh GetInfo snapshot (best-effort; failure should not block import)
    try:
        fetch_tbank_info_snapshot(db, integration)
    except Exception:
        logger.exception("T-Invest GetInfo fetch failed during import")

    # Load open accounts and index by external id
    accounts = list_tbank_open_accounts(db, integration)
    by_id = {a.external_account_id: a for a in accounts}

    # Apply mappings (create new brokerage account items if requested)
    for m in payload.mappings:
        acc = by_id.get(m.external_account_id)
        if not acc:
            raise HTTPException(status_code=400, detail=f"Unknown external account: {m.external_account_id}")
        link = (
            db.query(BrokerAccountLink)
            .filter(
                BrokerAccountLink.integration_id == integration.id,
                BrokerAccountLink.external_account_id == m.external_account_id,
            )
            .first()
        )
        if not link:
            raise HTTPException(status_code=400, detail=f"Unknown external account: {m.external_account_id}")
        if m.item_id is not None:
            item = db.get(Item, m.item_id)
            if not item or item.user_id != user.id or item.kind != "ASSET" or item.archived_at is not None:
                raise HTTPException(status_code=400, detail="Invalid item_id")
            link.item_id = item.id
        elif m.create_new:
            opened = (acc.opened_date or now).date()
            name = (m.new_item_name or acc.name or "Брокерский счёт").strip()
            item = _create_brokerage_account_item(
                db,
                user,
                name=name,
                open_date=opened,
                accounting_start=accounting_start,
                counterparty_id=tbank_counterparty_id,
            )
            link.item_id = item.id
        else:
            link.item_id = None
    db.flush()

    # Валютные субсчета по FIGI из всей истории (операции только до accounting_start иначе не попадают в импорт)
    links_with_items = (
        db.query(BrokerAccountLink)
        .filter(
            BrokerAccountLink.integration_id == integration.id,
            BrokerAccountLink.item_id.isnot(None),
        )
        .all()
    )
    for link in links_with_items:
        acc = by_id.get(link.external_account_id)
        if not acc or not acc.opened_date:
            continue
        primary = db.get(Item, link.item_id)
        if not primary or primary.user_id != user.id:
            continue
        ops_full = get_operations(
            token,
            link.external_account_id,
            date_from_iso=_utc_iso_z(acc.opened_date),
            date_to_iso=_utc_iso_z(now + timedelta(seconds=1)),
            sandbox=integration.sandbox,
        )
        _ensure_currency_brokerage_items_from_ops(
            db,
            user,
            token=token,
            sandbox=integration.sandbox,
            primary_item=primary,
            accounting_start=accounting_start,
            ops=ops_full,
        )
    db.flush()

    _apply_tbank_currency_subaccount_opening_balances(
        db,
        user,
        integration,
        token,
        by_id=by_id,
        links_with_items=links_with_items,
        accounting_start=accounting_start,
    )
    db.flush()

    # Initial positions if opened before accounting start
    for acc in accounts:
        if not acc.opened_date:
            continue
        if acc.opened_date.date() < accounting_start:
            _apply_initial_positions_before_accounting_start(
                db,
                user,
                integration=integration,
                token=token,
                external_account_id=acc.external_account_id,
                opened_at=acc.opened_date,
                accounting_start=accounting_start,
            )
    db.flush()

    # Import operations from max(openedDate, accounting_start) to now
    links = (
        db.query(BrokerAccountLink)
        .filter(BrokerAccountLink.integration_id == integration.id)
        .all()
    )
    for link in links:
        if not link.item_id:
            continue
        acc = by_id.get(link.external_account_id)
        if not acc or not acc.opened_date:
            continue
        lower = max(acc.opened_date, datetime.combine(accounting_start, datetime.min.time(), tzinfo=timezone.utc))
        sync_operations_for_account(
            db,
            user,
            integration,
            token,
            link,
            lower,
            now,
        )

    integration.last_sync_at = now
    integration.last_error = None
    db.commit()
