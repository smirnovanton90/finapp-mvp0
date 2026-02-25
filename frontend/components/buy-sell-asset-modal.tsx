"use client";

import React, { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { ArrowLeftRight } from "lucide-react";
import { FormModal } from "@/components/form-modal";
import { FormField } from "@/components/ui/form-field";
import { TextField, DateField } from "@/components/ui/form-field";
import { ItemSelector } from "@/components/item-selector";
import { SegmentedSelector } from "@/components/ui/segmented-selector";
import { createTransaction, fetchCategories, ItemOut, CounterpartyOut, API_BASE } from "@/lib/api";
import { getItemTypeLabel } from "@/lib/item-types";
import { getEffectiveItemKind, getItemPrimaryValueCents } from "@/lib/item-utils";
import { formatRubInput, normalizeRubOnBlur, parseRubToCents } from "@/lib/format-rub";
import { findCategoryIdByExactNameOrSynonym } from "@/lib/import-match-helpers";
import type { CategoryNode } from "@/lib/categories";
import { ACTIVE_TEXT_DARK } from "@/lib/colors";

const CATEGORY_ACQUISITION = "Приобретение активов";
const CATEGORY_SALE = "Продажа активов";
const CATEGORY_COMMISSION = "Комиссии от торговли на финансовом рынке";

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
  /** @deprecated Не используется: сумма указывается в валюте актива без перевода в рубли. */
  assetCurrencyToRubRateCents?: number | null;
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
  assetCurrencyToRubRateCents,
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
  const [categories, setCategories] = useState<CategoryNode[] | null>(null);

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
      fetchCategories().then(setCategories).catch(() => setCategories([]));
    }
  }, [open]);

  const assetCurrency = asset.currency_code || "RUB";
  const isRub = assetCurrency === "RUB";

  const isCrypto = asset.type_code === "crypto";
  const positionLots = asset.position_lots ?? 0;
  const quantityUnits = asset.quantity_units ?? 0;

  const showCommissionSourceField = React.useMemo(() => {
    const trimmed = commissionStr.trim();
    if (!trimmed) return false;
    if (isRub) {
      const cents = parseRubToCents(trimmed);
      return Number.isFinite(cents) && cents > 0;
    }
    const normalized = trimmed.replace(/\s/g, "").replace(",", ".");
    const value = normalized === "" ? NaN : Number(normalized);
    return Number.isFinite(value) && value > 0;
  }, [commissionStr, isRub]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);

    let quantityNum: number;
    if (isCrypto) {
      const raw = quantityStr.trim().replace(/,/, ".");
      quantityNum = raw === "" ? NaN : Number(raw);
      if (!Number.isFinite(quantityNum) || quantityNum <= 0) {
        setFormError("Укажите корректное количество (положительное число).");
        return;
      }
      if (mode === "SELL" && quantityNum > quantityUnits) {
        setFormError(
          `Количество для продажи не может превышать текущее количество (${quantityUnits}).`
        );
        return;
      }
    } else {
      const raw = quantityStr.trim().replace(/,/, ".");
      quantityNum = raw === "" ? NaN : Number(raw);
      if (!Number.isFinite(quantityNum) || quantityNum <= 0) {
        setFormError("Укажите корректное количество лотов (положительное число).");
        return;
      }
      const quantityLotsRounded = Math.round(quantityNum);
      if (mode === "SELL" && quantityLotsRounded > positionLots) {
        setFormError(
          `Количество для продажи не может превышать текущее количество (${positionLots} лотов).`
        );
        return;
      }
      quantityNum = quantityLotsRounded;
    }

    const priceCents = isRub
      ? parseRubToCents(priceStr)
      : (() => {
          const normalized = priceStr.trim().replace(/\s/g, "").replace(",", ".");
          const priceInCurrency = normalized === "" ? NaN : Number(normalized);
          if (!Number.isFinite(priceInCurrency) || priceInCurrency <= 0) return NaN;
          return Math.round(priceInCurrency * 100);
        })();
    if (!Number.isFinite(priceCents) || priceCents <= 0) {
      setFormError(
        isRub
          ? (isCrypto
              ? "Введите цену за единицу в формате 1234,56 (больше нуля)."
              : "Введите цену за лот в формате 1234,56 (больше нуля).")
          : `Введите цену в валюте ${assetCurrency} (положительное число).`
      );
      return;
    }

    let amountRubCents: number;
    if (isRub) {
      amountRubCents = Math.round((priceCents / 100) * quantityNum * 100);
    } else {
      const normalized = priceStr.trim().replace(/\s/g, "").replace(",", ".");
      const priceInCurrency = Number(normalized);
      amountRubCents = Math.round(priceInCurrency * quantityNum * 100);
    }

    if (!paymentItemId) {
      setFormError(
        mode === "BUY"
          ? "Выберите, откуда взять средства для оплаты."
          : "Выберите, куда зачислить средства от продажи."
      );
      return;
    }

    const hasCommissionInput = commissionStr.trim() !== "";
    let commissionCents = 0;
    if (hasCommissionInput) {
      if (isRub) {
        commissionCents = parseRubToCents(commissionStr);
      } else {
        const normalized = commissionStr.trim().replace(/\s/g, "").replace(",", ".");
        const commissionInCurrency = normalized === "" ? NaN : Number(normalized);
        if (!Number.isFinite(commissionInCurrency) || commissionInCurrency < 0) {
          setFormError(`Введите сумму комиссии в валюте ${assetCurrency} (неотрицательное число).`);
          return;
        }
        commissionCents = Math.round(commissionInCurrency * 100);
      }
      if (!Number.isFinite(commissionCents) || commissionCents < 0) {
        setFormError(
          isRub
            ? "Введите корректную сумму комиссии в формате 1234,56."
            : `Введите сумму комиссии в валюте ${assetCurrency}.`
        );
        return;
      }
      if (commissionCents > 0 && !commissionItemId) {
        setFormError("Выберите, откуда списать сумму комиссии.");
        return;
      }
    }

    const transactionDate = date;

    const categoryNodes = categories ?? [];
    const categoryAcquisition =
      findCategoryIdByExactNameOrSynonym(CATEGORY_ACQUISITION, categoryNodes);
    const categorySale =
      findCategoryIdByExactNameOrSynonym(CATEGORY_SALE, categoryNodes);
    const categoryCommission =
      findCategoryIdByExactNameOrSynonym(CATEGORY_COMMISSION, categoryNodes);

    setLoading(true);
    try {
      if (mode === "BUY") {
        await createTransaction({
          transaction_date: transactionDate,
          primary_item_id: paymentItemId,
          counterparty_item_id: null,
          counterparty_id: null,
          amount: amountRubCents,
          amount_counterparty: null,
          primary_quantity_lots: isCrypto ? null : quantityNum,
          counterparty_quantity_lots: null,
          primary_quantity_units: isCrypto ? quantityNum : null,
          counterparty_quantity_units: null,
          direction: "EXPENSE",
          transaction_type: "ACTUAL",
          category_id: categoryAcquisition,
          comment: null,
          related_item_id: asset.id,
          asset_link_type: "ASSET_PURCHASE",
        });
      } else {
        await createTransaction({
          transaction_date: transactionDate,
          primary_item_id: paymentItemId,
          counterparty_item_id: null,
          counterparty_id: null,
          amount: amountRubCents,
          amount_counterparty: null,
          primary_quantity_lots: isCrypto ? null : quantityNum,
          counterparty_quantity_lots: null,
          primary_quantity_units: isCrypto ? quantityNum : null,
          counterparty_quantity_units: null,
          direction: "INCOME",
          transaction_type: "ACTUAL",
          category_id: categorySale,
          comment: null,
          related_item_id: asset.id,
          asset_link_type: "ASSET_SALE",
        });
      }

      if (hasCommissionInput && commissionCents > 0 && commissionItemId) {
        await createTransaction({
          transaction_date: transactionDate,
          primary_item_id: commissionItemId,
          counterparty_item_id: null,
          counterparty_id: null,
          amount: commissionCents,
          amount_counterparty: null,
          primary_quantity_lots: null,
          counterparty_quantity_lots: null,
          primary_quantity_units: null,
          counterparty_quantity_units: null,
          direction: "EXPENSE",
          transaction_type: "ACTUAL",
          category_id: categoryCommission,
          comment: null,
          related_item_id: asset.id,
          asset_link_type: "ASSET_PURCHASE",
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
          label={isCrypto ? "Количество" : "Количество (лотов)"}
          value={quantityStr}
          onChange={(e) => {
            let v = e.target.value.replace(/\./g, ",");
            v = v.replace(/[^\d,]/g, "");
            const commaCount = (v.match(/,/g) || []).length;
            if (commaCount > 1) {
              const [intPart, ...decParts] = v.split(",");
              v = intPart + "," + decParts.join("");
            }
            setQuantityStr(v);
          }}
          onBlur={() => {}}
          inputMode="decimal"
          placeholder={isCrypto ? "0,5" : "10"}
        />

        <TextField
          label={`Цена (${assetCurrency})`}
          value={priceStr}
          onChange={(e) => setPriceStr(formatRubInput(e.target.value))}
          onBlur={() => setPriceStr((prev) => normalizeRubOnBlur(prev))}
          inputMode="decimal"
          placeholder={isRub ? "Например: 1 234,56" : `Например: 1 234,56 ${assetCurrency}`}
        />

        <TextField
          label={`Сумма комиссии, ${assetCurrency}`}
          value={commissionStr}
          onChange={(e) => setCommissionStr(formatRubInput(e.target.value))}
          onBlur={() => setCommissionStr((prev) => normalizeRubOnBlur(prev))}
          inputMode="decimal"
          placeholder={isRub ? "Например: 1 234,56" : `Например: 1 234,56 ${assetCurrency}`}
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

        {showCommissionSourceField && (
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
