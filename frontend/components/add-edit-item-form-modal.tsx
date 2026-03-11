"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Camera, Info, RefreshCcw, Upload, Wallet } from "lucide-react";
import { FormModal } from "@/components/form-modal";
import { CollapsibleFormSection } from "@/components/ui/collapsible-form-section";
import { CreateCounterpartyModal } from "@/components/create-counterparty-modal";
import { FormField, TextField, DateField, SelectField } from "@/components/ui/form-field";
import { Label } from "@/components/ui/label";
import { Tooltip } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { ItemSelector } from "@/components/item-selector";
import { CounterpartySelector } from "@/components/counterparty-selector";
import { ChipsInput } from "@/components/ui/chips-input";
import { SegmentedSelector } from "@/components/ui/segmented-selector";
import { CurrencyChip } from "@/components/currency-chip";
import { useAccountingStart } from "@/components/accounting-start-context";
import { ACCENT, ACCENT2, ACTIVE_TEXT_DARK, BACKGROUND_DT, DROPDOWN_BG, GREEN, MODAL_BG, PLACEHOLDER_COLOR_DARK, RED, SIDEBAR_TEXT_ACTIVE, SIDEBAR_TEXT_INACTIVE } from "@/lib/colors";
import { cn } from "@/lib/utils";
import {
  fetchItems,
  fetchCounterparties,
  fetchCounterpartyIndustries,
  fetchCurrencies,
  fetchMarketInstruments,
  fetchMarketInstrumentDetails,
  fetchMarketInstrumentPrice,
  fetchMarketInstrumentPrices,
  fetchMarketInstrumentCoupons,
  fetchMarketInstrumentDividends,
  fetchFxRatesBatch,
  fetchTransactionChains,
  createItem,
  updateItem,
  uploadItemPhoto,
  createItemMarketValue,
  API_BASE,
  CurrencyOut,
  ItemKind,
  ItemCreate,
  ItemOut,
  PrimaryValueKind,
  CounterpartyOut,
  CounterpartyIndustryOut,
  MarketBoardOut,
  BondCouponOut,
  DividendOut,
  FxRateOut,
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
import { formatCentsForInput, formatRubInput, normalizeRubOnBlur, parseRubToCents } from "@/lib/format-rub";
import { formatAmount, getItemPhotoUrl } from "@/lib/item-utils";
import { getItemTypeLabel } from "@/lib/item-types";
import {
  getTodayDateKey,
  CASH_TYPES,
  REPAYMENT_ACCOUNT_TYPE_CODES,
  ASSET_TYPES,
  LIABILITY_TYPES,
  MOEX_TYPE_CODES,
  ITEM_SECTIONS,
  REAL_ESTATE_TRANSPORT_VALUABLES_TYPE_CODES,
  COUNTERPARTY_TYPE_CODES,
  MANDATORY_COUNTERPARTY_TYPE_CODES,
  CREDIT_LIABILITY_TYPES,
  LOAN_LIABILITY_TYPES,
  AUTO_PLAN_INTEREST_TYPES,
  AUTO_PLAN_LOAN_TYPES,
  ASSET_TYPE_CODES,
  LIABILITY_TYPE_CODES,
  MAX_PHOTO_BYTES,
  MAX_PHOTO_DIM,
  ALLOWED_PHOTO_TYPES,
  formatSize,
  formatShortDate,
  parseDateKey,
  addDays,
  toDateKey,
  findPriceOnOrBefore,
  BANK_CARD_TYPE_CODES,
  addMonths,
  getDefaultPrimaryValueKind,
  getPrimaryValueLabel,
} from "@/lib/asset-item-form-constants";
import { TYPE_ICON_BY_CODE } from "@/lib/asset-type-icons";
import { assetIconPath } from "@/lib/image-paths";
import { buildLoanSchedule, type LoanScheduleRow } from "@/lib/loan-schedule";

export type AddEditItemFormModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (item: ItemOut) => void;
  editingItem: ItemOut | null;
  onClearEditingItem: () => void;
  initialCreateOptions?: { kind: ItemKind; typeCodes: string[]; general?: boolean; sectionId?: string } | null;
  /** Опциональные начальные значения полей при открытии в режиме создания (например из онбординга). */
  initialCreateDefaults?: { name?: string; amountStr?: string; openDate?: string; typeCode?: string } | null;
  askConfirm: (title: string, message: string) => Promise<boolean>;
  transactionsForEdit?: TransactionOut[];
  /** Если передано, модалка не подгружает список сама (например со страницы «Активы»). */
  items?: ItemOut[];
};

