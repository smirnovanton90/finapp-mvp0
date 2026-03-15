"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Search, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { ACTIVE_TEXT_DARK, PLACEHOLDER_COLOR_DARK, ACCENT, ACCENT_FILL_LIGHT } from "@/lib/colors";
import { IconButton } from "@/components/ui/icon-button";
import { MobileSearchField, getMobileSearchFieldStyle } from "@/components/mobile-search-field";

function defaultFilter<T>(options: T[], query: string, getLabel: (t: T) => string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return options;
  return options.filter((opt) => getLabel(opt).toLowerCase().includes(q));
}

export interface MobileSearchSelectOverlayProps<T> {
  /** Текущее выбранное значение (для отображения в триггере). */
  value: T | null;
  /** Список вариантов для выбора. */
  options: T[];
  /** Текст для отображения варианта (и для фильтрации по вводу). */
  getOptionLabel: (option: T) => string;
  /** Уникальный ключ варианта (для key в списке). */
  getOptionKey?: (option: T) => string | number;
  /** Вызов при выборе варианта. */
  onSelect: (option: T) => void;
  /** Плейсхолдер пустого поля. */
  placeholder?: string;
  /** Плейсхолдер поля поиска в оверлее. */
  searchPlaceholder?: string;
  /** Кастомный рендер строки варианта. */
  renderOption?: (option: T) => React.ReactNode;
  /** Своя логика фильтрации (по умолчанию — по вхождению getOptionLabel в запрос). */
  filterOptions?: (options: T[], query: string) => T[];
  /** Заблокировано ли поле. */
  disabled?: boolean;
  /** Сообщение при пустом списке вариантов. */
  emptyMessage?: string;
  /** Сообщение при отсутствии результатов поиска. */
  noResultsMessage?: string;
  /** Дополнительный класс триггера. */
  className?: string;
  /** Высота триггера (для выравнивания с другими полями). */
  triggerClassName?: string;
  /** aria-label для триггера. */
  ariaLabel?: string;
  /** Кастомное отображение выбранного значения в триггере (например, иконка + название). */
  renderTriggerContent?: (option: T) => React.ReactNode;
}

/**
 * Мобильный выбор из списка: при клике открывается полноэкранный оверлей,
 * поле переносится вверх, под ним — поиск и список вариантов. После выбора оверлей закрывается.
 * Только для мобильной вёрстки.
 */
