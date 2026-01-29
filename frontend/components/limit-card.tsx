"use client";

import React, { useState } from "react";
import { MoreVertical, Pencil, Trash2, MessageSquare, ChevronDown, ChevronUp } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCategoryIcon } from "@/hooks/use-category-icon";
import { useImagePreloader } from "@/hooks/use-image-preloader";
import type { LimitOut, LimitPeriod, TransactionOut } from "@/lib/api";
import {
  MODAL_BG,
  BACKGROUND_DT,
  GREEN,
  GREEN_TRANSACTION,
  ACCENT,
  PLACEHOLDER_COLOR_DARK,
  ACTIVE_TEXT_DARK,
} from "@/lib/colors";
import { PINK_GRADIENT } from "@/lib/gradients";
import type { CategoryLookup } from "@/lib/categories";
import { formatAmount } from "@/lib/item-utils";

const PERIOD_LABELS: Record<LimitPeriod, string> = {
  MONTHLY: "Ежемесячно",
  WEEKLY: "Еженедельно",
  YEARLY: "Ежегодно",
  CUSTOM: "Произвольный период",
};

const MONTH_NAMES_RU = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

function toDateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getWeekStart(date: Date) {
  const day = date.getDay();
  const diff = (day + 6) % 7;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - diff);
}

export type PeriodRange = {
  startKey: string;
  endKey: string;
  label: string;
};

function getCurrentPeriodRange(limit: LimitOut, today: Date): PeriodRange | null {
  if (limit.period === "CUSTOM") {
    if (!limit.custom_start_date || !limit.custom_end_date) return null;
    return {
      startKey: limit.custom_start_date,
      endKey: limit.custom_end_date,
      label: `${limit.custom_start_date} — ${limit.custom_end_date}`,
    };
  }
  if (limit.period === "WEEKLY") {
    const start = getWeekStart(today);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
    return {
      startKey: toDateKey(start),
      endKey: toDateKey(end),
      label: `${MONTH_NAMES_RU[start.getMonth()]} ${start.getFullYear()}`,
    };
  }
  if (limit.period === "MONTHLY") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return {
      startKey: toDateKey(start),
      endKey: toDateKey(end),
      label: `${MONTH_NAMES_RU[today.getMonth()]} ${today.getFullYear()}`,
    };
  }
  const start = new Date(today.getFullYear(), 0, 1);
  const end = new Date(today.getFullYear(), 11, 31);
  return {
    startKey: toDateKey(start),
    endKey: toDateKey(end),
    label: String(today.getFullYear()),
  };
}

function getPreviousPeriodRanges(
  limit: LimitOut,
  today: Date,
  accountingStartKey: string | null
): PeriodRange[] {
  const ranges: PeriodRange[] = [];
  const current = getCurrentPeriodRange(limit, today);
  if (!current) return ranges;

  const limitStartKey = limit.created_at ? limit.created_at.slice(0, 10) : accountingStartKey;
  const effectiveStart = limitStartKey || current.startKey;

  if (limit.period === "MONTHLY") {
    const [sy, sm] = effectiveStart.split("-").map(Number);
    const cy = today.getFullYear();
    const cm = today.getMonth();
    for (let y = cy; y >= sy; y--) {
      const monthEnd = y === cy ? cm - 1 : 11;
      const monthStart = y === sy ? sm - 1 : 0;
      for (let m = monthEnd; m >= monthStart; m--) {
        if (y === cy && m === cm) continue;
        const start = new Date(y, m, 1);
        const end = new Date(y, m + 1, 0);
        ranges.push({
          startKey: toDateKey(start),
          endKey: toDateKey(end),
          label: `${MONTH_NAMES_RU[m]} ${y}`,
        });
      }
    }
  } else if (limit.period === "WEEKLY") {
    const curStart = getWeekStart(today);
    const curStartKey = toDateKey(curStart);
    let d = new Date(curStart.getFullYear(), curStart.getMonth(), curStart.getDate() - 7);
    while (toDateKey(d) >= effectiveStart) {
      const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 6);
      const endKey = toDateKey(end);
      if (endKey < curStartKey) {
        ranges.push({
          startKey: toDateKey(d),
          endKey,
          label: `${MONTH_NAMES_RU[d.getMonth()]} ${d.getFullYear()}`,
        });
      }
      d = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 7);
      if (ranges.length >= 24) break;
    }
  } else if (limit.period === "YEARLY") {
    const [sy] = effectiveStart.split("-").map(Number);
    const cy = today.getFullYear();
    for (let y = cy - 1; y >= sy; y--) {
      ranges.push({
        startKey: `${y}-01-01`,
        endKey: `${y}-12-31`,
        label: String(y),
      });
      if (ranges.length >= 12) break;
    }
  }
  return ranges;
}

