"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/form-field";
import {
  fetchItem,
  fetchItems,
  fetchItemCosts,
  fetchItemMarketValues,
  fetchItemCostHistory,
  fetchTransactions,
  fetchTransactionsPage,
  fetchCounterparties,
  fetchFxRatesBatch,
  API_BASE,
  ItemOut,
  ItemCostsOut,
  ItemMarketValueOut,
  ItemCostHistoryOut,
  CounterpartyOut,
  PrimaryValueKind,
  TransactionOut,
  FxRateOut,
} from "@/lib/api";
import { getItemTypeLabel } from "@/lib/item-types";
import { formatAmount, getItemPhotoUrl, getItemPrimaryValueCents, getEffectiveItemKind } from "@/lib/item-utils";
import { PRIMARY_VALUE_KIND_OPTIONS, getPrimaryValueLabel } from "@/lib/asset-item-form-constants";
import { ACCENT, ACTIVE_TEXT_DARK, GREEN, RED, PLACEHOLDER_COLOR_DARK, BACKGROUND_DT, MODAL_BG } from "@/lib/colors";
import { TYPE_ICON_BY_CODE } from "@/lib/asset-icons";
import { CurrencyChip } from "@/components/currency-chip";
import { BuySellAssetModal } from "@/components/buy-sell-asset-modal";
import { EditMarketValueModal } from "@/components/edit-market-value-modal";
import {
  toTxDateKey,
  getTxDeltaForItem,
  getRateForDate,
  isMoexItem,
  isCryptoItem,
  formatRub,
} from "@/lib/asset-dynamics-utils";

type ChartPoint = { x: number; y: number; value: number };

function buildLinePath(points: ChartPoint[]) {
  if (points.length === 0) return "";
  const path = [`M ${points[0].x} ${points[0].y}`];
  for (let i = 1; i < points.length; i += 1) path.push(`L ${points[i].x} ${points[i].y}`);
  return path.join(" ");
}

function buildAreaPath(points: ChartPoint[], baselineY: number) {
  const line = buildLinePath(points);
  if (!line) return "";
  return `${line} L ${points[points.length - 1].x} ${baselineY} L ${points[0].x} ${baselineY} Z`;
}

function niceStep(range: number, targetTicks: number) {
  const rough = range / targetTicks;
  const power = Math.pow(10, Math.floor(Math.log10(rough)));
  const fraction = rough / power;
  let niceFraction = 1;
  if (fraction <= 1) niceFraction = 1;
  else if (fraction <= 2) niceFraction = 2;
  else if (fraction <= 5) niceFraction = 5;
  else niceFraction = 10;
  return niceFraction * power;
}

function buildTicks(minValue: number, maxValue: number) {
  const safeRange = Math.max(maxValue - minValue, 1);
  const step = niceStep(safeRange, 5);
  const minTick = Math.floor(minValue / step) * step;
  const maxTick = Math.ceil(maxValue / step) * step;
  const ticks: number[] = [];
  for (let value = minTick; value <= maxTick + step / 2; value += step) ticks.push(value);
  return ticks;
}

function formatChartDate(date: Date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear()).slice(-2);
  return `${day}.${month}.${year}`;
}

/** Блок: чип валюты слева, сумма справа (значение в копейках/центах валюты актива). */
function AmountWithCurrency({
  valueCents,
  currencyCode,
  className = "",
}: {
  valueCents: number;
  currencyCode: string | null | undefined;
  className?: string;
}) {
  const code = currencyCode ?? "RUB";
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <CurrencyChip code={code} className="shrink-0" />
      <span className="tabular-nums">{formatAmount(valueCents)}</span>
    </div>
  );
}

