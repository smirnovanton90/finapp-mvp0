"""
Удалить из БД контрагента по ИНН (обнулить ссылки, затем удалить запись).
Пример: python scripts/delete_counterparty_by_inn.py 7704970511
"""
import sys
from pathlib import Path

from sqlalchemy import delete, select, update

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from db import SessionLocal
from models import Counterparty, Item, Transaction, TransactionChain


def delete_by_inn(inn: str) -> None:
    session = SessionLocal()
    try:
        row = session.execute(
            select(Counterparty).where(
                Counterparty.inn == inn,
                Counterparty.owner_user_id.is_(None),
            )
        ).scalar_one_or_none()
        if not row:
            print(f"Контрагент с ИНН {inn} не найден.")
            return
        cp_id = row.id
        name = row.name
        session.execute(update(Item).where(Item.counterparty_id == cp_id).values(counterparty_id=None))
        session.execute(update(Transaction).where(Transaction.counterparty_id == cp_id).values(counterparty_id=None))
        session.execute(
            update(TransactionChain).where(TransactionChain.counterparty_id == cp_id).values(counterparty_id=None)
        )
        session.execute(delete(Counterparty).where(Counterparty.id == cp_id))
        session.commit()
        print(f"Удалён контрагент: {name!r} (ИНН {inn}, id={cp_id}).")
    finally:
        session.close()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Использование: python delete_counterparty_by_inn.py <ИНН>")
        sys.exit(1)
    delete_by_inn(sys.argv[1].strip())
