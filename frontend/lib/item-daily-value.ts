/**
 * Построение дневной истории основной стоимости (баланса) актива за последние N дней
 * для мини-графика на мобильной версии экрана «Активы». Логика по аналогии с дэшбордом.
 */

import type { ItemKind, ItemOut, TransactionOut } from "@/lib/api";

function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function toTxDateKey(value: string): string {
  return value ? value.slice(0, 10) : "";
}

function parseDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function getItemStartKey(item: ItemOut, accountingStartDate: string | null | undefined): string {
  let minDate = accountingStartDate ?? item.open_date ?? "";
  if (item.open_date && item.open_date > minDate) minDate = item.open_date;
  return minDate ? toTxDateKey(minDate) : toDateKey(new Date(item.created_at));
}

function transferDelta(kind: ItemKind, isPrimary: boolean, amount: number): number {
  if (kind === "LIABILITY") return isPrimary ? amount : -amount;
  return isPrimary ? -amount : amount;
}

function buildDeltasByDate(
  txs: TransactionOut[],
  selectedIds: Set<number>,
  itemKindById: Map<number, ItemKind>,
  todayKey: string
): Map<string, Map<number, number>> {
  const map = new Map<string, Map<number, number>>();
  const addDelta = (dateKey: string, itemId: number, delta: number) => {
    if (!map.has(dateKey)) map.set(dateKey, new Map());
    map.get(dateKey)!.set(itemId, (map.get(dateKey)!.get(itemId) ?? 0) + delta);
  };

  txs.forEach((tx) => {
    if (tx.is_split_parent) return;
    const dateKey = toTxDateKey(tx.transaction_date);
    if (!dateKey) return;
    if (tx.source === "AUTO_ITEM_OPENING" || tx.source === "AUTO_ITEM_CLOSING") return;
    const isRealized = tx.transaction_type === "ACTUAL" || tx.status === "REALIZED";
    if (dateKey <= todayKey && !isRealized) return;

    const primarySelected = selectedIds.has(tx.primary_item_id);
    const counterSelected = tx.counterparty_item_id ? selectedIds.has(tx.counterparty_item_id) : false;
    if (!primarySelected && !counterSelected) return;

    if (primarySelected) {
      let delta = 0;
      if (tx.direction === "INCOME") delta = tx.amount;
      if (tx.direction === "EXPENSE") delta = -tx.amount;
      if (tx.direction === "TRANSFER") {
        const kind = itemKindById.get(tx.primary_item_id) ?? "ASSET";
        delta = transferDelta(kind, true, tx.amount);
      }
      addDelta(dateKey, tx.primary_item_id, delta);
    }
    if (counterSelected && tx.direction === "TRANSFER" && tx.counterparty_item_id) {
      const kind = itemKindById.get(tx.counterparty_item_id) ?? "ASSET";
      const counterAmount = tx.amount_counterparty ?? tx.amount;
      addDelta(dateKey, tx.counterparty_item_id, transferDelta(kind, false, counterAmount));
    }
  });

  return map;
}

export type DailyPrimaryValuePoint = { date: string; valueRubCents: number };

/**
 * Строит массив дневных значений основной стоимости (баланс в рублях, копейки) для одного актива
 * за последние days дней. Курс берётся единый (текущий) для всех дат.
 */
export function buildItemDailyPrimaryValueRubCents(
  item: ItemOut,
  txs: TransactionOut[],
  accountingStartDate: string | null | undefined,
  rate: number,
  options: { days: number }
): DailyPrimaryValuePoint[] {
  const now = new Date();
  const todayKey = toDateKey(now);
  const rangeEnd = parseDateKey(todayKey);
  const rangeStart = addDays(rangeEnd, -options.days);
  const rangeStartKey = toDateKey(rangeStart);
  const rangeEndKey = todayKey;

  const selectedIds = new Set([item.id]);
  const itemKindById = new Map([[item.id, item.kind]]);
  const itemStartKey = getItemStartKey(item, accountingStartDate);
  const itemsByStartDate = new Map<string, ItemOut[]>();
  itemsByStartDate.set(itemStartKey, [item]);

  const deltasByDate = buildDeltasByDate(txs, selectedIds, itemKindById, todayKey);
  let current = rangeStart;
  const endDate = rangeEnd;
  const balances = new Map<number, number>();
  const rows: DailyPrimaryValuePoint[] = [];

  while (current <= endDate) {
    const dateKey = toDateKey(current);
    const newItems = itemsByStartDate.get(dateKey) ?? [];
    newItems.forEach((i) => balances.set(i.id, i.initial_balance_minor));

    const dayDeltas = deltasByDate.get(dateKey);
    if (dayDeltas) {
      dayDeltas.forEach((delta, id) => {
        balances.set(id, (balances.get(id) ?? 0) + delta);
      });
    }

    if (dateKey < rangeStartKey) {
      current = addDays(current, 1);
      continue;
    }

    const valueCents = balances.get(item.id) ?? item.initial_balance_minor;
    const currency = (item.currency_code ?? "RUB").toUpperCase();
    const rubValueCents =
      currency === "RUB"
        ? valueCents
        : Math.round((valueCents / 100) * rate * 100);

    rows.push({ date: dateKey, valueRubCents: rubValueCents });
    current = addDays(current, 1);
  }

  return rows;
}
