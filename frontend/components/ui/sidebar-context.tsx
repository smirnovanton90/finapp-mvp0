"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

type SidebarContextType = {
  isCollapsed: boolean;
  toggleSidebar: () => void;
  isFilterPanelCollapsed: boolean;
  toggleFilterPanel: () => void;
};

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isFilterPanelCollapsed, setIsFilterPanelCollapsed] = useState(true);

  // Загружаем состояние из localStorage при монтировании
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

  // Сохраняем состояние в localStorage при изменении
  useEffect(() => {
    localStorage.setItem("sidebar-collapsed", String(isCollapsed));
  }, [isCollapsed]);

  useEffect(() => {
    localStorage.setItem("filter-panel-collapsed", String(isFilterPanelCollapsed));
  }, [isFilterPanelCollapsed]);

  const toggleSidebar = () => {
    setIsCollapsed((prev) => {
      const newValue = !prev;
      // Если сайдбар разворачивается, сворачиваем панель фильтров
      if (!newValue) {
        setIsFilterPanelCollapsed(true);
      }
      return newValue;
    });
  };

  const toggleFilterPanel = () => {
    setIsFilterPanelCollapsed((prev) => {
      const newValue = !prev;
      // Если панель фильтров разворачивается, сворачиваем сайдбар
      if (!newValue) {
        setIsCollapsed(true);
      }
      return newValue;
    });
  };

  return (
    <SidebarContext.Provider value={{ isCollapsed, toggleSidebar, isFilterPanelCollapsed, toggleFilterPanel }}>
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

