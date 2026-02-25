"use client";

import React, {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSession } from "next-auth/react";

import {
  API_BASE,
  fetchCategories,
  fetchCounterparties,
  fetchFxRates,
  fetchItems,
  fetchTransactionChains,
  fetchTransactionsPage,
  FxRateOut,
  ItemOut,
  TransactionOut,
  TransactionChainOut,
} from "@/lib/api";
import { Label } from "@/components/ui/label";
import { Tooltip } from "@/components/ui/tooltip";
import { FilterSection } from "@/components/filter-panel";
import { DateField } from "@/components/ui/form-field";
import { useAccountingStart } from "@/components/accounting-start-context";
import { ItemSelector } from "@/components/item-selector";
import { CategorySelector } from "@/components/category-selector";
import { CounterpartySelector } from "@/components/counterparty-selector";
import { SegmentedSelector } from "@/components/ui/segmented-selector";
import {
  buildCategoryDescendants,
  buildCategoryLookup,
  CategoryNode,
  makeCategoryPathKey,
} from "@/lib/categories";
import { ACCENT, ACCENT2, ACTIVE_TEXT_DARK, BACKGROUND_DT, GREEN, MODAL_BG, PLACEHOLDER_COLOR_DARK, RED } from "@/lib/colors";
import { PINK_GRADIENT } from "@/lib/gradients";
import {
  formatWeekPeriodAsDateRange,
  getForecastPresetEnd,
  getHistoryPresetStart,
  getPeriodKey,
  getPeriodMonthYear,
  listPeriodsInRange,
  type ForecastPresetKey,
  type HistoryPresetKey,
  ReportPeriodGranularity,
  toDateKey,
} from "@/lib/report-period-utils";
import { ChevronDown, ChevronRight, Info, MessageSquare } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CategoryIconImage } from "@/components/category-icon-image";
import { IconButton } from "@/components/ui/icon-button";
import { cn } from "@/lib/utils";
import { formatAmount, getEffectiveItemKind, getItemPrimaryValueCents } from "@/lib/item-utils";
import { getItemTypeLabel } from "@/lib/item-types";
import { buildItemTransactionCounts } from "@/lib/item-utils";
import { buildCounterpartyTransactionCounts, getCounterpartyImageUrlCandidates } from "@/lib/counterparty-utils";
import { AssetItemIcon } from "@/components/asset-item-icon";
import { CounterpartyIconImage } from "@/components/counterparty-icon-image";

function formatDateLabel(dateKey: string) {
  const [y, m, d] = dateKey.split("-");
  return `${d}.${m}.${y}`;
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

type CategoryRow = {
  id: number;
  label: string;
  level: 1 | 2 | 3;
  l1Id: number;
  l2Id?: number;
  l3Id?: number;
};

type CategoryMatrix = {
  rows: CategoryRow[];
  monthKeys: string[];
  totals: Map<number, Record<string, number>>;
  hasMissingRates: boolean;
};

function toMonthKey(dateKey: string) {
  return dateKey.slice(0, 7);
}

function toTxDateKey(value: string) {
  return value ? value.slice(0, 10) : "";
}

function formatMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-");
  const monthIndex = Number.parseInt(month, 10) - 1;
  const monthNames = [
    "Январь",
    "Февраль",
    "Март",
    "Апрель",
    "Май",
    "Июнь",
    "Июль",
    "Август",
    "Сентябрь",
    "Октябрь",
    "Ноябрь",
    "Декабрь",
  ];
  if (Number.isNaN(monthIndex) || monthIndex < 0 || monthIndex >= monthNames.length) {
    return `${month}.${year}`;
  }
  return `${monthNames[monthIndex]} ${year}`;
}

function formatRub(valueInCents: number) {
  return formatAmount(valueInCents);
}

