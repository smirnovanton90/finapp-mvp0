"use client";

import { SessionProvider } from "next-auth/react";
import { AccountingStartProvider } from "@/components/accounting-start-context";
import { OnboardingProvider } from "@/components/onboarding-context";
import { SidebarProvider } from "@/components/ui/sidebar-context";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <SidebarProvider>
        <AccountingStartProvider>
          <OnboardingProvider>{children}</OnboardingProvider>
        </AccountingStartProvider>
      </SidebarProvider>
    </SessionProvider>
  );
}
