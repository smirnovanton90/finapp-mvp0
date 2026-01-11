"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useSession } from "next-auth/react";

import {
  fetchOnboardingStatus,
  updateOnboardingStatus,
  OnboardingDeviceType,
  OnboardingStatus,
} from "@/lib/api";

export type OnboardingStepKey =
  | "intro"
  | "assets"
  | "categories"
  | "counterparties"
  | "transactions"
  | "limits"
  | "planning"
  | "reports";

export type OnboardingStep = {
  key: OnboardingStepKey;
  route: string;
};

export const ONBOARDING_STEPS: OnboardingStep[] = [
  { key: "intro", route: "/dashboard" },
  { key: "assets", route: "/assets" },
  { key: "categories", route: "/categories" },
  { key: "counterparties", route: "/counterparties" },
  { key: "transactions", route: "/transactions" },
  { key: "limits", route: "/limits" },
  { key: "planning", route: "/financial-planning" },
  { key: "reports", route: "/reports" },
];

type OnboardingContextType = {
  status: OnboardingStatus | null;
  loading: boolean;
  error: string | null;
  deviceType: OnboardingDeviceType;
  stepIndex: number;
  activeStep: OnboardingStep | null;
  isWizardOpen: boolean;
  refresh: () => Promise<void>;
  startOnboarding: () => Promise<void>;
  postponeOnboarding: () => Promise<void>;
  skipOnboarding: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
  nextStep: () => void;
  prevStep: () => void;
};

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const { status: sessionStatus } = useSession();
  const deviceType: OnboardingDeviceType = "WEB";

  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);

  const refresh = useCallback(async () => {
    if (sessionStatus !== "authenticated") {
      setStatus(null);
      setLoading(false);
      setError(null);
      setStepIndex(0);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const state = await fetchOnboardingStatus(deviceType);
      setStatus(state.status);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load onboarding.");
    } finally {
      setLoading(false);
    }
  }, [deviceType, sessionStatus]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (status !== "IN_PROGRESS") {
      setStepIndex(0);
    }
  }, [status]);

  const persistStatus = useCallback(
    async (nextStatus: OnboardingStatus) => {
      setStatus(nextStatus);
      if (sessionStatus !== "authenticated") return;
      try {
        await updateOnboardingStatus({ device_type: deviceType, status: nextStatus });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update onboarding.");
      }
    },
    [deviceType, sessionStatus]
  );

  const startOnboarding = useCallback(async () => {
    setStepIndex(0);
    await persistStatus("IN_PROGRESS");
  }, [persistStatus]);

  const postponeOnboarding = useCallback(async () => {
    await persistStatus("POSTPONED");
  }, [persistStatus]);

  const skipOnboarding = useCallback(async () => {
    await persistStatus("SKIPPED");
  }, [persistStatus]);

  const completeOnboarding = useCallback(async () => {
    await persistStatus("COMPLETED");
  }, [persistStatus]);

  const nextStep = useCallback(() => {
    setStepIndex((prev) => Math.min(prev + 1, ONBOARDING_STEPS.length - 1));
  }, []);

  const prevStep = useCallback(() => {
    setStepIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  const activeStep = useMemo(
    () => (status === "IN_PROGRESS" ? ONBOARDING_STEPS[stepIndex] ?? null : null),
    [status, stepIndex]
  );

  const value = useMemo(
    () => ({
      status,
      loading,
      error,
      deviceType,
      stepIndex,
      activeStep,
      isWizardOpen: status === "IN_PROGRESS",
      refresh,
      startOnboarding,
      postponeOnboarding,
      skipOnboarding,
      completeOnboarding,
      nextStep,
      prevStep,
    }),
    [
      activeStep,
      deviceType,
      error,
      loading,
      refresh,
      startOnboarding,
      postponeOnboarding,
      skipOnboarding,
      completeOnboarding,
      nextStep,
      prevStep,
      status,
      stepIndex,
    ]
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error("useOnboarding must be used within OnboardingProvider");
  }
  return context;
}
