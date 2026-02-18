"use client";

import { useCallback, useEffect, useMemo, useRef, useState, Fragment } from "react";
import { useSession } from "next-auth/react";
import { useAccountingStart } from "@/components/accounting-start-context";
import {
  fetchCounterparties,
  fetchFxRates,
  fetchCategories,
  fetchItems,
  fetchMarketInstrumentPrice,
  fetchMarketInstrumentPrices,
  fetchTransactions,
  API_BASE,
  CounterpartyOut,
  FxRateOut,
  ItemOut,
  MarketPriceOut,
  TransactionOut,
} from "@/lib/api";
import { Label } from "@/components/ui/label";
import { Tooltip } from "@/components/ui/tooltip";
import { FilterSection } from "@/components/filter-panel";
import { DateField } from "@/components/ui/form-field";
import { AssetItemIcon } from "@/components/asset-item-icon";
import { CategoryIconImage } from "@/components/category-icon-image";
import { buildCategoryLookup, type CategoryNode } from "@/lib/categories";
import { ItemSelector } from "@/components/item-selector";
import { SegmentedSelector } from "@/components/ui/segmented-selector";
import { ACCENT, ACCENT2, ACTIVE_TEXT_DARK, BACKGROUND_DT, GREEN, MODAL_BG, PLACEHOLDER_COLOR_DARK, RED } from "@/lib/colors";
import { PINK_GRADIENT } from "@/lib/gradients";
import {
  formatWeekPeriodAsDateRange,
  getForecastPresetEnd,
  getHistoryPresetStart,
  getPeriodKey,
  listPeriodsInRange,
  type ForecastPresetKey,
  type HistoryPresetKey,
  type ReportPeriodGranularity,
} from "@/lib/report-period-utils";
import { Info, MessageSquare } from "lucide-react";
import {
  buildItemTransactionCounts,
  getEffectiveItemKind,
  sortItemsByTransactionCount,
} from "@/lib/item-utils";
import { getItemTypeLabel } from "@/lib/item-types";
import { formatAmount } from "@/lib/item-utils";

type ChartPoint = {
  x: number;
  y: number;
  value: number;
};

type DailyRow = {
  date: string;
  totalRubCents: number | null;
  totalCurrencyCents: number | null;
  rate: number | null;
  itemValues: Record<number, number | null>;
  itemRubValues: Record<number, number | null>;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toTxDateKey(value: string) {
  return value ? value.slice(0, 10) : "";
}

function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function getRelativeDateKey(daysOffset: number) {
  return toDateKey(addDays(new Date(), daysOffset));
}

function daysBetween(start: Date, end: Date) {
  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.round((endUtc - startUtc) / MS_PER_DAY);
}

function buildLinePath(points: ChartPoint[]) {
  if (points.length === 0) return "";
  const path = [`M ${points[0].x} ${points[0].y}`];
  for (let i = 1; i < points.length; i += 1) {
    path.push(`L ${points[i].x} ${points[i].y}`);
  }
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
  for (let value = minTick; value <= maxTick + step / 2; value += step) {
    ticks.push(value);
  }
  return ticks;
}

function formatTick(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function buildDayMarks(
  startKey: string,
  endKey: string,
  width: number,
  padding: {
    left: number;
    right: number;
    top: number;
    bottom: number;
  }
) {
  const startDate = parseDateKey(startKey);
  const endDate = parseDateKey(endKey);
  const totalDays = Math.max(daysBetween(startDate, endDate), 1);
  const innerWidth = width - padding.left - padding.right;
  const targetLabels = 7;
  const step = Math.max(1, Math.ceil(totalDays / (targetLabels - 1)));
  const marks: { label: string; x: number; dayIndex: number }[] = [];

  for (let dayIndex = 0; dayIndex <= totalDays; dayIndex += step) {
    const date = addDays(startDate, dayIndex);
    marks.push({
      label: formatChartDate(date),
      x: padding.left + (innerWidth * dayIndex) / totalDays,
      dayIndex,
    });
  }

  if (marks[marks.length - 1]?.dayIndex !== totalDays) {
    const date = addDays(startDate, totalDays);
    marks.push({
      label: formatChartDate(date),
      x: padding.left + innerWidth,
      dayIndex: totalDays,
    });
  }

  return marks;
}

function formatChartDate(date: Date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear()).slice(-2);
  return `${day}.${month}.${year}`;
}

function buildDateRange(startKey: string, endKey: string) {
  const start = parseDateKey(startKey);
  const end = parseDateKey(endKey);
  const [rangeStart, rangeEnd] = start > end ? [end, start] : [start, end];

  const dates: string[] = [];
  for (
    let current = rangeStart;
    current <= rangeEnd;
    current = addDays(current, 1)
  ) {
    dates.push(toDateKey(current));
  }
  return dates;
}

function toCbrDate(value: string) {
  const parts = value.split("-");
  if (parts.length === 3) {
    const [year, month, day] = parts;
    if (year && month && day) return `${day}/${month}/${year}`;
  }
  return value;
}

function formatDateLabel(dateKey: string) {
  const [year, month, day] = dateKey.split("-");
  return `${day}.${month}.${year}`;
}

/** Форматирует дату транзакции: дата; время HH:mm — только если оно есть в transaction_date и не 00:00. */
function formatTxDateCell(transactionDate: string) {
  const dateKey = toTxDateKey(transactionDate);
  const dateLabel = formatDateLabel(dateKey);
  const tIdx = transactionDate.indexOf("T");
  if (tIdx === -1) return dateLabel;
  const timePart = transactionDate.slice(tIdx + 1);
  const match = /^(\d{1,2}):(\d{2})/.exec(timePart);
  if (!match) return dateLabel;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  if (hours === 0 && minutes === 0) return dateLabel;
  const timeLabel = `${match[1].padStart(2, "0")}:${match[2]}`;
  return (
    <>
      {dateLabel}
      <br />
      <span className="text-xs" style={{ color: PLACEHOLDER_COLOR_DARK, fontWeight: 400 }}>{timeLabel}</span>
    </>
  );
}

const CURRENCY_BADGE_CLASSES: Record<string, string> = {
  RUB: "bg-[#C46A2F]/20 text-[#C46A2F]",
  USD: "bg-[#2E7D32]/20 text-[#2E7D32]",
  EUR: "bg-[#003399]/20 text-[#003399]",
  JPY: "bg-[#BC002D]/20 text-[#BC002D]",
  CNY: "bg-[#DE2910]/20 text-[#DE2910]",
};

function getCurrencyBadgeClass(code: string) {
  return CURRENCY_BADGE_CLASSES[code] ?? "bg-muted/20 text-slate-600";
}


function formatRub(valueInCents: number) {
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valueInCents / 100);
}

function formatSignedValue(valueInCents: number, formatter: (value: number) => string) {
  const absValue = Math.abs(valueInCents);
  const formatted = formatter(absValue);
  return valueInCents < 0 ? `-${formatted}` : formatted;
}

function formatGrowthPercent(percent: number | null): string {
  if (percent == null || Number.isNaN(percent) || percent === 0) return "–";
  const formatted = new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(Math.abs(percent));
  return percent < 0 ? `-${formatted}%` : `+${formatted}%`;
}

function getItemStartKey(item: ItemOut, accountingStartDate?: string | null) {
  let minDate = accountingStartDate ?? item.open_date ?? "";
  if (item.open_date && item.open_date > minDate) {
    minDate = item.open_date;
  }
  return minDate ? toTxDateKey(minDate) : toDateKey(new Date(item.created_at));
}

function transferDelta(kind: ItemOut["kind"], isPrimary: boolean, amount: number) {
  if (kind === "LIABILITY") return isPrimary ? amount : -amount;
  return isPrimary ? -amount : amount;
}

function getTxDeltaForItem(
  tx: TransactionOut,
  itemId: number,
  itemKind: ItemOut["kind"]
): { deltaCents: number; inCurrency: boolean } | null {
  const isPrimary = tx.primary_item_id === itemId || tx.primary_card_item_id === itemId;
  const isCounter = tx.counterparty_item_id === itemId || tx.counterparty_card_item_id === itemId;
  if (isPrimary) {
    if (tx.direction === "INCOME") return { deltaCents: tx.amount_rub, inCurrency: false };
    if (tx.direction === "EXPENSE") {
      const isOpening = tx.source === "AUTO_ITEM_OPENING";
      const amount = isOpening && itemKind === "LIABILITY" ? tx.amount_rub : -tx.amount_rub;
      return { deltaCents: amount, inCurrency: false };
    }
    if (tx.direction === "TRANSFER") return { deltaCents: transferDelta(itemKind, true, tx.amount_rub), inCurrency: false };
  }
  if (isCounter && tx.direction === "TRANSFER") {
    const amount = tx.amount_counterparty ?? tx.amount_rub;
    const inCurrency = tx.amount_counterparty != null;
    return { deltaCents: transferDelta(itemKind, false, amount), inCurrency };
  }
  return null;
}

function isMoexItem(item: ItemOut) {
  return Boolean(item.instrument_id);
}

function getMarketPriceKey(item: ItemOut) {
  if (!item.instrument_id) return null;
  const board = item.instrument_board_id ?? "";
  return `${item.instrument_id}|${board}`;
}

function computeInstrumentUnitPriceCents(
  item: ItemOut,
  price: MarketPriceOut | null
) {
  if (!price) return null;
  if (price.price_cents != null) {
    if (item.type_code === "bonds") {
      return price.price_cents + (price.accint_cents ?? 0);
    }
    return price.price_cents;
  }
  if (price.price_percent_bp != null && item.face_value_cents != null) {
    const base = Math.round(
      (item.face_value_cents * price.price_percent_bp) / 10000
    );
    return base + (price.accint_cents ?? 0);
  }
  return null;
}

function findPriceOnOrBefore(
  priceByDate: Record<string, MarketPriceOut>,
  dates: string[] | undefined,
  dateKey: string
) {
  // Сначала проверяем точное совпадение даты
  if (priceByDate[dateKey]) return priceByDate[dateKey];
  if (!dates || dates.length === 0) return null;
  
  // Ищем ближайшую предыдущую дату
  let lo = 0;
  let hi = dates.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (dates[mid] <= dateKey) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best >= 0 ? priceByDate[dates[best]] : null;
}

function getRateForDate(
  ratesByDate: Record<string, FxRateOut[]>,
  dateKey: string,
  currencyCode: string,
  latestRatesByCurrency: Map<string, { dateKey: string; rate: number }>,
  todayKey: string
) {
  if (currencyCode === "RUB") return 1;
  if (dateKey > todayKey) {
    return latestRatesByCurrency.get(currencyCode)?.rate ?? null;
  }
  const rates = ratesByDate[dateKey];
  if (!rates) return null;
  const match = rates.find((rate) => rate.char_code === currencyCode);
  return match?.rate ?? null;
}

