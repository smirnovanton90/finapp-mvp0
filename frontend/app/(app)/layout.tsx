"use client";

import { Sidebar } from "@/components/ui/sidebar";
import { useSidebar } from "@/components/ui/sidebar-context";
import { cn } from "@/lib/utils";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { isCollapsed } = useSidebar();

  useEffect(() => {
    if (status !== "loading" && !session) {
      router.replace("/login");
    }
  }, [session, status, router]);

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
    <div className="min-h-screen bg-[#F7F8FA]">
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
