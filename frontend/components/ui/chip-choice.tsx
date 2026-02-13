"use client";

import * as React from "react";
import { FormField } from "@/components/ui/form-field";
import { ACCENT2, ACTIVE_TEXT_DARK } from "@/lib/colors";
import { cn } from "@/lib/utils";

export interface ChipChoiceOption {
  value: string;
  label: string;
}

export interface ChipChoiceProps {
  label?: string;
  options: ChipChoiceOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
}

/** Одиночный выбор в виде чипов (как в поле «Синонимы» у контрагента). */
export function ChipChoice({
  label = "",
  options,
  value,
  onChange,
  className,
  disabled,
}: ChipChoiceProps) {
  const content = (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={cn(
              "inline-flex items-center rounded-md border p-2 text-sm font-normal shrink-0 transition-colors",
              disabled && "opacity-50 cursor-not-allowed"
            )}
            style={{
              borderColor: ACCENT2,
              backgroundColor: selected ? ACCENT2 : "transparent",
              color: ACTIVE_TEXT_DARK,
            }}
            aria-pressed={selected}
            aria-label={opt.label}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );

  if (!label) return content;

  return (
    <FormField label={label}>
      {content}
    </FormField>
  );
}