export default function AssetDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id != null ? Number(params.id) : NaN;
  const [item, setItem] = useState<ItemOut | null>(null);
  const [costs, setCosts] = useState<ItemCostsOut | null>(null);
  const [marketValues, setMarketValues] = useState<ItemMarketValueOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingPrimary, setSavingPrimary] = useState(false);
  const [costHistoryOpen, setCostHistoryOpen] = useState<"balance" | "acquisition" | "invested" | "market" | null>(null);
  const [buySellModalOpen, setBuySellModalOpen] = useState(false);
  const [editMarketValueModalOpen, setEditMarketValueModalOpen] = useState(false);
  const [allItems, setAllItems] = useState<ItemOut[]>([]);
  const [counterparties, setCounterparties] = useState<CounterpartyOut[]>([]);
  const [quantityHistoryTx, setQuantityHistoryTx] = useState<TransactionOut[]>([]);
  const [loadingQuantityHistory, setLoadingQuantityHistory] = useState(false);
  const [quantityHistoryError, setQuantityHistoryError] = useState<string | null>(null);
  const [costHistoryData, setCostHistoryData] = useState<ItemCostHistoryOut | null>(null);
  const [loadingCostHistory, setLoadingCostHistory] = useState(false);
  const [dynamicsTxs, setDynamicsTxs] = useState<TransactionOut[]>([]);
  const [fxRatesByDate, setFxRatesByDate] = useState<Record<string, FxRateOut[]>>({});
  const [loadingDynamics, setLoadingDynamics] = useState(false);
  const costChartContainerRef = useRef<HTMLDivElement | null>(null);
  const costChartSvgRef = useRef<SVGSVGElement | null>(null);
  const costChartTooltipRef = useRef<HTMLDivElement | null>(null);
  const [costChartSize, setCostChartSize] = useState({ width: 720, height: 280 });
  const [costChartHoverIndex, setCostChartHoverIndex] = useState<number | null>(null);
  const [costChartTooltipLeft, setCostChartTooltipLeft] = useState<number | null>(null);
  const [costChartContainerReady, setCostChartContainerReady] = useState(false);

  const load = useCallback(async () => {
    if (!Number.isFinite(id)) return;
    setLoading(true);
    setError(null);
    setQuantityHistoryError(null);
    try {
      const [itemRes, costsRes, marketRes] = await Promise.all([
        fetchItem(id),
        fetchItemCosts(id),
        fetchItemMarketValues(id),
      ]);
      setItem(itemRes);
      setCosts(costsRes);
      setMarketValues(marketRes);
      if (itemRes.instrument_id) {
        setLoadingQuantityHistory(true);
        try {
          const [pageRelated, pageByItems] = await Promise.all([
            fetchTransactionsPage({ related_item_ids: [itemRes.id], limit: 200 }),
            fetchTransactionsPage({ item_ids: [itemRes.id], limit: 200 }),
          ]);
          const byId = new Map<number, TransactionOut>();
          [...pageRelated.items, ...pageByItems.items].forEach((tx) => byId.set(tx.id, tx));
          const list = Array.from(byId.values()).filter(
            (tx) =>
              (tx.asset_link_type === "ASSET_PURCHASE" || tx.asset_link_type === "ASSET_SALE" || tx.direction === "TRANSFER") &&
              ((tx.related_item_id === itemRes.id && (tx.primary_quantity_lots != null || tx.primary_quantity_units != null)) ||
                (tx.counterparty_item_id === itemRes.id && (tx.counterparty_quantity_lots != null || tx.counterparty_quantity_units != null)) ||
                (tx.primary_item_id === itemRes.id && (tx.primary_quantity_lots != null || tx.primary_quantity_units != null)))
          );
          setQuantityHistoryTx(list);
        } catch (e: unknown) {
          setQuantityHistoryTx([]);
          setQuantityHistoryError((e as Error)?.message ?? "Не удалось загрузить историю операций");
        } finally {
          setLoadingQuantityHistory(false);
        }
      } else {
        setQuantityHistoryTx([]);
      }
    } catch (e: any) {
      setError(e?.message ?? "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const loadItemsAndCounterparties = useCallback(async () => {
    try {
      const [itemsRes, cpRes] = await Promise.all([
        fetchItems(),
        fetchCounterparties(),
      ]);
      setAllItems(itemsRes);
      setCounterparties(cpRes);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (buySellModalOpen && item?.instrument_id) {
      loadItemsAndCounterparties();
    }
  }, [buySellModalOpen, item?.instrument_id, loadItemsAndCounterparties]);

  useEffect(() => {
    if (!item?.id || !item?.open_date) {
      setCostHistoryData(null);
      return;
    }
    let cancelled = false;
    setLoadingCostHistory(true);
    const dateFrom = item.open_date ?? undefined;
    const dateTo = new Date().toISOString().slice(0, 10);
    fetchItemCostHistory(item.id, { date_from: dateFrom, date_to: dateTo })
      .then((data) => {
        if (!cancelled) setCostHistoryData(data);
      })
      .catch(() => {
        if (!cancelled) setCostHistoryData(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingCostHistory(false);
      });
    return () => {
      cancelled = true;
    };
  }, [item?.id, item?.open_date]);

  useEffect(() => {
    if (!item?.id) {
      setDynamicsTxs([]);
      setFxRatesByDate({});
      return;
    }
    let cancelled = false;
    setLoadingDynamics(true);
    const dateEnd = new Date().toISOString().slice(0, 10);
    const dateStart = item.open_date ?? dateEnd;
    fetchTransactions()
      .then((txs) => {
        if (cancelled) return;
        setDynamicsTxs(txs);
        const dateSet = new Set<string>([dateStart, dateEnd]);
        txs.forEach((tx) => {
          const d = toTxDateKey(tx.transaction_date);
          if (d && d > dateStart && d <= dateEnd) dateSet.add(d);
        });
        const dates = Array.from(dateSet).sort();
        if (dates.length === 0) return Promise.resolve(undefined);
        return fetchFxRatesBatch(dates).then((rates) => {
          if (!cancelled) setFxRatesByDate(rates ?? {});
        });
      })
      .catch(() => {
        if (!cancelled) {
          setDynamicsTxs([]);
          setFxRatesByDate({});
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingDynamics(false);
      });
    return () => {
      cancelled = true;
    };
  }, [item?.id, item?.open_date]);

  const todayKey = new Date().toISOString().slice(0, 10);
  const sortedFxRateDateKeys = useMemo(() => Object.keys(fxRatesByDate).sort(), [fxRatesByDate]);
  const latestRatesByCurrency = useMemo(() => {
    const map = new Map<string, { dateKey: string; rate: number }>();
    Object.entries(fxRatesByDate).forEach(([dateKey, rates]) => {
      rates.forEach((r) => {
        if (r.rate > 0 && (!map.has(r.char_code) || dateKey > map.get(r.char_code)!.dateKey)) {
          map.set(r.char_code, { dateKey, rate: r.rate });
        }
      });
    });
    return map;
  }, [fxRatesByDate]);

  const dynamics = useMemo(() => {
    if (!item || !costs) return null;
    const dateStart = item.open_date ?? todayKey;
    const dateEnd = todayKey;
    const currencyCode = (item.currency_code ?? "RUB").toUpperCase();
    const points = costHistoryData?.points ?? [];
    const startPoint = points.find((p) => p.date === dateStart) ?? points.filter((p) => p.date <= dateStart).pop() ?? null;
    const endPoint = points.find((p) => p.date === dateEnd) ?? points.filter((p) => p.date <= dateEnd).pop() ?? null;

    const getRate = (dateKey: string): number | null => {
      const r = getRateForDate(fxRatesByDate, dateKey, currencyCode, latestRatesByCurrency, todayKey, sortedFxRateDateKeys);
      if (r != null) return r;
      if (currencyCode !== "RUB") return latestRatesByCurrency.get(currencyCode)?.rate ?? null;
      return null;
    };

    let initialRubCents: number | null;
    let initialCurCents: number;
    let finalRubCents: number | null;
    let finalCurCents: number;
    let qtyStart: number | null = null;
    let qtyEnd: number | null = null;

    const isMarketOrCrypto = isMoexItem(item) || isCryptoItem(item);

    const primaryValueKind = item.primary_value_kind ?? "BALANCE";
    const isBalanceMode = primaryValueKind !== "MARKET";
    const isMarketMode = primaryValueKind === "MARKET";

    // Для балансовой (и приобретение, вложенные) — balance_rub; для рыночной — market для рыночных/крипты, иначе market_rub ?? balance_rub
    const valueFromPoint = (p: { market_rub: number | null; balance_rub: number }) =>
      isBalanceMode ? (p.balance_rub ?? 0) : (isMarketOrCrypto ? (p.market_rub ?? p.balance_rub ?? 0) : (p.market_rub ?? p.balance_rub ?? 0));

    if (startPoint) {
      const valCur = valueFromPoint(startPoint);
      initialCurCents = valCur;
      const rate = currencyCode !== "RUB" ? getRate(dateStart) : null;
      initialRubCents =
        currencyCode === "RUB"
          ? valCur
          : rate != null
            ? Math.round((valCur / 100) * rate * 100)
            : null;
      const pt = startPoint as { market_quantity_units?: number | null };
      if (isMarketOrCrypto && pt.market_quantity_units != null) qtyStart = pt.market_quantity_units;
    } else {
      initialRubCents = 0;
      initialCurCents = 0;
    }

    if (endPoint) {
      const valCur = valueFromPoint(endPoint);
      finalCurCents = valCur;
      const rate = currencyCode !== "RUB" ? getRate(dateEnd) : null;
      finalRubCents =
        currencyCode === "RUB"
          ? valCur
          : rate != null
            ? Math.round((valCur / 100) * rate * 100)
            : null;
      const pt = endPoint as { market_quantity_units?: number | null };
      if (isMarketOrCrypto && pt.market_quantity_units != null) qtyEnd = pt.market_quantity_units;
      else if (isMarketOrCrypto) {
        // Если в точке на конечную дату нет количества — берём текущее из актива
        if (item.type_code === "crypto" && item.quantity_units != null) qtyEnd = item.quantity_units;
        else if (item.position_lots != null) qtyEnd = item.position_lots;
      }
    } else {
      if (isMarketOrCrypto) {
        finalCurCents = costs.market_rub ?? 0;
        const rate = currencyCode !== "RUB" ? getRate(dateEnd) : null;
        finalRubCents =
          costs.market_value_rub ??
          (currencyCode !== "RUB" && rate != null
            ? Math.round((finalCurCents / 100) * rate * 100)
            : (costs.market_rub ?? 0));
        if (item.type_code === "crypto" && item.quantity_units != null) qtyEnd = item.quantity_units;
        else if (item.position_lots != null) qtyEnd = item.position_lots;
      } else {
        finalCurCents = costs.balance_rub ?? 0;
        const rate = currencyCode !== "RUB" ? getRate(dateEnd) : null;
        finalRubCents =
          currencyCode === "RUB"
            ? finalCurCents
            : rate != null
              ? Math.round((finalCurCents / 100) * rate * 100)
              : null;
      }
    }
    const txsInRange = (() => {
      const included = dynamicsTxs.filter((tx) => {
        const d = toTxDateKey(tx.transaction_date);
        if (d <= dateStart || d > dateEnd) return false;
        const delta = getTxDeltaForItem(tx, item.id, item.kind, item.currency_code);
        if (delta !== null) return true;
        if (isMarketOrCrypto && tx.related_item_id === item.id) return true;
        return false;
      });
      return included
        .map((tx) => {
          const res = getTxDeltaForItem(tx, item.id, item.kind, item.currency_code);
          if (res !== null) return { tx, deltaCents: res.deltaCents, inCurrency: res.inCurrency };
          if (isMarketOrCrypto && tx.related_item_id === item.id) {
            // Для крипты и MOEX в валюте: сумма покупки/продажи в API в валюте актива (центы)
            const inCurrency = currencyCode !== "RUB";
            return { tx, deltaCents: tx.amount_rub ?? 0, inCurrency };
          }
          return { tx, deltaCents: 0, inCurrency: false };
        })
        .sort((a, b) => toTxDateKey(a.tx.transaction_date).localeCompare(toTxDateKey(b.tx.transaction_date)));
    })();

    let netFlowRub = 0;
    let totalIncomeRub = 0;
    let totalExpenseRub = 0;
    let totalIncomeCur = 0;
    let totalExpenseCur = 0;
    let totalTransferRub = 0;
    let totalTransferCur = 0;
    txsInRange.forEach(({ tx, deltaCents, inCurrency }) => {
      const d = toTxDateKey(tx.transaction_date);
      const rate = currencyCode !== "RUB" ? getRate(d) : null;
      let curUnits: number | null = null;
      let rubCents: number;
      if (currencyCode === "RUB") {
        rubCents = deltaCents;
      } else {
        // Для валютного актива: суммы транзакций — в валюте; рублёвая строка = сумма (сумма в валюте × курс на дату транзакции).
        if (inCurrency) {
          curUnits = deltaCents / 100;
          rubCents = rate != null ? Math.round(curUnits * rate * 100) : 0;
        } else {
          // amount_rub в API в рублях — переводим в валюту для строки с валютой, затем в рубли по курсу на дату
          curUnits = rate != null ? (deltaCents / 100) / rate : null;
          rubCents = curUnits != null && rate != null ? Math.round(curUnits * rate * 100) : 0;
        }
      }
      if (tx.direction === "TRANSFER") {
        totalTransferRub += rubCents;
        if (curUnits != null) totalTransferCur += curUnits;
        return;
      }
      if (tx.direction === "INCOME") {
        totalIncomeRub += rubCents;
        if (curUnits != null) totalIncomeCur += curUnits;
        return;
      }
      if (tx.direction === "EXPENSE") {
        totalExpenseRub += Math.abs(rubCents);
        if (curUnits != null) totalExpenseCur += Math.abs(curUnits);
      }
    });

    // Считаем netFlow из тех же слагаемых, что показываем в плашках, чтобы выполнялось равенство: На дату + Куплено + Продано + Переводы + Изменение цены = На текущую дату
    // В плашках: Куплено = totalExpense, Продано = -totalIncome, поэтому поток = totalExpense - totalIncome + transfer
    const displayFlowRub = totalExpenseRub - totalIncomeRub + totalTransferRub;
    const displayFlowCur = totalExpenseCur - totalIncomeCur + totalTransferCur;
    netFlowRub = displayFlowRub;
    const netFlowCur = displayFlowCur;

    const effectiveKind = getEffectiveItemKind(item, finalCurCents);
    const signedInitialRub = effectiveKind === "LIABILITY" ? -(initialRubCents ?? 0) : (initialRubCents ?? 0);
    const signedFinalRub = effectiveKind === "LIABILITY" ? -(finalRubCents ?? 0) : (finalRubCents ?? 0);
    const courseDiffRub = currencyCode !== "RUB" ? (signedFinalRub - signedInitialRub) - netFlowRub : 0;
    const profitLossFromPriceRub = signedFinalRub - signedInitialRub - netFlowRub;

    let totalBuyQty = 0;
    let totalSellQty = 0;
    if (isMarketOrCrypto) {
      const isCrypto = isCryptoItem(item);
      const getTxQty = (tx: TransactionOut) => {
        if (tx.related_item_id === item.id) return isCrypto ? (tx.primary_quantity_units ?? 0) : (tx.primary_quantity_lots ?? 0);
        if (tx.counterparty_item_id === item.id || tx.counterparty_card_item_id === item.id) return isCrypto ? (tx.counterparty_quantity_units ?? 0) : (tx.counterparty_quantity_lots ?? 0);
        if (tx.primary_item_id === item.id || tx.primary_card_item_id === item.id) return isCrypto ? (tx.primary_quantity_units ?? 0) : (tx.primary_quantity_lots ?? 0);
        return 0;
      };
      const getIsBuy = (tx: TransactionOut) => {
        if (tx.related_item_id === item.id) return tx.asset_link_type === "ASSET_PURCHASE";
        if (tx.counterparty_item_id === item.id || tx.counterparty_card_item_id === item.id) return true;
        return false;
      };
      txsInRange.forEach(({ tx }) => {
        const qty = getTxQty(tx);
        if (getIsBuy(tx)) totalBuyQty += qty;
        else totalSellQty += qty;
      });
      // Если количество на текущую дату так и не задано — считаем по равенству: На дату + Куплено − Продано
      if (qtyEnd == null && qtyStart != null) {
        qtyEnd = qtyStart + totalBuyQty - totalSellQty;
      }
    }

    const rowGrowthPercent =
      initialRubCents != null && initialRubCents !== 0
        ? (effectiveKind === "LIABILITY"
          ? (Math.abs(signedFinalRub) - Math.abs(signedInitialRub)) / Math.abs(signedInitialRub) * 100
          : (signedFinalRub - signedInitialRub) / Math.abs(signedInitialRub) * 100)
        : null;

    const rateEnd = currencyCode !== "RUB" ? getRate(dateEnd) : null;
    const profitLossFromPriceCur =
      currencyCode !== "RUB"
        ? (finalCurCents - initialCurCents) / 100 - netFlowCur
        : null;

    return {
      dateStart,
      dateEnd,
      initialRubCents,
      initialCurCents,
      finalRubCents,
      finalCurCents,
      qtyStart,
      qtyEnd,
      netFlowRub,
      courseDiffRub,
      profitLossFromPriceRub,
      profitLossFromPriceCur,
      totalIncomeRub,
      totalExpenseRub,
      totalIncomeCur,
      totalExpenseCur,
      totalTransferRub,
      totalTransferCur,
      totalBuyQty,
      totalSellQty,
      rowGrowthPercent,
      effectiveKind,
      currencyCode,
      isMarketOrCrypto,
      isBalanceMode,
      isMarketMode,
    };
  }, [item, costs, costHistoryData, dynamicsTxs, fxRatesByDate, latestRatesByCurrency, sortedFxRateDateKeys, todayKey]);

  const counterpartiesById = useMemo(() => {
    const map = new Map<number, CounterpartyOut>();
    counterparties.forEach((c) => map.set(c.id, c));
    return map;
  }, [counterparties]);

  const getRateForDateKey = useCallback(
    (dateKey: string): number | null => {
      const currencyCode = (item?.currency_code ?? "RUB").toUpperCase();
      if (currencyCode === "RUB") return 1;
      return getRateForDate(
        fxRatesByDate,
        dateKey,
        currencyCode,
        latestRatesByCurrency,
        todayKey,
        sortedFxRateDateKeys
      );
    },
    [item?.currency_code, fxRatesByDate, latestRatesByCurrency, todayKey, sortedFxRateDateKeys]
  );

  const getCounterpartyForItemId = useCallback(
    (itemId: number) => {
      const it = allItems.find((i) => i.id === itemId);
      if (!it?.counterparty_id) return null;
      return counterpartiesById.get(it.counterparty_id) ?? null;
    },
    [allItems, counterpartiesById]
  );

  const itemCounterpartyLogoUrl = useCallback(
    (id: number | null | undefined) => {
      if (!id) return null;
      const it = allItems.find((i) => i.id === id);
      if (!it?.counterparty_id) return null;
      const cp = counterpartiesById.get(it.counterparty_id);
      if (!cp) return null;
      return cp.entity_type === "PERSON" ? cp.photo_url ?? null : cp.logo_url ?? null;
    },
    [allItems, counterpartiesById]
  );

  const itemCounterpartyName = useCallback(
    (id: number | null | undefined) => {
      if (!id) return "";
      const it = allItems.find((i) => i.id === id);
      if (!it?.counterparty_id) return "";
      const cp = counterpartiesById.get(it.counterparty_id);
      if (!cp) return "";
      if (cp.entity_type === "PERSON") {
        const parts = [cp.last_name, cp.first_name, cp.middle_name].filter(Boolean);
        return parts.join(" ") || "";
      }
      return cp.name || cp.full_name || "";
    },
    [allItems, counterpartiesById]
  );

  const quantityHistoryRows = useMemo(() => {
    const openDate = item?.open_date ?? "";
    const fromOpen = openDate
      ? quantityHistoryTx.filter((tx) => (tx.transaction_date || "").slice(0, 10) >= openDate)
      : quantityHistoryTx;
    const sorted = [...fromOpen].sort((a, b) => {
      const dateA = a.transaction_date || "";
      const dateB = b.transaction_date || "";
      const d = dateA.localeCompare(dateB);
      if (d !== 0) return d;
      return (a.id ?? 0) - (b.id ?? 0);
    });
    const isCrypto = item?.type_code === "crypto";
    const itemId = item?.id;
    const getTxQty = (tx: TransactionOut) => {
      if (itemId == null) return 0;
      if (tx.related_item_id === itemId) {
        return isCrypto ? (tx.primary_quantity_units ?? 0) : (tx.primary_quantity_lots ?? 0);
      }
      if (tx.counterparty_item_id === itemId) {
        return isCrypto ? (tx.counterparty_quantity_units ?? 0) : (tx.counterparty_quantity_lots ?? 0);
      }
      if (tx.primary_item_id === itemId) {
        return isCrypto ? (tx.primary_quantity_units ?? 0) : (tx.primary_quantity_lots ?? 0);
      }
      return 0;
    };
    const getIsBuy = (tx: TransactionOut) => {
      if (itemId == null) return false;
      if (tx.related_item_id === itemId) return tx.asset_link_type === "ASSET_PURCHASE";
      if (tx.counterparty_item_id === itemId) return true;
      return false;
    };
    let totalBuy = 0;
    let totalSell = 0;
    sorted.forEach((tx) => {
      const qty = getTxQty(tx);
      if (getIsBuy(tx)) totalBuy += qty;
      else totalSell += qty;
    });
    const current = isCrypto ? (item?.quantity_units ?? 0) : (item?.position_lots ?? 0);
    const startQty = current - totalBuy + totalSell;
    let balance = startQty;
    return sorted.map((tx) => {
      const qty = getTxQty(tx);
      const isBuy = getIsBuy(tx);
      const delta = isBuy ? qty : -qty;
      balance += delta;
      const costCents = tx.amount_rub ?? 0;
      const priceCents = qty > 0 ? Math.round(costCents / qty) : null;
      return { tx, type: isBuy ? "Покупка" as const : "Продажа" as const, delta, balanceAfter: balance, priceCents, costCents };
    });
  }, [quantityHistoryTx, item?.id, item?.open_date, item?.position_lots, item?.quantity_units, item?.type_code]);

  const quantitySummary = useMemo(() => {
    const openDate = item?.open_date ?? "";
    const fromOpen = openDate
      ? quantityHistoryTx.filter((tx) => (tx.transaction_date || "").slice(0, 10) >= openDate)
      : quantityHistoryTx;
    const isCrypto = item?.type_code === "crypto";
    const itemId = item?.id;
    const getTxQty = (tx: TransactionOut) => {
      if (itemId == null) return 0;
      if (tx.related_item_id === itemId) {
        return isCrypto ? (tx.primary_quantity_units ?? 0) : (tx.primary_quantity_lots ?? 0);
      }
      if (tx.counterparty_item_id === itemId) {
        return isCrypto ? (tx.counterparty_quantity_units ?? 0) : (tx.counterparty_quantity_lots ?? 0);
      }
      if (tx.primary_item_id === itemId) {
        return isCrypto ? (tx.primary_quantity_units ?? 0) : (tx.primary_quantity_lots ?? 0);
      }
      return 0;
    };
    const getIsBuy = (tx: TransactionOut) => {
      if (itemId == null) return false;
      if (tx.related_item_id === itemId) return tx.asset_link_type === "ASSET_PURCHASE";
      if (tx.counterparty_item_id === itemId) return true;
      return false;
    };
    let totalBuy = 0;
    let totalSell = 0;
    fromOpen.forEach((tx) => {
      const qty = getTxQty(tx);
      if (getIsBuy(tx)) totalBuy += qty;
      else totalSell += qty;
    });
    const current = isCrypto ? (item?.quantity_units ?? 0) : (item?.position_lots ?? 0);
    const startQty = current - totalBuy + totalSell;
    return { startQty, totalBuy, totalSell, current };
  }, [quantityHistoryTx, item?.id, item?.open_date, item?.position_lots, item?.quantity_units, item?.type_code]);

  const costChartSeries = useMemo(() => {
    if (!costHistoryOpen || !costHistoryData?.points.length) return [];
    const key = costHistoryOpen === "balance" ? "balance_rub" : costHistoryOpen === "acquisition" ? "acquisition_rub" : costHistoryOpen === "invested" ? "invested_rub" : "market_rub";
    const raw = costHistoryData.points.map((p) => {
      const valueRub = ((p as Record<string, number | null>)[key] ?? 0) / 100;
      const hasValue = (p as Record<string, number | null>)[key] != null;
      const base = { date: p.date, valueRub, hasValue };
      if (key === "market_rub" && "market_quantity_units" in p && "market_price_rub" in p) {
        return {
          ...base,
          marketQuantityUnits: p.market_quantity_units ?? undefined,
          marketPriceRub: p.market_price_rub ?? undefined,
        };
      }
      return base;
    });
    if (key === "market_rub") return raw.filter((p) => p.hasValue);
    return raw;
  }, [costHistoryOpen, costHistoryData]);

  useEffect(() => {
    if (!costHistoryOpen || costChartSeries.length === 0) setCostChartContainerReady(false);
  }, [costHistoryOpen, costChartSeries.length]);

  useEffect(() => {
    if (!costChartContainerReady || !costChartContainerRef.current) return;
    const element = costChartContainerRef.current;
    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      const nextWidth = Math.max(1, Math.round(rect.width));
      const nextHeight = Math.max(1, Math.round(rect.height));
      setCostChartSize((prev) => {
        if (prev.width === nextWidth && prev.height === nextHeight) return prev;
        return { width: nextWidth, height: nextHeight };
      });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, [costChartContainerReady]);

  const costChartPadding = useMemo(() => ({ top: 24, right: 0, bottom: 44, left: 56 }), []);
  const costChartGeometry = useMemo(() => {
    if (costChartSeries.length === 0) return null;
    const width = costChartSize.width;
    const height = costChartSize.height;
    const padding = costChartPadding;
    const innerWidth = width - padding.left - padding.right;
    const innerHeight = height - padding.top - padding.bottom;
    const values = costChartSeries.map((p) => p.valueRub);
    const minVal = values.length ? Math.min(...values) : 0;
    const maxVal = values.length ? Math.max(...values) : 0;
    const rangePadding = Math.max(Math.max(maxVal, Math.abs(minVal)) * 0.12, 1);
    const paddedMin = minVal - rangePadding;
    const paddedMax = maxVal + rangePadding;
    const ticks = buildTicks(paddedMin, paddedMax);
    const chartMin = ticks[0] ?? 0;
    const chartMax = ticks[ticks.length - 1] ?? 1;
    const valueToRatio = (v: number) => (v - chartMin) / (chartMax - chartMin || 1);
    const zeroRatio = Math.max(0, Math.min(1, valueToRatio(0)));
    const baselineY = padding.top + innerHeight - innerHeight * zeroRatio;
    const points: ChartPoint[] = costChartSeries.map((p, i) => {
      const progress = costChartSeries.length <= 1 ? 0 : i / (costChartSeries.length - 1);
      const x = padding.left + innerWidth * progress;
      const y = padding.top + innerHeight - innerHeight * valueToRatio(p.valueRub);
      return { x, y, value: p.valueRub };
    });
    const dayMarks: { label: string; x: number }[] = [];
    const step = Math.max(1, Math.ceil(costChartSeries.length / 7));
    for (let i = 0; i < costChartSeries.length; i += step) {
      const p = costChartSeries[i];
      if (!p) continue;
      const progress = costChartSeries.length <= 1 ? 0 : i / (costChartSeries.length - 1);
      dayMarks.push({ label: formatChartDate(new Date(p.date)), x: padding.left + innerWidth * progress });
    }
    if (costChartSeries.length > 0 && dayMarks.length > 0) {
      const lastX = padding.left + innerWidth;
      if (Math.abs((dayMarks[dayMarks.length - 1]?.x ?? 0) - lastX) > 2) {
        const last = costChartSeries[costChartSeries.length - 1]!;
        dayMarks.push({ label: formatChartDate(new Date(last.date)), x: lastX });
      }
    }
    return {
      width,
      height,
      padding,
      innerWidth,
      innerHeight,
      points,
      linePath: buildLinePath(points),
      areaPath: buildAreaPath(points, baselineY),
      baselineY,
      ticks,
      dayMarks,
      valueToRatio,
      chartMin,
      chartMax,
    };
  }, [costChartSeries, costChartSize, costChartPadding]);

  const costChartHoverPoint = useMemo(() => {
    if (costChartHoverIndex == null || !costChartGeometry || costChartSeries.length === 0) return null;
    const progress = costChartSeries.length <= 1 ? 0 : costChartHoverIndex / (costChartSeries.length - 1);
    const x = costChartGeometry.padding.left + costChartGeometry.innerWidth * progress;
    const value = costChartSeries[costChartHoverIndex]!.valueRub;
    const y =
      costChartGeometry.padding.top +
      costChartGeometry.innerHeight -
      costChartGeometry.innerHeight * costChartGeometry.valueToRatio(value);
    return { x, y, value };
  }, [costChartHoverIndex, costChartSeries, costChartGeometry]);

  useEffect(() => {
    if (!costChartHoverPoint || !costChartContainerRef.current || !costChartTooltipRef.current) {
      setCostChartTooltipLeft(null);
      return;
    }
    const containerWidth = costChartContainerRef.current.clientWidth;
    const tooltipWidth = costChartTooltipRef.current.offsetWidth;
    const paddingEdge = 12;
    const scaleX = containerWidth / costChartSize.width;
    const xPixel = costChartHoverPoint.x * scaleX;
    const clamped = Math.min(
      Math.max(xPixel, tooltipWidth / 2 + paddingEdge),
      containerWidth - tooltipWidth / 2 - paddingEdge
    );
    setCostChartTooltipLeft(clamped);
  }, [costChartHoverPoint?.x, costChartHoverIndex, costChartSize.width]);

  const handleCostChartPointerMove = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      if (!costChartSvgRef.current || costChartSeries.length === 0) return;
      if (costChartSeries.length === 1) {
        setCostChartHoverIndex(0);
        return;
      }
      const ctm = costChartSvgRef.current.getScreenCTM();
      if (!ctm) return;
      let svgX = 0;
      if (typeof DOMPoint !== "undefined") {
        const point = new DOMPoint(event.clientX, event.clientY);
        svgX = point.matrixTransform(ctm.inverse()).x;
      } else {
        const point = costChartSvgRef.current.createSVGPoint();
        point.x = event.clientX;
        point.y = event.clientY;
        svgX = point.matrixTransform(ctm.inverse()).x;
      }
      const padding = costChartPadding;
      const innerWidth = costChartSize.width - padding.left - padding.right;
      const clampedX = Math.min(Math.max(svgX, padding.left), costChartSize.width - padding.right);
      const progress = (clampedX - padding.left) / innerWidth;
      const index = Math.round(progress * (costChartSeries.length - 1));
      setCostChartHoverIndex(Math.min(Math.max(index, 0), costChartSeries.length - 1));
    },
    [costChartSeries.length, costChartSize, costChartPadding]
  );

  const buildItemCreatePayload = useCallback(
    (overrides: { primary_value_kind?: PrimaryValueKind }) => {
      if (!item) return null;
      const payload: Parameters<typeof updateItem>[1] = {
        kind: item.kind,
        type_code: item.type_code,
        name: item.name,
        currency_code: item.currency_code ?? "RUB",
        open_date: item.open_date,
        initial_value_rub: item.initial_value_rub,
        counterparty_id: item.counterparty_id ?? null,
        opening_counterparty_item_id: item.opening_counterparty_item_id ?? null,
        account_last7: item.account_last7 ?? null,
        contract_number: item.contract_number ?? null,
        card_last4: item.card_last4 ?? null,
        card_account_id: item.card_account_id ?? null,
        card_kind: item.card_kind ?? null,
        credit_limit: item.credit_limit ?? null,
        deposit_term_days: item.deposit_term_days ?? null,
        interest_rate: item.interest_rate ?? null,
        interest_payout_order: item.interest_payout_order ?? null,
        interest_capitalization: item.interest_capitalization ?? null,
        interest_payout_account_id: item.interest_payout_account_id ?? null,
        instrument_id: item.instrument_id ?? null,
        instrument_board_id: item.instrument_board_id ?? null,
        position_lots: item.position_lots ?? null,
        synonyms: item.synonyms ?? [],
        plan_settings: item.plan_settings ?? null,
        primary_value_kind: overrides.primary_value_kind ?? item.primary_value_kind ?? null,
      };
      return payload;
    },
    [item]
  );

  const handlePrimaryValueKindChange = async (value: PrimaryValueKind) => {
    if (!item) return;
    const payload = buildItemCreatePayload({ primary_value_kind: value });
    if (!payload) return;
    setSavingPrimary(true);
    try {
      const updated = await updateItem(item.id, payload);
      setItem(updated);
    } catch (e: any) {
      setError(e?.message ?? "Не удалось сохранить");
    } finally {
      setSavingPrimary(false);
    }
  };

  if (loading && !item) {
    return (
      <main className="min-h-screen px-8 py-8">
        <div className="mx-auto w-full max-w-6xl" style={{ color: PLACEHOLDER_COLOR_DARK }}>Загрузка...</div>
      </main>
    );
  }

  if (error && !item) {
    return (
      <main className="min-h-screen px-8 py-8">
        <div className="mx-auto w-full max-w-6xl">
          <p className="text-red-600">{error}</p>
          <Button variant="outline" className="mt-4" asChild>
            <Link href="/assets">К активам</Link>
          </Button>
        </div>
      </main>
    );
  }

  if (!item) {
    return (
      <main className="min-h-screen px-8 py-8">
        <div className="mx-auto w-full max-w-6xl">
          <p style={{ color: PLACEHOLDER_COLOR_DARK }}>Актив не найден.</p>
          <Button variant="outline" className="mt-4" asChild>
            <Link href="/assets">К активам</Link>
          </Button>
        </div>
      </main>
    );
  }

  const TypeIcon = TYPE_ICON_BY_CODE[item.type_code];
  const photoUrl = getItemPhotoUrl(item, API_BASE);

  return (
    <main className="min-h-screen px-8 py-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="flex flex-wrap items-center gap-2 -ml-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/assets" className="flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              К активам и обязательствам
            </Link>
          </Button>
          {item.instrument_id && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBuySellModalOpen(true)}
              className="flex items-center gap-2"
            >
              <TrendingUp className="h-4 w-4" />
              Купить/продать актив
            </Button>
          )}
          {!item.instrument_id && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditMarketValueModalOpen(true)}
              className="flex items-center gap-2"
            >
              Изменить рыночную стоимость
            </Button>
          )}
        </div>

        <div className="relative rounded-lg overflow-hidden border-0 outline-none" style={{ backgroundColor: MODAL_BG }}>
          <div className="p-6">
            <div className="flex flex-row items-start gap-4">
              <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0" style={{ backgroundColor: BACKGROUND_DT }}>
                {photoUrl ? (
                  <img src={photoUrl} alt="" className="w-full h-full object-cover" />
                ) : TypeIcon ? (
                  <div className="w-full h-full flex items-center justify-center" style={{ color: ACCENT }}>
                    <TypeIcon className="w-8 h-8" strokeWidth={1.5} />
                  </div>
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-semibold" style={{ color: ACTIVE_TEXT_DARK }}>{item.name}</h2>
                <p className="text-sm mt-1" style={{ color: PLACEHOLDER_COLOR_DARK }}>{getItemTypeLabel(item)}</p>
                {item.currency_code && (
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <CurrencyChip code={item.currency_code} />
                  </div>
                )}
              </div>
            </div>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm mt-4">
              {item.open_date && (
                <>
                  <dt style={{ color: PLACEHOLDER_COLOR_DARK }}>Дата появления</dt>
                  <dd style={{ color: ACTIVE_TEXT_DARK }}>{item.open_date}</dd>
                </>
              )}
              {item.contract_number && (
                <>
                  <dt style={{ color: PLACEHOLDER_COLOR_DARK }}>Номер договора</dt>
                  <dd style={{ color: ACTIVE_TEXT_DARK }}>{item.contract_number}</dd>
                </>
              )}
              {item.account_last7 && (
                <>
                  <dt style={{ color: PLACEHOLDER_COLOR_DARK }}>Последние 4 цифры счёта</dt>
                  <dd style={{ color: ACTIVE_TEXT_DARK }}>****{item.account_last7}</dd>
                </>
              )}
              {item.deposit_term_days != null && (
                <>
                  <dt style={{ color: PLACEHOLDER_COLOR_DARK }}>Срок вклада, дней</dt>
                  <dd style={{ color: ACTIVE_TEXT_DARK }}>{item.deposit_term_days}</dd>
                </>
              )}
              {item.interest_rate != null && (
                <>
                  <dt style={{ color: PLACEHOLDER_COLOR_DARK }}>Процентная ставка</dt>
                  <dd style={{ color: ACTIVE_TEXT_DARK }}>{item.interest_rate}%</dd>
                </>
              )}
              {item.type_code === "crypto" && item.quantity_units != null && (
                <>
                  <dt style={{ color: PLACEHOLDER_COLOR_DARK }}>Количество</dt>
                  <dd style={{ color: ACTIVE_TEXT_DARK }}>{new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 10 }).format(item.quantity_units)}</dd>
                </>
              )}
              {item.type_code !== "crypto" && item.position_lots != null && (
                <>
                  <dt style={{ color: PLACEHOLDER_COLOR_DARK }}>Количество лотов</dt>
                  <dd style={{ color: ACTIVE_TEXT_DARK }}>{new Intl.NumberFormat("ru-RU").format(item.position_lots)}</dd>
                </>
              )}
            </dl>
          </div>
        </div>

        <div className="relative rounded-lg overflow-hidden border-0 outline-none" style={{ backgroundColor: MODAL_BG }}>
          <div className="p-6">
            <h3 className="text-base font-semibold mb-4" style={{ color: ACTIVE_TEXT_DARK }}>Стоимости</h3>
            <div className="mt-2 mb-4">
              <SelectField
                label="Основная стоимость"
                value={item.primary_value_kind ?? "BALANCE"}
                onValueChange={(v) => handlePrimaryValueKindChange(v as PrimaryValueKind)}
                options={PRIMARY_VALUE_KIND_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                placeholder="Выберите"
                disabled={savingPrimary}
              />
            </div>
            {costs && (
              <div className="grid grid-cols-2 gap-4">
                <div
                  className="rounded-lg p-4 cursor-pointer transition-colors hover:opacity-90"
                  style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
                  onClick={() => setCostHistoryOpen((v) => (v === "balance" ? null : "balance"))}
                >
                  <div className="text-xs mb-1" style={{ color: PLACEHOLDER_COLOR_DARK }}>Балансовая стоимость</div>
                  <div className="text-lg font-semibold" style={{ color: ACTIVE_TEXT_DARK }}>
                    <AmountWithCurrency valueCents={costs.balance_rub} currencyCode={item.currency_code} />
                  </div>
                </div>
                <div
                  className="rounded-lg p-4 cursor-pointer transition-colors hover:opacity-90"
                  style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
                  onClick={() => setCostHistoryOpen((v) => (v === "acquisition" ? null : "acquisition"))}
                >
                  <div className="text-xs mb-1" style={{ color: PLACEHOLDER_COLOR_DARK }}>Стоимость приобретения</div>
                  <div className="text-lg font-semibold" style={{ color: ACTIVE_TEXT_DARK }}>
                    <AmountWithCurrency valueCents={costs.acquisition_rub} currencyCode={item.currency_code} />
                  </div>
                </div>
                <div
                  className="rounded-lg p-4 cursor-pointer transition-colors hover:opacity-90"
                  style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
                  onClick={() => setCostHistoryOpen((v) => (v === "invested" ? null : "invested"))}
                >
                  <div className="text-xs mb-1" style={{ color: PLACEHOLDER_COLOR_DARK }}>Стоимость вложенных средств</div>
                  <div className="text-lg font-semibold" style={{ color: ACTIVE_TEXT_DARK }}>
                    <AmountWithCurrency valueCents={costs.invested_rub} currencyCode={item.currency_code} />
                  </div>
                </div>
                <div
                  className="rounded-lg p-4 cursor-pointer transition-colors hover:opacity-90"
                  style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
                  onClick={() => setCostHistoryOpen((v) => (v === "market" ? null : "market"))}
                >
                  <div className="text-xs mb-1" style={{ color: PLACEHOLDER_COLOR_DARK }}>Рыночная стоимость</div>
                  <div className="text-lg font-semibold" style={{ color: ACTIVE_TEXT_DARK }}>
                    {costs.market_rub != null ? (
                      <AmountWithCurrency valueCents={costs.market_rub} currencyCode={item.currency_code} />
                    ) : (
                      "—"
                    )}
                  </div>
                  {item.currency_code && item.currency_code !== "RUB" && costs.market_value_rub != null && (
                    <div className="text-sm mt-1.5" style={{ color: PLACEHOLDER_COLOR_DARK }}>
                      В рублях: <AmountWithCurrency valueCents={costs.market_value_rub} currencyCode="RUB" />
                    </div>
                  )}
                </div>
              </div>
            )}

            {item.instrument_id && costs && (() => {
              const isCrypto = item.type_code === "crypto";
              const quantity = isCrypto ? (item.quantity_units ?? 0) : (item.position_lots ?? 0);
              const hasQuantity = quantity > 0;
              const acquisitionCents = costs.acquisition_rub ?? 0;
              const currentValueCents = costs.market_rub != null ? costs.market_rub : costs.balance_rub;
              const avgPriceCents = hasQuantity ? acquisitionCents / quantity : null;
              const profitLossCents = currentValueCents - acquisitionCents;
              const currencyCode = item.currency_code ?? "RUB";
              return hasQuantity ? (
                <div className="mt-6 pt-6 border-t border-white/10">
                  <h4 className="text-sm font-semibold mb-4" style={{ color: ACTIVE_TEXT_DARK }}>
                    Прибыль/убыток от стоимости актива
                  </h4>
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
                    <div>
                      <dt style={{ color: PLACEHOLDER_COLOR_DARK }}>Средняя цена приобретения ({currencyCode})</dt>
                      <dd className="mt-0.5 font-medium tabular-nums" style={{ color: ACTIVE_TEXT_DARK }}>
                        {avgPriceCents != null ? (
                          <AmountWithCurrency valueCents={Math.round(avgPriceCents)} currencyCode={currencyCode} />
                        ) : (
                          "—"
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt style={{ color: PLACEHOLDER_COLOR_DARK }}>Стоимость приобретения текущего количества ({currencyCode})</dt>
                      <dd className="mt-0.5 font-medium tabular-nums" style={{ color: ACTIVE_TEXT_DARK }}>
                        <AmountWithCurrency valueCents={acquisitionCents} currencyCode={currencyCode} />
                      </dd>
                    </div>
                    <div>
                      <dt style={{ color: PLACEHOLDER_COLOR_DARK }}>Текущая стоимость ({currencyCode})</dt>
                      <dd className="mt-0.5 font-medium tabular-nums" style={{ color: ACTIVE_TEXT_DARK }}>
                        <AmountWithCurrency valueCents={currentValueCents} currencyCode={currencyCode} />
                      </dd>
                    </div>
                    <div>
                      <dt style={{ color: PLACEHOLDER_COLOR_DARK }}>Текущее количество</dt>
                      <dd className="mt-0.5 font-medium tabular-nums" style={{ color: ACTIVE_TEXT_DARK }}>
                        {isCrypto
                          ? new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 10 }).format(quantity)
                          : new Intl.NumberFormat("ru-RU").format(quantity) + " л."}
                      </dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt style={{ color: PLACEHOLDER_COLOR_DARK }}>Прибыль/убыток ({currencyCode})</dt>
                      <dd className="mt-0.5 font-semibold tabular-nums" style={{ color: profitLossCents >= 0 ? GREEN : RED }}>
                        <AmountWithCurrency valueCents={profitLossCents} currencyCode={currencyCode} />
                      </dd>
                    </div>
                  </dl>
                </div>
              ) : null;
            })()}

            {costHistoryOpen && (
              <div className="mt-4 rounded-lg p-4" style={{ backgroundColor: BACKGROUND_DT }}>
                <div className="text-sm font-medium mb-2" style={{ color: ACTIVE_TEXT_DARK }}>
                  {costHistoryOpen === "balance" && "История балансовой стоимости"}
                  {costHistoryOpen === "acquisition" && "История стоимости приобретения"}
                  {costHistoryOpen === "invested" && "История стоимости вложенных средств"}
                  {costHistoryOpen === "market" && "История рыночной стоимости"}
                </div>
                {loadingCostHistory ? (
                  <p className="text-sm" style={{ color: PLACEHOLDER_COLOR_DARK }}>Загрузка...</p>
                ) : costChartSeries.length === 0 ? (
                  <p className="text-sm" style={{ color: PLACEHOLDER_COLOR_DARK }}>Нет данных за период.</p>
                ) : costChartGeometry ? (
                  <div
                    ref={(el) => {
                      costChartContainerRef.current = el;
                      setCostChartContainerReady(!!el);
                    }}
                    className="relative w-full min-w-0"
                    style={{ aspectRatio: `${costChartSize.width}/${costChartSize.height}` }}
                  >
                    {costChartHoverPoint != null && costChartHoverIndex != null && costChartSeries[costChartHoverIndex] && (
                      <div
                        ref={costChartTooltipRef}
                        className="pointer-events-none absolute z-20 whitespace-nowrap rounded-[9px] px-4 py-3 text-[14px] font-normal text-right"
                        style={{
                          left: costChartTooltipLeft != null ? `${costChartTooltipLeft}px` : `${costChartHoverPoint.x}px`,
                          top: 0,
                          transform: "translate(-50%, 0)",
                          backgroundColor: MODAL_BG,
                        }}
                      >
                        <div className="whitespace-nowrap" style={{ color: PLACEHOLDER_COLOR_DARK }}>
                          {formatChartDate(new Date(costChartSeries[costChartHoverIndex]!.date))}
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-3" style={{ color: ACTIVE_TEXT_DARK }}>
                          <span>
                            {costHistoryOpen === "balance" && "Балансовая стоимость"}
                            {costHistoryOpen === "acquisition" && "Стоимость приобретения"}
                            {costHistoryOpen === "invested" && "Стоимость вложенных средств"}
                            {costHistoryOpen === "market" && "Рыночная стоимость"}
                          </span>
                          <div className="flex items-center justify-end gap-2">
                            <AmountWithCurrency
                              valueCents={Math.round(costChartSeries[costChartHoverIndex]!.valueRub * 100)}
                              currencyCode={item.currency_code}
                              className="justify-end"
                            />
                          </div>
                        </div>
                        {costHistoryOpen === "market" && (() => {
                          const pt = costChartSeries[costChartHoverIndex!] as { marketQuantityUnits?: number; marketPriceRub?: number };
                          if (pt?.marketQuantityUnits != null || pt?.marketPriceRub != null) {
                            return (
                              <div className="mt-2 space-y-1 text-[13px]" style={{ color: PLACEHOLDER_COLOR_DARK }}>
                                {pt.marketQuantityUnits != null && (
                                  <div>Количество: {pt.marketQuantityUnits.toLocaleString("ru-RU")} шт.</div>
                                )}
                                {pt.marketPriceRub != null && (
                                  <div className="flex items-center gap-2">
                                    Цена на дату: <AmountWithCurrency valueCents={pt.marketPriceRub} currencyCode={item.currency_code} />
                                  </div>
                                )}
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    )}
                    <svg
                      ref={costChartSvgRef}
                      viewBox={`0 0 ${costChartGeometry.width} ${costChartGeometry.height}`}
                      className="h-full w-full cursor-pointer"
                      style={{ overflow: "visible" }}
                      onMouseMove={handleCostChartPointerMove}
                      onMouseLeave={() => setCostChartHoverIndex(null)}
                    >
                      <defs>
                        <linearGradient id="asset-detail-chart-area" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={ACCENT} stopOpacity={0.35} />
                          <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      {costChartGeometry.ticks.map((tick, idx) => (
                        <g key={idx}>
                          <line
                            x1={costChartGeometry.padding.left - 6}
                            x2={costChartGeometry.padding.left}
                            y1={costChartGeometry.padding.top + costChartGeometry.innerHeight - costChartGeometry.innerHeight * costChartGeometry.valueToRatio(tick)}
                            y2={costChartGeometry.padding.top + costChartGeometry.innerHeight - costChartGeometry.innerHeight * costChartGeometry.valueToRatio(tick)}
                            stroke={PLACEHOLDER_COLOR_DARK}
                            strokeOpacity={0.7}
                          />
                          <text
                            x={costChartGeometry.padding.left - 10}
                            y={costChartGeometry.padding.top + costChartGeometry.innerHeight - costChartGeometry.innerHeight * costChartGeometry.valueToRatio(tick)}
                            textAnchor="end"
                            dominantBaseline="middle"
                            fontSize={11}
                            fill={PLACEHOLDER_COLOR_DARK}
                          >
                            {new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(tick)}
                          </text>
                        </g>
                      ))}
                      <path d={costChartGeometry.areaPath} fill="url(#asset-detail-chart-area)" />
                      <path d={costChartGeometry.linePath} fill="none" stroke={ACCENT} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
                      <line x1={costChartGeometry.padding.left} x2={costChartGeometry.width - costChartGeometry.padding.right} y1={costChartGeometry.baselineY} y2={costChartGeometry.baselineY} stroke={PLACEHOLDER_COLOR_DARK} strokeWidth={1} strokeDasharray="4 4" strokeOpacity={0.7} />
                      {costChartHoverPoint && (
                        <>
                          <line
                            x1={costChartHoverPoint.x}
                            x2={costChartHoverPoint.x}
                            y1={costChartGeometry.padding.top}
                            y2={costChartGeometry.padding.top + costChartGeometry.innerHeight}
                            stroke={PLACEHOLDER_COLOR_DARK}
                            strokeDasharray="4 6"
                          />
                          <circle
                            cx={costChartHoverPoint.x}
                            cy={costChartHoverPoint.y}
                            r={6}
                            fill={ACCENT}
                            stroke="#fff"
                            strokeWidth={2}
                          />
                        </>
                      )}
                      {costChartGeometry.dayMarks.map((mark, idx) => (
                        <text
                          key={idx}
                          x={mark.x}
                          y={costChartGeometry.height - 12}
                          textAnchor={idx === 0 ? "start" : idx === costChartGeometry.dayMarks.length - 1 ? "end" : "middle"}
                          fontSize={14}
                          fill={ACTIVE_TEXT_DARK}
                        >
                          {mark.label}
                        </text>
                      ))}
                    </svg>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>

        {item && costs && (
          <div className="relative rounded-lg overflow-hidden border-0 outline-none" style={{ backgroundColor: MODAL_BG }}>
            <div className="p-6">
              <h3 className="text-base font-semibold mb-4" style={{ color: ACTIVE_TEXT_DARK }}>
                {loadingDynamics ? "Загрузка…" : dynamics ? `Динамика стоимости (от ${dynamics.dateStart} до ${dynamics.dateEnd})` : "Динамика стоимости"}
              </h3>
              {loadingDynamics ? (
                <p className="text-sm" style={{ color: PLACEHOLDER_COLOR_DARK }}>Загрузка данных…</p>
              ) : dynamics ? (
                <div className="flex w-full gap-4 flex-wrap">
                  {(() => {
                    const formatCur = (v: number) => new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
                    const SummaryBlock = ({
                      title,
                      qtyVal,
                      curVal,
                      rubVal,
                      amountColor,
                      showCurRow = true,
                      showQtyRow = true,
                      showEmptyQtyRow = false,
                    }: {
                      title: string;
                      qtyVal?: number | null;
                      curVal: number | null;
                      rubVal: number | null;
                      amountColor?: string;
                      showCurRow?: boolean;
                      showQtyRow?: boolean;
                      showEmptyQtyRow?: boolean;
                    }) => (
                      <div className="flex flex-1 min-w-0 flex-col gap-1.5 rounded-lg px-3 py-2" style={{ backgroundColor: "rgba(255,255,255,0.06)" }}>
                        <div className="text-xs text-center" style={{ color: PLACEHOLDER_COLOR_DARK }}>{title}</div>
                        <div className="flex flex-col gap-2">
                          {showEmptyQtyRow && (
                            <div className="rounded-md px-2 py-1 flex items-center gap-2 text-sm tabular-nums" style={{ backgroundColor: BACKGROUND_DT }} aria-hidden>
                              <span className="invisible select-none">0</span>
                            </div>
                          )}
                          {showQtyRow && qtyVal != null && (
                            <div className="rounded-md px-2 py-1 flex items-center gap-2 text-sm tabular-nums" style={{ backgroundColor: BACKGROUND_DT }}>
                              <span className="ml-auto" style={{ color: ACTIVE_TEXT_DARK }}>
                                {isCryptoItem(item) ? new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 10 }).format(qtyVal) : new Intl.NumberFormat("ru-RU").format(qtyVal) + (isMoexItem(item) ? " л." : "")}
                              </span>
                            </div>
                          )}
                          {dynamics.currencyCode !== "RUB" && (showCurRow ? (
                            <div className="rounded-md px-2 py-1 flex items-center gap-2 text-sm tabular-nums" style={{ backgroundColor: BACKGROUND_DT }}>
                              <CurrencyChip code={dynamics.currencyCode} />
                              <span className="ml-auto" style={{ color: amountColor ?? ACTIVE_TEXT_DARK }}>{curVal != null ? formatCur(curVal) : "–"}</span>
                            </div>
                          ) : (
                            <div className="rounded-md px-2 py-1 flex items-center text-sm tabular-nums" style={{ backgroundColor: BACKGROUND_DT }} aria-hidden>
                              <span className="invisible select-none">0</span>
                            </div>
                          ))}
                          <div className="rounded-md px-2 py-1 flex items-center gap-2 text-sm tabular-nums" style={{ backgroundColor: BACKGROUND_DT }}>
                            <CurrencyChip code="RUB" />
                            <span className="ml-auto" style={{ color: amountColor ?? ACTIVE_TEXT_DARK }}>{rubVal != null ? formatRub(rubVal) : "–"}</span>
                          </div>
                        </div>
                      </div>
                    );
                    const dateStartLabel = dynamics.dateStart ? new Date(dynamics.dateStart).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }) : "";
                    const dateEndLabel = dynamics.dateEnd ? new Date(dynamics.dateEnd).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }) : "";
                    const initialDisplayRub = dynamics.initialRubCents != null ? (dynamics.effectiveKind === "LIABILITY" ? Math.abs(dynamics.initialRubCents) : dynamics.initialRubCents) : null;
                    const initialDisplayCur = dynamics.effectiveKind === "LIABILITY" ? Math.abs(dynamics.initialCurCents) / 100 : dynamics.initialCurCents / 100;
                    const finalDisplayRub = dynamics.finalRubCents != null ? (dynamics.effectiveKind === "LIABILITY" ? Math.abs(dynamics.finalRubCents) : dynamics.finalRubCents) : null;
                    const finalDisplayCur = dynamics.effectiveKind === "LIABILITY" ? Math.abs(dynamics.finalCurCents) / 100 : dynamics.finalCurCents / 100;
                    const showCurRow = dynamics.currencyCode !== "RUB";

                    if (dynamics.isBalanceMode) {
                      return (
                        <>
                          <SummaryBlock title={`На ${dateStartLabel}`} curVal={showCurRow ? initialDisplayCur : null} rubVal={initialDisplayRub} showQtyRow={false} showCurRow={showCurRow} />
                          <SummaryBlock title="Доходы" curVal={showCurRow ? dynamics.totalIncomeCur : null} rubVal={dynamics.totalIncomeRub} amountColor={GREEN} showQtyRow={false} showCurRow={showCurRow} />
                          <SummaryBlock title="Расходы" curVal={showCurRow ? -dynamics.totalExpenseCur : null} rubVal={-dynamics.totalExpenseRub} amountColor={RED} showQtyRow={false} showCurRow={showCurRow} />
                          <SummaryBlock title="Переводы" curVal={showCurRow ? dynamics.totalTransferCur : null} rubVal={dynamics.totalTransferRub} amountColor={dynamics.totalTransferRub < 0 ? RED : dynamics.totalTransferRub > 0 ? GREEN : undefined} showQtyRow={false} showCurRow={showCurRow} />
                          {showCurRow && (
                            <SummaryBlock
                              title="Курсовые разницы"
                              curVal={null}
                              rubVal={dynamics.courseDiffRub}
                              amountColor={dynamics.courseDiffRub >= 0 ? GREEN : RED}
                              showQtyRow={false}
                              showCurRow={false}
                            />
                          )}
                          <SummaryBlock title={`На ${dateEndLabel}`} curVal={showCurRow ? finalDisplayCur : null} rubVal={finalDisplayRub} showQtyRow={false} showCurRow={showCurRow} />
                        </>
                      );
                    }
                    if (dynamics.isMarketMode && dynamics.isMarketOrCrypto) {
                      return (
                        <>
                          <SummaryBlock title={`На ${dateStartLabel}`} qtyVal={dynamics.qtyStart} curVal={showCurRow ? initialDisplayCur : null} rubVal={initialDisplayRub} showQtyRow={true} showCurRow={showCurRow} />
                          <SummaryBlock title="Куплено" qtyVal={dynamics.totalBuyQty} curVal={showCurRow ? dynamics.totalExpenseCur : null} rubVal={dynamics.totalExpenseRub} amountColor={GREEN} showQtyRow={true} showCurRow={showCurRow} />
                          <SummaryBlock title="Продано" qtyVal={-dynamics.totalSellQty} curVal={showCurRow ? -dynamics.totalIncomeCur : null} rubVal={-dynamics.totalIncomeRub} amountColor={RED} showQtyRow={true} showCurRow={showCurRow} />
                          <SummaryBlock
                            title="Изменение цены"
                            qtyVal={undefined}
                            curVal={showCurRow && dynamics.profitLossFromPriceCur != null ? dynamics.profitLossFromPriceCur : null}
                            rubVal={dynamics.currencyCode !== "RUB" ? dynamics.courseDiffRub : dynamics.profitLossFromPriceRub}
                            amountColor={dynamics.profitLossFromPriceRub >= 0 ? GREEN : RED}
                            showCurRow={showCurRow}
                            showQtyRow={false}
                            showEmptyQtyRow={true}
                          />
                          <SummaryBlock title={`На ${dateEndLabel}`} qtyVal={dynamics.qtyEnd} curVal={showCurRow ? finalDisplayCur : null} rubVal={finalDisplayRub} showQtyRow={true} showCurRow={showCurRow} />
                        </>
                      );
                    }
                    return (
                      <>
                        <SummaryBlock title={`На ${dateStartLabel}`} curVal={showCurRow ? initialDisplayCur : null} rubVal={initialDisplayRub} showQtyRow={false} showCurRow={showCurRow} />
                        <SummaryBlock
                          title="Изменение цены"
                          qtyVal={undefined}
                          curVal={showCurRow && dynamics.profitLossFromPriceCur != null ? dynamics.profitLossFromPriceCur : null}
                          rubVal={dynamics.currencyCode !== "RUB" ? dynamics.courseDiffRub : dynamics.profitLossFromPriceRub}
                          amountColor={dynamics.profitLossFromPriceRub >= 0 ? GREEN : RED}
                          showCurRow={showCurRow}
                          showQtyRow={false}
                        />
                        <SummaryBlock title={`На ${dateEndLabel}`} curVal={showCurRow ? finalDisplayCur : null} rubVal={finalDisplayRub} showQtyRow={false} showCurRow={showCurRow} />
                      </>
                    );
                  })()}
                </div>
              ) : (
                <p className="text-sm" style={{ color: PLACEHOLDER_COLOR_DARK }}>Нет данных за период (нужна дата открытия и стоимость).</p>
              )}
            </div>
          </div>
        )}

        {costs && (
          <div className="relative rounded-lg overflow-hidden border-0 outline-none" style={{ backgroundColor: MODAL_BG }}>
            <div className="p-6">
              <h3 className="text-base font-semibold mb-4" style={{ color: ACTIVE_TEXT_DARK }}>Доход и расход по активу</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg p-4" style={{ backgroundColor: "rgba(255,255,255,0.06)" }}>
                  <div className="text-xs mb-1" style={{ color: PLACEHOLDER_COLOR_DARK }}>Доход</div>
                  <div className="text-lg font-semibold" style={{ color: ACTIVE_TEXT_DARK }}>
                    <AmountWithCurrency valueCents={costs.income_rub} currencyCode={item.currency_code} />
                  </div>
                </div>
                <div className="rounded-lg p-4" style={{ backgroundColor: "rgba(255,255,255,0.06)" }}>
                  <div className="text-xs mb-1" style={{ color: PLACEHOLDER_COLOR_DARK }}>Расход</div>
                  <div className="text-lg font-semibold" style={{ color: ACTIVE_TEXT_DARK }}>
                    <AmountWithCurrency valueCents={costs.expense_rub} currencyCode={item.currency_code} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {item.instrument_id && (
          <div className="relative rounded-lg overflow-hidden border-0 outline-none" style={{ backgroundColor: MODAL_BG }}>
            <div className="p-6">
              <h3 className="text-base font-semibold mb-4" style={{ color: ACTIVE_TEXT_DARK }}>История операций по количеству</h3>
              {quantityHistoryError ? (
                <p className="text-sm text-red-500">{quantityHistoryError}</p>
              ) : loadingQuantityHistory ? (
                <p className="text-sm" style={{ color: PLACEHOLDER_COLOR_DARK }}>Загрузка...</p>
              ) : (
                <>
                  <div className="rounded-lg overflow-hidden">
                    <table className="w-full text-left border-collapse text-sm">
                      <thead>
                        <tr style={{ color: PLACEHOLDER_COLOR_DARK, backgroundColor: BACKGROUND_DT }}>
                          <th className="pl-6 pr-4 py-3 text-sm font-medium">Дата</th>
                          <th className="px-4 py-3 text-sm font-medium">Тип операции</th>
                          <th className="px-4 py-3 text-sm font-medium text-right">Количество</th>
                          <th className="px-4 py-3 text-sm font-medium text-right">Цена</th>
                          <th className="px-4 py-3 text-sm font-medium text-right">Стоимость</th>
                          <th className="px-6 py-3 text-sm font-medium text-right">Количество после операции</th>
                        </tr>
                      </thead>
                      <tbody>
                        {quantityHistoryRows.length === 0 ? (
                          <tr style={{ backgroundColor: MODAL_BG }}>
                            <td colSpan={6} className="px-6 py-4 text-center text-sm" style={{ color: PLACEHOLDER_COLOR_DARK }}>Нет операций покупки и продажи</td>
                          </tr>
                        ) : (
                          quantityHistoryRows.map(({ tx, type, delta, balanceAfter, priceCents, costCents }) => {
                            const dateStr = tx.transaction_date ? new Date(tx.transaction_date.replace("T", " ")).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";
                            const amountColor = type === "Покупка" ? GREEN : RED;
                            return (
                              <tr key={tx.id} className="border-t border-white/10" style={{ backgroundColor: MODAL_BG }}>
                                <td className="pl-6 pr-4 py-2 text-sm" style={{ color: ACTIVE_TEXT_DARK }}>{dateStr}</td>
                                <td className="px-4 py-2 text-sm" style={{ color: amountColor }}>{type}</td>
                                <td className="px-4 py-2 text-sm text-right tabular-nums" style={{ color: amountColor }}>{delta > 0 ? `+${delta}` : delta}</td>
                                <td className="px-4 py-2 text-sm text-right tabular-nums" style={{ color: ACTIVE_TEXT_DARK }}>{priceCents != null ? formatAmount(priceCents) : "—"}</td>
                                <td className="px-4 py-2 text-sm text-right tabular-nums" style={{ color: ACTIVE_TEXT_DARK }}>{formatAmount(costCents)}</td>
                                <td className="px-6 py-2 text-sm text-right tabular-nums" style={{ color: ACTIVE_TEXT_DARK }}>{new Intl.NumberFormat("ru-RU").format(balanceAfter)}</td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex flex-wrap gap-4 mt-4">
                    {(() => {
                      const SummaryBlock = ({ title, value }: { title: string; value: number }) => (
                        <div className="flex flex-1 min-w-[120px] flex-col gap-1.5 rounded-lg px-3 py-2" style={{ backgroundColor: "rgba(255,255,255,0.06)" }}>
                          <div className="text-xs text-center" style={{ color: PLACEHOLDER_COLOR_DARK }}>{title}</div>
                          <div className="rounded-md px-2 py-1 flex justify-center text-sm tabular-nums" style={{ backgroundColor: BACKGROUND_DT, color: ACTIVE_TEXT_DARK }}>
                            {new Intl.NumberFormat("ru-RU").format(value)}
                          </div>
                        </div>
                      );
                      return (
                        <>
                          <SummaryBlock title="Количество на начало" value={quantitySummary.startQty} />
                          <SummaryBlock title="Всего куплено" value={quantitySummary.totalBuy} />
                          <SummaryBlock title="Всего продано" value={quantitySummary.totalSell} />
                          <SummaryBlock title="Количество на текущую дату" value={quantitySummary.current} />
                        </>
                      );
                    })()}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {item.instrument_id && (
          <BuySellAssetModal
            open={buySellModalOpen}
            onOpenChange={setBuySellModalOpen}
            asset={item}
            items={allItems}
            getCounterpartyForItemId={getCounterpartyForItemId}
            getBankLogoUrl={itemCounterpartyLogoUrl}
            getBankName={itemCounterpartyName}
            getItemBalance={getItemPrimaryValueCents}
            onSuccess={load}
          />
        )}
        {!item.instrument_id && (
          <EditMarketValueModal
            open={editMarketValueModalOpen}
            onOpenChange={setEditMarketValueModalOpen}
            item={item}
            marketValues={marketValues}
            getRateForDate={getRateForDateKey}
            onSuccess={load}
          />
        )}
      </div>
    </main>
  );
}
