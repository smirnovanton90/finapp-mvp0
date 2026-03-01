"use client";

import * as React from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { ACTIVE_TEXT_DARK, BACKGROUND_DT } from "@/lib/colors";

interface CollapsibleFormSectionProps {
  title: string;
  /** Цвет заголовка (если задан, titleRight того же цвета и размера, что и заголовок) */
  titleColor?: string;
  /** Контент по центру заголовка (например, «Валюта» и чип кода валюты) */
  titleCenter?: React.ReactNode;
  /** Текст справа в заголовке (например, подсказка «По умолчанию используется ...») */
  titleRight?: React.ReactNode;
  /** Если true, titleRight не обрезается (для подписи + туггла и т.п.) */
  titleRightNoTruncate?: boolean;
  defaultOpen?: boolean;
  open?: boolean;
  onToggle?: () => void;
  children: React.ReactNode;
}

export function CollapsibleFormSection({
  title,
  titleColor,
  titleCenter,
  titleRight,
  titleRightNoTruncate,
  defaultOpen,
  open: controlledOpen,
  onToggle,
  children,
}: CollapsibleFormSectionProps) {
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen ?? true);
  const isOpen = controlledOpen ?? internalOpen;
  const toggle = onToggle ?? (() => setInternalOpen((v) => !v));
  const headerColor = titleColor ?? ACTIVE_TEXT_DARK;
  const titleRightSameAsTitle = titleColor != null;

  return (
    <div className={isOpen ? "overflow-visible" : "overflow-hidden"}>
      <div
        className={`grid w-full grid-cols-[auto_1fr_auto] items-center gap-2 py-3 px-3 cursor-pointer transition-colors hover:opacity-90 ${isOpen ? "rounded-t-[9px] border-b border-white/10" : "rounded-[9px]"}`}
        style={{ backgroundColor: BACKGROUND_DT }}
        onClick={toggle}
      >
        <div className="flex items-center gap-2 min-w-0">
          <IconButton
            aria-label={isOpen ? "Свернуть" : "Развернуть"}
            onClick={(e) => { e.stopPropagation(); toggle(); }}
          >
            {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </IconButton>
          <span className="text-sm font-medium shrink-0 truncate" style={{ color: headerColor }}>
            {title}
          </span>
        </div>
        {titleCenter != null ? (
          <span className="flex items-center justify-center gap-2 text-xs font-normal min-w-0" style={{ color: ACTIVE_TEXT_DARK }}>
            {titleCenter}
          </span>
        ) : (
          <span />
        )}
        {titleRight != null ? (
          <span
            className={`text-right ${titleRightNoTruncate ? "shrink-0" : "min-w-0 truncate"} ${titleRightSameAsTitle ? "text-sm font-medium" : "text-xs font-normal opacity-80"}`}
            style={{ color: titleRightSameAsTitle && typeof titleRight !== "string" ? ACTIVE_TEXT_DARK : headerColor }}
          >
            {titleRight}
          </span>
        ) : (
          <span />
        )}
      </div>
      {isOpen && (
        <div
          className="px-4 pt-4 pb-4 grid gap-4 rounded-b-[9px] border-2 border-t-0"
          style={{ backgroundColor: BACKGROUND_DT, borderColor: BACKGROUND_DT }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
