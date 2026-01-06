"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { AlertCircle, Calculator, LineChart, Receipt, Target, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  buildCategoryDescendants,
  buildCategoryLookup,
  type CategoryNode,
} from "@/lib/categories";
import {
  fetchCategories,
  fetchLimits,
  fetchFxRates,
  fetchItems,
  fetchTransactions,
  FxRateOut,
  ItemKind,
  ItemOut,
  LimitOut,
  TransactionOut,
} from "@/lib/api";

type ChartPoint = {
  x: number;
  y: number;
  value: number;
};

type DailyRow = {
  date: string;
  totalRubCents: number | null;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const CASH_TYPES = ["cash", "bank_account", "bank_card"];
const FINANCIAL_INSTRUMENTS_TYPES = ["deposit", "savings_account", "brokerage", "securities"];
const PROPERTY_TYPES = ["real_estate", "car"];
const OTHER_ASSET_TYPES = ["other_asset"];
const DONUT_COLORS = [
  "#7F5CFF",
  "#34D399",
  "#F59E0B",
  "#3B82F6",
  "#F97316",
  "#F43F5E",
  "#22C55E",
  "#0EA5E9",
];
const UPCOMING_DAYS = 3;
const CATEGORY_BREAKDOWN_LIMIT = 6;
const LIMIT_PERIOD_LABELS: Record<LimitOut["period"], string> = {
  MONTHLY: "Ежемесячный",
  WEEKLY: "Еженедельный",
  YEARLY: "Ежегодный",
  CUSTOM: "Произвольный период",
};

const LIABILITY_TYPES = [
  { code: "credit_card_debt", label: "Задолженность по кредитной карте" },
  { code: "consumer_loan", label: "Потребительский кредит" },
  { code: "mortgage", label: "Ипотека" },
  { code: "car_loan", label: "Автокредит" },
  { code: "microloan", label: "МФО" },
  { code: "tax_debt", label: "Налоги / штрафы" },
  { code: "private_loan", label: "Частный заём" },
  { code: "other_liability", label: "Другое" },
];

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

function addMonths(date: Date, months: number) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  const lastDay = new Date(year, month + months + 1, 0).getDate();
  return new Date(year, month + months, Math.min(day, lastDay));
}

function getWeekStart(date: Date) {
  const day = date.getDay();
  const diff = (day + 6) % 7;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - diff);
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

function formatRub(valueInCents: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valueInCents / 100);
}

function formatDateLabel(dateKey: string) {
  const [year, month, day] = dateKey.split("-");
  return `${day}.${month}.${year}`;
}

function formatRangeLabel(startKey: string, endKey: string) {
  return `${formatDateLabel(startKey)} - ${formatDateLabel(endKey)}`;
}

function getLimitRange(limit: LimitOut, today: Date) {
  if (limit.period === "CUSTOM") {
    if (!limit.custom_start_date || !limit.custom_end_date) return null;
    return {
      startKey: limit.custom_start_date,
      endKey: limit.custom_end_date,
      rangeLabel: formatRangeLabel(limit.custom_start_date, limit.custom_end_date),
    };
  }

  if (limit.period === "WEEKLY") {
    const start = getWeekStart(today);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
    const startKey = toDateKey(start);
    const endKey = toDateKey(end);
    return { startKey, endKey, rangeLabel: formatRangeLabel(startKey, endKey) };
  }

  if (limit.period === "MONTHLY") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const startKey = toDateKey(start);
    const endKey = toDateKey(end);
    return { startKey, endKey, rangeLabel: formatRangeLabel(startKey, endKey) };
  }

  const start = new Date(today.getFullYear(), 0, 1);
  const end = new Date(today.getFullYear(), 11, 31);
  const startKey = toDateKey(start);
  const endKey = toDateKey(end);
  return { startKey, endKey, rangeLabel: formatRangeLabel(startKey, endKey) };
}

function formatMonthLabel(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatChartDate(date: Date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear()).slice(-2);
  return `${day}.${month}.${year}`;
}

function getPreviousMonthRange(date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth() - 1, 1);
  const end = new Date(date.getFullYear(), date.getMonth(), 0);
  return { start, end };
}

function isRealizedTransaction(tx: TransactionOut) {
  return tx.transaction_type === "ACTUAL" || tx.status === "REALIZED";
}

type CategoryBreakdownRow = {
  label: string;
  value: number;
};

type CategoryBreakdown = {
  total: number;
  rows: CategoryBreakdownRow[];
};

type CategorySegment = CategoryBreakdownRow & {
  percent: number;
  color: string;
};

