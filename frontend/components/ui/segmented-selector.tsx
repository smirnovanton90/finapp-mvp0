"use client";

import React from "react";
import {
  ACCENT2,
  ACCENT_FILL_LIGHT,
  ACCENT_FILL_MEDIUM,
  PLACEHOLDER_COLOR_DARK,
  ACTIVE_TEXT_DARK,
  GREEN,
  GREEN_FILL,
  RED,
  RED_FILL,
  ORANGE,
  ORANGE_FILL,
} from "@/lib/colors";

export interface SegmentedOption {
  value: string;
  label: React.ReactNode;
  colorScheme?: SegmentedSelectorColorScheme; // Individual color scheme for this option
}

export type SegmentedSelectorColorScheme = "purple" | "green" | "red" | "orange";

interface SegmentedSelectorProps {
  /** Flat list of options (single row) */
  options?: SegmentedOption[];
  /** Options grouped by rows; when set, renders each row as a separate line (e.g. two rows of two buttons) */
  optionsByRows?: SegmentedOption[][];
  value: string | string[] | Set<string>;
  onChange: (value: string | string[] | Set<string>) => void;
  multiple?: boolean;
  className?: string;
  colorScheme?: SegmentedSelectorColorScheme;
  /** 'equal' — сегменты делят ширину поровну; 'auto' — ширина по содержимому */
  segmentWidth?: "equal" | "auto";
}

export function SegmentedSelector({
  options,
  optionsByRows,
  value,
  onChange,
  multiple = false,
  className = "",
  colorScheme = "purple",
  segmentWidth = "equal",
}: SegmentedSelectorProps) {
  const useRows = optionsByRows != null && optionsByRows.length > 0;
  const effectiveOptions = useRows ? optionsByRows.flat() : (options ?? []);
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

  // Get colors based on color scheme
  const getColors = (scheme: SegmentedSelectorColorScheme) => {
    switch (scheme) {
      case "green":
        return {
          fill: GREEN_FILL,
          shadow: GREEN,
          hover: GREEN_FILL,
        };
      case "red":
        return {
          fill: RED_FILL,
          shadow: RED,
          hover: RED_FILL,
        };
      case "orange":
        return {
          fill: ORANGE_FILL,
          shadow: ORANGE,
          hover: ORANGE_FILL,
        };
      case "purple":
      default:
        return {
          fill: ACCENT_FILL_LIGHT,
          shadow: ACCENT2,
          hover: ACCENT_FILL_LIGHT,
        };
    }
  };

  const renderOption = (option: SegmentedOption) => {
    const selected = isSelected(option.value);
    const optionColorScheme = option.colorScheme || colorScheme;
    const optionColors = getColors(optionColorScheme);
    const autoWidth = segmentWidth === "auto";
    return (
      <button
        key={option.value}
        type="button"
        aria-pressed={selected}
        onClick={() => handleOptionClick(option.value)}
        className={`px-3 py-2 text-sm font-normal transition-colors text-center leading-tight ${
          autoWidth
            ? "min-w-0 flex-shrink-0 flex-grow-0 whitespace-nowrap"
            : "min-w-0 flex-1 flex-grow whitespace-normal break-words"
        } ${selected ? "" : "bg-transparent hover:bg-[var(--segment-hover)]"}`}
        style={{
          background: selected ? optionColors.fill : undefined,
          borderRadius: "6px",
          color: selected ? ACTIVE_TEXT_DARK : PLACEHOLDER_COLOR_DARK,
          boxShadow: selected
            ? `inset 0 -26px 41px -28px ${optionColors.shadow}, inset 0 -2px 0 0 ${optionColors.shadow}`
            : undefined,
          "--segment-hover": optionColors.hover,
        } as React.CSSProperties}
      >
        {option.label}
      </button>
    );
  };

  return (
    <div className={className?.includes("w-") ? `relative ${className}` : `relative w-full ${className}`.trim()}>
      <div
        className={`relative w-full rounded-[9px] bg-transparent p-[3px] z-10 ${
          useRows ? "flex flex-col gap-[3px]" : "flex min-h-10 items-stretch"
        }`}
        style={{
          boxShadow: `0 0 0 1px ${ACCENT_FILL_MEDIUM}`,
        }}
      >
        {useRows ? (
          optionsByRows!.map((row, rowIndex) => (
            <div
              key={rowIndex}
              className="flex min-h-10 w-full items-stretch gap-[3px]"
            >
              {row.map((option) => renderOption(option))}
            </div>
          ))
        ) : (
          effectiveOptions.map((option) => renderOption(option))
        )}
      </div>
    </div>
  );
}
