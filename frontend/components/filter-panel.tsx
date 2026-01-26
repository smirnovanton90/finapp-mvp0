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
} from "@/lib/colors";

export interface FilterPanelAction {
  icon: ReactNode;
  label?: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "default" | "glass";
}

interface FilterPanelProps {
  children: ReactNode;
  onAddClick?: () => void;
  addButtonLabel?: string;
  addButton?: ReactNode; // Custom add button (e.g., wrapped in Dialog)
  additionalActions?: FilterPanelAction[];
}

export function FilterPanel({ children, onAddClick, addButtonLabel = "Добавить", addButton, additionalActions = [] }: FilterPanelProps) {
  const { isFilterPanelCollapsed, toggleFilterPanel } = useSidebar();

  return (
    <aside
      className={`shrink-0 transition-[width] duration-300 ${
        isFilterPanelCollapsed ? "w-[100px]" : "w-[370px]"
      }`}
    >
      <div
        className={cn(
          "sticky top-0 h-screen p-[12px]",
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
                {addButton ? (
                  <div className="mx-[10px]">{addButton}</div>
                ) : onAddClick ? (
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
                ) : null}
                {additionalActions.map((action, index) => (
                  <Button
                    key={index}
                    type="button"
                    variant={action.variant || "glass"}
                    className="mx-[10px] h-10 w-[calc(100%-20px)] rounded-[9px] border-0 flex items-center justify-center relative z-10"
                    style={
                      action.variant === "default"
                        ? { backgroundColor: ACCENT }
                        : {
                            "--glass-bg": "rgba(108, 93, 215, 0.22)",
                            "--glass-bg-hover": "rgba(108, 93, 215, 0.4)",
                          }
                    }
                    onClick={action.onClick}
                    disabled={action.disabled}
                  >
                    <span className="h-5 w-5 flex items-center justify-center" style={{ color: "white", opacity: 0.85 }}>
                      {action.icon}
                    </span>
                  </Button>
                ))}
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
            <div className="mt-[10px] flex flex-1 flex-col gap-4 pb-[10px] px-[12px] overflow-y-auto overflow-x-hidden">
              <div className="space-y-[10px]">
                {/* Add button */}
                {addButton ? (
                  addButton
                ) : onAddClick ? (
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
                ) : null}
                {/* Additional action buttons */}
                {additionalActions.map((action, index) => (
                  <Button
                    key={index}
                    type="button"
                    variant={action.variant || "glass"}
                    className="w-full h-10 text-sm font-normal rounded-[9px] border-0 flex items-center justify-center"
                    style={
                      action.variant === "default"
                        ? { backgroundColor: ACCENT }
                        : {
                            "--glass-bg": "rgba(108, 93, 215, 0.22)",
                            "--glass-bg-hover": "rgba(108, 93, 215, 0.4)",
                          }
                    }
                    onClick={action.onClick}
                    disabled={action.disabled}
                  >
                    <span className="mr-2 h-5 w-5 flex items-center justify-center" style={{ color: "white", opacity: 0.85 }}>
                      {action.icon}
                    </span>
                    {action.label && (
                      <span style={{ color: "white", opacity: 0.85 }}>{action.label}</span>
                    )}
                  </Button>
                ))}
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

