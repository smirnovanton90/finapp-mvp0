"use client";

import * as React from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { ACTIVE_TEXT_DARK, BACKGROUND_DT } from "@/lib/colors";

interface CollapsibleFormSectionProps {
  title: string;
  /** Текст справа в заголовке (например, подсказка «По умолчанию используется ...») */
  titleRight?: React.ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onToggle?: () => void;
  children: React.ReactNode;
}

export function CollapsibleFormSection({
  title,
  titleRight,
  defaultOpen,
  open: controlledOpen,
  onToggle,
  children,
}: CollapsibleFormSectionProps) {
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen ?? true);
  const isOpen = controlledOpen ?? internalOpen;
  const toggle = onToggle ?? (() => setInternalOpen((v) => !v));

  return (
    <div className="rounded-[9px] overflow-hidden" style={{ backgroundColor: BACKGROUND_DT }}>
      <div
        className="flex w-full items-center gap-2 py-3 px-3 cursor-pointer transition-colors hover:opacity-90"
        onClick={toggle}
      >
        <IconButton
          aria-label={isOpen ? "Свернуть" : "Развернуть"}
          onClick={(e) => { e.stopPropagation(); toggle(); }}
        >
          {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </IconButton>
        <span className="text-sm font-medium shrink-0" style={{ color: ACTIVE_TEXT_DARK }}>
          {title}
        </span>
        {titleRight != null && (
          <span className="flex-1 min-w-0 text-right text-xs font-normal opacity-80" style={{ color: ACTIVE_TEXT_DARK }}>
            {titleRight}
          </span>
        )}
      </div>
      {isOpen && (
        <div className="px-3 pb-4 grid gap-4">{children}</div>
      )}
    </div>
  );
}
