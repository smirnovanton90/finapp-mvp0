import { ItemKind, ItemOut, TransactionOut } from "@/lib/api";
import { joinApiBasePath } from "@/lib/api-image-url";

/**
 * Возвращает основную стоимость актива в копейках/центах (для отображения по primary_value_kind).
 * Значение в валюте актива. Использует balance_currency_cents/balance_rub_cents из API при наличии.
 */
export function getItemPrimaryValueCents(item: ItemOut, _fxRateForCurrency?: number): number {
  const kind = item.primary_value_kind ?? "BALANCE";
  if (kind === "MARKET") {
    if (item.currency_code && item.currency_code !== "RUB" && item.latest_market_value_currency_cents != null) {
      return item.latest_market_value_currency_cents;
    }
    if (item.latest_market_value_rub != null) return item.latest_market_value_rub;
  }
  if (kind === "ACQUISITION" && item.acquisitionCents != null) return item.acquisitionCents;
  if (kind === "INVESTED" && item.investedCents != null) return item.investedCents;
  // BALANCE: единый источник — API отдаёт balance_currency_cents (в валюте актива)
  if (item.balance_currency_cents != null) {
    return item.balance_currency_cents;
  }
  return item.current_value_rub;
}

/** Build full item photo URL with cache-busting so updated images refresh without reload.
 * Always uses apiBase so the image is loaded from the same backend the app uses
 * (backend may return full URL with public_base_url that is not reachable from the browser). */
export function getItemPhotoUrl(
  item: { photo_url: string | null; photo_updated_at?: string | null } | null,
  apiBase: string
): string | null {
  if (!item?.photo_url) return null;
  const base = joinApiBasePath(apiBase, item.photo_url);
  const qs = item.photo_updated_at
    ? `?t=${new Date(item.photo_updated_at).getTime()}`
    : "";
  return `${base}${qs}`;
}

export function normalizeItemSearch(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("ru");
}

export function formatAmount(valueInCents: number) {
  // Format with 2 decimal places
  const formatted = new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valueInCents / 100);
  
  // Remove trailing zeros in fractional part
  // 1 400 000,00 -> 1 400 000
  // 1 400 000,10 -> 1 400 000,1
  // 1 400 000,15 -> 1 400 000,15
  if (formatted.includes(",")) {
    const trimmed = formatted.replace(/,?0+$/, "");
    return trimmed;
  }
  return formatted;
}

export function buildItemTransactionCounts(
  transactions: TransactionOut[]
): Map<number, number> {
  const counts = new Map<number, number>();
  transactions.forEach((tx) => {
    counts.set(tx.primary_item_id, (counts.get(tx.primary_item_id) ?? 0) + 1);
    if (tx.primary_card_item_id) {
      counts.set(
        tx.primary_card_item_id,
        (counts.get(tx.primary_card_item_id) ?? 0) + 1
      );
    }
    if (tx.counterparty_item_id) {
      counts.set(
        tx.counterparty_item_id,
        (counts.get(tx.counterparty_item_id) ?? 0) + 1
      );
    }
    if (tx.counterparty_card_item_id) {
      counts.set(
        tx.counterparty_card_item_id,
        (counts.get(tx.counterparty_card_item_id) ?? 0) + 1
      );
    }
  });
  return counts;
}

export function sortItemsByTransactionCount(
  items: ItemOut[],
  countById: Map<number, number>
) {
  return [...items].sort((a, b) => {
    const countA = countById.get(a.id) ?? 0;
    const countB = countById.get(b.id) ?? 0;
    if (countA !== countB) return countB - countA;
    return a.name.localeCompare(b.name, "ru", { sensitivity: "base" });
  });
}

export function getEffectiveItemKind(
  item: Pick<ItemOut, "kind" | "type_code" | "card_kind">,
  balanceCents: number
): ItemKind {
  if (item.type_code === "counterparty_settlements") {
    return balanceCents < 0 ? "LIABILITY" : "ASSET";
  }
  if (item.type_code !== "bank_card") return item.kind;
  if (item.card_kind !== "CREDIT") return "ASSET";
  return balanceCents < 0 ? "LIABILITY" : "ASSET";
}
