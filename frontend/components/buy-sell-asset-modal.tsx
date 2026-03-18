"use client";

import React, { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { ArrowLeftRight, Plus, Trash2 } from "lucide-react";
import { FormModal } from "@/components/form-modal";
import { Label } from "@/components/ui/label";
import { Tooltip } from "@/components/ui/tooltip";
import { IconButton } from "@/components/ui/icon-button";
import { CurrencyChip } from "@/components/currency-chip";
import { FormField } from "@/components/ui/form-field";
import { TextField, DateField } from "@/components/ui/form-field";
import { ItemSelector } from "@/components/item-selector";
import { SegmentedSelector } from "@/components/ui/segmented-selector";
import { createTransaction, fetchCategories, fetchMarketInstrumentPrices, ItemOut, CounterpartyOut, API_BASE } from "@/lib/api";
import { getItemTypeLabel } from "@/lib/item-types";
import { getEffectiveItemKind, getItemPrimaryValueCents } from "@/lib/item-utils";
import { formatCentsForInput, formatRubInput, normalizeRubOnBlur, parseRubToCents } from "@/lib/format-rub";
import { findCategoryIdByExactNameOrSynonym } from "@/lib/import-match-helpers";
import type { CategoryNode } from "@/lib/categories";
import { ACTIVE_TEXT_DARK, RED } from "@/lib/colors";

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

function addDaysToDateKey(dateKey: string, days: number): string {
  const d = new Date(dateKey + "T12:00:00");
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
  const [deals, setDeals] = useState<{ quantityStr: string; priceStr: string }[]>([{ quantityStr: "", priceStr: "" }]);
  const [nkdStr, setNkdStr] = useState("");
  const [commissionStr, setCommissionStr] = useState("");
  const [paymentItemId, setPaymentItemId] = useState<number | null>(null);
  const [commissionItemId, setCommissionItemId] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<CategoryNode[] | null>(null);
  const [bondAccintCents, setBondAccintCents] = useState<number | null>(null);
  /** Текущая цена из MOEX для подстановки в поле цены по умолчанию (для всех MOEX-активов). */
  const [defaultMoexPriceCents, setDefaultMoexPriceCents] = useState<number | null>(null);
  const userDidEditNkdRef = React.useRef(false);

  const selectableItems = React.useMemo(
    () => items.filter((item) => item.id !== asset.id),
    [items, asset.id]
  );

  const resolveItemKind = (item: ItemOut) =>
    getEffectiveItemKind(item, getItemBalance(item));

  const isMoex = asset.type_code === "bonds" || asset.type_code === "securities" || asset.type_code === "etf" || asset.type_code === "bpif";
  useEffect(() => {
    if (open) {
      setDate(getTodayDateKey());
      setDeals([{ quantityStr: "", priceStr: "" }]);
      setNkdStr("");
      setCommissionStr("");
      setPaymentItemId(null);
      setCommissionItemId(null);
      setFormError(null);
      userDidEditNkdRef.current = false;
      setBondAccintCents(null);
      setDefaultMoexPriceCents(null);
      fetchCategories().then(setCategories).catch(() => setCategories([]));
    }
  }, [open]);

  // Цена и НКД на выбранную в поле «Дата» дату
  useEffect(() => {
    if (!open || !isMoex || !asset.instrument_id || !date) return;
    userDidEditNkdRef.current = false;
    const from = addDaysToDateKey(date, -30);
    const to = date;
    let cancelled = false;
    fetchMarketInstrumentPrices(asset.instrument_id, {
      from,
      to,
      boardId: asset.instrument_board_id ?? undefined,
    })
      .then((prices) => {
        if (cancelled || !prices?.length) return;
        const onOrBefore = prices.filter((p) => p.price_date <= date).sort((a, b) => b.price_date.localeCompare(a.price_date));
        const priceForDate = onOrBefore[0];
        if (priceForDate) {
          if (priceForDate.price_cents != null) setDefaultMoexPriceCents(priceForDate.price_cents);
          if (priceForDate.accint_cents != null) setBondAccintCents(priceForDate.accint_cents);
          else if (asset.type_code === "bonds") setBondAccintCents(0);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBondAccintCents(null);
          setDefaultMoexPriceCents(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, date, isMoex, asset.instrument_id, asset.instrument_board_id, asset.type_code]);

  const assetCurrency = asset.currency_code || "RUB";
  const isRub = assetCurrency === "RUB";

  const isCrypto = asset.type_code === "crypto";
  const isBond = asset.type_code === "bonds";
  const positionLots = asset.position_lots ?? 0;
  const quantityUnits = asset.quantity_units ?? 0;
  const lotSize = asset.lot_size ?? 1;

  const dealsTotals = React.useMemo(() => {
    let totalQuantity = 0;
    let totalAmountCents = 0;
    for (const row of deals) {
      const raw = row.quantityStr.trim().replace(/,/, ".");
      const q = raw === "" ? NaN : isCrypto ? Number(raw) : Math.floor(Number(raw));
      const priceCents = row.priceStr.trim()
        ? (isRub ? parseRubToCents(row.priceStr) : Math.round(Number(row.priceStr.replace(/,/, ".").replace(/\s/g, "")) * 100))
        : null;
      if (!Number.isFinite(q) || q <= 0 || priceCents == null || !Number.isFinite(priceCents) || priceCents <= 0) continue;
      totalQuantity += q;
      totalAmountCents += isCrypto ? Math.round(q * priceCents) : Math.round(q * priceCents * lotSize);
    }
    const avgPriceCents =
      totalQuantity > 0 && (isCrypto || lotSize > 0)
        ? Math.round(totalAmountCents / (isCrypto ? totalQuantity : totalQuantity * lotSize))
        : null;
    return { totalQuantity, totalAmountCents, averagePriceCents: avgPriceCents };
  }, [deals, isCrypto, isRub, lotSize]);

  useEffect(() => {
    if (!isBond || mode !== "BUY" || bondAccintCents == null || userDidEditNkdRef.current) return;
    const quantityNum = dealsTotals.totalQuantity;
    if (!Number.isFinite(quantityNum) || quantityNum <= 0) {
      setNkdStr("");
      return;
    }
    const totalNkdCents = bondAccintCents * quantityNum * lotSize;
    setNkdStr(formatCentsForInput(totalNkdCents));
  }, [isBond, mode, bondAccintCents, dealsTotals.totalQuantity, lotSize, isCrypto]);

  useEffect(() => {
    if (defaultMoexPriceCents == null || !open) return;
    setDeals((prev) =>
      prev.map((d) => ({
        ...d,
        priceStr: d.priceStr.trim() ? d.priceStr : formatCentsForInput(defaultMoexPriceCents),
      }))
    );
  }, [defaultMoexPriceCents, open, deals.length]);

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

    const quantityNum = dealsTotals.totalQuantity;
    if (!Number.isFinite(quantityNum) || quantityNum <= 0) {
      setFormError(
        isCrypto
          ? "Добавьте хотя бы одну сделку с количеством больше 0."
          : "Добавьте хотя бы одну сделку с количеством лотов больше 0."
      );
      return;
    }
    if (dealsTotals.averagePriceCents == null || dealsTotals.averagePriceCents <= 0) {
      setFormError("Укажите цену за единицу в каждой сделке (положительное число).");
      return;
    }
    if (mode === "SELL") {
      if (isCrypto && quantityNum > quantityUnits) {
        setFormError(
          `Количество для продажи не может превышать текущее количество (${quantityUnits}).`
        );
        return;
      }
      if (!isCrypto && quantityNum > positionLots) {
        setFormError(
          `Количество для продажи не может превышать текущее количество (${positionLots} лотов).`
        );
        return;
      }
    }

    let amountRubCents = dealsTotals.totalAmountCents;

    let nkdCents = 0;
    if (mode === "BUY" && isBond) {
      const nkdParsed = isRub ? parseRubToCents(nkdStr) : (() => {
        const normalized = nkdStr.trim().replace(/\s/g, "").replace(",", ".");
        const v = normalized === "" ? NaN : Number(normalized);
        return Number.isFinite(v) && v >= 0 ? Math.round(v * 100) : NaN;
      })();
      if (!Number.isFinite(nkdParsed) || nkdParsed < 0) {
        setFormError("Укажите НКД (накопленный купонный доход), можно 0.");
        return;
      }
      nkdCents = nkdParsed;
      amountRubCents += nkdCents;
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

    const priceStrForComment =
      dealsTotals.averagePriceCents != null ? formatCentsForInput(dealsTotals.averagePriceCents) : "";
    const buyComment =
      mode === "BUY" && isBond
        ? `Покупка ${quantityNum * (isCrypto ? 1 : lotSize)} облигаций "${asset.name}" по цене ${priceStrForComment}, НКД - ${nkdStr.trim() || "0"}`
        : null;

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
          comment: buyComment,
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

        <div className="space-y-3">
          <Label style={{ color: ACTIVE_TEXT_DARK }}>Сделки</Label>
          <div className="space-y-3">
            {deals.map((deal, idx) => (
              <div key={idx} className="rounded-lg border p-3 space-y-2" style={{ borderColor: "rgba(148, 163, 184, 0.4)" }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium" style={{ color: ACTIVE_TEXT_DARK }}>Сделка {idx + 1}</span>
                  {deals.length > 1 && (
                    <Tooltip content="Удалить сделку">
                      <IconButton type="button" aria-label="Удалить сделку" style={{ color: RED }} onClick={() => setDeals(deals.filter((_, i) => i !== idx))}>
                        <Trash2 className="h-4 w-4" />
                      </IconButton>
                    </Tooltip>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <TextField
                    label=""
                    value={deal.quantityStr}
                    onChange={(e) => {
                      let v = e.target.value.replace(/\./g, ",");
                      if (!isCrypto) v = v.replace(/[^\d,]/g, "");
                      const next = [...deals];
                      next[idx] = { ...next[idx], quantityStr: v };
                      setDeals(next);
                    }}
                    onBlur={() => {}}
                    inputMode="decimal"
                    placeholder={isCrypto ? "Кол-во" : "Лотов"}
                  />
                  <TextField
                    label=""
                    currencyCode={assetCurrency}
                    value={deal.priceStr}
                    onChange={(e) => {
                      const next = [...deals];
                      next[idx] = { ...next[idx], priceStr: formatRubInput(e.target.value) };
                      setDeals(next);
                    }}
                    onBlur={() => {
                      const next = [...deals];
                      next[idx] = { ...next[idx], priceStr: normalizeRubOnBlur(next[idx].priceStr) };
                      setDeals(next);
                    }}
                    inputMode="decimal"
                    placeholder="Цена"
                  />
                </div>
              </div>
            ))}
            <Tooltip content="Добавить сделку" className="block w-full">
              <IconButton type="button" aria-label="Добавить сделку" className="!w-full" onClick={() => setDeals([...deals, { quantityStr: "", priceStr: "" }])}>
                <Plus className="h-4 w-4" />
              </IconButton>
            </Tooltip>
          </div>
          {(dealsTotals.totalQuantity > 0 || deals.some((d) => d.quantityStr.trim() || d.priceStr.trim())) && (
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm" style={{ color: ACTIVE_TEXT_DARK }}>
              <span>
                Итого: <strong>{dealsTotals.totalQuantity}</strong> {isCrypto ? "ед." : "лотов"}
              </span>
              {dealsTotals.averagePriceCents != null && (
                <span>
                  Средняя цена:{" "}
                  <span className="inline-flex items-center gap-1">
                    <CurrencyChip code={assetCurrency} className="shrink-0" />
                    {formatCentsForInput(dealsTotals.averagePriceCents)}
                  </span>
                </span>
              )}
            </div>
          )}
        </div>

        {mode === "BUY" && isBond && (
          <TextField
            label="НКД"
            labelHint="Из MOEX (можно скорректировать)"
            currencyCode={assetCurrency}
            value={nkdStr}
            onChange={(e) => {
              userDidEditNkdRef.current = true;
              setNkdStr(formatRubInput(e.target.value));
            }}
            onBlur={() => setNkdStr((prev) => normalizeRubOnBlur(prev))}
            inputMode="decimal"
            placeholder="0"
            required
          />
        )}

        <TextField
          label="Сумма комиссии"
          currencyCode={assetCurrency}
          value={commissionStr}
          onChange={(e) => setCommissionStr(formatRubInput(e.target.value))}
          onBlur={() => setCommissionStr((prev) => normalizeRubOnBlur(prev))}
          inputMode="decimal"
          placeholder={isRub ? "Например: 1 234,56" : "Например: 1 234,56"}
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
