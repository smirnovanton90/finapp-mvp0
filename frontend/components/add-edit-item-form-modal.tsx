"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Camera, Upload, Wallet } from "lucide-react";
import { FormModal } from "@/components/form-modal";
import { CreateCounterpartyModal } from "@/components/create-counterparty-modal";
import { TextField, DateField, SelectField } from "@/components/ui/form-field";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ItemSelector } from "@/components/item-selector";
import { CounterpartySelector } from "@/components/counterparty-selector";
import { ChipsInput } from "@/components/ui/chips-input";
import { SegmentedSelector } from "@/components/ui/segmented-selector";
import { useAccountingStart } from "@/components/accounting-start-context";
import { ACCENT, ACTIVE_TEXT_DARK, BACKGROUND_DT, DROPDOWN_BG, PLACEHOLDER_COLOR_DARK, SIDEBAR_TEXT_ACTIVE, SIDEBAR_TEXT_INACTIVE } from "@/lib/colors";
import { cn } from "@/lib/utils";
import {
  fetchItems,
  fetchCounterparties,
  fetchCounterpartyIndustries,
  fetchMarketInstruments,
  fetchMarketInstrumentDetails,
  fetchMarketInstrumentPrice,
  fetchMarketInstrumentPrices,
  fetchTransactionChains,
  createItem,
  updateItem,
  uploadItemPhoto,
  createItemMarketValue,
  API_BASE,
  CardKind,
  ItemKind,
  ItemCreate,
  ItemOut,
  PrimaryValueKind,
  CounterpartyOut,
  CounterpartyIndustryOut,
  MarketBoardOut,
  MarketInstrumentOut,
  MarketPriceOut,
  TransactionChainOut,
  TransactionOut,
  TransactionChainFrequency,
  TransactionChainMonthlyRule,
  FirstPayoutRule,
  RepaymentType,
  PaymentAmountKind,
} from "@/lib/api";
import { formatRubInput, normalizeRubOnBlur, parseRubToCents } from "@/lib/format-rub";
import { formatAmount, getItemPhotoUrl } from "@/lib/item-utils";
import { getItemTypeLabel } from "@/lib/item-types";
import {
  getTodayDateKey,
  CASH_TYPES,
  ASSET_TYPES,
  LIABILITY_TYPES,
  MOEX_TYPE_CODES,
  ITEM_SECTIONS,
  COUNTERPARTY_TYPE_CODES,
  MANDATORY_COUNTERPARTY_TYPE_CODES,
  LOAN_LIABILITY_TYPES,
  AUTO_PLAN_INTEREST_TYPES,
  AUTO_PLAN_LOAN_TYPES,
  ASSET_TYPE_CODES,
  LIABILITY_TYPE_CODES,
  MAX_PHOTO_BYTES,
  MAX_PHOTO_DIM,
  ALLOWED_PHOTO_TYPES,
  formatSize,
  parseDateKey,
  addDays,
  toDateKey,
  findPriceOnOrBefore,
  PRIMARY_VALUE_KIND_OPTIONS,
  getDefaultPrimaryValueKind,
} from "@/lib/asset-item-form-constants";
import { TYPE_ICON_BY_CODE } from "@/lib/asset-type-icons";

export type AddEditItemFormModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (item: ItemOut) => void;
  editingItem: ItemOut | null;
  onClearEditingItem: () => void;
  initialCreateOptions?: { kind: ItemKind; typeCodes: string[]; general?: boolean; sectionId?: string } | null;
  askConfirm: (title: string, message: string) => Promise<boolean>;
  transactionsForEdit?: TransactionOut[];
  /** Если передано, модалка не подгружает список сама (например со страницы «Активы»). */
  items?: ItemOut[];
  /** @deprecated Не используется (модалка всегда открывается как FormModal без focus trap). Оставлено для обратной совместиости. */
  modal?: boolean;
  /** @deprecated Не используется. Оставлено для обратной совместиости. */
  overlayClassName?: string;
  /** @deprecated Не используется. Оставлено для обратной совместиости. */
  containerClassName?: string;
};

