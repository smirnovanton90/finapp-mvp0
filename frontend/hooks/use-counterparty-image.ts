"use client";

import React, { useState, useMemo, useCallback, useEffect } from "react";
import type { CounterpartyOut } from "@/lib/api";
import { getCounterpartyImageUrlCandidates } from "@/lib/counterparty-utils";

/**
 * Хук для отображения иконки контрагента с каскадом URL.
 * Дефолтные: только статика. Добавленные пользователем: API → person.png/legal.png → Lucide.
 */
export function useCounterpartyImage(
  counterparty: CounterpartyOut | null,
  apiBase: string
): {
  currentSrc: string | null;
  onError: () => void;
  showFallbackIcon: boolean;
} {
  const candidates = useMemo(
    () =>
      counterparty
        ? getCounterpartyImageUrlCandidates(counterparty, apiBase)
        : [],
    [counterparty, apiBase]
  );
  const [candidateIndex, setCandidateIndex] = useState(0);
  const currentSrc =
    candidateIndex < candidates.length ? candidates[candidateIndex] : null;
  const showFallbackIcon = candidateIndex >= candidates.length;

  const onError = useCallback(() => {
    setCandidateIndex((prev) => Math.min(prev + 1, candidates.length));
  }, [candidates.length]);

  const counterpartyId = counterparty?.id ?? null;
  useEffect(() => {
    setCandidateIndex(0);
  }, [counterpartyId]);

  return {
    currentSrc,
    onError,
    showFallbackIcon,
  };
}
