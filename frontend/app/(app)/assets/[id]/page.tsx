"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  TrendingUp,
  Camera,
  Upload,
  MoreVertical,
  Pencil,
  Archive,
  Trash2,
  User,
  Building2,
  ChevronDown,
  ChevronUp,
  Plus,
  MessageSquare,
  ExternalLink,
  Target,
  MapPin,
  MapPinCheck,
  MapPinX,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  fetchItem,
  fetchItems,
  fetchItemCosts,
  fetchItemMarketValues,
  fetchItemCostHistory,
  fetchItemBalanceCheckpoints,
  fetchItemBalanceAt,
  createBalanceCheckpoint,
  updateBalanceCheckpoint,
  deleteBalanceCheckpoint,
  fetchTransactions,
  fetchTransactionsPage,
  fetchCounterparties,
  fetchCategories,
  fetchFxRatesBatch,
  uploadItemPhoto,
  updateItem,
  archiveItem,
  closeItem,
  updateItemClosedAt,
  API_BASE,
  ItemOut,
  ItemCostsOut,
  ItemMarketValueOut,
  ItemCostHistoryOut,
  BalanceCheckpointOut,
  BalanceCheckpointCreate,
  BalanceCheckpointUpdate,
  CounterpartyOut,
  PrimaryValueKind,
  TransactionOut,
  FxRateOut,
} from "@/lib/api";
import { CONTENT_WIDTH_CLASS } from "@/lib/content-width";
import { getItemTypeLabel } from "@/lib/item-types";
import { buildCounterpartyDisplayName } from "@/lib/counterparty-utils";
import { formatAmount, getItemPhotoUrl, getItemPrimaryValueCents, getEffectiveItemKind } from "@/lib/item-utils";
import {
  MAX_PHOTO_BYTES,
  MAX_PHOTO_DIM,
  ALLOWED_PHOTO_TYPES,
  formatSize,
  getTodayDateKey,
} from "@/lib/asset-item-form-constants";
import { ACCENT, ACCENT2, ACTIVE_TEXT_DARK, GREEN, RED, PLACEHOLDER_COLOR_DARK, BACKGROUND_DT, MODAL_BG } from "@/lib/colors";
import { formatTimeInput } from "@/lib/format-time";
import { PINK_GRADIENT, ASSET_DETAIL_HEADER_GRADIENT } from "@/lib/gradients";
import { TYPE_ICON_BY_CODE } from "@/lib/asset-icons";
import { assetIconPath } from "@/lib/image-paths";
import { CurrencyChip, getCurrencyChartColor } from "@/components/currency-chip";
import { CategoryIconImage } from "@/components/category-icon-image";
import { buildCategoryLookup, type CategoryNode } from "@/lib/categories";
import { SegmentedSelector } from "@/components/ui/segmented-selector";
import { BuySellAssetModal } from "@/components/buy-sell-asset-modal";
import { EditMarketValueModal } from "@/components/edit-market-value-modal";
import { AddEditItemFormModal } from "@/components/add-edit-item-form-modal";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormModal } from "@/components/form-modal";
import { Label } from "@/components/ui/label";
import { AuthInput } from "@/components/ui/auth-input";
import { FormField, TextField, DateField } from "@/components/ui/form-field";
import { formatRubInput, normalizeRubOnBlur, parseRubToCents, formatCentsForInput } from "@/lib/format-rub";
import { CardIcon } from "@/components/card-icon";
import { Tooltip } from "@/components/ui/tooltip";
import { useCounterpartyImage } from "@/hooks/use-counterparty-image";
import { useSidebar } from "@/components/ui/sidebar-context";
import {
  toTxDateKey,
  getTxDeltaForItem,
  getRateForDate,
  isMoexItem,
  isCryptoItem,
  formatRub,
} from "@/lib/asset-dynamics-utils";

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

/** Вставляет точки пересечения нуля между парами точек для разбиения графика на положительную и отрицательную части */
function insertZeroCrossings(points: ChartPoint[], baselineY: number): ChartPoint[] {
  if (points.length === 0) return [];
  const result: ChartPoint[] = [points[0]!];
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!;
    const curr = points[i]!;
    if ((prev.value >= 0) !== (curr.value >= 0) && prev.value !== curr.value) {
      const t = (0 - prev.value) / (curr.value - prev.value);
      const x = prev.x + t * (curr.x - prev.x);
      result.push({ x, y: baselineY, value: 0 });
    }
    result.push(curr);
  }
  return result;
}

