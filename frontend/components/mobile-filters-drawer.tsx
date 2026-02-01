"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar-context";
import { MOBILE_FILTERS_SLOT_ID } from "@/lib/sidebar-filters-slot";
import { IconButton } from "@/components/ui/icon-button";
import { cn } from "@/lib/utils";

export function MobileFiltersDrawer() {
  const { isDesktop, mobileFiltersOpen, setMobileFiltersOpen } = useSidebar();

  useEffect(() => {
    if (mobileFiltersOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileFiltersOpen]);

  if (isDesktop) return null;

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/50 transition-opacity md:hidden",
          mobileFiltersOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        aria-hidden
        onClick={() => setMobileFiltersOpen(false)}
      />
      <aside
        className={cn(
          "fixed top-0 right-0 z-50 h-full w-full max-w-[400px] bg-sidebar shadow-xl",
          "flex flex-col transition-transform duration-300 ease-out md:hidden",
          mobileFiltersOpen ? "translate-x-0" : "translate-x-full"
        )}
        aria-modal
        aria-label="Фильтры"
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-sidebar-border px-4">
          <span className="text-base font-medium">Фильтры</span>
          <IconButton
            onClick={() => setMobileFiltersOpen(false)}
            aria-label="Закрыть фильтры"
            appearance="default"
          >
            <X className="size-5" strokeWidth={1.5} />
          </IconButton>
        </div>
        <div
          id={MOBILE_FILTERS_SLOT_ID}
          className="scrollbar-dropdown flex-1 min-h-0 overflow-y-auto overflow-x-hidden py-4 px-4"
        />
      </aside>
    </>
  );
}
