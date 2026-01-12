from datetime import datetime, timezone
from io import BytesIO
import re

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import Response
from PIL import Image
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from auth import get_current_user
from config import settings
from db import get_db
from models import Counterparty, CounterpartyIndustry, User
from opf_reference import LEGAL_FORMS
from schemas import (
    CounterpartyCreate,
    CounterpartyIndustryOut,
    CounterpartyOut,
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


def validate_ogrn(ogrn: str, entity_type: str) -> None:
    if not ogrn:
        return
    if entity_type != "LEGAL":
        raise HTTPException(status_code=400, detail="ОГРН доступен только для ЮЛ/ИП.")
    if not ogrn.isdigit():
        raise HTTPException(status_code=400, detail="ОГРН должен содержать только цифры.")
    length = len(ogrn)
    if length not in (13, 15):
        raise HTTPException(status_code=400, detail="ОГРН должен состоять из 13 или 15 цифр.")

    digits = [int(d) for d in ogrn]
    if length == 13:
        checksum = int(ogrn[:12]) % 11 % 10
        if checksum != digits[12]:
            raise HTTPException(status_code=400, detail="ОГРН не прошел проверку контрольного числа.")
    else:
        checksum = int(ogrn[:14]) % 13 % 10
        if checksum != digits[14]:
            raise HTTPException(status_code=400, detail="ОГРН не прошел проверку контрольного числа.")


def build_person_name(last_name: str, first_name: str, middle_name: str | None) -> str:
    parts = [last_name, first_name]
    if middle_name:
        parts.append(middle_name)
    return " ".join(parts)


def ensure_unique_counterparty(
    db: Session,
    user: User,
    entity_type: str,
    name: str,
    inn: str | None,
    ogrn: str | None,
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
        if ogrn:
            stmt = base.where(Counterparty.entity_type == "LEGAL", Counterparty.ogrn == ogrn)
            if db.execute(stmt).scalar_one_or_none():
                raise HTTPException(status_code=400, detail="Контрагент с таким ОГРН уже существует.")
        if not inn and not ogrn:
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
    ogrn = normalize_digits(data.ogrn)
    first_name = normalize_text(data.first_name)
    last_name = normalize_text(data.last_name)
    middle_name = normalize_text(data.middle_name)

    if entity_type == "LEGAL":
        if industry_id is None:
            raise HTTPException(status_code=400, detail="Укажите отрасль контрагента.")
        if not name:
            raise HTTPException(status_code=400, detail="Укажите название контрагента.")
        if legal_form and legal_form not in LEGAL_FORM_CODES:
            raise HTTPException(status_code=400, detail="Недопустимая ОПФ.")
        validate_inn(inn or "", entity_type)
        validate_ogrn(ogrn or "", entity_type)
        return {
            "industry_id": industry_id,
            "entity_type": entity_type,
            "name": name,
            "full_name": full_name,
            "legal_form": legal_form,
            "inn": inn,
            "ogrn": ogrn,
            "first_name": None,
            "last_name": None,
            "middle_name": None,
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
        "ogrn": None,
        "first_name": first_name,
        "last_name": last_name,
        "middle_name": middle_name,
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
    rows = list(db.execute(stmt).scalars())
    for row in rows:
        apply_logo_url(row)
        apply_photo_url(row)
    return rows


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
        ogrn=normalized["ogrn"],
        first_name=normalized["first_name"],
        last_name=normalized["last_name"],
        middle_name=normalized["middle_name"],
        legal_form=normalized["legal_form"],
        full_name=normalized["full_name"],
    )

    counterparty = Counterparty(
        owner_user_id=user.id,
        license_status=None,
        logo_url=None,
        photo_url=None,
        **normalized,
    )
    db.add(counterparty)
    db.commit()
    db.refresh(counterparty)
    apply_logo_url(counterparty)
    apply_photo_url(counterparty)
    return counterparty


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
        ogrn=normalized["ogrn"],
        first_name=normalized["first_name"],
        last_name=normalized["last_name"],
        middle_name=normalized["middle_name"],
        legal_form=normalized["legal_form"],
        full_name=normalized["full_name"],
        exclude_id=counterparty.id,
    )

    counterparty.entity_type = normalized["entity_type"]
    counterparty.name = normalized["name"]
    counterparty.full_name = normalized["full_name"]
    counterparty.legal_form = normalized["legal_form"]
    counterparty.inn = normalized["inn"]
    counterparty.ogrn = normalized["ogrn"]
    counterparty.first_name = normalized["first_name"]
    counterparty.last_name = normalized["last_name"]
    counterparty.middle_name = normalized["middle_name"]
    counterparty.industry_id = normalized["industry_id"]

    db.commit()
    db.refresh(counterparty)
    apply_logo_url(counterparty)
    apply_photo_url(counterparty)
    return counterparty


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
    apply_logo_url(counterparty)
    db.commit()
    db.refresh(counterparty)
    apply_logo_url(counterparty)
    return counterparty


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
    apply_photo_url(counterparty)
    db.commit()
    db.refresh(counterparty)
    apply_photo_url(counterparty)
    return counterparty