function isRealizedTransaction(tx: TransactionOut) {
  return tx.transaction_type === "ACTUAL" || tx.status === "REALIZED";
}

function toTxDateKey(value: string) {
  return value ? value.slice(0, 10) : "";
}

function spentInRange(
  txs: TransactionOut[],
  categoryIds: Set<number>,
  startKey: string,
  endKey: string
): number {
  let sum = 0;
  for (const tx of txs) {
    if (tx.direction !== "EXPENSE") continue;
    if (!isRealizedTransaction(tx)) continue;
    if (!tx.category_id || !categoryIds.has(tx.category_id)) continue;
    const dateKey = toTxDateKey(tx.transaction_date);
    if (!dateKey || dateKey < startKey || dateKey > endKey) continue;
    sum += tx.amount_rub;
  }
  return sum;
}

function getProgressTone(ratio: number): "ok" | "warn" | "over" {
  if (ratio >= 1) return "over";
  if (ratio >= 0.75) return "warn";
  return "ok";
}

function getProgressBarColor(tone: "ok" | "warn" | "over") {
  if (tone === "over") return "#FB4C4F";
  if (tone === "warn") return "#FF8D28";
  return "#34D399";
}

export interface LimitCardProps {
  limit: LimitOut;
  categoryLookup: CategoryLookup;
  categoryPathLabel: string;
  categoryDescendants: Map<number, Set<number>>;
  txs: TransactionOut[];
  currentSpent: number;
  currentProgress: number;
  onEdit?: (limit: LimitOut) => void;
  onDelete?: (limit: LimitOut) => void;
  /** Описание/комментарий лимита (если API будет поддерживать — подставить) */
  description?: string | null;
}

