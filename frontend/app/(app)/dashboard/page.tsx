"use client";

import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { AlertCircle, Target, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  buildCategoryDescendants,
  buildCategoryLookup,
  type CategoryNode,
} from "@/lib/categories";
import {
  CATEGORY_ICON_BY_NAME,
  CATEGORY_ICON_FALLBACK,
} from "@/lib/category-icons";
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

type CategoryIcon = ComponentType<{ className?: string; strokeWidth?: number }>;

const CASH_TYPES = ["cash", "bank_account", "bank_card", "savings_account", "e_wallet", "brokerage"];
const FINANCIAL_INSTRUMENTS_TYPES = [
  "deposit",
  "securities",
  "bonds",
  "etf",
  "bpif",
  "pif",
  "iis",
  "precious_metals",
  "crypto",
];
const PROPERTY_TYPES = [
  "real_estate",
  "townhouse",
  "land_plot",
  "garage",
  "commercial_real_estate",
  "real_estate_share",
  "car",
  "motorcycle",
  "boat",
  "trailer",
  "special_vehicle",
  "jewelry",
  "electronics",
  "art",
  "collectibles",
  "other_valuables",
];
const OTHER_ASSET_TYPES = [
  "loan_to_third_party",
  "third_party_receivables",
  "npf",
  "investment_life_insurance",
  "business_share",
  "sole_proprietor",
  "other_asset",
];
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
const CATEGORY_BREAKDOWN_LIMIT = 6;
const UNCATEGORIZED_LABEL = "Без категории";
const OTHER_LABEL = "Другое";
const OTHER_SHARE_MAX = 0.1;
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
  { code: "education_loan", label: "Образовательный кредит" },
  { code: "installment", label: "Рассрочка" },
  { code: "microloan", label: "МФО" },
  { code: "private_loan", label: "Полученные займы от третьих лиц" },
  { code: "third_party_payables", label: "Долги третьим лицам" },
  { code: "tax_debt", label: "Налоги и обязательные платежи" },
  { code: "personal_income_tax_debt", label: "Задолженность по НДФЛ" },
  { code: "property_tax_debt", label: "Задолженность по налогу на имущество" },
  { code: "land_tax_debt", label: "Задолженность по земельному налогу" },
  { code: "transport_tax_debt", label: "Задолженность по транспортному налогу" },
  { code: "fns_debt", label: "Задолженности перед ФНС" },
  { code: "utilities_debt", label: "Задолженность по ЖКХ" },
  { code: "telecom_debt", label: "Задолженность за интернет / связь" },
  { code: "traffic_fines_debt", label: "Задолженность по штрафам (ГИБДД и прочие)" },
  { code: "enforcement_debt", label: "Задолженность по исполнительным листам" },
  { code: "alimony_debt", label: "Задолженность по алиментам" },
  { code: "court_debt", label: "Судебные задолженности" },
  { code: "court_fine_debt", label: "Штрафы по решениям суда" },
  { code: "business_liability", label: "Бизнес-обязательства" },
  { code: "other_liability", label: "Прочие обязательства" },
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

function formatRub(valueInCents: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valueInCents / 100);
}

function formatPercent(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
}

function sumMapValues(map: Map<string, number>) {
  let total = 0;
  map.forEach((value) => {
    total += value;
  });
  return total;
}

function calcPercentChange(current: number, baseline: number | null) {
  if (!baseline) return null;
  const percent = ((current - baseline) / Math.abs(baseline)) * 100;
  if (!Number.isFinite(percent)) return null;
  return percent;
}

function formatChangePercent(percent: number | null) {
  if (percent === null) return "-";
  const sign = percent >= 0 ? "+" : "-";
  return `${sign}${formatPercent(Math.abs(percent))}%`;
}

function getLimitProgressTone(ratio: number) {
  if (ratio >= 1) return "over";
  if (ratio >= 0.75) return "warn";
  return "ok";
}

function getLimitProgressColorClass(tone: "over" | "warn" | "ok") {
  if (tone === "over") return "bg-rose-500";
  if (tone === "warn") return "bg-orange-500";
  return "bg-emerald-500";
}

function getLimitProgressTextClass(tone: "over" | "warn" | "ok") {
  if (tone === "over") return "text-rose-500";
  if (tone === "warn") return "text-orange-500";
  return "text-emerald-500";
}

function changeBadgeClass(percent: number | null) {
  if (percent === null) return "bg-slate-100 text-slate-500";
  return percent >= 0
    ? "bg-rose-50 text-rose-700"
    : "bg-emerald-50 text-emerald-700";
}

