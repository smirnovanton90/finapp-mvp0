"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronDown, ArrowLeftRight, ArrowRight, Building2, Coins, HandCoins, Receipt, QrCode, Banknote, Calendar, Wallet, Tag, User, MessageSquare, Link2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { MODAL_BG, ACTIVE_TEXT_DARK, PLACEHOLDER_COLOR_DARK, GREEN, GREEN_TRANSACTION, RED, ACCENT2, ACCENT, BACKGROUND_DT } from "@/lib/colors";
import { MobileTapScale } from "@/components/mobile-tap-scale";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { FormField, TextField, DateField, SelectField } from "@/components/ui/form-field";
import { AuthInput } from "@/components/ui/auth-input";
import { SegmentedSelector } from "@/components/ui/segmented-selector";
import { ItemSelector } from "@/components/item-selector";
import { CounterpartySelector } from "@/components/counterparty-selector";
import { CategorySelector } from "@/components/category-selector";
import { CurrencyChip } from "@/components/currency-chip";
import { CardIcon } from "@/components/card-icon";
import { AssetItemIcon } from "@/components/asset-item-icon";
import { buildCategoryLookup, makeCategoryPathKey } from "@/lib/categories";
import { useCategoryImage } from "@/hooks/use-category-icon";
import { useCounterpartyImage } from "@/hooks/use-counterparty-image";
import { transferIconPath } from "@/lib/image-paths";
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

