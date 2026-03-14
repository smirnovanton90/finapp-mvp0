"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ArrowLeftRight, Coins, HandCoins, Receipt, QrCode, Banknote, Calendar, Wallet, Tag, User, MessageSquare, Link2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { MODAL_BG, ACTIVE_TEXT_DARK, PLACEHOLDER_COLOR_DARK } from "@/lib/colors";
import { BLUE_GRADIENT } from "@/lib/gradients";
import { MobileTapScale } from "@/components/mobile-tap-scale";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { FormField, TextField, DateField, SelectField } from "@/components/ui/form-field";
import { AuthInput } from "@/components/ui/auth-input";
import { SegmentedSelector } from "@/components/ui/segmented-selector";
import { ItemSelector } from "@/components/item-selector";
import { CounterpartySelector } from "@/components/counterparty-selector";
import { CategorySelector } from "@/components/category-selector";
import { WizardStepIndicator } from "@/components/wizard-step-indicator";
import { buildCategoryLookup, makeCategoryPathKey } from "@/lib/categories";
import type { CategoryNode } from "@/lib/categories";
import { getItemTypeLabel } from "@/lib/item-types";
import { getEffectiveItemKind, getItemPrimaryValueCents } from "@/lib/item-utils";
import { formatCentsForInput, formatRubInput, normalizeRubOnBlur, parseRubToCents } from "@/lib/format-rub";
import { formatTimeInput } from "@/lib/format-time";
import { formatAmount } from "@/lib/item-utils";
import {
  createTransaction,
  splitTransaction,
  API_BASE,
  type ItemOut,
  type CounterpartyOut,
  type CounterpartyIndustryOut,
  type TransactionCreate,
  type TransactionOut,
  type AssetLinkType,
  type TransactionSplitPartCreate,
} from "@/lib/api";

const SIMPLE_WIZARD_STEPS = 11;

function buildTransactionDate(dateKey: string, timeHHmm: string): string {
  const t = /^\d{1,2}:\d{2}$/.test(timeHHmm) ? timeHHmm : "00:00";
  return `${dateKey}T${t}:00`;
}

const MOEX_TYPE_CODES = new Set(["securities", "bonds", "etf", "bpif", "pif", "precious_metals"]);
function isMoexItem(item?: ItemOut | null) {
  if (!item) return false;
  if (item.type_code === "crypto") return false;
  if (item.instrument_id) return true;
  return MOEX_TYPE_CODES.has(item.type_code);
}
function isCryptoItem(item?: ItemOut | null) {
  if (!item) return false;
  return item.type_code === "crypto";
}

export type WizardFlowType = "SIMPLE" | "LOAN_REPAYMENT" | "DEBTS" | "RECEIPT";

export interface MobileAddTransactionWizardProps {
  open: boolean;
  onClose: () => void;
  onSelectLoanRepayment: () => void;
  onSelectDebt: () => void;
  onSelectReceipt: () => void;
  items: ItemOut[];
  categoryNodes: CategoryNode[];
  counterparties: CounterpartyOut[];
  industries: CounterpartyIndustryOut[];
  itemTxCounts: Map<number, number>;
  counterpartyTxCounts: Map<number, number>;
  accountingStartDate: string | null;
  onCreateSuccess: () => void;
}

