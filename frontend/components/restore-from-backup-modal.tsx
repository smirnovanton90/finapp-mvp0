"use client";

import * as React from "react";
import { FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { resetAllUserData } from "@/lib/api";
import { parseExportCsv, runImport, type ParsedExport } from "@/lib/data-export-import";
import { ACTIVE_TEXT_DARK, MODAL_BG } from "@/lib/colors";
import { cn } from "@/lib/utils";

export type RestoreFromBackupModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Вызывается после успешного восстановления (сброс + импорт выполнены). Кабинет обновит профиль и контекст даты учёта. */
  onSuccess?: () => void;
};

function hasExportData(data: ParsedExport): boolean {
  return (
    data.transactions.length > 0 ||
    data.items.length > 0 ||
    data.counterparties.length > 0 ||
    data.categories.length > 0 ||
    data.goals.length > 0 ||
    (data.balanceCheckpoints?.length ?? 0) > 0 ||
    data.transactionChains.length > 0
  );
}

function formatCounts(data: ParsedExport): string {
  const parts: string[] = [];
  if (data.counterparties.length) parts.push(`контрагентов: ${data.counterparties.length}`);
  if (data.categories.length) parts.push(`категорий: ${data.categories.length}`);
  if (data.items.length) parts.push(`активов: ${data.items.length}`);
  if (data.transactionChains.length) parts.push(`цепочек: ${data.transactionChains.length}`);
  if (data.transactions.length) parts.push(`транзакций: ${data.transactions.length}`);
  if (data.goals.length) parts.push(`целей: ${data.goals.length}`);
  if ((data.balanceCheckpoints?.length ?? 0) > 0)
    parts.push(`контрольных точек: ${data.balanceCheckpoints!.length}`);
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
  const [importStage, setImportStage] = React.useState<string | null>(null);
  const [importCurrent, setImportCurrent] = React.useState(0);
  const [importTotal, setImportTotal] = React.useState(0);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const resetState = React.useCallback(() => {
    setStep(1);
    setSelectedFile(null);
    setParsedData(null);
    setParseError(null);
    setRestoreError(null);
    setImportStage(null);
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
    setRestoring(true);
    setRestoreError(null);
    setImportStage(null);
    setImportCurrent(0);
    setImportTotal(0);
    try {
      await resetAllUserData();
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.removeItem("finapp-date-setup-complete");
      }
      const result = await runImport(parsedData, (p) => {
        setImportStage(p.stage);
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
        className={cn("border-0 rounded-[9px] max-w-md")}
        style={{ backgroundColor: MODAL_BG }}
      >
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
                <p className="text-xs opacity-80">
                  Файл: {selectedFile?.name}. {formatCounts(parsedData)}
                </p>
              )}
              {restoring && importStage != null && (
                <p className="text-sm" style={{ color: ACTIVE_TEXT_DARK }}>
                  Импорт: {importStage} — {importCurrent} / {importTotal}
                </p>
              )}
              {restoreError && (
                <p className="text-sm" style={{ color: "#FB4C4F" }}>
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
      </DialogContent>
    </Dialog>
  );
}
