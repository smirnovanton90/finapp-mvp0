"use client";

import * as React from "react";
import { FormField } from "@/components/ui/form-field";
import {
  ACCENT2,
  ACCENT_FILL_LIGHT,
  ACCENT_FILL_MEDIUM,
  ACTIVE_TEXT_DARK,
  PLACEHOLDER_COLOR_DARK,
} from "@/lib/colors";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

export interface ChipsInputProps {
  label?: string;
  /** Подсказка рядом с названием (в одной строке) */
  labelHint?: string;
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  maxItems?: number;
  maxLengthPerItem?: number;
  className?: string;
  disabled?: boolean;
}

export function ChipsInput({
  label = "",
  labelHint,
  value,
  onChange,
  placeholder = "Введите и нажмите Enter",
  maxItems = 50,
  maxLengthPerItem = 300,
  className,
  disabled,
}: ChipsInputProps) {
  const [inputValue, setInputValue] = React.useState("");
  const [isFocused, setIsFocused] = React.useState(false);
  const [isHovered, setIsHovered] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const backgroundColor = isFocused || isHovered ? ACCENT_FILL_MEDIUM : ACCENT_FILL_LIGHT;
  const borderColor = isFocused ? ACCENT2 : ACCENT_FILL_MEDIUM;
  const insetBottom = `inset 0 -2px 0 0 ${borderColor}`;
  const boxShadow = isFocused
    ? `${insetBottom}, 0 8px 25px -8px ${ACCENT2}`
    : insetBottom;

  const addChip = React.useCallback(
    (text: string) => {
      const s = text.trim();
      if (!s || value.length >= maxItems) return;
      if (s.length > maxLengthPerItem) return;
      if (value.includes(s)) return;
      onChange([...value, s]);
      setInputValue("");
    },
    [value, maxItems, maxLengthPerItem, onChange]
  );

  const removeChip = React.useCallback(
    (index: number) => {
      onChange(value.filter((_, i) => i !== index));
    },
    [value, onChange]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addChip(inputValue);
    } else if (e.key === "Backspace" && !inputValue && value.length > 0) {
      removeChip(value.length - 1);
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    if (inputValue.trim()) addChip(inputValue);
  };

  return (
    <FormField label={label} labelHint={labelHint}>
      <div
        className={cn("relative w-full cursor-text", className)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={() => inputRef.current?.focus()}
      >
        <div
          className="relative rounded-lg transition-all duration-200 box-border min-h-10 flex flex-wrap items-center gap-2 px-3 py-2"
          style={{
            backgroundColor,
            borderRadius: "8px",
            boxShadow,
          }}
        >
          {value.map((chip, i) => (
            <span
              key={`${i}-${chip}`}
              className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-sm font-normal shrink-0"
              style={{
                borderColor: ACCENT2,
                backgroundColor: "rgba(85, 68, 209, 0.15)",
                color: ACTIVE_TEXT_DARK,
              }}
            >
              <span className="max-w-[200px] truncate">{chip}</span>
              {!disabled && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeChip(i);
                  }}
                  className="p-0.5 rounded hover:bg-white/10 transition-colors"
                  aria-label="Удалить"
                >
                  <X className="w-3.5 h-3.5" style={{ color: ACTIVE_TEXT_DARK }} />
                </button>
              )}
            </span>
          ))}
          {value.length < maxItems && (
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsFocused(true)}
              onBlur={handleBlur}
              disabled={disabled}
              placeholder={value.length === 0 ? placeholder : ""}
              maxLength={maxLengthPerItem}
              className="auth-input flex-1 min-w-[120px] bg-transparent border-0 p-0 text-sm font-normal focus-visible:ring-0 focus-visible:outline-none focus-visible:border-0"
              style={{
                ["--auth-placeholder-color" as any]: PLACEHOLDER_COLOR_DARK,
                color: inputValue ? ACTIVE_TEXT_DARK : PLACEHOLDER_COLOR_DARK,
              }}
            />
          )}
        </div>
      </div>
    </FormField>
  );
}
