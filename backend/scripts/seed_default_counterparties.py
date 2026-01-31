"""
Сид контрагентов по умолчанию (доступны всем пользователям).
Данные из counterparty_seed_data.DEFAULT_COUNTERPARTIES.
При одинаковом ИНН обновляется одна запись (последняя в списке).
"""
import argparse
import sys
from pathlib import Path

from sqlalchemy import select

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from counterparty_seed_data import DEFAULT_COUNTERPARTIES
from db import SessionLocal
from models import Counterparty, CounterpartyIndustry


def get_industry_by_name(session, name: str) -> CounterpartyIndustry | None:
    return session.execute(
        select(CounterpartyIndustry).where(CounterpartyIndustry.name == name)
    ).scalar_one_or_none()


def upsert_default_counterparties(dry_run: bool) -> int:
    session = SessionLocal()
    try:
        industry_by_name: dict[str, CounterpartyIndustry] = {}
        for row in DEFAULT_COUNTERPARTIES:
            industry_name = row["industry"]
            if industry_name not in industry_by_name:
                ind = get_industry_by_name(session, industry_name)
                if not ind:
                    raise RuntimeError(
                        f"Отрасль не найдена в БД: {industry_name!r}. "
                        "Проверьте миграцию counterparty_industries."
                    )
                industry_by_name[industry_name] = ind

        created = 0
        updated = 0
        for data in DEFAULT_COUNTERPARTIES:
            industry = industry_by_name[data["industry"]]
            existing = session.execute(
                select(Counterparty).where(
                    Counterparty.inn == data["inn"],
                    Counterparty.owner_user_id.is_(None),
                )
            ).scalars().first()

            payload = {
                "entity_type": "LEGAL",
                "name": data["name"].strip(),
                "full_name": (data["full_name"] or "").strip() or None,
                "legal_form": (data["legal_form"] or "").strip() or None,
                "inn": data["inn"].strip(),
                "industry_id": industry.id,
                "owner_user_id": None,
            }

            if existing:
                existing.name = payload["name"]
                existing.full_name = payload["full_name"]
                existing.legal_form = payload["legal_form"]
                existing.inn = payload["inn"]
                existing.industry_id = payload["industry_id"]
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
        description="Добавить/обновить контрагентов по умолчанию (доступны всем пользователям)."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Проверить данные без записи в БД",
    )
    args = parser.parse_args()

    if not DEFAULT_COUNTERPARTIES:
        print("Нет данных в DEFAULT_COUNTERPARTIES.")
        sys.exit(1)

    count = upsert_default_counterparties(dry_run=args.dry_run)
    print(f"Обработано записей: {count}")


if __name__ == "__main__":
    main()
