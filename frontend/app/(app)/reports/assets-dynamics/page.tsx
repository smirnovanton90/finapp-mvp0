"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
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
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type DailyRow = {
  date: string;
  valueCents: number;
  rate: number | null;
  rubValueCents: number | null;
};

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function buildDateRange(startKey: string, endKey: string) {
  const start = parseDateKey(startKey);
  const end = parseDateKey(endKey);
  if (start > end) return [endKey];

  const dates: string[] = [];
  for (let current = start; current <= end; current = addDays(current, 1)) {
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

function formatAmount(valueInCents: number) {
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valueInCents / 100);
}

function formatRate(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
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

function sortItems(items: ItemOut[]) {
  return [...items].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "ASSET" ? -1 : 1;
    return a.name.localeCompare(b.name, "ru");
  });
}

function buildTxsByDate(txs: TransactionOut[], itemId: number) {
  const map = new Map<string, TransactionOut[]>();
  txs.forEach((tx) => {
    if (tx.transaction_type !== "ACTUAL") return;
    if (tx.primary_item_id !== itemId && tx.counterparty_item_id !== itemId) return;
    if (!map.has(tx.transaction_date)) map.set(tx.transaction_date, []);
    map.get(tx.transaction_date)?.push(tx);
  });
  return map;
}

function computeDayDelta(txs: TransactionOut[], itemId: number) {
  let delta = 0;
  for (const tx of txs) {
    if (tx.direction === "TRANSFER") {
      if (tx.primary_item_id === itemId) {
        delta -= tx.amount_rub;
      }
      if (tx.counterparty_item_id === itemId) {
        delta += tx.amount_counterparty ?? tx.amount_rub;
      }
      continue;
    }

    if (tx.primary_item_id !== itemId) continue;
    delta += tx.direction === "INCOME" ? tx.amount_rub : -tx.amount_rub;
  }
  return delta;
}

function getRateForDate(
  ratesByDate: Record<string, FxRateOut[]>,
  dateKey: string,
  currencyCode: string
) {
  if (currencyCode === "RUB") return 1;
  const rates = ratesByDate[dateKey];
  if (!rates) return null;
  const match = rates.find((rate) => rate.char_code === currencyCode);
  return match?.rate ?? null;
}

