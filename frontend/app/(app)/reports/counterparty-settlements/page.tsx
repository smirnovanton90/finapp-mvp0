"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  fetchCounterparties,
  fetchItems,
  fetchTransactions,
  API_BASE,
  CounterpartyOut,
  ItemOut,
  TransactionOut,
} from "@/lib/api";
import { buildCounterpartyTransactionCounts } from "@/lib/counterparty-utils";
import { formatAmount } from "@/lib/item-utils";
import { CounterpartySelector } from "@/components/counterparty-selector";
import { AuthInput } from "@/components/ui/auth-input";
import { Label } from "@/components/ui/label";
import { PLACEHOLDER_COLOR_DARK, ACTIVE_TEXT_DARK, MODAL_BG, RED, GREEN } from "@/lib/colors";
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

function toDateKey(value: string) {
  return value ? value.slice(0, 10) : "";
}

function formatDateLabel(dateKey: string) {
  const [y, m, d] = dateKey.split("-");
  return `${d}.${m}.${y}`;
}

function formatSignedAmount(valueInCents: number) {
  const abs = Math.abs(valueInCents);
  const formatted = formatAmount(abs);
  return valueInCents >= 0 ? `+ ${formatted}` : `− ${formatted}`;
}

function balanceStatusLabel(amountCents: number): string {
  if (amountCents > 0) return "Вам должны";
  if (amountCents < 0) return "Вы должны";
  return "Задолженности нет";
}

/** Тип актива «Взаиморасчёты» — один item на контрагента, сальдо может быть плюс/минус. */
const COUNTERPARTY_SETTLEMENTS_TYPE = "counterparty_settlements" as const;

