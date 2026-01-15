"use client";

import { SessionProvider } from "next-auth/react";
import { AccountingStartProvider } from "@/components/accounting-start-context";
import { OnboardingProvider } from "@/components/onboarding-context";
import { SidebarProvider } from "@/components/ui/sidebar-context";
import { ThemeProvider } from "@/components/theme-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider>
        <SidebarProvider>
          <AccountingStartProvider>
            <OnboardingProvider>{children}</OnboardingProvider>
          </AccountingStartProvider>
        </SidebarProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
