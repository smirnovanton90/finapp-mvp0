/**
 * Порядок активов/обязательств как на экране «Активы»: секции в том же порядке,
 * внутри секции — по количеству транзакций (sortItemsByTransactionCount).
 * Используется в мобильном визарде добавления транзакции.
 */

import type { ItemOut } from "./api";
import { ITEM_SECTIONS, CREDIT_LIABILITY_TYPES } from "./asset-item-form-constants";
import { getEffectiveItemKind } from "./item-utils";
import { sortItemsByTransactionCount } from "./item-utils";

function itemInSection(
  item: ItemOut,
  resolveItemEffectiveKind: (item: ItemOut) => "ASSET" | "LIABILITY"
) {
  const kind = resolveItemEffectiveKind(item);
  return (section: (typeof ITEM_SECTIONS)[0]) => {
    if (kind !== section.kind) return false;
    if (section.id === "credit_liabilities")
      return (
        CREDIT_LIABILITY_TYPES.includes(item.type_code ?? "") ||
        item.type_code === "bank_card" ||
        item.type_code === "bank_card_credit"
      );
    if (section.id === "cash_assets")
      return section.typeCodes.includes(item.type_code ?? "") || item.type_code === "bank_card";
    return section.typeCodes.includes(item.type_code ?? "");
  };
}

/**
 * Возвращает активы/обязательства в том же порядке, что и на экране «Активы»:
 * по секциям (денежные активы, инвестиции, …), внутри секции — по убыванию кол-ва транзакций.
 */
export function buildOrderedItemsLikeAssetsPage(
  items: ItemOut[],
  itemTxCounts: Map<number, number>,
  resolveItemEffectiveKind: (item: ItemOut) => "ASSET" | "LIABILITY"
): ItemOut[] {
  const sortedByTxCount = sortItemsByTransactionCount(items, itemTxCounts);
  const result: ItemOut[] = [];
  for (const section of ITEM_SECTIONS) {
    const inSection = sortedByTxCount.filter((item) =>
      itemInSection(item, resolveItemEffectiveKind)(section)
    );
    result.push(...inSection);
  }
  return result;
}
