"use client";

import React, { useRef, useCallback } from "react";
import { ArrowLeftRight, GraduationCap, Coins, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";
import { ACTIVE_TEXT_DARK } from "@/lib/colors";

/** Высота плавающего бара (pt-3 + h-12 контент) без safe-area — панель ставится вплотную над баром. */
const BAR_HEIGHT_PX = 60;
const SHEET_MAX_HEIGHT_PX = 280;
const SWIPE_CLOSE_THRESHOLD_PX = 50;

interface MobileAddTransactionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSimpleTransaction: () => void;
  onLoanRepayment: () => void;
  onDebt: () => void;
  onReceipt: () => void;
  receiptRecognizing: boolean;
}

export function MobileAddTransactionSheet({
  open,
  onOpenChange,
  onSimpleTransaction,
  onLoanRepayment,
  onDebt,
  onReceipt,
  receiptRecognizing,
}: MobileAddTransactionSheetProps) {
  const touchStartY = useRef<number>(0);
  const dragOffset = useRef<number>(0);
  const sheetRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!open) return;
      touchStartY.current = e.touches[0].clientY;
      dragOffset.current = 0;
    },
    [open]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!open) return;
      const currentY = e.touches[0].clientY;
      const delta = currentY - touchStartY.current;
      if (delta > 0) {
        dragOffset.current = delta;
        const el = sheetRef.current;
        if (el) el.style.transform = `translateY(${delta}px)`;
      }
    },
    [open]
  );

  const handleTouchEnd = useCallback(() => {
    if (!open) return;
    const el = sheetRef.current;
    if (el) el.style.transform = "";
    if (dragOffset.current >= SWIPE_CLOSE_THRESHOLD_PX) {
      onOpenChange(false);
    }
    dragOffset.current = 0;
  }, [open, onOpenChange]);

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-30 bg-black/40 transition-opacity duration-300",
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        aria-hidden
        onClick={() => onOpenChange(false)}
      />
      <div
        className="fixed left-0 right-0 z-40 flex flex-col pointer-events-none"
        style={{
          bottom: `calc(${BAR_HEIGHT_PX}px + env(safe-area-inset-bottom))`,
        }}
        aria-modal
        aria-label="Добавить транзакцию"
      >
        <div
          ref={sheetRef}
          className={cn(
            "overflow-hidden transition-[max-height] duration-300 ease-out pointer-events-auto",
            "bg-sidebar/95 backdrop-blur-sm",
            "rounded-t-xl"
          )}
          style={{ maxHeight: open ? SHEET_MAX_HEIGHT_PX : 0 }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="flex justify-center pt-2 pb-1">
            <div
              className="h-1 w-10 rounded-full bg-sidebar-border shrink-0 touch-none"
              aria-hidden
            />
          </div>
          <div className="flex flex-col px-4 pb-4 pt-0">
            <button
              type="button"
              className="flex items-center gap-3 w-full py-3 text-left text-sm hover:bg-sidebar-accent/30 active:bg-sidebar-accent/40 transition-colors rounded-lg px-3 -mx-1"
              onClick={onSimpleTransaction}
            >
              <ArrowLeftRight className="h-5 w-5 shrink-0" style={{ color: ACTIVE_TEXT_DARK }} />
              <span>Простая транзакция</span>
            </button>
            <button
              type="button"
              className="flex items-center gap-3 w-full py-3 text-left text-sm hover:bg-sidebar-accent/30 active:bg-sidebar-accent/40 transition-colors rounded-lg px-3 -mx-1"
              onClick={onLoanRepayment}
            >
              <GraduationCap className="h-5 w-5 shrink-0" style={{ color: ACTIVE_TEXT_DARK }} />
              <span>Погашение кредита</span>
            </button>
            <button
              type="button"
              className="flex items-center gap-3 w-full py-3 text-left text-sm hover:bg-sidebar-accent/30 active:bg-sidebar-accent/40 transition-colors rounded-lg px-3 -mx-1"
              onClick={onDebt}
            >
              <Coins className="h-5 w-5 shrink-0" style={{ color: ACTIVE_TEXT_DARK }} />
              <span>Долг</span>
            </button>
            <button
              type="button"
              className="flex items-center gap-3 w-full py-3 text-left text-sm hover:bg-sidebar-accent/30 active:bg-sidebar-accent/40 transition-colors rounded-lg px-3 -mx-1 disabled:opacity-50"
              disabled={receiptRecognizing}
              onClick={onReceipt}
            >
              <Receipt className="h-5 w-5 shrink-0" style={{ color: ACTIVE_TEXT_DARK }} />
              <span>{receiptRecognizing ? "Распознавание…" : "Чек"}</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
