"""
Распознавание чеков по фото (OCR на базе EasyOCR).
https://github.com/JaidedAI/EasyOCR — готовый OCR с поддержкой русского и 80+ языков.
"""
import logging
import re
from io import BytesIO

import easyocr
import numpy as np
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from PIL import Image, ImageEnhance, ImageOps
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from auth import get_current_user
from db import get_db
from models import Counterparty, User
from counterparties import apply_logo_url, apply_photo_url
from schemas import CounterpartyOut, ReceiptRecognizeOut

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/receipts", tags=["receipts"])

# Сколько символов распознанного текста писать в лог (чтобы не засорять консоль)
RECEIPT_LOG_TEXT_MAX_LEN = 800

MAX_FILE_BYTES = 10 * 1024 * 1024  # 10 MB
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}

# ИНН на чеках: 10 цифр (ЮЛ/ИП) или 12 (физлицо). Часто идёт после "ИНН" или "ИНН/КПП"
INN_AFTER_KEYWORD = re.compile(r"ИНН\s*[/:?\s]*(\d{10}|\d{12})\b", re.IGNORECASE)
INN_STANDALONE = re.compile(r"\b(\d{10})\b|\b(\d{12})\b")

# Дата: DD.MM.YYYY или DD/MM/YYYY, опционально время
RECEIPT_DATE = re.compile(
    r"\b(\d{1,2})[./](\d{1,2})[./](\d{4})\b"
)
# Сумма к оплате: после ИТОГО / К ОПЛАТЕ / СУММА и т.д. — число с запятой или точкой
RECEIPT_AMOUNT_KEYWORDS = re.compile(
    r"(?:ИТОГО|К\s*ОПЛАТЕ|КО\s*ОПЛАТЕ|СУММА|ВСЕГО|ОПЛАТЕ)[\s:.]*"
    r"(\d[\d\s]*[.,]\d{1,2}|\d[\d\s]+)",
    re.IGNORECASE,
)

_reader: easyocr.Reader | None = None


def _get_reader() -> easyocr.Reader:
    """Ленивая инициализация EasyOCR Reader — только русский, чтобы не смешивать с латиницей."""
    global _reader
    if _reader is None:
        _reader = easyocr.Reader(["ru"], gpu=False)
    return _reader


def _inn_checksum_valid(inn: str) -> bool:
    """Проверка контрольной суммы ИНН без выброса исключения."""
    if not inn.isdigit():
        return False
    length = len(inn)
    if length not in (10, 12):
        return False
    digits = [int(d) for d in inn]
    if length == 10:
        coeffs = [2, 4, 10, 3, 5, 9, 4, 6, 8]
        checksum = sum(c * d for c, d in zip(coeffs, digits[:9])) % 11 % 10
        return checksum == digits[9]
    coeffs_11 = [7, 2, 4, 10, 3, 5, 9, 4, 6, 8]
    coeffs_12 = [3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8]
    c11 = sum(c * d for c, d in zip(coeffs_11, digits[:10])) % 11 % 10
    c12 = sum(c * d for c, d in zip(coeffs_12, digits[:11])) % 11 % 10
    return c11 == digits[10] and c12 == digits[11]


def _extract_inn_from_text(text: str) -> str | None:
    """Извлекает первый валидный по контрольной сумме ИНН из текста."""
    if not text or not text.strip():
        return None
    # Сначала ищем явное упоминание ИНН
    for m in INN_AFTER_KEYWORD.finditer(text):
        cand = m.group(1)
        if _inn_checksum_valid(cand):
            return cand
    # Затем любые 10/12 цифр подряд
    for m in INN_STANDALONE.finditer(text):
        cand = m.group(1) or m.group(2)
        if cand and _inn_checksum_valid(cand):
            return cand
    return None


def _extract_date_from_text(text: str) -> str | None:
    """Извлекает дату чека в формате YYYY-MM-DD (первое вхождение DD.MM.YYYY или DD/MM/YYYY)."""
    if not text or not text.strip():
        return None
    for m in RECEIPT_DATE.finditer(text):
        try:
            d, mon, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
            if 1 <= d <= 31 and 1 <= mon <= 12 and 2000 <= y <= 2100:
                return f"{y:04d}-{mon:02d}-{d:02d}"
        except (ValueError, IndexError):
            continue
    return None


def _extract_amount_from_text(text: str) -> int | None:
    """Извлекает сумму к оплате в копейках (рубли с запятой/точкой)."""
    if not text or not text.strip():
        return None
    for m in RECEIPT_AMOUNT_KEYWORDS.finditer(text):
        raw = m.group(1).replace(" ", "").replace(",", ".")
        if not raw:
            continue
        try:
            value = float(raw)
            if 0 <= value <= 999_999_999.99:
                return round(value * 100)
        except ValueError:
            continue
    return None


