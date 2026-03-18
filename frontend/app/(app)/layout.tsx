"use client";

import { Sidebar } from "@/components/ui/sidebar";
import { useSidebar } from "@/components/ui/sidebar-context";
import { AppHeader } from "@/components/app-header";
import { MobileFiltersDrawer } from "@/components/mobile-filters-drawer";
import { cn } from "@/lib/utils";
import { AccountingStartGate } from "@/components/accounting-start-gate";
import { signOut, useSession } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import { useTheme } from "@/components/theme-provider";
import { APP_BG_GRADIENT, AUTH_BG_GRADIENT_LIGHT } from "@/lib/gradients";
import { PwaInstallPrompt } from "@/components/pwa-install-prompt";
import { MobileFloatingBar } from "@/components/mobile-floating-bar";
import { MobileWizardOpenProvider, useMobileWizardOpen } from "@/components/mobile-wizard-open-context";
import { CONTENT_WIDTH_CLASS } from "@/lib/content-width";

// Таймаут неактивности: только когда вкладка в фокусе (visible).
// При переключении на другое приложение/вкладку таймер не идёт — разлогин не происходит.
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

function AppLayoutInner({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const { isCollapsed, isFilterPanelCollapsed, isDesktop } = useSidebar();
  const mobileWizardOpen = useMobileWizardOpen()?.mobileWizardOpen ?? false;
  const sessionKey = (session?.user as { id?: string })?.id ?? "anon";
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const isTransactionsPage = pathname === "/transactions" || pathname?.startsWith("/transactions/");
  const isAssetsPage = pathname === "/assets" || pathname?.startsWith("/assets/");
  const isAssetDetailPage =
    pathname?.startsWith("/assets/") && (pathname.split("/").filter(Boolean).length === 2);
  const isAssetsPageWithFilters = isAssetsPage && !isAssetDetailPage;
  const isFinancialPlanningPage = pathname === "/financial-planning" || pathname?.startsWith("/financial-planning/");
  const isGoalsPage = pathname === "/goals" || pathname?.startsWith("/goals/");
  const isCategoriesPage = pathname === "/categories" || pathname?.startsWith("/categories/");
  const isCounterpartiesPage = pathname === "/counterparties" || pathname?.startsWith("/counterparties/");
  const isSpecialPage = isTransactionsPage || isAssetsPageWithFilters || isFinancialPlanningPage || isGoalsPage || isCategoriesPage || isCounterpartiesPage;
  const filtersOpen = isSpecialPage && !isFilterPanelCollapsed;
  const showFiltersStrip = isSpecialPage && !isCollapsed;
  const asidePadding = 20;
  const collapsedNavWidth = 100;
  const filterPanelWidth = 400;
  const contentMarginLeftDesktop = isCollapsed
    ? asidePadding + collapsedNavWidth + (isSpecialPage && !isFilterPanelCollapsed ? filterPanelWidth : 0)
    : filtersOpen
      ? asidePadding + 300 + filterPanelWidth
      : showFiltersStrip
        ? asidePadding + 300
        : asidePadding + 300;
  const contentMarginLeft = isDesktop ? contentMarginLeftDesktop : 0;

  useEffect(() => {
    // Редирект только при явном unauthenticated, чтобы не выкидывать при кратковременном refetch сессии.
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  useEffect(() => {
    const err = (session as { error?: string } | null)?.error;
    if (err === "RefreshAccessTokenError") {
      signOut({ callbackUrl: "/login" });
    }
  }, [session]);
  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }

    let timeoutId: number | undefined;
    // Включаем input/change/keyup, чтобы при заполнении полей (ввод, вставка, выбор) таймер сбрасывался.
    const events = [
      "mousemove", "mousedown", "keydown", "keyup",
      "input", "change",
      "scroll", "touchstart",
    ];

    const scheduleSignOut = () => {
      if (timeoutId) window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        signOut({ callbackUrl: "/login" });
      }, IDLE_TIMEOUT_MS);
    };

    const resetTimer = () => {
      if (typeof document === "undefined" || document.visibilityState !== "visible") return;
      scheduleSignOut();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        scheduleSignOut();
      } else {
        if (timeoutId) {
          window.clearTimeout(timeoutId);
          timeoutId = undefined;
        }
      }
    };

    events.forEach((event) => window.addEventListener(event, resetTimer, { passive: true }));
    document.addEventListener("visibilitychange", onVisibilityChange);
    scheduleSignOut();

    return () => {
      if (timeoutId) window.clearTimeout(timeoutId);
      events.forEach((event) => window.removeEventListener(event, resetTimer));
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [status]);

  if (!session && status !== "loading") {
    return null;
  }

  const loadingContent = (
    <div className="relative min-h-screen overflow-hidden flex items-center justify-center">
      <div
        className="pointer-events-none fixed inset-0 z-0 transition-opacity duration-700 ease-in-out"
        style={{
          background: APP_BG_GRADIENT,
          opacity: isDark ? 1 : 0,
        }}
      />
      <div
        className="pointer-events-none fixed inset-0 z-0 transition-opacity duration-700 ease-in-out"
        style={{
          background: AUTH_BG_GRADIENT_LIGHT,
          opacity: isDark ? 0 : 1,
        }}
      />
      <div className="relative z-10 text-muted-foreground">Загрузка…</div>
    </div>
  );

  return (
    <AccountingStartGate>
      {status === "loading" ? (
        loadingContent
      ) : (
      <div
        className={cn(
          "relative min-h-screen overflow-hidden",
          !isDesktop && "h-[100dvh] flex flex-col"
        )}
        style={
          !isDesktop
            ? {
                paddingTop: "env(safe-area-inset-top, 0px)",
                paddingBottom: "env(safe-area-inset-bottom, 0px)",
                paddingLeft: "env(safe-area-inset-left, 0px)",
                paddingRight: "env(safe-area-inset-right, 0px)",
              }
            : undefined
        }
        key={sessionKey}
      >
        {/* Фон: на мобильной — чёрный, на десктопе — градиент */}
        <div
          className="pointer-events-none fixed inset-0 z-0 transition-opacity duration-700 ease-in-out"
          style={{
            background: !isDesktop ? "#000" : APP_BG_GRADIENT,
            opacity: isDark ? 1 : 0,
          }}
        />
        <div
          className="pointer-events-none fixed inset-0 z-0 transition-opacity duration-700 ease-in-out"
          style={{
            background: !isDesktop ? "#000" : AUTH_BG_GRADIENT_LIGHT,
            opacity: isDark ? 0 : 1,
          }}
        />

        <AppHeader />
        <MobileFiltersDrawer />
        {!mobileWizardOpen && <MobileFloatingBar />}
        <PwaInstallPrompt />
        <div className={cn("relative z-10 flex", !isDesktop && "min-h-0 flex-1 overflow-hidden")}>
          <Sidebar />
          <div
            className={cn(
              "flex-1 transition-all duration-300 @container",
              !isSpecialPage && "min-h-screen flex items-center",
              !isDesktop && "px-4 pb-6 overflow-y-auto min-h-0"
            )}
            style={
              !isDesktop
                ? {
                    marginLeft: contentMarginLeft,
                    height: "calc(100dvh - env(safe-area-inset-top) - 72px - env(safe-area-inset-bottom))",
                    WebkitOverflowScrolling: "touch",
                  }
                : { marginLeft: contentMarginLeft }
            }
            {...(!isDesktop && { "data-app-scroll-container": true })}
          >
            {isSpecialPage || isAssetDetailPage ? (
              <div className="w-full min-w-0">
                {children}
              </div>
            ) : (
              <div className="w-full h-full flex items-center">
                <div className={CONTENT_WIDTH_CLASS}>
                  {children}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      )}
    </AccountingStartGate>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <MobileWizardOpenProvider>
      <AppLayoutInner>{children}</AppLayoutInner>
    </MobileWizardOpenProvider>
  );
}
