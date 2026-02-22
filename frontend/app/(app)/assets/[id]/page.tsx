"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/form-field";
import {
  fetchItem,
  fetchItems,
  fetchItemCosts,
  fetchItemMarketValues,
  fetchItemCostHistory,
  fetchTransactionsPage,
  fetchCounterparties,
  API_BASE,
  ItemOut,
  ItemCostsOut,
  ItemMarketValueOut,
  ItemCostHistoryOut,
  CounterpartyOut,
  PrimaryValueKind,
  TransactionOut,
} from "@/lib/api";
import { getItemTypeLabel } from "@/lib/item-types";
import { formatAmount, getItemPhotoUrl, getItemPrimaryValueCents } from "@/lib/item-utils";
import { PRIMARY_VALUE_KIND_OPTIONS, getPrimaryValueLabel } from "@/lib/asset-item-form-constants";
import { ACCENT, ACTIVE_TEXT_DARK, GREEN, RED, PLACEHOLDER_COLOR_DARK, BACKGROUND_DT, MODAL_BG } from "@/lib/colors";
import { TYPE_ICON_BY_CODE } from "@/lib/asset-icons";
import { BuySellAssetModal } from "@/components/buy-sell-asset-modal";

type ChartPoint = { x: number; y: number; value: number };

function buildLinePath(points: ChartPoint[]) {
  if (points.length === 0) return "";
  const path = [`M ${points[0].x} ${points[0].y}`];
  for (let i = 1; i < points.length; i += 1) path.push(`L ${points[i].x} ${points[i].y}`);
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
  for (let value = minTick; value <= maxTick + step / 2; value += step) ticks.push(value);
  return ticks;
}

function formatChartDate(date: Date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear()).slice(-2);
  return `${day}.${month}.${year}`;
}

