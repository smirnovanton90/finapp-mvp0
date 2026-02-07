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
import { PINK_GRADIENT } from "@/lib/gradients";
import { cn } from "@/lib/utils";
import type { ImportSourceKey } from "@/components/import-history-modal-content";
import {
  parseDzenCSVFile,
  type DzenParsedData,
  isDzenDebtsAccount,
} from "@/lib/dzen-csv-parser";
import {
  ImportAccountCard,
  getInitialAccountCardState,
  type ImportAccountCardState,
} from "@/components/import-account-card";
import { CreateCounterpartyModal } from "@/components/create-counterparty-modal";
import { CreateCategoryModal } from "@/components/create-category-modal";
import {
  ImportCategoryCard,
  getInitialCategoryCardState,
  type ImportCategoryCardState,
} from "@/components/import-category-card";
import {
  ImportCounterpartyCard,
  getInitialCounterpartyCardState,
  type ImportCounterpartyCardState,
} from "@/components/import-counterparty-card";
import {
  fetchItems,
  fetchCategories,
  fetchCounterparties,
  fetchCounterpartyIndustries,
  API_BASE,
} from "@/lib/api";
import { validateStep2 } from "@/lib/import-step2-validation";
import { validateStep3 } from "@/lib/import-step3-validation";
import { validateStep4 } from "@/lib/import-step4-validation";
import { executeImportDzen, getStatementAccountingStartDate, getStatementLastTransactionDate } from "@/lib/import-dzen-executor";
import { getTypeOptionsForKind } from "@/lib/item-type-options";

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
  const [step3Error, setStep3Error] = React.useState<string | null>(null);
  const [step4Error, setStep4Error] = React.useState<string | null>(null);
  const [step5Error, setStep5Error] = React.useState<string | null>(null);
  const [isParsing, setIsParsing] = React.useState(false);
  const [isImporting, setIsImporting] = React.useState(false);
  const [accountCardStates, setAccountCardStates] = React.useState<
    Map<string, ImportAccountCardState>
  >(new Map());
  const [categoryCardStates, setCategoryCardStates] = React.useState<
    Map<string, ImportCategoryCardState>
  >(new Map());
  const [counterpartyCardStates, setCounterpartyCardStates] = React.useState<
    Map<string, ImportCounterpartyCardState>
  >(new Map());
  const [items, setItems] = React.useState<Awaited<ReturnType<typeof fetchItems>>>([]);
  const [counterparties, setCounterparties] = React.useState<
    Awaited<ReturnType<typeof fetchCounterparties>>
  >([]);
  const [industries, setIndustries] = React.useState<
    Awaited<ReturnType<typeof fetchCounterpartyIndustries>>
  >([]);
  const [categories, setCategories] = React.useState<Awaited<ReturnType<typeof fetchCategories>>>([]);
  const [addCounterpartyModalOpen, setAddCounterpartyModalOpen] = React.useState(false);
  const [addCounterpartyForAccountKey, setAddCounterpartyForAccountKey] = React.useState<string | null>(null);
  const [createCategoryOpen, setCreateCategoryOpen] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const acceptedTypes =
    importSource === "own" ? ".csv,.xlsx,.xls" : ".csv";

  const handleFileSelect = (file: File | null) => {
    setSelectedFile(file);
    setParsedData(null);
    setParseError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Парсинг файла при выборе (для Дзен) — чтобы показать параметры выписки на шаге 1
  React.useEffect(() => {
    if (importSource !== "dzen" || !selectedFile) {
      setParsedData(null);
      setParseError(null);
      return;
    }
    let cancelled = false;
    setIsParsing(true);
    setParseError(null);
    parseDzenCSVFile(selectedFile)
      .then((data) => {
        if (!cancelled) setParsedData(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setParseError(
            err instanceof Error ? err.message : "Не удалось распознать файл."
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsParsing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [importSource, selectedFile]);

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
      setStep3Error(null);
      setStep4Error(null);
      setStep5Error(null);
      setAccountCardStates(new Map());
      setCategoryCardStates(new Map());
      setCounterpartyCardStates(new Map());
    }
  }, [open]);

  React.useEffect(() => {
    if (parsedData?.accounts?.length) {
      const next = new Map<string, ImportAccountCardState>();
      const accountsToInit =
        importSource === "dzen"
          ? parsedData.accounts.filter((acc) => !isDzenDebtsAccount(acc))
          : parsedData.accounts;
      for (const acc of accountsToInit) {
        const key = `${acc.name}|${acc.currency}`;
        next.set(key, getInitialAccountCardState(acc));
      }
      setAccountCardStates(next);
    }
  }, [parsedData?.accounts, importSource]);

  React.useEffect(() => {
    if (parsedData && step === 2) {
      Promise.all([
        fetchItems(),
        fetchCounterparties(),
        fetchCounterpartyIndustries(),
      ])
        .then(([itemsData, counterpartiesData, industriesData]) => {
          setItems(itemsData);
          setCounterparties(counterpartiesData);
          setIndustries(industriesData);
        })
        .catch(() => {
          setItems([]);
          setCounterparties([]);
          setIndustries([]);
        });
    }
  }, [parsedData, step]);

  React.useEffect(() => {
    if (parsedData?.categories?.length) {
      const next = new Map<string, ImportCategoryCardState>();
      for (const cat of parsedData.categories) {
        next.set(cat.name, getInitialCategoryCardState(cat));
      }
      setCategoryCardStates(next);
    }
  }, [parsedData?.categories]);

  React.useEffect(() => {
    if (parsedData?.counterparties?.length) {
      const next = new Map<string, ImportCounterpartyCardState>();
      for (const cp of parsedData.counterparties) {
        next.set(cp.name, getInitialCounterpartyCardState(cp));
      }
      setCounterpartyCardStates(next);
    }
  }, [parsedData?.counterparties]);

  React.useEffect(() => {
    if (parsedData && step === 3) {
      fetchCategories({ includeArchived: false })
        .then(setCategories)
        .catch(() => setCategories([]));
    }
  }, [parsedData, step]);

  React.useEffect(() => {
    if (parsedData && step === 4) {
      fetchCounterparties()
        .then(setCounterparties)
        .catch(() => setCounterparties([]));
    }
  }, [parsedData, step]);

  const handleNext = async () => {
    if (step === 1 && importSource === "dzen") {
      if (!selectedFile) {
        setParseError("Выберите файл для импорта.");
        return;
      }
      if (!parsedData) {
        if (parseError) return;
        return; // ещё идёт парсинг
      }
      setStep(2);
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

    if (step === 3 && parsedData) {
      setStep3Error(null);
      const result = validateStep3(
        parsedData.categories ?? [],
        categoryCardStates,
        categories
      );
      if (!result.valid) {
        setStep3Error(result.error);
        return;
      }
    }

    if (step === 4 && parsedData) {
      setStep4Error(null);
      const result = validateStep4(
        parsedData.counterparties ?? [],
        counterpartyCardStates,
        counterparties
      );
      if (!result.valid) {
        setStep4Error(result.error);
        return;
      }
    }

    if (step < 5) {
      setStep((s) => (s + 1) as ImportStep);
      return;
    }

    // Step 5: выполнить импорт
    if (step === 5 && parsedData && importSource === "dzen") {
      setStep5Error(null);
      // Проверка: дата транзакции не может быть раньше даты начала действия связанного актива/обязательства
      for (const [key, state] of accountCardStates) {
        if (!state.linkEnabled || state.linkedItemId == null) continue;
        const item = items.find((i) => i.id === state.linkedItemId);
        if (!item?.open_date) continue;
        const [accountName, accountCurrency] = key.split("|");
        let minTxDate: string | null = null;
        for (const tx of parsedData.transactions) {
          const isOut =
            tx.outcomeAccountName === accountName &&
            tx.outcomeCurrency === accountCurrency;
          const isIn =
            tx.incomeAccountName === accountName &&
            tx.incomeCurrency === accountCurrency;
          if ((isOut || isIn) && tx.date) {
            if (!minTxDate || tx.date < minTxDate) minTxDate = tx.date;
          }
        }
        if (minTxDate != null && minTxDate < item.open_date) {
          const d = (s: string) =>
            s ? `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}` : "";
          setStep5Error(
            `По счёту «${accountName}» в выписке есть операции с ${d(minTxDate)}, что раньше даты начала действия связанного актива/обязательства (${d(item.open_date)}). Свяжите счёт с другим активом или создайте новый.`
          );
          return;
        }
      }
      setIsImporting(true);
      try {
        const result = await executeImportDzen({
          parsedData,
          accountCardStates,
          categoryCardStates,
          counterpartyCardStates,
          categoryNodes: categories,
        });
        if (result.success) {
          onFinish?.();
          onOpenChange(false);
        } else {
          setStep5Error(result.error);
        }
      } catch (err) {
        setStep5Error(
          err instanceof Error ? err.message : "Не удалось выполнить импорт."
        );
      } finally {
        setIsImporting(false);
      }
      return;
    }

    if (step === 5) {
      onFinish?.();
      onOpenChange(false);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep2Error(null);
      setStep3Error(null);
      setStep4Error(null);
      setStep5Error(null);
      setStep((s) => (s - 1) as ImportStep);
    }
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  const isLastStep = step === 5;

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange} modal={false}>
      <DialogContent
        title="Импорт счетов и операций"
        onInteractOutside={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest?.("[data-selector-dropdown]") || target.closest?.(".import-add-counterparty-modal")) {
            e.preventDefault();
          }
        }}
        onPointerDownOutside={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest?.("[data-selector-dropdown]") || target.closest?.(".import-add-counterparty-modal")) {
            e.preventDefault();
          }
        }}
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
            className="flex-1 min-h-0 overflow-auto overscroll-contain px-6 py-6"
            style={{
              color: ACTIVE_TEXT_DARK,
              fontSize: 18,
              fontWeight: 400,
            }}
          >
            {step === 1 && parseError && !selectedFile && (
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
                  {/* Параметры выписки или ошибка — только для Дзен после выбора файла */}
                  {importSource === "dzen" && selectedFile && (
                    <div className="flex flex-col gap-4">
                      <p
                        className="text-base"
                        style={{ color: ACTIVE_TEXT_DARK }}
                      >
                        Параметры выбранной выписки:
                      </p>
                      {isParsing && (
                        <div
                          className="p-4"
                          style={{
                            backgroundColor: BACKGROUND_DT,
                            borderRadius: 9,
                          }}
                        >
                          <p
                            className="text-base"
                            style={{ color: PLACEHOLDER_COLOR_DARK }}
                          >
                            Обработка файла…
                          </p>
                        </div>
                      )}
                      {!isParsing && parseError && (
                        <div
                          className="p-4"
                          style={{
                            backgroundColor: BACKGROUND_DT,
                            borderRadius: 9,
                          }}
                        >
                          <p className="text-base" style={{ color: "#FB4C4F" }}>
                            {parseError}
                          </p>
                        </div>
                      )}
                      {!isParsing && parsedData && !parseError && (
                        <>
                          <div className="grid grid-cols-2 gap-4">
                            <div
                              className="flex flex-col gap-2 p-4 items-center text-center"
                              style={{
                                backgroundColor: BACKGROUND_DT,
                                borderRadius: 9,
                              }}
                            >
                              <span
                                className="text-base"
                                style={{ color: ACTIVE_TEXT_DARK }}
                              >
                                Дата первой операции
                              </span>
                              <div
                                className="w-full px-3 py-2 text-base box-border"
                                style={{
                                  color: ACTIVE_TEXT_DARK,
                                  backgroundColor: MODAL_BG,
                                  borderRadius: 9,
                                }}
                              >
                                {parsedData.transactions.length > 0
                                  ? (() => {
                                      const dates = parsedData.transactions.map(
                                        (t) => t.date
                                      );
                                      const first = [...dates].sort()[0];
                                      const [y, m, d] = first.split("-");
                                      return `${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.${y}`;
                                    })()
                                  : "—"}
                              </div>
                            </div>
                            <div
                              className="flex flex-col gap-2 p-4 items-center text-center"
                              style={{
                                backgroundColor: BACKGROUND_DT,
                                borderRadius: 9,
                              }}
                            >
                              <span
                                className="text-base"
                                style={{ color: ACTIVE_TEXT_DARK }}
                              >
                                Дата последней операции
                              </span>
                              <div
                                className="w-full px-3 py-2 text-base box-border"
                                style={{
                                  color: ACTIVE_TEXT_DARK,
                                  backgroundColor: MODAL_BG,
                                  borderRadius: 9,
                                }}
                              >
                                {parsedData.transactions.length > 0
                                  ? (() => {
                                      const dates = parsedData.transactions.map(
                                        (t) => t.date
                                      );
                                      const last = [...dates].sort().reverse()[0];
                                      const [y, m, d] = last.split("-");
                                      return `${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.${y}`;
                                    })()
                                  : "—"}
                              </div>
                            </div>
                          </div>
                          <div className="grid grid-cols-4 gap-4">
                            <div
                              className="flex items-center justify-between gap-2 p-4"
                              style={{
                                backgroundColor: BACKGROUND_DT,
                                borderRadius: 9,
                              }}
                            >
                              <span
                                className="text-base"
                                style={{ color: ACTIVE_TEXT_DARK }}
                              >
                                Счетов
                              </span>
                              <div
                                className="px-3 py-1.5 text-base shrink-0"
                                style={{
                                  color: ACTIVE_TEXT_DARK,
                                  backgroundColor: MODAL_BG,
                                  borderRadius: 9,
                                }}
                              >
                                {parsedData.accounts.length}
                              </div>
                            </div>
                            <div
                              className="flex items-center justify-between gap-2 p-4"
                              style={{
                                backgroundColor: BACKGROUND_DT,
                                borderRadius: 9,
                              }}
                            >
                              <span
                                className="text-base"
                                style={{ color: ACTIVE_TEXT_DARK }}
                              >
                                Категорий
                              </span>
                              <div
                                className="px-3 py-1.5 text-base shrink-0"
                                style={{
                                  color: ACTIVE_TEXT_DARK,
                                  backgroundColor: MODAL_BG,
                                  borderRadius: 9,
                                }}
                              >
                                {parsedData.categories.length}
                              </div>
                            </div>
                            <div
                              className="flex items-center justify-between gap-2 p-4"
                              style={{
                                backgroundColor: BACKGROUND_DT,
                                borderRadius: 9,
                              }}
                            >
                              <span
                                className="text-base"
                                style={{ color: ACTIVE_TEXT_DARK }}
                              >
                                Контрагентов
                              </span>
                              <div
                                className="px-3 py-1.5 text-base shrink-0"
                                style={{
                                  color: ACTIVE_TEXT_DARK,
                                  backgroundColor: MODAL_BG,
                                  borderRadius: 9,
                                }}
                              >
                                {parsedData.counterparties.length.toLocaleString(
                                  "ru-RU"
                                )}
                              </div>
                            </div>
                            <div
                              className="flex items-center justify-between gap-2 p-4"
                              style={{
                                backgroundColor: BACKGROUND_DT,
                                borderRadius: 9,
                              }}
                            >
                              <span
                                className="text-base"
                                style={{ color: ACTIVE_TEXT_DARK }}
                              >
                                Транзакций
                              </span>
                              <div
                                className="px-3 py-1.5 text-base shrink-0"
                                style={{
                                  color: ACTIVE_TEXT_DARK,
                                  backgroundColor: MODAL_BG,
                                  borderRadius: 9,
                                }}
                              >
                                {parsedData.transactions.length.toLocaleString(
                                  "ru-RU"
                                )}
                              </div>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}
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
                  <p className="mb-2">
                    Также Вы можете связать импортируемый счет с уже имеющимся
                    активом/обязательством — для этого включите движок «Связать»
                  </p>
                  {importSource === "dzen" && (
                    <p style={{ color: PLACEHOLDER_COLOR_DARK }}>
                      Счёт «Долги» из выписки не импортируется. Операции
                      перевода на него и с него будут загружены как расходы или
                      доходы с категориями «Прочие расходы» и «Прочие доходы»
                      соответственно.
                    </p>
                  )}
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
                  {(importSource === "dzen"
                    ? parsedData.accounts.filter((acc) => !isDzenDebtsAccount(acc))
                    : parsedData.accounts
                  ).map((account) => {
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
                        counterparties={counterparties}
                        industries={industries}
                        statementAccountingStartDate={getStatementAccountingStartDate(
                          parsedData,
                          accountCardStates
                        )}
                        statementLastTransactionDate={getStatementLastTransactionDate(
                          parsedData
                        )}
                        onAddCounterparty={() => {
                          setAddCounterpartyForAccountKey(key);
                          setAddCounterpartyModalOpen(true);
                        }}
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
            {step === 3 && parsedData && (
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
                    Выберите, какие категории импортировать, укажите тип,
                    родителя, название и иконку.
                  </p>
                  <p>
                    Также Вы можете связать импортируемую категорию с уже
                    имеющейся — для этого включите движок «Связать».
                  </p>
                </div>
                {step3Error && (
                  <p
                    className="text-base shrink-0"
                    style={{ color: "#FB4C4F" }}
                  >
                    {step3Error}
                  </p>
                )}
                <div className="flex flex-col gap-4 overflow-auto min-w-0">
                  {parsedData.categories.map((category) => {
                    const key = category.name;
                    const cardState =
                      categoryCardStates.get(key) ?? getInitialCategoryCardState(category);
                    return (
                      <ImportCategoryCard
                        key={key}
                        category={category}
                        categoryNodes={categories}
                        state={cardState}
                        onChange={(next) => {
                          setCategoryCardStates((prev) => {
                            const m = new Map(prev);
                            m.set(key, next);
                            return m;
                          });
                        }}
                        onAddCategory={() => setCreateCategoryOpen(true)}
                      />
                    );
                  })}
                </div>
              </div>
            )}
            {step === 3 && !parsedData && (
              <p style={{ lineHeight: 1.4, color: PLACEHOLDER_COLOR_DARK }}>
                Сначала загрузите файл на шаге 1.
              </p>
            )}
            {step === 4 && parsedData && (parsedData.counterparties?.length ?? 0) > 0 && (
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
                    Выберите, какие контрагенты импортировать, укажите тип
                    (ЮЛ/ИП или ФЛ) и необходимые данные.
                  </p>
                  <p>
                    Также Вы можете связать импортируемого контрагента с уже
                    имеющимся — для этого включите движок «Связать».
                  </p>
                </div>
                {step4Error && (
                  <p
                    className="text-base shrink-0"
                    style={{ color: "#FB4C4F" }}
                  >
                    {step4Error}
                  </p>
                )}
                <div className="flex flex-col gap-4 overflow-auto min-w-0">
                  {parsedData.counterparties!.map((cp) => {
                    const key = cp.name;
                    const cardState =
                      counterpartyCardStates.get(key) ??
                      getInitialCounterpartyCardState(cp);
                    return (
                      <ImportCounterpartyCard
                        key={key}
                        counterparty={cp}
                        counterparties={counterparties}
                        state={cardState}
                        onChange={(next) => {
                          setCounterpartyCardStates((prev) => {
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
            {step === 4 &&
              (parsedData?.counterparties?.length ?? 0) === 0 &&
              parsedData && (
                <p style={{ lineHeight: 1.4, color: PLACEHOLDER_COLOR_DARK }}>
                  В выгрузке не найдено контрагентов. Перейдите к следующему
                  шагу.
                </p>
              )}
            {step === 4 && !parsedData && (
              <p style={{ lineHeight: 1.4, color: PLACEHOLDER_COLOR_DARK }}>
                Сначала загрузите файл на шаге 1.
              </p>
            )}
            {step === 5 && (
              <div className="flex flex-col gap-6">
                {step5Error && (
                  <p
                    className="text-base shrink-0"
                    style={{ color: "#FB4C4F" }}
                  >
                    {step5Error}
                  </p>
                )}
                <div
                  className="shrink-0 text-center"
                  style={{
                    fontSize: 18,
                    fontWeight: 400,
                    color: ACTIVE_TEXT_DARK,
                    lineHeight: 1.4,
                  }}
                >
                  <p className="mb-2">Настройка импорта завершена!</p>
                  <p>Будут импортированы</p>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  {(() => {
                    const accountsTotal = (parsedData?.accounts ?? []).filter(
                      (a) => {
                        const key = `${a.name}|${a.currency}`;
                        return !!accountCardStates.get(key);
                      }
                    ).length;
                    const accountsLinked = (parsedData?.accounts ?? []).filter(
                      (a) => {
                        const key = `${a.name}|${a.currency}`;
                        const s = accountCardStates.get(key);
                        return !!s && s.linkEnabled;
                      }
                    ).length;
                    const categoriesTotal = (
                      parsedData?.categories ?? []
                    ).filter((c) => !!categoryCardStates.get(c.name)).length;
                    const categoriesLinked = (
                      parsedData?.categories ?? []
                    ).filter((c) => {
                      const s = categoryCardStates.get(c.name);
                      return !!s && s.linkEnabled;
                    }).length;
                    const counterpartiesTotal = (
                      parsedData?.counterparties ?? []
                    ).filter((c) => !!counterpartyCardStates.get(c.name)).length;
                    const counterpartiesLinked = (
                      parsedData?.counterparties ?? []
                    ).filter((c) => {
                      const s = counterpartyCardStates.get(c.name);
                      return !!s && s.linkEnabled;
                    }).length;

                    return (
                      <>
                        <div
                          className="rounded-lg p-6 flex flex-col items-center justify-center"
                          style={{
                            backgroundColor: BACKGROUND_DT,
                          }}
                        >
                          <span
                            className="mb-2"
                            style={{
                              fontSize: 32,
                              fontWeight: 500,
                              color: ACTIVE_TEXT_DARK,
                            }}
                          >
                            Счета
                          </span>
                          <span
                            className="font-semibold"
                            style={{
                              fontSize: 96,
                              fontWeight: 600,
                              background: PINK_GRADIENT,
                              WebkitBackgroundClip: "text",
                              WebkitTextFillColor: "transparent",
                              backgroundClip: "text",
                            }}
                          >
                            {accountsTotal}
                          </span>
                          <span
                            className="mt-1 px-3 py-1"
                            style={{
                              fontSize: 18,
                              fontWeight: 400,
                              color: ACTIVE_TEXT_DARK,
                              backgroundColor: MODAL_BG,
                              borderRadius: 9,
                            }}
                          >
                            Связанных — {accountsLinked}
                          </span>
                        </div>
                        <div
                          className="rounded-lg p-6 flex flex-col items-center justify-center"
                          style={{
                            backgroundColor: BACKGROUND_DT,
                          }}
                        >
                          <span
                            className="mb-2"
                            style={{
                              fontSize: 32,
                              fontWeight: 500,
                              color: ACTIVE_TEXT_DARK,
                            }}
                          >
                            Категории
                          </span>
                          <span
                            className="font-semibold"
                            style={{
                              fontSize: 96,
                              fontWeight: 600,
                              background: PINK_GRADIENT,
                              WebkitBackgroundClip: "text",
                              WebkitTextFillColor: "transparent",
                              backgroundClip: "text",
                            }}
                          >
                            {categoriesTotal}
                          </span>
                          <span
                            className="mt-1 px-3 py-1"
                            style={{
                              fontSize: 18,
                              fontWeight: 400,
                              color: ACTIVE_TEXT_DARK,
                              backgroundColor: MODAL_BG,
                              borderRadius: 9,
                            }}
                          >
                            Связанных — {categoriesLinked}
                          </span>
                        </div>
                        <div
                          className="rounded-lg p-6 flex flex-col items-center justify-center"
                          style={{
                            backgroundColor: BACKGROUND_DT,
                          }}
                        >
                          <span
                            className="mb-2"
                            style={{
                              fontSize: 32,
                              fontWeight: 500,
                              color: ACTIVE_TEXT_DARK,
                            }}
                          >
                            Контрагенты
                          </span>
                          <span
                            className="font-semibold"
                            style={{
                              fontSize: 96,
                              fontWeight: 600,
                              background: PINK_GRADIENT,
                              WebkitBackgroundClip: "text",
                              WebkitTextFillColor: "transparent",
                              backgroundClip: "text",
                            }}
                          >
                            {counterpartiesTotal}
                          </span>
                          <span
                            className="mt-1 px-3 py-1"
                            style={{
                              fontSize: 18,
                              fontWeight: 400,
                              color: ACTIVE_TEXT_DARK,
                              backgroundColor: MODAL_BG,
                              borderRadius: 9,
                            }}
                          >
                            Связанных — {counterpartiesLinked}
                          </span>
                        </div>
                      </>
                    );
                  })()}
                </div>
                <div
                  className="rounded-lg p-6 flex flex-col items-center justify-center"
                  style={{
                    backgroundColor: BACKGROUND_DT,
                  }}
                >
                  <span
                    className="mb-2"
                    style={{
                      fontSize: 32,
                      fontWeight: 500,
                      color: ACTIVE_TEXT_DARK,
                    }}
                  >
                    Транзакции
                  </span>
                  <span
                    className="font-semibold"
                    style={{
                      fontSize: 96,
                      fontWeight: 600,
                      background: PINK_GRADIENT,
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      backgroundClip: "text",
                    }}
                  >
                    {parsedData?.transactions?.length ?? 0}
                  </span>
                </div>
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
              disabled={isParsing || isImporting}
            >
              {isParsing
                ? "Обработка…"
                : isImporting
                ? "Импорт…"
                : isLastStep
                ? "Завершить импорт"
                : "Далее"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    <CreateCategoryModal
      open={createCategoryOpen}
      onOpenChange={setCreateCategoryOpen}
      onSuccess={() => {
        fetchCategories({ includeArchived: false })
          .then(setCategories)
          .catch(() => setCategories([]));
        setCreateCategoryOpen(false);
      }}
    />
    <CreateCounterpartyModal
      open={addCounterpartyModalOpen}
      onOpenChange={(next) => {
        setAddCounterpartyModalOpen(next);
        if (!next) setAddCounterpartyForAccountKey(null);
      }}
      onSuccess={(created) => {
        setCounterparties((prev) => [...prev, created]);
        if (addCounterpartyForAccountKey) {
          setAccountCardStates((prev) => {
            const m = new Map(prev);
            const state = m.get(addCounterpartyForAccountKey);
            if (state) {
              m.set(addCounterpartyForAccountKey, { ...state, counterpartyId: created.id });
            }
            return m;
          });
        }
        setAddCounterpartyModalOpen(false);
        setAddCounterpartyForAccountKey(null);
      }}
      initialIndustryId={(() => {
        if (!addCounterpartyForAccountKey) return undefined;
        const cardState = accountCardStates.get(addCounterpartyForAccountKey);
        if (!cardState) return undefined;
        const typeOptions = getTypeOptionsForKind(cardState.kind);
        const effectiveType = cardState.typeCode && typeOptions.some((o) => o.code === cardState.typeCode)
          ? cardState.typeCode
          : typeOptions[0]?.code ?? "";
        const isBankType = ["bank_account", "bank_card", "deposit", "savings_account"].includes(effectiveType);
        return isBankType ? industries.find((ind) => ind.name === "Банки")?.id ?? undefined : undefined;
      })()}
      overlayClassName="z-[100] import-add-counterparty-modal"
      containerClassName="z-[100] import-add-counterparty-modal"
    />
    </>
  );
}
