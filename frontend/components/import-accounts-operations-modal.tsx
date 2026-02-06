"use client";

import * as React from "react";
import { Download, Upload } from "lucide-react";
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
import type { ImportSourceKey } from "@/components/import-history-modal-content";
import {
  parseDzenCSVFile,
  type DzenParsedData,
} from "@/lib/dzen-csv-parser";
import {
  ImportAccountCard,
  getInitialAccountCardState,
  type ImportAccountCardState,
} from "@/components/import-account-card";
import { fetchItems, API_BASE } from "@/lib/api";
import { validateStep2 } from "@/lib/import-step2-validation";

/** Контент шага 1 по источнику импорта */
const STEP1_CONTENT: Record<
  NonNullable<ImportSourceKey>,
  { title: string; description: string; instructionLabel: string }
> = {
  dzen: {
    title: "Дзен-мани",
    description:
      "Импортируйте выписку в формате .csv, которую можно выгрузить из мобильного или WEB-приложения",
    instructionLabel: "Инструкция по выгрузке выписки",
  },
  coinkeeper: {
    title: "CoinKeeper",
    description:
      "Импортируйте выписку в формате .csv, которую можно выгрузить из мобильного или WEB-приложения",
    instructionLabel: "Инструкция по выгрузке выписки",
  },
  own: {
    title: "Своя выписка",
    description:
      "Если Вы ранее вели учет самостоятельно, например, в Excel или Google Sheets, то мы поможем Вам без труда импортировать их в ПРОСТОФИН, воспользовавшись несложной инструкцией",
    instructionLabel: "Инструкция по импорту собственной выписки",
  },
};

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
  /** Выбранный источник импорта (Дзен-мани, CoinKeeper, Своя выписка) */
  importSource?: ImportSourceKey;
  /** Вызывается при завершении импорта (кнопка «Завершить импорт») */
  onFinish?: () => void;
};

