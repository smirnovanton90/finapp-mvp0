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
import { CategoryIconImage } from "@/components/category-icon-image";
import type { GoalOut, GoalPeriod, TransactionOut } from "@/lib/api";
import type { TransactionDirection } from "@/lib/api";
import {
  MODAL_BG,
  BACKGROUND_DT,
  ACCENT,
  PLACEHOLDER_COLOR_DARK,
  ACTIVE_TEXT_DARK,
  GREEN_TRANSACTION,
  RED,
} from "@/lib/colors";
import { PINK_GRADIENT } from "@/lib/gradients";
import type { CategoryLookup } from "@/lib/categories";
import { getGoalProgressColor } from "@/lib/goal-progress-color";
import { formatAmount } from "@/lib/item-utils";

const PERIOD_LABELS: Record<GoalPeriod, string> = {
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

function formatDateKeyToDisplay(dateKey: string): string {
  const [y, m, d] = dateKey.split("-");
  return `${d}.${m}.${y}`;
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

function getCurrentPeriodRange(goal: GoalOut, today: Date): PeriodRange | null {
  if (goal.period === "CUSTOM") {
    if (!goal.custom_start_date || !goal.custom_end_date) return null;
    return {
      startKey: goal.custom_start_date,
      endKey: goal.custom_end_date,
      label: `${goal.custom_start_date} — ${goal.custom_end_date}`,
    };
  }
  if (goal.period === "WEEKLY") {
    const start = getWeekStart(today);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
    return {
      startKey: toDateKey(start),
      endKey: toDateKey(end),
      label: `${MONTH_NAMES_RU[start.getMonth()]} ${start.getFullYear()}`,
    };
  }
  if (goal.period === "MONTHLY") {
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
  goal: GoalOut,
  today: Date,
  accountingStartKey: string | null
): PeriodRange[] {
  const ranges: PeriodRange[] = [];
  const current = getCurrentPeriodRange(goal, today);
  if (!current) return ranges;

  const goalStartKey = goal.created_at ? goal.created_at.slice(0, 10) : accountingStartKey;
  const effectiveStart = goalStartKey || current.startKey;

  if (goal.period === "MONTHLY") {
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
  } else if (goal.period === "WEEKLY") {
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
          label: `${formatDateKeyToDisplay(toDateKey(d))} — ${formatDateKeyToDisplay(endKey)}`,
        });
      }
      d = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 7);
      if (ranges.length >= 24) break;
    }
  } else if (goal.period === "YEARLY") {
    const [sy] = effectiveStart.split("-").map(Number);
    const cy = today.getFullYear();
    for (let y = cy - 1; y >= sy; y--) {
      const startKey = `${y}-01-01`;
      const endKey = `${y}-12-31`;
      ranges.push({
        startKey,
        endKey,
        label: `${formatDateKeyToDisplay(startKey)} — ${formatDateKeyToDisplay(endKey)}`,
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

function amountInRange(
  txs: TransactionOut[],
  categoryIds: Set<number>,
  startKey: string,
  endKey: string,
  direction: TransactionDirection
): number {
  let sum = 0;
  for (const tx of txs) {
    if (tx.direction !== direction) continue;
    if (!isRealizedTransaction(tx)) continue;
    if (!tx.category_id || !categoryIds.has(tx.category_id)) continue;
    const dateKey = toTxDateKey(tx.transaction_date);
    if (!dateKey || dateKey < startKey || dateKey > endKey) continue;
    sum += tx.amount_rub;
  }
  return sum;
}

export interface GoalCardProps {
  goal: GoalOut;
  isIncomeGoal: boolean;
  categoryLookup: CategoryLookup;
  apiBase: string;
  categoryPathLabel: string;
  categoryDescendants: Map<number, Set<number>>;
  txs: TransactionOut[];
  currentAmount: number;
  currentProgress: number;
  onEdit?: (goal: GoalOut) => void;
  onDelete?: (goal: GoalOut) => void;
  description?: string | null;
}

export function GoalCard({
  goal,
  isIncomeGoal,
  categoryLookup,
  apiBase,
  categoryPathLabel,
  categoryDescendants,
  txs,
  currentAmount,
  currentProgress,
  onEdit,
  onDelete,
  description,
}: GoalCardProps) {
  const [expanded, setExpanded] = useState(false);
  const isDeleted = Boolean(goal.deleted_at);
  const periodLabel = PERIOD_LABELS[goal.period];
  const today = new Date();
  const currentRange = getCurrentPeriodRange(goal, today);
  const previousRanges = getPreviousPeriodRanges(goal, today, null);
  const direction: TransactionDirection = isIncomeGoal ? "INCOME" : "EXPENSE";

  const categoryIds = categoryDescendants.get(goal.category_id) ?? new Set([goal.category_id]);

  const currentRatio = goal.amount_rub > 0 ? currentAmount / goal.amount_rub : 0;
  const currentBarColor = getGoalProgressColor(currentRatio, isIncomeGoal);

  const cardBg = isDeleted ? BACKGROUND_DT : MODAL_BG;
  const stripeColor = isIncomeGoal ? GREEN_TRANSACTION : RED;

  return (
    <div
      className="relative rounded-lg overflow-hidden"
      style={{
        backgroundColor: cardBg,
      }}
    >
      {/* Левая обводка: как у активов (доход) — зелёная, как у обязательств (расход) — красная */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[7px] rounded-l-md"
        style={{ backgroundColor: stripeColor }}
      />
      <div className="pt-[12px] pr-[12px] pb-[12px] pl-[19px]">
        <div className="flex items-start justify-between mb-3 gap-3">
          <div
            className="w-[100px] h-[100px] flex items-center justify-center shrink-0"
            style={{ filter: "drop-shadow(0 34px 48.8px rgba(0,0,0,0.25))" }}
          >
            <CategoryIconImage
              categoryId={goal.category_id}
              categoryLookup={categoryLookup}
              apiBase={apiBase}
              size={100}
              className="w-[100px] h-[100px] rounded-lg object-contain"
              fallbackIconColor={ACCENT}
            />
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
              {goal.name}
            </div>
            <div
              className="text-sm font-normal text-center"
              style={{ color: PLACEHOLDER_COLOR_DARK }}
            >
              {periodLabel}
            </div>
          </div>
          <div className="shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton aria-label="Меню цели">
                  <MoreVertical />
                </IconButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {onEdit && !isDeleted && (
                  <DropdownMenuItem onClick={() => onEdit(goal)}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Редактировать
                  </DropdownMenuItem>
                )}
                {onDelete && (
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => onDelete(goal)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Удалить
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {currentRange && (
          <div className="space-y-2 mb-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-normal" style={{ color: ACTIVE_TEXT_DARK }}>
                До {formatDateKeyToDisplay(currentRange.endKey)}
              </span>
              <span className="text-2xl font-medium flex items-baseline gap-1">
                <span style={{ color: currentBarColor }}>{formatAmount(currentAmount)}</span>
                <span style={{ color: ACTIVE_TEXT_DARK }}>/</span>
                <span
                  style={{
                    background: PINK_GRADIENT,
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }}
                >
                  {formatAmount(goal.amount_rub)}
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

        {(description && description.trim()) && (
          <div
            className="flex items-start gap-2 mb-3 text-sm"
            style={{ color: PLACEHOLDER_COLOR_DARK }}
          >
            <MessageSquare className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{description.trim()}</span>
          </div>
        )}

        {previousRanges.length > 0 && (
          <div className="pt-3">
            <div className="flex items-center justify-between w-full">
              <span
                className="text-sm font-normal"
                style={{ color: ACTIVE_TEXT_DARK }}
              >
                Предыдущие периоды
              </span>
              <IconButton
                type="button"
                onClick={() => setExpanded((e) => !e)}
                aria-expanded={expanded}
                aria-label={expanded ? "Свернуть" : "Развернуть"}
              >
                {expanded ? <ChevronUp /> : <ChevronDown />}
              </IconButton>
            </div>
            {expanded && (
              <div className="space-y-3 mt-3">
                {previousRanges.map((range) => {
                  const amount = amountInRange(
                    txs,
                    categoryIds,
                    range.startKey,
                    range.endKey,
                    direction
                  );
                  const progress =
                    goal.amount_rub > 0 ? Math.min(amount / goal.amount_rub, 1) : 0;
                  const barColor = getGoalProgressColor(progress, isIncomeGoal);
                  return (
                    <div key={range.startKey} className="space-y-1">
                      <div className="flex items-center justify-between text-sm font-normal">
                        <span style={{ color: PLACEHOLDER_COLOR_DARK }}>
                          {range.label}
                        </span>
                        <span style={{ color: ACTIVE_TEXT_DARK }}>
                          {formatAmount(amount)} / {formatAmount(goal.amount_rub)}
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
