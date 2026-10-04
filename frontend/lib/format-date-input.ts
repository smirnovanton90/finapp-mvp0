/**
 * Ввод даты ДД.ММ.ГГГГ. День, месяц и год правятся раздельно —
 * удаление цифры в одной части не переносит цифры из другой.
 * Наружу отдаётся YYYY-MM-DD, как у поля даты в форме.
 */

export type DateParts = { day: string; month: string; year: string };

const EMPTY_PARTS: DateParts = { day: "", month: "", year: "" };

export function splitDateInput(value: string): DateParts {
  const raw = (value ?? "").trim();
  if (!raw) return { ...EMPTY_PARTS };
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (iso) return { year: iso[1], month: iso[2], day: iso[3] };
  const dotted = /^(\d{1,2})\.(\d{1,2})\.(\d{1,4})$/.exec(raw);
  if (dotted) {
    return {
      day: dotted[1],
      month: dotted[2],
      year: dotted[3],
    };
  }
  return { ...EMPTY_PARTS };
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** null — цифра выводит день или месяц за допустимый предел. */
export function clampDateSegment(raw: string, max: number): string | null {
  const digits = raw.replace(/\D/g, "").slice(0, 2);
  if (digits.length === 2) {
    const n = Number(digits);
    if (n < 1 || n > max) return null;
  }
  return digits;
}

export function clampYearSegment(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 4);
}

/**
 * Полная дата → YYYY-MM-DD. Пустые части → "".
 * Неполный ввод → null, родительское значение не меняется.
 */
export function datePartsToIso(parts: DateParts): string | null {
  if (!parts.day && !parts.month && !parts.year) return "";
  if (parts.year.length !== 4 || !parts.day || !parts.month) return null;
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (day > daysInMonth(year, month)) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Дополняет неполный ввод. Пустая дата остаётся пустой. */
export function normalizeDateInput(parts: DateParts, fallbackIso: string): string | null {
  if (!parts.day && !parts.month && !parts.year) return "";
  const fallback = splitDateInput(fallbackIso);
  const yearDigits =
    parts.year.length === 4 ? parts.year : parts.year.length === 0 ? fallback.year : "";
  if (yearDigits.length !== 4) return null;
  const year = Number(yearDigits);
  const month = Math.min(12, Math.max(1, Number(parts.month || "1")));
  const maxDay = daysInMonth(year, month);
  const day = Math.min(maxDay, Math.max(1, Number(parts.day || "1")));
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Вставка «04.10.2026», «2026-10-04» или «04102026». */
export function pastedDateParts(text: string): DateParts | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed);
  if (iso) {
    return { year: iso[1], month: iso[2].padStart(2, "0"), day: iso[3].padStart(2, "0") };
  }
  const local = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(trimmed);
  if (local) {
    return { day: local[1], month: local[2], year: local[3] };
  }
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 8) {
    return { day: digits.slice(0, 2), month: digits.slice(2, 4), year: digits.slice(4, 8) };
  }
  return null;
}