function buildCategoryBreakdown(
  txs: TransactionOut[],
  direction: "INCOME" | "EXPENSE",
  startKey: string,
  endKey: string,
  categoryLookup: ReturnType<typeof buildCategoryLookup>,
  limit: number
): CategoryBreakdown {
  const totals = new Map<string, number>();
  let total = 0;

  const resolveLabel = (categoryId: number | null) => {
    if (!categoryId) return "Без категории";
    const path = categoryLookup.idToPath.get(categoryId);
    if (!path || path.length === 0) return "Без категории";
    return path.join(" / ");
  };

  txs.forEach((tx) => {
    if (tx.direction !== direction) return;
    const dateKey = toTxDateKey(tx.transaction_date);
    if (!dateKey) return;
    if (dateKey < startKey || dateKey > endKey) return;
    if (!isRealizedTransaction(tx)) return;
    const label = resolveLabel(tx.category_id);
    totals.set(label, (totals.get(label) ?? 0) + tx.amount_rub);
    total += tx.amount_rub;
  });

  const rows = Array.from(totals.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);

  if (rows.length > limit) {
    const head = rows.slice(0, limit);
    const restValue = rows.slice(limit).reduce((sum, row) => sum + row.value, 0);
    if (restValue > 0) head.push({ label: "Другое", value: restValue });
    return { total, rows: head };
  }

  return { total, rows };
}

function buildCategorySegments(
  breakdown: CategoryBreakdown,
  colorOffset: number
): CategorySegment[] {
  if (breakdown.total <= 0 || breakdown.rows.length === 0) return [];
  return breakdown.rows.map((row, index) => ({
    ...row,
    percent: row.value / breakdown.total,
    color: DONUT_COLORS[(index + colorOffset) % DONUT_COLORS.length],
  }));
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

function transferDelta(kind: ItemKind, isPrimary: boolean, amount: number) {
  if (kind === "LIABILITY") return isPrimary ? amount : -amount;
  return isPrimary ? -amount : amount;
}

function getItemStartKey(item: ItemOut) {
  return item.start_date
    ? toTxDateKey(item.start_date)
    : toDateKey(new Date(item.created_at));
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
  itemKindById: Map<number, ItemKind>
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

    const primarySelected = selectedIds.has(tx.primary_item_id);
    const counterSelected = tx.counterparty_item_id
      ? selectedIds.has(tx.counterparty_item_id)
      : false;
    if (!primarySelected && !counterSelected) return;

    if (primarySelected) {
      let delta = 0;
      if (tx.direction === "INCOME") delta = tx.amount_rub;
      if (tx.direction === "EXPENSE") delta = -tx.amount_rub;
      if (tx.direction === "TRANSFER") {
        const kind = itemKindById.get(tx.primary_item_id) ?? "ASSET";
        delta = transferDelta(kind, true, tx.amount_rub);
      }
      addDelta(dateKey, tx.primary_item_id, delta);
    }

    if (counterSelected && tx.direction === "TRANSFER" && tx.counterparty_item_id) {
      const kind = itemKindById.get(tx.counterparty_item_id) ?? "ASSET";
      const counterAmount = tx.amount_counterparty ?? tx.amount_rub;
      const delta = transferDelta(kind, false, counterAmount);
      addDelta(dateKey, tx.counterparty_item_id, delta);
    }
  });

  return map;
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

