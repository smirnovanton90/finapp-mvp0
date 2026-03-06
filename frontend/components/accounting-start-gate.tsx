"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useAccountingStart } from "@/components/accounting-start-context";
import { FirstLoadOnboarding } from "@/components/first-load-onboarding";

const DATE_SETUP_COMPLETE_KEY = "finapp-date-setup-complete";

export function AccountingStartGate({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const { accountingStartDate, loading, pendingDateConfirmation, dateSetupComplete } = useAccountingStart();
  const dateSetupCompletePersisted =
    typeof sessionStorage !== "undefined" && sessionStorage.getItem(DATE_SETUP_COMPLETE_KEY) === "1";

  // Как только в контексте есть дата — сразу помечаем онбординг завершённым в sessionStorage
  useEffect(() => {
    if (accountingStartDate && typeof sessionStorage !== "undefined") {
      sessionStorage.setItem(DATE_SETUP_COMPLETE_KEY, "1");
    }
  }, [accountingStartDate]);

  const hasDateOrCompleted =
    Boolean(accountingStartDate) ||
    dateSetupComplete ||
    dateSetupCompletePersisted;

  const showGate =
    status !== "loading" &&
    !loading &&
    !hasDateOrCompleted &&
    !pendingDateConfirmation;

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
