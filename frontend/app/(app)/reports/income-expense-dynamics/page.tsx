"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { ChevronDown, ChevronRight } from "lucide-react";

import {
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
import { cn } from "@/lib/utils";

type CategoryRow = {
  id: string;
  label: string;
  level: 1 | 2 | 3;
  l1: string;
  l2?: string;
  l3?: string;
};

type CategoryMatrix = {
  rows: CategoryRow[];
  monthKeys: string[];
  totals: Map<string, Record<string, number>>;
  hasMissingRates: boolean;
};

const MISSING_L2_LABEL = "Без категории";

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

function normalizeCategory(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function toCbrDate(value: string) {
  const parts = value.split("-");
  if (parts.length === 3) {
    const [year, month, day] = parts;
    if (year && month && day) return `${day}/${month}/${year}`;
  }
  return value;
}

function buildCategoryRows(txs: TransactionOut[]) {
  const tree = new Map<string, Map<string, Set<string>>>();

  txs.forEach((tx) => {
    const l1 = normalizeCategory(tx.category_l1);
    if (!l1) return;
    const l2 = normalizeCategory(tx.category_l2);
    const l3 = normalizeCategory(tx.category_l3);

    if (!tree.has(l1)) tree.set(l1, new Map());
    const l2Map = tree.get(l1)!;

    if (l2) {
      if (!l2Map.has(l2)) l2Map.set(l2, new Set());
      if (l3) l2Map.get(l2)?.add(l3);
      return;
    }

    if (l3) {
      if (!l2Map.has(MISSING_L2_LABEL)) l2Map.set(MISSING_L2_LABEL, new Set());
      l2Map.get(MISSING_L2_LABEL)?.add(l3);
    }
  });

  const rows: CategoryRow[] = [];
  const l1Keys = Array.from(tree.keys()).sort((a, b) => a.localeCompare(b, "ru"));
  l1Keys.forEach((l1) => {
    rows.push({ id: `l1:${l1}`, label: l1, level: 1, l1 });

    const l2Map = tree.get(l1)!;
    const l2Keys = Array.from(l2Map.keys()).sort((a, b) =>
      a.localeCompare(b, "ru")
    );
    l2Keys.forEach((l2) => {
      rows.push({ id: `l1:${l1}|l2:${l2}`, label: l2, level: 2, l1, l2 });

      const l3Set = l2Map.get(l2)!;
      const l3Keys = Array.from(l3Set).sort((a, b) => a.localeCompare(b, "ru"));
      l3Keys.forEach((l3) => {
        rows.push({
          id: `l1:${l1}|l2:${l2}|l3:${l3}`,
          label: l3,
          level: 3,
          l1,
          l2,
          l3,
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
  monthKeysOverride?: string[]
): CategoryMatrix {
  const rows = buildCategoryRows(txs);
  const totals = new Map<string, Record<string, number>>();
  rows.forEach((row) => totals.set(row.id, {}));

  const monthSet = new Set<string>();
  let hasMissingRates = false;

  const addValue = (rowId: string, monthKey: string, value: number) => {
    const rowTotals = totals.get(rowId);
    if (!rowTotals) return;
    rowTotals[monthKey] = (rowTotals[monthKey] ?? 0) + value;
  };

  txs.forEach((tx) => {
    const l1 = normalizeCategory(tx.category_l1);
    if (!l1) return;
    const l2 = normalizeCategory(tx.category_l2);
    const l3 = normalizeCategory(tx.category_l3);
    if (!tx.transaction_date) return;

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
    addValue(`l1:${l1}`, monthKey, value);
    if (l2) {
      addValue(`l1:${l1}|l2:${l2}`, monthKey, value);
      if (l3) addValue(`l1:${l1}|l2:${l2}|l3:${l3}`, monthKey, value);
      return;
    }

    if (l3) {
      addValue(`l1:${l1}|l2:${MISSING_L2_LABEL}`, monthKey, value);
      addValue(`l1:${l1}|l2:${MISSING_L2_LABEL}|l3:${l3}`, monthKey, value);
    }
  });

  const monthKeys = monthKeysOverride ?? Array.from(monthSet).sort();
  return { rows, monthKeys, totals, hasMissingRates };
}

function buildSummaryTotals(
  rows: CategoryRow[],
  totals: Map<string, Record<string, number>>,
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
    () => Array.from(new Set(rows.filter((row) => row.level === 1).map((row) => row.l1))),
    [rows]
  );
  const l2Keys = useMemo(
    () =>
      Array.from(
        new Set(
          rows
            .filter((row) => row.level === 2)
            .map((row) => `${row.l1}::${row.l2 ?? ""}`)
        )
      ),
    [rows]
  );
  const l1HasChildren = useMemo(
    () => new Set(rows.filter((row) => row.level === 2).map((row) => row.l1)),
    [rows]
  );
  const l2HasChildren = useMemo(
    () =>
      new Set(
        rows
          .filter((row) => row.level === 3)
          .map((row) => `${row.l1}::${row.l2 ?? ""}`)
      ),
    [rows]
  );

  const initializedRef = useRef(false);
  const [expandedL1, setExpandedL1] = useState<Set<string>>(() => new Set());
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

  const toggleL1 = (key: string) => {
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
    if (!expandedL1.has(row.l1)) return false;
    if (row.level === 2) return true;
    const key = `${row.l1}::${row.l2 ?? ""}`;
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
}: {
  sectionId: string;
  title: string;
  rows: CategoryRow[];
  totals: Map<string, Record<string, number>>;
  monthKeys: string[];
  emptyLabel: string;
  accent: string;
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
          const l2Key = `${row.l1}::${row.l2 ?? ""}`;
          const hasChildren =
            row.level === 1
              ? l1HasChildren.has(row.l1)
              : row.level === 2
                ? l2HasChildren.has(l2Key)
                : false;
          const isExpanded =
            row.level === 1
              ? expandedL1.has(row.l1)
              : row.level === 2
                ? expandedL2.has(l2Key)
                : true;
          const indentClass = row.level === 1 ? "" : row.level === 2 ? "pl-4" : "pl-8";
          return (
            <TableRow key={`${sectionId}:${row.id}`}>
              <TableCell
                className={cn(
                  "whitespace-nowrap",
                  row.level === 1 && "font-semibold text-slate-900",
                  row.level === 2 && "text-slate-800",
                  row.level === 3 && "text-sm text-slate-600"
                )}
              >
                <div className={cn("flex items-center gap-2", indentClass)}>
                  {hasChildren ? (
                    <button
                      type="button"
                      onClick={() => (row.level === 1 ? toggleL1(row.l1) : toggleL2(l2Key))}
                      className="inline-flex h-5 w-5 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700"
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
                  <span>{row.label}</span>
                </div>
              </TableCell>
              {monthKeys.map((monthKey) => {
                const value = rowTotals[monthKey] ?? 0;
                return (
                  <TableCell
                    key={`${sectionId}:${row.id}-${monthKey}`}
                    className="text-right tabular-nums text-slate-700"
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
}: {
  title: string;
  monthKeys: string[];
  sections: {
    id: string;
    title: string;
    rows: CategoryRow[];
    totals: Map<string, Record<string, number>>;
    emptyLabel: string;
    accent: string;
  }[];
  emptyLabel: string;
  summaryLabel?: string;
  summaryTotals?: Record<string, number>;
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
                  />
                ))}
              </TableBody>
              {summaryLabel && summaryTotals && (
                <TableFooter>
                  <TableRow>
                    <TableCell className="font-semibold text-slate-900">
                      {summaryLabel}
                    </TableCell>
                    {monthKeys.map((monthKey) => (
                      <TableCell
                        key={`summary-${monthKey}`}
                        className="text-right tabular-nums font-semibold text-slate-900"
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
  const [loading, setLoading] = useState(false);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    let active = true;
    setLoading(true);
    setError(null);

    Promise.all([fetchItems(), fetchTransactions()])
      .then(([itemsData, txData]) => {
        if (!active) return;
        setItems(itemsData);
        setTransactions(txData);
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
    () => buildCategoryMatrix(incomeTxs, itemsById, fxRatesByDate, allMonthKeys),
    [incomeTxs, itemsById, fxRatesByDate, allMonthKeys]
  );

  const expenseMatrix = useMemo(
    () => buildCategoryMatrix(expenseTxs, itemsById, fxRatesByDate, allMonthKeys),
    [expenseTxs, itemsById, fxRatesByDate, allMonthKeys]
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
    <main className="min-h-screen bg-[#F7F8FA] px-8 py-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
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
            />
          </div>
        )}
      </div>
    </main>
  );
}
