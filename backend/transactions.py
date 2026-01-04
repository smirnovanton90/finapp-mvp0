from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from db import get_db
from auth import get_current_user
from models import Transaction, Item, User
from schemas import TransactionCreate, TransactionOut, TransactionStatusUpdate
from sqlalchemy import select
from datetime import datetime, timezone

router = APIRouter(prefix="/transactions", tags=["transactions"])

def transfer_delta(kind: str, is_primary: bool, amount: int) -> int:
    if kind == "LIABILITY":
        return amount if is_primary else -amount
    return -amount if is_primary else amount


def insufficient_funds_detail(amount: int, balance: int, item_name: str, tx_date) -> str:
    date_label = tx_date.isoformat()
    return (
        f"Недостаточно средств для добавления транзакции по счету \"{item_name}\". "
        f"Сумма: {amount}, остаток на дату {date_label}: {balance}. "
        "Добавление транзакции приведет к отрицательному остатку."
    )


@router.get("", response_model=list[TransactionOut])
def list_transactions(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # показываем только транзакции текущего пользователя
    return (
        db.query(Transaction)
        .filter(Transaction.user_id == user.id)
        .filter(Transaction.deleted_at.is_(None))
        .order_by(Transaction.transaction_date.desc(), Transaction.id.desc())
        .all()
    )


@router.get("/deleted", response_model=list[TransactionOut])
def list_deleted_transactions(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return (
        db.query(Transaction)
        .filter(Transaction.user_id == user.id)
        .filter(Transaction.deleted_at.isnot(None))
        .order_by(Transaction.transaction_date.desc(), Transaction.id.desc())
        .all()
    )


@router.post("", response_model=TransactionOut)
@router.post("", response_model=TransactionOut)
def create_transaction(
    data: TransactionCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # 1) Проверяем, что primary_item принадлежит пользователю
    primary = (
        db.query(Item)
        .filter(Item.id == data.primary_item_id, Item.user_id == user.id)
        .with_for_update()
        .first()
    )
    if not primary:
        raise HTTPException(status_code=400, detail="Invalid primary_item_id")

    if data.transaction_date < primary.start_date:
        raise HTTPException(
            status_code=400,
            detail="Дата транзакции не может быть раньше даты начала действия актива/обязательства.",
        )

    counter = None
    amount_counterparty = None

    # 2) Правила для TRANSFER
    if data.direction == "TRANSFER":
        if not data.counterparty_item_id:
            raise HTTPException(
                status_code=400,
                detail="counterparty_item_id is required for TRANSFER",
            )

        counter = (
            db.query(Item)
            .filter(Item.id == data.counterparty_item_id, Item.user_id == user.id)
            .with_for_update()
            .first()
        )
        if not counter:
            raise HTTPException(status_code=400, detail="Invalid counterparty_item_id")

        if counter.id == primary.id:
            raise HTTPException(status_code=400, detail="Transfer items must be different")

        if data.transaction_date < counter.start_date:
            raise HTTPException(
                status_code=400,
                detail="Дата транзакции не может быть раньше даты начала действия корреспондирующего актива/обязательства.",
            )

        if primary.currency_code != counter.currency_code:
            if data.amount_counterparty is None:
                raise HTTPException(
                    status_code=400,
                    detail="amount_counterparty is required for cross-currency transfer",
                )
            amount_counterparty = data.amount_counterparty
        else:
            if data.amount_counterparty is None:
                amount_counterparty = data.amount_rub
            elif data.amount_counterparty != data.amount_rub:
                raise HTTPException(
                    status_code=400,
                    detail="amount_counterparty must match amount_rub for same-currency transfer",
                )
            else:
                amount_counterparty = data.amount_counterparty
    else:
        # для INCOME/EXPENSE корр. актив не нужен
        if data.counterparty_item_id is not None:
            raise HTTPException(
                status_code=400,
                detail="counterparty_item_id is only allowed for TRANSFER",
            )

    # 3) Создаём транзакцию
    status_value = data.status or "CONFIRMED"

    tx = Transaction(
        user_id=user.id,
        transaction_date=data.transaction_date,
        primary_item_id=data.primary_item_id,
        counterparty_item_id=data.counterparty_item_id,
        amount_rub=data.amount_rub,
        amount_counterparty=amount_counterparty,
        direction=data.direction,
        transaction_type=data.transaction_type,
        status=status_value,
        category_l1=data.category_l1,
        category_l2=data.category_l2,
        category_l3=data.category_l3,
        description=data.description,
        comment=data.comment,
    )

    # 4) Обновляем балансы ТОЛЬКО для ACTUAL
    if data.transaction_type == "ACTUAL":
        amt = data.amount_rub

        if data.direction == "INCOME":
            primary.current_value_rub += amt

        elif data.direction == "EXPENSE":
            if primary.current_value_rub < amt:
                raise HTTPException(
                    status_code=400,
                    detail=insufficient_funds_detail(
                        amount=amt,
                        balance=primary.current_value_rub,
                        item_name=primary.name,
                        tx_date=data.transaction_date,
                    ),
                )
            primary.current_value_rub -= amt

        elif data.direction == "TRANSFER":
            # counter уже проверен выше
            amt_counterparty = amount_counterparty or amt
            primary_delta = transfer_delta(primary.kind, True, amt)
            counter_delta = transfer_delta(counter.kind, False, amt_counterparty)
            if primary_delta < 0 and primary.current_value_rub < -primary_delta:
                raise HTTPException(
                    status_code=400,
                    detail=insufficient_funds_detail(
                        amount=-primary_delta,
                        balance=primary.current_value_rub,
                        item_name=primary.name,
                        tx_date=data.transaction_date,
                    ),
                )
            if counter_delta < 0 and counter.current_value_rub < -counter_delta:
                raise HTTPException(
                    status_code=400,
                    detail=insufficient_funds_detail(
                        amount=-counter_delta,
                        balance=counter.current_value_rub,
                        item_name=counter.name,
                        tx_date=data.transaction_date,
                    ),
                )
            primary.current_value_rub += primary_delta
            counter.current_value_rub += counter_delta

    db.add(tx)
    db.commit()
    db.refresh(tx)
    return tx


@router.patch("/{tx_id}", response_model=TransactionOut)
def update_transaction(
    tx_id: int,
    data: TransactionCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    tx = (
        db.query(Transaction)
        .filter(Transaction.id == tx_id, Transaction.user_id == user.id)
        .with_for_update()
        .first()
    )
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    if tx.deleted_at is not None:
        raise HTTPException(status_code=400, detail="Cannot edit deleted transaction")

    item_ids = {tx.primary_item_id, data.primary_item_id}
    if tx.counterparty_item_id:
        item_ids.add(tx.counterparty_item_id)
    if data.counterparty_item_id:
        item_ids.add(data.counterparty_item_id)

    items = (
        db.query(Item)
        .filter(Item.id.in_(item_ids), Item.user_id == user.id)
        .with_for_update()
        .all()
    )
    items_by_id = {item.id: item for item in items}

    old_primary = items_by_id.get(tx.primary_item_id)
    if not old_primary:
        raise HTTPException(status_code=400, detail="Primary item not found")
    old_counter = None
    if tx.direction == "TRANSFER":
        if not tx.counterparty_item_id:
            raise HTTPException(status_code=400, detail="Broken transfer transaction")
        old_counter = items_by_id.get(tx.counterparty_item_id)
        if not old_counter:
            raise HTTPException(status_code=400, detail="Counterparty item not found")

    new_primary = items_by_id.get(data.primary_item_id)
    if not new_primary:
        raise HTTPException(status_code=400, detail="Invalid primary_item_id")

    if data.transaction_date < new_primary.start_date:
        raise HTTPException(
            status_code=400,
            detail="Transaction date cannot be earlier than the item's start date.",
        )

    new_counter = None
    amount_counterparty = None

    if data.direction == "TRANSFER":
        if not data.counterparty_item_id:
            raise HTTPException(
                status_code=400,
                detail="counterparty_item_id is required for TRANSFER",
            )

        new_counter = items_by_id.get(data.counterparty_item_id)
        if not new_counter:
            raise HTTPException(status_code=400, detail="Invalid counterparty_item_id")

        if new_counter.id == new_primary.id:
            raise HTTPException(status_code=400, detail="Transfer items must be different")

        if data.transaction_date < new_counter.start_date:
            raise HTTPException(
                status_code=400,
                detail="Transaction date cannot be earlier than the counterparty start date.",
            )

        if new_primary.currency_code != new_counter.currency_code:
            if data.amount_counterparty is None:
                raise HTTPException(
                    status_code=400,
                    detail="amount_counterparty is required for cross-currency transfer",
                )
            amount_counterparty = data.amount_counterparty
        else:
            if data.amount_counterparty is None:
                amount_counterparty = data.amount_rub
            elif data.amount_counterparty != data.amount_rub:
                raise HTTPException(
                    status_code=400,
                    detail="amount_counterparty must match amount_rub for same-currency transfer",
                )
            else:
                amount_counterparty = data.amount_counterparty
    else:
        if data.counterparty_item_id is not None:
            raise HTTPException(
                status_code=400,
                detail="counterparty_item_id is only allowed for TRANSFER",
            )

    deltas: dict[int, int] = {}

    def add_delta(item_id: int, delta: int) -> None:
        if delta == 0:
            return
        deltas[item_id] = deltas.get(item_id, 0) + delta

    if tx.transaction_type == "ACTUAL":
        old_amt = tx.amount_rub
        old_counter_amt = (
            tx.amount_counterparty if tx.amount_counterparty is not None else old_amt
        )

        if tx.direction == "INCOME":
            add_delta(old_primary.id, -old_amt)
        elif tx.direction == "EXPENSE":
            add_delta(old_primary.id, old_amt)
        elif tx.direction == "TRANSFER":
            if not old_counter:
                raise HTTPException(status_code=400, detail="Counterparty item not found")
            old_primary_delta = transfer_delta(old_primary.kind, True, old_amt)
            old_counter_delta = transfer_delta(old_counter.kind, False, old_counter_amt)
            add_delta(old_primary.id, -old_primary_delta)
            add_delta(old_counter.id, -old_counter_delta)

    if data.transaction_type == "ACTUAL":
        new_amt = data.amount_rub
        new_counter_amt = (
            amount_counterparty if amount_counterparty is not None else new_amt
        )

        if data.direction == "INCOME":
            add_delta(new_primary.id, new_amt)
        elif data.direction == "EXPENSE":
            add_delta(new_primary.id, -new_amt)
        elif data.direction == "TRANSFER":
            if not new_counter:
                raise HTTPException(status_code=400, detail="Counterparty item not found")
            new_primary_delta = transfer_delta(new_primary.kind, True, new_amt)
            new_counter_delta = transfer_delta(new_counter.kind, False, new_counter_amt)
            add_delta(new_primary.id, new_primary_delta)
            add_delta(new_counter.id, new_counter_delta)

    for item_id, delta in deltas.items():
        item = items_by_id.get(item_id)
        if not item:
            raise HTTPException(status_code=400, detail="Item not found")
        if item.current_value_rub + delta < 0:
            raise HTTPException(
                status_code=409,
                detail="Cannot update: would make balance negative. Update later transactions first.",
            )

    for item_id, delta in deltas.items():
        items_by_id[item_id].current_value_rub += delta

    tx.transaction_date = data.transaction_date
    tx.primary_item_id = data.primary_item_id
    tx.counterparty_item_id = data.counterparty_item_id if data.direction == "TRANSFER" else None
    tx.amount_rub = data.amount_rub
    tx.amount_counterparty = amount_counterparty if data.direction == "TRANSFER" else None
    tx.direction = data.direction
    tx.transaction_type = data.transaction_type
    if data.status is not None:
        tx.status = data.status
    tx.category_l1 = data.category_l1
    tx.category_l2 = data.category_l2
    tx.category_l3 = data.category_l3
    tx.description = data.description
    tx.comment = data.comment

    db.commit()
    db.refresh(tx)
    return tx


@router.patch("/{tx_id}/status", response_model=TransactionOut)
def update_transaction_status(
    tx_id: int,
    data: TransactionStatusUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    tx = (
        db.query(Transaction)
        .filter(Transaction.id == tx_id, Transaction.user_id == user.id)
        .with_for_update()
        .first()
    )
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    if tx.deleted_at is not None:
        raise HTTPException(status_code=400, detail="Cannot update deleted transaction")

    if tx.status != data.status:
        tx.status = data.status
        db.commit()
        db.refresh(tx)
    return tx

@router.delete("/{tx_id}")
def delete_transaction(
    tx_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Лочим транзакцию, чтобы два удаления не подрались
    tx = (
        db.query(Transaction)
        .filter(Transaction.id == tx_id, Transaction.user_id == user.id)
        .with_for_update()
        .first()
    )
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")

    if tx.deleted_at is not None:
        # идемпотентность: уже удалена — ок
        return {"ok": True}

    # Лочим primary item
    primary = (
        db.query(Item)
        .filter(Item.id == tx.primary_item_id, Item.user_id == user.id)
        .with_for_update()
        .first()
    )
    if not primary:
        raise HTTPException(status_code=400, detail="Primary item not found")

    counter = None
    if tx.direction == "TRANSFER":
        if not tx.counterparty_item_id:
            raise HTTPException(status_code=400, detail="Broken transfer transaction")
        counter = (
            db.query(Item)
            .filter(Item.id == tx.counterparty_item_id, Item.user_id == user.id)
            .with_for_update()
            .first()
        )
        if not counter:
            raise HTTPException(status_code=400, detail="Counterparty item not found")

    # Откат балансов только для ACTUAL
    if tx.transaction_type == "ACTUAL":
        amt = tx.amount_rub
        amt_counterparty = tx.amount_counterparty or amt

        if tx.direction == "INCOME":
            # откат дохода = минус
            if primary.current_value_rub < amt:
                raise HTTPException(
                    status_code=409,
                    detail="Cannot delete: would make balance negative. Delete later transactions first.",
                )
            primary.current_value_rub -= amt

        elif tx.direction == "EXPENSE":
            # откат расхода = плюс
            primary.current_value_rub += amt

        elif tx.direction == "TRANSFER":
            # откат перевода: вернуть в источник, забрать у получателя
            primary_delta = -transfer_delta(primary.kind, True, amt)
            counter_delta = -transfer_delta(counter.kind, False, amt_counterparty)
            if primary.current_value_rub + primary_delta < 0:
                raise HTTPException(
                    status_code=409,
                    detail="Cannot delete: would make balance negative. Delete later transactions first.",
                )
            if counter.current_value_rub + counter_delta < 0:
                raise HTTPException(
                    status_code=409,
                    detail="Cannot delete: would make counterparty balance negative. Delete later transactions first.",
                )
            primary.current_value_rub += primary_delta
            counter.current_value_rub += counter_delta

    # soft delete
    tx.deleted_at = datetime.now(timezone.utc)

    db.commit()
    return {"ok": True}