export function ImportAccountsOperationsModal({
  open,
  onOpenChange,
  importSource = "dzen",
  onFinish,
}: ImportAccountsOperationsModalProps) {
  const [step, setStep] = React.useState<ImportStep>(1);
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [isDragOver, setIsDragOver] = React.useState(false);
  const [parsedData, setParsedData] = React.useState<DzenParsedData | null>(null);
  const [parseError, setParseError] = React.useState<string | null>(null);
  const [step2Error, setStep2Error] = React.useState<string | null>(null);
  const [isParsing, setIsParsing] = React.useState(false);
  const [accountCardStates, setAccountCardStates] = React.useState<
    Map<string, ImportAccountCardState>
  >(new Map());
  const [items, setItems] = React.useState<Awaited<ReturnType<typeof fetchItems>>>([]);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const acceptedTypes =
    importSource === "own" ? ".csv,.xlsx,.xls" : ".csv";

  const handleFileSelect = (file: File | null) => {
    setSelectedFile(file);
    setParsedData(null);
    setParseError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const step1Content =
    importSource && importSource in STEP1_CONTENT
      ? STEP1_CONTENT[importSource]
      : STEP1_CONTENT.dzen;

  React.useEffect(() => {
    if (open) {
      setStep(1);
      setSelectedFile(null);
      setIsDragOver(false);
      setParsedData(null);
      setParseError(null);
      setStep2Error(null);
      setAccountCardStates(new Map());
    }
  }, [open]);

  React.useEffect(() => {
    if (parsedData?.accounts?.length) {
      const next = new Map<string, ImportAccountCardState>();
      for (const acc of parsedData.accounts) {
        const key = `${acc.name}|${acc.currency}`;
        next.set(key, getInitialAccountCardState(acc));
      }
      setAccountCardStates(next);
    }
  }, [parsedData?.accounts]);

  React.useEffect(() => {
    if (parsedData && step === 2) {
      fetchItems()
        .then(setItems)
        .catch(() => setItems([]));
    }
  }, [parsedData, step]);

  const handleNext = async () => {
    if (step === 1 && importSource === "dzen") {
      setParseError(null);
      if (!selectedFile) {
        setParseError("Выберите файл для импорта.");
        return;
      }
      setIsParsing(true);
      try {
        const data = await parseDzenCSVFile(selectedFile);
        setParsedData(data);
        setStep(2);
      } catch (err) {
        setParseError(
          err instanceof Error ? err.message : "Не удалось обработать файл."
        );
      } finally {
        setIsParsing(false);
      }
      return;
    }

    if (step === 1 && (importSource === "coinkeeper" || importSource === "own")) {
      setParseError(null);
      setParsedData(null);
      setStep(2);
      return;
    }

    if (step === 2 && parsedData) {
      setStep2Error(null);
      const result = validateStep2(
        parsedData.accounts,
        parsedData.transactions,
        accountCardStates
      );
      if (!result.valid) {
        setStep2Error(result.error);
        return;
      }
    }

    if (step < 5) {
      setStep((s) => (s + 1) as ImportStep);
    } else {
      onFinish?.();
      onOpenChange(false);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep2Error(null);
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
            {parseError && (
              <p
                className="text-base shrink-0"
                style={{ color: "#FB4C4F" }}
              >
                {parseError}
              </p>
            )}
            {step === 1 && (
              <div className="flex flex-col gap-6">
                <h3
                  className="text-2xl font-medium"
                  style={{ color: ACTIVE_TEXT_DARK }}
                >
                  {step1Content.title}
                </h3>
                <p style={{ lineHeight: 1.4 }}>
                  {step1Content.description.includes(".csv")
                    ? step1Content.description.split(".csv").map((part, i, arr) =>
                        i < arr.length - 1 ? (
                          <React.Fragment key={i}>
                            {part}
                            <span style={{ color: ACCENT }}>.csv</span>
                          </React.Fragment>
                        ) : (
                          part
                        )
                      )
                    : step1Content.description}
                </p>
                <button
                  type="button"
                  className="text-left font-normal underline hover:no-underline focus:outline-none focus:underline w-fit"
                  style={{ color: ACCENT }}
                  onClick={() => {
                    // Заглушка: инструкции пока не открываются
                  }}
                >
                  {step1Content.instructionLabel}
                </button>
                <div className="flex flex-col gap-2">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => fileInputRef.current?.click()}
                    onKeyDown={(e) =>
                      (e.key === "Enter" || e.key === " ") &&
                      fileInputRef.current?.click()
                    }
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDragOver(true);
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDragOver(false);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDragOver(false);
                      const file = e.dataTransfer.files?.[0];
                      if (file) handleFileSelect(file);
                    }}
                    className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed min-h-[140px] cursor-pointer transition-colors hover:opacity-90"
                    style={{
                      borderColor: isDragOver ? ACCENT : ACCENT2,
                      backgroundColor: isDragOver
                        ? "rgba(127, 92, 255, 0.12)"
                        : "rgba(85, 68, 209, 0.08)",
                    }}
                  >
                    <Upload
                      className="w-10 h-10 shrink-0"
                      style={{ color: ACCENT }}
                    />
                    {selectedFile ? (
                      <span className="px-4 text-center break-all">
                        {selectedFile.name}
                      </span>
                    ) : (
                      <span style={{ color: PLACEHOLDER_COLOR_DARK }}>
                        Нажмите для выбора или перетащите файл
                      </span>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    id="import-file-input"
                    type="file"
                    accept={acceptedTypes}
                    className="hidden"
                    onChange={(e) => {
                      handleFileSelect(e.target.files?.[0] ?? null);
                    }}
                  />
                </div>
              </div>
            )}
            {step === 2 && parsedData && (
              <div className="flex flex-col gap-4">
                <div
                  className="shrink-0 text-center"
                  style={{
                    fontSize: 18,
                    fontWeight: 400,
                    color: ACTIVE_TEXT_DARK,
                    lineHeight: 1.4,
                  }}
                >
                  <p className="mb-2">
                    Выберите, какие счета вы хотите импортировать, с каким
                    типом, названием, а также укажите текущий остаток
                  </p>
                  <p>
                    Также Вы можете связать импортируемый счет с уже имеющимся
                    активом/обязательством — для этого включите движок «Связать»
                  </p>
                </div>
                {step2Error && (
                  <p
                    className="text-base shrink-0"
                    style={{ color: "#FB4C4F" }}
                  >
                    {step2Error}
                  </p>
                )}
                <div className="flex flex-col gap-4 overflow-auto min-w-0">
                  {parsedData.accounts.map((account) => {
                    const key = `${account.name}|${account.currency}`;
                    const cardState =
                      accountCardStates.get(key) ?? getInitialAccountCardState(account);
                    return (
                      <ImportAccountCard
                        key={key}
                        account={account}
                        transactions={parsedData.transactions}
                        items={items}
                        state={cardState}
                        onChange={(next) => {
                          setAccountCardStates((prev) => {
                            const m = new Map(prev);
                            m.set(key, next);
                            return m;
                          });
                        }}
                        apiBase={API_BASE}
                      />
                    );
                  })}
                </div>
              </div>
            )}
            {step === 2 && !parsedData && (
              <div className="flex flex-col gap-4">
                <h3
                  className="text-2xl font-medium"
                  style={{ color: ACTIVE_TEXT_DARK }}
                >
                  Счета
                </h3>
                <p style={{ lineHeight: 1.4, color: PLACEHOLDER_COLOR_DARK }}>
                  Парсинг для выбранного источника пока не поддерживается.
                </p>
              </div>
            )}
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
              onClick={() => void handleNext()}
              disabled={isParsing}
            >
              {isParsing ? "Обработка…" : isLastStep ? "Завершить импорт" : "Далее"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
