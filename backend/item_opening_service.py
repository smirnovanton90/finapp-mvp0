from datetime import date, datetime

from fastapi import HTTPException
from sqlalchemy.orm import Session

from category_service import resolve_category_or_400
from models import Category, Item, Transaction, User
from market_utils import is_moex_item
from transactions import (
    ResolvedSide,
    _apply_position_delta,
    _apply_transaction_soft_delete,
    _resolve_effective_side,
    get_min_balance,
    transfer_delta,
)

AUTO_OPENING_SOURCE = "AUTO_ITEM_OPENING"
AUTO_CLOSING_SOURCE = "AUTO_ITEM_CLOSING"
AUTO_COMMISSION_SOURCE = "AUTO_ITEM_COMMISSION"
COMMISSION_CATEGORY_NAME = "Комиссии от торговли на финансовом рынке"
COMMISSION_COMMENT_PREFIX = "Комиссия за приобретение ценных бумаг"

ITEM_TYPE_LABELS = {
    "cash": "\u041d\u0430\u043b\u0438\u0447\u043d\u044b\u0435",
    "bank_account": "\u0411\u0430\u043d\u043a\u043e\u0432\u0441\u043a\u0438\u0439 \u0441\u0447\u0451\u0442",
    "bank_card": "\u0411\u0430\u043d\u043a\u043e\u0432\u0441\u043a\u0430\u044f \u043a\u0430\u0440\u0442\u0430",
    "savings_account": "\u041d\u0430\u043a\u043e\u043f\u0438\u0442\u0435\u043b\u044c\u043d\u044b\u0439 \u0441\u0447\u0435\u0442",
    "e_wallet": "\u042d\u043b\u0435\u043a\u0442\u0440\u043e\u043d\u043d\u044b\u0439 \u043a\u043e\u0448\u0435\u043b\u0435\u043a",
    "brokerage": "\u0411\u0440\u043e\u043a\u0435\u0440\u0441\u043a\u0438\u0439 \u0441\u0447\u0451\u0442",
    "deposit": "\u0412\u043a\u043b\u0430\u0434",
    "securities": "\u0410\u043a\u0446\u0438\u0438",
    "bonds": "\u041e\u0431\u043b\u0438\u0433\u0430\u0446\u0438\u0438",
    "etf": "ETF",
    "bpif": "\u0411\u041f\u0418\u0424",
    "pif": "\u041f\u0418\u0424",
    "iis": "\u0418\u0418\u0421",
    "precious_metals": "\u0414\u0440\u0430\u0433\u043e\u0446\u0435\u043d\u043d\u044b\u0435 \u043c\u0435\u0442\u0430\u043b\u043b\u044b",
    "crypto": "\u041a\u0440\u0438\u043f\u0442\u043e\u0432\u0430\u043b\u044e\u0442\u0430",
    "loan_to_third_party": "\u041f\u0440\u0435\u0434\u043e\u0441\u0442\u0430\u0432\u043b\u0435\u043d\u043d\u044b\u0435 \u0437\u0430\u0439\u043c\u044b \u0442\u0440\u0435\u0442\u044c\u0438\u043c \u043b\u0438\u0446\u0430\u043c",
    "third_party_receivables": "\u0414\u043e\u043b\u0433\u0438 \u0442\u0440\u0435\u0442\u044c\u0438\u0445 \u043b\u0438\u0446",
    "real_estate": "\u041a\u0432\u0430\u0440\u0442\u0438\u0440\u0430",
    "townhouse": "\u0414\u043e\u043c / \u0442\u0430\u0443\u043d\u0445\u0430\u0443\u0441",
    "land_plot": "\u0417\u0435\u043c\u0435\u043b\u044c\u043d\u044b\u0439 \u0443\u0447\u0430\u0441\u0442\u043e\u043a",
    "garage": "\u0413\u0430\u0440\u0430\u0436 / \u043c\u0430\u0448\u0438\u043d\u043e\u043c\u0435\u0441\u0442\u043e",
    "commercial_real_estate": "\u041a\u043e\u043c\u043c\u0435\u0440\u0447\u0435\u0441\u043a\u0430\u044f \u043d\u0435\u0434\u0432\u0438\u0436\u0438\u043c\u043e\u0441\u0442\u044c",
    "real_estate_share": "\u0414\u043e\u043b\u044f \u0432 \u043d\u0435\u0434\u0432\u0438\u0436\u0438\u043c\u043e\u0441\u0442\u0438",
    "car": "\u0410\u0432\u0442\u043e\u043c\u043e\u0431\u0438\u043b\u044c",
    "motorcycle": "\u041c\u043e\u0442\u043e\u0446\u0438\u043a\u043b",
    "boat": "\u041a\u0430\u0442\u0435\u0440 / \u043b\u043e\u0434\u043a\u0430",
    "trailer": "\u041f\u0440\u0438\u0446\u0435\u043f",
    "special_vehicle": "\u0421\u043f\u0435\u0446\u0442\u0435\u0445\u043d\u0438\u043a\u0430",
    "jewelry": "\u0414\u0440\u0430\u0433\u043e\u0446\u0435\u043d\u043d\u043e\u0441\u0442\u0438",
    "electronics": "\u0422\u0435\u0445\u043d\u0438\u043a\u0430 \u0438 \u044d\u043b\u0435\u043a\u0442\u0440\u043e\u043d\u0438\u043a\u0430",
    "art": "\u0426\u0435\u043d\u043d\u044b\u0435 \u043f\u0440\u0435\u0434\u043c\u0435\u0442\u044b \u0438\u0441\u043a\u0443\u0441\u0441\u0442\u0432\u0430",
    "collectibles": "\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u043e\u043d\u043d\u044b\u0435 \u0432\u0435\u0449\u0438",
    "other_valuables": "\u041f\u0440\u043e\u0447\u0438\u0435 \u0446\u0435\u043d\u043d\u044b\u0435 \u0432\u0435\u0449\u0438",
    "npf": "\u041d\u041f\u0424",
    "investment_life_insurance": "\u0418\u0421\u0416",
    "business_share": "\u0414\u043e\u043b\u044f \u0432 \u0431\u0438\u0437\u043d\u0435\u0441\u0435",
    "sole_proprietor": "\u0418\u041f (\u043e\u0446\u0435\u043d\u043a\u0430 \u0431\u0438\u0437\u043d\u0435\u0441\u0430)",
    "other_asset": "\u041f\u0440\u043e\u0447\u0438\u0435 \u0430\u043a\u0442\u0438\u0432\u044b",
    "credit_card_debt": "\u0417\u0430\u0434\u043e\u043b\u0436\u0435\u043d\u043d\u043e\u0441\u0442\u044c \u043f\u043e \u043a\u0440\u0435\u0434\u0438\u0442\u043d\u043e\u0439 \u043a\u0430\u0440\u0442\u0435",
    "consumer_loan": "\u041f\u043e\u0442\u0440\u0435\u0431\u0438\u0442\u0435\u043b\u044c\u0441\u043a\u0438\u0439 \u043a\u0440\u0435\u0434\u0438\u0442",
    "mortgage": "\u0418\u043f\u043e\u0442\u0435\u043a\u0430",
    "car_loan": "\u0410\u0432\u0442\u043e\u043a\u0440\u0435\u0434\u0438\u0442",
    "education_loan": "\u041e\u0431\u0440\u0430\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c\u043d\u044b\u0439 \u043a\u0440\u0435\u0434\u0438\u0442",
    "installment": "\u0420\u0430\u0441\u0441\u0440\u043e\u0447\u043a\u0430",
    "microloan": "\u041c\u0424\u041e",
    "private_loan": "\u041f\u043e\u043b\u0443\u0447\u0435\u043d\u043d\u044b\u0435 \u0437\u0430\u0439\u043c\u044b \u043e\u0442 \u0442\u0440\u0435\u0442\u044c\u0438\u0445 \u043b\u0438\u0446",
    "third_party_payables": "\u0414\u043e\u043b\u0433\u0438 \u0442\u0440\u0435\u0442\u044c\u0438\u043c \u043b\u0438\u0446\u0430\u043c",
    "tax_debt": "\u041d\u0430\u043b\u043e\u0433\u0438 \u0438 \u043e\u0431\u044f\u0437\u0430\u0442\u0435\u043b\u044c\u043d\u044b\u0435 \u043f\u043b\u0430\u0442\u0435\u0436\u0438",
    "personal_income_tax_debt": "\u0417\u0430\u0434\u043e\u043b\u0436\u0435\u043d\u043d\u043e\u0441\u0442\u044c \u043f\u043e \u041d\u0414\u0424\u041b",
    "property_tax_debt": "\u0417\u0430\u0434\u043e\u043b\u0436\u0435\u043d\u043d\u043e\u0441\u0442\u044c \u043f\u043e \u043d\u0430\u043b\u043e\u0433\u0443 \u043d\u0430 \u0438\u043c\u0443\u0449\u0435\u0441\u0442\u0432\u043e",
    "land_tax_debt": "\u0417\u0430\u0434\u043e\u043b\u0436\u0435\u043d\u043d\u043e\u0441\u0442\u044c \u043f\u043e \u0437\u0435\u043c\u0435\u043b\u044c\u043d\u043e\u043c\u0443 \u043d\u0430\u043b\u043e\u0433\u0443",
    "transport_tax_debt": "\u0417\u0430\u0434\u043e\u043b\u0436\u0435\u043d\u043d\u043e\u0441\u0442\u044c \u043f\u043e \u0442\u0440\u0430\u043d\u0441\u043f\u043e\u0440\u0442\u043d\u043e\u043c\u0443 \u043d\u0430\u043b\u043e\u0433\u0443",
    "fns_debt": "\u0417\u0430\u0434\u043e\u043b\u0436\u0435\u043d\u043d\u043e\u0441\u0442\u0438 \u043f\u0435\u0440\u0435\u0434 \u0424\u041d\u0421",
    "utilities_debt": "\u0417\u0430\u0434\u043e\u043b\u0436\u0435\u043d\u043d\u043e\u0441\u0442\u044c \u043f\u043e \u0416\u041a\u0425",
    "telecom_debt": "\u0417\u0430\u0434\u043e\u043b\u0436\u0435\u043d\u043d\u043e\u0441\u0442\u044c \u0437\u0430 \u0438\u043d\u0442\u0435\u0440\u043d\u0435\u0442 / \u0441\u0432\u044f\u0437\u044c",
    "traffic_fines_debt": "\u0417\u0430\u0434\u043e\u043b\u0436\u0435\u043d\u043d\u043e\u0441\u0442\u044c \u043f\u043e \u0448\u0442\u0440\u0430\u0444\u0430\u043c (\u0413\u0418\u0411\u0414\u0414 \u0438 \u043f\u0440\u043e\u0447\u0438\u0435)",
    "enforcement_debt": "\u0417\u0430\u0434\u043e\u043b\u0436\u0435\u043d\u043d\u043e\u0441\u0442\u044c \u043f\u043e \u0438\u0441\u043f\u043e\u043b\u043d\u0438\u0442\u0435\u043b\u044c\u043d\u044b\u043c \u043b\u0438\u0441\u0442\u0430\u043c",
    "alimony_debt": "\u0417\u0430\u0434\u043e\u043b\u0436\u0435\u043d\u043d\u043e\u0441\u0442\u044c \u043f\u043e \u0430\u043b\u0438\u043c\u0435\u043d\u0442\u0430\u043c",
    "court_debt": "\u0421\u0443\u0434\u0435\u0431\u043d\u044b\u0435 \u0437\u0430\u0434\u043e\u043b\u0436\u0435\u043d\u043d\u043e\u0441\u0442\u0438",
    "court_fine_debt": "\u0428\u0442\u0440\u0430\u0444\u044b \u043f\u043e \u0440\u0435\u0448\u0435\u043d\u0438\u044f\u043c \u0441\u0443\u0434\u0430",
    "business_liability": "\u0411\u0438\u0437\u043d\u0435\u0441-\u043e\u0431\u044f\u0437\u0430\u0442\u0435\u043b\u044c\u0441\u0442\u0432\u0430",
    "other_liability": "\u041f\u0440\u043e\u0447\u0438\u0435 \u043e\u0431\u044f\u0437\u0430\u0442\u0435\u043b\u044c\u0441\u0442\u0432\u0430",
}

