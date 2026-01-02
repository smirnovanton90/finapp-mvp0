import argparse
import xml.etree.ElementTree as ET

import requests

from db import SessionLocal
from models import Currency

CBR_URL = "https://cbr.ru/scripts/XML_valFull.asp"


def load_xml(path: str | None) -> bytes:
    if path:
        with open(path, "rb") as f:
            return f.read()

    response = requests.get(CBR_URL, timeout=30)
    response.raise_for_status()
    return response.content


def parse_currencies(xml_bytes: bytes) -> list[dict]:
    root = ET.fromstring(xml_bytes)
    rows_by_code: dict[str, dict] = {}

    for item in root.findall("Item"):
        iso_char_code = (item.findtext("ISO_Char_Code") or "").strip()
        if not iso_char_code:
            continue

        iso_num_code = (item.findtext("ISO_Num_Code") or "").strip()
        name = (item.findtext("Name") or "").strip()
        eng_name = (item.findtext("EngName") or "").strip()
        nominal_text = (item.findtext("Nominal") or "").strip()

        try:
            nominal = int(nominal_text)
        except ValueError:
            nominal = 1

        rows_by_code[iso_char_code] = {
            "iso_char_code": iso_char_code,
            "iso_num_code": iso_num_code,
            "nominal": nominal,
            "name": name,
            "eng_name": eng_name,
        }

    rows_by_code["RUB"] = {
        "iso_char_code": "RUB",
        "iso_num_code": "643",
        "nominal": 1,
        "name": "Российский рубль",
        "eng_name": "Russian Ruble",
    }

    return list(rows_by_code.values())


def upsert_currencies(rows: list[dict], dry_run: bool) -> int:
    session = SessionLocal()
    try:
        for data in rows:
            existing = session.get(Currency, data["iso_char_code"])
            if existing:
                existing.iso_num_code = data["iso_num_code"]
                existing.nominal = data["nominal"]
                existing.name = data["name"]
                existing.eng_name = data["eng_name"]
            else:
                session.add(Currency(**data))

        if dry_run:
            session.rollback()
        else:
            session.commit()
    finally:
        session.close()

    return len(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed currencies from CBR XML.")
    parser.add_argument("--file", help="Path to XML_valFull.asp downloaded locally")
    parser.add_argument("--dry-run", action="store_true", help="Parse and validate without DB commit")
    args = parser.parse_args()

    xml_bytes = load_xml(args.file)
    rows = parse_currencies(xml_bytes)
    count = upsert_currencies(rows, args.dry_run)
    print(f"Processed {count} currencies")


if __name__ == "__main__":
    main()
