"use client";

import React from "react";
import { ACCENT2, ACCENT_FILL_LIGHT, ACCENT_FILL_MEDIUM, SIDEBAR_TEXT_ACTIVE } from "@/lib/colors";

export interface SegmentedOption {
  value: string;
  label: React.ReactNode;
}

interface SegmentedSelectorProps {
  options: SegmentedOption[];
  value: string | string[] | Set<string>;
  onChange: (value: string | string[] | Set<string>) => void;
  multiple?: boolean;
  className?: string;
}

export function SegmentedSelector({
  options,
  value,
  onChange,
  multiple = false,
  className = "",
}: SegmentedSelectorProps) {
  const isSelected = (optionValue: string): boolean => {
    if (multiple) {
      if (Array.isArray(value)) {
        return value.includes(optionValue);
      }
      if (value instanceof Set) {
        return value.has(optionValue);
      }
      return false;
    }
    return value === optionValue;
  };

  const handleOptionClick = (optionValue: string) => {
    if (multiple) {
      const currentValues = Array.isArray(value)
        ? [...value]
        : value instanceof Set
          ? Array.from(value)
          : [];
      const newValues = currentValues.includes(optionValue)
        ? currentValues.filter((v) => v !== optionValue)
        : [...currentValues, optionValue];
      
      // If value was a Set, return a Set, otherwise return array
      if (value instanceof Set) {
        onChange(new Set(newValues));
      } else {
        onChange(newValues);
      }
    } else {
      onChange(optionValue);
    }
  };

  return (
    <div className={`relative w-full rounded-lg ${className}`}>
      {/* Stroke layer - border color ACCENT_FILL_MEDIUM */}
      <div
        className="absolute inset-0 rounded-lg pointer-events-none z-0"
        style={{
          padding: "1px",
          background: ACCENT_FILL_MEDIUM,
          WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
          WebkitMaskComposite: "xor",
          maskComposite: "exclude",
          opacity: 1,
        }}
      />
      {/* Inner container - h-10 (40px) to match filter fields */}
      <div
        className="relative inline-flex h-10 w-full items-stretch overflow-hidden rounded-lg bg-transparent p-[3px] z-10"
        style={{ ["--segment-hover" as string]: ACCENT_FILL_LIGHT }}
      >
        {options.map((option) => {
          const selected = isSelected(option.value);
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => handleOptionClick(option.value)}
              className={`flex-1 min-w-0 px-3 py-1.5 text-sm font-normal transition-colors whitespace-normal break-words text-center ${
                selected ? "text-white" : "bg-transparent hover:bg-[var(--segment-hover)]"
              }`}
              style={{
                background: selected ? ACCENT_FILL_LIGHT : undefined,
                borderRadius: "7px",
                color: selected ? "white" : SIDEBAR_TEXT_ACTIVE,
                boxShadow: selected
                  ? `inset 0 -26px 41px -28px ${ACCENT2}, inset 0 -2px 0 0 ${ACCENT2}`
                  : undefined,
              } as React.CSSProperties}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
