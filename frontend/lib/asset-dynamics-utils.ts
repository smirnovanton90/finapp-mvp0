import type { ItemOut, TransactionOut } from "@/lib/api";
import type { FxRateOut } from "@/lib/api";

export function toTxDateKey(value: string): string {
  return value ? value.slice(0, 10) : "";
}

function transferDelta(kind: ItemOut["kind"], isPrimary: boolean, amount: number) {
  if (kind === "LIABILITY") return isPrimary ? amount : -amount;
  return isPrimary ? -amount : amount;
}

export function getTxDeltaForItem(
  tx: TransactionOut,
  itemId: number,
  itemKind: ItemOut["kind"],
  /** Валюта актива (ISO). Если не RUB, то amount_rub для primary считается в валюте актива. */
  itemCurrencyCode?: string | null
): { deltaCents: number; inCurrency: boolean } | null {
  const isPrimary = tx.primary_item_id === itemId || tx.primary_card_item_id === itemId;
  const isCounter = tx.counterparty_item_id === itemId || tx.counterparty_card_item_id === itemId;
  const primaryAmountInCurrency = Boolean(itemCurrencyCode && itemCurrencyCode.toUpperCase() !== "RUB");
  if (isPrimary) {
    if (tx.direction === "INCOME") return { deltaCents: tx.amount_rub, inCurrency: primaryAmountInCurrency };
    if (tx.direction === "EXPENSE") {
      const isOpening = tx.source === "AUTO_ITEM_OPENING";
      const amount = isOpening && itemKind === "LIABILITY" ? tx.amount_rub : -tx.amount_rub;
      return { deltaCents: amount, inCurrency: primaryAmountInCurrency };
    }
    if (tx.direction === "TRANSFER") return { deltaCents: transferDelta(itemKind, true, tx.amount_rub), inCurrency: primaryAmountInCurrency };
  }
  if (isCounter && tx.direction === "TRANSFER") {
    const amount = tx.amount_counterparty ?? tx.amount_rub;
    const inCurrency = tx.amount_counterparty != null;
    return { deltaCents: transferDelta(itemKind, false, amount), inCurrency };
  }
  return null;
}

export function isMoexItem(item: ItemOut): boolean {
  if (item.type_code === "crypto") return false;
  return Boolean(item.instrument_id);
}

export function isCryptoItem(item: ItemOut): boolean {
  return item.type_code === "crypto";
}

export function getRateForDate(
  ratesByDate: Record<string, FxRateOut[]>,
  dateKey: string,
  currencyCode: string,
  latestRatesByCurrency: Map<string, { dateKey: string; rate: number }>,
  todayKey: string,
  sortedRateDateKeys: string[]
): number | null {
  if (currencyCode === "RUB") return 1;
  if (dateKey > todayKey) {
    return latestRatesByCurrency.get(currencyCode)?.rate ?? null;
  }
  const rates = ratesByDate[dateKey];
  if (rates) {
    const match = rates.find((rate) => rate.char_code === currencyCode && rate.rate > 0);
    if (match) return match.rate;
  }
  let lo = 0;
  let hi = sortedRateDateKeys.length - 1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (sortedRateDateKeys[mid] < dateKey) lo = mid + 1;
    else hi = mid - 1;
  }
  for (let i = hi; i >= 0; i--) {
    const fallbackRates = ratesByDate[sortedRateDateKeys[i]];
    const match = fallbackRates?.find((r) => r.char_code === currencyCode && r.rate > 0);
    if (match) return match.rate;
  }
  return null;
}

export function formatRub(valueInCents: number): string {
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valueInCents / 100);
}

export function formatSignedValue(valueInCents: number, formatter: (value: number) => string): string {
  const absValue = Math.abs(valueInCents);
  const formatted = formatter(absValue);
  return valueInCents < 0 ? `-${formatted}` : formatted;
}

export function formatGrowthPercent(percent: number | null): string {
  if (percent == null || Number.isNaN(percent) || percent === 0) return "–";
  const formatted = new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(Math.abs(percent));
  return percent < 0 ? `-${formatted}%` : `+${formatted}%`;
}
