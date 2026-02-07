"use client";

import { useCallback, useState, type FormEvent } from "react";
import { Wallet } from "lucide-react";
import { FormModal } from "@/components/form-modal";
import { TextField, SelectField } from "@/components/ui/form-field";
import { SegmentedSelector } from "@/components/ui/segmented-selector";
import type { ItemKind } from "@/lib/api";
import { createItem, type ItemOut } from "@/lib/api";
import { parseRubToCents, formatRubInput, normalizeRubOnBlur } from "@/lib/format-rub";
import { ACTIVE_TEXT_DARK } from "@/lib/colors";

const QUICK_TYPES_ASSET = [
  { code: "cash", label: "Наличные" },
  { code: "bank_account", label: "Банковский счёт" },
  { code: "e_wallet", label: "Электронный кошелёк" },
];
const QUICK_TYPES_LIABILITY = [
  { code: "consumer_loan", label: "Потребительский кредит" },
  { code: "private_loan", label: "Займ физлицу" },
];

function getTodayDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export type CreateItemModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (created: ItemOut) => void;
};

export function CreateItemModal({
  open,
  onOpenChange,
  onSuccess,
}: CreateItemModalProps) {
  const [kind, setKind] = useState<ItemKind>("ASSET");
  const [typeCode, setTypeCode] = useState("cash");
  const [name, setName] = useState("");
  const [currencyCode, setCurrencyCode] = useState("RUB");
  const [amountStr, setAmountStr] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const typeOptions = kind === "ASSET" ? QUICK_TYPES_ASSET : QUICK_TYPES_LIABILITY;

  const resetForm = useCallback(() => {
    setKind("ASSET");
    setTypeCode("cash");
    setName("");
    setCurrencyCode("RUB");
    setAmountStr("");
    setFormError(null);
  }, []);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) resetForm();
      onOpenChange(next);
    },
    [onOpenChange, resetForm]
  );

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setFormError("Введите название.");
      return;
    }
    const cents = parseRubToCents(amountStr.trim() || "0");
    if (!Number.isFinite(cents) || cents < 0) {
      setFormError("Укажите корректную сумму.");
      return;
    }
    setFormError(null);
    setLoading(true);
    try {
      const created = await createItem({
        kind,
        type_code: typeCode,
        name: trimmed,
        currency_code: currencyCode,
        open_date: getTodayDateKey(),
        initial_value_rub: cents,
      });
      handleOpenChange(false);
      onSuccess(created);
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "Не удалось добавить актив/обязательство.";
      setFormError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <FormModal
      open={open}
      onOpenChange={handleOpenChange}
      title="Добавить актив/обязательство"
      icon={<Wallet className="w-8 h-8" style={{ color: ACTIVE_TEXT_DARK }} />}
      formError={formError}
      onSubmit={handleSubmit}
      onCancel={() => handleOpenChange(false)}
      submitLabel={loading ? "Добавляем..." : "Добавить"}
      loading={loading}
      size="medium"
    >
      <div className="grid gap-4">
        <div className="grid gap-2" role="group" aria-label="Тип">
          <SegmentedSelector
            options={[
              { value: "ASSET", label: "Актив", colorScheme: "green" },
              { value: "LIABILITY", label: "Обязательство", colorScheme: "red" },
            ]}
            value={kind}
            onChange={(value) => {
              const newKind = value as ItemKind;
              setKind(newKind);
              const opts = newKind === "ASSET" ? QUICK_TYPES_ASSET : QUICK_TYPES_LIABILITY;
              setTypeCode(opts[0]?.code ?? "cash");
            }}
          />
        </div>
        <SelectField
          label="Вид"
          value={typeCode}
          onValueChange={setTypeCode}
          options={typeOptions.map((t) => ({ value: t.code, label: t.label }))}
          placeholder="Выберите вид"
        />
        <TextField
          label="Название"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Например, Кошелёк"
          required
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TextField
            label="Валюта"
            value={currencyCode}
            onChange={(e) => setCurrencyCode(e.target.value.toUpperCase().slice(0, 3))}
            placeholder="RUB"
          />
          <TextField
            label="Начальный баланс (₽)"
            value={amountStr}
            onChange={(e) => setAmountStr(formatRubInput(e.target.value))}
            onBlur={(e) => setAmountStr(normalizeRubOnBlur(e.target.value))}
            placeholder="0"
          />
        </div>
      </div>
    </FormModal>
  );
}
