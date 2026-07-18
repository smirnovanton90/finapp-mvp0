"use client";

import { useState, useEffect } from "react";
import { X, Smartphone } from "lucide-react";
import { ACCENT, MODAL_BG, ACTIVE_TEXT_DARK } from "@/lib/colors";

const STORAGE_KEY = "finapp-pwa-prompt-dismissed";

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [dismissed, setDismissed] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setDismissed(typeof localStorage !== "undefined" && localStorage.getItem(STORAGE_KEY) === "1");
    const standalone =
      typeof window !== "undefined" &&
      (window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as { standalone?: boolean }).standalone === true);
    setIsStandalone(standalone);
    if (standalone) {
      document.documentElement.classList.add("standalone-pwa");
    }
    setIsIOS(
      typeof navigator !== "undefined" &&
        /iPad|iPhone|iPod/.test(navigator.userAgent) &&
        !(window as unknown as { MSStream?: boolean }).MSStream
    );
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
    }
    return () => {
      document.documentElement.classList.remove("standalone-pwa");
    };
  }, []);

  useEffect(() => {
    if (!mounted || isStandalone) return;

    const handler = (e: BeforeInstallPromptEvent) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setDismissed(false);
    };

    window.addEventListener("beforeinstallprompt", handler);
    if (isIOS && !isStandalone) setDismissed(false);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, [mounted, isStandalone, isIOS]);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setDeferredPrompt(null);
    setDismissed(true);
    localStorage.setItem(STORAGE_KEY, "1");
  };

  const handleDismiss = () => {
    setDismissed(true);
    setDeferredPrompt(null);
    localStorage.setItem(STORAGE_KEY, "1");
  };

  if (!mounted || isStandalone || dismissed) return null;
  if (!deferredPrompt && !isIOS) return null;

  return (
    <div
      className="fixed bottom-4 left-4 right-4 z-50 rounded-xl shadow-lg flex items-center gap-3 px-4 py-3 sm:left-auto sm:right-4 sm:max-w-sm"
      style={{
        background: MODAL_BG,
        color: ACTIVE_TEXT_DARK,
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <button
        type="button"
        onClick={handleDismiss}
        className="absolute top-2 right-2 p-1 rounded-full opacity-70 hover:opacity-100"
        aria-label="Закрыть"
      >
        <X className="size-4" />
      </button>
      <div className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "rgba(127, 92, 255, 0.2)" }}>
        <Smartphone className="size-5" style={{ color: ACCENT }} />
      </div>
      <div className="flex-1 min-w-0 pr-6">
        {isIOS && !deferredPrompt ? (
          <p className="text-sm">
            Откройте приложение в отдельном окне: нажмите{" "}
            <span className="font-medium">Поделиться</span> в Safari, затем «На экран „Домой“».
          </p>
        ) : (
          <>
            <p className="text-sm font-medium">Открыть как приложение</p>
            <p className="text-xs opacity-80 mt-0.5">
              Установите FinApp для быстрого доступа без вкладки браузера.
            </p>
          </>
        )}
      </div>
      {deferredPrompt && (
        <button
          type="button"
          onClick={handleInstall}
          className="shrink-0 px-4 py-2 rounded-lg text-sm font-medium text-white"
          style={{ background: ACCENT }}
        >
          Установить
        </button>
      )}
    </div>
  );
}
