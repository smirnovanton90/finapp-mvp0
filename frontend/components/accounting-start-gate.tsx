"use client";

import { useAccountingStart } from "@/components/accounting-start-context";
import { FirstLoadOnboarding } from "@/components/first-load-onboarding";

export function AccountingStartGate({ children }: { children: React.ReactNode }) {
  const { accountingStartDate, loading } = useAccountingStart();
  const showGate = !loading && !accountingStartDate;

  if (!showGate) {
    return <>{children}</>;
  }

  return (
    <>
      {children}
      <FirstLoadOnboarding />
    </>
  );
}
