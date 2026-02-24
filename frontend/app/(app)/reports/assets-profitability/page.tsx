"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";

import {
  API_BASE,
  ItemOut,
  TransactionOut,
  ItemCostHistoryOut,
  FxRateOut,
  fetchItems,
  fetchTransactions,
  fetchItemCostHistory,
  fetchFxRatesBatch,
} from "@/lib/api";
import { useAccountingStart } from "@/components/accounting-start-context";
import { ItemSelector } from "@/components/item-selector";
import { AuthInput } from "@/components/ui/auth-input";
import { Label } from "@/components/ui/label";
import { ACTIVE_TEXT_DARK, MODAL_BG, PLACEHOLDER_COLOR_DARK, GREEN, RED } from "@/lib/colors";
import { getItemTypeLabel } from "@/lib/item-types";
import {
  formatAmount,
  getItemPrimaryValueCents,
  getEffectiveItemKind,
  buildItemTransactionCounts,
} from "@/lib/item-utils";

type ReportMetrics = {
  hasData: boolean;
  singleItemName: string | null;
  primaryValueEndRub: number | null;
  avgDailyRub: number | null;
  incomeFromAsset: number;
  incomeFromSale: number;
  expenseForAsset: number;
  expenseAcquisition: number;
  investmentInAsset: number;
  netProfit: number;
  yieldAnnual: number | null;
  revaluationProfitRub: number | null;
  fxProfitRub: number | null;
};

function toDateKey(value: string | Date): string {
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return value.slice(0, 10);
}

function parseDateKey(dateKey: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function daysBetween(start: Date, end: Date): number {
  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.max(0, Math.round((endUtc - startUtc) / (24 * 60 * 60 * 1000)));
}

function buildDateRange(startKey: string, endKey: string): string[] {
  const start = parseDateKey(startKey);
  const end = parseDateKey(endKey);
  const [from, to] = start <= end ? [start, end] : [end, start];
  const result: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    result.push(toDateKey(d));
  }
  return result;
}

function formatRub(valueInCents: number | null): string {
  if (valueInCents == null) return "—";
  return formatAmount(valueInCents);
}

function formatPercent(value: number | null): string {
  if (value == null) return "—";
  const v = value * 100;
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
}

function getRateForDate(
  fxRatesByDate: Record<string, FxRateOut[]>,
  dateKey: string,
  currencyCode: string
): number | null {
  const code = currencyCode.toUpperCase();
  const direct = fxRatesByDate[dateKey];
  if (direct) {
    const rate = direct.find((r) => r.char_code === code)?.rate;
    if (rate && rate > 0) return rate;
  }
  const keys = Object.keys(fxRatesByDate).sort();
  for (let i = keys.length - 1; i >= 0; i -= 1) {
    const k = keys[i]!;
    if (k <= dateKey) {
      const rate = fxRatesByDate[k]?.find((r) => r.char_code === code)?.rate;
      if (rate && rate > 0) return rate;
    }
  }
  return null;
}

