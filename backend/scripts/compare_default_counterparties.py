"""
Запрос к БД: контрагенты с owner_user_id IS NULL (дефолтные).
Сравнение со списком counterparty_seed_data.DEFAULT_COUNTERPARTIES.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select

from counterparty_seed_data import DEFAULT_COUNTERPARTIES
from db import SessionLocal
from models import Counterparty


def main() -> None:
    session = SessionLocal()
    try:
        # Контрагенты в БД (дефолтные: без владельца, не удалённые)
        rows = session.execute(
            select(Counterparty)
            .where(Counterparty.owner_user_id.is_(None))
            .where(Counterparty.deleted_at.is_(None))
            .order_by(Counterparty.name)
        ).scalars().all()
        db_counterparties = list(rows)

        seed_by_inn = {c["inn"].strip(): c for c in DEFAULT_COUNTERPARTIES}
        db_by_inn = {c.inn: c for c in db_counterparties if c.inn}

        seed_inns = set(seed_by_inn.keys())
        db_inns = set(db_by_inn.keys())

        only_in_seed = seed_inns - db_inns
        only_in_db = db_inns - seed_inns
        in_both = seed_inns & db_inns

        lines = []
        lines.append("=" * 60)
        lines.append("ДЕФОЛТНЫЕ КОНТРАГЕНТЫ: сид vs БД")
        lines.append("=" * 60)
        lines.append(f"В сиде (DEFAULT_COUNTERPARTIES): {len(DEFAULT_COUNTERPARTIES)} записей")
        lines.append(f"В БД (owner_user_id IS NULL):    {len(db_counterparties)} записей")
        lines.append("")

        if only_in_seed:
            lines.append("--- Только в сиде (нет в БД) ---")
            for inn in sorted(only_in_seed):
                s = seed_by_inn[inn]
                lines.append(f"  {s['name']!r}  INN={inn}")
            lines.append("")

        if only_in_db:
            lines.append("--- Только в БД (нет в сиде DEFAULT_COUNTERPARTIES) ---")
            for inn in sorted(only_in_db):
                c = db_by_inn[inn]
                lines.append(f"  {c.name!r}  INN={inn}")
            lines.append("")

        # Совпадения по ИНН (имя может отличаться)
        name_mismatch = []
        for inn in sorted(in_both):
            s = seed_by_inn[inn]
            c = db_by_inn[inn]
            if (s["name"].strip() or "") != (c.name or ""):
                name_mismatch.append((inn, s["name"], c.name))

        if name_mismatch:
            lines.append("--- В обеих: различие в name ---")
            for inn, seed_name, db_name in name_mismatch:
                lines.append(f"  INN={inn}  сид: {seed_name!r}  БД: {db_name!r}")
            lines.append("")

        lines.append("--- Итог ---")
        lines.append(f"Только в сиде:    {len(only_in_seed)}")
        lines.append(f"Только в БД:     {len(only_in_db)}")
        lines.append(f"Совпадение (ИНН): {len(in_both)}")
        if name_mismatch:
            lines.append(f"Из них разное name: {len(name_mismatch)}")

        report = "\n".join(lines)
        out_path = Path(__file__).resolve().parents[1] / "compare_default_counterparties_report.txt"
        out_path.write_text(report, encoding="utf-8")
        print(report)
        print(f"\nОтчёт сохранён: {out_path}")
    finally:
        session.close()


if __name__ == "__main__":
    main()
