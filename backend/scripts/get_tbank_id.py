"""One-off: print counterparty id for АО ТБанк (OGRN 1027739642281)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import text

from db import SessionLocal


def main() -> None:
    session = SessionLocal()
    try:
        row = session.execute(
            text(
                "SELECT id FROM counterparties WHERE ogrn = '1027739642281' AND deleted_at IS NULL"
            )
        ).first()
        print(row[0] if row else "not found")
    finally:
        session.close()


if __name__ == "__main__":
    main()
