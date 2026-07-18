"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from "react";
import { createPortal } from "react-dom";
import { useSession } from "next-auth/react";
import { useAccountingStart } from "@/components/accounting-start-context";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Calendar,
  ChevronDown,
  ChevronRight,
  Minus,
  PieChart,
  Plus,
  Target,
  User,
  Wallet,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IconButton } from "@/components/ui/icon-button";
import { Tag } from "@/components/ui/tag";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { PeriodRangeCalendar } from "@/components/period-range-calendar";
import { useSidebar } from "@/components/ui/sidebar-context";
import {
  buildCategoryDescendants,
  buildCategoryLookup,
  makeCategoryPathKey,
  type CategoryNode,
} from "@/lib/categories";
import {
  CATEGORY_ICON_BY_NAME,
  CATEGORY_ICON_FALLBACK,
} from "@/lib/category-icons";
import {
  API_BASE,
  fetchCategories,
  fetchGoals,
  fetchFxRates,
  fetchItems,
  fetchTransactions,
  fetchUserMe,
  fetchUserPhotoAsBlob,
  FxRateOut,
  ItemKind,
  ItemOut,
  GoalOut,
  TransactionOut,
  UserMeOut,
} from "@/lib/api";
import { CategoryIconImage } from "@/components/category-icon-image";
import { ITEM_TYPE_LABELS } from "@/lib/item-types";
import { getEffectiveItemKind, formatAmount, getItemPrimaryValueCents } from "@/lib/item-utils";
import {
  ASSET_DETAIL_HEADER_GRADIENT_MOBILE,
  OVERDUE_TRANSACTIONS_GRADIENT,
  NO_OVERDUE_TRANSACTIONS_GRADIENT,
} from "@/lib/gradients";
import { getGoalProgressColor } from "@/lib/goal-progress-color";
import { ACCENT, GREEN, MODAL_BG, ORANGE, RED } from "@/lib/colors";
import { CurrencyChip } from "@/components/currency-chip";
import { cn } from "@/lib/utils";
import {
  CASHFLOW_BUCKET_ORDER,
  CASHFLOW_LABELS,
  buildCashflowTransactionsHref,
  classifyCashflowBucket,
  type CashflowBucket,
} from "@/lib/cashflow-buckets";

/** Подложка в стиле карточки актива: MODAL_BG, rounded-lg, без бордера. */
const assetCardSurfaceClass =
  "relative rounded-lg overflow-hidden border-0 outline-none";

type CashflowSegment = {
  key: CashflowBucket;
  label: string;
  value: number;
  color: string;
};

type CashflowBreakdown = {
  actual: number;
  planned: number;
  overdueMonth: number;
  overduePrev: number;
  total: number;
  segments: CashflowSegment[];
};

type CashflowBucketGroup = {
  key: CashflowBucket;
  label: string;
  color: string;
  total: number;
  categories: { label: string; value: number }[];
};

const INCOME_SEGMENT_COLORS: Record<CashflowBucket, string> = {
  actual: GREEN,
  planned: "rgba(52, 211, 153, 0.45)",
  overdue_month: ORANGE,
  overdue_prev: "#E11D48",
};

const EXPENSE_SEGMENT_COLORS: Record<CashflowBucket, string> = {
  actual: RED,
  planned: "rgba(251, 76, 79, 0.45)",
  overdue_month: ORANGE,
  overdue_prev: "#BE123C",
};

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

const CASH_TYPES = ["cash", "bank_account", "bank_card", "e_wallet"];
const FINANCIAL_INSTRUMENTS_TYPES = [
  "deposit",
  "savings_account",
  "brokerage",
  "securities",
  "bonds",
  "crypto",
  "precious_metals",
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
  "counterparty_settlements",
  "npf",
  "investment_life_insurance",
  "business_share",
  "sole_proprietor",
  "other_asset",
];

type AssetStructureSegment = {
  label: string;
  value: number;
  percent: number;
  color: string;
};

function describeDonutArc(
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  startAngleRad: number,
  endAngleRad: number
): string {
  const xi1 = cx + innerR * Math.cos(startAngleRad);
  const yi1 = cy - innerR * Math.sin(startAngleRad);
  const xo1 = cx + outerR * Math.cos(startAngleRad);
  const yo1 = cy - outerR * Math.sin(startAngleRad);
  const xo2 = cx + outerR * Math.cos(endAngleRad);
  const yo2 = cy - outerR * Math.sin(endAngleRad);
  const xi2 = cx + innerR * Math.cos(endAngleRad);
  const yi2 = cy - innerR * Math.sin(endAngleRad);
  const angleSpan = Math.abs(endAngleRad - startAngleRad);
  const largeArc = angleSpan > Math.PI ? 1 : 0;
  const sweep = endAngleRad < startAngleRad ? 1 : 0;
  const innerSweep = 1 - sweep;
  return `M ${xi1} ${yi1} L ${xo1} ${yo1} A ${outerR} ${outerR} 0 ${largeArc} ${sweep} ${xo2} ${yo2} L ${xi2} ${yi2} A ${innerR} ${innerR} 0 ${largeArc} ${innerSweep} ${xi1} ${yi1} Z`;
}

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
  { code: "counterparty_settlements", label: "Взаиморасчёты" },
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

function formatShortDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return dateKey;
  const paddedDay = String(day).padStart(2, "0");
  const paddedMonth = String(month).padStart(2, "0");
  return `${paddedDay}.${paddedMonth}.${year}`;
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
  return formatAmount(valueInCents);
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