CARD_KIND_LABELS = {
    "CREDIT": "\u043a\u0440\u0435\u0434\u0438\u0442\u043d\u0430\u044f",
    "DEBIT": "\u0434\u0435\u0431\u0435\u0442\u043e\u0432\u0430\u044f",
}

OPEN_ACTION_LABEL = "\u041e\u0442\u043a\u0440\u044b\u0442\u0438\u0435"
CLOSE_ACTION_LABEL = "\u0417\u0430\u043a\u0440\u044b\u0442\u0438\u0435"

def _resolve_item_type_label(item: Item) -> str | None:
    label = ITEM_TYPE_LABELS.get(item.type_code)
    if not label:
        return None
    if item.type_code == "bank_card" and item.card_kind:
        kind_label = CARD_KIND_LABELS.get(item.card_kind)
        if kind_label:
            return f"{label} ({kind_label})"
    return label

def _build_item_comment(item: Item, action: str) -> str:
    action_label = OPEN_ACTION_LABEL if action == "OPEN" else CLOSE_ACTION_LABEL
    type_label = _resolve_item_type_label(item)
    if type_label:
        return f'{action_label}: {type_label} "{item.name}"'
    return f'{action_label}: "{item.name}"'


def _resolve_category_by_name(db: Session, user: User, name: str) -> Category:
    category = (
        db.query(Category)
        .filter(Category.name == name, Category.owner_user_id == user.id)
        .first()
    )
    if not category:
        category = (
            db.query(Category)
            .filter(Category.name == name, Category.owner_user_id.is_(None))
            .first()
        )
    if not category:
        raise HTTPException(status_code=400, detail=f"Category '{name}' not found")
    resolved = resolve_category_or_400(db, user, category.id)
    if not resolved:
        raise HTTPException(status_code=400, detail=f"Category '{name}' is not available")
    return resolved


