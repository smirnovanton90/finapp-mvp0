"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { ChevronDown, ChevronRight } from "lucide-react";

import {
  fetchCategories,
  fetchFxRates,
  fetchItems,
  fetchTransactions,
  FxRateOut,
  ItemOut,
  TransactionOut,
} from "@/lib/api";
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
import { CATEGORY_ICON_BY_NAME, CATEGORY_ICON_FALLBACK } from "@/lib/category-icons";
import { CategoryNode } from "@/lib/categories";
import { cn } from "@/lib/utils";

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
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valueInCents / 100);
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
                    className="text-right tabular-nums text-foreground"
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
                        className="text-right tabular-nums font-semibold text-foreground"
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

export default function IncomeExpenseDynamicsPage() {
  const { data: session } = useSession();
  const [items, setItems] = useState<ItemOut[]>([]);
  const [transactions, setTransactions] = useState<TransactionOut[]>([]);
  const [fxRatesByDate, setFxRatesByDate] = useState<Record<string, FxRateOut[]>>(
    {}
  );
  const [categoryNodes, setCategoryNodes] = useState<CategoryNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

useEffect(() => {
  if (!session) return;
  let active = true;
  setLoading(true);
  setError(null);

  Promise.all([fetchItems(), fetchTransactions(), fetchCategories()])
    .then(([itemsData, txData, categoryData]) => {
      if (!active) return;
      setItems(itemsData);
      setTransactions(txData);
      setCategoryNodes(categoryData);
    })
      .catch((e: any) => {
        if (!active) return;
        setError(
          e?.message ??
            "Не удалось загрузить транзакции и справочник активов."
        );
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
  const categoryIndex = useMemo(
    () => buildCategoryIndex(categoryNodes),
    [categoryNodes]
  );
  const l1IconById = useMemo(() => {
    const map = new Map<number, string>();
    categoryNodes.forEach((node) => {
      if (node.icon_name) map.set(node.id, node.icon_name);
    });
    return map;
  }, [categoryNodes]);

  const actualTxs = useMemo(
    () =>
      transactions.filter(
        (tx) =>
          tx.transaction_type === "ACTUAL" &&
          (tx.direction === "INCOME" || tx.direction === "EXPENSE")
      ),
    [transactions]
  );

  const incomeTxs = useMemo(
    () => actualTxs.filter((tx) => tx.direction === "INCOME"),
    [actualTxs]
  );
  const expenseTxs = useMemo(
    () => actualTxs.filter((tx) => tx.direction === "EXPENSE"),
    [actualTxs]
  );
  const allMonthKeys = useMemo(() => {
    const months = new Set<string>();
    actualTxs.forEach((tx) => {
      const dateKey = toTxDateKey(tx.transaction_date);
      if (dateKey) months.add(toMonthKey(dateKey));
    });
    return Array.from(months).sort();
  }, [actualTxs]);

  useEffect(() => {
    if (actualTxs.length === 0) return;
    const missingDates = new Set<string>();

    actualTxs.forEach((tx) => {
      const currencyCode =
        itemsById.get(tx.primary_item_id)?.currency_code ?? "RUB";
      if (currencyCode === "RUB") return;
      const dateKey = toTxDateKey(tx.transaction_date);
      if (!dateKey) return;
      if (!fxRatesByDate[dateKey]) {
        missingDates.add(dateKey);
      }
    });

    if (missingDates.size === 0) return;

    let cancelled = false;
    setRatesLoading(true);
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

      setFxRatesByDate((prev) => {
        const next = { ...prev };
        entries.forEach(([dateKey, rates]) => {
          if (rates && rates.length) next[dateKey] = rates;
        });
        return next;
      });
      setRatesLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [actualTxs, fxRatesByDate, itemsById]);

const incomeMatrix = useMemo(
  () =>
    buildCategoryMatrix(incomeTxs, itemsById, fxRatesByDate, categoryIndex, allMonthKeys),
  [incomeTxs, itemsById, fxRatesByDate, categoryIndex, allMonthKeys]
);

const expenseMatrix = useMemo(
  () =>
    buildCategoryMatrix(
      expenseTxs,
      itemsById,
      fxRatesByDate,
      categoryIndex,
      allMonthKeys
    ),
  [expenseTxs, itemsById, fxRatesByDate, categoryIndex, allMonthKeys]
);

  const incomeTotals = useMemo(
    () =>
      buildSummaryTotals(
        incomeMatrix.rows,
        incomeMatrix.totals,
        incomeMatrix.monthKeys
      ),
    [incomeMatrix.rows, incomeMatrix.totals, incomeMatrix.monthKeys]
  );

  const expenseTotals = useMemo(
    () =>
      buildSummaryTotals(
        expenseMatrix.rows,
        expenseMatrix.totals,
        expenseMatrix.monthKeys
      ),
    [expenseMatrix.rows, expenseMatrix.totals, expenseMatrix.monthKeys]
  );

  const saldoTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    allMonthKeys.forEach((monthKey) => {
      totals[monthKey] = (incomeTotals[monthKey] ?? 0) + (expenseTotals[monthKey] ?? 0);
    });
    return totals;
  }, [allMonthKeys, incomeTotals, expenseTotals]);

  const showMissingRates =
    incomeMatrix.hasMissingRates || expenseMatrix.hasMissingRates;

  return (
    <main className="min-h-screen bg-background px-8 py-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            Динамика доходов и расходов по категориям
          </h1>
          <p className="text-sm text-muted-foreground">
            Свод по фактическим транзакциям с пересчетом в рубли по курсу даты
            операции.
          </p>
        </div>

        {loading && (
          <div className="text-sm text-muted-foreground">
            Загружаем транзакции...
          </div>
        )}

        {!loading && error && <div className="text-sm text-red-600">{error}</div>}

        {!loading && !error && ratesLoading && (
          <div className="text-sm text-muted-foreground">
            Загружаем валютные курсы...
          </div>
        )}

        {!loading && !error && showMissingRates && !ratesLoading && (
          <div className="text-sm text-amber-600">
            Для части транзакций не удалось получить курс валюты на дату операции.
          </div>
        )}

        {!loading && !error && (
          <div className="space-y-6">
            <CategoryTable
              title="Доходы и расходы"
              monthKeys={allMonthKeys}
              sections={[
                {
                  id: "income",
                  title: "Доходы",
                  rows: incomeMatrix.rows,
                  totals: incomeMatrix.totals,
                  emptyLabel: "Пока нет фактических доходов.",
                  accent: "text-emerald-700",
                },
                {
                  id: "expense",
                  title: "Расходы",
                  rows: expenseMatrix.rows,
                  totals: expenseMatrix.totals,
                  emptyLabel: "Пока нет фактических расходов.",
                  accent: "text-rose-700",
                },
              ]}
              emptyLabel="Пока нет фактических доходов и расходов."
              summaryLabel="Итого"
              summaryTotals={saldoTotals}
              l1IconById={l1IconById}
            />
          </div>
        )}
      </div>
    </main>
  );
}
