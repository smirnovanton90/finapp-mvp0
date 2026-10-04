"use client";

import { useEffect, useRef, useState, type ClipboardEvent, type CSSProperties, type FocusEvent, type KeyboardEvent } from "react";
import { Calendar } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import {
  ACCENT2,
  ACCENT_FILL_LIGHT,
  ACCENT_FILL_MEDIUM,
  ACTIVE_TEXT_DARK,
  PLACEHOLDER_COLOR_DARK,
  PLACEHOLDER_COLOR_LIGHT,
} from "@/lib/colors";
import {
  clampDateSegment,
  clampYearSegment,
  datePartsToIso,
  normalizeDateInput,
  pastedDateParts,
  splitDateInput,
  type DateParts,
} from "@/lib/format-date-input";
import { cn } from "@/lib/utils";

type DateInputProps = {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  className?: string;
};

function DateInput({ value, onChange, onBlur, disabled, className }: DateInputProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const dayRef = useRef<HTMLInputElement>(null);
  const monthRef = useRef<HTMLInputElement>(null);
  const yearRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLInputElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const focusedRef = useRef(false);
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [draft, setDraft] = useState<DateParts>(() => splitDateInput(value));
  const placeholder = isDark ? PLACEHOLDER_COLOR_DARK : PLACEHOLDER_COLOR_LIGHT;
  const textColor = isDark ? ACTIVE_TEXT_DARK : undefined;
  const hasValue = draft.day.length > 0 || draft.month.length > 0 || draft.year.length > 0;

  useEffect(() => {
    if (focusedRef.current) return;
    setDraft(splitDateInput(value));
  }, [value]);

  const backgroundColor = focused || hovered ? ACCENT_FILL_MEDIUM : ACCENT_FILL_LIGHT;
  const borderColor = focused ? ACCENT2 : ACCENT_FILL_MEDIUM;
  const insetBottom = `inset 0 -2px 0 0 ${borderColor}`;
  const boxShadow = focused ? `${insetBottom}, 0 8px 25px -8px ${ACCENT2}` : insetBottom;

  const publish = (parts: DateParts) => {
    const iso = datePartsToIso(parts);
    if (iso === null || iso === value) return;
    onChange(iso);
  };

  const commit = () => {
    const iso = normalizeDateInput(draft, value);
    if (iso === null) {
      setDraft(splitDateInput(value));
      return;
    }
    setDraft(splitDateInput(iso));
    if (iso !== value) onChange(iso);
  };

  const handleShellBlur = (event: FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && shellRef.current?.contains(next)) return;
    focusedRef.current = false;
    setFocused(false);
    commit();
    onBlur?.();
  };

  const focusMonth = () => {
    requestAnimationFrame(() => monthRef.current?.focus());
  };
  const focusYear = () => {
    requestAnimationFrame(() => yearRef.current?.focus());
  };

  const applyPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const parts = pastedDateParts(event.clipboardData.getData("text"));
    if (!parts) return;
    event.preventDefault();
    setDraft(parts);
    publish(parts);
    if (parts.day.length === 2 && parts.month.length === 2) focusYear();
    else if (parts.day.length === 2) focusMonth();
  };

  const updateDay = (raw: string) => {
    const nextDay = clampDateSegment(raw, 31);
    if (nextDay === null) return;
    const next = { ...draft, day: nextDay };
    setDraft(next);
    publish(next);
    if (nextDay.length === 2) focusMonth();
  };

  const updateMonth = (raw: string) => {
    const nextMonth = clampDateSegment(raw, 12);
    if (nextMonth === null) return;
    const next = { ...draft, month: nextMonth };
    setDraft(next);
    publish(next);
    if (nextMonth.length === 2) focusYear();
  };

  const updateYear = (raw: string) => {
    const next = { ...draft, year: clampYearSegment(raw) };
    setDraft(next);
    publish(next);
  };

  const atEnd = (input: HTMLInputElement) =>
    input.selectionStart === input.value.length && input.selectionEnd === input.value.length;
  const atStart = (input: HTMLInputElement) =>
    input.selectionStart === 0 && input.selectionEnd === 0;

  const onDayKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "." || event.key === "/" || event.key === "ArrowRight") {
      if (event.key !== "ArrowRight" || atEnd(event.currentTarget)) {
        event.preventDefault();
        monthRef.current?.focus();
      }
    }
  };

  const onMonthKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "." || event.key === "/" || event.key === "ArrowRight") {
      if (event.key !== "ArrowRight" || atEnd(event.currentTarget)) {
        event.preventDefault();
        yearRef.current?.focus();
      }
    }
    if ((event.key === "Backspace" || event.key === "ArrowLeft") && atStart(event.currentTarget)) {
      event.preventDefault();
      dayRef.current?.focus();
    }
  };

  const onYearKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if ((event.key === "Backspace" || event.key === "ArrowLeft") && atStart(event.currentTarget)) {
      event.preventDefault();
      monthRef.current?.focus();
    }
  };

  const segmentClass = "auth-input shrink-0 bg-transparent border-0 p-0 m-0 text-center text-sm font-normal outline-none focus-visible:outline-none";
  const segmentStyle = (filled: boolean): CSSProperties => ({
    color: filled ? textColor : placeholder,
    ["--auth-placeholder-color" as string]: placeholder,
  });

  const selectOnFocus = (event: FocusEvent<HTMLInputElement>) => {
    focusedRef.current = true;
    setFocused(true);
    event.currentTarget.select();
  };

  return (
    <div
      ref={shellRef}
      className={cn("relative w-fit", disabled && "opacity-60", className)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onBlur={handleShellBlur}
    >
      <div
        className="relative rounded-lg transition-all duration-200 box-border"
        style={{ backgroundColor, borderRadius: "8px", boxShadow }}
      >
        <div
          className="relative flex h-10 min-h-[40px] items-center gap-0 rounded-lg px-2"
          onMouseDown={(event) => {
            if (event.target !== event.currentTarget) return;
            event.preventDefault();
            dayRef.current?.focus();
          }}
        >
          <input
            ref={dayRef}
            value={draft.day}
            disabled={disabled}
            inputMode="numeric"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={2}
            placeholder={hasValue ? "" : "00"}
            aria-label="День"
            name="date-day"
            data-1p-ignore="true"
            data-lpignore="true"
            data-form-type="other"
            className={cn(segmentClass, "w-[2ch] min-w-[2ch]")}
            style={segmentStyle(draft.day.length > 0)}
            onFocus={selectOnFocus}
            onChange={(event) => updateDay(event.target.value)}
            onKeyDown={onDayKeyDown}
            onPaste={applyPaste}
          />
          <span
            className="select-none px-0 text-sm leading-none"
            style={{ color: hasValue ? textColor : placeholder }}
            aria-hidden
            onMouseDown={(event) => {
              event.preventDefault();
              monthRef.current?.focus();
            }}
          >
            .
          </span>
          <input
            ref={monthRef}
            value={draft.month}
            disabled={disabled}
            inputMode="numeric"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={2}
            placeholder={hasValue ? "" : "00"}
            aria-label="Месяц"
            name="date-month"
            data-1p-ignore="true"
            data-lpignore="true"
            data-form-type="other"
            className={cn(segmentClass, "w-[2ch] min-w-[2ch]")}
            style={segmentStyle(draft.month.length > 0)}
            onFocus={selectOnFocus}
            onChange={(event) => updateMonth(event.target.value)}
            onKeyDown={onMonthKeyDown}
            onPaste={applyPaste}
          />
          <span
            className="select-none px-0 text-sm leading-none"
            style={{ color: hasValue ? textColor : placeholder }}
            aria-hidden
            onMouseDown={(event) => {
              event.preventDefault();
              yearRef.current?.focus();
            }}
          >
            .
          </span>
          <input
            ref={yearRef}
            value={draft.year}
            disabled={disabled}
            inputMode="numeric"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={4}
            placeholder={hasValue ? "" : "0000"}
            aria-label="Год"
            name="date-year"
            data-1p-ignore="true"
            data-lpignore="true"
            data-form-type="other"
            className={cn(segmentClass, "w-[4ch] min-w-[4ch]")}
            style={segmentStyle(draft.year.length > 0)}
            onFocus={selectOnFocus}
            onChange={(event) => updateYear(event.target.value)}
            onKeyDown={onYearKeyDown}
            onPaste={applyPaste}
          />
          <button
            type="button"
            aria-label="Открыть календарь"
            disabled={disabled}
            className="ml-1.5 flex size-5 shrink-0 items-center justify-center"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              const picker = pickerRef.current;
              if (!picker) return;
              try {
                picker.showPicker();
              } catch {
                picker.click();
              }
            }}
          >
            <Calendar className="size-4" style={{ color: placeholder }} />
          </button>
          <input
            ref={pickerRef}
            type="date"
            tabIndex={-1}
            aria-hidden
            value={/^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ""}
            onChange={(event) => {
              const iso = event.target.value;
              setDraft(splitDateInput(iso));
              if (iso !== value) onChange(iso);
            }}
            className="sr-only"
          />
        </div>
      </div>
    </div>
  );
}

export { DateInput };