function netWorthBadgeClass(percent: number | null) {
  if (percent === null) return "bg-white/10 text-white/70";
  return percent >= 0
    ? "bg-emerald-300/10 text-emerald-100"
    : "bg-rose-300/10 text-rose-100";
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

type LegendRow = CategorySegment & {
  prevDelta: number | null;
  avgDelta: number | null;
};

function resolveTopLevelLabel(
  categoryId: number | null,
  categoryLookup: ReturnType<typeof buildCategoryLookup>
) {
  if (!categoryId) return UNCATEGORIZED_LABEL;
  const path = categoryLookup.idToPath.get(categoryId);
  const label = path?.[0]?.trim();
  return label || UNCATEGORIZED_LABEL;
}

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

  const resolveLabel = (categoryId: number | null) =>
    resolveTopLevelLabel(categoryId, categoryLookup);

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

  if (total <= 0) return { total, rows: [] };

  const rows = Array.from(totals.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);

  const baseCount = Math.min(limit, rows.length);
  let visibleCount = baseCount;
  let visibleSum = rows.slice(0, visibleCount).reduce((sum, row) => sum + row.value, 0);
  let otherValue = Math.max(total - visibleSum, 0);
  const maxOtherValue = total * OTHER_SHARE_MAX;

  while (visibleCount < rows.length && otherValue > maxOtherValue) {
    visibleSum += rows[visibleCount].value;
    visibleCount += 1;
    otherValue = Math.max(total - visibleSum, 0);
  }

  const head = rows.slice(0, visibleCount);
  if (otherValue > 0) head.push({ label: OTHER_LABEL, value: otherValue });
  return { total, rows: head };
}

function buildCategoryTotalsByLabel(
  txs: TransactionOut[],
  direction: "INCOME" | "EXPENSE",
  startKey: string,
  endKey: string,
  categoryLookup: ReturnType<typeof buildCategoryLookup>
) {
  const totals = new Map<string, number>();

  const resolveLabel = (categoryId: number | null) =>
    resolveTopLevelLabel(categoryId, categoryLookup);

  txs.forEach((tx) => {
    if (tx.direction !== direction) return;
    const dateKey = toTxDateKey(tx.transaction_date);
    if (!dateKey) return;
    if (dateKey < startKey || dateKey > endKey) return;
    if (!isRealizedTransaction(tx)) return;
    const label = resolveLabel(tx.category_id);
    totals.set(label, (totals.get(label) ?? 0) + tx.amount_rub);
  });

  return totals;
}

function buildCategoryMonthlyTotals(
  txs: TransactionOut[],
  direction: "INCOME" | "EXPENSE",
  startKey: string,
  endKey: string,
  categoryLookup: ReturnType<typeof buildCategoryLookup>
) {
  const totals = new Map<string, Map<string, number>>();

  txs.forEach((tx) => {
    if (tx.direction !== direction) return;
    const dateKey = toTxDateKey(tx.transaction_date);
    if (!dateKey) return;
    if (dateKey < startKey || dateKey > endKey) return;
    if (!isRealizedTransaction(tx)) return;
    const label = resolveTopLevelLabel(tx.category_id, categoryLookup);
    const monthKey = dateKey.slice(0, 7);
    if (!totals.has(label)) totals.set(label, new Map());
    const monthTotals = totals.get(label);
    if (!monthTotals) return;
    monthTotals.set(monthKey, (monthTotals.get(monthKey) ?? 0) + tx.amount_rub);
  });

  return totals;
}

function buildOtherMonthlyTotals(
  monthlyTotalsByLabel: Map<string, Map<string, number>>,
  otherLabels: string[]
) {
  const totals = new Map<string, number>();
  otherLabels.forEach((label) => {
    const monthTotals = monthlyTotalsByLabel.get(label);
    if (!monthTotals) return;
    monthTotals.forEach((value, monthKey) => {
      totals.set(monthKey, (totals.get(monthKey) ?? 0) + value);
    });
  });
  return totals;
}

