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
import { CONTENT_WIDTH_CLASS } from "@/lib/content-width";

const IDLE_TIMEOUT_MS = 10 * 60 * 1000;

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const { isCollapsed, isFilterPanelCollapsed, isDesktop } = useSidebar();
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
    if (status !== "loading" && !session) {
      router.replace("/login");
    }
  }, [session, status, router]);
  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }

    let timeoutId: number | undefined;
    const events = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"];

    const resetTimer = () => {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
      timeoutId = window.setTimeout(() => {
        signOut({ callbackUrl: "/login" });
      }, IDLE_TIMEOUT_MS);
    };

    events.forEach((event) => window.addEventListener(event, resetTimer, { passive: true }));
    resetTimer();

    return () => {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
      events.forEach((event) => window.removeEventListener(event, resetTimer));
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
          !isDesktop && "h-[100dvh] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] flex flex-col"
        )}
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
        <MobileFloatingBar />
        <PwaInstallPrompt />
        <div className={cn("relative z-10 flex", !isDesktop && "min-h-0 flex-1 overflow-hidden")}>
          <Sidebar />
          <div
            className={cn(
              "flex-1 transition-all duration-300 @container",
              !isSpecialPage && "min-h-screen flex items-center",
              !isDesktop && "px-4 pb-6 overflow-y-auto min-h-0",
              !isDesktop && isAssetDetailPage && "pt-4"
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