export function AddEditItemFormModal({
  open,
  onOpenChange,
  onSuccess,
  editingItem,
  onClearEditingItem,
  initialCreateOptions,
  askConfirm,
  transactionsForEdit = [],
  items: itemsProp,
}: AddEditItemFormModalProps) {
  const { accountingStartDate } = useAccountingStart();
  const [items, setItems] = useState<ItemOut[]>(itemsProp ?? []);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [kind, setKind] = useState<ItemKind>("ASSET");
  const [allowedTypeCodes, setAllowedTypeCodes] = useState<string[]>(CASH_TYPES);
  const [sectionId, setSectionId] = useState("");
  const [isGeneralCreate, setIsGeneralCreate] = useState(false);
  const [typeCode, setTypeCode] = useState("");
  const [currencyCode, setCurrencyCode] = useState("RUB");
  const [name, setName] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [marketValueStr, setMarketValueStr] = useState("");
  const [counterparties, setCounterparties] = useState<CounterpartyOut[]>([]);
  const [counterpartyId, setCounterpartyId] = useState<number | null>(null);
  const [counterpartyLoading, setCounterpartyLoading] = useState(false);
  const [counterpartyError, setCounterpartyError] = useState<string | null>(null);
  const [industries, setIndustries] = useState<CounterpartyIndustryOut[]>([]);
  const [openDate, setOpenDate] = useState(() => getTodayDateKey());
  const [createCounterpartyOpen, setCreateCounterpartyOpen] = useState(false);
  const dialogContentRef = useRef<HTMLDivElement | null>(null);
  const instrumentAnchorRef = useRef<HTMLDivElement | null>(null);
  const itemPhotoInputRef = useRef<HTMLInputElement | null>(null);

  const [instrumentQuery, setInstrumentQuery] = useState("");
  const [instrumentOptions, setInstrumentOptions] = useState<MarketInstrumentOut[]>([]);
  const [instrumentLoading, setInstrumentLoading] = useState(false);
  const [instrumentError, setInstrumentError] = useState<string | null>(null);
  const [instrumentDropdownOpen, setInstrumentDropdownOpen] = useState(false);
  const [selectedInstrument, setSelectedInstrument] = useState<MarketInstrumentOut | null>(null);
  const [instrumentDropdownStyle, setInstrumentDropdownStyle] = useState<CSSProperties | null>(null);
  const [instrumentBoards, setInstrumentBoards] = useState<MarketBoardOut[]>([]);
  const [instrumentBoardId, setInstrumentBoardId] = useState("");
  const [positionLots, setPositionLots] = useState("");
  const [moexPurchasePrice, setMoexPurchasePrice] = useState("");
  const [commissionEnabled, setCommissionEnabled] = useState(false);
  const [commissionAmount, setCommissionAmount] = useState("");
  const [commissionPaymentItemId, setCommissionPaymentItemId] = useState("");
  const [marketPrice, setMarketPrice] = useState<MarketPriceOut | null>(null);
  const [moexDatePrices, setMoexDatePrices] = useState<Record<string, MarketPriceOut | null>>({});
  const [moexDatePricesLoading, setMoexDatePricesLoading] = useState(false);
  const [accountLast7, setAccountLast7] = useState("");
  const [contractNumber, setContractNumber] = useState("");
  const [cardLast4, setCardLast4] = useState("");
  const [cardAccountId, setCardAccountId] = useState("");
  const [cardKind, setCardKind] = useState<CardKind>("DEBIT");
  const [creditLimit, setCreditLimit] = useState("");
  const [depositTermDays, setDepositTermDays] = useState("");
  const [interestRate, setInterestRate] = useState("");
  const [interestPayoutOrder, setInterestPayoutOrder] = useState("");
  const [interestCapitalization, setInterestCapitalization] = useState("");
  const [interestPayoutAccountId, setInterestPayoutAccountId] = useState("");
  const [planEnabled, setPlanEnabled] = useState(false);
  const [firstPayoutRule, setFirstPayoutRule] = useState<FirstPayoutRule | "">("");
  const [planEndDate, setPlanEndDate] = useState("");
  const [loanEndDate, setLoanEndDate] = useState("");
  const [repaymentFrequency, setRepaymentFrequency] = useState<TransactionChainFrequency>("MONTHLY");
  const [repaymentWeeklyDay, setRepaymentWeeklyDay] = useState<number>(() => (new Date().getDay() + 6) % 7);
  const [repaymentIntervalDays, setRepaymentIntervalDays] = useState("1");
  const [repaymentAccountId, setRepaymentAccountId] = useState("");
  const [repaymentType, setRepaymentType] = useState<RepaymentType | "">("");
  const [paymentAmountKind, setPaymentAmountKind] = useState<PaymentAmountKind | "">("");
  const [paymentAmountStr, setPaymentAmountStr] = useState("");
  const [openingCounterpartyId, setOpeningCounterpartyId] = useState("");
  const [primaryValueKind, setPrimaryValueKind] = useState<PrimaryValueKind>("BALANCE");
  const [synonyms, setSynonyms] = useState<string[]>([]);
  const [linkedChains, setLinkedChains] = useState<TransactionChainOut[]>([]);
  const [originalPlanSignature, setOriginalPlanSignature] = useState<string | null>(null);
  const [itemPhotoFile, setItemPhotoFile] = useState<File | null>(null);
  const [itemPhotoPreview, setItemPhotoPreview] = useState<string | null>(null);
  const [itemPhotoError, setItemPhotoError] = useState<string | null>(null);
  const [icon3dFormat, setIcon3dFormat] = useState<"png" | null>("png");
  const [show2dIcon, setShow2dIcon] = useState(false);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (itemsProp !== undefined) {
      setItems(itemsProp);
    } else {
      fetchItems({ includeArchived: true, includeClosed: true }).then(setItems).catch(() => setItems([]));
    }
  }, [open, itemsProp]);

  useEffect(() => {
    if (!open || !counterparties.length) return;
    setCounterpartyLoading(false);
  }, [open, counterparties.length]);
  useEffect(() => {
    if (!open) return;
    setCounterpartyLoading(true);
    setCounterpartyError(null);
    Promise.all([fetchCounterparties(), fetchCounterpartyIndustries()])
      .then(([cp, ind]) => {
        setCounterparties(cp);
        setIndustries(ind);
      })
      .catch((e: any) => setCounterpartyError(e?.message ?? null))
      .finally(() => setCounterpartyLoading(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (initialCreateOptions) {
      setKind(initialCreateOptions.kind);
      setAllowedTypeCodes(initialCreateOptions.typeCodes);
      setSectionId(initialCreateOptions.sectionId ?? "");
      setIsGeneralCreate(true);
      setTypeCode("");
      setCurrencyCode("RUB");
      setName("");
      setAmountStr("");
      setCounterpartyId(null);
      setOpenDate(getTodayDateKey());
      setPrimaryValueKind(getDefaultPrimaryValueKind("", initialCreateOptions.kind));
      setSynonyms([]);
      setMarketValueStr("");
    }
    if (editingItem) {
      setKind(editingItem.kind);
      setAllowedTypeCodes(editingItem.kind === "ASSET" ? ASSET_TYPE_CODES : LIABILITY_TYPE_CODES);
      setSectionId("");
      setIsGeneralCreate(true);
      setTypeCode(editingItem.type_code);
      setCurrencyCode(editingItem.currency_code);
      setName(editingItem.name);
      setAmountStr(formatAmount(editingItem.initial_value_rub));
      setCounterpartyId(editingItem.counterparty_id);
      setOpenDate(editingItem.open_date ?? getTodayDateKey());
      setInstrumentQuery(editingItem.instrument_id ? `${editingItem.instrument_id} - ${editingItem.name ?? ""}`.trim() : "");
      setInstrumentOptions([]);
      setSelectedInstrument(editingItem.instrument_id ? { secid: editingItem.instrument_id, provider: "MOEX", isin: null, short_name: editingItem.name, name: editingItem.name, type_code: editingItem.type_code, engine: null, market: null, default_board_id: editingItem.instrument_board_id, currency_code: editingItem.currency_code, lot_size: editingItem.lot_size, face_value_cents: editingItem.face_value_cents, is_traded: null } : null);
      setInstrumentBoardId(editingItem.instrument_board_id ?? "");
      setAccountLast7(editingItem.account_last7 ?? "");
      setContractNumber(editingItem.contract_number ?? "");
      setCardLast4(editingItem.card_last4 ?? "");
      setCardAccountId(editingItem.card_account_id ? String(editingItem.card_account_id) : "");
      setCardKind(editingItem.card_kind ?? "DEBIT");
      setCreditLimit(editingItem.credit_limit != null ? formatAmount(editingItem.credit_limit) : "");
      setDepositTermDays(editingItem.deposit_term_days != null ? String(editingItem.deposit_term_days) : "");
      setPositionLots(editingItem.position_lots != null ? String(editingItem.position_lots) : "");
      setMoexPurchasePrice("");
      const commissionTx = transactionsForEdit.find((tx) => tx.related_item_id === editingItem.id && tx.source === "AUTO_ITEM_COMMISSION");
      if (commissionTx) {
        setCommissionEnabled(true);
        setCommissionAmount(commissionTx.amount_rub != null ? formatAmount(commissionTx.amount_rub) : "");
        setCommissionPaymentItemId(commissionTx.primary_item_id != null ? String(commissionTx.primary_item_id) : "");
      } else {
        setCommissionEnabled(false);
        setCommissionAmount("");
        setCommissionPaymentItemId("");
      }
      setInterestRate(editingItem.interest_rate != null ? String(editingItem.interest_rate).replace(".", ",") : "");
      setInterestPayoutOrder(editingItem.interest_payout_order ?? "");
      setInterestCapitalization(editingItem.interest_capitalization == null ? "" : editingItem.interest_capitalization ? "true" : "false");
      setInterestPayoutAccountId(editingItem.interest_payout_account_id ? String(editingItem.interest_payout_account_id) : "");
      const ps = editingItem.plan_settings;
      setPlanEnabled(ps?.enabled ?? false);
      setFirstPayoutRule(ps?.first_payout_rule ?? "");
      setPlanEndDate(ps?.plan_end_date ?? "");
      setLoanEndDate(ps?.loan_end_date ?? "");
      setRepaymentFrequency(ps?.repayment_frequency ?? "MONTHLY");
      setRepaymentWeeklyDay(ps?.repayment_weekly_day ?? (new Date().getDay() + 6) % 7);
      setRepaymentIntervalDays(ps?.repayment_interval_days != null ? String(ps.repayment_interval_days) : "1");
      setRepaymentAccountId(ps?.repayment_account_id != null ? String(ps.repayment_account_id) : "");
      setRepaymentType(ps?.repayment_type ?? "");
      setPaymentAmountKind(ps?.payment_amount_kind ?? "");
      setPaymentAmountStr(ps?.payment_amount_rub != null ? formatAmount(ps.payment_amount_rub) : "");
      setOpeningCounterpartyId(editingItem.opening_counterparty_item_id != null ? String(editingItem.opening_counterparty_item_id) : "");
      setPrimaryValueKind(editingItem.primary_value_kind ?? getDefaultPrimaryValueKind(editingItem.type_code, editingItem.kind));
      setSynonyms(editingItem.synonyms ?? []);
      setMarketValueStr("");
      setOriginalPlanSignature(buildPlanSignatureFromItemModal(editingItem));
      setItemPhotoPreview(getItemPhotoUrl(editingItem, API_BASE));
      setItemPhotoFile(null);
      fetchTransactionChains({ linked_item_id: editingItem.id }).then((chains) => setLinkedChains((chains ?? []).filter((c) => !c.deleted_at))).catch(() => setLinkedChains([]));
    }
  }, [open, initialCreateOptions, editingItem, accountingStartDate, transactionsForEdit]);

  const sectionOptions = useMemo(
    () => ITEM_SECTIONS.filter((s) => s.kind === kind),
    [kind]
  );
  const sectionTypeCodes = useMemo(
    () => sectionOptions.find((s) => s.id === sectionId)?.typeCodes ?? [],
    [sectionOptions, sectionId]
  );
  const effectiveAllowedTypeCodes = isGeneralCreate ? sectionTypeCodes : allowedTypeCodes;
  const typeOptions = useMemo(() => {
    const base = kind === "ASSET" ? ASSET_TYPES : LIABILITY_TYPES;
    if (!effectiveAllowedTypeCodes.length) return isGeneralCreate ? [] : base;
    const allowed = new Set(effectiveAllowedTypeCodes);
    return base.filter((o) => allowed.has(o.code));
  }, [kind, effectiveAllowedTypeCodes, isGeneralCreate]);
  const showCounterpartyField = useMemo(
    () => COUNTERPARTY_TYPE_CODES.includes(typeCode),
    [typeCode]
  );
  const isCounterpartyMandatory = useMemo(
    () => MANDATORY_COUNTERPARTY_TYPE_CODES.includes(typeCode),
    [typeCode]
  );

  const isMoexType = useMemo(() => MOEX_TYPE_CODES.includes(typeCode), [typeCode]);

  // При создании предвыбираем «Основная стоимость» по выбранному виду актива/обязательства
  useEffect(() => {
    if (editingItem) return;
    setPrimaryValueKind(getDefaultPrimaryValueKind(typeCode || "", kind));
  }, [typeCode, kind, editingItem]);
  const moexLots = useMemo(() => {
    if (!isMoexType) return null;
    const rawLots = positionLots.replace(/\s/g, "");
    if (!rawLots) return null;
    const value = Number(rawLots);
    if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) return null;
    return value;
  }, [isMoexType, positionLots]);
  const moexPurchasePriceCents = useMemo(() => {
    if (!isMoexType) return null;
    const trimmed = moexPurchasePrice.trim();
    if (!trimmed) return null;
    const parsed = parseRubToCents(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0) return null;
    return parsed;
  }, [isMoexType, moexPurchasePrice]);
  const commissionAmountCents = useMemo(() => {
    const trimmed = commissionAmount.trim();
    if (!trimmed) return null;
    const parsed = parseRubToCents(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0) return null;
    return parsed;
  }, [commissionAmount]);
  const moexInitialValueCents = useMemo(() => {
    if (!isMoexType) return null;
    if (!marketPrice) return null;
    if (moexLots == null) return null;
    const lotSize = selectedInstrument?.lot_size ?? 1;
    const unitPrice = marketPrice.price_cents;
    if (unitPrice == null) return null;
    const accint = typeCode === "bonds" ? marketPrice.accint_cents ?? 0 : 0;
    return Math.round((unitPrice + accint) * moexLots * lotSize);
  }, [isMoexType, marketPrice, moexLots, selectedInstrument?.lot_size, typeCode]);
  const showLoanPlanSettings = useMemo(
    () => AUTO_PLAN_LOAN_TYPES.includes(typeCode),
    [typeCode]
  );
  const requiresLoanPaymentInput = useMemo(
    () => showLoanPlanSettings && kind === "ASSET",
    [showLoanPlanSettings, kind]
  );

  const itemsById = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items]
  );
  const showBankAccountFields = useMemo(
    () => typeCode === "bank_account" || typeCode === "savings_account",
    [typeCode]
  );
  const showBankCardFields = useMemo(() => typeCode === "bank_card", [typeCode]);
  const isCreditCard = useMemo(
    () => showBankCardFields && cardKind === "CREDIT",
    [showBankCardFields, cardKind]
  );
  const showDepositFields = useMemo(() => typeCode === "deposit", [typeCode]);
  const showInterestFields = useMemo(
    () => typeCode === "deposit" || typeCode === "savings_account",
    [typeCode]
  );
  const showPlanSection = useMemo(
    () =>
      AUTO_PLAN_INTEREST_TYPES.includes(typeCode) ||
      AUTO_PLAN_LOAN_TYPES.includes(typeCode),
    [typeCode]
  );
  const showInterestPlanSettings = useMemo(
    () => AUTO_PLAN_INTEREST_TYPES.includes(typeCode),
    [typeCode]
  );
  const showContractNumberField = useMemo(
    () =>
      typeCode === "bank_account" ||
      typeCode === "bank_card" ||
      typeCode === "deposit" ||
      typeCode === "savings_account",
    [typeCode]
  );
  const hideInitialAmountField =
    (showBankCardFields && Boolean(cardAccountId)) || isMoexType;
  const isLoanLiabilityType = useMemo(
    () => LOAN_LIABILITY_TYPES.includes(typeCode),
    [typeCode]
  );
  const resolvedHistoryStatus = useMemo(() => {
    if (openDate && accountingStartDate) {
      return openDate > accountingStartDate ? "NEW" : "HISTORICAL";
    }
    return editingItem?.history_status ?? null;
  }, [openDate, accountingStartDate, editingItem]);
  const normalizedAmountValue = hideInitialAmountField
    ? amountStr.trim() || "0"
    : amountStr;
  const amountCentsForSubmit = useMemo(() => {
    if (isMoexType) return moexInitialValueCents ?? NaN;
    return parseRubToCents(normalizedAmountValue);
  }, [isMoexType, moexInitialValueCents, normalizedAmountValue]);
  const hasNonZeroAmount = Number.isFinite(amountCentsForSubmit) && amountCentsForSubmit !== 0;
  const hasNonZeroLots = moexLots != null && moexLots > 0;
  const showOpeningCounterparty =
    (primaryValueKind === "BALANCE" ||
      primaryValueKind === "ACQUISITION" ||
      primaryValueKind === "INVESTED" ||
      primaryValueKind === "MARKET") &&
    (resolvedHistoryStatus === "NEW" ? (isMoexType ? hasNonZeroLots : hasNonZeroAmount) : true);
  const showMoexCommission =
    isMoexType && kind === "ASSET" && resolvedHistoryStatus === "NEW" && hasNonZeroLots;
  const commissionAllowed = showMoexCommission;

  function buildPlanSignatureFromItemModal(item: ItemOut): string {
    const settings = item.plan_settings ?? null;
    return JSON.stringify({
      item: {
        kind: item.kind,
        typeCode: item.type_code,
        currencyCode: item.currency_code,
        initialValue: item.initial_value_rub,
        openDate: item.open_date ?? null,
        depositTermDays: item.deposit_term_days ?? null,
        interestRate: item.interest_rate != null ? String(item.interest_rate) : null,
        interestPayoutOrder: item.interest_payout_order ?? null,
        interestCapitalization: item.interest_capitalization == null ? null : String(item.interest_capitalization),
        interestPayoutAccountId: item.interest_payout_account_id ?? null,
        startDate: item.start_date,
      },
      plan: {
        enabled: settings?.enabled ?? false,
        firstPayoutRule: settings?.first_payout_rule ?? null,
        planEndDate: settings?.plan_end_date ?? null,
        loanEndDate: settings?.loan_end_date ?? null,
        repaymentFrequency: settings?.repayment_frequency ?? null,
        repaymentWeeklyDay: settings?.repayment_weekly_day ?? null,
        repaymentIntervalDays: settings?.repayment_interval_days ?? null,
        repaymentAccountId: settings?.repayment_account_id ?? null,
        repaymentType: settings?.repayment_type ?? null,
        paymentAmountKind: item.kind === "ASSET" ? settings?.payment_amount_kind ?? null : null,
        paymentAmountRub: item.kind === "ASSET" ? settings?.payment_amount_rub ?? null : null,
      },
    });
  }

  function buildPlanSignatureFromStateModal(): string {
    const amountCents = isMoexType ? moexInitialValueCents ?? NaN : parseRubToCents(amountStr);
    const paymentAmountCents = parseRubToCents(paymentAmountStr);
    const planStartDate =
      accountingStartDate ?? editingItem?.start_date ?? getTodayDateKey();
    return JSON.stringify({
      item: {
        kind,
        typeCode,
        currencyCode,
        initialValue: Number.isFinite(amountCents) ? amountCents : null,
        openDate: openDate || null,
        depositTermDays: depositTermDays ? Number(depositTermDays) : null,
        interestRate: interestRate ? interestRate.trim() : null,
        interestPayoutOrder: interestPayoutOrder || null,
        interestCapitalization: interestCapitalization || null,
        interestPayoutAccountId: interestPayoutAccountId
          ? Number(interestPayoutAccountId)
          : null,
        startDate: planStartDate,
      },
      plan: {
        enabled: planEnabled,
        firstPayoutRule: firstPayoutRule || null,
        planEndDate: planEndDate || null,
        loanEndDate: loanEndDate || null,
        repaymentFrequency: repaymentFrequency || null,
        repaymentWeeklyDay: repaymentFrequency === "WEEKLY" ? repaymentWeeklyDay : null,
        repaymentIntervalDays:
          repaymentFrequency === "REGULAR" && repaymentIntervalDays.trim()
            ? Number(repaymentIntervalDays)
            : null,
        repaymentAccountId: repaymentAccountId ? Number(repaymentAccountId) : null,
        repaymentType: repaymentType || null,
        paymentAmountKind: requiresLoanPaymentInput ? paymentAmountKind || null : null,
        paymentAmountRub: requiresLoanPaymentInput && Number.isFinite(paymentAmountCents)
          ? paymentAmountCents
          : null,
      },
    });
  }

  const resetForm = useCallback(() => {
    setTypeCode("");
    setCurrencyCode("RUB");
    setName("");
    setAmountStr("");
    setCounterpartyId(null);
    setOpenDate(getTodayDateKey());
    setFormError(null);
    setInstrumentQuery("");
    setInstrumentOptions([]);
    setSelectedInstrument(null);
    setInstrumentBoards([]);
    setInstrumentBoardId("");
    setPositionLots("");
    setMoexPurchasePrice("");
    setCommissionEnabled(false);
    setCommissionAmount("");
    setCommissionPaymentItemId("");
    setMarketPrice(null);
    setMoexDatePrices({});
    setAccountLast7("");
    setContractNumber("");
    setCardLast4("");
    setCardAccountId("");
    setCardKind("DEBIT");
    setCreditLimit("");
    setDepositTermDays("");
    setInterestRate("");
    setInterestPayoutOrder("");
    setInterestCapitalization("");
    setInterestPayoutAccountId("");
    setPlanEnabled(false);
    setFirstPayoutRule("");
    setPlanEndDate("");
    setLoanEndDate("");
    setRepaymentFrequency("MONTHLY");
    setRepaymentWeeklyDay((new Date().getDay() + 6) % 7);
    setRepaymentIntervalDays("1");
    setRepaymentAccountId("");
    setRepaymentType("");
    setPaymentAmountKind("");
    setPaymentAmountStr("");
    setOpeningCounterpartyId("");
    setMarketValueStr("");
    setSynonyms([]);
    setLinkedChains([]);
    setOriginalPlanSignature(null);
    if (itemPhotoPreview?.startsWith("blob:")) URL.revokeObjectURL(itemPhotoPreview);
    setItemPhotoFile(null);
    setItemPhotoPreview(null);
    setItemPhotoError(null);
    if (itemPhotoInputRef.current) itemPhotoInputRef.current.value = "";
    setIcon3dFormat("png");
    setShow2dIcon(false);
    setIsRightPanelOpen(false);
  }, []);

  const handleItemPhotoChange = useCallback((file: File | null) => {
    setItemPhotoError(null);
    if (itemPhotoPreview?.startsWith("blob:")) URL.revokeObjectURL(itemPhotoPreview);
    const getEditingPhoto = () => getItemPhotoUrl(editingItem ?? null, API_BASE);
    if (!file) {
      setItemPhotoFile(null);
      setItemPhotoPreview(getEditingPhoto());
      return;
    }
    if (!(ALLOWED_PHOTO_TYPES as readonly string[]).includes(file.type)) {
      setItemPhotoError("Разрешены PNG, JPG или WEBP.");
      setItemPhotoFile(null);
      setItemPhotoPreview(getEditingPhoto());
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setItemPhotoError(`Размер фотографии не больше ${formatSize(MAX_PHOTO_BYTES)}.`);
      setItemPhotoFile(null);
      setItemPhotoPreview(getEditingPhoto());
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      if (image.width > MAX_PHOTO_DIM || image.height > MAX_PHOTO_DIM) {
        setItemPhotoError(`Разрешение не больше ${MAX_PHOTO_DIM}px.`);
        URL.revokeObjectURL(objectUrl);
        setItemPhotoFile(null);
        setItemPhotoPreview(getEditingPhoto());
        return;
      }
      setItemPhotoFile(file);
      setItemPhotoPreview(objectUrl);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      setItemPhotoError("Не удалось прочитать изображение.");
      setItemPhotoFile(null);
      setItemPhotoPreview(getEditingPhoto());
    };
    image.src = objectUrl;
  }, [editingItem, itemPhotoPreview]);

  useEffect(() => {
    if (!open || !isMoexType) {
      setInstrumentOptions([]);
      return;
    }
    const query = instrumentQuery.trim().toLowerCase();
    if (!query) {
      setInstrumentOptions([]);
      setInstrumentLoading(false);
      setInstrumentError(null);
      return;
    }
    let cancelled = false;
    setInstrumentLoading(true);
    setInstrumentError(null);
    const handle = setTimeout(() => {
      fetchMarketInstruments({ q: query, type_code: typeCode, limit: 20 })
        .then((results) => {
          if (cancelled) return;
          setInstrumentOptions(results);
        })
        .catch((e: any) => {
          if (cancelled) return;
          setInstrumentError(e?.message ?? "Не удалось загрузить инструменты.");
        })
        .finally(() => {
          if (cancelled) return;
          setInstrumentLoading(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [open, instrumentQuery, isMoexType, typeCode]);

  useEffect(() => {
    if (!selectedInstrument) {
      setInstrumentBoards([]);
      setInstrumentBoardId("");
      setMarketPrice(null);
      return;
    }
    let active = true;
    fetchMarketInstrumentDetails(selectedInstrument.secid)
      .then((data) => {
        if (!active) return;
        setInstrumentBoards(data.boards ?? []);
        const defaultBoard =
          data.instrument.default_board_id || data.boards?.[0]?.board_id || "";
        if (!instrumentBoardId) {
          setInstrumentBoardId(defaultBoard);
        } else if (
          data.boards?.length &&
          !data.boards.some((board: MarketBoardOut) => board.board_id === instrumentBoardId)
        ) {
          setInstrumentBoardId(defaultBoard);
        }
        if (!name.trim()) {
          const nextName = data.instrument.short_name || data.instrument.name || "";
          if (nextName) setName(nextName);
        }
        if (data.instrument.currency_code) {
          setCurrencyCode(data.instrument.currency_code);
        }
      })
      .catch(() => {
        if (!active) return;
        setInstrumentBoards([]);
      });
    return () => {
      active = false;
    };
  }, [selectedInstrument, instrumentBoardId, name]);

  const updateInstrumentDropdownPosition = useCallback(() => {
    const anchor = instrumentAnchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const container = anchor.closest('[data-slot="dialog-content"]');
    const containerRect = container?.getBoundingClientRect();
    const containerTop = containerRect ? containerRect.top : 0;
    const containerBottom = containerRect
      ? containerRect.bottom
      : window.innerHeight;
    const padding = 8;
    const maxHeight = 256;
    const spaceBelow = containerBottom - rect.bottom - padding;
    const spaceAbove = rect.top - containerTop - padding;
    const openUp = spaceBelow < 200 && spaceAbove > spaceBelow;
    const availableSpace = Math.max(0, openUp ? spaceAbove : spaceBelow);
    const height = Math.min(maxHeight, availableSpace);
    const resolvedHeight = height > 0 ? height : maxHeight;
    setInstrumentDropdownStyle({
      position: "absolute",
      top: openUp ? "auto" : "calc(100% + 4px)",
      bottom: openUp ? "calc(100% + 4px)" : "auto",
      left: 0,
      right: 0,
      maxHeight: resolvedHeight,
      zIndex: 50,
    });
  }, []);

  useLayoutEffect(() => {
    if (!instrumentDropdownOpen) return;
    updateInstrumentDropdownPosition();
  }, [instrumentDropdownOpen, updateInstrumentDropdownPosition, instrumentOptions.length]);

  useEffect(() => {
    if (!instrumentDropdownOpen) return;
    const handle = () => updateInstrumentDropdownPosition();
    window.addEventListener("resize", handle);
    window.addEventListener("scroll", handle, true);
    return () => {
      window.removeEventListener("resize", handle);
      window.removeEventListener("scroll", handle, true);
    };
  }, [instrumentDropdownOpen, updateInstrumentDropdownPosition]);

  useEffect(() => {
    if (!selectedInstrument || !instrumentBoardId) {
      setMarketPrice(null);
      return;
    }
    let active = true;
    fetchMarketInstrumentPrice(selectedInstrument.secid, instrumentBoardId)
      .then((price) => {
        if (!active) return;
        setMarketPrice(price);
      })
      .catch(() => {
        if (!active) return;
        setMarketPrice(null);
      });
    return () => {
      active = false;
    };
  }, [selectedInstrument, instrumentBoardId]);

  useEffect(() => {
    if (!isMoexType || kind !== "ASSET") {
      setMoexDatePrices({});
      setMoexDatePricesLoading(false);
      return;
    }
    if (!selectedInstrument || !instrumentBoardId || !openDate) {
      setMoexDatePrices({});
      setMoexDatePricesLoading(false);
      return;
    }
    const targetDates = new Set<string>();
    targetDates.add(openDate);
    if (accountingStartDate) targetDates.add(accountingStartDate);
    const targetList = Array.from(targetDates).sort();
    if (targetList.length === 0) {
      setMoexDatePrices({});
      setMoexDatePricesLoading(false);
      return;
    }
    const minKey = targetList[0];
    const maxKey = targetList[targetList.length - 1];
    const todayKey = getTodayDateKey();
    const toKey = maxKey > todayKey ? todayKey : maxKey;
    if (!toKey || minKey > toKey) {
      setMoexDatePrices({});
      setMoexDatePricesLoading(false);
      return;
    }
    const historyFromKey = toDateKey(addDays(parseDateKey(minKey), -14));
    let cancelled = false;
    setMoexDatePrices({});
    setMoexDatePricesLoading(true);
    fetchMarketInstrumentPrices(selectedInstrument.secid, {
      from: historyFromKey,
      to: toKey,
      boardId: instrumentBoardId,
    })
      .then((prices) => {
        if (cancelled) return;
        const byDate: Record<string, MarketPriceOut> = {};
        prices.forEach((price: MarketPriceOut) => {
          byDate[price.price_date] = price;
        });
        const sortedDates = Object.keys(byDate).sort();
        const resolved: Record<string, MarketPriceOut | null> = {};
        targetList.forEach((dateKey) => {
          if (dateKey > todayKey) {
            resolved[dateKey] = null;
            return;
          }
          resolved[dateKey] = sortedDates.length
            ? findPriceOnOrBefore(byDate, sortedDates, dateKey)
            : null;
        });
        setMoexDatePrices(resolved);
      })
      .catch(() => {
        if (cancelled) return;
        setMoexDatePrices({});
      })
      .finally(() => {
        if (!cancelled) setMoexDatePricesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accountingStartDate, instrumentBoardId, isMoexType, kind, openDate, selectedInstrument]);

  useEffect(() => {
    if (!showPlanSection) {
      setPlanEnabled(false);
      setFirstPayoutRule("");
      setPlanEndDate("");
      setLoanEndDate("");
    }
  }, [showPlanSection]);

  useEffect(() => {
    if (!showLoanPlanSettings) return;
    if (loanEndDate && planEndDate) {
      setPlanEndDate("");
    }
  }, [loanEndDate, planEndDate, showLoanPlanSettings]);

  useEffect(() => {
    if (!requiresLoanPaymentInput) {
      if (paymentAmountKind) setPaymentAmountKind("");
      if (paymentAmountStr) setPaymentAmountStr("");
    }
  }, [requiresLoanPaymentInput, paymentAmountKind, paymentAmountStr]);

  useEffect(() => {
    if (!showMoexCommission) {
      if (commissionEnabled) setCommissionEnabled(false);
    }
  }, [showMoexCommission, commissionEnabled]);

  useEffect(() => {
    if (!showOpeningCounterparty || !openingCounterpartyId) return;
    const id = Number(openingCounterpartyId);
    if (!Number.isFinite(id)) return;
    const item = itemsById.get(id);
    if (!item) return;
    if (item.currency_code !== currencyCode) {
      setOpeningCounterpartyId("");
    }
  }, [showOpeningCounterparty, openingCounterpartyId, itemsById, currencyCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (isGeneralCreate && !sectionId) {
      setFormError("Выберите раздел.");
      return;
    }
    if (!typeCode) {
      setFormError("Выберите вид.");
      return;
    }
    if (!name.trim()) {
      setFormError("Название не может быть пустым");
      return;
    }
    if (!currencyCode) {
      setFormError("Выберите валюту.");
      return;
    }
    if (isMoexType) {
      if (!selectedInstrument) {
        setFormError("Выберите инструмент MOEX.");
        return;
      }
      if (!instrumentBoardId) {
        setFormError("Выберите торговый режим.");
        return;
      }
      const trimmedLots = positionLots.trim();
      if (!trimmedLots) {
        setFormError("Укажите количество лотов.");
        return;
      }
      const cleanedLots = trimmedLots.replace(/\s/g, "");
      const parsedLots = Number(cleanedLots);
      if (!Number.isFinite(parsedLots) || parsedLots < 0 || !Number.isInteger(parsedLots)) {
        setFormError("Количество лотов должно быть целым неотрицательным числом.");
        return;
      }
      if (resolvedHistoryStatus === "NEW" && moexPurchasePrice.trim()) {
        const parsedPrice = parseRubToCents(moexPurchasePrice);
        if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
          setFormError("Цена покупки должна быть числом (например: 123,45).");
          return;
        }
      }
      if (commissionEnabled) {
        if (!commissionAllowed) {
          setFormError("Комиссию можно указать только при количестве лотов больше 0.");
          return;
        }
        if (!commissionPaymentItemId) {
          setFormError("Укажите счет оплаты комиссии.");
          return;
        }
        if (!commissionAmountCents || commissionAmountCents <= 0) {
          setFormError("Сумма комиссии должна быть больше 0.");
          return;
        }
        const paymentItem = itemsById.get(Number(commissionPaymentItemId));
        if (!paymentItem || paymentItem.archived_at || paymentItem.closed_at) {
          setFormError("Счет оплаты комиссии не найден.");
          return;
        }
        if (paymentItem.instrument_id) {
          setFormError("Оплата комиссии должна быть с не-MOEX счета.");
          return;
        }
      }
    }

    const todayKey = getTodayDateKey();
    if (!openDate) {
      setFormError("Укажите дату появления.");
      return;
    }
    if (openDate > todayKey) {
      setFormError("Дата появления не может быть позже сегодняшней даты.");
      return;
    }
    const needsOpeningSource =
      resolvedHistoryStatus === "NEW" &&
      (primaryValueKind === "BALANCE" ||
        primaryValueKind === "ACQUISITION" ||
        primaryValueKind === "INVESTED" ||
        primaryValueKind === "MARKET") &&
      (isMoexType ? hasNonZeroLots : hasNonZeroAmount);
    if (needsOpeningSource && !openingCounterpartyId) {
      setFormError("Укажите источник средств.");
      return;
    }
    const isMarketNonMoex = primaryValueKind === "MARKET" && !isMoexType;
    if (
      resolvedHistoryStatus === "NEW" &&
      isMarketNonMoex &&
      (!marketValueStr.trim() || !Number.isFinite(parseRubToCents(marketValueStr)) || parseRubToCents(marketValueStr) < 0)
    ) {
      setFormError("Укажите рыночную стоимость.");
      return;
    }
    if (
      resolvedHistoryStatus === "NEW" &&
      isMarketNonMoex &&
      (!amountStr.trim() || !Number.isFinite(parseRubToCents(amountStr)) || parseRubToCents(amountStr) < 0)
    ) {
      setFormError("Укажите стоимость приобретения.");
      return;
    }

    const trimmedAccountLast7 = accountLast7.trim();
    const trimmedContractNumber = contractNumber.trim();
    const trimmedCardLast4 = cardLast4.trim();
    const trimmedInterestRate = interestRate.trim();

    if (showBankAccountFields && trimmedAccountLast7 && !/^\d{7}$/.test(trimmedAccountLast7)) {
      setFormError("Последние 7 цифр номера счета должны содержать ровно 7 цифр.");
      return;
    }
    if (showBankCardFields && trimmedCardLast4 && !/^\d{4}$/.test(trimmedCardLast4)) {
      setFormError("Последние 4 цифры номера карты должны содержать ровно 4 цифры.");
      return;
    }
    if (isCounterpartyMandatory && !counterpartyId) {
      setFormError("Укажите контрагента.");
      return;
    }
    if (showBankCardFields && !isCreditCard && cardAccountId) {
      const linkedAccount = itemsById.get(Number(cardAccountId));
      if (!linkedAccount) {
        setFormError("Привязанный счет не найден.");
        return;
      }
      if (!counterpartyId) {
        setFormError("Укажите контрагента карты.");
        return;
      }
      if (linkedAccount.counterparty_id !== counterpartyId) {
        setFormError("Контрагент карты должен совпадать с контрагентом счета.");
        return;
      }
      if (linkedAccount.currency_code !== currencyCode) {
        setFormError("Валюта карты должна совпадать с валютой счета.");
        return;
      }
    }

    let depositTermDaysValue: number | null = null;
    if (showDepositFields && depositTermDays.trim()) {
      const parsed = Number(depositTermDays);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setFormError("Срок вклада должен быть положительным числом.");
        return;
      }
      depositTermDaysValue = Math.trunc(parsed);
    }

    let interestRateValue: number | null = null;
    const shouldParseInterestRate = showInterestFields || showLoanPlanSettings;
    if (shouldParseInterestRate && trimmedInterestRate) {
      const parsed = Number(trimmedInterestRate.replace(",", "."));
      if (!Number.isFinite(parsed) || parsed < 0) {
        setFormError("Процентная ставка должна быть числом.");
        return;
      }
      interestRateValue = parsed;
    }

    let creditLimitCents: number | null = null;
    if (showBankCardFields && cardKind === "CREDIT") {
      const trimmedCreditLimit = creditLimit.trim();
      if (!trimmedCreditLimit) {
        setFormError("Укажите кредитный лимит для кредитной карты.");
        return;
      }
      const parsedLimit = parseRubToCents(trimmedCreditLimit);
      if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
        setFormError("Кредитный лимит должен быть больше нуля.");
        return;
      }
      creditLimitCents = parsedLimit;
    }

    const cents = amountCentsForSubmit;
    if (isMoexType && moexInitialValueCents == null) {
      setFormError("Не удалось рассчитать сумму по текущей цене.");
      return;
    }
    if (
      !Number.isFinite(cents) ||
      (cents < 0 && !(showBankCardFields && cardKind === "CREDIT"))
    ) {
      setFormError("Сумма должна быть числом (например 1234,56)");
      return;
    }
    if (
      showBankCardFields &&
      cardKind === "CREDIT" &&
      creditLimitCents !== null &&
      cents < -creditLimitCents
    ) {
      setFormError("Сумма не может быть ниже кредитного лимита.");
      return;
    }

    const normalizedIntervalDays = repaymentIntervalDays.trim();
    const intervalDaysValue =
      normalizedIntervalDays && Number.isFinite(Number(normalizedIntervalDays))
        ? Math.trunc(Number(normalizedIntervalDays))
        : null;
    const paymentAmountCents = parseRubToCents(paymentAmountStr);

    if (planEnabled && !showPlanSection) {
      setFormError("Для выбранного вида нельзя настроить плановые транзакции.");
      return;
    }
    if (planEnabled && showInterestPlanSettings) {
      if (interestRateValue === null) {
        setFormError("Укажите процентную ставку для расчета процентов.");
        return;
      }
      if (!openDate) {
        setFormError("Укажите дату открытия для расчета процентов.");
        return;
      }
      if (!interestPayoutOrder) {
        setFormError("Выберите порядок выплаты процентов.");
        return;
      }
      if (interestPayoutOrder === "MONTHLY" && !firstPayoutRule) {
        setFormError("Выберите правило первой даты выплаты процентов.");
        return;
      }
      if (typeCode === "deposit" && depositTermDaysValue === null) {
        setFormError("Для вклада нужен срок для расчета процентов.");
        return;
      }
      if (typeCode === "savings_account" && !planEndDate) {
        setFormError("Для накопительного счета нужен горизонт планирования.");
        return;
      }
      if (interestCapitalization !== "true" && !interestPayoutAccountId) {
        setFormError("Укажите счет выплаты процентов или включите капитализацию.");
        return;
      }
    }
    if (planEnabled && showLoanPlanSettings) {
      if (interestRateValue === null) {
        setFormError("Укажите процентную ставку по кредиту или займу.");
        return;
      }
      if (isLoanLiabilityType && !openDate) {
        setFormError("Укажите дату появления обязательства.");
        return;
      }
      if (!repaymentAccountId) {
        setFormError("Выберите счет погашения.");
        return;
      }
      if (!repaymentFrequency) {
        setFormError("Выберите периодичность погашения.");
        return;
      }
      if (repaymentFrequency === "MONTHLY" && !firstPayoutRule) {
        setFormError("Выберите правило первой даты погашения.");
        return;
      }
      if (repaymentFrequency === "REGULAR") {
        if (!intervalDaysValue || intervalDaysValue < 1) {
          setFormError("Укажите интервал в днях.");
          return;
        }
      }
      if (!loanEndDate && !planEndDate) {
        setFormError(
          "Укажите плановую дату погашения или дату окончания создания плановых транзакций."
        );
        return;
      }
      if (requiresLoanPaymentInput) {
        if (!paymentAmountKind) {
          setFormError("Укажите тип суммы погашения.");
          return;
        }
        if (!Number.isFinite(paymentAmountCents) || paymentAmountCents <= 0) {
          setFormError("Сумма погашения должна быть больше нуля.");
          return;
        }
      }
    }
    if (
      planEnabled &&
      showInterestPlanSettings &&
      interestCapitalization !== "true" &&
      interestPayoutAccountId
    ) {
      const payoutAccount = itemsById.get(Number(interestPayoutAccountId));
      if (!payoutAccount) {
        setFormError("Счет выплаты процентов не найден.");
        return;
      }
      if (payoutAccount.kind !== "ASSET") {
        setFormError("Счет выплаты процентов должен быть активом.");
        return;
      }
      if (payoutAccount.currency_code !== currencyCode) {
        setFormError(
          "Валюта счета выплаты процентов должна совпадать с валютой вклада или счета."
        );
        return;
      }
    }
    if (planEnabled && showLoanPlanSettings && repaymentAccountId) {
      const repaymentAccount = itemsById.get(Number(repaymentAccountId));
      if (!repaymentAccount) {
        setFormError("Счет погашения не найден.");
        return;
      }
      if (!CASH_TYPES.includes(repaymentAccount.type_code)) {
        setFormError("Счет погашения должен быть денежным активом.");
        return;
      }
      if (repaymentAccount.currency_code !== currencyCode) {
        setFormError("Валюта счета погашения должна совпадать с валютой кредита или займа.");
        return;
      }
    }

    setLoading(true);
    try {
      const openingCounterpartyValue =
        showOpeningCounterparty && openingCounterpartyId
          ? Number(openingCounterpartyId)
          : null;
      const synonymsList = synonyms.map((s) => s.trim()).filter((s) => s.length > 0);
      const payload: ItemCreate = {
        kind,
        type_code: typeCode,
        name: name.trim(),
        currency_code: currencyCode,
        counterparty_id: showCounterpartyField ? counterpartyId : null,
        open_date: openDate,
        opening_counterparty_item_id: openingCounterpartyValue,
        initial_value_rub: cents,
        primary_value_kind: primaryValueKind,
      };
      if (synonymsList.length > 0) payload.synonyms = synonymsList;

      if (isMoexType && selectedInstrument) {
        payload.instrument_id = selectedInstrument.secid;
        payload.instrument_board_id = instrumentBoardId || null;
        payload.position_lots = Number(positionLots.replace(/\s/g, ""));
        if (
          resolvedHistoryStatus === "NEW" &&
          moexPurchasePrice.trim() &&
          moexPurchasePriceCents != null
        ) {
          payload.opening_price_cents = moexPurchasePriceCents;
        }
        payload.commission_enabled = commissionEnabled;
        if (commissionEnabled) {
          payload.commission_amount_rub = commissionAmountCents ?? null;
          payload.commission_payment_item_id = commissionPaymentItemId
            ? Number(commissionPaymentItemId)
            : null;
        }
      }

      if (showBankAccountFields) {
        if (trimmedAccountLast7) payload.account_last7 = trimmedAccountLast7;
      }
      if (showContractNumberField && trimmedContractNumber) {
        payload.contract_number = trimmedContractNumber;
      }
      if (showBankCardFields) {
        if (trimmedCardLast4) payload.card_last4 = trimmedCardLast4;
        payload.card_account_id = isCreditCard
          ? null
          : cardAccountId
          ? Number(cardAccountId)
          : null;
        payload.card_kind = cardKind;
        if (cardKind === "CREDIT" && creditLimitCents !== null) {
          payload.credit_limit = creditLimitCents;
        }
      }
      if (showDepositFields && depositTermDaysValue !== null) {
        payload.deposit_term_days = depositTermDaysValue;
      }
      if (showInterestFields || showLoanPlanSettings) {
        if (interestRateValue !== null) payload.interest_rate = interestRateValue;
      }
      if (showInterestFields) {
        if (interestPayoutOrder) {
          payload.interest_payout_order = interestPayoutOrder as "END_OF_TERM" | "MONTHLY";
        }
        if (interestCapitalization === "true") payload.interest_capitalization = true;
        if (interestCapitalization === "false") payload.interest_capitalization = false;
        if (interestPayoutAccountId) {
          payload.interest_payout_account_id = Number(interestPayoutAccountId);
        }
      }

      const shouldSendPlanSettings =
        planEnabled || (editingItem?.plan_settings?.enabled ?? false);
      if (shouldSendPlanSettings) {
        let repaymentMonthlyDay: number | null = null;
        let repaymentMonthlyRule: TransactionChainMonthlyRule | null = null;
        if (
          planEnabled &&
          showLoanPlanSettings &&
          repaymentFrequency === "MONTHLY" &&
          firstPayoutRule
        ) {
          if (firstPayoutRule === "MONTH_END") {
            repaymentMonthlyRule = "LAST_DAY";
          } else {
            const baseDate = new Date(`${openDate}T00:00:00`);
            if (!Number.isNaN(baseDate.getTime())) {
              repaymentMonthlyDay = baseDate.getDate();
            }
          }
        }
        const planSettings = {
          enabled: planEnabled,
          first_payout_rule:
            planEnabled &&
            ((showInterestPlanSettings && interestPayoutOrder === "MONTHLY") ||
              (showLoanPlanSettings && repaymentFrequency === "MONTHLY"))
              ? (firstPayoutRule as FirstPayoutRule)
              : null,
          plan_end_date: planEnabled ? (planEndDate || null) : null,
          loan_end_date: planEnabled ? (loanEndDate || null) : null,
          repayment_frequency:
            planEnabled && showLoanPlanSettings ? repaymentFrequency : null,
          repayment_weekly_day:
            planEnabled && showLoanPlanSettings && repaymentFrequency === "WEEKLY"
              ? repaymentWeeklyDay
              : null,
          repayment_monthly_day:
            planEnabled && showLoanPlanSettings && repaymentFrequency === "MONTHLY"
              ? repaymentMonthlyDay
              : null,
          repayment_monthly_rule:
            planEnabled && showLoanPlanSettings && repaymentFrequency === "MONTHLY"
              ? repaymentMonthlyRule
              : null,
          repayment_interval_days:
            planEnabled && showLoanPlanSettings && repaymentFrequency === "REGULAR"
              ? intervalDaysValue
              : null,
          repayment_account_id:
            planEnabled && showLoanPlanSettings && repaymentAccountId
              ? Number(repaymentAccountId)
              : null,
          repayment_type:
            planEnabled && showLoanPlanSettings
              ? (repaymentType as RepaymentType)
              : null,
          payment_amount_kind:
            planEnabled && showLoanPlanSettings && requiresLoanPaymentInput
              ? (paymentAmountKind as PaymentAmountKind)
              : null,
          payment_amount_rub:
            planEnabled &&
            showLoanPlanSettings &&
            requiresLoanPaymentInput &&
            Number.isFinite(paymentAmountCents)
              ? paymentAmountCents
              : null,
        };
        payload.plan_settings = planSettings;
      }

      if (editingItem) {
        const nextPlanSignature = buildPlanSignatureFromStateModal();
        const wasPlanEnabled = editingItem.plan_settings?.enabled ?? false;
        if (originalPlanSignature && nextPlanSignature !== originalPlanSignature) {
          if (wasPlanEnabled && planEnabled) {
            const confirmed = await askConfirm(
              "Изменить параметры плана?",
              "Параметры плана изменились. Плановые транзакции будут перестроены, а нереализованные удалены. Продолжить?"
            );
            if (!confirmed) {
              setLoading(false);
              return;
            }
          }
          if (wasPlanEnabled && !planEnabled) {
            const confirmed = await askConfirm(
              "Отключить плановые транзакции?",
              "Плановые транзакции будут отключены, нереализованные будут удалены. Продолжить?"
            );
            if (!confirmed) {
              setLoading(false);
              return;
            }
          }
        }
        const nextCardAccountId =
          payload.card_account_id !== undefined ? payload.card_account_id : null;
        const isCardLinkChange =
          editingItem.type_code === "bank_card" &&
          nextCardAccountId &&
          nextCardAccountId !== editingItem.card_account_id;
        if (isCardLinkChange) {
          const confirmed = await askConfirm(
            "Привязать карту к другому счету?",
            "Все транзакции по карте будут удалены и карта будет привязана к счету. Продолжить?"
          );
          if (!confirmed) {
            setLoading(false);
            return;
          }
        }
        const updatedItem = await updateItem(
          editingItem.id,
          payload,
          isCardLinkChange ? { purgeCardTransactions: true } : undefined
        );
        let itemWithPhoto = updatedItem;
        if (itemPhotoFile) {
          try {
            itemWithPhoto = await uploadItemPhoto(editingItem.id, itemPhotoFile);
          } catch (photoError: any) {
            console.warn("Failed to upload item photo:", photoError?.message);
          }
        }
        setItems((prev) => prev.map((it) => (it.id === itemWithPhoto.id ? itemWithPhoto : it)));
        onSuccess(itemWithPhoto);
      } else {
        const createdItem = await createItem(payload);
        let itemWithPhoto = createdItem;
        if (
          primaryValueKind === "MARKET" &&
          !isMoexType &&
          marketValueStr.trim() &&
          Number.isFinite(parseRubToCents(marketValueStr)) &&
          parseRubToCents(marketValueStr) >= 0
        ) {
          try {
            await createItemMarketValue(createdItem.id, {
              value_date: openDate,
              value_rub: parseRubToCents(marketValueStr),
            });
          } catch (mvErr: any) {
            console.warn("Failed to create market value:", mvErr?.message);
          }
        }
        if (itemPhotoFile) {
          try {
            itemWithPhoto = await uploadItemPhoto(createdItem.id, itemPhotoFile);
          } catch (photoError: any) {
            console.warn("Failed to upload item photo:", photoError?.message);
          }
        }
        setItems((prev) => {
          const idx = prev.findIndex((item) => item.id === itemWithPhoto.id);
          if (idx >= 0) return prev.map((item) => (item.id === itemWithPhoto.id ? itemWithPhoto : item));
          return [...prev, itemWithPhoto];
        });
        onSuccess(itemWithPhoto);
      }

      onOpenChange(false);
      onClearEditingItem();
      resetForm();
    } catch (err: any) {
      setFormError(err?.message ?? "Ошибка");
    } finally {
      setLoading(false);
    }
  };

  const isEditing = Boolean(editingItem);

  return (
    <>
      <CreateCounterpartyModal
        open={createCounterpartyOpen}
        onOpenChange={setCreateCounterpartyOpen}
        onSuccess={async (created) => {
          setCounterparties((prev) => [...prev, created]);
          setCounterpartyId(created.id);
        }}
      />
      <FormModal
        open={open}
        onOpenChange={(next) => {
          if (!next) {
            setFormError(null);
            resetForm();
            onClearEditingItem();
          }
          onOpenChange(next);
        }}
        title={isEditing ? "Редактировать актив/обязательство" : "Добавить актив/обязательство"}
        icon={<Wallet className="w-8 h-8" style={{ color: ACTIVE_TEXT_DARK }} />}
        formError={formError}
        onSubmit={handleSubmit}
        onCancel={() => {
          resetForm();
          onOpenChange(false);
          onClearEditingItem();
        }}
        submitLabel={loading ? (isEditing ? "Сохраняем..." : "Добавляем...") : isEditing ? "Сохранить" : "Добавить"}
        loading={loading}
        size="wide"
      >
        <div className="flex flex-col md:flex-row items-start gap-0 transition-all duration-300 min-w-0 w-full max-w-[600px] md:max-w-none">
          <div className="w-full md:w-[600px] grid content-start gap-4 flex-shrink-0 min-w-0">
            {/* Photo + type row */}
            <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-4 items-start">
              <div className="relative">
                <div
                  className="relative w-[200px] h-[200px] rounded-lg overflow-hidden cursor-pointer transition-all group"
                  onClick={() => itemPhotoInputRef.current?.click()}
                >
                  {itemPhotoPreview ? (
                    <img src={itemPhotoPreview} alt="" className="w-full h-full object-cover" />
                  ) : typeCode && TYPE_ICON_BY_CODE[typeCode] ? (
                    <div className="w-full h-full flex items-center justify-center" style={{ color: ACCENT }}>
                      {React.createElement(TYPE_ICON_BY_CODE[typeCode], { className: "w-24 h-24", strokeWidth: 1.5 })}
                    </div>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-[rgba(93,95,215,0.22)]">
                      <Camera className="w-12 h-12" style={{ color: PLACEHOLDER_COLOR_DARK }} />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                    <Upload className="w-8 h-8 text-white" />
                  </div>
                </div>
                <input
                  ref={itemPhotoInputRef}
                  type="file"
                  accept={ALLOWED_PHOTO_TYPES.join(",")}
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    handleItemPhotoChange(file);
                  }}
                />
                {itemPhotoError && (
                  <p className="text-xs mt-1" style={{ color: "#FB4C4F" }}>{itemPhotoError}</p>
                )}
              </div>
              <div className="grid content-start gap-4">
                {isGeneralCreate && (
                  <div className="grid gap-2" role="group" aria-label="Тип актива или обязательства">
                    <SegmentedSelector
                      options={[
                        { value: "ASSET", label: "Актив", colorScheme: "green" },
                        { value: "LIABILITY", label: "Обязательство", colorScheme: "red" },
                      ]}
                      value={kind}
                      onChange={(value) => {
                        const newKind = value as ItemKind;
                        setKind(newKind);
                        setSectionId("");
                        setTypeCode("");
                      }}
                    />
                  </div>
                )}
                {isGeneralCreate && (
                  <SelectField
                    label="Раздел"
                    value={sectionId}
                    onValueChange={(value) => {
                      setSectionId(value);
                      const section = sectionOptions.find((s) => s.id === value);
                      const firstType = section?.typeCodes?.[0] ?? "";
                      setTypeCode(firstType);
                      setPrimaryValueKind(getDefaultPrimaryValueKind(firstType, kind));
                    }}
                    options={sectionOptions.map((s) => ({ value: s.id, label: s.label }))}
                    placeholder={kind === "ASSET" ? "Выберите раздел актива" : "Выберите раздел обязательства"}
                  />
                )}
                <SelectField
                  label="Вид"
                  value={typeCode}
                  onValueChange={(value) => {
                    setTypeCode(value);
                    if (!editingItem) setPrimaryValueKind(getDefaultPrimaryValueKind(value, kind));
                  }}
                  disabled={isGeneralCreate && !sectionId}
                  options={typeOptions.map((t) => ({ value: t.code, label: t.label }))}
                  placeholder={isGeneralCreate && !sectionId ? "Сначала выберите раздел" : "Выберите вид"}
                />
              </div>
            </div>

            {/* MOEX block */}
            <div className={cn("overflow-hidden transition-all duration-300", isMoexType ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0")}>
              {isMoexType && (
                <div className="grid gap-3">
                  <div className="grid gap-2">
                    <div className="flex items-center gap-2">
                      <Label style={{ color: ACTIVE_TEXT_DARK }}>Ценная бумага</Label>
                    </div>
                    <div className="relative" ref={instrumentAnchorRef}>
                      <TextField
                        label=""
                        value={instrumentQuery}
                        onChange={(e) => {
                          setInstrumentQuery(e.target.value);
                          setSelectedInstrument(null);
                          setInstrumentDropdownOpen(true);
                        }}
                        onFocus={() => setInstrumentDropdownOpen(true)}
                        onBlur={() => setTimeout(() => setInstrumentDropdownOpen(false), 150)}
                        placeholder="Введите тикер или название"
                      />
                      {instrumentDropdownOpen && (
                        <div
                          className="selector-dropdown absolute z-50 w-full overflow-auto overscroll-contain rounded-lg shadow-lg"
                          style={instrumentDropdownStyle ?? { position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, maxHeight: 256, zIndex: 50 }}
                        >
                          <div className="relative rounded-lg p-1" style={{ backgroundColor: DROPDOWN_BG }}>
                            {instrumentLoading && <div className="px-2 py-1 text-sm" style={{ color: SIDEBAR_TEXT_INACTIVE }}>Загружаем инструменты...</div>}
                            {!instrumentLoading && instrumentError && <div className="px-2 py-1 text-sm text-red-600">{instrumentError}</div>}
                            {!instrumentLoading && !instrumentError && instrumentOptions.length === 0 && <div className="px-2 py-1 text-sm" style={{ color: SIDEBAR_TEXT_INACTIVE }}>Ничего не найдено</div>}
                            {!instrumentLoading && !instrumentError && instrumentOptions.map((option) => {
                              const title = option.short_name || option.name || option.secid;
                              return (
                                <button
                                  key={option.secid}
                                  type="button"
                                  className="flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left text-sm"
                                  style={{ backgroundColor: "transparent", color: SIDEBAR_TEXT_ACTIVE }}
                                  onMouseDown={(event) => event.preventDefault()}
                                  onClick={() => {
                                    setSelectedInstrument(option);
                                    setInstrumentQuery(`${option.secid} - ${title}`);
                                    setInstrumentDropdownOpen(false);
                                  }}
                                >
                                  <span className="text-sm font-normal" style={{ color: SIDEBAR_TEXT_ACTIVE }}>{option.secid} - {title}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <SelectField
                    label="Торговый режим"
                    value={instrumentBoardId}
                    onValueChange={setInstrumentBoardId}
                    disabled={instrumentBoards.length === 0}
                    options={instrumentBoards.map((board: MarketBoardOut) => ({ value: board.board_id, label: board.title ? `${board.board_id} - ${board.title}` : board.board_id }))}
                    placeholder="Выберите режим"
                  />
                  <TextField
                    label="Количество лотов"
                    value={positionLots}
                    onChange={(e) => setPositionLots(e.target.value)}
                    inputMode="numeric"
                    placeholder="Например: 10"
                  />
                  {resolvedHistoryStatus === "NEW" && (
                    <TextField
                      label="Цена покупки (за 1 шт.)"
                      value={moexPurchasePrice}
                      onChange={(e) => setMoexPurchasePrice(e.target.value)}
                      placeholder="По умолчанию — рыночная цена на дату"
                    />
                  )}
                  {moexDatePricesLoading && <p className="text-xs" style={{ color: SIDEBAR_TEXT_INACTIVE }}>Загрузка цен...</p>}
                  {marketPrice && moexInitialValueCents != null && (
                    <p className="text-sm" style={{ color: ACTIVE_TEXT_DARK }}>
                      Сумма по текущей цене: {formatAmount(moexInitialValueCents)}
                    </p>
                  )}
                  {commissionAllowed && (
                    <div className="grid gap-2 rounded border border-border/50 p-2">
                      <div className="flex items-center gap-2">
                        <Switch checked={commissionEnabled} onCheckedChange={setCommissionEnabled} />
                        <Label style={{ color: ACTIVE_TEXT_DARK }}>Указать комиссию</Label>
                      </div>
                      {commissionEnabled && (
                        <>
                          <TextField
                            label="Сумма комиссии"
                            value={commissionAmount}
                            onChange={(e) => setCommissionAmount(formatRubInput(e.target.value))}
                            onBlur={(e) => setCommissionAmount(normalizeRubOnBlur(e.target.value))}
                            placeholder="0"
                          />
                          <div className="grid gap-2">
                            <Label style={{ color: ACTIVE_TEXT_DARK }}>Счет оплаты комиссии</Label>
                            <ItemSelector
                              items={items.filter((it) => !it.instrument_id && !it.archived_at && !it.closed_at)}
                              selectedIds={commissionPaymentItemId ? [Number(commissionPaymentItemId)] : []}
                              onChange={(ids) => setCommissionPaymentItemId(ids[0] != null ? String(ids[0]) : "")}
                              selectionMode="single"
                              placeholder="Выберите счет"
                              getItemTypeLabel={(it) => getItemTypeLabel(it) + " — " + (it.name || "")}
                            />
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <TextField
              label="Название"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например, Кошелёк"
              required
            />
            <SelectField
              label="Основная стоимость"
              value={primaryValueKind}
              onValueChange={(v) => setPrimaryValueKind(v as PrimaryValueKind)}
              options={PRIMARY_VALUE_KIND_OPTIONS}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <TextField
                label="Валюта"
                value={currencyCode}
                onChange={(e) => setCurrencyCode(e.target.value.toUpperCase().slice(0, 3))}
                placeholder="RUB"
              />
              {!hideInitialAmountField && primaryValueKind === "MARKET" && !isMoexType && (
                <>
                  <TextField
                    label="Рыночная стоимость"
                    value={marketValueStr}
                    onChange={(e) => setMarketValueStr(formatRubInput(e.target.value))}
                    onBlur={(e) => setMarketValueStr(normalizeRubOnBlur(e.target.value))}
                    placeholder="0"
                  />
                  <TextField
                    label="Стоимость приобретения"
                    value={amountStr}
                    onChange={(e) => setAmountStr(formatRubInput(e.target.value))}
                    onBlur={(e) => setAmountStr(normalizeRubOnBlur(e.target.value))}
                    placeholder="0"
                  />
                </>
              )}
              {!hideInitialAmountField && !(primaryValueKind === "MARKET" && !isMoexType) && (
                <TextField
                  label={
                    primaryValueKind === "BALANCE"
                      ? "Баланс на дату появления"
                      : primaryValueKind === "MARKET"
                        ? "Рыночная стоимость на дату появления"
                        : primaryValueKind === "ACQUISITION" || primaryValueKind === "INVESTED"
                          ? "Стоимость приобретения"
                          : "Сумма на дату появления"
                  }
                  value={amountStr}
                  onChange={(e) => setAmountStr(formatRubInput(e.target.value))}
                  onBlur={(e) => setAmountStr(normalizeRubOnBlur(e.target.value))}
                  placeholder="0"
                />
              )}
              {hideInitialAmountField && isMoexType && moexInitialValueCents != null && (
                <div className="flex flex-col gap-1">
                  <Label style={{ color: ACTIVE_TEXT_DARK }}>Начальный баланс</Label>
                  <p className="text-sm" style={{ color: ACTIVE_TEXT_DARK }}>{formatAmount(moexInitialValueCents)}</p>
                </div>
              )}
            </div>
            <DateField
              label={primaryValueKind === "ACQUISITION" || primaryValueKind === "INVESTED" ? "Дата приобретения" : "Дата появления"}
              value={openDate}
              onChange={(e) => setOpenDate(e.target.value)}
              placeholder="ГГГГ-ММ-ДД"
            />
            {showOpeningCounterparty && (
              <div className="grid gap-2">
                <Label style={{ color: ACTIVE_TEXT_DARK }}>Источник средств</Label>
                <ItemSelector
                  items={items.filter((it) => it.kind === "ASSET" && it.currency_code === currencyCode && !it.archived_at && !it.closed_at)}
                  selectedIds={openingCounterpartyId ? [Number(openingCounterpartyId)] : []}
                  onChange={(ids) => setOpeningCounterpartyId(ids[0] != null ? String(ids[0]) : "")}
                  selectionMode="single"
                  placeholder="Не выбирать"
                  getItemTypeLabel={(it) => (it.name || "") + " " + (it.currency_code || "")}
                />
              </div>
            )}
            <ChipsInput
              label="Синонимы"
              labelHint="Добавьте альтернативные названия. При импорте транзакций актив/обязательство будет подбираться и по синонимам (например, *1234 для карты)."
              value={synonyms}
              onChange={setSynonyms}
              placeholder="Введите синоним и нажмите Enter"
              maxItems={50}
              maxLengthPerItem={300}
            />
            {showBankAccountFields && (
              <TextField
                label="Последние 7 цифр номера счета"
                value={accountLast7}
                onChange={(e) => setAccountLast7(e.target.value.replace(/\D/g, "").slice(0, 7))}
                placeholder="Необязательно"
              />
            )}
            {showContractNumberField && (
              <TextField
                label="Номер договора"
                value={contractNumber}
                onChange={(e) => setContractNumber(e.target.value)}
                placeholder="Необязательно"
              />
            )}
            {showBankCardFields && (
              <div className="grid gap-4">
                <TextField
                  label="Последние 4 цифры карты"
                  value={cardLast4}
                  onChange={(e) => setCardLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="Необязательно"
                />
                <SelectField
                  label="Тип карты"
                  value={cardKind}
                  onValueChange={(v) => setCardKind(v as CardKind)}
                  options={[
                    { value: "DEBIT", label: "Дебетовая" },
                    { value: "CREDIT", label: "Кредитная" },
                  ]}
                />
                {!isCreditCard && (
                  <div className="grid gap-2">
                    <Label style={{ color: ACTIVE_TEXT_DARK }}>Привязать к счету</Label>
                    <ItemSelector
                      items={items.filter((it) => (it.type_code === "bank_account" || it.type_code === "savings_account") && !it.archived_at && !it.closed_at)}
                      selectedIds={cardAccountId ? [Number(cardAccountId)] : []}
                      onChange={(ids) => setCardAccountId(ids[0] != null ? String(ids[0]) : "")}
                      selectionMode="single"
                      placeholder="Не привязывать"
                      getItemTypeLabel={(it) => (it.name || "") + (it.account_last7 ? ` ***${it.account_last7}` : "")}
                    />
                  </div>
                )}
                {isCreditCard && (
                  <TextField
                    label="Кредитный лимит"
                    value={creditLimit}
                    onChange={(e) => setCreditLimit(formatRubInput(e.target.value))}
                    onBlur={(e) => setCreditLimit(normalizeRubOnBlur(e.target.value))}
                    placeholder="0"
                  />
                )}
              </div>
            )}
            {showDepositFields && (
              <TextField
                label="Срок вклада (дней)"
                value={depositTermDays}
                onChange={(e) => setDepositTermDays(e.target.value.replace(/\D/g, ""))}
                placeholder="Необязательно"
              />
            )}
            {(showInterestFields || showLoanPlanSettings) && (
              <div className="grid gap-4">
                <TextField
                  label="Процентная ставка"
                  value={interestRate}
                  onChange={(e) => setInterestRate(e.target.value)}
                  placeholder="Например: 8,5"
                />
                {showInterestFields && (
                  <>
                    <SelectField
                      label="Порядок выплаты процентов"
                      value={interestPayoutOrder}
                      onValueChange={setInterestPayoutOrder}
                      options={[
                        { value: "END_OF_TERM", label: "В конце срока" },
                        { value: "MONTHLY", label: "Ежемесячно" },
                      ]}
                    />
                    {interestPayoutOrder === "MONTHLY" && (
                      <SelectField
                        label="Капитализация"
                        value={interestCapitalization}
                        onValueChange={setInterestCapitalization}
                        options={[
                          { value: "true", label: "Да" },
                          { value: "false", label: "Нет" },
                        ]}
                      />
                    )}
                    {interestCapitalization !== "true" && (
                      <div className="grid gap-2">
                        <Label style={{ color: ACTIVE_TEXT_DARK }}>Счет выплаты процентов</Label>
                        <ItemSelector
                          items={items.filter((it) => it.kind === "ASSET" && !it.archived_at && !it.closed_at)}
                          selectedIds={interestPayoutAccountId ? [Number(interestPayoutAccountId)] : []}
                          onChange={(ids) => setInterestPayoutAccountId(ids[0] != null ? String(ids[0]) : "")}
                          selectionMode="single"
                          placeholder="Выберите счет"
                          getItemTypeLabel={(it) => (it.name || "") + " " + (it.currency_code || "")}
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
            {showPlanSection && (
              <div className="grid gap-4 rounded-lg border-2 border-border/70 p-3" style={{ backgroundColor: BACKGROUND_DT }}>
                <div className="flex items-center gap-2">
                  <Switch checked={planEnabled} onCheckedChange={setPlanEnabled} />
                  <Label style={{ color: ACTIVE_TEXT_DARK }}>Плановые транзакции</Label>
                </div>
                {planEnabled && (
                  <>
                    {showInterestPlanSettings && (
                      <TextField
                        label="Дата окончания планирования (вклад/накопительный)"
                        value={planEndDate}
                        onChange={(e) => setPlanEndDate(e.target.value)}
                        placeholder="ГГГГ-ММ-ДД"
                      />
                    )}
                    {showLoanPlanSettings && (
                      <>
                        <TextField
                          label="Плановая дата погашения"
                          value={loanEndDate}
                          onChange={(e) => setLoanEndDate(e.target.value)}
                          placeholder="ГГГГ-ММ-ДД"
                        />
                        <SelectField
                          label="Счет погашения"
                          value={repaymentAccountId}
                          onValueChange={setRepaymentAccountId}
                          options={items.filter((it) => CASH_TYPES.includes(it.type_code) && !it.archived_at && !it.closed_at).map((it) => ({ value: String(it.id), label: (it.name || "") + " " + (it.currency_code || "") }))}
                          placeholder="Выберите счет"
                        />
                        <SelectField
                          label="Периодичность погашения"
                          value={repaymentFrequency}
                          onValueChange={(v) => setRepaymentFrequency(v as TransactionChainFrequency)}
                          options={[
                            { value: "WEEKLY", label: "Еженедельно" },
                            { value: "MONTHLY", label: "Ежемесячно" },
                            { value: "REGULAR", label: "С заданным интервалом (дни)" },
                          ]}
                        />
                        {repaymentFrequency === "MONTHLY" && (
                          <SelectField
                            label="Первая дата погашения"
                            value={firstPayoutRule}
                            onValueChange={(v) => setFirstPayoutRule(v as FirstPayoutRule)}
                            options={[
                              { value: "MONTH_END", label: "Последний день месяца" },
                              { value: "SAME_DAY", label: "Тот же день, что и дата появления" },
                            ]}
                          />
                        )}
                        {repaymentFrequency === "REGULAR" && (
                          <TextField
                            label="Интервал (дней)"
                            value={repaymentIntervalDays}
                            onChange={(e) => setRepaymentIntervalDays(e.target.value.replace(/\D/g, ""))}
                            placeholder="1"
                          />
                        )}
                        <SelectField
                          label="Тип погашения"
                          value={repaymentType}
                          onValueChange={(v) => setRepaymentType(v as RepaymentType)}
                          options={[
                            { value: "ANNUITY", label: "Аннуитет" },
                            { value: "DIFFERENTIAL", label: "Дифференцированный" },
                          ]}
                          placeholder="Не выбрано"
                        />
                        {requiresLoanPaymentInput && (
                          <>
                            <SelectField
                              label="Тип суммы погашения"
                              value={paymentAmountKind}
                              onValueChange={(v) => setPaymentAmountKind(v as PaymentAmountKind)}
                              options={[
                                { value: "FIXED", label: "Фиксированная сумма" },
                                { value: "PERCENT", label: "Процент от остатка" },
                              ]}
                              placeholder="Выберите"
                            />
                            <TextField
                              label="Сумма погашения"
                              value={paymentAmountStr}
                              onChange={(e) => setPaymentAmountStr(formatRubInput(e.target.value))}
                              onBlur={(e) => setPaymentAmountStr(normalizeRubOnBlur(e.target.value))}
                              placeholder="0"
                            />
                          </>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            )}
            {showCounterpartyField && (
              <div className="grid gap-2">
                <Label style={{ color: ACTIVE_TEXT_DARK }}>
                  Контрагент{isCounterpartyMandatory ? " *" : ""}
                </Label>
                <CounterpartySelector
                  counterparties={counterparties}
                  selectedIds={counterpartyId != null ? [counterpartyId] : []}
                  onChange={(ids) => setCounterpartyId(ids[0] ?? null)}
                  selectionMode="single"
                  placeholder="Начните вводить название"
                  industries={industries}
                  disabled={counterpartyLoading}
                  apiBase={API_BASE}
                  onAddCounterparty={() => setCreateCounterpartyOpen(true)}
                />
                {counterpartyError && (
                  <p className="text-xs text-red-600">{counterpartyError}</p>
                )}
              </div>
            )}
          </div>
        </div>
      </FormModal>
    </>
  );
}
