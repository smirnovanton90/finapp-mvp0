"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ArrowLeftRight, ArrowRight, ArrowUpDown, Building2, Coins, HandCoins, Receipt, QrCode, Banknote, Calendar, Wallet, Tag, User, MessageSquare, Link2, X, Plus, Trash2, SplitSquareVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { MODAL_BG, ACTIVE_TEXT_DARK, PLACEHOLDER_COLOR_DARK, GREEN, GREEN_TRANSACTION, RED, ACCENT2, ACCENT, BACKGROUND_DT } from "@/lib/colors";
import { MobileTapScale } from "@/components/mobile-tap-scale";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { FormField, TextField, DateField, SelectField } from "@/components/ui/form-field";
import { AuthInput } from "@/components/ui/auth-input";
import { TimeInput } from "@/components/ui/time-input";
import { DateInput } from "@/components/ui/date-input";
import { TimezoneSelector } from "@/components/timezone-selector";
import { useDisplayTimezone } from "@/components/timezone-context";
import { nowInTimezone } from "@/lib/timezone";
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
import { formatAmount } from "@/lib/item-utils";
import { MobileSpecialTransactionStep } from "@/components/mobile-special-transaction-step";
import {
  SPECIAL_STEP_TITLES,
  specialStepError,
  specialWizardSteps,
  submitSpecialWizard,
  type SpecialWizardInput,
} from "@/lib/special-transaction-wizard";
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
  type DebtDirection,
  type TransactionType,
} from "@/lib/api";

/** Последний шаг простой транзакции — превью перед сохранением. */
const STEP_PREVIEW = 11;
/** Для перевода: куда зачислить. Идёт сразу после шага «откуда». */
const STEP_ASSET_TO = 12;

/**
 * Экраны простой транзакции.
 * Перевод пропускает категорию, контрагента, связанный актив и разделение.
 */
function visibleWizardSteps(isTransfer: boolean): number[] {
  if (isTransfer) return [1, 2, 3, 4, STEP_ASSET_TO, 5, 8, STEP_PREVIEW];
  return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, STEP_PREVIEW];
}

function buildTransactionDate(dateKey: string, timeHHmm: string): string {
  const t = /^\d{1,2}:\d{2}$/.test(timeHHmm) ? timeHHmm : "00:00";
  return `${dateKey}T${t}:00`;
}

function formatWizardDateLabel(dateKey: string, timeHHmm: string): string {
  const [y, m, d] = dateKey.split("-");
  if (!d || !m || !y) return dateKey;
  const clock = /^\d{1,2}:\d{2}$/.test(timeHHmm) && timeHHmm !== "00:00" ? `, ${timeHHmm}` : "";
  return `${d}.${m}.${y}${clock}`;
}

const ASSET_LINK_LABELS: Record<string, string> = {
  ASSET_PURCHASE: "Приобретение актива",
  ASSET_INVESTMENT: "Вложение в актив",
  ASSET_EXPENSE: "Расход по активу",
  ASSET_SALE: "Продажа актива",
  ASSET_INCOME: "Доход от актива",
};

