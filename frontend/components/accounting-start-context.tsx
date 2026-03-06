"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useSession } from "next-auth/react";

import { fetchUserMe, setAccountingStartDate as setAccountingStartDateApi } from "@/lib/api";

type AccountingStartContextType = {
  accountingStartDate: string | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setAccountingStartDate: (date: string, options?: { skipLoading?: boolean }) => Promise<void>;
  /** Истина, когда импорт завершён и нужно показать модалку подтверждения даты (шаг 4) */
  pendingDateConfirmation: boolean;
  setPendingDateConfirmation: (v: boolean) => void;
  dateSetupComplete: boolean;
  setDateSetupComplete: (v: boolean) => void;
};

const DATE_SETUP_COMPLETE_KEY = "finapp-date-setup-complete";

function getDateSetupCompletePersisted(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  return sessionStorage.getItem(DATE_SETUP_COMPLETE_KEY) === "1";
}

const AccountingStartContext = createContext<AccountingStartContextType | undefined>(
  undefined
);

export function AccountingStartProvider({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const [accountingStartDate, setAccountingStartDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDateConfirmation, setPendingDateConfirmation] = useState(false);
  const [dateSetupComplete, setDateSetupComplete] = useState(getDateSetupCompletePersisted);

  const refresh = useCallback(async () => {
    if (status === "unauthenticated") {
      setAccountingStartDate(null);
      setLoading(false);
      setError(null);
      setDateSetupComplete(false);
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.removeItem(DATE_SETUP_COMPLETE_KEY);
      }
      return;
    }
    if (status !== "authenticated") {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const me = await fetchUserMe();
      const date = me.accounting_start_date ?? null;
      setAccountingStartDate(date);
      if (date) {
        setDateSetupComplete(true);
        if (typeof sessionStorage !== "undefined") {
          sessionStorage.setItem(DATE_SETUP_COMPLETE_KEY, "1");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load profile.");
      // Не сбрасываем accountingStartDate при ошибке — оставляем текущее значение
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (status === "authenticated" && getDateSetupCompletePersisted()) {
      setDateSetupComplete(true);
    }
  }, [status]);

  const setDate = useCallback(async (date: string, options?: { skipLoading?: boolean }) => {
    if (!options?.skipLoading) setLoading(true);
    setError(null);
    try {
      const me = await setAccountingStartDateApi({ accounting_start_date: date });
      setAccountingStartDate(me.accounting_start_date ?? null);
      setDateSetupComplete(true);
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.setItem(DATE_SETUP_COMPLETE_KEY, "1");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set accounting start date.");
      throw err;
    } finally {
      if (!options?.skipLoading) setLoading(false);
    }
  }, []);

  return (
    <AccountingStartContext.Provider
      value={{
        accountingStartDate,
        loading,
        error,
        refresh,
        setAccountingStartDate: setDate,
        pendingDateConfirmation,
        setPendingDateConfirmation,
        dateSetupComplete,
        setDateSetupComplete,
      }}
    >
      {children}
    </AccountingStartContext.Provider>
  );
}

export function useAccountingStart() {
  const context = useContext(AccountingStartContext);
  if (!context) {
    throw new Error("useAccountingStart must be used within AccountingStartProvider");
  }
  return context;
}
