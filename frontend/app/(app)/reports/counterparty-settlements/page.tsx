"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  fetchCounterparties,
  fetchItems,
  fetchTransactions,
  fetchFxRatesBatch,
  API_BASE,
  CounterpartyOut,
  ItemOut,
  TransactionOut,
  type FxRateOut,
} from "@/lib/api";
import { buildCounterpartyTransactionCounts } from "@/lib/counterparty-utils";
import { formatAmount } from "@/lib/item-utils";
import { CounterpartySelector } from "@/components/counterparty-selector";
import { CurrencyChip } from "@/components/currency-chip";
import { AuthInput } from "@/components/ui/auth-input";
import { Label } from "@/components/ui/label";
import { PLACEHOLDER_COLOR_DARK, ACTIVE_TEXT_DARK, MODAL_BG, RED, GREEN } from "@/lib/colors";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
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

/** Конвертация рублей (копейки) в валюту по курсу и форматирование со знаком. */
function formatSignedAmountInCurrency(rubCents: number, rateRubPerUnit: number): string {
  if (rateRubPerUnit <= 0) return "—";
  const amountInCurrency = rubCents / 100 / rateRubPerUnit;
  const abs = Math.abs(amountInCurrency);
  const formatted = new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(abs);
  const withSign = amountInCurrency >= 0 ? `+ ${formatted}` : `− ${formatted}`;
  return withSign;
}

function balanceStatusLabel(amountCents: number): string {
  if (amountCents > 0) return "Вам должны";
  if (amountCents < 0) return "Вы должны";
  return "Задолженности нет";
}

/** Типы активов/обязательств для расчётов с контрагентом. */
const COUNTERPARTY_SETTLEMENTS_TYPE = "counterparty_settlements" as const;
const LOAN_TO_THIRD_PARTY_TYPE = "loan_to_third_party" as const;
const PRIVATE_LOAN_TYPE = "private_loan" as const;

const SOURCE_LABELS = {
  settlements: "Взаиморасчёты",
  loan_given: "Предоставленные займы",
  loan_received: "Полученные займы",
} as const;

type SourceType = keyof typeof SOURCE_LABELS;