function formatRub(cents: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export default function AssetDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id != null ? Number(params.id) : NaN;
  const [item, setItem] = useState<ItemOut | null>(null);
  const [costs, setCosts] = useState<ItemCostsOut | null>(null);
  const [marketValues, setMarketValues] = useState<ItemMarketValueOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingPrimary, setSavingPrimary] = useState(false);
  const [costHistoryOpen, setCostHistoryOpen] = useState<"balance" | "acquisition" | "invested" | "market" | null>(null);
  const [buySellModalOpen, setBuySellModalOpen] = useState(false);
  const [allItems, setAllItems] = useState<ItemOut[]>([]);
  const [counterparties, setCounterparties] = useState<CounterpartyOut[]>([]);
  const [quantityHistoryTx, setQuantityHistoryTx] = useState<TransactionOut[]>([]);
  const [loadingQuantityHistory, setLoadingQuantityHistory] = useState(false);
  const [quantityHistoryError, setQuantityHistoryError] = useState<string | null>(null);
  const [costHistoryData, setCostHistoryData] = useState<ItemCostHistoryOut | null>(null);
  const [loadingCostHistory, setLoadingCostHistory] = useState(false);
  const costChartContainerRef = useRef<HTMLDivElement | null>(null);
  const costChartSvgRef = useRef<SVGSVGElement | null>(null);
  const costChartTooltipRef = useRef<HTMLDivElement | null>(null);
  const [costChartSize, setCostChartSize] = useState({ width: 720, height: 280 });
  const [costChartHoverIndex, setCostChartHoverIndex] = useState<number | null>(null);
  const [costChartTooltipLeft, setCostChartTooltipLeft] = useState<number | null>(null);
  const [costChartContainerReady, setCostChartContainerReady] = useState(false);

  const load = useCallback(async () => {
    if (!Number.isFinite(id)) return;
    setLoading(true);
    setError(null);
    setQuantityHistoryError(null);
    try {
      const [itemRes, costsRes, marketRes] = await Promise.all([
        fetchItem(id),
        fetchItemCosts(id),
        fetchItemMarketValues(id),
      ]);
      setItem(itemRes);
      setCosts(costsRes);
      setMarketValues(marketRes);
      if (itemRes.instrument_id) {
        setLoadingQuantityHistory(true);
        try {
          const page = await fetchTransactionsPage({
            related_item_ids: [itemRes.id],
            limit: 200,
          });
          const list = page.items.filter(
            (tx) =>
              tx.primary_quantity_lots != null &&
              (tx.asset_link_type === "ASSET_PURCHASE" || tx.asset_link_type === "ASSET_SALE")
          );
          setQuantityHistoryTx(list);
        } catch (e: unknown) {
          setQuantityHistoryTx([]);
          setQuantityHistoryError((e as Error)?.message ?? "Не удалось загрузить историю операций");
        } finally {
          setLoadingQuantityHistory(false);
        }
      } else {
        setQuantityHistoryTx([]);
      }
    } catch (e: any) {
      setError(e?.message ?? "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const loadItemsAndCounterparties = useCallback(async () => {
    try {
      const [itemsRes, cpRes] = await Promise.all([
        fetchItems(),
        fetchCounterparties(),
      ]);
      setAllItems(itemsRes);
      setCounterparties(cpRes);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (buySellModalOpen && item?.instrument_id) {
      loadItemsAndCounterparties();
    }
  }, [buySellModalOpen, item?.instrument_id, loadItemsAndCounterparties]);

  useEffect(() => {
    if (!costHistoryOpen || !item?.id) {
      setCostHistoryData(null);
      return;
    }
    let cancelled = false;
    setLoadingCostHistory(true);
    const dateFrom = item.open_date ?? undefined;
    const dateTo = new Date().toISOString().slice(0, 10);
    fetchItemCostHistory(item.id, { date_from: dateFrom, date_to: dateTo })
      .then((data) => {
        if (!cancelled) setCostHistoryData(data);
      })
      .catch(() => {
        if (!cancelled) setCostHistoryData(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingCostHistory(false);
      });
    return () => {
      cancelled = true;
    };
  }, [costHistoryOpen, item?.id, item?.open_date]);

  const counterpartiesById = useMemo(() => {
    const map = new Map<number, CounterpartyOut>();
    counterparties.forEach((c) => map.set(c.id, c));
    return map;
  }, [counterparties]);

  const getCounterpartyForItemId = useCallback(
    (itemId: number) => {
      const it = allItems.find((i) => i.id === itemId);
      if (!it?.counterparty_id) return null;
      return counterpartiesById.get(it.counterparty_id) ?? null;
    },
    [allItems, counterpartiesById]
  );

  const itemCounterpartyLogoUrl = useCallback(
    (id: number | null | undefined) => {
      if (!id) return null;
      const it = allItems.find((i) => i.id === id);
      if (!it?.counterparty_id) return null;
      const cp = counterpartiesById.get(it.counterparty_id);
      if (!cp) return null;
      return cp.entity_type === "PERSON" ? cp.photo_url ?? null : cp.logo_url ?? null;
    },
    [allItems, counterpartiesById]
  );

  const itemCounterpartyName = useCallback(
    (id: number | null | undefined) => {
      if (!id) return "";
      const it = allItems.find((i) => i.id === id);
      if (!it?.counterparty_id) return "";
      const cp = counterpartiesById.get(it.counterparty_id);
      if (!cp) return "";
      if (cp.entity_type === "PERSON") {
        const parts = [cp.last_name, cp.first_name, cp.middle_name].filter(Boolean);
        return parts.join(" ") || "";
      }
      return cp.name || cp.full_name || "";
    },
    [allItems, counterpartiesById]
  );

  const quantityHistoryRows = useMemo(() => {
    const openDate = item?.open_date ?? "";
    const fromOpen = openDate
      ? quantityHistoryTx.filter((tx) => (tx.transaction_date || "").slice(0, 10) >= openDate)
      : quantityHistoryTx;
    // Одна строка на каждую операцию (не объединяем по дате): сортировка по дате/времени, затем по id
    const sorted = [...fromOpen].sort((a, b) => {
      const dateA = a.transaction_date || "";
      const dateB = b.transaction_date || "";
      const d = dateA.localeCompare(dateB);
      if (d !== 0) return d;
      return (a.id ?? 0) - (b.id ?? 0);
    });
    let totalBuy = 0;
    let totalSell = 0;
    sorted.forEach((tx) => {
      const lots = tx.primary_quantity_lots ?? 0;
      if (tx.asset_link_type === "ASSET_PURCHASE") totalBuy += lots;
      else if (tx.asset_link_type === "ASSET_SALE") totalSell += lots;
    });
    const current = item?.position_lots ?? 0;
    const startQty = current - totalBuy + totalSell;
    let balance = startQty;
    return sorted.map((tx) => {
      const lots = tx.primary_quantity_lots ?? 0;
      const isBuy = tx.asset_link_type === "ASSET_PURCHASE";
      const delta = isBuy ? lots : -lots;
      balance += delta;
      return { tx, type: isBuy ? "Покупка" as const : "Продажа" as const, delta, balanceAfter: balance };
    });
  }, [quantityHistoryTx, item?.open_date, item?.position_lots]);

  const quantitySummary = useMemo(() => {
    const openDate = item?.open_date ?? "";
    const fromOpen = openDate
      ? quantityHistoryTx.filter((tx) => (tx.transaction_date || "").slice(0, 10) >= openDate)
      : quantityHistoryTx;
    let totalBuy = 0;
    let totalSell = 0;
    fromOpen.forEach((tx) => {
      const lots = tx.primary_quantity_lots ?? 0;
      if (tx.asset_link_type === "ASSET_PURCHASE") totalBuy += lots;
      else if (tx.asset_link_type === "ASSET_SALE") totalSell += lots;
    });
    const current = item?.position_lots ?? 0;
    const startQty = current - totalBuy + totalSell;
    return { startQty, totalBuy, totalSell, current };
  }, [quantityHistoryTx, item?.open_date, item?.position_lots]);

  const costChartSeries = useMemo(() => {
    if (!costHistoryOpen || !costHistoryData?.points.length) return [];
    const key = costHistoryOpen === "balance" ? "balance_rub" : costHistoryOpen === "acquisition" ? "acquisition_rub" : costHistoryOpen === "invested" ? "invested_rub" : "market_rub";
    const raw = costHistoryData.points.map((p) => {
      const valueRub = ((p as Record<string, number | null>)[key] ?? 0) / 100;
      const hasValue = (p as Record<string, number | null>)[key] != null;
      const base = { date: p.date, valueRub, hasValue };
      if (key === "market_rub" && "market_quantity_units" in p && "market_price_rub" in p) {
        return {
          ...base,
          marketQuantityUnits: p.market_quantity_units ?? undefined,
          marketPriceRub: p.market_price_rub ?? undefined,
        };
      }
      return base;
    });
    if (key === "market_rub") return raw.filter((p) => p.hasValue);
    return raw;
  }, [costHistoryOpen, costHistoryData]);

  useEffect(() => {
    if (!costHistoryOpen || costChartSeries.length === 0) setCostChartContainerReady(false);
  }, [costHistoryOpen, costChartSeries.length]);

  useEffect(() => {
    if (!costChartContainerReady || !costChartContainerRef.current) return;
    const element = costChartContainerRef.current;
    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      const nextWidth = Math.max(1, Math.round(rect.width));
      const nextHeight = Math.max(1, Math.round(rect.height));
      setCostChartSize((prev) => {
        if (prev.width === nextWidth && prev.height === nextHeight) return prev;
        return { width: nextWidth, height: nextHeight };
      });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, [costChartContainerReady]);

  const costChartPadding = useMemo(() => ({ top: 24, right: 0, bottom: 44, left: 56 }), []);
  const costChartGeometry = useMemo(() => {
    if (costChartSeries.length === 0) return null;
    const width = costChartSize.width;
    const height = costChartSize.height;
    const padding = costChartPadding;
    const innerWidth = width - padding.left - padding.right;
    const innerHeight = height - padding.top - padding.bottom;
    const values = costChartSeries.map((p) => p.valueRub);
    const minVal = values.length ? Math.min(...values) : 0;
    const maxVal = values.length ? Math.max(...values) : 0;
    const rangePadding = Math.max(Math.max(maxVal, Math.abs(minVal)) * 0.12, 1);
    const paddedMin = minVal - rangePadding;
    const paddedMax = maxVal + rangePadding;
    const ticks = buildTicks(paddedMin, paddedMax);
    const chartMin = ticks[0] ?? 0;
    const chartMax = ticks[ticks.length - 1] ?? 1;
    const valueToRatio = (v: number) => (v - chartMin) / (chartMax - chartMin || 1);
    const zeroRatio = Math.max(0, Math.min(1, valueToRatio(0)));
    const baselineY = padding.top + innerHeight - innerHeight * zeroRatio;
    const points: ChartPoint[] = costChartSeries.map((p, i) => {
      const progress = costChartSeries.length <= 1 ? 0 : i / (costChartSeries.length - 1);
      const x = padding.left + innerWidth * progress;
      const y = padding.top + innerHeight - innerHeight * valueToRatio(p.valueRub);
      return { x, y, value: p.valueRub };
    });
    const dayMarks: { label: string; x: number }[] = [];
    const step = Math.max(1, Math.ceil(costChartSeries.length / 7));
    for (let i = 0; i < costChartSeries.length; i += step) {
      const p = costChartSeries[i];
      if (!p) continue;
      const progress = costChartSeries.length <= 1 ? 0 : i / (costChartSeries.length - 1);
      dayMarks.push({ label: formatChartDate(new Date(p.date)), x: padding.left + innerWidth * progress });
    }
    if (costChartSeries.length > 0 && dayMarks.length > 0) {
      const lastX = padding.left + innerWidth;
      if (Math.abs((dayMarks[dayMarks.length - 1]?.x ?? 0) - lastX) > 2) {
        const last = costChartSeries[costChartSeries.length - 1]!;
        dayMarks.push({ label: formatChartDate(new Date(last.date)), x: lastX });
      }
    }
    return {
      width,
      height,
      padding,
      innerWidth,
      innerHeight,
      points,
      linePath: buildLinePath(points),
      areaPath: buildAreaPath(points, baselineY),
      baselineY,
      ticks,
      dayMarks,
      valueToRatio,
      chartMin,
      chartMax,
    };
  }, [costChartSeries, costChartSize, costChartPadding]);

  const costChartHoverPoint = useMemo(() => {
    if (costChartHoverIndex == null || !costChartGeometry || costChartSeries.length === 0) return null;
    const progress = costChartSeries.length <= 1 ? 0 : costChartHoverIndex / (costChartSeries.length - 1);
    const x = costChartGeometry.padding.left + costChartGeometry.innerWidth * progress;
    const value = costChartSeries[costChartHoverIndex]!.valueRub;
    const y =
      costChartGeometry.padding.top +
      costChartGeometry.innerHeight -
      costChartGeometry.innerHeight * costChartGeometry.valueToRatio(value);
    return { x, y, value };
  }, [costChartHoverIndex, costChartSeries, costChartGeometry]);

  useEffect(() => {
    if (!costChartHoverPoint || !costChartContainerRef.current || !costChartTooltipRef.current) {
      setCostChartTooltipLeft(null);
      return;
    }
    const containerWidth = costChartContainerRef.current.clientWidth;
    const tooltipWidth = costChartTooltipRef.current.offsetWidth;
    const paddingEdge = 12;
    const scaleX = containerWidth / costChartSize.width;
    const xPixel = costChartHoverPoint.x * scaleX;
    const clamped = Math.min(
      Math.max(xPixel, tooltipWidth / 2 + paddingEdge),
      containerWidth - tooltipWidth / 2 - paddingEdge
    );
    setCostChartTooltipLeft(clamped);
  }, [costChartHoverPoint?.x, costChartHoverIndex, costChartSize.width]);

  const handleCostChartPointerMove = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      if (!costChartSvgRef.current || costChartSeries.length === 0) return;
      if (costChartSeries.length === 1) {
        setCostChartHoverIndex(0);
        return;
      }
      const ctm = costChartSvgRef.current.getScreenCTM();
      if (!ctm) return;
      let svgX = 0;
      if (typeof DOMPoint !== "undefined") {
        const point = new DOMPoint(event.clientX, event.clientY);
        svgX = point.matrixTransform(ctm.inverse()).x;
      } else {
        const point = costChartSvgRef.current.createSVGPoint();
        point.x = event.clientX;
        point.y = event.clientY;
        svgX = point.matrixTransform(ctm.inverse()).x;
      }
      const padding = costChartPadding;
      const innerWidth = costChartSize.width - padding.left - padding.right;
      const clampedX = Math.min(Math.max(svgX, padding.left), costChartSize.width - padding.right);
      const progress = (clampedX - padding.left) / innerWidth;
      const index = Math.round(progress * (costChartSeries.length - 1));
      setCostChartHoverIndex(Math.min(Math.max(index, 0), costChartSeries.length - 1));
    },
    [costChartSeries.length, costChartSize, costChartPadding]
  );

  const buildItemCreatePayload = useCallback(
    (overrides: { primary_value_kind?: PrimaryValueKind }) => {
      if (!item) return null;
      const payload: Parameters<typeof updateItem>[1] = {
        kind: item.kind,
        type_code: item.type_code,
        name: item.name,
        currency_code: item.currency_code ?? "RUB",
        open_date: item.open_date,
        initial_value_rub: item.initial_value_rub,
        counterparty_id: item.counterparty_id ?? null,
        opening_counterparty_item_id: item.opening_counterparty_item_id ?? null,
        account_last7: item.account_last7 ?? null,
        contract_number: item.contract_number ?? null,
        card_last4: item.card_last4 ?? null,
        card_account_id: item.card_account_id ?? null,
        card_kind: item.card_kind ?? null,
        credit_limit: item.credit_limit ?? null,
        deposit_term_days: item.deposit_term_days ?? null,
        interest_rate: item.interest_rate ?? null,
        interest_payout_order: item.interest_payout_order ?? null,
        interest_capitalization: item.interest_capitalization ?? null,
        interest_payout_account_id: item.interest_payout_account_id ?? null,
        instrument_id: item.instrument_id ?? null,
        instrument_board_id: item.instrument_board_id ?? null,
        position_lots: item.position_lots ?? null,
        synonyms: item.synonyms ?? [],
        plan_settings: item.plan_settings ?? null,
        primary_value_kind: overrides.primary_value_kind ?? item.primary_value_kind ?? null,
      };
      return payload;
    },
    [item]
  );

  const handlePrimaryValueKindChange = async (value: PrimaryValueKind) => {
    if (!item) return;
    const payload = buildItemCreatePayload({ primary_value_kind: value });
    if (!payload) return;
    setSavingPrimary(true);
    try {
      const updated = await updateItem(item.id, payload);
      setItem(updated);
    } catch (e: any) {
      setError(e?.message ?? "Не удалось сохранить");
    } finally {
      setSavingPrimary(false);
    }
  };

  if (loading && !item) {
    return (
      <main className="min-h-screen px-8 py-8">
        <div className="mx-auto w-full max-w-6xl" style={{ color: PLACEHOLDER_COLOR_DARK }}>Загрузка...</div>
      </main>
    );
  }

  if (error && !item) {
    return (
      <main className="min-h-screen px-8 py-8">
        <div className="mx-auto w-full max-w-6xl">
          <p className="text-red-600">{error}</p>
          <Button variant="outline" className="mt-4" asChild>
            <Link href="/assets">К активам</Link>
          </Button>
        </div>
      </main>
    );
  }

  if (!item) {
    return (
      <main className="min-h-screen px-8 py-8">
        <div className="mx-auto w-full max-w-6xl">
          <p style={{ color: PLACEHOLDER_COLOR_DARK }}>Актив не найден.</p>
          <Button variant="outline" className="mt-4" asChild>
            <Link href="/assets">К активам</Link>
          </Button>
        </div>
      </main>
    );
  }

  const TypeIcon = TYPE_ICON_BY_CODE[item.type_code];
  const photoUrl = getItemPhotoUrl(item, API_BASE);

  return (
    <main className="min-h-screen px-8 py-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="flex flex-wrap items-center gap-2 -ml-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/assets" className="flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              К активам и обязательствам
            </Link>
          </Button>
          {item.instrument_id && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBuySellModalOpen(true)}
              className="flex items-center gap-2"
            >
              <TrendingUp className="h-4 w-4" />
              Купить/продать актив
            </Button>
          )}
        </div>

        <div className="relative rounded-lg overflow-hidden border-0 outline-none" style={{ backgroundColor: MODAL_BG }}>
          <div className="p-6">
            <div className="flex flex-row items-start gap-4">
              <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0" style={{ backgroundColor: BACKGROUND_DT }}>
                {photoUrl ? (
                  <img src={photoUrl} alt="" className="w-full h-full object-cover" />
                ) : TypeIcon ? (
                  <div className="w-full h-full flex items-center justify-center" style={{ color: ACCENT }}>
                    <TypeIcon className="w-8 h-8" strokeWidth={1.5} />
                  </div>
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-semibold" style={{ color: ACTIVE_TEXT_DARK }}>{item.name}</h2>
                <p className="text-sm mt-1" style={{ color: PLACEHOLDER_COLOR_DARK }}>{getItemTypeLabel(item)}</p>
                {item.currency_code && (
                  <p className="text-sm" style={{ color: PLACEHOLDER_COLOR_DARK }}>{item.currency_code}</p>
                )}
              </div>
            </div>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm mt-4">
              {item.open_date && (
                <>
                  <dt style={{ color: PLACEHOLDER_COLOR_DARK }}>Дата появления</dt>
                  <dd style={{ color: ACTIVE_TEXT_DARK }}>{item.open_date}</dd>
                </>
              )}
              {item.contract_number && (
                <>
                  <dt style={{ color: PLACEHOLDER_COLOR_DARK }}>Номер договора</dt>
                  <dd style={{ color: ACTIVE_TEXT_DARK }}>{item.contract_number}</dd>
                </>
              )}
              {item.account_last7 && (
                <>
                  <dt style={{ color: PLACEHOLDER_COLOR_DARK }}>Последние 4 цифры счёта</dt>
                  <dd style={{ color: ACTIVE_TEXT_DARK }}>****{item.account_last7}</dd>
                </>
              )}
              {item.deposit_term_days != null && (
                <>
                  <dt style={{ color: PLACEHOLDER_COLOR_DARK }}>Срок вклада, дней</dt>
                  <dd style={{ color: ACTIVE_TEXT_DARK }}>{item.deposit_term_days}</dd>
                </>
              )}
              {item.interest_rate != null && (
                <>
                  <dt style={{ color: PLACEHOLDER_COLOR_DARK }}>Процентная ставка</dt>
                  <dd style={{ color: ACTIVE_TEXT_DARK }}>{item.interest_rate}%</dd>
                </>
              )}
              {item.position_lots != null && (
                <>
                  <dt style={{ color: PLACEHOLDER_COLOR_DARK }}>Количество лотов</dt>
                  <dd style={{ color: ACTIVE_TEXT_DARK }}>{new Intl.NumberFormat("ru-RU").format(item.position_lots)}</dd>
                </>
              )}
            </dl>
          </div>
        </div>

        <div className="relative rounded-lg overflow-hidden border-0 outline-none" style={{ backgroundColor: MODAL_BG }}>
          <div className="p-6">
            <h3 className="text-base font-semibold mb-4" style={{ color: ACTIVE_TEXT_DARK }}>Стоимости</h3>
            <div className="mt-2 mb-4">
              <SelectField
                label="Основная стоимость"
                value={item.primary_value_kind ?? "BALANCE"}
                onValueChange={(v) => handlePrimaryValueKindChange(v as PrimaryValueKind)}
                options={PRIMARY_VALUE_KIND_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                placeholder="Выберите"
                disabled={savingPrimary}
              />
            </div>
            {costs && (
              <div className="grid grid-cols-2 gap-4">
                <div
                  className="rounded-lg p-4 cursor-pointer transition-colors hover:opacity-90"
                  style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
                  onClick={() => setCostHistoryOpen((v) => (v === "balance" ? null : "balance"))}
                >
                  <div className="text-xs mb-1" style={{ color: PLACEHOLDER_COLOR_DARK }}>Балансовая стоимость</div>
                  <div className="text-lg font-semibold" style={{ color: ACTIVE_TEXT_DARK }}>
                    {formatRub(costs.balance_rub)}
                  </div>
                </div>
                <div
                  className="rounded-lg p-4 cursor-pointer transition-colors hover:opacity-90"
                  style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
                  onClick={() => setCostHistoryOpen((v) => (v === "acquisition" ? null : "acquisition"))}
                >
                  <div className="text-xs mb-1" style={{ color: PLACEHOLDER_COLOR_DARK }}>Стоимость приобретения</div>
                  <div className="text-lg font-semibold" style={{ color: ACTIVE_TEXT_DARK }}>
                    {formatRub(costs.acquisition_rub)}
                  </div>
                </div>
                <div
                  className="rounded-lg p-4 cursor-pointer transition-colors hover:opacity-90"
                  style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
                  onClick={() => setCostHistoryOpen((v) => (v === "invested" ? null : "invested"))}
                >
                  <div className="text-xs mb-1" style={{ color: PLACEHOLDER_COLOR_DARK }}>Стоимость вложенных средств</div>
                  <div className="text-lg font-semibold" style={{ color: ACTIVE_TEXT_DARK }}>
                    {formatRub(costs.invested_rub)}
                  </div>
                </div>
                <div
                  className="rounded-lg p-4 cursor-pointer transition-colors hover:opacity-90"
                  style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
                  onClick={() => setCostHistoryOpen((v) => (v === "market" ? null : "market"))}
                >
                  <div className="text-xs mb-1" style={{ color: PLACEHOLDER_COLOR_DARK }}>Рыночная стоимость</div>
                  <div className="text-lg font-semibold" style={{ color: ACTIVE_TEXT_DARK }}>
                    {costs.market_rub != null ? formatRub(costs.market_rub) : "—"}
                  </div>
                </div>
              </div>
            )}

            {costHistoryOpen && (
              <div className="mt-4 rounded-lg p-4" style={{ backgroundColor: BACKGROUND_DT }}>
                <div className="text-sm font-medium mb-2" style={{ color: ACTIVE_TEXT_DARK }}>
                  {costHistoryOpen === "balance" && "История балансовой стоимости"}
                  {costHistoryOpen === "acquisition" && "История стоимости приобретения"}
                  {costHistoryOpen === "invested" && "История стоимости вложенных средств"}
                  {costHistoryOpen === "market" && "История рыночной стоимости"}
                </div>
                {loadingCostHistory ? (
                  <p className="text-sm" style={{ color: PLACEHOLDER_COLOR_DARK }}>Загрузка...</p>
                ) : costChartSeries.length === 0 ? (
                  <p className="text-sm" style={{ color: PLACEHOLDER_COLOR_DARK }}>Нет данных за период.</p>
                ) : costChartGeometry ? (
                  <div
                    ref={(el) => {
                      costChartContainerRef.current = el;
                      setCostChartContainerReady(!!el);
                    }}
                    className="relative w-full min-w-0"
                    style={{ aspectRatio: `${costChartSize.width}/${costChartSize.height}` }}
                  >
                    {costChartHoverPoint != null && costChartHoverIndex != null && costChartSeries[costChartHoverIndex] && (
                      <div
                        ref={costChartTooltipRef}
                        className="pointer-events-none absolute z-20 whitespace-nowrap rounded-[9px] px-4 py-3 text-[14px] font-normal text-right"
                        style={{
                          left: costChartTooltipLeft != null ? `${costChartTooltipLeft}px` : `${costChartHoverPoint.x}px`,
                          top: 0,
                          transform: "translate(-50%, 0)",
                          backgroundColor: MODAL_BG,
                        }}
                      >
                        <div className="whitespace-nowrap" style={{ color: PLACEHOLDER_COLOR_DARK }}>
                          {formatChartDate(new Date(costChartSeries[costChartHoverIndex]!.date))}
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-3" style={{ color: ACTIVE_TEXT_DARK }}>
                          <span>
                            {costHistoryOpen === "balance" && "Балансовая стоимость"}
                            {costHistoryOpen === "acquisition" && "Стоимость приобретения"}
                            {costHistoryOpen === "invested" && "Стоимость вложенных средств"}
                            {costHistoryOpen === "market" && "Рыночная стоимость"}
                          </span>
                          <span>{formatRub(Math.round(costChartSeries[costChartHoverIndex]!.valueRub * 100))}</span>
                        </div>
                        {costHistoryOpen === "market" && (() => {
                          const pt = costChartSeries[costChartHoverIndex!] as { marketQuantityUnits?: number; marketPriceRub?: number };
                          if (pt?.marketQuantityUnits != null || pt?.marketPriceRub != null) {
                            return (
                              <div className="mt-2 space-y-1 text-[13px]" style={{ color: PLACEHOLDER_COLOR_DARK }}>
                                {pt.marketQuantityUnits != null && (
                                  <div>Количество: {pt.marketQuantityUnits.toLocaleString("ru-RU")} шт.</div>
                                )}
                                {pt.marketPriceRub != null && (
                                  <div>Цена на дату: {formatRub(pt.marketPriceRub)}</div>
                                )}
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    )}
                    <svg
                      ref={costChartSvgRef}
                      viewBox={`0 0 ${costChartGeometry.width} ${costChartGeometry.height}`}
                      className="h-full w-full cursor-pointer"
                      style={{ overflow: "visible" }}
                      onMouseMove={handleCostChartPointerMove}
                      onMouseLeave={() => setCostChartHoverIndex(null)}
                    >
                      <defs>
                        <linearGradient id="asset-detail-chart-area" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={ACCENT} stopOpacity={0.35} />
                          <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      {costChartGeometry.ticks.map((tick, idx) => (
                        <g key={idx}>
                          <line
                            x1={costChartGeometry.padding.left - 6}
                            x2={costChartGeometry.padding.left}
                            y1={costChartGeometry.padding.top + costChartGeometry.innerHeight - costChartGeometry.innerHeight * costChartGeometry.valueToRatio(tick)}
                            y2={costChartGeometry.padding.top + costChartGeometry.innerHeight - costChartGeometry.innerHeight * costChartGeometry.valueToRatio(tick)}
                            stroke={PLACEHOLDER_COLOR_DARK}
                            strokeOpacity={0.7}
                          />
                          <text
                            x={costChartGeometry.padding.left - 10}
                            y={costChartGeometry.padding.top + costChartGeometry.innerHeight - costChartGeometry.innerHeight * costChartGeometry.valueToRatio(tick)}
                            textAnchor="end"
                            dominantBaseline="middle"
                            fontSize={11}
                            fill={PLACEHOLDER_COLOR_DARK}
                          >
                            {new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(tick)}
                          </text>
                        </g>
                      ))}
                      <path d={costChartGeometry.areaPath} fill="url(#asset-detail-chart-area)" />
                      <path d={costChartGeometry.linePath} fill="none" stroke={ACCENT} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
                      <line x1={costChartGeometry.padding.left} x2={costChartGeometry.width - costChartGeometry.padding.right} y1={costChartGeometry.baselineY} y2={costChartGeometry.baselineY} stroke={PLACEHOLDER_COLOR_DARK} strokeWidth={1} strokeDasharray="4 4" strokeOpacity={0.7} />
                      {costChartHoverPoint && (
                        <>
                          <line
                            x1={costChartHoverPoint.x}
                            x2={costChartHoverPoint.x}
                            y1={costChartGeometry.padding.top}
                            y2={costChartGeometry.padding.top + costChartGeometry.innerHeight}
                            stroke={PLACEHOLDER_COLOR_DARK}
                            strokeDasharray="4 6"
                          />
                          <circle
                            cx={costChartHoverPoint.x}
                            cy={costChartHoverPoint.y}
                            r={6}
                            fill={ACCENT}
                            stroke="#fff"
                            strokeWidth={2}
                          />
                        </>
                      )}
                      {costChartGeometry.dayMarks.map((mark, idx) => (
                        <text
                          key={idx}
                          x={mark.x}
                          y={costChartGeometry.height - 12}
                          textAnchor={idx === 0 ? "start" : idx === costChartGeometry.dayMarks.length - 1 ? "end" : "middle"}
                          fontSize={14}
                          fill={ACTIVE_TEXT_DARK}
                        >
                          {mark.label}
                        </text>
                      ))}
                    </svg>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>

        {costs && (
          <div className="relative rounded-lg overflow-hidden border-0 outline-none" style={{ backgroundColor: MODAL_BG }}>
            <div className="p-6">
              <h3 className="text-base font-semibold mb-4" style={{ color: ACTIVE_TEXT_DARK }}>Доход и расход по активу</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg p-4" style={{ backgroundColor: "rgba(255,255,255,0.06)" }}>
                  <div className="text-xs mb-1" style={{ color: PLACEHOLDER_COLOR_DARK }}>Доход</div>
                  <div className="text-lg font-semibold" style={{ color: ACTIVE_TEXT_DARK }}>
                    {formatRub(costs.income_rub)}
                  </div>
                </div>
                <div className="rounded-lg p-4" style={{ backgroundColor: "rgba(255,255,255,0.06)" }}>
                  <div className="text-xs mb-1" style={{ color: PLACEHOLDER_COLOR_DARK }}>Расход</div>
                  <div className="text-lg font-semibold" style={{ color: ACTIVE_TEXT_DARK }}>
                    {formatRub(costs.expense_rub)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {item.instrument_id && (
          <div className="relative rounded-lg overflow-hidden border-0 outline-none" style={{ backgroundColor: MODAL_BG }}>
            <div className="p-6">
              <h3 className="text-base font-semibold mb-4" style={{ color: ACTIVE_TEXT_DARK }}>История операций по количеству</h3>
              {quantityHistoryError ? (
                <p className="text-sm text-red-500">{quantityHistoryError}</p>
              ) : loadingQuantityHistory ? (
                <p className="text-sm" style={{ color: PLACEHOLDER_COLOR_DARK }}>Загрузка...</p>
              ) : (
                <>
                  <div className="rounded-lg overflow-hidden">
                    <table className="w-full text-left border-collapse text-sm">
                      <thead>
                        <tr style={{ color: PLACEHOLDER_COLOR_DARK, backgroundColor: BACKGROUND_DT }}>
                          <th className="pl-6 pr-4 py-3 text-sm font-medium">Дата</th>
                          <th className="px-4 py-3 text-sm font-medium">Тип операции</th>
                          <th className="px-4 py-3 text-sm font-medium text-right">Куплено / продано</th>
                          <th className="px-6 py-3 text-sm font-medium text-right">Количество после операции</th>
                        </tr>
                      </thead>
                      <tbody>
                        {quantityHistoryRows.length === 0 ? (
                          <tr style={{ backgroundColor: MODAL_BG }}>
                            <td colSpan={4} className="px-6 py-4 text-center text-sm" style={{ color: PLACEHOLDER_COLOR_DARK }}>Нет операций покупки и продажи</td>
                          </tr>
                        ) : (
                          quantityHistoryRows.map(({ tx, type, delta, balanceAfter }) => {
                            const dateStr = tx.transaction_date ? new Date(tx.transaction_date.replace("T", " ")).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";
                            const amountColor = type === "Покупка" ? GREEN : RED;
                            return (
                              <tr key={tx.id} className="border-t border-white/10" style={{ backgroundColor: MODAL_BG }}>
                                <td className="pl-6 pr-4 py-2 text-sm" style={{ color: ACTIVE_TEXT_DARK }}>{dateStr}</td>
                                <td className="px-4 py-2 text-sm" style={{ color: amountColor }}>{type}</td>
                                <td className="px-4 py-2 text-sm text-right tabular-nums" style={{ color: amountColor }}>{delta > 0 ? `+${delta}` : delta}</td>
                                <td className="px-6 py-2 text-sm text-right tabular-nums" style={{ color: ACTIVE_TEXT_DARK }}>{new Intl.NumberFormat("ru-RU").format(balanceAfter)}</td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex flex-wrap gap-4 mt-4">
                    {(() => {
                      const SummaryBlock = ({ title, value }: { title: string; value: number }) => (
                        <div className="flex flex-1 min-w-[120px] flex-col gap-1.5 rounded-lg px-3 py-2" style={{ backgroundColor: "rgba(255,255,255,0.06)" }}>
                          <div className="text-xs text-center" style={{ color: PLACEHOLDER_COLOR_DARK }}>{title}</div>
                          <div className="rounded-md px-2 py-1 flex justify-center text-sm tabular-nums" style={{ backgroundColor: BACKGROUND_DT, color: ACTIVE_TEXT_DARK }}>
                            {new Intl.NumberFormat("ru-RU").format(value)}
                          </div>
                        </div>
                      );
                      return (
                        <>
                          <SummaryBlock title="Количество на начало" value={quantitySummary.startQty} />
                          <SummaryBlock title="Всего куплено" value={quantitySummary.totalBuy} />
                          <SummaryBlock title="Всего продано" value={quantitySummary.totalSell} />
                          <SummaryBlock title="Количество на текущую дату" value={quantitySummary.current} />
                        </>
                      );
                    })()}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {item.instrument_id && (
          <BuySellAssetModal
            open={buySellModalOpen}
            onOpenChange={setBuySellModalOpen}
            asset={item}
            items={allItems}
            getCounterpartyForItemId={getCounterpartyForItemId}
            getBankLogoUrl={itemCounterpartyLogoUrl}
            getBankName={itemCounterpartyName}
            getItemBalance={getItemPrimaryValueCents}
            onSuccess={load}
          />
        )}
      </div>
    </main>
  );
}
