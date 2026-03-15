"use client";

import React, { useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { MobileTapScale } from "@/components/mobile-tap-scale";
import { ACCENT, ACCENT2, PLACEHOLDER_COLOR_DARK, ACTIVE_TEXT_DARK } from "@/lib/colors";

export interface MobileSearchFieldProps {
  /** Текущее значение поля. */
  value: string;
  /** Обработчик изменения (например setState). */
  onChange: (value: string) => void;
  /** Плейсхолдер. По умолчанию "Поиск". */
  placeholder?: string;
  /** Доступность: подпись для поля (например для screen readers). */
  "aria-label"?: string;
  /** Дополнительный класс для обёртки (MobileTapScale). */
  className?: string;
}

/**
 * Поле поиска для мобильной вёрстки: лупа слева, плейсхолдер, крестик сброса при вводе,
 * обводка и подсветка при фокусе, анимация при клике. Предназначено для переиспользования.
 */
export function MobileSearchField({
  value,
  onChange,
  placeholder = "Поиск",
  "aria-label": ariaLabel = "Поиск",
  className,
}: MobileSearchFieldProps) {
  const [focused, setFocused] = useState(false);

  const hasValue = value.length > 0;
  const bgOpacity = focused || hasValue ? "rgba(197, 191, 241, 0.32)" : "rgba(197, 191, 241, 0.18)";
  const boxShadow = focused
    ? `inset 0 -2px 0 0 ${ACCENT2}, 0 8px 25px -8px ${ACCENT2}`
    : "none";
  const iconColor = focused ? ACCENT : PLACEHOLDER_COLOR_DARK;

  return (
    <MobileTapScale className={className ?? "w-full"}>
      <div
        className="relative flex items-center rounded-[9px] transition-[background-color,box-shadow] duration-200"
        style={{
          backgroundColor: bgOpacity,
          boxShadow,
        }}
      >
        <Search
          className="absolute left-3 h-4 w-4 shrink-0 pointer-events-none transition-colors duration-200"
          style={{ color: iconColor }}
          aria-hidden
        />
        <Input
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="w-full pl-10 pr-10 py-2 text-base font-normal border-0 shadow-none outline-none focus-visible:ring-0 focus-visible:border-0 rounded-[9px] placeholder:text-[rgba(197,191,241,0.6)]"
          style={{
            color: ACTIVE_TEXT_DARK,
            backgroundColor: "transparent",
          }}
          aria-label={ariaLabel}
        />
        {hasValue && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute right-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-md touch-manipulation transition-colors duration-200"
            style={{ color: iconColor }}
            aria-label="Очистить поиск"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </MobileTapScale>
  );
}
