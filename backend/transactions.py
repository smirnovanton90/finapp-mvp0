from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from db import get_db
from auth import get_current_user
from models import Transaction, Item, User
from schemas import TransactionCreate, TransactionOut

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
        .order_by(Transaction.transaction_date.desc(), Transaction.id.desc())
        .all()
    )


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
        .first()
    )
    if not primary:
        raise HTTPException(status_code=400, detail="Invalid primary_item_id")

    # 2) Для TRANSFER обязателен counterparty_item_id и он тоже должен принадлежать пользователю
    if data.direction == "TRANSFER":
        if not data.counterparty_item_id:
            raise HTTPException(status_code=400, detail="counterparty_item_id is required for TRANSFER")

        counter = (
            db.query(Item)
            .filter(Item.id == data.counterparty_item_id, Item.user_id == user.id)
            .first()
        )
        if not counter:
            raise HTTPException(status_code=400, detail="Invalid counterparty_item_id")
    else:
        # для INCOME/EXPENSE корреспондирующий актив не нужен
        if data.counterparty_item_id is not None:
            raise HTTPException(status_code=400, detail="counterparty_item_id is only allowed for TRANSFER")

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

    db.add(tx)
    db.commit()
    db.refresh(tx)
    return tx