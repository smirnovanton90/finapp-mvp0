"use client";

import React, { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { ArrowLeftRight } from "lucide-react";
import { FormModal } from "@/components/form-modal";
import { FormField } from "@/components/ui/form-field";
import { TextField, DateField } from "@/components/ui/form-field";
import { ItemSelector } from "@/components/item-selector";
import { SegmentedSelector } from "@/components/ui/segmented-selector";
import { createTransaction, ItemOut, CounterpartyOut, API_BASE } from "@/lib/api";
import { getItemTypeLabel } from "@/lib/item-types";
import { getEffectiveItemKind, getItemPrimaryValueCents } from "@/lib/item-utils";
import { formatRubInput, normalizeRubOnBlur, parseRubToCents } from "@/lib/format-rub";
import { ACTIVE_TEXT_DARK } from "@/lib/colors";

function getTodayDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export type BuySellMode = "BUY" | "SELL";

export interface BuySellAssetModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset: ItemOut;
  items: ItemOut[];
  getCounterpartyForItemId?: (id: number) => CounterpartyOut | null;
  getBankLogoUrl?: (id: number | null | undefined) => string | null;
  getBankName?: (id: number | null | undefined) => string;
  getItemBalance?: (item: ItemOut) => number;
  itemCounts?: Map<number, number> | Record<number, number>;
  onSuccess?: () => void | Promise<void>;
}

