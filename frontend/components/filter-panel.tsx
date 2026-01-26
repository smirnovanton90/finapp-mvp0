"use client";

import { ReactNode } from "react";
import { ArrowLeft, ArrowRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthInput } from "@/components/ui/auth-input";
import { SegmentedSelector } from "@/components/ui/segmented-selector";
import { useSidebar } from "@/components/ui/sidebar-context";
import { cn } from "@/lib/utils";
import {
  ACCENT,
  SIDEBAR_BG,
  SIDEBAR_TEXT_ACTIVE,
  SIDEBAR_TEXT_INACTIVE,
  PLACEHOLDER_COLOR_DARK,
  ACTIVE_TEXT_DARK,
  GREEN,
  GREEN_FILL,
  RED,
  RED_FILL,
  ACCENT_FILL_MEDIUM,
} from "@/lib/colors";

interface FilterPanelProps {
  children: ReactNode;
  onAddClick?: () => void;
  addButtonLabel?: string;
}

export function FilterPanel({ children, onAddClick, addButtonLabel = "Добавить" }: FilterPanelProps) {
  const { isFilterPanelCollapsed, toggleFilterPanel } = useSidebar();

  return (
    <aside
      className={`shrink-0 transition-[width] duration-300 ${
        isFilterPanelCollapsed ? "w-[100px]" : "w-[370px]"
      }`}
    >
      <div
        className={cn(
          "sticky top-0 h-screen p-[10px]",
          isFilterPanelCollapsed ? "" : ""
        )}
      >
        <div
          className="flex flex-col rounded-[9px] h-full w-full"
          style={{ backgroundColor: SIDEBAR_BG }}
        >
          {/* Collapse button */}
          <div className="relative h-[55px] shrink-0">
            <Button
              variant="glass"
              onClick={toggleFilterPanel}
              className={`absolute top-[10px] h-[35px] w-[35px] rounded-[9px] p-0 ${
                isFilterPanelCollapsed ? "left-1/2 -translate-x-1/2" : "right-[10px]"
              }`}
              style={
                {
                  "--glass-bg": "rgba(108, 93, 215, 0.22)",
                  "--glass-bg-hover": "rgba(108, 93, 215, 0.32)",
                } as React.CSSProperties
              }
              aria-label={isFilterPanelCollapsed ? "Развернуть фильтры" : "Свернуть фильтры"}
            >
              {isFilterPanelCollapsed ? (
                <ArrowRight
                  className="size-[15px]"
                  strokeWidth={1.5}
                  style={{ color: SIDEBAR_TEXT_INACTIVE }}
                />
              ) : (
                <ArrowLeft
                  className="size-[15px]"
                  strokeWidth={1.5}
                  style={{ color: SIDEBAR_TEXT_INACTIVE }}
                />
              )}
            </Button>
          </div>

          {isFilterPanelCollapsed ? (
            /* Collapsed state - action buttons + expand button */
            <div className="mt-[10px] flex flex-1 flex-col gap-[10px] pb-[10px] relative z-10">
              {/* Action buttons */}
              <div className="space-y-[10px] relative z-10">
                {onAddClick && (
                  <Button
                    type="button"
                    className="mx-[10px] h-10 w-[calc(100%-20px)] rounded-[9px] border-0 flex items-center justify-center transition-colors hover:opacity-90 relative z-10"
                    style={{
                      backgroundColor: ACCENT,
                    }}
                    onClick={onAddClick}
                  >
                    <Plus className="h-5 w-5" style={{ color: "white", opacity: 0.85 }} />
                  </Button>
                )}
              </div>

              {/* Expand filter panel button */}
              <Button
                type="button"
                variant="glass"
                className="mx-[10px] flex-1 w-[calc(100%-20px)] rounded-[9px] border-0 flex items-center justify-center mt-auto relative z-10"
                style={
                  {
                    "--glass-bg": "rgba(108, 93, 215, 0.22)",
                    "--glass-bg-hover": "rgba(108, 93, 215, 0.4)",
                  } as React.CSSProperties
                }
                onClick={toggleFilterPanel}
                aria-label="Развернуть фильтры"
              >
                <ArrowRight className="h-6 w-6" style={{ color: "white", opacity: 0.85 }} />
              </Button>
            </div>
          ) : (
            /* Expanded state - full filters */
            <div className="mt-[10px] flex flex-1 flex-col gap-4 pb-[10px] px-[10px] overflow-y-auto">
              <div className="space-y-[10px]">
                {/* Add button */}
                {onAddClick && (
                  <Button
                    className="w-full h-10 rounded-[9px] border-0 flex items-center justify-center transition-colors hover:opacity-90 text-sm font-normal"
                    style={{
                      backgroundColor: ACCENT,
                    }}
                    onClick={onAddClick}
                  >
                    <Plus className="mr-2 h-5 w-5" style={{ color: "white", opacity: 0.85 }} />
                    <span style={{ color: "white", opacity: 0.85 }}>{addButtonLabel}</span>
                  </Button>
                )}
              </div>

              {/* Filter content */}
              {children}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

// Filter section components
interface FilterSectionProps {
  label: string;
  onReset?: () => void;
  showReset?: boolean;
  children: ReactNode;
}

export function FilterSection({ label, onReset, showReset, children }: FilterSectionProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div className="text-sm font-medium" style={{ color: SIDEBAR_TEXT_ACTIVE }}>
          {label}
        </div>
        {showReset && onReset && (
          <button
            type="button"
            className="text-sm font-medium hover:underline disabled:opacity-50"
            style={{ color: ACCENT }}
            onClick={onReset}
          >
            Сбросить
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

// Assets/Liabilities Type Filter with custom colors using SegmentedSelector
interface TypeFilterProps {
  value: Set<string> | string[];
  onChange: (value: Set<string> | string[]) => void;
}

export function TypeFilter({ value, onChange }: TypeFilterProps) {
  const isSelected = (optionValue: string): boolean => {
    if (value instanceof Set) {
      return value.has(optionValue);
    }
    if (Array.isArray(value)) {
      return value.includes(optionValue);
    }
    return false;
  };

  const handleOptionClick = (optionValue: string) => {
    const currentValues = value instanceof Set
      ? Array.from(value)
      : Array.isArray(value)
        ? [...value]
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
  };

  const assetSelected = isSelected("ASSET");
  const liabilitySelected = isSelected("LIABILITY");

  return (
    <div className="relative w-full rounded-lg">
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
        style={{ 
          ["--asset-hover" as string]: GREEN_FILL,
          ["--liability-hover" as string]: RED_FILL,
        }}
      >
        <button
          type="button"
          aria-pressed={assetSelected}
          onClick={() => handleOptionClick("ASSET")}
          className={`flex-1 min-w-0 px-3 py-1.5 text-sm font-normal transition-colors whitespace-normal break-words text-center ${
            assetSelected ? "text-white" : "bg-transparent hover:bg-[var(--asset-hover)]"
          }`}
          style={{
            background: assetSelected ? GREEN_FILL : undefined,
            borderRadius: "7px",
            color: assetSelected ? "white" : SIDEBAR_TEXT_ACTIVE,
            boxShadow: assetSelected
              ? `inset 0 -26px 41px -28px ${GREEN}, inset 0 -2px 0 0 ${GREEN}`
              : undefined,
          } as React.CSSProperties}
        >
          Активы
        </button>
        <button
          type="button"
          aria-pressed={liabilitySelected}
          onClick={() => handleOptionClick("LIABILITY")}
          className={`flex-1 min-w-0 px-3 py-1.5 text-sm font-normal transition-colors whitespace-normal break-words text-center ${
            liabilitySelected ? "text-white" : "bg-transparent hover:bg-[var(--liability-hover)]"
          }`}
          style={{
            background: liabilitySelected ? RED_FILL : undefined,
            borderRadius: "7px",
            color: liabilitySelected ? "white" : SIDEBAR_TEXT_ACTIVE,
            boxShadow: liabilitySelected
              ? `inset 0 -26px 41px -28px ${RED}, inset 0 -2px 0 0 ${RED}`
              : undefined,
          } as React.CSSProperties}
        >
          Обязательства
        </button>
      </div>
    </div>
  );
}
