"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronDown, ArrowLeftRight, ArrowRight, ArrowUpDown, Building2, Coins, HandCoins, Receipt, QrCode, Banknote, Calendar, Wallet, Tag, User, MessageSquare, Link2, X, Plus, Trash2, SplitSquareVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { MODAL_BG, ACTIVE_TEXT_DARK, PLACEHOLDER_COLOR_DARK, GREEN, GREEN_TRANSACTION, RED, ACCENT2, ACCENT, BACKGROUND_DT } from "@/lib/colors";
import { MobileTapScale } from "@/components/mobile-tap-scale";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { FormField, TextField, DateField, SelectField } from "@/components/ui/form-field";
import { AuthInput } from "@/components/ui/auth-input";
import { SegmentedSelector } from "@/components/ui/segmented-selector";
import { CurrencyChip } from "@/components/currency-chip";
import { MobileSearchSelectOverlay } from "@/components/mobile-search-select-overlay";
import { CardIcon } from "@/components/card-icon";
import { AssetItemIcon } from "@/components/asset-item-icon";
import { CategoryIconImage } from "@/components/category-icon-image";
import { CounterpartyIconImage } from "@/components/counterparty-icon-image";
import { AssetCard } from "@/components/asset-card";
import { Table, TableBody } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { getPrimaryValueLabel } from "@/lib/asset-item-form-constants";
import { buildCategoryLookup, makeCategoryPathKey } from "@/lib/categories";
import { useCategoryImage } from "@/hooks/use-category-icon";
import { useCounterpartyImage } from "@/hooks/use-counterparty-image";
import { transferIconPath } from "@/lib/image-paths";
import type { CategoryNode } from "@/lib/categories";
import { getItemTypeLabel } from "@/lib/item-types";
import { getEffectiveItemKind, getItemPrimaryValueCents } from "@/lib/item-utils";
import { buildOrderedItemsLikeAssetsPage } from "@/lib/order-items-like-assets";
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

