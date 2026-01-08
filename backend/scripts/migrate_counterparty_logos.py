import argparse
import mimetypes
from pathlib import Path
import sys
from urllib.parse import urlparse

import requests
from sqlalchemy import select

sys.path.append(str(Path(__file__).resolve().parents[1]))

from config import settings
from db import SessionLocal
from models import Counterparty

MAX_LOGO_BYTES = 2 * 1024 * 1024
PROJECT_ROOT = Path(__file__).resolve().parents[2]
UPLOADS_DIR = PROJECT_ROOT / "backend" / "uploads" / "counterparty-logos"
FRONTEND_PUBLIC = PROJECT_ROOT / "frontend" / "public"


def build_logo_url(counterparty_id: int) -> str:
    return f"{settings.public_base_url}/counterparties/{counterparty_id}/logo"


def load_logo_from_path(path: Path) -> tuple[bytes | None, str | None]:
    if not path.exists():
        return None, None
    data = path.read_bytes()
    if len(data) > MAX_LOGO_BYTES:
        return None, None
    mime = mimetypes.guess_type(path.name)[0] or "image/png"
    return data, mime


def load_logo_from_url(url: str) -> tuple[bytes | None, str | None]:
    try:
        response = requests.get(
            url,
            timeout=20,
            headers={"User-Agent": "Mozilla/5.0 (FinApp Logo Migrator)"},
        )
        if not response.ok:
            return None, None
    except requests.RequestException:
        return None, None

    data = response.content
    if len(data) > MAX_LOGO_BYTES:
        return None, None
    mime = response.headers.get("content-type")
    if mime:
        mime = mime.split(";")[0].strip()
    if not mime:
        mime = mimetypes.guess_type(url)[0]
    return data, mime


def resolve_logo_source(url: str) -> tuple[bytes | None, str | None]:
    if url.startswith("/"):
        return load_logo_from_path(FRONTEND_PUBLIC / url.lstrip("/"))

    parsed = urlparse(url)
    if parsed.scheme in {"http", "https"}:
        if parsed.path.startswith("/uploads/counterparty-logos/"):
            filename = parsed.path.split("/")[-1]
            return load_logo_from_path(UPLOADS_DIR / filename)
        return load_logo_from_url(url)

    return load_logo_from_path(Path(url))


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Migrate counterparty logos from logo_url to bytea."
    )
    parser.add_argument("--dry-run", action="store_true", help="Do not commit changes")
    args = parser.parse_args()

    session = SessionLocal()
    try:
        rows = session.execute(select(Counterparty)).scalars().all()
        updated = 0
        for row in rows:
            if row.logo_data:
                row.logo_url = build_logo_url(row.id)
                continue
            if not row.logo_url:
                continue
            data, mime = resolve_logo_source(row.logo_url)
            if not data:
                continue
            row.logo_data = data
            row.logo_mime = mime
            row.logo_url = build_logo_url(row.id)
            updated += 1

        if args.dry_run:
            session.rollback()
            print(f"Would update {updated} logos.")
        else:
            session.commit()
            print(f"Updated {updated} logos.")
    finally:
        session.close()


if __name__ == "__main__":
    main()