function buildDeltasByDate(
  txs: TransactionOut[],
  selectedIds: Set<number>,
  itemKindById: Map<number, ItemOut["kind"]>,
  moexItemIds: Set<number>,
  todayKey: string,
  itemsById: Map<number, ItemOut>
) {
  const map = new Map<string, Map<number, number>>();
  const addDelta = (dateKey: string, itemId: number, delta: number) => {
    if (!map.has(dateKey)) map.set(dateKey, new Map());
    const bucket = map.get(dateKey);
    if (!bucket) return;
    bucket.set(itemId, (bucket.get(itemId) ?? 0) + delta);
  };

  // Функция для получения effective_item_id (для карт это card_account_id, иначе сам item_id)
  const getEffectiveItemId = (itemId: number): number => {
    const item = itemsById.get(itemId);
    if (!item) return itemId;
    if (item.type_code === "bank_card" && item.card_account_id) {
      return item.card_account_id;
    }
    return itemId;
  };

  // Функция для нормализации выбранных ID - заменяем карты на их счета
  const normalizeSelectedIds = (candidates: number[]): number[] => {
    const effectiveIds = new Set<number>();
    candidates.forEach((id) => {
      if (selectedIds.has(id)) {
        const effectiveId = getEffectiveItemId(id);
        effectiveIds.add(effectiveId);
      }
    });
    return Array.from(effectiveIds);
  };

  txs.forEach((tx) => {
    const dateKey = toTxDateKey(tx.transaction_date);
    if (!dateKey) return;
    const isRealized = tx.transaction_type === "ACTUAL" || tx.status === "REALIZED";
    if (dateKey <= todayKey && !isRealized) return;

    const primaryCandidates = [
      tx.primary_item_id,
      tx.primary_card_item_id ?? null,
    ].filter(Boolean) as number[];
    const counterCandidates = [
      tx.counterparty_item_id,
      tx.counterparty_card_item_id ?? null,
    ].filter(Boolean) as number[];
    
    // Нормализуем ID - заменяем карты на их счета
    const primaryEffectiveIds = normalizeSelectedIds(primaryCandidates);
    const counterEffectiveIds = normalizeSelectedIds(counterCandidates);
    
    if (primaryEffectiveIds.length === 0 && counterEffectiveIds.length === 0) return;

    // Обрабатываем primary items
    primaryEffectiveIds.forEach((itemId) => {
      if (moexItemIds.has(itemId)) return;
      let delta = 0;
      if (tx.direction === "INCOME") delta = tx.amount_rub;
      if (tx.direction === "EXPENSE") {
        // Opening-транзакции для обязательств создаются как EXPENSE,
        // но в backend они УВЕЛИЧИВАЮТ долг (см. item_opening_service._create_income_expense).
        // Поэтому для корректной истории учитываем этот частный случай.
        const kind = itemKindById.get(itemId) ?? "ASSET";
        const isOpening = tx.source === "AUTO_ITEM_OPENING";
        delta = isOpening && kind === "LIABILITY" ? tx.amount_rub : -tx.amount_rub;
      }
      if (tx.direction === "TRANSFER") {
        const kind = itemKindById.get(itemId) ?? "ASSET";
        delta = transferDelta(kind, true, tx.amount_rub);
      }
      addDelta(dateKey, itemId, delta);
    });

    // Обрабатываем counterparty items только для переводов
    // Для INCOME/EXPENSE counterparty_item_id обычно указывает на контрагента, а не на актив
    if (tx.direction === "TRANSFER") {
      const counterAmount = tx.amount_counterparty ?? tx.amount_rub;
      counterEffectiveIds.forEach((itemId) => {
        if (moexItemIds.has(itemId)) return;
        const kind = itemKindById.get(itemId) ?? "ASSET";
        const delta = transferDelta(kind, false, counterAmount);
        addDelta(dateKey, itemId, delta);
      });
    }
  });

  return map;
}

function buildLotDeltasByDate(
  txs: TransactionOut[],
  selectedIds: Set<number>,
  moexItemIds: Set<number>,
  todayKey: string
) {
  const map = new Map<string, Map<number, number>>();
  const addDelta = (dateKey: string, itemId: number, delta: number) => {
    if (!map.has(dateKey)) map.set(dateKey, new Map());
    const bucket = map.get(dateKey);
    if (!bucket) return;
    bucket.set(itemId, (bucket.get(itemId) ?? 0) + delta);
  };

  txs.forEach((tx) => {
    const dateKey = toTxDateKey(tx.transaction_date);
    if (!dateKey) return;
    const isRealized = tx.transaction_type === "ACTUAL" || tx.status === "REALIZED";
    if (dateKey <= todayKey && !isRealized) return;

    const primaryCandidates = [
      tx.primary_item_id,
      tx.primary_card_item_id ?? null,
    ].filter(Boolean) as number[];
    const counterCandidates = [
      tx.counterparty_item_id,
      tx.counterparty_card_item_id ?? null,
    ].filter(Boolean) as number[];
    const primarySelectedIds = primaryCandidates.filter(
      (id) => selectedIds.has(id) && moexItemIds.has(id)
    );
    const counterSelectedIds = counterCandidates.filter(
      (id) => selectedIds.has(id) && moexItemIds.has(id)
    );
    if (primarySelectedIds.length === 0 && counterSelectedIds.length === 0) return;

    primarySelectedIds.forEach((itemId) => {
      let delta = 0;
      if (tx.direction === "INCOME") delta = tx.primary_quantity_lots ?? 0;
      if (tx.direction === "EXPENSE") delta = -(tx.primary_quantity_lots ?? 0);
      if (tx.direction === "TRANSFER") delta = -(tx.primary_quantity_lots ?? 0);
      addDelta(dateKey, itemId, delta);
    });

    if (tx.direction === "TRANSFER") {
      counterSelectedIds.forEach((itemId) => {
        const delta = tx.counterparty_quantity_lots ?? 0;
        addDelta(dateKey, itemId, delta);
      });
    }
  });

  return map;
}

