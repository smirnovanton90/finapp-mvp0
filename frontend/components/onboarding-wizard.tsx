"use client";

import { useEffect, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";

import { useAccountingStart } from "@/components/accounting-start-context";
import {
  ONBOARDING_STEPS,
  OnboardingStepKey,
  useOnboarding,
} from "@/components/onboarding-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type StepCopy = {
  title: string;
  body: string[];
};

const STEP_COPY: Record<OnboardingStepKey, StepCopy> = {
  intro: {
    title: "Добро пожаловать в FinApp",
    body: [
      "Все финансы в одном месте: активы, обязательства, доходы и расходы.",
      "Лимиты и планирование помогают тратить осознанно.",
      "Отчеты показывают реальную картину и динамику капитала.",
    ],
  },
  assets: {
    title: "Активы и обязательства",
    body: [
      "Создайте базовый актив и посмотрите на список типов.",
      "Переключайтесь между активами и обязательствами, чтобы увидеть разные варианты.",
    ],
  },
  categories: {
    title: "Категории",
    body: [
      "Дерево категорий можно кастомизировать под себя.",
      "Добавьте свою категорию и настройте иконку.",
    ],
  },
  counterparties: {
    title: "Контрагенты",
    body: [
      "Создайте контрагента для удобного учета расходов и доходов.",
    ],
  },
  transactions: {
    title: "Транзакции и импорт",
    body: [
      "Создавайте операции вручную или импортируйте выписки.",
      "Для MOEX-активов используются поля в лотах.",
    ],
  },
  limits: {
    title: "Лимиты",
    body: [
      "Установите лимиты по категориям и следите за расходами.",
    ],
  },
  planning: {
    title: "Плановые транзакции",
    body: [
      "Создайте цепочку плановых операций, например зарплату.",
      "Дата старта не может быть раньше сегодняшней.",
    ],
  },
  reports: {
    title: "Отчеты",
    body: [
      "Смотрите динамику активов и расходов по категориям.",
      "Отчеты помогают быстро оценить финансовую картину.",
    ],
  },
};

export function OnboardingWizard() {
  const router = useRouter();
  const pathname = usePathname();
  const { accountingStartDate } = useAccountingStart();
  const {
    status,
    loading,
    error,
    stepIndex,
    activeStep,
    isWizardOpen,
    startOnboarding,
    postponeOnboarding,
    skipOnboarding,
    completeOnboarding,
    nextStep,
    prevStep,
  } = useOnboarding();

  const shouldShowInvite = useMemo(
    () => Boolean(accountingStartDate) && status === "PENDING" && !loading,
    [accountingStartDate, status, loading]
  );

  useEffect(() => {
    if (!isWizardOpen || !activeStep) return;
    if (pathname !== activeStep.route) {
      router.push(activeStep.route);
    }
  }, [activeStep, isWizardOpen, pathname, router]);

  if (!isWizardOpen && !shouldShowInvite) {
    return null;
  }

  const totalSteps = ONBOARDING_STEPS.length;
  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex === totalSteps - 1;
  const stepKey = activeStep?.key ?? "intro";
  const copy = STEP_COPY[stepKey];

  return (
    <>
      <Dialog open={shouldShowInvite} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Познакомиться с приложением?</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 text-sm text-muted-foreground">
            <p>
              Мы подготовили короткий визард, чтобы показать ключевые возможности и
              помочь начать работу.
            </p>
            {error && <div className="text-sm text-red-600">{error}</div>}
            <div className="flex flex-wrap gap-2 justify-end">
              <Button variant="ghost" onClick={postponeOnboarding}>
                Познакомиться позднее
              </Button>
              <Button variant="outline" onClick={skipOnboarding}>
                Не показывать снова
              </Button>
              <Button
                className="bg-violet-600 text-white hover:bg-violet-700"
                onClick={startOnboarding}
              >
                Начать
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {isWizardOpen && (
        <div className="fixed bottom-6 right-6 z-50 w-[320px] sm:w-[360px]">
          <Card className="border border-white/60 bg-white/95 shadow-xl backdrop-blur">
            <div className="grid gap-3 p-4">
              <div className="text-xs text-muted-foreground">
                Шаг {stepIndex + 1} из {totalSteps}
              </div>
              <div className="text-base font-semibold">{copy.title}</div>
              <div className="grid gap-2 text-sm text-muted-foreground">
                {copy.body.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                <Button variant="ghost" onClick={postponeOnboarding}>
                  Позже
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={prevStep} disabled={isFirstStep}>
                    Назад
                  </Button>
                  <Button
                    className="bg-violet-600 text-white hover:bg-violet-700"
                    onClick={() => {
                      if (isLastStep) {
                        completeOnboarding();
                      } else {
                        nextStep();
                      }
                    }}
                  >
                    {isLastStep ? "Завершить" : "Далее"}
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
