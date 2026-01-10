"use client";

import { useEffect, useMemo, useState } from "react";

import { useAccountingStart } from "@/components/accounting-start-context";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function getTodayDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function AccountingStartGate({ children }: { children: React.ReactNode }) {
  const { accountingStartDate, loading, error, setAccountingStartDate } =
    useAccountingStart();
  const todayKey = useMemo(() => getTodayDateKey(), []);
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [localError, setLocalError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && !accountingStartDate) {
      setSelectedDate(todayKey);
      setLocalError(null);
    }
  }, [accountingStartDate, loading, todayKey]);

  const showGate = !loading && !accountingStartDate;

  const onSave = async () => {
    setLocalError(null);
    if (!selectedDate) {
      setLocalError("Укажите дату начала учета.");
      return;
    }
    if (selectedDate > todayKey) {
      setLocalError("Дата начала учета не может быть позже сегодняшней даты.");
      return;
    }
    setSaving(true);
    try {
      await setAccountingStartDate(selectedDate);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Не удалось сохранить дату.");
    } finally {
      setSaving(false);
    }
  };

  if (!showGate) {
    return <>{children}</>;
  }

  return (
    <>
      {children}
      <Dialog open={showGate} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Дата начала учета</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="text-sm text-muted-foreground">
              Выберите дату, с которой начнется учет активов и обязательств. Изменить
              ее позже будет нельзя.
            </div>
            <div className="grid gap-2">
              <Label>Дата начала учета</Label>
              <Input
                type="date"
                value={selectedDate}
                max={todayKey}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="border-2 border-border/70 bg-white shadow-none"
              />
            </div>
            {(localError || error) && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3">
                {localError ?? error}
              </div>
            )}
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={onSave}
                disabled={saving}
                className="bg-violet-600 hover:bg-violet-700 text-white"
              >
                {saving ? "Сохраняем..." : "Сохранить"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
