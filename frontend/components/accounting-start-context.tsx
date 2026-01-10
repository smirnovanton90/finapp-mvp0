"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useSession } from "next-auth/react";

import { fetchUserMe, setAccountingStartDate as setAccountingStartDateApi } from "@/lib/api";

type AccountingStartContextType = {
  accountingStartDate: string | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setAccountingStartDate: (date: string) => Promise<void>;
};

const AccountingStartContext = createContext<AccountingStartContextType | undefined>(
  undefined
);

export function AccountingStartProvider({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const [accountingStartDate, setAccountingStartDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (status !== "authenticated") {
      setAccountingStartDate(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const me = await fetchUserMe();
      setAccountingStartDate(me.accounting_start_date ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load profile.");
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const setDate = useCallback(async (date: string) => {
    setLoading(true);
    setError(null);
    try {
      const me = await setAccountingStartDateApi({ accounting_start_date: date });
      setAccountingStartDate(me.accounting_start_date ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set accounting start date.");
      throw err;
    } finally {
      setLoading(false);
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