export default function AssetsDynamicsPage() {
  const { data: session } = useSession();
  const { accountingStartDate } = useAccountingStart();
  const [items, setItems] = useState<ItemOut[]>([]);
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [counterparties, setCounterparties] = useState<CounterpartyOut[]>([]);
  const [transactions, setTransactions] = useState<TransactionOut[]>([]);
  const [fxRatesByDate, setFxRatesByDate] = useState<Record<string, FxRateOut[]>>(
    {}
  );
  const [marketPricesByKey, setMarketPricesByKey] = useState<
    Record<string, Record<string, MarketPriceOut>>
  >({});
  const [latestPricesByKey, setLatestPricesByKey] = useState<
    Map<string, MarketPriceOut>
  >(new Map());
  const [marketPricesLoading, setMarketPricesLoading] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<number[]>([]);
  const [historyPreset, setHistoryPreset] = useState<HistoryPresetKey>("last_month");
  const [forecastPreset, setForecastPreset] = useState<ForecastPresetKey>("next_month");
  const [periodGranularity, setPeriodGranularity] = useState<ReportPeriodGranularity>("day");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [loading, setLoading] = useState(false);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [tooltipLeft, setTooltipLeft] = useState<number | null>(null);
  const [clickedChartDates, setClickedChartDates] = useState<string[]>([]);
  const [expandedItemId, setExpandedItemId] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const chartRef = useRef<HTMLDivElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [chartSize, setChartSize] = useState({ width: 720, height: 280 });

  useEffect(() => {
    if (!session) return;
    let active = true;
    setLoading(true);
    setError(null);

    Promise.all([
      fetchItems({ includeClosed: true, includeArchived: true }),
      fetchTransactions(),
      fetchCategories().catch(() => []),
      fetchCounterparties().catch(() => []),
    ])
      .then(([itemsData, txData, categoriesData, counterpartiesData]) => {
        if (!active) return;
        setItems(itemsData);
        setTransactions(txData);
        setCategories(Array.isArray(categoriesData) ? categoriesData : []);
        setCounterparties(counterpartiesData);
      })
      .catch((e: any) => {
        if (!active) return;
        setError(
          e?.message ??
            "Не удалось загрузить список активов и транзакций."
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [session]);

  const itemTxCounts = useMemo(
    () => buildItemTransactionCounts(transactions),
    [transactions]
  );
  const sortedItems = useMemo(
    () => sortItemsByTransactionCount(items, itemTxCounts),
    [items, itemTxCounts]
  );
  const itemsById = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items]
  );
  const categoryLookup = useMemo(() => buildCategoryLookup(categories), [categories]);
  const counterpartiesById = useMemo(
    () => new Map(counterparties.map((cp) => [cp.id, cp])),
    [counterparties]
  );
  const getItemDisplayBalanceCents = useCallback(
    (item: ItemOut) => {
      if (item.type_code === "bank_card" && item.card_account_id) {
        const linked = itemsById.get(item.card_account_id);
        if (linked) return linked.current_value_rub;
      }
      return item.current_value_rub;
    },
    [itemsById]
  );
  const resolveItemEffectiveKind = useCallback(
    (item: ItemOut, balanceCents: number) => getEffectiveItemKind(item, balanceCents),
    []
  );
  const getItemDisplayInitialCents = useCallback(
    (item: ItemOut) => {
      if (item.type_code === "bank_card" && item.card_account_id) {
        const linked = itemsById.get(item.card_account_id);
        if (linked) {
          // Для элементов, созданных в день начала учета, начальное значение - это initial_value_rub
          const linkedStartKey = getItemStartKey(linked, accountingStartDate);
          const isCreatedOnStartDate = linkedStartKey === accountingStartDate;
          return linked.history_status === "NEW" && !isCreatedOnStartDate
            ? 0
            : linked.initial_value_rub;
        }
      }
      // Для элементов, созданных в день начала учета, начальное значение - это initial_value_rub
      const itemStartKey = getItemStartKey(item, accountingStartDate);
      const isCreatedOnStartDate = itemStartKey === accountingStartDate;
      return item.history_status === "NEW" && !isCreatedOnStartDate
        ? 0
        : item.initial_value_rub;
    },
    [itemsById, accountingStartDate]
  );
  const getEffectiveStartKey = useCallback(
    (item: ItemOut) => {
      const startKey = getItemStartKey(item, accountingStartDate);
      if (item.type_code !== "bank_card" || !item.card_account_id) {
        return startKey;
      }
      const account = itemsById.get(item.card_account_id);
      if (!account) return startKey;
      const accountStartKey = getItemStartKey(account, accountingStartDate);
      if (accountStartKey && startKey) {
        return accountStartKey > startKey ? accountStartKey : startKey;
      }
      return accountStartKey || startKey;
    },
    [accountingStartDate, itemsById]
  );
  const itemCounterpartyLogoUrl = (id: number | null | undefined) => {
    if (!id) return null;
    const cpId = itemsById.get(id)?.counterparty_id;
    if (!cpId) return null;
    const counterparty = counterpartiesById.get(cpId);
    if (!counterparty) return null;
    return counterparty.entity_type === "PERSON"
      ? counterparty.photo_url ?? null
      : counterparty.logo_url ?? null;
  };
  const itemCounterpartyName = (id: number | null | undefined) => {
    if (!id) return "";
    const cpId = itemsById.get(id)?.counterparty_id;
    if (!cpId) return "";
    const cp = counterpartiesById.get(cpId);
    if (!cp) return "";
    if (cp.entity_type === "PERSON") {
      const parts = [cp.last_name, cp.first_name, cp.middle_name].filter(Boolean);
      return parts.length > 0 ? parts.join(" ") : "";
    }
    return cp.name || cp.full_name || "";
  };
  useEffect(() => {
    const itemIds = new Set(sortedItems.map((item) => item.id));
    setSelectedItemIds((prev) => prev.filter((id) => itemIds.has(id)));
  }, [sortedItems]);

  const selectedItems = useMemo(() => {
    const selected = new Set(selectedItemIds);
    return sortedItems.filter((item) => selected.has(item.id));
  }, [sortedItems, selectedItemIds]);
  const effectiveSelectedItems = useMemo(
    () => (selectedItemIds.length === 0 ? sortedItems : selectedItems),
    [selectedItemIds.length, sortedItems, selectedItems]
  );
  const moexItems = useMemo(
    () => effectiveSelectedItems.filter((item) => isMoexItem(item)),
    [effectiveSelectedItems]
  );
  const moexItemIds = useMemo(
    () => new Set(moexItems.map((item) => item.id)),
    [moexItems]
  );
  const moexPriceKeyByItemId = useMemo(() => {
    const map = new Map<number, string>();
    moexItems.forEach((item) => {
      const key = getMarketPriceKey(item);
      if (key) map.set(item.id, key);
    });
    return map;
  }, [moexItems]);

  const selectedCurrencyCodes = useMemo(() => {
    const set = new Set<string>();
    effectiveSelectedItems.forEach((item) => {
      if (item.currency_code) set.add(item.currency_code);
    });
    return Array.from(set);
  }, [effectiveSelectedItems]);

  const singleCurrencyCode =
    selectedCurrencyCodes.length === 1 ? selectedCurrencyCodes[0] : null;
  const showCurrencyColumns = Boolean(
    singleCurrencyCode && singleCurrencyCode !== "RUB"
  );

  const todayKey = toDateKey(new Date());
  const defaultStartKey = getRelativeDateKey(-7);
  const defaultEndKey = getRelativeDateKey(7);
  const startKeys = useMemo(
    () => effectiveSelectedItems.map((item) => getEffectiveStartKey(item)).sort(),
    [getEffectiveStartKey, effectiveSelectedItems]
  );
  const earliestStartKey = startKeys[0] ?? "";
  const rangeMinStartKey =
    startKeys.length > 0 ? startKeys[startKeys.length - 1] : "";
  const rangeStartFloor = accountingStartDate ?? "";

  useEffect(() => {
    if (effectiveSelectedItems.length === 0) {
      setRangeStart("");
      setRangeEnd("");
    }
  }, [effectiveSelectedItems.length]);

  useEffect(() => {
    if (historyPreset !== "custom") {
      setRangeStart(getHistoryPresetStart(historyPreset, accountingStartDate ?? null));
    }
  }, [historyPreset, accountingStartDate]);

  useEffect(() => {
    if (forecastPreset !== "custom") {
      setRangeEnd(getForecastPresetEnd(forecastPreset));
    }
  }, [forecastPreset]);

  const effectiveRangeStart = useMemo(() => {
    if (historyPreset === "custom") return rangeStart || "";
    return getHistoryPresetStart(historyPreset, accountingStartDate ?? null);
  }, [historyPreset, rangeStart, accountingStartDate]);

  const effectiveRangeEnd = useMemo(() => {
    if (forecastPreset === "custom") return rangeEnd || "";
    return getForecastPresetEnd(forecastPreset);
  }, [forecastPreset, rangeEnd]);

  const rangeStartKey = useMemo(() => {
    if (effectiveSelectedItems.length === 0) return "";
    const start = effectiveRangeStart || rangeStartFloor;
    if (rangeStartFloor && start < rangeStartFloor) return rangeStartFloor;
    return start;
  }, [effectiveRangeStart, rangeStartFloor, effectiveSelectedItems.length]);

  const rangeEndKey = useMemo(() => {
    if (!rangeStartKey) return "";
    const end = effectiveRangeEnd || defaultEndKey;
    return end < rangeStartKey ? rangeStartKey : end;
  }, [defaultEndKey, effectiveRangeEnd, rangeStartKey]);

  const dateKeys = useMemo(() => {
    if (!rangeStartKey || !rangeEndKey) return [];
    return buildDateRange(rangeStartKey, rangeEndKey);
  }, [rangeEndKey, rangeStartKey]);

  const needsRates = useMemo(
    () => effectiveSelectedItems.some((item) => item.currency_code !== "RUB"),
    [effectiveSelectedItems]
  );

  const rateFetchKeys = useMemo(() => {
    if (!needsRates || dateKeys.length === 0) return [];
    const pastKeys = dateKeys.filter((dateKey) => dateKey <= todayKey);
    if (pastKeys.length === 0) return [todayKey];
    return Array.from(new Set(pastKeys));
  }, [dateKeys, needsRates, todayKey]);

  const latestRatesByCurrency = useMemo(() => {
    const latest = new Map<string, { dateKey: string; rate: number }>();
    Object.entries(fxRatesByDate).forEach(([dateKey, rates]) => {
      if (dateKey > todayKey) return;
      rates?.forEach((rate) => {
        const prev = latest.get(rate.char_code);
        if (!prev || dateKey > prev.dateKey) {
          latest.set(rate.char_code, { dateKey, rate: rate.rate });
        }
      });
    });
    return latest;
  }, [fxRatesByDate, todayKey]);

  useEffect(() => {
    if (!needsRates || rateFetchKeys.length === 0) return;

    const missingDates = rateFetchKeys.filter(
      (dateKey) => !fxRatesByDate[dateKey]
    );
    if (missingDates.length === 0) return;

    let cancelled = false;
    const loadRates = async () => {
      setRatesLoading(true);
      const next: Record<string, FxRateOut[]> = {};

      for (const dateKey of missingDates) {
        try {
          const rates = await fetchFxRates(toCbrDate(dateKey));
          if (cancelled) return;
          next[dateKey] = rates;
        } catch (e) {
          if (cancelled) return;
          next[dateKey] = [];
        }
      }

      if (!cancelled && Object.keys(next).length > 0) {
        setFxRatesByDate((prev) => ({ ...prev, ...next }));
      }
      if (!cancelled) setRatesLoading(false);
    };

    loadRates();

    return () => {
      cancelled = true;
    };
  }, [fxRatesByDate, needsRates, rateFetchKeys]);

  useEffect(() => {
    if (!moexItems.length || !rangeStartKey || !rangeEndKey) return;
    const toKey = rangeEndKey < todayKey ? rangeEndKey : todayKey;
    const historyFromKey = toDateKey(addDays(parseDateKey(rangeStartKey), -14));
    if (!toKey || rangeStartKey > toKey) return;

    let cancelled = false;
    const loadPrices = async () => {
      setMarketPricesLoading(true);
      const next: Record<string, Record<string, MarketPriceOut>> = {};

      for (const item of moexItems) {
        if (!item.instrument_id) continue;
        const key = getMarketPriceKey(item);
        if (!key) continue;
        try {
          const prices = await fetchMarketInstrumentPrices(item.instrument_id, {
            from: historyFromKey,
            to: toKey,
            boardId: item.instrument_board_id ?? undefined,
          });
          if (cancelled) return;
          const byDate: Record<string, MarketPriceOut> = {};
          prices.forEach((price) => {
            byDate[price.price_date] = price;
          });
          next[key] = byDate;
          
          // Добавляем текущую цену для сегодняшней даты, если её нет в исторических данных
          if (!byDate[todayKey]) {
            try {
              const latestPrice = await fetchMarketInstrumentPrice(
                item.instrument_id,
                item.instrument_board_id ?? undefined
              );
              if (latestPrice.price_date >= todayKey) {
                byDate[todayKey] = latestPrice;
              }
            } catch (e) {
              // Игнорируем ошибки
            }
          }
        } catch (e) {
          if (cancelled) return;
          next[key] = {};
        }
      }

      if (!cancelled && Object.keys(next).length > 0) {
        setMarketPricesByKey((prev) => ({ ...prev, ...next }));
      }
      if (!cancelled) setMarketPricesLoading(false);
    };

    loadPrices();

    return () => {
      cancelled = true;
    };
  }, [moexItems, rangeEndKey, rangeStartKey, todayKey]);

  useEffect(() => {
    if (moexItems.length === 0 && marketPricesLoading) {
      setMarketPricesLoading(false);
    }
  }, [moexItems.length, marketPricesLoading]);

  // Загружаем текущие цены для MOEX активов (для сегодняшней даты)
  useEffect(() => {
    if (moexItems.length === 0) return;

    let cancelled = false;
    const loadLatestPrices = async () => {
      const latest = new Map<string, MarketPriceOut>();
      
      for (const item of moexItems) {
        if (!item.instrument_id || !item.instrument_board_id) continue;
        const key = getMarketPriceKey(item);
        if (!key) continue;
        
        try {
          const price = await fetchMarketInstrumentPrice(
            item.instrument_id,
            item.instrument_board_id
          );
          if (cancelled) return;
          latest.set(key, price);
          
          // Также добавляем текущую цену в исторические данные для сегодняшней даты
          setMarketPricesByKey((prev) => {
            const current = prev[key] || {};
            // Обновляем цену на сегодняшнюю дату, если текущая цена более свежая
            if (!current[todayKey] || price.price_date >= (current[todayKey]?.price_date || "")) {
              return {
                ...prev,
                [key]: {
                  ...current,
                  [todayKey]: price,
                },
              };
            }
            return prev;
          });
        } catch (e) {
          // Игнорируем ошибки для отдельных активов
        }
      }
      
      if (!cancelled) {
        setLatestPricesByKey(latest);
      }
    };

    loadLatestPrices();

    return () => {
      cancelled = true;
    };
  }, [moexItems, todayKey]);

  const latestMarketPriceByKey = useMemo(() => {
    const latest = new Map<string, MarketPriceOut>();
    
    // Сначала используем загруженные текущие цены (самые свежие)
    latestPricesByKey.forEach((price, key) => {
      latest.set(key, price);
    });
    
    // Затем дополняем из исторических данных, если текущей цены нет
    Object.entries(marketPricesByKey).forEach(([key, byDate]) => {
      if (latest.has(key)) return; // Уже есть текущая цена
      
      let last: MarketPriceOut | null = null;
      Object.entries(byDate).forEach(([dateKey, price]) => {
        if (dateKey > todayKey) return;
        // Используем price_date из объекта price, а не dateKey из ключа
        const priceDate = price.price_date;
        if (!last || priceDate > last.price_date) last = price;
      });
      if (last) latest.set(key, last);
    });
    
    return latest;
  }, [marketPricesByKey, latestPricesByKey, todayKey]);

  const marketPriceDatesByKey = useMemo(() => {
    const map = new Map<string, string[]>();
    Object.entries(marketPricesByKey).forEach(([key, byDate]) => {
      map.set(key, Object.keys(byDate).sort());
    });
    return map;
  }, [marketPricesByKey]);

  const dailyRows = useMemo<DailyRow[]>(() => {
    if (!effectiveSelectedItems.length || !rangeStartKey || !rangeEndKey) return [];

    const selectedIds = new Set(effectiveSelectedItems.map((item) => item.id));
    const itemKindById = new Map(effectiveSelectedItems.map((item) => [item.id, item.kind]));
    const itemStartKeyById = new Map(
      effectiveSelectedItems.map((item) => [item.id, getEffectiveStartKey(item)])
    );
    const itemsByStartDate = new Map<string, ItemOut[]>();
    effectiveSelectedItems.forEach((item) => {
      const startKey = itemStartKeyById.get(item.id);
      if (!startKey) return;
      if (!itemsByStartDate.has(startKey)) itemsByStartDate.set(startKey, []);
      itemsByStartDate.get(startKey)?.push(item);
    });

    const deltasByDate = buildDeltasByDate(
      transactions,
      selectedIds,
      itemKindById,
      moexItemIds,
      todayKey,
      itemsById
    );
    const lotDeltasByDate = buildLotDeltasByDate(
      transactions,
      selectedIds,
      moexItemIds,
      todayKey
    );
    const initialLotsById = new Map<number, number>();
    moexItems.forEach((item) => {
      const currentLots = item.position_lots ?? 0;
      const startKeyForItem = itemStartKeyById.get(item.id) ?? "";
      let realizedDelta = 0;
      lotDeltasByDate.forEach((deltaMap, dateKey) => {
        if (dateKey > todayKey) return;
        if (startKeyForItem && dateKey < startKeyForItem) return;
        const delta = deltaMap.get(item.id);
        if (delta) realizedDelta += delta;
      });
      initialLotsById.set(item.id, currentLots - realizedDelta);
    });
    const startKey = earliestStartKey || rangeStartKey;
    let startDate = parseDateKey(startKey);
    const endDate = parseDateKey(rangeEndKey);
    if (startDate > endDate) startDate = endDate;

    const amountBalances = new Map<number, number>();
    const lotBalances = new Map<number, number>();
    const rows: DailyRow[] = [];

    for (
      let current = startDate;
      current <= endDate;
      current = addDays(current, 1)
    ) {
      const dateKey = toDateKey(current);
      const newItems = itemsByStartDate.get(dateKey) ?? [];
      newItems.forEach((item) => {
        if (isMoexItem(item)) {
          lotBalances.set(
            item.id,
            initialLotsById.get(item.id) ?? item.position_lots ?? 0
          );
          return;
        }
        amountBalances.set(item.id, getItemDisplayInitialCents(item));
      });

      const dayDeltas = deltasByDate.get(dateKey);
      if (dayDeltas) {
        dayDeltas.forEach((delta, itemId) => {
          const currentBalance = amountBalances.get(itemId) ?? 0;
          amountBalances.set(itemId, currentBalance + delta);
        });
      }

      const dayLotDeltas = lotDeltasByDate.get(dateKey);
      if (dayLotDeltas) {
        dayLotDeltas.forEach((delta, itemId) => {
          const currentLots =
            lotBalances.get(itemId) ?? initialLotsById.get(itemId) ?? 0;
          lotBalances.set(itemId, currentLots + delta);
        });
      }

      if (dateKey < rangeStartKey) continue;

      const rateCache = new Map<string, number | null>();
      const getRate = (currency: string) => {
        if (!rateCache.has(currency)) {
          rateCache.set(
            currency,
            getRateForDate(
              fxRatesByDate,
              dateKey,
              currency,
              latestRatesByCurrency,
              todayKey
            )
          );
        }
        return rateCache.get(currency) ?? null;
      };

      const itemValues: Record<number, number | null> = {};
      const itemRubValues: Record<number, number | null> = {};
      let totalRubCents: number | null = 0;
      let totalCurrencyCents: number | null = showCurrencyColumns ? 0 : null;
      let missingRubValue = false;
      let missingCurrencyValue = false;

      effectiveSelectedItems.forEach((item) => {
        const startKeyForItem = itemStartKeyById.get(item.id) ?? "";
        if (startKeyForItem && dateKey < startKeyForItem) {
          itemValues[item.id] = null;
          itemRubValues[item.id] = null;
          return;
        }

        let valueCents: number | null = null;
        let valueCurrency = item.currency_code;

        if (isMoexItem(item)) {
          const lots =
            lotBalances.get(item.id) ?? initialLotsById.get(item.id) ?? 0;
          const priceKey = moexPriceKeyByItemId.get(item.id);
          let price: MarketPriceOut | null = null;
          
          if (priceKey) {
            // Для сегодняшней даты и будущих дат используем самую свежую цену
            if (dateKey >= todayKey) {
              // Сначала проверяем загруженные текущие цены
              price = latestPricesByKey.get(priceKey) ?? null;
              // Если нет текущей цены, используем последнюю из исторических
              if (!price) {
                price = latestMarketPriceByKey.get(priceKey) ?? null;
              }
            } else {
              // Для прошлых дат ищем цену на эту дату или ближайшую предыдущую
              const priceByDate = marketPricesByKey[priceKey];
              const priceDates = marketPriceDatesByKey.get(priceKey);
              if (priceByDate) {
                price = findPriceOnOrBefore(priceByDate, priceDates, dateKey);
              }
            }
          }
          
          const unitPriceCents = computeInstrumentUnitPriceCents(item, price);
          if (unitPriceCents != null) {
            const lotSize = item.lot_size ?? 1;
            valueCents = unitPriceCents * lots * lotSize;
            valueCurrency = price?.currency_code ?? item.currency_code;
          }
        } else {
          valueCents =
            amountBalances.get(item.id) ?? getItemDisplayInitialCents(item);
        }

        itemValues[item.id] = valueCents;

        if (valueCents == null) {
          itemRubValues[item.id] = null;
          missingRubValue = true;
          if (showCurrencyColumns) missingCurrencyValue = true;
          return;
        }

        const rate = getRate(valueCurrency);
        if (rate === null) {
          itemRubValues[item.id] = null;
          if (valueCurrency !== "RUB") missingRubValue = true;
        } else {
          const rubValueCents = Math.round((valueCents / 100) * rate * 100);
          itemRubValues[item.id] = rubValueCents;
          const effectiveKind = resolveItemEffectiveKind(item, valueCents);
          const signedRub =
            effectiveKind === "LIABILITY" ? -rubValueCents : rubValueCents;
          if (totalRubCents !== null) totalRubCents += signedRub;
        }

        if (showCurrencyColumns && singleCurrencyCode) {
          const effectiveKind = resolveItemEffectiveKind(item, valueCents);
          const signedValue =
            effectiveKind === "LIABILITY" ? -valueCents : valueCents;
          if (totalCurrencyCents !== null) totalCurrencyCents += signedValue;
        }
      });

      if (missingRubValue) totalRubCents = null;
      if (showCurrencyColumns && missingCurrencyValue) totalCurrencyCents = null;

      const rate = showCurrencyColumns && singleCurrencyCode ? getRate(singleCurrencyCode) : null;

      rows.push({
        date: dateKey,
        totalRubCents,
        totalCurrencyCents,
        rate,
        itemValues,
        itemRubValues,
      });
    }

    return rows;
  }, [
    fxRatesByDate,
    getEffectiveStartKey,
    getItemDisplayInitialCents,
    latestRatesByCurrency,
    latestMarketPriceByKey,
    latestPricesByKey,
    earliestStartKey,
    rangeEndKey,
    rangeStartKey,
    resolveItemEffectiveKind,
    marketPricesByKey,
    marketPriceDatesByKey,
    moexItemIds,
    moexItems,
    moexPriceKeyByItemId,
    effectiveSelectedItems,
    showCurrencyColumns,
    singleCurrencyCode,
    todayKey,
    transactions,
  ]);

  const chartData = useMemo(() => {
    const assetIds = new Set(
      effectiveSelectedItems.filter((i) => i.kind === "ASSET").map((i) => i.id)
    );
    const liabilityIds = new Set(
      effectiveSelectedItems.filter((i) => i.kind === "LIABILITY").map((i) => i.id)
    );
    return dailyRows.map((row) => {
      let assetsRubCents = 0;
      let liabilitiesRubCents = 0;
      Object.entries(row.itemRubValues).forEach(([idStr, cents]) => {
        const id = Number(idStr);
        if (assetIds.has(id) && cents != null) assetsRubCents += cents;
        if (liabilityIds.has(id) && cents != null) liabilitiesRubCents += cents;
      });
      const derivedNet = assetsRubCents - liabilitiesRubCents;
      const netRubCents = row.totalRubCents ?? derivedNet;
      return {
        date: row.date,
        value: netRubCents / 100,
        totalRubCents: row.totalRubCents,
        assetsRubCents,
        liabilitiesRubCents,
        netRubCents,
        itemRubValues: row.itemRubValues,
        itemValues: row.itemValues,
      };
    });
  }, [dailyRows, effectiveSelectedItems]);

  const chartDataForDisplay = useMemo(() => {
    if (periodGranularity === "day") {
      return chartData.map((p) => ({ ...p, label: formatDateLabel(p.date) }));
    }
    if (!rangeStartKey || !rangeEndKey) return [];
    const periods = listPeriodsInRange(rangeStartKey, rangeEndKey, periodGranularity);
    return periods
      .map((period) => {
        const inPeriod = chartData.filter(
          (p) => getPeriodKey(p.date, periodGranularity) === period.periodKey
        );
        if (inPeriod.length === 0) return null;
        const sorted = [...inPeriod].sort((a, b) => a.date.localeCompare(b.date));
        const last = sorted[sorted.length - 1];
        return { ...last, periodKey: period.periodKey, label: period.label };
      })
      .filter((p): p is NonNullable<typeof p> => p != null);
  }, [chartData, periodGranularity, rangeStartKey, rangeEndKey]);

  const hasAssets = effectiveSelectedItems.some((i) => i.kind === "ASSET");
  const hasLiabilities = effectiveSelectedItems.some((i) => i.kind === "LIABILITY");
  const showNetSeries = hasAssets && hasLiabilities;

  const width = chartSize.width;
  const height = chartSize.height;
  const padding = { top: 24, right: 0, bottom: 44, left: 0 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const allValues = useMemo(() => {
    const vals: number[] = [];
    chartDataForDisplay.forEach((p) => {
      if (hasAssets) vals.push(p.assetsRubCents / 100);
      if (hasLiabilities) vals.push(p.liabilitiesRubCents / 100);
      if (showNetSeries) vals.push(p.netRubCents / 100);
    });
    return vals;
  }, [chartDataForDisplay, hasAssets, hasLiabilities, showNetSeries]);
  const minValue = allValues.length ? Math.min(...allValues) : 0;
  const maxValue = allValues.length ? Math.max(...allValues) : 0;
  const rangePadding = Math.max(Math.max(maxValue, Math.abs(minValue)) * 0.12, 1);
  const paddedMin = minValue - rangePadding;
  const paddedMax = maxValue + rangePadding;
  const ticks = buildTicks(paddedMin, paddedMax);
  const chartMin = ticks[0];
  const chartMax = ticks[ticks.length - 1];
  const valueToRatio = (v: number) =>
    (v - chartMin) / (chartMax - chartMin || 1);
  const zeroRatio = Math.max(0, Math.min(1, valueToRatio(0)));
  const zeroY = padding.top + innerHeight - innerHeight * zeroRatio;

  const futureStartIndex = chartDataForDisplay.findIndex((point) => point.date > todayKey);
  const splitAt = futureStartIndex === -1 ? chartDataForDisplay.length : Math.max(futureStartIndex, 0);

  const chartSummary = useMemo(() => {
    const first = chartData[0];
    const last = chartData[chartData.length - 1];
    const netAtStart = first?.netRubCents ?? 0;
    const netAtEndOfPeriod = last?.netRubCents ?? 0;
    const currentPoint = [...chartData].reverse().find((p) => p.date <= todayKey);
    const netAtCurrentDate = currentPoint?.netRubCents ?? netAtStart;

    const actualPoints = chartDataForDisplay.filter((p) => p.date <= todayKey);
    const forecastPoints = chartDataForDisplay.filter((p) => p.date > todayKey);
    const actualNets = actualPoints.map((p) => p.netRubCents);
    const forecastNets = forecastPoints.map((p) => p.netRubCents);
    const maxActual = actualNets.length ? Math.max(...actualNets) : 0;
    const minActual = actualNets.length ? Math.min(...actualNets) : 0;
    const maxForecast = forecastNets.length ? Math.max(...forecastNets) : 0;
    const minForecast = forecastNets.length ? Math.min(...forecastNets) : 0;

    const growthToCurrent = netAtCurrentDate - netAtStart;
    const growthToEnd = netAtEndOfPeriod - netAtStart;
    const hasForecast = forecastPoints.length > 0;
    const growthToCurrentPercent =
      netAtStart !== 0 ? (growthToCurrent / Math.abs(netAtStart)) * 100 : null;
    const growthToEndPercent =
      netAtStart !== 0 ? (growthToEnd / Math.abs(netAtStart)) * 100 : null;

    return {
      netAtCurrentDate,
      netAtEndOfPeriod,
      maxActual,
      minActual,
      maxForecast,
      minForecast,
      growthToCurrent,
      growthToEnd,
      growthToCurrentPercent,
      growthToEndPercent,
      hasForecast,
    };
  }, [chartData, chartDataForDisplay, todayKey]);

  const toPoints = (getValue: (p: (typeof chartDataForDisplay)[0]) => number) =>
    chartDataForDisplay.map((point, index) => {
      const progress = chartDataForDisplay.length <= 1 ? 0 : index / (chartDataForDisplay.length - 1);
      const x = padding.left + innerWidth * progress;
      const v = getValue(point);
      const y = padding.top + innerHeight - innerHeight * valueToRatio(v);
      return { x, y, value: v };
    });

  const assetsPoints = toPoints((p) => p.assetsRubCents / 100);
  const liabilitiesPoints = toPoints((p) => p.liabilitiesRubCents / 100);
  const netPoints = toPoints((p) => p.netRubCents / 100);

  const assetsPast = splitAt > 0 ? assetsPoints.slice(0, splitAt) : [];
  const assetsFuture = splitAt < chartDataForDisplay.length ? assetsPoints.slice(splitAt - 1) : [];
  const liabilitiesPast = splitAt > 0 ? liabilitiesPoints.slice(0, splitAt) : [];
  const liabilitiesFuture = splitAt < chartDataForDisplay.length ? liabilitiesPoints.slice(splitAt - 1) : [];
  const netPast = splitAt > 0 ? netPoints.slice(0, splitAt) : [];
  const netFuture = splitAt < chartDataForDisplay.length ? netPoints.slice(splitAt - 1) : [];

  const baselineValue = chartMin;
  const baselineRatio = (baselineValue - chartMin) / (chartMax - chartMin || 1);
  const baselineY = padding.top + innerHeight - innerHeight * baselineRatio;

  const assetsPastPath = buildLinePath(assetsPast);
  const assetsFuturePath = buildLinePath(assetsFuture);
  const liabilitiesPastPath = buildLinePath(liabilitiesPast);
  const liabilitiesFuturePath = buildLinePath(liabilitiesFuture);
  const netPastPath = buildLinePath(netPast);
  const netFuturePath = buildLinePath(netFuture);

  const assetsPastAreaPath = buildAreaPath(assetsPast, baselineY);
  const liabilitiesPastAreaPath = buildAreaPath(liabilitiesPast, baselineY);
  const netPastAreaPath = buildAreaPath(netPast, baselineY);

  const hoverValueForY =
    hoverIndex !== null && chartDataForDisplay.length > 0
      ? showNetSeries
        ? chartDataForDisplay[hoverIndex].netRubCents / 100
        : hasAssets
          ? chartDataForDisplay[hoverIndex].assetsRubCents / 100
          : chartDataForDisplay[hoverIndex].liabilitiesRubCents / 100
      : 0;
  const hoverPoint =
    hoverIndex !== null && chartDataForDisplay.length > 0
      ? {
          x: padding.left + innerWidth * (chartDataForDisplay.length <= 1 ? 0 : hoverIndex / (chartDataForDisplay.length - 1)),
          y: padding.top + innerHeight - innerHeight * valueToRatio(hoverValueForY),
        }
      : null;
  const hoverData = hoverIndex !== null ? chartDataForDisplay[hoverIndex] : null;
  const hoverIsFuture = hoverData ? hoverData.date > todayKey : false;

  const markerPointsForClickedDates = useMemo(() => {
    if (clickedChartDates.length === 0 || chartDataForDisplay.length === 0) return [];
    const points = showNetSeries ? netPoints : hasAssets ? assetsPoints : liabilitiesPoints;
    return clickedChartDates.map((dateKey, i) => {
      const index = chartDataForDisplay.findIndex((p) => p.date === dateKey);
      if (index === -1) return null;
      const pt = points[index];
      if (!pt) return null;
      return { dateKey, label: String(i + 1), x: pt.x, y: pt.y };
    }).filter((m): m is NonNullable<typeof m> => m != null);
  }, [clickedChartDates, chartDataForDisplay, netPoints, assetsPoints, liabilitiesPoints, showNetSeries, hasAssets]);

  const arrowFromFirstToSecond = useMemo(() => {
    if (markerPointsForClickedDates.length !== 2 || chartDataForDisplay.length === 0) return null;
    const [m1, m2] = markerPointsForClickedDates;
    const getValueRub = (p: (typeof chartDataForDisplay)[0]) =>
      showNetSeries ? p.netRubCents / 100 : hasAssets ? p.assetsRubCents / 100 : p.liabilitiesRubCents / 100;
    const point1 = chartDataForDisplay.find((p) => p.date === m1.dateKey);
    const point2 = chartDataForDisplay.find((p) => p.date === m2.dateKey);
    if (!point1 || !point2) return null;
    const value1Rub = getValueRub(point1);
    const value2Rub = getValueRub(point2);
    const growthRub = value2Rub - value1Rub;
    const growthRubCents = Math.round(growthRub * 100);
    const growthPercent =
      value1Rub !== 0 ? (growthRub / Math.abs(value1Rub)) * 100 : null;
    return {
      x1: m1.x,
      y1: m1.y,
      x2: m2.x,
      y2: m2.y,
      midX: (m1.x + m2.x) / 2,
      midY: (m1.y + m2.y) / 2,
      growthRubCents,
      growthPercent,
    };
  }, [markerPointsForClickedDates, chartDataForDisplay, showNetSeries, hasAssets]);

  const dayMarks = useMemo(() => {
    if (chartDataForDisplay.length < 2) return [];
    if (periodGranularity === "day") {
      return buildDayMarks(
        chartDataForDisplay[0].date,
        chartDataForDisplay[chartDataForDisplay.length - 1].date,
        width,
        padding
      );
    }
    const n = chartDataForDisplay.length;
    return chartDataForDisplay.map((p, i) => ({
      label:
        periodGranularity === "week" && "periodKey" in p && p.periodKey
          ? ((p as { periodKey: string }).periodKey.match(/W(\d{2})$/)?.[1] ?? p.label)
          : p.label,
      x:
        padding.left +
        innerWidth * (n <= 1 ? 0 : i / (n - 1)),
    }));
  }, [chartDataForDisplay, periodGranularity, width, padding, innerWidth]);

  const chartDividers = useMemo(() => {
    if (chartDataForDisplay.length <= 1) return [];
    const divs: { x: number; type: "month" | "year" }[] = [];
    const n = chartDataForDisplay.length;
    for (let i = 1; i < n; i++) {
      const prevDate = chartDataForDisplay[i - 1].date;
      const currDate = chartDataForDisplay[i].date;
      const prevYear = parseInt(prevDate.slice(0, 4), 10);
      const prevMonth = parseInt(prevDate.slice(5, 7), 10);
      const currYear = parseInt(currDate.slice(0, 4), 10);
      const currMonth = parseInt(currDate.slice(5, 7), 10);
      const progress = (n - 1) > 0 ? i / (n - 1) : 0;
      const x = padding.left + innerWidth * progress;
      if (currYear !== prevYear) divs.push({ x, type: "year" });
      else if (currMonth !== prevMonth) divs.push({ x, type: "month" });
    }
    return divs;
  }, [chartDataForDisplay, padding.left, innerWidth]);

  useEffect(() => {
    if (!chartRef.current) return;
    const element = chartRef.current;

    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      const nextWidth = Math.max(1, Math.round(rect.width));
      const nextHeight = Math.max(1, Math.round(rect.height));
      setChartSize((prev) => {
        if (prev.width === nextWidth && prev.height === nextHeight) return prev;
        return { width: nextWidth, height: nextHeight };
      });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!hoverPoint || !chartRef.current || !tooltipRef.current) {
      setTooltipLeft(null);
      return;
    }
    const containerWidth = chartRef.current.clientWidth;
    const tooltipWidth = tooltipRef.current.offsetWidth;
    const paddingEdge = 12;
    const clamped = Math.min(
      Math.max(hoverPoint.x, tooltipWidth / 2 + paddingEdge),
      containerWidth - tooltipWidth / 2 - paddingEdge
    );
    setTooltipLeft(clamped);
  }, [hoverPoint?.x, hoverIndex, chartSize.width]);

  const handlePointerMove = (event: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || chartDataForDisplay.length === 0) return;
    if (chartDataForDisplay.length === 1) {
      setHoverIndex(0);
      return;
    }
    const ctm = svgRef.current.getScreenCTM();
    if (!ctm) return;
    let svgX = 0;
    if (typeof DOMPoint !== "undefined") {
      const point = new DOMPoint(event.clientX, event.clientY);
      svgX = point.matrixTransform(ctm.inverse()).x;
    } else {
      const point = svgRef.current.createSVGPoint();
      point.x = event.clientX;
      point.y = event.clientY;
      svgX = point.matrixTransform(ctm.inverse()).x;
    }
    const clampedX = Math.min(
      Math.max(svgX, padding.left),
      width - padding.right
    );
    const progress = (clampedX - padding.left) / innerWidth;
    const index = Math.round(progress * (chartDataForDisplay.length - 1));
    setHoverIndex(Math.min(Math.max(index, 0), chartDataForDisplay.length - 1));
  };

  const handleChartClick = (event: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || chartDataForDisplay.length === 0) return;
    const ctm = svgRef.current.getScreenCTM();
    if (!ctm) return;
    let svgX = 0;
    if (typeof DOMPoint !== "undefined") {
      const point = new DOMPoint(event.clientX, event.clientY);
      svgX = point.matrixTransform(ctm.inverse()).x;
    } else {
      const point = svgRef.current.createSVGPoint();
      point.x = event.clientX;
      point.y = event.clientY;
      svgX = point.matrixTransform(ctm.inverse()).x;
    }
    const clampedX = Math.min(
      Math.max(svgX, padding.left),
      width - padding.right
    );
    const progress = (clampedX - padding.left) / innerWidth;
    const index = Math.round(progress * (chartDataForDisplay.length - 1));
    const safeIndex = Math.min(Math.max(index, 0), chartDataForDisplay.length - 1);
    const date = chartDataForDisplay[safeIndex]?.date;
    if (!date) return;
    setClickedChartDates((prev) => {
      if (prev.length === 0) return [date];
      if (prev.length === 1) {
        if (prev[0] === date) return prev;
        return [prev[0], date];
      }
      return [date];
    });
  };

  const dateSnapshotRows = useMemo(() => {
    if (clickedChartDates.length === 0) return [];
    return clickedChartDates
      .map((dateKey) => dailyRows.find((r) => r.date === dateKey))
      .filter((r): r is DailyRow => r != null);
  }, [clickedChartDates, dailyRows]);

  return (
    <main className="min-h-screen px-8 py-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        {error && <div className="text-sm text-red-600">{error}</div>}

        <div className="space-y-4">
          <div className="flex flex-nowrap items-start gap-6">
            <div className="min-w-0 flex-1">
              <FilterSection
                label="Активы и обязательства"
                onReset={() => setSelectedItemIds([])}
                showReset={selectedItemIds.length > 0}
              >
                <ItemSelector
                  items={sortedItems}
                  selectedIds={selectedItemIds}
                  onChange={setSelectedItemIds}
                  selectionMode="multi"
                  placeholder="Начните вводить название"
                  emptyMessage="Нет активов и обязательств"
                  noResultsMessage="Ничего не найдено"
                  getItemTypeLabel={getItemTypeLabel}
                  getItemKind={(item) => resolveItemEffectiveKind(item, item.current_value_rub)}
                  getBankLogoUrl={itemCounterpartyLogoUrl}
                  getBankName={itemCounterpartyName}
                  getItemBalance={getItemDisplayBalanceCents}
                  itemCounts={itemTxCounts}
                  ariaLabel="Активы и обязательства"
                />
              </FilterSection>
            </div>
            <div className="grid w-fit gap-2 shrink-0">
              <Label style={{ color: ACTIVE_TEXT_DARK }} className="flex flex-wrap items-center gap-x-1.5 gap-y-0">
                <span>Период</span>
                <Tooltip
                  content="Д – День, Н – Неделя, М – Месяц, Г – Год"
                  side="top"
                  className="inline-flex items-center"
                >
                  <span
                    className="inline-flex items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 cursor-help"
                    style={{ color: PLACEHOLDER_COLOR_DARK }}
                    tabIndex={0}
                  >
                    <Info className="w-4 h-4" />
                  </span>
                </Tooltip>
              </Label>
              <SegmentedSelector
                className="w-fit"
                segmentWidth="auto"
                options={[
                  { value: "day", label: "Д" },
                  { value: "week", label: "Н" },
                  { value: "month", label: "М" },
                  { value: "year", label: "Г" },
                ]}
                value={periodGranularity}
                onChange={(value) => {
                  const v = typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;
                  if (v === "day" || v === "week" || v === "month" || v === "year") setPeriodGranularity(v);
                }}
                multiple={false}
              />
            </div>
          </div>

          <div className="flex flex-nowrap items-end gap-6">
            <div className="grid w-fit gap-2 shrink-0">
              <Label style={{ color: ACTIVE_TEXT_DARK }}>История</Label>
              <SegmentedSelector
                className="w-fit"
                segmentWidth="auto"
                options={[
                  { value: "all", label: "Все время" },
                  { value: "last_month", label: "Мес" },
                  { value: "last_quarter", label: "Квартал" },
                  { value: "last_year", label: "Год" },
                  { value: "custom", label: "Свой диапазон" },
                ]}
                value={historyPreset}
                onChange={(value) => {
                  const v = typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;
                  if (v === "all" || v === "last_month" || v === "last_quarter" || v === "last_year" || v === "custom") setHistoryPreset(v);
                }}
                multiple={false}
              />
            </div>
            <div className="grid w-fit gap-2 shrink-0">
              <Label style={{ color: ACTIVE_TEXT_DARK }}>Прогноз</Label>
              <SegmentedSelector
                className="w-fit"
                segmentWidth="auto"
                options={[
                  { value: "next_month", label: "Мес" },
                  { value: "next_quarter", label: "Квартал" },
                  { value: "next_year", label: "Год" },
                  { value: "custom", label: "Свой диапазон" },
                ]}
                value={forecastPreset}
                onChange={(value) => {
                  const v = typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;
                  if (v === "next_month" || v === "next_quarter" || v === "next_year" || v === "custom") setForecastPreset(v);
                }}
                multiple={false}
              />
            </div>
          </div>

          {(historyPreset === "custom" || forecastPreset === "custom") && (
            <div className="grid gap-4 sm:grid-cols-2">
              {historyPreset === "custom" && (
                <DateField
                  label="Диапазон от"
                  min={rangeStartFloor || undefined}
                  value={rangeStart}
                  onChange={(e) => {
                    const next = e.target.value;
                    setRangeStart(next);
                    if (rangeEnd && next && rangeEnd < next) setRangeEnd(next);
                  }}
                  disabled={effectiveSelectedItems.length === 0}
                />
              )}
              {forecastPreset === "custom" && (
                <DateField
                  label="Диапазон до"
                  min={rangeStartKey || undefined}
                  value={rangeEnd}
                  onChange={(e) => setRangeEnd(e.target.value)}
                  disabled={effectiveSelectedItems.length === 0}
                />
              )}
            </div>
          )}
        </div>

        <div
          className="relative rounded-lg overflow-hidden border-0 outline-none px-6 pt-6 pb-6"
          style={{ backgroundColor: MODAL_BG }}
        >
          <div className="px-0">
            {rangeStartKey && rangeEndKey && chartDataForDisplay.length > 0 && (
              <div className="flex flex-wrap items-start gap-6 mb-6">
                <div className="flex flex-col gap-1">
                  <div className="text-[48px] font-semibold leading-tight">
                    <span
                      style={{ background: PINK_GRADIENT, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}
                    >
                      {formatRub(chartSummary.netAtCurrentDate)}
                    </span>
                    <span style={{ color: PLACEHOLDER_COLOR_DARK }}> / </span>
                    <span style={{ color: PLACEHOLDER_COLOR_DARK }}>
                      {formatRub(chartSummary.netAtEndOfPeriod)}
                    </span>
                  </div>
                  <div className="text-[14px] font-normal">
                    <span style={{ color: PLACEHOLDER_COLOR_DARK }}>за период </span>
                    <span style={{ color: ACTIVE_TEXT_DARK }}>
                      {[rangeStartKey, rangeEndKey].map((k) => { const [y, m, d] = k.split("-"); return `${d}.${m}.${y.slice(2)}`; }).join(" - ")}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  {[
                    { label: "Max", value: chartSummary.maxActual, forecastValue: chartSummary.maxForecast },
                    { label: "Min", value: chartSummary.minActual, forecastValue: chartSummary.minForecast },
                    {
                      label: "Прирост",
                      value: chartSummary.growthToCurrentPercent,
                      forecastValue: chartSummary.growthToEndPercent,
                      asPercent: true,
                      alwaysTwo: true,
                    },
                  ].map(({ label, value, forecastValue, alwaysTwo, asPercent }) => (
                    <div key={label} className="flex items-center gap-2">
                      <span
                        className="w-20 shrink-0 text-[14px] font-normal"
                        style={{ color: PLACEHOLDER_COLOR_DARK }}
                      >
                        {label}
                      </span>
                      <span
                        className="min-w-[10rem] shrink-0 rounded-[9px] px-2 py-1 text-right text-[14px] font-normal tabular-nums"
                        style={{ backgroundColor: BACKGROUND_DT, color: ACTIVE_TEXT_DARK }}
                      >
                        {asPercent
                          ? formatGrowthPercent(value as number | null)
                          : formatRub(value as number)}
                        {(alwaysTwo || chartSummary.hasForecast) && (
                          <>
                            <span style={{ color: PLACEHOLDER_COLOR_DARK }}> / </span>
                            <span style={{ color: PLACEHOLDER_COLOR_DARK }}>
                              {asPercent
                                ? formatGrowthPercent(forecastValue as number | null)
                                : formatRub(forecastValue as number)}
                            </span>
                          </>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div
              className="relative py-6"
              style={{
                opacity: loading ? 0 : 1,
                transition: "opacity 0.3s ease-in-out",
              }}
            >
              {error && (
                <div className="flex h-80 items-center justify-center text-sm text-red-600">
                  {error}
                </div>
              )}

              {!error && effectiveSelectedItems.length === 0 && !loading && (
                <div className="flex h-80 items-center justify-center text-sm text-muted-foreground">
                  Нет активов и обязательств для построения отчета.
                </div>
              )}

              {!error && effectiveSelectedItems.length > 0 && chartDataForDisplay.length === 0 && !loading && (
                <div className="flex h-80 items-center justify-center text-sm text-muted-foreground">
                  Нет данных для выбранного периода.
                </div>
              )}

              {!error && effectiveSelectedItems.length > 0 && chartDataForDisplay.length > 0 && (
                <div
                  ref={chartRef}
                  className="relative w-full min-w-0"
                  style={{ aspectRatio: `${width}/${height}` }}
                >
                  {hoverPoint && hoverData && (
                    <div
                      ref={tooltipRef}
                      className="pointer-events-none absolute z-20 whitespace-nowrap rounded-[9px] px-4 py-3 text-[14px] font-normal text-right"
                      style={{
                        left: tooltipLeft != null ? `${tooltipLeft}px` : `${hoverPoint.x}px`,
                        top: 0,
                        transform: "translate(-50%, 0)",
                        backgroundColor: MODAL_BG,
                      }}
                    >
                      <div className="whitespace-nowrap" style={{ color: PLACEHOLDER_COLOR_DARK }}>
                        {periodGranularity === "week" && "periodKey" in hoverData && hoverData.periodKey
                          ? formatWeekPeriodAsDateRange((hoverData as { periodKey: string }).periodKey)
                          : hoverData.label}
                      </div>
                      <div className="mt-2 space-y-1">
                        {hasAssets && (
                          <div className="flex items-center justify-between gap-3" style={{ color: GREEN }}>
                            <span>Активы</span>
                            <span>{formatRub(hoverData.assetsRubCents)}</span>
                          </div>
                        )}
                        {hasLiabilities && (
                          <div className="flex items-center justify-between gap-3" style={{ color: RED }}>
                            <span>Пассивы</span>
                            <span>{formatRub(hoverData.liabilitiesRubCents)}</span>
                          </div>
                        )}
                        {showNetSeries && (
                          <div className="flex items-center justify-between gap-3" style={{ color: ACTIVE_TEXT_DARK }}>
                            <span>Чистые активы</span>
                            <span>{formatSignedValue(hoverData.netRubCents, formatRub)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  <svg
                    ref={svgRef}
                    viewBox={`0 0 ${width} ${height}`}
                    className="h-full w-full cursor-pointer"
                    role="img"
                    aria-label="График динамики стоимости активов"
                    onMouseMove={handlePointerMove}
                    onMouseLeave={() => setHoverIndex(null)}
                    onClick={handleChartClick}
                  >
                    <defs>
                      <linearGradient id="assetsAreaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={GREEN} stopOpacity="0.35" />
                        <stop offset="100%" stopColor={GREEN} stopOpacity="0" />
                      </linearGradient>
                      <linearGradient id="liabilitiesAreaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={RED} stopOpacity="0.35" />
                        <stop offset="100%" stopColor={RED} stopOpacity="0" />
                      </linearGradient>
                      <linearGradient id="netAreaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={ACCENT} stopOpacity="0.35" />
                        <stop offset="100%" stopColor={ACCENT} stopOpacity="0" />
                      </linearGradient>
                      <marker
                        id="arrowheadGreen"
                        markerWidth="10"
                        markerHeight="7"
                        refX="9"
                        refY="3.5"
                        orient="auto"
                      >
                        <polygon points="0 0, 10 3.5, 0 7" fill={GREEN} />
                      </marker>
                      <marker
                        id="arrowheadRed"
                        markerWidth="10"
                        markerHeight="7"
                        refX="9"
                        refY="3.5"
                        orient="auto"
                      >
                        <polygon points="0 0, 10 3.5, 0 7" fill={RED} />
                      </marker>
                    </defs>
                    {hasAssets && assetsPastAreaPath && (
                      <path d={assetsPastAreaPath} fill="url(#assetsAreaGrad)" />
                    )}
                    {hasLiabilities && liabilitiesPastAreaPath && (
                      <path d={liabilitiesPastAreaPath} fill="url(#liabilitiesAreaGrad)" />
                    )}
                    {showNetSeries && netPastAreaPath && (
                      <path d={netPastAreaPath} fill="url(#netAreaGrad)" />
                    )}
                    {hasAssets && assetsPastPath && (
                      <path
                        d={assetsPastPath}
                        fill="none"
                        stroke={GREEN}
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    )}
                    {hasAssets && assetsFuturePath && (
                      <path
                        d={assetsFuturePath}
                        fill="none"
                        stroke={GREEN}
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeDasharray="8 6"
                      />
                    )}
                    {hasLiabilities && liabilitiesPastPath && (
                      <path
                        d={liabilitiesPastPath}
                        fill="none"
                        stroke={RED}
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    )}
                    {hasLiabilities && liabilitiesFuturePath && (
                      <path
                        d={liabilitiesFuturePath}
                        fill="none"
                        stroke={RED}
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeDasharray="8 6"
                      />
                    )}
                    {showNetSeries && netPastPath && (
                      <path
                        d={netPastPath}
                        fill="none"
                        stroke={ACCENT}
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    )}
                    {showNetSeries && netFuturePath && (
                      <path
                        d={netFuturePath}
                        fill="none"
                        stroke={ACCENT}
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeDasharray="8 6"
                      />
                    )}
                    {chartDividers.map((div, idx) => (
                      <line
                        key={`div-${idx}-${div.x}`}
                        x1={div.x}
                        x2={div.x}
                        y1={padding.top}
                        y2={padding.top + innerHeight}
                        stroke={PLACEHOLDER_COLOR_DARK}
                        strokeWidth={div.type === "year" ? 1.5 : 1}
                        strokeOpacity={div.type === "year" ? 0.9 : 0.5}
                      />
                    ))}
                    <line
                      x1={padding.left}
                      x2={width - padding.right}
                      y1={zeroY}
                      y2={zeroY}
                      stroke={PLACEHOLDER_COLOR_DARK}
                      strokeWidth="1"
                      strokeDasharray="4 4"
                      strokeOpacity="0.7"
                    />
                    {arrowFromFirstToSecond && (() => {
                      const { x1, y1, x2, y2, midX, growthRubCents, growthPercent } = arrowFromFirstToSecond;
                      const inset = 14;
                      const yTop = padding.top + 8;
                      const y1Start = y1 + inset;
                      const y2End = y2 - inset;
                      const pathD = `M ${x1} ${y1Start} L ${x1} ${yTop} L ${x2} ${yTop} L ${x2} ${y2End}`;
                      const labelY = yTop - 10;
                      const isLiabilitiesSeries = !showNetSeries && !hasAssets && hasLiabilities;
                      const positiveIsGood = !isLiabilitiesSeries;
                      const arrowColor = (growthRubCents >= 0) === positiveIsGood ? GREEN : RED;
                      const markerEnd = (growthRubCents >= 0) === positiveIsGood ? "url(#arrowheadGreen)" : "url(#arrowheadRed)";
                      return (
                        <g>
                          <path
                            d={pathD}
                            fill="none"
                            stroke={arrowColor}
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            markerEnd={markerEnd}
                          />
                          <text
                            x={midX}
                            y={labelY}
                            textAnchor="middle"
                            fontSize="11"
                            fontWeight={500}
                            fill={arrowColor}
                          >
                            {formatSignedValue(growthRubCents, formatRub)}  ({formatGrowthPercent(growthPercent)})
                          </text>
                        </g>
                      );
                    })()}
                    {markerPointsForClickedDates.map((m) => (
                      <g key={m.dateKey}>
                        <line
                          x1={m.x}
                          x2={m.x}
                          y1={padding.top}
                          y2={padding.top + innerHeight}
                          stroke={PLACEHOLDER_COLOR_DARK}
                          strokeDasharray="4 6"
                          strokeOpacity={0.7}
                        />
                        <rect
                          x={m.x - 12}
                          y={m.y - 12}
                          width={24}
                          height={24}
                          rx={9}
                          ry={9}
                          fill={ACCENT2}
                        />
                        <text
                          x={m.x}
                          y={m.y}
                          textAnchor="middle"
                          dominantBaseline="central"
                          fontSize="12"
                          fontWeight={600}
                          fill={ACTIVE_TEXT_DARK}
                        >
                          {m.label}
                        </text>
                      </g>
                    ))}
                    {hoverPoint && (
                      <>
                        <line
                          x1={hoverPoint.x}
                          x2={hoverPoint.x}
                          y1={padding.top}
                          y2={padding.top + innerHeight}
                          stroke={PLACEHOLDER_COLOR_DARK}
                          strokeDasharray="4 6"
                        />
                        <circle
                          cx={hoverPoint.x}
                          cy={hoverPoint.y}
                          r="6"
                          fill={showNetSeries ? ACCENT : hasAssets ? GREEN : RED}
                          stroke="#fff"
                          strokeWidth="2"
                        />
                      </>
                    )}
                    {dayMarks.map((mark, idx) => (
                      <text
                        key={`${mark.label}-${idx}`}
                        x={mark.x}
                        y={height - 12}
                        textAnchor={idx === 0 ? "start" : idx === dayMarks.length - 1 ? "end" : "middle"}
                        fontSize="14"
                        fontWeight={400}
                        fill={ACTIVE_TEXT_DARK}
                      >
                        {mark.label}
                      </text>
                    ))}
                  </svg>
                </div>
              )}
            </div>
          </div>
        </div>

        {clickedChartDates.length >= 1 && dateSnapshotRows.length > 0 && (
          <>
            <div className="flex items-center justify-between py-2">
              <h3 className="text-base font-semibold" style={{ color: ACTIVE_TEXT_DARK }}>
                Остатки на выбранные даты
              </h3>
              <button
                type="button"
                onClick={() => setClickedChartDates([])}
                className="text-sm rounded-md px-3 py-1.5 hover:bg-white/10 transition-colors"
                style={{ color: PLACEHOLDER_COLOR_DARK }}
              >
                Закрыть
              </button>
            </div>
            {[
              { kind: "ASSET" as const, label: "Активы", items: effectiveSelectedItems.filter((i) => i.kind === "ASSET") },
              { kind: "LIABILITY" as const, label: "Обязательства", items: effectiveSelectedItems.filter((i) => i.kind === "LIABILITY") },
            ]
              .filter((section) => section.items.length > 0)
              .map((section) => {
              const isLiabilitySection = section.kind === "LIABILITY";
              const positiveIsGood = !isLiabilitySection;
              const growthPositiveIsGood = positiveIsGood;
              const totalRubByDate = dateSnapshotRows.map((row) =>
                section.items.reduce((sum, item) => {
                  const rubCents = row.itemRubValues[item.id] ?? null;
                  const valueCents = row.itemValues[item.id] ?? null;
                  const effectiveKind = valueCents != null ? resolveItemEffectiveKind(item, valueCents) : item.kind;
                  const signed = rubCents != null && effectiveKind === "LIABILITY" ? -rubCents : rubCents ?? 0;
                  return sum + signed;
                }, 0)
              );
              const totalGrowthPercent =
                dateSnapshotRows.length === 2 && totalRubByDate[0] !== 0
                  ? isLiabilitySection
                    ? (Math.abs(totalRubByDate[1]) - Math.abs(totalRubByDate[0])) / Math.abs(totalRubByDate[0]) * 100
                    : (totalRubByDate[1] - totalRubByDate[0]) / Math.abs(totalRubByDate[0]) * 100
                  : null;
              return (
                <div
                  key={section.kind}
                  className="relative rounded-lg overflow-hidden border-0 outline-none"
                  style={{ backgroundColor: MODAL_BG }}
                >
                  <div className="px-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                            <thead>
                              <tr style={{ color: PLACEHOLDER_COLOR_DARK, backgroundColor: BACKGROUND_DT }}>
                                <th className="pl-8 pr-6 py-3 text-sm font-medium">{section.kind === "ASSET" ? "Актив" : "Обязательство"}</th>
                                {dateSnapshotRows.map((_, i) => (
                                  <Fragment key={clickedChartDates[i]}>
                                    {i === 1 && dateSnapshotRows.length === 2 && (
                                      <th className="px-3 py-3 text-sm font-medium text-center w-20">Прирост</th>
                                    )}
                                    <th className={`px-6 py-3 text-sm font-medium text-center ${i === dateSnapshotRows.length - 1 ? "pr-8" : ""}`}>
                                      {formatDateLabel(clickedChartDates[i])}
                                    </th>
                                  </Fragment>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {section.items.map((item) => {
                                const currencyCode = item.currency_code ?? "RUB";
                                const counterparty = item.counterparty_id != null ? counterpartiesById.get(item.counterparty_id) ?? null : null;
                                const rowRubByDate = dateSnapshotRows.map((row) => {
                                  const valueCents = row.itemValues[item.id] ?? null;
                                  const rubCents = row.itemRubValues[item.id] ?? null;
                                  const effectiveKind = valueCents != null ? resolveItemEffectiveKind(item, valueCents) : item.kind;
                                  const signedRub = rubCents != null && effectiveKind === "LIABILITY" ? -rubCents : rubCents;
                                  return signedRub;
                                });
                                const rowGrowthPercent =
                                  dateSnapshotRows.length === 2 && rowRubByDate[0] != null && rowRubByDate[1] != null && rowRubByDate[0] !== 0
                                    ? isLiabilitySection
                                      ? (Math.abs(rowRubByDate[1] ?? 0) - Math.abs(rowRubByDate[0] ?? 0)) / Math.abs(rowRubByDate[0]) * 100
                                      : ((rowRubByDate[1] ?? 0) - (rowRubByDate[0] ?? 0)) / Math.abs(rowRubByDate[0]) * 100
                                    : null;
                                const growthColor = rowGrowthPercent != null && rowGrowthPercent !== 0 ? ((rowGrowthPercent >= 0) === growthPositiveIsGood ? GREEN : RED) : undefined;
                                const colSpan = 1 + dateSnapshotRows.length + (dateSnapshotRows.length === 2 ? 1 : 0);
                                const isExpanded = expandedItemId === item.id;
                                const dateStart = clickedChartDates[0];
                                const dateEnd = clickedChartDates[1];
                                const txsInRange =
                                  dateStart && dateEnd && dateStart !== dateEnd
                                    ? transactions
                                        .filter((tx) => {
                                          const d = toTxDateKey(tx.transaction_date);
                                          return d >= dateStart && d <= dateEnd && getTxDeltaForItem(tx, item.id, item.kind) !== null;
                                        })
                                        .map((tx) => {
                                          const res = getTxDeltaForItem(tx, item.id, item.kind)!;
                                          return { tx, deltaCents: res.deltaCents, inCurrency: res.inCurrency };
                                        })
                                        .sort((a, b) => toTxDateKey(a.tx.transaction_date).localeCompare(toTxDateKey(b.tx.transaction_date)))
                                    : [];
                                return (
                                  <Fragment key={item.id}>
                                  <tr
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => setExpandedItemId((id) => (id === item.id ? null : item.id))}
                                    onKeyDown={(e) => e.key === "Enter" && setExpandedItemId((id) => (id === item.id ? null : item.id))}
                                    className="border-t border-white/10 transition-colors hover:bg-white/[0.06] cursor-pointer"
                                  >
                                    <td className="pl-8 pr-6 py-3 text-sm">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <div className="h-5 w-5 shrink-0 rounded-sm overflow-hidden flex items-center justify-center">
                                          <AssetItemIcon
                                            item={item}
                                            counterparty={counterparty ?? null}
                                            apiBase={API_BASE}
                                            size={20}
                                            className="h-5 w-5 rounded-sm object-contain"
                                            fallbackIconColor={ACTIVE_TEXT_DARK}
                                            alt={itemCounterpartyName(item.id) || item.name || ""}
                                          />
                                        </div>
                                        <span style={{ color: ACTIVE_TEXT_DARK }}>{item.name}</span>
                                        {currencyCode && (
                                          <span
                                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase ${getCurrencyBadgeClass(currencyCode)}`}
                                          >
                                            {currencyCode}
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                    {dateSnapshotRows.map((row, dateIdx) => {
                                      const valueCents = row.itemValues[item.id] ?? null;
                                      const rubCents = row.itemRubValues[item.id] ?? null;
                                      const effectiveKind = valueCents != null ? resolveItemEffectiveKind(item, valueCents) : item.kind;
                                      const signedValue = valueCents != null && effectiveKind === "LIABILITY" ? -valueCents : valueCents;
                                      const signedRub = rubCents != null && effectiveKind === "LIABILITY" ? -rubCents : rubCents;
                                      const formatCur = (cents: number) =>
                                        new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
                                      const showCurrencyAmount = currencyCode !== "RUB" && valueCents != null;
                                      return (
                                        <Fragment key={row.date}>
                                          {dateIdx === 1 && dateSnapshotRows.length === 2 && (
                                            <td className="px-3 py-3 text-center tabular-nums text-sm" style={growthColor ? { color: growthColor } : undefined}>
                                              {rowGrowthPercent != null ? formatGrowthPercent(rowGrowthPercent) : "–"}
                                            </td>
                                          )}
                                          <td className={`px-4 py-3 text-right tabular-nums ${dateIdx === dateSnapshotRows.length - 1 ? "pr-8" : ""}`}>
                                            <div className="flex flex-col items-end gap-0.5">
                                              <span className="text-sm" style={{ color: ACTIVE_TEXT_DARK }}>
                                                {rubCents == null ? "–" : isLiabilitySection ? formatRub(Math.abs(signedRub ?? 0)) : formatSignedValue(signedRub ?? 0, formatRub)}
                                              </span>
                                              {showCurrencyAmount && (
                                                <span className="text-[10px]" style={{ color: PLACEHOLDER_COLOR_DARK }}>
                                                  {isLiabilitySection ? formatCur(Math.abs(signedValue ?? 0)) : formatSignedValue(signedValue ?? 0, formatCur)} {currencyCode}
                                                </span>
                                              )}
                                            </div>
                                          </td>
                                        </Fragment>
                                      );
                                    })}
                                  </tr>
                                  {isExpanded && (
                                    <tr style={{ backgroundColor: BACKGROUND_DT }}>
                                      <td colSpan={colSpan} className="py-3 pl-8 pr-8 align-middle" style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                                        <table className="w-full text-left border-collapse text-sm" style={{ color: ACTIVE_TEXT_DARK }}>
                                          <tbody>
                                            {txsInRange.map(({ tx, deltaCents, inCurrency }) => {
                                              const d = toTxDateKey(tx.transaction_date);
                                              const rate = currencyCode !== "RUB" ? getRateForDate(fxRatesByDate, d, currencyCode, latestRatesByCurrency, todayKey) : null;
                                              const currencyUnits = currencyCode !== "RUB" ? (inCurrency ? deltaCents / 100 : (rate != null && rate !== 0 ? deltaCents / (100 * rate) : null)) : null;
                                              const rubCents = currencyCode !== "RUB" ? (inCurrency && rate != null ? Math.round(deltaCents * rate) : deltaCents) : deltaCents;
                                              const categoryPath = tx.category_id != null ? (categoryLookup.idToPath.get(tx.category_id) ?? []) : [];
                                              const categoryLabel = categoryPath.length > 0 ? categoryPath[categoryPath.length - 1]! : null;
                                              const isTransfer = tx.direction === "TRANSFER";
                                              const otherItemId = isTransfer
                                                ? (tx.primary_item_id === item.id || tx.primary_card_item_id === item.id
                                                  ? (tx.counterparty_item_id ?? tx.counterparty_card_item_id)
                                                  : (tx.primary_item_id ?? tx.primary_card_item_id))
                                                : null;
                                              const otherItem = otherItemId != null ? itemsById.get(otherItemId) ?? null : null;
                                              const otherCounterparty = otherItem?.counterparty_id != null ? counterpartiesById.get(otherItem.counterparty_id) ?? null : null;
                                              const amountColor = tx.direction === "EXPENSE" ? RED : tx.direction === "INCOME" ? GREEN : ACCENT;
                                              return (
                                                <tr key={tx.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                                                  <td className="py-1.5 pr-4 align-middle" style={{ color: ACTIVE_TEXT_DARK }}>{formatTxDateCell(tx.transaction_date)}</td>
                                                  <td className="py-1.5 pr-4 align-middle">
                                                    {isTransfer && otherItem ? (
                                                      <div className="flex flex-col gap-0.5">
                                                        <span className="text-xs" style={{ color: PLACEHOLDER_COLOR_DARK }}>{deltaCents < 0 ? "Перевод на" : "Перевод с"}</span>
                                                        <div className="flex items-center gap-2">
                                                          <div className="h-5 w-5 shrink-0 rounded-sm overflow-hidden flex items-center justify-center">
                                                            <AssetItemIcon
                                                              item={otherItem}
                                                              counterparty={otherCounterparty ?? null}
                                                              apiBase={API_BASE}
                                                              size={20}
                                                              className="h-5 w-5 rounded-sm object-contain"
                                                              fallbackIconColor={ACTIVE_TEXT_DARK}
                                                              alt={itemCounterpartyName(otherItem.id) || otherItem.name || ""}
                                                            />
                                                          </div>
                                                          <span style={{ color: ACTIVE_TEXT_DARK }}>{otherItem.name}</span>
                                                        </div>
                                                      </div>
                                                    ) : tx.category_id != null ? (
                                                      <div className="flex items-center gap-2">
                                                        <CategoryIconImage
                                                          categoryId={tx.category_id}
                                                          categoryLookup={categoryLookup}
                                                          apiBase={API_BASE}
                                                          size={18}
                                                          className="h-4 w-4 rounded-sm object-contain shrink-0"
                                                          fallbackIconColor={ACTIVE_TEXT_DARK}
                                                        />
                                                        <span style={{ color: ACTIVE_TEXT_DARK }}>{categoryLabel ?? "–"}</span>
                                                      </div>
                                                    ) : <span style={{ color: PLACEHOLDER_COLOR_DARK }}>–</span>}
                                                  </td>
                                                  <td className="py-1.5 pr-4 align-middle">
                                                    {tx.comment?.trim() ? (
                                                      <div className="flex items-center gap-1.5" style={{ color: PLACEHOLDER_COLOR_DARK }}>
                                                        <MessageSquare className="h-3.5 w-3.5 shrink-0" style={{ color: PLACEHOLDER_COLOR_DARK }} />
                                                        <span className="text-xs">{tx.comment.trim()}</span>
                                                      </div>
                                                    ) : <span style={{ color: PLACEHOLDER_COLOR_DARK }}>–</span>}
                                                  </td>
                                                  {currencyCode !== "RUB" && <td className="py-1.5 pr-4 text-right tabular-nums align-middle" style={{ color: amountColor }}>{currencyUnits != null ? new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(currencyUnits) : "–"} {currencyCode}</td>}
                                                  {currencyCode !== "RUB" && <td className="py-1.5 pr-4 text-right tabular-nums align-middle" style={{ color: PLACEHOLDER_COLOR_DARK }}>{rate != null ? new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(rate) : "–"}</td>}
                                                  <td className="py-1.5 text-right tabular-nums align-middle" style={{ color: amountColor }}>{formatSignedValue(rubCents, formatRub)}</td>
                                                </tr>
                                              );
                                            })}
                                          </tbody>
                                        </table>
                                      </td>
                                    </tr>
                                  )}
                                </Fragment>
                                );
                              })}
                              <tr className="border-t border-white/10 font-medium" style={{ backgroundColor: BACKGROUND_DT }}>
                                <td className="pl-8 pr-6 py-3 text-sm" style={{ color: ACTIVE_TEXT_DARK }}>Итого</td>
                                {dateSnapshotRows.map((_, dateIdx) => {
                                  const totalRub = totalRubByDate[dateIdx];
                                  const totalGrowthColor =
                                    dateSnapshotRows.length === 2 && dateIdx === 1 && totalGrowthPercent != null && totalGrowthPercent !== 0
                                      ? (totalGrowthPercent >= 0) === growthPositiveIsGood ? GREEN : RED
                                      : undefined;
                                  return (
                                    <Fragment key={clickedChartDates[dateIdx]}>
                                      {dateIdx === 1 && dateSnapshotRows.length === 2 && (
                                        <td className="px-3 py-3 text-center tabular-nums text-sm" style={totalGrowthColor ? { color: totalGrowthColor } : undefined}>
                                          {totalGrowthPercent != null ? formatGrowthPercent(totalGrowthPercent) : "–"}
                                        </td>
                                      )}
                                      <td className={`px-4 py-3 text-right tabular-nums text-sm ${dateIdx === dateSnapshotRows.length - 1 ? "pr-8" : ""}`} style={{ color: ACTIVE_TEXT_DARK }}>
                                        {isLiabilitySection ? formatRub(Math.abs(totalRub)) : formatSignedValue(totalRub, formatRub)}
                                      </td>
                                    </Fragment>
                                  );
                                })}
                              </tr>
                            </tbody>
                          </table>
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </main>
  );
}