function getRelativeDateKey(daysOffset: number) {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type ItemBreakdownRow = {
  itemId: number;
  name: string;
  currencyCode: string;
  openingBalance: number;
  periodNet: number;
  closingBalance: number;
  sourceType: SourceType;
};

type ReportRow =
  | {
      type: "transaction";
      dateKey: string;
      comment: string;
      amountCents: number;
      sourceType: SourceType;
      itemId?: number;
      itemName?: string;
      itemCurrency?: string;
    }
  | { type: "paid_to"; amountCents: number }
  | { type: "received_from"; amountCents: number };

type ReportData = {
  rows: ReportRow[];
  openingBalance: number;
  closingBalance: number;
  openingBalanceSettlements: number;
  openingBalanceLoanGiven: number;
  openingBalanceLoanReceived: number;
  closingBalanceSettlements: number;
  closingBalanceLoanGiven: number;
  closingBalanceLoanReceived: number;
  /** Разбивка по каждому элементу (взаиморасчёты, займы выданные, займы полученные) с учётом валюты. */
  itemsBreakdown: ItemBreakdownRow[];
};

/**
 * Вычисляет дельту по сальдо для одной стороны транзакции (primary или counterparty),
 * когда эта сторона — item из нашего набора (взаиморасчёты, займы выданные, займы полученные).
 * ASSET: + = в вашу пользу; LIABILITY: инвертируем знак.
 */
function transactionDeltaForSide(
  tx: TransactionOut,
  itemId: number,
  itemsById: Map<number, ItemOut>,
  isPrimary: boolean
): number {
  const item = itemsById.get(itemId);
  if (!item) return 0;
  const amount = tx.amount ?? 0;
  // ASSET: приход = +; LIABILITY: приход = рост долга = − в «вашу пользу»
  const kindSign = item.kind === "LIABILITY" ? -1 : 1;
  let rawDelta: number;
  if (isPrimary) {
    rawDelta = tx.direction === "INCOME" ? 1 : tx.direction === "EXPENSE" ? -1 : -1;
  } else {
    rawDelta = tx.direction === "INCOME" ? -1 : tx.direction === "EXPENSE" ? 1 : 1;
  }
  return kindSign * rawDelta * amount;
}

function getSourceTypeForItem(
  itemId: number,
  itemsById: Map<number, ItemOut>,
  settlementIds: Set<number>,
  loanGivenIds: Set<number>,
  loanReceivedIds: Set<number>
): SourceType | null {
  if (settlementIds.has(itemId)) return "settlements";
  if (loanGivenIds.has(itemId)) return "loan_given";
  if (loanReceivedIds.has(itemId)) return "loan_received";
  return null;
}

function buildReportData(
  counterpartyId: number,
  rangeStartKey: string,
  rangeEndKey: string,
  transactions: TransactionOut[],
  items: ItemOut[]
): ReportData {
  const itemsById = new Map(items.map((i) => [i.id, i]));
  const settlementItems = items.filter(
    (i) =>
      i.counterparty_id === counterpartyId &&
      i.type_code === COUNTERPARTY_SETTLEMENTS_TYPE
  );
  const loanGivenItems = items.filter(
    (i) =>
      i.counterparty_id === counterpartyId &&
      i.type_code === LOAN_TO_THIRD_PARTY_TYPE
  );
  const loanReceivedItems = items.filter(
    (i) =>
      i.counterparty_id === counterpartyId &&
      i.type_code === PRIVATE_LOAN_TYPE
  );
  const settlementIds = new Set(settlementItems.map((i) => i.id));
  const loanGivenIds = new Set(loanGivenItems.map((i) => i.id));
  const loanReceivedIds = new Set(loanReceivedItems.map((i) => i.id));
  const allItemIds = new Set([
    ...settlementIds,
    ...loanGivenIds,
    ...loanReceivedIds,
  ]);

  const isRelevantTx = (tx: TransactionOut) => {
    const pid = tx.primary_item_id ?? tx.primary_card_item_id;
    const cid = tx.counterparty_item_id ?? tx.counterparty_card_item_id;
    return (pid != null && allItemIds.has(pid)) || (cid != null && allItemIds.has(cid));
  };
  const isRealized = (tx: TransactionOut) =>
    tx.transaction_type === "ACTUAL" || tx.status === "REALIZED";
  const relevantTxs = transactions.filter(
    (tx) => !tx.is_split_parent && isRelevantTx(tx) && isRealized(tx)
  );

  const txDelta = (tx: TransactionOut): number => {
    let delta = 0;
    const pid = tx.primary_item_id ?? tx.primary_card_item_id;
    const cid = tx.counterparty_item_id ?? tx.counterparty_card_item_id;
    if (pid != null && allItemIds.has(pid))
      delta += transactionDeltaForSide(tx, pid, itemsById, true);
    if (cid != null && allItemIds.has(cid))
      delta += transactionDeltaForSide(tx, cid, itemsById, false);
    return delta;
  };

  const txDeltaBySource = (tx: TransactionOut) => {
    let settlements = 0;
    let loanGiven = 0;
    let loanReceived = 0;
    const pid = tx.primary_item_id ?? tx.primary_card_item_id;
    const cid = tx.counterparty_item_id ?? tx.counterparty_card_item_id;
    if (pid != null && allItemIds.has(pid)) {
      const d = transactionDeltaForSide(tx, pid, itemsById, true);
      if (settlementIds.has(pid)) settlements += d;
      else if (loanGivenIds.has(pid)) loanGiven += d;
      else if (loanReceivedIds.has(pid)) loanReceived += d;
    }
    if (cid != null && allItemIds.has(cid)) {
      const d = transactionDeltaForSide(tx, cid, itemsById, false);
      if (settlementIds.has(cid)) settlements += d;
      else if (loanGivenIds.has(cid)) loanGiven += d;
      else if (loanReceivedIds.has(cid)) loanReceived += d;
    }
    return { settlements, loanGiven, loanReceived };
  };

  const txDeltaByItemId = (tx: TransactionOut): Map<number, number> => {
    const out = new Map<number, number>();
    const pid = tx.primary_item_id ?? tx.primary_card_item_id;
    const cid = tx.counterparty_item_id ?? tx.counterparty_card_item_id;
    if (pid != null && allItemIds.has(pid)) {
      const d = transactionDeltaForSide(tx, pid, itemsById, true);
      out.set(pid, (out.get(pid) ?? 0) + d);
    }
    if (cid != null && allItemIds.has(cid)) {
      const d = transactionDeltaForSide(tx, cid, itemsById, false);
      out.set(cid, (out.get(cid) ?? 0) + d);
    }
    return out;
  };

  const getSourceTypeForItemId = (itemId: number): SourceType => {
    if (settlementIds.has(itemId)) return "settlements";
    if (loanGivenIds.has(itemId)) return "loan_given";
    if (loanReceivedIds.has(itemId)) return "loan_received";
    return "settlements";
  };

  const beforeStart = relevantTxs.filter((tx) => {
    const key = toDateKey(tx.transaction_date);
    return key && key < rangeStartKey;
  });
  const openingByItemId = new Map<number, number>();
  beforeStart.forEach((tx) => {
    txDeltaByItemId(tx).forEach((d, itemId) => {
      openingByItemId.set(itemId, (openingByItemId.get(itemId) ?? 0) + d);
    });
  });
  let openingBalanceSettlements = 0;
  let openingBalanceLoanGiven = 0;
  let openingBalanceLoanReceived = 0;
  beforeStart.forEach((tx) => {
    const by = txDeltaBySource(tx);
    openingBalanceSettlements += by.settlements;
    openingBalanceLoanGiven += by.loanGiven;
    openingBalanceLoanReceived += by.loanReceived;
  });
  const openingBalance =
    openingBalanceSettlements + openingBalanceLoanGiven + openingBalanceLoanReceived;

  const periodTxs = relevantTxs
    .filter((tx) => {
      const key = toDateKey(tx.transaction_date);
      return key && key >= rangeStartKey && key <= rangeEndKey;
    })
    .sort((a, b) => toDateKey(a.transaction_date).localeCompare(toDateKey(b.transaction_date)));

  const periodNetByItemId = new Map<number, number>();
  let periodNet = 0;
  let periodNetSettlements = 0;
  let periodNetLoanGiven = 0;
  let periodNetLoanReceived = 0;
  let periodPaid = 0;
  let periodReceived = 0;
  const transactionRows: ReportRow[] = periodTxs.map((tx) => {
    const delta = txDelta(tx);
    const by = txDeltaBySource(tx);
    const byItem = txDeltaByItemId(tx);
    byItem.forEach((d, itemId) => {
      periodNetByItemId.set(itemId, (periodNetByItemId.get(itemId) ?? 0) + d);
    });
    periodNet += delta;
    periodNetSettlements += by.settlements;
    periodNetLoanGiven += by.loanGiven;
    periodNetLoanReceived += by.loanReceived;
    if (delta < 0) periodPaid += Math.abs(delta);
    else if (delta > 0) periodReceived += delta;
    const pid = tx.primary_item_id ?? tx.primary_card_item_id;
    const cid = tx.counterparty_item_id ?? tx.counterparty_card_item_id;
    const primarySource =
      pid != null
        ? getSourceTypeForItem(pid, itemsById, settlementIds, loanGivenIds, loanReceivedIds)
        : null;
    const counterpartySource =
      cid != null
        ? getSourceTypeForItem(cid, itemsById, settlementIds, loanGivenIds, loanReceivedIds)
        : null;
    const sourceType: SourceType =
      primarySource ?? counterpartySource ?? "settlements";
    const itemId = (pid != null && allItemIds.has(pid) ? pid : cid ?? null) as number | undefined;
    const item = itemId != null ? itemsById.get(itemId) : undefined;
    return {
      type: "transaction",
      dateKey: toDateKey(tx.transaction_date),
      comment: tx.comment?.trim() ?? "",
      amountCents: delta,
      sourceType,
      itemId: itemId ?? undefined,
      itemName: item?.name,
      itemCurrency: item?.currency_code,
    };
  });

  const closingBalanceSettlements = openingBalanceSettlements + periodNetSettlements;
  const closingBalanceLoanGiven = openingBalanceLoanGiven + periodNetLoanGiven;
  const closingBalanceLoanReceived = openingBalanceLoanReceived + periodNetLoanReceived;
  const closingBalance =
    closingBalanceSettlements + closingBalanceLoanGiven + closingBalanceLoanReceived;

  const allDebtItems = [
    ...settlementItems.map((i) => ({ item: i, sourceType: "settlements" as const })),
    ...loanGivenItems.map((i) => ({ item: i, sourceType: "loan_given" as const })),
    ...loanReceivedItems.map((i) => ({ item: i, sourceType: "loan_received" as const })),
  ];
  const itemsBreakdown: ItemBreakdownRow[] = allDebtItems.map(({ item, sourceType }) => {
    const opening = openingByItemId.get(item.id) ?? 0;
    const periodNet = periodNetByItemId.get(item.id) ?? 0;
    const closing = opening + periodNet;
    return {
      itemId: item.id,
      name: item.name ?? "",
      currencyCode: item.currency_code ?? "RUB",
      openingBalance: opening,
      periodNet,
      closingBalance: closing,
      sourceType,
    };
  });

  const rows: ReportRow[] = [
    ...transactionRows,
    { type: "received_from", amountCents: periodPaid },
    { type: "paid_to", amountCents: periodReceived },
  ];
  return {
    rows,
    openingBalance,
    closingBalance,
    openingBalanceSettlements,
    openingBalanceLoanGiven,
    openingBalanceLoanReceived,
    closingBalanceSettlements,
    closingBalanceLoanGiven,
    closingBalanceLoanReceived,
    itemsBreakdown,
  };
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
  const [fxRatesByDate, setFxRatesByDate] = useState<Record<string, FxRateOut[]>>({});

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
        (i.type_code === COUNTERPARTY_SETTLEMENTS_TYPE ||
          i.type_code === LOAN_TO_THIRD_PARTY_TYPE ||
          i.type_code === PRIVATE_LOAN_TYPE)
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

  const reportDateKeys = useMemo(() => {
    if (!reportData) return [];
    const keys = new Set<string>();
    keys.add(rangeStartKey);
    keys.add(rangeEndResolved);
    reportData.rows.forEach((r) => {
      if (r.type === "transaction" && r.dateKey) keys.add(r.dateKey);
    });
    return Array.from(keys);
  }, [reportData, rangeStartKey, rangeEndResolved]);

  useEffect(() => {
    if (reportDateKeys.length === 0) return;
    let cancelled = false;
    fetchFxRatesBatch(reportDateKeys)
      .then((rates) => {
        if (!cancelled) setFxRatesByDate(rates ?? {});
      })
      .catch(() => {
        if (!cancelled) setFxRatesByDate({});
      });
    return () => {
      cancelled = true;
    };
  }, [reportDateKeys.join(",")]);

  const getRateForDate = useCallback(
    (dateKey: string, currencyCode: string): number | null => {
      const rates = fxRatesByDate[dateKey];
      if (!rates) return null;
      const r = rates.find((x) => x.char_code === currencyCode);
      return r?.rate ?? null;
    },
    [fxRatesByDate]
  );

  const hasReport = reportData != null;
  const hasNoDebtItems = selectedId != null && debtItemsForSelected.length === 0 && !loading;

  return (
    <main className="min-h-screen px-4 sm:px-8 py-8">
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm text-muted-foreground">
                            На {formatDateLabel(rangeStartKey)}
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
                            {balanceStatusLabel(reportData.openingBalance)}
                          </span>
                        </div>
                        <span
                          className="text-base font-medium inline-flex items-center gap-1.5"
                          style={{
                            color:
                              reportData.openingBalance > 0
                                ? GREEN
                                : reportData.openingBalance < 0
                                  ? RED
                                  : undefined,
                          }}
                        >
                          <CurrencyChip code="RUB" className="shrink-0" />
                          {formatSignedAmount(reportData.openingBalance)}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                        <div className="flex justify-between items-center">
                          <span>{SOURCE_LABELS.settlements}</span>
                          <span
                            className="inline-flex items-center gap-1.5"
                            style={{
                              color:
                                reportData.openingBalanceSettlements > 0
                                  ? GREEN
                                  : reportData.openingBalanceSettlements < 0
                                    ? RED
                                    : undefined,
                            }}
                          >
                            <CurrencyChip code="RUB" className="shrink-0" />
                            {formatSignedAmount(reportData.openingBalanceSettlements)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span>{SOURCE_LABELS.loan_given}</span>
                          <span
                            className="inline-flex items-center gap-1.5"
                            style={{
                              color:
                                reportData.openingBalanceLoanGiven > 0
                                  ? GREEN
                                  : reportData.openingBalanceLoanGiven < 0
                                    ? RED
                                    : undefined,
                            }}
                          >
                            <CurrencyChip code="RUB" className="shrink-0" />
                            {formatSignedAmount(reportData.openingBalanceLoanGiven)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span>{SOURCE_LABELS.loan_received}</span>
                          <span
                            className="inline-flex items-center gap-1.5"
                            style={{
                              color:
                                reportData.openingBalanceLoanReceived > 0
                                  ? GREEN
                                  : reportData.openingBalanceLoanReceived < 0
                                    ? RED
                                    : undefined,
                            }}
                          >
                            <CurrencyChip code="RUB" className="shrink-0" />
                            {formatSignedAmount(reportData.openingBalanceLoanReceived)}
                          </span>
                        </div>
                        {reportData.itemsBreakdown.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-border/50 flex flex-col gap-0.5">
                            <span className="text-xs font-medium text-muted-foreground">По элементам (входящее сальдо)</span>
                            {reportData.itemsBreakdown.map((row) => (
                              <div key={row.itemId} className="flex justify-between items-center text-xs">
                                <span className="truncate" title={row.name}>
                                  {row.name} ({row.currencyCode})
                                </span>
                                <span
                                  className="inline-flex items-center gap-1.5"
                                  style={{
                                    color:
                                      row.openingBalance > 0
                                        ? GREEN
                                        : row.openingBalance < 0
                                          ? RED
                                          : undefined,
                                  }}
                                >
                                  <CurrencyChip code={row.currencyCode || "RUB"} className="shrink-0" />
                                  {formatSignedAmount(row.openingBalance)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div
                    className="relative rounded-lg overflow-hidden border-0 outline-none"
                    style={{ backgroundColor: MODAL_BG }}
                  >
                    <div className="px-0 pt-6 pb-6">
                      <div className="overflow-x-auto">
                        <Table className="min-w-full table-fixed">
                          <TableHeader>
                            <TableRow className="border-border/70">
                              <TableHead className="pl-8 w-24">Дата</TableHead>
                              <TableHead className="w-40 text-center">Источник</TableHead>
                              <TableHead className="max-w-[140px]">Долг / элемент</TableHead>
                              <TableHead>Комментарий</TableHead>
                              <TableHead className="text-right">Сумма в валюте</TableHead>
                              <TableHead className="pr-8 text-right">Сумма (RUB)</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {reportData.rows
                              .filter((row): row is ReportRow & { type: "transaction" } => row.type === "transaction")
                              .map((row, index) => {
                                const isPos = row.amountCents > 0;
                                const isNeg = row.amountCents < 0;
                                return (
                                  <TableRow
                                    key={`tx-${index}`}
                                    className="border-b border-border/70"
                                  >
                                    <TableCell className="pl-8 w-24 min-w-0 whitespace-nowrap">
                                      {formatDateLabel(row.dateKey)}
                                    </TableCell>
                                    <TableCell className="w-40 min-w-0 text-center text-muted-foreground whitespace-normal break-words">
                                      {SOURCE_LABELS[row.sourceType]}
                                    </TableCell>
                                    <TableCell className="min-w-0 max-w-[140px] text-muted-foreground text-sm">
                                      {row.itemName != null
                                        ? `${row.itemName}${row.itemCurrency ? ` (${row.itemCurrency})` : ""}`
                                        : "—"}
                                    </TableCell>
                                    <TableCell className="text-muted-foreground">
                                      {row.comment}
                                    </TableCell>
                                    <TableCell className="text-right whitespace-nowrap">
                                      {row.itemCurrency &&
                                      row.itemCurrency !== "RUB" ? (
                                        (() => {
                                          const rate = getRateForDate(
                                            row.dateKey,
                                            row.itemCurrency
                                          );
                                          return rate != null ? (
                                            <span
                                              className="inline-flex items-center gap-1.5"
                                              style={{
                                                color:
                                                  isPos
                                                    ? GREEN
                                                    : isNeg
                                                      ? RED
                                                      : undefined,
                                              }}
                                            >
                                              <CurrencyChip
                                                code={row.itemCurrency}
                                                className="shrink-0"
                                              />
                                              {formatSignedAmountInCurrency(
                                                row.amountCents,
                                                rate
                                              )}
                                            </span>
                                          ) : (
                                            "—"
                                          );
                                        })()
                                      ) : (
                                        "—"
                                      )}
                                    </TableCell>
                                    <TableCell
                                      className="pr-8 text-right whitespace-nowrap"
                                      style={{
                                        color:
                                          isPos ? GREEN : isNeg ? RED : undefined,
                                      }}
                                    >
                                      <span className="inline-flex items-center gap-1.5">
                                        <CurrencyChip code="RUB" className="shrink-0" />
                                        {formatSignedAmount(row.amountCents)}
                                      </span>
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  </div>

                  <div
                    className="relative rounded-lg overflow-hidden border-0 outline-none"
                    style={{ backgroundColor: MODAL_BG }}
                  >
                    <div className="px-0 py-4">
                      <div className="overflow-x-auto">
                        <Table className="min-w-full table-fixed">
                          <TableBody>
                            {reportData.rows
                              .filter((row): row is ReportRow & { type: "received_from" } => row.type === "received_from")
                              .map((row) => (
                                <TableRow
                                  key="received_from"
                                  className="border-b border-border/70 font-medium"
                                >
                                  <TableCell
                                    colSpan={5}
                                    className="pl-8 text-base font-medium"
                                    style={{ color: RED }}
                                  >
                                    Вы получили
                                  </TableCell>
                                  <TableCell
                                    className="pr-8 text-right text-base font-medium"
                                    style={{
                                      color: row.amountCents > 0 ? RED : undefined,
                                    }}
                                  >
                                    <span className="inline-flex items-center gap-1.5">
                                      <CurrencyChip code="RUB" className="shrink-0" />
                                      {row.amountCents > 0
                                        ? formatSignedAmount(-row.amountCents)
                                        : "0.00"}
                                    </span>
                                  </TableCell>
                                </TableRow>
                              ))}
                            {reportData.rows
                              .filter((row): row is ReportRow & { type: "paid_to" } => row.type === "paid_to")
                              .map((row) => (
                                <TableRow
                                  key="paid_to"
                                  className="border-b border-border/70 font-medium"
                                >
                                  <TableCell
                                    colSpan={5}
                                    className="pl-8 text-base font-medium"
                                    style={{ color: GREEN }}
                                  >
                                    Вы заплатили
                                  </TableCell>
                                  <TableCell
                                    className="pr-8 text-right text-base font-medium"
                                    style={{
                                      color:
                                        row.amountCents > 0 ? GREEN : undefined,
                                    }}
                                  >
                                    <span className="inline-flex items-center gap-1.5">
                                      <CurrencyChip code="RUB" className="shrink-0" />
                                      {row.amountCents > 0
                                        ? formatSignedAmount(row.amountCents)
                                        : "0.00"}
                                    </span>
                                  </TableCell>
                                </TableRow>
                              ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  </div>

                  <div
                    className="relative rounded-lg overflow-hidden border-0 outline-none px-6 py-4"
                    style={{ backgroundColor: MODAL_BG }}
                  >
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm text-muted-foreground">
                            На {formatDateLabel(rangeEndResolved)}
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
                            {balanceStatusLabel(reportData.closingBalance)}
                          </span>
                        </div>
                        <span
                          className="text-base font-semibold inline-flex items-center gap-1.5"
                          style={{
                            color:
                              reportData.closingBalance > 0
                                ? GREEN
                                : reportData.closingBalance < 0
                                  ? RED
                                  : undefined,
                          }}
                        >
                          <CurrencyChip code="RUB" className="shrink-0" />
                          {formatSignedAmount(reportData.closingBalance)}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                        <div className="flex justify-between items-center">
                          <span>{SOURCE_LABELS.settlements}</span>
                          <span
                            className="inline-flex items-center gap-1.5"
                            style={{
                              color:
                                reportData.closingBalanceSettlements > 0
                                  ? GREEN
                                  : reportData.closingBalanceSettlements < 0
                                    ? RED
                                    : undefined,
                            }}
                          >
                            <CurrencyChip code="RUB" className="shrink-0" />
                            {formatSignedAmount(reportData.closingBalanceSettlements)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span>{SOURCE_LABELS.loan_given}</span>
                          <span
                            className="inline-flex items-center gap-1.5"
                            style={{
                              color:
                                reportData.closingBalanceLoanGiven > 0
                                  ? GREEN
                                  : reportData.closingBalanceLoanGiven < 0
                                    ? RED
                                    : undefined,
                            }}
                          >
                            <CurrencyChip code="RUB" className="shrink-0" />
                            {formatSignedAmount(reportData.closingBalanceLoanGiven)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span>{SOURCE_LABELS.loan_received}</span>
                          <span
                            className="inline-flex items-center gap-1.5"
                            style={{
                              color:
                                reportData.closingBalanceLoanReceived > 0
                                  ? GREEN
                                  : reportData.closingBalanceLoanReceived < 0
                                    ? RED
                                    : undefined,
                            }}
                          >
                            <CurrencyChip code="RUB" className="shrink-0" />
                            {formatSignedAmount(reportData.closingBalanceLoanReceived)}
                          </span>
                        </div>
                        {reportData.itemsBreakdown.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-border/50 flex flex-col gap-0.5">
                            <span className="text-xs font-medium text-muted-foreground">По элементам (исходящее сальдо)</span>
                            {reportData.itemsBreakdown.map((row) => (
                              <div key={row.itemId} className="flex justify-between items-center text-xs">
                                <span className="truncate" title={row.name}>
                                  {row.name} ({row.currencyCode})
                                </span>
                                <span
                                  className="inline-flex items-center gap-1.5"
                                  style={{
                                    color:
                                      row.closingBalance > 0
                                        ? GREEN
                                        : row.closingBalance < 0
                                          ? RED
                                          : undefined,
                                  }}
                                >
                                  <CurrencyChip code={row.currencyCode || "RUB"} className="shrink-0" />
                                  {formatSignedAmount(row.closingBalance)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
        )}
      </div>
    </main>
  );
}
