"use client";

import { useAccountingStart } from "@/components/accounting-start-context";
import { FirstLoadOnboarding } from "@/components/first-load-onboarding";

const DATE_SETUP_COMPLETE_KEY = "finapp-date-setup-complete";

export function AccountingStartGate({ children }: { children: React.ReactNode }) {
  const { accountingStartDate, loading, pendingDateConfirmation, dateSetupComplete } = useAccountingStart();
  const dateSetupCompletePersisted =
    typeof sessionStorage !== "undefined" && sessionStorage.getItem(DATE_SETUP_COMPLETE_KEY) === "1";
  const showGate =
    !loading &&
    !dateSetupComplete &&
    !dateSetupCompletePersisted &&
    (!accountingStartDate || pendingDateConfirmation);

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
