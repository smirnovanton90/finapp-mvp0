from datetime import datetime, time, timezone
from io import BytesIO
import re

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import Response
from PIL import Image
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError, OperationalError, ProgrammingError
from sqlalchemy.orm import Session

from auth import get_current_user
from config import settings
from db import get_db
from models import Counterparty, CounterpartyIndustry, User
from opf_reference import LEGAL_FORMS
from schemas import (
    CounterpartyCreate,
    CounterpartyDeletedAtUpdate,
    CounterpartyIndustryOut,
    CounterpartyOut,
    CounterpartyPageOut,
    CounterpartyUpdate,
    LegalFormOut,
)

router = APIRouter(prefix="/counterparties", tags=["counterparties"])

MAX_LOGO_BYTES = 2 * 1024 * 1024
MAX_LOGO_DIM = 1024
ALLOWED_LOGO_FORMATS = {"PNG", "JPEG", "WEBP"}
FORMAT_TO_MIME = {
    "PNG": "image/png",
    "JPEG": "image/jpeg",
    "WEBP": "image/webp",
}

LEGAL_FORM_CODES = {item["code"] for item in LEGAL_FORMS}


def build_logo_url(counterparty_id: int) -> str:
    return f"{settings.public_base_url}/counterparties/{counterparty_id}/logo"


def apply_logo_url(counterparty: Counterparty) -> None:
    counterparty.logo_url = (
        build_logo_url(counterparty.id) if counterparty.logo_data else None
    )


def build_photo_url(counterparty_id: int) -> str:
    return f"{settings.public_base_url}/counterparties/{counterparty_id}/photo"


def apply_photo_url(counterparty: Counterparty) -> None:
    counterparty.photo_url = (
        build_photo_url(counterparty.id) if counterparty.photo_data else None
    )


def _safe_synonyms(value: object) -> list:
    """Привести synonyms к списку строк (на случай отсутствия колонки или неверного типа из БД)."""
    if value is None:
        return []
    if isinstance(value, list):
        return [str(x).strip() for x in value if isinstance(x, str) and x.strip()]
    return []


def counterparty_to_out(cp: Counterparty) -> CounterpartyOut:
    """Собрать CounterpartyOut из ORM-объекта, гарантируя корректное поле synonyms."""
    apply_logo_url(cp)
    apply_photo_url(cp)
    synonyms = _safe_synonyms(getattr(cp, "synonyms", None))
    return CounterpartyOut(
        id=cp.id,
        entity_type=cp.entity_type,
        industry_id=cp.industry_id,
        name=cp.name or "",
        full_name=cp.full_name,
        legal_form=cp.legal_form,
        inn=cp.inn,
        first_name=cp.first_name,
        last_name=cp.last_name,
        middle_name=cp.middle_name,
        synonyms=synonyms,
        license_status=cp.license_status,
        logo_url=cp.logo_url,
        photo_url=cp.photo_url,
        owner_user_id=cp.owner_user_id,
        created_at=cp.created_at,
        deleted_at=cp.deleted_at,
    )