export default function AssetsProfitabilityPage() {
  const { data: session } = useSession();
  const { accountingStartDate } = useAccountingStart();

  const [items, setItems] = useState<ItemOut[]>([]);
  const [transactions, setTransactions] = useState<TransactionOut[]>([]);
  const [selectedItemIds, setSelectedItemIds] = useState<number[]>([]);
  const [rawRangeStart, setRawRangeStart] = useState("");
  const [rawRangeEnd, setRawRangeEnd] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingCostHistory, setLoadingCostHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [costHistoryByItemId, setCostHistoryByItemId] = useState<Record<number, ItemCostHistoryOut>>({});
  const [fxRatesByDate, setFxRatesByDate] = useState<Record<string, FxRateOut[]>>({});

  useEffect(() => {
    if (!session) return;
    let active = true;
    setLoading(true);
    setError(null);
    Promise.all([
      fetchItems({ includeClosed: true, includeArchived: true }),
      fetchTransactions(),
    ])
      .then(([itemsData, txData]) => {
        if (!active) return;
        setItems(itemsData);
        setTransactions(txData);
      })
      .catch((e: unknown) => {
        if (!active) return;
        setError(e instanceof Error ? e.message : "Не удалось загрузить данные.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [session]);

  const itemsById = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items]
  );

  const activeAssetItems = useMemo(
    () =>
      items.filter(
        (item) =>
          item.kind === "ASSET" && !item.archived_at && !item.closed_at
      ),
    [items]
  );

  const selectedItemId = selectedItemIds[0] ?? null;
  const selectedItem =
    selectedItemId != null ? itemsById.get(selectedItemId) ?? null : null;

  const effectiveItems: ItemOut[] = useMemo(() => {
    if (selectedItem && selectedItem.kind === "ASSET") {
      return [selectedItem];
    }
    return activeAssetItems.filter(
      (item) => !(item.type_code === "bank_card" && item.card_account_id)
    );
  }, [selectedItem, activeAssetItems]);

  const todayKey = toDateKey(new Date());

  const autoRangeStartKey = useMemo(() => {
    if (effectiveItems.length === 0) return "";
    let minOpen: string | null = null;
    effectiveItems.forEach((item) => {
      if (!item.open_date) return;
      if (!minOpen || item.open_date < minOpen) minOpen = item.open_date;
    });
    let start = minOpen ?? todayKey;
    if (accountingStartDate) {
      const accKey = toDateKey(accountingStartDate);
      if (accKey > start) start = accKey;
    }
    return start;
  }, [effectiveItems, accountingStartDate, todayKey]);

  const rangeStartKey = useMemo(() => {
    if (effectiveItems.length === 0) return "";
    let start = rawRangeStart || autoRangeStartKey;
    if (autoRangeStartKey && start < autoRangeStartKey) start = autoRangeStartKey;
    return start;
  }, [rawRangeStart, autoRangeStartKey, effectiveItems.length]);

  const rangeEndKey = useMemo(() => {
    if (!rangeStartKey || effectiveItems.length === 0) return "";
    let end = rawRangeEnd || todayKey;
    if (end < rangeStartKey) end = rangeStartKey;
    return end;
  }, [rawRangeEnd, rangeStartKey, todayKey, effectiveItems.length]);

  const dateKeys = useMemo(() => {
    if (!rangeStartKey || !rangeEndKey || effectiveItems.length === 0) return [];
    return buildDateRange(rangeStartKey, rangeEndKey);
  }, [rangeStartKey, rangeEndKey, effectiveItems.length]);

  useEffect(() => {
    if (!rangeStartKey || !rangeEndKey || effectiveItems.length === 0) {
      setCostHistoryByItemId({});
      return;
    }
    let cancelled = false;
    setLoadingCostHistory(true);
    const itemIds = effectiveItems.map((item) => item.id);
    Promise.allSettled(
      itemIds.map((id) => {
        const item = itemsById.get(id);
        const itemOpen = item?.open_date ?? rangeStartKey;
        const dateFrom = itemOpen > rangeStartKey ? itemOpen : rangeStartKey;
        return fetchItemCostHistory(id, {
          date_from: dateFrom,
          date_to: rangeEndKey,
        });
      })
    )
      .then((results) => {
        if (cancelled) return;
        setCostHistoryByItemId((prev) => {
          const next: Record<number, ItemCostHistoryOut> = { ...prev };
          itemIds.forEach((id, i) => {
            const r = results[i];
            if (r?.status === "fulfilled") next[id] = r.value;
            else next[id] = { points: [] };
          });
          return next;
        });
      })
      .catch(() => {
        if (!cancelled) setCostHistoryByItemId({});
      })
      .finally(() => {
        if (!cancelled) setLoadingCostHistory(false);
      });
    return () => {
      cancelled = true;
    };
  }, [rangeStartKey, rangeEndKey, effectiveItems, itemsById]);

  useEffect(() => {
    const nonRubItems = effectiveItems.filter(
      (item) => item.currency_code && item.currency_code.toUpperCase() !== "RUB"
    );
    if (!rangeStartKey || !rangeEndKey || nonRubItems.length === 0) {
      setFxRatesByDate({});
      return;
    }
    const currencyItemIds = new Set(nonRubItems.map((item) => item.id));
    const dates = new Set<string>();
    dates.add(rangeStartKey);
    dates.add(rangeEndKey);
    transactions.forEach((tx) => {
      const relatedId = tx.related_item_id ?? null;
      if (!relatedId || !currencyItemIds.has(relatedId)) return;
      const d = toDateKey(tx.transaction_date);
      if (d >= rangeStartKey && d <= rangeEndKey) dates.add(d);
    });
    const dateList = Array.from(dates).sort();
    if (dateList.length === 0) {
      setFxRatesByDate({});
      return;
    }
    let cancelled = false;
    fetchFxRatesBatch(dateList)
      .then((rates) => {
        if (cancelled) return;
        setFxRatesByDate(rates ?? {});
      })
      .catch(() => {
        if (!cancelled) setFxRatesByDate({});
      });
    return () => {
      cancelled = true;
    };
  }, [effectiveItems, rangeStartKey, rangeEndKey, transactions]);

  const metrics: ReportMetrics | null = useMemo(() => {
    if (!rangeStartKey || !rangeEndKey || effectiveItems.length === 0) {
      return null;
    }
    if (!dateKeys.length) return null;

    const itemStartKeyById = new Map<number, string>();
    effectiveItems.forEach((item) => {
      let start = rangeStartKey;
      if (item.open_date && item.open_date > start) start = item.open_date;
      itemStartKeyById.set(item.id, start);
    });

    const valueByDate = new Map<number, Map<string, number>>();
    effectiveItems.forEach((item) => {
      const history = costHistoryByItemId[item.id];
      const map = new Map<string, number>();
      if (history?.points?.length) {
        const kind = item.primary_value_kind ?? "BALANCE";
        history.points.forEach((p) => {
          let v: number | null = null;
          if (kind === "MARKET") v = p.market_rub ?? null;
          else if (kind === "ACQUISITION") v = p.acquisition_rub;
          else if (kind === "INVESTED") v = p.invested_rub;
          else v = p.balance_rub;
          map.set(p.date, v ?? 0);
        });
      }
      valueByDate.set(item.id, map);
    });

    const dayValues: number[] = [];
    dateKeys.forEach((dateKey) => {
      let total = 0;
      effectiveItems.forEach((item) => {
        const startKeyForItem = itemStartKeyById.get(item.id) ?? rangeStartKey;
        if (dateKey < startKeyForItem) return;
        const map = valueByDate.get(item.id);
        const v = map?.get(dateKey);
        if (v != null) total += v;
      });
      dayValues.push(total);
    });

    if (dayValues.length === 0) return null;
    const daysCount = daysBetween(parseDateKey(rangeStartKey), parseDateKey(rangeEndKey)) + 1;
    const sumValues = dayValues.reduce((acc, v) => acc + v, 0);
    const avgDaily = daysCount > 0 ? sumValues / daysCount : 0;

    const itemIds = new Set(effectiveItems.map((item) => item.id));
    const relevantTxs = transactions.filter((tx) => {
      const relatedId = tx.related_item_id ?? null;
      if (!relatedId || !itemIds.has(relatedId)) return false;
      const key = toDateKey(tx.transaction_date);
      if (!key || key < rangeStartKey || key > rangeEndKey) return false;
      const isRealized =
        tx.transaction_type === "ACTUAL" || tx.status === "REALIZED";
      if (!isRealized) return false;
      return Boolean(tx.asset_link_type);
    });

    const perItemCashflowsRub = new Map<
      number,
      {
        income_from_asset: number;
        income_from_sale: number;
        expense_for_asset: number;
        expense_acquisition: number;
        investment_in_asset: number;
      }
    >();

    let incomeFromAsset = 0;
    let incomeFromSale = 0;
    let expenseForAsset = 0;
    let expenseAcquisition = 0;
    let investmentInAsset = 0;

    relevantTxs.forEach((tx) => {
      const relatedId = tx.related_item_id!;
      const bucket =
        perItemCashflowsRub.get(relatedId) ??
        {
          income_from_asset: 0,
          income_from_sale: 0,
          expense_for_asset: 0,
          expense_acquisition: 0,
          investment_in_asset: 0,
        };
      const amt = tx.amount_rub ?? 0;
      switch (tx.asset_link_type) {
        case "ASSET_INCOME":
          bucket.income_from_asset += amt;
          incomeFromAsset += amt;
          break;
        case "ASSET_SALE":
          bucket.income_from_sale += amt;
          incomeFromSale += amt;
          break;
        case "ASSET_EXPENSE":
          bucket.expense_for_asset += amt;
          expenseForAsset += amt;
          break;
        case "ASSET_PURCHASE":
          bucket.expense_acquisition += amt;
          expenseAcquisition += amt;
          break;
        case "ASSET_INVESTMENT":
          bucket.investment_in_asset += amt;
          investmentInAsset += amt;
          break;
        default:
          break;
      }
      perItemCashflowsRub.set(relatedId, bucket);
    });

    const netProfit =
      incomeFromAsset +
      incomeFromSale -
      expenseForAsset -
      expenseAcquisition -
      investmentInAsset;

    let yieldAnnual: number | null = null;
    if (avgDaily > 0 && daysCount > 0) {
      yieldAnnual = (netProfit / avgDaily) * (365 / daysCount);
    }

    const startTotal = dayValues[0] ?? 0;
    const endTotal = dayValues[dayValues.length - 1] ?? 0;

    let revaluationSum = 0;
    let fxSum = 0;
    let hasMissingFx = false;

    effectiveItems.forEach((item) => {
      const startKeyForItem = itemStartKeyById.get(item.id) ?? rangeStartKey;
      const startValueRub =
        startKeyForItem > rangeStartKey
          ? 0
          : valueByDate.get(item.id)?.get(rangeStartKey) ?? 0;
      const endValueRub =
        valueByDate.get(item.id)?.get(rangeEndKey) ??
        (rangeEndKey < startKeyForItem ? 0 : 0);

      const cash = perItemCashflowsRub.get(item.id);
      const netCashRub = cash
        ? cash.income_from_asset +
          cash.income_from_sale -
          cash.expense_for_asset -
          cash.expense_acquisition -
          cash.investment_in_asset
        : 0;

      const totalChangeMinusFlows = endValueRub - startValueRub - netCashRub;

      if (!item.currency_code || item.currency_code.toUpperCase() === "RUB") {
        revaluationSum += totalChangeMinusFlows;
        return;
      }

      const currency = item.currency_code.toUpperCase();
      const rateStart = getRateForDate(fxRatesByDate, rangeStartKey, currency);
      const rateEnd = getRateForDate(fxRatesByDate, rangeEndKey, currency);
      if (!rateStart || !rateEnd) {
        hasMissingFx = true;
        return;
      }

      const relatedTxs = relevantTxs.filter(
        (tx) => tx.related_item_id === item.id
      );
      let netCashCur = 0;
      relatedTxs.forEach((tx) => {
        const dKey = toDateKey(tx.transaction_date);
        const rate = getRateForDate(fxRatesByDate, dKey, currency) ?? rateStart;
        if (!rate || rate <= 0) return;
        const amt = tx.amount_rub ?? 0;
        const sign =
          tx.asset_link_type === "ASSET_INCOME" ||
          tx.asset_link_type === "ASSET_SALE"
            ? 1
            : -1;
        netCashCur += (sign * amt) / rate;
      });

      const valueStartCur = startValueRub / rateStart;
      const valueEndCur = endValueRub / rateEnd;
      const deltaCur = valueEndCur - valueStartCur - netCashCur;
      const revaluationRub = deltaCur * rateStart;
      const fxRub = totalChangeMinusFlows - revaluationRub;

      if (Number.isFinite(revaluationRub)) revaluationSum += revaluationRub;
      else hasMissingFx = true;
      if (Number.isFinite(fxRub)) fxSum += fxRub;
      else hasMissingFx = true;
    });

    const revaluationProfitRub = hasMissingFx ? null : revaluationSum;
    const fxProfitRub = hasMissingFx ? null : fxSum;

    const singleItemName =
      effectiveItems.length === 1 ? effectiveItems[0]?.name ?? null : null;
    const primaryValueEndRub =
      effectiveItems.length === 1
        ? valueByDate.get(effectiveItems[0].id)?.get(rangeEndKey) ?? null
        : null;

    return {
      hasData: true,
      singleItemName,
      primaryValueEndRub,
      avgDailyRub: avgDaily,
      incomeFromAsset,
      incomeFromSale,
      expenseForAsset,
      expenseAcquisition,
      investmentInAsset,
      netProfit,
      yieldAnnual,
      revaluationProfitRub,
      fxProfitRub,
    };
  }, [
    rangeStartKey,
    rangeEndKey,
    effectiveItems,
    dateKeys,
    costHistoryByItemId,
    transactions,
    fxRatesByDate,
  ]);

  const itemTxCounts = useMemo(
    () => buildItemTransactionCounts(transactions),
    [transactions]
  );

  const selectorItems = useMemo(
    () => items.filter((item) => item.kind === "ASSET"),
    [items]
  );

  const formatSignedRub = (valueInCents: number): string => {
    if (valueInCents === 0) return formatRub(0);
    const sign = valueInCents > 0 ? "+" : "−";
    return `${sign} ${formatRub(Math.abs(valueInCents))}`;
  };

  const canShowReport =
    !loading &&
    !loadingCostHistory &&
    !error &&
    effectiveItems.length > 0 &&
    rangeStartKey &&
    rangeEndKey &&
    metrics;

  return (
    <main className="min-h-screen px-4 sm:px-8 py-8">
      <div className="mx-auto flex w-full max-w-[900px] flex-col gap-6">
        <div className="flex flex-col gap-4">
          <div className="space-y-1.5 w-full">
            <Label>Актив / обязательство</Label>
            <ItemSelector
              items={selectorItems}
              selectedIds={selectedItemIds}
              onChange={setSelectedItemIds}
              selectionMode="single"
              placeholder="Начните вводить название"
              emptyMessage="Нет активов"
              noResultsMessage="Ничего не найдено"
              clearLabel="Сбросить"
              getItemTypeLabel={getItemTypeLabel}
              getItemKind={(item) =>
                getEffectiveItemKind(item, getItemPrimaryValueCents(item))
              }
              apiBase={API_BASE}
              getItemBalance={getItemPrimaryValueCents}
              itemCounts={itemTxCounts}
              showChips={false}
              ariaLabel="Актив"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="assets-profitability-date-from">Дата от</Label>
              <div className="[&_div.relative.flex.items-center]:h-10 [&_input]:text-sm [&_input]:font-normal min-w-0">
                <AuthInput
                  id="assets-profitability-date-from"
                  type="date"
                  value={rangeStartKey}
                  onChange={(e) => {
                    const next = e.target.value;
                    setRawRangeStart(next);
                    if (rawRangeEnd && next && rawRangeEnd < next) {
                      setRawRangeEnd(next);
                    }
                  }}
                  style={{
                    color: !rangeStartKey ? PLACEHOLDER_COLOR_DARK : ACTIVE_TEXT_DARK,
                  }}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="assets-profitability-date-to">Дата до</Label>
              <div className="[&_div.relative.flex.items-center]:h-10 [&_input]:text-sm [&_input]:font-normal min-w-0">
                <AuthInput
                  id="assets-profitability-date-to"
                  type="date"
                  min={rangeStartKey || undefined}
                  value={rangeEndKey}
                  onChange={(e) => setRawRangeEnd(e.target.value || rangeStartKey)}
                  style={{
                    color: !rangeEndKey ? PLACEHOLDER_COLOR_DARK : ACTIVE_TEXT_DARK,
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        <div
          className="relative rounded-lg overflow-hidden border-0 outline-none"
          style={{ backgroundColor: MODAL_BG }}
        >
          <div
            className="px-6 pt-6 pb-6 transition-opacity duration-300"
            style={{ opacity: loading || loadingCostHistory ? 0.6 : 1 }}
          >
            {error && (
              <div className="flex min-h-[200px] items-center justify-center text-sm text-red-600">
                {error}
              </div>
            )}

            {!error && !canShowReport && !loading && !loadingCostHistory && (
              <div className="flex min-h-[200px] items-center justify-center text-sm text-muted-foreground">
                {effectiveItems.length === 0
                  ? "Нет активов для построения отчёта."
                  : "Недостаточно данных для построения отчёта за указанный период."}
              </div>
            )}

            {canShowReport && metrics && (
              <div className="flex flex-col gap-4">
                {metrics.singleItemName && metrics.primaryValueEndRub != null && (
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm text-muted-foreground">
                        Основная стоимость на {rangeEndKey.split("-").reverse().join(".")}
                      </span>
                      <span className="text-base font-medium">
                        {metrics.singleItemName}
                      </span>
                    </div>
                    <span className="text-base font-medium">
                      {formatRub(metrics.primaryValueEndRub)}
                    </span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">
                      Среднедневная стоимость за период
                    </span>
                    <span className="font-medium">
                      {formatRub(
                        metrics.avgDailyRub != null
                          ? Math.round(metrics.avgDailyRub)
                          : null
                      )}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">
                      Чистая прибыль
                    </span>
                    <span
                      className="font-medium"
                      style={{
                        color:
                          metrics.netProfit > 0
                            ? GREEN
                            : metrics.netProfit < 0
                              ? RED
                              : undefined,
                      }}
                    >
                      {formatSignedRub(metrics.netProfit)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">
                      Доходы от актива
                    </span>
                    <span className="font-medium">
                      {formatRub(metrics.incomeFromAsset)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">
                      Доходы от продажи актива
                    </span>
                    <span className="font-medium">
                      {formatRub(metrics.incomeFromSale)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">
                      Расходы по активу
                    </span>
                    <span className="font-medium">
                      {formatRub(metrics.expenseForAsset)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">
                      Расходы по приобретению актива
                    </span>
                    <span className="font-medium">
                      {formatRub(metrics.expenseAcquisition)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">
                      Вложения в актив
                    </span>
                    <span className="font-medium">
                      {formatRub(metrics.investmentInAsset)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">
                      Доходность (годовая)
                    </span>
                    <span
                      className="font-medium"
                      style={{
                        color:
                          metrics.yieldAnnual != null && metrics.yieldAnnual > 0
                            ? GREEN
                            : metrics.yieldAnnual != null && metrics.yieldAnnual < 0
                              ? RED
                              : undefined,
                      }}
                    >
                      {formatPercent(metrics.yieldAnnual)}%
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">
                      Прибыль от изменения стоимости актива
                    </span>
                    <span
                      className="font-medium"
                      style={{
                        color:
                          metrics.revaluationProfitRub != null &&
                          metrics.revaluationProfitRub > 0
                            ? GREEN
                            : metrics.revaluationProfitRub != null &&
                                metrics.revaluationProfitRub < 0
                              ? RED
                              : undefined,
                      }}
                    >
                      {metrics.revaluationProfitRub != null
                        ? formatSignedRub(metrics.revaluationProfitRub)
                        : "—"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">
                      Прибыль от изменения курса валюты
                    </span>
                    <span
                      className="font-medium"
                      style={{
                        color:
                          metrics.fxProfitRub != null && metrics.fxProfitRub > 0
                            ? GREEN
                            : metrics.fxProfitRub != null && metrics.fxProfitRub < 0
                              ? RED
                              : undefined,
                      }}
                    >
                      {metrics.fxProfitRub != null
                        ? formatSignedRub(metrics.fxProfitRub)
                        : "—"}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

