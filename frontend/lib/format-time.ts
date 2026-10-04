/**
 * Ввод времени HH:mm. Часы и минуты хранятся раздельно:
 * правка одной части не переносит цифры в другую.
 */

export function splitTimeInput(value: string): { hours: string; minutes: string } {
  const [hours = "", minutes = ""] = (value ?? "").split(":");
  return {
    hours: hours.replace(/\D/g, "").slice(0, 2),
    minutes: minutes.replace(/\D/g, "").slice(0, 2),
  };
}

export function joinTimeInput(hours: string, minutes: string): string {
  if (!hours && !minutes) return "";
  return `${hours}:${minutes}`;
}

/** Дополняет неполный ввод до HH:mm. Пустая строка остаётся пустой. */
export function normalizeTimeInput(value: string): string {
  const { hours, minutes } = splitTimeInput(value);
  if (!hours && !minutes) return "";
  const h = Math.min(23, Number(hours || "0"));
  const m = Math.min(59, Number(minutes || "0"));
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Сегмент часов (max 23) или минут (max 59).
 * null — вторая цифра выводит значение за предел, её нужно отбросить.
 */
export function clampTimeSegment(raw: string, max: number): string | null {
  const digits = raw.replace(/\D/g, "").slice(0, 2);
  if (digits.length === 2 && Number(digits) > max) return null;
  return digits;
}

/** Вставка «15:30» или «1530» сразу в оба сегмента. */
export function pastedTimeParts(text: string): { hours: string; minutes: string } | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (trimmed.includes(":")) {
    const [hours = "", minutes = ""] = trimmed.split(":");
    return {
      hours: forceTimeSegment(hours, 23),
      minutes: forceTimeSegment(minutes, 59),
    };
  }
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 3) return null;
  return {
    hours: forceTimeSegment(digits.slice(0, 2), 23),
    minutes: forceTimeSegment(digits.slice(2, 4), 59),
  };
}

function forceTimeSegment(raw: string, max: number): string {
  const digits = raw.replace(/\D/g, "").slice(0, 2);
  if (!digits) return "";
  if (digits.length === 2 && Number(digits) > max) return String(max);
  return digits;
}

/**
 * Форматирует ввод поля времени. Если двоеточие уже есть, часы и минуты
 * правятся независимо. Без двоеточия цифры по-прежнему собираются в HH:mm.
 */
export function formatTimeInput(value: string): string {
  if (value.includes(":")) {
    const { hours, minutes } = splitTimeInput(value);
    return joinTimeInput(hours, minutes);
  }
  const digits = value.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}