function formatSignedValue(valueInCents: number, formatter: (v: number) => string) {
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

function buildCategoryBreakdownByPeriod(
  txs: TransactionOut[],
  direction: "INCOME" | "EXPENSE",
  periodKeys: string[],
  granularity: ReportPeriodGranularity,
  itemsById: Map<number, ItemOut>,
  ratesByDate: Record<string, FxRateOut[]>,
  categoryById: Map<number, CategoryNode>
): { rows: CategoryRow[]; totals: Map<number, Record<string, number>> } {
  const filteredTxs = txs.filter((tx) => tx.direction === direction);
  const rows = buildCategoryRows(filteredTxs, categoryById);
  const totals = new Map<number, Record<string, number>>();
  rows.forEach((row) => {
    totals.set(row.id, Object.fromEntries(periodKeys.map((pk) => [pk, 0])));
  });
  const resolveTrail = buildCategoryTrailResolver(categoryById);

  const addValue = (rowId: number, periodKey: string, value: number) => {
    const rowTotals = totals.get(rowId);
    if (!rowTotals) return;
    rowTotals[periodKey] = (rowTotals[periodKey] ?? 0) + value;
  };

  filteredTxs.forEach((tx) => {
    const categoryId = tx.category_id;
    if (!categoryId || !tx.transaction_date) return;
    const periodKey = getPeriodKey(toTxDateKey(tx.transaction_date), granularity);
    if (!periodKeys.includes(periodKey)) return;
    const trail = resolveTrail(categoryId);
    if (trail.length === 0) return;
    const [l1, l2, l3] = trail;
    if (!l1) return;
    const currencyCode = itemsById.get(tx.primary_item_id)?.currency_code ?? "RUB";
    const rubCents = getRubEquivalentCents(tx, currencyCode, ratesByDate);
    if (rubCents === null) return;
    const sign = direction === "EXPENSE" ? -1 : 1;
    const value = Math.abs(rubCents) * sign;
    addValue(l1.id, periodKey, value);
    if (l2) {
      addValue(l2.id, periodKey, value);
      if (l3) addValue(l3.id, periodKey, value);
    }
  });

  return { rows, totals };
}

function buildCategoryIndex(nodes: CategoryNode[]) {
  const map = new Map<number, CategoryNode>();
  const walk = (items: CategoryNode[]) => {
    items.forEach((item) => {
      map.set(item.id, item);
      if (item.children?.length) {
        walk(item.children);
      }
    });
  };
  walk(nodes);
  return map;
}

function buildCategoryTrailResolver(categoryById: Map<number, CategoryNode>) {
  const cache = new Map<number, CategoryNode[]>();
  return (categoryId: number) => {
    const cached = cache.get(categoryId);
    if (cached) return cached;
    const trail: CategoryNode[] = [];
    let current = categoryById.get(categoryId);
    while (current) {
      trail.push(current);
      const parentId = current.parent_id ?? null;
      if (!parentId) break;
      current = categoryById.get(parentId);
    }
    const result = trail.reverse();
    cache.set(categoryId, result);
    return result;
  };
}

function toCbrDate(value: string) {
  const parts = value.split("-");
  if (parts.length === 3) {
    const [year, month, day] = parts;
    if (year && month && day) return `${day}/${month}/${year}`;
  }
  return value;
}

function parseAmountFilter(value: string): number | null {
  const cleaned = value.trim().replace(/\s/g, "").replace(",", ".");
  if (!cleaned) return null;
  const num = Number(cleaned);
  if (!Number.isFinite(num)) return null;
  return Math.round(num * 100);
}

// Chart helpers (reused from assets-dynamics approach)
type ChartPoint = { x: number; y: number; value: number };

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

function buildChartTicks(minValue: number, maxValue: number) {
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

function formatChartTick(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function buildPeriodMarks(
  periodPoints: { periodKey: string; label: string }[],
  width: number,
  padding: { left: number; right: number }
) {
  if (periodPoints.length === 0) return [];
  const innerWidth = width - padding.left - padding.right;
  const targetLabels = 7;
  const step = Math.max(1, Math.ceil(periodPoints.length / (targetLabels - 1)));
  const marks: { label: string; x: number; index: number }[] = [];
  for (let i = 0; i < periodPoints.length; i += step) {
    const p = periodPoints[i];
    if (!p) continue;
    const progress = periodPoints.length <= 1 ? 0 : i / (periodPoints.length - 1);
    marks.push({
      label: p.label,
      x: padding.left + innerWidth * progress,
      index: i,
    });
  }
  if (periodPoints.length > 0) {
    const last = periodPoints[periodPoints.length - 1];
    const lastProgress = 1;
    if (marks[marks.length - 1]?.index !== periodPoints.length - 1) {
      marks.push({
        label: last?.label ?? "",
        x: padding.left + innerWidth,
        index: periodPoints.length - 1,
      });
    }
  }
  return marks;
}

function buildCategoryRows(
  txs: TransactionOut[],
  categoryById: Map<number, CategoryNode>
) {
  const tree = new Map<number, Map<number, Set<number>>>();
  const labels = new Map<number, string>();
  const resolveTrail = buildCategoryTrailResolver(categoryById);

  txs.forEach((tx) => {
    const categoryId = tx.category_id;
    if (!categoryId) return;
    const trail = resolveTrail(categoryId);
    if (trail.length === 0) return;
    const [l1, l2, l3] = trail;
    if (!l1) return;

    labels.set(l1.id, l1.name);
    if (!tree.has(l1.id)) tree.set(l1.id, new Map());
    const l2Map = tree.get(l1.id)!;

    if (l2) {
      labels.set(l2.id, l2.name);
      if (!l2Map.has(l2.id)) l2Map.set(l2.id, new Set());
      if (l3) {
        labels.set(l3.id, l3.name);
        l2Map.get(l2.id)?.add(l3.id);
      }
    }
  });

  const rows: CategoryRow[] = [];
  const l1Ids = Array.from(tree.keys()).sort((a, b) =>
    (labels.get(a) ?? "").localeCompare(labels.get(b) ?? "", "ru")
  );
  l1Ids.forEach((l1Id) => {
    rows.push({
      id: l1Id,
      label: labels.get(l1Id) ?? "",
      level: 1,
      l1Id,
    });

    const l2Map = tree.get(l1Id) ?? new Map<number, Set<number>>();
    const l2Ids = Array.from(l2Map.keys()).sort((a, b) =>
      (labels.get(a) ?? "").localeCompare(labels.get(b) ?? "", "ru")
    );
    l2Ids.forEach((l2Id) => {
      rows.push({
        id: l2Id,
        label: labels.get(l2Id) ?? "",
        level: 2,
        l1Id,
        l2Id,
      });

      const l3Set = l2Map.get(l2Id) ?? new Set<number>();
      const l3Ids = Array.from(l3Set).sort((a, b) =>
        (labels.get(a) ?? "").localeCompare(labels.get(b) ?? "", "ru")
      );
      l3Ids.forEach((l3Id) => {
        rows.push({
          id: l3Id,
          label: labels.get(l3Id) ?? "",
          level: 3,
          l1Id,
          l2Id,
          l3Id,
        });
      });
    });
  });

  return rows;
}

function getRubEquivalentCents(
  tx: TransactionOut,
  currencyCode: string,
  ratesByDate: Record<string, FxRateOut[]>
) {
  if (!currencyCode || currencyCode === "RUB") return tx.amount;
  const dateKey = toTxDateKey(tx.transaction_date);
  if (!dateKey) return null;
  const rates = ratesByDate[dateKey];
  if (!rates) return null;
  const rate = rates.find((rate) => rate.char_code === currencyCode)?.rate ?? null;
  if (!rate) return null;
  return Math.round((tx.amount / 100) * rate * 100);
}

function buildCategoryMatrix(
  txs: TransactionOut[],
  itemsById: Map<number, ItemOut>,
  ratesByDate: Record<string, FxRateOut[]>,
  categoryById: Map<number, CategoryNode>,
  monthKeysOverride?: string[]
): CategoryMatrix {
  const rows = buildCategoryRows(txs, categoryById);
  const totals = new Map<number, Record<string, number>>();
  rows.forEach((row) => totals.set(row.id, {}));

  const monthSet = new Set<string>();
  let hasMissingRates = false;
  const resolveTrail = buildCategoryTrailResolver(categoryById);

  const addValue = (rowId: number, monthKey: string, value: number) => {
    const rowTotals = totals.get(rowId);
    if (!rowTotals) return;
    rowTotals[monthKey] = (rowTotals[monthKey] ?? 0) + value;
  };

  txs.forEach((tx) => {
    const categoryId = tx.category_id;
    if (!categoryId) return;
    const trail = resolveTrail(categoryId);
    if (trail.length === 0) return;
    const [l1, l2, l3] = trail;
    if (!l1 || !tx.transaction_date) return;

    const dateKey = toTxDateKey(tx.transaction_date);
    if (!dateKey) return;
    const monthKey = toMonthKey(dateKey);
    monthSet.add(monthKey);

    const currencyCode = itemsById.get(tx.primary_item_id)?.currency_code ?? "RUB";
    const rubCents = getRubEquivalentCents(tx, currencyCode, ratesByDate);
    if (rubCents === null) {
      hasMissingRates = true;
      return;
    }

    const sign = tx.direction === "EXPENSE" ? -1 : 1;
    const value = Math.abs(rubCents) * sign;
    addValue(l1.id, monthKey, value);
    if (l2) {
      addValue(l2.id, monthKey, value);
      if (l3) addValue(l3.id, monthKey, value);
    }
  });

  const monthKeys = monthKeysOverride ?? Array.from(monthSet).sort();
  return { rows, monthKeys, totals, hasMissingRates };
}

function buildSummaryTotals(
  rows: CategoryRow[],
  totals: Map<number, Record<string, number>>,
  monthKeys: string[]
) {
  const summary: Record<string, number> = {};
  monthKeys.forEach((monthKey) => {
    summary[monthKey] = 0;
  });

  rows
    .filter((row) => row.level === 1)
    .forEach((row) => {
      const rowTotals = totals.get(row.id) ?? {};
      monthKeys.forEach((monthKey) => {
        summary[monthKey] += rowTotals[monthKey] ?? 0;
      });
    });

  return summary;
}

function useCategoryExpansion(rows: CategoryRow[]) {
  const l1Keys = useMemo(
    () =>
      Array.from(new Set(rows.filter((row) => row.level === 1).map((row) => row.l1Id))),
    [rows]
  );
  const l2Keys = useMemo(
    () =>
      Array.from(
        new Set(
          rows
            .filter((row) => row.level === 2)
            .map((row) => `${row.l1Id}::${row.l2Id ?? 0}`)
        )
      ),
    [rows]
  );
  const l1HasChildren = useMemo(
    () => new Set(rows.filter((row) => row.level === 2).map((row) => row.l1Id)),
    [rows]
  );
  const l2HasChildren = useMemo(
    () =>
      new Set(
        rows
          .filter((row) => row.level === 3)
          .map((row) => `${row.l1Id}::${row.l2Id ?? 0}`)
      ),
    [rows]
  );

  const initializedRef = useRef(false);
  const [expandedL1, setExpandedL1] = useState<Set<number>>(() => new Set());
  const [expandedL2, setExpandedL2] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!initializedRef.current && l1Keys.length === 0 && l2Keys.length === 0) {
      return;
    }
    setExpandedL1((prev) => {
      const next = new Set(l1Keys.filter((key) => prev.has(key)));
      return next;
    });
    setExpandedL2((prev) => {
      const next = new Set(l2Keys.filter((key) => prev.has(key)));
      return next;
    });
    initializedRef.current = true;
  }, [l1Keys, l2Keys]);

  const toggleL1 = (key: number) => {
    setExpandedL1((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const toggleL2 = (key: string) => {
    setExpandedL2((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const isRowVisible = (row: CategoryRow) => {
    if (row.level === 1) return true;
    if (!expandedL1.has(row.l1Id)) return false;
    if (row.level === 2) return true;
    const key = `${row.l1Id}::${row.l2Id ?? 0}`;
    return expandedL2.has(key);
  };

  return {
    l1HasChildren,
    l2HasChildren,
    expandedL1,
    expandedL2,
    toggleL1,
    toggleL2,
    isRowVisible,
  };
}

function CategorySectionBody({
  sectionId,
  title,
  rows,
  totals,
  monthKeys,
  emptyLabel,
  accent,
  categoryLookup,
  apiBase,
}: {
  sectionId: string;
  title: string;
  rows: CategoryRow[];
  totals: Map<number, Record<string, number>>;
  monthKeys: string[];
  emptyLabel: string;
  accent: string;
  categoryLookup: ReturnType<typeof buildCategoryLookup>;
  apiBase: string;
}) {
  const {
    l1HasChildren,
    l2HasChildren,
    expandedL1,
    expandedL2,
    toggleL1,
    toggleL2,
    isRowVisible,
  } = useCategoryExpansion(rows);

  return (
    <>
      <TableRow>
        <TableCell
          colSpan={monthKeys.length + 1}
          className={cn("bg-slate-50 text-sm font-semibold", accent)}
        >
          {title}
        </TableCell>
      </TableRow>
      {rows.length === 0 ? (
        <TableRow>
          <TableCell
            colSpan={monthKeys.length + 1}
            className="text-sm text-muted-foreground"
          >
            {emptyLabel}
          </TableCell>
        </TableRow>
      ) : (
        rows.map((row) => {
          if (!isRowVisible(row)) return null;
          const rowTotals = totals.get(row.id) ?? {};
          const l2Key = `${row.l1Id}::${row.l2Id ?? 0}`;
          const hasChildren =
            row.level === 1
              ? l1HasChildren.has(row.l1Id)
              : row.level === 2
                ? l2HasChildren.has(l2Key)
                : false;
          const isExpanded =
            row.level === 1
              ? expandedL1.has(row.l1Id)
              : row.level === 2
                ? expandedL2.has(l2Key)
                : true;
          const indentClass = row.level === 1 ? "" : row.level === 2 ? "pl-4" : "pl-8";
          return (
            <TableRow key={`${sectionId}:${row.id}`}>
              <TableCell
                className={cn(
                  "whitespace-nowrap",
                  row.level === 1 && "font-semibold text-foreground",
                  row.level === 2 && "text-slate-800",
                  row.level === 3 && "text-sm text-slate-600"
                )}
              >
                <div className={cn("flex items-center gap-2", indentClass)}>
                  {hasChildren ? (
                    <IconButton
                      type="button"
                      onClick={() =>
                        row.level === 1 ? toggleL1(row.l1Id) : toggleL2(l2Key)
                      }
                      className="h-6 w-6 shrink-0"
                      aria-label={
                        isExpanded ? "Свернуть подкатегории" : "Развернуть подкатегории"
                      }
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </IconButton>
                  ) : (
                    <span className="inline-flex h-6 w-6 shrink-0" aria-hidden="true" />
                  )}
                  <CategoryIconImage
                    categoryId={row.id}
                    categoryLookup={categoryLookup}
                    apiBase={apiBase}
                    size={16}
                    className="h-4 w-4 shrink-0 text-muted-foreground"
                    fallbackIconColor="currentColor"
                  />
                  <span>{row.label}</span>
                </div>
              </TableCell>
              {monthKeys.map((monthKey) => {
                const value = rowTotals[monthKey] ?? 0;
                return (
                  <TableCell
                    key={`${sectionId}:${row.id}-${monthKey}`}
                    className="text-right text-foreground"
                  >
                    {formatRub(value)}
                  </TableCell>
                );
              })}
            </TableRow>
          );
        })
      )}
    </>
  );
}

function CategoryTable({
  title,
  monthKeys,
  sections,
  emptyLabel,
  summaryLabel,
  summaryTotals,
  categoryLookup,
  apiBase,
}: {
  title: string;
  monthKeys: string[];
  sections: {
    id: string;
    title: string;
    rows: CategoryRow[];
    totals: Map<number, Record<string, number>>;
    emptyLabel: string;
    accent: string;
  }[];
  emptyLabel: string;
  summaryLabel?: string;
  summaryTotals?: Record<string, number>;
  categoryLookup: ReturnType<typeof buildCategoryLookup>;
  apiBase: string;
}) {
  const hasAnyRows = sections.some((section) => section.rows.length > 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base text-slate-800">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {!hasAnyRows || monthKeys.length === 0 ? (
          <div className="text-sm text-muted-foreground">{emptyLabel}</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[220px]">Категория</TableHead>
                  {monthKeys.map((monthKey) => (
                    <TableHead key={monthKey} className="min-w-[120px] text-right">
                      {formatMonthLabel(monthKey)}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sections.map((section) => (
                  <CategorySectionBody
                    key={section.id}
                    sectionId={section.id}
                    title={section.title}
                    rows={section.rows}
                    totals={section.totals}
                    monthKeys={monthKeys}
                    emptyLabel={section.emptyLabel}
                    accent={section.accent}
                    categoryLookup={categoryLookup}
                    apiBase={apiBase}
                  />
                ))}
              </TableBody>
              {summaryLabel && summaryTotals && (
                <TableFooter>
                  <TableRow>
                    <TableCell className="font-semibold text-foreground">
                      {summaryLabel}
                    </TableCell>
                    {monthKeys.map((monthKey) => (
                      <TableCell
                        key={`summary-${monthKey}`}
                        className="text-right font-semibold text-foreground"
                      >
                        {formatRub(summaryTotals[monthKey] ?? 0)}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CategoryBreakdownTable({
  reportKind,
  clickedPeriodKeys,
  chartPeriodPoints,
  granularity,
  categoryBreakdownIncome,
  categoryBreakdownExpense,
  chartTxList,
  itemsById,
  counterparties,
  chartRatesByDate,
  categoryById,
  categoryLookup,
  categoryDescendantsMap,
  expandedCategoryId,
  setExpandedCategoryId,
  onClose,
  formatPeriodLabel,
}: {
  reportKind: "BOTH" | "INCOME" | "EXPENSE";
  clickedPeriodKeys: string[];
  chartPeriodPoints: { periodKey: string; label: string }[];
  granularity: ReportPeriodGranularity;
  categoryBreakdownIncome: { rows: CategoryRow[]; totals: Map<number, Record<string, number>> };
  categoryBreakdownExpense: { rows: CategoryRow[]; totals: Map<number, Record<string, number>> };
  chartTxList: TransactionOut[];
  itemsById: Map<number, ItemOut>;
  counterparties: Awaited<ReturnType<typeof fetchCounterparties>>;
  chartRatesByDate: Record<string, FxRateOut[]>;
  categoryById: Map<number, CategoryNode>;
  categoryLookup: ReturnType<typeof buildCategoryLookup>;
  categoryDescendantsMap: Map<number, Set<number>>;
  expandedCategoryId: number | null;
  setExpandedCategoryId: React.Dispatch<React.SetStateAction<number | null>>;
  onClose: () => void;
  formatPeriodLabel: (periodKey: string) => string;
}) {
  const sections: { direction: "INCOME" | "EXPENSE"; label: string; rows: CategoryRow[]; totals: Map<number, Record<string, number>> }[] = [];
  if (reportKind === "BOTH" || reportKind === "INCOME") {
    if (categoryBreakdownIncome.rows.length > 0) {
      sections.push({ direction: "INCOME", label: "Доходы", rows: categoryBreakdownIncome.rows, totals: categoryBreakdownIncome.totals });
    }
  }
  if (reportKind === "BOTH" || reportKind === "EXPENSE") {
    if (categoryBreakdownExpense.rows.length > 0) {
      sections.push({ direction: "EXPENSE", label: "Расходы", rows: categoryBreakdownExpense.rows, totals: categoryBreakdownExpense.totals });
    }
  }
  const sumTxToRubCents = useCallback(
    (tx: TransactionOut) => {
      const dateKey = toTxDateKey(tx.transaction_date);
      if (!dateKey) return 0;
      const code = itemsById.get(tx.primary_item_id)?.currency_code ?? "RUB";
      let rubCents = tx.amount;
      if (code !== "RUB") {
        const rates = chartRatesByDate[dateKey];
        const rate = rates?.find((r) => r.char_code === code)?.rate;
        if (rate == null) return 0;
        rubCents = Math.round((tx.amount / 100) * rate * 100);
      }
      return Math.abs(rubCents);
    },
    [itemsById, chartRatesByDate]
  );
  return (
    <>
      <div className="flex items-center justify-between py-2">
        <h3 className="text-base font-semibold" style={{ color: ACTIVE_TEXT_DARK }}>Категории по выбранным периодам</h3>
        <button type="button" onClick={onClose} className="text-sm rounded-md px-3 py-1.5 hover:bg-white/10 transition-colors" style={{ color: PLACEHOLDER_COLOR_DARK }}>Закрыть</button>
      </div>
      {sections.map((section) => (
        <CategoryBreakdownSection
          key={section.direction}
          section={section}
          clickedPeriodKeys={clickedPeriodKeys}
          formatPeriodLabel={formatPeriodLabel}
          chartTxList={chartTxList}
          granularity={granularity}
          itemsById={itemsById}
          counterparties={counterparties}
          categoryLookup={categoryLookup}
          categoryDescendantsMap={categoryDescendantsMap}
          sumTxToRubCents={sumTxToRubCents}
          expandedCategoryId={expandedCategoryId}
          setExpandedCategoryId={setExpandedCategoryId}
        />
      ))}
    </>
  );
}

function CategoryBreakdownSection({
  section,
  clickedPeriodKeys,
  formatPeriodLabel,
  chartTxList,
  granularity,
  itemsById,
  counterparties,
  categoryLookup,
  categoryDescendantsMap,
  sumTxToRubCents,
  expandedCategoryId,
  setExpandedCategoryId,
}: {
  section: { direction: "INCOME" | "EXPENSE"; label: string; rows: CategoryRow[]; totals: Map<number, Record<string, number>> };
  clickedPeriodKeys: string[];
  formatPeriodLabel: (pk: string) => string;
  chartTxList: TransactionOut[];
  granularity: ReportPeriodGranularity;
  itemsById: Map<number, ItemOut>;
  counterparties: Awaited<ReturnType<typeof fetchCounterparties>>;
  categoryLookup: ReturnType<typeof buildCategoryLookup>;
  categoryDescendantsMap: Map<number, Set<number>>;
  sumTxToRubCents: (tx: TransactionOut) => number;
  expandedCategoryId: number | null;
  setExpandedCategoryId: React.Dispatch<React.SetStateAction<number | null>>;
}) {
  const { direction, rows, totals } = section;
  const counterpartiesById = useMemo(() => new Map(counterparties.map((c) => [c.id, c])), [counterparties]);
  const itemCounterpartyName = useCallback(
    (itemId: number | null | undefined) => {
      if (!itemId) return "";
      const cpId = itemsById.get(itemId)?.counterparty_id;
      if (cpId == null) return "";
      return counterpartiesById.get(cpId)?.name ?? "";
    },
    [itemsById, counterpartiesById]
  );
  const { l1HasChildren, l2HasChildren, expandedL1, expandedL2, toggleL1, toggleL2, isRowVisible } = useCategoryExpansion(rows);
  const totalByPeriod = clickedPeriodKeys.map((pk) => rows.filter((r) => r.level === 1).reduce((s, r) => s + (totals.get(r.id)?.[pk] ?? 0), 0));
  const totalGrowthPercent = clickedPeriodKeys.length === 2 && totalByPeriod[0] !== 0
    ? direction === "EXPENSE" ? (Math.abs(totalByPeriod[1]) - Math.abs(totalByPeriod[0])) / Math.abs(totalByPeriod[0]) * 100
    : (totalByPeriod[1] - totalByPeriod[0]) / Math.abs(totalByPeriod[0]) * 100
    : null;
  const positiveIsGood = direction === "INCOME";
  const getTxsForCategory = useCallback(
    (categoryId: number) => {
      const ids = categoryDescendantsMap.get(categoryId);
      if (!ids) return [];
      const periodSet = new Set(clickedPeriodKeys);
      return chartTxList
        .filter((tx) => {
          if (tx.direction !== direction) return false;
          const catId = tx.category_id;
          if (!catId || !ids.has(catId)) return false;
          const periodKey = getPeriodKey(toTxDateKey(tx.transaction_date), granularity);
          return periodSet.has(periodKey);
        })
        .map((tx) => ({ tx, rubCents: sumTxToRubCents(tx) * (direction === "EXPENSE" ? -1 : 1) }))
        .sort((a, b) => toTxDateKey(a.tx.transaction_date).localeCompare(toTxDateKey(b.tx.transaction_date)));
    },
    [chartTxList, clickedPeriodKeys, direction, granularity, categoryDescendantsMap, sumTxToRubCents]
  );
  return (
    <div className="relative rounded-lg overflow-hidden border-0 outline-none mb-4" style={{ backgroundColor: MODAL_BG }}>
      <div className="px-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr style={{ color: PLACEHOLDER_COLOR_DARK, backgroundColor: BACKGROUND_DT }}>
                <th className="pl-8 pr-6 py-3 text-sm font-medium">Категория</th>
                {clickedPeriodKeys.map((_, i) => (
                  <Fragment key={clickedPeriodKeys[i]}>
                    {i === 1 && clickedPeriodKeys.length === 2 && <th className="px-3 py-3 text-sm font-medium text-center w-20">Прирост</th>}
                    <th className={`px-6 py-3 text-sm font-medium text-center ${i === clickedPeriodKeys.length - 1 ? "pr-8" : ""}`}>{formatPeriodLabel(clickedPeriodKeys[i] ?? "")}</th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                if (!isRowVisible(row)) return null;
                const rowTotals = totals.get(row.id) ?? {};
                const valuesByPeriod = clickedPeriodKeys.map((pk) => rowTotals[pk] ?? 0);
                const growthPercent = clickedPeriodKeys.length === 2 && valuesByPeriod[0] !== 0
                  ? direction === "EXPENSE" ? (Math.abs(valuesByPeriod[1] ?? 0) - Math.abs(valuesByPeriod[0] ?? 0)) / Math.abs(valuesByPeriod[0]) * 100
                  : ((valuesByPeriod[1] ?? 0) - (valuesByPeriod[0] ?? 0)) / Math.abs(valuesByPeriod[0]) * 100
                  : null;
                const growthColor = growthPercent != null && growthPercent !== 0 ? (growthPercent >= 0 === positiveIsGood ? GREEN : RED) : undefined;
                const l2Key = `${row.l1Id}::${row.l2Id ?? 0}`;
                const hasChildren = row.level === 1 ? l1HasChildren.has(row.l1Id) : row.level === 2 ? l2HasChildren.has(l2Key) : false;
                const isExpanded = row.level === 1 ? expandedL1.has(row.l1Id) : row.level === 2 ? expandedL2.has(l2Key) : true;
                const indentClass = row.level === 1 ? "" : row.level === 2 ? "pl-4" : "pl-8";
                const isCategoryExpanded = expandedCategoryId === row.id;
                const txsForCategory = isCategoryExpanded ? getTxsForCategory(row.id) : [];
                return (
                  <Fragment key={row.id}>
                    <tr
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { const target = e.target as HTMLElement; if (target.closest("button")) return; setExpandedCategoryId((id) => (id === row.id ? null : row.id)); }}
                      onKeyDown={(e) => e.key === "Enter" && setExpandedCategoryId((id) => (id === row.id ? null : row.id))}
                      className="border-t border-white/10 transition-colors hover:bg-white/[0.06] cursor-pointer"
                    >
                      <td className="pl-8 pr-6 py-3 text-sm">
                        <div className={cn("flex items-center gap-2 flex-wrap", indentClass)}>
                          {hasChildren ? (
                            <IconButton
                              type="button"
                              onClick={(e) => { e.stopPropagation(); row.level === 1 ? toggleL1(row.l1Id) : toggleL2(l2Key); }}
                              className="h-6 w-6 shrink-0"
                              aria-label={isExpanded ? "Свернуть" : "Развернуть"}
                            >
                              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            </IconButton>
                          ) : <span className="w-6 shrink-0" aria-hidden="true" />}
                          <CategoryIconImage categoryId={row.id} categoryLookup={categoryLookup} apiBase={API_BASE} size={20} className="h-5 w-5 rounded-sm" />
                          <span style={{ color: ACTIVE_TEXT_DARK }}>{row.label}</span>
                        </div>
                      </td>
                      {clickedPeriodKeys.map((pk, dateIdx) => (
                        <Fragment key={pk}>
                          {dateIdx === 1 && clickedPeriodKeys.length === 2 && (
                            <td className="px-3 py-3 text-center tabular-nums text-sm" style={growthColor ? { color: growthColor } : undefined}>{growthPercent != null ? formatGrowthPercent(growthPercent) : "–"}</td>
                          )}
                          <td className={`px-4 py-3 text-right tabular-nums text-sm ${dateIdx === clickedPeriodKeys.length - 1 ? "pr-8" : ""}`}>
                            <span style={{ color: direction === "EXPENSE" ? RED : GREEN }}>
                              {direction === "EXPENSE" ? `−${formatRub(Math.abs(valuesByPeriod[dateIdx] ?? 0))}` : formatRub(valuesByPeriod[dateIdx] ?? 0)}
                            </span>
                          </td>
                        </Fragment>
                      ))}
                    </tr>
                    {isCategoryExpanded && txsForCategory.length > 0 && (
                      <tr style={{ backgroundColor: BACKGROUND_DT }}>
                        <td colSpan={1 + clickedPeriodKeys.length + (clickedPeriodKeys.length === 2 ? 1 : 0)} className="py-3 pl-8 pr-8 align-top w-full" style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                          <table className="w-full text-left border-collapse text-sm" style={{ color: ACTIVE_TEXT_DARK, width: "100%" }}>
                            <tbody>
                              {txsForCategory.map(({ tx, rubCents }, txIdx) => {
                                const item = tx.primary_item_id != null ? itemsById.get(tx.primary_item_id) : undefined;
                                const itemCounterparty = item?.counterparty_id != null ? counterpartiesById.get(item.counterparty_id) : undefined;
                                const txCounterparty = tx.counterparty_id != null ? counterpartiesById.get(tx.counterparty_id) : undefined;
                                const amountColor = direction === "EXPENSE" ? RED : GREEN;
                                const isLastTx = txIdx === txsForCategory.length - 1;
                                return (
                                  <tr key={tx.id} style={isLastTx ? undefined : { borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                                    <td className="py-1.5 pr-4 align-middle" style={{ color: ACTIVE_TEXT_DARK }}>{formatTxDateCell(tx.transaction_date)}</td>
                                    <td className="py-1.5 pr-4 align-middle">
                                      {item ? (
                                        <div className="flex items-center gap-2">
                                          <div className="h-5 w-5 shrink-0 rounded-sm overflow-hidden flex items-center justify-center">
                                            <AssetItemIcon
                                              item={item}
                                              counterparty={itemCounterparty ?? null}
                                              apiBase={API_BASE}
                                              size={18}
                                              className="h-4 w-4 rounded-sm object-contain"
                                              fallbackIconColor={ACTIVE_TEXT_DARK}
                                              alt={itemCounterpartyName(item.id) || item.name || ""}
                                            />
                                          </div>
                                          <span style={{ color: ACTIVE_TEXT_DARK }}>{item.name || "–"}</span>
                                        </div>
                                      ) : <span style={{ color: PLACEHOLDER_COLOR_DARK }}>–</span>}
                                    </td>
                                    <td className="py-1.5 pr-4 align-middle">
                                      {txCounterparty ? (
                                        <div className="flex items-center gap-2">
                                          <div className="h-5 w-5 shrink-0 rounded-sm overflow-hidden flex items-center justify-center">
                                            <CounterpartyIconImage
                                              counterparty={txCounterparty}
                                              apiBase={API_BASE}
                                              size={18}
                                              className="h-4 w-4 rounded-sm object-contain"
                                              fallbackIconColor={ACTIVE_TEXT_DARK}
                                              alt={txCounterparty.name}
                                            />
                                          </div>
                                          <span style={{ color: ACTIVE_TEXT_DARK }}>{txCounterparty.name}</span>
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
                                    <td className="py-1.5 pr-4 align-middle tabular-nums text-right" style={{ color: amountColor }}>{formatSignedValue(rubCents, formatRub)}</td>
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
                {clickedPeriodKeys.map((_, dateIdx) => {
                  const total = totalByPeriod[dateIdx] ?? 0;
                  const totalGrowthColor = clickedPeriodKeys.length === 2 && dateIdx === 1 && totalGrowthPercent != null && totalGrowthPercent !== 0 ? (totalGrowthPercent >= 0) === positiveIsGood ? GREEN : RED : undefined;
                  return (
                    <Fragment key={clickedPeriodKeys[dateIdx]}>
                      {dateIdx === 1 && clickedPeriodKeys.length === 2 && <td className="px-3 py-3 text-center tabular-nums text-sm" style={totalGrowthColor ? { color: totalGrowthColor } : undefined}>{totalGrowthPercent != null ? formatGrowthPercent(totalGrowthPercent) : "–"}</td>}
                      <td className={`px-4 py-3 text-right tabular-nums text-sm ${dateIdx === clickedPeriodKeys.length - 1 ? "pr-8" : ""}`} style={{ color: direction === "EXPENSE" ? RED : GREEN }}>{direction === "EXPENSE" ? `−${formatRub(Math.abs(total))}` : formatRub(total)}</td>
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
}

const EMPTY_NUMBER_ARRAY: number[] = [];
const CATEGORY_PLACEHOLDER = "-";

type CategoryPathOption = { l1: string; l2: string; l3: string };

export default function IncomeExpenseDynamicsPage() {
  const { data: session } = useSession();
  const { accountingStartDate } = useAccountingStart();

  const [items, setItems] = useState<ItemOut[]>([]);
  const [counterparties, setCounterparties] = useState<Awaited<ReturnType<typeof fetchCounterparties>>>([]);
  const [chains, setChains] = useState<TransactionChainOut[]>([]);
  const [categoryNodes, setCategoryNodes] = useState<CategoryNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [chartDataLoading, setChartDataLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Chart report settings
  const [reportKind, setReportKind] = useState<"BOTH" | "INCOME" | "EXPENSE">("BOTH");
  const [historyPreset, setHistoryPreset] = useState<HistoryPresetKey>("last_month");
  const [forecastPreset, setForecastPreset] = useState<ForecastPresetKey>("next_month");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [granularity, setGranularity] = useState<ReportPeriodGranularity>("month");
  const [showForecast, setShowForecast] = useState(true);

  // Filters (same as Transactions)
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [amountFrom, setAmountFrom] = useState("");
  const [amountTo, setAmountTo] = useState("");
  const [selectedItemIds, setSelectedItemIds] = useState<Set<number>>(() => new Set());
  const [selectedRelatedItemIds, setSelectedRelatedItemIds] = useState<Set<number>>(() => new Set());
  const [selectedCategoryFilterKeys, setSelectedCategoryFilterKeys] = useState<Set<string>>(() => new Set());
  const [selectedCounterpartyIds, setSelectedCounterpartyIds] = useState<Set<number>>(() => new Set());
  const [commentFilter, setCommentFilter] = useState("");
  const [showConfirmed, setShowConfirmed] = useState(true);
  const [showUnconfirmed, setShowUnconfirmed] = useState(true);
  const [showActual, setShowActual] = useState(true);
  const [showPlanned, setShowPlanned] = useState(false);
  const [showPlannedRealized, setShowPlannedRealized] = useState(false);
  const [showPlannedUnrealized, setShowPlannedUnrealized] = useState(false);
  const [showActive, setShowActive] = useState(true);
  const [showDeleted, setShowDeleted] = useState(false);
  const [isCurrencyFilterOpen, setIsCurrencyFilterOpen] = useState(false);
  const [selectedCurrencyCodes, setSelectedCurrencyCodes] = useState<Set<string>>(() => new Set());
  const [chainIdFilter, setChainIdFilter] = useState<number | null>(null);
  const [chainPresetFilter, setChainPresetFilter] = useState<"total" | "realized" | "overdue" | "upcoming" | "deleted" | null>(null);
  const [chainFilterResetKey, setChainFilterResetKey] = useState(0);
  const [itemFilterResetKey, setItemFilterResetKey] = useState(0);
  const [chartTxList, setChartTxList] = useState<TransactionOut[]>([]);
  const [chartRatesByDate, setChartRatesByDate] = useState<Record<string, FxRateOut[]>>({});
  const [chartMissingRates, setChartMissingRates] = useState(false);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [tooltipLeft, setTooltipLeft] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const chartRef = useRef<HTMLDivElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [chartContainerReady, setChartContainerReady] = useState(false);
  const [chartSize, setChartSize] = useState({ width: 720, height: 280 });
  const setChartRef = useCallback((el: HTMLDivElement | null) => {
    chartRef.current = el;
    setChartContainerReady(!!el);
  }, []);
  const [clickedChartPeriodKeys, setClickedChartPeriodKeys] = useState<string[]>([]);
  const [expandedCategoryId, setExpandedCategoryId] = useState<number | null>(null);

  useEffect(() => {
    if (!session) return;
    let active = true;
    setLoading(true);
    setError(null);

    Promise.all([
      fetchItems({ includeClosed: true, includeArchived: true }),
      fetchCategories(),
      fetchCounterparties().catch(() => []),
      fetchTransactionChains().catch(() => []),
    ])
      .then(([itemsData, categoryData, counterpartiesData, chainsData]) => {
        if (!active) return;
        setItems(itemsData);
        setCategoryNodes(categoryData);
        setCounterparties(counterpartiesData);
        setChains(chainsData ?? []);
      })
      .catch((e: unknown) => {
        if (!active) return;
        setError(
          e && typeof e === "object" && "message" in e
            ? String((e as { message: string }).message)
            : "Не удалось загрузить транзакции и справочник активов."
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [session]);

  // Sync range dates when history/forecast presets change
  useEffect(() => {
    if (historyPreset !== "custom") {
      const start = getHistoryPresetStart(historyPreset, accountingStartDate ?? null);
      setRangeStart(start);
    }
  }, [historyPreset, accountingStartDate]);
  useEffect(() => {
    if (forecastPreset !== "custom") {
      setRangeEnd(getForecastPresetEnd(forecastPreset));
    }
  }, [forecastPreset]);

  const itemsById = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items]
  );
  const counterpartiesById = useMemo(
    () => new Map(counterparties.map((c) => [c.id, c])),
    [counterparties]
  );
  const getItemCounterparty = useCallback(
    (id: number | null | undefined) => {
      if (!id) return null;
      const cpId = itemsById.get(id)?.counterparty_id;
      if (!cpId) return null;
      return counterpartiesById.get(cpId) ?? null;
    },
    [itemsById, counterpartiesById]
  );
  const getCounterpartyForItemId = useCallback(
    (id: number) => getItemCounterparty(id) ?? null,
    [getItemCounterparty]
  );
  const itemBankLogoUrl = useCallback(
    (id: number | null | undefined) => {
      const cp = getItemCounterparty(id);
      if (!cp) return null;
      const candidates = getCounterpartyImageUrlCandidates(cp, API_BASE);
      return candidates[0] ?? null;
    },
    [getItemCounterparty]
  );
  const itemBankName = useCallback(
    (id: number | null | undefined) => {
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
    },
    [itemsById, counterpartiesById]
  );
  const getItemDisplayBalanceCents = useCallback(
    (item: ItemOut) => {
      if (item.type_code === "bank_card" && item.card_account_id) {
        const linked = itemsById.get(item.card_account_id);
        if (linked) return getItemPrimaryValueCents(linked);
      }
      return getItemPrimaryValueCents(item);
    },
    [itemsById]
  );
  const activeItems = useMemo(
    () => items.filter((item) => !item.archived_at && !item.closed_at),
    [items]
  );
  const categoryLookup = useMemo(
    () => buildCategoryLookup(categoryNodes),
    [categoryNodes]
  );
  const categoryDescendantsMap = useMemo(
    () => buildCategoryDescendants(categoryNodes),
    [categoryNodes]
  );
  const filterCategoryPaths = useMemo(() => {
    const paths: CategoryPathOption[] = [];
    const add = (l1: string, l2: string, l3: string) => {
      paths.push({ l1, l2, l3 });
    };
    // Пустые l2/l3 как плейсхолдер, чтобы ключи совпадали с CategorySelector (там l2/l3 = "")
    categoryNodes.forEach((l1) => {
      add(l1.name, "", "");
      (l1.children ?? []).forEach((l2) => {
        add(l1.name, l2.name, "");
        (l2.children ?? []).forEach((l3) => add(l1.name, l2.name, l3.name));
      });
    });
    return paths;
  }, [categoryNodes]);
  const categoryFilterPathByKey = useMemo(
    () =>
      new Map(
        filterCategoryPaths.map((opt) => [
          makeCategoryPathKey(opt.l1, opt.l2, opt.l3),
          opt,
        ])
      ),
    [filterCategoryPaths]
  );
  const selectedCategoryFilterOptions = useMemo(() => {
    const options: CategoryPathOption[] = [];
    selectedCategoryFilterKeys.forEach((key) => {
      const opt = categoryFilterPathByKey.get(key);
      if (opt) options.push(opt);
    });
    return options;
  }, [selectedCategoryFilterKeys, categoryFilterPathByKey]);
  const reportKindFromSelectedCategories = useMemo((): "BOTH" | "INCOME" | "EXPENSE" | null => {
    if (selectedCategoryFilterOptions.length === 0) return null;
    const scopes: ("INCOME" | "EXPENSE" | "BOTH")[] = [];
    selectedCategoryFilterOptions.forEach((opt) => {
      const id = categoryLookup.pathToId.get(makeCategoryPathKey(opt.l1, opt.l2, opt.l3));
      if (id != null) {
        const scope = categoryLookup.idToScope.get(id);
        if (scope) scopes.push(scope);
      }
    });
    if (scopes.length === 0) return null;
    const onlyIncome = scopes.every((s) => s === "INCOME");
    const onlyExpense = scopes.every((s) => s === "EXPENSE");
    if (onlyIncome) return "INCOME";
    if (onlyExpense) return "EXPENSE";
    return "BOTH";
  }, [selectedCategoryFilterOptions, categoryLookup]);
  useEffect(() => {
    if (reportKindFromSelectedCategories != null) {
      setReportKind(reportKindFromSelectedCategories);
    }
  }, [reportKindFromSelectedCategories]);

  const categoryFilterIds = useMemo(() => {
    if (selectedCategoryFilterOptions.length === 0) return EMPTY_NUMBER_ARRAY;
    const matchedIds = new Set<number>();
    const isPlaceholder = (v: string) => v === "" || v === CATEGORY_PLACEHOLDER;
    categoryLookup.idToPath.forEach((path, id) => {
      const [l1 = "", l2 = "", l3 = ""] = path;
      const match = selectedCategoryFilterOptions.some((opt) => {
        if (opt.l1 !== l1) return false;
        if (!isPlaceholder(opt.l2) && opt.l2 !== l2) return false;
        if (!isPlaceholder(opt.l3) && opt.l3 !== l3) return false;
        return true;
      });
      if (match) matchedIds.add(id);
    });
    // Включаем выбранные категории и всех потомков; в API передаём все id (L1, L2, L3), т.к. транзакция может быть привязана к любому уровню
    const resultSet = new Set<number>();
    matchedIds.forEach((id) => {
      const descendants = categoryDescendantsMap.get(id);
      if (descendants) {
        descendants.forEach((descId) => resultSet.add(descId));
      } else {
        resultSet.add(id);
      }
    });
    return resultSet.size ? Array.from(resultSet) : EMPTY_NUMBER_ARRAY;
  }, [categoryLookup.idToPath, selectedCategoryFilterOptions, categoryDescendantsMap]);
  const currencyItemIds = useMemo(() => {
    if (selectedCurrencyCodes.size === 0) return EMPTY_NUMBER_ARRAY;
    return items
      .filter((item) => selectedCurrencyCodes.has(item.currency_code ?? ""))
      .map((item) => item.id);
  }, [items, selectedCurrencyCodes]);
  const { itemFilterIds, cardItemFilterIds } = useMemo(() => {
    if (selectedItemIds.size === 0) {
      return { itemFilterIds: EMPTY_NUMBER_ARRAY, cardItemFilterIds: EMPTY_NUMBER_ARRAY };
    }
    const itemIds: number[] = [];
    const cardIds: number[] = [];
    selectedItemIds.forEach((id) => {
      const item = itemsById.get(id);
      if (item?.type_code === "bank_card" && item.card_account_id) {
        cardIds.push(id);
      } else {
        itemIds.push(id);
      }
    });
    return { itemFilterIds: itemIds, cardItemFilterIds: cardIds };
  }, [itemsById, selectedItemIds]);
  const statusFilter = useMemo((): TransactionOut["status"][] => {
    const values: TransactionOut["status"][] = [];
    if (showActual || (showPlanned && showPlannedUnrealized)) {
      if (showConfirmed) values.push("CONFIRMED");
      if (showUnconfirmed) values.push("UNCONFIRMED");
    }
    if (showPlanned && showPlannedRealized) values.push("REALIZED");
    return values;
  }, [showActual, showConfirmed, showPlanned, showPlannedRealized, showPlannedUnrealized, showUnconfirmed]);
  const transactionTypeFilter = useMemo((): TransactionOut["transaction_type"][] => {
    const values: TransactionOut["transaction_type"][] = [];
    if (showActual) values.push("ACTUAL");
    if (showPlanned) values.push("PLANNED");
    return values;
  }, [showActual, showPlanned]);
  /** Для графика: при включённом «Прогноз» запрашиваем и факт, и план */
  const chartTransactionTypeFilter = useMemo((): TransactionOut["transaction_type"][] => {
    if (showForecast) return ["ACTUAL", "PLANNED"];
    return transactionTypeFilter;
  }, [showForecast, transactionTypeFilter]);
  const counterpartyFilterIds = useMemo(
    () => (selectedCounterpartyIds.size === 0 ? EMPTY_NUMBER_ARRAY : Array.from(selectedCounterpartyIds)),
    [selectedCounterpartyIds]
  );
  const relatedItemFilterIds = useMemo(
    () => (selectedRelatedItemIds.size === 0 ? undefined : Array.from(selectedRelatedItemIds)),
    [selectedRelatedItemIds]
  );
  const minAmount = useMemo(() => parseAmountFilter(amountFrom), [amountFrom]);
  const maxAmount = useMemo(() => parseAmountFilter(amountTo), [amountTo]);
  const includeDeleted = showActive && showDeleted;
  const deletedOnly = showDeleted && !showActive;

  const rangeMinStartKey = accountingStartDate ?? "";
  const effectiveRangeStart = useMemo(() => {
    if (historyPreset === "custom") return rangeStart || "";
    return getHistoryPresetStart(historyPreset, accountingStartDate ?? null);
  }, [historyPreset, rangeStart, accountingStartDate]);
  const effectiveRangeEnd = useMemo(() => {
    if (forecastPreset === "custom") return rangeEnd || "";
    return getForecastPresetEnd(forecastPreset);
  }, [forecastPreset, rangeEnd]);
  const rangeStartKey = useMemo(() => {
    if (!effectiveRangeStart) return rangeMinStartKey || "";
    if (rangeMinStartKey && effectiveRangeStart < rangeMinStartKey) return rangeMinStartKey;
    return effectiveRangeStart;
  }, [rangeMinStartKey, effectiveRangeStart]);
  const rangeEndKey = useMemo(() => {
    if (!effectiveRangeEnd) return "";
    return effectiveRangeEnd < rangeStartKey ? rangeStartKey : effectiveRangeEnd;
  }, [effectiveRangeEnd, rangeStartKey]);

  const [chartFetchVersion, setChartFetchVersion] = useState(0);
  const triggerChartRefetch = useCallback(() => {
    setChartFetchVersion((v) => v + 1);
  }, []);

  // Keep latest params in ref so effect always uses current filters when it runs
  const paramsRef = useRef({
    date_from: "",
    date_to: "",
    item_ids: [] as number[],
    card_item_ids: [] as number[],
    category_ids: [] as number[],
    counterparty_ids: [] as number[],
    currency_item_ids: [] as number[],
    comment_query: "",
    related_item_ids: undefined as number[] | undefined,
    min_amount: undefined as number | undefined,
    max_amount: undefined as number | undefined,
    include_deleted: false,
    deleted_only: false,
    chainIdFilter: null as number | null,
    chainPresetFilter: null as string | null,
  });
  paramsRef.current = {
    date_from: dateFrom || rangeStartKey,
    date_to: dateTo || rangeEndKey,
    item_ids: itemFilterIds,
    card_item_ids: cardItemFilterIds,
    category_ids: categoryFilterIds,
    counterparty_ids: counterpartyFilterIds,
    currency_item_ids: currencyItemIds,
    comment_query: commentFilter.trim(),
    related_item_ids: relatedItemFilterIds,
    min_amount: minAmount ?? undefined,
    max_amount: maxAmount ?? undefined,
    include_deleted: includeDeleted,
    deleted_only: deletedOnly,
    chainIdFilter: chainIdFilter,
    chainPresetFilter: chainPresetFilter,
  };

  useEffect(() => {
    if (!session || !rangeStartKey || !rangeEndKey || chartTransactionTypeFilter.length === 0 || statusFilter.length === 0) {
      setChartTxList([]);
      return;
    }
    let cancelled = false;
    setChartDataLoading(true);
    const p = paramsRef.current;
    const params = {
      date_from: p.date_from,
      date_to: p.date_to,
      direction: reportKind === "BOTH" ? (["INCOME", "EXPENSE"] as TransactionOut["direction"][]) : [reportKind],
      transaction_type: chartTransactionTypeFilter,
      status: statusFilter,
      item_ids: p.item_ids.length ? p.item_ids : undefined,
      card_item_ids: p.card_item_ids.length ? p.card_item_ids : undefined,
      currency_item_ids: p.currency_item_ids.length ? p.currency_item_ids : undefined,
      category_ids: p.category_ids.length ? p.category_ids : undefined,
      counterparty_ids: p.counterparty_ids.length ? p.counterparty_ids : undefined,
      comment_query: p.comment_query || undefined,
      related_item_ids: p.related_item_ids,
      min_amount: p.min_amount,
      max_amount: p.max_amount,
      include_deleted: p.include_deleted,
      deleted_only: p.deleted_only,
    };
    (async () => {
      const all: TransactionOut[] = [];
      let cursor: string | null = null;
      for (;;) {
        const page = await fetchTransactionsPage({
          ...params,
          cursor,
          limit: 200,
        });
        if (cancelled) return;
        all.push(...page.items);
        if (!page.has_more || !page.next_cursor) break;
        cursor = page.next_cursor;
      }
      if (cancelled) return;
      let filtered = all;
      const chainId = paramsRef.current.chainIdFilter;
      const mode = paramsRef.current.chainPresetFilter ?? "total";
      if (chainId != null) {
        const todayKey = toDateKey(new Date());
        filtered = all
          .filter((tx) => tx.transaction_type === "PLANNED" && tx.chain_id === chainId)
          .filter((tx) => {
            if (mode === "deleted") return Boolean(tx.deleted_at);
            if (tx.deleted_at) return false;
            if (mode === "realized") return tx.status === "REALIZED";
            if (mode === "total") return true;
            if (tx.status === "REALIZED") return false;
            const dateKey = toTxDateKey(tx.transaction_date);
            if (!dateKey) return false;
            if (mode === "overdue") return dateKey < todayKey;
            if (mode === "upcoming") return dateKey >= todayKey;
            return true;
          });
      }
      setChartTxList(filtered);
      setChartDataLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    session,
    rangeStartKey,
    rangeEndKey,
    reportKind,
    chartTransactionTypeFilter,
    statusFilter,
    chartFetchVersion,
    categoryFilterIds,
  ]);

  useEffect(() => {
    if (chartTxList.length === 0) {
      setChartRatesByDate({});
      setChartMissingRates(false);
      return;
    }
    const missingDates = new Set<string>();
    chartTxList.forEach((tx) => {
      const code = itemsById.get(tx.primary_item_id)?.currency_code ?? "RUB";
      if (code === "RUB") return;
      const dateKey = toTxDateKey(tx.transaction_date);
      if (dateKey && !chartRatesByDate[dateKey]) missingDates.add(dateKey);
    });
    if (missingDates.size === 0) return;
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        Array.from(missingDates).map(async (dateKey) => {
          try {
            const rates = await fetchFxRates(toCbrDate(dateKey));
            return [dateKey, rates] as const;
          } catch {
            return [dateKey, null] as const;
          }
        })
      );
      if (cancelled) return;
      setChartRatesByDate((prev) => {
        const next = { ...prev };
        entries.forEach(([dateKey, rates]) => {
          if (rates?.length) next[dateKey] = rates;
        });
        return next;
      });
      const stillMissing = Array.from(missingDates).filter(
        (dk) => !entries.find(([key, r]) => key === dk && r?.length)
      );
      setChartMissingRates(stillMissing.length > 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [chartTxList, itemsById]);

  const chartPeriodPoints = useMemo(() => {
    if (!rangeStartKey || !rangeEndKey) return [];
    return listPeriodsInRange(rangeStartKey, rangeEndKey, granularity);
  }, [rangeStartKey, rangeEndKey, granularity]);

  const sumTxToRubCents = useCallback(
    (tx: TransactionOut) => {
      const dateKey = toTxDateKey(tx.transaction_date);
      if (!dateKey) return 0;
      const code = itemsById.get(tx.primary_item_id)?.currency_code ?? "RUB";
      let rubCents = tx.amount;
      if (code !== "RUB") {
        const rates = chartRatesByDate[dateKey];
        const rate = rates?.find((r) => r.char_code === code)?.rate;
        if (rate == null) return 0;
        rubCents = Math.round((tx.amount / 100) * rate * 100);
      }
      return Math.abs(rubCents);
    },
    [itemsById, chartRatesByDate]
  );

  const chartSumsByPeriodIncome = useMemo(() => {
    const map = new Map<string, number>();
    chartPeriodPoints.forEach((p) => map.set(p.periodKey, 0));
    chartTxList.forEach((tx) => {
      if (tx.direction !== "INCOME") return;
      if (showForecast && tx.transaction_type !== "ACTUAL") return;
      const dateKey = toTxDateKey(tx.transaction_date);
      if (!dateKey) return;
      const periodKey = getPeriodKey(dateKey, granularity);
      if (!map.has(periodKey)) return;
      const cents = sumTxToRubCents(tx);
      if (cents > 0) map.set(periodKey, (map.get(periodKey) ?? 0) + cents);
    });
    return map;
  }, [chartTxList, chartPeriodPoints, granularity, showForecast, sumTxToRubCents]);

  const chartSumsByPeriodExpense = useMemo(() => {
    const map = new Map<string, number>();
    chartPeriodPoints.forEach((p) => map.set(p.periodKey, 0));
    chartTxList.forEach((tx) => {
      if (tx.direction !== "EXPENSE") return;
      if (showForecast && tx.transaction_type !== "ACTUAL") return;
      const dateKey = toTxDateKey(tx.transaction_date);
      if (!dateKey) return;
      const periodKey = getPeriodKey(dateKey, granularity);
      if (!map.has(periodKey)) return;
      const cents = sumTxToRubCents(tx);
      if (cents > 0) map.set(periodKey, (map.get(periodKey) ?? 0) + cents);
    });
    return map;
  }, [chartTxList, chartPeriodPoints, granularity, showForecast, sumTxToRubCents]);

  const chartSumsByPeriodForecastIncome = useMemo(() => {
    if (!showForecast) return new Map<string, number>();
    const map = new Map<string, number>();
    chartPeriodPoints.forEach((p) => map.set(p.periodKey, 0));
    chartTxList.forEach((tx) => {
      if (tx.direction !== "INCOME") return;
      const dateKey = toTxDateKey(tx.transaction_date);
      if (!dateKey) return;
      const periodKey = getPeriodKey(dateKey, granularity);
      if (!map.has(periodKey)) return;
      const cents = sumTxToRubCents(tx);
      if (cents > 0) map.set(periodKey, (map.get(periodKey) ?? 0) + cents);
    });
    return map;
  }, [chartTxList, chartPeriodPoints, granularity, showForecast, sumTxToRubCents]);

  const chartSumsByPeriodForecastExpense = useMemo(() => {
    if (!showForecast) return new Map<string, number>();
    const map = new Map<string, number>();
    chartPeriodPoints.forEach((p) => map.set(p.periodKey, 0));
    chartTxList.forEach((tx) => {
      if (tx.direction !== "EXPENSE") return;
      const dateKey = toTxDateKey(tx.transaction_date);
      if (!dateKey) return;
      const periodKey = getPeriodKey(dateKey, granularity);
      if (!map.has(periodKey)) return;
      const cents = sumTxToRubCents(tx);
      if (cents > 0) map.set(periodKey, (map.get(periodKey) ?? 0) + cents);
    });
    return map;
  }, [chartTxList, chartPeriodPoints, granularity, showForecast, sumTxToRubCents]);

  const chartDataIncome = useMemo(() => {
    return chartPeriodPoints.map((p) => ({
      periodKey: p.periodKey,
      label: p.label,
      sumRubCents: chartSumsByPeriodIncome.get(p.periodKey) ?? 0,
    }));
  }, [chartPeriodPoints, chartSumsByPeriodIncome]);

  const chartDataExpense = useMemo(() => {
    return chartPeriodPoints.map((p) => ({
      periodKey: p.periodKey,
      label: p.label,
      sumRubCents: chartSumsByPeriodExpense.get(p.periodKey) ?? 0,
    }));
  }, [chartPeriodPoints, chartSumsByPeriodExpense]);

  const chartDataBalance = useMemo(() => {
    return chartPeriodPoints.map((p) => {
      const income = chartSumsByPeriodIncome.get(p.periodKey) ?? 0;
      const expense = chartSumsByPeriodExpense.get(p.periodKey) ?? 0;
      return {
        periodKey: p.periodKey,
        label: p.label,
        balanceRubCents: income - expense,
      };
    });
  }, [chartPeriodPoints, chartSumsByPeriodIncome, chartSumsByPeriodExpense]);

  const chartDataForecastIncome = useMemo(() => {
    if (!showForecast) return [];
    return chartPeriodPoints.map((p) => ({
      periodKey: p.periodKey,
      label: p.label,
      sumRubCents: chartSumsByPeriodForecastIncome.get(p.periodKey) ?? 0,
    }));
  }, [chartPeriodPoints, chartSumsByPeriodForecastIncome, showForecast]);

  const chartDataForecastExpense = useMemo(() => {
    if (!showForecast) return [];
    return chartPeriodPoints.map((p) => ({
      periodKey: p.periodKey,
      label: p.label,
      sumRubCents: chartSumsByPeriodForecastExpense.get(p.periodKey) ?? 0,
    }));
  }, [chartPeriodPoints, chartSumsByPeriodForecastExpense, showForecast]);

  const chartData = useMemo(() => {
    if (reportKind === "INCOME") return chartDataIncome;
    if (reportKind === "EXPENSE") return chartDataExpense;
    return chartDataIncome;
  }, [reportKind, chartDataIncome, chartDataExpense]);

  const chartDataForecast = useMemo(() => {
    if (!showForecast) return [];
    if (reportKind === "INCOME") return chartDataForecastIncome;
    if (reportKind === "EXPENSE") return chartDataForecastExpense;
    return chartDataForecastIncome;
  }, [showForecast, reportKind, chartDataForecastIncome, chartDataForecastExpense]);

  const chartTotalAndAverage = useMemo(() => {
    const totalRubCents = chartData.reduce((s, d) => s + d.sumRubCents, 0);
    const todayPeriodKey = getPeriodKey(toDateKey(new Date()), granularity);
    const completed = chartData.filter((d) => d.periodKey < todayPeriodKey);
    const completedCount = completed.length;
    const sumCompletedOnly = completed.reduce((s, d) => s + d.sumRubCents, 0);
    const averageRubCents = completedCount > 0 ? sumCompletedOnly / completedCount : 0;
    const completedSums = completed.map((d) => d.sumRubCents);
    const maxRubCents = completedSums.length ? Math.max(...completedSums) : 0;
    const minRubCents = completedSums.length ? Math.min(...completedSums) : 0;
    const totalForecastRubCents = chartDataForecast.reduce((s, d) => s + d.sumRubCents, 0);
    const allForecastSums = chartDataForecast.map((d) => d.sumRubCents);
    const forecastCount = chartDataForecast.length;
    const averageForecastRubCents = forecastCount > 0 ? totalForecastRubCents / forecastCount : 0;
    const maxForecastRubCents = allForecastSums.length ? Math.max(...allForecastSums) : 0;
    const minForecastRubCents = allForecastSums.length ? Math.min(...allForecastSums) : 0;
    const totalIncomeRubCents = chartDataIncome.reduce((s, d) => s + d.sumRubCents, 0);
    const totalExpenseRubCents = chartDataExpense.reduce((s, d) => s + d.sumRubCents, 0);
    const totalBalanceRubCents = chartDataBalance.reduce((s, d) => s + d.balanceRubCents, 0);
    const totalForecastIncomeRubCents = chartDataForecastIncome.reduce((s, d) => s + d.sumRubCents, 0);
    const totalForecastExpenseRubCents = chartDataForecastExpense.reduce((s, d) => s + d.sumRubCents, 0);
    const totalForecastBalanceRubCents = totalForecastIncomeRubCents - totalForecastExpenseRubCents;
    return {
      totalRubCents,
      averageRubCents,
      maxRubCents,
      minRubCents,
      totalForecastRubCents,
      averageForecastRubCents,
      maxForecastRubCents,
      minForecastRubCents,
      totalIncomeRubCents,
      totalExpenseRubCents,
      totalBalanceRubCents,
      totalForecastIncomeRubCents,
      totalForecastExpenseRubCents,
      totalForecastBalanceRubCents,
    };
  }, [chartData, chartDataForecast, chartDataIncome, chartDataExpense, chartDataBalance, chartDataForecastIncome, chartDataForecastExpense, granularity]);

  const width = chartSize.width;
  const height = chartSize.height;
  const padding = { top: 24, right: 0, bottom: 44, left: 0 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const isBoth = reportKind === "BOTH";
  const chartValues = chartData.map((d) => d.sumRubCents / 100);
  const forecastValues = chartDataForecast.map((d) => d.sumRubCents / 100);
  const incomeValues = chartDataIncome.map((d) => d.sumRubCents / 100);
  const expenseValues = chartDataExpense.map((d) => d.sumRubCents / 100);
  const balanceValues = chartDataBalance.map((d) => d.balanceRubCents / 100);
  const allValues = showForecast && forecastValues.length ? [...chartValues, ...forecastValues] : chartValues;
  const maxChartVal = allValues.length ? Math.max(...allValues, 0) : 0;
  const minBalanceVal = isBoth && balanceValues.length ? Math.min(...balanceValues, 0) : 0;
  const maxIncomeExpense = isBoth
    ? Math.max(
        ...(incomeValues.length ? incomeValues : [0]),
        ...(expenseValues.length ? expenseValues : [0]),
        0
      )
    : maxChartVal;
  const rangePadding = Math.max(Math.max(maxChartVal, maxIncomeExpense) * 0.12, 1);
  const paddedMax = maxIncomeExpense + rangePadding;
  const paddedMin = isBoth ? Math.min(minBalanceVal - rangePadding, 0) : 0;
  const chartTicks = buildChartTicks(paddedMin, paddedMax);
  const chartMin = chartTicks[0] ?? paddedMin;
  const chartMax = chartTicks[chartTicks.length - 1] ?? paddedMax;
  const todayPeriodKey = getPeriodKey(toDateKey(new Date()), granularity);
  const actualLastIndex = (() => {
    for (let i = chartData.length - 1; i >= 0; i--) {
      if (chartData[i].periodKey <= todayPeriodKey) return i;
    }
    return -1;
  })();
  const valueToY = (value: number) => {
    const valueRatio = (value - chartMin) / (chartMax - chartMin || 1);
    return padding.top + innerHeight - innerHeight * valueRatio;
  };
  const chartPoints: ChartPoint[] = chartData.map((point, index) => {
    const progress = chartData.length <= 1 ? 0 : index / (chartData.length - 1);
    const x = padding.left + innerWidth * progress;
    const value = point.sumRubCents / 100;
    const y = valueToY(value);
    return { x, y, value };
  });
  const chartPointsIncome: ChartPoint[] = isBoth
    ? chartDataIncome.map((point, index) => {
        const progress = chartDataIncome.length <= 1 ? 0 : index / (chartDataIncome.length - 1);
        const x = padding.left + innerWidth * progress;
        const value = point.sumRubCents / 100;
        const y = valueToY(value);
        return { x, y, value };
      })
    : [];
  const chartPointsExpense: ChartPoint[] = isBoth
    ? chartDataExpense.map((point, index) => {
        const progress = chartDataExpense.length <= 1 ? 0 : index / (chartDataExpense.length - 1);
        const x = padding.left + innerWidth * progress;
        const value = point.sumRubCents / 100;
        const y = valueToY(value);
        return { x, y, value };
      })
    : [];
  const chartPointsActualOnly = actualLastIndex >= 0 ? chartPoints.slice(0, actualLastIndex + 1) : [];
  const chartPointsIncomeActualOnly =
    isBoth && actualLastIndex >= 0 ? chartPointsIncome.slice(0, actualLastIndex + 1) : [];
  const chartPointsExpenseActualOnly =
    isBoth && actualLastIndex >= 0 ? chartPointsExpense.slice(0, actualLastIndex + 1) : [];
  const chartPointsForecast: ChartPoint[] = chartDataForecast.map((point, index) => {
    const progress = chartDataForecast.length <= 1 ? 0 : index / (chartDataForecast.length - 1);
    const x = padding.left + innerWidth * progress;
    const value = point.sumRubCents / 100;
    const y = valueToY(value);
    return { x, y, value };
  });
  const chartPointsForecastIncome: ChartPoint[] = isBoth
    ? chartDataForecastIncome.map((point, index) => {
        const progress = chartDataForecastIncome.length <= 1 ? 0 : index / (chartDataForecastIncome.length - 1);
        const x = padding.left + innerWidth * progress;
        const value = point.sumRubCents / 100;
        const y = valueToY(value);
        return { x, y, value };
      })
    : [];
  const chartPointsForecastExpense: ChartPoint[] = isBoth
    ? chartDataForecastExpense.map((point, index) => {
        const progress = chartDataForecastExpense.length <= 1 ? 0 : index / (chartDataForecastExpense.length - 1);
        const x = padding.left + innerWidth * progress;
        const value = point.sumRubCents / 100;
        const y = valueToY(value);
        return { x, y, value };
      })
    : [];
  const baselineValue = 0;
  const baselineY = valueToY(0);
  const chartLinePath = buildLinePath(chartPointsActualOnly);
  const chartLinePathForecast = chartPointsForecast.length > 0 ? buildLinePath(chartPointsForecast) : null;
  const chartAreaPath = buildAreaPath(chartPointsActualOnly, baselineY);
  const chartLinePathIncome = isBoth ? buildLinePath(chartPointsIncomeActualOnly) : null;
  const chartLinePathExpense = isBoth ? buildLinePath(chartPointsExpenseActualOnly) : null;
  const chartLinePathForecastIncome =
    isBoth && chartPointsForecastIncome.length > 0 ? buildLinePath(chartPointsForecastIncome) : null;
  const chartLinePathForecastExpense =
    isBoth && chartPointsForecastExpense.length > 0 ? buildLinePath(chartPointsForecastExpense) : null;
  const chartAreaPathIncome = isBoth ? buildAreaPath(chartPointsIncomeActualOnly, baselineY) : null;
  const chartAreaPathExpense = isBoth ? buildAreaPath(chartPointsExpenseActualOnly, baselineY) : null;
  const balanceBars = isBoth
    ? chartDataBalance.map((point, index) => {
        const progress = chartDataBalance.length <= 1 ? 0 : index / (chartDataBalance.length - 1);
        const x = padding.left + innerWidth * progress;
        const periodSpan = chartDataBalance.length <= 1 ? innerWidth : innerWidth / (chartDataBalance.length - 1);
        const barWidth = Math.max(4, periodSpan * 0.35);
        const barCenterX = x;
        const balanceRub = point.balanceRubCents / 100;
        const yZero = baselineY;
        const yBalance = valueToY(balanceRub);
        const barTop = Math.min(yZero, yBalance);
        const barBottom = Math.max(yZero, yBalance);
        const barHeight = Math.max(2, barBottom - barTop);
        return {
          x: barCenterX - barWidth / 2,
          y: barTop,
          width: barWidth,
          height: barHeight,
          balanceRubCents: point.balanceRubCents,
          balanceRub,
        };
      })
    : [];
  const periodMarks = buildPeriodMarks(
    chartData.map((d) => ({
      periodKey: d.periodKey,
      label:
        granularity === "week"
          ? (d.periodKey.match(/W(\d{2})$/)?.[1] ?? d.label)
          : d.label,
    })),
    width,
    padding
  );
  const chartDividers = useMemo(() => {
    if (chartData.length <= 1) return [];
    const divs: { x: number; type: "month" | "year" }[] = [];
    const n = chartData.length;
    for (let i = 1; i < n; i++) {
      const prev = getPeriodMonthYear(chartData[i - 1].periodKey, granularity);
      const curr = getPeriodMonthYear(chartData[i].periodKey, granularity);
      const progress = i / (n - 1);
      const x = padding.left + innerWidth * progress;
      if (curr.year !== prev.year) divs.push({ x, type: "year" });
      else if (curr.month !== prev.month) divs.push({ x, type: "month" });
    }
    return divs;
  }, [chartData, granularity, padding.left, innerWidth]);
  const hoverPoint = hoverIndex != null ? chartPoints[hoverIndex] : null;
  const hoverChartData = hoverIndex != null ? chartData[hoverIndex] : null;
  const hoverIncomeData = hoverIndex != null && isBoth ? chartDataIncome[hoverIndex] : null;
  const hoverExpenseData = hoverIndex != null && isBoth ? chartDataExpense[hoverIndex] : null;
  const hoverBalanceData = hoverIndex != null && isBoth ? chartDataBalance[hoverIndex] : null;

  useEffect(() => {
    if (!chartContainerReady || !chartRef.current) return;
    const el = chartRef.current;
    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      const nextWidth = Math.max(1, Math.round(rect.width));
      const nextHeight = Math.max(1, Math.round(rect.height));
      setChartSize((prev) =>
        prev.width === nextWidth && prev.height === nextHeight ? prev : { width: nextWidth, height: nextHeight }
      );
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(el);
    return () => observer.disconnect();
  }, [chartContainerReady]);

  useEffect(() => {
    if (!hoverPoint || !chartRef.current || !tooltipRef.current) {
      setTooltipLeft(null);
      return;
    }
    const containerWidth = chartRef.current.clientWidth;
    const tooltipWidth = tooltipRef.current.offsetWidth;
    const pad = 12;
    const clamped = Math.min(
      Math.max(hoverPoint.x, tooltipWidth / 2 + pad),
      containerWidth - tooltipWidth / 2 - pad
    );
    setTooltipLeft(clamped);
  }, [hoverPoint?.x, hoverIndex, chartSize.width]);

  const handleChartPointerMove = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      if (!svgRef.current || chartData.length === 0) return;
      if (chartData.length === 1) {
        setHoverIndex(0);
        return;
      }
      const ctm = svgRef.current.getScreenCTM();
      if (!ctm) return;
      let svgX = 0;
      if (typeof DOMPoint !== "undefined") {
        const pt = new DOMPoint(event.clientX, event.clientY);
        svgX = pt.matrixTransform(ctm.inverse()).x;
      } else {
        const pt = svgRef.current.createSVGPoint();
        pt.x = event.clientX;
        pt.y = event.clientY;
        svgX = pt.matrixTransform(ctm.inverse()).x;
      }
      const clampedX = Math.min(Math.max(svgX, padding.left), width - padding.right);
      const progress = (clampedX - padding.left) / innerWidth;
      const index = Math.round(progress * (chartData.length - 1));
      setHoverIndex(Math.min(Math.max(index, 0), chartData.length - 1));
    },
    [chartData.length, innerWidth, padding.left, padding.right, width]
  );

  const handleChartClick = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      if (!svgRef.current || chartData.length === 0) return;
      const ctm = svgRef.current.getScreenCTM();
      if (!ctm) return;
      let svgX = 0;
      if (typeof DOMPoint !== "undefined") {
        const pt = new DOMPoint(event.clientX, event.clientY);
        svgX = pt.matrixTransform(ctm.inverse()).x;
      } else {
        const pt = svgRef.current.createSVGPoint();
        pt.x = event.clientX;
        pt.y = event.clientY;
        svgX = pt.matrixTransform(ctm.inverse()).x;
      }
      const clampedX = Math.min(Math.max(svgX, padding.left), width - padding.right);
      const progress = (clampedX - padding.left) / innerWidth;
      const index = Math.round(progress * (chartData.length - 1));
      const safeIndex = Math.min(Math.max(index, 0), chartData.length - 1);
      const periodKey = chartData[safeIndex]?.periodKey;
      if (!periodKey) return;
      setClickedChartPeriodKeys((prev) => {
        if (prev.length === 0) return [periodKey];
        if (prev.length === 1) {
          if (prev[0] === periodKey) return prev;
          return [prev[0], periodKey];
        }
        return [periodKey];
      });
    },
    [chartData]
  );

  const markerPointsForClickedPeriods = useMemo(() => {
    if (clickedChartPeriodKeys.length === 0 || chartData.length === 0) return [];
    const points = isBoth ? chartPointsIncome : chartPoints;
    return clickedChartPeriodKeys
      .map((periodKey, i) => {
        const index = chartData.findIndex((p) => p.periodKey === periodKey);
        if (index === -1) return null;
        const pt = points[index];
        if (!pt) return null;
        return { periodKey, label: String(i + 1), x: pt.x, y: pt.y };
      })
      .filter((m): m is NonNullable<typeof m> => m != null);
  }, [clickedChartPeriodKeys, chartData, chartPointsIncome, chartPoints, isBoth]);

  const arrowFromFirstToSecond = useMemo(() => {
    if (markerPointsForClickedPeriods.length !== 2 || chartData.length === 0) return null;
    const [m1, m2] = markerPointsForClickedPeriods;
    const getValueRubCents = (periodKey: string) => {
      const p = chartData.find((d) => d.periodKey === periodKey);
      if (!p) return 0;
      return p.sumRubCents;
    };
    const value1 = getValueRubCents(m1.periodKey);
    const value2 = getValueRubCents(m2.periodKey);
    const growthRubCents = value2 - value1;
    const growthPercent = value1 !== 0 ? (growthRubCents / Math.abs(value1)) * 100 : null;
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
  }, [markerPointsForClickedPeriods, chartData]);

  const categoryById = useMemo(() => buildCategoryIndex(categoryNodes), [categoryNodes]);
  const categoryBreakdownIncome = useMemo(() => {
    if (clickedChartPeriodKeys.length === 0) return { rows: [] as CategoryRow[], totals: new Map<number, Record<string, number>>() };
    return buildCategoryBreakdownByPeriod(
      chartTxList,
      "INCOME",
      clickedChartPeriodKeys,
      granularity,
      itemsById,
      chartRatesByDate,
      categoryById
    );
  }, [
    clickedChartPeriodKeys,
    chartTxList,
    granularity,
    itemsById,
    chartRatesByDate,
    categoryById,
  ]);
  const categoryBreakdownExpense = useMemo(() => {
    if (clickedChartPeriodKeys.length === 0) return { rows: [] as CategoryRow[], totals: new Map<number, Record<string, number>>() };
    return buildCategoryBreakdownByPeriod(
      chartTxList,
      "EXPENSE",
      clickedChartPeriodKeys,
      granularity,
      itemsById,
      chartRatesByDate,
      categoryById
    );
  }, [
    clickedChartPeriodKeys,
    chartTxList,
    granularity,
    itemsById,
    chartRatesByDate,
    categoryById,
  ]);

  function formatChartRub(valueInCents: number) {
    return formatAmount(valueInCents);
  }

  const resolveItemEffectiveKind = useCallback(
    (item: ItemOut) => getEffectiveItemKind(item, item.current_value_rub),
    []
  );

  const toggleCategoryFilterSelection = useCallback((path: CategoryPathOption) => {
    const key = makeCategoryPathKey(path.l1, path.l2, path.l3);
    setSelectedCategoryFilterKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    triggerChartRefetch();
  }, [triggerChartRefetch]);

  const itemTxCounts = useMemo(
    () => buildItemTransactionCounts(chartTxList),
    [chartTxList]
  );
  const counterpartyTxCounts = useMemo(
    () => buildCounterpartyTransactionCounts(chartTxList),
    [chartTxList]
  );
  const selectableCounterparties = useMemo(
    () => counterparties.filter((cp) => !cp.deleted_at),
    [counterparties]
  );
  const currencyOptions = useMemo(() => {
    const set = new Set<string>();
    items.forEach((item) => {
      if (item.currency_code) set.add(item.currency_code);
    });
    return Array.from(set).sort();
  }, [items]);

  const chartColor = reportKind === "INCOME" ? GREEN : RED;

  return (
    <main className="min-h-screen px-8 py-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        {error && <div className="text-sm text-red-600">{error}</div>}

        <div className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="grid w-fit gap-2">
              <Label>Вид</Label>
              <SegmentedSelector
                className="w-fit"
                segmentWidth="auto"
                options={[
                  { value: "BOTH", label: "Доход и расход" },
                  { value: "INCOME", label: "Доход", colorScheme: "green" },
                  { value: "EXPENSE", label: "Расход", colorScheme: "red" },
                ]}
                value={reportKind}
                onChange={(value) => {
                  const v = typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;
                  if (v === "BOTH" || v === "INCOME" || v === "EXPENSE") setReportKind(v);
                }}
                multiple={false}
              />
            </div>
            <div className="grid w-fit gap-2">
              <Label style={{ color: ACTIVE_TEXT_DARK }} className="flex flex-wrap items-center gap-x-1.5 gap-y-0">
                <span>Период</span>
                <Tooltip
                  content="Д — День, Н — Неделя, М — Месяц, Г — Год"
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
                value={granularity}
                onChange={(value) => {
                  const v = typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;
                  if (v === "day" || v === "week" || v === "month" || v === "year") setGranularity(v);
                }}
                multiple={false}
              />
            </div>
            <div className="grid w-fit gap-2">
              <Label style={{ color: ACTIVE_TEXT_DARK }}>Прогноз</Label>
              <SegmentedSelector
                className="w-fit"
                segmentWidth="auto"
                options={[
                  { value: "off", label: "Без прогноза" },
                  { value: "on", label: "С прогнозом", colorScheme: "orange" },
                ]}
                value={showForecast ? "on" : "off"}
                onChange={(value) => {
                  const v = typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;
                  setShowForecast(v === "on");
                }}
                multiple={false}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="grid w-fit gap-2">
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
            <div className="grid w-fit gap-2">
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
                  min={rangeMinStartKey || undefined}
                  value={rangeStart}
                  onChange={(e) => {
                    const next = e.target.value;
                    setRangeStart(next);
                    if (rangeEnd && next && rangeEnd < next) setRangeEnd(next);
                  }}
                />
              )}
              {forecastPreset === "custom" && (
                <DateField
                  label="Диапазон до"
                  min={rangeStartKey || undefined}
                  value={rangeEnd}
                  onChange={(e) => setRangeEnd(e.target.value)}
                />
              )}
            </div>
          )}

          <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <FilterSection
              label="Активы/обязательства"
              onReset={() => {
                setSelectedItemIds(new Set());
                setItemFilterResetKey((k) => k + 1);
                triggerChartRefetch();
              }}
              showReset={selectedItemIds.size > 0}
            >
              <ItemSelector
                items={activeItems}
                selectedIds={Array.from(selectedItemIds)}
                onChange={(ids) => {
                  setSelectedItemIds(new Set(ids));
                  triggerChartRefetch();
                }}
                selectionMode="multi"
                placeholder="Начните вводить название"
                emptyMessage="Нет активов"
                noResultsMessage="Ничего не найдено"
                getItemTypeLabel={getItemTypeLabel}
                getItemKind={resolveItemEffectiveKind}
                getCounterpartyForItemId={getCounterpartyForItemId}
                apiBase={API_BASE}
                getBankLogoUrl={itemBankLogoUrl}
                getBankName={itemBankName}
                getItemBalance={getItemDisplayBalanceCents}
                itemCounts={itemTxCounts}
                resetSignal={itemFilterResetKey}
                ariaLabel="Активы/обязательства"
              />
            </FilterSection>
            <FilterSection
              label="Контрагенты"
              onReset={() => {
                setSelectedCounterpartyIds(new Set());
                triggerChartRefetch();
              }}
              showReset={selectedCounterpartyIds.size > 0}
            >
              <CounterpartySelector
                counterparties={selectableCounterparties}
                selectedIds={Array.from(selectedCounterpartyIds)}
                onChange={(ids) => {
                  setSelectedCounterpartyIds(new Set(ids));
                  triggerChartRefetch();
                }}
                selectionMode="multi"
                placeholder="Выберите"
                industries={[]}
                counterpartyCounts={counterpartyTxCounts}
                showChips={true}
                apiBase={API_BASE}
              />
            </FilterSection>
            <FilterSection
              label="Категории"
              onReset={() => {
                setSelectedCategoryFilterKeys(new Set());
                triggerChartRefetch();
              }}
              showReset={selectedCategoryFilterKeys.size > 0}
            >
              <CategorySelector
                categoryNodes={categoryNodes}
                selectedPathKeys={selectedCategoryFilterKeys}
                onTogglePath={toggleCategoryFilterSelection}
                selectionMode="multi"
                placeholder="Поиск категории"
                showChips={true}
              />
            </FilterSection>
          </div>

          <div
            className="relative mt-8 rounded-lg overflow-hidden border-0 outline-none px-6 pt-6 pb-6"
            style={{ backgroundColor: MODAL_BG }}
          >
            {chartMissingRates && (
              <div className="text-sm text-amber-600 mb-4">
                Для части транзакций не удалось получить курс валюты на дату операции.
              </div>
            )}

            {rangeStartKey && rangeEndKey && (
              <div className="flex flex-wrap items-start gap-6 mb-6">
                {isBoth ? (
                  <>
                    <div className="flex flex-col gap-2">
                      <div className="text-[14px] font-normal" style={{ color: PLACEHOLDER_COLOR_DARK }}>
                        за период{" "}
                        <span style={{ color: ACTIVE_TEXT_DARK }}>
                          {[rangeStartKey, rangeEndKey]
                            .map((k) => {
                              const [y, m, d] = k.split("-");
                              return `${d}.${m}.${y.slice(2)}`;
                            })
                            .join(" - ")}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-6">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[12px]" style={{ color: PLACEHOLDER_COLOR_DARK }}>
                            Доход
                          </span>
                          <span className="text-2xl font-semibold" style={{ color: GREEN }}>
                            {formatChartRub(chartTotalAndAverage.totalIncomeRubCents)}
                            {showForecast && (
                              <>
                                <span style={{ color: PLACEHOLDER_COLOR_DARK }}> / </span>
                                <span style={{ color: PLACEHOLDER_COLOR_DARK }}>
                                  {formatChartRub(chartTotalAndAverage.totalForecastIncomeRubCents)}
                                </span>
                              </>
                            )}
                          </span>
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[12px]" style={{ color: PLACEHOLDER_COLOR_DARK }}>
                            Расход
                          </span>
                          <span className="text-2xl font-semibold" style={{ color: RED }}>
                            {formatChartRub(chartTotalAndAverage.totalExpenseRubCents)}
                            {showForecast && (
                              <>
                                <span style={{ color: PLACEHOLDER_COLOR_DARK }}> / </span>
                                <span style={{ color: PLACEHOLDER_COLOR_DARK }}>
                                  {formatChartRub(chartTotalAndAverage.totalForecastExpenseRubCents)}
                                </span>
                              </>
                            )}
                          </span>
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[12px]" style={{ color: PLACEHOLDER_COLOR_DARK }}>
                            Остаток
                          </span>
                          <span className="text-2xl font-semibold" style={{ color: ACCENT }}>
                            {formatChartRub(chartTotalAndAverage.totalBalanceRubCents)}
                            {showForecast && (
                              <>
                                <span style={{ color: PLACEHOLDER_COLOR_DARK }}> / </span>
                                <span style={{ color: PLACEHOLDER_COLOR_DARK }}>
                                  {formatChartRub(chartTotalAndAverage.totalForecastBalanceRubCents)}
                                </span>
                              </>
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      {[
                        { label: "Max", value: chartTotalAndAverage.maxRubCents, forecastValue: chartTotalAndAverage.maxForecastRubCents },
                        { label: "Среднее", value: chartTotalAndAverage.averageRubCents, forecastValue: chartTotalAndAverage.averageForecastRubCents },
                        { label: "Min", value: chartTotalAndAverage.minRubCents, forecastValue: chartTotalAndAverage.minForecastRubCents },
                      ].map(({ label, value, forecastValue }) => (
                        <div key={label} className="flex items-center gap-2">
                          <span className="w-20 shrink-0 text-[14px] font-normal" style={{ color: PLACEHOLDER_COLOR_DARK }}>{label}</span>
                          <span className="min-w-[10rem] shrink-0 rounded-[9px] px-2 py-1 text-right text-[14px] font-normal tabular-nums" style={{ backgroundColor: BACKGROUND_DT, color: ACTIVE_TEXT_DARK }}>
                            {formatChartRub(value)}
                            {showForecast && (
                              <>
                                <span style={{ color: PLACEHOLDER_COLOR_DARK }}> / </span>
                                <span style={{ color: PLACEHOLDER_COLOR_DARK }}>{formatChartRub(forecastValue)}</span>
                              </>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex flex-col gap-1">
                      <div className="text-[48px] font-semibold leading-tight">
                        <span style={{ background: PINK_GRADIENT, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                          {formatChartRub(chartTotalAndAverage.totalRubCents)}
                        </span>
                        {showForecast && (
                          <>
                            <span style={{ color: PLACEHOLDER_COLOR_DARK }}> / </span>
                            <span style={{ color: PLACEHOLDER_COLOR_DARK }}>
                              {formatChartRub(chartTotalAndAverage.totalForecastRubCents)}
                            </span>
                          </>
                        )}
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
                        { label: "Max", value: chartTotalAndAverage.maxRubCents, forecastValue: chartTotalAndAverage.maxForecastRubCents },
                        { label: "Среднее", value: chartTotalAndAverage.averageRubCents, forecastValue: chartTotalAndAverage.averageForecastRubCents },
                        { label: "Min", value: chartTotalAndAverage.minRubCents, forecastValue: chartTotalAndAverage.minForecastRubCents },
                      ].map(({ label, value, forecastValue }) => (
                        <div key={label} className="flex items-center gap-2">
                          <span className="w-20 shrink-0 text-[14px] font-normal" style={{ color: PLACEHOLDER_COLOR_DARK }}>{label}</span>
                          <span className="min-w-[10rem] shrink-0 rounded-[9px] px-2 py-1 text-right text-[14px] font-normal tabular-nums" style={{ backgroundColor: BACKGROUND_DT, color: ACTIVE_TEXT_DARK }}>
                            {formatChartRub(value)}
                            {showForecast && (
                              <>
                                <span style={{ color: PLACEHOLDER_COLOR_DARK }}> / </span>
                                <span style={{ color: PLACEHOLDER_COLOR_DARK }}>{formatChartRub(forecastValue)}</span>
                              </>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="relative w-full py-6" style={{ opacity: chartDataLoading ? 0.6 : 1, transition: "opacity 0.2s" }}>
              {!rangeStartKey || !rangeEndKey ? (
                <div className="flex h-80 items-center justify-center text-sm text-muted-foreground">
                  Выберите период от и до для построения диаграммы.
                </div>
              ) : chartData.length === 0 && !chartDataLoading ? (
                <div className="flex h-80 items-center justify-center text-sm text-muted-foreground">
                  Нет данных за выбранный период.
                </div>
              ) : chartData.length > 0 ? (
                <div
                  ref={setChartRef}
                  className="relative w-full min-w-0"
                  style={{ aspectRatio: `${width}/${height}` }}
                >
                  {hoverPoint && hoverChartData && (
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
                        {granularity === "week"
                          ? formatWeekPeriodAsDateRange(hoverChartData.periodKey)
                          : hoverChartData.label}
                      </div>
                      {isBoth && hoverIncomeData != null && hoverExpenseData != null && hoverBalanceData != null ? (
                        <div className="flex flex-col gap-0.5 mt-1">
                          <div className="whitespace-nowrap" style={{ color: GREEN }}>
                            Доход: {formatChartRub(hoverIncomeData.sumRubCents)}
                          </div>
                          <div className="whitespace-nowrap" style={{ color: RED }}>
                            Расход: {formatChartRub(hoverExpenseData.sumRubCents)}
                          </div>
                          <div className="whitespace-nowrap" style={{ color: ACCENT }}>
                            Остаток: {formatChartRub(hoverBalanceData.balanceRubCents)}
                          </div>
                        </div>
                      ) : (
                        <div className="whitespace-nowrap" style={{ color: ACTIVE_TEXT_DARK }}>
                          {formatChartRub(hoverChartData.sumRubCents)}
                          {showForecast && hoverIndex != null && chartDataForecast[hoverIndex] != null && (
                            <>
                              <span style={{ color: PLACEHOLDER_COLOR_DARK }}> / </span>
                              <span style={{ color: PLACEHOLDER_COLOR_DARK }}>
                                {formatChartRub(chartDataForecast[hoverIndex].sumRubCents)}
                              </span>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  <svg
                    ref={svgRef}
                    viewBox={`0 0 ${width} ${height}`}
                    className="h-full w-full cursor-pointer"
                    role="img"
                    aria-label="График динамики доходов или расходов. Кликните для выбора периода."
                    onMouseMove={handleChartPointerMove}
                    onMouseLeave={() => setHoverIndex(null)}
                    onClick={handleChartClick}
                  >
                    <defs>
                      <marker id="arrowheadGreenIE" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                        <polygon points="0 0, 10 3.5, 0 7" fill={GREEN} />
                      </marker>
                      <marker id="arrowheadRedIE" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                        <polygon points="0 0, 10 3.5, 0 7" fill={RED} />
                      </marker>
                      <linearGradient id="incomeExpenseArea" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={chartColor} stopOpacity="0.35" />
                        <stop offset="100%" stopColor={chartColor} stopOpacity="0" />
                      </linearGradient>
                      <linearGradient id="incomeAreaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={GREEN} stopOpacity="0.35" />
                        <stop offset="100%" stopColor={GREEN} stopOpacity="0" />
                      </linearGradient>
                      <linearGradient id="expenseAreaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={RED} stopOpacity="0.35" />
                        <stop offset="100%" stopColor={RED} stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    {isBoth ? (
                      <>
                        {balanceBars.map((bar, idx) => (
                          <rect
                            key={`balance-${idx}`}
                            x={bar.x}
                            y={bar.y}
                            width={bar.width}
                            height={bar.height}
                            fill={ACCENT}
                            fillOpacity={0.6}
                            rx={2}
                          />
                        ))}
                        {chartAreaPathIncome && <path d={chartAreaPathIncome} fill="url(#incomeAreaGrad)" />}
                        {chartAreaPathExpense && <path d={chartAreaPathExpense} fill="url(#expenseAreaGrad)" />}
                        {chartLinePathIncome && (
                          <path d={chartLinePathIncome} fill="none" stroke={GREEN} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                        )}
                        {chartLinePathExpense && (
                          <path d={chartLinePathExpense} fill="none" stroke={RED} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                        )}
                        {chartLinePathForecastIncome && (
                          <path d={chartLinePathForecastIncome} fill="none" stroke={GREEN} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="8 6" />
                        )}
                        {chartLinePathForecastExpense && (
                          <path d={chartLinePathForecastExpense} fill="none" stroke={RED} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="8 6" />
                        )}
                      </>
                    ) : (
                      <>
                        {chartAreaPath && <path d={chartAreaPath} fill="url(#incomeExpenseArea)" />}
                        {chartLinePath && (
                          <path d={chartLinePath} fill="none" stroke={chartColor} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                        )}
                        {chartLinePathForecast && (
                          <path d={chartLinePathForecast} fill="none" stroke={chartColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="8 6" />
                        )}
                      </>
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
                    {chartMin < 0 && isBoth && (
                      <line x1={padding.left} x2={width - padding.right} y1={baselineY} y2={baselineY} stroke={PLACEHOLDER_COLOR_DARK} strokeWidth="1" strokeDasharray="4 4" strokeOpacity="0.7" />
                    )}
                    {arrowFromFirstToSecond && (() => {
                      const { x1, y1, x2, y2, midX, growthRubCents, growthPercent } = arrowFromFirstToSecond;
                      const inset = 14;
                      const yTop = padding.top + 8;
                      const pathD = `M ${x1} ${y1 + inset} L ${x1} ${yTop} L ${x2} ${yTop} L ${x2} ${y2 - inset}`;
                      const positiveIsGood = reportKind === "INCOME";
                      const arrowColor = (growthRubCents >= 0) === positiveIsGood ? GREEN : RED;
                      const markerEnd = (growthRubCents >= 0) === positiveIsGood ? "url(#arrowheadGreenIE)" : "url(#arrowheadRedIE)";
                      return (
                        <g>
                          <path d={pathD} fill="none" stroke={arrowColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" markerEnd={markerEnd} />
                          <text x={midX} y={yTop - 10} textAnchor="middle" fontSize="11" fontWeight={500} fill={arrowColor}>
                            {formatSignedValue(growthRubCents, (v) => formatRub(v))}  ({formatGrowthPercent(growthPercent)})
                          </text>
                        </g>
                      );
                    })()}
                    {markerPointsForClickedPeriods.map((m) => (
                      <g key={m.periodKey}>
                        <line x1={m.x} x2={m.x} y1={padding.top} y2={padding.top + innerHeight} stroke={PLACEHOLDER_COLOR_DARK} strokeDasharray="4 6" strokeOpacity={0.7} />
                        <rect x={m.x - 12} y={m.y - 12} width={24} height={24} rx={9} ry={9} fill={ACCENT2} />
                        <text x={m.x} y={m.y} textAnchor="middle" dominantBaseline="central" fontSize="12" fontWeight={600} fill={ACTIVE_TEXT_DARK}>{m.label}</text>
                      </g>
                    ))}
                    {hoverPoint && (
                      <>
                        <line x1={hoverPoint.x} x2={hoverPoint.x} y1={padding.top} y2={padding.top + innerHeight} stroke="#CFC5FF" strokeDasharray="4 6" />
                        {isBoth && hoverIndex != null ? (
                          <>
                            {chartPointsIncome[hoverIndex] && (
                              <circle cx={chartPointsIncome[hoverIndex].x} cy={chartPointsIncome[hoverIndex].y} r="5" fill={GREEN} stroke="#fff" strokeWidth="2" />
                            )}
                            {chartPointsExpense[hoverIndex] && (
                              <circle cx={chartPointsExpense[hoverIndex].x} cy={chartPointsExpense[hoverIndex].y} r="5" fill={RED} stroke="#fff" strokeWidth="2" />
                            )}
                          </>
                        ) : (
                          <circle cx={hoverPoint.x} cy={hoverPoint.y} r="6" fill={chartColor} stroke="#fff" strokeWidth="2" />
                        )}
                      </>
                    )}
                    {periodMarks.map((mark, idx) => (
                      <text
                        key={`${mark.label}-${idx}`}
                        x={mark.x}
                        y={height - 12}
                        textAnchor={idx === 0 ? "start" : idx === periodMarks.length - 1 ? "end" : "middle"}
                        fontSize="14"
                        fontWeight={400}
                        fill={ACTIVE_TEXT_DARK}
                      >
                        {mark.label}
                      </text>
                    ))}
                  </svg>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {clickedChartPeriodKeys.length >= 1 && (reportKind === "BOTH" || reportKind === "INCOME" || reportKind === "EXPENSE") && (
          <CategoryBreakdownTable
            reportKind={reportKind}
            clickedPeriodKeys={clickedChartPeriodKeys}
            chartPeriodPoints={chartPeriodPoints}
            granularity={granularity}
            categoryBreakdownIncome={categoryBreakdownIncome}
            categoryBreakdownExpense={categoryBreakdownExpense}
            chartTxList={chartTxList}
            itemsById={itemsById}
            counterparties={counterparties}
            chartRatesByDate={chartRatesByDate}
            categoryById={categoryById}
            categoryLookup={categoryLookup}
            categoryDescendantsMap={categoryDescendantsMap}
            expandedCategoryId={expandedCategoryId}
            setExpandedCategoryId={setExpandedCategoryId}
            onClose={() => setClickedChartPeriodKeys([])}
            formatPeriodLabel={(pk) => {
              const p = chartPeriodPoints.find((pt) => pt.periodKey === pk);
              if (p) return granularity === "week" ? formatWeekPeriodAsDateRange(pk) : p.label;
              return granularity === "week" ? formatWeekPeriodAsDateRange(pk) : pk;
            }}
          />
        )}
      </div>
    </main>
  );
}