def _validate_tx_date(tx_date: date, side: ResolvedSide, label: str) -> None:
    if tx_date < side.start_date:
        raise HTTPException(
            status_code=400,
            detail=f"{label} date cannot be earlier than the item start date",
        )


def _create_transfer(
    db: Session,
    user: User,
    primary_item_id: int,
    counterparty_item_id: int,
    amount_rub: int,
    tx_date: date,
    linked_item_id: int,
    source: str,
    comment: str | None = None,
    transaction_type: str = "ACTUAL",
    primary_quantity_lots: int | None = None,
    counterparty_quantity_lots: int | None = None,
) -> None:
    primary_side = _resolve_effective_side(db, user, primary_item_id, True, "primary")
    counter_side = _resolve_effective_side(
        db, user, counterparty_item_id, True, "counterparty"
    )

    if primary_side.selected_item.id == counter_side.selected_item.id:
        raise HTTPException(status_code=400, detail="Transfer items must be different")
    if primary_side.effective_item.id == counter_side.effective_item.id:
        raise HTTPException(status_code=400, detail="Transfer items must be different")

    _validate_tx_date(tx_date, primary_side, "Transaction")
    _validate_tx_date(tx_date, counter_side, "Transaction")

    primary = primary_side.effective_item
    counter = counter_side.effective_item
    if primary.currency_code != counter.currency_code:
        raise HTTPException(
            status_code=400,
            detail="Opening transfer requires matching currencies.",
        )

    amount = amount_rub
    primary_is_moex = is_moex_item(primary)
    counter_is_moex = is_moex_item(counter)
    if transaction_type == "ACTUAL":
        if primary_is_moex:
            if primary_quantity_lots:
                _apply_position_delta(primary, -(primary_quantity_lots or 0), tx_date)
        else:
            primary_delta = transfer_delta(primary.kind, True, amount)
            primary_next = primary.current_value_rub + primary_delta
            if primary_next < get_min_balance(primary):
                raise HTTPException(
                    status_code=400,
                    detail="Opening transfer would make balance negative.",
                )
            primary.current_value_rub = primary_next

        if counter_is_moex:
            if counterparty_quantity_lots:
                _apply_position_delta(counter, counterparty_quantity_lots or 0, tx_date)
        else:
            counter_delta = transfer_delta(counter.kind, False, amount)
            counter_next = counter.current_value_rub + counter_delta
            if counter_next < get_min_balance(counter):
                raise HTTPException(
                    status_code=400,
                    detail="Opening transfer would make balance negative.",
                )
            counter.current_value_rub = counter_next

    tx = Transaction(
        user_id=user.id,
        linked_item_id=linked_item_id,
        transaction_date=datetime.combine(tx_date, datetime.min.time()),
        primary_item_id=primary.id,
        primary_card_item_id=primary_side.card_item.id if primary_side.card_item else None,
        counterparty_item_id=counter.id,
        counterparty_card_item_id=(
            counter_side.card_item.id if counter_side.card_item else None
        ),
        counterparty_id=None,
        amount_rub=amount,
        amount_counterparty=amount,
        primary_quantity_lots=primary_quantity_lots,
        counterparty_quantity_lots=counterparty_quantity_lots,
        direction="TRANSFER",
        transaction_type=transaction_type,
        status="CONFIRMED",
        category_id=None,
        description=None,
        comment=comment,
        source=source,
    )
    db.add(tx)


