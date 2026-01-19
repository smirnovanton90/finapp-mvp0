import { ItemKind, ItemOut, TransactionOut } from "@/lib/api";

export function normalizeItemSearch(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("ru");
}

export function formatAmount(valueInCents: number) {
  const hasCents = Math.abs(valueInCents) % 100 !== 0;
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(valueInCents / 100);
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
  if (item.type_code !== "bank_card") return item.kind;
  if (item.card_kind !== "CREDIT") return "ASSET";
  return balanceCents < 0 ? "LIABILITY" : "ASSET";
}
