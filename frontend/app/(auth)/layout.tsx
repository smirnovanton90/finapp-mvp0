"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ThemeToggleFab } from "@/components/theme-toggle-fab";
import { useTheme } from "@/components/theme-provider";
import { AUTH_BG_GRADIENT, AUTH_BG_GRADIENT_LIGHT } from "@/lib/gradients";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { theme } = useTheme();
  const isDark = theme === "dark";

  useEffect(() => {
    if (status !== "loading" && session) {
      router.replace("/dashboard");
    }
  }, [session, status, router]);

  if (status === "loading") {
    return (
      <div className="relative min-h-screen overflow-hidden flex items-center justify-center">
        {/* Dark gradient */}
        <div
          className="pointer-events-none absolute inset-0 transition-opacity duration-700 ease-in-out"
          style={{
            background: AUTH_BG_GRADIENT,
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

  if (session) {
    return null;
  }

  return (
    <>
      {children}
      <ThemeToggleFab />
    </>
  );
}  