def _create_income_expense(
    db: Session,
    user: User,
    item_id: int,
    amount_rub: int,
    tx_date: date,
    direction: str,
    category_name: str,
    linked_item_id: int,
    comment: str | None = None,
    primary_quantity_lots: int | None = None,
    source: str = AUTO_OPENING_SOURCE,
) -> None:
    primary_side = _resolve_effective_side(db, user, item_id, True, "primary")
    _validate_tx_date(tx_date, primary_side, "Transaction")
    primary = primary_side.effective_item

    if direction == "INCOME":
        if is_moex_item(primary):
            if primary_quantity_lots:
                _apply_position_delta(primary, primary_quantity_lots or 0, tx_date)
        else:
            primary.current_value_rub += amount_rub
    else:
        if is_moex_item(primary):
            if primary_quantity_lots:
                _apply_position_delta(primary, -(primary_quantity_lots or 0), tx_date)
        elif primary.kind == "LIABILITY":
            primary.current_value_rub += amount_rub
        else:
            next_balance = primary.current_value_rub - amount_rub
            if next_balance < get_min_balance(primary):
                raise HTTPException(
                    status_code=400,
                    detail="Opening transaction would make balance negative.",
                )
            primary.current_value_rub = next_balance

    category = _resolve_category_by_name(db, user, category_name)
    tx = Transaction(
        user_id=user.id,
        linked_item_id=linked_item_id,
        transaction_date=datetime.combine(tx_date, datetime.min.time()),
        primary_item_id=primary.id,
        primary_card_item_id=primary_side.card_item.id if primary_side.card_item else None,
        counterparty_item_id=None,
        counterparty_card_item_id=None,
        counterparty_id=None,
        amount_rub=amount_rub,
        amount_counterparty=None,
        primary_quantity_lots=primary_quantity_lots,
        counterparty_quantity_lots=None,
        direction=direction,
        transaction_type="ACTUAL",
        status="CONFIRMED",
        category_id=category.id,
        description=None,
        comment=comment,
        source=source,
    )
    db.add(tx)


