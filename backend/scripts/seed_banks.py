"""
Сид банков из предопределённого списка (bank_seed_data.BANKS_SEED_DATA).
Удаляет ранее добавленные банки из ЦБ РФ и создаёт записи только из локального списка.
"""
import argparse
import sys
from pathlib import Path

from sqlalchemy import delete, or_, select

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from bank_seed_data import BANKS_SEED_DATA
from db import SessionLocal
from models import Counterparty, CounterpartyIndustry


def upsert_banks(dry_run: bool) -> int:
    if not BANKS_SEED_DATA:
        raise RuntimeError("Нет банков в BANKS_SEED_DATA.")

    session = SessionLocal()
    try:
        bank_industry = session.execute(
            select(CounterpartyIndustry).where(CounterpartyIndustry.name == "Банки")
        ).scalar_one_or_none()
        if bank_industry is None:
            bank_industry = CounterpartyIndustry(name="Банки")
            session.add(bank_industry)
            session.flush()

        inns = {row["inn"] for row in BANKS_SEED_DATA}

        # Удаляем банки, не входящие в новый список, если на них нет ссылок из items
        from models import Item
        used_bank_ids = select(Item.counterparty_id).where(
            Item.counterparty_id.isnot(None),
        ).distinct()
        session.execute(
            delete(Counterparty).where(
                Counterparty.industry_id == bank_industry.id,
                Counterparty.owner_user_id.is_(None),
                or_(
                    Counterparty.inn.is_(None),
                    Counterparty.inn.notin_(inns),
                ),
                ~Counterparty.id.in_(used_bank_ids),
            )
        )

        created = 0
        updated = 0
        for data in BANKS_SEED_DATA:
            existing = session.execute(
                select(Counterparty).where(
                    Counterparty.inn == data["inn"],
                    Counterparty.industry_id == bank_industry.id,
                    Counterparty.owner_user_id.is_(None),
                )
            ).scalar_one_or_none()

            payload = {
                "entity_type": "LEGAL",
                "name": data["name"].strip(),
                "full_name": (data.get("full_name") or "").strip() or None,
                "legal_form": (data.get("legal_form") or "").strip() or None,
                "inn": data["inn"].strip(),
                "industry_id": bank_industry.id,
                "owner_user_id": None,
                "license_status": "Действующая",
            }

            if existing:
                existing.name = payload["name"]
                existing.full_name = payload["full_name"]
                existing.legal_form = payload["legal_form"]
                existing.license_status = payload["license_status"]
                updated += 1
            else:
                session.add(Counterparty(**payload))
                created += 1

        if dry_run:
            session.rollback()
            print(f"[dry-run] Будет создано: {created}, обновлено: {updated}")
        else:
            session.commit()
            print(f"Создано: {created}, обновлено: {updated}")

        return created + updated
    finally:
        session.close()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Сид банков из предопределённого списка (удаляет старые банки из ЦБ РФ)."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Проверить данные без записи в БД",
    )
    args = parser.parse_args()

    count = upsert_banks(dry_run=args.dry_run)
    print(f"Обработано банков: {count}")


if __name__ == "__main__":
    main()