const WIZARD_PRIMARY_BTN_STYLE = {
  "--auth-primary-bg": "linear-gradient(135deg, #483BA6 0%, #6C5DD7 57%, #6C5DD7 79%, #9487F3 100%)",
  "--auth-primary-bg-hover": "linear-gradient(315deg, #9487F3 0%, #6C5DD7 43%, #483BA6 100%)",
} as React.CSSProperties;

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
  /** Если задан, визард сразу открывает этот сценарий, минуя выбор типа. */
  entryFlow?: "LOAN_REPAYMENT" | "DEBTS" | null;
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
  entryFlow = null,
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
  const [flowStepId, setFlowStepId] = useState("type");
  const [stepMotion, setStepMotion] = useState<"forward" | "back">("forward");
  const [formError, setFormError] = useState<string | null>(null);
  const [formErrorStep, setFormErrorStep] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { timezone: displayTimezone } = useDisplayTimezone();
  const [amountStr, setAmountStr] = useState("");
  const [amountCounterpartyStr, setAmountCounterpartyStr] = useState("");
  const [date, setDate] = useState(() => nowInTimezone().dateKey);
  const [time, setTime] = useState(() => nowInTimezone().time);
  const [txTimezone, setTxTimezone] = useState(displayTimezone);
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
  const [debtDirection, setDebtDirection] = useState<DebtDirection>("I_PAID");
  const [loanTotalStr, setLoanTotalStr] = useState("");
  const [loanInterestStr, setLoanInterestStr] = useState("");
  const [debtSettlementMode, setDebtSettlementMode] = useState<"existing" | "new">("existing");
  const [debtSettlementItemId, setDebtSettlementItemId] = useState<number | null>(null);
  const [debtSettlementNewName, setDebtSettlementNewName] = useState("");
  const [debtPayForCounterpartyId, setDebtPayForCounterpartyId] = useState<number | null>(null);
  const [wherePaidCounterpartyId, setWherePaidCounterpartyId] = useState<number | null>(null);
  const [debtAmountStr, setDebtAmountStr] = useState("");
  const [debtSplitAmountStr, setDebtSplitAmountStr] = useState("");

  const entryFlowRef = React.useRef(entryFlow);
  entryFlowRef.current = entryFlow;

  const prevOpenRef = React.useRef(false);
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setFlowType(null);
      setStep(0);
      setStepMotion("forward");
      setFormError(null);
      setFormErrorStep(null);
      setAmountStr("");
      setAmountCounterpartyStr("");
      const now = nowInTimezone(displayTimezone);
      setDate(now.dateKey);
      setTime(now.time);
      setTxTimezone(displayTimezone);
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
      setDebtDirection("I_PAID");
      setLoanTotalStr("");
      setLoanInterestStr("");
      setDebtSettlementMode("existing");
      setDebtSettlementItemId(null);
      setDebtSettlementNewName("");
      setDebtPayForCounterpartyId(null);
      setWherePaidCounterpartyId(null);
      setDebtAmountStr("");
      setDebtSplitAmountStr("");
      setFlowStepId("type");
      const entry = entryFlowRef.current;
      if (entry === "LOAN_REPAYMENT" || entry === "DEBTS") {
        setFlowType(entry);
        setDirection("EXPENSE");
      }
    }
    prevOpenRef.current = open;
  }, [open, displayTimezone]);

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
  const assetOnlyItems = useMemo(
    () => itemsForSelector.filter((it) => getEffectiveItemKind(it, it.current_value_rub) === "ASSET"),
    [itemsForSelector]
  );
  const liabilityOnlyItems = useMemo(
    () => itemsForSelector.filter((it) => getEffectiveItemKind(it, it.current_value_rub) === "LIABILITY"),
    [itemsForSelector]
  );
  const settlementAssetItems = useMemo(
    () => itemsForSelector.filter((it) => it.type_code === "counterparty_settlements" && (it.current_value_rub ?? 0) > 0 && it.archived_at == null),
    [itemsForSelector]
  );
  const settlementLiabilityItems = useMemo(
    () => itemsForSelector.filter((it) => it.type_code === "counterparty_settlements" && (it.current_value_rub ?? 0) < 0 && it.archived_at == null),
    [itemsForSelector]
  );
  const debtSettlementCounterpartyId = debtDirection === "I_PAID_FOR_SOMEONE" ? debtPayForCounterpartyId : counterpartyId;
  const settlementItemsForCounterparty = useMemo(() => {
    if (debtSettlementCounterpartyId == null) return [];
    return itemsForSelector.filter(
      (it) => it.type_code === "counterparty_settlements" && it.counterparty_id === debtSettlementCounterpartyId && it.archived_at == null
    );
  }, [itemsForSelector, debtSettlementCounterpartyId]);
  const debtCurrencyCode =
    debtSettlementMode === "existing" && debtSettlementItemId != null
      ? itemsById.get(debtSettlementItemId)?.currency_code ?? primaryCurrencyCode
      : primaryCurrencyCode;
  const isDebtCross =
    (debtDirection === "I_PAID" || debtDirection === "THEY_PAID") &&
    !!primaryCurrencyCode &&
    !!debtCurrencyCode &&
    primaryCurrencyCode !== debtCurrencyCode;
  const offsetCross =
    debtDirection === "DEBT_OFFSET" &&
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

  const buildSpecialInput = useCallback((): SpecialWizardInput | null => {
    if (flowType !== "LOAN_REPAYMENT" && flowType !== "DEBTS") return null;
    const primaryMeta = getEffectiveItemMeta(primaryItemId);
    const counterMeta = getEffectiveItemMeta(counterpartyItemId);
    const txType: TransactionType = formTransactionType === "PLANNED" ? "PLANNED" : "ACTUAL";
    return {
      flow: flowType,
      debtDirection,
      debtCross: isDebtCross,
      offsetCross,
      transactionType: txType,
      date,
      time,
      timezone: txTimezone,
      todayKey: nowInTimezone(txTimezone).dateKey,
      primaryItemId,
      counterpartyItemId,
      counterpartyId,
      debtPayForCounterpartyId,
      wherePaidCounterpartyId,
      debtSettlementMode,
      debtSettlementItemId,
      debtSettlementNewName,
      loanTotalStr,
      loanInterestStr,
      amountStr,
      amountCounterpartyStr,
      debtAmountStr,
      debtSplitAmountStr,
      categoryId: resolveCategoryId(cat1, cat2, cat3),
      comment,
      primaryIsMoex: isMoexItem(primaryItem),
      counterpartyIsMoex: isMoexItem(counterpartyItem),
      primaryMinDate: primaryMeta?.minDate ?? "",
      counterpartyMinDate: counterMeta?.minDate ?? "",
      primaryCurrency: primaryCurrencyCode,
      counterpartyCurrency: counterpartyCurrencyCode,
      primarySkipsMinDate: primaryMeta?.typeCode === "counterparty_settlements",
      counterpartySkipsMinDate: counterMeta?.typeCode === "counterparty_settlements",
    };
  }, [
    flowType,
    debtDirection,
    isDebtCross,
    offsetCross,
    formTransactionType,
    date,
    time,
    txTimezone,
    primaryItemId,
    counterpartyItemId,
    counterpartyId,
    debtPayForCounterpartyId,
    wherePaidCounterpartyId,
    debtSettlementMode,
    debtSettlementItemId,
    debtSettlementNewName,
    loanTotalStr,
    loanInterestStr,
    amountStr,
    amountCounterpartyStr,
    debtAmountStr,
    debtSplitAmountStr,
    cat1,
    cat2,
    cat3,
    comment,
    primaryItem,
    counterpartyItem,
    primaryCurrencyCode,
    counterpartyCurrencyCode,
    getEffectiveItemMeta,
    resolveCategoryId,
  ]);

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
    setStepMotion("forward");
    setStep(1);
    setFormError(null);
  }, []);

  const handleSelectLoanRepayment = useCallback(() => {
    setFlowType("LOAN_REPAYMENT");
    setDirection("EXPENSE");
    setFlowStepId("type");
    setStepMotion("forward");
    setFormError(null);
    setFormErrorStep(null);
    setSelectedCategoryPath(null);
  }, []);

  const handleSelectDebt = useCallback(() => {
    setFlowType("DEBTS");
    setDebtDirection("I_PAID");
    setDirection("EXPENSE");
    setFlowStepId("type");
    setStepMotion("forward");
    setFormError(null);
    setFormErrorStep(null);
    setSelectedCategoryPath(null);
  }, []);

  const handleSelectReceipt = useCallback(() => {
    onSelectReceipt();
  }, [onSelectReceipt]);

  const goNext = useCallback(() => {
    setFormError(null);
    setFormErrorStep(null);
    if (flowType === "LOAN_REPAYMENT" || flowType === "DEBTS") {
      const special = buildSpecialInput();
      if (!special) return;
      const steps = specialWizardSteps(special);
      const idx = steps.indexOf(flowStepId);
      if (idx >= 0 && idx < steps.length - 1) {
        setStepMotion("forward");
        setFlowStepId(steps[idx + 1]);
      }
      return;
    }
    if (flowType !== "SIMPLE") return;
    const steps = visibleWizardSteps(isTransfer);
    const idx = steps.indexOf(step);
    if (idx >= 0 && idx < steps.length - 1) {
      setStepMotion("forward");
      setStep(steps[idx + 1]);
    }
  }, [flowType, step, isTransfer, buildSpecialInput, flowStepId]);

  const goBack = useCallback(() => {
    setFormError(null);
    setFormErrorStep(null);
    if (flowType === "LOAN_REPAYMENT" || flowType === "DEBTS") {
      const special = buildSpecialInput();
      if (!special) return;
      const steps = specialWizardSteps(special);
      const idx = steps.indexOf(flowStepId);
      if (idx > 0) {
        setStepMotion("back");
        setFlowStepId(steps[idx - 1]);
      } else {
        setStepMotion("forward");
        setFlowType(null);
        setFlowStepId("type");
      }
      return;
    }
    if (flowType !== "SIMPLE") return;
    const steps = visibleWizardSteps(isTransfer);
    const idx = steps.indexOf(step);
    if (idx > 0) {
      setStepMotion("back");
      setStep(steps[idx - 1]);
    } else {
      setStepMotion("forward");
      setFlowType(null);
      setStep(0);
    }
  }, [flowType, step, isTransfer, buildSpecialInput, flowStepId]);

  const canGoNext = useCallback(() => {
    if (flowType !== "SIMPLE") return true;
    switch (step) {
      case 1:
      case 2:
      case 3:
        return true;
      case 4:
        return !!primaryItemId;
      case STEP_ASSET_TO:
        return !!counterpartyItemId && counterpartyItemId !== primaryItemId;
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
      case STEP_PREVIEW:
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
    [STEP_PREVIEW]: "Проверка",
    [STEP_ASSET_TO]: "Куда",
  };

  const handleSubmit = useCallback(async () => {
    if (flowType !== "SIMPLE" || step !== STEP_PREVIEW) return;
    setFormError(null);
    setFormErrorStep(null);
    const fail = (message: string, errorStep: number) => {
      setFormError(message);
      setFormErrorStep(errorStep);
      setStepMotion("back");
      setStep(errorStep);
    };
    const cents = parseRubToCents(normalizeRubOnBlur(amountStr));
    if (!Number.isFinite(cents) || cents <= 0) {
      fail("Введите корректную сумму.", 5);
      return;
    }
    if (!primaryItemId) {
      fail("Выберите актив/обязательство.", 4);
      return;
    }
    if (isTransfer && !counterpartyItemId) {
      fail("Выберите, куда зачислить.", STEP_ASSET_TO);
      return;
    }
    const resolvedCategoryId = isTransfer ? null : resolveCategoryId(cat1, cat2, cat3);
    if (!isTransfer && !resolvedCategoryId) {
      fail("Выберите категорию.", 6);
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
      timezone: txTimezone,
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
        fail("Сумма частей должна совпадать с суммой транзакции.", 10);
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
        setFormErrorStep(STEP_PREVIEW);
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
      setFormErrorStep(STEP_PREVIEW);
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
    txTimezone,
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

  const submitSpecial = useCallback(async () => {
    const special = buildSpecialInput();
    if (!special) return;
    setFormError(null);
    setSubmitting(true);
    try {
      await submitSpecialWizard(special);
      handleClose();
      onCreateSuccess();
    } catch (e: unknown) {
      setFormError(e && typeof e === "object" && "message" in e ? String((e as { message: string }).message) : "Не удалось создать транзакцию.");
    } finally {
      setSubmitting(false);
    }
  }, [buildSpecialInput, handleClose, onCreateSuccess]);

  const handleNextOrSubmit = useCallback(() => {
    if (flowType === "LOAN_REPAYMENT" || flowType === "DEBTS") {
      const special = buildSpecialInput();
      if (!special) return;
      const steps = specialWizardSteps(special);
      const idx = steps.indexOf(flowStepId);
      const last = idx >= 0 && idx === steps.length - 1;
      if (!last) {
        const error = specialStepError(flowStepId, special);
        if (error) {
          setFormError(error);
          return;
        }
        goNext();
        return;
      }
      void submitSpecial();
      return;
    }
    if (flowType !== "SIMPLE") return;
    const steps = visibleWizardSteps(isTransfer);
    const idx = steps.indexOf(step);
    const last = idx >= 0 && idx === steps.length - 1;
    if (!last) {
      if (!canGoNext()) {
        if (step === 4) {
          setFormError("Выберите актив.");
          setFormErrorStep(4);
        } else if (step === STEP_ASSET_TO) {
          setFormError(
            counterpartyItemId != null && counterpartyItemId === primaryItemId
              ? "Выберите другой актив."
              : "Выберите, куда зачислить."
          );
          setFormErrorStep(STEP_ASSET_TO);
        } else if (step === 5) {
          setFormError("Введите сумму.");
          setFormErrorStep(5);
        } else if (step === 6 && !isTransfer) {
          setFormError("Выберите категорию.");
          setFormErrorStep(6);
        } else if (step === 10) {
          setFormError("Сумма частей должна совпадать с суммой транзакции.");
          setFormErrorStep(10);
        }
        return;
      }
      goNext();
    } else {
      handleSubmit();
    }
  }, [flowType, step, canGoNext, goNext, handleSubmit, isTransfer, counterpartyItemId, primaryItemId, buildSpecialInput, flowStepId, submitSpecial]);

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
  const isSpecialFlow = flowType === "LOAN_REPAYMENT" || flowType === "DEBTS";
  const isFieldFlow = flowType === "SIMPLE" || isSpecialFlow;
  const specialNow = isSpecialFlow ? buildSpecialInput() : null;
  const progressIds = flowType === "SIMPLE"
    ? visibleWizardSteps(isTransfer).map(String)
    : specialNow
      ? specialWizardSteps(specialNow)
      : [];
  const activeStepKey = flowType === "SIMPLE" ? String(step) : flowStepId;
  const stepIndex = Math.max(0, progressIds.indexOf(activeStepKey));
  const isLastStep = progressIds.length > 0 && activeStepKey === progressIds[progressIds.length - 1];
  const stepAnimClass = stepMotion === "back" ? "wizard-step-back" : "wizard-step-enter";
  const progressTitle = flowType === "SIMPLE"
    ? (step === 4 && isTransfer ? "Откуда" : (stepTitles[step] ?? ""))
    : (SPECIAL_STEP_TITLES[flowStepId] ?? "");
  const optionalEmpty =
    (flowType === "SIMPLE" && (
      (step === 7 && counterpartyId == null) ||
      (step === 8 && !comment.trim()) ||
      (step === 9 && relatedItemId == null) ||
      (step === 10 && !splitEnabled)
    )) ||
    (isSpecialFlow && flowStepId === "comment" && !comment.trim());
  const nextLabel = isLastStep ? (submitting ? "Создание…" : "Добавить") : optionalEmpty ? "Пропустить" : "Далее";

  const wizardContent = (
    <div
      className="fixed inset-0 flex flex-col"
      style={{
        backgroundColor: isTypeSelection ? ACCENT : "#000000",
        zIndex: 100,
        minHeight: "100dvh",
        marginTop: "calc(-1 * env(safe-area-inset-top, 0px))",
        paddingTop: "env(safe-area-inset-top, 0px)",
      }}
      aria-modal
      aria-label={isTypeSelection ? "Добавить транзакцию" : `Добавить транзакцию — ${stepTitles[step] ?? ""}`}
    >
      <header className="shrink-0 relative flex items-center min-h-12 px-5 py-2">
        {isFieldFlow && progressIds.length > 0 && (
          <div
            className="flex min-w-0 flex-1 items-center gap-1 pr-12"
            role="progressbar"
            aria-valuenow={stepIndex + 1}
            aria-valuemin={1}
            aria-valuemax={progressIds.length}
            aria-valuetext={`${progressTitle}, ${stepIndex + 1} из ${progressIds.length}`}
          >
            {progressIds.map((id, i) => (
              <span
                key={id}
                className="rounded-full transition-all duration-300 ease-out"
                style={{
                  flex: i === stepIndex ? 2.4 : 1,
                  height: i === stepIndex ? 8 : 6,
                  backgroundColor:
                    i < stepIndex ? "rgba(127, 92, 255, 0.55)" : i === stepIndex ? "#7F5CFF" : "rgba(255,255,255,0.16)",
                }}
              />
            ))}
          </div>
        )}
        <IconButton
          type="button"
          aria-label="Закрыть"
          onClick={handleClose}
          appearance="default"
          className="absolute right-3 top-2"
        >
          <X className="size-5" strokeWidth={1.5} />
        </IconButton>
      </header>

      <div
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain"
        style={{
          WebkitOverflowScrolling: "touch",
          touchAction: "pan-y",
        }}
      >
        <div
          className={cn(
            "flex flex-col px-5",
            isFieldFlow ? "min-h-full justify-center py-6" : "min-h-full pt-4",
            isFieldFlow && "[&_input]:text-base [&_input::placeholder]:text-base [&_button]:text-base"
          )}
          style={
            flowType !== "SIMPLE"
              ? { paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom, 0px))" }
              : undefined
          }
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

        {(flowType === "LOAN_REPAYMENT" || flowType === "DEBTS") && (
          <MobileSpecialTransactionStep
            stepId={flowStepId}
            animClass={stepAnimClass}
            error={formError}
            flow={flowType}
            debtDirection={debtDirection}
            onDebtDirection={(value) => {
              setDebtDirection(value);
              setDirection(value === "DEBT_OFFSET" ? "TRANSFER" : "EXPENSE");
              setPrimaryItemId(null);
              setCounterpartyItemId(null);
              setCounterpartyId(null);
              setDebtPayForCounterpartyId(null);
              setWherePaidCounterpartyId(null);
              setDebtSettlementItemId(null);
              setDebtSettlementNewName("");
              setDebtSettlementMode("existing");
            }}
            transactionType={formTransactionType}
            onTransactionType={setFormTransactionType}
            date={date}
            time={time}
            timezone={txTimezone}
            onDate={setDate}
            onTime={setTime}
            onTimezone={setTxTimezone}
            items={itemsForSelector}
            itemsById={itemsById}
            assetItems={assetOnlyItems}
            liabilityItems={liabilityOnlyItems}
            settlementAssetItems={settlementAssetItems}
            settlementLiabilityItems={settlementLiabilityItems}
            settlementItems={settlementItemsForCounterparty}
            primaryItemId={primaryItemId}
            counterpartyItemId={counterpartyItemId}
            onPrimaryItem={setPrimaryItemId}
            onCounterpartyItem={setCounterpartyItemId}
            counterparties={selectableCounterparties}
            counterpartyId={counterpartyId}
            debtPayForCounterpartyId={debtPayForCounterpartyId}
            wherePaidCounterpartyId={wherePaidCounterpartyId}
            onCounterparty={setCounterpartyId}
            onPayFor={setDebtPayForCounterpartyId}
            onWherePaid={setWherePaidCounterpartyId}
            counterpartyName={buildCounterpartyName}
            debtSettlementMode={debtSettlementMode}
            onDebtSettlementMode={(value) => {
              setDebtSettlementMode(value);
              if (value === "existing") setDebtSettlementNewName("");
              else setDebtSettlementItemId(null);
            }}
            debtSettlementItemId={debtSettlementItemId}
            onDebtSettlementItem={setDebtSettlementItemId}
            debtSettlementNewName={debtSettlementNewName}
            onDebtSettlementNewName={setDebtSettlementNewName}
            loanTotalStr={loanTotalStr}
            loanInterestStr={loanInterestStr}
            onLoanTotal={setLoanTotalStr}
            onLoanInterest={setLoanInterestStr}
            amountStr={amountStr}
            amountCounterpartyStr={amountCounterpartyStr}
            debtAmountStr={debtAmountStr}
            debtSplitAmountStr={debtSplitAmountStr}
            onAmount={setAmountStr}
            onAmountCounterparty={setAmountCounterpartyStr}
            onDebtAmount={setDebtAmountStr}
            onDebtSplit={setDebtSplitAmountStr}
            primaryCurrency={primaryCurrencyCode}
            counterpartyCurrency={counterpartyCurrencyCode}
            debtCurrency={debtCurrencyCode}
            categoryOptions={categoryOptionsForOverlay}
            categoryLookup={categoryLookup}
            selectedCategory={selectedCategoryOption}
            onCategory={(path) => applyCategorySelection(path[0], path[1], path[2])}
            comment={comment}
            onComment={setComment}
            accountingStartDate={accountingStartDate}
            getItemDisplayBalanceCents={getItemDisplayBalanceCents}
            getItemCounterparty={getItemCounterparty}
            counterpartiesById={counterpartiesById}
          />
        )}

        {flowType === "SIMPLE" && step === 1 && (
          <div className={stepAnimClass}>
            <p className="text-[22px] font-medium leading-snug mb-6 flex items-center gap-2" style={{ color: ACTIVE_TEXT_DARK }}>Какую транзакцию хотите добавить?</p>
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

                }}
              />
              </MobileTapScale>
            </FormField>
          </div>
        )}

        {flowType === "SIMPLE" && step === 2 && (
          <div className={stepAnimClass}>
            <p className="text-[22px] font-medium leading-snug mb-6 flex items-center gap-2" style={{ color: ACTIVE_TEXT_DARK }}>Это доход, расход или перевод?</p>
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

                }}
              />
              </MobileTapScale>
            </FormField>
          </div>
        )}

        {flowType === "SIMPLE" && step === 3 && (
          <div className={stepAnimClass}>
            <p className="text-[22px] font-medium leading-snug mb-6 flex items-center gap-2" style={{ color: ACTIVE_TEXT_DARK }}>
              <Calendar className="h-5 w-5 shrink-0" />
              Выберите дату и время (по желанию)
            </p>
            <FormField label="" inlineLabel>
              <MobileTapScale className="block w-full">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative flex items-center min-h-[40px] shrink-0">
                  <DateInput
                    value={date}
                    onChange={(next) => {
                      setDate(next);

                    }}
                  />
                </div>
                <div className="relative flex items-center min-h-[40px] shrink-0">
                  <TimeInput
                    value={time}
                    onChange={setTime}
                  />
                </div>
              </div>
              </MobileTapScale>
            </FormField>
            <FormField label="Часовой пояс">
              <TimezoneSelector value={txTimezone} onChange={setTxTimezone} />
            </FormField>
          </div>
        )}

        {flowType === "SIMPLE" && step === 4 && (
          <div className={stepAnimClass}>
            <p className="text-[22px] font-medium leading-snug mb-6 flex items-center gap-2" style={{ color: ACTIVE_TEXT_DARK }}>
              <Wallet className="h-5 w-5 shrink-0" />
              {isTransfer ? "Откуда списать?" : "С какого актива?"}
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
          </div>
        )}

        {flowType === "SIMPLE" && step === STEP_ASSET_TO && isTransfer && (
          <div className={stepAnimClass}>
            <p className="text-[22px] font-medium leading-snug mb-6 flex items-center gap-2" style={{ color: ACTIVE_TEXT_DARK }}>
              <Wallet className="h-5 w-5 shrink-0" strokeWidth={1.5} />
              Куда зачислить?
            </p>
            <div className="grid gap-4">
              <FormField label="" inlineLabel>
                <MobileTapScale className="block w-full">
                  <MobileSearchSelectOverlay
                    value={counterpartyItemId != null ? itemsById.get(counterpartyItemId) ?? null : null}
                    options={counterpartySelectItems.filter((it) => it.id !== primaryItemId)}
                    getOptionLabel={(item) => item.name}
                    getOptionKey={(item) => item.id}
                    onSelect={(item) => setCounterpartyItemId(item.id)}
                    placeholder="Куда"
                    searchPlaceholder="Поиск актива"
                    renderTriggerContent={(item) => (
                      <>
                        <AssetItemIcon item={item} counterparty={getItemCounterparty(item.id)} apiBase={API_BASE} size={20} />
                        <span className="truncate">{item.name}</span>
                      </>
                    )}
                    renderOption={(item) => (
                      <div className="rounded-lg overflow-hidden border-0 outline-none shadow-lg p-4" style={{ backgroundColor: MODAL_BG }}>
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
              <button
                type="button"
                className="flex items-center justify-center gap-2 min-h-11 rounded-lg text-sm font-medium active:opacity-80"
                style={{ color: ACTIVE_TEXT_DARK, backgroundColor: "rgba(255,255,255,0.06)" }}
                onClick={() => {
                  setPrimaryItemId(counterpartyItemId);
                  setCounterpartyItemId(primaryItemId);
                  setAmountStr(amountCounterpartyStr);
                  setAmountCounterpartyStr(amountStr);
                }}
              >
                <ArrowUpDown className="h-4 w-4" strokeWidth={1.5} />
                Поменять местами
              </button>
              {counterpartyIsMoex && (
                <MobileTapScale className="block w-full">
                  <TextField
                    label="Количество лотов"
                    value={counterpartyQuantityLots}
                    onChange={(e) => setCounterpartyQuantityLots(e.target.value)}
                    inputMode="numeric"
                    placeholder="Например: 10"
                  />
                </MobileTapScale>
              )}
              {counterpartyIsCrypto && (
                <MobileTapScale className="block w-full">
                  <TextField
                    label="Количество (единиц)"
                    value={counterpartyQuantityUnitsStr}
                    onChange={(e) => setCounterpartyQuantityUnitsStr(e.target.value)}
                    inputMode="decimal"
                    placeholder="Например: 0.5"
                  />
                </MobileTapScale>
              )}
            </div>
            {formError && formErrorStep === STEP_ASSET_TO && (
              <div
                className="text-base rounded-md border p-2 mt-4"
                style={{ color: "#FB4C4F", backgroundColor: "rgba(251, 76, 79, 0.08)", borderColor: "rgba(251, 76, 79, 0.3)" }}
              >
                {formError}
              </div>
            )}
          </div>
        )}

        {flowType === "SIMPLE" && step === 5 && (
          <div className={stepAnimClass}>
            <p className="text-[22px] font-medium leading-snug mb-6 flex items-center gap-2" style={{ color: ACTIVE_TEXT_DARK }}>
              <Banknote className="h-5 w-5 shrink-0" strokeWidth={1.5} />
              Какая сумма?
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
          </div>
        )}

        {flowType === "SIMPLE" && step === 6 && !isTransfer && (
          <div className={stepAnimClass}>
            <p className="text-[22px] font-medium leading-snug mb-6 flex items-center gap-2" style={{ color: ACTIVE_TEXT_DARK }}>
              <Tag className="h-5 w-5 shrink-0" strokeWidth={1.5} />
              Какая категория?
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
          </div>
        )}

        {flowType === "SIMPLE" && step === 7 && !isTransfer && (
          <div className={stepAnimClass}>
            <p className="text-[22px] font-medium leading-snug mb-2 flex items-center gap-2" style={{ color: ACTIVE_TEXT_DARK }}>
              <User className="h-5 w-5 shrink-0" strokeWidth={1.5} />
              Контрагент
            </p>
            <p className="text-sm mb-6" style={{ color: PLACEHOLDER_COLOR_DARK }}>Можно пропустить</p>
          <FormField label="" inlineLabel>
            <MobileTapScale className="block w-full">
            <MobileSearchSelectOverlay
              value={counterpartyId != null ? counterpartiesById.get(counterpartyId) ?? null : null}
              options={selectableCounterparties}
              getOptionLabel={buildCounterpartyName}
              getOptionKey={(c) => c.id}
              onSelect={(c) => {
                setCounterpartyId(c.id);

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
          </div>
        )}

        {flowType === "SIMPLE" && step === 8 && (
          <div className={stepAnimClass}>
            <p className="text-[22px] font-medium leading-snug mb-2 flex items-center gap-2" style={{ color: ACTIVE_TEXT_DARK }}>
              <MessageSquare className="h-5 w-5 shrink-0" strokeWidth={1.5} />
              Комментарий
            </p>
            <p className="text-sm mb-6" style={{ color: PLACEHOLDER_COLOR_DARK }}>Можно пропустить</p>
          <FormField label="" inlineLabel>
            <MobileTapScale className="block w-full">
            <div className="relative [&_div.relative.flex.items-center]:h-10 [&_input]:!text-base">
              <AuthInput
                value={comment}
                onChange={(e) => setComment(e.target.value)}
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
          </div>
        )}

        {flowType === "SIMPLE" && step === 9 && !isTransfer && (
          <div className={stepAnimClass}>
            <p className="text-[22px] font-medium leading-snug mb-2 flex items-center gap-2" style={{ color: ACTIVE_TEXT_DARK }}>
              <Link2 className="h-5 w-5 shrink-0" strokeWidth={1.5} />
              Связанный актив
            </p>
            <p className="text-sm mb-6" style={{ color: PLACEHOLDER_COLOR_DARK }}>Можно пропустить</p>
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

                    }}
                    colorScheme="purple"
                  />
                </MobileTapScale>
              </FormField>
            )}
          </div>
          </div>
        )}

        {flowType === "SIMPLE" && step === 10 && (
          <div className={stepAnimClass}>
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
          <p className="text-[22px] font-medium leading-snug mb-2 flex items-center gap-2" style={{ color: ACTIVE_TEXT_DARK }}>
            <SplitSquareVertical className="h-5 w-5 shrink-0" strokeWidth={1.5} />
            Разделить транзакцию?
          </p>
          <p className="text-sm mb-6" style={{ color: PLACEHOLDER_COLOR_DARK }}>Можно оставить одной суммой</p>
          <div className="grid gap-4">
            <div className="flex w-full items-center justify-between gap-3 min-h-11">
              <span className="text-base" style={{ color: ACTIVE_TEXT_DARK }}>Разделить на несколько</span>
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
          </div>
        )}

        {flowType === "SIMPLE" && step === STEP_PREVIEW && (
          <div className={stepAnimClass}>
            <p className="text-[22px] font-medium leading-snug mb-2" style={{ color: "rgba(255,255,255,0.95)" }}>
              Проверьте транзакцию
            </p>
            <p className="text-sm mb-6" style={{ color: PLACEHOLDER_COLOR_DARK }}>
              Так она появится в списке
            </p>
            {formError && formErrorStep === STEP_PREVIEW && (
              <div
                className="text-base rounded-md border p-2 mb-4"
                style={{ color: "#FB4C4F", backgroundColor: "rgba(251, 76, 79, 0.08)", borderColor: "rgba(251, 76, 79, 0.3)" }}
              >
                {formError}
              </div>
            )}
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
              const relatedName = !isTransfer && relatedItemId != null ? itemsById.get(relatedItemId)?.name ?? null : null;
              const typeLabel = formTransactionType === "PLANNED" ? "Плановая" : "Фактическая";
              const linkLabel = relatedName ? ASSET_LINK_LABELS[effectiveAssetLinkType] ?? null : null;
              const splitCount = splitEnabled && !isTransfer
                ? splitParts.filter((p) => (parseRubToCents(normalizeRubOnBlur(p.amountStr)) ?? 0) > 0).length
                : 0;
              const previewRows: { label: string; value: string }[] = [
                { label: "Дата", value: formatWizardDateLabel(date, time) },
                { label: "Тип", value: typeLabel },
              ];
              if (relatedName) previewRows.push({ label: "Связанный актив", value: linkLabel ? `${relatedName} · ${linkLabel}` : relatedName });
              if (splitCount > 0) {
                const n10 = splitCount % 10;
                const n100 = splitCount % 100;
                const word =
                  n10 === 1 && n100 !== 11
                    ? "часть"
                    : n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)
                      ? "части"
                      : "частей";
                previewRows.push({ label: "Разделение", value: `${splitCount} ${word}` });
              }
              const primaryItem = primaryItemId ? itemsById.get(primaryItemId) ?? null : null;
              const counterpartyItem = counterpartyItemId ? itemsById.get(counterpartyItemId) ?? null : null;
              const primaryCounterparty = getItemCounterparty(primaryItemId);
              const counterpartyItemCounterparty = getItemCounterparty(counterpartyItemId);
              const CounterpartyFallbackIcon = previewCounterparty?.entity_type === "PERSON" ? User : Building2;
              return (
                <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-0 rounded-lg overflow-hidden min-w-0 w-full">
                  <div className="flex items-stretch rounded-lg min-w-0 w-full">
                    <div
                      className="shrink-0 rounded-l-lg"
                      style={{
                        width: 6,
                        backgroundColor: row1HighlightColor,
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
                <dl className="grid gap-3">
                  {previewRows.map((row) => (
                    <div key={row.label} className="flex items-baseline justify-between gap-4">
                      <dt className="text-sm shrink-0" style={{ color: PLACEHOLDER_COLOR_DARK }}>{row.label}</dt>
                      <dd className="text-sm text-right min-w-0" style={{ color: ACTIVE_TEXT_DARK }}>{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              );
            })()}
          </div>
        )}
        </div>
      </div>

      {isFieldFlow && progressIds.length > 0 && (
        <footer
          className="shrink-0 px-5 pt-3"
          style={{
            paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
            backgroundColor: "#000000",
          }}
        >
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              className="min-h-12 px-4 rounded-lg text-base font-medium"
              style={{ color: ACTIVE_TEXT_DARK, backgroundColor: "rgba(255,255,255,0.08)" }}
              disabled={submitting}
              onClick={goBack}
            >
              <ChevronLeft className="size-5" strokeWidth={1.5} />
              Назад
            </Button>
            <Button
              type="button"
              variant="authPrimary"
              className="min-h-12 flex-1 rounded-lg text-base font-medium"
              style={WIZARD_PRIMARY_BTN_STYLE}
              disabled={submitting}
              onClick={handleNextOrSubmit}
            >
              {nextLabel}
            </Button>
          </div>
        </footer>
      )}
    </div>
  );

  if (!mounted || typeof document === "undefined") return null;
  return createPortal(wizardContent, document.body);
}
