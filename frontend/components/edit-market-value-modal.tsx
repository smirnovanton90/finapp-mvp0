"use client";

import React, { useEffect, useState, useMemo } from "react";
import type { FormEvent } from "react";
import { FormModal } from "@/components/form-modal";
import { DateField, TextField } from "@/components/ui/form-field";
import {
  createItemMarketValue,
  updateItemMarketValue,
  type ItemOut,
  type ItemMarketValueOut,
} from "@/lib/api";
import { formatRubInput, normalizeRubOnBlur, parseRubToCents, formatCentsForInput } from "@/lib/format-rub";

function getTodayDateKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export interface EditMarketValueModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: ItemOut;
  marketValues: ItemMarketValueOut[];
  /** For legacy records without value_currency_cents: get FX rate (RUB per 1 unit of currency) for date. */
  getRateForDate?: (dateKey: string) => number | null;
  onSuccess?: () => void | Promise<void>;
}

export function EditMarketValueModal({
  open,
  onOpenChange,
  item,
  marketValues,
  getRateForDate,
  onSuccess,
}: EditMarketValueModalProps) {
  const openDate = item.open_date ?? getTodayDateKey();
  const todayKey = getTodayDateKey();
  const currencyCode = (item.currency_code ?? "RUB").toUpperCase();
  const isRub = currencyCode === "RUB";

  const [valueDate, setValueDate] = useState(todayKey);
  const [amountStr, setAmountStr] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const existingForDate = useMemo(
    () => marketValues.find((mv) => mv.value_date === valueDate),
    [marketValues, valueDate]
  );

  useEffect(() => {
    if (!open) return;
    setValueDate(todayKey);
    setFormError(null);
    const existing = marketValues.find((mv) => mv.value_date === todayKey);
    if (existing != null) {
      if (existing.value_currency_cents != null) {
        setAmountStr(formatCentsForInput(existing.value_currency_cents));
      } else if (!isRub && getRateForDate) {
        const rate = getRateForDate(existing.value_date);
        if (rate != null && rate > 0) {
          const centsInCurrency = Math.round(existing.value_rub / rate);
          setAmountStr(formatCentsForInput(centsInCurrency));
        } else {
          setAmountStr(formatCentsForInput(existing.value_rub));
        }
      } else {
        setAmountStr(formatCentsForInput(existing.value_rub));
      }
    } else {
      setAmountStr("");
    }
  }, [open, todayKey, marketValues, isRub, getRateForDate]);

  useEffect(() => {
    if (!open) return;
    const existing = existingForDate;
    if (existing != null) {
      if (existing.value_currency_cents != null) {
        setAmountStr(formatCentsForInput(existing.value_currency_cents));
      } else if (!isRub && getRateForDate) {
        const rate = getRateForDate(existing.value_date);
        if (rate != null && rate > 0) {
          const centsInCurrency = Math.round(existing.value_rub / rate);
          setAmountStr(formatCentsForInput(centsInCurrency));
        } else {
          setAmountStr(formatCentsForInput(existing.value_rub));
        }
      } else {
        setAmountStr(formatCentsForInput(existing.value_rub));
      }
    } else {
      setAmountStr("");
    }
  }, [valueDate, existingForDate, isRub, getRateForDate, open]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);
    const cents = parseRubToCents(amountStr);
    if (!Number.isFinite(cents) || cents < 0) {
      setFormError("Укажите корректную рыночную стоимость (неотрицательное число).");
      return;
    }
    if (valueDate < openDate || valueDate > todayKey) {
      setFormError("Дата должна быть в диапазоне от даты появления актива до текущей даты.");
      return;
    }
    setLoading(true);
    try {
      const payload = { value_date: valueDate, value_currency_cents: cents };
      if (existingForDate != null) {
        await updateItemMarketValue(item.id, existingForDate.id, payload);
      } else {
        await createItemMarketValue(item.id, payload);
      }
      onOpenChange(false);
      await onSuccess?.();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Не удалось сохранить");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  const dateMin = openDate;
  const dateMax = todayKey;

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title="Изменить рыночную стоимость"
      formError={formError}
      onSubmit={handleSubmit}
      onCancel={handleCancel}
      submitLabel="Сохранить"
      cancelLabel="Отмена"
      loading={loading}
    >
      <DateField
        label="Дата"
        value={valueDate}
        onChange={(e) => setValueDate(e.target.value.slice(0, 10))}
        min={dateMin}
        max={dateMax}
        required
      />
      <TextField
        label="Рыночная стоимость"
        currencyCode={currencyCode}
        value={amountStr}
        onChange={(e) => setAmountStr(formatRubInput(e.target.value))}
        onBlur={(e) => setAmountStr(normalizeRubOnBlur(e.target.value))}
        placeholder="0,00"
      />
    </FormModal>
  );
}
