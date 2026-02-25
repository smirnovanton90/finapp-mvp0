"use client";

import React, { type CSSProperties } from "react";

/** Цвета шильдиков валют (фон/20 и текст). Используются в CurrencyChip и для графика в валюте актива. */
const CURRENCY_BADGE_CLASSES: Record<string, string> = {
  RUB: "bg-[#5544D1]/20 text-[#5544D1]",
  USD: "bg-[#2E7D32]/20 text-[#2E7D32]",
  EUR: "bg-[#003399]/20 text-[#003399]",
  JPY: "bg-[#BC002D]/20 text-[#BC002D]",
  CNY: "bg-[#DE2910]/20 text-[#DE2910]",
};

/** Цвет линии/заливки графика в валюте актива — тот же, что у шильдика валюты. */
export const CURRENCY_CHART_COLORS: Record<string, string> = {
  RUB: "#5544D1",
  USD: "#2E7D32",
  EUR: "#003399",
  JPY: "#BC002D",
  CNY: "#DE2910",
};

function getCurrencyBadgeClassInternal(code: string) {
  return CURRENCY_BADGE_CLASSES[code] ?? "bg-muted/20 text-slate-600";
}

/** Цвет для графика в валюте актива (как у шильдика). Для неизвестной валюты — null. */
export function getCurrencyChartColor(code: string | null | undefined): string | null {
  if (!code) return null;
  return CURRENCY_CHART_COLORS[code.toUpperCase()] ?? null;
}

export interface CurrencyChipProps {
  code?: string | null;
  className?: string;
  style?: CSSProperties;
}

/** Унифицированный чип валюты, используемый на всех страницах. */
export function CurrencyChip({ code, className = "", style }: CurrencyChipProps) {
  if (!code) return null;

  return (
    <span
      className={[
        "inline-flex items-center shrink-0 rounded-[9px] px-2 py-0.5 text-[11px] font-semibold uppercase",
        getCurrencyBadgeClassInternal(code),
        className,
      ].join(" ")}
      style={style}
    >
      {code}
    </span>
  );
}