function averageMonthlyTotal(monthTotals: Map<string, number>) {
  let sum = 0;
  let count = 0;
  monthTotals.forEach((value) => {
    if (value !== 0) {
      sum += value;
      count += 1;
    }
  });
  return count > 0 ? sum / count : null;
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
  itemKindById: Map<number, ItemKind>,
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
  const [incomeHover, setIncomeHover] = useState<CategorySegment | null>(null);
  const [expenseHover, setExpenseHover] = useState<CategorySegment | null>(null);
  const chartRef = useRef<HTMLDivElement | null>(null);
  const [chartSize, setChartSize] = useState({ width: 240, height: 128 });
  const now = new Date();
  const todayKey = toDateKey(now);
  const monthStartKey = toDateKey(new Date(now.getFullYear(), now.getMonth(), 1));
  const monthEndKey = toDateKey(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  const rangeStartKey = monthStartKey;
  const rangeEndKey = monthEndKey;
  const previousMonthRange = getPreviousMonthRange(now);
  const previousMonthStartKey = toDateKey(previousMonthRange.start);
  const previousMonthEndKey = toDateKey(previousMonthRange.end);
  const previousMonthLabel = formatMonthLabel(previousMonthRange.start);
  const priorMonthRange = getPreviousMonthRange(previousMonthRange.start);
  const priorMonthStartKey = toDateKey(priorMonthRange.start);
  const priorMonthEndKey = toDateKey(priorMonthRange.end);
  const twelveMonthStartKey = toDateKey(addMonths(previousMonthRange.start, -11));
  const twelveMonthEndKey = previousMonthEndKey;

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

  const categoryLookup = useMemo(
    () => buildCategoryLookup(categoryNodes),
    [categoryNodes]
  );
  const categoryDescendants = useMemo(
    () => buildCategoryDescendants(categoryNodes),
    [categoryNodes]
  );
  const topLevelIconByLabel = useMemo(() => {
    const map = new Map<string, CategoryIcon>();
    categoryNodes.forEach((node) => {
      const label = node.name?.trim();
      if (!label) return;
      const iconName = node.icon_name?.trim();
      if (!iconName) return;
      const Icon = CATEGORY_ICON_BY_NAME[iconName];
      if (!Icon) return;
      map.set(label, Icon);
    });
    return map;
  }, [categoryNodes]);

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
    () =>
      items.filter(
        (item) =>
          !item.archived_at &&
          !item.closed_at &&
          !(item.type_code === "bank_card" && item.card_account_id)
      ),
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

  const incomeTotalsCurrent = useMemo(
    () =>
      buildCategoryTotalsByLabel(
        txs,
        "INCOME",
        previousMonthStartKey,
        previousMonthEndKey,
        categoryLookup
      ),
    [categoryLookup, previousMonthEndKey, previousMonthStartKey, txs]
  );

  const expenseTotalsCurrent = useMemo(
    () =>
      buildCategoryTotalsByLabel(
        txs,
        "EXPENSE",
        previousMonthStartKey,
        previousMonthEndKey,
        categoryLookup
      ),
    [categoryLookup, previousMonthEndKey, previousMonthStartKey, txs]
  );

  const incomeTotalsPrevMonth = useMemo(
    () =>
      buildCategoryTotalsByLabel(
        txs,
        "INCOME",
        priorMonthStartKey,
        priorMonthEndKey,
        categoryLookup
      ),
    [categoryLookup, priorMonthEndKey, priorMonthStartKey, txs]
  );

  const expenseTotalsPrevMonth = useMemo(
    () =>
      buildCategoryTotalsByLabel(
        txs,
        "EXPENSE",
        priorMonthStartKey,
        priorMonthEndKey,
        categoryLookup
      ),
    [categoryLookup, priorMonthEndKey, priorMonthStartKey, txs]
  );

  const incomeMonthlyTotals = useMemo(
    () =>
      buildCategoryMonthlyTotals(
        txs,
        "INCOME",
        twelveMonthStartKey,
        twelveMonthEndKey,
        categoryLookup
      ),
    [categoryLookup, twelveMonthEndKey, twelveMonthStartKey, txs]
  );

  const expenseMonthlyTotals = useMemo(
    () =>
      buildCategoryMonthlyTotals(
        txs,
        "EXPENSE",
        twelveMonthStartKey,
        twelveMonthEndKey,
        categoryLookup
      ),
    [categoryLookup, twelveMonthEndKey, twelveMonthStartKey, txs]
  );

  const incomePrevMonthTotal = useMemo(
    () => sumMapValues(incomeTotalsPrevMonth),
    [incomeTotalsPrevMonth]
  );

  const expensePrevMonthTotal = useMemo(
    () => sumMapValues(expenseTotalsPrevMonth),
    [expenseTotalsPrevMonth]
  );

  const incomeLegendRows = useMemo<LegendRow[]>(() => {
    if (incomeSegments.length === 0) return [];
    const visibleLabels = incomeSegments
      .map((segment) => segment.label)
      .filter((label) => label !== OTHER_LABEL);
    const otherLabels = Array.from(incomeTotalsCurrent.keys()).filter(
      (label) => !visibleLabels.includes(label)
    );
    const prevTopSum = visibleLabels.reduce(
      (sum, label) => sum + (incomeTotalsPrevMonth.get(label) ?? 0),
      0
    );
    const otherPrevValue = Math.max(incomePrevMonthTotal - prevTopSum, 0);
    const otherMonthlyTotals = buildOtherMonthlyTotals(
      incomeMonthlyTotals,
      otherLabels
    );
    const otherAvgValue = averageMonthlyTotal(otherMonthlyTotals);
    const emptyMonthly = new Map<string, number>();

    return incomeSegments.map((segment) => {
      const isOther = segment.label === OTHER_LABEL;
      const prevValue = isOther
        ? otherPrevValue
        : incomeTotalsPrevMonth.get(segment.label) ?? 0;
      const avgValue = isOther
        ? otherAvgValue
        : averageMonthlyTotal(incomeMonthlyTotals.get(segment.label) ?? emptyMonthly);
      return {
        ...segment,
        prevDelta: calcPercentChange(segment.value, prevValue),
        avgDelta: calcPercentChange(segment.value, avgValue),
      };
    });
  }, [
    incomeSegments,
    incomeTotalsCurrent,
    incomeMonthlyTotals,
    incomeTotalsPrevMonth,
    incomePrevMonthTotal,
  ]);

  const expenseLegendRows = useMemo<LegendRow[]>(() => {
    if (expenseSegments.length === 0) return [];
    const visibleLabels = expenseSegments
      .map((segment) => segment.label)
      .filter((label) => label !== OTHER_LABEL);
    const otherLabels = Array.from(expenseTotalsCurrent.keys()).filter(
      (label) => !visibleLabels.includes(label)
    );
    const prevTopSum = visibleLabels.reduce(
      (sum, label) => sum + (expenseTotalsPrevMonth.get(label) ?? 0),
      0
    );
    const otherPrevValue = Math.max(expensePrevMonthTotal - prevTopSum, 0);
    const otherMonthlyTotals = buildOtherMonthlyTotals(
      expenseMonthlyTotals,
      otherLabels
    );
    const otherAvgValue = averageMonthlyTotal(otherMonthlyTotals);
    const emptyMonthly = new Map<string, number>();

    return expenseSegments.map((segment) => {
      const isOther = segment.label === OTHER_LABEL;
      const prevValue = isOther
        ? otherPrevValue
        : expenseTotalsPrevMonth.get(segment.label) ?? 0;
      const avgValue = isOther
        ? otherAvgValue
        : averageMonthlyTotal(expenseMonthlyTotals.get(segment.label) ?? emptyMonthly);
      return {
        ...segment,
        prevDelta: calcPercentChange(segment.value, prevValue),
        avgDelta: calcPercentChange(segment.value, avgValue),
      };
    });
  }, [
    expenseSegments,
    expenseTotalsCurrent,
    expenseMonthlyTotals,
    expenseTotalsPrevMonth,
    expensePrevMonthTotal,
  ]);

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
  const showOverdueWidget = overduePlannedCount > 0;


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

    const deltasByDate = buildDeltasByDate(txs, selectedIds, itemKindById, todayKey);
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

  const monthStartNetTotal = useMemo(() => {
    const row = dailyRows.find((daily) => daily.date === monthStartKey);
    return row?.totalRubCents ?? null;
  }, [dailyRows, monthStartKey]);

  const netTotalChangePercent = useMemo(() => {
    if (loading) return null;
    if (monthStartNetTotal === null || monthStartNetTotal === 0) return null;
    const delta = netTotal - monthStartNetTotal;
    const percent = (delta / Math.abs(monthStartNetTotal)) * 100;
    if (!Number.isFinite(percent)) return null;
    return percent;
  }, [loading, monthStartNetTotal, netTotal]);

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
  const padding = { top: 8, right: 8, bottom: 8, left: 8 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const values = chartData.map((point) => point.value);
  const minValue = values.length ? Math.min(...values) : 0;
  const maxValue = values.length ? Math.max(...values) : 0;
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

  return (
    <main className="min-h-screen bg-[#F7F8FA] px-8 py-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Дэшборд</h1>
          <p className="text-sm text-muted-foreground">Ключевые метрики за последние дни.</p>
        </div>

        <div
          className={
            showOverdueWidget
              ? "grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,0.5fr)] xl:grid-cols-[minmax(0,1fr)_minmax(0,0.5fr)]"
              : "grid gap-4"
          }
        >
          <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-violet-600 via-violet-500 to-fuchsia-500 text-white shadow-[0_20px_50px_-28px_rgba(76,29,149,0.8)]">
            <div className="pointer-events-none absolute right-4 top-3 h-32 w-60 opacity-90">
              <div ref={chartRef} className="h-full w-full">
                {!loading && !error && chartData.length > 1 && (
                  <svg
                    viewBox={`0 0 ${width} ${height}`}
                    className="h-full w-full"
                    aria-hidden="true"
                  >
                    <defs>
                      <linearGradient id="netWorthArea" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.35" />
                        <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
                      </linearGradient>
                    </defs>

                    {pastAreaPath && <path d={pastAreaPath} fill="url(#netWorthArea)" />}
                    {futureAreaPath && (
                      <path d={futureAreaPath} fill="url(#netWorthArea)" />
                    )}
                    {pastLinePath && (
                      <path
                        d={pastLinePath}
                        fill="none"
                        stroke="rgba(255,255,255,0.9)"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                      />
                    )}
                    {futureLinePath && (
                      <path
                        d={futureLinePath}
                        fill="none"
                        stroke="rgba(255,255,255,0.9)"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                      />
                    )}
                  </svg>
                )}
              </div>
            </div>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2 text-white/90">
                <Wallet className="h-5 w-5 text-white/90" />
                Текущий чистый капитал
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="break-words text-4xl font-semibold leading-tight text-white tabular-nums">
                {loading
                  ? "..."
                  : netTotal < 0
                  ? `-${formatRub(Math.abs(netTotal))}`
                  : formatRub(netTotal)}
              </div>
              <div className="flex items-center gap-2 text-xs text-white/80">
                <span>С 1 числа месяца</span>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums ${netWorthBadgeClass(netTotalChangePercent)}`}
                >
                  {loading ? "..." : formatChangePercent(netTotalChangePercent)}
                </span>
              </div>
              <div className="space-y-1 text-xs text-white/80">
                <div className="flex items-center justify-between">
                  <span>Активы</span>
                  <span className="tabular-nums whitespace-nowrap text-white/90">
                    {loading ? "..." : formatRub(totalAssets)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Обязательства</span>
                  <span className="tabular-nums whitespace-nowrap text-white/90">
                    {loading ? "..." : `-${formatRub(totalLiabilities)}`}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {showOverdueWidget && (
            <Card className="overflow-hidden border-0 bg-gradient-to-br from-rose-700 via-red-600 to-orange-600 text-white shadow-[0_20px_50px_-28px_rgba(136,19,55,0.85)]">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2 text-white/90">
                  <AlertCircle className="h-5 w-5 text-white/90" />
                  Просроченные плановые транзакции
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-4xl font-semibold text-white tabular-nums">
                    {loading ? "..." : overduePlannedCount}
                  </div>
                  <Button
                    asChild
                    size="sm"
                    variant="outline"
                    className="w-fit border-white/30 bg-white/10 text-white shadow-none hover:bg-white/20"
                  >
                    <Link href="/transactions?preset=overdue-planned">
                      Просмотреть
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium text-slate-800">
                Доходы за <span className="text-violet-600">{previousMonthLabel}</span>
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
                <div className="relative" onMouseLeave={() => setIncomeHover(null)}>
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
                  <div className="flex h-4 w-full overflow-hidden rounded-full bg-white/70 shadow-[0_12px_24px_-16px_rgba(15,23,42,0.35)]">
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
                <div className="mt-3 space-y-2 overflow-x-auto pb-1">
                  {incomeLegendRows.map((row, index) => {
                    const CategoryIcon =
                      topLevelIconByLabel.get(row.label) ?? CATEGORY_ICON_FALLBACK;
                    return (
                      <div
                        key={`${row.label}-${index}`}
                        className="grid min-w-[26rem] grid-cols-[minmax(0,1fr)_8rem_4.5rem_4.5rem_4.5rem] items-center gap-2 text-xs text-slate-600"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: row.color }}
                          />
                          <CategoryIcon className="h-3.5 w-3.5 text-slate-500" />
                          <span className="truncate font-medium text-slate-900">
                            {row.label}
                          </span>
                        </div>
                        <span className="tabular-nums text-right text-slate-900 whitespace-nowrap">
                          {formatRub(row.value)}
                        </span>
                        <span className="tabular-nums text-right text-slate-500 whitespace-nowrap">
                          {formatPercent(row.percent * 100)}%
                        </span>
                        <div className="flex justify-end">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums ${changeBadgeClass(row.prevDelta)}`}
                          >
                            {formatChangePercent(row.prevDelta)}
                          </span>
                        </div>
                        <div className="flex justify-end">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums ${changeBadgeClass(row.avgDelta)}`}
                          >
                            {formatChangePercent(row.avgDelta)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium text-slate-800">
                Расходы за <span className="text-violet-600">{previousMonthLabel}</span>
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
                <div className="relative" onMouseLeave={() => setExpenseHover(null)}>
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
                  <div className="flex h-4 w-full overflow-hidden rounded-full bg-white/70 shadow-[0_12px_24px_-16px_rgba(15,23,42,0.35)]">
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
                <div className="mt-3 space-y-2 overflow-x-auto pb-1">
                  {expenseLegendRows.map((row, index) => {
                    const CategoryIcon =
                      topLevelIconByLabel.get(row.label) ?? CATEGORY_ICON_FALLBACK;
                    return (
                      <div
                        key={`${row.label}-${index}`}
                        className="grid min-w-[26rem] grid-cols-[minmax(0,1fr)_8rem_4.5rem_4.5rem_4.5rem] items-center gap-2 text-xs text-slate-600"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: row.color }}
                          />
                          <CategoryIcon className="h-3.5 w-3.5 text-slate-500" />
                          <span className="truncate font-medium text-slate-900">
                            {row.label}
                          </span>
                        </div>
                        <span className="tabular-nums text-right text-slate-900 whitespace-nowrap">
                          {formatRub(row.value)}
                        </span>
                        <span className="tabular-nums text-right text-slate-500 whitespace-nowrap">
                          {formatPercent(row.percent * 100)}%
                        </span>
                        <div className="flex justify-end">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums ${changeBadgeClass(row.prevDelta)}`}
                          >
                            {formatChangePercent(row.prevDelta)}
                          </span>
                        </div>
                        <div className="flex justify-end">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums ${changeBadgeClass(row.avgDelta)}`}
                          >
                            {formatChangePercent(row.avgDelta)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

        </div>

        <Card className="overflow-hidden border-0 bg-gradient-to-br from-sky-600 via-blue-600 to-indigo-600 text-white shadow-[0_20px_50px_-28px_rgba(30,64,175,0.7)]">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-white/90">
              <Target className="h-5 w-5 text-white/90" />
              Контроль лимитов
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <div className="text-sm text-white/80">Загрузка лимитов...</div>
            ) : activeLimits.length === 0 ? (
              <div className="rounded-lg border border-dashed border-white/40 bg-white/10 p-4 text-center text-sm text-white/80">
                Активных лимитов пока нет.
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {activeLimits.map((limit) => {
                  const summary = limitSummaryById.get(limit.id) ?? {
                    spent: 0,
                    progress: 0,
                    rangeLabel: "",
                  };
                  const ratio =
                    limit.amount_rub > 0 ? summary.spent / limit.amount_rub : 0;
                  const tone = getLimitProgressTone(ratio);
                  const progressColorClass = getLimitProgressColorClass(tone);
                  const periodLabel = LIMIT_PERIOD_LABELS[limit.period];
                  const rangeLabel = summary.rangeLabel;
                  return (
                    <div
                      key={limit.id}
                      className="rounded-xl px-3 py-2"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-white/90">
                            {limit.name}
                          </div>
                          <div className="truncate text-xs text-white/70">
                            {periodLabel}
                            {rangeLabel ? ` | ${rangeLabel}` : ""}
                            {" | "}
                            {formatLimitCategoryLabel(limit.category_id)}
                          </div>
                        </div>
                        <div
                          className="shrink-0 text-sm font-semibold tabular-nums whitespace-nowrap"
                        >
                          <span className={getLimitProgressTextClass(tone)}>
                            {formatRub(summary.spent)}
                          </span>{" "}
                          <span className="text-white/90">/ {formatRub(limit.amount_rub)}</span>
                        </div>
                      </div>
                      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/20">
                        <div
                          className={`h-full ${progressColorClass}`}
                          style={{
                            width: `${summary.progress * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </main>
  );
}
