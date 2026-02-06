"use client";

import * as React from "react";
import { Download } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  ACTIVE_TEXT_DARK,
  ACCENT,
  ACCENT2,
  BACKGROUND_DT,
  MODAL_BG,
  PLACEHOLDER_COLOR_DARK,
} from "@/lib/colors";
import { cn } from "@/lib/utils";

const STEPS = [
  { key: 1, label: "Выбор файла" },
  { key: 2, label: "Счета" },
  { key: 3, label: "Категории" },
  { key: 4, label: "Контрагенты" },
  { key: 5, label: "Подтверждение" },
] as const;

type ImportStep = (typeof STEPS)[number]["key"];

export type ImportAccountsOperationsModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Вызывается при завершении импорта (кнопка «Завершить импорт») */
  onFinish?: () => void;
};

export function ImportAccountsOperationsModal({
  open,
  onOpenChange,
  onFinish,
}: ImportAccountsOperationsModalProps) {
  const [step, setStep] = React.useState<ImportStep>(1);

  React.useEffect(() => {
    if (open) setStep(1);
  }, [open]);

  const handleNext = () => {
    if (step < 5) {
      setStep((s) => (s + 1) as ImportStep);
    } else {
      onFinish?.();
      onOpenChange(false);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep((s) => (s - 1) as ImportStep);
    }
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  const isLastStep = step === 5;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Импорт счетов и операций"
        className={cn(
          "w-full max-w-[calc(100%-2rem)] h-[920px] max-h-[min(920px,100dvh)] p-0 gap-0 overflow-hidden flex flex-col",
          "border-0 rounded-[9px]"
        )}
        style={{ backgroundColor: MODAL_BG, width: 1000, maxWidth: "min(1000px, calc(100vw - 2rem))" }}
      >
        <div className="flex flex-col w-full h-full min-h-0">
          <DialogHeader className="px-6 pt-6 pb-4 shrink-0">
            <DialogTitle
              className="flex items-center gap-3 text-[32px] font-medium"
              style={{ color: ACTIVE_TEXT_DARK }}
            >
              <Download className="w-8 h-8 shrink-0" />
              Импорт счетов и операций
            </DialogTitle>
          </DialogHeader>

          {/* Степпер — квадраты и линии в одной строке, labels ниже */}
          <div className="shrink-0 px-6 pb-6">
            <div
              className="flex flex-col w-full"
              style={{
                backgroundColor: BACKGROUND_DT,
                borderRadius: 9,
                padding: "48px 24px 24px",
              }}
            >
              {/* Ряд 1: квадраты и линии — линии касаются квадратов, всё по центру */}
              <div className="flex flex-row justify-center items-center w-full gap-0">
                {STEPS.map(({ key, label }, idx) => {
                  const isPassed = step > key;
                  const isCurrent = step === key;
                  const isFilled = isPassed || isCurrent;

                  return (
                    <React.Fragment key={key}>
                      {/* Квадрат 50×50 */}
                      <div
                        className="flex items-center justify-center shrink-0 box-border"
                        style={{
                          width: 50,
                          height: 50,
                          backgroundColor: isFilled ? ACCENT2 : "transparent",
                          border: `2px solid ${ACCENT2}`,
                          borderRadius: 9,
                          boxShadow: isCurrent
                            ? `0px 0px 50px ${ACCENT}`
                            : undefined,
                        }}
                      >
                        <span
                          style={{
                            color: ACTIVE_TEXT_DARK,
                            fontSize: 24,
                            fontWeight: 500,
                            lineHeight: "27px",
                          }}
                        >
                          {key}
                        </span>
                      </div>
                      {/* Линия — 130px, соединяет квадраты */}
                      {idx < STEPS.length - 1 && (
                        <div
                          className="flex items-center shrink-0"
                          style={{ width: 130, height: 50 }}
                        >
                          <div
                            className="w-full"
                            style={{
                              height: 0,
                              borderTop: `2px solid ${ACCENT2}`,
                            }}
                          />
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
              {/* Ряд 2: подписи по центру под квадратами */}
              <div className="flex flex-row justify-center items-start w-full gap-0 mt-6">
                {STEPS.map(({ key, label }, idx) => {
                  const isPassed = step > key;
                  const isCurrent = step === key;
                  const isFilled = isPassed || isCurrent;

                  return (
                    <React.Fragment key={key}>
                      <div
                        className="flex justify-center shrink-0"
                        style={{ width: 50 }}
                      >
                        <span
                          className="text-center whitespace-nowrap"
                          style={{
                            color: isFilled
                              ? ACTIVE_TEXT_DARK
                              : PLACEHOLDER_COLOR_DARK,
                            fontSize: 18,
                            fontWeight: 400,
                            lineHeight: "20px",
                          }}
                        >
                          {label}
                        </span>
                      </div>
                      {idx < STEPS.length - 1 && (
                        <div className="shrink-0" style={{ width: 130 }} />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Блок контента */}
          <div
            className="flex-1 min-h-0 overflow-auto px-6 py-6"
            style={{
              color: ACTIVE_TEXT_DARK,
              fontSize: 18,
              fontWeight: 400,
            }}
          >
            {/* Пустой контент для каждого шага */}
          </div>

          {/* Кнопки */}
          <div className="flex flex-wrap items-center justify-end gap-3 shrink-0 px-6 pb-6 pt-2">
            <Button
              variant="glass"
              className="h-12 rounded-lg border-0 px-6 font-normal"
              style={
                {
                  "--glass-bg": "rgba(108, 93, 215, 0.22)",
                  "--glass-bg-hover": "rgba(108, 93, 215, 0.4)",
                  fontSize: 18,
                  fontWeight: 400,
                } as React.CSSProperties
              }
              onClick={handleCancel}
            >
              Отмена
            </Button>
            {step > 1 && (
              <Button
                variant="glass"
                className="h-12 rounded-lg border-0 px-6 font-normal"
                style={
                  {
                    "--glass-bg": "rgba(108, 93, 215, 0.22)",
                    "--glass-bg-hover": "rgba(108, 93, 215, 0.4)",
                    fontSize: 18,
                    fontWeight: 400,
                  } as React.CSSProperties
                }
                onClick={handleBack}
              >
                Назад
              </Button>
            )}
            <Button
              variant="authPrimary"
              className="h-12 rounded-lg border-0 px-8 font-normal"
              style={
                {
                  "--auth-primary-bg":
                    "linear-gradient(135deg, #483BA6 0%, #6C5DD7 57%, #6C5DD7 79%, #9487F3 100%)",
                  "--auth-primary-bg-hover":
                    "linear-gradient(315deg, #9487F3 0%, #6C5DD7 57%, #6C5DD7 79%, #483BA6 100%)",
                  fontSize: 18,
                  fontWeight: 400,
                } as React.CSSProperties
              }
              onClick={handleNext}
            >
              {isLastStep ? "Завершить импорт" : "Далее"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
