"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

type MobileWizardOpenContextType = {
  mobileWizardOpen: boolean;
  setMobileWizardOpen: (open: boolean) => void;
};

const MobileWizardOpenContext = createContext<MobileWizardOpenContextType | undefined>(undefined);

export function MobileWizardOpenProvider({ children }: { children: ReactNode }) {
  const [mobileWizardOpen, setMobileWizardOpen] = useState(false);
  return (
    <MobileWizardOpenContext.Provider value={{ mobileWizardOpen, setMobileWizardOpen }}>
      {children}
    </MobileWizardOpenContext.Provider>
  );
}

export function useMobileWizardOpen() {
  const ctx = useContext(MobileWizardOpenContext);
  return ctx;
}
