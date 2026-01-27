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
  options: SegmentedOption[];
  value: string | string[] | Set<string>;
  onChange: (value: string | string[] | Set<string>) => void;
  multiple?: boolean;
  className?: string;
  colorScheme?: SegmentedSelectorColorScheme;
}

export function SegmentedSelector({
  options,
  value,
  onChange,
  multiple = false,
  className = "",
  colorScheme = "purple",
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

  return (
    <div className={`relative w-full ${className}`}>
      {/* Inner container - min-h-10 so it can grow vertically for multi-line labels */}
      <div 
        className="relative inline-flex min-h-10 w-full items-stretch rounded-[9px] bg-transparent p-[3px] z-10"
        style={{
          boxShadow: `0 0 0 1px ${ACCENT_FILL_MEDIUM}`,
        }}
      >
        {options.map((option) => {
          const selected = isSelected(option.value);
          // Use option-specific color scheme if provided, otherwise use default
          const optionColorScheme = option.colorScheme || colorScheme;
          const optionColors = getColors(optionColorScheme);
          
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => handleOptionClick(option.value)}
              className={`flex-1 min-w-0 px-3 py-2 text-sm font-normal transition-colors whitespace-normal break-words text-center leading-tight ${
                selected ? "" : "bg-transparent hover:bg-[var(--segment-hover)]"
              }`}
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
        })}
      </div>
    </div>
  );
}