function buildCounterpartyName(cp: CounterpartyOut) {
  if (cp.entity_type !== "PERSON") return cp.name;
  const parts = [cp.last_name, cp.first_name, cp.middle_name].filter(Boolean);
  return parts.join(" ") || cp.name;
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

  const prevOpenRef = React.useRef(false);
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setFlowType(null);
      setStep(0);
      setFormError(null);
      setAmountStr("");
      setAmountCounterpartyStr("");
      setDate(new Date().toISOString().slice(0, 10));
      setTime("");
      setDirection("EXPENSE");
      setFormTransactionType("ACTUAL");
      setPrimaryItemId(null);
      setCounterpartyItemId(null);
      setCounterpartyId(null);
      setSelectedCategoryPath(null);
      setComment("");
      setRelatedItemId(null);
      setAssetLinkType(null);
      setSplitEnabled(false);
      setSplitParts([]);
      setPrimaryQuantityLots("");
      setCounterpartyQuantityLots("");
      setPrimaryQuantityUnitsStr("");
      setCounterpartyQuantityUnitsStr("");
    }
    prevOpenRef.current = open;
  }, [open]);

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

  const previewCategoryId = resolveCategoryId(cat1, cat2, cat3);
  const previewCounterparty = counterpartyId != null ? counterpartiesById.get(counterpartyId) ?? null : null;
  const {
    imageSrc: categoryImageSrc,
    onError: categoryImageOnError,
    showFallbackIcon: categoryShowFallbackIcon,
    CategoryIcon: CategoryIconFallback,
    setCategoryIconFormat,
  } = useCategoryImage(previewCategoryId, categoryLookup, API_BASE);
  const {
    currentSrc: counterpartyLogoUrl,
    onError: counterpartyLogoOnError,
    showFallbackIcon: counterpartyShowFallbackIcon,
  } = useCounterpartyImage(previewCounterparty, API_BASE);
  const [transferIconFormat, setTransferIconFormat] = useState<"png" | null>("png");
  const transferIcon3dPath = transferIconPath(transferIconFormat);

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
    onSelectReceipt();
  }, [onSelectReceipt]);

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
      case 1:
      case 2:
      case 3:
        return true;
      case 4:
        if (isTransfer) return !!primaryItemId && !!counterpartyItemId && primaryItemId !== counterpartyItemId;
        return !!primaryItemId;
      case 5: {
        const cents = parseRubToCents(normalizeRubOnBlur(amountStr));
        if (isCrossCurrencyTransfer) {
          const cpCents = parseRubToCents(normalizeRubOnBlur(amountCounterpartyStr));
          return Number.isFinite(cents) && cents > 0 && Number.isFinite(cpCents) && cpCents > 0;
        }
        return Number.isFinite(cents) && cents > 0;
      }
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
    1: "Тип транзакции",
    2: "Направление",
    3: "Дата и время",
    4: "Актив",
    5: "Сумма",
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
        if (step === 4) setFormError(isTransfer ? "Выберите откуда и куда." : "Выберите актив.");
        else if (step === 5) setFormError("Введите сумму.");
        else if (step === 6 && !isTransfer) setFormError("Выберите категорию.");
        return;
      }
      goNext();
    } else {
      handleSubmit();
    }
  }, [flowType, step, canGoNext, goNext, handleSubmit, isTransfer]);

  const tryAutoAdvance = useCallback(() => {
    setTimeout(() => {
      if (flowType === "SIMPLE" && step < SIMPLE_WIZARD_STEPS && canGoNext()) goNext();
    }, 0);
  }, [flowType, step, canGoNext, goNext]);

  const tryAutoAdvanceRef = React.useRef(tryAutoAdvance);
  tryAutoAdvanceRef.current = tryAutoAdvance;

  const handleAdvanceFromStep = useCallback(() => {
    setFormError(null);
    if (!canGoNext()) {
      if (step === 4) setFormError(isTransfer ? "Выберите откуда и куда." : "Выберите актив.");
      else if (step === 5) setFormError("Введите сумму.");
      else if (step === 6 && !isTransfer) setFormError("Выберите категорию.");
      return;
    }
    goNext();
  }, [step, canGoNext, goNext, isTransfer]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const stepRefs = React.useRef<(HTMLDivElement | null)[]>([]);
  const prevStepRef = React.useRef(0);
  useEffect(() => {
    if (flowType !== "SIMPLE" || step < 1) return;
    if (step > prevStepRef.current) {
      const el = stepRefs.current[step - 1];
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    prevStepRef.current = step;
  }, [flowType, step]);

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

  const [typeSelectionRevealed, setTypeSelectionRevealed] = useState(false);
  useEffect(() => {
    if (open && flowType === null && step === 0) {
      const t = requestAnimationFrame(() => setTypeSelectionRevealed(true));
      return () => cancelAnimationFrame(t);
    }
    setTypeSelectionRevealed(false);
  }, [open, flowType, step]);

  if (!open) return null;

  const isTypeSelection = flowType === null && step === 0;

  const wizardContent = (
    <div
      className="fixed inset-0 flex flex-col"
      style={{
        backgroundColor: isTypeSelection ? ACCENT : MODAL_BG,
        zIndex: 100,
        minHeight: "100dvh",
        paddingTop: "env(safe-area-inset-top, 0px)",
      }}
      aria-modal
      aria-label={isTypeSelection ? "Добавить транзакцию" : `Добавить транзакцию — ${stepTitles[step] ?? ""}`}
    >
      <header className="shrink-0 flex items-center justify-between gap-2 px-3 py-2">
        {!isTypeSelection ? (
          <div className="flex items-center gap-2 min-w-0" style={{ color: ACTIVE_TEXT_DARK }}>
            <ArrowLeftRight className="h-5 w-5 shrink-0" strokeWidth={1.5} />
            <span className="text-base font-medium truncate">Новая транзакция</span>
          </div>
        ) : (
          <span />
        )}
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
        className={cn(
          "flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain px-4 pt-4 flex flex-col gap-8",
          flowType === "SIMPLE" && "[&_input]:text-base [&_input::placeholder]:text-base [&_button]:text-base"
        )}
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
            className="flex flex-col justify-center px-6 pb-6 flex-1 min-h-0 transition-opacity duration-200 ease-out"
            style={{ padding: "0 24px 24px", gap: 10, opacity: typeSelectionRevealed ? 1 : 0 }}
          >
            {/* Простая транзакция — широкая кнопка с заливкой BACKGROUND_DT */}
            <MobileTapScale className="w-full">
              <button
                type="button"
                className="flex flex-row items-center gap-2.5 w-full rounded-[9px] transition-opacity active:opacity-90 text-left"
                style={{
                  padding: "15px 24px",
                  minHeight: 100,
                  backgroundColor: BACKGROUND_DT,
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
                    backgroundColor: MODAL_BG,
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
                    backgroundColor: MODAL_BG,
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

            {/* Сканировать чек — широкая кнопка с заливкой BACKGROUND_DT (увеличенный отступ сверху) */}
            <MobileTapScale className="w-full" style={{ marginTop: 32 }}>
              <button
                type="button"
                className="flex flex-row items-center gap-2.5 w-full rounded-[9px] transition-opacity active:opacity-90 text-left"
                style={{
                  padding: "15px 24px",
                  minHeight: 100,
                  backgroundColor: BACKGROUND_DT,
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

        {flowType === "SIMPLE" && step >= 1 && (
          <div ref={(el) => { stepRefs.current[0] = el; }} className="wizard-step-enter">
            <p className="text-base font-medium mb-3 flex items-center gap-2" style={{ color: ACTIVE_TEXT_DARK }}>Какую транзакцию хотите добавить?</p>
            <FormField label="" inlineLabel>
              <MobileTapScale className="block w-full">
                <SegmentedSelector
                  options={[
                    { value: "ACTUAL", label: "Фактическая", colorScheme: "purple" },
                    { value: "PLANNED", label: "Плановая", colorScheme: "orange" },
                  ]}
                value={formTransactionType}
                onChange={(v) => {
                  setFormTransactionType(v as TransactionOut["transaction_type"]);
                  if (step === 1) tryAutoAdvanceRef.current();
                }}
              />
              </MobileTapScale>
            </FormField>
            {step === 1 && (
              <div className="flex justify-center pt-6 pb-2">
                <IconButton type="button" aria-label="Следующий шаг" onClick={handleAdvanceFromStep}>
                  <ChevronDown className="size-5" />
                </IconButton>
              </div>
            )}
          </div>
        )}

        {flowType === "SIMPLE" && step >= 2 && (
          <div ref={(el) => { stepRefs.current[1] = el; }} className="wizard-step-enter">
            <p className="text-base font-medium mb-3 flex items-center gap-2" style={{ color: ACTIVE_TEXT_DARK }}>Это доход, расход или перевод?</p>
            <FormField label="" inlineLabel>
              <MobileTapScale className="block w-full">
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
                  if (step === 2) tryAutoAdvanceRef.current();
                }}
              />
              </MobileTapScale>
            </FormField>
            {step === 2 && (
              <div className="flex justify-center pt-6 pb-2">
                <IconButton type="button" aria-label="Следующий шаг" onClick={handleAdvanceFromStep}>
                  <ChevronDown className="size-5" />
                </IconButton>
              </div>
            )}
          </div>
        )}

        {flowType === "SIMPLE" && step >= 3 && (
          <div ref={(el) => { stepRefs.current[2] = el; }} className="wizard-step-enter">
            <p className="text-base font-medium mb-3 flex items-center gap-2" style={{ color: ACTIVE_TEXT_DARK }}>
              <Calendar className="h-5 w-5 shrink-0" />
              Выберите дату и время (по желанию)
            </p>
            <FormField label="" inlineLabel>
              <MobileTapScale className="block w-full">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative flex items-center min-h-[40px] flex-1 min-w-0">
                  <AuthInput
                    type="date"
                    value={date}
                    onChange={(e) => {
                      setDate(e.target.value);
                      if (step === 3) tryAutoAdvanceRef.current();
                    }}
                    onBlur={() => { if (step === 3) tryAutoAdvanceRef.current(); }}
                    className="w-full"
                    placeholder="Дата"
                  />
                </div>
                <div className="relative flex items-center min-h-[40px] shrink-0 w-[6rem]">
                  <AuthInput
                    type="text"
                    inputMode="numeric"
                    value={time}
                    onChange={(e) => setTime(formatTimeInput(e.target.value))}
                    onBlur={() => { if (step === 3) tryAutoAdvanceRef.current(); }}
                    placeholder="00:00"
                    maxLength={5}
                    autoComplete="off"
                    className="w-full"
                  />
                </div>
              </div>
              </MobileTapScale>
            </FormField>
            {step === 3 && (
              <div className="flex justify-center pt-6 pb-2">
                <IconButton type="button" aria-label="Следующий шаг" onClick={handleAdvanceFromStep}>
                  <ChevronDown className="size-5" />
                </IconButton>
              </div>
            )}
          </div>
        )}

        {flowType === "SIMPLE" && step >= 4 && (
          <div ref={(el) => { stepRefs.current[3] = el; }} className="wizard-step-enter">
            <p className="text-base font-medium mb-3 flex items-center gap-2" style={{ color: ACTIVE_TEXT_DARK }}>
              <Wallet className="h-5 w-5 shrink-0" />
              {isTransfer ? "Откуда и куда" : "Актив / обязательство"}
            </p>
          <div className="grid gap-4">
            {isTransfer ? (
              <>
                <FormField label="Откуда" inlineLabel>
                  <MobileTapScale className="block w-full">
                  <ItemSelector
                    items={primarySelectItems}
                    selectedIds={primaryItemId ? [primaryItemId] : []}
                    onChange={(ids) => {
                      setPrimaryItemId(ids[0] ?? null);
                      if (step === 4) tryAutoAdvanceRef.current();
                    }}
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
                  </MobileTapScale>
                </FormField>
                <FormField label="Куда" inlineLabel>
                  <MobileTapScale className="block w-full">
                  <ItemSelector
                    items={counterpartySelectItems.filter((it) => it.id !== primaryItemId)}
                    selectedIds={counterpartyItemId ? [counterpartyItemId] : []}
                    onChange={(ids) => {
                      setCounterpartyItemId(ids[0] ?? null);
                      if (step === 4) tryAutoAdvanceRef.current();
                    }}
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
                  </MobileTapScale>
                </FormField>
              </>
            ) : (
              <FormField label="" inlineLabel>
                <MobileTapScale className="block w-full">
                <ItemSelector
                  items={primarySelectItems}
                  selectedIds={primaryItemId ? [primaryItemId] : []}
                  onChange={(ids) => {
                    setPrimaryItemId(ids[0] ?? null);
                    if (step === 4) tryAutoAdvanceRef.current();
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
                </MobileTapScale>
              </FormField>
            )}
            {primaryIsMoex && (
              <MobileTapScale className="block w-full">
                <TextField
                  label="Количество лотов"
                  value={primaryQuantityLots}
                  onChange={(e) => setPrimaryQuantityLots(e.target.value)}
                  inputMode="numeric"
                  placeholder="Например: 10"
                />
              </MobileTapScale>
            )}
            {primaryIsCrypto && (
              <MobileTapScale className="block w-full">
                <TextField
                  label="Количество (единиц)"
                  value={primaryQuantityUnitsStr}
                  onChange={(e) => setPrimaryQuantityUnitsStr(e.target.value)}
                  inputMode="decimal"
                  placeholder="Например: 0.5"
                />
              </MobileTapScale>
            )}
            {isTransfer && counterpartyIsMoex && (
              <MobileTapScale className="block w-full">
                <TextField
                  label="Количество лотов (куда)"
                  value={counterpartyQuantityLots}
                  onChange={(e) => setCounterpartyQuantityLots(e.target.value)}
                  inputMode="numeric"
                  placeholder="Например: 10"
                />
              </MobileTapScale>
            )}
            {isTransfer && counterpartyIsCrypto && (
              <MobileTapScale className="block w-full">
                <TextField
                  label="Количество (единиц) — куда"
                  value={counterpartyQuantityUnitsStr}
                  onChange={(e) => setCounterpartyQuantityUnitsStr(e.target.value)}
                  inputMode="decimal"
                  placeholder="Например: 0.5"
                />
              </MobileTapScale>
            )}
          </div>
            {step === 4 && (
              <div className="flex justify-center pt-6 pb-2">
                <IconButton type="button" aria-label="Следующий шаг" onClick={handleAdvanceFromStep}>
                  <ChevronDown className="size-5" />
                </IconButton>
              </div>
            )}
          </div>
        )}

        {flowType === "SIMPLE" && step >= 5 && (
          <div ref={(el) => { stepRefs.current[4] = el; }} className="wizard-step-enter">
            <p className="text-base font-medium mb-3 flex items-center gap-2" style={{ color: ACTIVE_TEXT_DARK }}>
              <Banknote className="h-5 w-5 shrink-0" />
              Сумма
            </p>
            <div className="grid gap-4">
              <FormField label="" inlineLabel>
                <MobileTapScale className="block w-full">
                <div className="relative [&_input]:!text-base">
                  <TextField
                    label=""
                    currencyCode={primaryCurrencyCode ?? undefined}
                    value={amountStr}
                    onChange={(e) => setAmountStr(formatRubInput(e.target.value))}
                    onBlur={() => {
                      setAmountStr((prev) => normalizeRubOnBlur(prev));
                      if (step === 5) tryAutoAdvanceRef.current();
                    }}
                    inputMode="decimal"
                    placeholder="Сумма"
                    className={amountStr ? "pr-10" : undefined}
                  />
                  {amountStr && (
                    <button
                      type="button"
                      onClick={() => setAmountStr("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 flex h-7 w-7 shrink-0 items-center justify-center rounded-md touch-manipulation"
                      style={{ color: PLACEHOLDER_COLOR_DARK }}
                      aria-label="Очистить поле"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                </MobileTapScale>
              </FormField>
              {isCrossCurrencyTransfer && (
                <FormField label="Сумма поступления" inlineLabel>
                  <MobileTapScale className="block w-full">
                  <div className="relative [&_input]:!text-base">
                    <TextField
                      label=""
                      currencyCode={counterpartyCurrencyCode ?? undefined}
                      value={amountCounterpartyStr}
                      onChange={(e) => setAmountCounterpartyStr(formatRubInput(e.target.value))}
                      onBlur={() => {
                        setAmountCounterpartyStr((prev) => normalizeRubOnBlur(prev));
                        if (step === 5) tryAutoAdvanceRef.current();
                      }}
                      inputMode="decimal"
                      placeholder="Сумма поступления"
                      className={amountCounterpartyStr ? "pr-10" : undefined}
                    />
                    {amountCounterpartyStr && (
                      <button
                        type="button"
                        onClick={() => setAmountCounterpartyStr("")}
                        className="absolute right-2 top-1/2 -translate-y-1/2 flex h-7 w-7 shrink-0 items-center justify-center rounded-md touch-manipulation"
                        style={{ color: PLACEHOLDER_COLOR_DARK }}
                        aria-label="Очистить поле"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  </MobileTapScale>
                </FormField>
              )}
            </div>
            {step === 5 && (
              <div className="flex justify-center pt-6 pb-2">
                <IconButton type="button" aria-label="Следующий шаг" onClick={handleAdvanceFromStep}>
                  <ChevronDown className="size-5" />
                </IconButton>
              </div>
            )}
          </div>
        )}

        {flowType === "SIMPLE" && step >= 6 && (
          <div ref={(el) => { stepRefs.current[5] = el; }} className="wizard-step-enter">
            <p className="text-base font-medium mb-3 flex items-center gap-2" style={{ color: ACTIVE_TEXT_DARK }}>
              <Tag className="h-5 w-5 shrink-0" />
              Категория
            </p>
          <FormField label="" inlineLabel>
            <MobileTapScale className="block w-full">
            <CategorySelector
              categoryNodes={categoryNodes}
              selectedPath={selectedCategoryPath}
              onChange={(path) => {
                path ? applyCategorySelection(path.l1, path.l2, path.l3) : applyCategorySelection("", "", "");
                if (step === 6) tryAutoAdvanceRef.current();
              }}
              placeholder="Категория"
              direction={isTransfer ? undefined : direction}
              disabled={false}
            />
            </MobileTapScale>
          </FormField>
            {step === 6 && (
              <div className="flex justify-center pt-6 pb-2">
                <IconButton type="button" aria-label="Следующий шаг" onClick={handleAdvanceFromStep}>
                  <ChevronDown className="size-5" />
                </IconButton>
              </div>
            )}
          </div>
        )}

        {flowType === "SIMPLE" && step >= 7 && (
          <div ref={(el) => { stepRefs.current[6] = el; }} className="wizard-step-enter">
            <p className="text-base font-medium mb-3 flex items-center gap-2" style={{ color: ACTIVE_TEXT_DARK }}>
              <User className="h-5 w-5 shrink-0" />
              Контрагент
            </p>
          <FormField label="" inlineLabel>
            <MobileTapScale className="block w-full">
            <CounterpartySelector
              counterparties={selectableCounterparties}
              selectedIds={counterpartyId ? [counterpartyId] : []}
              onChange={(ids) => {
                setCounterpartyId(ids[0] ?? null);
                if (step === 7) tryAutoAdvanceRef.current();
              }}
              selectionMode="single"
              placeholder="Контрагент"
              industries={industries}
              disabled={false}
              counterpartyCounts={counterpartyTxCounts}
              apiBase={API_BASE}
            />
            </MobileTapScale>
          </FormField>
            {step === 7 && (
              <div className="flex justify-center pt-6 pb-2">
                <IconButton type="button" aria-label="Следующий шаг" onClick={handleAdvanceFromStep}>
                  <ChevronDown className="size-5" />
                </IconButton>
              </div>
            )}
          </div>
        )}

        {flowType === "SIMPLE" && step >= 8 && (
          <div ref={(el) => { stepRefs.current[7] = el; }} className="wizard-step-enter">
            <p className="text-base font-medium mb-3 flex items-center gap-2" style={{ color: ACTIVE_TEXT_DARK }}>
              <MessageSquare className="h-5 w-5 shrink-0" />
              Комментарий
            </p>
          <FormField label="" inlineLabel>
            <MobileTapScale className="block w-full">
            <div className="relative [&_div.relative.flex.items-center]:h-10">
              <AuthInput
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                onBlur={() => { if (step === 8) tryAutoAdvanceRef.current(); }}
                placeholder="Комментарий"
                className="w-full text-base"
              />
            </div>
            </MobileTapScale>
          </FormField>
            {step === 8 && (
              <div className="flex justify-center pt-6 pb-2">
                <IconButton type="button" aria-label="Следующий шаг" onClick={handleAdvanceFromStep}>
                  <ChevronDown className="size-5" />
                </IconButton>
              </div>
            )}
          </div>
        )}

        {flowType === "SIMPLE" && step >= 9 && (
          <div ref={(el) => { stepRefs.current[8] = el; }} className="wizard-step-enter">
            <p className="text-base font-medium mb-3 flex items-center gap-2" style={{ color: ACTIVE_TEXT_DARK }}>
              <Link2 className="h-5 w-5 shrink-0" />
              Связанный актив
            </p>
          <div className="grid gap-4">
            <FormField label="" inlineLabel>
              <MobileTapScale className="block w-full">
              <ItemSelector
                items={itemsForRelatedSelector}
                selectedIds={relatedItemId ? [relatedItemId] : []}
                onChange={(ids) => {
                  const next = ids[0] ?? null;
                  setRelatedItemId(next);
                  if (next == null) setAssetLinkType(null);
                  if (step === 9) tryAutoAdvanceRef.current();
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
              </MobileTapScale>
            </FormField>
            {relatedItemId != null && direction !== "TRANSFER" && (
              <FormField label="Тип привязки" inlineLabel>
                <MobileTapScale className="block w-full">
                <SelectField
                  value={assetLinkType ?? "__none"}
                  onValueChange={(v) => {
                    setAssetLinkType(v === "__none" ? null : (v as AssetLinkType));
                    if (step === 9) tryAutoAdvanceRef.current();
                  }}
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
                </MobileTapScale>
              </FormField>
            )}
          </div>
            {step === 9 && (
              <div className="flex justify-center pt-6 pb-2">
                <IconButton type="button" aria-label="Следующий шаг" onClick={handleAdvanceFromStep}>
                  <ChevronDown className="size-5" />
                </IconButton>
              </div>
            )}
          </div>
        )}

        {flowType === "SIMPLE" && step >= 10 && (
          <div ref={(el) => { stepRefs.current[9] = el; }} className="wizard-step-enter">
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
                      <MobileTapScale className="block w-full">
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
                      </MobileTapScale>
                      <MobileTapScale className="block w-full">
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
                      </MobileTapScale>
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
            {step === 10 && (
              <div className="flex justify-center pt-6 pb-2">
                <IconButton type="button" aria-label="Следующий шаг" onClick={handleAdvanceFromStep}>
                  <ChevronDown className="size-5" />
                </IconButton>
              </div>
            )}
          </div>
        )}

        {flowType === "SIMPLE" && step >= 11 && (
          <div ref={(el) => { stepRefs.current[10] = el; }} className="wizard-step-enter">
          <div className="flex flex-col gap-4">
            <p className="font-medium text-sm" style={{ color: ACTIVE_TEXT_DARK }}>
              Так транзакция будет отображаться в списке
            </p>
            {(() => {
              const primaryAmountCents = Math.max(0, parseRubToCents(normalizeRubOnBlur(amountStr)) ?? 0);
              const counterpartyAmountCents = isCrossCurrencyTransfer
                ? Math.max(0, parseRubToCents(normalizeRubOnBlur(amountCounterpartyStr)) ?? 0)
                : primaryAmountCents;
              const currencyCode = primaryCurrencyCode ?? "RUB";
              const rightCurrencyCode = counterpartyCurrencyCode ?? currencyCode;
              const visibleCat = [cat1?.trim(), cat2?.trim(), cat3?.trim()].map((s) => (s && s !== "—" ? s : null));
              const lastCatIndex = visibleCat[2] ? 2 : visibleCat[1] ? 1 : visibleCat[0] ? 0 : -1;
              const displayCategoryLabel = lastCatIndex >= 0 ? visibleCat[lastCatIndex]! : (isTransfer ? "Перевод" : "—");
              const textColor = ACTIVE_TEXT_DARK;
              const isIncome = direction === "INCOME";
              const row1HighlightColor = isIncome ? GREEN_TRANSACTION : isTransfer ? ACCENT2 : RED;
              const row1Bg = MODAL_BG;
              const amountColor = isTransfer ? RED : isIncome ? GREEN : RED;
              const rightAmountColor = isTransfer ? GREEN : textColor;
              const accountName = primaryItemId ? itemsById.get(primaryItemId)?.name ?? "—" : "—";
              const accountToName = counterpartyItemId ? itemsById.get(counterpartyItemId)?.name ?? "—" : "—";
              const counterpartyName = previewCounterparty ? buildCounterpartyName(previewCounterparty) : "—";
              const commentText = comment?.trim() || null;
              const primaryItem = primaryItemId ? itemsById.get(primaryItemId) ?? null : null;
              const counterpartyItem = counterpartyItemId ? itemsById.get(counterpartyItemId) ?? null : null;
              const primaryCounterparty = getItemCounterparty(primaryItemId);
              const counterpartyItemCounterparty = getItemCounterparty(counterpartyItemId);
              const CounterpartyFallbackIcon = previewCounterparty?.entity_type === "PERSON" ? User : Building2;
              return (
                <div className="flex flex-col gap-0 rounded-lg overflow-hidden min-w-0 w-full border border-border">
                  <div className="flex items-stretch rounded-lg min-w-0 w-full">
                    <div
                      className="shrink-0 rounded-l-lg"
                      style={{
                        width: 10,
                        backgroundColor: row1HighlightColor,
                        boxShadow: `0 0 250px 50px ${row1HighlightColor}`,
                      }}
                    />
                    <div
                      className="flex items-center justify-between gap-2 flex-1 min-w-0 rounded-r-lg"
                      style={{ padding: "10px 12px", backgroundColor: row1Bg }}
                    >
                      {isTransfer ? (
                        <>
                          <div className="flex items-center gap-2 min-w-0">
                            <CurrencyChip code={currencyCode} className="text-sm" />
                            <span className="tabular-nums truncate" style={{ fontSize: 20, fontWeight: 600, color: amountColor }}>
                              −{formatAmount(primaryAmountCents)}
                            </span>
                          </div>
                          <div className="shrink-0" style={{ width: 28, height: 28 }}>
                            <CardIcon
                              src={transferIcon3dPath}
                              alt=""
                              size={28}
                              shadow
                              fallbackIcon={ArrowRight}
                              fallbackIconColor={ACCENT2}
                              onError={() => setTransferIconFormat(null)}
                            />
                          </div>
                          <div className="flex items-center gap-2 min-w-0 justify-end">
                            <CurrencyChip code={rightCurrencyCode} className="text-sm" />
                            <span className="tabular-nums truncate" style={{ fontSize: 20, fontWeight: 600, color: rightAmountColor }}>
                              +{formatAmount(counterpartyAmountCents)}
                            </span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex items-center gap-2 min-w-0 shrink-0">
                            <div className="shrink-0" style={{ width: 28, height: 28 }}>
                              {categoryImageSrc && !categoryShowFallbackIcon ? (
                                <CardIcon
                                  src={categoryImageSrc}
                                  alt=""
                                  size={28}
                                  shadow
                                  fallbackIcon={CategoryIconFallback}
                                  fallbackIconColor={ACCENT2}
                                  onError={() => { categoryImageOnError(); setCategoryIconFormat(null); }}
                                />
                              ) : (
                                <div className="flex items-center justify-center w-full h-full">
                                  <CategoryIconFallback strokeWidth={1.5} style={{ width: 24, height: 24, color: ACCENT2 }} />
                                </div>
                              )}
                            </div>
                            <span className="truncate text-sm font-medium" style={{ color: textColor }}>
                              {displayCategoryLabel}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 min-w-0 justify-end">
                            <CurrencyChip code={currencyCode} className="text-sm" />
                            <span className="tabular-nums truncate" style={{ fontSize: 20, fontWeight: 600, color: amountColor }}>
                              {isIncome ? "+" : "−"}
                              {formatAmount(primaryAmountCents)}
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                  <div
                    className="flex items-center justify-between gap-3 flex-wrap"
                    style={{ padding: "8px 12px", paddingBottom: commentText ? 6 : 10, backgroundColor: row1Bg }}
                  >
                    <div className="flex items-center gap-2 min-w-0 max-w-[50%]">
                      <div className="shrink-0 flex items-center justify-center" style={{ width: 24, height: 24 }}>
                        {primaryItem ? (
                          <AssetItemIcon
                            item={primaryItem}
                            counterparty={primaryCounterparty}
                            apiBase={API_BASE}
                            size={20}
                            fallbackIconColor={PLACEHOLDER_COLOR_DARK}
                            alt=""
                          />
                        ) : (
                          <Wallet className="h-5 w-5" style={{ color: PLACEHOLDER_COLOR_DARK }} />
                        )}
                      </div>
                      <span className="truncate text-sm" style={{ color: textColor }}>{accountName}</span>
                    </div>
                    <div className="flex items-center gap-2 min-w-0 max-w-[50%]">
                      {isTransfer ? (
                        <>
                          <span className="shrink-0 flex items-center justify-center" style={{ width: 24, height: 24 }}>
                            {counterpartyItem ? (
                              <AssetItemIcon
                                item={counterpartyItem}
                                counterparty={counterpartyItemCounterparty}
                                apiBase={API_BASE}
                                size={20}
                                fallbackIconColor={PLACEHOLDER_COLOR_DARK}
                                alt=""
                              />
                            ) : (
                              <Wallet className="h-5 w-5" style={{ color: PLACEHOLDER_COLOR_DARK }} />
                            )}
                          </span>
                          <span className="truncate text-sm" style={{ color: textColor }}>{accountToName}</span>
                        </>
                      ) : (
                        <>
                          <span className="shrink-0 flex items-center justify-center" style={{ width: 24, height: 24 }}>
                            {previewCounterparty ? (
                              counterpartyLogoUrl && !counterpartyShowFallbackIcon ? (
                                <CardIcon
                                  src={counterpartyLogoUrl}
                                  alt=""
                                  size={20}
                                  shadow={false}
                                  objectFit="contain"
                                  fallbackIconColor={PLACEHOLDER_COLOR_DARK}
                                  onError={counterpartyLogoOnError}
                                />
                              ) : (
                                <CardIcon
                                  src={null}
                                  alt=""
                                  fallbackIcon={CounterpartyFallbackIcon}
                                  size={20}
                                  shadow={false}
                                  fallbackIconColor={PLACEHOLDER_COLOR_DARK}
                                />
                              )
                            ) : (
                              <User className="h-5 w-5" style={{ color: PLACEHOLDER_COLOR_DARK }} />
                            )}
                          </span>
                          <span className="truncate text-sm" style={{ color: textColor }}>{counterpartyName}</span>
                        </>
                      )}
                    </div>
                  </div>
                  {commentText && (
                    <div className="flex items-start gap-2 min-w-0" style={{ paddingLeft: 12, paddingRight: 12, paddingBottom: 10, backgroundColor: row1Bg }}>
                      <MessageSquare className="h-4 w-4 shrink-0 mt-0.5" style={{ color: PLACEHOLDER_COLOR_DARK }} />
                      <span className="text-xs break-words min-w-0" style={{ color: PLACEHOLDER_COLOR_DARK }}>{commentText}</span>
                    </div>
                  )}
                </div>
              );
            })()}
            {step === 11 && (
              <Button
                type="button"
                variant="authPrimary"
                disabled={submitting}
                className="w-full rounded-lg border-0 text-sm py-3"
                onClick={handleSubmit}
                style={{ "--auth-primary-bg": "linear-gradient(135deg, #483BA6 0%, #6C5DD7 57%, #9487F3 100%)", "--auth-primary-bg-hover": "linear-gradient(315deg, #9487F3 0%, #6C5DD7 79%, #483BA6 100%)" } as React.CSSProperties}
              >
                {submitting ? "Создание…" : "Добавить"}
              </Button>
            )}
          </div>
          </div>
        )}
      </div>
    </div>
  );

  if (!mounted || typeof document === "undefined") return null;
  return createPortal(wizardContent, document.body);
}