export function BuySellAssetModal({
  open,
  onOpenChange,
  asset,
  items,
  getCounterpartyForItemId,
  getBankLogoUrl,
  getBankName,
  getItemBalance = getItemPrimaryValueCents,
  itemCounts,
  onSuccess,
}: BuySellAssetModalProps) {
  const [mode, setMode] = useState<BuySellMode>("BUY");
  const [date, setDate] = useState(() => getTodayDateKey());
  const [quantityStr, setQuantityStr] = useState("");
  const [priceStr, setPriceStr] = useState("");
  const [commissionStr, setCommissionStr] = useState("");
  const [paymentItemId, setPaymentItemId] = useState<number | null>(null);
  const [commissionItemId, setCommissionItemId] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const selectableItems = React.useMemo(
    () => items.filter((item) => item.id !== asset.id && !item.archived_at && !item.closed_at),
    [items, asset.id]
  );

  const resolveItemKind = (item: ItemOut) =>
    getEffectiveItemKind(item, getItemBalance(item));

  useEffect(() => {
    if (open) {
      setDate(getTodayDateKey());
      setQuantityStr("");
      setPriceStr("");
      setCommissionStr("");
      setPaymentItemId(null);
      setCommissionItemId(null);
      setFormError(null);
    }
  }, [open]);

  const positionLots = asset.position_lots ?? 0;

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);

    const quantity = quantityStr.trim() === "" ? NaN : parseInt(quantityStr.trim(), 10);
    if (!Number.isInteger(quantity) || quantity < 0) {
      setFormError("Укажите корректное количество лотов (целое число ≥ 0).");
      return;
    }

    if (mode === "SELL" && quantity > positionLots) {
      setFormError(
        `Количество для продажи не может превышать текущее количество (${positionLots} лотов).`
      );
      return;
    }

    const priceCents = parseRubToCents(priceStr);
    if (!Number.isFinite(priceCents) || priceCents <= 0) {
      setFormError("Введите цену за лот в формате 1234,56 (больше нуля).");
      return;
    }

    if (!paymentItemId) {
      setFormError(
        mode === "BUY"
          ? "Выберите, откуда взять средства для оплаты."
          : "Выберите, куда зачислить средства от продажи."
      );
      return;
    }

    const hasCommission = commissionStr.trim() !== "";
    let commissionCents = 0;
    if (hasCommission) {
      commissionCents = parseRubToCents(commissionStr);
      if (!Number.isFinite(commissionCents) || commissionCents < 0) {
        setFormError("Введите корректную сумму комиссии в формате 1234,56.");
        return;
      }
      if (!commissionItemId) {
        setFormError("Выберите, откуда списать сумму комиссии.");
        return;
      }
    }

    const amountRubCents = Math.round((priceCents / 100) * quantity * 100);
    const transactionDate = date;

    setLoading(true);
    try {
      if (mode === "BUY") {
        await createTransaction({
          transaction_date: transactionDate,
          primary_item_id: paymentItemId,
          counterparty_item_id: null,
          counterparty_id: null,
          amount_rub: amountRubCents,
          amount_counterparty: null,
          primary_quantity_lots: null,
          direction: "EXPENSE",
          transaction_type: "ACTUAL",
          category_id: null,
          comment: null,
          related_item_id: asset.id,
          asset_link_type: "ASSET_PURCHASE",
        });
        await createTransaction({
          transaction_date: transactionDate,
          primary_item_id: asset.id,
          counterparty_item_id: null,
          counterparty_id: null,
          amount_rub: amountRubCents,
          amount_counterparty: null,
          primary_quantity_lots: quantity,
          direction: "INCOME",
          transaction_type: "ACTUAL",
          category_id: null,
          comment: null,
          related_item_id: asset.id,
          asset_link_type: "ASSET_PURCHASE",
        });
      } else {
        await createTransaction({
          transaction_date: transactionDate,
          primary_item_id: asset.id,
          counterparty_item_id: null,
          counterparty_id: null,
          amount_rub: amountRubCents,
          amount_counterparty: null,
          primary_quantity_lots: quantity,
          direction: "EXPENSE",
          transaction_type: "ACTUAL",
          category_id: null,
          comment: null,
          related_item_id: asset.id,
          asset_link_type: "ASSET_EXPENSE",
        });
        await createTransaction({
          transaction_date: transactionDate,
          primary_item_id: paymentItemId,
          counterparty_item_id: null,
          counterparty_id: null,
          amount_rub: amountRubCents,
          amount_counterparty: null,
          primary_quantity_lots: null,
          direction: "INCOME",
          transaction_type: "ACTUAL",
          category_id: null,
          comment: null,
          related_item_id: asset.id,
          asset_link_type: "ASSET_SALE",
        });
      }

      if (hasCommission && commissionCents > 0 && commissionItemId) {
        await createTransaction({
          transaction_date: transactionDate,
          primary_item_id: commissionItemId,
          counterparty_item_id: null,
          counterparty_id: null,
          amount_rub: commissionCents,
          amount_counterparty: null,
          primary_quantity_lots: null,
          direction: "EXPENSE",
          transaction_type: "ACTUAL",
          category_id: null,
          comment: null,
          related_item_id: asset.id,
        });
      }

      onOpenChange(false);
      await onSuccess?.();
    } catch (err: unknown) {
      setFormError((err as Error)?.message ?? "Не удалось создать транзакцию.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title="Купить/продать актив"
      icon={<ArrowLeftRight className="w-8 h-8" style={{ color: ACTIVE_TEXT_DARK }} />}
      formError={formError}
      onSubmit={handleSubmit}
      onCancel={() => onOpenChange(false)}
      submitLabel={mode === "BUY" ? "Купить" : "Продать"}
      loading={loading}
      size="medium"
    >
      <div className="grid gap-4">
        <FormField label="Операция">
          <SegmentedSelector
            options={[
              { value: "BUY", label: "Купить", colorScheme: "green" },
              { value: "SELL", label: "Продать", colorScheme: "red" },
            ]}
            value={mode}
            onChange={(v) => setMode(v as BuySellMode)}
          />
        </FormField>

        <DateField
          label="Дата"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />

        <TextField
          label="Количество (лотов)"
          value={quantityStr}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "");
            setQuantityStr(v);
          }}
          onBlur={() => {}}
          inputMode="numeric"
          placeholder="0"
        />

        <TextField
          label="Цена за лот (руб.)"
          value={priceStr}
          onChange={(e) => setPriceStr(formatRubInput(e.target.value))}
          onBlur={() => setPriceStr((prev) => normalizeRubOnBlur(prev))}
          inputMode="decimal"
          placeholder="Например: 1 234,56"
        />

        <TextField
          label="Сумма комиссии (необязательно)"
          value={commissionStr}
          onChange={(e) => setCommissionStr(formatRubInput(e.target.value))}
          onBlur={() => setCommissionStr((prev) => normalizeRubOnBlur(prev))}
          inputMode="decimal"
          placeholder="Например: 1 234,56"
        />

        <FormField
          label={
            mode === "BUY"
              ? "Откуда взять средства для оплаты"
              : "Куда зачислить средства от продажи"
          }
        >
          <ItemSelector
            items={selectableItems}
            selectedIds={paymentItemId ? [paymentItemId] : []}
            onChange={(ids) => setPaymentItemId(ids[0] ?? null)}
            selectionMode="single"
            placeholder="Выберите"
            getItemTypeLabel={getItemTypeLabel}
            getItemKind={resolveItemKind}
            getCounterpartyForItemId={getCounterpartyForItemId}
            apiBase={API_BASE}
            getBankLogoUrl={getBankLogoUrl}
            getBankName={getBankName}
            getItemBalance={getItemBalance}
            itemCounts={itemCounts}
          />
        </FormField>

        {commissionStr.trim() !== "" && (
          <FormField label="Откуда списать сумму комиссии">
            <ItemSelector
              items={selectableItems}
              selectedIds={commissionItemId ? [commissionItemId] : []}
              onChange={(ids) => setCommissionItemId(ids[0] ?? null)}
              selectionMode="single"
              placeholder="Выберите"
              getItemTypeLabel={getItemTypeLabel}
              getItemKind={resolveItemKind}
              getCounterpartyForItemId={getCounterpartyForItemId}
              apiBase={API_BASE}
              getBankLogoUrl={getBankLogoUrl}
              getBankName={getBankName}
              getItemBalance={getItemBalance}
              itemCounts={itemCounts}
            />
          </FormField>
        )}
      </div>
    </FormModal>
  );
}
