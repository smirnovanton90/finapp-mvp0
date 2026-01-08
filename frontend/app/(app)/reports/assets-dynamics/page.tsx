"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import {
  fetchBanks,
  fetchFxRates,
  fetchItems,
  fetchTransactions,
  BankOut,
  FxRateOut,
  ItemOut,
  TransactionOut,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

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

function formatSignedValue(valueInCents: number, formatter: (value: number) => string) {
  const absValue = Math.abs(valueInCents);
  const formatted = formatter(absValue);
  return valueInCents < 0 ? `-${formatted}` : formatted;
}

function sortItems(items: ItemOut[]) {
  return [...items].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "ASSET" ? -1 : 1;
    return a.name.localeCompare(b.name, "ru");
  });
}

function getItemStartKey(item: ItemOut) {
  return item.start_date
    ? toTxDateKey(item.start_date)
    : toDateKey(new Date(item.created_at));
}

const ITEM_TYPE_LABELS: Record<string, string> = {
  cash: "Наличные",
  bank_account: "Банковский счёт",
  bank_card: "Дебетовая карта",
  deposit: "Вклад",
  savings_account: "Сберегательный счёт",
  brokerage: "Брокерский счёт",
  securities: "Ценные бумаги",
  real_estate: "Недвижимость",
  car: "Автомобиль",
  other_asset: "Другое",
  credit_card_debt: "Задолженность по кредитной карте",
  consumer_loan: "Потребительский кредит",
  mortgage: "Ипотека",
  car_loan: "Автокредит",
  microloan: "Микрозайм",
  tax_debt: "Налоги / штрафы",
  private_loan: "Частный займ",
  other_liability: "Другое",
};

function getItemTypeLabel(item: ItemOut) {
  return ITEM_TYPE_LABELS[item.type_code] ?? item.type_code;
}

function normalizeItemSearch(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("ru");
}

