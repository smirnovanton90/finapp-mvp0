"use client";

import { useRef, useState, type ClipboardEvent, type CSSProperties, type FocusEvent, type KeyboardEvent } from "react";
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
  clampTimeSegment,
  joinTimeInput,
  normalizeTimeInput,
  pastedTimeParts,
  splitTimeInput,
} from "@/lib/format-time";
import { cn } from "@/lib/utils";

type TimeInputProps = {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  className?: string;
};

function TimeInput({ value, onChange, onBlur, disabled, className }: TimeInputProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const hoursRef = useRef<HTMLInputElement>(null);
  const minutesRef = useRef<HTMLInputElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const { hours, minutes } = splitTimeInput(value);
  const hasValue = hours.length > 0 || minutes.length > 0;
  const placeholder = isDark ? PLACEHOLDER_COLOR_DARK : PLACEHOLDER_COLOR_LIGHT;
  const textColor = isDark ? ACTIVE_TEXT_DARK : undefined;

  const backgroundColor = focused || hovered ? ACCENT_FILL_MEDIUM : ACCENT_FILL_LIGHT;
  const borderColor = focused ? ACCENT2 : ACCENT_FILL_MEDIUM;
  const insetBottom = `inset 0 -2px 0 0 ${borderColor}`;
  const boxShadow = focused ? `${insetBottom}, 0 8px 25px -8px ${ACCENT2}` : insetBottom;

  const commit = () => {
    const next = normalizeTimeInput(value);
    if (next !== value) onChange(next);
  };

  const handleShellBlur = (event: FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && shellRef.current?.contains(next)) return;
    setFocused(false);
    commit();
    onBlur?.();
  };

  const focusMinutes = () => {
    requestAnimationFrame(() => minutesRef.current?.focus());
  };

  const applyPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const parts = pastedTimeParts(event.clipboardData.getData("text"));
    if (!parts) return;
    event.preventDefault();
    onChange(joinTimeInput(parts.hours, parts.minutes));
    if (parts.hours.length === 2) focusMinutes();
  };

  const onHoursChange = (raw: string) => {
    const next = clampTimeSegment(raw, 23);
    if (next === null) return;
    onChange(joinTimeInput(next, minutes));
    if (next.length === 2) focusMinutes();
  };

  const onMinutesChange = (raw: string) => {
    const next = clampTimeSegment(raw, 59);
    if (next === null) return;
    onChange(joinTimeInput(hours, next));
  };

  const onHoursKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === ":" || event.key === "ArrowRight") {
      const input = event.currentTarget;
      const atEnd = input.selectionStart === input.value.length && input.selectionEnd === input.value.length;
      if (event.key === ":" || atEnd) {
        event.preventDefault();
        minutesRef.current?.focus();
      }
    }
  };

  const onMinutesKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const atStart = input.selectionStart === 0 && input.selectionEnd === 0;
    if ((event.key === "Backspace" || event.key === "ArrowLeft") && atStart) {
      event.preventDefault();
      hoursRef.current?.focus();
    }
  };

  const segmentClass = "auth-input w-[2ch] min-w-[2ch] shrink-0 bg-transparent border-0 p-0 m-0 text-center text-sm font-normal outline-none focus-visible:outline-none";

  const segmentStyle = (filled: boolean): CSSProperties => ({
    color: filled ? textColor : placeholder,
    ["--auth-placeholder-color" as string]: placeholder,
  });

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
            hoursRef.current?.focus();
          }}
        >
          <input
            ref={hoursRef}
            value={hours}
            disabled={disabled}
            inputMode="numeric"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={2}
            placeholder={hasValue ? "" : "00"}
            aria-label="Часы"
            name="time-hours"
            data-1p-ignore="true"
            data-lpignore="true"
            data-form-type="other"
            className={segmentClass}
            style={segmentStyle(hours.length > 0)}
            onFocus={(event) => {
              setFocused(true);
              event.currentTarget.select();
            }}
            onChange={(event) => onHoursChange(event.target.value)}
            onKeyDown={onHoursKeyDown}
            onPaste={applyPaste}
          />
          <span
            className="select-none px-0 text-sm leading-none"
            style={{ color: hasValue ? textColor : placeholder }}
            aria-hidden
            onMouseDown={(event) => {
              event.preventDefault();
              minutesRef.current?.focus();
            }}
          >
            :
          </span>
          <input
            ref={minutesRef}
            value={minutes}
            disabled={disabled}
            inputMode="numeric"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={2}
            placeholder={hasValue ? "" : "00"}
            aria-label="Минуты"
            name="time-minutes"
            data-1p-ignore="true"
            data-lpignore="true"
            data-form-type="other"
            className={segmentClass}
            style={segmentStyle(minutes.length > 0)}
            onFocus={(event) => {
              setFocused(true);
              event.currentTarget.select();
            }}
            onChange={(event) => onMinutesChange(event.target.value)}
            onKeyDown={onMinutesKeyDown}
            onPaste={applyPaste}
          />
        </div>
      </div>
    </div>
  );
}

export { TimeInput };