export function MobileAddTransactionWizard({
  open,
  onClose,
  onSelectLoanRepayment,
  onSelectDebt,
  onSelectReceipt,
  items,
  categoryNodes,
  counterparties,
  industries,
  itemTxCounts,
  counterpartyTxCounts,
  accountingStartDate,
  onCreateSuccess,
}: MobileAddTransactionWizardProps) {
  const [flowType, setFlowType] = useState<WizardFlowType | null>(null);
  const [step, setStep] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [amountStr, setAmountStr] = useState("");
  const [amountCounterpartyStr, setAmountCounterpartyStr] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState("");
  const [direction, setDirection] = useState<"INCOME" | "EXPENSE" | "TRANSFER">("EXPENSE");
  const [formTransactionType, setFormTransactionType] = useState<TransactionOut["transaction_type"]>("ACTUAL");
  const [primaryItemId, setPrimaryItemId] = useState<number | null>(null);
  const [counterpartyItemId, setCounterpartyItemId] = useState<number | null>(null);
  const [counterpartyId, setCounterpartyId] = useState<number | null>(null);
  const [selectedCategoryPath, setSelectedCategoryPath] = useState<{ l1: string; l2: string; l3: string } | null>(null);
  const [comment, setComment] = useState("");
  const [relatedItemId, setRelatedItemId] = useState<number | null>(null);
  const [assetLinkType, setAssetLinkType] = useState<AssetLinkType | null>(null);
  const [splitEnabled, setSplitEnabled] = useState(false);
  const [splitParts, setSplitParts] = useState<{ amountStr: string; categoryId: number | null }[]>([]);
  const [primaryQuantityLots, setPrimaryQuantityLots] = useState("");
  const [counterpartyQuantityLots, setCounterpartyQuantityLots] = useState("");
  const [primaryQuantityUnitsStr, setPrimaryQuantityUnitsStr] = useState("");
  const [counterpartyQuantityUnitsStr, setCounterpartyQuantityUnitsStr] = useState("");

  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const categoryLookup = useMemo(() => buildCategoryLookup(categoryNodes), [categoryNodes]);
  const selectableCounterparties = useMemo(
    () => counterparties.filter((c) => !c.deleted_at),
    [counterparties]
  );

  const getEffectiveItemMeta = useCallback(
    (itemId: number | null | undefined) => {
      if (!itemId) return null;
      const selected = itemsById.get(itemId);
      if (!selected) return null;
      let effective = selected;
      let minDate = accountingStartDate ?? selected.open_date ?? "";
      if (selected.open_date && selected.open_date > minDate) minDate = selected.open_date;
      if (selected.type_code === "bank_card" && selected.card_account_id) {
        const account = itemsById.get(selected.card_account_id);
        if (account) {
          effective = account;
          if (account.open_date && account.open_date > minDate) minDate = account.open_date;
        }
      }
      const currencyCode = effective.currency_code || selected.currency_code || "";
      return { selected, effective, minDate, currencyCode, typeCode: selected.type_code };
    },
    [itemsById, accountingStartDate]
  );

  const resolveItemEffectiveKind = useCallback((item: ItemOut) => getEffectiveItemKind(item, item.current_value_rub), []);
  const itemsForSelector = useMemo(() => items, [items]);
  const primarySelectItems = itemsForSelector;
  const counterpartySelectItems = itemsForSelector;
  const primaryItem = primaryItemId ? itemsById.get(primaryItemId) ?? null : null;
  const counterpartyItem = counterpartyItemId ? itemsById.get(counterpartyItemId) ?? null : null;
  const isTransfer = direction === "TRANSFER";
  const primaryIsMoex = isMoexItem(primaryItem);
  const counterpartyIsMoex = isTransfer && isMoexItem(counterpartyItem);
  const primaryIsCrypto = isCryptoItem(primaryItem);
  const counterpartyIsCrypto = isTransfer && isCryptoItem(counterpartyItem);
  const primaryCurrencyCode = primaryItemId ? getEffectiveItemMeta(primaryItemId)?.currencyCode ?? null : null;
  const counterpartyCurrencyCode = counterpartyItemId ? getEffectiveItemMeta(counterpartyItemId)?.currencyCode ?? null : null;
  const isCrossCurrencyTransfer =
    isTransfer &&
    !!primaryCurrencyCode &&
    !!counterpartyCurrencyCode &&
    primaryCurrencyCode !== counterpartyCurrencyCode;

  const normalizeCategoryValue = useCallback((value: string) => {
    const trimmed = value.trim();
    if (!trimmed || trimmed === "—") return "";
    return trimmed;
  }, []);
  const resolveCategoryId = useCallback(
    (l1: string, l2: string, l3: string) => {
      const key = makeCategoryPathKey(
        normalizeCategoryValue(l1),
        normalizeCategoryValue(l2),
        normalizeCategoryValue(l3)
      );
      return categoryLookup.pathToId.get(key) ?? null;
    },
    [categoryLookup.pathToId, normalizeCategoryValue]
  );
  const cat1 = selectedCategoryPath?.l1 || "";
  const cat2 = selectedCategoryPath?.l2 || "";
  const cat3 = selectedCategoryPath?.l3 || "";
  const applyCategorySelection = useCallback((l1: string, l2: string, l3: string) => {
    if (!l1 || (l1 === "—" && !l2 && !l3)) setSelectedCategoryPath(null);
    else setSelectedCategoryPath({ l1, l2, l3 });
  }, []);

  const getCategoryParts = useCallback(
    (categoryId: number | null): [string, string, string] => {
      if (!categoryId) return ["", "", ""];
      const parts = categoryLookup.idToPath.get(categoryId) ?? [];
      const [l1, l2, l3] = parts;
      return [l1 ?? "", l2 ?? "", l3 ?? ""];
    },
    [categoryLookup.idToPath]
  );

  const counterpartiesById = useMemo(() => new Map(counterparties.map((c) => [c.id, c])), [counterparties]);
  const getItemCounterparty = useCallback(
    (id: number | null | undefined) => {
      if (!id) return null;
      const cpId = itemsById.get(id)?.counterparty_id;
      if (!cpId) return null;
      return counterpartiesById.get(cpId) ?? null;
    },
    [itemsById, counterpartiesById]
  );
  const getCounterpartyForItemId = useCallback((id: number | null | undefined) => getItemCounterparty(id) ?? null, [getItemCounterparty]);
  const getItemDisplayBalanceCents = useCallback(
    (item: ItemOut) => {
      if (item.type_code === "bank_card" && item.card_account_id) {
        const linked = itemsById.get(item.card_account_id);
        if (linked) return getItemPrimaryValueCents(linked);
      }
      return getItemPrimaryValueCents(item);
    },
    [itemsById]
  );
  const itemBankLogoUrl = () => null;
  const itemBankName = () => "";

  const itemsForRelatedSelector = useMemo(
    () => itemsForSelector.filter((it) => it.id !== primaryItemId && it.id !== counterpartyItemId),
    [itemsForSelector, primaryItemId, counterpartyItemId]
  );

  const resetToTypeSelection = useCallback(() => {
    setFlowType(null);
    setStep(0);
    setFormError(null);
  }, []);

  const handleClose = useCallback(() => {
    onClose();
    setFlowType(null);
    setStep(0);
    setFormError(null);
  }, [onClose]);

  const handleSelectSimple = useCallback(() => {
    setFlowType("SIMPLE");
    setStep(1);
    setFormError(null);
  }, []);

  const handleSelectLoanRepayment = useCallback(() => {
    handleClose();
    onSelectLoanRepayment();
  }, [handleClose, onSelectLoanRepayment]);

  const handleSelectDebt = useCallback(() => {
    handleClose();
    onSelectDebt();
  }, [handleClose, onSelectDebt]);

  const handleSelectReceipt = useCallback(() => {
    handleClose();
    onSelectReceipt();
  }, [handleClose, onSelectReceipt]);

  const goNext = useCallback(() => {
    setFormError(null);
    if (flowType === "SIMPLE" && step < SIMPLE_WIZARD_STEPS) setStep((s) => s + 1);
  }, [flowType, step]);

  const goBack = useCallback(() => {
    setFormError(null);
    if (step > 1) setStep((s) => s - 1);
    else if (flowType === "SIMPLE" && step === 1) {
      setFlowType(null);
      setStep(0);
    }
  }, [flowType, step]);

  const canGoNext = useCallback(() => {
    if (flowType !== "SIMPLE") return true;
    switch (step) {
      case 1: {
        const cents = parseRubToCents(normalizeRubOnBlur(amountStr));
        if (isCrossCurrencyTransfer) {
          const cpCents = parseRubToCents(normalizeRubOnBlur(amountCounterpartyStr));
          return Number.isFinite(cents) && cents > 0 && Number.isFinite(cpCents) && cpCents > 0;
        }
        return Number.isFinite(cents) && cents > 0;
      }
      case 2:
        return !!date;
      case 3:
      case 4:
        return true;
      case 5:
        if (isTransfer) return !!primaryItemId && !!counterpartyItemId && primaryItemId !== counterpartyItemId;
        return !!primaryItemId;
      case 6:
        if (isTransfer) return true;
        return !!resolveCategoryId(cat1, cat2, cat3);
      case 7:
      case 8:
        return true;
      case 9:
        if (!relatedItemId) return true;
        return !!assetLinkType;
      case 10:
        if (!splitEnabled) return true;
        const totalCents = parseRubToCents(normalizeRubOnBlur(amountStr)) ?? 0;
        const partCents = (p: { amountStr: string }) => Math.max(0, parseRubToCents(normalizeRubOnBlur(p.amountStr)) ?? 0);
        const sum = splitParts.reduce((s, p) => s + partCents(p), 0);
        return sum === totalCents && splitParts.some((p) => partCents(p) > 0);
      default:
        return true;
    }
  }, [
    flowType,
    step,
    amountStr,
    amountCounterpartyStr,
    date,
    primaryItemId,
    counterpartyItemId,
    isTransfer,
    cat1,
    cat2,
    cat3,
    resolveCategoryId,
    relatedItemId,
    assetLinkType,
    splitEnabled,
    splitParts,
    isCrossCurrencyTransfer,
  ]);

  const stepTitles: Record<number, string> = {
    1: "Сумма",
    2: "Дата и время",
    3: "Характер",
    4: "Тип",
    5: "Актив",
    6: "Категория",
    7: "Контрагент",
    8: "Комментарий",
    9: "Связанный актив",
    10: "Разделение",
    11: "Подтверждение",
  };

  const handleSubmit = useCallback(async () => {
    if (flowType !== "SIMPLE" || step !== SIMPLE_WIZARD_STEPS) return;
    setFormError(null);
    const cents = parseRubToCents(normalizeRubOnBlur(amountStr));
    if (!Number.isFinite(cents) || cents <= 0) {
      setFormError("Введите корректную сумму.");
      return;
    }
    if (!primaryItemId) {
      setFormError("Выберите актив/обязательство.");
      return;
    }
    if (isTransfer && !counterpartyItemId) {
      setFormError("Выберите корреспондирующий актив.");
      return;
    }
    const resolvedCategoryId = isTransfer ? null : resolveCategoryId(cat1, cat2, cat3);
    if (!isTransfer && !resolvedCategoryId) {
      setFormError("Выберите категорию.");
      return;
    }
    const transactionDate = buildTransactionDate(date, time);
    let payloadAmount = cents;
    let payloadAmountCounterparty: number | null = isTransfer ? (parseRubToCents(normalizeRubOnBlur(amountCounterpartyStr)) ?? null) : null;
    if (isCrossCurrencyTransfer && payloadAmountCounterparty != null) {
      payloadAmount = cents;
    }
    const primaryLotsValue = primaryIsMoex ? (parseInt(primaryQuantityLots, 10) || 0) : null;
    const counterpartyLotsValue = counterpartyIsMoex ? (parseInt(counterpartyQuantityLots, 10) || 0) : null;
    const primaryUnitsValue = primaryIsCrypto ? (parseFloat(primaryQuantityUnitsStr) || null) : null;
    const counterpartyUnitsValue = counterpartyIsCrypto ? (parseFloat(counterpartyQuantityUnitsStr) || null) : null;

    const payload: TransactionCreate = {
      transaction_date: transactionDate,
      primary_item_id: primaryItemId,
      counterparty_item_id: isTransfer ? counterpartyItemId : null,
      counterparty_id: isTransfer ? null : (counterpartyId ?? null),
      amount: payloadAmount,
      amount_counterparty: payloadAmountCounterparty,
      primary_quantity_lots: primaryIsMoex ? primaryLotsValue : null,
      counterparty_quantity_lots: isTransfer && counterpartyIsMoex ? counterpartyLotsValue : null,
      primary_quantity_units: primaryIsCrypto ? primaryUnitsValue : null,
      counterparty_quantity_units: isTransfer && counterpartyIsCrypto ? counterpartyUnitsValue : null,
      direction,
      transaction_type: formTransactionType,
      category_id: resolvedCategoryId,
      comment: comment || null,
      related_item_id: isTransfer ? null : (relatedItemId ?? null),
      asset_link_type: isTransfer ? null : (assetLinkType ?? null),
    };

    const doSplit = splitEnabled && !isTransfer && splitParts.some((p) => (parseRubToCents(normalizeRubOnBlur(p.amountStr)) ?? 0) > 0);
    if (doSplit) {
      const totalCents = cents;
      const partCents = (p: { amountStr: string; categoryId: number | null }) =>
        Math.max(0, parseRubToCents(normalizeRubOnBlur(p.amountStr)) ?? 0);
      const filledSum = splitParts.reduce((s, p) => s + partCents(p), 0);
      if (filledSum !== totalCents) {
        setFormError("Сумма частей должна совпадать с суммой транзакции.");
        return;
      }
      const partsForApi: TransactionSplitPartCreate[] = splitParts
        .map((p) => ({ amount_rub: partCents(p), category_id: p.categoryId ?? undefined }))
        .filter((p) => p.amount_rub > 0);
      let remainder = totalCents - filledSum;
      if (remainder > 0) partsForApi.push({ amount_rub: remainder, category_id: undefined });
      setSubmitting(true);
      try {
        const created = await createTransaction({ ...payload, is_split_parent: true });
        await splitTransaction(created.id, { parts: partsForApi });
        handleClose();
        onCreateSuccess();
      } catch (e: unknown) {
        setFormError((e && typeof e === "object" && "message" in e ? String((e as { message: string }).message) : "Не удалось создать транзакцию."));
      } finally {
        setSubmitting(false);
      }
      return;
    }

    setSubmitting(true);
    try {
      await createTransaction(payload);
      handleClose();
      onCreateSuccess();
    } catch (e: unknown) {
      setFormError((e && typeof e === "object" && "message" in e ? String((e as { message: string }).message) : "Не удалось создать транзакцию."));
    } finally {
      setSubmitting(false);
    }
  }, [
    flowType,
    step,
    amountStr,
    amountCounterpartyStr,
    date,
    time,
    primaryItemId,
    counterpartyItemId,
    counterpartyId,
    direction,
    formTransactionType,
    cat1,
    cat2,
    cat3,
    comment,
    relatedItemId,
    assetLinkType,
    splitEnabled,
    splitParts,
    isTransfer,
    isCrossCurrencyTransfer,
    primaryIsMoex,
    counterpartyIsMoex,
    primaryIsCrypto,
    counterpartyIsCrypto,
    primaryQuantityLots,
    counterpartyQuantityLots,
    primaryQuantityUnitsStr,
    counterpartyQuantityUnitsStr,
    resolveCategoryId,
    handleClose,
    onCreateSuccess,
  ]);

  const handleNextOrSubmit = useCallback(() => {
    if (flowType !== "SIMPLE") return;
    if (step < SIMPLE_WIZARD_STEPS) {
      if (!canGoNext()) {
        if (step === 1) setFormError("Введите сумму.");
        else if (step === 2) setFormError("Укажите дату.");
        else if (step === 5) setFormError(isTransfer ? "Выберите откуда и куда." : "Выберите актив.");
        else if (step === 6 && !isTransfer) setFormError("Выберите категорию.");
        return;
      }
      goNext();
    } else {
      handleSubmit();
    }
  }, [flowType, step, canGoNext, goNext, handleSubmit, isTransfer]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Только для мобильной: при открытом визарде блокируем скролл страницы (в т.ч. iOS)
  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const scrollY = window.scrollY;
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    return () => {
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.left = "";
      document.body.style.right = "";
      window.scrollTo(0, scrollY);
    };
  }, [open]);

  if (!open) return null;

  const isTypeSelection = flowType === null && step === 0;
  const showStepIndicator = flowType === "SIMPLE" && step >= 1;
  const isLastStep = flowType === "SIMPLE" && step === SIMPLE_WIZARD_STEPS;

  const wizardContent = (
    <div
      className="fixed inset-0 flex flex-col"
      style={{
        backgroundColor: isTypeSelection ? "#191732" : MODAL_BG,
        zIndex: 100,
        minHeight: "100dvh",
        paddingTop: "env(safe-area-inset-top, 0px)",
      }}
      aria-modal
      aria-label={isTypeSelection ? "Добавить транзакцию" : `Добавить транзакцию — ${stepTitles[step] ?? ""}`}
    >
      <header className="shrink-0 flex items-center justify-end gap-2 px-3 py-2">
        <IconButton
          type="button"
          aria-label="Закрыть"
          onClick={handleClose}
          appearance="default"
        >
          <X className="size-5" strokeWidth={1.5} />
        </IconButton>
      </header>

      <div
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain px-4 pt-4 flex flex-col gap-4"
        style={{
          WebkitOverflowScrolling: "touch",
          touchAction: "pan-y",
          paddingBottom: "calc(6rem + env(safe-area-inset-bottom, 0px))",
        }}
      >
        {formError && (
          <div
            className="shrink-0 text-xs rounded-md border p-2"
            style={{
              color: "#FB4C4F",
              backgroundColor: "rgba(251, 76, 79, 0.08)",
              borderColor: "rgba(251, 76, 79, 0.3)",
            }}
          >
            {formError}
          </div>
        )}

        {isTypeSelection && (
          <div
            className="flex flex-col justify-center px-6 pb-6 flex-1 min-h-0"
            style={{ padding: "0 24px 24px", gap: 10 }}
          >
            {/* Простая транзакция — широкая кнопка с градиентом */}
            <MobileTapScale className="w-full">
              <button
                type="button"
                className="flex flex-row items-center gap-2.5 w-full rounded-[9px] transition-opacity active:opacity-90 text-left"
                style={{
                  padding: "15px 24px",
                  minHeight: 100,
                  background: "linear-gradient(264.49deg, #483BA6 -2.6%, #7F5CFF 57.34%, #7F5CFF 80.32%, #9487F3 101.93%)",
                }}
                onClick={handleSelectSimple}
              >
                <div className="flex shrink-0 items-center justify-center w-[56px] h-[56px]">
                  <ArrowLeftRight className="w-[36px] h-[36px]" style={{ color: "rgba(255, 255, 255, 0.85)" }} strokeWidth={2} />
                </div>
                <div className="flex flex-col justify-center gap-2.5 flex-1 min-w-0">
                  <span className="text-lg leading-5 font-normal" style={{ color: "rgba(255, 255, 255, 0.85)" }}>
                    Простая транзакция
                  </span>
                  <span className="text-sm leading-4 font-normal" style={{ color: "rgba(197, 191, 241, 0.6)" }}>
                    Доход / расход / перевод
                  </span>
                </div>
              </button>
            </MobileTapScale>

            {/* Погашение кредита и Долги — два блока в ряд */}
            <div className="flex flex-row items-stretch gap-2.5 w-full" style={{ gap: 10 }}>
              <MobileTapScale className="flex-1 min-w-0">
                <button
                  type="button"
                  className="flex flex-1 flex-row items-center justify-center gap-2.5 rounded-[9px] transition-opacity active:opacity-90 min-h-[100px] text-left w-full"
                  style={{
                    padding: "15px 16px",
                    background: "rgba(93, 95, 215, 0.22)",
                  }}
                  onClick={handleSelectLoanRepayment}
                >
                  <div className="flex shrink-0 items-center justify-center w-[40px] h-[40px]">
                    <Coins className="w-[26px] h-[26px]" style={{ color: "rgba(255, 255, 255, 0.85)" }} strokeWidth={1.5} />
                  </div>
                  <span className="text-base leading-[18px] font-normal flex-1" style={{ color: "rgba(255, 255, 255, 0.85)" }}>
                    Погашение кредита
                  </span>
                </button>
              </MobileTapScale>
              <MobileTapScale className="flex-1 min-w-0">
                <button
                  type="button"
                  className="flex flex-1 flex-row items-center justify-center gap-2.5 rounded-[9px] transition-opacity active:opacity-90 min-h-[100px] text-left w-full"
                  style={{
                    padding: "15px 16px",
                    background: "rgba(93, 95, 215, 0.22)",
                  }}
                  onClick={handleSelectDebt}
                >
                  <div className="flex shrink-0 items-center justify-center w-[40px] h-[40px]">
                    <HandCoins className="w-[26px] h-[26px]" style={{ color: "rgba(255, 255, 255, 0.85)" }} strokeWidth={1.5} />
                  </div>
                  <span className="text-base leading-[18px] font-normal flex-1" style={{ color: "rgba(255, 255, 255, 0.85)" }}>
                    Долги
                  </span>
                </button>
              </MobileTapScale>
            </div>

            {/* Сканировать чек — широкая кнопка с градиентом (увеличенный отступ сверху) */}
            <MobileTapScale className="w-full" style={{ marginTop: 32 }}>
              <button
                type="button"
                className="flex flex-row items-center gap-2.5 w-full rounded-[9px] transition-opacity active:opacity-90 text-left"
                style={{
                  padding: "15px 24px",
                  minHeight: 100,
                  background: BLUE_GRADIENT,
                }}
                onClick={handleSelectReceipt}
              >
                <div className="flex shrink-0 items-center justify-center w-[56px] h-[56px]">
                  <QrCode className="w-[36px] h-[36px]" style={{ color: "rgba(255, 255, 255, 0.85)" }} strokeWidth={2} />
                </div>
                <span className="text-lg leading-5 font-normal flex-1" style={{ color: "rgba(255, 255, 255, 0.85)" }}>
                  Сканировать чек
                </span>
              </button>
            </MobileTapScale>
          </div>
        )}

        {flowType === "SIMPLE" && step === 1 && (
          <div className="grid gap-4">
            <FormField label="Сумма" inlineLabel icon={<Banknote className="h-5 w-5" />}>
              <TextField
                label=""
                currencyCode={primaryCurrencyCode ?? undefined}
                value={amountStr}
                onChange={(e) => setAmountStr(formatRubInput(e.target.value))}
                onBlur={() => setAmountStr((prev) => normalizeRubOnBlur(prev))}
                inputMode="decimal"
                placeholder="Сумма"
              />
            </FormField>
            {isCrossCurrencyTransfer && (
              <FormField label="Сумма поступления" inlineLabel icon={<Banknote className="h-5 w-5" />}>
                <TextField
                  label=""
                  currencyCode={counterpartyCurrencyCode ?? undefined}
                  value={amountCounterpartyStr}
                  onChange={(e) => setAmountCounterpartyStr(formatRubInput(e.target.value))}
                  onBlur={() => setAmountCounterpartyStr((prev) => normalizeRubOnBlur(prev))}
                  inputMode="decimal"
                  placeholder="Сумма поступления"
                />
              </FormField>
            )}
          </div>
        )}

        {flowType === "SIMPLE" && step === 2 && (
          <FormField label="Дата и время" required inlineLabel icon={<Calendar className="h-5 w-5" />}>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex items-center min-h-[40px] flex-1 min-w-0">
                <AuthInput type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full" placeholder="Дата" />
              </div>
              <div className="relative flex items-center min-h-[40px] shrink-0 w-[6rem]">
                <AuthInput
                  type="text"
                  inputMode="numeric"
                  value={time}
                  onChange={(e) => setTime(formatTimeInput(e.target.value))}
                  placeholder="00:00"
                  maxLength={5}
                  autoComplete="off"
                  className="w-full"
                />
              </div>
            </div>
          </FormField>
        )}

        {flowType === "SIMPLE" && step === 3 && (
          <FormField label="Характер транзакции" inlineLabel>
            <SegmentedSelector
              options={[
                { value: "INCOME", label: "Доход", colorScheme: "green" },
                { value: "EXPENSE", label: "Расход", colorScheme: "red" },
                { value: "TRANSFER", label: "Перевод", colorScheme: "purple" },
              ]}
              value={direction}
              onChange={(v) => {
                setDirection(v as "INCOME" | "EXPENSE" | "TRANSFER");
                setCounterpartyItemId(null);
                applyCategorySelection("", "", "");
              }}
            />
          </FormField>
        )}

        {flowType === "SIMPLE" && step === 4 && (
          <FormField label="Тип" inlineLabel>
            <SegmentedSelector
              options={[
                { value: "ACTUAL", label: "Фактическая", colorScheme: "purple" },
                { value: "PLANNED", label: "Плановая", colorScheme: "orange" },
              ]}
              value={formTransactionType}
              onChange={(v) => setFormTransactionType(v as TransactionOut["transaction_type"])}
            />
          </FormField>
        )}

        {flowType === "SIMPLE" && step === 5 && (
          <div className="grid gap-4">
            {isTransfer ? (
              <>
                <FormField label="Откуда" inlineLabel icon={<Wallet className="h-5 w-5" />}>
                  <ItemSelector
                    items={primarySelectItems}
                    selectedIds={primaryItemId ? [primaryItemId] : []}
                    onChange={(ids) => setPrimaryItemId(ids[0] ?? null)}
                    selectionMode="single"
                    placeholder="Откуда"
                    getItemTypeLabel={getItemTypeLabel}
                    getItemKind={resolveItemEffectiveKind}
                    getCounterpartyForItemId={getCounterpartyForItemId}
                    apiBase={API_BASE}
                    getBankLogoUrl={itemBankLogoUrl}
                    getBankName={itemBankName}
                    getItemBalance={getItemDisplayBalanceCents}
                    itemCounts={itemTxCounts}
                    disabled={false}
                  />
                </FormField>
                <FormField label="Куда" inlineLabel icon={<Wallet className="h-5 w-5" />}>
                  <ItemSelector
                    items={counterpartySelectItems.filter((it) => it.id !== primaryItemId)}
                    selectedIds={counterpartyItemId ? [counterpartyItemId] : []}
                    onChange={(ids) => setCounterpartyItemId(ids[0] ?? null)}
                    selectionMode="single"
                    placeholder="Куда"
                    getItemTypeLabel={getItemTypeLabel}
                    getItemKind={resolveItemEffectiveKind}
                    getCounterpartyForItemId={getCounterpartyForItemId}
                    apiBase={API_BASE}
                    getBankLogoUrl={itemBankLogoUrl}
                    getBankName={itemBankName}
                    getItemBalance={getItemDisplayBalanceCents}
                    itemCounts={itemTxCounts}
                  />
                </FormField>
              </>
            ) : (
              <FormField label="Актив / обязательство" inlineLabel icon={<Wallet className="h-5 w-5" />}>
                <ItemSelector
                  items={primarySelectItems}
                  selectedIds={primaryItemId ? [primaryItemId] : []}
                  onChange={(ids) => setPrimaryItemId(ids[0] ?? null)}
                  selectionMode="single"
                  placeholder="Выберите"
                  getItemTypeLabel={getItemTypeLabel}
                  getItemKind={resolveItemEffectiveKind}
                  getCounterpartyForItemId={getCounterpartyForItemId}
                  apiBase={API_BASE}
                  getBankLogoUrl={itemBankLogoUrl}
                  getBankName={itemBankName}
                  getItemBalance={getItemDisplayBalanceCents}
                  itemCounts={itemTxCounts}
                  disabled={false}
                />
              </FormField>
            )}
            {primaryIsMoex && (
              <TextField
                label="Количество лотов"
                value={primaryQuantityLots}
                onChange={(e) => setPrimaryQuantityLots(e.target.value)}
                inputMode="numeric"
                placeholder="Например: 10"
              />
            )}
            {primaryIsCrypto && (
              <TextField
                label="Количество (единиц)"
                value={primaryQuantityUnitsStr}
                onChange={(e) => setPrimaryQuantityUnitsStr(e.target.value)}
                inputMode="decimal"
                placeholder="Например: 0.5"
              />
            )}
            {isTransfer && counterpartyIsMoex && (
              <TextField
                label="Количество лотов (куда)"
                value={counterpartyQuantityLots}
                onChange={(e) => setCounterpartyQuantityLots(e.target.value)}
                inputMode="numeric"
                placeholder="Например: 10"
              />
            )}
            {isTransfer && counterpartyIsCrypto && (
              <TextField
                label="Количество (единиц) — куда"
                value={counterpartyQuantityUnitsStr}
                onChange={(e) => setCounterpartyQuantityUnitsStr(e.target.value)}
                inputMode="decimal"
                placeholder="Например: 0.5"
              />
            )}
          </div>
        )}

        {flowType === "SIMPLE" && step === 6 && (
          <FormField label="Категория" inlineLabel icon={<Tag className="h-5 w-5" />}>
            <CategorySelector
              categoryNodes={categoryNodes}
              selectedPath={selectedCategoryPath}
              onChange={(path) => (path ? applyCategorySelection(path.l1, path.l2, path.l3) : applyCategorySelection("", "", ""))}
              placeholder="Категория"
              direction={isTransfer ? undefined : direction}
              disabled={false}
            />
          </FormField>
        )}

        {flowType === "SIMPLE" && step === 7 && (
          <FormField label="Контрагент" inlineLabel icon={<User className="h-5 w-5" />}>
            <CounterpartySelector
              counterparties={selectableCounterparties}
              selectedIds={counterpartyId ? [counterpartyId] : []}
              onChange={(ids) => setCounterpartyId(ids[0] ?? null)}
              selectionMode="single"
              placeholder="Контрагент"
              industries={industries}
              disabled={false}
              counterpartyCounts={counterpartyTxCounts}
              apiBase={API_BASE}
            />
          </FormField>
        )}

        {flowType === "SIMPLE" && step === 8 && (
          <FormField label="Комментарий" inlineLabel icon={<MessageSquare className="h-5 w-5" />}>
            <div className="relative [&_div.relative.flex.items-center]:h-10 [&_input]:text-sm">
              <AuthInput value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Комментарий" className="w-full" />
            </div>
          </FormField>
        )}

        {flowType === "SIMPLE" && step === 9 && (
          <div className="grid gap-4">
            <FormField label="Связанный актив" inlineLabel icon={<Link2 className="h-5 w-5" />}>
              <ItemSelector
                items={itemsForRelatedSelector}
                selectedIds={relatedItemId ? [relatedItemId] : []}
                onChange={(ids) => {
                  const next = ids[0] ?? null;
                  setRelatedItemId(next);
                  if (next == null) setAssetLinkType(null);
                }}
                selectionMode="single"
                placeholder="Выберите"
                getItemTypeLabel={getItemTypeLabel}
                getItemKind={resolveItemEffectiveKind}
                getCounterpartyForItemId={getCounterpartyForItemId}
                apiBase={API_BASE}
                getBankLogoUrl={itemBankLogoUrl}
                getBankName={itemBankName}
                getItemBalance={getItemDisplayBalanceCents}
                itemCounts={itemTxCounts}
                disabled={false}
              />
            </FormField>
            {relatedItemId != null && direction !== "TRANSFER" && (
              <FormField label="Тип привязки" inlineLabel icon={<Link2 className="h-5 w-5" />}>
                <SelectField
                  value={assetLinkType ?? "__none"}
                  onValueChange={(v) => setAssetLinkType(v === "__none" ? null : (v as AssetLinkType))}
                  options={[
                    { value: "__none", label: "Не выбрано" },
                    ...(direction === "EXPENSE"
                      ? [
                          { value: "ASSET_PURCHASE", label: "Приобретение актива" },
                          { value: "ASSET_INVESTMENT", label: "Вложение в актив" },
                          { value: "ASSET_EXPENSE", label: "Расход по активу" },
                        ]
                      : [
                          { value: "ASSET_SALE", label: "Продажа актива" },
                          { value: "ASSET_INCOME", label: "Доход от актива" },
                        ]),
                  ]}
                  placeholder="Тип привязки"
                />
              </FormField>
            )}
          </div>
        )}

        {flowType === "SIMPLE" && step === 10 && (
          <div className="grid gap-4">
            <p className="text-sm" style={{ color: ACTIVE_TEXT_DARK }}>
              Разделение транзакции по категориям (опционально)
            </p>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={splitEnabled}
                onChange={(e) => {
                  setSplitEnabled(e.target.checked);
                  if (e.target.checked) {
                    const totalCents = parseRubToCents(normalizeRubOnBlur(amountStr)) ?? 0;
                    if (totalCents > 0) {
                      const catId = resolveCategoryId(cat1, cat2, cat3);
                      setSplitParts([{ amountStr: formatCentsForInput(totalCents), categoryId: catId ?? null }]);
                    }
                  }
                }}
                className="rounded"
              />
              <span className="text-sm">Включить разделение</span>
            </label>
            {splitEnabled && splitParts.length > 0 && (
              <div className="space-y-3">
                {splitParts.map((part, idx) => (
                  <div key={idx} className="rounded-lg border p-3 space-y-3" style={{ borderColor: "rgba(148, 163, 184, 0.4)" }}>
                    <div className="text-sm font-medium" style={{ color: ACTIVE_TEXT_DARK }}>
                      Часть {idx + 1}
                    </div>
                    <div className="grid gap-3">
                      <TextField
                        label=""
                        currencyCode={primaryCurrencyCode ?? undefined}
                        value={part.amountStr}
                        onChange={(e) => {
                          const next = [...splitParts];
                          next[idx] = { ...next[idx], amountStr: formatRubInput(e.target.value) };
                          setSplitParts(next);
                        }}
                        onBlur={() => {
                          const next = [...splitParts];
                          next[idx] = { ...next[idx], amountStr: normalizeRubOnBlur(next[idx].amountStr) };
                          setSplitParts(next);
                        }}
                        inputMode="decimal"
                        placeholder="Сумма"
                      />
                      <CategorySelector
                        categoryNodes={categoryNodes}
                        direction={direction === "TRANSFER" ? undefined : direction}
                        selectedPath={
                          part.categoryId != null
                            ? (() => {
                                const [l1, l2, l3] = getCategoryParts(part.categoryId);
                                return { l1: l1 ?? "", l2: l2 ?? "", l3: l3 ?? "" };
                              })()
                            : null
                        }
                        onChange={(path) => {
                          const next = [...splitParts];
                          const id = path ? resolveCategoryId(path.l1, path.l2, path.l3) : null;
                          next[idx] = { ...next[idx], categoryId: id ?? null };
                          setSplitParts(next);
                        }}
                        placeholder="Категория"
                      />
                    </div>
                    {splitParts.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setSplitParts((prev) => prev.filter((_, i) => i !== idx))}
                      >
                        Удалить часть
                      </Button>
                    )}
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const formTotalCents = parseRubToCents(normalizeRubOnBlur(amountStr)) ?? 0;
                    const partC = (p: { amountStr: string }) => Math.max(0, parseRubToCents(normalizeRubOnBlur(p.amountStr)) ?? 0);
                    const filledSum = splitParts.reduce((s, p) => s + partC(p), 0);
                    const remainder = Math.max(0, formTotalCents - filledSum);
                    const parentCat = resolveCategoryId(cat1, cat2, cat3);
                    setSplitParts([...splitParts, { amountStr: formatCentsForInput(remainder), categoryId: parentCat ?? null }]);
                  }}
                >
                  Добавить часть
                </Button>
              </div>
            )}
          </div>
        )}

        {flowType === "SIMPLE" && step === 11 && (
          <div className="grid gap-3 text-sm">
            <p className="font-medium" style={{ color: ACTIVE_TEXT_DARK }}>
              Проверьте данные
            </p>
            <div className="rounded-lg border border-sidebar-border p-3 space-y-2" style={{ color: PLACEHOLDER_COLOR_DARK }}>
              <p>Сумма: {primaryCurrencyCode ? `${primaryCurrencyCode} ` : ""}{amountStr || "—"}</p>
              <p>Дата: {date || "—"} {time ? ` ${time}` : ""}</p>
              <p>Направление: {direction === "INCOME" ? "Доход" : direction === "EXPENSE" ? "Расход" : "Перевод"}</p>
              <p>Тип: {formTransactionType === "ACTUAL" ? "Фактическая" : "Плановая"}</p>
              <p>Актив: {primaryItemId ? itemsById.get(primaryItemId)?.name ?? primaryItemId : "—"}</p>
              {isTransfer && <p>Куда: {counterpartyItemId ? itemsById.get(counterpartyItemId)?.name ?? counterpartyItemId : "—"}</p>}
              {!isTransfer && <p>Категория: {resolveCategoryId(cat1, cat2, cat3) ? [cat1, cat2, cat3].filter(Boolean).join(" / ") || "—" : "—"}</p>}
              <p>Контрагент: {counterpartyId ? counterpartiesById.get(counterpartyId)?.name ?? counterpartyId : "—"}</p>
              {comment && <p>Комментарий: {comment}</p>}
              {relatedItemId && <p>Связанный актив: {itemsById.get(relatedItemId)?.name ?? relatedItemId}</p>}
              {splitEnabled && <p>Разделение: по частям</p>}
            </div>
          </div>
        )}
      </div>

      {/* Bottom bar: step indicator + buttons (не показываем на экране выбора типа) */}
      {!isTypeSelection && (
      <div
        className="shrink-0 flex flex-col gap-3 px-4 pt-3 pb-[max(env(safe-area-inset-bottom), 12px)]"
        style={{ backgroundColor: MODAL_BG }}
      >
        {showStepIndicator && (
          <WizardStepIndicator
            totalSteps={SIMPLE_WIZARD_STEPS}
            currentStep={step}
            aria-label={`Шаг ${step} из ${SIMPLE_WIZARD_STEPS}`}
          />
        )}
        <div className="flex items-center gap-2">
          {flowType === "SIMPLE" && step >= 1 && !isLastStep && (
            <Button type="button" variant="glass" className="rounded-lg shrink-0" onClick={goBack} style={{ "--glass-bg": "rgba(108, 93, 215, 0.22)", "--glass-bg-hover": "rgba(108, 93, 215, 0.4)" } as React.CSSProperties}>
              Назад
            </Button>
          )}
          <Button
              type="button"
              variant="authPrimary"
              disabled={submitting || (step < SIMPLE_WIZARD_STEPS && !canGoNext())}
              className="flex-1 rounded-lg border-0 text-sm"
              onClick={isLastStep ? handleSubmit : handleNextOrSubmit}
              style={{ "--auth-primary-bg": "linear-gradient(135deg, #483BA6 0%, #6C5DD7 57%, #9487F3 100%)", "--auth-primary-bg-hover": "linear-gradient(315deg, #9487F3 0%, #6C5DD7 79%, #483BA6 100%)" } as React.CSSProperties}
            >
              {isLastStep ? (submitting ? "Создание…" : "Создать") : "Далее"}
            </Button>
        </div>
      </div>
      )}
    </div>
  );

  if (!mounted || typeof document === "undefined") return null;
  return createPortal(wizardContent, document.body);
}
