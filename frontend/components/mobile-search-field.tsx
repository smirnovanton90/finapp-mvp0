"use client";

import React, { useState, forwardRef } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { MobileTapScale } from "@/components/mobile-tap-scale";
import { ACCENT_FILL_LIGHT, ACCENT_FILL_MEDIUM, PLACEHOLDER_COLOR_DARK, ACTIVE_TEXT_DARK, ACCENT } from "@/lib/colors";

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
  /** Не оборачивать в MobileTapScale (для использования внутри оверлея и т.п.). */
  noTapScale?: boolean;
}

/** Стили поля поиска как у остальных полей: заливка ACCENT_FILL_LIGHT/ACCENT_FILL_MEDIUM, без обводки и подсветки. */
export function getMobileSearchFieldStyle(focused: boolean, hasValue: boolean) {
  const backgroundColor = focused || hasValue ? ACCENT_FILL_MEDIUM : ACCENT_FILL_LIGHT;
  return { backgroundColor, boxShadow: "none" };
}

/**
 * Поле поиска для мобильной вёрстки: лупа слева, плейсхолдер, крестик сброса при вводе,
 * обводка и подсветка при фокусе, анимация при клике. Предназначено для переиспользования.
 */
export const MobileSearchField = forwardRef<HTMLInputElement, MobileSearchFieldProps>(
  function MobileSearchField(
    {
      value,
      onChange,
      placeholder = "Поиск",
      "aria-label": ariaLabel = "Поиск",
      className,
      noTapScale = false,
    },
    ref
  ) {
    const [focused, setFocused] = useState(false);

    const hasValue = value.length > 0;
    const style = getMobileSearchFieldStyle(focused, hasValue);
    const iconColor = focused ? ACCENT : (hasValue ? ACTIVE_TEXT_DARK : PLACEHOLDER_COLOR_DARK);

    const content = (
      <div
        className="relative flex items-center rounded-[9px] transition-[background-color,box-shadow] duration-200"
        style={style}
      >
        <Search
          className="absolute left-3 h-4 w-4 shrink-0 pointer-events-none transition-colors duration-200"
          style={{ color: iconColor }}
          aria-hidden
        />
        <Input
          ref={ref}
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
    );

    if (noTapScale) {
      return <div className={className ?? "w-full"}>{content}</div>;
    }
    return (
      <MobileTapScale className={className ?? "w-full"}>
        {content}
      </MobileTapScale>
    );
  }
);