function transferDelta(kind: ItemOut["kind"], isPrimary: boolean, amount: number) {
  if (kind === "LIABILITY") return isPrimary ? amount : -amount;
  return isPrimary ? -amount : amount;
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

export default function AssetsDynamicsPage() {
  const { data: session } = useSession();
  const [items, setItems] = useState<ItemOut[]>([]);
  const [banks, setBanks] = useState<BankOut[]>([]);
  const [transactions, setTransactions] = useState<TransactionOut[]>([]);
  const [fxRatesByDate, setFxRatesByDate] = useState<Record<string, FxRateOut[]>>(
    {}
  );
  const [selectedItemIds, setSelectedItemIds] = useState<number[]>([]);
  const [itemFilterQuery, setItemFilterQuery] = useState("");
  const [isItemFilterOpen, setIsItemFilterOpen] = useState(false);
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [loading, setLoading] = useState(false);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      fetchItems({ includeClosed: true }),
      fetchTransactions(),
      fetchBanks().catch(() => []),
    ])
      .then(([itemsData, txData, banksData]) => {
        if (!active) return;
        setItems(itemsData);
        setTransactions(txData);
        setBanks(banksData);
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

  const sortedItems = useMemo(() => sortItems(items), [items]);
  const itemsById = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items]
  );
  const banksById = useMemo(
    () => new Map(banks.map((bank) => [bank.id, bank])),
    [banks]
  );
  const itemBankLogoUrl = (id: number) => {
    const bankId = itemsById.get(id)?.bank_id;
    if (!bankId) return null;
    return banksById.get(bankId)?.logo_url ?? null;
  };
  const itemBankName = (id: number) => {
    const bankId = itemsById.get(id)?.bank_id;
    if (!bankId) return "";
    return banksById.get(bankId)?.name ?? "";
  };
  const normalizedItemFilterQuery = useMemo(
    () => normalizeItemSearch(itemFilterQuery),
    [itemFilterQuery]
  );
  const filteredItemOptions = useMemo(() => {
    if (!normalizedItemFilterQuery) return sortedItems;
    return sortedItems.filter((item) => {
      const bankName = item.bank_id ? banksById.get(item.bank_id)?.name ?? "" : "";
      const searchText = [
        item.name,
        getItemTypeLabel(item),
        item.currency_code,
        bankName,
      ]
        .filter(Boolean)
        .join(" ");
      return normalizeItemSearch(searchText).includes(normalizedItemFilterQuery);
    });
  }, [banksById, normalizedItemFilterQuery, sortedItems]);
  const selectedItemFilterOptions = useMemo(() => {
    return selectedItemIds
      .map((id) => itemsById.get(id))
      .filter(Boolean) as ItemOut[];
  }, [itemsById, selectedItemIds]);

  useEffect(() => {
    const itemIds = new Set(sortedItems.map((item) => item.id));
    setSelectedItemIds((prev) => prev.filter((id) => itemIds.has(id)));
  }, [sortedItems]);

  useEffect(() => {
    if (selectedItemIds.length) return;
    if (sortedItems.length > 0) {
      setSelectedItemIds([sortedItems[0].id]);
    }
  }, [sortedItems, selectedItemIds.length]);

  const selectedItems = useMemo(() => {
    const selected = new Set(selectedItemIds);
    return sortedItems.filter((item) => selected.has(item.id));
  }, [sortedItems, selectedItemIds]);
  const addItemSelection = (id: number) => {
    setSelectedItemIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };
  const removeItemSelection = (id: number) => {
    setSelectedItemIds((prev) => prev.filter((itemId) => itemId !== id));
  };

  const selectedCurrencyCodes = useMemo(() => {
    const set = new Set<string>();
    selectedItems.forEach((item) => {
      if (item.currency_code) set.add(item.currency_code);
    });
    return Array.from(set);
  }, [selectedItems]);

  const singleCurrencyCode =
    selectedCurrencyCodes.length === 1 ? selectedCurrencyCodes[0] : null;
  const showCurrencyColumns = Boolean(
    singleCurrencyCode && singleCurrencyCode !== "RUB"
  );

  const todayKey = toDateKey(new Date());
  const defaultStartKey = getRelativeDateKey(-7);
  const defaultEndKey = getRelativeDateKey(7);
  const startKeys = useMemo(
    () => selectedItems.map((item) => getItemStartKey(item)).sort(),
    [selectedItems]
  );
  const earliestStartKey = startKeys[0] ?? "";
  const rangeMinStartKey =
    startKeys.length > 0 ? startKeys[startKeys.length - 1] : "";

  useEffect(() => {
    if (selectedItems.length === 0) {
      setRangeStart("");
      setRangeEnd("");
      return;
    }

    const baseStart =
      rangeMinStartKey && defaultStartKey < rangeMinStartKey
        ? rangeMinStartKey
        : defaultStartKey;
    const baseEnd = defaultEndKey < baseStart ? baseStart : defaultEndKey;

    setRangeStart((prev) => {
      if (!prev) return baseStart;
      if (rangeMinStartKey && prev < rangeMinStartKey) return rangeMinStartKey;
      return prev;
    });
    setRangeEnd((prev) => {
      const fallback = prev || baseEnd;
      if (rangeMinStartKey && fallback < rangeMinStartKey) {
        return rangeMinStartKey;
      }
      return fallback;
    });
  }, [defaultEndKey, defaultStartKey, rangeMinStartKey, selectedItems.length]);

  const rangeStartKey = useMemo(() => {
    if (selectedItems.length === 0) return "";
    if (!rangeStart || (rangeMinStartKey && rangeStart < rangeMinStartKey)) {
      return rangeMinStartKey;
    }
    return rangeStart;
  }, [rangeMinStartKey, rangeStart, selectedItems.length]);

  const rangeEndKey = useMemo(() => {
    if (!rangeStartKey) return "";
    const end = rangeEnd || defaultEndKey;
    return end < rangeStartKey ? rangeStartKey : end;
  }, [defaultEndKey, rangeEnd, rangeStartKey]);

  const dateKeys = useMemo(() => {
    if (!rangeStartKey || !rangeEndKey) return [];
    return buildDateRange(rangeStartKey, rangeEndKey);
  }, [rangeEndKey, rangeStartKey]);

  const needsRates = useMemo(
    () => selectedItems.some((item) => item.currency_code !== "RUB"),
    [selectedItems]
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

  const dailyRows = useMemo<DailyRow[]>(() => {
    if (!selectedItems.length || !rangeStartKey || !rangeEndKey) return [];

    const selectedIds = new Set(selectedItems.map((item) => item.id));
    const itemKindById = new Map(selectedItems.map((item) => [item.id, item.kind]));
    const itemStartKeyById = new Map(
      selectedItems.map((item) => [item.id, getItemStartKey(item)])
    );
    const itemsByStartDate = new Map<string, ItemOut[]>();
    selectedItems.forEach((item) => {
      const startKey = itemStartKeyById.get(item.id);
      if (!startKey) return;
      if (!itemsByStartDate.has(startKey)) itemsByStartDate.set(startKey, []);
      itemsByStartDate.get(startKey)?.push(item);
    });

    const deltasByDate = buildDeltasByDate(
      transactions,
      selectedIds,
      itemKindById,
      todayKey
    );
    const startKey = earliestStartKey || rangeStartKey;
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

      const itemValues: Record<number, number | null> = {};
      const itemRubValues: Record<number, number | null> = {};
      let totalRubCents: number | null = 0;
      let totalCurrencyCents: number | null = showCurrencyColumns ? 0 : null;
      let missingRate = false;

      selectedItems.forEach((item) => {
        const startKeyForItem = itemStartKeyById.get(item.id) ?? "";
        if (startKeyForItem && dateKey < startKeyForItem) {
          itemValues[item.id] = null;
          itemRubValues[item.id] = null;
          return;
        }
        const valueCents = balances.get(item.id) ?? item.initial_value_rub;
        itemValues[item.id] = valueCents;

        const rate = getRate(item.currency_code);
        if (rate === null) {
          itemRubValues[item.id] = null;
          if (item.currency_code !== "RUB") missingRate = true;
        } else {
          const rubValueCents = Math.round((valueCents / 100) * rate * 100);
          itemRubValues[item.id] = rubValueCents;
          const signedRub = item.kind === "LIABILITY" ? -rubValueCents : rubValueCents;
          if (totalRubCents !== null) totalRubCents += signedRub;
        }

        if (showCurrencyColumns && singleCurrencyCode) {
          const signedValue = item.kind === "LIABILITY" ? -valueCents : valueCents;
          if (totalCurrencyCents !== null) totalCurrencyCents += signedValue;
        }
      });

      if (missingRate) totalRubCents = null;

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
    latestRatesByCurrency,
    earliestStartKey,
    rangeEndKey,
    rangeStartKey,
    selectedItems,
    showCurrencyColumns,
    singleCurrencyCode,
    todayKey,
    transactions,
  ]);

  const chartData = useMemo(
    () =>
      dailyRows.map((row) => ({
        date: row.date,
        value: (row.totalRubCents ?? 0) / 100,
        totalRubCents: row.totalRubCents,
        itemRubValues: row.itemRubValues,
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
      ? buildDayMarks(chartData[0].date, chartData[chartData.length - 1].date, width, padding)
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
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Динамика стоимости активов
          </h1>
          <p className="text-sm text-muted-foreground">
            Выберите активы и обязательства, чтобы построить динамику
            эквивалента в рублях по дням.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-1.5">
            <Label>Активы и обязательства</Label>
            <div className="relative">
              <Input
                type="text"
                className="h-10 w-full border-2 border-border/70 bg-white shadow-none"
                placeholder="Начните вводить название"
                value={itemFilterQuery}
                onChange={(event) => {
                  setItemFilterQuery(event.target.value);
                  setIsItemFilterOpen(true);
                }}
                onFocus={() => setIsItemFilterOpen(true)}
                onClick={() => setIsItemFilterOpen(true)}
                onBlur={() => setTimeout(() => setIsItemFilterOpen(false), 150)}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    isItemFilterOpen &&
                    itemFilterQuery.trim()
                  ) {
                    const first = filteredItemOptions[0];
                    if (first) {
                      event.preventDefault();
                      addItemSelection(first.id);
                      setItemFilterQuery("");
                      setIsItemFilterOpen(false);
                    }
                  }
                }}
              />
              {isItemFilterOpen ? (
                <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border/70 bg-white p-1 shadow-lg">
                  {sortedItems.length === 0 ? (
                    <div className="px-2 py-1 text-sm text-muted-foreground">
                      Нет активов и обязательств
                    </div>
                  ) : filteredItemOptions.length === 0 ? (
                    <div className="px-2 py-1 text-sm text-muted-foreground">
                      Ничего не найдено
                    </div>
                  ) : (
                    filteredItemOptions.map((item) => {
                      const isSelected = selectedItemIds.includes(item.id);
                      const isClosed = Boolean(item.closed_at);
                      const bankLogo = itemBankLogoUrl(item.id);
                      const bankName = itemBankName(item.id);
                      const typeLabel = getItemTypeLabel(item);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className={`flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                            isSelected
                              ? "bg-violet-50 text-violet-700"
                              : "text-slate-700 hover:bg-slate-100"
                          }`}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            if (isSelected) {
                              removeItemSelection(item.id);
                            } else {
                              addItemSelection(item.id);
                            }
                            setItemFilterQuery("");
                            setIsItemFilterOpen(false);
                          }}
                        >
                          {bankLogo ? (
                            <img
                              src={bankLogo}
                              alt={bankName || ""}
                              className="h-6 w-6 rounded border border-border/60 bg-white object-contain"
                              loading="lazy"
                            />
                          ) : (
                            <div className="h-6 w-6 rounded border border-border/60 bg-slate-100" />
                          )}
                          <div className="min-w-0">
                            <div
                              className={[
                                "text-sm font-medium break-words",
                                isClosed ? "text-slate-500" : "",
                              ].join(" ")}
                            >
                              {item.name}
                            </div>
                            <div
                              className={[
                                "text-xs",
                                isClosed ? "text-slate-400" : "text-muted-foreground",
                              ].join(" ")}
                            >
                              {typeLabel} · {item.currency_code}
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              ) : null}
            </div>
            {selectedItemFilterOptions.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedItemFilterOptions.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs text-violet-800"
                  >
                    <span>{item.name}</span>
                    <button
                      type="button"
                      className="text-violet-700 hover:text-violet-900"
                      onClick={() => removeItemSelection(item.id)}
                      aria-label={`Удалить фильтр ${item.name}`}
                    >
                      x
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="assets-range-start">Дата от</Label>
            <Input
              id="assets-range-start"
              type="date"
              min={rangeMinStartKey || undefined}
              value={rangeStartKey}
              onChange={(event) => {
                const next = event.target.value;
                const normalized =
                  !next || (rangeMinStartKey && next < rangeMinStartKey)
                    ? rangeMinStartKey
                    : next;
                setRangeStart(normalized);
                setRangeEnd((prev) => {
                  const fallback = prev || defaultEndKey;
                  return fallback < normalized ? normalized : fallback;
                });
              }}
              className="bg-white"
              disabled={selectedItems.length === 0}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="assets-range-end">Дата до</Label>
            <Input
              id="assets-range-end"
              type="date"
              min={rangeStartKey || undefined}
              value={rangeEndKey}
              onChange={(event) => {
                const next = event.target.value || defaultEndKey;
                setRangeEnd(next < rangeStartKey ? rangeStartKey : next);
              }}
              className="bg-white"
              disabled={selectedItems.length === 0}
            />
          </div>
        </div>

        <Card className="overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-slate-800">
              Динамика эквивалента в рублях
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            <div className="relative py-6">
              {loading && (
                <div className="flex h-80 items-center justify-center text-sm text-muted-foreground">
                  Загружаем данные...
                </div>
              )}

              {!loading && error && (
                <div className="flex h-80 items-center justify-center text-sm text-red-600">
                  {error}
                </div>
              )}

              {!loading && !error && selectedItems.length === 0 && (
                <div className="flex h-80 items-center justify-center text-sm text-muted-foreground">
                  Выберите активы или обязательства для построения отчета.
                </div>
              )}

              {!loading && !error && selectedItems.length > 0 && chartData.length === 0 && (
                <div className="flex h-80 items-center justify-center text-sm text-muted-foreground">
                  Нет данных для выбранного периода.
                </div>
              )}

              {!loading && !error && selectedItems.length > 0 && chartData.length > 0 && (
                <div ref={chartRef} className="relative h-80 w-full">
                  {hoverPoint && hoverData && (
                    <div
                      ref={tooltipRef}
                      className="pointer-events-none absolute z-20 max-w-xs rounded-2xl bg-gradient-to-r from-[#7F5CFF] via-[#8B6CFF] to-[#9B7CFF] px-4 py-3 text-white shadow-lg"
                      style={{
                        left:
                          tooltipLeft !== null ? `${tooltipLeft}px` : `${hoverPoint.x}px`,
                        top: `${(hoverPoint.y / height) * 100}%`,
                        transform: "translate(-50%, -120%)",
                      }}
                    >
                      <div className="text-xs opacity-80">
                        {formatDateLabel(hoverData.date)}
                      </div>
                      <div className="text-sm font-semibold">
                        {hoverData.totalRubCents === null
                          ? "—"
                          : formatSignedValue(hoverData.totalRubCents, formatRub)}
                      </div>
                      <div className="mt-2 space-y-1 text-xs">
                        {selectedItems.map((item) => {
                          const rubValue = hoverData.itemRubValues[item.id];
                          const signedRub =
                            rubValue === null
                              ? null
                              : item.kind === "LIABILITY"
                              ? -rubValue
                              : rubValue;
                          return (
                            <div
                              key={item.id}
                              className="flex items-center justify-between gap-3"
                            >
                              <span className="truncate opacity-80">{item.name}</span>
                              <span className="tabular-nums">
                                {signedRub === null
                                  ? "—"
                                  : formatSignedValue(signedRub, formatRub)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <svg
                    ref={svgRef}
                    viewBox={`0 0 ${width} ${height}`}
                    className="h-full w-full"
                    role="img"
                    aria-label="График динамики стоимости активов"
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
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="px-0">
            {ratesLoading && (
              <div className="px-8 text-sm text-muted-foreground">
                Загружаем курсы валют...
              </div>
            )}

            {!ratesLoading && !error && selectedItems.length === 0 && (
              <div className="px-8 text-sm text-muted-foreground">
                Выберите активы или обязательства для просмотра таблицы.
              </div>
            )}

            {!error && selectedItems.length > 0 && (
              <div className="overflow-x-auto">
                <Table className="table-fixed min-w-full">
                  <TableHeader className="[&_tr]:border-b-2 [&_tr]:border-border/70">
                    <TableRow className="border-b-2 border-border/70">
                      <TableHead className="w-32 min-w-32 pl-8 font-medium text-muted-foreground whitespace-normal">
                        Дата
                      </TableHead>
                      {showCurrencyColumns && singleCurrencyCode && (
                        <>
                          <TableHead className="w-36 min-w-36 text-right font-medium text-muted-foreground whitespace-normal">
                            Стоимость, {singleCurrencyCode}
                          </TableHead>
                          <TableHead className="w-28 min-w-28 text-right font-medium text-muted-foreground whitespace-normal">
                            Курс {singleCurrencyCode}/RUB
                          </TableHead>
                        </>
                      )}
                      <TableHead className="w-44 min-w-44 text-right font-medium text-muted-foreground whitespace-normal">
                        Итого эквивалент в рублях
                      </TableHead>
                      {selectedItems.map((item, index) => (
                        <TableHead
                          key={item.id}
                          className={cn(
                            "min-w-[180px] text-right font-medium text-muted-foreground whitespace-normal",
                            index === selectedItems.length - 1 && "pr-8"
                          )}
                        >
                          <div className="flex flex-col items-end">
                            <span className="truncate max-w-[160px]">{item.name}</span>
                            <span className="text-xs text-muted-foreground">RUB</span>
                          </div>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dailyRows.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={selectedItems.length + (showCurrencyColumns ? 4 : 2)}
                          className="px-8 text-center text-sm text-muted-foreground"
                        >
                          Нет данных для выбранного периода.
                        </TableCell>
                      </TableRow>
                    ) : (
                      dailyRows.map((row) => {
                        const isFuture = row.date > todayKey;
                        const totalRub = row.totalRubCents ?? 0;
                        return (
                          <TableRow
                            key={row.date}
                            className={cn(
                              "border-b-2 border-border/70",
                              isFuture && "bg-amber-50"
                            )}
                          >
                            <TableCell
                              className={cn(
                                "pl-8 whitespace-nowrap",
                                isFuture && "font-medium text-amber-700"
                              )}
                            >
                              {formatDateLabel(row.date)}
                            </TableCell>
                            {showCurrencyColumns && singleCurrencyCode && (
                              <>
                                <TableCell
                                  className={cn(
                                    "text-right font-semibold tabular-nums",
                                    (row.totalCurrencyCents ?? 0) < 0 && "text-red-600"
                                  )}
                                >
                                  {row.totalCurrencyCents === null
                                    ? "—"
                                    : formatSignedValue(
                                        row.totalCurrencyCents,
                                        formatAmount
                                      )}
                                </TableCell>
                                <TableCell className="text-right text-sm text-muted-foreground">
                                  {row.rate === null ? "—" : formatRate(row.rate)}
                                </TableCell>
                              </>
                            )}
                            <TableCell
                              className={cn(
                                "text-right font-semibold tabular-nums",
                                totalRub < 0 && "text-red-600"
                              )}
                            >
                              {row.totalRubCents === null
                                ? "—"
                                : formatSignedValue(row.totalRubCents, formatRub)}
                            </TableCell>
                            {selectedItems.map((item, index) => {
                              const rubValue = row.itemRubValues[item.id];
                              const signedValue =
                                rubValue === null
                                  ? null
                                  : item.kind === "LIABILITY"
                                  ? -rubValue
                                  : rubValue;
                              return (
                                <TableCell
                                  key={`${row.date}-${item.id}`}
                                  className={cn(
                                    "text-right tabular-nums",
                                    item.kind === "LIABILITY" && "text-red-600",
                                    index === selectedItems.length - 1 && "pr-8"
                                  )}
                                >
                                  {signedValue === null
                                    ? "—"
                                    : formatSignedValue(signedValue, formatRub)}
                                </TableCell>
                              );
                            })}
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
