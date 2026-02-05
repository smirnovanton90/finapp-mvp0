"use client";

import { Menu, Filter } from "lucide-react";
import { usePathname } from "next/navigation";
import { useSidebar } from "@/components/ui/sidebar-context";
import { IconButton } from "@/components/ui/icon-button";
import { cn } from "@/lib/utils";

const FILTER_PAGES = [
  "/assets",
  "/transactions",
  "/financial-planning",
  "/goals",
  "/categories",
  "/counterparties",
];

export function AppHeader() {
  const pathname = usePathname();
  const { setMobileOpen, setMobileFiltersOpen, isDesktop } = useSidebar();
  const hasFilters = FILTER_PAGES.some((p) => pathname === p || pathname.startsWith(p + "/"));

  if (isDesktop) return null;

  return (
    <header
      className={cn(
        "fixed left-0 right-0 top-0 z-30 flex h-14 items-center gap-3 px-4",
        "bg-sidebar/95 backdrop-blur-sm border-b border-sidebar-border"
      )}
    >
      <IconButton
        onClick={() => setMobileOpen(true)}
        aria-label="Открыть меню"
        appearance="default"
      >
        <Menu className="size-5" strokeWidth={1.5} />
      </IconButton>
      {hasFilters && (
        <IconButton
          onClick={() => setMobileFiltersOpen(true)}
          aria-label="Фильтры"
          appearance="default"
        >
          <Filter className="size-5" strokeWidth={1.5} />
        </IconButton>
      )}
      <span className="text-sm font-medium truncate flex-1">FinApp</span>
    </header>
  );
}
