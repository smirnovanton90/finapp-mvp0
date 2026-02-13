"use client";

import {
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
import { ChipChoice } from "@/components/ui/chip-choice";
import { DateField, FormField, SelectField } from "@/components/ui/form-field";
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
import { GREEN, RED } from "@/lib/colors";
import {
  getPeriodKey,
  getPeriodPresetRange,
  listPeriodsInRange,
  PeriodPresetKey,
  ReportPeriodGranularity,
  toDateKey,
} from "@/lib/report-period-utils";
import { cn } from "@/lib/utils";
import { formatAmount, getEffectiveItemKind } from "@/lib/item-utils";
import { getItemTypeLabel } from "@/lib/item-types";
import { buildItemTransactionCounts } from "@/lib/item-utils";
import { buildCounterpartyTransactionCounts } from "@/lib/counterparty-utils";

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
  return `${formatAmount(valueInCents)} RUB`;
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
  if (!currencyCode || currencyCode === "RUB") return tx.amount_rub;
  const dateKey = toTxDateKey(tx.transaction_date);
  if (!dateKey) return null;
  const rates = ratesByDate[dateKey];
  if (!rates) return null;
  const rate = rates.find((rate) => rate.char_code === currencyCode)?.rate ?? null;
  if (!rate) return null;
  return Math.round((tx.amount_rub / 100) * rate * 100);
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
  l1IconById,
}: {
  sectionId: string;
  title: string;
  rows: CategoryRow[];
  totals: Map<number, Record<string, number>>;
  monthKeys: string[];
  emptyLabel: string;
  accent: string;
  l1IconById: Map<number, string>;
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
          const iconName = row.level === 1 ? l1IconById.get(row.l1Id) : null;
          const CategoryIcon =
            row.level === 1
              ? (iconName ? CATEGORY_ICON_BY_NAME[iconName] : undefined) ??
                CATEGORY_ICON_FALLBACK
              : null;
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
                    <button
                      type="button"
                      onClick={() =>
                        row.level === 1 ? toggleL1(row.l1Id) : toggleL2(l2Key)
                      }
                      className="inline-flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                      aria-label={
                        isExpanded ? "Свернуть подкатегории" : "Развернуть подкатегории"
                      }
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>
                  ) : (
                    <span className="inline-flex h-5 w-5" aria-hidden="true" />
                  )}
                  {CategoryIcon ? (
                    <CategoryIcon className="h-4 w-4 text-muted-foreground" />
                  ) : null}
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
  l1IconById,
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
  l1IconById: Map<number, string>;
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
                    l1IconById={l1IconById}
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
  const [reportKind, setReportKind] = useState<"INCOME" | "EXPENSE">("EXPENSE");
  const [periodPreset, setPeriodPreset] = useState<PeriodPresetKey>("last_month");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [granularity, setGranularity] = useState<ReportPeriodGranularity>("month");
  const [showForecast, setShowForecast] = useState(false);

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
  const [chartSize, setChartSize] = useState({ width: 720, height: 280 });

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

  // Sync range dates when period preset changes (or accounting start becomes available)
  useEffect(() => {
    if (periodPreset === "custom") return;
    const { start, end } = getPeriodPresetRange(periodPreset, accountingStartDate ?? null);
    setRangeStart(start);
    setRangeEnd(end);
  }, [periodPreset, accountingStartDate]);

  const itemsById = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items]
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
  const rangeStartKey = useMemo(() => {
    if (!rangeStart) return rangeMinStartKey || "";
    if (rangeMinStartKey && rangeStart < rangeMinStartKey) return rangeMinStartKey;
    return rangeStart;
  }, [rangeMinStartKey, rangeStart]);
  const rangeEndKey = useMemo(() => {
    if (!rangeEnd) return "";
    return rangeEnd < rangeStartKey ? rangeStartKey : rangeEnd;
  }, [rangeEnd, rangeStartKey]);

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
      direction: [reportKind] as TransactionOut["direction"][],
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
      let rubCents = tx.amount_rub;
      if (code !== "RUB") {
        const rates = chartRatesByDate[dateKey];
        const rate = rates?.find((r) => r.char_code === code)?.rate;
        if (rate == null) return 0;
        rubCents = Math.round((tx.amount_rub / 100) * rate * 100);
      }
      return Math.abs(rubCents);
    },
    [itemsById, chartRatesByDate]
  );

  const chartSumsByPeriod = useMemo(() => {
    const map = new Map<string, number>();
    chartPeriodPoints.forEach((p) => map.set(p.periodKey, 0));
    chartTxList.forEach((tx) => {
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

  const chartSumsByPeriodForecast = useMemo(() => {
    if (!showForecast) return new Map<string, number>();
    const map = new Map<string, number>();
    chartPeriodPoints.forEach((p) => map.set(p.periodKey, 0));
    chartTxList.forEach((tx) => {
      const dateKey = toTxDateKey(tx.transaction_date);
      if (!dateKey) return;
      const periodKey = getPeriodKey(dateKey, granularity);
      if (!map.has(periodKey)) return;
      const cents = sumTxToRubCents(tx);
      if (cents > 0) map.set(periodKey, (map.get(periodKey) ?? 0) + cents);
    });
    return map;
  }, [chartTxList, chartPeriodPoints, granularity, showForecast, sumTxToRubCents]);

  const chartData = useMemo(() => {
    return chartPeriodPoints.map((p) => ({
      periodKey: p.periodKey,
      label: p.label,
      sumRubCents: chartSumsByPeriod.get(p.periodKey) ?? 0,
    }));
  }, [chartPeriodPoints, chartSumsByPeriod]);

  const chartDataForecast = useMemo(() => {
    if (!showForecast) return [];
    return chartPeriodPoints.map((p) => ({
      periodKey: p.periodKey,
      label: p.label,
      sumRubCents: chartSumsByPeriodForecast.get(p.periodKey) ?? 0,
    }));
  }, [chartPeriodPoints, chartSumsByPeriodForecast, showForecast]);

  const chartTotalAndAverage = useMemo(() => {
    const totalRubCents = chartData.reduce((s, d) => s + d.sumRubCents, 0);
    // Текущий (незавершённый) период — последний в списке; не включаем его в расчёт среднего
    const completedCount = Math.max(0, chartData.length - 1);
    const lastPeriodCents = chartData.length > 0 ? chartData[chartData.length - 1].sumRubCents : 0;
    const sumCompletedOnly = totalRubCents - lastPeriodCents;
    const averageRubCents = completedCount > 0 ? sumCompletedOnly / completedCount : 0;
    return { totalRubCents, averageRubCents };
  }, [chartData]);

  const width = chartSize.width;
  const height = chartSize.height;
  const padding = { top: 24, right: 0, bottom: 44, left: 52 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const chartValues = chartData.map((d) => d.sumRubCents / 100);
  const forecastValues = chartDataForecast.map((d) => d.sumRubCents / 100);
  const allValues = showForecast && forecastValues.length ? [...chartValues, ...forecastValues] : chartValues;
  const maxChartVal = allValues.length ? Math.max(...allValues, 0) : 0;
  const rangePadding = Math.max(maxChartVal * 0.12, 1);
  const paddedMax = maxChartVal + rangePadding;
  const chartTicks = buildChartTicks(0, paddedMax);
  const chartMin = 0;
  const chartMax = chartTicks[chartTicks.length - 1] ?? paddedMax;
  const todayPeriodKey = getPeriodKey(toDateKey(new Date()), granularity);
  const actualLastIndex = (() => {
    for (let i = chartData.length - 1; i >= 0; i--) {
      if (chartData[i].periodKey <= todayPeriodKey) return i;
    }
    return -1;
  })();
  const chartPoints: ChartPoint[] = chartData.map((point, index) => {
    const progress = chartData.length <= 1 ? 0 : index / (chartData.length - 1);
    const x = padding.left + innerWidth * progress;
    const value = point.sumRubCents / 100;
    const valueRatio = (value - chartMin) / (chartMax - chartMin || 1);
    const y = padding.top + innerHeight - innerHeight * valueRatio;
    return { x, y, value };
  });
  const chartPointsActualOnly = actualLastIndex >= 0 ? chartPoints.slice(0, actualLastIndex + 1) : [];
  const chartPointsForecast: ChartPoint[] = chartDataForecast.map((point, index) => {
    const progress = chartDataForecast.length <= 1 ? 0 : index / (chartDataForecast.length - 1);
    const x = padding.left + innerWidth * progress;
    const value = point.sumRubCents / 100;
    const valueRatio = (value - chartMin) / (chartMax - chartMin || 1);
    const y = padding.top + innerHeight - innerHeight * valueRatio;
    return { x, y, value };
  });
  const baselineValue = chartMin;
  const baselineRatio = (baselineValue - chartMin) / (chartMax - chartMin || 1);
  const baselineY = padding.top + innerHeight - innerHeight * baselineRatio;
  const chartLinePath = buildLinePath(chartPointsActualOnly);
  const chartLinePathForecast = chartPointsForecast.length > 0 ? buildLinePath(chartPointsForecast) : null;
  const chartAreaPath = buildAreaPath(chartPointsActualOnly, baselineY);
  const periodMarks = buildPeriodMarks(
    chartData.map((d) => ({ periodKey: d.periodKey, label: d.label })),
    width,
    padding
  );
  const hoverPoint = hoverIndex != null ? chartPoints[hoverIndex] : null;
  const hoverChartData = hoverIndex != null ? chartData[hoverIndex] : null;

  useEffect(() => {
    if (!chartRef.current) return;
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
  }, []);

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

  function formatChartRub(valueInCents: number) {
    return new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency: "RUB",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(valueInCents / 100);
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
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            Динамика по периодам
          </h1>
          <p className="text-sm text-muted-foreground">
            Диаграмма сумм доходов или расходов по выбранным периодам.
          </p>
        </div>

        {error && <div className="text-sm text-red-600">{error}</div>}

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Вид</Label>
              <SegmentedSelector
                options={[
                  { value: "INCOME", label: "Доход", colorScheme: "green" },
                  { value: "EXPENSE", label: "Расход", colorScheme: "red" },
                ]}
                value={[reportKind]}
                onChange={(value) => {
                  const v = Array.isArray(value) ? value[0] : value;
                  if (v === "INCOME" || v === "EXPENSE") setReportKind(v);
                }}
                multiple={false}
              />
            </div>
            <SelectField
              label="Период отчёта"
              value={granularity}
              onValueChange={(v) => setGranularity(v as ReportPeriodGranularity)}
              options={[
                { value: "day", label: "День" },
                { value: "week", label: "Неделя" },
                { value: "month", label: "Месяц" },
                { value: "year", label: "Год" },
              ]}
              placeholder="Период"
            />
          </div>

          {periodPreset === "custom" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <DateField
                label="Период от"
                min={rangeMinStartKey || undefined}
                value={rangeStart}
                onChange={(e) => {
                  const next = e.target.value;
                  setRangeStart(next);
                  if (rangeEnd && next && rangeEnd < next) setRangeEnd(next);
                }}
              />
              <DateField
                label="Период до"
                min={rangeStartKey || undefined}
                value={rangeEnd}
                onChange={(e) => setRangeEnd(e.target.value)}
              />
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <FormField label="Активы/обязательства">
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
                getItemBalance={(item) => item.current_value_rub}
                itemCounts={itemTxCounts}
                resetSignal={itemFilterResetKey}
                ariaLabel="Активы/обязательства"
              />
            </FormField>
            <FormField label="Контрагенты">
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
            </FormField>
            <FormField label="Категории">
              <CategorySelector
                categoryNodes={categoryNodes}
                selectedPathKeys={selectedCategoryFilterKeys}
                onTogglePath={toggleCategoryFilterSelection}
                selectionMode="multi"
                placeholder="Поиск категории"
                showChips={true}
              />
            </FormField>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <ChipChoice
              options={[
                { value: "all", label: "За все время" },
                { value: "last_month", label: "Последний месяц" },
                { value: "last_quarter", label: "Последний квартал" },
                { value: "last_year", label: "Последний год" },
                { value: "custom", label: "Произвольный период" },
              ]}
              value={periodPreset}
              onChange={(v) => setPeriodPreset(v as PeriodPresetKey)}
            />
            <ChipChoice
              options={[
                { value: "off", label: "Без прогноза" },
                { value: "on", label: "Прогноз" },
              ]}
              value={showForecast ? "on" : "off"}
              onChange={(v) => setShowForecast(v === "on")}
            />
          </div>

          {chartMissingRates && (
            <div className="text-sm text-amber-600">
              Для части транзакций не удалось получить курс валюты на дату операции.
            </div>
          )}

          {rangeStartKey && rangeEndKey && (
            <div className="flex flex-wrap items-baseline gap-6 text-sm">
              <div>
                <span className="text-muted-foreground">Общая сумма за период: </span>
                <span className="font-medium">
                  {formatChartRub(chartTotalAndAverage.totalRubCents)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Средняя величина за период: </span>
                <span className="font-medium">
                  {formatChartRub(chartTotalAndAverage.averageRubCents)}
                </span>
              </div>
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
                  ref={chartRef}
                  className="relative w-full min-w-0"
                  style={{ aspectRatio: `${width}/${height}` }}
                >
                  {hoverPoint && hoverChartData && (
                    <div
                      ref={tooltipRef}
                      className="pointer-events-none absolute z-20 max-w-xs rounded-2xl px-4 py-3 text-white shadow-lg"
                      style={{
                        left: tooltipLeft != null ? `${tooltipLeft}px` : `${hoverPoint.x}px`,
                        top: `${(hoverPoint.y / height) * 100}%`,
                        transform: "translate(-50%, -120%)",
                        backgroundColor: chartColor,
                      }}
                    >
                      <div className="text-xs opacity-90">{hoverChartData.label}</div>
                      <div className="text-sm font-semibold">
                        {formatChartRub(hoverChartData.sumRubCents)}
                      </div>
                    </div>
                  )}
                  <svg
                    ref={svgRef}
                    viewBox={`0 0 ${width} ${height}`}
                    className="h-full w-full"
                    role="img"
                    aria-label="График динамики доходов или расходов"
                    onMouseMove={handleChartPointerMove}
                    onMouseLeave={() => setHoverIndex(null)}
                  >
                    <defs>
                      <linearGradient id="incomeExpenseArea" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={chartColor} stopOpacity="0.35" />
                        <stop offset="100%" stopColor={chartColor} stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    {chartAreaPath && <path d={chartAreaPath} fill="url(#incomeExpenseArea)" />}
                    {chartLinePath && (
                      <path
                        d={chartLinePath}
                        fill="none"
                        stroke={chartColor}
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    )}
                    {chartLinePathForecast && (
                      <path
                        d={chartLinePathForecast}
                        fill="none"
                        stroke={chartColor}
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeDasharray="8 6"
                      />
                    )}
                    {hoverPoint && (
                      <>
                        <line
                          x1={hoverPoint.x}
                          x2={hoverPoint.x}
                          y1={padding.top}
                          y2={padding.top + innerHeight}
                          stroke="#CFC5FF"
                          strokeDasharray="4 6"
                        />
                        <circle
                          cx={hoverPoint.x}
                          cy={hoverPoint.y}
                          r="6"
                          fill={chartColor}
                          stroke="#fff"
                          strokeWidth="2"
                        />
                      </>
                    )}
                    {periodMarks.map((mark, idx) => (
                      <text
                        key={`${mark.label}-${idx}`}
                        x={mark.x}
                        y={height - 12}
                        textAnchor={idx === 0 ? "start" : idx === periodMarks.length - 1 ? "end" : "middle"}
                        fontSize="12"
                        fill="#6F67B3"
                        fontWeight={500}
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
    </main>
  );
}
