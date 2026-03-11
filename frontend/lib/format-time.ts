/**
 * Форматирование ввода времени HH:mm.
 * При вводе цифр двоеточие между часами и минутами подставляется автоматически.
 */

/**
 * Форматирует ввод поля времени: оставляет только цифры, после двух цифр
 * автоматически добавляет двоеточие (HH:mm). Максимум 4 цифры.
 * Использовать в onChange поля ввода времени транзакции/контрольной точки.
 */
export function formatTimeInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}
