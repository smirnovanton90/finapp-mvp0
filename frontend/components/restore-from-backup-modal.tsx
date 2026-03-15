"use client";

import * as React from "react";
import { FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { resetAllUserData } from "@/lib/api";
import {
  parseExportCsv,
  runImport,
  validateExportForImport,
  type ParsedExport,
} from "@/lib/data-export-import";
import { ACTIVE_TEXT_DARK, BACKGROUND_DT, MODAL_BG } from "@/lib/colors";
import { PINK_GRADIENT } from "@/lib/gradients";
import { cn } from "@/lib/utils";

export type RestoreFromBackupModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Вызывается после успешного восстановления (сброс + импорт выполнены). Кабинет обновит профиль и контекст даты учёта. */
  onSuccess?: () => void;
};

const RESTORE_ENTITY_ORDER: { key: string; label: string }[] = [
  { key: "date", label: "Дата начала учёта" },
  { key: "counterparties", label: "Контрагенты" },
  { key: "categories", label: "Категории" },
  { key: "items", label: "Активы и обязательства" },
  { key: "marketValues", label: "Рыночные стоимости" },
  { key: "chains", label: "Цепочки транзакций" },
  { key: "transactions", label: "Транзакции" },
  { key: "goals", label: "Цели" },
  { key: "checkpoints", label: "Контрольные точки" },
];

const STAGE_TO_KEY: Record<string, string> = {
  "Установка даты начала учёта": "date",
  "Контрагенты": "counterparties",
  "Категории": "categories",
  "Активы и обязательства": "items",
  "Рыночные стоимости": "marketValues",
  "Цепочки транзакций": "chains",
  "Транзакции": "transactions",
  "Цели": "goals",
  "Контрольные точки": "checkpoints",
  "Готово": "done",
};

function getEntityCount(data: ParsedExport, key: string): number {
  switch (key) {
    case "date":
      return data.accounting_start_date?.trim() ? 1 : 0;
    case "counterparties":
      return data.counterparties.length;
    case "categories":
      return data.categories.length;
    case "items":
      return data.items.length;
    case "marketValues":
      return data.itemMarketValues?.length ?? 0;
    case "chains":
      return data.transactionChains.length;
    case "transactions":
      return data.transactions.length;
    case "goals":
      return data.goals.length;
    case "checkpoints":
      return data.balanceCheckpoints?.length ?? 0;
    default:
      return 0;
  }
}

function hasExportData(data: ParsedExport): boolean {
  return (
    data.transactions.length > 0 ||
    data.items.length > 0 ||
    data.counterparties.length > 0 ||
    data.categories.length > 0 ||
    data.goals.length > 0 ||
    (data.balanceCheckpoints?.length ?? 0) > 0 ||
    data.transactionChains.length > 0 ||
    (data.itemMarketValues?.length ?? 0) > 0 ||
    !!(data.accounting_start_date?.trim())
  );
}

function formatCounts(data: ParsedExport): string {
  const parts = RESTORE_ENTITY_ORDER.map((entity) => {
    const n = getEntityCount(data, entity.key);
    if (n === 0) return null;
    const labels: Record<string, string> = {
      date: "дата начала учёта",
      counterparties: "контрагентов",
      categories: "категорий",
      items: "активов",
      marketValues: "рыночных стоимостей",
      chains: "цепочек",
      transactions: "транзакций",
      goals: "целей",
      checkpoints: "контрольных точек",
    };
    return `${labels[entity.key] ?? entity.key}: ${n}`;
  }).filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "нет данных";
}

