"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { Calculator } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  fetchFxRates,
  fetchItems,
  fetchTransactions,
  FxRateOut,
  ItemKind,
  ItemOut,
  TransactionOut,
} from "@/lib/api";

type ChartPoint = {
  x: number;
  y: number;
  value: number;
};

type DailyPoint = {
  date: string;
  valueCents: number;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const CASH_TYPES = ["cash", "bank_account", "bank_card"];
const FINANCIAL_INSTRUMENTS_TYPES = ["deposit", "savings_account", "brokerage", "securities"];
const PROPERTY_TYPES = ["real_estate", "car"];
const OTHER_ASSET_TYPES = ["other_asset"];

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

function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
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
  const absValue = Math.abs(value);
  if (absValue >= 1_000_000) {
    const val = (value / 1_000_000).toFixed(absValue >= 10_000_000 ? 0 : 1);
    return `${val}m`;
  }
  if (absValue >= 1_000) {
    const val = (value / 1_000).toFixed(absValue >= 10_000 ? 0 : 1);
    return `${val}k`;
  }
  return `${value}`;
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

function buildDailyNetAssets(items: ItemOut[], txs: TransactionOut[]): DailyPoint[] {
  const actualTxs = txs.filter((tx) => tx.transaction_type === "ACTUAL");
  if (items.length === 0 && actualTxs.length === 0) return [];

  const itemsByStartDate = new Map<string, ItemOut[]>();
  const itemsByArchiveDate = new Map<string, ItemOut[]>();
  const itemKindById = new Map<number, ItemKind>();

  const addItemByDate = (map: Map<string, ItemOut[]>, dateKey: string, item: ItemOut) => {
    if (!map.has(dateKey)) map.set(dateKey, []);
    map.get(dateKey)?.push(item);
  };

  items.forEach((item) => {
    const createdDateKey = toDateKey(new Date(item.created_at));
    addItemByDate(itemsByStartDate, createdDateKey, item);
    itemKindById.set(item.id, item.kind);

    if (item.archived_at) {
      const archiveDate = new Date(item.archived_at);
      const removeDate = new Date(
        archiveDate.getFullYear(),
        archiveDate.getMonth(),
        archiveDate.getDate()
      );
      addItemByDate(itemsByArchiveDate, toDateKey(removeDate), item);
    }
  });

  const deltasByDate = new Map<string, Map<number, number>>();
  const addDelta = (dateKey: string, itemId: number, delta: number) => {
    if (!deltasByDate.has(dateKey)) deltasByDate.set(dateKey, new Map());
    const map = deltasByDate.get(dateKey);
    if (!map) return;
    map.set(itemId, (map.get(itemId) ?? 0) + delta);
  };

  actualTxs.forEach((tx) => {
    const dateKey = tx.transaction_date;
    let primaryDelta = 0;
    if (tx.direction === "INCOME") primaryDelta = tx.amount_rub;
    if (tx.direction === "EXPENSE") primaryDelta = -tx.amount_rub;
    if (tx.direction === "TRANSFER") primaryDelta = -tx.amount_rub;

    addDelta(dateKey, tx.primary_item_id, primaryDelta);

    if (tx.direction === "TRANSFER" && tx.counterparty_item_id) {
      addDelta(dateKey, tx.counterparty_item_id, tx.amount_rub);
    }
  });

  const allDateKeys = [
    ...itemsByStartDate.keys(),
    ...deltasByDate.keys(),
  ];
  const startKey = allDateKeys.sort()[0];
  const endKey = toDateKey(new Date());
  let startDate = startKey ? parseDateKey(startKey) : new Date();
  const endDate = parseDateKey(endKey);
  if (startDate > endDate) startDate = endDate;

  const itemBalances = new Map<number, number>();
  let netAssetsCents = 0;
  const daily: DailyPoint[] = [];
  const sign = (kind: ItemKind) => (kind === "ASSET" ? 1 : -1);

  for (
    let current = startDate;
    current <= endDate;
    current = addDays(current, 1)
  ) {
    const dateKey = toDateKey(current);

    const newItems = itemsByStartDate.get(dateKey) ?? [];
    newItems.forEach((item) => {
      itemBalances.set(item.id, item.initial_value_rub);
      netAssetsCents += sign(item.kind) * item.initial_value_rub;
    });

    const dayDeltas = deltasByDate.get(dateKey);
    if (dayDeltas) {
      dayDeltas.forEach((delta, itemId) => {
        const currentBalance = itemBalances.get(itemId) ?? 0;
        itemBalances.set(itemId, currentBalance + delta);
        const kind = itemKindById.get(itemId);
        if (kind) netAssetsCents += sign(kind) * delta;
      });
    }

    const archivedItems = itemsByArchiveDate.get(dateKey) ?? [];
    archivedItems.forEach((item) => {
      const currentBalance = itemBalances.get(item.id);
      if (currentBalance !== undefined) {
        netAssetsCents -= sign(item.kind) * currentBalance;
        itemBalances.delete(item.id);
      }
    });

    daily.push({ date: dateKey, valueCents: netAssetsCents });
  }

  return daily;
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
      label: String(date.getDate()),
      x: padding.left + (innerWidth * dayIndex) / totalDays,
      dayIndex,
    });
  }

  if (marks[marks.length - 1]?.dayIndex !== totalDays) {
    const date = addDays(startDate, totalDays);
    marks.push({
      label: String(date.getDate()),
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
  const [fxRates, setFxRates] = useState<FxRateOut[]>([]);
  const [loading, setLoading] = useState(true);
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
      fetchItems({ includeArchived: true }),
      fetchTransactions(),
      fetchFxRates().catch(() => [] as FxRateOut[]),
    ])
      .then(([itemsData, txData, fxRatesData]) => {
        if (!active) return;
        setItems(itemsData);
        setTxs(txData);
        setFxRates(fxRatesData);
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

  function getRubEquivalentCents(item: ItemOut): number | null {
    const rate = rateByCode[item.currency_code];
    if (!rate) return null;
    const amount = item.current_value_rub / 100;
    return Math.round(amount * rate * 100);
  }

  const activeItems = useMemo(
    () => items.filter((item) => !item.archived_at),
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

  const dailySeries = useMemo(() => buildDailyNetAssets(items, txs), [items, txs]);

  const chartData = useMemo(() => {
    return dailySeries.map((point) => ({
      date: point.date,
      value: point.valueCents / 100,
      valueCents: point.valueCents,
    }));
  }, [dailySeries]);

  const width = chartSize.width;
  const height = chartSize.height;
  const padding = { top: 24, right: 24, bottom: 44, left: 52 };
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

  const linePath = buildLinePath(points);
  const baselineValue = chartMin;
  const baselineRatio = (baselineValue - chartMin) / (chartMax - chartMin || 1);
  const baselineY = padding.top + innerHeight - innerHeight * baselineRatio;
  const areaPath = linePath
    ? `${linePath} L ${points[points.length - 1].x} ${baselineY} L ${points[0].x} ${baselineY} Z`
    : "";

  const hoverPoint = hoverIndex !== null ? points[hoverIndex] : null;
  const hoverData = hoverIndex !== null ? chartData[hoverIndex] : null;

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
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Дэшборд</h1>
          <p className="text-sm text-muted-foreground">Ключевые метрики за последние дни.</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
          <Card className="h-full">
            <CardHeader>
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
            <CardHeader className="pb-4">
              <CardTitle className="text-base text-slate-800">Динамика чистых активов</CardTitle>
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
                            {formatRub(hoverData.valueCents)}
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
                          <linearGradient id="netArea" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#8D63FF" stopOpacity="0.35" />
                            <stop offset="100%" stopColor="#8D63FF" stopOpacity="0" />
                          </linearGradient>
                          <linearGradient id="netLine" x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%" stopColor="#7F5CFF" />
                            <stop offset="100%" stopColor="#A089FF" />
                          </linearGradient>
                          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
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

                        {areaPath && <path d={areaPath} fill="url(#netArea)" />}
                        {linePath && (
                          <path
                            d={linePath}
                            fill="none"
                            stroke="url(#netLine)"
                            strokeWidth="3"
                            strokeLinecap="round"
                            filter="url(#glow)"
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
                              fill="#7F5CFF"
                              stroke="#F3EDFF"
                              strokeWidth="4"
                            />
                          </>
                        )}
                        {dayMarks.map((mark) => (
                          <text
                            key={`${mark.label}-${mark.x}`}
                            x={mark.x}
                            y={height - 12}
                            textAnchor="middle"
                            fontSize="12"
                            fill="#6F67B3"
                            fontWeight={500}
                          >
                            {mark.label}
                          </text>
                        ))}
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