export default function DashboardPage() {
  const { data: session } = useSession();
  const [items, setItems] = useState<ItemOut[]>([]);
  const [txs, setTxs] = useState<TransactionOut[]>([]);
  const [limits, setLimits] = useState<LimitOut[]>([]);
  const [fxRates, setFxRates] = useState<FxRateOut[]>([]);
  const [categoryNodes, setCategoryNodes] = useState<CategoryNode[]>([]);
  const [fxRatesByDate, setFxRatesByDate] = useState<Record<string, FxRateOut[]>>(
    {}
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [tooltipLeft, setTooltipLeft] = useState<number | null>(null);
  const [incomeHover, setIncomeHover] = useState<CategorySegment | null>(null);
  const [expenseHover, setExpenseHover] = useState<CategorySegment | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const chartRef = useRef<HTMLDivElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [chartSize, setChartSize] = useState({ width: 720, height: 280 });
  const now = new Date();
  const todayKey = toDateKey(now);
  const rangeStartKey = toDateKey(addMonths(now, -1));
  const rangeEndKey = toDateKey(addMonths(now, 1));
  const previousMonthRange = getPreviousMonthRange(now);
  const previousMonthStartKey = toDateKey(previousMonthRange.start);
  const previousMonthEndKey = toDateKey(previousMonthRange.end);
  const previousMonthLabel = formatMonthLabel(previousMonthRange.start);
  const upcomingEndKey = toDateKey(addDays(now, UPCOMING_DAYS - 1));

  useEffect(() => {
    if (!session) return;
    let active = true;
    setLoading(true);
    setError(null);

    Promise.all([
      fetchItems({ includeArchived: true }),
      fetchTransactions(),
      fetchFxRates().catch(() => [] as FxRateOut[]),
      fetchCategories({ includeArchived: false }),
      fetchLimits(),
    ])
      .then(([itemsData, txData, fxRatesData, categoriesData, limitsData]) => {
        if (!active) return;
        setItems(itemsData);
        setTxs(txData);
        setFxRates(fxRatesData);
        setCategoryNodes(categoriesData);
        setLimits(limitsData);
      })
      .catch((e: any) => {
        if (!active) return;
        setError(e?.message ?? "Не удалось загрузить данные");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [session]);

  const rateByCode = useMemo(() => {
    const map: Record<string, number> = { RUB: 1 };
    fxRates.forEach((rate) => {
      map[rate.char_code] = rate.rate;
    });
    return map;
  }, [fxRates]);

  const itemsById = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items]
  );

  const categoryLookup = useMemo(
    () => buildCategoryLookup(categoryNodes),
    [categoryNodes]
  );
  const categoryDescendants = useMemo(
    () => buildCategoryDescendants(categoryNodes),
    [categoryNodes]
  );

  const activeLimits = useMemo(
    () => limits.filter((limit) => !limit.deleted_at),
    [limits]
  );

  const limitSummaryById = useMemo(() => {
    const now = new Date();
    const map = new Map<number, { spent: number; progress: number; rangeLabel: string }>();
    activeLimits.forEach((limit) => {
      const range = getLimitRange(limit, now);
      const categoryIds =
        categoryDescendants.get(limit.category_id) ?? new Set([limit.category_id]);
      let spent = 0;
      if (range) {
        txs.forEach((tx) => {
          if (tx.direction !== "EXPENSE") return;
          if (!isRealizedTransaction(tx)) return;
          if (!tx.category_id || !categoryIds.has(tx.category_id)) return;
          const dateKey = toTxDateKey(tx.transaction_date);
          if (!dateKey) return;
          if (dateKey < range.startKey || dateKey > range.endKey) return;
          spent += tx.amount_rub;
        });
      }
      const progress =
        limit.amount_rub > 0 ? Math.min(spent / limit.amount_rub, 1) : 0;
      map.set(limit.id, {
        spent,
        progress,
        rangeLabel: range?.rangeLabel ?? "",
      });
    });
    return map;
  }, [activeLimits, categoryDescendants, txs]);

  const formatLimitCategoryLabel = (categoryId: number | null) => {
    if (!categoryId) return "-";
    const parts = categoryLookup.idToPath.get(categoryId) ?? [];
    const label = parts
      .map((part) => part?.trim())
      .filter((part) => part)
      .join(" / ");
    return label || "-";
  };

  useEffect(() => {
    if (fxRates.length === 0) return;
    setFxRatesByDate((prev) => {
      if (prev[todayKey]) return prev;
      return { ...prev, [todayKey]: fxRates };
    });
  }, [fxRates, todayKey]);

  function getRubEquivalentCents(item: ItemOut): number | null {
    const rate = rateByCode[item.currency_code];
    if (!rate) return null;
    const amount = item.current_value_rub / 100;
    return Math.round(amount * rate * 100);
  }

  const activeItems = useMemo(
    () => items.filter((item) => !item.archived_at && !item.closed_at),
    [items]
  );

  const cashItems = useMemo(
    () => activeItems.filter((x) => x.kind === "ASSET" && CASH_TYPES.includes(x.type_code)),
    [activeItems]
  );

  const financialInstrumentsItems = useMemo(
    () =>
      activeItems.filter(
        (x) => x.kind === "ASSET" && FINANCIAL_INSTRUMENTS_TYPES.includes(x.type_code)
      ),
    [activeItems]
  );

  const propertyItems = useMemo(
    () => activeItems.filter((x) => x.kind === "ASSET" && PROPERTY_TYPES.includes(x.type_code)),
    [activeItems]
  );

  const otherAssetItems = useMemo(
    () => activeItems.filter((x) => x.kind === "ASSET" && OTHER_ASSET_TYPES.includes(x.type_code)),
    [activeItems]
  );

  const liabilityItems = useMemo(
    () => activeItems.filter((x) => x.kind === "LIABILITY"),
    [activeItems]
  );

  const cashTotal = useMemo(
    () => cashItems.reduce((sum, x) => sum + (getRubEquivalentCents(x) ?? 0), 0),
    [cashItems, rateByCode]
  );

  const financialInstrumentsTotal = useMemo(
    () =>
      financialInstrumentsItems.reduce(
        (sum, x) => sum + (getRubEquivalentCents(x) ?? 0),
        0
      ),
    [financialInstrumentsItems, rateByCode]
  );

  const propertyTotal = useMemo(
    () => propertyItems.reduce((sum, x) => sum + (getRubEquivalentCents(x) ?? 0), 0),
    [propertyItems, rateByCode]
  );

  const otherAssetTotal = useMemo(
    () => otherAssetItems.reduce((sum, x) => sum + (getRubEquivalentCents(x) ?? 0), 0),
    [otherAssetItems, rateByCode]
  );

  const liabilityTotalsByType = useMemo(() => {
    const totals: Record<string, number> = {};
    LIABILITY_TYPES.forEach((type) => {
      totals[type.code] = 0;
    });
    liabilityItems.forEach((item) => {
      totals[item.type_code] = (totals[item.type_code] ?? 0) + (getRubEquivalentCents(item) ?? 0);
    });
    return totals;
  }, [liabilityItems, rateByCode]);

  const { totalAssets, totalLiabilities, netTotal } = useMemo(() => {
    const assets = activeItems
      .filter((x) => x.kind === "ASSET")
      .reduce((sum, x) => sum + (getRubEquivalentCents(x) ?? 0), 0);

    const liabilities = activeItems
      .filter((x) => x.kind === "LIABILITY")
      .reduce((sum, x) => sum + (getRubEquivalentCents(x) ?? 0), 0);

    return {
      totalAssets: assets,
      totalLiabilities: liabilities,
      netTotal: assets - liabilities,
    };
  }, [activeItems, rateByCode]);

  const incomeBreakdown = useMemo(
    () =>
      buildCategoryBreakdown(
        txs,
        "INCOME",
        previousMonthStartKey,
        previousMonthEndKey,
        categoryLookup,
        CATEGORY_BREAKDOWN_LIMIT
      ),
    [categoryLookup, previousMonthEndKey, previousMonthStartKey, txs]
  );

  const expenseBreakdown = useMemo(
    () =>
      buildCategoryBreakdown(
        txs,
        "EXPENSE",
        previousMonthStartKey,
        previousMonthEndKey,
        categoryLookup,
        CATEGORY_BREAKDOWN_LIMIT
      ),
    [categoryLookup, previousMonthEndKey, previousMonthStartKey, txs]
  );

  const incomeSegments = useMemo(
    () => buildCategorySegments(incomeBreakdown, 0),
    [incomeBreakdown]
  );

  const expenseSegments = useMemo(
    () => buildCategorySegments(expenseBreakdown, 2),
    [expenseBreakdown]
  );

  const overduePlannedCount = useMemo(() => {
    let count = 0;
    txs.forEach((tx) => {
      if (tx.transaction_type !== "PLANNED") return;
      if (tx.status === "REALIZED") return;
      const dateKey = toTxDateKey(tx.transaction_date);
      if (!dateKey) return;
      if (dateKey < todayKey) count += 1;
    });
    return count;
  }, [todayKey, txs]);

  const upcomingPlanned = useMemo(() => {
    const items: {
      id: number;
      dateKey: string;
      title: string;
      direction: TransactionOut["direction"];
      amount: number;
      accountLabel: string;
    }[] = [];

    const resolveLabel = (categoryId: number | null) => {
      if (!categoryId) return "Без категории";
      const path = categoryLookup.idToPath.get(categoryId);
      if (!path || path.length === 0) return "Без категории";
      return path.join(" / ");
    };

    txs.forEach((tx) => {
      if (tx.transaction_type !== "PLANNED") return;
      if (tx.status === "REALIZED") return;
      const dateKey = toTxDateKey(tx.transaction_date);
      if (!dateKey) return;
      if (dateKey < todayKey || dateKey > upcomingEndKey) return;

      const primaryItem = itemsById.get(tx.primary_item_id);
      const counterpartyItem = tx.counterparty_item_id
        ? itemsById.get(tx.counterparty_item_id)
        : null;
      const baseTitle = tx.description?.trim() || tx.comment?.trim();
      const categoryLabel = resolveLabel(tx.category_id);
      const fallbackTitle =
        tx.direction === "TRANSFER" ? "Перевод" : categoryLabel || "Без категории";
      const title = baseTitle && baseTitle.length > 0 ? baseTitle : fallbackTitle;
      const primaryLabel = primaryItem?.name ?? `#${tx.primary_item_id}`;
      const counterpartyLabel = counterpartyItem?.name ?? null;
      const accountLabel =
        tx.direction === "TRANSFER" && counterpartyLabel
          ? `${primaryLabel} -> ${counterpartyLabel}`
          : primaryLabel;

      items.push({
        id: tx.id,
        dateKey,
        title,
        direction: tx.direction,
        amount: tx.amount_rub,
        accountLabel,
      });
    });

    items.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
    return items;
  }, [categoryLookup, itemsById, todayKey, txs, upcomingEndKey]);

  const upcomingDisplay = upcomingPlanned.slice(0, 5);
  const upcomingExtra = Math.max(0, upcomingPlanned.length - upcomingDisplay.length);

  const chartItems = useMemo(() => activeItems, [activeItems]);

  const dateKeys = useMemo(
    () => buildDateRange(rangeStartKey, rangeEndKey),
    [rangeEndKey, rangeStartKey]
  );

  const needsRates = useMemo(
    () => chartItems.some((item) => item.currency_code !== "RUB"),
    [chartItems]
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
    };

    loadRates();

    return () => {
      cancelled = true;
    };
  }, [fxRatesByDate, needsRates, rateFetchKeys]);

  const dailyRows = useMemo<DailyRow[]>(() => {
    if (!chartItems.length || !rangeStartKey || !rangeEndKey) return [];

    const selectedIds = new Set(chartItems.map((item) => item.id));
    const itemKindById = new Map(chartItems.map((item) => [item.id, item.kind]));
    const itemStartKeyById = new Map(
      chartItems.map((item) => [item.id, getItemStartKey(item)])
    );
    const itemsByStartDate = new Map<string, ItemOut[]>();
    chartItems.forEach((item) => {
      const startKey = itemStartKeyById.get(item.id);
      if (!startKey) return;
      if (!itemsByStartDate.has(startKey)) itemsByStartDate.set(startKey, []);
      itemsByStartDate.get(startKey)?.push(item);
    });

    const deltasByDate = buildDeltasByDate(txs, selectedIds, itemKindById);
    const startKeys = chartItems.map((item) => getItemStartKey(item)).sort();
    const earliestStartKey = startKeys[0] ?? "";
    const startKey =
      earliestStartKey && earliestStartKey < rangeStartKey
        ? earliestStartKey
        : rangeStartKey;
    let startDate = parseDateKey(startKey);
    const endDate = parseDateKey(rangeEndKey);
    if (startDate > endDate) startDate = endDate;

    const balances = new Map<number, number>();
    const rows: DailyRow[] = [];

    for (
      let current = startDate;
      current <= endDate;
      current = addDays(current, 1)
    ) {
      const dateKey = toDateKey(current);
      const newItems = itemsByStartDate.get(dateKey) ?? [];
      newItems.forEach((item) => {
        balances.set(item.id, item.initial_value_rub);
      });

      const dayDeltas = deltasByDate.get(dateKey);
      if (dayDeltas) {
        dayDeltas.forEach((delta, itemId) => {
          const currentBalance = balances.get(itemId) ?? 0;
          balances.set(itemId, currentBalance + delta);
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

      let totalRubCents: number | null = 0;
      let missingRate = false;

      chartItems.forEach((item) => {
        const startKeyForItem = itemStartKeyById.get(item.id) ?? "";
        if (startKeyForItem && dateKey < startKeyForItem) {
          return;
        }
        const valueCents = balances.get(item.id) ?? item.initial_value_rub;

        const rate = getRate(item.currency_code);
        if (rate === null) {
          if (item.currency_code !== "RUB") missingRate = true;
        } else {
          const rubValueCents = Math.round((valueCents / 100) * rate * 100);
          const signedRub = item.kind === "LIABILITY" ? -rubValueCents : rubValueCents;
          if (totalRubCents !== null) totalRubCents += signedRub;
        }
      });

      if (missingRate) totalRubCents = null;

      rows.push({
        date: dateKey,
        totalRubCents,
      });
    }

    return rows;
  }, [
    chartItems,
    fxRatesByDate,
    latestRatesByCurrency,
    rangeEndKey,
    rangeStartKey,
    todayKey,
    txs,
  ]);

  const chartData = useMemo(
    () =>
      dailyRows.map((row) => ({
        date: row.date,
        value: (row.totalRubCents ?? 0) / 100,
        totalRubCents: row.totalRubCents,
      })),
    [dailyRows]
  );

  const width = chartSize.width;
  const height = chartSize.height;
  const padding = { top: 24, right: 0, bottom: 44, left: 52 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const values = chartData.map((point) => point.value);
  const minValue = values.length ? Math.min(...values, 0) : 0;
  const maxValue = values.length ? Math.max(...values, 0) : 0;
  const rangePadding = Math.max((maxValue - minValue) * 0.12, 1);
  const paddedMin = minValue - rangePadding;
  const paddedMax = maxValue + rangePadding;
  const ticks = buildTicks(paddedMin, paddedMax);
  const chartMin = ticks[0];
  const chartMax = ticks[ticks.length - 1];

  const points: ChartPoint[] = chartData.map((point, index) => {
    const progress = chartData.length <= 1 ? 0 : index / (chartData.length - 1);
    const x = padding.left + innerWidth * progress;
    const valueRatio = (point.value - chartMin) / (chartMax - chartMin || 1);
    const y = padding.top + innerHeight - innerHeight * valueRatio;
    return { x, y, value: point.value };
  });

  const baselineValue = chartMin;
  const baselineRatio = (baselineValue - chartMin) / (chartMax - chartMin || 1);
  const baselineY = padding.top + innerHeight - innerHeight * baselineRatio;
  const futureStartIndex = chartData.findIndex((point) => point.date > todayKey);
  const pastPoints =
    futureStartIndex === -1 ? points : points.slice(0, Math.max(futureStartIndex, 0));
  const futurePoints =
    futureStartIndex === -1 ? [] : points.slice(Math.max(futureStartIndex - 1, 0));
  const pastLinePath = buildLinePath(pastPoints);
  const futureLinePath = buildLinePath(futurePoints);
  const pastAreaPath = buildAreaPath(pastPoints, baselineY);
  const futureAreaPath = buildAreaPath(futurePoints, baselineY);

  const hoverPoint = hoverIndex !== null ? points[hoverIndex] : null;
  const hoverData = hoverIndex !== null ? chartData[hoverIndex] : null;
  const hoverIsFuture = hoverData ? hoverData.date > todayKey : false;

  const dayMarks =
    chartData.length >= 2
      ? buildDayMarks(
          chartData[0].date,
          chartData[chartData.length - 1].date,
          width,
          padding
        )
      : [];

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
    if (!svgRef.current || chartData.length === 0) return;
    if (chartData.length === 1) {
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
    const index = Math.round(progress * (chartData.length - 1));
    setHoverIndex(Math.min(Math.max(index, 0), chartData.length - 1));
  };

  return (
    <main className="min-h-screen bg-[#F7F8FA] px-8 py-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Дэшборд</h1>
          <p className="text-sm text-muted-foreground">Ключевые метрики за последние дни.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-2">
          <Card className="relative overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Wallet className="h-5 w-5 text-violet-600" />
                Текущий чистый капитал
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="break-words text-4xl font-semibold leading-tight text-violet-600 tabular-nums">
                {loading
                  ? "..."
                  : netTotal < 0
                  ? `-${formatRub(Math.abs(netTotal))}`
                  : formatRub(netTotal)}
              </div>
              <div className="space-y-1 text-xs text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span>Активы</span>
                  <span className="tabular-nums whitespace-nowrap">
                    {loading ? "..." : formatRub(totalAssets)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Обязательства</span>
                  <span className="tabular-nums whitespace-nowrap">
                    {loading ? "..." : `-${formatRub(totalLiabilities)}`}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-violet-600" />
                Просроченные плановые транзакции
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="text-3xl font-semibold text-rose-600 tabular-nums">
                {loading ? "..." : overduePlannedCount}
              </div>
              <p className="text-xs text-muted-foreground">
                Нереализованные, дата меньше сегодня
              </p>
              <Button
                asChild
                size="sm"
                variant="outline"
                className="w-fit border-violet-200 bg-white text-violet-700 shadow-none hover:bg-violet-50"
              >
                <Link href="/transactions?preset=overdue-planned">Просмотреть</Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Card className="overflow-hidden">
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-slate-800">
                    Доходы за {previousMonthLabel}
                  </div>
                  <div className="text-lg font-semibold text-emerald-600 tabular-nums whitespace-nowrap">
                    {loading ? "..." : formatRub(incomeBreakdown.total)}
                  </div>
                </div>
                {loading ? (
                  <div className="text-sm text-muted-foreground">Загрузка...</div>
                ) : incomeSegments.length === 0 ? (
                  <div className="text-sm text-muted-foreground">
                    Нет данных за {previousMonthLabel}
                  </div>
                ) : (
                  <>
                    <div
                      className="relative"
                      onMouseLeave={() => setIncomeHover(null)}
                    >
                      {incomeHover && (
                        <div className="pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-full -mt-2 whitespace-nowrap rounded-full bg-slate-900 px-3 py-1 text-xs text-white shadow">
                          <span className="font-medium">{incomeHover.label}</span>
                          <span className="opacity-80">
                            {" "}
                            - {Math.round(incomeHover.percent * 100)}%
                          </span>
                          <span className="opacity-80">
                            {" "}
                            - {formatRub(incomeHover.value)}
                          </span>
                        </div>
                      )}
                      <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-100">
                        {incomeSegments.map((segment, index) => (
                          <div
                            key={`${segment.label}-${index}`}
                            className="h-full"
                            style={{
                              width: `${segment.percent * 100}%`,
                              backgroundColor: segment.color,
                            }}
                            onMouseEnter={() => setIncomeHover(segment)}
                          />
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-slate-800">
                    Расходы за {previousMonthLabel}
                  </div>
                  <div className="text-lg font-semibold text-rose-600 tabular-nums whitespace-nowrap">
                    {loading ? "..." : formatRub(expenseBreakdown.total)}
                  </div>
                </div>
                {loading ? (
                  <div className="text-sm text-muted-foreground">Загрузка...</div>
                ) : expenseSegments.length === 0 ? (
                  <div className="text-sm text-muted-foreground">
                    Нет данных за {previousMonthLabel}
                  </div>
                ) : (
                  <>
                    <div
                      className="relative"
                      onMouseLeave={() => setExpenseHover(null)}
                    >
                      {expenseHover && (
                        <div className="pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-full -mt-2 whitespace-nowrap rounded-full bg-slate-900 px-3 py-1 text-xs text-white shadow">
                          <span className="font-medium">{expenseHover.label}</span>
                          <span className="opacity-80">
                            {" "}
                            - {Math.round(expenseHover.percent * 100)}%
                          </span>
                          <span className="opacity-80">
                            {" "}
                            - {formatRub(expenseHover.value)}
                          </span>
                        </div>
                      )}
                      <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-100">
                        {expenseSegments.map((segment, index) => (
                          <div
                            key={`${segment.label}-${index}`}
                            className="h-full"
                            style={{
                              width: `${segment.percent * 100}%`,
                              backgroundColor: segment.color,
                            }}
                            onMouseEnter={() => setExpenseHover(segment)}
                          />
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Receipt className="h-5 w-5 text-violet-600" />
                Плановые транзакции в ближайшие {UPCOMING_DAYS} календарных дня
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading ? (
                <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
                  Загрузка...
                </div>
              ) : upcomingDisplay.length === 0 ? (
                <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
                  Нет плановых транзакций на ближайшие {UPCOMING_DAYS} дня
                </div>
              ) : (
                <div className="space-y-2">
                  {upcomingDisplay.map((item) => {
                    const amountColor =
                      item.direction === "INCOME"
                        ? "text-emerald-600"
                        : item.direction === "EXPENSE"
                        ? "text-rose-600"
                        : "text-slate-600";
                    const sign =
                      item.direction === "INCOME"
                        ? "+"
                        : item.direction === "EXPENSE"
                        ? "-"
                        : "";
                    return (
                      <div
                        key={item.id}
                        className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-slate-100 bg-white px-3 py-2"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-slate-800">
                            {item.title}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {formatDateLabel(item.dateKey)} - {item.accountLabel}
                          </div>
                        </div>
                        <div
                          className={`shrink-0 text-sm font-semibold tabular-nums whitespace-nowrap ${amountColor}`}
                        >
                          {sign}
                          {formatRub(item.amount)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {!loading && upcomingExtra > 0 && (
                <div className="text-xs text-muted-foreground">
                  Еще плановых транзакций: {upcomingExtra}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="h-5 w-5 text-violet-600" />
              Контроль лимитов
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <div className="text-sm text-muted-foreground">Загрузка лимитов...</div>
            ) : activeLimits.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 bg-white p-4 text-center text-sm text-muted-foreground">
                Активных лимитов пока нет.
              </div>
            ) : (
              <div className="space-y-3">
                {activeLimits.map((limit) => {
                  const summary = limitSummaryById.get(limit.id) ?? {
                    spent: 0,
                    progress: 0,
                    rangeLabel: "",
                  };
                  const overBudget = summary.spent > limit.amount_rub;
                  const progressColor = overBudget
                    ? "bg-rose-500"
                    : "bg-emerald-500";
                  const periodLabel = LIMIT_PERIOD_LABELS[limit.period];
                  const rangeLabel = summary.rangeLabel;
                  return (
                    <div
                      key={limit.id}
                      className="rounded-xl border border-slate-100 bg-white px-3 py-2"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-slate-800">
                            {limit.name}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {periodLabel}
                            {rangeLabel ? ` | ${rangeLabel}` : ""}
                            {" | "}
                            {formatLimitCategoryLabel(limit.category_id)}
                          </div>
                        </div>
                        <div
                          className={`shrink-0 text-sm font-semibold tabular-nums whitespace-nowrap ${
                            overBudget ? "text-rose-600" : "text-slate-700"
                          }`}
                        >
                          {formatRub(summary.spent)} / {formatRub(limit.amount_rub)}
                        </div>
                      </div>
                      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full ${progressColor}`}
                          style={{ width: `${summary.progress * 100}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
          <Card className="h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Calculator className="h-5 w-5 text-violet-600" />
                ИТОГО
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Активы:</span>
                  <span className="font-semibold tabular-nums">{formatRub(totalAssets)}</span>
                </div>
                <div className="space-y-1 pl-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Денежные средства</span>
                    <span className="tabular-nums">{formatRub(cashTotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Финансовые инструменты</span>
                    <span className="tabular-nums">{formatRub(financialInstrumentsTotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Имущество</span>
                    <span className="tabular-nums">{formatRub(propertyTotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Другие активы</span>
                    <span className="tabular-nums">{formatRub(otherAssetTotal)}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Обязательства:</span>
                  <span className="font-semibold tabular-nums text-red-600">
                    -{formatRub(totalLiabilities)}
                  </span>
                </div>
                <div className="space-y-1 pl-3">
                  {LIABILITY_TYPES.map((type) => {
                    const value = liabilityTotalsByType[type.code] ?? 0;
                    const formatted = value > 0 ? `-${formatRub(value)}` : formatRub(0);
                    return (
                      <div key={type.code} className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{type.label}</span>
                        <span className="tabular-nums text-red-600">{formatted}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="pt-2 border-t flex justify-between items-center">
                <span className="font-medium">Чистые активы:</span>
                <span
                  className={[
                    "font-semibold tabular-nums",
                    netTotal < 0 ? "text-red-600" : "",
                  ].join(" ")}
                >
                  {netTotal < 0
                    ? `-${formatRub(Math.abs(netTotal))}`
                    : formatRub(netTotal)}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <LineChart className="h-5 w-5 text-violet-600" />
                Динамика чистых активов</CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              <div className="relative py-6">
                {loading && (
                  <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                    Загрузка данных...</div>
                )}

                {!loading && error && (
                  <div className="flex h-64 items-center justify-center text-sm text-red-600">
                    {error}
                  </div>
                )}

                {!loading && !error && chartData.length === 0 && (
                  <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                    Нет данных для построения графика.</div>
                )}

                {!loading && !error && chartData.length > 0 && (
                  <>
                    <div ref={chartRef} className="relative h-64 w-full">
                      {hoverPoint && hoverData && (
                        <div
                          ref={tooltipRef}
                          className="pointer-events-none absolute z-20 rounded-2xl bg-gradient-to-r from-[#7F5CFF] via-[#8B6CFF] to-[#9B7CFF] px-4 py-2 text-white shadow-lg"
                          style={{
                            left: tooltipLeft !== null ? `${tooltipLeft}px` : `${hoverPoint.x}px`,
                            top: `${(hoverPoint.y / height) * 100}%`,
                            transform: "translate(-50%, -120%)",
                          }}
                        >
                          <div className="text-xs opacity-80">
                            {formatDateLabel(hoverData.date)}
                          </div>
                          <div className="text-sm font-semibold">
                            {hoverData.totalRubCents === null
                              ? "-"
                              : formatRub(hoverData.totalRubCents)}
                          </div>
                        </div>
                      )}
                      <svg
                        ref={svgRef}
                        viewBox={`0 0 ${width} ${height}`}
                        className="h-full w-full"
                        role="img"
                        aria-label="Динамика чистых активов"
                        onMouseMove={handlePointerMove}
                        onMouseLeave={() => setHoverIndex(null)}
                      >
                        <defs>
                          <linearGradient id="assetsArea" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#8D63FF" stopOpacity="0.35" />
                            <stop offset="100%" stopColor="#8D63FF" stopOpacity="0" />
                          </linearGradient>
                          <linearGradient
                            id="assetsAreaFuture"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.35" />
                            <stop offset="100%" stopColor="#F59E0B" stopOpacity="0" />
                          </linearGradient>
                          <linearGradient id="assetsLine" x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%" stopColor="#7F5CFF" />
                            <stop offset="100%" stopColor="#A089FF" />
                          </linearGradient>
                          <filter id="assetsGlow" x="-50%" y="-50%" width="200%" height="200%">
                            <feDropShadow
                              dx="0"
                              dy="10"
                              stdDeviation="8"
                              floodColor="#8D63FF"
                              floodOpacity="0.25"
                            />
                          </filter>
                        </defs>

                        <g>
                          {ticks.map((tick) => {
                            const ratio = (tick - chartMin) / (chartMax - chartMin || 1);
                            const y = padding.top + innerHeight - innerHeight * ratio;
                            return (
                              <g key={tick}>
                                <line
                                  x1={padding.left}
                                  x2={width - padding.right}
                                  y1={y}
                                  y2={y}
                                  stroke="#DED8FF"
                                  strokeDasharray="4 8"
                                />
                                <text
                                  x={padding.left - 12}
                                  y={y + 4}
                                  textAnchor="end"
                                  fontSize="12"
                                  fill="#9A93BF"
                                >
                                  {formatTick(tick)}
                                </text>
                              </g>
                            );
                          })}
                        </g>

                        {pastAreaPath && <path d={pastAreaPath} fill="url(#assetsArea)" />}
                        {futureAreaPath && (
                          <path d={futureAreaPath} fill="url(#assetsAreaFuture)" />
                        )}
                        {pastLinePath && (
                          <path
                            d={pastLinePath}
                            fill="none"
                            stroke="url(#assetsLine)"
                            strokeWidth="3"
                            strokeLinecap="round"
                            filter="url(#assetsGlow)"
                          />
                        )}
                        {futureLinePath && (
                          <path
                            d={futureLinePath}
                            fill="none"
                            stroke="#F59E0B"
                            strokeWidth="3"
                            strokeLinecap="round"
                          />
                        )}
                        {hoverPoint && (
                          <>
                            <line
                              x1={hoverPoint.x}
                              x2={hoverPoint.x}
                              y1={padding.top}
                              y2={padding.top + innerHeight}
                              stroke={hoverIsFuture ? "#FDE68A" : "#CFC5FF"}
                              strokeDasharray="4 6"
                            />
                            <circle
                              cx={hoverPoint.x}
                              cy={hoverPoint.y}
                              r="6"
                              fill={hoverIsFuture ? "#F59E0B" : "#7F5CFF"}
                              stroke={hoverIsFuture ? "#FEF3C7" : "#F3EDFF"}
                              strokeWidth="4"
                            />
                          </>
                        )}
                        {dayMarks.map((mark, index) => {
                          const anchor =
                            index === 0
                              ? "start"
                              : index === dayMarks.length - 1
                              ? "end"
                              : "middle";
                          return (
                            <text
                              key={`${mark.label}-${mark.x}`}
                              x={mark.x}
                              y={height - 12}
                              textAnchor={anchor}
                              fontSize="12"
                              fill="#6F67B3"
                              fontWeight={500}
                            >
                              {mark.label}
                            </text>
                          );
                        })}
                      </svg>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
