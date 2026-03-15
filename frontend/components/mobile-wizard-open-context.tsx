"use client";

import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from "react";

export type ExpandOrigin = { x: number; y: number; width: number; height: number };

type MobileWizardOpenContextType = {
  mobileWizardOpen: boolean;
  setMobileWizardOpen: (open: boolean) => void;
  /** Для мобильной анимации: кнопка "+" расширяется до полного экрана, затем открывается визард. */
  expandOrigin: ExpandOrigin | null;
  setExpandOrigin: (rect: ExpandOrigin | null) => void;
};

const MobileWizardOpenContext = createContext<MobileWizardOpenContextType | undefined>(undefined);

const ACCENT = "#7F5CFF";

export function MobileWizardOpenProvider({ children }: { children: ReactNode }) {
  const [mobileWizardOpen, setMobileWizardOpen] = useState(false);
  const [expandOrigin, setExpandOrigin] = useState<ExpandOrigin | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!expandOrigin || typeof document === "undefined") return;
    const rect = expandOrigin;
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    const w = typeof window !== "undefined" ? window.innerWidth : 400;
    const h = typeof window !== "undefined" ? window.innerHeight : 600;
    const maxDist = Math.max(cx, cy, w - cx, h - cy);
    const finalDiameter = 2 * maxDist;
    const finalScale = finalDiameter / rect.width;

    const el = overlayRef.current;
    if (!el) return;

    el.style.transform = "scale(1)";
    el.style.opacity = "1";

    const start = performance.now();
    const DURATION_MS = 400;

    const tick = (now: number) => {
      const t = Math.min((now - start) / DURATION_MS, 1);
      const eased = 1 - (1 - t) ** 2;
      const scale = 1 + (finalScale - 1) * eased;
      el.style.transform = `scale(${scale})`;
      if (t < 1) {
        requestAnimationFrame(tick);
      } else {
        setMobileWizardOpen(true);
        setExpandOrigin(null);
      }
    };
    requestAnimationFrame(tick);
  }, [expandOrigin]);

  return (
    <MobileWizardOpenContext.Provider value={{ mobileWizardOpen, setMobileWizardOpen, expandOrigin, setExpandOrigin }}>
      {expandOrigin && typeof document !== "undefined" && (
        <div
          role="presentation"
          aria-hidden
          className="fixed inset-0 z-[100] pointer-events-none"
          style={{
            paddingTop: "env(safe-area-inset-top, 0px)",
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
          }}
        >
          <div
            ref={overlayRef}
            className="absolute rounded-full opacity-0 transition-none"
            style={{
              left: expandOrigin.x + expandOrigin.width / 2,
              top: expandOrigin.y + expandOrigin.height / 2,
              width: expandOrigin.width,
              height: expandOrigin.width,
              marginLeft: -expandOrigin.width / 2,
              marginTop: -expandOrigin.height / 2,
              backgroundColor: ACCENT,
            }}
          />
        </div>
      )}
      {children}
    </MobileWizardOpenContext.Provider>
  );
}

export function useMobileWizardOpen() {
  const ctx = useContext(MobileWizardOpenContext);
  return ctx;
}
