"use client";

import { SessionProvider } from "next-auth/react";
import { AccountingStartProvider } from "@/components/accounting-start-context";
import { TimezoneProvider } from "@/components/timezone-context";
import { OnboardingProvider } from "@/components/onboarding-context";
import { SidebarProvider } from "@/components/ui/sidebar-context";
import { ThemeProvider } from "@/components/theme-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider refetchOnWindowFocus={false}>
      <ThemeProvider>
        <SidebarProvider>
          <AccountingStartProvider>
            <TimezoneProvider>
              <OnboardingProvider>{children}</OnboardingProvider>
            </TimezoneProvider>
          </AccountingStartProvider>
        </SidebarProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