function getChangeVariant(
  percent: number | null,
  type: "income" | "expense"
): "good" | "bad" {
  if (percent === null) return "bad";
  if (type === "income") {
    // Для доходов: положительный = хорошо, отрицательный = плохо
    return percent >= 0 ? "good" : "bad";
  } else {
    // Для расходов: отрицательный = хорошо (расходы снизились), положительный = плохо
    return percent <= 0 ? "good" : "bad";
  }
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

function getGoalRange(goal: GoalOut, today: Date) {
  if (goal.period === "CUSTOM") {
    if (!goal.custom_start_date || !goal.custom_end_date) return null;
    return {
      startKey: goal.custom_start_date,
      endKey: goal.custom_end_date,
      rangeLabel: formatRangeLabel(goal.custom_start_date, goal.custom_end_date),
    };
  }

  if (goal.period === "WEEKLY") {
    const start = getWeekStart(today);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
    const startKey = toDateKey(start);
    const endKey = toDateKey(end);
    return { startKey, endKey, rangeLabel: formatRangeLabel(startKey, endKey) };
  }

  if (goal.period === "MONTHLY") {
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

function getCurrentMonthRangeKeys(date: Date = new Date()) {
  return {
    startKey: toDateKey(new Date(date.getFullYear(), date.getMonth(), 1)),
    endKey: toDateKey(new Date(date.getFullYear(), date.getMonth() + 1, 0)),
  };
}

function isFullCalendarMonthRange(startKey: string, endKey: string) {
  const start = parseDateKey(startKey);
  if (Number.isNaN(start.getTime())) return false;
  const expectedStart = toDateKey(
    new Date(start.getFullYear(), start.getMonth(), 1)
  );
  const expectedEnd = toDateKey(
    new Date(start.getFullYear(), start.getMonth() + 1, 0)
  );
  return startKey === expectedStart && endKey === expectedEnd;
}

function formatDashboardPeriodLabel(startKey: string, endKey: string) {
  if (isFullCalendarMonthRange(startKey, endKey)) {
    const label = formatMonthLabel(parseDateKey(startKey));
    return label.charAt(0).toUpperCase() + label.slice(1);
  }
  return formatRangeLabel(startKey, endKey);
}

function getPreviousMonthRange(date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth() - 1, 1);
  const end = new Date(date.getFullYear(), date.getMonth(), 0);
  return { start, end };
}

function isRealizedTransaction(tx: TransactionOut) {
  return tx.transaction_type === "ACTUAL" || tx.status === "REALIZED";
}

function isOpenPlannedTransaction(tx: TransactionOut) {
  return tx.transaction_type === "PLANNED" && tx.status !== "REALIZED";
}

/** Учитывать ли транзакцию в цифрах дашборда при включённом/выключенном «Плане». */
function isDashboardTxIncluded(tx: TransactionOut, includePlan: boolean) {
  if (isRealizedTransaction(tx)) return true;
  return includePlan && isOpenPlannedTransaction(tx);
}

function buildCashflowBreakdown(
  txs: TransactionOut[],
  direction: "INCOME" | "EXPENSE",
  periodStartKey: string,
  periodEndKey: string,
  todayKey: string,
  colors: Record<CashflowBucket, string>
): CashflowBreakdown {
  const totals: Record<CashflowBucket, number> = {
    actual: 0,
    planned: 0,
    overdue_month: 0,
    overdue_prev: 0,
  };

  txs.forEach((tx) => {
    const bucket = classifyCashflowBucket(
      tx,
      direction,
      periodStartKey,
      periodEndKey,
      todayKey
    );
    if (!bucket) return;
    totals[bucket] += tx.amount;
  });

  const segments = CASHFLOW_BUCKET_ORDER.map((key) => ({
    key,
    label: CASHFLOW_LABELS[key],
    value: totals[key],
    color: colors[key],
  })).filter((segment) => segment.value > 0);

  return {
    actual: totals.actual,
    planned: totals.planned,
    overdueMonth: totals.overdue_month,
    overduePrev: totals.overdue_prev,
    total:
      totals.actual +
      totals.planned +
      totals.overdue_month +
      totals.overdue_prev,
    segments,
  };
}

function withCashflowPlanFilter(
  breakdown: CashflowBreakdown,
  includePlan: boolean,
  colors: Record<CashflowBucket, string>
): CashflowBreakdown {
  if (includePlan) return breakdown;
  const actual = breakdown.actual;
  return {
    actual,
    planned: 0,
    overdueMonth: 0,
    overduePrev: 0,
    total: actual,
    segments:
      actual > 0
        ? [
            {
              key: "actual",
              label: CASHFLOW_LABELS.actual,
              value: actual,
              color: colors.actual,
            },
          ]
        : [],
  };
}

function buildCashflowBucketGroups(
  txs: TransactionOut[],
  direction: "INCOME" | "EXPENSE",
  periodStartKey: string,
  periodEndKey: string,
  todayKey: string,
  categoryLookup: ReturnType<typeof buildCategoryLookup>,
  includePlan: boolean,
  colors: Record<CashflowBucket, string>
): CashflowBucketGroup[] {
  const byBucket = new Map<CashflowBucket, Map<string, number>>();

  txs.forEach((tx) => {
    const bucket = classifyCashflowBucket(
      tx,
      direction,
      periodStartKey,
      periodEndKey,
      todayKey
    );
    if (!bucket) return;
    if (!includePlan && bucket !== "actual") return;
    const label = resolveTopLevelLabel(tx.category_id, categoryLookup);
    if (!byBucket.has(bucket)) byBucket.set(bucket, new Map());
    const categories = byBucket.get(bucket);
    if (!categories) return;
    categories.set(label, (categories.get(label) ?? 0) + tx.amount);
  });

  const keys = includePlan ? CASHFLOW_BUCKET_ORDER : (["actual"] as CashflowBucket[]);

  return keys
    .map((key) => {
      const categoriesMap = byBucket.get(key) ?? new Map<string, number>();
      const categories = Array.from(categoriesMap.entries())
        .map(([label, value]) => ({ label, value }))
        .filter((row) => row.value > 0)
        .sort((a, b) => b.value - a.value);
      const total = categories.reduce((sum, row) => sum + row.value, 0);
      return {
        key,
        label: CASHFLOW_LABELS[key],
        color: colors[key],
        total,
        categories,
      };
    })
    .filter((group) => group.total > 0);
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
  limit: number,
  includePlan: boolean
): CategoryBreakdown {
  const totals = new Map<string, number>();
  let total = 0;

  const resolveLabel = (categoryId: number | null) =>
    resolveTopLevelLabel(categoryId, categoryLookup);

  txs.forEach((tx) => {
    if (tx.is_split_parent) return;
    if (tx.direction !== direction) return;
    const dateKey = toTxDateKey(tx.transaction_date);
    if (!dateKey) return;
    if (dateKey < startKey || dateKey > endKey) return;
    if (!isDashboardTxIncluded(tx, includePlan)) return;
    const label = resolveLabel(tx.category_id);
    totals.set(label, (totals.get(label) ?? 0) + tx.amount);
    total += tx.amount;
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
  categoryLookup: ReturnType<typeof buildCategoryLookup>,
  includePlan: boolean
) {
  const totals = new Map<string, number>();

  const resolveLabel = (categoryId: number | null) =>
    resolveTopLevelLabel(categoryId, categoryLookup);

  txs.forEach((tx) => {
    if (tx.is_split_parent) return;
    if (tx.direction !== direction) return;
    const dateKey = toTxDateKey(tx.transaction_date);
    if (!dateKey) return;
    if (dateKey < startKey || dateKey > endKey) return;
    if (!isDashboardTxIncluded(tx, includePlan)) return;
    const label = resolveLabel(tx.category_id);
    totals.set(label, (totals.get(label) ?? 0) + tx.amount);
  });

  return totals;
}

function buildCategoryMonthlyTotals(
  txs: TransactionOut[],
  direction: "INCOME" | "EXPENSE",
  startKey: string,
  endKey: string,
  categoryLookup: ReturnType<typeof buildCategoryLookup>,
  includePlan: boolean
) {
  const totals = new Map<string, Map<string, number>>();

  txs.forEach((tx) => {
    if (tx.is_split_parent) return;
    if (tx.direction !== direction) return;
    const dateKey = toTxDateKey(tx.transaction_date);
    if (!dateKey) return;
    if (dateKey < startKey || dateKey > endKey) return;
    if (!isDashboardTxIncluded(tx, includePlan)) return;
    const label = resolveTopLevelLabel(tx.category_id, categoryLookup);
    const monthKey = dateKey.slice(0, 7);
    if (!totals.has(label)) totals.set(label, new Map());
    const monthTotals = totals.get(label);
    if (!monthTotals) return;
    monthTotals.set(monthKey, (monthTotals.get(monthKey) ?? 0) + tx.amount);
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

function getItemStartKey(item: ItemOut, accountingStartDate?: string | null) {
  let minDate = accountingStartDate ?? item.open_date ?? "";
  if (item.open_date && item.open_date > minDate) {
    minDate = item.open_date;
  }
  return minDate ? toTxDateKey(minDate) : toDateKey(new Date(item.created_at));
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
  includePlan: boolean
) {
  const map = new Map<string, Map<number, number>>();
  const addDelta = (dateKey: string, itemId: number, delta: number) => {
    if (!map.has(dateKey)) map.set(dateKey, new Map());
    const bucket = map.get(dateKey);
    if (!bucket) return;
    bucket.set(itemId, (bucket.get(itemId) ?? 0) + delta);
  };

  txs.forEach((tx) => {
    if (tx.is_split_parent) return;
    const dateKey = toTxDateKey(tx.transaction_date);
    if (!dateKey) return;
    if (tx.source === "AUTO_ITEM_OPENING" || tx.source === "AUTO_ITEM_CLOSING") {
      return;
    }
    if (!isDashboardTxIncluded(tx, includePlan)) return;

    const primarySelected = selectedIds.has(tx.primary_item_id);
    const counterSelected = tx.counterparty_item_id
      ? selectedIds.has(tx.counterparty_item_id)
      : false;
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
      const delta = transferDelta(kind, false, counterAmount);
      addDelta(dateKey, tx.counterparty_item_id, delta);
    }
  });

  return map;
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const { accountingStartDate } = useAccountingStart();
  const { isDesktop } = useSidebar();
  const [items, setItems] = useState<ItemOut[]>([]);
  const [txs, setTxs] = useState<TransactionOut[]>([]);
  const [goals, setGoals] = useState<GoalOut[]>([]);
  const [userProfile, setUserProfile] = useState<UserMeOut | null>(null);
  const [userPhotoUrl, setUserPhotoUrl] = useState<string | null>(null);
  const [fxRates, setFxRates] = useState<FxRateOut[]>([]);
  const [categoryNodes, setCategoryNodes] = useState<CategoryNode[]>([]);
  const [fxRatesByDate, setFxRatesByDate] = useState<Record<string, FxRateOut[]>>(
    {}
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [incomeHover, setIncomeHover] = useState<CategorySegment | null>(null);
  const [expenseHover, setExpenseHover] = useState<CategorySegment | null>(null);
  const [mobileDetail, setMobileDetail] = useState<"structure" | null>(null);
  const [mobileDetailExpanded, setMobileDetailExpanded] = useState(false);
  const [showPlan, setShowPlan] = useState(true);
  const [expandedCashflow, setExpandedCashflow] = useState<
    "income" | "expense" | null
  >(null);
  const [periodStartKey, setPeriodStartKey] = useState(
    () => getCurrentMonthRangeKeys().startKey
  );
  const [periodEndKey, setPeriodEndKey] = useState(
    () => getCurrentMonthRangeKeys().endKey
  );
  const [periodDialogOpen, setPeriodDialogOpen] = useState(false);
  const [periodCalendarKey, setPeriodCalendarKey] = useState(0);
  const [draftPeriodStartKey, setDraftPeriodStartKey] = useState(periodStartKey);
  const [draftPeriodEndKey, setDraftPeriodEndKey] = useState(periodEndKey);
  const [mobileStickyHeaderVisible, setMobileStickyHeaderVisible] = useState(false);
  const mobileStickyHeaderVisibleRef = useRef(false);
  const mobileHeroDissolveRef = useRef<HTMLDivElement | null>(null);
  const mobileHeroGradientRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<HTMLDivElement | null>(null);
  const [chartSize, setChartSize] = useState({ width: 240, height: 128 });
  const now = new Date();
  const todayKey = toDateKey(now);
  const currentMonthRange = getCurrentMonthRangeKeys(now);
  const isCurrentMonthPeriod =
    periodStartKey === currentMonthRange.startKey &&
    periodEndKey === currentMonthRange.endKey;
  const periodLabel = formatDashboardPeriodLabel(periodStartKey, periodEndKey);
  const rangeStartKey = periodStartKey;
  const rangeEndKey = periodEndKey;
  const previousMonthRange = getPreviousMonthRange(now);
  const previousMonthEndKey = toDateKey(previousMonthRange.end);
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
      fetchGoals(),
    ])
      .then(([itemsData, txData, fxRatesData, categoriesData, goalsData]) => {
        if (!active) return;
        setItems(itemsData);
        setTxs(txData);
        setFxRates(fxRatesData);
        setCategoryNodes(categoriesData);
        setGoals(goalsData);
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

  useEffect(() => {
    if (!session) return;
    let active = true;
    let blobUrl: string | null = null;

    const loadProfile = async () => {
      try {
        const profile = await fetchUserMe();
        if (!active) return;
        setUserProfile(profile);
        if (!profile.photo_url) return;
        if (profile.photo_url.includes("googleusercontent.com")) {
          setUserPhotoUrl(profile.photo_url);
          return;
        }
        blobUrl = await fetchUserPhotoAsBlob();
        if (active) setUserPhotoUrl(blobUrl);
      } catch {
        if (active) setUserPhotoUrl(null);
      }
    };

    loadProfile();
    return () => {
      active = false;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [session]);

  const profileFirstName = userProfile?.first_name?.trim() || userProfile?.name?.trim().split(/\s+/)[0] || "";
  const sessionName = (session?.user as { name?: string } | undefined)?.name?.trim().split(/\s+/)[0] || "";
  const greetingName = profileFirstName || sessionName;
  const avatarLetter = greetingName.slice(0, 1).toUpperCase();

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

  const activeGoals = useMemo(
    () => goals.filter((goal) => !goal.deleted_at),
    [goals]
  );

  const goalSummaryById = useMemo(() => {
    const now = new Date();
    const map = new Map<number, { amount: number; progress: number; rangeLabel: string }>();
    activeGoals.forEach((goal) => {
      const range = getGoalRange(goal, now);
      const categoryIds =
        categoryDescendants.get(goal.category_id) ?? new Set([goal.category_id]);
      const scope = categoryLookup.idToScope?.get(goal.category_id);
      const direction = scope === "INCOME" ? "INCOME" : "EXPENSE";
      let amount = 0;
      if (range) {
        txs.forEach((tx) => {
          if (tx.is_split_parent) return;
          if (tx.direction !== direction) return;
          if (!isRealizedTransaction(tx)) return;
          if (!tx.category_id || !categoryIds.has(tx.category_id)) return;
          const dateKey = toTxDateKey(tx.transaction_date);
          if (!dateKey) return;
          if (dateKey < range.startKey || dateKey > range.endKey) return;
          amount += tx.amount;
        });
      }
      const progress =
        goal.amount > 0 ? Math.min(amount / goal.amount, 1) : 0;
      map.set(goal.id, {
        amount,
        progress,
        rangeLabel: range?.rangeLabel ?? "",
      });
    });
    return map;
  }, [activeGoals, categoryDescendants, categoryLookup.idToScope, txs]);

  const formatGoalCategoryLabel = (categoryId: number | null) => {
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

  /** Основная стоимость в рублях (копейках) для итогов по primary_value_kind. */
  function getPrimaryValueRubCents(item: ItemOut): number | null {
    const rate = rateByCode[item.currency_code];
    if (!rate) return null;
    const amount = Math.abs(getItemPrimaryValueCents(item)) / 100;
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
  const resolveItemEffectiveKind = useCallback(
    (item: ItemOut, balanceCents?: number) =>
      getEffectiveItemKind(item, balanceCents ?? item.current_value_rub),
    []
  );

  const cashItems = useMemo(
    () =>
      activeItems.filter(
        (x) =>
          resolveItemEffectiveKind(x) === "ASSET" && CASH_TYPES.includes(x.type_code)
      ),
    [activeItems, resolveItemEffectiveKind]
  );

  const financialInstrumentsItems = useMemo(
    () =>
      activeItems.filter(
        (x) =>
          resolveItemEffectiveKind(x) === "ASSET" &&
          FINANCIAL_INSTRUMENTS_TYPES.includes(x.type_code)
      ),
    [activeItems, resolveItemEffectiveKind]
  );

  const propertyItems = useMemo(
    () =>
      activeItems.filter(
        (x) =>
          resolveItemEffectiveKind(x) === "ASSET" && PROPERTY_TYPES.includes(x.type_code)
      ),
    [activeItems, resolveItemEffectiveKind]
  );

  const otherAssetItems = useMemo(
    () =>
      activeItems.filter(
        (x) =>
          resolveItemEffectiveKind(x) === "ASSET" && OTHER_ASSET_TYPES.includes(x.type_code)
      ),
    [activeItems, resolveItemEffectiveKind]
  );

  const liabilityItems = useMemo(
    () => activeItems.filter((x) => resolveItemEffectiveKind(x) === "LIABILITY"),
    [activeItems, resolveItemEffectiveKind]
  );

  const cashTotal = useMemo(
    () => cashItems.reduce((sum, x) => sum + (getPrimaryValueRubCents(x) ?? 0), 0),
    [cashItems, rateByCode]
  );

  const financialInstrumentsTotal = useMemo(
    () =>
      financialInstrumentsItems.reduce(
        (sum, x) => sum + (getPrimaryValueRubCents(x) ?? 0),
        0
      ),
    [financialInstrumentsItems, rateByCode]
  );

  const propertyTotal = useMemo(
    () => propertyItems.reduce((sum, x) => sum + (getPrimaryValueRubCents(x) ?? 0), 0),
    [propertyItems, rateByCode]
  );

  const otherAssetTotal = useMemo(
    () => otherAssetItems.reduce((sum, x) => sum + (getPrimaryValueRubCents(x) ?? 0), 0),
    [otherAssetItems, rateByCode]
  );

  const incomeBreakdown = useMemo(
    () =>
      buildCategoryBreakdown(
        txs,
        "INCOME",
        periodStartKey,
        periodEndKey,
        categoryLookup,
        CATEGORY_BREAKDOWN_LIMIT,
        showPlan
      ),
    [categoryLookup, periodEndKey, periodStartKey, showPlan, txs]
  );

  const expenseBreakdown = useMemo(
    () =>
      buildCategoryBreakdown(
        txs,
        "EXPENSE",
        periodStartKey,
        periodEndKey,
        categoryLookup,
        CATEGORY_BREAKDOWN_LIMIT,
        showPlan
      ),
    [categoryLookup, periodEndKey, periodStartKey, showPlan, txs]
  );

  const incomeCashflow = useMemo(
    () =>
      buildCashflowBreakdown(
        txs,
        "INCOME",
      periodStartKey,
      periodEndKey,
        todayKey,
        INCOME_SEGMENT_COLORS
      ),
    [periodEndKey, periodStartKey, todayKey, txs]
  );

  const expenseCashflow = useMemo(
    () =>
      buildCashflowBreakdown(
        txs,
        "EXPENSE",
      periodStartKey,
      periodEndKey,
        todayKey,
        EXPENSE_SEGMENT_COLORS
      ),
    [periodEndKey, periodStartKey, todayKey, txs]
  );

  const displayIncomeCashflow = useMemo(
    () => withCashflowPlanFilter(incomeCashflow, showPlan, INCOME_SEGMENT_COLORS),
    [incomeCashflow, showPlan]
  );

  const displayExpenseCashflow = useMemo(
    () => withCashflowPlanFilter(expenseCashflow, showPlan, EXPENSE_SEGMENT_COLORS),
    [expenseCashflow, showPlan]
  );

  const cashflowScale = Math.max(
    displayIncomeCashflow.total,
    displayExpenseCashflow.total,
    1
  );
  const plannedFreeBalance =
    displayIncomeCashflow.total - displayExpenseCashflow.total;
  const remainderAbs = Math.abs(plannedFreeBalance);
  const expensesExceedIncome =
    displayExpenseCashflow.total > displayIncomeCashflow.total;
  const incomeBarPct =
    cashflowScale > 0 ? (displayIncomeCashflow.total / cashflowScale) * 100 : 0;
  const expenseBarPct =
    cashflowScale > 0 ? (displayExpenseCashflow.total / cashflowScale) * 100 : 0;
  const remainderBarPct =
    cashflowScale > 0 ? (remainderAbs / cashflowScale) * 100 : 0;

  const incomeBucketGroups = useMemo(
    () =>
      buildCashflowBucketGroups(
        txs,
        "INCOME",
      periodStartKey,
      periodEndKey,
        todayKey,
        categoryLookup,
        showPlan,
        INCOME_SEGMENT_COLORS
      ),
    [categoryLookup, periodEndKey, periodStartKey, showPlan, todayKey, txs]
  );

  const expenseBucketGroups = useMemo(
    () =>
      buildCashflowBucketGroups(
        txs,
        "EXPENSE",
      periodStartKey,
      periodEndKey,
        todayKey,
        categoryLookup,
        showPlan,
        EXPENSE_SEGMENT_COLORS
      ),
    [categoryLookup, periodEndKey, periodStartKey, showPlan, todayKey, txs]
  );

  const toggleCashflowExpand = useCallback((direction: "income" | "expense") => {
    setExpandedCashflow((prev) => (prev === direction ? null : direction));
  }, []);

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
        periodStartKey,
        periodEndKey,
        categoryLookup,
        showPlan
      ),
    [categoryLookup, periodEndKey, periodStartKey, showPlan, txs]
  );

  const expenseTotalsCurrent = useMemo(
    () =>
      buildCategoryTotalsByLabel(
        txs,
        "EXPENSE",
        periodStartKey,
        periodEndKey,
        categoryLookup,
        showPlan
      ),
    [categoryLookup, periodEndKey, periodStartKey, showPlan, txs]
  );

  const incomeTotalsPrevMonth = useMemo(
    () =>
      buildCategoryTotalsByLabel(
        txs,
        "INCOME",
        priorMonthStartKey,
        priorMonthEndKey,
        categoryLookup,
        showPlan
      ),
    [categoryLookup, priorMonthEndKey, priorMonthStartKey, showPlan, txs]
  );

  const expenseTotalsPrevMonth = useMemo(
    () =>
      buildCategoryTotalsByLabel(
        txs,
        "EXPENSE",
        priorMonthStartKey,
        priorMonthEndKey,
        categoryLookup,
        showPlan
      ),
    [categoryLookup, priorMonthEndKey, priorMonthStartKey, showPlan, txs]
  );

  const incomeMonthlyTotals = useMemo(
    () =>
      buildCategoryMonthlyTotals(
        txs,
        "INCOME",
        twelveMonthStartKey,
        twelveMonthEndKey,
        categoryLookup,
        showPlan
      ),
    [categoryLookup, showPlan, twelveMonthEndKey, twelveMonthStartKey, txs]
  );

  const expenseMonthlyTotals = useMemo(
    () =>
      buildCategoryMonthlyTotals(
        txs,
        "EXPENSE",
        twelveMonthStartKey,
        twelveMonthEndKey,
        categoryLookup,
        showPlan
      ),
    [categoryLookup, showPlan, twelveMonthEndKey, twelveMonthStartKey, txs]
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

  const { overduePlannedCount, overduePlannedSum, todayPlannedCount, todayPlannedSum } =
    useMemo(() => {
      let overdueCount = 0;
      let overdueSum = 0;
      let todayCount = 0;
      let todaySum = 0;
      txs.forEach((tx) => {
        if (tx.is_split_parent) return;
        if (tx.transaction_type !== "PLANNED") return;
        if (tx.status === "REALIZED") return;
        const dateKey = toTxDateKey(tx.transaction_date);
        if (!dateKey) return;
        if (dateKey < todayKey) {
          overdueCount += 1;
          overdueSum += tx.amount;
        } else if (dateKey === todayKey) {
          todayCount += 1;
          todaySum += tx.amount;
        }
      });
      return {
        overduePlannedCount: overdueCount,
        overduePlannedSum: overdueSum,
        todayPlannedCount: todayCount,
        todayPlannedSum: todaySum,
      };
    }, [todayKey, txs]);
  const hasOverduePlanned = showPlan && overduePlannedCount > 0;

  const resolveCategoryIcon = useCallback(
    (categoryId: number | null): CategoryIcon => {
      if (!categoryId) return CATEGORY_ICON_FALLBACK;
      const path = categoryLookup.idToPath.get(categoryId);
      if (!path || path.length === 0) return CATEGORY_ICON_FALLBACK;

      for (let depth = path.length; depth >= 1; depth -= 1) {
        const key = makeCategoryPathKey(...path.slice(0, depth));
        const targetId = categoryLookup.pathToId.get(key);
        if (!targetId) continue;
        const iconName = categoryLookup.idToIcon.get(targetId);
        if (!iconName) continue;
        const normalized = iconName.trim();
        if (!normalized) continue;
        const Icon = CATEGORY_ICON_BY_NAME[normalized];
        if (Icon) return Icon;
      }

      return CATEGORY_ICON_FALLBACK;
    },
    [categoryLookup.idToIcon, categoryLookup.idToPath, categoryLookup.pathToId]
  );


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

  const { dailyRows, endBalancesByItemId } = useMemo(() => {
    const emptyBalances = new Map<number, number>();
    if (!chartItems.length || !rangeStartKey || !rangeEndKey) {
      return { dailyRows: [] as DailyRow[], endBalancesByItemId: emptyBalances };
    }

    const selectedIds = new Set(chartItems.map((item) => item.id));
    const itemKindById = new Map(chartItems.map((item) => [item.id, item.kind]));
    const itemStartKeyById = new Map(
      chartItems.map((item) => [item.id, getItemStartKey(item, accountingStartDate)])
    );
    const itemsByStartDate = new Map<string, ItemOut[]>();
    chartItems.forEach((item) => {
      const startKey = itemStartKeyById.get(item.id);
      if (!startKey) return;
      if (!itemsByStartDate.has(startKey)) itemsByStartDate.set(startKey, []);
      itemsByStartDate.get(startKey)?.push(item);
    });

    const deltasByDate = buildDeltasByDate(
      txs,
      selectedIds,
      itemKindById,
      showPlan
    );
    const startKeys = chartItems.map((item) => getItemStartKey(item, accountingStartDate)).sort();
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
        balances.set(item.id, item.initial_balance_minor);
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
        const valueCents = balances.get(item.id) ?? item.initial_balance_minor;
        const currency = (item.currency_code ?? "RUB").toUpperCase();
        // Для валютных элементов баланс в API в рублях (current_value_rub), в рублёвый итог не умножаем на курс
        const rate = getRate(item.currency_code);
        if (rate === null) {
          if (currency !== "RUB") missingRate = true;
        } else {
          const rubValueCents = currency !== "RUB" ? valueCents : Math.round((valueCents / 100) * rate * 100);
          const effectiveKind = resolveItemEffectiveKind(item, valueCents);
          const signedRub = effectiveKind === "LIABILITY" ? -rubValueCents : rubValueCents;
          if (totalRubCents !== null) totalRubCents += signedRub;
        }
      });

      if (missingRate) totalRubCents = null;

      rows.push({
        date: dateKey,
        totalRubCents,
      });
    }

    return {
      dailyRows: rows,
      endBalancesByItemId: new Map(balances),
    };
  }, [
    accountingStartDate,
    chartItems,
    fxRatesByDate,
    latestRatesByCurrency,
    rangeEndKey,
    rangeStartKey,
    resolveItemEffectiveKind,
    showPlan,
    todayKey,
    txs,
  ]);

  const itemRubCentsById = useMemo(() => {
    const map = new Map<number, number>();
    if (!showPlan) {
      activeItems.forEach((item) => {
        const value = getPrimaryValueRubCents(item);
        if (value != null) map.set(item.id, value);
      });
      return map;
    }

    const asOfKey = rangeEndKey;
    const rateDateKey = asOfKey > todayKey ? todayKey : asOfKey;
    activeItems.forEach((item) => {
      const startKeyForItem = getItemStartKey(item, accountingStartDate);
      if (startKeyForItem && asOfKey < startKeyForItem) return;
      const valueCents =
        endBalancesByItemId.get(item.id) ?? item.initial_balance_minor;
      const currency = (item.currency_code ?? "RUB").toUpperCase();
      const rate = getRateForDate(
        fxRatesByDate,
        rateDateKey,
        item.currency_code,
        latestRatesByCurrency,
        todayKey
      );
      if (rate === null && currency !== "RUB") return;
      const rubValueCents =
        currency !== "RUB"
          ? valueCents
          : Math.round((valueCents / 100) * (rate ?? 1) * 100);
      map.set(item.id, Math.abs(rubValueCents));
    });
    return map;
  }, [
    accountingStartDate,
    activeItems,
    endBalancesByItemId,
    fxRatesByDate,
    latestRatesByCurrency,
    rangeEndKey,
    rateByCode,
    showPlan,
    todayKey,
  ]);

  const { totalAssets, totalLiabilities, netTotal } = useMemo(() => {
    let assets = 0;
    let liabilities = 0;
    activeItems.forEach((item) => {
      const value = itemRubCentsById.get(item.id) ?? 0;
      const balanceHint = showPlan
        ? (endBalancesByItemId.get(item.id) ?? item.initial_balance_minor)
        : undefined;
      const kind = resolveItemEffectiveKind(item, balanceHint);
      if (kind === "ASSET") assets += value;
      else liabilities += value;
    });
    return {
      totalAssets: assets,
      totalLiabilities: liabilities,
      netTotal: assets - liabilities,
    };
  }, [
    activeItems,
    endBalancesByItemId,
    itemRubCentsById,
    resolveItemEffectiveKind,
    showPlan,
  ]);

  const assetSegments = useMemo((): AssetStructureSegment[] => {
    const byType = new Map<string, number>();
    activeItems.forEach((item) => {
      const balanceHint = showPlan
        ? (endBalancesByItemId.get(item.id) ?? item.initial_balance_minor)
        : undefined;
      if (resolveItemEffectiveKind(item, balanceHint) !== "ASSET") return;
      const value = itemRubCentsById.get(item.id) ?? 0;
      if (value <= 0) return;
      byType.set(item.type_code, (byType.get(item.type_code) ?? 0) + value);
    });
    const rows = Array.from(byType.entries())
      .map(([typeCode, value]) => ({
        label: ITEM_TYPE_LABELS[typeCode] ?? typeCode,
        value,
      }))
      .sort((a, b) => b.value - a.value);
    const total = rows.reduce((s, x) => s + x.value, 0);
    if (total <= 0) return [];
    return rows.map((row, index) => ({
      label: row.label,
      value: row.value,
      percent: row.value / total,
      color: DONUT_COLORS[index % DONUT_COLORS.length],
    }));
  }, [
    activeItems,
    endBalancesByItemId,
    itemRubCentsById,
    resolveItemEffectiveKind,
    showPlan,
  ]);

  const liabilitySegments = useMemo((): AssetStructureSegment[] => {
    const byType = new Map<string, number>();
    activeItems.forEach((item) => {
      const balanceHint = showPlan
        ? (endBalancesByItemId.get(item.id) ?? item.initial_balance_minor)
        : undefined;
      if (resolveItemEffectiveKind(item, balanceHint) !== "LIABILITY") return;
      const value = itemRubCentsById.get(item.id) ?? 0;
      if (value <= 0) return;
      byType.set(item.type_code, (byType.get(item.type_code) ?? 0) + value);
    });
    const rows = Array.from(byType.entries())
      .map(([typeCode, value]) => ({
        label: LIABILITY_TYPES.find((t) => t.code === typeCode)?.label
          ?? ITEM_TYPE_LABELS[typeCode]
          ?? typeCode,
        value,
      }))
      .sort((a, b) => b.value - a.value);
    const total = rows.reduce((s, x) => s + x.value, 0);
    if (total <= 0) return [];
    return rows.map((row, index) => ({
      label: row.label,
      value: row.value,
      percent: row.value / total,
      color: DONUT_COLORS[index % DONUT_COLORS.length],
    }));
  }, [
    activeItems,
    endBalancesByItemId,
    itemRubCentsById,
    resolveItemEffectiveKind,
    showPlan,
  ]);

  const periodStartNetTotal = useMemo(() => {
    const row = dailyRows.find((daily) => daily.date === periodStartKey);
    return row?.totalRubCents ?? null;
  }, [dailyRows, periodStartKey]);

  const periodEndNetTotal = useMemo(() => {
    const row = dailyRows.find((daily) => daily.date === periodEndKey);
    if (row?.totalRubCents != null) return row.totalRubCents;
    // Если конец периода = сегодня и план выключен — фактический net из API-проекции.
    if (!showPlan && periodEndKey >= todayKey) return netTotal;
    return row?.totalRubCents ?? null;
  }, [dailyRows, netTotal, periodEndKey, showPlan, todayKey]);

  const netTotalChangePercent = useMemo(() => {
    if (loading) return null;
    if (periodStartNetTotal === null || periodStartNetTotal === 0) return null;
    if (periodEndNetTotal === null) return null;
    const delta = periodEndNetTotal - periodStartNetTotal;
    const percent = (delta / Math.abs(periodStartNetTotal)) * 100;
    if (!Number.isFinite(percent)) return null;
    return percent;
  }, [loading, periodEndNetTotal, periodStartNetTotal]);

  const netTotalChangeLabel = isCurrentMonthPeriod
    ? "С 1 числа месяца"
    : "За период";

  const openPeriodDialog = useCallback(() => {
    setDraftPeriodStartKey(periodStartKey);
    setDraftPeriodEndKey(periodEndKey);
    setPeriodCalendarKey((key) => key + 1);
    setPeriodDialogOpen(true);
  }, [periodEndKey, periodStartKey]);

  const applyPeriodRange = useCallback(
    (range: { startKey: string; endKey: string }) => {
      if (!range.startKey || !range.endKey) return;
      setPeriodStartKey(range.startKey);
      setPeriodEndKey(range.endKey);
      setDraftPeriodStartKey(range.startKey);
      setDraftPeriodEndKey(range.endKey);
      setPeriodDialogOpen(false);
    },
    []
  );

  const resetPeriodToCurrentMonth = useCallback(() => {
    applyPeriodRange(getCurrentMonthRangeKeys(new Date()));
  }, [applyPeriodRange]);

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

  // Герой: при скролле уменьшается и растворяется; затем появляется компактная шапка с чипами.
  useLayoutEffect(() => {
    if (isDesktop) {
      mobileStickyHeaderVisibleRef.current = false;
      setMobileStickyHeaderVisible(false);
      return;
    }
    const root = document.querySelector("[data-app-scroll-container]");
    if (!(root instanceof HTMLElement)) return;

    const COLLAPSE_RANGE_PX = 160;
    let raf = 0;
    const update = () => {
      raf = 0;
      const y = root.scrollTop;
      const p = Math.min(1, Math.max(0, y / COLLAPSE_RANGE_PX));
      const dissolveEl = mobileHeroDissolveRef.current;
      if (dissolveEl) {
        dissolveEl.style.opacity = String(Math.max(0, 1 - p));
        dissolveEl.style.transform = `translate3d(0, ${y}px, 0) scale(${1 - p * 0.42})`;
        dissolveEl.style.pointerEvents = p > 0.85 ? "none" : "auto";
      }
      const gradientEl = mobileHeroGradientRef.current;
      if (gradientEl) {
        gradientEl.style.opacity = String(Math.max(0, 1 - p * 1.15));
        gradientEl.style.transform = `translate3d(0, ${y}px, 0)`;
      }
      const showSticky = p >= 0.55;
      if (showSticky !== mobileStickyHeaderVisibleRef.current) {
        mobileStickyHeaderVisibleRef.current = showSticky;
        setMobileStickyHeaderVisible(showSticky);
      }
    };
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(update);
    };
    update();
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      root.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [isDesktop, loading]);

  const renderSettingsChips = (opts?: { compact?: boolean }) => (
    <div className={cn("flex flex-wrap items-center gap-2", opts?.compact && "min-w-0 flex-1")}>
      <button
        type="button"
        onClick={openPeriodDialog}
        className="inline-flex max-w-full items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-sm text-white/90 transition-opacity active:opacity-80"
        aria-label="Выбрать отчётный период"
      >
        <Calendar className="h-4 w-4 shrink-0 text-white/70" strokeWidth={1.5} />
        <span className="truncate font-medium">{periodLabel}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-white/60" strokeWidth={1.5} />
      </button>
      <button
        type="button"
        onClick={() => setShowPlan((value) => !value)}
        aria-pressed={showPlan}
        aria-label={showPlan ? "План включён" : "План выключен"}
        className={cn(
          "inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-medium transition-all active:scale-[0.98]",
          showPlan
            ? "border-transparent text-white shadow-[0_0_18px_-4px_rgba(127,92,255,0.85)]"
            : "border-white/15 bg-white/10 text-white/45"
        )}
        style={showPlan ? { backgroundColor: ACCENT } : undefined}
      >
        План
      </button>
    </div>
  );

  return (
    <>
      <main className="min-h-0 pb-2 text-slate-50 md:hidden">
        <style
          dangerouslySetInnerHTML={{
            __html: `
              @keyframes dashboard-header-gradient-shift {
                0%, 100% { background-position: 0% 0%; }
                50% { background-position: 25% 15%; }
              }
            `,
          }}
        />
        {/* Шапка с анимированным градиентом от верха экрана (включая safe-area), как на странице актива */}
        <div
          className="relative mb-5 flex w-screen max-w-none flex-col gap-3 ml-[calc(-50vw+50%)] px-4 pb-4"
          style={{
            paddingTop: "calc(env(safe-area-inset-top, 0px) + 16px)",
            opacity: loading ? 0 : 1,
            transition: "opacity 0.3s ease-in-out",
          }}
        >
          <div
            ref={mobileHeroGradientRef}
            className="pointer-events-none absolute inset-0 z-0 overflow-hidden will-change-transform"
            style={{
              background: ASSET_DETAIL_HEADER_GRADIENT_MOBILE,
              backgroundSize: "200% 200%",
              backgroundPosition: "0% 0%",
              animation: "dashboard-header-gradient-shift 18s ease-in-out infinite",
              WebkitMaskImage: "linear-gradient(to bottom, black 0%, black 45%, transparent 100%)",
              maskImage: "linear-gradient(to bottom, black 0%, black 45%, transparent 100%)",
            }}
          />
          <div
            ref={mobileHeroDissolveRef}
            className="relative z-0 flex flex-col will-change-transform"
            style={{ transformOrigin: "center top" }}
          >
            <header className="relative z-10 flex items-center justify-between px-1">
              <div>
                <p className="text-xs text-white/65">{new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long" }).format(now)}</p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white">{greetingName ? `Привет, ${greetingName}` : "Добрый день"}</h1>
              </div>
              <Link href="/cabinet" aria-label="Открыть личный кабинет" className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full border border-white/10 bg-[rgba(93,95,215,0.22)] text-sm font-semibold text-violet-200 shadow-[0_10px_22px_-16px_rgba(127,92,255,0.6)] transition-transform active:scale-90">
                {userPhotoUrl ? <img src={userPhotoUrl} alt="Фото профиля" className="h-full w-full object-cover" /> : avatarLetter ? avatarLetter : <User className="h-5 w-5" />}
              </Link>
            </header>
          </div>
          <div
            className={cn(
              "relative z-10 transition-opacity duration-200",
              mobileStickyHeaderVisible && "opacity-0 pointer-events-none"
            )}
          >
            {renderSettingsChips()}
          </div>
        </div>

        <div
          className="relative z-10 flex w-full flex-col gap-5"
          style={{ opacity: loading ? 0 : 1, transition: "opacity 0.3s ease-in-out" }}
        >
          {showPlan && (todayPlannedCount > 0 || overduePlannedCount > 0) && (
            <div
              className={cn(
                "grid gap-2",
                todayPlannedCount > 0 && overduePlannedCount > 0
                  ? "grid-cols-2"
                  : "grid-cols-1"
              )}
            >
              {todayPlannedCount > 0 && (
                <Link
                  href="/transactions?preset=today-planned"
                  className={`${assetCardSurfaceClass} flex flex-col gap-2 p-3 transition-transform active:scale-[0.98]`}
                  style={{ backgroundColor: MODAL_BG }}
                >
                  <span className="flex items-center gap-2">
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-[rgba(93,95,215,0.22)] text-violet-300">
                      <Calendar className="h-4 w-4" strokeWidth={1.5} />
                    </span>
                    <span className="text-sm font-semibold tabular-nums text-white">
                      {loading ? "..." : todayPlannedCount}
                    </span>
                  </span>
                  <span className="text-xs leading-snug text-slate-400">
                    На сегодня запланировано
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-white">
                    <CurrencyChip code="RUB" />
                    <span className="tabular-nums">
                      {loading ? "..." : formatRub(todayPlannedSum)}
                    </span>
                  </span>
                </Link>
              )}
              {overduePlannedCount > 0 && (
                <Link
                  href="/transactions?preset=overdue-planned"
                  className={`${assetCardSurfaceClass} flex flex-col gap-2 p-3 transition-transform active:scale-[0.98]`}
                  style={{ backgroundColor: "rgba(255, 141, 40, 0.22)" }}
                >
                  <span className="flex items-center gap-2">
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-amber-400/20 text-amber-300">
                      <AlertTriangle className="h-4 w-4" strokeWidth={1.5} />
                    </span>
                    <span className="text-sm font-semibold tabular-nums text-amber-100">
                      {loading ? "..." : overduePlannedCount}
                    </span>
                  </span>
                  <span className="text-xs leading-snug text-amber-200/70">
                    Просроченные транзакции
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-100">
                    <CurrencyChip code="RUB" />
                    <span className="tabular-nums">
                      {loading ? "..." : formatRub(overduePlannedSum)}
                    </span>
                  </span>
                </Link>
              )}
            </div>
          )}

          <section>
            <div className="mb-3 flex items-baseline justify-between px-1">
              <h2 className="text-lg font-semibold">Чистые активы</h2>
            </div>
            <button
              type="button"
              onClick={() => { setMobileDetailExpanded(false); setMobileDetail("structure"); }}
              className={`${assetCardSurfaceClass} w-full p-5 text-left text-white transition-transform active:scale-[0.98]`}
              style={{ backgroundColor: MODAL_BG }}
              aria-label="Открыть структуру активов и обязательств"
            >
              <div className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full border-[20px] border-[rgba(93,95,215,0.22)]" />
              <div className="relative text-3xl font-semibold tracking-tight">
                {loading ? "..." : netTotal < 0 ? `-${formatRub(Math.abs(netTotal))}` : formatRub(netTotal)}
              </div>
              <div className="relative mt-3 inline-flex items-center gap-1 rounded-full bg-[rgba(93,95,215,0.22)] px-2.5 py-1 text-xs text-white/90">
                <ArrowUpRight className="h-3.5 w-3.5" /> {netTotalChangeLabel}{" "}
                {loading ? "..." : formatChangePercent(netTotalChangePercent)}
              </div>
              <div className="relative mt-5 grid grid-cols-2 border-t border-white/20 pt-3 text-sm">
                <div><span className="block text-xs text-white/65">Активы</span><span className="font-medium">{loading ? "..." : formatRub(totalAssets)}</span></div>
                <div><span className="block text-xs text-white/65">Обязательства</span><span className="font-medium">{loading ? "..." : `-${formatRub(totalLiabilities)}`}</span></div>
              </div>
            </button>
          </section>

          <section>
            <div className="mb-3 flex items-baseline justify-between px-1">
              <h2 className="text-lg font-semibold">Доходы и расходы</h2>
            </div>
            <div
              className={`${assetCardSurfaceClass} p-4`}
              style={{ backgroundColor: MODAL_BG }}
            >
              <div className="space-y-6">
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => toggleCashflowExpand("income")}
                    className="flex w-full items-center justify-between gap-3 text-left transition-opacity active:opacity-80"
                  >
                    <span className="flex items-center gap-1.5 text-sm text-slate-400">
                      <ArrowUpRight className="h-4 w-4 text-emerald-400" />
                      Доходы
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <CurrencyChip code="RUB" />
                      <span
                        className="text-base font-semibold tabular-nums"
                        style={{ color: GREEN }}
                      >
                        {loading ? "..." : formatRub(displayIncomeCashflow.total)}
                      </span>
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleCashflowExpand("income")}
                    className="flex h-3 w-full justify-end"
                    aria-label="Прогресс доходов"
                  >
                    {!loading && displayIncomeCashflow.total > 0 && (
                      <div
                        className="flex h-full shrink-0 overflow-hidden rounded-full"
                        style={{ width: `${incomeBarPct}%` }}
                      >
                        {displayIncomeCashflow.segments.map((segment) => (
                          <div
                            key={`income-bar-${segment.key}`}
                            title={`${segment.label}: ${formatRub(segment.value)}`}
                            className="h-full min-w-[3px] shrink-0"
                            style={{
                              width: `${(segment.value / displayIncomeCashflow.total) * 100}%`,
                              backgroundColor: segment.color,
                            }}
                          />
                        ))}
                      </div>
                    )}
                  </button>

                  {expandedCashflow === "income" && (
                    <div className={cn("pt-1", showPlan ? "space-y-2" : "space-y-1")}>
                      {incomeBucketGroups.length === 0 ? (
                        <p className="text-xs text-slate-500">Нет операций</p>
                      ) : showPlan ? (
                        incomeBucketGroups.map((group) => (
                          <div key={group.key} className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span
                                className="h-2 w-2 shrink-0 rounded-full"
                                style={{ backgroundColor: group.color }}
                              />
                              <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-200">
                                {group.label}
                              </span>
                              <Link
                                href={buildCashflowTransactionsHref({
                                  direction: "INCOME",
                                  bucket: group.key,
      periodStartKey,
      periodEndKey,
                                })}
                                className="inline-flex items-center gap-1 transition-opacity active:opacity-70"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <CurrencyChip code="RUB" className="scale-90" />
                                <span
                                  className="text-sm font-semibold tabular-nums underline-offset-2 hover:underline"
                                  style={{ color: GREEN }}
                                >
                                  {formatRub(group.total)}
                                </span>
                              </Link>
                            </div>
                            {group.categories.map((row) => {
                              const CategoryIcon =
                                topLevelIconByLabel.get(row.label) ??
                                CATEGORY_ICON_FALLBACK;
                              const isUncategorized = row.label === UNCATEGORIZED_LABEL;
                              return (
                                <div
                                  key={`${group.key}-${row.label}`}
                                  className="flex items-center gap-2 pl-4 text-xs"
                                >
                                  <span style={{ color: ACCENT }}>
                                    <CategoryIcon className="h-3.5 w-3.5" />
                                  </span>
                                  <span className="min-w-0 flex-1 truncate text-slate-400">
                                    {row.label}
                                  </span>
                                  <Link
                                    href={buildCashflowTransactionsHref({
                                      direction: "INCOME",
                                      bucket: group.key,
          periodStartKey,
      periodEndKey,
                                      categoryL1: isUncategorized ? null : row.label,
                                      uncategorized: isUncategorized,
                                    })}
                                    className="tabular-nums text-slate-300 underline-offset-2 transition-opacity hover:underline active:opacity-70"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {formatRub(row.value)}
                                  </Link>
                                </div>
                              );
                            })}
                          </div>
                        ))
                      ) : (
                        (incomeBucketGroups[0]?.categories ?? []).map((row) => {
                          const CategoryIcon =
                            topLevelIconByLabel.get(row.label) ??
                            CATEGORY_ICON_FALLBACK;
                          const isUncategorized = row.label === UNCATEGORIZED_LABEL;
                          return (
                            <div
                              key={row.label}
                              className="flex items-center gap-2 text-xs"
                            >
                              <span style={{ color: ACCENT }}>
                                <CategoryIcon className="h-3.5 w-3.5" />
                              </span>
                              <span className="min-w-0 flex-1 truncate text-slate-400">
                                {row.label}
                              </span>
                              <Link
                                href={buildCashflowTransactionsHref({
                                  direction: "INCOME",
                                  bucket: "actual",
      periodStartKey,
      periodEndKey,
                                  categoryL1: isUncategorized ? null : row.label,
                                  uncategorized: isUncategorized,
                                })}
                                className="tabular-nums text-slate-300 underline-offset-2 transition-opacity hover:underline active:opacity-70"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {formatRub(row.value)}
                              </Link>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => toggleCashflowExpand("expense")}
                    className="flex w-full items-center justify-between gap-3 text-left transition-opacity active:opacity-80"
                  >
                    <span className="flex items-center gap-1.5 text-sm text-slate-400">
                      <ArrowDownRight className="h-4 w-4 text-rose-400" />
                      Расходы
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <CurrencyChip code="RUB" />
                      <span
                        className="text-base font-semibold tabular-nums"
                        style={{ color: RED }}
                      >
                        {loading ? "..." : formatRub(displayExpenseCashflow.total)}
                      </span>
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleCashflowExpand("expense")}
                    className={cn(
                      "flex h-3 w-full",
                      expensesExceedIncome ? "justify-start" : "justify-end"
                    )}
                    aria-label="Прогресс расходов"
                  >
                    {!loading && displayExpenseCashflow.total > 0 && (
                      <div
                        className="flex h-full shrink-0 flex-row-reverse overflow-hidden rounded-full"
                        style={{ width: `${expenseBarPct}%` }}
                      >
                        {displayExpenseCashflow.segments.map((segment) => (
                          <div
                            key={`expense-bar-${segment.key}`}
                            title={`${segment.label}: ${formatRub(segment.value)}`}
                            className="h-full min-w-[3px] shrink-0"
                            style={{
                              width: `${(segment.value / displayExpenseCashflow.total) * 100}%`,
                              backgroundColor: segment.color,
                            }}
                          />
                        ))}
                      </div>
                    )}
                  </button>

                  {expandedCashflow === "expense" && (
                    <div className={cn("pt-1", showPlan ? "space-y-2" : "space-y-1")}>
                      {expenseBucketGroups.length === 0 ? (
                        <p className="text-xs text-slate-500">Нет операций</p>
                      ) : showPlan ? (
                        expenseBucketGroups.map((group) => (
                          <div key={group.key} className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span
                                className="h-2 w-2 shrink-0 rounded-full"
                                style={{ backgroundColor: group.color }}
                              />
                              <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-200">
                                {group.label}
                              </span>
                              <Link
                                href={buildCashflowTransactionsHref({
                                  direction: "EXPENSE",
                                  bucket: group.key,
      periodStartKey,
      periodEndKey,
                                })}
                                className="inline-flex items-center gap-1 transition-opacity active:opacity-70"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <CurrencyChip code="RUB" className="scale-90" />
                                <span
                                  className="text-sm font-semibold tabular-nums underline-offset-2 hover:underline"
                                  style={{ color: RED }}
                                >
                                  {formatRub(group.total)}
                                </span>
                              </Link>
                            </div>
                            {group.categories.map((row) => {
                              const CategoryIcon =
                                topLevelIconByLabel.get(row.label) ??
                                CATEGORY_ICON_FALLBACK;
                              const isUncategorized = row.label === UNCATEGORIZED_LABEL;
                              return (
                                <div
                                  key={`${group.key}-${row.label}`}
                                  className="flex items-center gap-2 pl-4 text-xs"
                                >
                                  <span style={{ color: ACCENT }}>
                                    <CategoryIcon className="h-3.5 w-3.5" />
                                  </span>
                                  <span className="min-w-0 flex-1 truncate text-slate-400">
                                    {row.label}
                                  </span>
                                  <Link
                                    href={buildCashflowTransactionsHref({
                                      direction: "EXPENSE",
                                      bucket: group.key,
          periodStartKey,
      periodEndKey,
                                      categoryL1: isUncategorized ? null : row.label,
                                      uncategorized: isUncategorized,
                                    })}
                                    className="tabular-nums text-slate-300 underline-offset-2 transition-opacity hover:underline active:opacity-70"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {formatRub(row.value)}
                                  </Link>
                                </div>
                              );
                            })}
                          </div>
                        ))
                      ) : (
                        (expenseBucketGroups[0]?.categories ?? []).map((row) => {
                          const CategoryIcon =
                            topLevelIconByLabel.get(row.label) ??
                            CATEGORY_ICON_FALLBACK;
                          const isUncategorized = row.label === UNCATEGORIZED_LABEL;
                          return (
                            <div
                              key={row.label}
                              className="flex items-center gap-2 text-xs"
                            >
                              <span style={{ color: ACCENT }}>
                                <CategoryIcon className="h-3.5 w-3.5" />
                              </span>
                              <span className="min-w-0 flex-1 truncate text-slate-400">
                                {row.label}
                              </span>
                              <Link
                                href={buildCashflowTransactionsHref({
                                  direction: "EXPENSE",
                                  bucket: "actual",
      periodStartKey,
      periodEndKey,
                                  categoryL1: isUncategorized ? null : row.label,
                                  uncategorized: isUncategorized,
                                })}
                                className="tabular-nums text-slate-300 underline-offset-2 transition-opacity hover:underline active:opacity-70"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {formatRub(row.value)}
                              </Link>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex w-full items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5 text-sm text-slate-400">
                      {plannedFreeBalance >= 0 ? (
                        <Plus
                          className="h-3.5 w-3.5"
                          style={{ color: GREEN }}
                          strokeWidth={2.5}
                        />
                      ) : (
                        <Minus
                          className="h-3.5 w-3.5"
                          style={{ color: RED }}
                          strokeWidth={2.5}
                        />
                      )}
                      {showPlan ? "Плановый остаток" : "Фактический остаток"}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <CurrencyChip code="RUB" />
                      <span
                        className="text-base font-semibold tabular-nums"
                        style={{
                          color: plannedFreeBalance >= 0 ? GREEN : RED,
                        }}
                      >
                        {loading
                          ? "..."
                          : plannedFreeBalance < 0
                            ? `−${formatRub(remainderAbs)}`
                            : formatRub(remainderAbs)}
                      </span>
                    </span>
                  </div>

                  <div
                    className="flex h-3 w-full justify-start"
                    role="img"
                    aria-label="Прогресс остатка"
                  >
                    {!loading && remainderAbs > 0 && (
                      <div
                        className="h-full shrink-0 rounded-full"
                        style={{
                          width: `${remainderBarPct}%`,
                          backgroundColor:
                            plannedFreeBalance >= 0 ? GREEN : RED,
                        }}
                        title={`Остаток: ${formatRub(remainderAbs)}`}
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-baseline justify-between px-1"><h2 className="text-lg font-semibold">Цели</h2><Link href="/goals" className="text-sm font-medium text-violet-400">Все цели</Link></div>
            {loading ? <div className="text-sm text-slate-400">Загрузка целей...</div> : activeGoals.length === 0 ? <Link href="/goals" className="block rounded-lg overflow-hidden border border-dashed border-white/10 p-4 text-sm text-slate-400" style={{ backgroundColor: MODAL_BG }}>Добавить первую цель →</Link> : <div className="space-y-2">{activeGoals.slice(0, 2).map((goal) => {
              const summary = goalSummaryById.get(goal.id) ?? { amount: 0, progress: 0, rangeLabel: "" };
              const progressColor = getGoalProgressColor(summary.progress, categoryLookup.idToScope?.get(goal.category_id) === "INCOME");
              return <Link href="/goals" key={goal.id} className={`flex items-center gap-3 ${assetCardSurfaceClass} p-3`} style={{ backgroundColor: MODAL_BG }}><span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[rgba(93,95,215,0.22)] text-violet-300"><Target className="h-5 w-5" strokeWidth={1.5} /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{goal.name}</span><span className="block truncate text-xs text-slate-400">{formatRub(summary.amount)} из {formatRub(goal.amount)}</span><span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-slate-800"><span className="block h-full rounded-full" style={{ width: `${summary.progress * 100}%`, backgroundColor: progressColor }} /></span></span><ChevronRight className="h-4 w-4 shrink-0 text-slate-500" strokeWidth={1.5} /></Link>;
            })}</div>}
          </section>

        </div>
      </main>

      <main className="hidden min-h-screen px-8 py-8 md:block">
      <div
        className="flex w-full flex-col gap-6"
        style={{
          opacity: loading ? 0 : 1,
          transition: "opacity 0.3s ease-in-out",
        }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={openPeriodDialog}
            className="inline-flex max-w-full items-center gap-2 rounded-full border border-white/15 px-3 py-1.5 text-sm text-white/90 transition-opacity hover:opacity-90"
            style={{ backgroundColor: MODAL_BG }}
            aria-label="Выбрать отчётный период"
          >
            <Calendar className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={1.5} />
            <span className="truncate font-medium text-white">{periodLabel}</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" strokeWidth={1.5} />
          </button>
          <button
            type="button"
            onClick={() => setShowPlan((value) => !value)}
            aria-pressed={showPlan}
            aria-label={showPlan ? "План включён" : "План выключен"}
            className={cn(
              "inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-medium transition-all hover:opacity-90",
              showPlan
                ? "border-transparent text-white shadow-[0_0_18px_-4px_rgba(127,92,255,0.85)]"
                : "border-white/15 text-white/45"
            )}
            style={{
              backgroundColor: showPlan ? ACCENT : MODAL_BG,
            }}
          >
            План
          </button>
        </div>

        <div className="grid gap-4 items-stretch md:grid-cols-[minmax(0,1fr)_minmax(0,0.5fr)] xl:grid-cols-[minmax(0,1fr)_minmax(0,0.5fr)]">
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
              <CardTitle className="flex items-center gap-2 text-2xl font-normal text-white/90">
                <Wallet className="h-5 w-5 text-white/90" />
                Чистые активы
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="break-words text-[48px] font-semibold leading-tight text-white">
                {loading
                  ? "..."
                  : netTotal < 0
                  ? `-${formatRub(Math.abs(netTotal))}`
                  : formatRub(netTotal)}
              </div>
              <div className="flex items-center gap-2 text-xs text-white/80">
                <span>{netTotalChangeLabel}</span>
                <Tag variant={getChangeVariant(netTotalChangePercent, "income")}>
                  {loading ? "..." : formatChangePercent(netTotalChangePercent)}
                </Tag>
              </div>
              <div className="space-y-1 text-xs text-white/80">
                <div className="flex items-center justify-between">
                  <span>Активы</span>
                  <span className="whitespace-nowrap text-white/90">
                    {loading ? "..." : formatRub(totalAssets)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Обязательства</span>
                  <span className="whitespace-nowrap text-white/90">
                    {loading ? "..." : `-${formatRub(totalLiabilities)}`}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card
            className={`h-full ${
              hasOverduePlanned
                ? "relative overflow-hidden border-0 text-white shadow-[0_20px_50px_-28px_rgba(136,19,55,0.85)]"
                : "relative overflow-hidden border-0 text-white shadow-[0_20px_50px_-28px_rgba(16,121,74,0.75)]"
            }`}
            style={{
              background: hasOverduePlanned
                ? OVERDUE_TRANSACTIONS_GRADIENT
                : NO_OVERDUE_TRANSACTIONS_GRADIENT,
            }}
          >
            <div className="flex h-full flex-col">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-3">
                  <CardTitle className="flex items-center gap-2 text-2xl font-normal leading-tight text-white/85">
                    {hasOverduePlanned && (
                      <AlertTriangle className="h-5 w-5 shrink-0 text-white/85" />
                    )}
                    <span className="whitespace-normal break-words">
                      {hasOverduePlanned
                        ? "Просрочено"
                        : "Нет просроченных транзакций"}
                    </span>
                  </CardTitle>
                  {hasOverduePlanned && (
                    <IconButton
                      asChild
                      aria-label="Открыть просроченные транзакции"
                      className="self-start"
                    >
                      <Link href="/transactions?preset=overdue-planned">
                        <ArrowRight />
                      </Link>
                    </IconButton>
                  )}
                </div>
              </CardHeader>
              <div className="flex flex-1 items-end px-6 -mt-6 pb-0">
                <div
                  className="pointer-events-none select-none w-full text-right text-[180px] font-semibold leading-none"
                  style={{
                    color: hasOverduePlanned
                      ? "rgba(174, 43, 91, 0.75)"
                      : "rgba(255, 255, 255, 0.15)",
                  }}
                >
                  {loading ? "..." : overduePlannedCount}
                </div>
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium text-foreground">Доходы</div>
              <div
                className="text-lg font-semibold whitespace-nowrap"
                style={{ color: GREEN }}
              >
                {loading ? "..." : formatRub(incomeBreakdown.total)}
              </div>
            </div>
            {loading ? (
              <div className="text-sm text-muted-foreground">Загрузка...</div>
            ) : incomeSegments.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                Нет данных за период
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
                          <span style={{ color: ACCENT }}>
                            <CategoryIcon className="h-3.5 w-3.5" />
                          </span>
                          <span className="truncate font-medium text-foreground">
                            {row.label}
                          </span>
                        </div>
                        <span className="text-right text-foreground whitespace-nowrap">
                          {formatRub(row.value)}
                        </span>
                        <span className="text-right text-white/80 whitespace-nowrap">
                          {formatPercent(row.percent * 100)}%
                        </span>
                        <div className="flex justify-end">
                          <Tag variant={getChangeVariant(row.prevDelta, "income")}>
                            {formatChangePercent(row.prevDelta)}
                          </Tag>
                        </div>
                        <div className="flex justify-end">
                          <Tag variant={getChangeVariant(row.avgDelta, "income")}>
                            {formatChangePercent(row.avgDelta)}
                          </Tag>
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
              <div className="text-sm font-medium text-foreground">
                Расходы
              </div>
              <div
                className="text-lg font-semibold whitespace-nowrap"
                style={{ color: RED }}
              >
                {loading ? "..." : formatRub(expenseBreakdown.total)}
              </div>
            </div>
            {loading ? (
              <div className="text-sm text-muted-foreground">Загрузка...</div>
            ) : expenseSegments.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                Нет данных за период
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
                          <span style={{ color: ACCENT }}>
                            <CategoryIcon className="h-3.5 w-3.5" />
                          </span>
                          <span className="truncate font-medium text-foreground">
                            {row.label}
                          </span>
                        </div>
                        <span className="text-right text-foreground whitespace-nowrap">
                          {formatRub(row.value)}
                        </span>
                        <span className="text-right text-white/80 whitespace-nowrap">
                          {formatPercent(row.percent * 100)}%
                        </span>
                        <div className="flex justify-end">
                          <Tag variant={getChangeVariant(row.prevDelta, "expense")}>
                            {formatChangePercent(row.prevDelta)}
                          </Tag>
                        </div>
                        <div className="flex justify-end">
                          <Tag variant={getChangeVariant(row.avgDelta, "expense")}>
                            {formatChangePercent(row.avgDelta)}
                          </Tag>
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
            <CardTitle className="flex items-center gap-2 text-2xl font-normal text-white/90">
              <Target className="h-5 w-5 text-white/90" />
              Цели
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <div className="text-sm text-white/80">Загрузка целей...</div>
            ) : activeGoals.length === 0 ? (
              <div className="rounded-lg border border-dashed border-white/40 bg-white/10 p-4 text-center text-sm text-white/80">
                Активных целей пока нет.
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {activeGoals.map((goal) => {
                  const summary = goalSummaryById.get(goal.id) ?? {
                    amount: 0,
                    progress: 0,
                    rangeLabel: "",
                  };
                  const ratio =
                    goal.amount > 0 ? summary.amount / goal.amount : 0;
                  const isIncomeGoal =
                    categoryLookup.idToScope?.get(goal.category_id) === "INCOME";
                  const progressColor = getGoalProgressColor(ratio, isIncomeGoal);
                  const textColor = progressColor;
                  return (
                    <div
                      key={goal.id}
                      className="rounded-xl px-3 py-2"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-white/90">
                            {goal.name}
                          </div>
                          <div className="flex min-w-0 items-center gap-2 truncate text-xs text-white/70">
                            <CategoryIconImage
                              categoryId={goal.category_id}
                              categoryLookup={categoryLookup}
                              apiBase={API_BASE}
                              size={16}
                              className="h-4 w-4 shrink-0"
                              fallbackIconColor="rgba(255,255,255,0.7)"
                            />
                            <span className="truncate">
                              {formatGoalCategoryLabel(goal.category_id)}
                            </span>
                          </div>
                        </div>
                        <div
                          className="shrink-0 text-sm font-semibold whitespace-nowrap"
                        >
                          <span style={{ color: textColor }}>
                            {formatRub(summary.amount)}
                          </span>{" "}
                          <span className="text-white/90">/ {formatRub(goal.amount)}</span>
                        </div>
                      </div>
                      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/20">
                        <div
                          className="h-full"
                          style={{
                            width: `${summary.progress * 100}%`,
                            backgroundColor: progressColor,
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

        <Card className="overflow-hidden border-0 bg-gradient-to-br from-slate-700 via-slate-600 to-slate-800 text-white shadow-[0_20px_50px_-28px_rgba(15,23,42,0.5)]">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-2xl font-normal text-white/90">
              <PieChart className="h-5 w-5 text-white/90" />
              Структура активов и обязательств
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-6 xl:flex-row xl:gap-8">
            {loading ? (
              <div className="text-sm text-white/80">Загрузка...</div>
            ) : (
              <>
                <div className="flex min-w-0 flex-1 flex-col gap-3 xl:min-w-0">
                  <span className="text-sm font-medium text-white/90">Активы</span>
                  <div className="flex flex-row items-start gap-4">
                    <div className="flex shrink-0 justify-center">
                      {assetSegments.length === 0 ? (
                        <div className="flex h-40 w-40 items-center justify-center rounded-full border border-dashed border-white/40 bg-white/5 sm:h-44 sm:w-44">
                          <span className="text-center text-xs text-white/60">
                            Нет активов
                          </span>
                        </div>
                      ) : (
                        <svg
                          viewBox="0 0 200 200"
                          className="h-40 w-40 sm:h-44 sm:w-44"
                          aria-hidden="true"
                        >
                          {assetSegments.map((segment, index) => {
                            const startAngle =
                              Math.PI / 2 -
                              2 * Math.PI * assetSegments
                                .slice(0, index)
                                .reduce((s, x) => s + x.percent, 0);
                            const endAngle =
                              startAngle - 2 * Math.PI * segment.percent;
                            const d = describeDonutArc(
                              100,
                              100,
                              80,
                              48,
                              startAngle,
                              endAngle
                            );
                            return (
                              <path
                                key={segment.label}
                                d={d}
                                fill={segment.color}
                                className="transition-opacity hover:opacity-90"
                              />
                            );
                          })}
                        </svg>
                      )}
                    </div>
                    <div className="min-w-0 flex-1 space-y-2">
                      {assetSegments.map((segment) => (
                        <div
                          key={segment.label}
                          className="flex items-center justify-between gap-3 text-sm"
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <span
                              className="h-3 w-3 shrink-0 rounded-full"
                              style={{ backgroundColor: segment.color }}
                            />
                            <span className="min-w-0 truncate text-white/90">
                              {segment.label}
                            </span>
                          </div>
                          <div className="flex shrink-0 items-center gap-2 text-right text-white/90">
                            <span className="whitespace-nowrap font-medium">
                              {formatRub(segment.value)}
                            </span>
                            <span className="whitespace-nowrap text-white/70">
                              {formatPercent(segment.percent * 100)}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="pt-6 xl:pt-0 xl:pl-8">
                  <div className="flex min-w-0 flex-1 flex-col gap-3 xl:min-w-0">
                    <span className="text-sm font-medium text-white/90">
                      Обязательства
                    </span>
                    <div className="flex flex-row items-start gap-4">
                      <div className="flex shrink-0 justify-center">
                        {liabilitySegments.length === 0 ? (
                          <div className="flex h-40 w-40 items-center justify-center rounded-full border border-dashed border-white/40 bg-white/5 sm:h-44 sm:w-44">
                            <span className="text-center text-xs text-white/60">
                              Нет обязательств
                            </span>
                          </div>
                        ) : (
                          <svg
                            viewBox="0 0 200 200"
                            className="h-40 w-40 sm:h-44 sm:w-44"
                            aria-hidden="true"
                          >
                            {liabilitySegments.map((segment, index) => {
                              const startAngle =
                                Math.PI / 2 -
                                2 * Math.PI * liabilitySegments
                                  .slice(0, index)
                                  .reduce((s, x) => s + x.percent, 0);
                              const endAngle =
                                startAngle - 2 * Math.PI * segment.percent;
                              const d = describeDonutArc(
                                100,
                                100,
                                80,
                                48,
                                startAngle,
                                endAngle
                              );
                              return (
                                <path
                                  key={segment.label}
                                  d={d}
                                  fill={segment.color}
                                  className="transition-opacity hover:opacity-90"
                                />
                              );
                            })}
                          </svg>
                        )}
                      </div>
                      <div className="min-w-0 flex-1 space-y-2">
                        {liabilitySegments.map((segment) => (
                          <div
                            key={segment.label}
                            className="flex items-center justify-between gap-3 text-sm"
                          >
                            <div className="flex min-w-0 flex-1 items-center gap-2">
                              <span
                                className="h-3 w-3 shrink-0 rounded-full"
                                style={{ backgroundColor: segment.color }}
                              />
                              <span className="min-w-0 truncate text-white/90">
                                {segment.label}
                              </span>
                            </div>
                            <div className="flex shrink-0 items-center gap-2 text-right text-white/90">
                              <span className="whitespace-nowrap font-medium">
                                {formatRub(segment.value)}
                              </span>
                              <span className="whitespace-nowrap text-white/70">
                                {formatPercent(segment.percent * 100)}%
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

      </div>
    </main>

    {typeof document !== "undefined" &&
      !isDesktop &&
      createPortal(
        <>
          <div
            className={cn(
              "pointer-events-none fixed inset-x-0 top-0 z-40 transition-opacity duration-200 ease-out",
              mobileStickyHeaderVisible ? "opacity-100" : "opacity-0"
            )}
            style={{
              height: "calc(5.75rem + env(safe-area-inset-top, 0px))",
              background:
                "linear-gradient(to bottom, rgba(25, 23, 50, 0.45) 0%, rgba(25, 23, 50, 0.18) 40%, transparent 100%)",
            }}
            aria-hidden
          />
          <div
            className={cn(
              "fixed z-40 flex min-h-12 items-center gap-2 px-3 py-2 transition-all duration-200 ease-out",
              "left-[calc(0.75rem+env(safe-area-inset-left))] right-[calc(0.75rem+env(safe-area-inset-right))]",
              "top-[calc(0.75rem+env(safe-area-inset-top))]",
              "rounded-2xl border border-sidebar-border/70 bg-sidebar/70 shadow-[0_10px_30px_rgba(0,0,0,0.28)] backdrop-blur-xl supports-[backdrop-filter]:bg-sidebar/55",
              mobileStickyHeaderVisible
                ? "opacity-100 translate-y-0 pointer-events-auto"
                : "opacity-0 -translate-y-2 pointer-events-none"
            )}
            aria-hidden={!mobileStickyHeaderVisible}
          >
            {renderSettingsChips({ compact: true })}
          </div>
        </>,
        document.body
      )}

    <Dialog open={mobileDetail !== null} onOpenChange={(open) => !open && setMobileDetail(null)}>
      <DialogContent
        title="Детализация"
        containerClassName="p-0"
        contentWrapperClassName="justify-end py-0"
        className="mt-auto mb-0 h-[82dvh] max-h-[82dvh] w-full max-w-none gap-4 overflow-y-auto rounded-b-none rounded-t-3xl border-x-0 border-b-0 border-t border-white/10 bg-[#1C1B2E] p-5 pb-7 text-slate-50 sm:my-auto sm:h-auto sm:max-h-[85vh] sm:max-w-md sm:rounded-xl"
        overlayClassName="bg-black/55"
      >
        <div className="mx-auto -mt-2 h-1.5 w-10 rounded-full bg-slate-600" />
        <DialogTitle className="pr-10 text-xl">Активы и обязательства</DialogTitle>

        <div className="space-y-5">
          <div className={`${assetCardSurfaceClass} p-3`} style={{ backgroundColor: MODAL_BG }}>
            <div className="mb-3 flex items-center justify-between"><span className="font-medium">Активы</span><span className="font-semibold text-emerald-400">{formatRub(totalAssets)}</span></div>
            <div className="space-y-3">{assetSegments.length === 0 ? <p className="text-sm text-slate-400">Активов пока нет</p> : assetSegments.slice(0, mobileDetailExpanded ? assetSegments.length : 4).map((segment) => <div key={segment.label} className="flex items-center gap-2 text-sm"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: segment.color }} /><span className="flex-1 truncate">{segment.label}</span><span className="font-medium">{formatRub(segment.value)}</span><span className="w-10 text-right text-xs text-slate-400">{formatPercent(segment.percent * 100)}%</span></div>)}</div>
          </div>
          <div className={`${assetCardSurfaceClass} p-3`} style={{ backgroundColor: MODAL_BG }}>
            <div className="mb-3 flex items-center justify-between"><span className="font-medium">Обязательства</span><span className="font-semibold text-rose-400">−{formatRub(totalLiabilities)}</span></div>
            <div className="space-y-3">{liabilitySegments.length === 0 ? <p className="text-sm text-slate-400">Обязательств нет</p> : liabilitySegments.slice(0, mobileDetailExpanded ? liabilitySegments.length : 4).map((segment) => <div key={segment.label} className="flex items-center gap-2 text-sm"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: segment.color }} /><span className="flex-1 truncate">{segment.label}</span><span className="font-medium">{formatRub(segment.value)}</span><span className="w-10 text-right text-xs text-slate-400">{formatPercent(segment.percent * 100)}%</span></div>)}</div>
          </div>
          {(assetSegments.length > 4 || liabilitySegments.length > 4) && <button type="button" onClick={() => setMobileDetailExpanded((value) => !value)} className="w-full rounded-xl bg-[rgba(93,95,215,0.22)] py-3 text-sm font-medium text-violet-200">{mobileDetailExpanded ? "Свернуть список" : "Показать все категории"}</button>}
          <Link href="/assets" className="flex items-center justify-center gap-2 rounded-xl bg-[#7F5CFF] py-3.5 text-sm font-semibold text-white">Открыть активы <ArrowRight className="h-4 w-4" strokeWidth={1.5} /></Link>
        </div>
      </DialogContent>
    </Dialog>

    <Dialog open={periodDialogOpen} onOpenChange={setPeriodDialogOpen}>
      <DialogContent
        title="Отчётный период"
        className="max-w-sm gap-4 border-white/10 bg-[#1C1B2E] text-slate-50"
        overlayClassName="bg-black/55"
      >
        <DialogTitle className="pr-10 text-xl">Отчётный период</DialogTitle>
        {periodDialogOpen && (
          <PeriodRangeCalendar
            key={periodCalendarKey}
            startKey={draftPeriodStartKey}
            endKey={draftPeriodEndKey}
            onChange={(range) => {
              setDraftPeriodStartKey(range.startKey);
              setDraftPeriodEndKey(range.endKey);
            }}
            onComplete={applyPeriodRange}
          />
        )}
        <button
          type="button"
          onClick={resetPeriodToCurrentMonth}
          className="text-sm font-medium text-violet-400 transition-opacity active:opacity-80"
        >
          Текущий месяц
        </button>
      </DialogContent>
    </Dialog>

    </>
  );
}