export function LimitCard({
  limit,
  categoryLookup,
  categoryPathLabel,
  categoryDescendants,
  txs,
  currentSpent,
  currentProgress,
  onEdit,
  onDelete,
  description,
}: LimitCardProps) {
  const [expanded, setExpanded] = useState(false);
  const isDeleted = Boolean(limit.deleted_at);
  const periodLabel = PERIOD_LABELS[limit.period];
  const today = new Date();
  const currentRange = getCurrentPeriodRange(limit, today);
  const previousRanges = getPreviousPeriodRanges(limit, today, null);

  const { categoryIcon3dPath, CategoryIcon, setCategoryIconFormat } = useCategoryIcon(
    limit.category_id,
    categoryLookup
  );
  const categoryImageUrl = categoryIcon3dPath || null;
  const { isReady, setImageRef, handleImageLoad, handleImageError } = useImagePreloader({
    imageUrls: categoryImageUrl ? [categoryImageUrl] : [],
    cacheCheckDelay: 0,
  });
  const categoryIds = categoryDescendants.get(limit.category_id) ?? new Set([limit.category_id]);

  const currentTone = getProgressTone(
    limit.amount_rub > 0 ? currentSpent / limit.amount_rub : 0
  );
  const currentBarColor = getProgressBarColor(currentTone);

  const cardBg = isDeleted ? BACKGROUND_DT : MODAL_BG;

  return (
    <div
      className="relative rounded-lg overflow-hidden"
      style={{
        backgroundColor: cardBg,
        opacity: isReady ? 1 : 0,
        transition: "opacity 0.2s ease-in-out",
      }}
    >
      <div className="p-[12px]">
        {/* Header: картинка + основная информация + кнопка меню */}
        <div className="flex items-start justify-between mb-3 gap-3">
          <div className="w-[100px] h-[100px] flex items-center justify-center shrink-0">
            {categoryIcon3dPath ? (
              <img
                ref={(el) => setImageRef(0, el)}
                src={categoryIcon3dPath}
                alt=""
                className="w-[100px] h-[100px] rounded-lg object-contain"
                style={{ filter: "drop-shadow(0 34px 48.8px rgba(0,0,0,0.25))" }}
                onLoad={() => handleImageLoad(0)}
                onError={() => {
                  if (categoryIcon3dPath.endsWith(".png")) {
                    setCategoryIconFormat("webp");
                  } else {
                    setCategoryIconFormat(null);
                    handleImageError(0);
                  }
                }}
              />
            ) : (
              <div
                className="w-[100px] h-[100px] rounded-lg flex items-center justify-center"
                style={{
                  filter: "drop-shadow(0 34px 48.8px rgba(0,0,0,0.25))",
                  color: ACCENT,
                }}
              >
                <CategoryIcon className="w-16 h-16" strokeWidth={1.5} />
              </div>
            )}
          </div>
          <div className="flex flex-col items-center justify-center flex-1 min-w-0">
            <div
              className="w-full text-center mb-1 text-sm font-normal break-words max-w-full"
              style={{ color: PLACEHOLDER_COLOR_DARK }}
            >
              {categoryPathLabel}
            </div>
            <div
              className="text-2xl font-medium mb-1 text-center break-words max-w-full"
              style={{ color: ACTIVE_TEXT_DARK }}
            >
              {limit.name}
            </div>
            <div
              className="text-sm font-normal text-center"
              style={{ color: PLACEHOLDER_COLOR_DARK }}
            >
              {periodLabel}
            </div>
          </div>
          {/* Кнопка меню — отдельный блок после картинки и информации */}
          <div className="shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton aria-label="Меню лимита">
                  <MoreVertical />
                </IconButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {onEdit && !isDeleted && (
                  <DropdownMenuItem onClick={() => onEdit(limit)}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Редактировать
                  </DropdownMenuItem>
                )}
                {onDelete && (
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => onDelete(limit)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Удалить
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Current period — от левого до правого края карточки */}
        {currentRange && (
          <div className="space-y-2 mb-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-normal" style={{ color: ACTIVE_TEXT_DARK }}>
                Текущий период
              </span>
              <span className="text-2xl font-medium flex items-baseline gap-1">
                <span style={{ color: GREEN }}>{formatAmount(currentSpent)}</span>
                <span style={{ color: ACTIVE_TEXT_DARK }}>/</span>
                <span
                  style={{
                    background: PINK_GRADIENT,
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }}
                >
                  {formatAmount(limit.amount_rub)}
                </span>
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full transition-[width]"
                style={{
                  width: `${Math.min(currentProgress * 100, 100)}%`,
                  backgroundColor: currentBarColor,
                }}
              />
            </div>
          </div>
        )}

        {/* Description (optional) */}
        {(description && description.trim()) && (
          <div
            className="flex items-start gap-2 mb-3 text-sm"
            style={{ color: PLACEHOLDER_COLOR_DARK }}
          >
            <MessageSquare className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{description.trim()}</span>
          </div>
        )}

        {/* Previous periods (collapsible) */}
        {previousRanges.length > 0 && (
          <div className="border-t border-white/10 pt-3">
            <button
              type="button"
              className="flex items-center justify-between w-full text-sm font-normal py-1 rounded hover:bg-white/5 transition-colors"
              style={{ color: ACTIVE_TEXT_DARK }}
              onClick={() => setExpanded((e) => !e)}
              aria-expanded={expanded}
            >
              <span>Предыдущие периоды</span>
              {expanded ? (
                <ChevronUp className="h-4 w-4 shrink-0" />
              ) : (
                <ChevronDown className="h-4 w-4 shrink-0" />
              )}
            </button>
            {expanded && (
              <div className="space-y-3 mt-3">
                {previousRanges.map((range) => {
                  const spent = spentInRange(
                    txs,
                    categoryIds,
                    range.startKey,
                    range.endKey
                  );
                  const progress =
                    limit.amount_rub > 0 ? Math.min(spent / limit.amount_rub, 1) : 0;
                  const tone = getProgressTone(progress);
                  const barColor = getProgressBarColor(tone);
                  return (
                    <div key={range.startKey} className="space-y-1">
                      <div className="flex items-center justify-between text-sm font-normal">
                        <span style={{ color: PLACEHOLDER_COLOR_DARK }}>
                          {range.label}
                        </span>
                        <span style={{ color: ACTIVE_TEXT_DARK }}>
                          {formatAmount(spent)} / {formatAmount(limit.amount_rub)}
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${progress * 100}%`,
                            backgroundColor: barColor,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
