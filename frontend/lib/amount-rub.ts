/**
 * Сумма транзакции хранится в минорных единицах валюты счёта (копейки, центы).
 * В рублёвых итогах её нужно умножить на курс ЦБ на дату операции.
 * RUB-курс равен 1. Без курса валютную сумму нельзя прибавлять к рублям.
 */
export function minorToRubCents(
  amountMinor: number,
  currencyCode: string | null | undefined,
  rate: number | null | undefined
): number | null {
  const code = (currencyCode || "RUB").toUpperCase();
  if (code === "RUB") return amountMinor;
  if (rate == null || !(rate > 0)) return null;
  return Math.round((amountMinor / 100) * rate * 100);
}
