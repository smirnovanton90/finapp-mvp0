"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useIsDesktop } from "@/hooks/use-media-query";
import { SIDEBAR_FILTERS_SLOT_ID, MOBILE_FILTERS_SLOT_ID } from "@/lib/sidebar-filters-slot";

type SidebarContextType = {
  isCollapsed: boolean;
  toggleSidebar: () => void;
  isFilterPanelCollapsed: boolean;
  toggleFilterPanel: () => void;
  isDesktop: boolean;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
  mobileFiltersOpen: boolean;
  setMobileFiltersOpen: (open: boolean) => void;
  /** DOM id for filters portal: sidebar slot on desktop, mobile drawer slot on mobile. */
  filtersSlotId: string;
};

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const isDesktop = useIsDesktop();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isFilterPanelCollapsed, setIsFilterPanelCollapsed] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // Загружаем состояние из localStorage при монтировании (только на десктопе)
  useEffect(() => {
    const saved = localStorage.getItem("sidebar-collapsed");
    if (saved !== null) {
      setIsCollapsed(saved === "true");
    }
    const savedFilterPanel = localStorage.getItem("filter-panel-collapsed");
    if (savedFilterPanel !== null) {
      setIsFilterPanelCollapsed(savedFilterPanel === "true");
    }
  }, []);

  // Сохраняем состояние в localStorage при изменении (десктоп)
  useEffect(() => {
    localStorage.setItem("sidebar-collapsed", String(isCollapsed));
  }, [isCollapsed]);

  useEffect(() => {
    localStorage.setItem("filter-panel-collapsed", String(isFilterPanelCollapsed));
  }, [isFilterPanelCollapsed]);

  // На мобильном при переходе на десктоп закрываем drawer
  useEffect(() => {
    if (isDesktop) {
      setMobileOpen(false);
      setMobileFiltersOpen(false);
    }
  }, [isDesktop]);

  const toggleSidebar = () => {
    setIsCollapsed((prev) => !prev);
  };

  const toggleFilterPanel = () => {
    setIsFilterPanelCollapsed((prev) => !prev);
  };

  const filtersSlotId = isDesktop ? SIDEBAR_FILTERS_SLOT_ID : MOBILE_FILTERS_SLOT_ID;

  return (
    <SidebarContext.Provider
      value={{
        isCollapsed,
        toggleSidebar,
        isFilterPanelCollapsed,
        toggleFilterPanel,
        isDesktop,
        mobileOpen,
        setMobileOpen,
        mobileFiltersOpen,
        setMobileFiltersOpen,
        filtersSlotId,
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (context === undefined) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
}

