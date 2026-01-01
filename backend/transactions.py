from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from db import get_db
from auth import get_current_user
from models import Transaction, Item, User
from schemas import TransactionCreate, TransactionOut
from sqlalchemy import select
from datetime import datetime, timezone

router = APIRouter(prefix="/transactions", tags=["transactions"])


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

    counter = None

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
    else:
        # для INCOME/EXPENSE корр. актив не нужен
        if data.counterparty_item_id is not None:
            raise HTTPException(
                status_code=400,
                detail="counterparty_item_id is only allowed for TRANSFER",
            )

    # 3) Создаём транзакцию
    tx = Transaction(
        user_id=user.id,
        transaction_date=data.transaction_date,
        primary_item_id=data.primary_item_id,
        counterparty_item_id=data.counterparty_item_id,
        amount_rub=data.amount_rub,
        direction=data.direction,
        transaction_type=data.transaction_type,
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
                raise HTTPException(status_code=400, detail="Insufficient funds")
            primary.current_value_rub -= amt

        elif data.direction == "TRANSFER":
            # counter уже проверен выше
            if primary.current_value_rub < amt:
                raise HTTPException(status_code=400, detail="Insufficient funds for transfer")
            primary.current_value_rub -= amt
            counter.current_value_rub += amt

    db.add(tx)
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
            if counter.current_value_rub < amt:
                raise HTTPException(
                    status_code=409,
                    detail="Cannot delete: would make counterparty balance negative. Delete later transactions first.",
                )
            primary.current_value_rub += amt
            counter.current_value_rub -= amt

    # soft delete
    tx.deleted_at = datetime.now(timezone.utc)

    db.commit()
    return {"ok": True}
