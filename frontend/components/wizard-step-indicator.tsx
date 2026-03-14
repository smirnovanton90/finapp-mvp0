"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { ACTIVE_TEXT_DARK } from "@/lib/colors";

/** Индикатор текущего этапа визарда: активный шаг — pill (таблетка), остальные — кружки. */
export function WizardStepIndicator({
  totalSteps,
  currentStep,
  className,
  "aria-label": ariaLabel,
}: {
  totalSteps: number;
  currentStep: number; // 1-based
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <div
      className={cn("flex items-center justify-center gap-1.5", className)}
      role="progressbar"
      aria-valuenow={currentStep}
      aria-valuemin={1}
      aria-valuemax={totalSteps}
      aria-label={ariaLabel ?? `Шаг ${currentStep} из ${totalSteps}`}
    >
      {Array.from({ length: totalSteps }, (_, i) => {
        const step = i + 1;
        const isActive = step === currentStep;
        return (
          <div
            key={step}
            className={cn(
              "shrink-0 rounded-full transition-all duration-200",
              isActive
                ? "h-2 w-6 rounded-full"
                : "h-2 w-2"
            )}
            style={{
              backgroundColor: isActive
                ? ACTIVE_TEXT_DARK
                : "rgba(255, 255, 255, 0.25)",
            }}
            aria-hidden
          />
        );
      })}
    </div>
  );
}