def _resolve_closing_date(
    item: Item,
    deposit_end_date: date | None,
    plan_settings,
) -> date | None:
    if item.type_code == "deposit":
        return deposit_end_date
    if plan_settings and plan_settings.loan_end_date:
        return plan_settings.loan_end_date
    if plan_settings and plan_settings.plan_end_date:
        return plan_settings.plan_end_date
    return None


def create_opening_transactions(
    db: Session,
    user: User,
    item: Item,
    counterparty: Item | None,
    amount_rub: int,
    quantity_lots: int | None,
    deposit_end_date: date | None,
    plan_settings,
) -> None:
    is_moex = is_moex_item(item)
    if is_moex:
        if quantity_lots is None or quantity_lots <= 0:
            return
    elif amount_rub <= 0:
        return

    opening_comment = _build_item_comment(item, "OPEN")
    closing_comment = _build_item_comment(item, "CLOSE")

    tx_date = item.open_date
    if counterparty:
        if item.kind == "ASSET":
            primary_id = counterparty.id
            counter_id = item.id
            primary_lots = None
            counter_lots = quantity_lots if is_moex else None
        else:
            primary_id = item.id
            counter_id = counterparty.id
            primary_lots = quantity_lots if is_moex else None
            counter_lots = None

        _create_transfer(
            db=db,
            user=user,
            primary_item_id=primary_id,
            counterparty_item_id=counter_id,
            amount_rub=amount_rub,
            tx_date=tx_date,
            linked_item_id=item.id,
            source=AUTO_OPENING_SOURCE,
            comment=opening_comment,
            primary_quantity_lots=primary_lots,
            counterparty_quantity_lots=counter_lots,
        )

        closing_date = _resolve_closing_date(item, deposit_end_date, plan_settings)
        if closing_date:
            _create_transfer(
                db=db,
                user=user,
                primary_item_id=counter_id,
                counterparty_item_id=primary_id,
                amount_rub=amount_rub,
                tx_date=closing_date,
                linked_item_id=item.id,
                source=AUTO_CLOSING_SOURCE,
                comment=closing_comment,
                transaction_type="PLANNED",
                primary_quantity_lots=counter_lots,
                counterparty_quantity_lots=primary_lots,
            )
        return

    if item.kind == "ASSET":
        direction = "INCOME"
        category_name = "Прочие доходы"
    else:
        direction = "EXPENSE"
        category_name = "Прочие расходы"

    _create_income_expense(
        db=db,
        user=user,
        item_id=item.id,
        amount_rub=amount_rub,
        tx_date=tx_date,
        direction=direction,
        category_name=category_name,
        comment=opening_comment,
        linked_item_id=item.id,
        primary_quantity_lots=quantity_lots if is_moex else None,
    )