export default function AssetsDynamicsPage() {
  const { data: session } = useSession();
  const [items, setItems] = useState<ItemOut[]>([]);
  const [transactions, setTransactions] = useState<TransactionOut[]>([]);
  const [fxRatesByDate, setFxRatesByDate] = useState<Record<string, FxRateOut[]>>(
    {}
  );
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
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
          e?.message ?? "Не удалось загрузить список активов и транзакций."
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [session]);

  const sortedItems = useMemo(() => sortItems(items), [items]);
  const assetItems = useMemo(
    () => sortedItems.filter((item) => item.kind === "ASSET"),
    [sortedItems]
  );
  const liabilityItems = useMemo(
    () => sortedItems.filter((item) => item.kind === "LIABILITY"),
    [sortedItems]
  );

  useEffect(() => {
    if (sortedItems.length === 0) {
      if (selectedItemId !== null) setSelectedItemId(null);
      return;
    }
    if (
      selectedItemId === null ||
      !sortedItems.some((item) => item.id === selectedItemId)
    ) {
      setSelectedItemId(sortedItems[0].id);
    }
  }, [sortedItems, selectedItemId]);

  const selectedItem = useMemo(
    () => sortedItems.find((item) => item.id === selectedItemId) ?? null,
    [sortedItems, selectedItemId]
  );

  const dateKeys = useMemo(() => {
    if (!selectedItem) return [];
    const startKey = toDateKey(new Date(selectedItem.created_at));
    const endKey = toDateKey(new Date());
    return buildDateRange(startKey, endKey);
  }, [selectedItem]);

  useEffect(() => {
    if (!selectedItem || selectedItem.currency_code === "RUB") return;
    if (dateKeys.length === 0) return;

    const missingDates = dateKeys.filter((dateKey) => !fxRatesByDate[dateKey]);
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
  }, [selectedItem, dateKeys, fxRatesByDate]);

  const dailyRows = useMemo<DailyRow[]>(() => {
    if (!selectedItem) return [];
    const txsByDate = buildTxsByDate(transactions, selectedItem.id);
    let balance = selectedItem.initial_value_rub;

    return dateKeys.map((dateKey) => {
      const dayTxs = txsByDate.get(dateKey) ?? [];
      balance += computeDayDelta(dayTxs, selectedItem.id);
      const rate = getRateForDate(
        fxRatesByDate,
        dateKey,
        selectedItem.currency_code
      );
      const rubValueCents =
        rate === null ? null : Math.round((balance / 100) * rate * 100);

      return {
        date: dateKey,
        valueCents: balance,
        rate,
        rubValueCents,
      };
    });
  }, [dateKeys, fxRatesByDate, selectedItem, transactions]);

  return (
    <main className="min-h-screen bg-[#F7F8FA] px-8 py-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Динамика стоимости активов
          </h1>
          <p className="text-sm text-muted-foreground">
            Выберите актив или обязательство, чтобы увидеть его ежедневную
            стоимость.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <Card className="h-fit">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Активы и обязательства</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {loading && (
                <div className="text-sm text-muted-foreground">
                  Загружаем список...
                </div>
              )}

              {!loading && sortedItems.length === 0 && (
                <div className="text-sm text-muted-foreground">
                  Пока нет активов или обязательств.
                </div>
              )}

              {!loading && sortedItems.length > 0 && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Активы
                    </div>
                    {assetItems.length === 0 ? (
                      <div className="text-sm text-muted-foreground">
                        Активы не найдены.
                      </div>
                    ) : (
                      assetItems.map((item) => {
                        const isSelected = item.id === selectedItemId;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setSelectedItemId(item.id)}
                            className={cn(
                              "flex w-full items-center justify-between rounded-md border border-transparent px-3 py-2 text-left text-sm font-medium transition-colors",
                              isSelected
                                ? "border-violet-200 bg-violet-50 text-violet-800"
                                : "text-slate-700 hover:bg-white"
                            )}
                          >
                            <span className="truncate">{item.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {item.currency_code}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Обязательства
                    </div>
                    {liabilityItems.length === 0 ? (
                      <div className="text-sm text-muted-foreground">
                        Обязательства не найдены.
                      </div>
                    ) : (
                      liabilityItems.map((item) => {
                        const isSelected = item.id === selectedItemId;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setSelectedItemId(item.id)}
                            className={cn(
                              "flex w-full items-center justify-between rounded-md border border-transparent px-3 py-2 text-left text-sm font-medium transition-colors",
                              isSelected
                                ? "border-violet-200 bg-violet-50 text-violet-800"
                                : "text-slate-700 hover:bg-white"
                            )}
                          >
                            <span className="truncate">{item.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {item.currency_code}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">История стоимости</CardTitle>
            </CardHeader>
            <CardContent>
              {error && <div className="text-sm text-red-600">{error}</div>}

              {!error && !selectedItem && (
                <div className="text-sm text-muted-foreground">
                  Выберите актив или обязательство слева.
                </div>
              )}

              {!error && selectedItem && (
                <div className="space-y-3">
                  <div className="text-sm text-muted-foreground">
                    Период: {dateKeys[0]} — {dateKeys[dateKeys.length - 1]}
                  </div>
                  {selectedItem.currency_code !== "RUB" && ratesLoading && (
                    <div className="text-sm text-muted-foreground">
                      Загружаем курсы валют...
                    </div>
                  )}
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Дата</TableHead>
                        <TableHead>
                          Стоимость, {selectedItem.currency_code}
                        </TableHead>
                        <TableHead>
                          Курс {selectedItem.currency_code}/RUB
                        </TableHead>
                        <TableHead>Эквивалент в рублях</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dailyRows.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={4}
                            className="text-center text-sm text-muted-foreground"
                          >
                            Нет данных для отображения.
                          </TableCell>
                        </TableRow>
                      ) : (
                        dailyRows.map((row) => (
                          <TableRow key={row.date}>
                            <TableCell>{formatDateLabel(row.date)}</TableCell>
                            <TableCell>{formatAmount(row.valueCents)}</TableCell>
                            <TableCell>
                              {row.rate === null ? "—" : formatRate(row.rate)}
                            </TableCell>
                            <TableCell>
                              {row.rubValueCents === null
                                ? "—"
                                : formatRub(row.rubValueCents)}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