export function RestoreFromBackupModal({
  open,
  onOpenChange,
  onSuccess,
}: RestoreFromBackupModalProps) {
  const [step, setStep] = React.useState<1 | 2>(1);
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [parsedData, setParsedData] = React.useState<ParsedExport | null>(null);
  const [parseError, setParseError] = React.useState<string | null>(null);
  const [restoring, setRestoring] = React.useState(false);
  const [restoreError, setRestoreError] = React.useState<string | null>(null);
  const [importStageKey, setImportStageKey] = React.useState<string | null>(null);
  const [importCurrent, setImportCurrent] = React.useState(0);
  const [importTotal, setImportTotal] = React.useState(0);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const resetState = React.useCallback(() => {
    setStep(1);
    setSelectedFile(null);
    setParsedData(null);
    setParseError(null);
    setRestoreError(null);
    setImportStageKey(null);
    setImportCurrent(0);
    setImportTotal(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  React.useEffect(() => {
    if (!open) return;
    resetState();
  }, [open, resetState]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setSelectedFile(file ?? null);
    setParsedData(null);
    setParseError(null);
    setRestoreError(null);
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setParseError("Выберите файл в формате .csv");
      return;
    }
    file
      .text()
      .then((text) => {
        try {
          const parsed = parseExportCsv(text);
          if (!hasExportData(parsed)) {
            setParseError("В файле не найдено данных для восстановления.");
            setParsedData(null);
            return;
          }
          setParsedData(parsed);
          setParseError(null);
        } catch (err) {
          setParseError(err instanceof Error ? err.message : "Не удалось прочитать файл.");
          setParsedData(null);
        }
      })
      .catch((err) => {
        setParseError(err instanceof Error ? err.message : "Не удалось прочитать файл.");
        setParsedData(null);
      });
  };

  const handleNext = () => {
    if (step === 1 && parsedData) setStep(2);
  };

  const handleBack = () => {
    setStep(1);
    setRestoreError(null);
  };

  const handleRestore = async () => {
    if (!parsedData) return;
    const validation = validateExportForImport(parsedData);
    if (!validation.valid) {
      const lines = validation.invalidTransfers.map((item) => {
        if (item.type === "chain") {
          return `• Цепочка «${item.name ?? "Цепочка"}» (строка цепочек ${item.index})`;
        }
        const parts = [`• Транзакция ${item.index}`];
        if (item.date) parts.push(`дата ${item.date}`);
        if (item.amount != null) parts.push(`сумма ${item.amount}`);
        if (item.comment) parts.push(`комментарий: ${item.comment}`);
        return parts.join(", ");
      });
      setRestoreError(
        `В файле есть переводы без связанного актива (счёт «Куда» отсутствует или не входит в файл). Исправьте файл или удалите эти записи.\n\n${lines.join("\n")}`
      );
      return;
    }
    setRestoring(true);
    setRestoreError(null);
    setImportStageKey(null);
    setImportCurrent(0);
    setImportTotal(0);
    try {
      await resetAllUserData();
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.removeItem("finapp-date-setup-complete");
      }
      const result = await runImport(parsedData, (p) => {
        const key = STAGE_TO_KEY[p.stage] ?? null;
        setImportStageKey(key === "done" ? null : key);
        setImportCurrent(p.current);
        setImportTotal(p.total);
      });
      if (!result.success) {
        setRestoreError(result.error ?? "Ошибка импорта.");
        setRestoring(false);
        return;
      }
      onSuccess?.();
      onOpenChange(false);
    } catch (err) {
      setRestoreError(err instanceof Error ? err.message : "Ошибка восстановления.");
    } finally {
      setRestoring(false);
    }
  };

  const canGoNext = step === 1 && selectedFile && parsedData && !parseError;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!restoring) {
          onOpenChange(next);
          if (!next) resetState();
        }
      }}
    >
      <DialogContent
        showCloseButton={!restoring}
        title={step === 1 ? "Восстановление из резервной копии" : "Подтверждение восстановления"}
        className={cn(
          "w-full max-w-[calc(100%-2rem)] h-[920px] max-h-[min(920px,100dvh)] p-0 gap-0 overflow-hidden flex flex-col",
          "border-0 rounded-[9px]"
        )}
        style={{
          backgroundColor: MODAL_BG,
          width: 1000,
          maxWidth: "min(1000px, calc(100vw - 2rem))",
        }}
      >
        <div className="flex flex-col w-full h-full min-h-0 overflow-auto px-6 pt-4 pb-6">
          <div className="space-y-4" style={{ color: ACTIVE_TEXT_DARK }}>
          {step === 1 ? (
            <>
              <p className="text-sm">
                Выберите ранее экспортированный файл .csv. После подтверждения все текущие данные
                будут удалены и заменены данными из файла.
              </p>
              <div className="flex flex-col gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleFileChange}
                  aria-label="Выберите файл .csv"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 rounded-lg border border-dashed p-4 text-left transition-colors hover:bg-black/10"
                  style={{ borderColor: "rgba(255,255,255,0.2)", color: ACTIVE_TEXT_DARK }}
                >
                  <FileUp className="w-5 h-5 shrink-0 opacity-70" />
                  <span className="text-sm">
                    {selectedFile ? selectedFile.name : "Нажмите, чтобы выбрать файл .csv"}
                  </span>
                </button>
                {parseError && (
                  <p className="text-sm" style={{ color: "#FB4C4F" }}>
                    {parseError}
                  </p>
                )}
                {parsedData && !parseError && (
                  <p className="text-xs opacity-80">{formatCounts(parsedData)}</p>
                )}
              </div>
            </>
          ) : (
            <>
              <p className="text-sm">
                Все текущие данные будут безвозвратно удалены: активы и обязательства, транзакции
                и цепочки, контрагенты и категории, цели, контрольные точки, дата начала учёта.
                Данные из выбранного файла будут импортированы.
              </p>
              <p className="text-sm font-medium" style={{ color: "#FB4C4F" }}>
                Продолжить?
              </p>
              {parsedData && (
                <>
                  <p className="text-xs opacity-80 mb-2">
                    Файл: {selectedFile?.name}
                  </p>
                  <p
                    className="mb-3 text-center"
                    style={{
                      fontSize: 18,
                      fontWeight: 400,
                      color: ACTIVE_TEXT_DARK,
                      lineHeight: 1.4,
                    }}
                  >
                    {restoring ? "Импорт…" : "Будут импортированы"}
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {RESTORE_ENTITY_ORDER.map((entity, index) => {
                      const count = getEntityCount(parsedData, entity.key);
                      const currentIndex =
                        importStageKey != null
                          ? RESTORE_ENTITY_ORDER.findIndex((e) => e.key === importStageKey)
                          : -1;
                      const isComplete =
                        restoring && (currentIndex < 0 || index < currentIndex);
                      const isActive =
                        restoring && currentIndex >= 0 && index === currentIndex;
                      const progress =
                        isComplete
                          ? 1
                          : isActive && importTotal > 0
                            ? Math.min(importCurrent / importTotal, 1)
                            : 0;
                      const showBar = restoring;
                      return (
                        <div
                          key={entity.key}
                          className="rounded-lg p-4 flex flex-col"
                          style={{ backgroundColor: BACKGROUND_DT }}
                        >
                          <span
                            className="mb-1 text-sm font-medium"
                            style={{ color: ACTIVE_TEXT_DARK, fontSize: 14 }}
                          >
                            {entity.label}
                          </span>
                          <span
                            className="font-semibold"
                            style={{
                              fontSize: 36,
                              fontWeight: 600,
                              background: PINK_GRADIENT,
                              WebkitBackgroundClip: "text",
                              WebkitTextFillColor: "transparent",
                              backgroundClip: "text",
                            }}
                          >
                            {count}
                          </span>
                          {showBar && (
                            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
                              <div
                                className="h-full rounded-full transition-[width]"
                                style={{
                                  width: `${progress * 100}%`,
                                  backgroundColor: "#6C5DD7",
                                }}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
              {restoreError && (
                <p
                  className="text-sm mt-3 overflow-auto max-h-48 whitespace-pre-line"
                  style={{ color: "#FB4C4F" }}
                >
                  {restoreError}
                </p>
              )}
            </>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-4">
          {step === 1 ? (
            <>
              <Button
                type="button"
                variant="ghost"
                className="rounded-lg"
                onClick={() => onOpenChange(false)}
              >
                Отмена
              </Button>
              <Button
                type="button"
                variant="authPrimary"
                className="rounded-lg border-0 px-6"
                style={
                  {
                    "--auth-primary-bg":
                      "linear-gradient(135deg, #483BA6 0%, #6C5DD7 57%, #6C5DD7 79%, #9487F3 100%)",
                    "--auth-primary-bg-hover":
                      "linear-gradient(315deg, #9487F3 0%, #6C5DD7 57%, #6C5DD7 79%, #483BA6 100%)",
                  } as React.CSSProperties
                }
                disabled={!canGoNext}
                onClick={handleNext}
              >
                Далее
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="ghost"
                className="rounded-lg"
                onClick={handleBack}
                disabled={restoring}
              >
                Назад
              </Button>
              <Button
                type="button"
                className="rounded-lg border-0"
                style={{
                  backgroundColor: "#EF4444",
                  color: "#fff",
                }}
                onClick={handleRestore}
                disabled={restoring}
              >
                {restoring ? "Восстановление…" : "Восстановить"}
              </Button>
            </>
          )}
        </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
