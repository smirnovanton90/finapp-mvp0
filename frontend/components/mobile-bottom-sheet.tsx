"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ACTIVE_TEXT_DARK } from "@/lib/colors";

const DEFAULT_SWIPE_CLOSE_THRESHOLD_PX = 80;
const DEFAULT_SCROLL_CLOSE_THRESHOLD_VH = 50;
const DEFAULT_CLOSE_DELAY_MS = 320;
const SHEET_PANEL_BG = "#1C1B2E";

export interface MobileBottomSheetProps {
  /** Заголовок в шапке шторки */
  title: string;
  /** Вызывается при закрытии (после анимации или по таймауту) */
  onClose: () => void;
  /** Контент под шапкой */
  children: React.ReactNode;
  /** Порог сдвига вниз за шапку (px) для закрытия. По умолчанию 80 */
  swipeCloseThresholdPx?: number;
  /** Порог скролла вверх (% viewport height) для закрытия. По умолчанию 50 */
  scrollCloseThresholdVh?: number;
  /** Задержка (мс) перед вызовом onClose после начала анимации закрытия. По умолчанию 320 */
  closeDelayMs?: number;
  /** Дополнительный класс для контейнера панели (скруглённый блок) */
  panelClassName?: string;
}

/**
 * Нижняя шторка для мобильной вёрстки.
 * Контент в одной прокручиваемой области; граница панели уезжает вверх вместе с контентом.
 * Закрытие: клик вне шторки, скролл вверх выше порога, потянуть шапку вниз.
 * При закрытии проигрывается анимация сворачивания вниз.
 */
export function MobileBottomSheet({
  title,
  onClose,
  children,
  swipeCloseThresholdPx = DEFAULT_SWIPE_CLOSE_THRESHOLD_PX,
  scrollCloseThresholdVh = DEFAULT_SCROLL_CLOSE_THRESHOLD_VH,
  closeDelayMs = DEFAULT_CLOSE_DELAY_MS,
  panelClassName,
}: MobileBottomSheetProps) {
  const [entered, setEntered] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef(0);
  const dragOffset = useRef(0);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    };
  }, []);

  const requestClose = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
    closeTimeoutRef.current = setTimeout(() => {
      closeTimeoutRef.current = null;
      onClose();
    }, closeDelayMs);
  }, [isClosing, onClose, closeDelayMs]);

  const handleTransitionEnd = useCallback(
    (e: React.TransitionEvent) => {
      if (e.target !== scrollRef.current || e.propertyName !== "transform" || !isClosing) return;
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = null;
      }
      onClose();
    },
    [isClosing, onClose]
  );

  const handleScroll = useCallback(() => {
    if (isClosing) return;
    const el = scrollRef.current;
    if (!el) return;
    const vh = (typeof window !== "undefined" && window.visualViewport?.height) || 100;
    const thresholdPx = (scrollCloseThresholdVh / 100) * vh;
    if (el.scrollTop >= thresholdPx) {
      requestClose();
    }
  }, [isClosing, requestClose, scrollCloseThresholdVh]);

  const handleHeaderTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    dragOffset.current = 0;
  }, []);

  const handleHeaderTouchMove = useCallback((e: React.TouchEvent) => {
    const el = scrollRef.current;
    if (el && el.scrollTop > 0) return;
    const currentY = e.touches[0].clientY;
    const delta = currentY - touchStartY.current;
    if (delta > 0) {
      dragOffset.current = delta;
      const sheet = sheetRef.current;
      if (sheet) sheet.style.transform = `translateY(${delta}px)`;
    }
  }, []);

  const handleHeaderTouchEnd = useCallback(() => {
    const sheet = sheetRef.current;
    if (sheet) sheet.style.transform = "";
    if (dragOffset.current >= swipeCloseThresholdPx) {
      requestClose();
    }
    dragOffset.current = 0;
  }, [requestClose, swipeCloseThresholdPx]);

  const translateClass = isClosing ? "translate-y-full" : entered ? "translate-y-0" : "translate-y-full";

  return (
    <div className="fixed inset-0 z-50 flex flex-col" aria-modal role="dialog">
      <div
        className="absolute inset-0 bg-black/50 transition-opacity duration-300"
        aria-hidden
        onClick={requestClose}
      />
      <div
        ref={scrollRef}
        className={cn(
          "relative z-10 w-full overflow-y-auto overflow-x-hidden overscroll-contain transition-transform duration-300 ease-out",
          translateClass
        )}
        style={{ height: "100dvh", maxHeight: "100dvh" }}
        onScroll={handleScroll}
        onTransitionEnd={handleTransitionEnd}
      >
        <div
          className="flex flex-col min-h-full"
          style={{ minHeight: "100dvh" }}
        >
          <div
            style={{ height: "20dvh", flexShrink: 0 }}
            aria-hidden
            onClick={requestClose}
          />
          <div
            ref={sheetRef}
            className={cn(
              "flex flex-col w-full rounded-t-2xl shadow-[0_-4px_24px_rgba(0,0,0,0.4)] transition-transform duration-300 ease-out",
              panelClassName
            )}
            style={{ minHeight: "80dvh", backgroundColor: SHEET_PANEL_BG }}
          >
            <div
              className="shrink-0 flex items-center justify-between gap-2 px-4 py-3 border-b border-white/10 touch-none cursor-grab active:cursor-grabbing"
              style={{ color: ACTIVE_TEXT_DARK }}
              onTouchStart={handleHeaderTouchStart}
              onTouchMove={handleHeaderTouchMove}
              onTouchEnd={handleHeaderTouchEnd}
            >
              <h2 className="text-lg font-medium truncate flex-1 min-w-0">{title}</h2>
            </div>
            <div className="w-full">
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