export function MobileSearchSelectOverlay<T>({
  value,
  options,
  getOptionLabel,
  getOptionKey,
  onSelect,
  placeholder = "Выберите",
  searchPlaceholder = "Поиск",
  renderOption,
  filterOptions: filterOptionsProp,
  disabled = false,
  emptyMessage = "Нет вариантов",
  noResultsMessage = "Ничего не найдено",
  className,
  triggerClassName,
  ariaLabel,
  renderTriggerContent,
}: MobileSearchSelectOverlayProps<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const filterOptions = useMemo(
    () =>
      filterOptionsProp ??
      ((opts: T[], q: string) => defaultFilter(opts, q, getOptionLabel)),
    [filterOptionsProp, getOptionLabel]
  );

  const filteredOptions = useMemo(
    () => filterOptions(options, query),
    [options, query, filterOptions]
  );

  const displayLabel = value != null ? getOptionLabel(value) : "";

  const openOverlay = useCallback(() => {
    if (disabled) return;
    setOpen(true);
    setQuery("");
  }, [disabled]);

  useEffect(() => {
    if (open) {
      const t = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(t);
    }
  }, [open]);

  const handleSelect = useCallback(
    (option: T) => {
      onSelect(option);
      setOpen(false);
    },
    [onSelect]
  );

  const handleClose = useCallback(() => {
    setOpen(false);
  }, []);

  /** Стиль триггера в пустом состоянии — как у поля поиска с вкладки «Активы». */
  const [triggerFocused, setTriggerFocused] = useState(false);
  const triggerEmptyStyle = getMobileSearchFieldStyle(triggerFocused, false);

  const trigger = (
    <button
      type="button"
      disabled={disabled}
      onClick={openOverlay}
      onFocus={() => setTriggerFocused(true)}
      onBlur={() => setTriggerFocused(false)}
      aria-label={ariaLabel ?? placeholder}
      aria-haspopup="dialog"
      aria-expanded={open}
      className={cn(
        "w-full min-h-10 h-auto py-2 flex items-center gap-2 rounded-[9px] text-left text-base font-normal transition-all duration-200",
        "focus:outline-none focus:ring-0",
        disabled && "opacity-50 pointer-events-none",
        triggerClassName
      )}
      style={{
        ...(value == null ? triggerEmptyStyle : { backgroundColor: ACCENT_FILL_LIGHT, boxShadow: "none" }),
        color: displayLabel ? ACTIVE_TEXT_DARK : PLACEHOLDER_COLOR_DARK,
        paddingLeft: 12,
        paddingRight: 12,
      }}
    >
      {value == null ? (
        <>
          <Search
            className="size-4 shrink-0"
            style={{ color: triggerFocused ? ACCENT : PLACEHOLDER_COLOR_DARK }}
            aria-hidden
          />
          <span className={cn("truncate flex-1 font-normal")}>
            {placeholder}
          </span>
        </>
      ) : renderTriggerContent ? (
        <span className="flex items-center gap-2 min-w-0 flex-1 break-words">
          {renderTriggerContent(value)}
        </span>
      ) : (
        <span className="flex-1 font-normal break-words">{displayLabel}</span>
      )}
      {value != null && (
        <Pencil className="size-4 shrink-0 opacity-70" aria-hidden />
      )}
    </button>
  );

  const [headerVisible, setHeaderVisible] = useState(false);
  useEffect(() => {
    if (!open) {
      setHeaderVisible(false);
      return;
    }
    const t = requestAnimationFrame(() => setHeaderVisible(true));
    return () => cancelAnimationFrame(t);
  }, [open]);

  const overlay = open &&
    typeof document !== "undefined" &&
    createPortal(
      <div
        className="fixed inset-0 flex flex-col z-[110]"
        style={{
          backgroundColor: "#000",
          paddingTop: "env(safe-area-inset-top, 0px)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
        aria-modal
        aria-label={searchPlaceholder}
        role="dialog"
      >
        <header
          className="shrink-0 flex items-center gap-2 px-3 py-2 transition-[transform,opacity] duration-300 ease-out"
          style={{
            transform: headerVisible ? "translateY(0)" : "translateY(80px)",
            opacity: headerVisible ? 1 : 0.6,
          }}
        >
          <div className="flex-1 min-w-0">
            <MobileSearchField
              ref={inputRef}
              value={query}
              onChange={setQuery}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              noTapScale
              className="w-full"
            />
          </div>
          <IconButton
            type="button"
            aria-label="Закрыть"
            onClick={handleClose}
            appearance="default"
          >
            <X className="size-5" strokeWidth={1.5} />
          </IconButton>
        </header>

        <div
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-2"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {filteredOptions.length === 0 ? (
            <p
              className="text-sm py-4 text-center"
              style={{ color: PLACEHOLDER_COLOR_DARK }}
            >
              {options.length === 0 ? emptyMessage : noResultsMessage}
            </p>
          ) : (
            <ul className="space-y-0" role="listbox">
              {filteredOptions.map((option) => {
                const key =
                  getOptionKey != null
                    ? getOptionKey(option)
                    : (getOptionLabel(option) as string | number);
                const label = getOptionLabel(option);
                const isSelected =
                  value != null &&
                  (getOptionKey != null
                    ? getOptionKey(value) === key
                    : getOptionLabel(value) === label);
                return (
                  <li key={String(key)} role="option" aria-selected={isSelected} className="mb-2 last:mb-0">
                    <button
                      type="button"
                      className={cn(
                        "w-full text-left transition-colors active:opacity-90 rounded-lg overflow-hidden",
                        renderOption
                          ? "p-0 min-h-0 flex flex-col items-stretch"
                          : "py-3 px-3 min-h-[48px] flex items-center gap-3"
                      )}
                      style={renderOption ? undefined : { color: ACTIVE_TEXT_DARK }}
                      onClick={() => handleSelect(option)}
                    >
                      {renderOption ? renderOption(option) : label}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>,
      document.body
    );

  return (
    <div className={cn("min-w-0", className)}>
      {trigger}
      {overlay}
    </div>
  );
}