/** Разбивает точки на сегменты с одинаковым знаком (положительные и отрицательные) */
function splitSegmentsBySign(points: ChartPoint[]): { positive: ChartPoint[][]; negative: ChartPoint[][] } {
  const positive: ChartPoint[][] = [];
  const negative: ChartPoint[][] = [];
  let posSeg: ChartPoint[] = [];
  let negSeg: ChartPoint[] = [];
  for (const p of points) {
    if (p.value >= 0) {
      posSeg.push(p);
      if (negSeg.length > 0) {
        negative.push(negSeg);
        negSeg = [];
      }
    } else {
      negSeg.push(p);
      if (posSeg.length > 0) {
        positive.push(posSeg);
        posSeg = [];
      }
    }
  }
  if (posSeg.length > 0) positive.push(posSeg);
  if (negSeg.length > 0) negative.push(negSeg);
  return { positive, negative };
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

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysBetween(startKey: string, endKey: string): number {
  const [sy, sm, sd] = startKey.split("-").map(Number);
  const [ey, em, ed] = endKey.split("-").map(Number);
  const start = Date.UTC(sy || 0, (sm || 1) - 1, sd || 1);
  const end = Date.UTC(ey || 0, (em || 1) - 1, ed || 1);
  const diff = Math.max(0, end - start);
  return Math.floor(diff / MS_PER_DAY) + 1;
}

/** Блок: чип валюты слева, сумма справа (значение в копейках/центах валюты актива). */
function AmountWithCurrency({
  valueCents,
  currencyCode,
  className = "",
  amountStyle,
}: {
  valueCents: number;
  currencyCode: string | null | undefined;
  className?: string;
  amountStyle?: React.CSSProperties;
}) {
  const code = currencyCode ?? "RUB";
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <CurrencyChip code={code} className="shrink-0" />
      <span className="tabular-nums" style={amountStyle}>{formatAmount(valueCents)}</span>
    </div>
  );
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
  const costHistoryInitializedForItemIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (!item) return;
    if (costHistoryInitializedForItemIdRef.current !== item.id) {
      costHistoryInitializedForItemIdRef.current = item.id;
      const kind = item.primary_value_kind ?? "BALANCE";
      setCostHistoryOpen(
        kind === "MARKET" ? "market" : kind === "ACQUISITION" ? "acquisition" : kind === "INVESTED" ? "invested" : "balance"
      );
    }
  }, [item]);
  const [costRowHover, setCostRowHover] = useState<"balance" | "acquisition" | "invested" | "market" | null>(null);
  const [buySellModalOpen, setBuySellModalOpen] = useState(false);
  const [editMarketValueModalOpen, setEditMarketValueModalOpen] = useState(false);
  const [allItems, setAllItems] = useState<ItemOut[]>([]);
  const [counterparties, setCounterparties] = useState<CounterpartyOut[]>([]);
  const [quantityHistoryTx, setQuantityHistoryTx] = useState<TransactionOut[]>([]);
  const [loadingQuantityHistory, setLoadingQuantityHistory] = useState(false);
  const [quantityHistoryError, setQuantityHistoryError] = useState<string | null>(null);
  const [costHistoryData, setCostHistoryData] = useState<ItemCostHistoryOut | null>(null);
  const [loadingCostHistory, setLoadingCostHistory] = useState(false);
  const [dynamicsTxs, setDynamicsTxs] = useState<TransactionOut[]>([]);
  const [fxRatesByDate, setFxRatesByDate] = useState<Record<string, FxRateOut[]>>({});
  const [loadingDynamics, setLoadingDynamics] = useState(false);
  const [iconFormat, setIconFormat] = useState<"png" | null>("png");
  const [itemPhotoError, setItemPhotoError] = useState<string | null>(null);
  const [itemPhotoUploading, setItemPhotoUploading] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const costChartContainerRef = useRef<HTMLDivElement | null>(null);
  const costChartSvgRef = useRef<SVGSVGElement | null>(null);
  const costChartTooltipRef = useRef<HTMLDivElement | null>(null);
  const itemPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const [costChartSize, setCostChartSize] = useState({ width: 720, height: 280 });
  const [costChartHoverIndex, setCostChartHoverIndex] = useState<number | null>(null);
  const [costChartTooltipLeft, setCostChartTooltipLeft] = useState<number | null>(null);
  const [costChartContainerReady, setCostChartContainerReady] = useState(false);
  const [costChartCurrency, setCostChartCurrency] = useState<"RUB" | "CURRENCY">("RUB");
  // Для инвалютного актива по умолчанию показываем график в валюте счёта (стабильная сумма), RUB пересчитывается по курсу на дату.
  const [quantityBlockOpen, setQuantityBlockOpen] = useState(false);
  const qtyChartContainerRef = useRef<HTMLDivElement | null>(null);
  const qtyChartSvgRef = useRef<SVGSVGElement | null>(null);
  const qtyChartTooltipRef = useRef<HTMLDivElement | null>(null);
  const [qtyChartSize, setQtyChartSize] = useState({ width: 720, height: 280 });
  const [qtyChartHoverIndex, setQtyChartHoverIndex] = useState<number | null>(null);
  const [qtyChartTooltipLeft, setQtyChartTooltipLeft] = useState<number | null>(null);
  const [qtyChartContainerReady, setQtyChartContainerReady] = useState(false);
  const [rentabilityOpen, setRentabilityOpen] = useState<"income" | "expense" | null>(null);
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [checkpoints, setCheckpoints] = useState<BalanceCheckpointOut[]>([]);
  const [checkpointModalOpen, setCheckpointModalOpen] = useState(false);
  const [checkpointEditId, setCheckpointEditId] = useState<number | null>(null);
  const [checkpointDateStr, setCheckpointDateStr] = useState("");
  const [checkpointTimeStr, setCheckpointTimeStr] = useState("");
  const [checkpointAmountStr, setCheckpointAmountStr] = useState("");
  const [checkpointComputedCents, setCheckpointComputedCents] = useState<number | null>(null);
  const [checkpointBalanceAtLoading, setCheckpointBalanceAtLoading] = useState(false);
  const [checkpointSaving, setCheckpointSaving] = useState(false);
  const [checkpointModalError, setCheckpointModalError] = useState<string | null>(null);
  const [checkpointChartHoverDate, setCheckpointChartHoverDate] = useState<string | null>(null);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [closeDate, setCloseDate] = useState(() => getTodayDateKey());
  const [closeDialogError, setCloseDialogError] = useState<string | null>(null);
  const [editClosedAtOpen, setEditClosedAtOpen] = useState(false);
  const [editClosedAtDate, setEditClosedAtDate] = useState("");
  const [editClosedAtError, setEditClosedAtError] = useState<string | null>(null);
  const [savingClosedAt, setSavingClosedAt] = useState(false);

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
      if ((itemRes.primary_value_kind ?? "BALANCE") === "BALANCE") {
        try {
          const list = await fetchItemBalanceCheckpoints(itemRes.id);
          setCheckpoints(list);
        } catch {
          setCheckpoints([]);
        }
      } else {
        setCheckpoints([]);
      }
      if (itemRes.instrument_id) {
        setLoadingQuantityHistory(true);
        try {
          const [pageRelated, pageByItems] = await Promise.all([
            fetchTransactionsPage({ related_item_ids: [itemRes.id], limit: 200 }),
            fetchTransactionsPage({ item_ids: [itemRes.id], limit: 200 }),
          ]);
          const byId = new Map<number, TransactionOut>();
          [...pageRelated.items, ...pageByItems.items].forEach((tx) => byId.set(tx.id, tx));
          const list = Array.from(byId.values()).filter(
            (tx) =>
              (tx.asset_link_type === "ASSET_PURCHASE" || tx.asset_link_type === "ASSET_SALE" || tx.direction === "TRANSFER") &&
              ((tx.related_item_id === itemRes.id && (tx.primary_quantity_lots != null || tx.primary_quantity_units != null)) ||
                (tx.counterparty_item_id === itemRes.id && (tx.counterparty_quantity_lots != null || tx.counterparty_quantity_units != null)) ||
                (tx.primary_item_id === itemRes.id && (tx.primary_quantity_lots != null || tx.primary_quantity_units != null)))
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

  const askConfirm = useCallback((title: string, message: string): Promise<boolean> => {
    if (typeof window === "undefined") {
      // SSR / safety fallback: don't block, just resolve false
      return Promise.resolve(false);
    }
    // Простое системное подтверждение только для детальной страницы
    const ok = window.confirm(`${title}\n\n${message}`);
    return Promise.resolve(ok);
  }, []);

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
    if (!item?.counterparty_id) return;
    if (counterparties.length > 0) return;
    loadItemsAndCounterparties();
  }, [item?.counterparty_id, counterparties.length, loadItemsAndCounterparties]);

  const refetchCostHistory = useCallback(async () => {
    if (!item?.id || !item?.open_date) return;
    setLoadingCostHistory(true);
    try {
      const dateFrom = item.open_date ?? undefined;
      const dateTo = item.closed_at ? item.closed_at.slice(0, 10) : new Date().toISOString().slice(0, 10);
      const data = await fetchItemCostHistory(item.id, { date_from: dateFrom, date_to: dateTo });
      setCostHistoryData(data);
    } catch {
      setCostHistoryData(null);
    } finally {
      setLoadingCostHistory(false);
    }
  }, [item?.id, item?.open_date, item?.closed_at]);

  /** Собирает ISO datetime в UTC из локальных даты и времени (чтобы бэкенд и отображение совпадали). */
  const buildCheckpointAtIso = useCallback((dateStr: string, timeStr: string) => {
    const [y, mo, day] = dateStr.split("-").map((x) => parseInt(x, 10));
    const t = timeStr && /^\d{1,2}:\d{2}$/.test(timeStr.trim()) ? timeStr.trim() : "00:00";
    const [h, m] = t.split(":").map((x) => parseInt(x, 10));
    const localDate = new Date(
      Number.isFinite(y) ? y : 0,
      Number.isFinite(mo) ? mo - 1 : 0,
      Number.isFinite(day) ? day : 1,
      Number.isFinite(h) ? h : 0,
      Number.isFinite(m) ? m : 0,
      0,
      0
    );
    return localDate.toISOString();
  }, []);

  const toLocalDateKey = useCallback((d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }, []);

  const openCheckpointModal = useCallback((editId: number | null) => {
    setCheckpointEditId(editId);
    setCheckpointModalError(null);
    if (editId != null) {
      const cp = checkpoints.find((c) => c.id === editId);
      if (cp) {
        const d = new Date(cp.checkpoint_at);
        const dateStr = toLocalDateKey(d);
        const timeStr = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
        setCheckpointDateStr(dateStr);
        setCheckpointTimeStr(timeStr);
        setCheckpointAmountStr(formatCentsForInput(cp.stated_balance_cents));
        setCheckpointComputedCents(cp.computed_balance_cents);
      }
    } else {
      const now = new Date();
      const dateStr = toLocalDateKey(now);
      const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      setCheckpointDateStr(dateStr);
      setCheckpointTimeStr(timeStr);
      setCheckpointAmountStr("");
      setCheckpointComputedCents(null);
    }
    setCheckpointModalOpen(true);
  }, [checkpoints, toLocalDateKey]);

  useEffect(() => {
    if (!checkpointModalOpen || !item?.id || !checkpointDateStr) return;
    const at = buildCheckpointAtIso(checkpointDateStr, checkpointTimeStr);
    let cancelled = false;
    setCheckpointBalanceAtLoading(true);
    fetchItemBalanceAt(item.id, at)
      .then((r) => {
        if (!cancelled) setCheckpointComputedCents(r.computed_balance_cents);
      })
      .catch(() => {
        if (!cancelled) setCheckpointComputedCents(null);
      })
      .finally(() => {
        if (!cancelled) setCheckpointBalanceAtLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [checkpointModalOpen, item?.id, checkpointDateStr, checkpointTimeStr, buildCheckpointAtIso]);

  const saveCheckpoint = useCallback(async () => {
    if (!item?.id || !checkpointDateStr) return;
    setCheckpointModalError(null);
    const at = buildCheckpointAtIso(checkpointDateStr, checkpointTimeStr);
    const cents = parseRubToCents(checkpointAmountStr);
    if (!Number.isFinite(cents)) {
      setCheckpointModalError("Введите корректную сумму.");
      return;
    }
    setCheckpointSaving(true);
    try {
      if (checkpointEditId != null) {
        await updateBalanceCheckpoint(item.id, checkpointEditId, {
          checkpoint_at: at,
          stated_balance_cents: cents,
          source: "MANUAL",
        });
      } else {
        await createBalanceCheckpoint(item.id, { checkpoint_at: at, stated_balance_cents: cents });
      }
      const list = await fetchItemBalanceCheckpoints(item.id);
      setCheckpoints(list);
      refetchCostHistory();
      setCheckpointModalOpen(false);
    } catch (e) {
      setCheckpointModalError((e as Error)?.message ?? "Ошибка сохранения");
    } finally {
      setCheckpointSaving(false);
    }
  }, [item?.id, checkpointDateStr, checkpointTimeStr, checkpointAmountStr, checkpointEditId, buildCheckpointAtIso, refetchCostHistory]);

  const deleteCheckpoint = useCallback(async (checkpointId: number) => {
    if (!item?.id) return;
    try {
      await deleteBalanceCheckpoint(item.id, checkpointId);
      const list = await fetchItemBalanceCheckpoints(item.id);
      setCheckpoints(list);
      refetchCostHistory();
    } catch {
      // ignore
    }
  }, [item?.id, refetchCostHistory]);

  useEffect(() => {
    if (!item?.id || !item?.open_date) {
      setCostHistoryData(null);
      return;
    }
    let cancelled = false;
    setLoadingCostHistory(true);
    const dateFrom = item.open_date ?? undefined;
    const dateTo = item.closed_at ? item.closed_at.slice(0, 10) : new Date().toISOString().slice(0, 10);
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
  }, [item?.id, item?.open_date, item?.closed_at]);

  useEffect(() => {
    if (!item?.id) {
      setDynamicsTxs([]);
      setFxRatesByDate({});
      return;
    }
    let cancelled = false;
    setLoadingDynamics(true);
    const dateEnd = new Date().toISOString().slice(0, 10);
    const dateStart = item.open_date ?? dateEnd;
    Promise.all([fetchTransactions(), fetchCategories(), fetchItems()])
      .then(([txs, cats, itemsRes]) => {
        if (cancelled) return;
        setDynamicsTxs(txs);
        setCategories(cats ?? []);
        setAllItems(itemsRes ?? []);
        const dateSet = new Set<string>([dateStart, dateEnd]);
        txs.forEach((tx) => {
          const d = toTxDateKey(tx.transaction_date);
          if (d && d > dateStart && d <= dateEnd) dateSet.add(d);
        });
        const dates = Array.from(dateSet).sort();
        if (dates.length === 0) return Promise.resolve(undefined);
        return fetchFxRatesBatch(dates).then((rates) => {
          if (!cancelled) setFxRatesByDate(rates ?? {});
        });
      })
      .catch(() => {
        if (!cancelled) {
          setDynamicsTxs([]);
          setFxRatesByDate({});
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingDynamics(false);
      });
    return () => {
      cancelled = true;
    };
  }, [item?.id, item?.open_date]);

  // Догружаем курсы на каждую дату из истории стоимости, чтобы рублёвый эквивалент в графике считался по курсу на дату, а не по ближайшей известной.
  useEffect(() => {
    if (!item?.id || !costHistoryData?.points?.length) return;
    const currencyCode = (item.currency_code ?? "RUB").toUpperCase();
    if (currencyCode === "RUB") return;

    const pointDates = new Set(costHistoryData.points.map((p) => p.date));
    const existingSet = new Set(Object.keys(fxRatesByDate));
    const missingDates = Array.from(pointDates).filter((d) => !existingSet.has(d)).sort();
    if (missingDates.length === 0) return;

    let cancelled = false;
    fetchFxRatesBatch(missingDates).then((rates) => {
      if (!cancelled && rates && Object.keys(rates).length > 0) {
        setFxRatesByDate((prev) => ({ ...prev, ...rates }));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [item?.id, item?.currency_code, costHistoryData?.points, fxRatesByDate]);

  const todayKey = new Date().toISOString().slice(0, 10);
  /** Конечная дата периода: для закрытого актива — дата закрытия, иначе сегодня (для графика, рентабельности, доходности). */
  const effectiveEndDate = item?.closed_at ? item.closed_at.slice(0, 10) : todayKey;
  const sortedFxRateDateKeys = useMemo(() => Object.keys(fxRatesByDate).sort(), [fxRatesByDate]);
  const categoryLookup = useMemo(() => buildCategoryLookup(categories), [categories]);
  const itemsById = useMemo(() => {
    const map = new Map<number, ItemOut>();
    allItems.forEach((it) => map.set(it.id, it));
    if (item) map.set(item.id, item);
    return map;
  }, [allItems, item]);
  const incomeTxsForAsset = useMemo(() => {
    if (!item?.id) return [];
    return dynamicsTxs
      .filter((tx) => tx.related_item_id === item.id && tx.asset_link_type === "ASSET_INCOME")
      .sort((a, b) => (toTxDateKey(b.transaction_date)).localeCompare(toTxDateKey(a.transaction_date)));
  }, [item?.id, dynamicsTxs]);
  const expenseTxsForAsset = useMemo(() => {
    if (!item?.id) return [];
    return dynamicsTxs
      .filter((tx) => tx.related_item_id === item.id && tx.asset_link_type === "ASSET_EXPENSE")
      .sort((a, b) => (toTxDateKey(b.transaction_date)).localeCompare(toTxDateKey(a.transaction_date)));
  }, [item?.id, dynamicsTxs]);
  const purchaseTxsForAsset = useMemo(() => {
    if (!item?.id) return [];
    return dynamicsTxs
      .filter((tx) => tx.related_item_id === item.id && tx.asset_link_type === "ASSET_PURCHASE")
      .sort((a, b) => (toTxDateKey(b.transaction_date)).localeCompare(toTxDateKey(a.transaction_date)));
  }, [item?.id, dynamicsTxs]);
  const investmentTxsForAsset = useMemo(() => {
    if (!item?.id) return [];
    return dynamicsTxs
      .filter((tx) => tx.related_item_id === item.id && tx.asset_link_type === "ASSET_INVESTMENT")
      .sort((a, b) => (toTxDateKey(b.transaction_date)).localeCompare(toTxDateKey(a.transaction_date)));
  }, [item?.id, dynamicsTxs]);
  /** Транзакции для блока «Стоимость вложенных средств»: все «Приобретение актива» + «Вложение в актив» (для нового актива; для исторического — та же логика). */
  const investedTxsForAsset = useMemo(() => {
    const merged = [...purchaseTxsForAsset, ...investmentTxsForAsset];
    return merged.sort((a, b) => (toTxDateKey(b.transaction_date)).localeCompare(toTxDateKey(a.transaction_date)));
  }, [purchaseTxsForAsset, investmentTxsForAsset]);

  function formatTxDateCell(transactionDate: string) {
    const dateKey = toTxDateKey(transactionDate);
    if (!dateKey) return "—";
    return new Date(dateKey).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
  }
  const latestRatesByCurrency = useMemo(() => {
    const map = new Map<string, { dateKey: string; rate: number }>();
    Object.entries(fxRatesByDate).forEach(([dateKey, rates]) => {
      rates.forEach((r) => {
        if (r.rate > 0 && (!map.has(r.char_code) || dateKey > map.get(r.char_code)!.dateKey)) {
          map.set(r.char_code, { dateKey, rate: r.rate });
        }
      });
    });
    return map;
  }, [fxRatesByDate]);

  // Динамика по периоду (дата начала = дата появления актива, конец = дата закрытия или сегодня). Отдельно для балансовой и рыночной стоимости — для плашек в соответствующих разделах.
  const dynamicsByMode = useMemo(() => {
    if (!item || !costs) return { balance: null as unknown as ReturnType<typeof buildOne>, market: null as unknown as ReturnType<typeof buildOne>, primary: null as unknown as ReturnType<typeof buildOne> };
    const it = item;
    const c = costs;
    const dateStart = it.open_date ?? todayKey;
    const dateEnd = effectiveEndDate;
    const currencyCode = (it.currency_code ?? "RUB").toUpperCase();
    const points = costHistoryData?.points ?? [];
    const startPoint = points.find((p) => p.date === dateStart) ?? points.filter((p) => p.date <= dateStart).pop() ?? null;
    const endPoint = points.find((p) => p.date === dateEnd) ?? points.filter((p) => p.date <= dateEnd).pop() ?? null;

    const getRate = (dateKey: string): number | null => {
      const r = getRateForDate(fxRatesByDate, dateKey, currencyCode, latestRatesByCurrency, todayKey, sortedFxRateDateKeys);
      if (r != null) return r;
      if (currencyCode !== "RUB") return latestRatesByCurrency.get(currencyCode)?.rate ?? null;
      return null;
    };

    const isMarketOrCrypto = isMoexItem(it) || isCryptoItem(it);

    const txsInRange = (() => {
      const included = dynamicsTxs.filter((tx) => {
        const d = toTxDateKey(tx.transaction_date);
        if (d <= dateStart || d > dateEnd) return false;
        const delta = getTxDeltaForItem(tx, it.id, it.kind, it.currency_code);
        if (delta !== null) return true;
        if (isMarketOrCrypto && tx.related_item_id === it.id) return true;
        return false;
      });
      return included
        .map((tx) => {
          const res = getTxDeltaForItem(tx, it.id, it.kind, it.currency_code);
          if (res !== null) return { tx, deltaCents: res.deltaCents, inCurrency: res.inCurrency };
          if (isMarketOrCrypto && tx.related_item_id === it.id) {
            const inCurrency = currencyCode !== "RUB";
            return { tx, deltaCents: tx.amount ?? 0, inCurrency };
          }
          return { tx, deltaCents: 0, inCurrency: false };
        })
        .sort((a, b) => toTxDateKey(a.tx.transaction_date).localeCompare(toTxDateKey(b.tx.transaction_date)));
    })();

    let totalIncomeRub = 0;
    let totalExpenseRub = 0;
    let totalIncomeCur = 0;
    let totalExpenseCur = 0;
    let totalTransferRub = 0;
    let totalTransferCur = 0;
    let totalSaleRub = 0;
    let totalSaleCur = 0;
    const isCrypto = isCryptoItem(it);
    txsInRange.forEach(({ tx, deltaCents, inCurrency }) => {
      const d = toTxDateKey(tx.transaction_date);
      const rate = currencyCode !== "RUB" ? getRate(d) : null;
      let curUnits: number | null = null;
      let rubCents: number;
      if (currencyCode === "RUB") {
        rubCents = deltaCents;
      } else {
        if (inCurrency) {
          curUnits = deltaCents / 100;
          rubCents = rate != null ? Math.round(curUnits * rate * 100) : 0;
        } else {
          curUnits = rate != null ? (deltaCents / 100) / rate : null;
          rubCents = curUnits != null && rate != null ? Math.round(curUnits * rate * 100) : 0;
        }
      }
      if (tx.direction === "TRANSFER") {
        totalTransferRub += rubCents;
        if (curUnits != null) totalTransferCur += curUnits;
        return;
      }
      if (tx.direction === "INCOME") {
        totalIncomeRub += rubCents;
        if (curUnits != null) totalIncomeCur += curUnits;
        if (isMarketOrCrypto && tx.related_item_id === it.id && tx.asset_link_type === "ASSET_SALE") {
          totalSaleRub += rubCents;
          if (curUnits != null) totalSaleCur += curUnits;
        }
        return;
      }
      if (tx.direction === "EXPENSE") {
        totalExpenseRub += Math.abs(rubCents);
        if (curUnits != null) totalExpenseCur += Math.abs(curUnits);
      }
    });

    const displayFlowRub = totalExpenseRub - totalIncomeRub + totalTransferRub;
    const displayFlowCur = totalExpenseCur - totalIncomeCur + totalTransferCur;
    const netFlowRub = displayFlowRub;
    const netFlowCur = displayFlowCur;
    // Поток в рублях в том же знаке, что в плашках: Доходы (+), Расходы (−), Переводы (±). Тогда На начало + chipFlowRub + courseDiffRub = На конец.
    const chipFlowRub = totalIncomeRub - totalExpenseRub + totalTransferRub;

    let totalBuyQty = 0;
    let totalSellQty = 0;
    if (isMarketOrCrypto) {
      const getTxQty = (tx: TransactionOut) => {
        if (tx.related_item_id === it.id) return isCrypto ? (tx.primary_quantity_units ?? 0) : (tx.primary_quantity_lots ?? 0);
        if (tx.counterparty_item_id === it.id || tx.counterparty_card_item_id === it.id) return isCrypto ? (tx.counterparty_quantity_units ?? 0) : (tx.counterparty_quantity_lots ?? 0);
        if (tx.primary_item_id === it.id || tx.primary_card_item_id === it.id) return isCrypto ? (tx.primary_quantity_units ?? 0) : (tx.primary_quantity_lots ?? 0);
        return 0;
      };
      const getIsBuy = (tx: TransactionOut) => {
        if (tx.related_item_id === it.id) return tx.asset_link_type === "ASSET_PURCHASE";
        if (tx.counterparty_item_id === it.id || tx.counterparty_card_item_id === it.id) return true;
        return false;
      };
      txsInRange.forEach(({ tx }) => {
        const qty = getTxQty(tx);
        if (getIsBuy(tx)) totalBuyQty += qty;
        else totalSellQty += qty;
      });
    }

    function buildOne(primaryValueKind: PrimaryValueKind) {
      const isBalanceMode = primaryValueKind !== "MARKET";
      const isMarketMode = primaryValueKind === "MARKET";
      const valueFromPoint = (p: { market: number | null; balance: number }) =>
        isBalanceMode ? (p.balance ?? 0) : (isMarketOrCrypto ? (p.market ?? p.balance ?? 0) : (p.market ?? p.balance ?? 0));

      let initialRubCents: number | null;
      let initialCurCents: number;
      let finalRubCents: number | null;
      let finalCurCents: number;
      let qtyStart: number | null = null;
      let qtyEnd: number | null = null;

      if (startPoint) {
        const valCur = valueFromPoint(startPoint);
        initialCurCents = valCur;
        const rate = currencyCode !== "RUB" ? getRate(dateStart) : null;
        initialRubCents =
          currencyCode === "RUB"
            ? valCur
            : rate != null
              ? Math.round((valCur / 100) * rate * 100)
              : null;
        const pt = startPoint as { market_quantity_units?: number | null };
        if (isMarketOrCrypto && pt.market_quantity_units != null) qtyStart = pt.market_quantity_units;
      } else {
        initialRubCents = 0;
        initialCurCents = 0;
      }

      if (endPoint) {
        const valCur = valueFromPoint(endPoint);
        finalCurCents = valCur;
        const rate = currencyCode !== "RUB" ? getRate(dateEnd) : null;
        finalRubCents =
          currencyCode === "RUB"
            ? valCur
            : rate != null
              ? Math.round((valCur / 100) * rate * 100)
              : null;
        const pt = endPoint as { market_quantity_units?: number | null };
        if (isMarketOrCrypto && pt.market_quantity_units != null) qtyEnd = pt.market_quantity_units;
        else if (isMarketOrCrypto) {
          if (it.type_code === "crypto" && it.quantity_units != null) qtyEnd = it.quantity_units;
          else if (it.position_lots != null) qtyEnd = it.position_lots;
        }
      } else {
        if (isMarketOrCrypto) {
          // c.market — в валюте актива (копейки/центы)
          finalCurCents = c.market ?? 0;
          const rate = currencyCode !== "RUB" ? getRate(dateEnd) : null;
          finalRubCents =
            c.market_value_rub ??
            (currencyCode !== "RUB" && rate != null
              ? Math.round((finalCurCents / 100) * rate * 100)
              : (c.market ?? 0));
          if (it.type_code === "crypto" && it.quantity_units != null) qtyEnd = it.quantity_units;
          else if (it.position_lots != null) qtyEnd = it.position_lots;
        } else {
          // c.balance_currency_cents — в валюте актива (копейки/центы)
          finalCurCents = c.balance_currency_cents ?? 0;
          const rate = currencyCode !== "RUB" ? getRate(dateEnd) : null;
          finalRubCents =
            currencyCode === "RUB"
              ? finalCurCents
              : rate != null
                ? Math.round((finalCurCents / 100) * rate * 100)
                : null;
        }
      }

      if (isMarketOrCrypto && qtyEnd == null && qtyStart != null) {
        qtyEnd = qtyStart + totalBuyQty - totalSellQty;
      }

      const effectiveKind = getEffectiveItemKind(it, finalCurCents);
      const signedInitialRub = effectiveKind === "LIABILITY" ? -(initialRubCents ?? 0) : (initialRubCents ?? 0);
      const signedFinalRub = effectiveKind === "LIABILITY" ? -(finalRubCents ?? 0) : (finalRubCents ?? 0);
      const totalNonFlowRub = signedFinalRub - signedInitialRub - chipFlowRub;
      const profitLossFromPriceCur =
        currencyCode !== "RUB"
          ? (finalCurCents - initialCurCents) / 100 - netFlowCur
          : null;
      const rateEnd = currencyCode !== "RUB" ? getRate(dateEnd) : null;
      let courseDiffRub: number;
      let profitLossFromPriceRub: number;
      if (currencyCode !== "RUB") {
        if (isMarketMode && profitLossFromPriceCur != null && rateEnd != null) {
          profitLossFromPriceRub = Math.round(profitLossFromPriceCur * 100 * rateEnd);
          courseDiffRub = totalNonFlowRub - profitLossFromPriceRub;
        } else {
          courseDiffRub = totalNonFlowRub;
          profitLossFromPriceRub = totalNonFlowRub;
        }
      } else {
        courseDiffRub = 0;
        profitLossFromPriceRub = totalNonFlowRub;
      }
      const capitalFlowRub = totalSaleRub - totalExpenseRub + totalTransferRub;
      const capitalFlowCur = totalSaleCur - totalExpenseCur + totalTransferCur;
      const priceChangeRub = signedFinalRub - signedInitialRub - capitalFlowRub;
      const priceChangeCur =
        currencyCode !== "RUB"
          ? (finalCurCents - initialCurCents) / 100 - capitalFlowCur
          : priceChangeRub / 100;

      const rowGrowthPercent =
        initialRubCents != null && initialRubCents !== 0
          ? (effectiveKind === "LIABILITY"
            ? (Math.abs(signedFinalRub) - Math.abs(signedInitialRub)) / Math.abs(signedInitialRub) * 100
            : (signedFinalRub - signedInitialRub) / Math.abs(signedInitialRub) * 100)
          : null;

      return {
        dateStart,
        dateEnd,
        initialRubCents,
        initialCurCents,
        finalRubCents,
        finalCurCents,
        qtyStart,
        qtyEnd,
        netFlowRub,
        courseDiffRub,
        profitLossFromPriceRub,
        profitLossFromPriceCur,
        priceChangeRub,
        priceChangeCur,
        totalIncomeRub,
        totalExpenseRub,
        totalIncomeCur,
        totalExpenseCur,
        totalSaleRub,
        totalSaleCur,
        totalTransferRub,
        totalTransferCur,
        totalBuyQty,
        totalSellQty,
        rowGrowthPercent,
        effectiveKind,
        currencyCode,
        isMarketOrCrypto,
        isBalanceMode,
        isMarketMode,
      };
    }

    const primaryKind = (it.primary_value_kind ?? "BALANCE") as PrimaryValueKind;
    return {
      balance: buildOne("BALANCE"),
      market: buildOne("MARKET"),
      primary: buildOne(primaryKind),
    };
  }, [item, costs, costHistoryData, dynamicsTxs, fxRatesByDate, latestRatesByCurrency, sortedFxRateDateKeys, todayKey, effectiveEndDate]);

  const dynamics = dynamicsByMode.primary;
  const dynamicsBalance = dynamicsByMode.balance;
  const dynamicsMarket = dynamicsByMode.market;

  const handleEditClick = useCallback(() => {
    if (!item) return;
    setEditModalOpen(true);
  }, [item]);

  const handleBuySellClick = useCallback(() => {
    if (!item?.instrument_id) return;
    setBuySellModalOpen(true);
  }, [item?.instrument_id]);

  const handleArchiveClick = useCallback(async () => {
    if (!item) return;
    const ok = await askConfirm(
      "Архивировать актив?",
      "Актив будет перенесён в архив. Его можно будет найти в разделе архива."
    );
    if (!ok) return;
    setLoading(true);
    setError(null);
    try {
      await archiveItem(item.id);
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Ошибка архивации");
    } finally {
      setLoading(false);
    }
  }, [item, askConfirm, load]);

  const handleCloseClick = useCallback(() => {
    if (!item) return;
    setCloseDate(getTodayDateKey());
    setCloseDialogError(null);
    setCloseDialogOpen(true);
  }, [item]);

  const handleConfirmClose = useCallback(async () => {
    if (!item) return;
    setLoading(true);
    setCloseDialogError(null);
    try {
      await closeItem(item.id, { closing_date: closeDate });
      await load();
      setCloseDialogOpen(false);
    } catch (e: any) {
      setCloseDialogError(e?.message ?? "Не удалось закрыть актив");
    } finally {
      setLoading(false);
    }
  }, [item, closeDate, load]);

  const handleEditClosedAtOpen = useCallback(() => {
    if (!item?.closed_at) {
      setEditClosedAtDate(getTodayDateKey());
    } else {
      const d = item.closed_at.slice(0, 10);
      setEditClosedAtDate(d);
    }
    setEditClosedAtOpen(true);
  }, [item?.closed_at]);

  const handleEditClosedAtSave = useCallback(async () => {
    if (!item) return;
    setSavingClosedAt(true);
    setEditClosedAtError(null);
    try {
      const updated = await updateItemClosedAt(item.id, editClosedAtDate);
      setItem(updated);
      setEditClosedAtOpen(false);
    } catch (e: any) {
      setEditClosedAtError(e?.message ?? "Не удалось сохранить дату закрытия");
    } finally {
      setSavingClosedAt(false);
    }
  }, [item, editClosedAtDate]);

  const handleItemPhotoChange = useCallback(
    (file: File | null) => {
      if (!item) return;
      setItemPhotoError(null);
      if (!file) return;

      if (!(ALLOWED_PHOTO_TYPES as readonly string[]).includes(file.type)) {
        setItemPhotoError("Разрешены PNG, JPG или WEBP.");
        return;
      }
      if (file.size > MAX_PHOTO_BYTES) {
        setItemPhotoError(`Размер фотографии не больше ${formatSize(MAX_PHOTO_BYTES)}.`);
        return;
      }

      const objectUrl = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(objectUrl);
        if (image.width > MAX_PHOTO_DIM || image.height > MAX_PHOTO_DIM) {
          setItemPhotoError(`Разрешение не больше ${MAX_PHOTO_DIM}px.`);
          return;
        }
        setItemPhotoUploading(true);
        uploadItemPhoto(item.id, file)
          .then((updated) => {
            setItem(updated);
          })
          .catch((e: any) => {
            setItemPhotoError(e?.message ?? "Не удалось загрузить фотографию.");
          })
          .finally(() => {
            setItemPhotoUploading(false);
          });
      };
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        setItemPhotoError("Не удалось прочитать изображение.");
      };
      image.src = objectUrl;
    },
    [item]
  );

  const counterpartiesById = useMemo(() => {
    const map = new Map<number, CounterpartyOut>();
    counterparties.forEach((c) => map.set(c.id, c));
    return map;
  }, [counterparties]);

  const itemCounterparty: CounterpartyOut | null =
    item?.counterparty_id != null ? counterpartiesById.get(item.counterparty_id) ?? null : null;

  const {
    currentSrc: counterpartyCurrentSrc,
    onError: counterpartyOnError,
    showFallbackIcon: showCounterpartyIcon,
  } = useCounterpartyImage(itemCounterparty, API_BASE);

  const CounterpartyFallbackIcon = itemCounterparty
    ? itemCounterparty.entity_type === "PERSON"
      ? User
      : Building2
    : null;

  const { isDesktop } = useSidebar();

  const getRateForDateKey = useCallback(
    (dateKey: string): number | null => {
      const currencyCode = (item?.currency_code ?? "RUB").toUpperCase();
      if (currencyCode === "RUB") return 1;
      return getRateForDate(
        fxRatesByDate,
        dateKey,
        currencyCode,
        latestRatesByCurrency,
        todayKey,
        sortedFxRateDateKeys
      );
    },
    [item?.currency_code, fxRatesByDate, latestRatesByCurrency, todayKey, sortedFxRateDateKeys]
  );

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

  /** Только фактические/реализованные транзакции для блока «Количество» (плановые не показываем). */
  const quantityHistoryTxActual = useMemo(
    () => quantityHistoryTx.filter((tx) => tx.transaction_type === "ACTUAL" || tx.status === "REALIZED"),
    [quantityHistoryTx]
  );

  const quantityHistoryRows = useMemo(() => {
    const openDate = item?.open_date ?? "";
    const fromOpen = openDate
      ? quantityHistoryTxActual.filter((tx) => (tx.transaction_date || "").slice(0, 10) >= openDate)
      : quantityHistoryTxActual;
    const sorted = [...fromOpen].sort((a, b) => {
      const dateA = a.transaction_date || "";
      const dateB = b.transaction_date || "";
      const d = dateA.localeCompare(dateB);
      if (d !== 0) return d;
      return (a.id ?? 0) - (b.id ?? 0);
    });
    const isCrypto = item?.type_code === "crypto";
    const itemId = item?.id;
    const getTxQty = (tx: TransactionOut) => {
      if (itemId == null) return 0;
      if (tx.related_item_id === itemId) {
        return isCrypto ? (tx.primary_quantity_units ?? 0) : (tx.primary_quantity_lots ?? 0);
      }
      if (tx.counterparty_item_id === itemId) {
        return isCrypto ? (tx.counterparty_quantity_units ?? 0) : (tx.counterparty_quantity_lots ?? 0);
      }
      if (tx.primary_item_id === itemId) {
        return isCrypto ? (tx.primary_quantity_units ?? 0) : (tx.primary_quantity_lots ?? 0);
      }
      return 0;
    };
    const getIsBuy = (tx: TransactionOut) => {
      if (itemId == null) return false;
      if (tx.related_item_id === itemId) return tx.asset_link_type === "ASSET_PURCHASE";
      if (tx.counterparty_item_id === itemId) return true;
      return false;
    };
    let totalBuy = 0;
    let totalSell = 0;
    sorted.forEach((tx) => {
      const qty = getTxQty(tx);
      if (getIsBuy(tx)) totalBuy += qty;
      else totalSell += qty;
    });
    const current = isCrypto ? (item?.quantity_units ?? 0) : (item?.position_lots ?? 0);
    const startQty = current - totalBuy + totalSell;
    let balance = startQty;
    return sorted.map((tx) => {
      const qty = getTxQty(tx);
      const isBuy = getIsBuy(tx);
      const delta = isBuy ? qty : -qty;
      balance += delta;
      const costCents = tx.amount ?? 0;
      const priceCents = qty > 0 ? Math.round(costCents / qty) : null;
      return { tx, type: isBuy ? "Покупка" as const : "Продажа" as const, delta, balanceAfter: balance, priceCents, costCents };
    });
  }, [quantityHistoryTxActual, item?.id, item?.open_date, item?.position_lots, item?.quantity_units, item?.type_code]);

  const quantitySummary = useMemo(() => {
    const openDate = item?.open_date ?? "";
    const fromOpen = openDate
      ? quantityHistoryTxActual.filter((tx) => (tx.transaction_date || "").slice(0, 10) >= openDate)
      : quantityHistoryTxActual;
    const isCrypto = item?.type_code === "crypto";
    const itemId = item?.id;
    const getTxQty = (tx: TransactionOut) => {
      if (itemId == null) return 0;
      if (tx.related_item_id === itemId) {
        return isCrypto ? (tx.primary_quantity_units ?? 0) : (tx.primary_quantity_lots ?? 0);
      }
      if (tx.counterparty_item_id === itemId) {
        return isCrypto ? (tx.counterparty_quantity_units ?? 0) : (tx.counterparty_quantity_lots ?? 0);
      }
      if (tx.primary_item_id === itemId) {
        return isCrypto ? (tx.primary_quantity_units ?? 0) : (tx.primary_quantity_lots ?? 0);
      }
      return 0;
    };
    const getIsBuy = (tx: TransactionOut) => {
      if (itemId == null) return false;
      if (tx.related_item_id === itemId) return tx.asset_link_type === "ASSET_PURCHASE";
      if (tx.counterparty_item_id === itemId) return true;
      return false;
    };
    let totalBuy = 0;
    let totalSell = 0;
    fromOpen.forEach((tx) => {
      const qty = getTxQty(tx);
      if (getIsBuy(tx)) totalBuy += qty;
      else totalSell += qty;
    });
    const current = isCrypto ? (item?.quantity_units ?? 0) : (item?.position_lots ?? 0);
    const startQty = current - totalBuy + totalSell;
    return { startQty, totalBuy, totalSell, current };
  }, [quantityHistoryTxActual, item?.id, item?.open_date, item?.position_lots, item?.quantity_units, item?.type_code]);

  const qtyChartSeries = useMemo(() => {
    if (!costHistoryData?.points.length) return [];
    return costHistoryData.points
      .filter((p) => p.market_quantity_units != null)
      .map((p) => ({ date: p.date, value: p.market_quantity_units! }));
  }, [costHistoryData]);

  const costChartSeries = useMemo(() => {
    if (!costHistoryOpen || !costHistoryData?.points.length) return [];
    const key = costHistoryOpen === "balance" ? "balance" : costHistoryOpen === "acquisition" ? "acquisition" : costHistoryOpen === "invested" ? "invested" : "market";
    const raw = costHistoryData.points.map((p) => {
      let valueRub: number;
      if (key === "market" && p.market_price_rub != null && p.market_quantity_units != null) {
        valueRub = (p.market_price_rub * p.market_quantity_units) / 100;
      } else {
        valueRub = ((p as unknown as Record<string, number | null>)[key] ?? 0) / 100;
      }
      const hasValue = key === "market"
        ? (p.market_price_rub != null && p.market_quantity_units != null) || p.market != null
        : (p as unknown as Record<string, number | null>)[key] != null;
      const base = { date: p.date, valueRub, hasValue };
      if (key === "market") {
        return {
          ...base,
          marketQuantityUnits: p.market_quantity_units ?? undefined,
          marketPriceRub: p.market_price_rub ?? undefined,
        };
      }
      return base;
    });
    // Для рыночной стоимости: начальные даты без цены заполняем первой известной ценой (forward-fill), чтобы график не показывал нули
    if (key === "market") {
      const firstWithValue = raw.find((p) => p.hasValue && p.valueRub > 0);
      const fillValue = firstWithValue?.valueRub ?? 0;
      return raw.map((p) =>
        !p.hasValue && fillValue > 0 ? { ...p, valueRub: fillValue } : p
      );
    }
    return raw;
  }, [costHistoryOpen, costHistoryData]);

  // Источник истины — валюта счёта: costChartSeries в минорных единицах валюты актива. В режиме RUB пересчитываем по курсу на дату точки (рубли меняются от курса).
  const costChartDisplaySeries = useMemo(() => {
    if (!item?.currency_code || item.currency_code === "RUB") return costChartSeries;
    if (costChartCurrency === "CURRENCY") return costChartSeries; // в валюте актива — как есть (стабильная сумма)
    // RUB: рублёвый эквивалент = сумма в валюте актива × курс на дату точки (курс на каждую дату — рубли колеблются)
    const latestRate = latestRatesByCurrency.get((item.currency_code ?? "").toUpperCase())?.rate ?? null;
    return costChartSeries.map((p) => {
      const rate = getRateForDateKey(p.date) ?? latestRate;
      const valueInRub = rate != null && rate > 0 ? p.valueRub * rate : (latestRate != null ? p.valueRub * latestRate : p.valueRub);
      return { ...p, valueRub: valueInRub };
    });
  }, [costChartSeries, costChartCurrency, item?.currency_code, getRateForDateKey, latestRatesByCurrency]);

  useEffect(() => {
    if (!costHistoryOpen || costChartSeries.length === 0) setCostChartContainerReady(false);
  }, [costHistoryOpen, costChartSeries.length]);

  useEffect(() => {
    setCostChartHoverIndex(null);
    setCostChartTooltipLeft(null);
    // Для инвалютного актива по умолчанию — валюта счёта (источник истины); в RUB — пересчёт по курсу на дату.
    setCostChartCurrency(item?.currency_code && item.currency_code !== "RUB" ? "CURRENCY" : "RUB");
  }, [costHistoryOpen, item?.currency_code]);

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
  }, [costChartContainerReady, costHistoryOpen]);

  const costChartPadding = useMemo(() => ({ top: 24, right: 120, bottom: 44, left: 0 }), []);
  const costChartGeometry = useMemo(() => {
    if (costChartDisplaySeries.length === 0) return null;
    const width = costChartSize.width;
    const height = costChartSize.height;
    const padding = costChartPadding;
    const innerWidth = width - padding.left - padding.right;
    const innerHeight = height - padding.top - padding.bottom;
    const values = costChartDisplaySeries.map((p) => p.valueRub);
    const minVal = values.length ? Math.min(...values) : 0;
    const maxVal = values.length ? Math.max(...values) : 0;
    const rangePadding = Math.max(Math.max(maxVal, Math.abs(minVal)) * 0.12, 1);
    const paddedMin = minVal < 0 ? minVal - rangePadding : 0;
    const paddedMax = maxVal + rangePadding;
    const ticks = buildTicks(paddedMin, paddedMax);
    const chartMin = ticks[0] ?? 0;
    const chartMax = ticks[ticks.length - 1] ?? 1;
    const valueToRatio = (v: number) => (v - chartMin) / (chartMax - chartMin || 1);
    const zeroRatio = Math.max(0, Math.min(1, valueToRatio(0)));
    const baselineY = padding.top + innerHeight - innerHeight * zeroRatio;
    const averageValue = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    const averageLineY = padding.top + innerHeight - innerHeight * Math.max(0, Math.min(1, valueToRatio(averageValue)));
    const points: ChartPoint[] = costChartDisplaySeries.map((p, i) => {
      const progress = costChartDisplaySeries.length <= 1 ? 0 : i / (costChartDisplaySeries.length - 1);
      const x = padding.left + innerWidth * progress;
      const y = padding.top + innerHeight - innerHeight * valueToRatio(p.valueRub);
      return { x, y, value: p.valueRub };
    });
    const pointsWithZero = insertZeroCrossings(points, baselineY);
    const { positive: posSegments, negative: negSegments } = splitSegmentsBySign(pointsWithZero);
    const linePathPositiveSegments = posSegments.map((seg) => buildLinePath(seg)).filter(Boolean);
    const areaPathPositiveSegments = posSegments.map((seg) => buildAreaPath(seg, baselineY)).filter(Boolean);
    const linePathNegativeSegments = negSegments.map((seg) => buildLinePath(seg)).filter(Boolean);
    const areaPathNegativeSegments = negSegments.map((seg) => buildAreaPath(seg, baselineY)).filter(Boolean);
    const dayMarks: { label: string; x: number }[] = [];
    const step = Math.max(1, Math.ceil(costChartDisplaySeries.length / 7));
    for (let i = 0; i < costChartDisplaySeries.length; i += step) {
      const p = costChartDisplaySeries[i];
      if (!p) continue;
      const progress = costChartDisplaySeries.length <= 1 ? 0 : i / (costChartDisplaySeries.length - 1);
      dayMarks.push({ label: formatChartDate(new Date(p.date)), x: padding.left + innerWidth * progress });
    }
    if (costChartDisplaySeries.length > 0 && dayMarks.length > 0) {
      const lastX = padding.left + innerWidth;
      if (Math.abs((dayMarks[dayMarks.length - 1]?.x ?? 0) - lastX) > 2) {
        const last = costChartDisplaySeries[costChartDisplaySeries.length - 1]!;
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
      linePathPositiveSegments,
      areaPathPositiveSegments,
      linePathNegativeSegments,
      areaPathNegativeSegments,
      averageValue,
      averageLineY,
    };
  }, [costChartDisplaySeries, costChartSize, costChartPadding]);

  const costChartDividers = useMemo(() => {
    if (!costChartGeometry || costChartSeries.length <= 1) return [];
    const divs: { x: number; type: "month" | "year" }[] = [];
    const n = costChartSeries.length;
    const { padding, innerWidth } = costChartGeometry;
    for (let i = 1; i < n; i++) {
      const prevDate = costChartSeries[i - 1]!.date;
      const currDate = costChartSeries[i]!.date;
      const prevYear = parseInt(prevDate.slice(0, 4), 10);
      const prevMonth = parseInt(prevDate.slice(5, 7), 10);
      const currYear = parseInt(currDate.slice(0, 4), 10);
      const currMonth = parseInt(currDate.slice(5, 7), 10);
      const progress = (n - 1) > 0 ? i / (n - 1) : 0;
      const x = padding.left + innerWidth * progress;
      if (currYear !== prevYear) divs.push({ x, type: "year" });
      else if (currMonth !== prevMonth) divs.push({ x, type: "month" });
    }
    return divs;
  }, [costChartGeometry, costChartSeries]);

  const costChartHoverPoint = useMemo(() => {
    if (costChartHoverIndex == null || !costChartGeometry || costChartDisplaySeries.length === 0) return null;
    const progress = costChartDisplaySeries.length <= 1 ? 0 : costChartHoverIndex / (costChartDisplaySeries.length - 1);
    const x = costChartGeometry.padding.left + costChartGeometry.innerWidth * progress;
    const value = costChartDisplaySeries[costChartHoverIndex]!.valueRub;
    const y =
      costChartGeometry.padding.top +
      costChartGeometry.innerHeight -
      costChartGeometry.innerHeight * costChartGeometry.valueToRatio(value);
    return { x, y, value };
  }, [costChartHoverIndex, costChartDisplaySeries, costChartGeometry]);

  const costChartCheckpointLines = useMemo(() => {
    if (costHistoryOpen !== "balance" || checkpoints.length === 0 || !costChartGeometry || costChartDisplaySeries.length === 0) return [];
    const series = costChartDisplaySeries;
    const n = series.length;
    const { padding, innerWidth } = costChartGeometry;
    const byDate = new Map<string, BalanceCheckpointOut[]>();
    for (const cp of checkpoints) {
      const dateKey = cp.checkpoint_at.slice(0, 10);
      if (!byDate.has(dateKey)) byDate.set(dateKey, []);
      byDate.get(dateKey)!.push(cp);
    }
    const result: { dateKey: string; x: number; checkpoints: BalanceCheckpointOut[] }[] = [];
    for (const [dateKey, cps] of byDate) {
      const idx = series.findIndex((p) => p.date >= dateKey);
      const i = idx >= 0 ? idx : n - 1;
      const progress = n <= 1 ? 0 : i / (n - 1);
      const x = padding.left + innerWidth * progress;
      result.push({ dateKey, x, checkpoints: cps });
    }
    return result;
  }, [costHistoryOpen, checkpoints, costChartGeometry, costChartDisplaySeries]);

  const qtyChartPadding = costChartPadding;
  const qtyChartGeometry = useMemo(() => {
    if (qtyChartSeries.length === 0) return null;
    const width = qtyChartSize.width;
    const height = qtyChartSize.height;
    const padding = qtyChartPadding;
    const innerWidth = width - padding.left - padding.right;
    const innerHeight = height - padding.top - padding.bottom;
    const values = qtyChartSeries.map((p) => p.value);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const rangePadding = Math.max(Math.max(maxVal, Math.abs(minVal)) * 0.12, 1);
    const paddedMin = minVal < 0 ? minVal - rangePadding : 0;
    const paddedMax = maxVal + rangePadding;
    const ticks = buildTicks(paddedMin, paddedMax);
    const chartMin = ticks[0] ?? 0;
    const chartMax = ticks[ticks.length - 1] ?? 1;
    const valueToRatio = (v: number) => (v - chartMin) / (chartMax - chartMin || 1);
    const zeroRatio = Math.max(0, Math.min(1, valueToRatio(0)));
    const baselineY = padding.top + innerHeight - innerHeight * zeroRatio;
    const points: ChartPoint[] = qtyChartSeries.map((p, i) => {
      const progress = qtyChartSeries.length <= 1 ? 0 : i / (qtyChartSeries.length - 1);
      const x = padding.left + innerWidth * progress;
      const y = padding.top + innerHeight - innerHeight * valueToRatio(p.value);
      return { x, y, value: p.value };
    });
    const dayMarks: { label: string; x: number }[] = [];
    const step = Math.max(1, Math.ceil(qtyChartSeries.length / 7));
    for (let i = 0; i < qtyChartSeries.length; i += step) {
      const p = qtyChartSeries[i];
      if (!p) continue;
      const progress = qtyChartSeries.length <= 1 ? 0 : i / (qtyChartSeries.length - 1);
      dayMarks.push({ label: formatChartDate(new Date(p.date)), x: padding.left + innerWidth * progress });
    }
    if (qtyChartSeries.length > 0 && dayMarks.length > 0) {
      const lastX = padding.left + innerWidth;
      if (Math.abs((dayMarks[dayMarks.length - 1]?.x ?? 0) - lastX) > 2) {
        const last = qtyChartSeries[qtyChartSeries.length - 1]!;
        dayMarks.push({ label: formatChartDate(new Date(last.date)), x: lastX });
      }
    }
    return { width, height, padding, innerWidth, innerHeight, points, linePath: buildLinePath(points), areaPath: buildAreaPath(points, baselineY), baselineY, ticks, dayMarks, valueToRatio, chartMin, chartMax };
  }, [qtyChartSeries, qtyChartSize, qtyChartPadding]);

  const qtyChartDividers = useMemo(() => {
    if (!qtyChartGeometry || qtyChartSeries.length <= 1) return [];
    const divs: { x: number; type: "month" | "year" }[] = [];
    const n = qtyChartSeries.length;
    const { padding, innerWidth } = qtyChartGeometry;
    for (let i = 1; i < n; i++) {
      const prevDate = qtyChartSeries[i - 1]!.date;
      const currDate = qtyChartSeries[i]!.date;
      const prevYear = parseInt(prevDate.slice(0, 4), 10);
      const prevMonth = parseInt(prevDate.slice(5, 7), 10);
      const currYear = parseInt(currDate.slice(0, 4), 10);
      const currMonth = parseInt(currDate.slice(5, 7), 10);
      const progress = (n - 1) > 0 ? i / (n - 1) : 0;
      const x = padding.left + innerWidth * progress;
      if (currYear !== prevYear) divs.push({ x, type: "year" });
      else if (currMonth !== prevMonth) divs.push({ x, type: "month" });
    }
    return divs;
  }, [qtyChartGeometry, qtyChartSeries]);

  const qtyChartHoverPoint = useMemo(() => {
    if (qtyChartHoverIndex == null || !qtyChartGeometry || qtyChartSeries.length === 0) return null;
    const progress = qtyChartSeries.length <= 1 ? 0 : qtyChartHoverIndex / (qtyChartSeries.length - 1);
    const x = qtyChartGeometry.padding.left + qtyChartGeometry.innerWidth * progress;
    const value = qtyChartSeries[qtyChartHoverIndex]!.value;
    const y = qtyChartGeometry.padding.top + qtyChartGeometry.innerHeight - qtyChartGeometry.innerHeight * qtyChartGeometry.valueToRatio(value);
    return { x, y, value };
  }, [qtyChartHoverIndex, qtyChartSeries, qtyChartGeometry]);

  const profitability = useMemo(() => {
    if (!item || !costHistoryData?.points?.length) return null;

    const dateStart = item.open_date ?? todayKey;
    const dateEnd = effectiveEndDate;
    if (!dateStart || !dateEnd) return null;

    const primaryKind = (item.primary_value_kind ?? "BALANCE") as PrimaryValueKind | "BALANCE";
    const pointsInRange = costHistoryData.points.filter(
      (p) => p.date >= dateStart && p.date <= dateEnd
    );
    if (pointsInRange.length === 0) return null;

    // API: для не-RUB актива все поля точки (balance, acquisition, invested, market) — в центах валюты актива.
    // Для расчёта рентабельности в рублях знаменатель — среднедневная стоимость в рублёвых эквивалентах (по курсу на дату точки).
    const itemCurrency = (item.currency_code ?? "RUB").toUpperCase();
    const isCurrencyAsset = itemCurrency !== "RUB";
    const selectValueInRub = (p: (typeof costHistoryData.points)[number]): number => {
      let raw = 0;
      if (primaryKind === "MARKET") {
        raw = p.market ?? p.balance ?? 0;
      } else if (primaryKind === "ACQUISITION") {
        raw = p.acquisition ?? 0;
      } else if (primaryKind === "INVESTED") {
        raw = p.invested ?? 0;
      } else {
        raw = p.balance ?? 0;
      }
      if (isCurrencyAsset && raw !== 0) {
        const rate = getRateForDateKey(p.date);
        return (raw / 100) * (rate ?? 0);
      }
      return raw / 100;
    };

    const values = pointsInRange.map((p) => selectValueInRub(p));
    const sumValues = values.reduce((acc, v) => acc + v, 0);
    const avgDailyRub = values.length > 0 ? sumValues / values.length : 0;

    // Среднедневная стоимость в валюте актива: по тому же виду стоимости (balance/market/acquisition/invested), что и для рублёвой средней.
    let avgDailyCurrency: number | null = null;
    if (isCurrencyAsset) {
      const selectValueInCurrency = (p: (typeof costHistoryData.points)[number]): number | null => {
        let raw = 0;
        if (primaryKind === "MARKET") {
          raw = p.market ?? p.balance ?? 0;
        } else if (primaryKind === "ACQUISITION") {
          raw = p.acquisition ?? 0;
        } else if (primaryKind === "INVESTED") {
          raw = p.invested ?? 0;
        } else {
          raw = p.balance ?? 0;
        }
        return raw !== 0 ? raw / 100 : null;
      };
      const valuesCurrency = pointsInRange.map(selectValueInCurrency).filter((v): v is number => v != null);
      avgDailyCurrency = valuesCurrency.length > 0 ? valuesCurrency.reduce((a, b) => a + b, 0) / valuesCurrency.length : null;
    }

    const daysCount = daysBetween(dateStart, dateEnd);
    const annualFactor = daysCount > 0 ? 365 / daysCount : 0;

    const itemId = item.id;
    const txs = dynamicsTxs.filter((tx) => {
      const dKey = toTxDateKey(tx.transaction_date);
      if (!dKey || dKey < dateStart || dKey > dateEnd) return false;
      if (tx.related_item_id !== itemId) return false;
      const isRealized =
        tx.transaction_type === "ACTUAL" || tx.status === "REALIZED";
      if (!isRealized) return false;
      return Boolean(tx.asset_link_type);
    });

    // costs.income_rub / costs.expense_rub — в рублях (копейки); для валюты актива пересчитываем по курсу на дату конца периода
    const incomeRubCents = costs?.income_rub ?? 0;
    const expenseRubCents = costs?.expense_rub ?? 0;
    const rateEndOfPeriod = isCurrencyAsset ? getRateForDateKey(dateEnd) : null;
    let incomeAssetCents = incomeRubCents;
    let expenseAssetCents = expenseRubCents;
    if (isCurrencyAsset && rateEndOfPeriod && rateEndOfPeriod > 0) {
      incomeAssetCents = Math.round(incomeRubCents / rateEndOfPeriod);
      expenseAssetCents = Math.round(expenseRubCents / rateEndOfPeriod);
    }

    let incomeFromSaleCents = 0;
    let expenseAcquisitionCents = 0;
    let investmentInAssetCents = 0;
    txs.forEach((tx) => {
      const amt = tx.amount ?? 0;
      switch (tx.asset_link_type) {
        case "ASSET_SALE":
          incomeFromSaleCents += amt;
          break;
        case "ASSET_PURCHASE":
          expenseAcquisitionCents += amt;
          break;
        case "ASSET_INVESTMENT":
          investmentInAssetCents += amt;
          break;
        default:
          break;
      }
    });

    // Рентабельность актива
    let incomeFromAssetInCurrency: number | null = null;
    let expenseForAssetInCurrency: number | null = null;
    if (isCurrencyAsset && rateEndOfPeriod && rateEndOfPeriod > 0) {
      incomeFromAssetInCurrency = incomeAssetCents / 100;
      expenseForAssetInCurrency = expenseAssetCents / 100;
    }

    let yieldAssetAnnualRub: number | null = null;
    const fxProfitRubCents = dynamics?.courseDiffRub ?? 0;
    if (avgDailyRub > 0 && annualFactor > 0) {
      const numeratorRub = (incomeRubCents - expenseRubCents + fxProfitRubCents) / 100;
      yieldAssetAnnualRub = (numeratorRub / avgDailyRub) * annualFactor;
    }
    let yieldAssetAnnualCurrency: number | null = null;
    if (
      isCurrencyAsset &&
      avgDailyCurrency != null &&
      avgDailyCurrency > 0 &&
      annualFactor > 0 &&
      incomeFromAssetInCurrency != null &&
      expenseForAssetInCurrency != null
    ) {
      yieldAssetAnnualCurrency =
        ((incomeFromAssetInCurrency - expenseForAssetInCurrency) / avgDailyCurrency) * annualFactor;
    }

    // Стоимости: API отдаёт acquisition_rub, invested_rub в рублях; для расчёта доходности переводим в валюту актива
    const acquisitionRubCents = costs?.acquisition_rub ?? 0;
    const investedRubCents = costs?.invested_rub ?? 0;
    const acquisitionCents =
      !isCurrencyAsset ? acquisitionRubCents : (rateEndOfPeriod && rateEndOfPeriod > 0 ? Math.round(acquisitionRubCents / rateEndOfPeriod) : acquisitionRubCents);
    const investedCents =
      !isCurrencyAsset ? investedRubCents : (rateEndOfPeriod && rateEndOfPeriod > 0 ? Math.round(investedRubCents / rateEndOfPeriod) : investedRubCents);

    const hasMarketPrimary = primaryKind === "MARKET";

    // Стоимость продажи: рыночная (market_rub — в валюте актива) → сумма продаж → балансовая
    let sellValueCentsAsset: number | null = null;
    if (costs) {
      if (costs.market_rub != null) {
        sellValueCentsAsset = costs.market_rub;
      } else if (incomeFromSaleCents !== 0) {
        sellValueCentsAsset = incomeFromSaleCents;
      } else {
        sellValueCentsAsset = costs.balance_currency_cents ?? null;
      }
    }

    // Доходность вложений в актив в валюте актива:
    // ((Доход − Расход) + (Стоимость продажи − Вложения)) / Вложения × (365 / дней)
    let yieldInvestmentsAnnualCurrency: number | null = null;
    if (investedCents > 0 && annualFactor > 0 && sellValueCentsAsset != null) {
      const profitCurrency =
        (incomeAssetCents - expenseAssetCents) +
        (sellValueCentsAsset - investedCents);
      yieldInvestmentsAnnualCurrency =
        (profitCurrency / investedCents) * annualFactor;
    }

    // Доходность вложений в актив в рублях
    let yieldInvestmentsAnnualRub: number | null = null;
    if (annualFactor > 0 && sellValueCentsAsset != null) {
      if (!isCurrencyAsset) {
        if (investedCents > 0) {
          const profitRub =
            (incomeRubCents - expenseRubCents) +
            (sellValueCentsAsset - investedCents);
          yieldInvestmentsAnnualRub =
            (profitRub / investedCents) * annualFactor;
        }
      } else if (rateEndOfPeriod && rateEndOfPeriod > 0) {
        const toRub = (cents: number) =>
          Math.round((cents / 100) * rateEndOfPeriod * 100);
        const investedRubCentsCalc = toRub(investedCents);
        const sellRubCentsCalc =
          costs?.market_value_rub ?? toRub(sellValueCentsAsset);
        if (investedRubCentsCalc > 0 && sellRubCentsCalc != null) {
          const profitRub =
            (incomeRubCents - expenseRubCents) +
            (sellRubCentsCalc - investedRubCentsCalc);
          yieldInvestmentsAnnualRub =
            (profitRub / investedRubCentsCalc) * annualFactor;
        }
      }
    }

    const revaluationProfitRub = dynamics?.profitLossFromPriceRub ?? null;
    const fxProfitRub = dynamics?.courseDiffRub ?? null;

    return {
      dateStart,
      dateEnd,
      daysCount,
      annualFactor,
      primaryKind,
      avgDailyRub,
      avgDailyCurrency,
      incomeFromAsset: incomeAssetCents,
      incomeFromSale: incomeFromSaleCents,
      expenseForAsset: expenseAssetCents,
      expenseAcquisition: expenseAcquisitionCents,
      incomeFromAssetInCurrency: incomeFromAssetInCurrency ?? null,
      expenseForAssetInCurrency: expenseForAssetInCurrency ?? null,
      investmentInAsset: investmentInAssetCents,
      yieldAssetAnnualRub,
      yieldAssetAnnualCurrency,
      acquisitionCents,
      investedCents,
      hasMarketPrimary,
      currentMarketValueCents: sellValueCentsAsset,
      yieldInvestmentsAnnualRub,
      yieldInvestmentsAnnualCurrency,
      revaluationProfitRub,
      fxProfitRub,
    };
  }, [item, todayKey, effectiveEndDate, costHistoryData, dynamicsTxs, dynamics, costs, getRateForDateKey]);

  /** Показатели рентабельности и доходности вложений для размещения справа от параметров актива в шапке */
  const profitabilityCardsInHeader = useMemo(() => {
    if (!costs || !profitability) return null;
    const currencyCode = (item?.currency_code ?? "RUB").toUpperCase();
    const isCurrencyAsset = currencyCode !== "RUB";
    const fmt = (n: number) => new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
    const pctFmt = (n: number) => new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n * 100);
    const gradientStyle = { background: PINK_GRADIENT, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" } as React.CSSProperties;
    const rentHasRub = profitability.yieldAssetAnnualRub != null;
    const rentHasCur = isCurrencyAsset && profitability.yieldAssetAnnualCurrency != null;
    const invHasRub = profitability.yieldInvestmentsAnnualRub != null;
    const invHasCur = isCurrencyAsset && profitability.yieldInvestmentsAnnualCurrency != null;
    const showRent = rentHasRub || rentHasCur;
    const showInv = profitability.hasMarketPrimary && (invHasRub || invHasCur);
    if (!showRent && !showInv) return null;
    const rentRubNumerator = (profitability.incomeFromAsset - profitability.expenseForAsset) / 100 + (profitability.fxProfitRub ?? 0) / 100;
    const rentRubTooltip = (
      <div className="space-y-1.5 text-left">
        <div className="font-medium">Рентабельность (RUB)</div>
        <div>Формула: (Доход − Расход + Курсовые разницы) / Среднедневная стоимость × (365 / дней)</div>
        <div>Доход: {formatAmount(profitability.incomeFromAsset)} ₽</div>
        <div>Расход: {formatAmount(profitability.expenseForAsset)} ₽</div>
        {profitability.fxProfitRub != null && profitability.fxProfitRub !== 0 && (
          <div>Курсовые разницы: {formatAmount(profitability.fxProfitRub)} ₽</div>
        )}
        <div>Среднедневная стоимость: {formatAmount(Math.round(profitability.avgDailyRub * 100))} ₽</div>
        <div>Период: {profitability.dateStart} — {profitability.dateEnd} ({profitability.daysCount} дн.)</div>
        <div className="pt-0.5 border-t border-white/10">
          Расчёт: ({fmt(rentRubNumerator)} / {fmt(profitability.avgDailyRub)}) × {fmt(profitability.annualFactor)} = {profitability.yieldAssetAnnualRub! > 0 ? "+" : ""}{pctFmt(profitability.yieldAssetAnnualRub!)}%
        </div>
      </div>
    );
    const rentCurTooltip = profitability.incomeFromAssetInCurrency != null && profitability.expenseForAssetInCurrency != null && profitability.avgDailyCurrency != null ? (
      <div className="space-y-1.5 text-left">
        <div className="font-medium">Рентабельность ({currencyCode})</div>
        <div>Формула: (Доход − Расход) / Среднедневная стоимость × (365 / дней)</div>
        <div>Доход: {fmt(profitability.incomeFromAssetInCurrency)} {currencyCode}</div>
        <div>Расход: {fmt(profitability.expenseForAssetInCurrency)} {currencyCode}</div>
        <div>Среднедневная стоимость: {fmt(profitability.avgDailyCurrency)} {currencyCode}</div>
        <div>Период: {profitability.dateStart} — {profitability.dateEnd} ({profitability.daysCount} дн.)</div>
        <div className="pt-0.5 border-t border-white/10">
          Расчёт: ({fmt(profitability.incomeFromAssetInCurrency - profitability.expenseForAssetInCurrency)} / {fmt(profitability.avgDailyCurrency)}) × {fmt(profitability.annualFactor)} = {profitability.yieldAssetAnnualCurrency! > 0 ? "+" : ""}{pctFmt(profitability.yieldAssetAnnualCurrency!)}%
        </div>
      </div>
    ) : null;
    const invRubTooltip = (
      <div className="space-y-1.5 text-left">
        <div className="font-medium">Доходность вложений (RUB)</div>
        <div>Формула: ((Доход − Расход) + (Стоимость продажи − Вложения)) / Вложения × (365 / дней)</div>
        <div>Доход: {formatAmount(profitability.incomeFromAsset)} ₽</div>
        <div>Расход: {formatAmount(profitability.expenseForAsset)} ₽</div>
        <div>Стоимость продажи: {profitability.currentMarketValueCents != null ? formatAmount(profitability.currentMarketValueCents) : "—"}</div>
        <div>Вложения: {formatAmount(profitability.investedCents)}</div>
        <div>Период: {profitability.dateStart} — {profitability.dateEnd} ({profitability.daysCount} дн.)</div>
      </div>
    );
    const invCurTooltip = isCurrencyAsset && profitability.yieldInvestmentsAnnualCurrency != null ? (
      <div className="space-y-1.5 text-left">
        <div className="font-medium">Доходность вложений ({currencyCode})</div>
        <div>Формула: ((Доход − Расход) + (Стоимость продажи − Вложения)) / Вложения × (365 / дней)</div>
        <div>Доход: {profitability.incomeFromAssetInCurrency != null ? fmt(profitability.incomeFromAssetInCurrency) : "—"} {currencyCode}</div>
        <div>Расход: {profitability.expenseForAssetInCurrency != null ? fmt(profitability.expenseForAssetInCurrency) : "—"} {currencyCode}</div>
        <div>Стоимость продажи: {profitability.currentMarketValueCents != null ? fmt(profitability.currentMarketValueCents / 100) : "—"} {currencyCode}</div>
        <div>Вложения: {fmt(profitability.investedCents / 100)} {currencyCode}</div>
        <div>Период: {profitability.dateStart} — {profitability.dateEnd} ({profitability.daysCount} дн.)</div>
      </div>
    ) : null;
    const PctCard = ({ value, tooltip, code }: { value: number; tooltip: React.ReactNode; code: string }) => (
      <div className="flex flex-row items-center gap-2">
        <CurrencyChip code={code} className="shrink-0" />
        <Tooltip content={tooltip} side="bottom">
          <span
            className="tabular-nums italic text-4xl font-semibold cursor-help whitespace-nowrap"
            style={value >= 0 ? gradientStyle : { color: RED }}
          >
            {value > 0 ? "+" : ""}{pctFmt(value)}%
          </span>
        </Tooltip>
      </div>
    );
    return (
      <div className={`flex flex-col gap-3 ${showRent && showInv ? "sm:flex-row" : ""}`}>
        {showRent && (
          <div className="flex flex-col items-center gap-2">
            <div className="flex flex-col items-center gap-2">
              {rentHasRub && <PctCard value={profitability.yieldAssetAnnualRub!} tooltip={rentRubTooltip} code="RUB" />}
              {rentHasCur && <PctCard value={profitability.yieldAssetAnnualCurrency!} tooltip={rentCurTooltip ?? ""} code={item?.currency_code ?? "RUB"} />}
            </div>
          </div>
        )}
        {showInv && (
          <div className="flex flex-col items-center gap-2">
            <div className="flex flex-col items-center gap-2">
              {invHasRub && <PctCard value={profitability.yieldInvestmentsAnnualRub!} tooltip={invRubTooltip} code="RUB" />}
              {invHasCur && <PctCard value={profitability.yieldInvestmentsAnnualCurrency!} tooltip={invCurTooltip ?? ""} code={item?.currency_code ?? "RUB"} />}
            </div>
          </div>
        )}
      </div>
    );
  }, [costs, profitability, item]);

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

  useEffect(() => {
    if (!qtyChartContainerReady || !qtyChartContainerRef.current) return;
    const element = qtyChartContainerRef.current;
    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      const nextWidth = Math.max(1, Math.round(rect.width));
      const nextHeight = Math.max(1, Math.round(rect.height));
      setQtyChartSize((prev) => {
        if (prev.width === nextWidth && prev.height === nextHeight) return prev;
        return { width: nextWidth, height: nextHeight };
      });
    };
    updateSize();
    const obs = new ResizeObserver(updateSize);
    obs.observe(element);
    return () => obs.disconnect();
  }, [qtyChartContainerReady, quantityBlockOpen]);

  useEffect(() => {
    if (!qtyChartHoverPoint?.x || qtyChartHoverIndex == null) { setQtyChartTooltipLeft(null); return; }
    const half = 100;
    const clamped = Math.max(half, Math.min(qtyChartHoverPoint.x, qtyChartSize.width - half));
    setQtyChartTooltipLeft(clamped);
  }, [qtyChartHoverPoint?.x, qtyChartHoverIndex, qtyChartSize.width]);

  const handleQtyChartPointerMove = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      if (!qtyChartSvgRef.current || qtyChartSeries.length === 0) return;
      if (qtyChartSeries.length === 1) { setQtyChartHoverIndex(0); return; }
      const ctm = qtyChartSvgRef.current.getScreenCTM();
      if (!ctm) return;
      let svgX = 0;
      if (typeof DOMPoint !== "undefined") {
        svgX = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse()).x;
      } else {
        const point = qtyChartSvgRef.current.createSVGPoint();
        point.x = event.clientX; point.y = event.clientY;
        svgX = point.matrixTransform(ctm.inverse()).x;
      }
      const padding = qtyChartPadding;
      const innerWidth = qtyChartSize.width - padding.left - padding.right;
      const clampedX = Math.min(Math.max(svgX, padding.left), qtyChartSize.width - padding.right);
      const progress = (clampedX - padding.left) / innerWidth;
      const index = Math.round(progress * (qtyChartSeries.length - 1));
      setQtyChartHoverIndex(Math.min(Math.max(index, 0), qtyChartSeries.length - 1));
    },
    [qtyChartSeries.length, qtyChartSize, qtyChartPadding]
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
        initial_balance_minor: item.initial_balance_minor,
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
      <main className={`min-h-screen px-8 py-8 box-border ${CONTENT_WIDTH_CLASS}`}>
        <div className="w-full" style={{ color: PLACEHOLDER_COLOR_DARK }}>Загрузка...</div>
      </main>
    );
  }

  if (error && !item) {
    return (
      <main className={`min-h-screen px-8 py-8 box-border ${CONTENT_WIDTH_CLASS}`}>
        <div className="w-full">
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
      <main className={`min-h-screen px-8 py-8 box-border ${CONTENT_WIDTH_CLASS}`}>
        <div className="w-full">
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
  const icon3dPath = assetIconPath(item.type_code, iconFormat);
  const isArchived = Boolean(item.archived_at);
  const isClosed = Boolean(item.closed_at);
  const openDateLabel =
    item.open_date
      ? new Date(`${item.open_date}T00:00:00`).toLocaleDateString("ru-RU", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        })
      : "";

  return (
    <main className={`min-h-screen py-8 box-border ${CONTENT_WIDTH_CLASS} ${isDesktop ? "px-8" : "px-0 max-w-none"} ${!isDesktop ? "w-full min-w-0" : ""}`}>
      <div className={`flex flex-col gap-6 ${!isDesktop ? "w-full min-w-0" : "w-full"}`}>
        {/* Мобильная шапка: градиент с контентом (при прокрутке уезжает вверх) */}
        {!isDesktop && (
          <div
            className="relative flex flex-col gap-4 pt-4 pb-6 mt-[-2rem] px-6 w-screen max-w-none ml-[calc(-50vw+50%)]"
          >
            {/* Слой градиента: тянется под следующий блок и плавно исчезает маской */}
            <div
              className="absolute top-0 left-0 right-0 h-[75vh] z-0 pointer-events-none"
              style={{
                background: ASSET_DETAIL_HEADER_GRADIENT,
                WebkitMaskImage: "linear-gradient(to bottom, black 0%, black 28%, transparent 100%)",
                maskImage: "linear-gradient(to bottom, black 0%, black 28%, transparent 100%)",
              }}
            />
            <div className="relative z-10 flex flex-col gap-4">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/assets" className="flex items-center gap-2 text-white/90 hover:text-white">
                <ArrowLeft className="h-4 w-4" />
                К активам и обязательствам
              </Link>
            </Button>
            <div className="flex flex-col items-center gap-3">
              <div
                className="relative w-[152px] h-[152px] rounded-lg overflow-hidden shrink-0 cursor-pointer group"
                onClick={() => itemPhotoInputRef.current?.click()}
              >
                {photoUrl ? (
                  <img src={photoUrl} alt="" className="w-full h-full object-cover" />
                ) : icon3dPath ? (
                  <img src={icon3dPath} alt="" className="w-full h-full object-contain" onError={() => setIconFormat(null)} />
                ) : TypeIcon ? (
                  <div className="w-full h-full flex items-center justify-center" style={{ color: ACCENT }}>
                    <TypeIcon className="w-20 h-20" strokeWidth={1.5} />
                  </div>
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-[rgba(93,95,215,0.22)]">
                    <Camera className="w-12 h-12" style={{ color: PLACEHOLDER_COLOR_DARK }} />
                  </div>
                )}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                  <Upload className="w-6 h-6 text-white" />
                </div>
              </div>
              <input
                ref={itemPhotoInputRef}
                type="file"
                accept={ALLOWED_PHOTO_TYPES.join(",")}
                className="hidden"
                disabled={itemPhotoUploading}
                onChange={(e) => handleItemPhotoChange(e.target.files?.[0] ?? null)}
              />
              {itemPhotoError && (
                <p className="text-xs text-center" style={{ color: "#FB4C4F" }}>{itemPhotoError}</p>
              )}
              <div className="flex items-center gap-2 flex-wrap justify-center max-w-full">
                <h2 className="text-3xl font-medium text-center break-words" style={{ color: ACTIVE_TEXT_DARK }}>
                  {item.name}
                </h2>
                {item.currency_code && (
                  <CurrencyChip code={item.currency_code} />
                )}
              </div>
              <div className="flex items-center gap-4 flex-wrap justify-center max-w-full">
                <span className="text-sm font-normal text-white/80">
                  {getItemTypeLabel(item)}
                </span>
                {itemCounterparty && CounterpartyFallbackIcon && (
                  <>
                    <span className="text-sm text-white/80">в</span>
                    <div className="flex items-center gap-1.5">
                      <div className="relative h-5 w-5 shrink-0 flex items-center justify-center">
                        <CardIcon
                          src={counterpartyCurrentSrc && !showCounterpartyIcon ? counterpartyCurrentSrc : null}
                          alt={buildCounterpartyDisplayName(itemCounterparty)}
                          fallbackIcon={CounterpartyFallbackIcon}
                          size={20}
                          shadow={false}
                          objectFit="contain"
                          fallbackIconColor="rgba(255,255,255,0.7)"
                          onError={counterpartyOnError}
                        />
                      </div>
                      <span className="text-sm text-white/80">{buildCounterpartyDisplayName(itemCounterparty)}</span>
                    </div>
                  </>
                )}
              </div>
              {item.synonyms && item.synonyms.length > 0 && (
                <div className="flex flex-wrap items-center justify-center gap-1.5 mt-2">
                  {item.synonyms.map((chip, i) => (
                    <span
                      key={`${i}-${chip}`}
                      className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-normal shrink-0 max-w-[200px] truncate"
                      style={{
                        borderColor: ACCENT2,
                        backgroundColor: "rgba(85, 68, 209, 0.15)",
                        color: ACTIVE_TEXT_DARK,
                      }}
                    >
                      {chip}
                    </span>
                  ))}
                </div>
              )}
              {costs && (() => {
                const primaryKind = (item.primary_value_kind ?? "BALANCE") as PrimaryValueKind;
                const rows = [
                  { kind: "BALANCE" as PrimaryValueKind, label: "Балансовая стоимость", valueCents: costs.balance_currency_cents },
                  { kind: "MARKET" as PrimaryValueKind, label: "Рыночная стоимость", valueCents: costs.market_rub },
                  { kind: "ACQUISITION" as PrimaryValueKind, label: "Стоимость приобретения", valueCents: costs.acquisition_rub },
                  { kind: "INVESTED" as PrimaryValueKind, label: "Стоимость вложенных средств", valueCents: costs.invested_rub },
                ];
                const primaryRow = rows.find((r) => r.kind === primaryKind);
                const otherRows = rows.filter((r) => r.kind !== primaryKind);
                const primaryAmountStyle = { background: PINK_GRADIENT, WebkitBackgroundClip: "text" as const, WebkitTextFillColor: "transparent", backgroundClip: "text" as const, fontSize: "1.875rem", fontWeight: 500 };
                return (
                  <>
                    {primaryRow && (
                      <div className="w-full min-w-0 mt-2">
                        <div className="rounded-[9px] p-[2px] min-w-0 overflow-hidden" style={{ backgroundImage: PINK_GRADIENT }}>
                          <div
                            className="rounded-[9px] overflow-hidden px-4 py-3 min-w-0"
                            style={{ backgroundColor: "#25243F" }}
                          >
                            <p className="text-sm mb-1 truncate" style={{ color: PLACEHOLDER_COLOR_DARK }}>{primaryRow.label}</p>
                            <div className="flex items-center gap-2 min-w-0">
                              {primaryRow.valueCents != null ? (
                                <AmountWithCurrency valueCents={primaryRow.valueCents} currencyCode={item.currency_code ?? "RUB"} amountStyle={primaryAmountStyle} />
                              ) : (
                                <span className="text-3xl font-medium text-ellipsis overflow-hidden min-w-0" style={primaryAmountStyle}>—</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="flex gap-2 w-full min-w-0 mt-2">
                      {otherRows.map((row) => (
                        <div
                          key={row.kind}
                          className="flex-1 min-w-0 rounded-[9px] px-4 py-3 flex flex-col gap-0.5 min-h-[72px]"
                          style={{ backgroundColor: "#25243F" }}
                        >
                          <p className="text-sm truncate mb-1" style={{ color: PLACEHOLDER_COLOR_DARK }}>{row.label}</p>
                          {row.valueCents != null ? (
                            <AmountWithCurrency valueCents={row.valueCents} currencyCode={item.currency_code ?? "RUB"} amountStyle={{ color: ACTIVE_TEXT_DARK, fontSize: "0.875rem", fontWeight: 500 }} />
                          ) : (
                            <span className="text-sm" style={{ color: ACTIVE_TEXT_DARK }}>—</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                );
              })()}
            </div>
            </div>
          </div>
        )}

        {isDesktop && (
          <div className="flex flex-wrap items-center gap-2 -ml-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/assets" className="flex items-center gap-2">
                <ArrowLeft className="h-4 w-4" />
                К активам и обязательствам
              </Link>
            </Button>
          </div>
        )}

        <div className="flex flex-col gap-4">
        {isDesktop && (
        <div className="flex flex-row items-center gap-4">
            <div className="relative flex-shrink-0">
              <div
                className="relative w-[200px] h-[200px] rounded-lg overflow-hidden cursor-pointer group"
                onClick={() => itemPhotoInputRef.current?.click()}
              >
                {photoUrl ? (
                  <img src={photoUrl} alt="" className="w-full h-full object-cover" />
                ) : icon3dPath ? (
                  <img
                    src={icon3dPath}
                    alt=""
                    className="w-full h-full object-contain"
                    onError={() => setIconFormat(null)}
                  />
                ) : TypeIcon ? (
                  <div className="w-full h-full flex items-center justify-center" style={{ color: ACCENT }}>
                    <TypeIcon className="w-24 h-24" strokeWidth={1.5} />
                  </div>
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-[rgba(93,95,215,0.22)]">
                    <Camera className="w-12 h-12" style={{ color: PLACEHOLDER_COLOR_DARK }} />
                  </div>
                )}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                  <Upload className="w-8 h-8 text-white" />
                </div>
              </div>
              <input
                ref={itemPhotoInputRef}
                type="file"
                accept={ALLOWED_PHOTO_TYPES.join(",")}
                className="hidden"
                disabled={itemPhotoUploading}
                onChange={(e) => handleItemPhotoChange(e.target.files?.[0] ?? null)}
              />
              {itemPhotoError && (
                <p className="mt-1 text-xs" style={{ color: "#FB4C4F" }}>
                  {itemPhotoError}
                </p>
              )}
            </div>
            <div className="flex items-center justify-between gap-4 flex-1 min-w-0">
              <div className="flex flex-col items-center justify-center flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap justify-center max-w-full break-words">
                  <span className="text-sm font-normal" style={{ color: PLACEHOLDER_COLOR_DARK }}>
                    {getItemTypeLabel(item)}
                  </span>
                  {item.currency_code && (
                    <CurrencyChip code={item.currency_code} />
                  )}
                </div>
                <h2
                  className="text-2xl font-medium mb-1 text-center break-words max-w-full"
                  style={{ color: ACTIVE_TEXT_DARK }}
                >
                  {item.name}
                </h2>
                {itemCounterparty && CounterpartyFallbackIcon && (
                  <div className="flex items-center gap-2 mb-1 justify-center">
                    <div className="relative h-5 w-5 shrink-0 flex items-center justify-center">
                      <CardIcon
                        src={counterpartyCurrentSrc && !showCounterpartyIcon ? counterpartyCurrentSrc : null}
                        alt={buildCounterpartyDisplayName(itemCounterparty)}
                        fallbackIcon={CounterpartyFallbackIcon}
                        size={20}
                        shadow={false}
                        objectFit="contain"
                        fallbackIconColor={PLACEHOLDER_COLOR_DARK}
                        onError={counterpartyOnError}
                      />
                    </div>
                    <span
                      className="text-sm font-normal text-center"
                      style={{ color: PLACEHOLDER_COLOR_DARK }}
                    >
                      {buildCounterpartyDisplayName(itemCounterparty)}
                    </span>
                  </div>
                )}
              {openDateLabel && (
                <p className="text-sm mt-1 text-center">
                  <span style={{ color: PLACEHOLDER_COLOR_DARK }}>Дата появления: </span>
                  <span style={{ color: ACTIVE_TEXT_DARK }}>{openDateLabel}</span>
                </p>
              )}
              {isClosed && (
                <p className="text-sm mt-1 text-center">
                  <span style={{ color: PLACEHOLDER_COLOR_DARK }}>Дата закрытия: </span>
                  <span style={{ color: ACTIVE_TEXT_DARK }}>
                    {item.closed_at
                      ? (() => {
                          const dateStr = item.closed_at.slice(0, 10);
                          const [y, m, d] = dateStr.split("-");
                          return `${d}.${m}.${y}`;
                        })()
                      : new Date().toLocaleDateString("ru-RU", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                        })}
                  </span>
                </p>
              )}
              {item.contract_number && (
                <p className="text-sm mt-1 text-center">
                  <span style={{ color: PLACEHOLDER_COLOR_DARK }}>Номер договора: </span>
                  <span style={{ color: ACTIVE_TEXT_DARK }}>{item.contract_number}</span>
                </p>
              )}
              {item.account_last7 && (
                <p className="text-sm mt-1 text-center">
                  <span style={{ color: PLACEHOLDER_COLOR_DARK }}>Последние 4 цифры счёта: </span>
                  <span style={{ color: ACTIVE_TEXT_DARK }}>****{item.account_last7}</span>
                </p>
              )}
              {item.deposit_term_days != null && (
                <p className="text-sm mt-1 text-center">
                  <span style={{ color: PLACEHOLDER_COLOR_DARK }}>Срок вклада, дней: </span>
                  <span style={{ color: ACTIVE_TEXT_DARK }}>{item.deposit_term_days}</span>
                </p>
              )}
              {item.interest_rate != null && (
                <p className="text-sm mt-1 text-center">
                  <span style={{ color: PLACEHOLDER_COLOR_DARK }}>Процентная ставка: </span>
                  <span style={{ color: ACTIVE_TEXT_DARK }}>{item.interest_rate}%</span>
                </p>
              )}
              {item.synonyms && item.synonyms.length > 0 && (
                <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
                  {item.synonyms.map((chip, i) => (
                    <span
                      key={`${i}-${chip}`}
                      className="inline-flex items-center rounded-md border px-2 py-1 text-sm font-normal shrink-0 max-w-[200px] truncate"
                      style={{
                        borderColor: ACCENT2,
                        backgroundColor: "rgba(85, 68, 209, 0.15)",
                        color: ACTIVE_TEXT_DARK,
                      }}
                    >
                      {chip}
                    </span>
                  ))}
                </div>
              )}
              </div>
              <div className="flex-1 min-w-0 flex items-center justify-center">
                {profitabilityCardsInHeader && (
                  <div className="flex flex-col justify-center">
                    {profitabilityCardsInHeader}
                  </div>
                )}
              </div>
              <div className="shrink-0">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <div>
                      <IconButton aria-label="Открыть меню действий">
                        <MoreVertical />
                      </IconButton>
                    </div>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    {!isArchived && !isClosed && (
                      <DropdownMenuItem onClick={handleEditClick}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Редактировать
                      </DropdownMenuItem>
                    )}
                    {item.instrument_id && !isArchived && !isClosed && (
                      <DropdownMenuItem onClick={handleBuySellClick}>
                        <TrendingUp className="mr-2 h-4 w-4" />
                        Купить/продать актив
                      </DropdownMenuItem>
                    )}
                    {!isArchived && !isClosed && (
                      <DropdownMenuItem onClick={handleCloseClick}>
                        <Archive className="mr-2 h-4 w-4" />
                        Закрыть
                      </DropdownMenuItem>
                    )}
                    {isClosed && (
                      <DropdownMenuItem onClick={handleEditClosedAtOpen}>
                        <Calendar className="mr-2 h-4 w-4" />
                        Изменить дату закрытия
                      </DropdownMenuItem>
                    )}
                    {!isArchived && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={handleArchiveClick}>
                          <Archive className="mr-2 h-4 w-4" />
                          Архивировать
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={handleArchiveClick}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Удалить
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        )}

        {(isMoexItem(item) || isCryptoItem(item)) && (() => {
          const isCrypto = item.type_code === "crypto";
          const currentQty = isCrypto ? (item.quantity_units ?? 0) : (item.position_lots ?? 0);
          const qtyLabel = isCrypto
            ? new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 10 }).format(currentQty)
            : new Intl.NumberFormat("ru-RU").format(currentQty) + " л.";
          const qtyChartColor = ACCENT;
          return (
            <div className="relative rounded-lg overflow-hidden border-0 outline-none" style={{ backgroundColor: MODAL_BG }}>
              <div className="p-6">
                <h3 className="text-2xl font-medium mb-4" style={{ color: ACTIVE_TEXT_DARK }}>Количество</h3>
                <div className="w-full">
                  <div className="rounded-[9px] overflow-hidden" style={{ backgroundColor: BACKGROUND_DT }}>
                    <div
                      className={`flex w-full items-center gap-2 py-3 px-3 cursor-pointer transition-colors hover:opacity-90 ${quantityBlockOpen ? "rounded-t-[9px] border-b border-white/10" : ""}`}
                      onClick={() => setQuantityBlockOpen((v) => !v)}
                    >
                      <IconButton
                        aria-label={quantityBlockOpen ? "Свернуть" : "Развернуть"}
                        onClick={(e) => { e.stopPropagation(); setQuantityBlockOpen((v) => !v); }}
                      >
                        {quantityBlockOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </IconButton>
                      <span className="text-sm shrink-0" style={{ color: ACTIVE_TEXT_DARK }}>Количество</span>
                      <div className="flex-1 min-w-0" />
                      {item.instrument_id && !isArchived && !isClosed && (
                        <Button
                          type="button"
                          size="sm"
                          className="rounded-[9px] border-0 flex items-center justify-center transition-colors hover:opacity-90 text-sm font-normal shrink-0"
                          style={{ backgroundColor: ACCENT }}
                          onClick={(e) => { e.stopPropagation(); setBuySellModalOpen(true); }}
                        >
                          <TrendingUp className="h-4 w-4 mr-2" style={{ color: "white", opacity: 0.85 }} />
                          <span style={{ color: "white", opacity: 0.85 }}>Купить/продать актив</span>
                        </Button>
                      )}
                      <div className="text-2xl font-medium shrink-0 text-right" style={{ color: ACTIVE_TEXT_DARK }}>
                        {qtyLabel}
                      </div>
                    </div>
                    {quantityBlockOpen && (
                      <div className="p-4 pt-0" style={{ backgroundColor: "transparent" }}>
                        {loadingCostHistory ? (
                          <p className="text-sm" style={{ color: PLACEHOLDER_COLOR_DARK }}>Загрузка...</p>
                        ) : qtyChartSeries.length === 0 ? (
                          <p className="text-sm" style={{ color: PLACEHOLDER_COLOR_DARK }}>Нет данных за период.</p>
                        ) : qtyChartGeometry ? (
                          <>
                            <div
                              ref={(el) => { qtyChartContainerRef.current = el; setQtyChartContainerReady(!!el); }}
                              className="relative w-full min-w-0"
                              style={{ aspectRatio: `${qtyChartSize.width}/${qtyChartSize.height}` }}
                            >
                              {qtyChartHoverPoint != null && qtyChartHoverIndex != null && qtyChartSeries[qtyChartHoverIndex] && (
                                <div
                                  ref={qtyChartTooltipRef}
                                  className="pointer-events-none absolute z-20 whitespace-nowrap rounded-[9px] px-4 py-3 text-[14px] font-normal text-right"
                                  style={{ left: qtyChartTooltipLeft != null ? `${qtyChartTooltipLeft}px` : `${qtyChartHoverPoint.x}px`, top: 0, transform: "translate(-50%, 0)", backgroundColor: MODAL_BG }}
                                >
                                  <div className="whitespace-nowrap" style={{ color: PLACEHOLDER_COLOR_DARK }}>{formatChartDate(new Date(qtyChartSeries[qtyChartHoverIndex]!.date))}</div>
                                  <div className="mt-2 flex items-center justify-between gap-3" style={{ color: ACTIVE_TEXT_DARK }}>
                                    <span>Количество</span>
                                    <span className="tabular-nums">
                                      {isCrypto
                                        ? new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 10 }).format(qtyChartSeries[qtyChartHoverIndex]!.value)
                                        : new Intl.NumberFormat("ru-RU").format(qtyChartSeries[qtyChartHoverIndex]!.value) + " л."}
                                    </span>
                                  </div>
                                </div>
                              )}
                              <svg ref={qtyChartSvgRef} viewBox={`0 0 ${qtyChartGeometry.width} ${qtyChartGeometry.height}`} className="h-full w-full cursor-pointer" style={{ overflow: "visible" }} onMouseMove={handleQtyChartPointerMove} onMouseLeave={() => setQtyChartHoverIndex(null)}>
                                <defs>
                                  <linearGradient id="qty-chart-area" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor={qtyChartColor} stopOpacity={0.35} />
                                    <stop offset="100%" stopColor={qtyChartColor} stopOpacity={0} />
                                  </linearGradient>
                                </defs>
                                <path d={qtyChartGeometry.areaPath} fill="url(#qty-chart-area)" />
                                <path d={qtyChartGeometry.linePath} fill="none" stroke={qtyChartColor} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
                                {qtyChartDividers.map((div, idx) => (
                                  <line key={`qdiv-${idx}-${div.x}`} x1={div.x} x2={div.x} y1={qtyChartGeometry.padding.top} y2={qtyChartGeometry.padding.top + qtyChartGeometry.innerHeight} stroke={PLACEHOLDER_COLOR_DARK} strokeWidth={div.type === "year" ? 1.5 : 1} strokeOpacity={div.type === "year" ? 0.9 : 0.5} />
                                ))}
                                <line x1={qtyChartGeometry.padding.left} x2={qtyChartGeometry.width - qtyChartGeometry.padding.right} y1={qtyChartGeometry.baselineY} y2={qtyChartGeometry.baselineY} stroke={PLACEHOLDER_COLOR_DARK} strokeWidth={1} strokeDasharray="4 4" strokeOpacity={0.7} />
                                {qtyChartHoverPoint && (
                                  <>
                                    <line x1={qtyChartHoverPoint.x} x2={qtyChartHoverPoint.x} y1={qtyChartGeometry.padding.top} y2={qtyChartGeometry.padding.top + qtyChartGeometry.innerHeight} stroke={PLACEHOLDER_COLOR_DARK} strokeDasharray="4 6" />
                                    <circle cx={qtyChartHoverPoint.x} cy={qtyChartHoverPoint.y} r={6} fill={qtyChartColor} stroke="#fff" strokeWidth={2} />
                                  </>
                                )}
                                {qtyChartGeometry.dayMarks.map((mark, idx) => (
                                  <text key={idx} x={mark.x} y={qtyChartGeometry.height - 12} textAnchor={idx === 0 ? "start" : idx === qtyChartGeometry.dayMarks.length - 1 ? "end" : "middle"} fontSize={14} fill={ACTIVE_TEXT_DARK}>{mark.label}</text>
                                ))}
                              </svg>
                            </div>
                          </>
                        ) : null}

                        {quantityHistoryError ? (
                          <p className="text-sm text-red-500 mt-4">{quantityHistoryError}</p>
                        ) : loadingQuantityHistory ? (
                          <p className="text-sm mt-4" style={{ color: PLACEHOLDER_COLOR_DARK }}>Загрузка...</p>
                        ) : (
                          <>
                            <div className="mt-3">
                              <div className="min-w-0">
                                {quantityHistoryRows.length === 0 && (item.history_status === "HISTORICAL" ? quantitySummary.startQty : 0) === 0 ? (
                                  <p className="text-sm" style={{ color: PLACEHOLDER_COLOR_DARK }}>Нет операций покупки и продажи</p>
                                ) : (
                                  <table className="w-full text-left border-collapse text-sm" style={{ color: ACTIVE_TEXT_DARK }}>
                                    <tbody>
                                      {quantitySummary.startQty !== 0 && item.history_status === "HISTORICAL" && (() => {
                                        const openDateLabel = item.open_date
                                          ? new Date(item.open_date).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" })
                                          : "—";
                                        return (
                                          <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                                            <td className="py-1.5 pr-4 align-middle" style={{ color: ACTIVE_TEXT_DARK }}>{openDateLabel}</td>
                                            <td className="py-1.5 pr-4 align-middle" style={{ color: PLACEHOLDER_COLOR_DARK }}>Начальное количество</td>
                                            <td className="py-1.5 pr-4 text-right tabular-nums align-middle" style={{ color: ACTIVE_TEXT_DARK }}>
                                              {isCrypto
                                                ? new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 10 }).format(quantitySummary.startQty)
                                                : new Intl.NumberFormat("ru-RU").format(quantitySummary.startQty)}
                                            </td>
                                            <td className="py-1.5 text-right tabular-nums align-middle" style={{ color: ACTIVE_TEXT_DARK }}>
                                              {isCrypto
                                                ? new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 10 }).format(quantitySummary.startQty)
                                                : new Intl.NumberFormat("ru-RU").format(quantitySummary.startQty)}
                                            </td>
                                          </tr>
                                        );
                                      })()}
                                      {quantityHistoryRows.map(({ tx, type, delta, balanceAfter, priceCents, costCents }) => {
                                        const dateStr = tx.transaction_date ? new Date(tx.transaction_date.replace("T", " ")).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";
                                        const amountColor = type === "Покупка" ? GREEN : RED;
                                        return (
                                          <tr key={tx.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                                            <td className="py-1.5 pr-4 align-middle" style={{ color: ACTIVE_TEXT_DARK }}>{dateStr}</td>
                                            <td className="py-1.5 pr-4 align-middle" style={{ color: amountColor }}>{type}</td>
                                            <td className="py-1.5 pr-4 text-right tabular-nums align-middle" style={{ color: amountColor }}>
                                              {delta > 0 ? `+${isCrypto ? new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 10 }).format(delta) : new Intl.NumberFormat("ru-RU").format(delta)}` : (isCrypto ? new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 10 }).format(delta) : new Intl.NumberFormat("ru-RU").format(delta))}
                                            </td>
                                            <td className="py-1.5 text-right tabular-nums align-middle" style={{ color: ACTIVE_TEXT_DARK }}>
                                              {isCrypto
                                                ? new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 10 }).format(balanceAfter)
                                                : new Intl.NumberFormat("ru-RU").format(balanceAfter)}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                )}
                              </div>
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
                                    <SummaryBlock title="Количество на начало" value={item.history_status === "HISTORICAL" ? quantitySummary.startQty : 0} />
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
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        <div className={`relative rounded-lg overflow-hidden border-0 outline-none ${!isDesktop ? "w-full min-w-0" : ""}`} style={{ backgroundColor: MODAL_BG }}>
          <div className={`p-6 ${!isDesktop ? "min-w-0" : ""}`}>
            <h3 className="text-2xl font-medium mb-4" style={{ color: ACTIVE_TEXT_DARK }}>Стоимость</h3>
            {costs && (
              <div className="flex flex-col gap-2">
                {/* valueCents — в валюте актива (рубли в копейках или иностранная валюта в центах) */}
                {([
                  { key: "balance" as const, kind: "BALANCE" as PrimaryValueKind, label: "Балансовая стоимость", valueCents: costs.balance_currency_cents, extra: item.currency_code && item.currency_code !== "RUB" ? { rub: costs.balance_rub_cents } : null },
                  { key: "market" as const, kind: "MARKET" as PrimaryValueKind, label: "Рыночная стоимость", valueCents: costs.market_rub, extra: item.currency_code && item.currency_code !== "RUB" && costs.market_value_rub != null ? { rub: costs.market_value_rub } : null },
                  { key: "acquisition" as const, kind: "ACQUISITION" as PrimaryValueKind, label: "Стоимость приобретения", valueCents: costs.acquisition_rub, extra: null },
                  { key: "invested" as const, kind: "INVESTED" as PrimaryValueKind, label: "Стоимость вложенных средств", valueCents: costs.invested_rub, extra: null },
                ] as const).map(({ key, kind, label, valueCents, extra }) => {
                  const isPrimary = (item.primary_value_kind ?? "BALANCE") === kind;
                  const isHovered = costRowHover === key;
                  const isExpanded = costHistoryOpen === key;
                  const isZero = valueCents == null || valueCents === 0;
                  return (
                    <div
                      key={key}
                      className="w-full"
                      onMouseEnter={() => setCostRowHover(key)}
                      onMouseLeave={() => setCostRowHover(null)}
                    >
                      <div
                        className={`rounded-[9px]${isPrimary ? " p-[2px]" : ""}`}
                        style={isPrimary ? { backgroundImage: PINK_GRADIENT } : undefined}
                      >
                        <div
                          className="rounded-[9px] overflow-hidden"
                          style={{ backgroundColor: BACKGROUND_DT }}
                        >
                          <div
                            className={`flex w-full items-center gap-2 py-3 px-3 cursor-pointer transition-colors hover:opacity-90 ${isExpanded ? "rounded-t-[9px] border-b border-white/10" : ""}`}
                            onClick={() => setCostHistoryOpen((v) => (v === key ? null : key))}
                          >
                          <IconButton
                            aria-label={isExpanded ? "Свернуть" : "Развернуть"}
                            onClick={(e) => { e.stopPropagation(); setCostHistoryOpen((v) => (v === key ? null : key)); }}
                          >
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </IconButton>
                          <span className="text-sm shrink-0" style={{ color: ACTIVE_TEXT_DARK }}>{label}</span>
                          {isPrimary && (
                            <span className="h-8 flex items-center rounded-[9px] px-2 text-sm font-normal shrink-0" style={{ backgroundColor: ACCENT2, color: "#fff" }}>Основная</span>
                          )}
                          {!isPrimary && isHovered && (
                            <span
                              className="h-8 flex items-center rounded-[9px] px-2 text-sm font-normal shrink-0 cursor-pointer hover:opacity-90"
                              style={{ backgroundColor: ACCENT2, color: "#fff" }}
                              onClick={(e) => { e.stopPropagation(); handlePrimaryValueKindChange(kind); }}
                            >
                              Сделать основной
                            </span>
                          )}
                          <div className="flex-1 min-w-0" />
                          <div className="text-2xl font-medium shrink-0 text-right">
                            {valueCents != null ? (
                              item.currency_code && item.currency_code !== "RUB" && extra?.rub != null ? (
                                <div className="flex flex-col items-end gap-0.5">
                                  <AmountWithCurrency valueCents={extra.rub} currencyCode="RUB" amountStyle={isPrimary ? { background: PINK_GRADIENT, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" } : { color: ACTIVE_TEXT_DARK }} />
                                  <AmountWithCurrency valueCents={valueCents} currencyCode={item.currency_code} amountStyle={isPrimary ? { background: PINK_GRADIENT, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" } : { color: ACTIVE_TEXT_DARK }} />
                                </div>
                              ) : (
                                <AmountWithCurrency valueCents={valueCents} currencyCode={item.currency_code ?? "RUB"} amountStyle={isPrimary ? { background: PINK_GRADIENT, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" } : { color: ACTIVE_TEXT_DARK }} />
                              )
                            ) : (
                              <span style={{ color: ACTIVE_TEXT_DARK }}>—</span>
                            )}
                          </div>
                        </div>
                        {isExpanded && costHistoryOpen === key && (
                          <div className={`p-4 pt-0 ${!isDesktop ? "min-w-0 overflow-x-auto" : ""}`} style={{ backgroundColor: "transparent" }}>
                          {item.currency_code && item.currency_code !== "RUB" ? (
                            <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
                              {item.currency_code && item.currency_code !== "RUB" && (
                                <SegmentedSelector
                                  options={[
                                    { value: "RUB", label: "RUB" },
                                    { value: "CURRENCY", label: item.currency_code },
                                  ]}
                                  value={costChartCurrency}
                                  onChange={(v) => setCostChartCurrency(v === "RUB" || v === "CURRENCY" ? v : "RUB")}
                                  segmentWidth="auto"
                                  className="w-fit shrink-0"
                                />
                              )}
                            </div>
                          ) : null}
                          {loadingCostHistory ? (
                            <p className="text-sm" style={{ color: PLACEHOLDER_COLOR_DARK }}>Загрузка...</p>
                          ) : costChartSeries.length === 0 ? (
                            <p className="text-sm" style={{ color: PLACEHOLDER_COLOR_DARK }}>Нет данных за период.</p>
                          ) : costChartGeometry ? (() => {
                            const costChartColor = costChartCurrency === "CURRENCY" && item?.currency_code ? (getCurrencyChartColor(item.currency_code) ?? ACCENT) : ACCENT;
                            return (
                            <>
                              <div
                                ref={(el) => { costChartContainerRef.current = el; setCostChartContainerReady(!!el); }}
                                className="relative w-full min-w-0"
                                style={costHistoryOpen === "balance" ? { height: 400 } : { aspectRatio: `${costChartSize.width}/${costChartSize.height}` }}
                              >
                              {costHistoryOpen === "balance" && checkpointChartHoverDate != null && costChartGeometry && (() => {
                                const lineData = costChartCheckpointLines.find((l) => l.dateKey === checkpointChartHoverDate);
                                if (!lineData) return null;
                                const scaleX = costChartSize.width / costChartGeometry.width;
                                const leftPx = lineData.x * scaleX;
                                return (
                                  <div
                                    className="pointer-events-none absolute z-20 rounded-[9px] px-4 py-3 text-[14px] font-normal max-w-[280px]"
                                    style={{ left: `${leftPx}px`, top: 0, transform: "translate(-50%, 0)", backgroundColor: MODAL_BG }}
                                  >
                                    <div className="whitespace-nowrap" style={{ color: PLACEHOLDER_COLOR_DARK }}>{formatChartDate(new Date(lineData.dateKey))}</div>
                                    {lineData.checkpoints.map((cp) => {
                                      const timeStr = new Date(cp.checkpoint_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
                                      return (
                                        <div key={cp.id} className="mt-2 pt-2 border-t border-white/10 space-y-1">
                                          <div className="flex items-center justify-between gap-2" style={{ color: ACTIVE_TEXT_DARK }}>
                                            <span>{timeStr}</span>
                                            <span className="text-xs" style={{ color: cp.status === "OK" ? GREEN : RED }}>{cp.status === "OK" ? "ОК" : "Расхождение"}</span>
                                          </div>
                                          <div className="flex justify-between gap-2 text-xs" style={{ color: PLACEHOLDER_COLOR_DARK }}>
                                            <span>Расчётное:</span>
                                            <AmountWithCurrency valueCents={cp.computed_balance_cents} currencyCode={item.currency_code ?? "RUB"} className="justify-end" />
                                          </div>
                                          <div className="flex justify-between gap-2 text-xs" style={{ color: PLACEHOLDER_COLOR_DARK }}>
                                            <span>Указанное:</span>
                                            <AmountWithCurrency valueCents={cp.stated_balance_cents} currencyCode={item.currency_code ?? "RUB"} className="justify-end" />
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                );
                              })()}
                              {costChartHoverPoint != null && costChartHoverIndex != null && costChartDisplaySeries[costChartHoverIndex] && (
                                <div
                                  ref={costChartTooltipRef}
                                  className="pointer-events-none absolute z-20 whitespace-nowrap rounded-[9px] px-4 py-3 text-[14px] font-normal text-right"
                                  style={{ left: costChartTooltipLeft != null ? `${costChartTooltipLeft}px` : `${costChartHoverPoint.x}px`, top: 0, transform: "translate(-50%, 0)", backgroundColor: MODAL_BG }}
                                >
                                  <div className="whitespace-nowrap" style={{ color: PLACEHOLDER_COLOR_DARK }}>{formatChartDate(new Date(costChartDisplaySeries[costChartHoverIndex]!.date))}</div>
                                  {costHistoryOpen === "market" ? (() => {
                                    const pt = costChartSeries[costChartHoverIndex!] as { marketQuantityUnits?: number; marketPriceRub?: number; valueRub: number; date: string };
                                    const isCurrencyAsset = item.currency_code && item.currency_code !== "RUB";
                                    const valueCurrencyCents = Math.round(pt.valueRub * 100);
                                    const rate = isCurrencyAsset ? getRateForDateKey(pt.date) : null;
                                    const valueRubCents = isCurrencyAsset && rate != null && rate > 0 ? Math.round(pt.valueRub * rate * 100) : valueCurrencyCents;
                                    return (
                                      <>
                                        {pt.marketQuantityUnits != null && (
                                          <div className="mt-2 flex items-center justify-between gap-3" style={{ color: ACTIVE_TEXT_DARK }}>
                                            <span>Количество</span>
                                            <span className="tabular-nums">{pt.marketQuantityUnits.toLocaleString("ru-RU")}</span>
                                          </div>
                                        )}
                                        <div className="mt-2 flex items-center justify-between gap-3" style={{ color: ACTIVE_TEXT_DARK }}>
                                          <span>Рыночная стоимость</span>
                                          <div className="flex flex-col items-end gap-0.5">
                                            <AmountWithCurrency valueCents={valueRubCents} currencyCode="RUB" className="justify-end" />
                                            {isCurrencyAsset && (
                                              <AmountWithCurrency valueCents={valueCurrencyCents} currencyCode={item.currency_code} className="justify-end" />
                                            )}
                                          </div>
                                        </div>
                                      </>
                                    );
                                  })() : (
                                    <div className="mt-2 flex items-center justify-between gap-3" style={{ color: ACTIVE_TEXT_DARK }}>
                                      <span>
                                        {costHistoryOpen === "balance" && "Балансовая стоимость"}
                                        {costHistoryOpen === "acquisition" && "Стоимость приобретения"}
                                        {costHistoryOpen === "invested" && "Стоимость вложенных средств"}
                                      </span>
                                      <div className="flex items-center justify-end gap-2">
                                        <AmountWithCurrency valueCents={Math.round(costChartDisplaySeries[costChartHoverIndex]!.valueRub * 100)} currencyCode={costChartCurrency === "RUB" ? "RUB" : item.currency_code} className="justify-end" />
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                              <svg ref={costChartSvgRef} viewBox={`0 0 ${costChartGeometry.width} ${costChartGeometry.height}`} className="h-full w-full cursor-pointer" style={{ overflow: "visible" }} onMouseMove={handleCostChartPointerMove} onMouseLeave={() => setCostChartHoverIndex(null)}>
                                <defs>
                                  <linearGradient id="asset-detail-chart-area" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor={costChartColor} stopOpacity={0.35} />
                                    <stop offset="100%" stopColor={costChartColor} stopOpacity={0} />
                                  </linearGradient>
                                  <linearGradient id="asset-detail-chart-area-negative" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor={RED} stopOpacity={0.35} />
                                    <stop offset="100%" stopColor={RED} stopOpacity={0} />
                                  </linearGradient>
                                </defs>
                                {costChartGeometry.areaPathNegativeSegments.map((d, idx) => (
                                  <path key={`neg-area-${idx}`} d={d} fill="url(#asset-detail-chart-area-negative)" />
                                ))}
                                {costChartGeometry.areaPathPositiveSegments.map((d, idx) => (
                                  <path key={`pos-area-${idx}`} d={d} fill="url(#asset-detail-chart-area)" />
                                ))}
                                {costChartGeometry.linePathNegativeSegments.map((d, idx) => (
                                  <path key={`neg-line-${idx}`} d={d} fill="none" stroke={RED} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
                                ))}
                                {costChartGeometry.linePathPositiveSegments.map((d, idx) => (
                                  <path key={`pos-line-${idx}`} d={d} fill="none" stroke={costChartColor} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
                                ))}
                                {costChartDividers.map((div, idx) => (
                                  <line
                                    key={`div-${idx}-${div.x}`}
                                    x1={div.x}
                                    x2={div.x}
                                    y1={costChartGeometry.padding.top}
                                    y2={costChartGeometry.padding.top + costChartGeometry.innerHeight}
                                    stroke={PLACEHOLDER_COLOR_DARK}
                                    strokeWidth={div.type === "year" ? 1.5 : 1}
                                    strokeOpacity={div.type === "year" ? 0.9 : 0.5}
                                  />
                                ))}
                                <line x1={costChartGeometry.padding.left} x2={costChartGeometry.width - costChartGeometry.padding.right} y1={costChartGeometry.baselineY} y2={costChartGeometry.baselineY} stroke={PLACEHOLDER_COLOR_DARK} strokeWidth={1} strokeDasharray="4 4" strokeOpacity={0.7} />
                                <line x1={costChartGeometry.padding.left} x2={costChartGeometry.width - costChartGeometry.padding.right} y1={costChartGeometry.averageLineY} y2={costChartGeometry.averageLineY} stroke={PLACEHOLDER_COLOR_DARK} strokeWidth={1.5} strokeDasharray="6 4" strokeOpacity={0.9} />
                                {costHistoryOpen === "balance" && costChartCheckpointLines.map(({ dateKey, x, checkpoints: cps }) => {
                                  const hasMismatch = cps.some((c) => c.status === "MISMATCH");
                                  const strokeColor = hasMismatch ? RED : GREEN;
                                  const iconSize = 24;
                                  const iconY = Math.max(0, costChartGeometry.padding.top - iconSize);
                                  return (
                                    <g
                                      key={dateKey}
                                      onMouseEnter={() => setCheckpointChartHoverDate(dateKey)}
                                      onMouseLeave={() => setCheckpointChartHoverDate(null)}
                                    >
                                      <foreignObject x={x - iconSize / 2} y={iconY} width={iconSize} height={iconSize} style={{ overflow: "visible" }}>
                                        <div
                                          {...({ xmlns: "http://www.w3.org/1999/xhtml" } as Record<string, unknown>)}
                                          className="flex items-center justify-center"
                                          style={{ width: iconSize, height: iconSize, color: hasMismatch ? RED : GREEN }}
                                        >
                                          {hasMismatch ? <MapPinX size={20} /> : <MapPinCheck size={20} />}
                                        </div>
                                      </foreignObject>
                                      <line x1={x} x2={x} y1={costChartGeometry.padding.top} y2={costChartGeometry.padding.top + costChartGeometry.innerHeight} stroke={strokeColor} strokeWidth={2} strokeOpacity={0.9} />
                                      <line x1={x} x2={x} y1={costChartGeometry.padding.top} y2={costChartGeometry.padding.top + costChartGeometry.innerHeight} stroke="transparent" strokeWidth={16} style={{ cursor: "pointer" }} />
                                    </g>
                                  );
                                })}
                                {costChartHoverPoint && (
                                  <>
                                    <line x1={costChartHoverPoint.x} x2={costChartHoverPoint.x} y1={costChartGeometry.padding.top} y2={costChartGeometry.padding.top + costChartGeometry.innerHeight} stroke={PLACEHOLDER_COLOR_DARK} strokeDasharray="4 6" />
                                    <circle cx={costChartHoverPoint.x} cy={costChartHoverPoint.y} r={6} fill={costChartHoverPoint.value < 0 ? RED : costChartColor} stroke="#fff" strokeWidth={2} />
                                  </>
                                )}
                                {costChartGeometry.dayMarks.map((mark, idx) => (
                                  <text key={idx} x={mark.x} y={costChartGeometry.height - 12} textAnchor={idx === 0 ? "start" : idx === costChartGeometry.dayMarks.length - 1 ? "end" : "middle"} fontSize={14} fill={ACTIVE_TEXT_DARK}>{mark.label}</text>
                                ))}
                              </svg>
                              <div
                                className="absolute right-0 pointer-events-none flex items-center gap-2 rounded-md px-2 py-1 text-sm tabular-nums shrink-0"
                                style={{
                                  top: `${(costChartGeometry.averageLineY / costChartGeometry.height) * 100}%`,
                                  transform: "translateY(-50%)",
                                  backgroundColor: MODAL_BG,
                                  color: ACTIVE_TEXT_DARK,
                                }}
                                aria-label="Средняя величина по дням"
                              >
                                <AmountWithCurrency
                                  valueCents={Math.round(costChartGeometry.averageValue * 100)}
                                  currencyCode={costChartCurrency === "RUB" ? "RUB" : item.currency_code ?? "RUB"}
                                  amountStyle={{ color: ACTIVE_TEXT_DARK }}
                                />
                              </div>
                              </div>
                            </>
                            );
                          })() : null}
                          {key === "balance" && (
                            <div className="mt-3 flex justify-center">
                              <Button
                                type="button"
                                className="rounded-[9px] border-0 flex items-center justify-center transition-colors hover:opacity-90 text-sm font-normal"
                                style={{ backgroundColor: ACCENT }}
                                onClick={() => router.push(`/transactions?item_id=${item.id}`)}
                              >
                                <ExternalLink className="h-4 w-4 mr-2" style={{ color: "white", opacity: 0.85 }} />
                                <span style={{ color: "white", opacity: 0.85 }}>Просмотреть транзакции</span>
                              </Button>
                            </div>
                          )}
                          {(key === "acquisition" || key === "invested") && (() => {
                            const txs = key === "acquisition" ? purchaseTxsForAsset : investedTxsForAsset;
                            const currencyCode = (item.currency_code ?? "RUB").toUpperCase();
                            const isCurrencyAsset = currencyCode !== "RUB";
                            let costValueCents = key === "acquisition" ? (costs.acquisition_rub ?? 0) : (costs.invested_rub ?? 0);
                            const rateOnOpen =
                              isCurrencyAsset && item.open_date
                                ? getRateForDate(fxRatesByDate, item.open_date, currencyCode, latestRatesByCurrency, todayKey, sortedFxRateDateKeys)
                                : null;
                            if (isCurrencyAsset && rateOnOpen && rateOnOpen > 0) {
                              costValueCents = Math.round(costValueCents / rateOnOpen);
                            }
                            // tx.amount в валюте primary_item (обычно RUB копейки); конвертируем в валюту актива
                            const txsSumAssetCents = txs.reduce((sum, tx) => {
                              const amt = tx.amount ?? 0;
                              if (!isCurrencyAsset) return sum + amt;
                              const pi = itemsById.get(tx.primary_item_id) ?? null;
                              const txCur = (pi?.currency_code ?? "RUB").toUpperCase();
                              const d = toTxDateKey(tx.transaction_date);
                              const rateTx = txCur === "RUB" ? 1 : getRateForDate(fxRatesByDate, d, txCur, latestRatesByCurrency, todayKey, sortedFxRateDateKeys);
                              const rubCents = rateTx != null && rateTx > 0 ? Math.round(amt * rateTx) : amt;
                              const rateA = getRateForDate(fxRatesByDate, d, currencyCode, latestRatesByCurrency, todayKey, sortedFxRateDateKeys);
                              return sum + (rateA != null && rateA > 0 ? Math.round(rubCents / rateA) : rubCents);
                            }, 0);
                            const initialRowAssetCents = costValueCents - txsSumAssetCents;
                            const hasImplicitInitial = Math.abs(initialRowAssetCents) > 1;
                            const hasTxs = txs.length > 0;
                            if (!hasTxs && !hasImplicitInitial) {
                              return (
                                <p className="text-sm mt-3" style={{ color: PLACEHOLDER_COLOR_DARK }}>
                                  {key === "acquisition" ? "Нет операций приобретения." : "Нет операций вложений."}
                                </p>
                              );
                            }
                            return (
                              <table className="w-full text-left border-collapse text-sm mt-3" style={{ color: ACTIVE_TEXT_DARK }}>
                                <tbody>
                                  {hasImplicitInitial && item.history_status === "HISTORICAL" && (() => {
                                    const histRubCents =
                                      isCurrencyAsset && rateOnOpen != null && rateOnOpen > 0
                                        ? Math.round((initialRowAssetCents / 100) * rateOnOpen * 100)
                                        : initialRowAssetCents;
                                    const histCurrencyUnits = isCurrencyAsset ? initialRowAssetCents / 100 : null;
                                    const dateLabel = item.open_date
                                      ? new Date(item.open_date).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" })
                                      : "—";
                                    return (
                                      <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                                        <td className="py-1.5 pr-4 align-middle" style={{ color: ACTIVE_TEXT_DARK }}>{dateLabel}</td>
                                        <td className="py-1.5 pr-4 align-middle" colSpan={1}>
                                          <span style={{ color: PLACEHOLDER_COLOR_DARK }}>Начальная стоимость</span>
                                        </td>
                                        <td className="py-1.5 pr-4 align-middle">
                                          <span style={{ color: PLACEHOLDER_COLOR_DARK }}>–</span>
                                        </td>
                                        {isCurrencyAsset && (
                                          <>
                                            <td className="py-1.5 pr-4 align-middle w-0 min-w-[120px]">
                                              <div className="flex items-center gap-2 tabular-nums w-full">
                                                <CurrencyChip code={currencyCode} />
                                                <span className="ml-auto" style={{ color: ACTIVE_TEXT_DARK }}>{histCurrencyUnits != null ? new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(histCurrencyUnits) : "–"}</span>
                                              </div>
                                            </td>
                                            <td className="py-1.5 pr-4 text-right tabular-nums align-middle" style={{ color: PLACEHOLDER_COLOR_DARK }}>{rateOnOpen != null ? new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(rateOnOpen) : "–"}</td>
                                          </>
                                        )}
                                        <td className="py-1.5 pr-4 align-middle w-0 min-w-[120px]">
                                          <div className="flex items-center gap-2 tabular-nums w-full">
                                            <CurrencyChip code="RUB" />
                                            <span className="ml-auto" style={{ color: ACTIVE_TEXT_DARK }}>{formatRub(histRubCents)}</span>
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  })()}
                                  {txs.map((tx) => {
                                    const d = toTxDateKey(tx.transaction_date);
                                    const primaryItem = itemsById.get(tx.primary_item_id) ?? null;
                                    const txCurrency = (primaryItem?.currency_code ?? "RUB").toUpperCase();
                                    const rateTxCur =
                                      txCurrency === "RUB"
                                        ? 1
                                        : getRateForDate(fxRatesByDate, d, txCurrency, latestRatesByCurrency, todayKey, sortedFxRateDateKeys);
                                    const rateAsset =
                                      isCurrencyAsset
                                        ? getRateForDate(fxRatesByDate, d, currencyCode, latestRatesByCurrency, todayKey, sortedFxRateDateKeys)
                                        : null;
                                    const rubCentsTx =
                                      rateTxCur != null && rateTxCur > 0
                                        ? Math.round((tx.amount ?? 0) * rateTxCur)
                                        : (tx.amount ?? 0);
                                    const assetCentsTx =
                                      isCurrencyAsset && rateAsset != null && rateAsset > 0
                                        ? Math.round(rubCentsTx / rateAsset)
                                        : null;
                                    const currencyUnits = isCurrencyAsset && assetCentsTx != null ? assetCentsTx / 100 : null;
                                    const categoryPath = tx.category_id != null ? (categoryLookup.idToPath.get(tx.category_id) ?? []) : [];
                                    const categoryLabel = categoryPath.length > 0 ? categoryPath[categoryPath.length - 1]! : "–";
                                    return (
                                      <tr key={tx.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                                        <td className="py-1.5 pr-4 align-middle" style={{ color: ACTIVE_TEXT_DARK }}>{formatTxDateCell(tx.transaction_date)}</td>
                                        <td className="py-1.5 pr-4 align-middle">
                                          {tx.category_id != null ? (
                                            <div className="flex items-center gap-2">
                                              <CategoryIconImage
                                                categoryId={tx.category_id}
                                                categoryLookup={categoryLookup}
                                                apiBase={API_BASE}
                                                size={18}
                                                className="h-4 w-4 rounded-sm object-contain shrink-0"
                                                fallbackIconColor={ACTIVE_TEXT_DARK}
                                              />
                                              <span style={{ color: ACTIVE_TEXT_DARK }}>{categoryLabel}</span>
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
                                        {isCurrencyAsset && (
                                          <>
                                            <td className="py-1.5 pr-4 align-middle w-0 min-w-[120px]">
                                              <div className="flex items-center gap-2 tabular-nums w-full">
                                                <CurrencyChip code={currencyCode} />
                                                <span className="ml-auto" style={{ color: ACTIVE_TEXT_DARK }}>{currencyUnits != null ? new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(currencyUnits) : "–"}</span>
                                              </div>
                                            </td>
                                            <td className="py-1.5 pr-4 text-right tabular-nums align-middle" style={{ color: PLACEHOLDER_COLOR_DARK }}>{rateAsset != null ? new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(rateAsset) : "–"}</td>
                                          </>
                                        )}
                                        <td className="py-1.5 pr-4 align-middle w-0 min-w-[120px]">
                                          <div className="flex items-center gap-2 tabular-nums w-full">
                                            <CurrencyChip code="RUB" />
                                            <span className="ml-auto" style={{ color: ACTIVE_TEXT_DARK }}>{formatRub(rubCentsTx)}</span>
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            );
                          })()}
                          {key === "market" && !item.instrument_id && !isCryptoItem(item) && (() => {
                            const currencyCode = (item.currency_code ?? "RUB").toUpperCase();
                            const isCurrencyAsset = currencyCode !== "RUB";
                            const mvsSorted = [...marketValues].sort(
                              (a, b) => a.value_date.localeCompare(b.value_date)
                            );
                            return (
                              <div className="flex gap-4 mt-3 items-start">
                                <div className="w-1/2 min-w-0">
                                  {mvsSorted.length === 0 ? (
                                    <p className="text-sm" style={{ color: PLACEHOLDER_COLOR_DARK }}>
                                      Нет данных о рыночной стоимости.
                                    </p>
                                  ) : (
                                    <table className="w-full text-left border-collapse text-sm" style={{ color: ACTIVE_TEXT_DARK }}>
                                      <tbody>
                                        {mvsSorted.map((mv) => {
                                          const dateLabel = new Date(mv.value_date).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
                                          const rubCents = mv.value_rub;
                                          const assetCents = mv.value_currency_cents ?? null;
                                          const rateOnDate =
                                            isCurrencyAsset
                                              ? getRateForDate(fxRatesByDate, mv.value_date, currencyCode, latestRatesByCurrency, todayKey, sortedFxRateDateKeys)
                                              : null;
                                          const displayAssetCents =
                                            assetCents != null
                                              ? assetCents
                                              : (isCurrencyAsset && rateOnDate != null && rateOnDate > 0
                                                  ? Math.round(rubCents / rateOnDate)
                                                  : null);
                                          const displayRubCents =
                                            rubCents !== 0
                                              ? rubCents
                                              : (assetCents != null && rateOnDate != null && rateOnDate > 0
                                                  ? Math.round((assetCents / 100) * rateOnDate * 100)
                                                  : 0);
                                          const currencyUnits = displayAssetCents != null ? displayAssetCents / 100 : null;
                                          return (
                                            <tr key={mv.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                                              <td className="py-1.5 pr-4 align-middle" style={{ color: ACTIVE_TEXT_DARK }}>{dateLabel}</td>
                                              {isCurrencyAsset && (
                                                <>
                                                  <td className="py-1.5 pr-4 align-middle w-0 min-w-[120px]">
                                                    <div className="flex items-center gap-2 tabular-nums w-full">
                                                      <CurrencyChip code={currencyCode} />
                                                      <span className="ml-auto" style={{ color: ACTIVE_TEXT_DARK }}>
                                                        {currencyUnits != null
                                                          ? new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(currencyUnits)
                                                          : "–"}
                                                      </span>
                                                    </div>
                                                  </td>
                                                  <td className="py-1.5 pr-4 text-right tabular-nums align-middle" style={{ color: PLACEHOLDER_COLOR_DARK }}>
                                                    {rateOnDate != null
                                                      ? new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(rateOnDate)
                                                      : "–"}
                                                  </td>
                                                </>
                                              )}
                                              <td className="py-1.5 pr-4 align-middle w-0 min-w-[120px]">
                                                <div className="flex items-center gap-2 tabular-nums w-full">
                                                  <CurrencyChip code="RUB" />
                                                  <span className="ml-auto" style={{ color: ACTIVE_TEXT_DARK }}>{formatRub(displayRubCents)}</span>
                                                </div>
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  )}
                                </div>
                                <div className="w-1/2 flex justify-center items-start pt-1">
                                  <Button
                                    type="button"
                                    className="rounded-[9px] border-0 flex items-center justify-center transition-colors hover:opacity-90 text-sm font-normal shrink-0"
                                    style={{ backgroundColor: ACCENT }}
                                    onClick={() => setEditMarketValueModalOpen(true)}
                                  >
                                    <Plus className="h-5 w-5 mr-2" style={{ color: "white", opacity: 0.85 }} />
                                    <span style={{ color: "white", opacity: 0.85 }}>Добавить/изменить рыночную стоимость</span>
                                  </Button>
                                </div>
                              </div>
                            );
                          })()}
                          {((key === "balance" && dynamicsBalance) || (key === "market" && dynamicsMarket)) && (() => {
                            const d = (key === "balance" ? dynamicsBalance : dynamicsMarket)!;
                            const formatCur = (v: number) => {
                              const s = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(v);
                              return s.replace(/,0*$/, "") || s;
                            };
                            const SummaryBlock = ({
                              title,
                              qtyVal,
                              curVal,
                              rubVal,
                              amountColor,
                              showCurRow = true,
                              showQtyRow = true,
                              showEmptyQtyRow = false,
                            }: {
                              title: string;
                              qtyVal?: number | null;
                              curVal: number | null;
                              rubVal: number | null;
                              amountColor?: string;
                              showCurRow?: boolean;
                              showQtyRow?: boolean;
                              showEmptyQtyRow?: boolean;
                            }) => (
                              <div className="flex flex-1 min-w-0 flex-col gap-1.5 rounded-lg px-3 py-2" style={{ backgroundColor: "rgba(255,255,255,0.06)" }}>
                                <div className="text-xs text-center" style={{ color: PLACEHOLDER_COLOR_DARK }}>{title}</div>
                                <div className="flex flex-col gap-2">
                                  {showEmptyQtyRow && (
                                    <div className="rounded-md px-2 py-1 flex items-center gap-2 text-sm tabular-nums" style={{ backgroundColor: BACKGROUND_DT }} aria-hidden>
                                      <span className="invisible select-none">0</span>
                                    </div>
                                  )}
                                  {showQtyRow && qtyVal != null && (
                                    <div className="rounded-md px-2 py-1 flex items-center gap-2 text-sm tabular-nums" style={{ backgroundColor: BACKGROUND_DT }}>
                                      <span className="ml-auto" style={{ color: ACTIVE_TEXT_DARK }}>
                                        {isCryptoItem(item) ? new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 10 }).format(qtyVal) : new Intl.NumberFormat("ru-RU").format(qtyVal) + (isMoexItem(item) ? " л." : "")}
                                      </span>
                                    </div>
                                  )}
                                  {d.currencyCode !== "RUB" && (showCurRow ? (
                                    <div className="rounded-md px-2 py-1 flex items-center gap-2 text-sm tabular-nums" style={{ backgroundColor: BACKGROUND_DT }}>
                                      <CurrencyChip code={d.currencyCode} />
                                      <span className="ml-auto" style={{ color: amountColor ?? ACTIVE_TEXT_DARK }}>{curVal != null ? formatCur(curVal) : "–"}</span>
                                    </div>
                                  ) : (
                                    <div className="rounded-md px-2 py-1 flex items-center text-sm tabular-nums" style={{ backgroundColor: BACKGROUND_DT }} aria-hidden>
                                      <span className="invisible select-none">0</span>
                                    </div>
                                  ))}
                                  <div className="rounded-md px-2 py-1 flex items-center gap-2 text-sm tabular-nums" style={{ backgroundColor: BACKGROUND_DT }}>
                                    <CurrencyChip code="RUB" />
                                    <span className="ml-auto" style={{ color: amountColor ?? ACTIVE_TEXT_DARK }}>{rubVal != null ? formatRub(rubVal) : "–"}</span>
                                  </div>
                                </div>
                              </div>
                            );
                            const dateStartLabel = d.dateStart ? new Date(d.dateStart).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }) : "";
                            const dateEndLabel = d.dateEnd ? new Date(d.dateEnd).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }) : "";
                            const initialDisplayRub = d.initialRubCents != null ? (d.effectiveKind === "LIABILITY" ? Math.abs(d.initialRubCents) : d.initialRubCents) : null;
                            const initialDisplayCur = d.effectiveKind === "LIABILITY" ? Math.abs(d.initialCurCents) / 100 : d.initialCurCents / 100;
                            const finalDisplayRub = d.finalRubCents != null ? (d.effectiveKind === "LIABILITY" ? Math.abs(d.finalRubCents) : d.finalRubCents) : null;
                            const finalDisplayCur = d.effectiveKind === "LIABILITY" ? Math.abs(d.finalCurCents) / 100 : d.finalCurCents / 100;
                            const showCurRow = d.currencyCode !== "RUB";
                            return (
                              <div className="flex w-full gap-4 flex-wrap mt-4">
                                {d.isBalanceMode ? (
                                  <>
                                    <SummaryBlock title={`На ${dateStartLabel}`} curVal={showCurRow ? initialDisplayCur : null} rubVal={initialDisplayRub} showQtyRow={false} showCurRow={showCurRow} />
                                    <SummaryBlock title="Доходы" curVal={showCurRow ? d.totalIncomeCur : null} rubVal={d.totalIncomeRub} amountColor={GREEN} showQtyRow={false} showCurRow={showCurRow} />
                                    <SummaryBlock title="Расходы" curVal={showCurRow ? -d.totalExpenseCur : null} rubVal={-d.totalExpenseRub} amountColor={RED} showQtyRow={false} showCurRow={showCurRow} />
                                    <SummaryBlock title="Переводы" curVal={showCurRow ? d.totalTransferCur : null} rubVal={d.totalTransferRub} amountColor={d.totalTransferRub < 0 ? RED : d.totalTransferRub > 0 ? GREEN : undefined} showQtyRow={false} showCurRow={showCurRow} />
                                    {showCurRow && (
                                      <SummaryBlock title="Курсовые разницы" curVal={null} rubVal={d.courseDiffRub} amountColor={d.courseDiffRub >= 0 ? GREEN : RED} showQtyRow={false} showCurRow={false} />
                                    )}
                                    <SummaryBlock title={`На ${dateEndLabel}`} curVal={showCurRow ? finalDisplayCur : null} rubVal={finalDisplayRub} showQtyRow={false} showCurRow={showCurRow} />
                                  </>
                                ) : d.isMarketMode && d.isMarketOrCrypto ? (
                                  <>
                                    <SummaryBlock title={`На ${dateStartLabel}`} qtyVal={d.qtyStart} curVal={showCurRow ? initialDisplayCur : null} rubVal={initialDisplayRub} showQtyRow={true} showCurRow={showCurRow} />
                                    <SummaryBlock title="Куплено" qtyVal={d.totalBuyQty} curVal={showCurRow ? d.totalExpenseCur : null} rubVal={d.totalExpenseRub} amountColor={GREEN} showQtyRow={true} showCurRow={showCurRow} />
                                    <SummaryBlock title="Продано" qtyVal={-d.totalSellQty} curVal={showCurRow ? -d.totalSaleCur : null} rubVal={-d.totalSaleRub} amountColor={RED} showQtyRow={true} showCurRow={showCurRow} />
                                    <SummaryBlock title="Изменение цены" qtyVal={undefined} curVal={showCurRow && d.priceChangeCur != null ? d.priceChangeCur : null} rubVal={d.priceChangeRub} amountColor={d.priceChangeRub >= 0 ? GREEN : RED} showCurRow={showCurRow} showQtyRow={false} showEmptyQtyRow={true} />
                                    {showCurRow && (
                                      <SummaryBlock title="Курсовые разницы" curVal={null} rubVal={d.courseDiffRub} amountColor={d.courseDiffRub >= 0 ? GREEN : RED} showQtyRow={false} showCurRow={false} />
                                    )}
                                    <SummaryBlock title={`На ${dateEndLabel}`} qtyVal={d.qtyEnd} curVal={showCurRow ? finalDisplayCur : null} rubVal={finalDisplayRub} showQtyRow={true} showCurRow={showCurRow} />
                                  </>
                                ) : (
                                  <>
                                    <SummaryBlock title={`На ${dateStartLabel}`} curVal={showCurRow ? initialDisplayCur : null} rubVal={initialDisplayRub} showQtyRow={false} showCurRow={showCurRow} />
                                    <SummaryBlock title="Изменение цены" qtyVal={undefined} curVal={showCurRow && d.priceChangeCur != null ? d.priceChangeCur : null} rubVal={d.priceChangeRub} amountColor={d.priceChangeRub >= 0 ? GREEN : RED} showCurRow={showCurRow} showQtyRow={false} />
                                    {showCurRow && (
                                      <SummaryBlock title="Курсовые разницы" curVal={null} rubVal={d.courseDiffRub} amountColor={d.courseDiffRub >= 0 ? GREEN : RED} showQtyRow={false} showCurRow={false} />
                                    )}
                                    <SummaryBlock title={`На ${dateEndLabel}`} curVal={showCurRow ? finalDisplayCur : null} rubVal={finalDisplayRub} showQtyRow={false} showCurRow={showCurRow} />
                                  </>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}


          </div>
        </div>

        {(item && (item.primary_value_kind ?? "BALANCE") === "BALANCE" && (
          <div className="relative rounded-lg overflow-hidden border-0 outline-none mt-6" style={{ backgroundColor: MODAL_BG }}>
            <div className="p-6">
              <div className="flex items-center justify-between gap-4 mb-4">
                <h3 className="text-2xl font-medium shrink-0 flex items-center gap-2" style={{ color: ACTIVE_TEXT_DARK }}>
                <MapPin className="h-6 w-6 shrink-0" style={{ color: ACTIVE_TEXT_DARK }} aria-hidden />
                Контрольные точки
              </h3>
                <Button
                  type="button"
                  className="rounded-[9px] border-0 flex items-center justify-center transition-colors hover:opacity-90 text-sm font-normal shrink-0"
                  style={{ backgroundColor: ACCENT }}
                  onClick={() => openCheckpointModal(null)}
                >
                  <Plus className="h-4 w-4 mr-2" style={{ color: "white", opacity: 0.85 }} />
                  <span style={{ color: "white", opacity: 0.85 }}>Добавить</span>
                </Button>
              </div>
              {checkpoints.length === 0 ? (
                <p className="text-sm" style={{ color: PLACEHOLDER_COLOR_DARK }}>Нет контрольных точек.</p>
              ) : (
                <div className="rounded-lg overflow-hidden">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr style={{ color: PLACEHOLDER_COLOR_DARK, backgroundColor: BACKGROUND_DT }}>
                        <th className="pl-6 pr-4 py-3 text-sm font-medium">Дата и время</th>
                        <th className="px-4 py-3 text-sm font-medium">Расчётное сальдо</th>
                        <th className="px-4 py-3 text-sm font-medium">Должно быть</th>
                        <th className="px-4 py-3 text-sm font-medium">Статус</th>
                        <th className="px-4 py-3 text-sm font-medium">Источник</th>
                        <th className="px-6 py-3 text-sm font-medium text-right" aria-label="Действия" />
                      </tr>
                    </thead>
                    <tbody>
                      {checkpoints.map((cp) => {
                        const dt = new Date(cp.checkpoint_at);
                        const dateTimeLabel = dt.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
                        return (
                          <tr key={cp.id} className="border-t border-white/10" style={{ backgroundColor: MODAL_BG }}>
                            <td className="pl-6 pr-4 py-2 text-sm" style={{ color: ACTIVE_TEXT_DARK }}>{dateTimeLabel}</td>
                            <td className="px-4 py-2 text-sm">
                              <AmountWithCurrency valueCents={cp.computed_balance_cents} currencyCode={item.currency_code ?? "RUB"} />
                            </td>
                            <td className="px-4 py-2 text-sm">
                              <AmountWithCurrency valueCents={cp.stated_balance_cents} currencyCode={item.currency_code ?? "RUB"} />
                            </td>
                            <td className="px-4 py-2 text-sm">
                              <span
                                className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium"
                                style={{
                                  backgroundColor: cp.status === "OK" ? "rgba(34, 197, 94, 0.2)" : "rgba(239, 68, 68, 0.2)",
                                  color: cp.status === "OK" ? GREEN : RED,
                                }}
                              >
                                {cp.status === "OK" ? "ОК" : "Расхождение"}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-sm">
                              <span
                                className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium"
                                style={{
                                  backgroundColor: "rgba(148, 163, 184, 0.2)",
                                  color: PLACEHOLDER_COLOR_DARK,
                                }}
                              >
                                {cp.source === "IMPORTED" ? "Импортированная" : "Ручная"}
                              </span>
                            </td>
                            <td className="px-6 py-2 text-sm text-right">
                              <div className="flex items-center justify-end gap-1">
                                <IconButton aria-label="Редактировать" onClick={() => openCheckpointModal(cp.id)}>
                                  <Pencil className="h-4 w-4" />
                                </IconButton>
                                <IconButton aria-label="Удалить" onClick={() => deleteCheckpoint(cp.id)}>
                                  <Trash2 className="h-4 w-4" style={{ color: RED }} />
                                </IconButton>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ))}

        {costs && (
          <div className="relative rounded-lg overflow-hidden border-0 outline-none mt-6" style={{ backgroundColor: MODAL_BG }}>
            <div className="p-6">
              <h3 className="text-2xl font-medium mb-4" style={{ color: ACTIVE_TEXT_DARK }}>Доходы и расходы</h3>
              <div className="flex flex-col gap-2">
                {(["income", "expense"] as const).map((key) => {
                  const label = key === "income" ? "Доход" : "Расход";
                  const rubTotalCents = key === "income" ? costs.income_rub : costs.expense_rub;
                  const isExpanded = rentabilityOpen === key;
                  const currencyCode = (item.currency_code ?? "RUB").toUpperCase();
                  const isCurrencyAsset = currencyCode !== "RUB";
                  const rate = isCurrencyAsset ? getRateForDateKey(todayKey) : null;
                  const assetTotalCents =
                    isCurrencyAsset && rate != null && rate > 0 ? Math.round(rubTotalCents / rate) : null;
                  const txs = key === "income" ? incomeTxsForAsset : expenseTxsForAsset;
                  const amountColor = key === "income" ? GREEN : RED;
                  return (
                    <div key={key} className="w-full">
                      <div
                        className="rounded-[9px] overflow-hidden"
                        style={{
                          backgroundColor: BACKGROUND_DT,
                          borderLeftWidth: 7,
                          borderLeftStyle: "solid",
                          borderLeftColor: amountColor,
                        }}
                      >
                        <div
                          className={`flex w-full items-center gap-2 py-3 px-3 cursor-pointer transition-colors hover:opacity-90 ${isExpanded ? "rounded-t-[9px] border-b border-white/10" : ""}`}
                          onClick={() => setRentabilityOpen((v) => (v === key ? null : key))}
                          style={{
                            backgroundImage: `linear-gradient(90deg, ${amountColor}22, transparent 50%)`,
                          }}
                        >
                          <IconButton
                            aria-label={isExpanded ? "Свернуть" : "Развернуть"}
                            onClick={(e) => { e.stopPropagation(); setRentabilityOpen((v) => (v === key ? null : key)); }}
                          >
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </IconButton>
                          <span className="text-sm shrink-0" style={{ color: ACTIVE_TEXT_DARK }}>{label}</span>
                          <div className="flex-1 min-w-0" />
                          <div className="text-2xl font-medium shrink-0 text-right" style={{ color: amountColor }}>
                            {isCurrencyAsset && assetTotalCents != null ? (
                              <div className="flex flex-col items-end gap-0.5">
                                <AmountWithCurrency valueCents={key === "expense" ? -rubTotalCents : rubTotalCents} currencyCode="RUB" amountStyle={{ color: amountColor }} />
                                <AmountWithCurrency valueCents={key === "expense" ? -assetTotalCents : assetTotalCents} currencyCode={item.currency_code} amountStyle={{ color: amountColor }} />
                              </div>
                            ) : (
                              <AmountWithCurrency valueCents={key === "expense" ? -rubTotalCents : rubTotalCents} currencyCode="RUB" amountStyle={{ color: amountColor }} />
                            )}
                          </div>
                        </div>
                        {isExpanded && (
                          <div className="p-4 pt-0" style={{ backgroundColor: "transparent" }}>
                            {loadingDynamics ? (
                              <p className="text-sm" style={{ color: PLACEHOLDER_COLOR_DARK }}>Загрузка...</p>
                            ) : txs.length === 0 ? (
                              <p className="text-sm" style={{ color: PLACEHOLDER_COLOR_DARK }}>
                                {key === "income" ? "Нет доходов по активу." : "Нет расходов по активу."}
                              </p>
                            ) : (
                              <table className="w-full text-left border-collapse text-sm" style={{ color: ACTIVE_TEXT_DARK }}>
                                <tbody>
                                  {txs.map((tx) => {
                                    const d = toTxDateKey(tx.transaction_date);
                                    const primaryItem = itemsById.get(tx.primary_item_id) ?? null;
                                    const txCurrency = (primaryItem?.currency_code ?? "RUB").toUpperCase();
                                    const rateTxCur =
                                      txCurrency === "RUB"
                                        ? 1
                                        : getRateForDate(fxRatesByDate, d, txCurrency, latestRatesByCurrency, todayKey, sortedFxRateDateKeys);
                                    const rateAsset =
                                      isCurrencyAsset
                                        ? getRateForDate(fxRatesByDate, d, currencyCode, latestRatesByCurrency, todayKey, sortedFxRateDateKeys)
                                        : null;
                                    const rubCentsTx =
                                      rateTxCur != null && rateTxCur > 0
                                        ? Math.round((tx.amount ?? 0) * rateTxCur)
                                        : (tx.amount ?? 0);
                                    const assetCentsTx =
                                      isCurrencyAsset && rateAsset != null && rateAsset > 0
                                        ? Math.round(rubCentsTx / rateAsset)
                                        : null;
                                    const currencyUnits = isCurrencyAsset && assetCentsTx != null ? assetCentsTx / 100 : null;
                                    const categoryPath = tx.category_id != null ? (categoryLookup.idToPath.get(tx.category_id) ?? []) : [];
                                    const categoryLabel = categoryPath.length > 0 ? categoryPath[categoryPath.length - 1]! : "–";
                                    return (
                                      <tr key={tx.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                                        <td className="py-1.5 pr-4 align-middle" style={{ color: ACTIVE_TEXT_DARK }}>{formatTxDateCell(tx.transaction_date)}</td>
                                        <td className="py-1.5 pr-4 align-middle">
                                          {tx.category_id != null ? (
                                            <div className="flex items-center gap-2">
                                              <CategoryIconImage
                                                categoryId={tx.category_id}
                                                categoryLookup={categoryLookup}
                                                apiBase={API_BASE}
                                                size={18}
                                                className="h-4 w-4 rounded-sm object-contain shrink-0"
                                                fallbackIconColor={ACTIVE_TEXT_DARK}
                                              />
                                              <span style={{ color: ACTIVE_TEXT_DARK }}>{categoryLabel}</span>
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
                                        {isCurrencyAsset && (
                                          <>
                                            <td className="py-1.5 pr-4 align-middle w-0 min-w-[120px]">
                                              <div className="flex items-center gap-2 tabular-nums w-full">
                                                <CurrencyChip code={currencyCode} />
                                                <span className="ml-auto" style={{ color: amountColor }}>{currencyUnits != null ? new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(key === "expense" ? -currencyUnits : currencyUnits) : "–"}</span>
                                              </div>
                                            </td>
                                            <td className="py-1.5 pr-4 text-right tabular-nums align-middle" style={{ color: PLACEHOLDER_COLOR_DARK }}>{rateAsset != null ? new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(rateAsset) : "–"}</td>
                                          </>
                                        )}
                                        <td className="py-1.5 pr-4 align-middle w-0 min-w-[120px]">
                                          <div className="flex items-center gap-2 tabular-nums w-full">
                                            <CurrencyChip code="RUB" />
                                            <span className="ml-auto" style={{ color: amountColor }}>{formatRub(key === "expense" ? -rubCentsTx : rubCentsTx)}</span>
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {item && editModalOpen && (
          <AddEditItemFormModal
            open={true}
            onOpenChange={(next) => {
              if (!next) setEditModalOpen(false);
            }}
            onSuccess={(updated) => {
              setItem(updated);
              setEditModalOpen(false);
              load();
            }}
            editingItem={item}
            onClearEditingItem={() => {}}
            initialCreateOptions={null}
            askConfirm={askConfirm}
          />
        )}

        <FormModal
          open={closeDialogOpen}
          onOpenChange={(open) => {
            if (!open) {
              setCloseDialogOpen(false);
              setCloseDialogError(null);
            }
          }}
          title="Закрытие актива"
          icon={<Archive className="w-8 h-8" style={{ color: ACTIVE_TEXT_DARK }} />}
          formError={closeDialogError}
          onSubmit={(e) => {
            e.preventDefault();
            handleConfirmClose();
          }}
          onCancel={() => {
            setCloseDialogOpen(false);
            setCloseDialogError(null);
          }}
          submitLabel={loading ? "Закрываем..." : "Закрыть"}
          cancelLabel="Отмена"
          loading={loading}
          disabled={!closeDate}
        >
          <DateField
            label="Дата закрытия"
            required
            value={closeDate}
            onChange={(e) => setCloseDate(e.target.value)}
          />
        </FormModal>

        <FormModal
          open={editClosedAtOpen}
          onOpenChange={(open) => {
            if (!open) {
              setEditClosedAtOpen(false);
              setEditClosedAtError(null);
            }
          }}
          title="Редактирование даты закрытия"
          icon={<Calendar className="w-8 h-8" style={{ color: ACTIVE_TEXT_DARK }} />}
          formError={editClosedAtError}
          onSubmit={(e) => {
            e.preventDefault();
            handleEditClosedAtSave();
          }}
          onCancel={() => {
            setEditClosedAtOpen(false);
            setEditClosedAtError(null);
          }}
          submitLabel={savingClosedAt ? "Сохранение..." : "Сохранить"}
          cancelLabel="Отмена"
          loading={savingClosedAt}
          disabled={!editClosedAtDate}
        >
          <DateField
            label="Дата закрытия"
            required
            value={editClosedAtDate}
            onChange={(e) => setEditClosedAtDate(e.target.value)}
          />
        </FormModal>

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
            onSuccess={async () => { await load(); await refetchCostHistory(); }}
          />
        )}
        {!item.instrument_id && (
          <EditMarketValueModal
            open={editMarketValueModalOpen}
            onOpenChange={setEditMarketValueModalOpen}
            item={item}
            marketValues={marketValues}
            getRateForDate={getRateForDateKey}
            onSuccess={async () => {
              await load();
              await refetchCostHistory();
            }}
          />
        )}

        <Dialog open={checkpointModalOpen} onOpenChange={setCheckpointModalOpen}>
          <DialogContent className="sm:max-w-md" style={{ backgroundColor: MODAL_BG }}>
            <DialogHeader>
              <DialogTitle
                className="flex items-center gap-3 text-[32px] font-medium"
                style={{ color: ACTIVE_TEXT_DARK }}
              >
                <Target className="w-8 h-8 shrink-0" />
                {checkpointEditId != null ? "Редактировать контрольную точку" : "Добавить контрольную точку"}
              </DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <FormField label="Дата и время" required>
                <div className="relative flex items-center gap-2 flex-wrap [&_input]:text-sm [&_input]:font-normal [&_div.relative.flex.items-center]:h-10 [&_div.relative.flex.items-center]:min-h-[40px]">
                  <div className="relative flex items-center min-h-[40px] flex-1 min-w-0">
                    <AuthInput
                      type="date"
                      value={checkpointDateStr}
                      onChange={(e) => setCheckpointDateStr(e.target.value)}
                      className="w-full"
                    />
                  </div>
                  <div className="relative flex items-center min-h-[40px] shrink-0 min-w-[5.5rem] w-[6rem]">
                    <AuthInput
                      type="text"
                      inputMode="numeric"
                      value={checkpointTimeStr}
                      onChange={(e) => setCheckpointTimeStr(formatTimeInput(e.target.value))}
                      placeholder="00:00"
                      maxLength={5}
                      autoComplete="off"
                      className="w-full"
                    />
                  </div>
                </div>
              </FormField>
              <TextField
                label="Сумма"
                currencyCode={item?.currency_code ?? "RUB"}
                value={checkpointAmountStr}
                onChange={(e) => setCheckpointAmountStr(formatRubInput(e.target.value))}
                onBlur={(e) => setCheckpointAmountStr(e.target.value.trim() ? normalizeRubOnBlur(e.target.value) : e.target.value)}
                placeholder="0,00"
                required
              />
              {checkpointBalanceAtLoading ? (
                <p className="text-sm" style={{ color: PLACEHOLDER_COLOR_DARK }}>Загрузка…</p>
              ) : checkpointComputedCents != null && checkpointAmountStr.trim() !== "" ? (
                (() => {
                  const statedCents = parseRubToCents(normalizeRubOnBlur(checkpointAmountStr));
                  if (statedCents === null) return null;
                  const matches = statedCents === checkpointComputedCents;
                  return matches ? (
                    <div
                      className="text-sm rounded-md border p-3"
                      style={{
                        color: "#34D399",
                        backgroundColor: "rgba(52, 211, 153, 0.08)",
                        borderColor: "rgba(52, 211, 153, 0.3)",
                      }}
                    >
                      Совпадает с расчетной суммой
                    </div>
                  ) : (
                    <div
                      className="text-sm rounded-md border p-3 flex flex-wrap items-center gap-2"
                      style={{
                        color: "#FB4C4F",
                        backgroundColor: "rgba(251, 76, 79, 0.08)",
                        borderColor: "rgba(251, 76, 79, 0.3)",
                      }}
                    >
                      <span>Не совпадает с расчетной суммой —</span>
                      <AmountWithCurrency valueCents={checkpointComputedCents} currencyCode={item?.currency_code ?? "RUB"} />
                    </div>
                  );
                })()
              ) : null}
              {checkpointModalError && (
                <div
                  className="text-sm rounded-md border p-3"
                  style={{
                    color: "#FB4C4F",
                    backgroundColor: "rgba(251, 76, 79, 0.08)",
                    borderColor: "rgba(251, 76, 79, 0.3)",
                  }}
                >
                  {checkpointModalError}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="glass"
                className="rounded-lg border-0"
                style={
                  {
                    "--glass-bg": "rgba(108, 93, 215, 0.22)",
                    "--glass-bg-hover": "rgba(108, 93, 215, 0.4)",
                  } as React.CSSProperties
                }
                onClick={() => setCheckpointModalOpen(false)}
              >
                Отмена
              </Button>
              <Button
                type="button"
                variant="authPrimary"
                className="rounded-lg border-0"
                style={
                  {
                    "--auth-primary-bg":
                      "linear-gradient(135deg, #483BA6 0%, #6C5DD7 57%, #6C5DD7 79%, #9487F3 100%)",
                    "--auth-primary-bg-hover":
                      "linear-gradient(315deg, #9487F3 0%, #6C5DD7 57%, #6C5DD7 79%, #483BA6 100%)",
                  } as React.CSSProperties
                }
                onClick={saveCheckpoint}
                disabled={checkpointSaving || !checkpointDateStr}
              >
                {checkpointSaving ? "Сохранение…" : checkpointEditId != null ? "Сохранить" : "Добавить"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>
    </main>
  );
}