def normalize_text(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = " ".join(value.strip().split())
    return cleaned or None


def normalize_digits(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = re.sub(r"\s+", "", value)
    if not cleaned:
        return None
    if not cleaned.isdigit():
        raise HTTPException(status_code=400, detail="Поле должно содержать только цифры.")
    return cleaned


def validate_inn(inn: str, entity_type: str) -> None:
    if not inn:
        return
    if not inn.isdigit():
        raise HTTPException(status_code=400, detail="ИНН должен содержать только цифры.")
    length = len(inn)
    if entity_type == "PERSON":
        if length != 12:
            raise HTTPException(status_code=400, detail="ИНН физлица должен состоять из 12 цифр.")
    else:
        if length not in (10, 12):
            raise HTTPException(status_code=400, detail="ИНН должен состоять из 10 или 12 цифр.")

    digits = [int(d) for d in inn]
    if length == 10:
        coeffs = [2, 4, 10, 3, 5, 9, 4, 6, 8]
        checksum = sum(c * d for c, d in zip(coeffs, digits[:9])) % 11 % 10
        if checksum != digits[9]:
            raise HTTPException(status_code=400, detail="ИНН не прошел проверку контрольного числа.")
    else:
        coeffs_11 = [7, 2, 4, 10, 3, 5, 9, 4, 6, 8]
        coeffs_12 = [3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8]
        checksum_11 = sum(c * d for c, d in zip(coeffs_11, digits[:10])) % 11 % 10
        checksum_12 = sum(c * d for c, d in zip(coeffs_12, digits[:11])) % 11 % 10
        if checksum_11 != digits[10] or checksum_12 != digits[11]:
            raise HTTPException(status_code=400, detail="ИНН не прошел проверку контрольного числа.")


def build_person_name(last_name: str, first_name: str, middle_name: str | None) -> str:
    parts = [last_name, first_name]
    if middle_name:
        parts.append(middle_name)
    return " ".join(parts)


def _counterparty_display_name(cp: Counterparty) -> str:
    if cp.entity_type == "LEGAL":
        return (cp.name or "").strip()
    parts = [cp.last_name, cp.first_name, cp.middle_name]
    return " ".join((p or "").strip() for p in parts).strip()


def _normalize_synonym_key(s: str) -> str:
    return s.strip().lower()


def ensure_synonyms_unique(
    db: Session,
    user: User,
    synonyms: list[str],
    exclude_id: int | None = None,
) -> None:
    """Проверяет, что ни один нормализованный синоним не занят другим контрагентом."""
    if not synonyms:
        return
    stmt = select(Counterparty).where(
        or_(Counterparty.owner_user_id.is_(None), Counterparty.owner_user_id == user.id),
        Counterparty.deleted_at.is_(None),
    )
    if exclude_id is not None:
        stmt = stmt.where(Counterparty.id != exclude_id)
    occupied = set()
    for cp in db.execute(stmt).scalars().all():
        name_key = _normalize_synonym_key(_counterparty_display_name(cp))
        if name_key:
            occupied.add(name_key)
        for syn in cp.synonyms or []:
            key = _normalize_synonym_key(syn)
            if key:
                occupied.add(key)
    for syn in synonyms:
        key = _normalize_synonym_key(syn)
        if key and key in occupied:
            raise HTTPException(
                status_code=400,
                detail="Один из синонимов уже используется другим контрагентом.",
            )


def ensure_unique_counterparty(
    db: Session,
    user: User,
    entity_type: str,
    name: str,
    inn: str | None,
    first_name: str | None,
    last_name: str | None,
    middle_name: str | None,
    legal_form: str | None,
    full_name: str | None,
    exclude_id: int | None = None,
) -> None:
    base = select(Counterparty).where(
        or_(Counterparty.owner_user_id.is_(None), Counterparty.owner_user_id == user.id),
        or_(Counterparty.deleted_at.is_(None), Counterparty.owner_user_id.is_(None)),
    )
    if exclude_id:
        base = base.where(Counterparty.id != exclude_id)

    if entity_type == "LEGAL":
        if inn:
            stmt = base.where(Counterparty.entity_type == "LEGAL", Counterparty.inn == inn)
            if db.execute(stmt).scalar_one_or_none():
                raise HTTPException(status_code=400, detail="Контрагент с таким ИНН уже существует.")
        if not inn:
            name_key = name.casefold()
            stmt = base.where(
                Counterparty.entity_type == "LEGAL",
                func.lower(Counterparty.name) == name_key,
            )
            if legal_form:
                stmt = stmt.where(func.lower(Counterparty.legal_form) == legal_form.casefold())
            if full_name:
                stmt = stmt.where(func.lower(Counterparty.full_name) == full_name.casefold())
            if db.execute(stmt).scalar_one_or_none():
                raise HTTPException(
                    status_code=400,
                    detail="Контрагент с такими реквизитами уже существует.",
                )
    else:
        if inn:
            stmt = base.where(Counterparty.entity_type == "PERSON", Counterparty.inn == inn)
            if db.execute(stmt).scalar_one_or_none():
                raise HTTPException(status_code=400, detail="Контрагент с таким ИНН уже существует.")
        else:
            first_key = (first_name or "").casefold()
            last_key = (last_name or "").casefold()
            middle_key = (middle_name or "").casefold()
            stmt = base.where(
                Counterparty.entity_type == "PERSON",
                func.lower(Counterparty.first_name) == first_key,
                func.lower(Counterparty.last_name) == last_key,
                func.coalesce(func.lower(Counterparty.middle_name), "") == middle_key,
            )
            if db.execute(stmt).scalar_one_or_none():
                raise HTTPException(
                    status_code=400,
                    detail="Контрагент с такими реквизитами уже существует.",
                )


def normalize_payload(data: CounterpartyCreate | CounterpartyUpdate) -> dict:
    entity_type = data.entity_type
    industry_id = data.industry_id
    name = normalize_text(data.name)
    full_name = normalize_text(data.full_name)
    legal_form = normalize_text(data.legal_form)
    inn = normalize_digits(data.inn)
    first_name = normalize_text(data.first_name)
    last_name = normalize_text(data.last_name)
    middle_name = normalize_text(data.middle_name)
    synonyms = data.synonyms if data.synonyms is not None else []

    if entity_type == "LEGAL":
        if not name:
            raise HTTPException(status_code=400, detail="Укажите название контрагента.")
        if legal_form and legal_form not in LEGAL_FORM_CODES:
            raise HTTPException(status_code=400, detail="Недопустимая ОПФ.")
        validate_inn(inn or "", entity_type)
        return {
            "industry_id": industry_id,
            "entity_type": entity_type,
            "name": name,
            "full_name": full_name,
            "legal_form": legal_form,
            "inn": inn,
            "first_name": None,
            "last_name": None,
            "middle_name": None,
            "synonyms": synonyms,
        }

    if not first_name or not last_name:
        raise HTTPException(status_code=400, detail="Укажите имя и фамилию.")
    return {
        "industry_id": None,
        "entity_type": entity_type,
        "name": build_person_name(last_name, first_name, middle_name),
        "full_name": None,
        "legal_form": None,
        "inn": None,
        "first_name": first_name,
        "last_name": last_name,
        "middle_name": middle_name,
        "synonyms": synonyms,
    }


@router.get("", response_model=list[CounterpartyOut])
def list_counterparties(
    include_deleted: bool = Query(default=False),
    deleted_only: bool = Query(default=False),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = select(Counterparty).where(
        or_(Counterparty.owner_user_id.is_(None), Counterparty.owner_user_id == user.id)
    )
    if deleted_only:
        stmt = stmt.where(
            Counterparty.owner_user_id == user.id, Counterparty.deleted_at.isnot(None)
        )
    elif not include_deleted:
        stmt = stmt.where(Counterparty.deleted_at.is_(None))
    stmt = stmt.order_by(Counterparty.name.asc(), Counterparty.id.asc())
    try:
        rows = list(db.execute(stmt).scalars().all())
    except (OperationalError, ProgrammingError) as e:
        if "synonyms" in str(e).lower() or "column" in str(e).lower():
            raise HTTPException(
                status_code=500,
                detail="Колонка counterparties.synonyms отсутствует. Выполните миграцию: cd backend && .venv\\Scripts\\python -m alembic upgrade head",
            ) from e
        raise
    return [counterparty_to_out(row) for row in rows]


@router.get("/page", response_model=CounterpartyPageOut)
def list_counterparties_page(
    limit: int = Query(50, ge=1, le=200),
    cursor: str | None = None,
    include_deleted: bool = Query(default=False),
    deleted_only: bool = Query(default=False),
    source: list[str] | None = Query(default=None),
    entity_type: list[str] | None = Query(default=None),
    status_active: bool = Query(default=True),
    status_deleted: bool = Query(default=False),
    industry_ids: list[int] | None = Query(default=None),
    name_query: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = select(Counterparty).where(
        or_(Counterparty.owner_user_id.is_(None), Counterparty.owner_user_id == user.id)
    )
    if deleted_only:
        stmt = stmt.where(
            Counterparty.owner_user_id == user.id, Counterparty.deleted_at.isnot(None)
        )
    elif not include_deleted:
        stmt = stmt.where(Counterparty.deleted_at.is_(None))
    if source:
        source_set = set(s.upper() for s in source)
        if source_set == {"ADDED"}:
            stmt = stmt.where(Counterparty.owner_user_id == user.id)
        elif source_set == {"DEFAULT"}:
            stmt = stmt.where(Counterparty.owner_user_id.is_(None))
    if status_active and not status_deleted:
        stmt = stmt.where(Counterparty.deleted_at.is_(None))
    elif status_deleted and not status_active:
        stmt = stmt.where(Counterparty.deleted_at.isnot(None))
    if entity_type:
        types = [t.upper() for t in entity_type]
        stmt = stmt.where(Counterparty.entity_type.in_(types))
    if industry_ids:
        stmt = stmt.where(Counterparty.industry_id.in_(industry_ids))
    if name_query and (q := normalize_text(name_query)):
        q_pattern = f"%{q}%"
        stmt = stmt.where(
            or_(
                Counterparty.name.ilike(q_pattern),
                func.coalesce(Counterparty.full_name, "").ilike(q_pattern),
                func.coalesce(Counterparty.first_name, "").ilike(q_pattern),
                func.coalesce(Counterparty.last_name, "").ilike(q_pattern),
                func.coalesce(Counterparty.middle_name, "").ilike(q_pattern),
            )
        )
    if cursor:
        try:
            cursor_id = int(cursor)
            stmt = stmt.where(Counterparty.id < cursor_id)
        except ValueError:
            pass
    stmt = stmt.order_by(Counterparty.id.desc()).limit(limit + 1)
    try:
        rows = list(db.execute(stmt).scalars().all())
    except (OperationalError, ProgrammingError) as e:
        if "synonyms" in str(e).lower() or "column" in str(e).lower():
            raise HTTPException(
                status_code=500,
                detail="Колонка counterparties.synonyms отсутствует. Выполните миграцию: cd backend && .venv\\Scripts\\python -m alembic upgrade head",
            ) from e
        raise
    has_more = len(rows) > limit
    if has_more:
        rows = rows[:limit]
    next_cursor = str(rows[-1].id) if rows else None
    try:
        items = [counterparty_to_out(row) for row in rows]
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Ошибка сериализации контрагентов: {type(e).__name__}: {e}",
        ) from e
    return CounterpartyPageOut(
        items=items,
        next_cursor=next_cursor,
        has_more=has_more,
    )


@router.get("/legal-forms", response_model=list[LegalFormOut])
def list_legal_forms(user: User = Depends(get_current_user)) -> list[LegalFormOut]:
    return [LegalFormOut(**item) for item in LEGAL_FORMS]


@router.get("/industries", response_model=list[CounterpartyIndustryOut])
def list_industries(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[CounterpartyIndustryOut]:
    stmt = select(CounterpartyIndustry).order_by(CounterpartyIndustry.id.asc())
    return list(db.execute(stmt).scalars())


@router.post("", response_model=CounterpartyOut)
def create_counterparty(
    data: CounterpartyCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    normalized = normalize_payload(data)
    if normalized["industry_id"] is not None:
        industry = db.get(CounterpartyIndustry, normalized["industry_id"])
        if not industry:
            raise HTTPException(status_code=400, detail="Отрасль контрагента не найдена.")
    ensure_unique_counterparty(
        db=db,
        user=user,
        entity_type=normalized["entity_type"],
        name=normalized["name"],
        inn=normalized["inn"],
        first_name=normalized["first_name"],
        last_name=normalized["last_name"],
        middle_name=normalized["middle_name"],
        legal_form=normalized["legal_form"],
        full_name=normalized["full_name"],
    )
    ensure_synonyms_unique(db=db, user=user, synonyms=normalized["synonyms"], exclude_id=None)

    counterparty = Counterparty(
        owner_user_id=user.id,
        license_status=None,
        logo_url=None,
        photo_url=None,
        **normalized,
    )
    db.add(counterparty)
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        err_msg = str(e.orig) if getattr(e, "orig", None) else str(e)
        constraint = ""
        if getattr(e, "orig", None) and getattr(e.orig, "diag", None):
            constraint = (e.orig.diag.constraint_name or "") if hasattr(e.orig.diag, "constraint_name") else ""
        if "inn" in constraint.lower() or "inn" in err_msg.lower():
            raise HTTPException(status_code=400, detail="Контрагент с таким ИНН уже существует.")
        raise HTTPException(status_code=400, detail="Контрагент с такими реквизитами уже существует.")
    db.refresh(counterparty)
    return counterparty_to_out(counterparty)


@router.patch("/{counterparty_id}", response_model=CounterpartyOut)
def update_counterparty(
    counterparty_id: int,
    data: CounterpartyUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    counterparty = db.get(Counterparty, counterparty_id)
    if not counterparty or counterparty.owner_user_id != user.id:
        raise HTTPException(status_code=404, detail="Контрагент не найден.")
    if counterparty.deleted_at is not None:
        raise HTTPException(status_code=400, detail="Нельзя редактировать удаленного контрагента.")

    normalized = normalize_payload(data)
    if normalized["industry_id"] is not None:
        industry = db.get(CounterpartyIndustry, normalized["industry_id"])
        if not industry:
            raise HTTPException(status_code=400, detail="Отрасль контрагента не найдена.")
    ensure_unique_counterparty(
        db=db,
        user=user,
        entity_type=normalized["entity_type"],
        name=normalized["name"],
        inn=normalized["inn"],
        first_name=normalized["first_name"],
        last_name=normalized["last_name"],
        middle_name=normalized["middle_name"],
        legal_form=normalized["legal_form"],
        full_name=normalized["full_name"],
        exclude_id=counterparty.id,
    )
    ensure_synonyms_unique(
        db=db, user=user, synonyms=normalized["synonyms"], exclude_id=counterparty.id
    )

    counterparty.entity_type = normalized["entity_type"]
    counterparty.name = normalized["name"]
    counterparty.full_name = normalized["full_name"]
    counterparty.legal_form = normalized["legal_form"]
    counterparty.inn = normalized["inn"]
    counterparty.first_name = normalized["first_name"]
    counterparty.last_name = normalized["last_name"]
    counterparty.middle_name = normalized["middle_name"]
    counterparty.industry_id = normalized["industry_id"]
    counterparty.synonyms = normalized["synonyms"]

    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        err_msg = str(e.orig) if getattr(e, "orig", None) else str(e)
        constraint = ""
        if getattr(e, "orig", None) and getattr(e.orig, "diag", None):
            constraint = (e.orig.diag.constraint_name or "") if hasattr(e.orig.diag, "constraint_name") else ""
        if "inn" in constraint.lower() or "inn" in err_msg.lower():
            raise HTTPException(status_code=400, detail="Контрагент с таким ИНН уже существует.")
        raise HTTPException(status_code=400, detail="Контрагент с такими реквизитами уже существует.")
    db.refresh(counterparty)
    return counterparty_to_out(counterparty)


@router.delete("/{counterparty_id}")
def delete_counterparty(
    counterparty_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    counterparty = db.get(Counterparty, counterparty_id)
    if not counterparty or counterparty.owner_user_id != user.id:
        raise HTTPException(status_code=404, detail="Контрагент не найден.")
    if counterparty.deleted_at is not None:
        return {"ok": True}

    counterparty.deleted_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True}


@router.patch("/{counterparty_id}/deleted_at", response_model=CounterpartyOut)
def update_counterparty_deleted_at(
    counterparty_id: int,
    payload: CounterpartyDeletedAtUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Установить или обновить дату удаления контрагента (при восстановлении из бэкапа)."""
    counterparty = db.get(Counterparty, counterparty_id)
    if not counterparty or counterparty.owner_user_id != user.id:
        raise HTTPException(status_code=404, detail="Контрагент не найден.")
    deleted_dt = datetime.combine(payload.deleted_date, time.min, tzinfo=timezone.utc)
    counterparty.deleted_at = deleted_dt
    db.commit()
    db.refresh(counterparty)
    return counterparty_to_out(counterparty)


@router.get("/{counterparty_id}/logo")
def get_counterparty_logo(
    counterparty_id: int,
    db: Session = Depends(get_db),
):
    counterparty = db.get(Counterparty, counterparty_id)
    if not counterparty or not counterparty.logo_data:
        raise HTTPException(status_code=404, detail="Logo not found.")
    media_type = counterparty.logo_mime or "application/octet-stream"
    return Response(content=counterparty.logo_data, media_type=media_type)


@router.post("/{counterparty_id}/logo", response_model=CounterpartyOut)
async def upload_counterparty_logo(
    counterparty_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    counterparty = db.get(Counterparty, counterparty_id)
    if not counterparty or counterparty.owner_user_id != user.id:
        raise HTTPException(status_code=404, detail="Контрагент не найден.")
    if counterparty.deleted_at is not None:
        raise HTTPException(status_code=400, detail="Нельзя редактировать удаленного контрагента.")
    if counterparty.entity_type != "LEGAL":
        raise HTTPException(status_code=400, detail="Логотип доступен только для ЮЛ/ИП.")

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Файл не загружен.")
    if len(data) > MAX_LOGO_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"Размер логотипа не должен превышать {MAX_LOGO_BYTES // (1024 * 1024)} МБ.",
        )

    try:
        image = Image.open(BytesIO(data))
        image.verify()
        image = Image.open(BytesIO(data))
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Неверный формат изображения.") from exc

    if image.format not in ALLOWED_LOGO_FORMATS:
        raise HTTPException(status_code=400, detail="Недопустимый формат изображения.")

    width, height = image.size
    if width > MAX_LOGO_DIM or height > MAX_LOGO_DIM:
        raise HTTPException(
            status_code=400,
            detail=f"Разрешение логотипа не должно превышать {MAX_LOGO_DIM}px.",
        )

    counterparty.logo_mime = FORMAT_TO_MIME[image.format]
    counterparty.logo_data = data
    db.commit()
    db.refresh(counterparty)
    return counterparty_to_out(counterparty)


@router.get("/{counterparty_id}/photo")
def get_counterparty_photo(
    counterparty_id: int,
    db: Session = Depends(get_db),
):
    counterparty = db.get(Counterparty, counterparty_id)
    if not counterparty or not counterparty.photo_data:
        raise HTTPException(status_code=404, detail="Photo not found.")
    media_type = counterparty.photo_mime or "application/octet-stream"
    return Response(content=counterparty.photo_data, media_type=media_type)


@router.post("/{counterparty_id}/photo", response_model=CounterpartyOut)
async def upload_counterparty_photo(
    counterparty_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    counterparty = db.get(Counterparty, counterparty_id)
    if not counterparty or counterparty.owner_user_id != user.id:
        raise HTTPException(status_code=404, detail="Контрагент не найден.")
    if counterparty.deleted_at is not None:
        raise HTTPException(status_code=400, detail="Нельзя редактировать удаленного контрагента.")
    if counterparty.entity_type != "PERSON":
        raise HTTPException(status_code=400, detail="Фотография доступна только для физических лиц.")

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Файл не загружен.")
    if len(data) > MAX_LOGO_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"Размер фотографии не должен превышать {MAX_LOGO_BYTES // (1024 * 1024)} МБ.",
        )

    try:
        image = Image.open(BytesIO(data))
        image.verify()
        image = Image.open(BytesIO(data))
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Неверный формат изображения.") from exc

    if image.format not in ALLOWED_LOGO_FORMATS:
        raise HTTPException(status_code=400, detail="Недопустимый формат изображения.")

    width, height = image.size
    if width > MAX_LOGO_DIM or height > MAX_LOGO_DIM:
        raise HTTPException(
            status_code=400,
            detail=f"Разрешение фотографии не должно превышать {MAX_LOGO_DIM}px.",
        )

    counterparty.photo_mime = FORMAT_TO_MIME[image.format]
    counterparty.photo_data = data
    db.commit()
    db.refresh(counterparty)
    return counterparty_to_out(counterparty)
