import argparse
from html import unescape
from html.parser import HTMLParser

import requests
from sqlalchemy import delete, select

from db import SessionLocal
from models import Bank

CBR_URL = "https://cbr.ru/banking_sector/credit/FullCoList/"
ALLOWED_STATUSES = {"Действующая", "Отозванная"}
LOGO_BY_OGRN = {
    "1027700132195": "https://habrastorage.org/getpro/moikrug/uploads/company/100/006/341/2/logo/32156f1572916e1f7fb432e67e1defc2.png",
    "1027700067328": "https://cdn-gc.type.today/storage/post_image/2/2/2238/preview_image-EXYKTzwLxK5OXIa-bYnGJjO_wYVJ2I-WOg.jpg",
    "1027739609391": "https://s.rbk.ru/v1_companies_s3/media/trademarks/e9e50dce-1d21-40d8-82c6-dc72a627f154.jpg",
    "1027739555282": "https://101работа.рф/wp-content/uploads/2024/06/IMG-20240626-WA0004.webp",
    "1037739527077": "https://yt3.googleusercontent.com/ytc/AIdro_n3JhikirIFMUx5UU9w9rnym0dvZydooXTRCNU2IDZyHA=s900-c-k-c0x00ffffff-no-rj",
    "1027739642281": "https://storage.yandexcloud.net/ds-ods/files/media/hub/icon/fb09031f0dd5/09e29ce880fb_T-BANK__shield_yellow.png",
    "1027700167110": "https://pic.rutubelist.ru/user/7d/20/7d20f1a6daad4f0361b5b364614a7841.jpg",
    "1027739326449": "https://yt3.googleusercontent.com/o9JsuwkZCt8UMaAywTOnqiSJkEMQYBNBfQ204BXl3vW4cdEAwOMCFWq28FG3aWVRirSkPmm1dYE=s900-c-k-c0x00ffffff-no-rj",
    "1027739019142": "https://s3-alpha.figma.com/hub/file/5608662633/fe3c1da5-9386-4771-b6af-5bd66970e134-cover.png",
    "1027700342890": "https://krainov-vrn.ru/upload/iblock/1e0/j49jwhnhbuo7b6nttn0v0qvm9e3jr9ig.png",
}


def load_html(path: str | None) -> str:
    if path:
        with open(path, "r", encoding="utf-8") as handle:
            return handle.read()

    response = requests.get(CBR_URL, timeout=30)
    response.raise_for_status()
    return response.text


def normalize_text(value: str) -> str:
    cleaned = unescape(value).replace("\xa0", " ")
    return " ".join(cleaned.split())


class BankTableParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.in_table = False
        self.in_tbody = False
        self.in_tr = False
        self.in_td = False
        self.rows: list[list[str]] = []
        self.current_row: list[str] = []
        self.current_cell: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "table":
            attr = dict(attrs)
            classes = attr.get("class", "") or ""
            if "data" in classes:
                self.in_table = True
        elif self.in_table and tag == "tbody":
            self.in_tbody = True
        elif self.in_tbody and tag == "tr":
            self.in_tr = True
            self.current_row = []
        elif self.in_tr and tag == "td":
            self.in_td = True
            self.current_cell = []

    def handle_endtag(self, tag: str) -> None:
        if tag == "table" and self.in_table:
            self.in_table = False
        elif tag == "tbody" and self.in_tbody:
            self.in_tbody = False
        elif tag == "tr" and self.in_tr:
            self.in_tr = False
            if self.current_row:
                self.rows.append(self.current_row)
        elif tag == "td" and self.in_td:
            self.in_td = False
            cell = "".join(self.current_cell)
            self.current_row.append(cell)

    def handle_data(self, data: str) -> None:
        if self.in_td:
            self.current_cell.append(data)


def parse_banks(html_text: str) -> list[dict]:
    parser = BankTableParser()
    parser.feed(html_text)

    rows: list[dict] = []
    for row in parser.rows:
        if len(row) < 8:
            continue

        ogrn = normalize_text(row[3])
        name = normalize_text(row[4])
        status = normalize_text(row[7])

        if not ogrn or not name or not status:
            continue
        if status not in ALLOWED_STATUSES:
            continue

        rows.append(
            {
                "ogrn": ogrn,
                "name": name,
                "license_status": status,
                "logo_url": LOGO_BY_OGRN.get(ogrn),
            }
        )

    return rows


def upsert_banks(rows: list[dict], dry_run: bool) -> int:
    if not rows:
        raise RuntimeError("No banks parsed; aborting update.")

    session = SessionLocal()
    try:
        ogrns = {row["ogrn"] for row in rows}
        session.execute(delete(Bank).where(Bank.ogrn.notin_(ogrns)))

        for data in rows:
            existing = session.execute(
                select(Bank).where(Bank.ogrn == data["ogrn"])
            ).scalar_one_or_none()
            if existing:
                existing.name = data["name"]
                existing.license_status = data["license_status"]
                if data["logo_url"]:
                    existing.logo_url = data["logo_url"]
            else:
                session.add(Bank(**data))

        if dry_run:
            session.rollback()
        else:
            session.commit()
    finally:
        session.close()

    return len(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed banks from CBR HTML list.")
    parser.add_argument("--file", help="Path to FullCoList HTML downloaded locally")
    parser.add_argument("--dry-run", action="store_true", help="Parse and validate without DB commit")
    args = parser.parse_args()

    html_text = load_html(args.file)
    rows = parse_banks(html_text)
    count = upsert_banks(rows, args.dry_run)
    print(f"Processed {count} banks")


if __name__ == "__main__":
    main()
