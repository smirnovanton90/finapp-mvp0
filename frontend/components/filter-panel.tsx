"use client";

import { type ReactNode } from "react";
import { ACCENT, SIDEBAR_TEXT_ACTIVE } from "@/lib/colors";

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