def _counterparty_to_out(cp: Counterparty) -> CounterpartyOut:
    apply_logo_url(cp)
    apply_photo_url(cp)
    return CounterpartyOut.model_validate(cp)


def _preprocess_receipt_image(img: Image.Image) -> np.ndarray:
    """
    Предобработка фото чека для лучшего распознавания: градации серого,
    усиление контраста, нормализация размера (мелкий текст плохо читается).
    """
    # В градации серого — терминальные чеки обычно ч/б
    if img.mode != "L":
        img = img.convert("L")
    # Усиление контраста (часто помогает бледным чекам)
    img = ImageOps.autocontrast(img, cutoff=2)
    # Лёгкое усиление резкости
    enhancer = ImageEnhance.Contrast(img)
    img = enhancer.enhance(1.2)
    img_np = np.array(img)
    # Масштаб: если картинка очень большая, уменьшаем (ускоряет и иногда улучшает OCR)
    h, w = img_np.shape[:2]
    max_side = 2000
    if max(h, w) > max_side:
        scale = max_side / max(h, w)
        new_w, new_h = int(w * scale), int(h * scale)
        img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
        img_np = np.array(img)
    # EasyOCR принимает (H, W) или (H, W, 3)
    return img_np


@router.post("/recognize", response_model=ReceiptRecognizeOut)
async def recognize_receipt(
    file: UploadFile = File(..., description="Изображение чека (JPEG, PNG, WebP)"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Загрузить фото чека, распознать текст (EasyOCR: ru+en),
    извлечь ИНН контрагента и найти контрагента у текущего пользователя.
    """
    if file.content_type and file.content_type.lower() not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Допустимые форматы: JPEG, PNG, WebP.",
        )
    raw = await file.read()
    if len(raw) > MAX_FILE_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"Размер файла не должен превышать {MAX_FILE_BYTES // (1024*1024)} МБ.",
        )
    try:
        img = Image.open(BytesIO(raw)).convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=400, detail="Не удалось открыть изображение.") from e

    reader = _get_reader()
    texts_to_try: list[str] = []

    # 1) Исходное изображение (RGB) — без предобработки
    img_rgb = np.array(img)
    try:
        result = reader.readtext(img_rgb)
        texts_to_try.append(" ".join(item[1] for item in result))
    except Exception:
        pass

    # 2) Предобработанное (градации серого, контраст) — на случай бледного чека
    img_prep = _preprocess_receipt_image(img)
    if img_prep.ndim == 2:
        img_prep = np.stack([img_prep] * 3, axis=-1)
    try:
        result = reader.readtext(img_prep)
        texts_to_try.append(" ".join(item[1] for item in result))
    except Exception:
        pass

    # Берём результат, из которого удалось извлечь ИНН; иначе — самый длинный текст
    text = ""
    inn: str | None = None
    for t in texts_to_try:
        cand_inn = _extract_inn_from_text(t or "")
        if cand_inn:
            inn = cand_inn
            text = t or ""
            break
    if not text and texts_to_try:
        text = max(texts_to_try, key=len)
    if not inn:
        inn = _extract_inn_from_text(text or "")

    raw_text = (text or "").strip() or None
    transaction_date = _extract_date_from_text(text or "")
    amount_rub = _extract_amount_from_text(text or "")
    # Лог для отладки
    log_preview = (raw_text or "")[:RECEIPT_LOG_TEXT_MAX_LEN]
    if raw_text and len(raw_text) > RECEIPT_LOG_TEXT_MAX_LEN:
        log_preview += "..."
    msg = (
        f"[receipt_recognize] inn={inn or '(не найден)'}, date={transaction_date or '-'}, "
        f"amount_rub={amount_rub}, raw_text_len={len(raw_text or '')}, "
        f"preview={repr(log_preview) if log_preview else '(пусто)'}"
    )
    logger.info(msg)
    print(msg)
    counterparty = None
    if inn:
        stmt = select(Counterparty).where(
            or_(
                Counterparty.owner_user_id.is_(None),
                Counterparty.owner_user_id == user.id,
            ),
            Counterparty.inn == inn,
            Counterparty.deleted_at.is_(None),
        )
        row = db.execute(stmt).scalar_one_or_none()
        if row:
            counterparty = _counterparty_to_out(row)
    return ReceiptRecognizeOut(
        inn=inn,
        transaction_date=transaction_date,
        amount_rub=amount_rub,
        raw_text=raw_text,
        counterparty=counterparty,
    )