function getRelativeDateKey(daysOffset: number) {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function buildDocumentLabel(tx: TransactionOut) {
  const dateKey = toDateKey(tx.transaction_date);
  const dateStr = dateKey ? formatDateLabel(dateKey) : "";
  let kind: string;
  if (tx.direction === "EXPENSE") kind = "Оплата";
  else if (tx.direction === "INCOME") kind = "Поступление";
  else kind = "Перевод";
  const base = dateStr ? `${kind} от ${dateStr}` : kind;
  return tx.comment?.trim() ? `${base} — ${tx.comment.trim()}` : base;
}

type ReportRow =
  | {
      type: "transaction";
      dateKey: string;
      document: string;
      amountCents: number;
    }
  | { type: "paid_to"; amountCents: number }
  | { type: "received_from"; amountCents: number };

type ReportData = {
  rows: ReportRow[];
  openingBalance: number;
  closingBalance: number;
};

/**
 * Вычисляет дельту по сальдо взаиморасчётов для одной стороны транзакции (primary или counterparty),
 * когда эта сторона — item типа «Взаиморасчёты» (counterparty_settlements). Хранится как ASSET: + = нам должны, − = мы должны.
 */
function transactionDeltaForSide(
  tx: TransactionOut,
  itemIds: Set<number>,
  _itemsById: Map<number, ItemOut>,
  isPrimary: boolean
): number {
  const amount = tx.amount_rub ?? 0;
  const itemId = isPrimary
    ? (tx.primary_item_id != null && itemIds.has(tx.primary_item_id) ? tx.primary_item_id : tx.primary_card_item_id ?? null)
    : (tx.counterparty_item_id != null && itemIds.has(tx.counterparty_item_id) ? tx.counterparty_item_id : tx.counterparty_card_item_id ?? null);
  if (itemId == null) return 0;
  // counterparty_settlements всегда ASSET: приход на счёт = +, списание = −
  const kindSign = 1;
  let rawDelta: number;
  if (isPrimary) {
    rawDelta = tx.direction === "INCOME" ? 1 : tx.direction === "EXPENSE" ? -1 : -1; // TRANSFER: primary отдаёт
  } else {
    rawDelta = tx.direction === "INCOME" ? -1 : tx.direction === "EXPENSE" ? 1 : 1; // TRANSFER: counterparty получает
  }
  return kindSign * rawDelta * amount;
}

function buildReportData(
  counterpartyId: number,
  rangeStartKey: string,
  rangeEndKey: string,
  transactions: TransactionOut[],
  items: ItemOut[]
): ReportData {
  const itemsById = new Map(items.map((i) => [i.id, i]));
  const debtItems = items.filter(
    (i) =>
      i.counterparty_id === counterpartyId &&
      i.type_code === COUNTERPARTY_SETTLEMENTS_TYPE
  );
  const itemIds = new Set(debtItems.map((i) => i.id));

  const isRelevantTx = (tx: TransactionOut) => {
    const pid = tx.primary_item_id ?? tx.primary_card_item_id;
    const cid = tx.counterparty_item_id ?? tx.counterparty_card_item_id;
    return (pid != null && itemIds.has(pid)) || (cid != null && itemIds.has(cid));
  };
  const isRealized = (tx: TransactionOut) =>
    tx.transaction_type === "ACTUAL" || tx.status === "REALIZED";
  const relevantTxs = transactions.filter((tx) => isRelevantTx(tx) && isRealized(tx));

  const txDelta = (tx: TransactionOut): number => {
    let delta = 0;
    const pid = tx.primary_item_id ?? tx.primary_card_item_id;
    const cid = tx.counterparty_item_id ?? tx.counterparty_card_item_id;
    if (pid != null && itemIds.has(pid)) delta += transactionDeltaForSide(tx, itemIds, itemsById, true);
    if (cid != null && itemIds.has(cid)) delta += transactionDeltaForSide(tx, itemIds, itemsById, false);
    return delta;
  };

  const beforeStart = relevantTxs.filter((tx) => {
    const key = toDateKey(tx.transaction_date);
    return key && key < rangeStartKey;
  });
  const openingBalance = beforeStart.reduce((sum, tx) => sum + txDelta(tx), 0);

  const periodTxs = relevantTxs
    .filter((tx) => {
      const key = toDateKey(tx.transaction_date);
      return key && key >= rangeStartKey && key <= rangeEndKey;
    })
    .sort((a, b) => toDateKey(a.transaction_date).localeCompare(toDateKey(b.transaction_date)));

  let periodNet = 0;
  let periodPaid = 0;
  let periodReceived = 0;
  const transactionRows: ReportRow[] = periodTxs.map((tx) => {
    const delta = txDelta(tx);
    periodNet += delta;
    if (delta < 0) periodPaid += Math.abs(delta);
    else if (delta > 0) periodReceived += delta;
    return {
      type: "transaction",
      dateKey: toDateKey(tx.transaction_date),
      document: buildDocumentLabel(tx),
      amountCents: delta,
    };
  });

  const closingBalance = openingBalance + periodNet;

  const rows: ReportRow[] = [
    ...transactionRows,
    { type: "received_from", amountCents: periodPaid },
    { type: "paid_to", amountCents: periodReceived },
  ];
  return { rows, openingBalance, closingBalance };
}

export default function CounterpartySettlementsPage() {
  const { data: session } = useSession();
  const [counterparties, setCounterparties] = useState<CounterpartyOut[]>([]);
  const [items, setItems] = useState<ItemOut[]>([]);
  const [transactions, setTransactions] = useState<TransactionOut[]>([]);
  const [selectedCounterpartyIds, setSelectedCounterpartyIds] = useState<number[]>([]);
  const [rangeStart, setRangeStart] = useState(() => getRelativeDateKey(-30));
  const [rangeEnd, setRangeEnd] = useState(() => getRelativeDateKey(0));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    let active = true;
    setLoading(true);
    setError(null);
    Promise.all([
      fetchCounterparties(),
      fetchItems({ includeClosed: true }),
      fetchTransactions(),
    ])
      .then(([cpData, itemsData, txData]) => {
        if (!active) return;
        setCounterparties(cpData);
        setItems(itemsData);
        setTransactions(txData);
      })
      .catch((e: unknown) => {
        if (!active) return;
        setError(
          e instanceof Error ? e.message : "Не удалось загрузить данные."
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [session]);

  const counterpartyCounts = useMemo(
    () => buildCounterpartyTransactionCounts(transactions),
    [transactions]
  );

  const defaultStartKey = getRelativeDateKey(-30);
  const defaultEndKey = getRelativeDateKey(0);

  const rangeStartKey = rangeStart || defaultStartKey;
  const rangeEndKey = rangeEnd || defaultEndKey;
  const rangeEndResolved =
    !rangeEndKey || rangeEndKey < rangeStartKey ? rangeStartKey : rangeEndKey;

  const selectedId = selectedCounterpartyIds[0] ?? null;
  const debtItemsForSelected = useMemo(() => {
    if (selectedId == null) return [];
    return items.filter(
      (i) =>
        i.counterparty_id === selectedId &&
        i.type_code === COUNTERPARTY_SETTLEMENTS_TYPE
    );
  }, [selectedId, items]);

  const reportData = useMemo((): ReportData | null => {
    if (selectedId == null || !rangeStartKey || !rangeEndResolved)
      return null;
    return buildReportData(
      selectedId,
      rangeStartKey,
      rangeEndResolved,
      transactions,
      items
    );
  }, [selectedId, rangeStartKey, rangeEndResolved, transactions, items]);

  const hasReport = reportData != null;
  const hasNoDebtItems = selectedId != null && debtItemsForSelected.length === 0 && !loading;

  return (
    <main className="min-h-screen px-8 py-8">
      <div className="mx-auto flex w-full max-w-[900px] flex-col gap-6">
        <div className="flex flex-col gap-4">
          <div className="space-y-1.5 w-full">
            <Label>Контрагент</Label>
            <CounterpartySelector
              counterparties={counterparties}
              selectedIds={selectedCounterpartyIds}
              onChange={setSelectedCounterpartyIds}
              selectionMode="single"
              placeholder="Начните вводить название"
              emptyMessage="Нет контрагентов"
              noResultsMessage="Ничего не найдено"
              clearLabel="Сбросить"
              counterpartyCounts={counterpartyCounts}
              apiBase={API_BASE}
              showChips={false}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="cp-settlements-date-from">Дата от</Label>
              <div className="[&_div.relative.flex.items-center]:h-10 [&_input]:text-sm [&_input]:font-normal min-w-0">
                <AuthInput
                  id="cp-settlements-date-from"
                  type="date"
                  value={rangeStartKey}
                  onChange={(e) => {
                    const next = e.target.value;
                    setRangeStart(next);
                    if (rangeEnd && next && rangeEnd < next) setRangeEnd(next);
                  }}
                  style={{
                    color: !rangeStartKey ? PLACEHOLDER_COLOR_DARK : ACTIVE_TEXT_DARK,
                  }}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cp-settlements-date-to">Дата до</Label>
              <div className="[&_div.relative.flex.items-center]:h-10 [&_input]:text-sm [&_input]:font-normal min-w-0">
                <AuthInput
                  id="cp-settlements-date-to"
                  type="date"
                  min={rangeStartKey || undefined}
                  value={rangeEndResolved}
                  onChange={(e) => setRangeEnd(e.target.value || rangeStartKey)}
                  style={{
                    color: !rangeEndResolved ? PLACEHOLDER_COLOR_DARK : ACTIVE_TEXT_DARK,
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {!hasReport && (
          <div
            className="relative rounded-lg overflow-hidden border-0 outline-none"
            style={{ backgroundColor: MODAL_BG }}
          >
            <div
              className="px-6 pt-6 pb-6 transition-opacity duration-300"
              style={{ opacity: loading ? 0.6 : 1 }}
            >
              {error && (
                <div className="flex min-h-[200px] items-center justify-center text-sm text-red-600">
                  {error}
                </div>
              )}

              {!error && !selectedId && !loading && (
                <div className="flex min-h-[200px] items-center justify-center text-sm text-muted-foreground">
                  Выберите контрагента и период для построения отчёта.
                </div>
              )}

              {!error && hasNoDebtItems && (
                <div className="flex min-h-[200px] items-center justify-center text-sm text-muted-foreground">
                  По выбранному контрагенту нет взаиморасчётов. Создайте транзакцию «Долги» с этим контрагентом.
                </div>
              )}

              {!error && selectedId && !hasNoDebtItems && !loading && (
                <div className="flex min-h-[200px] items-center justify-center text-sm text-muted-foreground">
                  Нет операций по этим активам и обязательствам за указанный период.
                </div>
              )}
            </div>
          </div>
        )}

        {!error && hasReport && reportData && (
                <div className="flex flex-col gap-6">
                  <div
                    className="relative rounded-lg overflow-hidden border-0 outline-none px-6 py-4"
                    style={{ backgroundColor: MODAL_BG }}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-sm text-muted-foreground">
                        Сальдо на начало периода
                      </span>
                      <span
                        className="text-base font-medium"
                        style={{
                          color:
                            reportData.openingBalance > 0
                              ? GREEN
                              : reportData.openingBalance < 0
                                ? RED
                                : undefined,
                        }}
                      >
                        {balanceStatusLabel(reportData.openingBalance)}{" "}
                        {formatSignedAmount(reportData.openingBalance)}
                      </span>
                    </div>
                  </div>

                  <div
                    className="relative rounded-lg overflow-hidden border-0 outline-none"
                    style={{ backgroundColor: MODAL_BG }}
                  >
                    <div className="px-0 pt-6 pb-6">
                      <div className="overflow-x-auto">
                        <Table className="min-w-full table-fixed">
                          <TableBody>
                            {reportData.rows.map((row, index) => {
                              if (row.type === "transaction") {
                                const isPos = row.amountCents > 0;
                                const isNeg = row.amountCents < 0;
                                return (
                                  <TableRow
                                    key={`tx-${index}`}
                                    className="border-b border-border/70"
                                  >
                                    <TableCell className="pl-8 whitespace-nowrap">
                                      {formatDateLabel(row.dateKey)}
                                    </TableCell>
                                    <TableCell className="text-muted-foreground">
                                      {row.document}
                                    </TableCell>
                                    <TableCell
                                      className="pr-8 text-right"
                                      style={{
                                        color:
                                          isPos ? GREEN : isNeg ? RED : undefined,
                                      }}
                                    >
                                      {formatSignedAmount(row.amountCents)}
                                    </TableCell>
                                  </TableRow>
                                );
                              }
                              if (row.type === "received_from") {
                                return (
                                  <TableRow
                                    key="received_from"
                                    className="border-b border-border/70 font-medium"
                                  >
                                    <TableCell
                                      colSpan={2}
                                      className="pl-8 text-muted-foreground"
                                    >
                                      Вы получили
                                    </TableCell>
                                    <TableCell
                                      className="pr-8 text-right font-medium"
                                      style={{
                                        color: row.amountCents > 0 ? RED : undefined,
                                      }}
                                    >
                                      {row.amountCents > 0
                                        ? formatSignedAmount(-row.amountCents)
                                        : "0.00"}
                                    </TableCell>
                                  </TableRow>
                                );
                              }
                              if (row.type === "paid_to") {
                                return (
                                  <TableRow
                                    key="paid_to"
                                    className="border-b border-border/70 font-medium"
                                  >
                                    <TableCell
                                      colSpan={2}
                                      className="pl-8 text-muted-foreground"
                                    >
                                      Вы заплатили
                                    </TableCell>
                                    <TableCell
                                      className="pr-8 text-right font-medium"
                                      style={{
                                        color:
                                          row.amountCents > 0 ? GREEN : undefined,
                                      }}
                                    >
                                      {row.amountCents > 0
                                        ? formatSignedAmount(row.amountCents)
                                        : "0.00"}
                                    </TableCell>
                                  </TableRow>
                                );
                              }
                              return null;
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  </div>

                  <div
                    className="relative rounded-lg overflow-hidden border-0 outline-none px-6 py-4"
                    style={{ backgroundColor: MODAL_BG }}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-sm text-muted-foreground">
                        Сальдо на конец периода
                      </span>
                      <span
                        className="text-base font-semibold"
                        style={{
                          color:
                            reportData.closingBalance > 0
                              ? GREEN
                              : reportData.closingBalance < 0
                                ? RED
                                : undefined,
                        }}
                      >
                        {balanceStatusLabel(reportData.closingBalance)}{" "}
                        {formatSignedAmount(reportData.closingBalance)}
                      </span>
                    </div>
                  </div>
                </div>
        )}
      </div>
    </main>
  );
}
