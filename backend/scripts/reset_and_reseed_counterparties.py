"""
Удалить всех контрагентов из БД, обнулить ссылки на них, затем пересидить
только контрагентов из counterparty_seed_data.DEFAULT_COUNTERPARTIES.
Использовать после удаления bank_seed_data / seed_banks.
"""
import subprocess
import sys
from pathlib import Path

from sqlalchemy import delete, update

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from db import SessionLocal
from models import Counterparty, Item, Transaction, TransactionChain

_BACKEND_DIR = Path(__file__).resolve().parents[1]
_SEED_SCRIPT = _BACKEND_DIR / "scripts" / "seed_default_counterparties.py"


def reset_and_reseed(dry_run: bool) -> None:
    session = SessionLocal()
    try:
        # 1. Обнулить ссылки на контрагентов
        session.execute(update(Item).where(Item.counterparty_id.isnot(None)).values(counterparty_id=None))
        session.execute(
            update(Transaction).where(Transaction.counterparty_id.isnot(None)).values(counterparty_id=None)
        )
        session.execute(
            update(TransactionChain).where(TransactionChain.counterparty_id.isnot(None)).values(counterparty_id=None)
        )

        # 2. Удалить всех контрагентов
        result = session.execute(delete(Counterparty))
        deleted = result.rowcount if result.rowcount is not None and result.rowcount >= 0 else "?"

        if dry_run:
            session.rollback()
            print("[dry-run] Будет обнулены ссылки в items/transactions/chains, удалены все контрагенты.")
            return
        session.commit()
        print(f"Удалено контрагентов: {deleted}")
    finally:
        session.close()

    # 3. Пересидить только DEFAULT_COUNTERPARTIES
    subprocess.run(
        [sys.executable, str(_SEED_SCRIPT)],
        cwd=str(_BACKEND_DIR),
        check=True,
    )
    print("Пересидка контрагентов выполнена.")


def main() -> None:
    import argparse
    parser = argparse.ArgumentParser(
        description="Удалить всех контрагентов, обнулить ссылки, пересидить только сид (DEFAULT_COUNTERPARTIES)."
    )
    parser.add_argument("--dry-run", action="store_true", help="Не записывать в БД")
    args = parser.parse_args()
    reset_and_reseed(dry_run=args.dry_run)


if __name__ == "__main__":
    main()