const SIMPLE_WIZARD_STEPS = 10;

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
  const [formErrorStep, setFormErrorStep] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [amountStr, setAmountStr] = useState("");
  const [amountCounterpartyStr, setAmountCounterpartyStr] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState(() => {
    const n = new Date();
    return `${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}`;
  });
  const [direction, setDirection] = useState<"INCOME" | "EXPENSE" | "TRANSFER">("EXPENSE");
  const [formTransactionType, setFormTransactionType] = useState<TransactionOut["transaction_type"]>("ACTUAL");
  const [primaryItemId, setPrimaryItemId] = useState<number | null>(null);
  const [counterpartyItemId, setCounterpartyItemId] = useState<number | null>(null);
  const [counterpartyId, setCounterpartyId] = useState<number | null>(null);
  const [selectedCategoryPath, setSelectedCategoryPath] = useState<{ l1: string; l2: string; l3: string } | null>(null);
  const [comment, setComment] = useState("");
  const [relatedItemId, setRelatedItemId] = useState<number | null>(null);
  const [assetLinkType, setAssetLinkType] = useState<AssetLinkType | null>(null);
  // По умолчанию для расхода — «Расход по активу», для дохода — «Доход от актива»
  const defaultAssetLinkType = direction === "EXPENSE" ? "ASSET_EXPENSE" : "ASSET_INCOME";
  const effectiveAssetLinkType = assetLinkType ?? defaultAssetLinkType;
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
      setFormErrorStep(null);
      setAmountStr("");
      setAmountCounterpartyStr("");
      const now = new Date();
      setDate(now.toISOString().slice(0, 10));
      setTime(
        `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
      );
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
  const itemsForSelector = useMemo(
    () => buildOrderedItemsLikeAssetsPage(items, itemTxCounts, resolveItemEffectiveKind),
    [items, itemTxCounts, resolveItemEffectiveKind]
  );
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

  /** Плоский список категорий для мобильного оверлея выбора (фильтр по направлению). */
  const categoryOptionsForOverlay = useMemo(() => {
    const list: { id: number; path: [string, string, string]; label: string }[] = [];
    const idToPath = categoryLookup.idToPath;
    const idToScope = categoryLookup.idToScope;
    idToPath.forEach((path, id) => {
      const scope = idToScope?.get(id);
      if (direction !== "TRANSFER") {
        if (direction === "EXPENSE" && scope === "INCOME") return;
        if (direction === "INCOME" && scope === "EXPENSE") return;
      }
      const l1 = path[0] ?? "";
      const l2 = path[1] ?? "";
      const l3 = path[2] ?? "";
      const label = [l1, l2, l3].filter(Boolean).join(" / ") || l1 || "—";
      list.push({ id, path: [l1, l2, l3], label });
    });
    return list;
  }, [categoryLookup, direction]);

  const selectedCategoryOption =
    categoryOptionsForOverlay.find(
      (opt) =>
        opt.path[0] === cat1 && opt.path[1] === cat2 && opt.path[2] === cat3
    ) ?? null;

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
    setFormErrorStep(null);
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
    setFormErrorStep(null);
    if (flowType === "SIMPLE" && step < SIMPLE_WIZARD_STEPS) {
      if (step === 5 && isTransfer) setStep(8);
      else if (step === 8 && isTransfer) setStep(10);
      else setStep((s) => s + 1);
    }
  }, [flowType, step, isTransfer]);

  const goBack = useCallback(() => {
    setFormError(null);
    setFormErrorStep(null);
    if (step > 1) {
      if (step === 8 && isTransfer) setStep(5);
      else if (step === 10 && isTransfer) setStep(8);
      else setStep((s) => s - 1);
    } else if (flowType === "SIMPLE" && step === 1) {
      setFlowType(null);
      setStep(0);
    }
  }, [flowType, step, isTransfer]);

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
        return true;
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
    direction,
    effectiveAssetLinkType,
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
  };

  const handleSubmit = useCallback(async () => {
    if (flowType !== "SIMPLE" || step !== SIMPLE_WIZARD_STEPS) return;
    setFormError(null);
    setFormErrorStep(null);
    const cents = parseRubToCents(normalizeRubOnBlur(amountStr));
    if (!Number.isFinite(cents) || cents <= 0) {
      setFormError("Введите корректную сумму.");
      setFormErrorStep(5);
      return;
    }
    if (!primaryItemId) {
      setFormError("Выберите актив/обязательство.");
      setFormErrorStep(4);
      return;
    }
    if (isTransfer && !counterpartyItemId) {
      setFormError("Выберите корреспондирующий актив.");
      setFormErrorStep(4);
      return;
    }
    const resolvedCategoryId = isTransfer ? null : resolveCategoryId(cat1, cat2, cat3);
    if (!isTransfer && !resolvedCategoryId) {
      setFormError("Выберите категорию.");
      setFormErrorStep(6);
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
      asset_link_type: isTransfer ? null : (relatedItemId != null ? effectiveAssetLinkType : null),
    };

    const doSplit = splitEnabled && !isTransfer && splitParts.some((p) => (parseRubToCents(normalizeRubOnBlur(p.amountStr)) ?? 0) > 0);
    if (doSplit) {
      const totalCents = cents;
      const partCents = (p: { amountStr: string; categoryId: number | null }) =>
        Math.max(0, parseRubToCents(normalizeRubOnBlur(p.amountStr)) ?? 0);
      const filledSum = splitParts.reduce((s, p) => s + partCents(p), 0);
      if (filledSum !== totalCents) {
        setFormError("Сумма частей должна совпадать с суммой транзакции.");
        setFormErrorStep(10);
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
        setFormErrorStep(10);
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
      setFormErrorStep(10);
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
    effectiveAssetLinkType,
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
        if (step === 4) {
          setFormError(isTransfer ? "Выберите откуда и куда." : "Выберите актив.");
          setFormErrorStep(4);
        } else if (step === 5) {
          setFormError("Введите сумму.");
          setFormErrorStep(5);
        } else if (step === 6 && !isTransfer) {
          setFormError("Выберите категорию.");
          setFormErrorStep(6);
        }
        return;
      }
      goNext();
    } else {
      handleSubmit();
    }
  }, [flowType, step, canGoNext, goNext, handleSubmit, isTransfer]);

  const canGoNextRef = React.useRef(canGoNext);
  const goNextRef = React.useRef(goNext);
  canGoNextRef.current = canGoNext;
  goNextRef.current = goNext;

  const tryAutoAdvance = useCallback(() => {
    setTimeout(() => {
      if (flowType === "SIMPLE" && step < SIMPLE_WIZARD_STEPS && canGoNextRef.current()) goNextRef.current();
    }, 0);
  }, [flowType, step]);

  const tryAutoAdvanceRef = React.useRef(tryAutoAdvance);
  tryAutoAdvanceRef.current = tryAutoAdvance;

  const handleAdvanceFromStep = useCallback(() => {
    setFormError(null);
    setFormErrorStep(null);
    if (!canGoNext()) {
      if (step === 4) {
        setFormError(isTransfer ? "Выберите откуда и куда." : "Выберите актив.");
        setFormErrorStep(4);
      } else if (step === 5) {
        setFormError("Введите сумму.");
        setFormErrorStep(5);
      } else if (step === 6 && !isTransfer) {
        setFormError("Выберите категорию.");
        setFormErrorStep(6);
      }
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

  useEffect(() => {
    if (formError == null || formErrorStep == null) return;
    const el = stepRefs.current[formErrorStep - 1];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [formError, formErrorStep]);

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
        marginTop: "calc(-1 * env(safe-area-inset-top, 0px))",
        paddingTop: "env(safe-area-inset-top, 0px)",
      }}
      aria-modal
      aria-label={isTypeSelection ? "Добавить транзакцию" : `Добавить транзакцию — ${stepTitles[step] ?? ""}`}
    >
      <header className="shrink-0 flex items-center justify-between gap-2 px-3 py-2">
        {!isTypeSelection ? (
          <div className="flex items-center gap-2 min-w-0" style={{ color: ACTIVE_TEXT_DARK }}>
            <ArrowLeftRight className="h-5 w-5 shrink-0" strokeWidth={1.5} />
            <span className="text-lg font-medium truncate">Новая транзакция</span>
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
                  <MobileSearchSelectOverlay
                    value={primaryItemId != null ? itemsById.get(primaryItemId) ?? null : null}
                    options={primarySelectItems}
                    getOptionLabel={(item) => item.name}
                    getOptionKey={(item) => item.id}
                    onSelect={(item) => {
                      setPrimaryItemId(item.id);
                      if (step === 4) tryAutoAdvanceRef.current();
                    }}
                    placeholder="Откуда"
                    searchPlaceholder="Поиск актива"
                    renderTriggerContent={(item) => (
                      <>
                        <AssetItemIcon item={item} counterparty={getItemCounterparty(item.id)} apiBase={API_BASE} size={20} />
                        <span className="truncate">{item.name}</span>
                      </>
                    )}
                    renderOption={(item) => (
                      <div
                        className="rounded-lg overflow-hidden border-0 outline-none shadow-lg p-4"
                        style={{ backgroundColor: MODAL_BG }}
                      >
                        <Table className="table-fixed w-full border-separate border-spacing-0 [&_tr]:border-b-0">
                          <TableBody className="[&_tr]:bg-transparent [&_tr:hover]:bg-transparent">
                            <AssetCard
                              item={item}
                              layout="tableRow"
                              accountingStartDate={accountingStartDate}
                              getItemDisplayBalanceCents={getItemDisplayBalanceCents}
                              counterparty={getItemCounterparty(item.id)}
                              counterpartiesById={counterpartiesById}
                              showRubEquivalent={false}
                              primaryValueLabel={getPrimaryValueLabel(item.primary_value_kind)}
                            />
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  />
                  </MobileTapScale>
                </FormField>
                <div className="flex justify-center py-1">
                  <IconButton
                    type="button"
                    aria-label="Поменять откуда и куда местами"
                    onClick={() => {
                      setPrimaryItemId(counterpartyItemId);
                      setCounterpartyItemId(primaryItemId);
                      setAmountStr(amountCounterpartyStr);
                      setAmountCounterpartyStr(amountStr);
                    }}
                  >
                    <ArrowUpDown className="h-5 w-5" />
                  </IconButton>
                </div>
                <FormField label="Куда" inlineLabel>
                  <MobileTapScale className="block w-full">
                  <MobileSearchSelectOverlay
                    value={counterpartyItemId != null ? itemsById.get(counterpartyItemId) ?? null : null}
                    options={counterpartySelectItems.filter((it) => it.id !== primaryItemId)}
                    getOptionLabel={(item) => item.name}
                    getOptionKey={(item) => item.id}
                    onSelect={(item) => {
                      setCounterpartyItemId(item.id);
                      if (step === 4) tryAutoAdvanceRef.current();
                    }}
                    placeholder="Куда"
                    searchPlaceholder="Поиск актива"
                    renderTriggerContent={(item) => (
                      <>
                        <AssetItemIcon item={item} counterparty={getItemCounterparty(item.id)} apiBase={API_BASE} size={20} />
                        <span className="truncate">{item.name}</span>
                      </>
                    )}
                    renderOption={(item) => (
                      <div
                        className="rounded-lg overflow-hidden border-0 outline-none shadow-lg p-4"
                        style={{ backgroundColor: MODAL_BG }}
                      >
                        <Table className="table-fixed w-full border-separate border-spacing-0 [&_tr]:border-b-0">
                          <TableBody className="[&_tr]:bg-transparent [&_tr:hover]:bg-transparent">
                            <AssetCard
                              item={item}
                              layout="tableRow"
                              accountingStartDate={accountingStartDate}
                              getItemDisplayBalanceCents={getItemDisplayBalanceCents}
                              counterparty={getItemCounterparty(item.id)}
                              counterpartiesById={counterpartiesById}
                              showRubEquivalent={false}
                              primaryValueLabel={getPrimaryValueLabel(item.primary_value_kind)}
                            />
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  />
                  </MobileTapScale>
                </FormField>
              </>
            ) : (
              <FormField label="" inlineLabel>
                <MobileTapScale className="block w-full">
                <MobileSearchSelectOverlay
                  value={primaryItemId != null ? itemsById.get(primaryItemId) ?? null : null}
                  options={primarySelectItems}
                  getOptionLabel={(item) => item.name}
                  getOptionKey={(item) => item.id}
                  onSelect={(item) => {
                    setPrimaryItemId(item.id);
                    if (step === 4) tryAutoAdvanceRef.current();
                  }}
                  placeholder="Выберите"
                  searchPlaceholder="Поиск актива"
                  renderTriggerContent={(item) => (
                    <>
                      <AssetItemIcon item={item} counterparty={getItemCounterparty(item.id)} apiBase={API_BASE} size={20} />
                      <span className="truncate">{item.name}</span>
                    </>
                  )}
                  renderOption={(item) => (
                    <div
                      className="rounded-lg overflow-hidden border-0 outline-none shadow-lg p-4"
                      style={{ backgroundColor: MODAL_BG }}
                    >
                      <Table className="table-fixed w-full border-separate border-spacing-0 [&_tr]:border-b-0">
                        <TableBody className="[&_tr]:bg-transparent [&_tr:hover]:bg-transparent">
                          <AssetCard
                            item={item}
                            layout="tableRow"
                            accountingStartDate={accountingStartDate}
                            getItemDisplayBalanceCents={getItemDisplayBalanceCents}
                            counterparty={getItemCounterparty(item.id)}
                            counterpartiesById={counterpartiesById}
                            showRubEquivalent={false}
                            primaryValueLabel={getPrimaryValueLabel(item.primary_value_kind)}
                          />
                        </TableBody>
                      </Table>
                    </div>
                  )}
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
            {formError && formErrorStep === 4 && (
              <div
                className="text-base rounded-md border p-2 mt-2"
                style={{
                  color: "#FB4C4F",
                  backgroundColor: "rgba(251, 76, 79, 0.08)",
                  borderColor: "rgba(251, 76, 79, 0.3)",
                }}
              >
                {formError}
              </div>
            )}
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
                    className={amountStr ? "pr-14" : undefined}
                  />
                  {amountStr && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setAmountStr("");
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-md touch-manipulation min-h-[44px] min-w-[44px]"
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
                      className={amountCounterpartyStr ? "pr-14" : undefined}
                    />
                    {amountCounterpartyStr && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setAmountCounterpartyStr("");
                        }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-md touch-manipulation min-h-[44px] min-w-[44px]"
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
            {formError && formErrorStep === 5 && (
              <div
                className="text-base rounded-md border p-2 mt-2"
                style={{
                  color: "#FB4C4F",
                  backgroundColor: "rgba(251, 76, 79, 0.08)",
                  borderColor: "rgba(251, 76, 79, 0.3)",
                }}
              >
                {formError}
              </div>
            )}
            {step === 5 && (
              <div className="flex justify-center pt-6 pb-2">
                <IconButton type="button" aria-label="Следующий шаг" onClick={handleAdvanceFromStep}>
                  <ChevronDown className="size-5" />
                </IconButton>
              </div>
            )}
          </div>
        )}

        {flowType === "SIMPLE" && step >= 6 && !isTransfer && (
          <div ref={(el) => { stepRefs.current[5] = el; }} className="wizard-step-enter">
            <p className="text-base font-medium mb-3 flex items-center gap-2" style={{ color: ACTIVE_TEXT_DARK }}>
              <Tag className="h-5 w-5 shrink-0" />
              Категория
            </p>
          <FormField label="" inlineLabel>
            <MobileTapScale className="block w-full">
            <MobileSearchSelectOverlay
              value={selectedCategoryOption}
              options={categoryOptionsForOverlay}
              getOptionLabel={(opt) => opt.label}
              getOptionKey={(opt) => opt.id}
              onSelect={(opt) => {
                applyCategorySelection(opt.path[0], opt.path[1], opt.path[2]);
                if (step === 6) tryAutoAdvanceRef.current();
              }}
              placeholder="Категория"
              searchPlaceholder="Поиск категории"
              emptyMessage="Нет категорий"
              noResultsMessage="Ничего не найдено"
                  renderTriggerContent={(opt) => (
                <>
                  <CategoryIconImage
                    categoryId={opt.id}
                    categoryLookup={categoryLookup}
                    apiBase={API_BASE}
                    size={20}
                    fallbackIconColor={ACTIVE_TEXT_DARK}
                  />
                  <span className="break-words">{opt.path[2] || opt.path[1] || opt.path[0] || "—"}</span>
                </>
              )}
            />
            </MobileTapScale>
          </FormField>
            {formError && formErrorStep === 6 && (
              <div
                className="text-base rounded-md border p-2 mt-2"
                style={{
                  color: "#FB4C4F",
                  backgroundColor: "rgba(251, 76, 79, 0.08)",
                  borderColor: "rgba(251, 76, 79, 0.3)",
                }}
              >
                {formError}
              </div>
            )}
            {step === 6 && (
              <div className="flex justify-center pt-6 pb-2">
                <IconButton type="button" aria-label="Следующий шаг" onClick={handleAdvanceFromStep}>
                  <ChevronDown className="size-5" />
                </IconButton>
              </div>
            )}
          </div>
        )}

        {flowType === "SIMPLE" && step >= 7 && !isTransfer && (
          <div ref={(el) => { stepRefs.current[6] = el; }} className="wizard-step-enter">
            <p className="text-base font-medium mb-3 flex items-center gap-2" style={{ color: ACTIVE_TEXT_DARK }}>
              <User className="h-5 w-5 shrink-0" />
              Контрагент
            </p>
          <FormField label="" inlineLabel>
            <MobileTapScale className="block w-full">
            <MobileSearchSelectOverlay
              value={counterpartyId != null ? counterpartiesById.get(counterpartyId) ?? null : null}
              options={selectableCounterparties}
              getOptionLabel={buildCounterpartyName}
              getOptionKey={(c) => c.id}
              onSelect={(c) => {
                setCounterpartyId(c.id);
                if (step === 7) tryAutoAdvanceRef.current();
              }}
              placeholder="Контрагент"
              searchPlaceholder="Поиск контрагента"
              emptyMessage="Нет контрагентов"
              noResultsMessage="Ничего не найдено"
              renderTriggerContent={(c) => (
                <>
                  <CounterpartyIconImage counterparty={c} apiBase={API_BASE} size={20} />
                  <span className="truncate">{buildCounterpartyName(c)}</span>
                </>
              )}
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
            <div className="relative [&_div.relative.flex.items-center]:h-10 [&_input]:!text-base">
              <AuthInput
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                onBlur={() => { if (step === 8) tryAutoAdvanceRef.current(); }}
                placeholder="Комментарий"
                className={cn("w-full text-base", comment ? "pr-14" : undefined)}
              />
              {comment && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setComment("");
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-md touch-manipulation min-h-[44px] min-w-[44px]"
                  style={{ color: PLACEHOLDER_COLOR_DARK }}
                  aria-label="Очистить поле"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
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

        {flowType === "SIMPLE" && step === 9 && !isTransfer && (
          <div ref={(el) => { stepRefs.current[8] = el; }} className="wizard-step-enter">
            <p className="text-base font-medium mb-3 flex items-center gap-2" style={{ color: ACTIVE_TEXT_DARK }}>
              <Link2 className="h-5 w-5 shrink-0" />
              Связанный актив
            </p>
          <div className="grid gap-4">
            <FormField label="" inlineLabel>
              <MobileTapScale className="block w-full">
              <MobileSearchSelectOverlay
                value={relatedItemId != null ? itemsById.get(relatedItemId) ?? null : null}
                options={itemsForRelatedSelector}
                getOptionLabel={(item) => item.name}
                getOptionKey={(item) => item.id}
                onSelect={(item) => {
                  setRelatedItemId(item.id);
                  if (step === 9) tryAutoAdvanceRef.current();
                }}
                placeholder="Выберите"
                searchPlaceholder="Поиск актива"
                renderTriggerContent={(item) => (
                  <>
                    <AssetItemIcon item={item} counterparty={getItemCounterparty(item.id)} apiBase={API_BASE} size={20} />
                    <span className="truncate">{item.name}</span>
                  </>
                )}
                renderOption={(item) => (
                  <div
                    className="rounded-lg overflow-hidden border-0 outline-none shadow-lg p-4"
                    style={{ backgroundColor: MODAL_BG }}
                  >
                    <Table className="table-fixed w-full border-separate border-spacing-0 [&_tr]:border-b-0">
                      <TableBody className="[&_tr]:bg-transparent [&_tr:hover]:bg-transparent">
                        <AssetCard
                          item={item}
                          layout="tableRow"
                          accountingStartDate={accountingStartDate}
                          getItemDisplayBalanceCents={getItemDisplayBalanceCents}
                          counterparty={getItemCounterparty(item.id)}
                          counterpartiesById={counterpartiesById}
                          showRubEquivalent={false}
                          primaryValueLabel={getPrimaryValueLabel(item.primary_value_kind)}
                        />
                      </TableBody>
                    </Table>
                  </div>
                )}
              />
              </MobileTapScale>
            </FormField>
            {relatedItemId != null && (
              <FormField label="Тип привязки" inlineLabel>
                <MobileTapScale className="block w-full">
                  <SegmentedSelector
                    options={
                      direction === "EXPENSE"
                        ? [
                            { value: "ASSET_PURCHASE", label: "Приобретение актива", colorScheme: "purple" },
                            { value: "ASSET_INVESTMENT", label: "Вложение в актив", colorScheme: "purple" },
                            { value: "ASSET_EXPENSE", label: "Расход по активу", colorScheme: "purple" },
                          ]
                        : [
                            { value: "ASSET_SALE", label: "Продажа актива", colorScheme: "purple" },
                            { value: "ASSET_INCOME", label: "Доход от актива", colorScheme: "purple" },
                          ]
                    }
                    value={effectiveAssetLinkType}
                    onChange={(v) => {
                      const next = (typeof v === "string" ? v : effectiveAssetLinkType) as AssetLinkType;
                      setAssetLinkType(next);
                      if (step === 9) tryAutoAdvanceRef.current();
                    }}
                    colorScheme="purple"
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

        {flowType === "SIMPLE" && step === 10 && (
          <div ref={(el) => { stepRefs.current[9] = el; }} className="wizard-step-enter">
          {formError && formErrorStep === 10 && (
            <div
              className="text-base rounded-md border p-2 mb-2"
              style={{
                color: "#FB4C4F",
                backgroundColor: "rgba(251, 76, 79, 0.08)",
                borderColor: "rgba(251, 76, 79, 0.3)",
              }}
            >
              {formError}
            </div>
          )}
          <div className="grid gap-4">
            <div className="flex w-full items-center justify-between gap-2">
              <p className="text-base font-medium flex items-center gap-2 mb-0" style={{ color: ACTIVE_TEXT_DARK }}>
                <SplitSquareVertical className="h-5 w-5 shrink-0" />
                Разделить на несколько
              </p>
              <Switch
                checked={splitEnabled}
                onCheckedChange={(checked) => {
                  if (!checked) {
                    setSplitEnabled(false);
                  } else {
                    setSplitEnabled(true);
                    const totalCents = parseRubToCents(normalizeRubOnBlur(amountStr)) ?? 0;
                    if (totalCents > 0) {
                      const parentCat = resolveCategoryId(cat1, cat2, cat3);
                      setSplitParts([{ amountStr: formatCentsForInput(totalCents), categoryId: parentCat ?? null }]);
                    }
                  }
                }}
                aria-label="Включить или отключить разделение транзакции"
              />
            </div>
            {splitEnabled && splitParts.length > 0 && (() => {
              const formTotalCents = parseRubToCents(normalizeRubOnBlur(amountStr)) ?? 0;
              const partC = (p: { amountStr: string }) => Math.max(0, parseRubToCents(normalizeRubOnBlur(p.amountStr)) ?? 0);
              const sumPartsCents = splitParts.reduce((s, p) => s + partC(p), 0);
              const ratio = formTotalCents > 0 ? Math.min(sumPartsCents / formTotalCents, 1) : 0;
              const isExactMatch = formTotalCents > 0 && sumPartsCents === formTotalCents;
              const barColor = isExactMatch ? GREEN : RED;
              const partsCurrencyCode = primaryCurrencyCode ?? "RUB";
              const parentCat = resolveCategoryId(cat1, cat2, cat3);
              return (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium flex items-baseline gap-2">
                        <CurrencyChip code={partsCurrencyCode} />
                        <span style={{ color: barColor }}>{formatCentsForInput(sumPartsCents)}</span>
                        <span style={{ color: ACTIVE_TEXT_DARK }}>/</span>
                        <CurrencyChip code={partsCurrencyCode} />
                        <span style={{ color: ACTIVE_TEXT_DARK }}>{formatCentsForInput(formTotalCents)}</span>
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full transition-[width]" style={{ width: `${ratio * 100}%`, backgroundColor: barColor }} />
                    </div>
                  </div>
                  <div className="space-y-3">
                    {splitParts.map((part, idx) => (
                      <div key={idx} className="rounded-lg border p-3 space-y-3" style={{ borderColor: "rgba(148, 163, 184, 0.4)" }}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium" style={{ color: ACTIVE_TEXT_DARK }}>Часть {idx + 1}</span>
                          {splitParts.length > 1 && (
                            <IconButton
                              type="button"
                              aria-label="Удалить часть"
                              style={{ color: RED }}
                              onClick={() => setSplitParts(splitParts.filter((_, i) => i !== idx))}
                            >
                              <Trash2 className="h-4 w-4" />
                            </IconButton>
                          )}
                        </div>
                        <div className="grid gap-3">
                          <MobileTapScale className="block w-full">
                            <div className="relative [&_input]:!text-base">
                              <TextField
                                label=""
                                currencyCode={partsCurrencyCode ?? undefined}
                                value={part.amountStr}
                                onChange={(e) => {
                                  const next = [...splitParts];
                                  next[idx] = { ...next[idx], amountStr: formatRubInput(e.target.value) };
                                  if (next.length > 1 && idx < next.length - 1) {
                                    const sumOthers = next.slice(0, -1).reduce((s, p) => s + partC(p), 0);
                                    const remainder = Math.max(0, formTotalCents - sumOthers);
                                    next[next.length - 1] = { ...next[next.length - 1], amountStr: formatCentsForInput(remainder) };
                                  }
                                  setSplitParts(next);
                                }}
                                onBlur={() => {
                                  const next = [...splitParts];
                                  next[idx] = { ...next[idx], amountStr: normalizeRubOnBlur(part.amountStr) };
                                  if (next.length > 1 && idx < next.length - 1) {
                                    const sumOthers = next.slice(0, -1).reduce((s, p) => s + partC(p), 0);
                                    const remainder = Math.max(0, formTotalCents - sumOthers);
                                    next[next.length - 1] = { ...next[next.length - 1], amountStr: formatCentsForInput(remainder) };
                                  }
                                  setSplitParts(next);
                                }}
                                inputMode="decimal"
                                placeholder="Сумма"
                                className={part.amountStr ? "pr-14" : undefined}
                              />
                              {part.amountStr && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    const next = [...splitParts];
                                    next[idx] = { ...next[idx], amountStr: "" };
                                    if (next.length > 1 && idx < next.length - 1) {
                                      const sumOthers = next.slice(0, -1).reduce((s, p) => s + partC(p), 0);
                                      const remainder = Math.max(0, formTotalCents - sumOthers);
                                      next[next.length - 1] = { ...next[next.length - 1], amountStr: formatCentsForInput(remainder) };
                                    }
                                    setSplitParts(next);
                                  }}
                                  className="absolute right-2 top-1/2 -translate-y-1/2 z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-md touch-manipulation min-h-[44px] min-w-[44px]"
                                  style={{ color: PLACEHOLDER_COLOR_DARK }}
                                  aria-label="Очистить поле"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          </MobileTapScale>
                          <MobileTapScale className="block w-full">
                            <MobileSearchSelectOverlay
                              value={part.categoryId != null ? categoryOptionsForOverlay.find((o) => o.id === part.categoryId) ?? null : null}
                              options={categoryOptionsForOverlay}
                              getOptionLabel={(opt) => opt.label}
                              getOptionKey={(opt) => opt.id}
                              onSelect={(opt) => {
                                const next = [...splitParts];
                                next[idx] = { ...next[idx], categoryId: opt.id };
                                setSplitParts(next);
                              }}
                              placeholder="Категория"
                              searchPlaceholder="Поиск категории"
                              emptyMessage="Нет категорий"
                              noResultsMessage="Ничего не найдено"
                              renderTriggerContent={(opt) => (
                                <>
                                  <CategoryIconImage
                                    categoryId={opt.id}
                                    categoryLookup={categoryLookup}
                                    apiBase={API_BASE}
                                    size={20}
                                    fallbackIconColor={ACTIVE_TEXT_DARK}
                                  />
                                  <span className="break-words">{opt.path[2] || opt.path[1] || opt.path[0] || "—"}</span>
                                </>
                              )}
                            />
                          </MobileTapScale>
                        </div>
                      </div>
                    ))}
                    <MobileTapScale className="block w-full">
                      <Button
                        type="button"
                        variant="ghost"
                        className="w-full min-h-10 h-10 rounded-[9px] border border-border bg-transparent dark:bg-input/30 dark:hover:bg-input/50 hover:bg-input/20 shadow-xs flex items-center justify-center gap-2"
                        onClick={() => {
                          const filledSum = splitParts.reduce((s, p) => s + partC(p), 0);
                          const remainder = Math.max(0, formTotalCents - filledSum);
                          setSplitParts([...splitParts, { amountStr: formatCentsForInput(remainder), categoryId: parentCat ?? null }]);
                        }}
                      >
                        <Plus className="h-4 w-4 shrink-0" />
                        <span style={{ color: ACTIVE_TEXT_DARK }}>Добавить часть</span>
                      </Button>
                    </MobileTapScale>
                  </div>
                </div>
              );
            })()}
          </div>
            {step === 10 && (() => {
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
                <div className="flex flex-col gap-4 pt-10">
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
                <MobileTapScale className="block w-full pt-4">
                  <Button
                    type="button"
                    variant="authPrimary"
                    disabled={submitting}
                    className="w-full rounded-lg border-0 text-sm min-h-12 py-4"
                    onClick={handleSubmit}
                    style={{ "--auth-primary-bg": "linear-gradient(135deg, #483BA6 0%, #6C5DD7 57%, #9487F3 100%)", "--auth-primary-bg-hover": "linear-gradient(315deg, #9487F3 0%, #6C5DD7 79%, #483BA6 100%)" } as React.CSSProperties}
                  >
                    {submitting ? "Создание…" : "Добавить"}
                  </Button>
                </MobileTapScale>
              </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );

  if (!mounted || typeof document === "undefined") return null;
  return createPortal(wizardContent, document.body);
}