export function AddEditItemFormModal({
  open,
  onOpenChange,
  onSuccess,
  editingItem,
  onClearEditingItem,
  initialCreateOptions,
  initialCreateDefaults,
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
  const [currencies, setCurrencies] = useState<CurrencyOut[]>([]);
  const [openDate, setOpenDate] = useState(() => getTodayDateKey());
  const [createCounterpartyOpen, setCreateCounterpartyOpen] = useState(false);
  const dialogContentRef = useRef<HTMLDivElement | null>(null);
  const instrumentAnchorRef = useRef<HTMLDivElement | null>(null);
  const itemPhotoInputRef = useRef<HTMLInputElement | null>(null);
  /** Пользователь вручную вводил цену покупки MOEX — при смене даты появления не перезаписывать. */
  const userDidEditMoexPriceRef = useRef(false);
  /** Пользователь вручную вводил цену покупки крипты — при смене даты появления не перезаписывать. */
  const userDidEditCryptoPriceRef = useRef(false);

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
  const [quantityUnitsStr, setQuantityUnitsStr] = useState("");
  const [moexPurchasePrice, setMoexPurchasePrice] = useState("");
  const [cryptoPurchasePrice, setCryptoPurchasePrice] = useState("");
  const [historicalAcquisitionCost, setHistoricalAcquisitionCost] = useState("");
  const [commissionEnabled, setCommissionEnabled] = useState(false);
  const [commissionAmount, setCommissionAmount] = useState("");
  const [commissionPaymentItemId, setCommissionPaymentItemId] = useState("");
  const [marketPrice, setMarketPrice] = useState<MarketPriceOut | null>(null);
  const [moexDatePrices, setMoexDatePrices] = useState<Record<string, MarketPriceOut | null>>({});
  const [moexDatePricesLoading, setMoexDatePricesLoading] = useState(false);
  /** Цена крипты на дату появления (для подстановки в поле «Цена» по умолчанию). */
  const [cryptoPriceOnOpenDate, setCryptoPriceOnOpenDate] = useState<MarketPriceOut | null>(null);
  const [bondCoupons, setBondCoupons] = useState<BondCouponOut[]>([]);
  const [bondCouponsLoading, setBondCouponsLoading] = useState(false);
  const [stockDividends, setStockDividends] = useState<DividendOut[]>([]);
  const [stockDividendsLoading, setStockDividendsLoading] = useState(false);
  const [fxRatesByDate, setFxRatesByDate] = useState<Record<string, FxRateOut[]>>({});
  const [accountLast7, setAccountLast7] = useState("");
  const [contractNumber, setContractNumber] = useState("");
  const [cardLast4, setCardLast4] = useState("");
  const [cardAccountId, setCardAccountId] = useState("");
  const [creditLimit, setCreditLimit] = useState("");
  const [depositTermDays, setDepositTermDays] = useState("");
  /** Режим ввода срока вклада: по дням или по дате окончания. Только для type_code === "deposit". */
  const [depositTermMode, setDepositTermMode] = useState<"days" | "end_date">("days");
  /** Дата окончания вклада (YYYY-MM-DD), используется при depositTermMode === "end_date". */
  const [depositEndDate, setDepositEndDate] = useState("");
  const [interestRate, setInterestRate] = useState("");
  const [interestPayoutOrder, setInterestPayoutOrder] = useState("");
  const [interestPayoutAccountId, setInterestPayoutAccountId] = useState("");
  /** Для вклада/накопительного: true = проценты на тот же счёт (по умолчанию), false = выбор счёта «Куда зачисляются проценты». */
  const [interestToSameAccount, setInterestToSameAccount] = useState(true);
  const [planEnabled, setPlanEnabled] = useState(false);
  /** Раскрыт ли блок «Планирование»; при включении тоггла «Добавить плановые транзакции» блок раскрывается. */
  const [planSectionOpen, setPlanSectionOpen] = useState(false);
  const prevShowPlanSectionRef = useRef<boolean | null>(null);
  const [firstPayoutRule, setFirstPayoutRule] = useState<FirstPayoutRule | "">("");
  const [planEndDate, setPlanEndDate] = useState("");
  const [loanEndDate, setLoanEndDate] = useState("");
  /** Режим ввода плановой даты погашения кредита: по месяцам или по дате окончания. */
  const [loanTermMode, setLoanTermMode] = useState<"months" | "end_date">("end_date");
  /** Срок до погашения (мес.), используется при loanTermMode === "months". */
  const [loanTermMonths, setLoanTermMonths] = useState("");
  const [repaymentFrequency, setRepaymentFrequency] = useState<TransactionChainFrequency>("MONTHLY");
  const [repaymentWeeklyDay, setRepaymentWeeklyDay] = useState<number>(() => (new Date().getDay() + 6) % 7);
  /** Число месяца платежа (1–31) для ежемесячного погашения. */
  const [repaymentMonthlyDay, setRepaymentMonthlyDay] = useState("");
  const [repaymentIntervalDays, setRepaymentIntervalDays] = useState("1");
  const [repaymentAccountId, setRepaymentAccountId] = useState("");
  const [repaymentType, setRepaymentType] = useState<RepaymentType | "">("");
  const [firstPaymentInterestOnly, setFirstPaymentInterestOnly] = useState(false);
  const [skipFirstPayment, setSkipFirstPayment] = useState(false);
  const [shiftWeekendPaymentToWorkday, setShiftWeekendPaymentToWorkday] = useState(true);
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
  useEffect(() => {
    setIcon3dFormat("png");
  }, [typeCode]);
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
    Promise.all([fetchCounterparties(), fetchCounterpartyIndustries(), fetchCurrencies()])
      .then(([cp, ind, curr]) => {
        setCounterparties(cp);
        setIndustries(ind);
        setCurrencies(curr);
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
      const defaultType = initialCreateDefaults?.typeCode ?? "";
      const section = (initialCreateOptions.sectionId && initialCreateOptions.kind)
        ? ITEM_SECTIONS.find((s) => s.id === initialCreateOptions.sectionId && s.kind === initialCreateOptions.kind)
        : null;
      const typeFromSection =
        initialCreateOptions.sectionId === "third_party_assets"
          ? "loan_to_third_party"
          : initialCreateOptions.sectionId === "third_party_loans"
            ? "private_loan"
            : (section?.typeCodes?.[0] ?? "");
      if (initialCreateOptions.sectionId && !defaultType && typeFromSection) {
        setTypeCode(typeFromSection);
        setPrimaryValueKind(getDefaultPrimaryValueKind(typeFromSection, initialCreateOptions.kind));
      } else {
        setTypeCode(defaultType);
        setPrimaryValueKind(getDefaultPrimaryValueKind(defaultType, initialCreateOptions.kind));
      }
      setCurrencyCode("RUB");
      setName(initialCreateDefaults?.name ?? "");
      setAmountStr(initialCreateDefaults?.amountStr ?? "");
      setCounterpartyId(null);
      setOpenDate(initialCreateDefaults?.openDate ?? getTodayDateKey());
      setPrimaryValueKind(getDefaultPrimaryValueKind(initialCreateDefaults?.typeCode ?? "", initialCreateOptions.kind));
      setSynonyms([]);
      setMarketValueStr("");
    }
    if (editingItem) {
      setKind(editingItem.kind);
      setAllowedTypeCodes(editingItem.kind === "ASSET" ? ASSET_TYPE_CODES : LIABILITY_TYPE_CODES);
      const resolvedTypeCode =
        editingItem.type_code === "bank_card"
          ? (editingItem.card_kind === "CREDIT" ? "bank_card_credit" : "bank_card_debit")
          : editingItem.type_code;
      const sectionForType = ITEM_SECTIONS.find(
        (s) => s.kind === editingItem.kind && s.typeCodes.includes(resolvedTypeCode)
      );
      setSectionId(sectionForType?.id ?? "");
      setIsGeneralCreate(true);
      setTypeCode(resolvedTypeCode);
      setCurrencyCode(editingItem.type_code === "crypto" ? "USD" : editingItem.currency_code);
      setName(editingItem.name);
      setAmountStr(
        (editingItem.currency_code ?? "RUB").toUpperCase() === "RUB"
          ? formatAmount(editingItem.initial_balance_minor)
          : ""
      );
      setCounterpartyId(editingItem.counterparty_id);
      setOpenDate(editingItem.open_date ?? getTodayDateKey());
      setInstrumentQuery(editingItem.instrument_id ? `${editingItem.instrument_id} - ${editingItem.name ?? ""}`.trim() : "");
      setInstrumentOptions([]);
      const provider = editingItem.type_code === "crypto" ? "COINGECKO" : "MOEX";
      setSelectedInstrument(editingItem.instrument_id ? { secid: editingItem.instrument_id, provider, isin: null, short_name: editingItem.name, name: editingItem.name, type_code: editingItem.type_code, engine: null, market: null, default_board_id: editingItem.instrument_board_id ?? "default", currency_code: editingItem.currency_code, lot_size: editingItem.lot_size, face_value_cents: editingItem.face_value_cents, is_traded: null } : null);
      setInstrumentBoardId(editingItem.instrument_board_id ?? (editingItem.type_code === "crypto" ? "default" : ""));
      setQuantityUnitsStr(editingItem.quantity_units != null ? String(editingItem.quantity_units) : "");
      setAccountLast7(editingItem.account_last7 ?? "");
      setContractNumber(editingItem.contract_number ?? "");
      setCardLast4(editingItem.card_last4 ?? "");
      setCardAccountId(editingItem.card_account_id ? String(editingItem.card_account_id) : "");
      setCreditLimit(editingItem.credit_limit != null ? formatAmount(editingItem.credit_limit) : "");
      const od = editingItem.open_date ?? getTodayDateKey();
      if (editingItem.deposit_end_date) {
        setDepositTermMode("end_date");
        setDepositEndDate(editingItem.deposit_end_date);
        const days = Math.round((parseDateKey(editingItem.deposit_end_date).getTime() - parseDateKey(od).getTime()) / (24 * 60 * 60 * 1000));
        setDepositTermDays(Number.isFinite(days) && days >= 0 ? String(days) : editingItem.deposit_term_days != null ? String(editingItem.deposit_term_days) : "");
      } else {
        setDepositTermMode("days");
        setDepositEndDate("");
        setDepositTermDays(editingItem.deposit_term_days != null ? String(editingItem.deposit_term_days) : "");
      }
      setPositionLots(editingItem.position_lots != null ? String(editingItem.position_lots) : "");
      setMoexPurchasePrice("");
      setHistoricalAcquisitionCost(editingItem.acquisitionCents != null && editingItem.acquisitionCents !== 0 ? formatAmount(editingItem.acquisitionCents) : "");
      const commissionTx = transactionsForEdit.find((tx) => tx.related_item_id === editingItem.id && tx.source === "AUTO_ITEM_COMMISSION");
      if (commissionTx) {
        setCommissionEnabled(true);
        setCommissionAmount(commissionTx.amount != null ? formatAmount(commissionTx.amount) : "");
        setCommissionPaymentItemId(commissionTx.primary_item_id != null ? String(commissionTx.primary_item_id) : "");
      } else {
        setCommissionEnabled(false);
        setCommissionAmount("");
        setCommissionPaymentItemId("");
      }
      setInterestRate(editingItem.interest_rate != null ? String(editingItem.interest_rate).replace(".", ",") : "");
      setInterestPayoutOrder(editingItem.interest_payout_order ?? "");
      setInterestPayoutAccountId(editingItem.interest_payout_account_id ? String(editingItem.interest_payout_account_id) : "");
      setInterestToSameAccount(!editingItem.interest_payout_account_id);
      const ps = editingItem.plan_settings;
      const planOn = ps?.enabled ?? false;
      setPlanEnabled(planOn);
      setPlanSectionOpen(planOn);
      setFirstPayoutRule(ps?.first_payout_rule ?? "");
      setPlanEndDate(ps?.plan_end_date ?? "");
      const loanEnd = ps?.loan_end_date ?? "";
      setLoanEndDate(loanEnd);
      if (loanEnd) {
        const od = editingItem.open_date ?? getTodayDateKey();
        const start = parseDateKey(od);
        const end = parseDateKey(loanEnd);
        let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
        if (end.getDate() < start.getDate()) months -= 1;
        setLoanTermMonths(Number.isFinite(months) && months >= 0 ? String(months) : "");
        setLoanTermMode("months");
      } else {
        setLoanTermMode("months");
        setLoanTermMonths("");
      }
      setRepaymentFrequency(ps?.repayment_frequency ?? "MONTHLY");
      setRepaymentWeeklyDay(ps?.repayment_weekly_day ?? (new Date().getDay() + 6) % 7);
      if (ps?.repayment_monthly_day != null) {
        setRepaymentMonthlyDay(String(ps.repayment_monthly_day));
      } else if (ps?.repayment_monthly_rule === "LAST_DAY") {
        setRepaymentMonthlyDay("31");
      } else {
        setRepaymentMonthlyDay("");
      }
      setRepaymentIntervalDays(ps?.repayment_interval_days != null ? String(ps.repayment_interval_days) : "1");
      setRepaymentAccountId(ps?.repayment_account_id != null ? String(ps.repayment_account_id) : "");
      setRepaymentType(ps?.repayment_type ?? "");
      setFirstPaymentInterestOnly(ps?.first_payment_interest_only ?? false);
      setSkipFirstPayment(ps?.skip_first_payment ?? false);
      setShiftWeekendPaymentToWorkday(ps?.shift_weekend_payment_to_workday ?? true);
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
  }, [open, initialCreateOptions, initialCreateDefaults, editingItem?.id ?? null, accountingStartDate]);

  const sectionOptions = useMemo(
    () => ITEM_SECTIONS.filter((s) => s.kind === kind),
    [kind]
  );
  const sectionTypeCodes = useMemo(
    () => sectionOptions.find((s) => s.id === sectionId)?.typeCodes ?? [],
    [sectionOptions, sectionId]
  );
  const effectiveAllowedTypeCodes = isGeneralCreate ? sectionTypeCodes : allowedTypeCodes;
  const currencySelectOptions = useMemo(() => {
    const list = [...currencies];
    const hasCurrent = list.some((c) => c.iso_char_code === currencyCode);
    if (currencyCode && !hasCurrent) {
      list.unshift({ iso_char_code: currencyCode, iso_num_code: "", nominal: 1, name: currencyCode, eng_name: currencyCode });
    }
    return list.map((c) => ({
      value: c.iso_char_code,
      label: (
        <span className="inline-flex items-center gap-2">
          <CurrencyChip code={c.iso_char_code} className="shrink-0" />
          <span>{c.name}</span>
        </span>
      ),
    }));
  }, [currencies, currencyCode]);

  const typeOptions = useMemo(() => {
    const base = kind === "ASSET" ? ASSET_TYPES : LIABILITY_TYPES;
    if (!effectiveAllowedTypeCodes.length) return isGeneralCreate ? [] : base;
    const allowed = new Set(effectiveAllowedTypeCodes);
    const filtered = base.filter((o) => allowed.has(o.code));
    // Порядок в выпадающем списке — как в разделе (effectiveAllowedTypeCodes)
    const orderBySection = new Map(effectiveAllowedTypeCodes.map((code, i) => [code, i]));
    return filtered.slice().sort((a, b) => (orderBySection.get(a.code) ?? 999) - (orderBySection.get(b.code) ?? 999));
  }, [kind, effectiveAllowedTypeCodes, isGeneralCreate]);
  const showCounterpartyField = useMemo(
    () => COUNTERPARTY_TYPE_CODES.includes(typeCode),
    [typeCode]
  );
  const isCounterpartyMandatory = useMemo(
    () => MANDATORY_COUNTERPARTY_TYPE_CODES.includes(typeCode),
    [typeCode]
  );
  const bankIndustryId = useMemo(
    () => industries.find((ind) => ind.name === "Банки")?.id ?? null,
    [industries]
  );

  const isMoexType = useMemo(() => MOEX_TYPE_CODES.includes(typeCode), [typeCode]);
  const isCryptoType = useMemo(() => typeCode === "crypto", [typeCode]);
  const isCostOneRowType = useMemo(
    () => kind === "ASSET" && REAL_ESTATE_TRANSPORT_VALUABLES_TYPE_CODES.includes(typeCode) && primaryValueKind === "MARKET" && !isMoexType && !isCryptoType,
    [kind, typeCode, primaryValueKind, isMoexType, isCryptoType]
  );
  const showInstrumentBlock = useMemo(
    () => (isMoexType || isCryptoType) && kind === "ASSET",
    [isMoexType, isCryptoType, kind]
  );

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
  const cryptoPurchasePriceCents = useMemo(() => {
    if (!isCryptoType) return null;
    const trimmed = cryptoPurchasePrice.trim();
    if (!trimmed) return null;
    const parsed = parseRubToCents(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0) return null;
    return parsed;
  }, [isCryptoType, cryptoPurchasePrice]);
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
  /** Вычисленная плановая дата погашения: из срока в месяцах или из поля даты. */
  const effectiveLoanEndDate = useMemo(() => {
    const od = openDate || getTodayDateKey();
    if (loanTermMode === "months" && loanTermMonths.trim()) {
      const n = Math.trunc(Number(loanTermMonths));
      if (Number.isFinite(n) && n >= 0) return toDateKey(addMonths(parseDateKey(od), n));
    }
    return loanEndDate || null;
  }, [loanTermMode, loanTermMonths, loanEndDate, openDate]);
  const requiresLoanPaymentInput = useMemo(
    () => showLoanPlanSettings && kind === "ASSET",
    [showLoanPlanSettings, kind]
  );
  /** Для кредитных обязательств и «Полученные займы от третьих лиц» при включённом тогле «Планирование» все поля блока обязательны. */
  const isCreditLiabilityWithPlan = useMemo(
    () => Boolean(planEnabled && kind === "LIABILITY" && (CREDIT_LIABILITY_TYPES.includes(typeCode) || typeCode === "private_loan")),
    [planEnabled, kind, typeCode]
  );

  /** График погашения для предпросмотра (кредитные обязательства). */
  const loanSchedulePreview = useMemo((): LoanScheduleRow[] | null => {
    if (!showLoanPlanSettings || !effectiveLoanEndDate) return null;
    const principalCents = parseRubToCents(amountStr);
    if (!Number.isFinite(principalCents) || principalCents < 0) return null;
    const rate = parseFloat(String(interestRate).replace(",", "."));
    const rateNum = Number.isFinite(rate) && rate >= 0 ? rate : 0;
    const type = repaymentType === "ANNUITY" ? "ANNUITY" : repaymentType === "DIFFERENTIATED" ? "DIFFERENTIATED" : null;
    if (!type) return null;
    if (repaymentFrequency !== "WEEKLY" && repaymentFrequency !== "MONTHLY" && repaymentFrequency !== "REGULAR")
      return null;
    const periodStartKey = openDate || getTodayDateKey();
    const monthlyDayNum =
      repaymentFrequency === "MONTHLY" && repaymentMonthlyDay.trim()
        ? Math.trunc(Number(repaymentMonthlyDay))
        : undefined;
    const intervalNum =
      repaymentFrequency === "REGULAR" && repaymentIntervalDays.trim()
        ? Math.trunc(Number(repaymentIntervalDays))
        : undefined;
    if (repaymentFrequency === "MONTHLY" && (monthlyDayNum == null || monthlyDayNum < 1 || monthlyDayNum > 31))
      return null;
    if (repaymentFrequency === "REGULAR" && (intervalNum == null || intervalNum < 1)) return null;
    return buildLoanSchedule({
      principalCents,
      rate: rateNum,
      periodStartKey,
      endDateKey: effectiveLoanEndDate,
      repaymentType: type,
      frequency: repaymentFrequency,
      weeklyDay: repaymentFrequency === "WEEKLY" ? repaymentWeeklyDay : undefined,
      monthlyDay: repaymentFrequency === "MONTHLY" ? monthlyDayNum : undefined,
      intervalDays: repaymentFrequency === "REGULAR" ? intervalNum : undefined,
      firstPaymentInterestOnly,
      skipFirstPayment,
      shiftWeekendToWorkday: shiftWeekendPaymentToWorkday,
    });
  }, [
    showLoanPlanSettings,
    effectiveLoanEndDate,
    amountStr,
    interestRate,
    repaymentType,
    repaymentFrequency,
    openDate,
    repaymentWeeklyDay,
    repaymentMonthlyDay,
    repaymentIntervalDays,
    firstPaymentInterestOnly,
    skipFirstPayment,
    shiftWeekendPaymentToWorkday,
  ]);

  const itemsById = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items]
  );
  const showBankAccountFields = useMemo(
    () => typeCode === "bank_account" || typeCode === "savings_account",
    [typeCode]
  );
  const showBankCardFields = useMemo(() => BANK_CARD_TYPE_CODES.includes(typeCode), [typeCode]);
  const isCreditCard = useMemo(() => typeCode === "bank_card_credit", [typeCode]);
  const showDepositFields = useMemo(() => typeCode === "deposit", [typeCode]);
  const showInterestFields = useMemo(
    () => typeCode === "deposit" || typeCode === "savings_account",
    [typeCode]
  );
  const showPlanSection = useMemo(
    () =>
      typeCode === "bonds" ||
      typeCode === "securities" ||
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
      showBankCardFields ||
      typeCode === "deposit" ||
      typeCode === "savings_account",
    [typeCode, showBankCardFields]
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

  /** Для MOEX: данные для таблицы Цена/Стоимость и прибыль (дата появления, текущая дата). Таблица показывается всегда, значения могут быть null. */
  const moexPriceTable = useMemo(() => {
    if (!isMoexType) return null;
    const lotSize = selectedInstrument?.lot_size ?? 1;
    const accintOnDate = (p: MarketPriceOut | null) => (typeCode === "bonds" && p?.accint_cents != null ? p.accint_cents : 0);
    const priceOnOpen = moexDatePrices[openDate];
    const userOpenCents =
      resolvedHistoryStatus === "HISTORICAL" && historicalAcquisitionCost.trim()
        ? parseRubToCents(historicalAcquisitionCost)
        : resolvedHistoryStatus === "NEW"
          ? moexPurchasePriceCents
          : null;
    const useUserPrice = userOpenCents != null && Number.isFinite(userOpenCents);
    const openPriceCents =
      useUserPrice
        ? userOpenCents
        : priceOnOpen?.price_cents != null
          ? priceOnOpen.price_cents
          : null;
    const hasLots = moexLots != null && moexLots > 0;
    const openValueBaseCents =
      openPriceCents != null && Number.isFinite(openPriceCents) && hasLots
        ? Math.round(
            (openPriceCents + (useUserPrice ? 0 : accintOnDate(priceOnOpen))) *
              moexLots * lotSize
          )
        : null;
    const commissionCents = commissionAmountCents != null && commissionAmountCents > 0 ? commissionAmountCents : 0;
    const openValueCents =
      openValueBaseCents != null
        ? openValueBaseCents + (currencyCode === "RUB" ? commissionCents : 0)
        : null;
    const openValueInCurrencyCents =
      openValueBaseCents != null && currencyCode !== "RUB"
        ? openValueBaseCents
        : null;
    const currentPrice = marketPrice?.price_cents ?? null;
    const currentValueInCurrencyCents =
      currencyCode !== "RUB" && currentPrice != null && hasLots
        ? Math.round((currentPrice + accintOnDate(marketPrice)) * moexLots * lotSize)
        : null;
    const todayKey = getTodayDateKey();
    const openRateFromFx =
      openDate && currencyCode !== "RUB"
        ? (fxRatesByDate[openDate]?.find((r) => r.char_code === currencyCode)?.rate ?? null)
        : null;
    const currentRateFromFx =
      currencyCode !== "RUB"
        ? (fxRatesByDate[todayKey]?.find((r) => r.char_code === currencyCode)?.rate ?? null)
        : null;
    const openValueCentsRub =
      currencyCode !== "RUB" && openValueInCurrencyCents != null && openRateFromFx != null
        ? Math.round(openValueInCurrencyCents * openRateFromFx)
        : openValueCents;
    const currentValueCentsRub =
      currencyCode !== "RUB" && currentValueInCurrencyCents != null && currentRateFromFx != null
        ? Math.round(currentValueInCurrencyCents * currentRateFromFx)
        : currencyCode === "RUB" && currentPrice != null && hasLots
          ? Math.round((currentPrice + accintOnDate(marketPrice)) * moexLots * lotSize)
          : null;
    const currentValueCents =
      currentValueCentsRub ?? (currentPrice != null && hasLots ? Math.round((currentPrice + accintOnDate(marketPrice)) * moexLots * lotSize) : null);
    const openRateRubPerCurrency =
      openRateFromFx ?? (openValueInCurrencyCents != null && openValueInCurrencyCents !== 0 && openValueCentsRub != null ? openValueCentsRub / openValueInCurrencyCents : null);
    const currentRateRubPerCurrency =
      currentRateFromFx ?? (currentValueInCurrencyCents != null && currentValueInCurrencyCents !== 0 && currentValueCents != null ? currentValueCents / currentValueInCurrencyCents : null);
    const profitCents =
      currentValueCents != null && openValueCentsRub != null ? currentValueCents - openValueCentsRub : null;
    const profitPercent =
      profitCents != null && openValueCentsRub != null && openValueCentsRub !== 0
        ? (profitCents / openValueCentsRub) * 100
        : null;
    return {
      userSpecifiedOpenPrice: useUserPrice,
      openPriceCents: openPriceCents != null && Number.isFinite(openPriceCents) ? openPriceCents : null,
      openValueCents: openValueCentsRub,
      openValueInCurrencyCents,
      currentPriceCents: currentPrice,
      currentValueCents,
      currentValueInCurrencyCents,
      openRateRubPerCurrency,
      currentRateRubPerCurrency,
      profitCents,
      profitPercent,
    };
  }, [
    isMoexType,
    moexLots,
    selectedInstrument?.lot_size,
    typeCode,
    moexDatePrices,
    openDate,
    resolvedHistoryStatus,
    historicalAcquisitionCost,
    moexPurchasePriceCents,
    marketPrice,
    commissionAmountCents,
    currencyCode,
    fxRatesByDate,
  ]);

  const cryptoQuantityUnits = useMemo(() => {
    if (!isCryptoType) return null;
    const raw = quantityUnitsStr.replace(/\s/g, "").replace(",", ".");
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : null;
  }, [isCryptoType, quantityUnitsStr]);

  /** Курс валюты к рублю на дату из загруженных FX (RUB за 1 ед. валюты). */
  const getFxRateForDate = useCallback(
    (dateKey: string, code: string): number | null => {
      const rates = fxRatesByDate[dateKey];
      if (!rates?.length) return null;
      const r = rates.find((x) => x.char_code === code);
      return r && r.rate > 0 ? r.rate : null;
    },
    [fxRatesByDate]
  );

  /** Форматирование курса: все знаки после запятой (до 6), запятая как разделитель. */
  const formatRate = useCallback((rate: number): string => {
    const s = rate % 1 === 0 ? String(rate) : rate.toFixed(6).replace(/\.?0+$/, "");
    return s.replace(".", ",");
  }, []);

  /** Для крипты: данные для таблицы Цена/Стоимость (дата появления, текущая дата). Аналогично moexPriceTable. */
  const cryptoPriceTable = useMemo(() => {
    if (!isCryptoType) return null;
    const quantity = cryptoQuantityUnits ?? 0;
    const todayKey = getTodayDateKey();
    const openPriceUsdCents =
      resolvedHistoryStatus === "NEW"
        ? cryptoPurchasePriceCents
        : historicalAcquisitionCost.trim()
          ? parseRubToCents(historicalAcquisitionCost)
          : null;
    const useUserPrice = openPriceUsdCents != null && Number.isFinite(openPriceUsdCents);
    const currentPriceUsdCents = marketPrice?.price_usd_cents ?? null;
    const currentPriceRubCents = marketPrice?.price_cents ?? null;
    const openValueUsdCents =
      openPriceUsdCents != null && quantity > 0 ? Math.round(openPriceUsdCents * quantity) : null;
    const currentValueUsdCents =
      currentPriceUsdCents != null && quantity > 0 ? Math.round(currentPriceUsdCents * quantity) : null;
    const openRateFromFx = openDate ? getFxRateForDate(openDate, "USD") : null;
    const currentRateFromFx = getFxRateForDate(todayKey, "USD");
    const openValueRubCents =
      openValueUsdCents != null && openRateFromFx != null
        ? Math.round((openValueUsdCents / 100) * openRateFromFx * 100)
        : openValueUsdCents != null && currentPriceUsdCents != null && currentPriceUsdCents !== 0 && currentPriceRubCents != null
          ? Math.round(openValueUsdCents * (currentPriceRubCents / currentPriceUsdCents))
          : null;
    const currentValueRubCents =
      currentValueUsdCents != null && currentRateFromFx != null
        ? Math.round((currentValueUsdCents / 100) * currentRateFromFx * 100)
        : currentPriceRubCents != null && quantity > 0
          ? Math.round(currentPriceRubCents * quantity)
          : null;
    const profitCents =
      currentValueRubCents != null && openValueRubCents != null ? currentValueRubCents - openValueRubCents : null;
    const profitPercent =
      profitCents != null && openValueRubCents != null && openValueRubCents !== 0
        ? (profitCents / openValueRubCents) * 100
        : null;
    const openRateRubPerCurrency =
      openRateFromFx != null ? openRateFromFx : openValueUsdCents != null && openValueUsdCents !== 0 && openValueRubCents != null ? openValueRubCents / openValueUsdCents : null;
    const currentRateRubPerCurrency =
      currentRateFromFx != null ? currentRateFromFx : currentValueUsdCents != null && currentValueUsdCents !== 0 && currentValueRubCents != null ? currentValueRubCents / currentValueUsdCents : null;
    return {
      userSpecifiedOpenPrice: useUserPrice,
      openPriceCents: openPriceUsdCents != null && Number.isFinite(openPriceUsdCents) ? openPriceUsdCents : null,
      openValueCents: openValueRubCents,
      openValueInCurrencyCents: openValueUsdCents,
      currentPriceCents: currentPriceUsdCents,
      currentValueCents: currentValueRubCents,
      currentValueInCurrencyCents: currentValueUsdCents,
      openRateRubPerCurrency,
      currentRateRubPerCurrency,
      profitCents,
      profitPercent,
    };
  }, [
    isCryptoType,
    cryptoQuantityUnits,
    resolvedHistoryStatus,
    cryptoPurchasePriceCents,
    historicalAcquisitionCost,
    marketPrice?.price_usd_cents,
    marketPrice?.price_cents,
    openDate,
    getFxRateForDate,
  ]);

  const normalizedAmountValue = hideInitialAmountField
    ? amountStr.trim() || "0"
    : amountStr;
  const amountCentsForSubmit = useMemo(() => {
    if (isMoexType || isCryptoType) return isMoexType ? (moexInitialValueCents ?? NaN) : 0;
    return parseRubToCents(normalizedAmountValue);
  }, [isMoexType, isCryptoType, moexInitialValueCents, normalizedAmountValue]);
  const hasNonZeroAmount = Number.isFinite(amountCentsForSubmit) && amountCentsForSubmit !== 0;
  const hasNonZeroLots = moexLots != null && moexLots > 0;
  const hasNonZeroCryptoQuantity = cryptoQuantityUnits != null && cryptoQuantityUnits > 0;
  const showOpeningCounterparty =
    resolvedHistoryStatus !== "HISTORICAL" &&
    (primaryValueKind === "BALANCE" ||
      primaryValueKind === "ACQUISITION" ||
      primaryValueKind === "INVESTED" ||
      primaryValueKind === "MARKET") &&
    (resolvedHistoryStatus === "NEW"
      ? isMoexType
        ? hasNonZeroLots
        : isCryptoType
          ? hasNonZeroCryptoQuantity
          : hasNonZeroAmount
      : true);
  const openingHintModal = useMemo(() => {
    if (!showOpeningCounterparty) return null;
    const dateLabel = accountingStartDate
      ? new Date(accountingStartDate + "T12:00:00").toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" })
      : null;
    const datePhrase = dateLabel ? ` после даты начала учета ${dateLabel}, поэтому` : ", поэтому";
    return kind === "LIABILITY"
      ? `Обязательство появилось${datePhrase} нужно указать источник средств, откуда были переведены средства или погашено обязательство. Если источник не указать, то будет создана транзакция в размере начальной суммы с категорией «Прочие расходы».`
      : `Актив появился${datePhrase} нужно указать источник средств, откуда были переведены средства или оплачен актив. Если источник не указать, то будет создана транзакция в размере начальной суммы с категорией «Прочие доходы».`;
  }, [showOpeningCounterparty, accountingStartDate, kind]);
  const openingCounterpartyLabel = kind === "LIABILITY" ? "Куда зачислить" : "Источник средств";
  const getCounterpartyForItemId = useCallback(
    (id: number): CounterpartyOut | null => {
      const item = items.find((i) => i.id === id);
      if (!item?.counterparty_id) return null;
      return counterparties.find((c) => c.id === item.counterparty_id) ?? null;
    },
    [items, counterparties]
  );
  const showMarketCommission =
    (isMoexType || isCryptoType) && kind === "ASSET" && resolvedHistoryStatus === "NEW" && (hasNonZeroLots || hasNonZeroCryptoQuantity);
  const commissionAllowed = showMarketCommission;

  function buildPlanSignatureFromItemModal(item: ItemOut): string {
    const settings = item.plan_settings ?? null;
    return JSON.stringify({
      item: {
        kind: item.kind,
        typeCode: item.type_code,
        currencyCode: item.currency_code,
        initialValue: item.initial_balance_minor,
        openDate: item.open_date ?? null,
        depositTermDays: item.deposit_term_days ?? null,
        interestRate: item.interest_rate != null ? String(item.interest_rate) : null,
        interestPayoutOrder: item.interest_payout_order ?? null,
        interestCapitalization: item.interest_capitalization == null ? null : String(item.interest_capitalization),
        interestPayoutAccountId: item.interest_payout_account_id ?? null,
        startDate: item.start_date,
        instrumentId: item.instrument_id ?? null,
        positionLots: item.position_lots ?? null,
        lotSize: item.lot_size ?? null,
      },
      plan: {
        enabled: settings?.enabled ?? false,
        firstPayoutRule: settings?.first_payout_rule ?? null,
        planEndDate: settings?.plan_end_date ?? null,
        loanEndDate: settings?.loan_end_date ?? null,
        repaymentFrequency: settings?.repayment_frequency ?? null,
        repaymentWeeklyDay: settings?.repayment_weekly_day ?? null,
        repaymentMonthlyDay: settings?.repayment_monthly_day ?? null,
        repaymentIntervalDays: settings?.repayment_interval_days ?? null,
        repaymentAccountId: settings?.repayment_account_id ?? null,
        repaymentType: settings?.repayment_type ?? null,
        paymentAmountKind: item.kind === "ASSET" ? settings?.payment_amount_kind ?? null : null,
        paymentAmountRub: item.kind === "ASSET" ? settings?.payment_amount_rub ?? null : null,
        firstPaymentInterestOnly: settings?.first_payment_interest_only ?? null,
        skipFirstPayment: settings?.skip_first_payment ?? null,
        shiftWeekendPaymentToWorkday: settings?.shift_weekend_payment_to_workday ?? null,
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
        interestCapitalization: interestToSameAccount ? "true" : "false",
        interestPayoutAccountId: interestPayoutAccountId
          ? Number(interestPayoutAccountId)
          : null,
        startDate: planStartDate,
        instrumentId: selectedInstrument?.secid ?? null,
        positionLots: moexLots != null ? moexLots : null,
        lotSize: selectedInstrument?.lot_size ?? null,
      },
      plan: {
        enabled: planEnabled,
        firstPayoutRule: firstPayoutRule || null,
        planEndDate: planEndDate || null,
        loanEndDate: effectiveLoanEndDate || null,
        repaymentFrequency: repaymentFrequency || null,
        repaymentWeeklyDay: repaymentFrequency === "WEEKLY" ? repaymentWeeklyDay : null,
        repaymentMonthlyDay:
          repaymentFrequency === "MONTHLY" && repaymentMonthlyDay.trim()
            ? (() => { const n = Math.trunc(Number(repaymentMonthlyDay)); return Number.isFinite(n) && n >= 1 && n <= 31 ? n : null; })()
            : null,
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
        firstPaymentInterestOnly: firstPaymentInterestOnly,
        skipFirstPayment: skipFirstPayment,
        shiftWeekendPaymentToWorkday: shiftWeekendPaymentToWorkday,
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
    setQuantityUnitsStr("");
    setMoexPurchasePrice("");
    setCryptoPurchasePrice("");
    setHistoricalAcquisitionCost("");
    setCommissionEnabled(false);
    setCommissionAmount("");
    setCommissionPaymentItemId("");
    setMarketPrice(null);
    setCryptoPriceOnOpenDate(null);
    setMoexDatePrices({});
    setBondCoupons([]);
    setBondCouponsLoading(false);
    setStockDividends([]);
    setStockDividendsLoading(false);
    setFxRatesByDate({});
    setAccountLast7("");
    setContractNumber("");
    setCardLast4("");
    setCardAccountId("");
    setCreditLimit("");
    setDepositTermDays("");
    setDepositTermMode("days");
    setDepositEndDate("");
    setInterestRate("");
    setInterestPayoutOrder("");
    setInterestPayoutAccountId("");
    setInterestToSameAccount(true);
    setPlanEnabled(false);
    setPlanSectionOpen(false);
    setFirstPayoutRule("");
    setPlanEndDate("");
    setLoanEndDate("");
    setRepaymentFrequency("MONTHLY");
    setRepaymentWeeklyDay((new Date().getDay() + 6) % 7);
    setRepaymentIntervalDays("1");
    setRepaymentAccountId("");
    setRepaymentType("");
    setFirstPaymentInterestOnly(false);
    setSkipFirstPayment(false);
    setShiftWeekendPaymentToWorkday(true);
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
    if (!open || (!isMoexType && !isCryptoType)) {
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
  }, [open, instrumentQuery, isMoexType, isCryptoType, typeCode]);

  useEffect(() => {
    if (!selectedInstrument) {
      setInstrumentBoards([]);
      setInstrumentBoardId("");
      setMarketPrice(null);
      setCryptoPriceOnOpenDate(null);
      return;
    }
    let active = true;
    fetchMarketInstrumentDetails(selectedInstrument.secid)
      .then((data) => {
        if (!active) return;
        const isCrypto = selectedInstrument.provider === "COINGECKO";
        setInstrumentBoards(data.boards ?? []);
        const defaultBoard = isCrypto
          ? "default"
          : (data.instrument.default_board_id || data.boards?.[0]?.board_id || "");
        if (!instrumentBoardId) {
          setInstrumentBoardId(defaultBoard);
        } else if (
          data.boards?.length &&
          !data.boards.some((board: MarketBoardOut) => board.board_id === instrumentBoardId)
        ) {
          setInstrumentBoardId(defaultBoard);
        } else if (isCrypto && instrumentBoardId !== "default") {
          setInstrumentBoardId("default");
        }
        const nextName = data.instrument.short_name || data.instrument.name || "";
        if (nextName) setName(nextName);
        if (isCrypto && data.instrument.short_name && data.instrument.name) {
          setInstrumentQuery(`${data.instrument.short_name} - ${data.instrument.name}`);
        }
        if (isCrypto) {
          setCurrencyCode("USD");
        } else if (data.instrument.currency_code) {
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
      zIndex: 100,
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
        // Для крипты цену по умолчанию подставляет эффект загрузки цены на дату появления.
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
    if (!isCryptoType || !selectedInstrument || !instrumentBoardId || !openDate) {
      setCryptoPriceOnOpenDate(null);
      return;
    }
    const todayKey = getTodayDateKey();
    if (openDate > todayKey) {
      setCryptoPriceOnOpenDate(null);
      return;
    }
    let active = true;
    setCryptoPriceOnOpenDate(null);
    fetchMarketInstrumentPrices(selectedInstrument.secid, {
      from: openDate,
      to: openDate,
      boardId: instrumentBoardId,
    })
      .then((prices) => {
        if (!active) return;
        const priceOnOpen = prices?.length ? prices.find((p) => p.price_date === openDate) ?? prices[0] : null;
        setCryptoPriceOnOpenDate(priceOnOpen ?? null);
        // Цена в поле обновляется в отдельном эффекте при изменении cryptoPriceOnOpenDate (и если пользователь не вводил вручную)
      })
      .catch(() => {
        if (!active) return;
        setCryptoPriceOnOpenDate(null);
      });
    return () => {
      active = false;
    };
  }, [isCryptoType, selectedInstrument, instrumentBoardId, openDate]);

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
    userDidEditMoexPriceRef.current = false;
    userDidEditCryptoPriceRef.current = false;
  }, [openDate, selectedInstrument]);

  useEffect(() => {
    if (!isMoexType || !openDate) return;
    if (userDidEditMoexPriceRef.current) return;
    const priceOnOpen = moexDatePrices[openDate];
    if (priceOnOpen?.price_cents != null) {
      setMoexPurchasePrice(formatCentsForInput(priceOnOpen.price_cents));
    }
  }, [isMoexType, openDate, moexDatePrices]);

  useEffect(() => {
    if (!isCryptoType || userDidEditCryptoPriceRef.current) return;
    const priceOnOpen = cryptoPriceOnOpenDate;
    if (priceOnOpen?.price_usd_cents != null) {
      setCryptoPurchasePrice(formatCentsForInput(priceOnOpen.price_usd_cents));
    }
  }, [isCryptoType, cryptoPriceOnOpenDate]);

  useEffect(() => {
    const needFxForInstrument =
      showInstrumentBlock && (isCryptoType || (isMoexType && currencyCode !== "RUB")) && openDate;
    const needFxForInitialBalance = currencyCode !== "RUB" && openDate;
    const needFx = needFxForInstrument || needFxForInitialBalance;
    if (!needFx) {
      setFxRatesByDate({});
      return;
    }
    const todayKey = getTodayDateKey();
    const dates = [openDate, todayKey].filter((d, i, a) => a.indexOf(d) === i);
    let cancelled = false;
    fetchFxRatesBatch(dates)
      .then((rates) => {
        if (!cancelled) setFxRatesByDate(rates ?? {});
      })
      .catch(() => {
        if (!cancelled) setFxRatesByDate({});
      });
    return () => { cancelled = true; };
  }, [showInstrumentBlock, isCryptoType, isMoexType, currencyCode, openDate]);

  // При открытии формы редактирования для валютного актива показываем начальный остаток в валюте актива (без перевода в рубли).
  useEffect(() => {
    if (!editingItem || (editingItem.currency_code ?? "RUB").toUpperCase() === "RUB") return;
    setAmountStr(formatAmount(editingItem.initial_balance_minor));
  }, [editingItem]);

  useEffect(() => {
    if (typeCode !== "bonds" || !selectedInstrument?.secid) {
      setBondCoupons([]);
      setBondCouponsLoading(false);
      return;
    }
    let cancelled = false;
    setBondCouponsLoading(true);
    fetchMarketInstrumentCoupons(selectedInstrument.secid)
      .then((list) => {
        if (!cancelled) setBondCoupons(list);
      })
      .catch(() => {
        if (!cancelled) setBondCoupons([]);
      })
      .finally(() => {
        if (!cancelled) setBondCouponsLoading(false);
      });
    return () => { cancelled = true; };
  }, [typeCode, selectedInstrument?.secid]);

  useEffect(() => {
    if (typeCode !== "securities" || !selectedInstrument?.secid) {
      setStockDividends([]);
      setStockDividendsLoading(false);
      return;
    }
    let cancelled = false;
    setStockDividendsLoading(true);
    fetchMarketInstrumentDividends(selectedInstrument.secid)
      .then((list) => {
        if (!cancelled) setStockDividends(list);
      })
      .catch(() => {
        if (!cancelled) setStockDividends([]);
      })
      .finally(() => {
        if (!cancelled) setStockDividendsLoading(false);
      });
    return () => { cancelled = true; };
  }, [typeCode, selectedInstrument?.secid]);

  useEffect(() => {
    if (!open) {
      prevShowPlanSectionRef.current = null;
      return;
    }
    const prev = prevShowPlanSectionRef.current;
    prevShowPlanSectionRef.current = showPlanSection;
    if (prev === true && !showPlanSection) {
      setPlanEnabled(false);
      setPlanSectionOpen(false);
      setFirstPayoutRule("");
      setPlanEndDate("");
      setLoanEndDate("");
    }
  }, [open, showPlanSection]);

  useEffect(() => {
    if ((typeCode === "bonds" || typeCode === "securities") && !selectedInstrument?.secid && planEnabled) {
      setPlanEnabled(false);
    }
  }, [typeCode, selectedInstrument?.secid, planEnabled]);

  useEffect(() => {
    if (!showLoanPlanSettings) return;
    if (effectiveLoanEndDate && planEndDate) {
      setPlanEndDate("");
    }
  }, [effectiveLoanEndDate, planEndDate, showLoanPlanSettings]);

  useEffect(() => {
    if (!requiresLoanPaymentInput) {
      if (paymentAmountKind) setPaymentAmountKind("");
      if (paymentAmountStr) setPaymentAmountStr("");
    }
  }, [requiresLoanPaymentInput, paymentAmountKind, paymentAmountStr]);

  useEffect(() => {
    if (!showMarketCommission) {
      if (commissionEnabled) setCommissionEnabled(false);
    }
  }, [showMarketCommission, commissionEnabled]);

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
      const hasCommission = commissionAllowed && commissionAmount.trim() && commissionAmountCents != null && commissionAmountCents > 0;
      if (hasCommission) {
        if (!openingCounterpartyId) {
          setFormError("Укажите источник средств (он же используется для оплаты комиссии).");
          return;
        }
        const paymentItem = itemsById.get(Number(openingCounterpartyId));
        if (!paymentItem || paymentItem.archived_at || paymentItem.closed_at) {
          setFormError(`${openingCounterpartyLabel} не найден.`);
          return;
        }
        if (paymentItem.instrument_id) {
          setFormError("Оплата комиссии должна быть с не-рыночного счета (укажите обычный счет в источнике средств).");
          return;
        }
      }
    }
    if (isCryptoType) {
      if (!selectedInstrument) {
        setFormError("Выберите криптовалюту.");
        return;
      }
      if (!quantityUnitsStr.trim()) {
        setFormError("Укажите количество.");
        return;
      }
      if (cryptoQuantityUnits == null || cryptoQuantityUnits <= 0) {
        setFormError("Количество должно быть положительным числом.");
        return;
      }
      const hasCommissionCrypto = commissionAllowed && commissionAmount.trim() && commissionAmountCents != null && commissionAmountCents > 0;
      if (hasCommissionCrypto) {
        if (!openingCounterpartyId) {
          setFormError("Укажите источник средств (он же используется для оплаты комиссии).");
          return;
        }
        const paymentItem = itemsById.get(Number(openingCounterpartyId));
        if (!paymentItem || paymentItem.archived_at || paymentItem.closed_at) {
          setFormError(`${openingCounterpartyLabel} не найден.`);
          return;
        }
        if (paymentItem.instrument_id) {
          setFormError("Оплата комиссии должна быть с не-рыночного счета (укажите обычный счет в источнике средств).");
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
      (isMoexType ? hasNonZeroLots : isCryptoType ? hasNonZeroCryptoQuantity : hasNonZeroAmount);
    if (needsOpeningSource && !openingCounterpartyId) {
      setFormError("Укажите источник средств.");
      return;
    }
    if (needsOpeningSource && openingCounterpartyId && isCryptoType) {
      if (!cryptoPurchasePrice.trim()) {
        setFormError("Укажите цену за 1 ед. для расчёта суммы приобретения.");
        return;
      }
      if (cryptoPurchasePriceCents == null || cryptoPurchasePriceCents <= 0) {
        setFormError("Цена должна быть положительным числом в USD (например: 83,32).");
        return;
      }
    }
    // Для крипты рыночная стоимость определяется автоматически (количество × текущая цена), проверку не требуем
    const isMarketNonMoex = primaryValueKind === "MARKET" && !isMoexType && !isCryptoType;
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
    if (
      resolvedHistoryStatus === "HISTORICAL" &&
      isMarketNonMoex &&
      (!marketValueStr.trim() || !Number.isFinite(parseRubToCents(marketValueStr)) || parseRubToCents(marketValueStr) < 0)
    ) {
      setFormError("Укажите рыночную стоимость.");
      return;
    }
    if (
      resolvedHistoryStatus === "HISTORICAL" &&
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
    if (showDepositFields) {
      if (depositTermMode === "days" && depositTermDays.trim()) {
        const parsed = Number(depositTermDays);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          setFormError("Срок вклада должен быть положительным числом.");
          return;
        }
        depositTermDaysValue = Math.trunc(parsed);
      } else if (depositTermMode === "end_date" && depositEndDate.trim()) {
        const od = openDate || getTodayDateKey();
        const days = Math.round((parseDateKey(depositEndDate).getTime() - parseDateKey(od).getTime()) / (24 * 60 * 60 * 1000));
        if (!Number.isFinite(days) || days <= 0) {
          setFormError("Дата окончания вклада должна быть позже даты открытия.");
          return;
        }
        depositTermDaysValue = days;
      }
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
    if (showBankCardFields && isCreditCard) {
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
    // У рыночных (MOEX) и крипто активов нет начальной балансовой стоимости — в payload передаём 0.
    // Для исторического актива с рыночной стоимостью в initial_balance_minor передаём рыночную стоимость, стоимость приобретения — в acquisition_value_rub.
    const isHistoricalMarketNonMoex =
      resolvedHistoryStatus === "HISTORICAL" &&
      primaryValueKind === "MARKET" &&
      !isMoexType &&
      !isCryptoType;
    let initialValueRubForPayload: number;
    if (isMoexType || isCryptoType) {
      initialValueRubForPayload = 0;
    } else if (isHistoricalMarketNonMoex) {
      initialValueRubForPayload = parseRubToCents(marketValueStr);
    } else if (currencyCode !== "RUB") {
      // Начальный остаток в валюте актива (центы/копейки) — отправляем как есть, без перевода в рубли.
      initialValueRubForPayload = cents;
    } else {
      initialValueRubForPayload = cents;
    }
    if (
      !Number.isFinite(initialValueRubForPayload) ||
      (initialValueRubForPayload < 0 && !(showBankCardFields && isCreditCard))
    ) {
      setFormError("Сумма должна быть числом (например 1234,56)");
      return;
    }
    if (
      showBankCardFields &&
      isCreditCard &&
      creditLimitCents !== null &&
      initialValueRubForPayload < -creditLimitCents
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
      if (!interestToSameAccount && !interestPayoutAccountId) {
        setFormError("Укажите, куда зачисляются проценты.");
        return;
      }
    }
    // При отключённой капитализации счёт для процентов обязателен всегда (бэкенд требует interest_payout_account_id).
    if (showInterestFields && !interestToSameAccount && !interestPayoutAccountId) {
      setFormError("Укажите, куда зачисляются проценты.");
      return;
    }
    if (planEnabled && showLoanPlanSettings) {
      if (isCreditLiabilityWithPlan) {
        if (!repaymentType) {
          setFormError("Выберите тип погашения.");
          return;
        }
        if (!repaymentAccountId) {
          setFormError("Укажите, откуда погашается.");
          return;
        }
      }
      if (interestRateValue === null) {
        setFormError("Укажите процентную ставку по кредиту или займу.");
        return;
      }
      if (isLoanLiabilityType && !openDate) {
        setFormError("Укажите дату появления обязательства.");
        return;
      }
      if (!repaymentFrequency) {
        setFormError("Выберите периодичность погашения.");
        return;
      }
      if (repaymentFrequency === "MONTHLY") {
        const dayNum = repaymentMonthlyDay.trim() ? Math.trunc(Number(repaymentMonthlyDay)) : NaN;
        if (!Number.isFinite(dayNum) || dayNum < 1 || dayNum > 31) {
          setFormError("Укажите число месяца платежа (1–31).");
          return;
        }
      }
      if (repaymentFrequency === "REGULAR") {
        if (!intervalDaysValue || intervalDaysValue < 1) {
          setFormError("Укажите интервал в днях.");
          return;
        }
      }
      if (!effectiveLoanEndDate && !planEndDate) {
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
    if (planEnabled && (typeCode === "bonds" || typeCode === "securities")) {
      if (!selectedInstrument?.secid) {
        setFormError("Выберите актив в блоке «Основное».");
        return;
      }
      if (!planEndDate) {
        setFormError("Укажите дату «Планировать до».");
        return;
      }
      const quantity = (moexLots != null ? moexLots : 0) * (selectedInstrument?.lot_size ?? 1);
      if (quantity <= 0) {
        setFormError(typeCode === "bonds" ? "Укажите количество облигаций (лоты) в блоке «Основное»." : "Укажите количество (лоты) в блоке «Основное».");
        return;
      }
    }
    if (
      planEnabled &&
      showInterestPlanSettings &&
      !interestToSameAccount &&
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
        setFormError("Откуда погашается: счет не найден.");
        return;
      }
      if (!REPAYMENT_ACCOUNT_TYPE_CODES.includes(repaymentAccount.type_code)) {
        setFormError("Счет «Откуда погашается» должен быть денежным или брокерским/накопительным счётом.");
        return;
      }
      if (repaymentAccount.currency_code !== currencyCode) {
        setFormError("Валюта счета «Откуда погашается» должна совпадать с валютой кредита или займа.");
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
      const effectiveTypeCode =
        typeCode === "bank_card_debit" || typeCode === "bank_card_credit" ? "bank_card" : typeCode;
      const payload: ItemCreate = {
        kind,
        type_code: effectiveTypeCode,
        name: name.trim(),
        currency_code: isCryptoType ? "USD" : currencyCode,
        counterparty_id: showCounterpartyField ? counterpartyId : null,
        open_date: openDate,
        opening_counterparty_item_id: openingCounterpartyValue,
        initial_balance_minor: initialValueRubForPayload,
        primary_value_kind: primaryValueKind,
      };
      if (isHistoricalMarketNonMoex && Number.isFinite(parseRubToCents(amountStr))) {
        payload.acquisition_value_rub = parseRubToCents(amountStr);
      }
      if (synonymsList.length > 0) payload.synonyms = synonymsList;

      if (isMoexType && selectedInstrument) {
        payload.instrument_id = selectedInstrument.secid;
        payload.instrument_board_id = instrumentBoardId || null;
        const lots = Number(positionLots.replace(/\s/g, ""));
        payload.position_lots = lots;
        if (resolvedHistoryStatus === "NEW" && moexPurchasePrice.trim() && moexPurchasePriceCents != null) {
          payload.opening_price_cents = moexPurchasePriceCents;
        }
        if (resolvedHistoryStatus === "HISTORICAL" && historicalAcquisitionCost.trim()) {
          const priceCents = parseRubToCents(historicalAcquisitionCost);
          if (Number.isFinite(priceCents) && priceCents >= 0) {
            payload.opening_price_cents = priceCents;
            const lotSize = selectedInstrument?.lot_size ?? 1;
            if (lots > 0) {
              payload.acquisition_value_rub = Math.round(priceCents * lots * lotSize);
            }
          }
        }
        const hasCommission = Boolean(commissionAmount.trim() && commissionAmountCents != null && commissionAmountCents > 0);
        payload.commission_enabled = hasCommission;
        if (hasCommission) {
          payload.commission_amount_rub = commissionAmountCents ?? null;
          payload.commission_payment_item_id = openingCounterpartyId ? Number(openingCounterpartyId) : null;
        }
      }
      if (isCryptoType && selectedInstrument && cryptoQuantityUnits != null) {
        payload.instrument_id = selectedInstrument.secid;
        payload.quantity_units = cryptoQuantityUnits;
        if (resolvedHistoryStatus === "NEW" && cryptoPurchasePriceCents != null) {
          payload.opening_price_cents = cryptoPurchasePriceCents;
        }
        if (resolvedHistoryStatus === "HISTORICAL" && historicalAcquisitionCost.trim()) {
          const priceCents = parseRubToCents(historicalAcquisitionCost);
          if (Number.isFinite(priceCents) && priceCents >= 0) {
            payload.opening_price_cents = priceCents;
            if (cryptoQuantityUnits > 0) {
              payload.acquisition_value_rub = Math.round(priceCents * cryptoQuantityUnits);
            }
          }
        }
        const hasCommission = Boolean(commissionAmount.trim() && commissionAmountCents != null && commissionAmountCents > 0);
        payload.commission_enabled = hasCommission;
        if (hasCommission) {
          payload.commission_amount_rub = commissionAmountCents ?? null;
          payload.commission_payment_item_id = openingCounterpartyId ? Number(openingCounterpartyId) : null;
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
        payload.card_kind = isCreditCard ? "CREDIT" : "DEBIT";
        if (isCreditCard && creditLimitCents !== null) {
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
        // Явно передаём капитализацию: проценты на счёт вклада = true, иначе false (нужен счёт выплат).
        if (interestToSameAccount) {
          payload.interest_capitalization = true;
        } else {
          payload.interest_capitalization = false;
          if (interestPayoutAccountId) {
            payload.interest_payout_account_id = Number(interestPayoutAccountId);
          }
        }
      }

      const shouldSendPlanSettings =
        planEnabled || (editingItem?.plan_settings?.enabled ?? false);
      if (shouldSendPlanSettings) {
        let repaymentMonthlyDayPayload: number | null = null;
        const repaymentMonthlyRulePayload: TransactionChainMonthlyRule | null = null;
        if (
          planEnabled &&
          showLoanPlanSettings &&
          repaymentFrequency === "MONTHLY" &&
          repaymentMonthlyDay.trim()
        ) {
          const n = Math.trunc(Number(repaymentMonthlyDay));
          if (Number.isFinite(n) && n >= 1 && n <= 31) {
            repaymentMonthlyDayPayload = n;
          }
        }
        const planSettings = {
          enabled: planEnabled,
          first_payout_rule:
            planEnabled && showInterestPlanSettings && interestPayoutOrder === "MONTHLY"
              ? (firstPayoutRule as FirstPayoutRule)
              : null,
          plan_end_date: planEnabled
            ? (showDepositFields && depositTermDaysValue != null
              ? toDateKey(addDays(parseDateKey(openDate || getTodayDateKey()), depositTermDaysValue))
              : (planEndDate || null))
            : null,
          loan_end_date: planEnabled ? (effectiveLoanEndDate || null) : null,
          repayment_frequency:
            planEnabled && showLoanPlanSettings ? repaymentFrequency : null,
          repayment_weekly_day:
            planEnabled && showLoanPlanSettings && repaymentFrequency === "WEEKLY"
              ? repaymentWeeklyDay
              : null,
          repayment_monthly_day:
            planEnabled && showLoanPlanSettings && repaymentFrequency === "MONTHLY"
              ? repaymentMonthlyDayPayload
              : null,
          repayment_monthly_rule:
            planEnabled && showLoanPlanSettings && repaymentFrequency === "MONTHLY"
              ? repaymentMonthlyRulePayload
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
          first_payment_interest_only: planEnabled && showLoanPlanSettings ? firstPaymentInterestOnly : undefined,
          skip_first_payment: planEnabled && showLoanPlanSettings ? skipFirstPayment : undefined,
          shift_weekend_payment_to_workday: planEnabled && showLoanPlanSettings ? shiftWeekendPaymentToWorkday : undefined,
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
              value_currency_cents: parseRubToCents(marketValueStr),
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
        <div className="grid gap-4 w-full">
            <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-4 items-center">
              <div className="relative">
                <div
                  className="relative w-[200px] h-[200px] rounded-lg overflow-hidden cursor-pointer transition-all group"
                  onClick={() => itemPhotoInputRef.current?.click()}
                >
                  {itemPhotoPreview ? (
                    <img src={itemPhotoPreview} alt="" className="w-full h-full object-cover" />
                  ) : typeCode && assetIconPath((typeCode === "bank_card_debit" || typeCode === "bank_card_credit") ? "bank_card" : typeCode, icon3dFormat) ? (
                    <img
                      src={assetIconPath((typeCode === "bank_card_debit" || typeCode === "bank_card_credit") ? "bank_card" : typeCode, icon3dFormat)!}
                      alt=""
                      className="w-full h-full object-contain"
                      onError={() => setIcon3dFormat(null)}
                    />
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {isGeneralCreate && (
                    <SelectField
                      label="Раздел"
                      value={sectionId}
                      onValueChange={(value) => {
                        setSectionId(value);
                        const section = sectionOptions.find((s) => s.id === value);
                        const nextType =
                          value === "third_party_assets"
                            ? "loan_to_third_party"
                            : value === "third_party_loans"
                              ? "private_loan"
                              : (section?.typeCodes?.[0] ?? "");
                        setTypeCode(nextType);
                        if (nextType) setPrimaryValueKind(getDefaultPrimaryValueKind(nextType, kind));
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
                      if (value === "crypto") setCurrencyCode("USD");
                      if (!editingItem) setPrimaryValueKind(getDefaultPrimaryValueKind(value, kind));
                    }}
                    disabled={isGeneralCreate && !sectionId}
                    options={typeOptions.map((t) => ({ value: t.code, label: t.label }))}
                    placeholder={isGeneralCreate && !sectionId ? "Сначала выберите раздел" : "Выберите вид"}
                  />
                </div>
              </div>
            </div>

            {typeCode && (<>
            {/* ══════ 1. Основное ══════ */}
            <CollapsibleFormSection title="Основное" defaultOpen>
              <div className={`grid grid-cols-1 gap-4 ${showInstrumentBlock || showCounterpartyField ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
                {/* Рыночные активы: Инструмент | Название | Дата появления */}
                {showInstrumentBlock && (
                  <div className="grid gap-2">
                    <Label style={{ color: ACTIVE_TEXT_DARK }} className="min-h-6 flex items-center">{isCryptoType ? "Криптовалюта" : "Инструмент"}</Label>
                    <div className="relative" ref={instrumentAnchorRef}>
                      <TextField label="" value={instrumentQuery} onChange={(e) => { setInstrumentQuery(e.target.value); setSelectedInstrument(null); setInstrumentDropdownOpen(true); }} onFocus={() => setInstrumentDropdownOpen(true)} onBlur={() => setTimeout(() => setInstrumentDropdownOpen(false), 150)} placeholder={isCryptoType ? "Введите название или тикер" : "Введите тикер или название"} />
                      {instrumentDropdownOpen && (
                        <div className="selector-dropdown absolute z-[100] w-full overflow-auto overscroll-contain rounded-lg shadow-lg" style={instrumentDropdownStyle ?? { position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, maxHeight: 256, zIndex: 100 }}>
                          <div className="relative rounded-lg p-1" style={{ backgroundColor: DROPDOWN_BG }}>
                            {instrumentLoading && <div className="px-2 py-1 text-sm" style={{ color: SIDEBAR_TEXT_INACTIVE }}>Загружаем инструменты...</div>}
                            {!instrumentLoading && instrumentError && <div className="px-2 py-1 text-sm text-red-600">{instrumentError}</div>}
                            {!instrumentLoading && !instrumentError && instrumentOptions.length === 0 && <div className="px-2 py-1 text-sm" style={{ color: SIDEBAR_TEXT_INACTIVE }}>Ничего не найдено</div>}
                            {!instrumentLoading && !instrumentError && instrumentOptions.map((option) => {
                              const isCrypto = option.type_code === "crypto";
                              const optLabel = isCrypto ? `${option.short_name ?? option.secid} - ${option.name ?? option.secid}` : `${option.secid} - ${option.short_name || option.name || option.secid}`;
                              return (
                                <button key={option.secid} type="button" className="flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left text-sm" style={{ backgroundColor: "transparent", color: SIDEBAR_TEXT_ACTIVE }} onMouseDown={(ev) => ev.preventDefault()} onClick={() => { setSelectedInstrument(option); setInstrumentQuery(optLabel); setInstrumentDropdownOpen(false); }}>
                                  <span className="text-sm font-normal" style={{ color: SIDEBAR_TEXT_ACTIVE }}>{optLabel}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Название */}
                <TextField label="Название" value={name} onChange={(e) => setName(e.target.value)} placeholder="Например, Кошелёк" required />

                {/* Банк / Кредитор / Где открыт / Кому предоставлен займ — только для не-рыночных активов */}
                {showCounterpartyField && (
                  <FormField
                    label={
                      typeCode === "loan_to_third_party"
                        ? "Кому предоставлен займ"
                        : typeCode === "e_wallet"
                          ? "Где открыт"
                          : kind === "LIABILITY"
                            ? "Кредитор"
                            : "Банк"
                    }
                    required={isCounterpartyMandatory}
                    error={counterpartyError ?? undefined}
                  >
                    <CounterpartySelector
                      counterparties={counterparties}
                      selectedIds={counterpartyId != null ? [counterpartyId] : []}
                      onChange={(ids) => setCounterpartyId(ids[0] ?? null)}
                      selectionMode="single"
                      placeholder={
                        typeCode === "loan_to_third_party"
                          ? "Начните вводить название контрагента"
                          : typeCode === "e_wallet"
                            ? "Начните вводить название"
                            : kind === "LIABILITY"
                              ? "Начните вводить название кредитора"
                              : "Начните вводить название банка"
                      }
                      industries={industries}
                      disabled={counterpartyLoading}
                      apiBase={API_BASE}
                      filterByIndustryId={
                        kind === "LIABILITY"
                          ? (sectionId === "credit_liabilities" && typeCode !== "microloan" && typeCode !== "installment" ? bankIndustryId : null)
                          : (typeCode === "e_wallet" || typeCode === "loan_to_third_party" ? null : bankIndustryId)
                      }
                      onAddCounterparty={() => setCreateCounterpartyOpen(true)}
                    />
                  </FormField>
                )}

                {/* Дата появления: заголовок с кликабельной «В дату начала учета» в той же строке */}
                <div className="grid gap-2 min-w-0">
                  <div className="flex items-center justify-between min-h-6 flex-wrap gap-x-1.5 gap-y-0">
                    <Label style={{ color: ACTIVE_TEXT_DARK }}>
                      {primaryValueKind === "ACQUISITION" || primaryValueKind === "INVESTED" ? "Дата приобретения" : "Дата появления"}
                    </Label>
                    {accountingStartDate && (
                      <button
                        type="button"
                        className="shrink-0 font-semibold text-sm"
                        style={{ color: ACCENT }}
                        onClick={() => setOpenDate(accountingStartDate)}
                      >
                        В дату начала учета
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <DateField label="" value={openDate} onChange={(e) => setOpenDate(e.target.value)} placeholder="ГГГГ-ММ-ДД" />
                    </div>
                    {resolvedHistoryStatus && (
                      <span
                        className="inline-flex items-center shrink-0 self-center rounded-md border px-2 py-1 text-sm font-normal"
                        style={{
                          borderColor: ACCENT2,
                          backgroundColor: "rgba(85, 68, 209, 0.15)",
                          color: ACTIVE_TEXT_DARK,
                        }}
                      >
                        {resolvedHistoryStatus === "NEW" ? "Новый" : "Исторический"}
                      </span>
                    )}
                  </div>
                </div>

                {/* Привязать к счету — только для дебетовых карт */}
                {showBankCardFields && !isCreditCard && (
                  <div className="grid gap-2">
                    <Label style={{ color: ACTIVE_TEXT_DARK }}>Привязать к счету</Label>
                    <ItemSelector
                      items={items.filter((it) => it.type_code === "bank_account" || it.type_code === "savings_account")}
                      selectedIds={cardAccountId ? [Number(cardAccountId)] : []}
                      onChange={(ids) => setCardAccountId(ids[0] != null ? String(ids[0]) : "")}
                      selectionMode="single"
                      placeholder="Не привязывать"
                      clearLabel="Не привязывать"
                      getItemTypeLabel={(it) => (it.name || "") + (it.account_last7 ? ` ***${it.account_last7}` : "")}
                      getCounterpartyForItemId={getCounterpartyForItemId}
                      apiBase={API_BASE}
                    />
                  </div>
                )}
              </div>
            </CollapsibleFormSection>

            {/* ══════ 2. Стоимость ══════ */}
            <CollapsibleFormSection
              title="Стоимость"
              titleColor={ACTIVE_TEXT_DARK}
              titleCenter={showInstrumentBlock ? <>Валюта <CurrencyChip code={currencyCode} className="min-w-10 justify-center" /></> : undefined}
              titleRight={typeCode ? <>По умолчанию используется <span style={{ color: ACCENT }}>{getPrimaryValueLabel(primaryValueKind)}</span></> : undefined}
              defaultOpen
            >
              {((!showInstrumentBlock) || showOpeningCounterparty || (!hideInitialAmountField && !(primaryValueKind === "MARKET" && !isMoexType))) && (
                <div className={cn(
                  "grid grid-cols-1 gap-4",
                  isCostOneRowType ? (showOpeningCounterparty ? "md:grid-cols-4" : "md:grid-cols-3") : (showOpeningCounterparty ? "md:grid-cols-3" : "md:grid-cols-2")
                )}>
                  {/* Колонка 1: Валюта */}
                  {!showInstrumentBlock && (
                    <SelectField
                      label="Валюта"
                      value={currencyCode}
                      onValueChange={setCurrencyCode}
                      options={currencySelectOptions}
                      placeholder="Выберите валюту"
                    />
                  )}
                  {/* Колонка 2 (и 3 при isCostOneRowType): Баланс / рыночная стоимость / сумма на дату появления */}
                  {!hideInitialAmountField && primaryValueKind === "MARKET" && !isMoexType && !isCryptoType && (
                    isCostOneRowType ? (
                      <>
                        <TextField label="Рыночная стоимость" currencyCode={currencyCode} value={marketValueStr} onChange={(e) => setMarketValueStr(formatRubInput(e.target.value))} onBlur={(e) => setMarketValueStr(normalizeRubOnBlur(e.target.value))} placeholder="0" />
                        <TextField label="Стоимость приобретения" currencyCode={currencyCode} value={amountStr} onChange={(e) => setAmountStr(formatRubInput(e.target.value))} onBlur={(e) => setAmountStr(normalizeRubOnBlur(e.target.value))} placeholder="0" />
                      </>
                    ) : (
                      <div className="grid gap-2">
                        <TextField label="Рыночная стоимость" currencyCode={currencyCode} value={marketValueStr} onChange={(e) => setMarketValueStr(formatRubInput(e.target.value))} onBlur={(e) => setMarketValueStr(normalizeRubOnBlur(e.target.value))} placeholder="0" />
                        <TextField label="Стоимость приобретения" currencyCode={currencyCode} value={amountStr} onChange={(e) => setAmountStr(formatRubInput(e.target.value))} onBlur={(e) => setAmountStr(normalizeRubOnBlur(e.target.value))} placeholder="0" />
                      </div>
                    )
                  )}
                  {!hideInitialAmountField && !(primaryValueKind === "MARKET" && !isMoexType && !isCryptoType) && !(isCryptoType && primaryValueKind === "MARKET") && (
                    <TextField label={primaryValueKind === "BALANCE" ? "Баланс на дату появления" : primaryValueKind === "MARKET" ? "Рыночная стоимость на дату появления" : primaryValueKind === "ACQUISITION" || primaryValueKind === "INVESTED" ? "Стоимость приобретения" : "Сумма на дату появления"} currencyCode={currencyCode} value={amountStr} onChange={(e) => setAmountStr(formatRubInput(e.target.value))} onBlur={(e) => setAmountStr(normalizeRubOnBlur(e.target.value))} placeholder="0" />
                  )}
                  {/* Колонка 3/4: Источник средств — не показываем здесь для MOEX, он в левой колонке блока рыночных активов */}
                  {showOpeningCounterparty && !(showInstrumentBlock && (isMoexType || isCryptoType)) && (
                    <div className="grid gap-2">
                      <div className="flex min-h-6 items-center gap-2">
                        <Label style={{ color: ACTIVE_TEXT_DARK }}>{openingCounterpartyLabel}</Label>
                        <Tooltip content={openingHintModal ?? ""} contentClassName="w-80 max-w-[calc(100vw-2rem)]">
                          <span className="text-muted-foreground"><Info className="h-4 w-4" /></span>
                        </Tooltip>
                      </div>
                      <ItemSelector items={items.filter((it) => it.kind === "ASSET" && it.currency_code === currencyCode)} selectedIds={openingCounterpartyId ? [Number(openingCounterpartyId)] : []} onChange={(ids) => setOpeningCounterpartyId(ids[0] != null ? String(ids[0]) : "")} selectionMode="single" placeholder="Не выбирать" getItemTypeLabel={(it) => (it.name || "") + " " + (it.currency_code || "")} getCounterpartyForItemId={getCounterpartyForItemId} apiBase={API_BASE} />
                    </div>
                  )}
                </div>
              )}

              {showInstrumentBlock && (
                <>
                  {isMoexType ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="flex flex-col gap-4 min-w-0">
                        <TextField label="Количество лотов" value={positionLots} onChange={(e) => setPositionLots(e.target.value)} inputMode="decimal" placeholder="Например: 10" />
                        {resolvedHistoryStatus === "NEW" ? (
                          <TextField label="Цена покупки (за 1 шт.)" currencyCode={currencyCode} value={moexPurchasePrice} onChange={(e) => { userDidEditMoexPriceRef.current = true; setMoexPurchasePrice(formatRubInput(e.target.value)); }} onBlur={(e) => setMoexPurchasePrice(normalizeRubOnBlur(e.target.value))} placeholder={moexDatePrices[openDate]?.price_cents != null ? formatCentsForInput(moexDatePrices[openDate]!.price_cents) : "По умолчанию — рыночная цена на дату"} />
                        ) : (
                          <TextField label="Цена приобретения" labelHint="Укажите среднюю цену приобретения позиции с момента её появления у вас" currencyCode={currencyCode} value={historicalAcquisitionCost} onChange={(e) => setHistoricalAcquisitionCost(formatRubInput(e.target.value))} onBlur={(e) => setHistoricalAcquisitionCost(normalizeRubOnBlur(e.target.value))} placeholder="Например: 123,45" />
                        )}
                        {commissionAllowed && (
                          <TextField label="Сумма комиссии" currencyCode={currencyCode} value={commissionAmount} onChange={(e) => setCommissionAmount(formatRubInput(e.target.value))} onBlur={(e) => setCommissionAmount(normalizeRubOnBlur(e.target.value))} placeholder="0" />
                        )}
                        {showOpeningCounterparty && (
                          <div className="grid gap-2">
                            <div className="flex min-h-6 items-center gap-2">
                              <Label style={{ color: ACTIVE_TEXT_DARK }}>{openingCounterpartyLabel}</Label>
                              <Tooltip content={openingHintModal ?? ""} contentClassName="w-80 max-w-[calc(100vw-2rem)]">
                                <span className="text-muted-foreground"><Info className="h-4 w-4" /></span>
                              </Tooltip>
                            </div>
                            <ItemSelector items={items.filter((it) => it.kind === "ASSET" && it.currency_code === currencyCode)} selectedIds={openingCounterpartyId ? [Number(openingCounterpartyId)] : []} onChange={(ids) => setOpeningCounterpartyId(ids[0] != null ? String(ids[0]) : "")} selectionMode="single" placeholder="Не выбирать" getItemTypeLabel={(it) => (it.name || "") + " " + (it.currency_code || "")} getCounterpartyForItemId={getCounterpartyForItemId} apiBase={API_BASE} />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex flex-col justify-center">
                        {moexDatePricesLoading && <p className="text-xs mb-2" style={{ color: SIDEBAR_TEXT_INACTIVE }}>Загрузка цен...</p>}
                        {moexPriceTable != null && (
                          <div className="rounded-lg overflow-hidden">
                            <table className="w-full text-left border-collapse text-sm" style={{ color: ACTIVE_TEXT_DARK }}>
                              <thead>
                                <tr style={{ color: PLACEHOLDER_COLOR_DARK, backgroundColor: BACKGROUND_DT }}>
                                  <th className="pl-6 pr-4 py-3 text-sm font-medium" />
                                  <th className="px-4 py-3 text-sm font-medium text-right">{openDate ? formatShortDate(openDate) : "Дата появления"}</th>
                                  <th className="px-4 py-3 text-sm font-medium text-right" />
                                  <th className="px-6 py-3 text-sm font-medium text-right">{formatShortDate(getTodayDateKey())}</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr className="border-t border-white/10" style={{ backgroundColor: MODAL_BG }}>
                                  <td className="pl-6 pr-4 py-2 text-sm" style={{ color: PLACEHOLDER_COLOR_DARK }}>Цена</td>
                                  <td className="px-4 py-2 text-sm text-right tabular-nums" style={{ color: ACTIVE_TEXT_DARK }}>
                                    {moexPriceTable.userSpecifiedOpenPrice && moexPriceTable.openPriceCents != null ? (
                                      <span className="flex items-center gap-2 justify-end">
                                        <CurrencyChip code={currencyCode} className="shrink-0" />
                                        {formatAmount(moexPriceTable.openPriceCents)}
                                      </span>
                                    ) : "—"}
                                  </td>
                                  <td className="px-4 py-2 text-sm text-right tabular-nums align-top" style={{ color: ACTIVE_TEXT_DARK }}>
                                    {moexPriceTable.userSpecifiedOpenPrice && moexPriceTable.openPriceCents != null && moexPriceTable.currentPriceCents != null ? (() => {
                                      const priceChangeCents = moexPriceTable.currentPriceCents - moexPriceTable.openPriceCents;
                                      const priceChangePercent = moexPriceTable.openPriceCents !== 0 ? (priceChangeCents / moexPriceTable.openPriceCents) * 100 : null;
                                      const color = priceChangeCents >= 0 ? GREEN : RED;
                                      return (
                                        <span className="flex flex-col gap-0.5 text-right">
                                          <span style={{ color }}>{(priceChangeCents >= 0 ? "+" : "")}{formatAmount(priceChangeCents)}</span>
                                          {priceChangePercent != null && (
                                            <span style={{ color }}>{(priceChangePercent >= 0 ? "+" : "")}{priceChangePercent.toFixed(1)}%</span>
                                          )}
                                        </span>
                                      );
                                    })() : "—"}
                                  </td>
                                  <td className="px-6 py-2 text-sm text-right tabular-nums" style={{ color: ACTIVE_TEXT_DARK }}>
                                    {moexPriceTable.currentPriceCents != null ? (
                                      <span className="flex items-center gap-2 justify-end">
                                        <CurrencyChip code={currencyCode} className="shrink-0" />
                                        {formatAmount(moexPriceTable.currentPriceCents)}
                                      </span>
                                    ) : "—"}
                                  </td>
                                </tr>
                                {currencyCode !== "RUB" && (
                                  <>
                                    <tr className="border-t border-white/10" style={{ backgroundColor: MODAL_BG }}>
                                      <td className="pl-6 pr-4 py-2 text-sm" style={{ color: PLACEHOLDER_COLOR_DARK }}>Стоимость в валюте</td>
                                      <td className="px-4 py-2 text-sm text-right tabular-nums" style={{ color: ACTIVE_TEXT_DARK }}>
                                        {moexPriceTable.userSpecifiedOpenPrice && moexPriceTable.openValueInCurrencyCents != null ? (
                                          <span className="flex items-center gap-2 justify-end">
                                            <CurrencyChip code={currencyCode} className="shrink-0" />
                                            {formatAmount(moexPriceTable.openValueInCurrencyCents)}
                                          </span>
                                        ) : "—"}
                                      </td>
                                      <td className="px-4 py-2 text-sm text-right tabular-nums align-top" style={{ color: ACTIVE_TEXT_DARK }}>
                                        {moexPriceTable.openValueInCurrencyCents != null && moexPriceTable.currentValueInCurrencyCents != null ? (() => {
                                          const delta = moexPriceTable.currentValueInCurrencyCents - moexPriceTable.openValueInCurrencyCents;
                                          const pct = moexPriceTable.openValueInCurrencyCents !== 0 ? (delta / moexPriceTable.openValueInCurrencyCents) * 100 : null;
                                          const color = delta >= 0 ? GREEN : RED;
                                          return (
                                            <span className="flex flex-col gap-0.5 text-right">
                                              <span style={{ color }}>{(delta >= 0 ? "+" : "")}{formatAmount(delta)}</span>
                                              {pct != null && <span style={{ color }}>{(pct >= 0 ? "+" : "")}{pct.toFixed(1)}%</span>}
                                            </span>
                                          );
                                        })() : "—"}
                                      </td>
                                      <td className="px-6 py-2 text-sm text-right tabular-nums" style={{ color: ACTIVE_TEXT_DARK }}>
                                        {moexPriceTable.currentValueInCurrencyCents != null ? (
                                          <span className="flex items-center gap-2 justify-end">
                                            <CurrencyChip code={currencyCode} className="shrink-0" />
                                            {formatAmount(moexPriceTable.currentValueInCurrencyCents)}
                                          </span>
                                        ) : "—"}
                                      </td>
                                    </tr>
                                    <tr className="border-t border-white/10" style={{ backgroundColor: MODAL_BG }}>
                                      <td className="pl-6 pr-4 py-2 text-sm" style={{ color: PLACEHOLDER_COLOR_DARK }}>Курс</td>
                                      <td className="px-4 py-2 text-sm text-right tabular-nums" style={{ color: ACTIVE_TEXT_DARK }}>
                                        {moexPriceTable.openRateRubPerCurrency != null ? formatRate(moexPriceTable.openRateRubPerCurrency) : "—"}
                                      </td>
                                      <td className="px-4 py-2 text-sm text-right tabular-nums align-top" style={{ color: ACTIVE_TEXT_DARK }}>
                                        {moexPriceTable.openRateRubPerCurrency != null && moexPriceTable.currentRateRubPerCurrency != null ? (() => {
                                          const d = moexPriceTable.currentRateRubPerCurrency! - moexPriceTable.openRateRubPerCurrency!;
                                          const pct = moexPriceTable.openRateRubPerCurrency !== 0 ? (d / moexPriceTable.openRateRubPerCurrency) * 100 : null;
                                          const color = d >= 0 ? GREEN : RED;
                                          return (
                                            <span className="flex flex-col gap-0.5 text-right">
                                              <span style={{ color }}>{(d >= 0 ? "+" : "")}{formatRate(d)}</span>
                                              {pct != null && <span style={{ color }}>{(pct >= 0 ? "+" : "")}{pct.toFixed(1)}%</span>}
                                            </span>
                                          );
                                        })() : "—"}
                                      </td>
                                      <td className="px-6 py-2 text-sm text-right tabular-nums" style={{ color: ACTIVE_TEXT_DARK }}>
                                        {moexPriceTable.currentRateRubPerCurrency != null ? formatRate(moexPriceTable.currentRateRubPerCurrency) : "—"}
                                      </td>
                                    </tr>
                                  </>
                                )}
                                <tr className="border-t border-white/10" style={{ backgroundColor: MODAL_BG }}>
                                  <td className="pl-6 pr-4 py-2 text-sm" style={{ color: PLACEHOLDER_COLOR_DARK }}>Стоимость в рублях</td>
                                  <td className="px-4 py-2 text-sm text-right tabular-nums" style={{ color: ACTIVE_TEXT_DARK }}>
                                    {moexPriceTable.userSpecifiedOpenPrice && moexPriceTable.openValueCents != null ? (
                                      <span className="flex items-center gap-2 justify-end">
                                        <CurrencyChip code="RUB" className="shrink-0" />
                                        {formatAmount(moexPriceTable.openValueCents)}
                                      </span>
                                    ) : "—"}
                                  </td>
                                  <td className="px-4 py-2 text-sm text-right tabular-nums align-top" style={{ color: ACTIVE_TEXT_DARK }}>
                                    {moexPriceTable.userSpecifiedOpenPrice && moexPriceTable.profitCents != null && moexPriceTable.profitPercent != null ? (() => {
                                      const color = moexPriceTable.profitCents >= 0 ? GREEN : RED;
                                      return (
                                        <span className="flex flex-col gap-0.5 text-right">
                                          <span style={{ color }}>{(moexPriceTable.profitCents >= 0 ? "+" : "")}{formatAmount(moexPriceTable.profitCents)}</span>
                                          <span style={{ color }}>{(moexPriceTable.profitPercent >= 0 ? "+" : "")}{moexPriceTable.profitPercent.toFixed(1)}%</span>
                                        </span>
                                      );
                                    })() : "—"}
                                  </td>
                                  <td className="px-6 py-2 text-sm text-right tabular-nums" style={{ color: ACTIVE_TEXT_DARK }}>
                                    {moexPriceTable.currentValueCents != null ? (
                                      <span className="flex items-center gap-2 justify-end">
                                        <CurrencyChip code="RUB" className="shrink-0" />
                                        {formatAmount(moexPriceTable.currentValueCents)}
                                      </span>
                                    ) : "—"}
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="flex flex-col gap-4 min-w-0">
                        <TextField label="Количество" value={quantityUnitsStr} onChange={(e) => setQuantityUnitsStr(e.target.value)} inputMode="decimal" placeholder="Например: 0.5" />
                        {resolvedHistoryStatus === "NEW" ? (
                          <TextField label="Цена (за 1 ед.)" currencyCode="USD" value={cryptoPurchasePrice} onChange={(e) => { userDidEditCryptoPriceRef.current = true; setCryptoPurchasePrice(formatRubInput(e.target.value)); }} onBlur={(e) => setCryptoPurchasePrice(normalizeRubOnBlur(e.target.value))} placeholder={cryptoPriceOnOpenDate?.price_usd_cents != null ? formatCentsForInput(cryptoPriceOnOpenDate.price_usd_cents) : marketPrice?.price_usd_cents != null ? formatCentsForInput(marketPrice.price_usd_cents) : "По умолчанию — рыночная цена"} />
                        ) : (
                          <TextField label="Цена приобретения" labelHint="Укажите среднюю цену приобретения позиции с момента её появления у вас" currencyCode="USD" value={historicalAcquisitionCost} onChange={(e) => setHistoricalAcquisitionCost(formatRubInput(e.target.value))} onBlur={(e) => setHistoricalAcquisitionCost(normalizeRubOnBlur(e.target.value))} placeholder="Например: 83,32" />
                        )}
                        {commissionAllowed && (
                          <TextField label="Сумма комиссии" currencyCode="USD" value={commissionAmount} onChange={(e) => setCommissionAmount(formatRubInput(e.target.value))} onBlur={(e) => setCommissionAmount(normalizeRubOnBlur(e.target.value))} placeholder="0" />
                        )}
                        {showOpeningCounterparty && (
                          <div className="grid gap-2">
                            <div className="flex min-h-6 items-center gap-2">
                              <Label style={{ color: ACTIVE_TEXT_DARK }}>{openingCounterpartyLabel}</Label>
                              <Tooltip content={openingHintModal ?? ""} contentClassName="w-80 max-w-[calc(100vw-2rem)]">
                                <span className="text-muted-foreground"><Info className="h-4 w-4" /></span>
                              </Tooltip>
                            </div>
                            <ItemSelector items={items.filter((it) => it.kind === "ASSET" && it.currency_code === currencyCode)} selectedIds={openingCounterpartyId ? [Number(openingCounterpartyId)] : []} onChange={(ids) => setOpeningCounterpartyId(ids[0] != null ? String(ids[0]) : "")} selectionMode="single" placeholder="Не выбирать" getItemTypeLabel={(it) => (it.name || "") + " " + (it.currency_code || "")} getCounterpartyForItemId={getCounterpartyForItemId} apiBase={API_BASE} />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex flex-col justify-center">
                        {cryptoPriceTable != null && (
                          <div className="rounded-lg overflow-hidden">
                            <table className="w-full text-left border-collapse text-sm" style={{ color: ACTIVE_TEXT_DARK }}>
                              <thead>
                                <tr style={{ color: PLACEHOLDER_COLOR_DARK, backgroundColor: BACKGROUND_DT }}>
                                  <th className="pl-6 pr-4 py-3 text-sm font-medium" />
                                  <th className="px-4 py-3 text-sm font-medium text-right">{openDate ? formatShortDate(openDate) : "Дата появления"}</th>
                                  <th className="px-4 py-3 text-sm font-medium text-right" />
                                  <th className="px-6 py-3 text-sm font-medium text-right">{formatShortDate(getTodayDateKey())}</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr className="border-t border-white/10" style={{ backgroundColor: MODAL_BG }}>
                                  <td className="pl-6 pr-4 py-2 text-sm" style={{ color: PLACEHOLDER_COLOR_DARK }}>Цена</td>
                                  <td className="px-4 py-2 text-sm text-right tabular-nums" style={{ color: ACTIVE_TEXT_DARK }}>
                                    {cryptoPriceTable.userSpecifiedOpenPrice && cryptoPriceTable.openPriceCents != null ? (
                                      <span className="flex items-center gap-2 justify-end">
                                        <CurrencyChip code="USD" className="shrink-0" />
                                        {formatAmount(cryptoPriceTable.openPriceCents)}
                                      </span>
                                    ) : "—"}
                                  </td>
                                  <td className="px-4 py-2 text-sm text-right tabular-nums align-top" style={{ color: ACTIVE_TEXT_DARK }}>
                                    {cryptoPriceTable.userSpecifiedOpenPrice && cryptoPriceTable.openPriceCents != null && cryptoPriceTable.currentPriceCents != null ? (() => {
                                      const priceChangeCents = cryptoPriceTable.currentPriceCents - cryptoPriceTable.openPriceCents;
                                      const priceChangePercent = cryptoPriceTable.openPriceCents !== 0 ? (priceChangeCents / cryptoPriceTable.openPriceCents) * 100 : null;
                                      const color = priceChangeCents >= 0 ? GREEN : RED;
                                      return (
                                        <span className="flex flex-col gap-0.5 text-right">
                                          <span style={{ color }}>{(priceChangeCents >= 0 ? "+" : "")}{formatAmount(priceChangeCents)}</span>
                                          {priceChangePercent != null && (
                                            <span style={{ color }}>{(priceChangePercent >= 0 ? "+" : "")}{priceChangePercent.toFixed(1)}%</span>
                                          )}
                                        </span>
                                      );
                                    })() : "—"}
                                  </td>
                                  <td className="px-6 py-2 text-sm text-right tabular-nums" style={{ color: ACTIVE_TEXT_DARK }}>
                                    {cryptoPriceTable.currentPriceCents != null ? (
                                      <span className="flex items-center gap-2 justify-end">
                                        <CurrencyChip code="USD" className="shrink-0" />
                                        {formatAmount(cryptoPriceTable.currentPriceCents)}
                                      </span>
                                    ) : "—"}
                                  </td>
                                </tr>
                                <tr className="border-t border-white/10" style={{ backgroundColor: MODAL_BG }}>
                                  <td className="pl-6 pr-4 py-2 text-sm" style={{ color: PLACEHOLDER_COLOR_DARK }}>Стоимость в валюте</td>
                                  <td className="px-4 py-2 text-sm text-right tabular-nums" style={{ color: ACTIVE_TEXT_DARK }}>
                                    {cryptoPriceTable.userSpecifiedOpenPrice && cryptoPriceTable.openValueInCurrencyCents != null ? (
                                      <span className="flex items-center gap-2 justify-end">
                                        <CurrencyChip code="USD" className="shrink-0" />
                                        {formatAmount(cryptoPriceTable.openValueInCurrencyCents)}
                                      </span>
                                    ) : "—"}
                                  </td>
                                  <td className="px-4 py-2 text-sm text-right tabular-nums align-top" style={{ color: ACTIVE_TEXT_DARK }}>
                                    {cryptoPriceTable.openValueInCurrencyCents != null && cryptoPriceTable.currentValueInCurrencyCents != null ? (() => {
                                      const delta = cryptoPriceTable.currentValueInCurrencyCents - cryptoPriceTable.openValueInCurrencyCents;
                                      const pct = cryptoPriceTable.openValueInCurrencyCents !== 0 ? (delta / cryptoPriceTable.openValueInCurrencyCents) * 100 : null;
                                      const color = delta >= 0 ? GREEN : RED;
                                      return (
                                        <span className="flex flex-col gap-0.5 text-right">
                                          <span style={{ color }}>{(delta >= 0 ? "+" : "")}{formatAmount(delta)}</span>
                                          {pct != null && <span style={{ color }}>{(pct >= 0 ? "+" : "")}{pct.toFixed(1)}%</span>}
                                        </span>
                                      );
                                    })() : "—"}
                                  </td>
                                  <td className="px-6 py-2 text-sm text-right tabular-nums" style={{ color: ACTIVE_TEXT_DARK }}>
                                    {cryptoPriceTable.currentValueInCurrencyCents != null ? (
                                      <span className="flex items-center gap-2 justify-end">
                                        <CurrencyChip code="USD" className="shrink-0" />
                                        {formatAmount(cryptoPriceTable.currentValueInCurrencyCents)}
                                      </span>
                                    ) : "—"}
                                  </td>
                                </tr>
                                <tr className="border-t border-white/10" style={{ backgroundColor: MODAL_BG }}>
                                  <td className="pl-6 pr-4 py-2 text-sm" style={{ color: PLACEHOLDER_COLOR_DARK }}>Курс</td>
                                  <td className="px-4 py-2 text-sm text-right tabular-nums" style={{ color: ACTIVE_TEXT_DARK }}>
                                    {cryptoPriceTable.openRateRubPerCurrency != null ? formatRate(cryptoPriceTable.openRateRubPerCurrency) : "—"}
                                  </td>
                                  <td className="px-4 py-2 text-sm text-right tabular-nums align-top" style={{ color: ACTIVE_TEXT_DARK }}>
                                    {cryptoPriceTable.openRateRubPerCurrency != null && cryptoPriceTable.currentRateRubPerCurrency != null ? (() => {
                                      const d = cryptoPriceTable.currentRateRubPerCurrency! - cryptoPriceTable.openRateRubPerCurrency!;
                                      const pct = cryptoPriceTable.openRateRubPerCurrency !== 0 ? (d / cryptoPriceTable.openRateRubPerCurrency!) * 100 : null;
                                      const color = d >= 0 ? GREEN : RED;
                                      return (
                                        <span className="flex flex-col gap-0.5 text-right">
                                          <span style={{ color }}>{(d >= 0 ? "+" : "")}{formatRate(d)}</span>
                                          {pct != null && <span style={{ color }}>{(pct >= 0 ? "+" : "")}{pct.toFixed(1)}%</span>}
                                        </span>
                                      );
                                    })() : "—"}
                                  </td>
                                  <td className="px-6 py-2 text-sm text-right tabular-nums" style={{ color: ACTIVE_TEXT_DARK }}>
                                    {cryptoPriceTable.currentRateRubPerCurrency != null ? formatRate(cryptoPriceTable.currentRateRubPerCurrency) : "—"}
                                  </td>
                                </tr>
                                <tr className="border-t border-white/10" style={{ backgroundColor: MODAL_BG }}>
                                  <td className="pl-6 pr-4 py-2 text-sm" style={{ color: PLACEHOLDER_COLOR_DARK }}>Стоимость в рублях</td>
                                  <td className="px-4 py-2 text-sm text-right tabular-nums" style={{ color: ACTIVE_TEXT_DARK }}>
                                    {cryptoPriceTable.userSpecifiedOpenPrice && cryptoPriceTable.openValueCents != null ? (
                                      <span className="flex items-center gap-2 justify-end">
                                        <CurrencyChip code="RUB" className="shrink-0" />
                                        {formatAmount(cryptoPriceTable.openValueCents)}
                                      </span>
                                    ) : "—"}
                                  </td>
                                  <td className="px-4 py-2 text-sm text-right tabular-nums align-top" style={{ color: ACTIVE_TEXT_DARK }}>
                                    {cryptoPriceTable.userSpecifiedOpenPrice && cryptoPriceTable.profitCents != null && cryptoPriceTable.profitPercent != null ? (() => {
                                      const color = cryptoPriceTable.profitCents >= 0 ? GREEN : RED;
                                      return (
                                        <span className="flex flex-col gap-0.5 text-right">
                                          <span style={{ color }}>{(cryptoPriceTable.profitCents >= 0 ? "+" : "")}{formatAmount(cryptoPriceTable.profitCents)}</span>
                                          <span style={{ color }}>{(cryptoPriceTable.profitPercent >= 0 ? "+" : "")}{cryptoPriceTable.profitPercent.toFixed(1)}%</span>
                                        </span>
                                      );
                                    })() : "—"}
                                  </td>
                                  <td className="px-6 py-2 text-sm text-right tabular-nums" style={{ color: ACTIVE_TEXT_DARK }}>
                                    {cryptoPriceTable.currentValueCents != null ? (
                                      <span className="flex items-center gap-2 justify-end">
                                        <CurrencyChip code="RUB" className="shrink-0" />
                                        {formatAmount(cryptoPriceTable.currentValueCents)}
                                      </span>
                                    ) : "—"}
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </CollapsibleFormSection>

            {/* ══════ 3. Планирование ══════ */}
            {showPlanSection && (
              <CollapsibleFormSection
                title="Планирование"
                defaultOpen={typeCode === "bonds" || typeCode === "securities" ? true : false}
                open={planSectionOpen}
                onToggle={() => setPlanSectionOpen((v) => !v)}
                titleRightNoTruncate
                titleRight={(showInterestPlanSettings || typeCode === "bonds" || typeCode === "securities" || showLoanPlanSettings) ? (
                  <span
                    role="presentation"
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="flex items-center gap-2 shrink-0 text-sm font-medium"
                    style={{ color: ACTIVE_TEXT_DARK }}
                  >
                    Добавить плановые транзакции
                    <Switch
                      checked={planEnabled}
                      onCheckedChange={(checked) => {
                        setPlanEnabled(checked);
                        if (checked) setPlanSectionOpen(true);
                      }}
                      disabled={(typeCode === "bonds" || typeCode === "securities") && !selectedInstrument?.secid}
                    />
                  </span>
                ) : undefined}
              >
                {(typeCode === "bonds" || typeCode === "securities") && !selectedInstrument?.secid && (
                  <p className="text-sm" style={{ color: PLACEHOLDER_COLOR_DARK }}>Выберите актив в блоке «Основное»</p>
                )}
                {typeCode === "bonds" && selectedInstrument?.secid && (
                  <div className="min-w-0">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start mb-4">
                      <Label style={{ color: ACTIVE_TEXT_DARK }} className="text-sm font-medium flex items-center min-h-10">Планировать до{planEnabled && <span style={{ color: "#FB4C4F" }}> *</span>}</Label>
                      <div className="min-w-0">
                        <DateField label="" value={planEndDate} onChange={(e) => setPlanEndDate(e.target.value)} placeholder="ГГГГ-ММ-ДД" required={planEnabled} />
                      </div>
                    </div>
                    {bondCouponsLoading && <p className="text-xs mb-2" style={{ color: SIDEBAR_TEXT_INACTIVE }}>Загрузка купонов...</p>}
                    {!bondCouponsLoading && bondCoupons.length > 0 && (
                      <div className="rounded-lg overflow-hidden">
                        <table className="w-full text-left border-collapse text-sm">
                          <thead>
                            <tr style={{ color: PLACEHOLDER_COLOR_DARK, backgroundColor: BACKGROUND_DT }}>
                              <th className="pl-6 pr-4 py-3 text-sm font-medium">Дата</th>
                              <th className="px-4 py-3 text-sm font-medium text-right">Величина купона</th>
                              <th className="px-6 py-3 text-sm font-medium text-right">Сумма с учётом количества</th>
                            </tr>
                          </thead>
                          <tbody>
                            {bondCoupons
                              .filter((c) => c.payment_date >= getTodayDateKey())
                              .map((c, i) => {
                              const quantity = (moexLots != null ? moexLots : 0) * (selectedInstrument?.lot_size ?? 1);
                              const totalCents = quantity > 0 ? c.coupon_value_cents * quantity : 0;
                              const inPlanPeriod = planEndDate && c.payment_date <= planEndDate;
                              return (
                                <tr
                                  key={i}
                                  className="border-t border-white/10"
                                  style={inPlanPeriod ? { backgroundColor: MODAL_BG } : undefined}
                                >
                                  <td className="pl-6 pr-4 py-2 text-sm" style={{ color: ACTIVE_TEXT_DARK }}>{formatShortDate(c.payment_date)}</td>
                                  <td className="px-4 py-2 text-sm text-right tabular-nums" style={{ color: ACTIVE_TEXT_DARK }}>
                                    <span className="flex items-center gap-2 justify-end">
                                      <CurrencyChip code={c.currency_code} className="shrink-0" />
                                      {formatAmount(c.coupon_value_cents)}
                                    </span>
                                  </td>
                                  <td className="px-6 py-2 text-sm text-right tabular-nums" style={{ color: ACTIVE_TEXT_DARK }}>
                                    {quantity > 0 ? (
                                      <span className="flex items-center gap-2 justify-end">
                                        <CurrencyChip code={c.currency_code} className="shrink-0" />
                                        {formatAmount(totalCents)}
                                      </span>
                                    ) : "—"}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {!bondCouponsLoading && bondCoupons.length === 0 && selectedInstrument?.secid && <p className="text-sm" style={{ color: PLACEHOLDER_COLOR_DARK }}>Нет данных о купонных выплатах</p>}
                  </div>
                )}
                {typeCode === "securities" && selectedInstrument?.secid && (
                  <div className="min-w-0">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start mb-4">
                      <Label style={{ color: ACTIVE_TEXT_DARK }} className="text-sm font-medium flex items-center min-h-10">Планировать до{planEnabled && <span style={{ color: "#FB4C4F" }}> *</span>}</Label>
                      <div className="min-w-0">
                        <DateField label="" value={planEndDate} onChange={(e) => setPlanEndDate(e.target.value)} placeholder="ГГГГ-ММ-ДД" required={planEnabled} />
                      </div>
                    </div>
                    {stockDividendsLoading && <p className="text-xs mb-2" style={{ color: SIDEBAR_TEXT_INACTIVE }}>Загрузка дивидендов...</p>}
                    {!stockDividendsLoading && stockDividends.length > 0 && (
                      <div className="rounded-lg overflow-hidden">
                        <table className="w-full text-left border-collapse text-sm">
                          <thead>
                            <tr style={{ color: PLACEHOLDER_COLOR_DARK, backgroundColor: BACKGROUND_DT }}>
                              <th className="pl-6 pr-4 py-3 text-sm font-medium">Дата</th>
                              <th className="px-4 py-3 text-sm font-medium text-right">Величина дивиденда</th>
                              <th className="px-6 py-3 text-sm font-medium text-right">Сумма с учётом количества</th>
                            </tr>
                          </thead>
                          <tbody>
                            {stockDividends
                              .filter((d) => d.payment_date >= getTodayDateKey())
                              .map((d, i) => {
                              const quantity = (moexLots != null ? moexLots : 0) * (selectedInstrument?.lot_size ?? 1);
                              const totalCents = quantity > 0 ? d.dividend_value_cents * quantity : 0;
                              const inPlanPeriod = planEndDate && d.payment_date <= planEndDate;
                              return (
                                <tr
                                  key={i}
                                  className="border-t border-white/10"
                                  style={inPlanPeriod ? { backgroundColor: MODAL_BG } : undefined}
                                >
                                  <td className="pl-6 pr-4 py-2 text-sm" style={{ color: ACTIVE_TEXT_DARK }}>{formatShortDate(d.payment_date)}</td>
                                  <td className="px-4 py-2 text-sm text-right tabular-nums" style={{ color: ACTIVE_TEXT_DARK }}>
                                    <span className="flex items-center gap-2 justify-end">
                                      <CurrencyChip code={d.currency_code} className="shrink-0" />
                                      {formatAmount(d.dividend_value_cents)}
                                    </span>
                                  </td>
                                  <td className="px-6 py-2 text-sm text-right tabular-nums" style={{ color: ACTIVE_TEXT_DARK }}>
                                    {quantity > 0 ? (
                                      <span className="flex items-center gap-2 justify-end">
                                        <CurrencyChip code={d.currency_code} className="shrink-0" />
                                        {formatAmount(totalCents)}
                                      </span>
                                    ) : "—"}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {!stockDividendsLoading && stockDividends.length === 0 && selectedInstrument?.secid && <p className="text-sm" style={{ color: PLACEHOLDER_COLOR_DARK }}>Нет данных о выплатах дивидендов</p>}
                  </div>
                )}
                {showInterestFields && (
                  <>
                    <div className={cn("grid grid-cols-1 gap-4", showDepositFields ? "md:grid-cols-3" : "md:grid-cols-2")}>
                      <TextField label="Процентная ставка" value={interestRate} onChange={(e) => setInterestRate(e.target.value)} placeholder="Например: 8,5" required={planEnabled && showInterestPlanSettings} />
                      <SelectField label="Как часто выплачиваются проценты" value={interestPayoutOrder} onValueChange={setInterestPayoutOrder} options={[{ value: "END_OF_TERM", label: "В конце срока" }, { value: "MONTHLY", label: "Ежемесячно" }]} placeholder="Выберите" required={planEnabled && showInterestPlanSettings} />
                      {showDepositFields && (
                        <div className="grid min-w-0 gap-2">
                          <div className="flex min-h-6 flex-wrap items-center justify-between gap-x-1.5 gap-y-0">
                            <Label style={{ color: ACTIVE_TEXT_DARK }} className="text-sm font-medium shrink-0">
                              {depositTermMode === "days" ? "Срок вклада (дней)" : "Дата окончания вклада"}
                              {planEnabled && showInterestPlanSettings && <span style={{ color: "#FB4C4F" }}> *</span>}
                            </Label>
                            <button
                              type="button"
                              onClick={() => {
                                const nextMode = depositTermMode === "days" ? "end_date" : "days";
                                setDepositTermMode(nextMode);
                                const od = openDate || getTodayDateKey();
                                if (nextMode === "end_date" && depositTermDays.trim()) {
                                  const n = Math.trunc(Number(depositTermDays));
                                  if (Number.isFinite(n) && n >= 0) setDepositEndDate(toDateKey(addDays(parseDateKey(od), n)));
                                } else if (nextMode === "days" && depositEndDate) {
                                  const days = Math.round((parseDateKey(depositEndDate).getTime() - parseDateKey(od).getTime()) / (24 * 60 * 60 * 1000));
                                  if (Number.isFinite(days) && days >= 0) setDepositTermDays(String(days));
                                }
                              }}
                              className="shrink-0 flex items-center gap-1.5 font-semibold text-sm"
                              style={{ color: ACCENT }}
                            >
                              <RefreshCcw className="w-4 h-4 shrink-0" />
                              {depositTermMode === "days" ? "Дата окончания" : "Срок (дней)"}
                            </button>
                          </div>
                          {depositTermMode === "days" ? (
                            <TextField
                              label=""
                              value={depositTermDays}
                              onChange={(e) => {
                                const val = e.target.value.replace(/\D/g, "");
                                setDepositTermDays(val);
                                const od = openDate || getTodayDateKey();
                                if (od && val.trim()) {
                                  const n = Math.trunc(Number(val));
                                  if (Number.isFinite(n) && n >= 0) setDepositEndDate(toDateKey(addDays(parseDateKey(od), n)));
                                }
                              }}
                              placeholder="Необязательно"
                            />
                          ) : (
                            <DateField
                              label=""
                              value={depositEndDate}
                              onChange={(e) => {
                                const val = e.target.value;
                                setDepositEndDate(val);
                                const od = openDate || getTodayDateKey();
                                if (od && val) {
                                  const days = Math.round((parseDateKey(val).getTime() - parseDateKey(od).getTime()) / (24 * 60 * 60 * 1000));
                                  if (Number.isFinite(days) && days >= 0) setDepositTermDays(String(days));
                                }
                              }}
                              placeholder="ГГГГ-ММ-ДД"
                            />
                          )}
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
                      <div className="flex items-center justify-center gap-2 min-w-0">
                        <Label style={{ color: ACTIVE_TEXT_DARK }} className="text-sm font-medium">Проценты зачисляются на счет вклада</Label>
                        <Switch checked={interestToSameAccount} onCheckedChange={(checked) => { setInterestToSameAccount(checked); if (checked) setInterestPayoutAccountId(""); }} />
                      </div>
                      {!interestToSameAccount && (
                        <div className="min-w-0">
                          <FormField label="Куда зачисляются проценты" required={showInterestFields && !interestToSameAccount}>
                            <ItemSelector items={items.filter((it) => it.kind === "ASSET")} selectedIds={interestPayoutAccountId ? [Number(interestPayoutAccountId)] : []} onChange={(ids) => setInterestPayoutAccountId(ids[0] != null ? String(ids[0]) : "")} selectionMode="single" placeholder="Выберите счет" getItemTypeLabel={(it) => (it.name || "") + " " + (it.currency_code || "")} getCounterpartyForItemId={getCounterpartyForItemId} apiBase={API_BASE} />
                          </FormField>
                        </div>
                      )}
                    </div>
                  </>
                )}
                {showInterestPlanSettings && (
                  <>
                    {!showDepositFields && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                        <Label style={{ color: ACTIVE_TEXT_DARK }} className="text-sm font-medium flex items-center min-h-10">Планировать до{planEnabled && <span style={{ color: "#FB4C4F" }}> *</span>}</Label>
                        <div className="min-w-0">
                          <DateField label="" value={planEndDate} onChange={(e) => setPlanEndDate(e.target.value)} placeholder="ГГГГ-ММ-ДД" required={planEnabled} />
                        </div>
                      </div>
                    )}
                    {interestPayoutOrder === "MONTHLY" && (
                      <SelectField label="Первая дата выплаты процентов" value={firstPayoutRule} onValueChange={(v) => setFirstPayoutRule(v as FirstPayoutRule)} options={[{ value: "MONTH_END", label: "Последний день месяца" }, { value: "OPEN_DATE", label: "Тот же день, что и дата появления" }]} placeholder="Выберите" required={planEnabled} />
                    )}
                  </>
                )}
                {showLoanPlanSettings && (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch">
                      <SelectField label="Тип погашения" value={repaymentType} onValueChange={(v) => setRepaymentType(v as RepaymentType)} options={[{ value: "ANNUITY", label: "Аннуитет" }, { value: "DIFFERENTIATED", label: "Дифференцированный" }]} placeholder="Не выбрано" required={isCreditLiabilityWithPlan} />
                      <div className="min-w-0">
                        <FormField label="Откуда погашается" required={isCreditLiabilityWithPlan}>
                          <ItemSelector items={items.filter((it) => REPAYMENT_ACCOUNT_TYPE_CODES.includes(it.type_code))} selectedIds={repaymentAccountId ? [Number(repaymentAccountId)] : []} onChange={(ids) => setRepaymentAccountId(ids[0] != null ? String(ids[0]) : "")} selectionMode="single" placeholder="Выберите счет" getItemTypeLabel={(it) => (it.name || "") + " " + (it.currency_code || "")} getCounterpartyForItemId={getCounterpartyForItemId} apiBase={API_BASE} />
                        </FormField>
                      </div>
                      <TextField label="Процентная ставка" value={interestRate} onChange={(e) => setInterestRate(e.target.value)} placeholder="Например: 8,5" required={isCreditLiabilityWithPlan} />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch">
                      <div className="grid min-w-0 gap-2">
                        <div className="flex min-h-6 flex-wrap items-center justify-between gap-x-1.5 gap-y-0">
                          <Label style={{ color: ACTIVE_TEXT_DARK }} className="text-sm font-medium shrink-0">
                            {loanTermMode === "months" ? "Срок до погашения (мес.)" : "Плановая дата погашения"}
                            {(planEnabled || isCreditLiabilityWithPlan) && <span style={{ color: "#FB4C4F" }}> *</span>}
                          </Label>
                          <button
                            type="button"
                            onClick={() => {
                              const nextMode = loanTermMode === "months" ? "end_date" : "months";
                              setLoanTermMode(nextMode);
                              const od = openDate || getTodayDateKey();
                              if (nextMode === "end_date" && loanTermMonths.trim()) {
                                const n = Math.trunc(Number(loanTermMonths));
                                if (Number.isFinite(n) && n >= 0) setLoanEndDate(toDateKey(addMonths(parseDateKey(od), n)));
                              } else if (nextMode === "months" && loanEndDate) {
                                const start = parseDateKey(od);
                                const end = parseDateKey(loanEndDate);
                                let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
                                if (end.getDate() < start.getDate()) months -= 1;
                                if (Number.isFinite(months) && months >= 0) setLoanTermMonths(String(months));
                              }
                            }}
                            className="shrink-0 flex items-center gap-1.5 font-semibold text-sm"
                            style={{ color: ACCENT }}
                          >
                            <RefreshCcw className="w-4 h-4 shrink-0" />
                            {loanTermMode === "months" ? "Дата окончания" : "Срок (мес.)"}
                          </button>
                        </div>
                        {loanTermMode === "months" ? (
                          <TextField
                            label=""
                            value={loanTermMonths}
                            onChange={(e) => {
                              const val = e.target.value.replace(/\D/g, "");
                              setLoanTermMonths(val);
                              const od = openDate || getTodayDateKey();
                              if (od && val.trim()) {
                                const n = Math.trunc(Number(val));
                                if (Number.isFinite(n) && n >= 0) setLoanEndDate(toDateKey(addMonths(parseDateKey(od), n)));
                              }
                            }}
                            placeholder="Необязательно"
                          />
                        ) : (
                          <DateField
                            label=""
                            value={loanEndDate}
                            onChange={(e) => {
                              const val = e.target.value;
                              setLoanEndDate(val);
                              const od = openDate || getTodayDateKey();
                              if (od && val) {
                                const start = parseDateKey(od);
                                const end = parseDateKey(val);
                                let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
                                if (end.getDate() < start.getDate()) months -= 1;
                                if (Number.isFinite(months) && months >= 0) setLoanTermMonths(String(months));
                              }
                            }}
                            placeholder="ГГГГ-ММ-ДД"
                          />
                        )}
                      </div>
                      <SelectField label="Периодичность погашения" value={repaymentFrequency} onValueChange={(v) => setRepaymentFrequency(v as TransactionChainFrequency)} options={[{ value: "WEEKLY", label: "Еженедельно" }, { value: "MONTHLY", label: "Ежемесячно" }, { value: "REGULAR", label: "С заданным интервалом (дни)" }]} required={planEnabled || isCreditLiabilityWithPlan} />
                      {repaymentFrequency === "MONTHLY" ? (
                        <TextField label="Число месяца платежа" value={repaymentMonthlyDay} onChange={(e) => setRepaymentMonthlyDay(e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="1–31" required={planEnabled || isCreditLiabilityWithPlan} />
                      ) : repaymentFrequency === "WEEKLY" ? (
                        <SelectField label="День недели погашения" value={String(repaymentWeeklyDay)} onValueChange={(v) => setRepaymentWeeklyDay(Number(v))} options={[{ value: "0", label: "Понедельник" }, { value: "1", label: "Вторник" }, { value: "2", label: "Среда" }, { value: "3", label: "Четверг" }, { value: "4", label: "Пятница" }, { value: "5", label: "Суббота" }, { value: "6", label: "Воскресенье" }]} placeholder="Выберите день" required={planEnabled || isCreditLiabilityWithPlan} />
                      ) : (
                        <TextField label="Интервал (дней)" value={repaymentIntervalDays} onChange={(e) => setRepaymentIntervalDays(e.target.value.replace(/\D/g, ""))} placeholder="1" required={planEnabled || isCreditLiabilityWithPlan} />
                      )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                      <div className="flex items-center justify-between gap-2 min-w-0">
                        <Label style={{ color: ACTIVE_TEXT_DARK }} className="text-sm font-medium">Первый платеж — только проценты</Label>
                        <Switch checked={firstPaymentInterestOnly} onCheckedChange={setFirstPaymentInterestOnly} />
                      </div>
                      <div className="flex items-center justify-between gap-2 min-w-0">
                        <Label style={{ color: ACTIVE_TEXT_DARK }} className="text-sm font-medium">Пропустить первый месяц</Label>
                        <Switch checked={skipFirstPayment} onCheckedChange={setSkipFirstPayment} />
                      </div>
                      <div className="flex items-center justify-between gap-2 min-w-0">
                        <Label style={{ color: ACTIVE_TEXT_DARK }} className="text-sm font-medium">Переносить платеж с выходных дней</Label>
                        <Switch checked={shiftWeekendPaymentToWorkday} onCheckedChange={setShiftWeekendPaymentToWorkday} />
                      </div>
                    </div>
                    {requiresLoanPaymentInput && (
                      <>
                        <SelectField label="Тип суммы погашения" value={paymentAmountKind} onValueChange={(v) => setPaymentAmountKind(v as PaymentAmountKind)} options={[{ value: "FIXED", label: "Фиксированная сумма" }, { value: "PERCENT", label: "Процент от остатка" }]} placeholder="Выберите" required={planEnabled} />
                        <TextField label="Сумма погашения" currencyCode={currencyCode} value={paymentAmountStr} onChange={(e) => setPaymentAmountStr(formatRubInput(e.target.value))} onBlur={(e) => setPaymentAmountStr(normalizeRubOnBlur(e.target.value))} placeholder="0" required={planEnabled} />
                      </>
                    )}
                    {loanSchedulePreview && loanSchedulePreview.length > 0 && (
                      <div className="rounded-lg overflow-hidden border border-white/10">
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse text-sm">
                            <thead>
                              <tr style={{ color: PLACEHOLDER_COLOR_DARK, backgroundColor: BACKGROUND_DT }}>
                                <th className="pl-6 pr-4 py-3 text-sm font-medium">Дата</th>
                                <th className="px-4 py-3 text-sm font-medium text-right">Платеж</th>
                                <th className="px-4 py-3 text-sm font-medium text-right">Основной долг</th>
                                <th className="px-4 py-3 text-sm font-medium text-right">Проценты</th>
                                <th className="px-6 py-3 text-sm font-medium text-right">Остаток долга</th>
                              </tr>
                            </thead>
                            <tbody>
                              {loanSchedulePreview.map((row) => (
                                <tr key={row.dateKey} className="border-t border-white/10" style={{ backgroundColor: MODAL_BG }}>
                                  <td className="pl-6 pr-4 py-2 text-sm" style={{ color: ACTIVE_TEXT_DARK }}>{formatShortDate(row.dateKey)}</td>
                                  <td className="px-4 py-2 text-sm text-right tabular-nums" style={{ color: ACTIVE_TEXT_DARK }}>{formatAmount(row.totalCents)}</td>
                                  <td className="px-4 py-2 text-sm text-right tabular-nums" style={{ color: ACTIVE_TEXT_DARK }}>{formatAmount(row.principalCents)}</td>
                                  <td className="px-4 py-2 text-sm text-right tabular-nums" style={{ color: ACTIVE_TEXT_DARK }}>{formatAmount(row.interestCents)}</td>
                                  <td className="px-6 py-2 text-sm text-right tabular-nums" style={{ color: ACTIVE_TEXT_DARK }}>{formatAmount(row.remainingCents)}</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="border-t border-white/10 font-medium" style={{ backgroundColor: BACKGROUND_DT, color: ACTIVE_TEXT_DARK }}>
                                <td className="pl-6 pr-4 py-3 text-sm">Итого</td>
                                <td className="px-4 py-3 text-sm text-right tabular-nums">{formatAmount(loanSchedulePreview.reduce((s, r) => s + r.totalCents, 0))}</td>
                                <td className="px-4 py-3 text-sm text-right tabular-nums">{formatAmount(loanSchedulePreview.reduce((s, r) => s + r.principalCents, 0))}</td>
                                <td className="px-4 py-3 text-sm text-right tabular-nums">{formatAmount(loanSchedulePreview.reduce((s, r) => s + r.interestCents, 0))}</td>
                                <td className="px-6 py-3 text-sm text-right" />
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CollapsibleFormSection>
            )}

            {/* ══════ 4. Дополнительно ══════ */}
            <CollapsibleFormSection title="Дополнительно" defaultOpen={false}>
              <ChipsInput label="Синонимы" labelHint="Добавьте альтернативные названия. При импорте транзакций актив/обязательство будет подбираться и по синонимам (например, *1234 для карты)." value={synonyms} onChange={setSynonyms} placeholder="Введите синоним и нажмите Enter" maxItems={50} maxLengthPerItem={300} />

              {showBankCardFields && isCreditCard && (
                <TextField label="Кредитный лимит" value={creditLimit} onChange={(e) => setCreditLimit(formatRubInput(e.target.value))} onBlur={(e) => setCreditLimit(normalizeRubOnBlur(e.target.value))} placeholder="0" />
              )}

              {showBankAccountFields && <TextField label="Последние 7 цифр номера счета" value={accountLast7} onChange={(e) => setAccountLast7(e.target.value.replace(/\D/g, "").slice(0, 7))} placeholder="Необязательно" />}
              {showContractNumberField && <TextField label="Номер договора" value={contractNumber} onChange={(e) => setContractNumber(e.target.value)} placeholder="Необязательно" />}

              {showBankCardFields && (
                <TextField label="Последние 4 цифры карты" value={cardLast4} onChange={(e) => setCardLast4(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="Необязательно" />
              )}


            </CollapsibleFormSection>
            </>)}
        </div>
      </FormModal>
    </>
  );
}