def _build_commission_comment(instrument_label: str | None) -> str:
    if instrument_label:
        return f"{COMMISSION_COMMENT_PREFIX} {instrument_label}"
    return COMMISSION_COMMENT_PREFIX


def create_commission_transaction(
    db: Session,
    user: User,
    item: Item,
    payment_item_id: int,
    amount_rub: int,
    tx_date: date,
    instrument_label: str | None,
) -> None:
    if amount_rub <= 0:
        return
    comment = _build_commission_comment(instrument_label)
    _create_income_expense(
        db=db,
        user=user,
        item_id=payment_item_id,
        amount_rub=amount_rub,
        tx_date=tx_date,
        direction="EXPENSE",
        category_name=COMMISSION_CATEGORY_NAME,
        comment=comment,
        linked_item_id=item.id,
        source=AUTO_COMMISSION_SOURCE,
    )


def delete_opening_transactions(db: Session, user: User, item_id: int) -> None:
    txs = (
        db.query(Transaction)
        .filter(Transaction.user_id == user.id)
        .filter(Transaction.linked_item_id == item_id)
        .filter(Transaction.source.in_([AUTO_OPENING_SOURCE, AUTO_CLOSING_SOURCE]))
        .filter(Transaction.deleted_at.is_(None))
        .order_by(Transaction.transaction_date.desc(), Transaction.id.desc())
        .with_for_update()
        .all()
    )
    for tx in txs:
        _apply_transaction_soft_delete(db, user, tx)


def delete_commission_transactions(db: Session, user: User, item_id: int) -> None:
    txs = (
        db.query(Transaction)
        .filter(Transaction.user_id == user.id)
        .filter(Transaction.linked_item_id == item_id)
        .filter(Transaction.source == AUTO_COMMISSION_SOURCE)
        .filter(Transaction.deleted_at.is_(None))
        .order_by(Transaction.transaction_date.desc(), Transaction.id.desc())
        .with_for_update()
        .all()
    )
    for tx in txs:
        _apply_transaction_soft_delete(db, user, tx)
