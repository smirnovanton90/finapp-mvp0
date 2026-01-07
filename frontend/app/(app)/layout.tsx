"use client";

import { Sidebar } from "@/components/ui/sidebar";
import { useSidebar } from "@/components/ui/sidebar-context";
import { cn } from "@/lib/utils";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

const IDLE_TIMEOUT_MS = 10 * 60 * 1000;

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { isCollapsed } = useSidebar();
  const sessionKey = (session?.user as { id?: string })?.id ?? "anon";

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
      <div className="min-h-screen bg-[#F7F8FA] flex items-center justify-center">
        <div className="text-muted-foreground">Загрузка…</div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#F7F8FA]" key={sessionKey}>
      <div className="flex">
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
  );
}
