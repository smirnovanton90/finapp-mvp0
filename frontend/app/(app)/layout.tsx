"use client";

import { Sidebar } from "@/components/ui/sidebar";
import { useSidebar } from "@/components/ui/sidebar-context";
import { cn } from "@/lib/utils";
import { AccountingStartGate } from "@/components/accounting-start-gate";
import { OnboardingWizard } from "@/components/onboarding-wizard";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useTheme } from "@/components/theme-provider";
import { APP_BG_GRADIENT, AUTH_BG_GRADIENT_LIGHT } from "@/lib/gradients";

const IDLE_TIMEOUT_MS = 10 * 60 * 1000;

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { isCollapsed } = useSidebar();
  const sessionKey = (session?.user as { id?: string })?.id ?? "anon";
  const { theme } = useTheme();
  const isDark = theme === "dark";

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

  if (status === "loading") {
    return (
      <div className="relative min-h-screen overflow-hidden flex items-center justify-center">
        {/* Dark gradient */}
        <div
          className="pointer-events-none absolute inset-0 transition-opacity duration-700 ease-in-out"
          style={{
            background: APP_BG_GRADIENT,
            opacity: isDark ? 1 : 0,
          }}
        />
        {/* Light gradient */}
        <div
          className="pointer-events-none absolute inset-0 transition-opacity duration-700 ease-in-out"
          style={{
            background: AUTH_BG_GRADIENT_LIGHT,
            opacity: isDark ? 0 : 1,
          }}
        />
        <div className="relative text-muted-foreground">Загрузка…</div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <AccountingStartGate>
      <OnboardingWizard />
      <div
        className="relative min-h-screen overflow-hidden"
        key={sessionKey}
      >
        {/* Dark gradient */}
        <div
          className="pointer-events-none absolute inset-0 transition-opacity duration-700 ease-in-out"
          style={{
            background: APP_BG_GRADIENT,
            opacity: isDark ? 1 : 0,
          }}
        />
        {/* Light gradient */}
        <div
          className="pointer-events-none absolute inset-0 transition-opacity duration-700 ease-in-out"
          style={{
            background: AUTH_BG_GRADIENT_LIGHT,
            opacity: isDark ? 0 : 1,
          }}
        />

        <div className="relative flex">
          <Sidebar />
          <div
            className={cn(
              "flex-1 transition-all duration-300",
              isCollapsed ? "ml-16" : "ml-72"
            )}
          >
            {children}
          </div>
        </div>
      </div>
    </AccountingStartGate>
  );
}
