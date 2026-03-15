"use client";

import { createPortal } from "react-dom";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  Archive,
  Banknote,
  BarChart3,
  Car,
  ChevronDown,
  Coins,
  CreditCard,
  Home,
  Landmark,
  LayoutGrid,
  List,
  MoreVertical,
  Package,
  Pencil,
  PiggyBank,
  Plus,
  Receipt,
  Search,
  Trash2,
  TrendingUp,
  Users,
  Wallet,
  LineChart,
  Info,
  Upload,
  Camera,
  X,
} from "lucide-react";

import { AddEditItemFormModal } from "@/components/add-edit-item-form-modal";
import { ConfirmModal } from "@/components/confirm-modal";
import { FormModal } from "@/components/form-modal";
import { EmptyState } from "@/components/empty-state";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { CurrencyChip } from "@/components/currency-chip";
import { ItemSelector } from "@/components/item-selector";
import { CounterpartySelector } from "@/components/counterparty-selector";
import { CreateCounterpartyModal } from "@/components/create-counterparty-modal";
import { useAccountingStart } from "@/components/accounting-start-context";
import { useOnboarding } from "@/components/onboarding-context";
import { FilterSection } from "@/components/filter-panel";
import { AssetCard } from "@/components/asset-card";
import { MobileTapScale } from "@/components/mobile-tap-scale";
import { BuySellAssetModal } from "@/components/buy-sell-asset-modal";
import { AuthInput } from "@/components/ui/auth-input";
import { SegmentedSelector } from "@/components/ui/segmented-selector";
import { useSidebar } from "@/components/ui/sidebar-context";
import { CollapsibleFormSection } from "@/components/ui/collapsible-form-section";
import { TextField, DateField, SelectField, FormField } from "@/components/ui/form-field";
import { CONTENT_WIDTH_CLASS } from "@/lib/content-width";
import { buildCounterpartyDisplayName } from "@/lib/counterparty-utils";
import { buildItemDailyPrimaryValueRubCents } from "@/lib/item-daily-value";
import { ACCENT, ACCENT2, PLACEHOLDER_COLOR_DARK, ACTIVE_TEXT_DARK, SIDEBAR_TEXT_ACTIVE, SIDEBAR_TEXT_INACTIVE, DROPDOWN_BG, MODAL_BG, BACKGROUND_DT, ACCENT_FILL_MEDIUM } from "@/lib/colors";
import { PINK_GRADIENT } from "@/lib/gradients";
import { cn } from "@/lib/utils";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChipsInput } from "@/components/ui/chips-input";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useSession } from "next-auth/react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tooltip } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  fetchItems,
  fetchBanks,
  fetchCounterparties,
  fetchCounterpartyIndustries,
  fetchCurrencies,
  fetchFxRates,
  fetchMarketInstruments,
  fetchMarketInstrumentDetails,
  fetchMarketInstrumentPrice,
  fetchMarketInstrumentPrices,
  fetchTransactions,
  fetchTransactionChains,
  fetchItemCosts,
  createItem,
  createItemMarketValue,
  updateItem,
  archiveItem,
  closeItem,
  uploadItemPhoto,
  API_BASE,
  ItemKind,
  ItemCreate,
  ItemOut,
  BankOut,
  CounterpartyOut,
  CounterpartyIndustryOut,
  CurrencyOut,
  FxRateOut,
  MarketBoardOut,
  MarketInstrumentOut,
  MarketPriceOut,
  TransactionChainOut,
  TransactionOut,
  ItemCostsOut,
  TransactionChainFrequency,
  TransactionChainMonthlyRule,
  FirstPayoutRule,
  RepaymentType,
  PaymentAmountKind,
  PrimaryValueKind,
} from "@/lib/api";
import { getDefaultPrimaryValueKind, getPrimaryValueLabel } from "@/lib/asset-item-form-constants";
import { formatRubInput, normalizeRubOnBlur, parseRubToCents } from "@/lib/format-rub";
import { buildItemTransactionCounts, getEffectiveItemKind, formatAmount, getItemPhotoUrl, getItemPrimaryValueCents, sortItemsByTransactionCount } from "@/lib/item-utils";
import { buildCounterpartyTransactionCounts } from "@/lib/counterparty-utils";
import { resolveApiImageUrlToBase } from "@/lib/api-image-url";
import { getItemTypeLabel, ITEM_TYPE_LABELS } from "@/lib/item-types";
import { assetIconPath } from "@/lib/image-paths";


/* ------------------ справочники ------------------ */

const ASSET_TYPES = [
  { code: "cash", label: "Наличные" },
  { code: "bank_account", label: "Банковский счёт" },
  { code: "bank_card_debit", label: "Банковская карта (дебетовая)" },
  { code: "bank_card_credit", label: "Банковская карта (кредитная)" },
  { code: "savings_account", label: "Накопительный счет" },
  { code: "e_wallet", label: "Электронный кошелек" },
  { code: "brokerage", label: "Брокерский счёт" },
  { code: "deposit", label: "Вклад" },
  { code: "securities", label: "Акции" },
  { code: "bonds", label: "Облигации" },
  { code: "etf", label: "ETF" },
  { code: "bpif", label: "БПИФ" },
  { code: "pif", label: "ПИФ" },
  { code: "iis", label: "ИИС" },
  { code: "precious_metals", label: "Драгоценные металлы" },
  { code: "crypto", label: "Криптовалюта" },
  { code: "loan_to_third_party", label: "Предоставленные займы третьим лицам" },
  { code: "real_estate", label: "Квартира" },
  { code: "townhouse", label: "Дом / таунхаус" },
  { code: "land_plot", label: "Земельный участок" },
  { code: "garage", label: "Гараж / машиноместо" },
  { code: "commercial_real_estate", label: "Коммерческая недвижимость" },
  { code: "real_estate_share", label: "Доля в недвижимости" },
  { code: "car", label: "Автомобиль" },
  { code: "motorcycle", label: "Мотоцикл" },
  { code: "boat", label: "Катер / лодка" },
  { code: "trailer", label: "Прицеп" },
  { code: "special_vehicle", label: "Спецтехника" },
  { code: "jewelry", label: "Драгоценности" },
  { code: "electronics", label: "Техника и электроника" },
  { code: "art", label: "Ценные предметы искусства" },
  { code: "collectibles", label: "Коллекционные вещи" },
  { code: "other_valuables", label: "Прочие ценные вещи" },
  { code: "npf", label: "НПФ" },
  { code: "investment_life_insurance", label: "ИСЖ" },
  { code: "business_share", label: "Доля в бизнесе" },
  { code: "sole_proprietor", label: "ИП (оценка бизнеса)" },
  { code: "other_asset", label: "Прочие активы" },
];

const ASSET_TYPE_CODES = ASSET_TYPES.map((type) => type.code);

const LIABILITY_TYPES = [
  { code: "consumer_loan", label: "Потребительский кредит" },
  { code: "mortgage", label: "Ипотека" },
  { code: "car_loan", label: "Автокредит" },
  { code: "education_loan", label: "Образовательный кредит" },
  { code: "installment", label: "Рассрочка" },
  { code: "microloan", label: "МФО" },
  { code: "private_loan", label: "Полученные займы от третьих лиц" },
  { code: "tax_debt", label: "Налоги и обязательные платежи" },
  { code: "personal_income_tax_debt", label: "Задолженность по НДФЛ" },
  { code: "property_tax_debt", label: "Задолженность по налогу на имущество" },
  { code: "land_tax_debt", label: "Задолженность по земельному налогу" },
  { code: "transport_tax_debt", label: "Задолженность по транспортному налогу" },
  { code: "fns_debt", label: "Задолженности перед ФНС" },
  { code: "utilities_debt", label: "Задолженность по ЖКХ" },
  { code: "telecom_debt", label: "Задолженность за интернет / связь" },
  { code: "traffic_fines_debt", label: "Задолженность по штрафам (ГИБДД и прочие)" },
  { code: "enforcement_debt", label: "Задолженность по исполнительным листам" },
  { code: "alimony_debt", label: "Задолженность по алиментам" },
  { code: "court_debt", label: "Судебные задолженности" },
  { code: "court_fine_debt", label: "Штрафы по решениям суда" },
  { code: "business_liability", label: "Бизнес-обязательства" },
  { code: "other_liability", label: "Прочие обязательства" },
];

const LIABILITY_TYPE_CODES = LIABILITY_TYPES.map((type) => type.code);
const ALL_TYPE_CODES = [...ASSET_TYPE_CODES, ...LIABILITY_TYPE_CODES];

// Категории активов (синхронно с asset-item-form-constants)
/** Включает legacy type_code "bank_card" для отображения старых дебетовых карт в секции «Денежные активы». */
const CASH_TYPES = ["cash", "bank_account", "bank_card", "bank_card_debit", "bank_card_credit", "e_wallet"];
const INVESTMENT_TYPES = [
  "deposit",
  "savings_account",
  "brokerage",
  "securities",
  "bonds",
  "crypto",
  "precious_metals",
];
const REPAYMENT_ACCOUNT_TYPE_CODES = ["cash", "bank_account", "bank_card", "bank_card_debit", "bank_card_credit", "e_wallet", "savings_account", "brokerage"];
const MOEX_TYPE_CODES = [
  "securities",
  "bonds",
  "etf",
  "bpif",
  "pif",
  "precious_metals",
];
const THIRD_PARTY_DEBT_TYPES = ["loan_to_third_party", "counterparty_settlements"];
const REAL_ESTATE_TYPES = [
  "real_estate",
  "townhouse",
  "land_plot",
  "garage",
  "commercial_real_estate",
  "real_estate_share",
];
const TRANSPORT_TYPES = ["car", "motorcycle", "boat", "trailer", "special_vehicle"];
const VALUABLES_TYPES = ["jewelry", "electronics", "art", "collectibles", "other_valuables"];
const PENSION_TYPES = ["npf", "investment_life_insurance"];
const OTHER_ASSET_TYPES = ["business_share", "sole_proprietor", "other_asset"];
const CREDIT_LIABILITY_TYPES = [
  "consumer_loan",
  "mortgage",
  "car_loan",
  "education_loan",
  "installment",
  "microloan",
];
const THIRD_PARTY_LOAN_TYPES = ["private_loan", "counterparty_settlements"];
const LOAN_LIABILITY_TYPES = [...CREDIT_LIABILITY_TYPES, ...THIRD_PARTY_LOAN_TYPES];
const TAX_LIABILITY_TYPES = [
  "tax_debt",
  "personal_income_tax_debt",
  "property_tax_debt",
  "land_tax_debt",
  "transport_tax_debt",
  "fns_debt",
];
const UTILITY_LIABILITY_TYPES = ["utilities_debt", "telecom_debt", "traffic_fines_debt"];
const LEGAL_LIABILITY_TYPES = [
  "enforcement_debt",
  "alimony_debt",
  "court_debt",
  "court_fine_debt",
];
const OTHER_LIABILITY_TYPES = ["business_liability", "other_liability"];
const MANDATORY_COUNTERPARTY_TYPE_CODES = [
  "bank_account",
  "bank_card_debit",
  "bank_card_credit",
  "deposit",
  "savings_account",
  "consumer_loan",
  "mortgage",
  "car_loan",
  "education_loan",
  "loan_to_third_party",
  "private_loan",
];

const OPTIONAL_COUNTERPARTY_TYPE_CODES = [
  "brokerage",
  "installment",
  "microloan",
  "e_wallet",
  "npf",
  "investment_life_insurance",
  "utilities_debt",
  "telecom_debt",
  "tax_debt",
  "fns_debt",
  "traffic_fines_debt",
  "enforcement_debt",
  "alimony_debt",
  "court_debt",
  "court_fine_debt",
  "personal_income_tax_debt",
  "property_tax_debt",
  "land_tax_debt",
  "transport_tax_debt",
];

const BANK_COUNTERPARTY_TYPE_CODES = [
  "bank_account",
  "bank_card_debit",
  "bank_card_credit",
  "deposit",
  "savings_account",
  "brokerage",
  "consumer_loan",
  "mortgage",
  "car_loan",
  "education_loan",
];
const BANK_CARD_TYPE_CODES = ["bank_card_debit", "bank_card_credit"];
function isBankCardItem(item: { type_code?: string | null }): boolean {
  return item.type_code === "bank_card" || BANK_CARD_TYPE_CODES.includes(item.type_code ?? "");
}

// Все типы, где контрагент релевантен
const COUNTERPARTY_TYPE_CODES = [
  ...MANDATORY_COUNTERPARTY_TYPE_CODES,
  ...OPTIONAL_COUNTERPARTY_TYPE_CODES,
];

const BANK_TYPE_CODES = BANK_COUNTERPARTY_TYPE_CODES;

const AUTO_PLAN_INTEREST_TYPES = ["deposit", "savings_account"];
const AUTO_PLAN_LOAN_TYPES = [
  ...CREDIT_LIABILITY_TYPES,
  ...THIRD_PARTY_LOAN_TYPES,
  "loan_to_third_party",
];

const ITEM_SECTIONS: {
  id: string;
  kind: ItemKind;
  label: string;
  typeCodes: string[];
}[] = [
  { id: "cash_assets", kind: "ASSET", label: "Денежные активы", typeCodes: CASH_TYPES },
  {
    id: "investment_assets",
    kind: "ASSET",
    label: "Инвестиционные активы",
    typeCodes: INVESTMENT_TYPES,
  },
  {
    id: "third_party_assets",
    kind: "ASSET",
    label: "Долги третьих лиц",
    typeCodes: THIRD_PARTY_DEBT_TYPES,
  },
  { id: "real_estate", kind: "ASSET", label: "Недвижимость", typeCodes: REAL_ESTATE_TYPES },
  { id: "transport", kind: "ASSET", label: "Транспорт", typeCodes: TRANSPORT_TYPES },
  { id: "valuables", kind: "ASSET", label: "Имущество", typeCodes: VALUABLES_TYPES },
  {
    id: "pension_assets",
    kind: "ASSET",
    label: "Пенсионные и страховые активы",
    typeCodes: PENSION_TYPES,
  },
  { id: "other_assets", kind: "ASSET", label: "Прочие активы", typeCodes: OTHER_ASSET_TYPES },
  {
    id: "credit_liabilities",
    kind: "LIABILITY",
    label: "Кредитные обязательства",
    typeCodes: CREDIT_LIABILITY_TYPES,
  },
  {
    id: "third_party_loans",
    kind: "LIABILITY",
    label: "Долги третьим лицам",
    typeCodes: THIRD_PARTY_LOAN_TYPES,
  },
  {
    id: "tax_liabilities",
    kind: "LIABILITY",
    label: "Налоги и обязательные платежи",
    typeCodes: TAX_LIABILITY_TYPES,
  },
  {
    id: "utility_liabilities",
    kind: "LIABILITY",
    label: "Коммунальные и бытовые долги",
    typeCodes: UTILITY_LIABILITY_TYPES,
  },
  {
    id: "legal_liabilities",
    kind: "LIABILITY",
    label: "Судебные и иные обязательства",
    typeCodes: LEGAL_LIABILITY_TYPES,
  },
  {
    id: "other_liabilities",
    kind: "LIABILITY",
    label: "Прочие обязательства",
    typeCodes: OTHER_LIABILITY_TYPES,
  },
];

const TYPE_ICON_BY_CODE: Record<
  string,
  React.ComponentType<{ className?: string; strokeWidth?: number }>
> = {
  cash: Banknote,
  bank_account: Landmark,
  bank_card: CreditCard,
  bank_card_debit: CreditCard,
  bank_card_credit: CreditCard,
  deposit: PiggyBank,
  savings_account: Wallet,
  e_wallet: Wallet,
  brokerage: LineChart,
  securities: BarChart3,
  bonds: BarChart3,
  etf: BarChart3,
  bpif: BarChart3,
  pif: BarChart3,
  iis: LineChart,
  precious_metals: Coins,
  crypto: Coins,
  loan_to_third_party: Users,
  counterparty_settlements: Users,
  real_estate: Home,
  townhouse: Home,
  land_plot: Home,
  garage: Home,
  commercial_real_estate: Home,
  real_estate_share: Home,
  car: Car,
  motorcycle: Car,
  boat: Car,
  trailer: Car,
  special_vehicle: Car,
  jewelry: Package,
  electronics: Package,
  art: Package,
  collectibles: Package,
  other_valuables: Package,
  npf: PiggyBank,
  investment_life_insurance: PiggyBank,
  business_share: TrendingUp,
  sole_proprietor: TrendingUp,
  other_asset: Package,
  consumer_loan: Coins,
  mortgage: Home,
  car_loan: Car,
  education_loan: Coins,
  installment: Receipt,
  microloan: Coins,
  private_loan: Users,
  tax_debt: Receipt,
  personal_income_tax_debt: Receipt,
  property_tax_debt: Receipt,
  land_tax_debt: Receipt,
  transport_tax_debt: Receipt,
  fns_debt: Receipt,
  utilities_debt: Receipt,
  telecom_debt: Receipt,
  traffic_fines_debt: Receipt,
  enforcement_debt: AlertCircle,
  alimony_debt: AlertCircle,
  court_debt: AlertCircle,
  court_fine_debt: AlertCircle,
  business_liability: AlertCircle,
  other_liability: AlertCircle,
};

function formatRub(valueInCents: number) {
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valueInCents / 100);
}

function formatMoney(valueInCents: number | null, currencyCode?: string | null) {
  if (valueInCents == null) return "-";
  const code = currencyCode ?? "";
  const suffix = code ? ` ${code}` : "";
  return `${formatAmount(valueInCents)}${suffix}`;
}

const CHAIN_FREQUENCY_LABELS: Record<TransactionChainFrequency, string> = {
  DAILY: "Ежедневно",
  WEEKLY: "Еженедельно",
  MONTHLY: "Ежемесячно",
  REGULAR: "Регулярно",
};

const WEEKDAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function formatChainAmount(chain: TransactionChainOut) {
  if (
    chain.amount_is_variable &&
    chain.amount_min_rub != null &&
    chain.amount_max_rub != null
  ) {
    if (chain.amount_min_rub === chain.amount_max_rub) {
      return formatAmount(chain.amount_min_rub);
    }
    return `${formatAmount(chain.amount_min_rub)}-${formatAmount(chain.amount_max_rub)}`;
  }
  return formatAmount(chain.amount);
}

function formatChainFrequency(chain: TransactionChainOut) {
  if (chain.start_date === chain.end_date) {
    return "Разово";
  }
  if (chain.frequency === "REGULAR" && chain.interval_days) {
    return `Каждые ${chain.interval_days} дн.`;
  }
  let label = CHAIN_FREQUENCY_LABELS[chain.frequency] ?? chain.frequency;
  if (chain.frequency === "WEEKLY" && chain.weekly_day != null) {
    const weekday = WEEKDAY_LABELS[chain.weekly_day] ?? String(chain.weekly_day);
    label = `${label} (${weekday})`;
  }
  if (chain.frequency === "MONTHLY") {
    if (chain.monthly_rule === "LAST_DAY") {
      label = `${label} (посл. день)`;
    } else if (chain.monthly_day != null) {
      label = `${label} (${chain.monthly_day}-е)`;
    }
  }
  return label;
}

function formatShortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

function getChainPurposeLabel(chain: TransactionChainOut) {
  if (chain.purpose === "INTEREST") return "Проценты";
  if (chain.purpose === "PRINCIPAL") return "Основной долг";
  return null;
}

function formatRate(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(value);
}

function formatPercent(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function getTodayDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function findPriceOnOrBefore(
  pricesByDate: Record<string, MarketPriceOut>,
  sortedDates: string[],
  targetDate: string
) {
  if (pricesByDate[targetDate]) return pricesByDate[targetDate];
  let lo = 0;
  let hi = sortedDates.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (sortedDates[mid] <= targetDate) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best >= 0 ? pricesByDate[sortedDates[best]] : null;
}

/* ------------------ страница ------------------ */

const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const MAX_PHOTO_DIM = 1024;
const ALLOWED_PHOTO_TYPES = ["image/png", "image/jpeg", "image/webp"];

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${Math.round(bytes / (1024 * 1024))} МБ`;
}

export default function Page() {
  const { data: session, status: sessionStatus } = useSession();
  const { accountingStartDate } = useAccountingStart();
  const { activeStep, isWizardOpen } = useOnboarding();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [items, setItems] = useState<ItemOut[]>([]);
  const [currencies, setCurrencies] = useState<CurrencyOut[]>([]);
  const [fxRates, setFxRates] = useState<FxRateOut[]>([]);
  const [txs, setTxs] = useState<TransactionOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  // Filter states
  const [filterType, setFilterType] = useState<Set<string>>(new Set());
  const [filterStatus, setFilterStatus] = useState<Set<string>>(new Set(["active"]));
  const [filterName, setFilterName] = useState("");
  const [mobileAssetsSearch, setMobileAssetsSearch] = useState("");
  const [mobileSearchFocused, setMobileSearchFocused] = useState(false);
  const [filterAmountFrom, setFilterAmountFrom] = useState("");
  const [filterAmountTo, setFilterAmountTo] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterCounterpartyIds, setFilterCounterpartyIds] = useState<number[]>([]);
  const [filterTypeCodes, setFilterTypeCodes] = useState<Set<string>>(new Set());
  const [filterCurrencyCodes, setFilterCurrencyCodes] = useState<Set<string>>(new Set());
  const [isCurrencyFilterOpen, setIsCurrencyFilterOpen] = useState(false);
  const [isTypeCodeFilterOpen, setIsTypeCodeFilterOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  /** Вид карточек на десктопе: grid — колонки карточек, list — полная ширина, блоки по горизонтали. Восстанавливается из localStorage. */
  const [cardsViewMode, setCardsViewMode] = useState<"grid" | "list">("grid");

  useEffect(() => {
    setMounted(true);
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem("assets-cards-view");
    if (saved === "list" || saved === "grid") setCardsViewMode(saved);
  }, []);

  useEffect(() => {
    if (!mounted || typeof window === "undefined") return;
    localStorage.setItem("assets-cards-view", cardsViewMode);
  }, [mounted, cardsViewMode]);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ItemOut | null>(null);
  const [initialCreateOptions, setInitialCreateOptions] = useState<{ kind: ItemKind; typeCodes: string[]; general?: boolean; sectionId?: string } | null>(null);
  const [initialCreateDefaults, setInitialCreateDefaults] = useState<{ name?: string; amountStr?: string; openDate?: string; typeCode?: string } | null>(null);
  const [isGeneralCreate, setIsGeneralCreate] = useState(false);
  const [sectionId, setSectionId] = useState("");

  const [closeItemDialogOpen, setCloseItemDialogOpen] = useState(false);
  const [closeDialogError, setCloseDialogError] = useState<string | null>(null);
  const [createCounterpartyOpen, setCreateCounterpartyOpen] = useState(false);
  const [closingItem, setClosingItem] = useState<ItemOut | null>(null);
  const [buySellAsset, setBuySellAsset] = useState<ItemOut | null>(null);
  const [closingDate, setClosingDate] = useState(() => getTodayDateKey());
  const [closeTransferItemId, setCloseTransferItemId] = useState<string>("");
  const [closeWriteOff, setCloseWriteOff] = useState(false);

  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    resolve: (ok: boolean) => void;
  } | null>(null);
  const askConfirm = useCallback((title: string, message: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setConfirmDialog({ title, message, resolve });
    });
  }, []);

  const [kind, setKind] = useState<ItemKind>("ASSET");
  const [allowedTypeCodes, setAllowedTypeCodes] = useState<string[]>(CASH_TYPES);
  const [typeCode, setTypeCode] = useState("");
  const [currencyCode, setCurrencyCode] = useState("RUB");
  const [name, setName] = useState("");
  const [synonyms, setSynonyms] = useState<string[]>([]);
  const [amountStr, setAmountStr] = useState(""); // строка: "1234.56" / "1 234,56"
  const [marketValueStr, setMarketValueStr] = useState("");
  const [counterparties, setCounterparties] = useState<CounterpartyOut[]>([]);
  const [counterpartyId, setCounterpartyId] = useState<number | null>(null);
  const [counterpartyLoading, setCounterpartyLoading] = useState(false);
  const [counterpartyError, setCounterpartyError] = useState<string | null>(null);
  const [industries, setIndustries] = useState<CounterpartyIndustryOut[]>([]);
  const [instrumentQuery, setInstrumentQuery] = useState("");
  const [instrumentOptions, setInstrumentOptions] = useState<MarketInstrumentOut[]>([]);
  const [instrumentLoading, setInstrumentLoading] = useState(false);
  const [instrumentError, setInstrumentError] = useState<string | null>(null);
  const [instrumentDropdownOpen, setInstrumentDropdownOpen] = useState(false);
  const [selectedInstrument, setSelectedInstrument] = useState<MarketInstrumentOut | null>(
    null
  );
  const instrumentAnchorRef = useRef<HTMLDivElement | null>(null);
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
  const [moexDatePrices, setMoexDatePrices] = useState<
    Record<string, MarketPriceOut | null>
  >({});
  const [moexDatePricesLoading, setMoexDatePricesLoading] = useState(false);
  const [moexMarketPrices, setMoexMarketPrices] = useState<Map<number, MarketPriceOut>>(new Map());
  const [moexMarketPricesLoading, setMoexMarketPricesLoading] = useState(false);
  const [accountLast7, setAccountLast7] = useState("");
  const [contractNumber, setContractNumber] = useState("");
  const [openDate, setOpenDate] = useState(() => getTodayDateKey());
  const [cardLast4, setCardLast4] = useState("");
  const [cardAccountId, setCardAccountId] = useState("");
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
  const [repaymentFrequency, setRepaymentFrequency] =
    useState<TransactionChainFrequency>("MONTHLY");
  const [repaymentWeeklyDay, setRepaymentWeeklyDay] = useState<number>(() => {
    const jsDay = new Date().getDay();
    return (jsDay + 6) % 7;
  });
  const [repaymentIntervalDays, setRepaymentIntervalDays] = useState("1");
  const [repaymentAccountId, setRepaymentAccountId] = useState("");
  const [repaymentType, setRepaymentType] = useState<RepaymentType | "">("");
  const [paymentAmountKind, setPaymentAmountKind] = useState<PaymentAmountKind | "">("");
  const [paymentAmountStr, setPaymentAmountStr] = useState("");
  const [openingCounterpartyId, setOpeningCounterpartyId] = useState("");
  const [primaryValueKind, setPrimaryValueKind] = useState<PrimaryValueKind>("BALANCE");
  const [linkedChains, setLinkedChains] = useState<TransactionChainOut[]>([]);
  const [originalPlanSignature, setOriginalPlanSignature] = useState<string | null>(null);
  const [logoOverlayHeight, setLogoOverlayHeight] = useState(0);
  const logoNaturalSizeRef = useRef<{ width: number; height: number } | null>(null);
  const dialogContentRef = useRef<HTMLDivElement | null>(null);
  const onboardingAppliedRef = useRef<string | null>(null);
  const [itemPhotoFile, setItemPhotoFile] = useState<File | null>(null);
  const [itemPhotoPreview, setItemPhotoPreview] = useState<string | null>(null);
  const [itemPhotoError, setItemPhotoError] = useState<string | null>(null);
  const itemPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const [icon3dFormat, setIcon3dFormat] = useState<"png" | null>("png");
  const [show2dIcon, setShow2dIcon] = useState(false);

  useEffect(() => {
    if (!isWizardOpen) {
      onboardingAppliedRef.current = null;
    }
  }, [isWizardOpen]);
  const isEditing = Boolean(editingItem);
  const segmentedButtonBase =
    "flex-1 min-w-0 rounded-full px-3 py-2 text-sm font-medium text-center whitespace-nowrap transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 flex items-center justify-center";

  const handleItemPhotoChange = (file: File | null) => {
    setItemPhotoError(null);

    if (itemPhotoPreview?.startsWith("blob:")) {
      URL.revokeObjectURL(itemPhotoPreview);
    }

    const getEditingItemPhotoUrl = () => getItemPhotoUrl(editingItem ?? null, API_BASE);

    if (!file) {
      setItemPhotoFile(null);
      setItemPhotoPreview(getEditingItemPhotoUrl());
      return;
    }

    if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
      setItemPhotoError("Разрешены PNG, JPG или WEBP.");
      setItemPhotoFile(null);
      setItemPhotoPreview(getEditingItemPhotoUrl());
      return;
    }

    if (file.size > MAX_PHOTO_BYTES) {
      setItemPhotoError(`Размер фотографии не больше ${formatSize(MAX_PHOTO_BYTES)}.`);
      setItemPhotoFile(null);
      setItemPhotoPreview(getEditingItemPhotoUrl());
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      if (image.width > MAX_PHOTO_DIM || image.height > MAX_PHOTO_DIM) {
        setItemPhotoError(`Разрешение не больше ${MAX_PHOTO_DIM}px.`);
        URL.revokeObjectURL(objectUrl);
        setItemPhotoFile(null);
        setItemPhotoPreview(getEditingItemPhotoUrl());
        return;
      }
      setItemPhotoFile(file);
      setItemPhotoPreview(objectUrl);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      setItemPhotoError("Не удалось прочитать изображение.");
      setItemPhotoFile(null);
      setItemPhotoPreview(getEditingItemPhotoUrl());
    };
    image.src = objectUrl;
  };

  function buildPlanSignatureFromState(): string {
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

  function buildPlanSignatureFromItem(item: ItemOut): string {
    const settings = item.plan_settings ?? null;
    return JSON.stringify({
      item: {
        kind: item.kind,
        typeCode: item.type_code,
        currencyCode: item.currency_code,
        initialValue: item.initial_balance_minor,
        openDate: item.open_date ?? null,
        depositTermDays: item.deposit_term_days ?? null,
        interestRate:
          item.interest_rate != null ? String(item.interest_rate) : null,
        interestPayoutOrder: item.interest_payout_order ?? null,
        interestCapitalization:
          item.interest_capitalization == null
            ? null
            : String(item.interest_capitalization),
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
        paymentAmountKind:
          item.kind === "ASSET" ? settings?.payment_amount_kind ?? null : null,
        paymentAmountRub:
          item.kind === "ASSET" ? settings?.payment_amount_rub ?? null : null,
      },
    });
  }

  const rateByCode = useMemo(() => {
    const map: Record<string, number> = { RUB: 1 };
    fxRates.forEach((rate) => {
      map[rate.char_code] = rate.rate;
    });
    return map;
  }, [fxRates]);

  const itemsById = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items]
  );

  const getItemDisplayBalanceCents = useCallback(
    (item: ItemOut) => {
      if (isBankCardItem(item) && item.card_account_id) {
        const linked = itemsById.get(item.card_account_id);
        if (linked) return getItemPrimaryValueCents(linked, rateByCode[linked.currency_code ?? "RUB"]);
      }
      return getItemPrimaryValueCents(item, rateByCode[item.currency_code ?? "RUB"]);
    },
    [itemsById, rateByCode]
  );

  const resolveItemEffectiveKind = useCallback(
    (item: ItemOut, balanceCents?: number) =>
      getEffectiveItemKind(item, balanceCents ?? item.current_value_rub),
    []
  );

  function computeInstrumentUnitPriceCents(
    item: ItemOut,
    price: MarketPriceOut | null
  ): number | null {
    if (!price) return null;
    if (price.price_cents != null) {
      if (item.type_code === "bonds") {
        return price.price_cents + (price.accint_cents ?? 0);
      }
      return price.price_cents;
    }
    if (price.price_percent_bp != null && item.face_value_cents != null) {
      const base = Math.round(
        (item.face_value_cents * price.price_percent_bp) / 10000
      );
      return base + (price.accint_cents ?? 0);
    }
    return null;
  }

  function getRubEquivalentCents(item: ItemOut): number | null {
    if (item.primary_value_kind === "MARKET" && item.latest_market_value_rub != null) {
      return item.latest_market_value_rub;
    }
    // Для MOEX активов используем текущие рыночные цены (как на вкладке "Динамика стоимости активов")
    const isMoexItem = MOEX_TYPE_CODES.includes(item.type_code);
    if (isMoexItem && item.instrument_id && item.instrument_board_id) {
      const marketPrice = moexMarketPrices.get(item.id);
      if (marketPrice) {
        const unitPriceCents = computeInstrumentUnitPriceCents(item, marketPrice);
        if (unitPriceCents != null) {
          const positionLots = item.position_lots ?? 0;
          const lotSize = item.lot_size ?? 1;
          const valueCents = unitPriceCents * positionLots * lotSize;
          const valueCurrency = marketPrice.currency_code ?? item.currency_code;
          const rate = valueCurrency === "RUB" ? 1.0 : rateByCode[valueCurrency];
          if (rate == null) return null;
          return Math.round((valueCents / 100) * rate * 100);
        }
      }
      // Если рыночная цена не загружена, возвращаем null
      return null;
    }
    // Для валютных с BALANCE используем balance_rub_cents (рублёвый эквивалент из API)
    const currency = (item.currency_code ?? "RUB").toUpperCase();
    if (currency !== "RUB" && (item.primary_value_kind ?? "BALANCE") === "BALANCE") {
      if (item.balance_rub_cents != null) return item.balance_rub_cents;
      return item.current_value_rub;
    }
    // Для обычных (RUB) или иных видов стоимости — переводим из валюты в рубли по курсу
    const rate = rateByCode[item.currency_code];
    if (!rate) return null;
    const amount = Math.abs(getItemPrimaryValueCents(item, rate)) / 100;
    return Math.round(amount * rate * 100);
  }

  /** Основная стоимость в рублях (копейках) для отображения на карточке по primary_value_kind. */
  function getPrimaryValueRubCents(item: ItemOut): number | null {
    const kind = item.primary_value_kind ?? "BALANCE";
    if (kind === "MARKET") return getRubEquivalentCents(item);
    // Для валютных с BALANCE используем balance_rub_cents (рублёвый эквивалент из API)
    const currency = (item.currency_code ?? "RUB").toUpperCase();
    if (currency !== "RUB") {
      if (item.balance_rub_cents != null) return item.balance_rub_cents;
      return item.current_value_rub;
    }
    const rate = rateByCode[item.currency_code];
    if (!rate) return null;
    const amount = Math.abs(getItemPrimaryValueCents(item, rate)) / 100;
    return Math.round(amount * rate * 100);
  }

  const sectionOptions = useMemo(
    () => ITEM_SECTIONS.filter((section) => section.kind === kind),
    [kind]
  );
  const selectedSection = useMemo(
    () => sectionOptions.find((section) => section.id === sectionId) ?? null,
    [sectionOptions, sectionId]
  );
  const sectionTypeCodes = selectedSection?.typeCodes ?? [];
  const effectiveAllowedTypeCodes = isGeneralCreate ? sectionTypeCodes : allowedTypeCodes;

  const typeOptions = useMemo(() => {
    const base = kind === "ASSET" ? ASSET_TYPES : LIABILITY_TYPES;
    if (!effectiveAllowedTypeCodes.length) {
      return isGeneralCreate ? [] : base;
    }
    const allowed = new Set(effectiveAllowedTypeCodes);
    const filtered = base.filter((option) => allowed.has(option.code));
    // Порядок в выпадающем списке «Вид» — как в разделе
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
  const isBankCounterparty = useMemo(
    () => BANK_COUNTERPARTY_TYPE_CODES.includes(typeCode),
    [typeCode]
  );
  const isMoexType = useMemo(() => MOEX_TYPE_CODES.includes(typeCode), [typeCode]);
  const isCryptoType = useMemo(() => typeCode === "crypto", [typeCode]);
  const showInstrumentBlock = useMemo(
    () => (isMoexType || isCryptoType) && kind === "ASSET",
    [isMoexType, isCryptoType, kind]
  );
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
  const cryptoQuantityUnits = useMemo(() => {
    if (!isCryptoType) return null;
    const raw = quantityUnitsStr.replace(/\s/g, "").replace(",", ".");
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : null;
  }, [isCryptoType, quantityUnitsStr]);
  const hasNonZeroCryptoQuantity = cryptoQuantityUnits != null && cryptoQuantityUnits > 0;
  const showBankAccountFields = useMemo(
    () => typeCode === "bank_account" || typeCode === "savings_account",
    [typeCode]
  );
  const showBankCardFields = useMemo(() => BANK_CARD_TYPE_CODES.includes(typeCode), [typeCode]);
  const isCreditCard = useMemo(() => typeCode === "bank_card_credit", [typeCode]);
  const isLoanLiabilityType = useMemo(
    () => LOAN_LIABILITY_TYPES.includes(typeCode),
    [typeCode]
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
  const showLoanPlanSettings = useMemo(
    () => AUTO_PLAN_LOAN_TYPES.includes(typeCode),
    [typeCode]
  );
  const openDateLabel =
    primaryValueKind === "ACQUISITION" || primaryValueKind === "INVESTED"
      ? "Дата приобретения"
      : "Дата появления";
  const accountingStartLabel = accountingStartDate
    ? `\u0414\u0430\u0442\u0430 \u043d\u0430\u0447\u0430\u043b\u0430 \u0443\u0447\u0435\u0442\u0430 (${formatShortDate(accountingStartDate)})`
    : "\u0414\u0430\u0442\u0430 \u043d\u0430\u0447\u0430\u043b\u0430 \u0443\u0447\u0435\u0442\u0430";
  const openDateHelpText = `\u0424\u0430\u043a\u0442\u0438\u0447\u0435\u0441\u043a\u0430\u044f \u0434\u0430\u0442\u0430, \u043a\u043e\u0433\u0434\u0430 \u043f\u043e\u044f\u0432\u0438\u043b\u0441\u044f \u0430\u043a\u0442\u0438\u0432 \u0438\u043b\u0438 \u043e\u0431\u044f\u0437\u0430\u0442\u0435\u043b\u044c\u0441\u0442\u0432\u043e, \u043d\u0430\u043f\u0440\u0438\u043c\u0435\u0440, \u0434\u0430\u0442\u0430 \u043e\u0442\u043a\u0440\u044b\u0442\u0438\u044f \u0441\u0447\u0435\u0442\u0430 \u0438\u043b\u0438 \u0432\u043a\u043b\u0430\u0434\u0430, \u0434\u0430\u0442\u0430 \u043f\u0440\u0438\u043e\u0431\u0440\u0435\u0442\u0435\u043d\u0438\u044f \u0438\u043c\u0443\u0449\u0435\u0441\u0442\u0432\u0430, \u0434\u0430\u0442\u0430 \u043f\u043e\u043b\u0443\u0447\u0435\u043d\u0438\u044f \u043a\u0440\u0435\u0434\u0438\u0442\u0430/\u0437\u0430\u0439\u043c\u0430, \u043f\u043e\u044f\u0432\u043b\u0435\u043d\u0438\u044f \u0434\u043e\u043b\u0433\u0430 \u0438\u043b\u0438 \u0437\u0430\u0434\u043e\u043b\u0436\u0435\u043d\u043d\u043e\u0441\u0442\u0438 \u0438 \u0442.\u0434. \u0414\u043e \u044d\u0442\u043e\u0439 \u0434\u0430\u0442\u044b \u0442\u0440\u0430\u043d\u0437\u0430\u043a\u0446\u0438\u0438 \u043d\u0435 \u0441\u043e\u0437\u0434\u0430\u044e\u0442\u0441\u044f. \u0415\u0441\u043b\u0438 \u0430\u043a\u0442\u0438\u0432/\u043e\u0431\u044f\u0437\u0430\u0442\u0435\u043b\u044c\u0441\u0442\u0432\u043e \u0443\u0436\u0435 \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u043e\u0432\u0430\u043b \u043d\u0430 \u0434\u0430\u0442\u0443 ${accountingStartLabel}, \u0438 \u0432\u044b \u043d\u0435 \u043f\u043e\u043c\u043d\u0438\u0442\u0435 \u043a\u043e\u043d\u043a\u0440\u0435\u0442\u043d\u0443\u044e \u0435\u0433\u043e \u0434\u0430\u0442\u0443 \u043f\u043e\u044f\u0432\u043b\u0435\u043d\u0438\u044f, \u0442\u043e \u043c\u043e\u0436\u0435\u0442\u0435 \u0443\u043a\u0430\u0437\u0430\u0442\u044c \u0434\u0430\u0442\u0443 ${accountingStartLabel}.`;
  const minPlanDate = useMemo(() => {
    let minDate = openDate || "";
    if (accountingStartDate && (!minDate || accountingStartDate > minDate)) {
      minDate = accountingStartDate;
    }
    return minDate;
  }, [accountingStartDate, openDate]);
  const requiresLoanPaymentInput = useMemo(
    () => showLoanPlanSettings && kind === "ASSET",
    [showLoanPlanSettings, kind]
  );
  const hideInitialAmountField =
    (showBankCardFields && Boolean(cardAccountId)) || isMoexType || isCryptoType;
  const showContractNumberField = useMemo(
    () =>
      typeCode === "bank_account" ||
      showBankCardFields ||
      typeCode === "deposit" ||
      typeCode === "savings_account",
    [typeCode, showBankCardFields]
  );

  useEffect(() => {
    if (!showPlanSection) {
      setPlanEnabled(false);
      setFirstPayoutRule("");
      setPlanEndDate("");
      setLoanEndDate("");
      setRepaymentFrequency("MONTHLY");
      setRepaymentIntervalDays("1");
      setRepaymentAccountId("");
      setRepaymentType("");
      setPaymentAmountKind("");
      setPaymentAmountStr("");
    }
  }, [showPlanSection]);

  useEffect(() => {
    if (requiresLoanPaymentInput) return;
    if (paymentAmountKind) setPaymentAmountKind("");
    if (paymentAmountStr) setPaymentAmountStr("");
  }, [requiresLoanPaymentInput, paymentAmountKind, paymentAmountStr]);
  useEffect(() => {
    if (!showLoanPlanSettings) return;
    if (loanEndDate && planEndDate) {
      setPlanEndDate("");
    }
  }, [loanEndDate, planEndDate, showLoanPlanSettings]);

  const counterpartiesById = useMemo(
    () => new Map(counterparties.map((cp) => [cp.id, cp])),
    [counterparties]
  );

  // Get unique type codes from user's items
  const availableTypeCodes = useMemo(() => {
    const typeCodes = new Set<string>();
    items.forEach((item) => {
      typeCodes.add(item.type_code);
    });
    return Array.from(typeCodes).sort((a, b) => {
      const labelA = ITEM_TYPE_LABELS[a] || a;
      const labelB = ITEM_TYPE_LABELS[b] || b;
      return labelA.localeCompare(labelB, "ru");
    });
  }, [items]);

  // Get unique currency codes from user's items
  const currencyOptions = useMemo(() => {
    const values = new Set<string>();
    items.forEach((item) => {
      if (item.currency_code) values.add(item.currency_code);
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b, "ru"));
  }, [items]);

  const toggleCurrencySelection = (value: string) => {
    setFilterCurrencyCodes((prev) => {
      const next = new Set(prev);
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
      }
      return next;
    });
  };
  const itemCounterpartyLogoUrl = (id: number | null | undefined) => {
    if (!id) return null;
    const cpId = itemsById.get(id)?.counterparty_id;
    if (!cpId) return null;
    const counterparty = counterpartiesById.get(cpId);
    if (!counterparty) return null;
    const raw = counterparty.entity_type === "PERSON"
      ? counterparty.photo_url ?? null
      : counterparty.logo_url ?? null;
    return raw ? resolveApiImageUrlToBase(raw, API_BASE) : null;
  };
  const itemCounterpartyName = (id: number | null | undefined) => {
    if (!id) return "";
    const cpId = itemsById.get(id)?.counterparty_id;
    if (!cpId) return "";
    const cp = counterpartiesById.get(cpId);
    if (!cp) return "";
    if (cp.entity_type === "PERSON") {
      const parts = [cp.last_name, cp.first_name, cp.middle_name].filter(Boolean);
      return parts.length > 0 ? parts.join(" ") : "";
    }
    return cp.name || cp.full_name || "";
  };
  const getCounterpartyForItemId = (id: number) => {
    const cpId = itemsById.get(id)?.counterparty_id;
    return cpId ? counterpartiesById.get(cpId) ?? null : null;
  };
  const linkedCardsByAccountId = useMemo(() => {
    const map = new Map<number, ItemOut[]>();
    items.forEach((item) => {
      if (item.closed_at || item.archived_at) return;
      if (!isBankCardItem(item) || !item.card_account_id) return;
      const bucket = map.get(item.card_account_id) ?? [];
      bucket.push(item);
      map.set(item.card_account_id, bucket);
    });
    return map;
  }, [items]);
  const activeItems = useMemo(
    () => items.filter((item) => !item.archived_at && !item.closed_at),
    [items]
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
  const amountCents = useMemo(() => {
    if (isMoexType) return moexInitialValueCents ?? NaN;
    return parseRubToCents(normalizedAmountValue);
  }, [isMoexType, moexInitialValueCents, normalizedAmountValue]);
  const hasNonZeroAmount = Number.isFinite(amountCents) && amountCents !== 0;
  const hasNonZeroLots = moexLots != null && moexLots > 0;
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
  const showMoexPricing = isMoexType && kind === "ASSET";
  const showMoexCommission =
    isMoexType && kind === "ASSET" && resolvedHistoryStatus === "NEW" && hasNonZeroLots;
  const commissionAllowed = showMoexCommission;
  
  const showMoexStartDatePricing =
    showMoexPricing &&
    resolvedHistoryStatus === "HISTORICAL" &&
    Boolean(accountingStartDate);
  const moexCurrencyFallback = selectedInstrument?.currency_code ?? currencyCode;
  const moexOpenDatePrice = openDate ? moexDatePrices[openDate] ?? null : null;
  const moexStartDatePrice = accountingStartDate
    ? moexDatePrices[accountingStartDate] ?? null
    : null;
  const computeMoexValueCents = useCallback(
    (price: MarketPriceOut | null) => {
      if (!price) return null;
      if (moexLots == null) return null;
      const lotSize = selectedInstrument?.lot_size ?? 1;
      if (price.price_cents == null) return null;
      const accint = typeCode === "bonds" ? price.accint_cents ?? 0 : 0;
      return Math.round((price.price_cents + accint) * moexLots * lotSize);
    },
    [moexLots, selectedInstrument?.lot_size, typeCode]
  );
  const formatMoexPrice = useCallback(
    (price: MarketPriceOut | null) =>
      formatMoney(price?.price_cents ?? null, price?.currency_code ?? moexCurrencyFallback),
    [moexCurrencyFallback]
  );
  const formatMoexValue = useCallback(
    (price: MarketPriceOut | null) =>
      formatMoney(
        computeMoexValueCents(price),
        price?.currency_code ?? moexCurrencyFallback
      ),
    [computeMoexValueCents, moexCurrencyFallback]
  );
  const openingCounterpartyItems = useMemo(
    () =>
      activeItems.filter(
        (item) =>
          item.kind === "ASSET" &&
          item.id !== editingItem?.id &&
          item.currency_code === currencyCode
      ),
    [activeItems, editingItem, currencyCode]
  );
  const commissionPaymentItems = useMemo(
    () =>
      activeItems.filter(
        (item) => item.id !== editingItem?.id && !item.instrument_id
      ),
    [activeItems, editingItem]
  );
  const openingCounterpartyLabel =
    kind === "LIABILITY"
      ? "Куда зачислить"
      : "Источник средств";
  const openingHint = useMemo(() => {
    if (!showOpeningCounterparty) return null;
    const dateLabel = accountingStartDate ? formatShortDate(accountingStartDate) : null;
    const datePhrase = dateLabel ? ` после даты начала учета ${dateLabel}, поэтому` : ", поэтому";
    return kind === "LIABILITY"
      ? `Обязательство появилось${datePhrase} нужно указать источник средств, откуда были переведены средства или погашено обязательство. Если источник не указать, то будет создана транзакция в размере начальной суммы с категорией «Прочие расходы».`
      : `Актив появился${datePhrase} нужно указать источник средств, откуда были переведены средства или оплачен актив. Если источник не указать, то будет создана транзакция в размере начальной суммы с категорией «Прочие доходы».`;
  }, [showOpeningCounterparty, accountingStartDate, kind]);
  const amountLabel = useMemo(() => {
    if (primaryValueKind === "MARKET" && !isMoexType) {
      if (resolvedHistoryStatus === "HISTORICAL") {
        const dateLabel = accountingStartDate
          ? formatShortDate(accountingStartDate)
          : "";
        return dateLabel
          ? `Рыночная стоимость на дату начала учета (${dateLabel})`
          : "Рыночная стоимость на дату начала учета";
      }
      if (resolvedHistoryStatus === "NEW") return "Рыночная стоимость на дату появления";
      return "Рыночная стоимость";
    }
    if (primaryValueKind === "ACQUISITION" || primaryValueKind === "INVESTED") {
      return "Стоимость приобретения";
    }
    if (resolvedHistoryStatus === "HISTORICAL") {
      const dateLabel = accountingStartDate
        ? formatShortDate(accountingStartDate)
        : "";
      return dateLabel
        ? `Баланс на дату начала учета (${dateLabel})`
        : "Баланс на дату начала учета";
    }
    if (resolvedHistoryStatus === "NEW") {
      return "Баланс на дату появления";
    }
    return "Сумма";
  }, [resolvedHistoryStatus, accountingStartDate, kind, primaryValueKind, isMoexType]);
  const activeItemsForTotals = useMemo(
    () =>
      activeItems.filter(
        (item) => !(isBankCardItem(item) && item.card_account_id)
      ),
    [activeItems]
  );
  const itemTxCounts = useMemo(() => buildItemTransactionCounts(txs), [txs]);
  const counterpartyTxCounts = useMemo(() => buildCounterpartyTransactionCounts(txs), [txs]);
  // Apply filters
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // Type filter
      if (filterType.size > 0) {
        const kind = getEffectiveItemKind(item, item.current_value_rub);
        if (!filterType.has(kind)) return false;
      }

      // Status filter
      const isArchived = Boolean(item.archived_at);
      const isClosed = Boolean(item.closed_at);
      const statusSet = new Set<string>();
      if (!isArchived && !isClosed) statusSet.add("active");
      if (isClosed) statusSet.add("closed");
      if (isArchived) statusSet.add("deleted");
      
      const hasMatchingStatus = Array.from(filterStatus).some((status) => statusSet.has(status));
      if (!hasMatchingStatus) return false;

      // Name filter
      if (filterName.trim()) {
        const searchTerm = filterName.trim().toLowerCase();
        if (!item.name.toLowerCase().includes(searchTerm)) return false;
      }

      // Amount filter
      const displayBalanceCents = getItemDisplayBalanceCents(item);
      const balanceRub = displayBalanceCents / 100;
      if (filterAmountFrom) {
        const fromValue = parseFloat(filterAmountFrom.replace(/\s/g, "").replace(",", "."));
        if (!isNaN(fromValue) && balanceRub < fromValue) return false;
      }
      if (filterAmountTo) {
        const toValue = parseFloat(filterAmountTo.replace(/\s/g, "").replace(",", "."));
        if (!isNaN(toValue) && balanceRub > toValue) return false;
      }

      // Date filter
      if (filterDateFrom && item.open_date) {
        if (item.open_date < filterDateFrom) return false;
      }
      if (filterDateTo && item.open_date) {
        if (item.open_date > filterDateTo) return false;
      }

      // Counterparty filter
      if (filterCounterpartyIds.length > 0) {
        if (!item.counterparty_id || !filterCounterpartyIds.includes(item.counterparty_id)) {
          return false;
        }
      }

      // Type code filter (вид актива/обязательства)
      if (filterTypeCodes.size > 0) {
        if (!filterTypeCodes.has(item.type_code)) return false;
      }

      // Currency filter
      if (filterCurrencyCodes.size > 0) {
        if (!item.currency_code || !filterCurrencyCodes.has(item.currency_code)) {
          return false;
        }
      }

      return true;
    });
  }, [
    items,
    filterType,
    filterStatus,
    filterName,
    filterAmountFrom,
    filterAmountTo,
    filterDateFrom,
    filterDateTo,
    filterCounterpartyIds,
    filterTypeCodes,
    filterCurrencyCodes,
    getItemDisplayBalanceCents,
    getEffectiveItemKind,
  ]);

  const visibleItems = useMemo(
    () => sortItemsByTransactionCount(filteredItems, itemTxCounts),
    [filteredItems, itemTxCounts]
  );

  // Разделы для отображения: активы, затем обязательства; внутри — по сумме кол-ва транзакций
  const orderedSectionsWithItems = useMemo(() => {
    function itemInSection(item: ItemOut) {
      const kind = resolveItemEffectiveKind(item);
      return (section: (typeof ITEM_SECTIONS)[0]) => {
        if (kind !== section.kind) return false;
        if (section.id === "credit_liabilities")
          return CREDIT_LIABILITY_TYPES.includes(item.type_code) || item.type_code === "bank_card" || item.type_code === "bank_card_credit";
        return section.typeCodes.includes(item.type_code);
      };
    }
    const list: { section: (typeof ITEM_SECTIONS)[0]; items: ItemOut[]; totalRubCents: number }[] = [];
    for (const section of ITEM_SECTIONS) {
      const items = visibleItems.filter((item) => itemInSection(item)(section));
      if (items.length === 0) continue;
      const sortedItems = sortItemsByTransactionCount(items, itemTxCounts);
      const totalRubCents = sortedItems.reduce((sum, it) => sum + (getPrimaryValueRubCents(it) ?? 0), 0);
      list.push({ section, items: sortedItems, totalRubCents });
    }
    list.sort((a, b) => {
      if (a.section.kind !== b.section.kind) return a.section.kind === "ASSET" ? -1 : 1;
      const sumA = a.items.reduce((s, it) => s + (itemTxCounts.get(it.id) ?? 0), 0);
      const sumB = b.items.reduce((s, it) => s + (itemTxCounts.get(it.id) ?? 0), 0);
      return sumB - sumA;
    });
    return list;
  }, [visibleItems, itemTxCounts, resolveItemEffectiveKind, getRubEquivalentCents, getPrimaryValueRubCents]);

  // Мобильная версия: фильтрация по поиску (название, контрагент, валюта)
  const mobileOrderedSectionsWithItems = useMemo(() => {
    const q = mobileAssetsSearch.trim().toLowerCase();
    if (!q) return orderedSectionsWithItems;
    return orderedSectionsWithItems
      .map(({ section, items, totalRubCents }) => {
        const filtered = items.filter((item) => {
          const nameMatch = item.name?.toLowerCase().includes(q);
          const cp = item.counterparty_id ? counterpartiesById.get(item.counterparty_id) : null;
          const cpMatch = cp ? buildCounterpartyDisplayName(cp).toLowerCase().includes(q) : false;
          const currencyMatch = (item.currency_code ?? "").toLowerCase().includes(q);
          return nameMatch || cpMatch || currencyMatch;
        });
        if (filtered.length === 0) return null;
        const totalRubCentsFiltered = filtered.reduce((sum, it) => sum + (getPrimaryValueRubCents(it) ?? 0), 0);
        return { section, items: filtered, totalRubCents: totalRubCentsFiltered };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [orderedSectionsWithItems, counterpartiesById, mobileAssetsSearch, getPrimaryValueRubCents]);

  const activeAssetItems = useMemo(
    () =>
      activeItems.filter(
        (item) => resolveItemEffectiveKind(item) === "ASSET"
      ),
    [activeItems, resolveItemEffectiveKind]
  );
  const interestPayoutItems = useMemo(() => {
    const filtered = activeAssetItems.filter((item) => {
      if (editingItem && item.id === editingItem.id) return false;
      if (currencyCode && item.currency_code !== currencyCode) return false;
      return true;
    });
    const selectedId = interestPayoutAccountId ? Number(interestPayoutAccountId) : null;
    if (selectedId) {
      const selected = itemsById.get(selectedId);
      if (selected && !filtered.some((item) => item.id === selectedId)) {
        filtered.push(selected);
      }
    }
    return filtered;
  }, [
    activeAssetItems,
    currencyCode,
    editingItem,
    interestPayoutAccountId,
    itemsById,
  ]);
  const repaymentAccountItems = useMemo(() => {
    const filtered = activeAssetItems.filter((item) => {
      if (editingItem && item.id === editingItem.id) return false;
      if (!REPAYMENT_ACCOUNT_TYPE_CODES.includes(item.type_code)) return false;
      if (currencyCode && item.currency_code !== currencyCode) return false;
      return true;
    });
    const selectedId = repaymentAccountId ? Number(repaymentAccountId) : null;
    if (selectedId) {
      const selected = itemsById.get(selectedId);
      if (selected && !filtered.some((item) => item.id === selectedId)) {
        filtered.push(selected);
      }
    }
    return filtered;
  }, [
    activeAssetItems,
    currencyCode,
    editingItem,
    repaymentAccountId,
    itemsById,
  ]);
  const bankAccountItems = useMemo(() => {
    const filtered = activeAssetItems.filter((item) => {
      if (item.type_code !== "bank_account") return false;
      if (counterpartyId && item.counterparty_id !== counterpartyId) return false;
      if (currencyCode && item.currency_code !== currencyCode) return false;
      return true;
    });
    const selectedAccountId = cardAccountId ? Number(cardAccountId) : null;
    if (selectedAccountId) {
      const linked = itemsById.get(selectedAccountId);
      if (linked && !filtered.some((item) => item.id === linked.id)) {
        filtered.push(linked);
      }
    }
    return filtered;
  }, [activeAssetItems, counterpartyId, cardAccountId, currencyCode, itemsById]);
  const depositEndDateText = useMemo(() => {
    if (!openDate || !depositTermDays) return "";
    const days = Number(depositTermDays);
    if (!Number.isFinite(days) || days <= 0) return "";
    const baseDate = new Date(`${openDate}T00:00:00`);
    if (Number.isNaN(baseDate.getTime())) return "";
    baseDate.setDate(baseDate.getDate() + days);
    return baseDate.toLocaleDateString("ru-RU");
  }, [openDate, depositTermDays]);

  const selectedCounterparty = useMemo(
    () => counterpartyId ? counterpartiesById.get(counterpartyId) : null,
    [counterpartyId, counterpartiesById]
  );
  const logoLayerStyle = useMemo(() => {
    if (!showCounterpartyField || !selectedCounterparty) return undefined;
    const raw =
      selectedCounterparty.entity_type === "PERSON"
        ? selectedCounterparty.photo_url
        : selectedCounterparty.logo_url;
    const imageUrl = raw ? resolveApiImageUrlToBase(raw, API_BASE) : null;
    if (!imageUrl) return undefined;
    const mask = "linear-gradient(to bottom, rgba(0, 0, 0, 0.5) 0%, rgba(0, 0, 0, 0) 100%)";
    return {
      backgroundImage: `url("${imageUrl}")`,
      backgroundRepeat: "no-repeat",
      backgroundPosition: "top center",
      backgroundSize: "100% auto",
      maskImage: mask,
      maskRepeat: "no-repeat",
      maskSize: "100% 100%",
      WebkitMaskImage: mask,
      WebkitMaskRepeat: "no-repeat",
      WebkitMaskSize: "100% 100%",
    } as React.CSSProperties;
  }, [showCounterpartyField, selectedCounterparty]);

  const updateLogoOverlayHeight = useCallback(() => {
    const size = logoNaturalSizeRef.current;
    const container = dialogContentRef.current;
    if (!size || !container || !size.width) {
      setLogoOverlayHeight(0);
      return;
    }
    const width = container.getBoundingClientRect().width;
    if (!width) {
      setLogoOverlayHeight(0);
      return;
    }
    const scaledHeight = (size.height * width) / size.width;
    setLogoOverlayHeight(Math.round(scaledHeight));
  }, []);


  // Фильтрация по категориям
  const cashItems = useMemo(
    () =>
      visibleItems.filter(
        (x) => resolveItemEffectiveKind(x) === "ASSET" && CASH_TYPES.includes(x.type_code)
      ),
    [visibleItems, resolveItemEffectiveKind]
  );

  const investmentItems = useMemo(
    () =>
      visibleItems.filter(
        (x) =>
          resolveItemEffectiveKind(x) === "ASSET" &&
          INVESTMENT_TYPES.includes(x.type_code)
      ),
    [visibleItems, resolveItemEffectiveKind]
  );

  const thirdPartyDebtItems = useMemo(
    () =>
      visibleItems.filter(
        (x) =>
          resolveItemEffectiveKind(x) === "ASSET" &&
          THIRD_PARTY_DEBT_TYPES.includes(x.type_code)
      ),
    [visibleItems, resolveItemEffectiveKind]
  );

  const realEstateItems = useMemo(
    () =>
      visibleItems.filter(
        (x) =>
          resolveItemEffectiveKind(x) === "ASSET" &&
          REAL_ESTATE_TYPES.includes(x.type_code)
      ),
    [visibleItems, resolveItemEffectiveKind]
  );

  const transportItems = useMemo(
    () =>
      visibleItems.filter(
        (x) =>
          resolveItemEffectiveKind(x) === "ASSET" &&
          TRANSPORT_TYPES.includes(x.type_code)
      ),
    [visibleItems, resolveItemEffectiveKind]
  );

  const valuablesItems = useMemo(
    () =>
      visibleItems.filter(
        (x) =>
          resolveItemEffectiveKind(x) === "ASSET" &&
          VALUABLES_TYPES.includes(x.type_code)
      ),
    [visibleItems, resolveItemEffectiveKind]
  );

  const pensionItems = useMemo(
    () =>
      visibleItems.filter(
        (x) =>
          resolveItemEffectiveKind(x) === "ASSET" &&
          PENSION_TYPES.includes(x.type_code)
      ),
    [visibleItems, resolveItemEffectiveKind]
  );

  const otherAssetItems = useMemo(
    () =>
      visibleItems.filter(
        (x) =>
          resolveItemEffectiveKind(x) === "ASSET" &&
          OTHER_ASSET_TYPES.includes(x.type_code)
      ),
    [visibleItems, resolveItemEffectiveKind]
  );

  const creditLiabilityItems = useMemo(
    () =>
      visibleItems.filter(
        (x) =>
          resolveItemEffectiveKind(x) === "LIABILITY" &&
          (CREDIT_LIABILITY_TYPES.includes(x.type_code) || x.type_code === "bank_card" || x.type_code === "bank_card_credit")
      ),
    [visibleItems, resolveItemEffectiveKind]
  );

  const thirdPartyLoanItems = useMemo(
    () =>
      visibleItems.filter(
        (x) =>
          resolveItemEffectiveKind(x) === "LIABILITY" &&
          THIRD_PARTY_LOAN_TYPES.includes(x.type_code)
      ),
    [visibleItems, resolveItemEffectiveKind]
  );

  const taxLiabilityItems = useMemo(
    () =>
      visibleItems.filter(
        (x) =>
          resolveItemEffectiveKind(x) === "LIABILITY" &&
          TAX_LIABILITY_TYPES.includes(x.type_code)
      ),
    [visibleItems, resolveItemEffectiveKind]
  );

  const utilityLiabilityItems = useMemo(
    () =>
      visibleItems.filter(
        (x) =>
          resolveItemEffectiveKind(x) === "LIABILITY" &&
          UTILITY_LIABILITY_TYPES.includes(x.type_code)
      ),
    [visibleItems, resolveItemEffectiveKind]
  );

  const legalLiabilityItems = useMemo(
    () =>
      visibleItems.filter(
        (x) =>
          resolveItemEffectiveKind(x) === "LIABILITY" &&
          LEGAL_LIABILITY_TYPES.includes(x.type_code)
      ),
    [visibleItems, resolveItemEffectiveKind]
  );

  const otherLiabilityItems = useMemo(
    () =>
      visibleItems.filter(
        (x) =>
          resolveItemEffectiveKind(x) === "LIABILITY" &&
          OTHER_LIABILITY_TYPES.includes(x.type_code)
      ),
    [visibleItems, resolveItemEffectiveKind]
  );

  const cashTotal = useMemo(
    () =>
      activeItemsForTotals
        .filter(
          (x) =>
            resolveItemEffectiveKind(x) === "ASSET" &&
            CASH_TYPES.includes(x.type_code)
        )
        .reduce((sum, x) => sum + (getRubEquivalentCents(x) ?? 0), 0),
    [activeItemsForTotals, rateByCode]
  );

  const investmentTotal = useMemo(
    () =>
      activeItemsForTotals
        .filter(
          (x) =>
            resolveItemEffectiveKind(x) === "ASSET" &&
            INVESTMENT_TYPES.includes(x.type_code)
        )
        .reduce((sum, x) => sum + (getRubEquivalentCents(x) ?? 0), 0),
    [activeItemsForTotals, rateByCode]
  );

  const thirdPartyDebtTotal = useMemo(
    () =>
      activeItemsForTotals
        .filter(
          (x) =>
            resolveItemEffectiveKind(x) === "ASSET" &&
            THIRD_PARTY_DEBT_TYPES.includes(x.type_code)
        )
        .reduce((sum, x) => sum + (getRubEquivalentCents(x) ?? 0), 0),
    [activeItemsForTotals, rateByCode]
  );

  const realEstateTotal = useMemo(
    () =>
      activeItemsForTotals
        .filter(
          (x) =>
            resolveItemEffectiveKind(x) === "ASSET" &&
            REAL_ESTATE_TYPES.includes(x.type_code)
        )
        .reduce((sum, x) => sum + (getRubEquivalentCents(x) ?? 0), 0),
    [activeItemsForTotals, rateByCode]
  );

  const transportTotal = useMemo(
    () =>
      activeItemsForTotals
        .filter(
          (x) =>
            resolveItemEffectiveKind(x) === "ASSET" &&
            TRANSPORT_TYPES.includes(x.type_code)
        )
        .reduce((sum, x) => sum + (getRubEquivalentCents(x) ?? 0), 0),
    [activeItemsForTotals, rateByCode]
  );

  const valuablesTotal = useMemo(
    () =>
      activeItemsForTotals
        .filter(
          (x) =>
            resolveItemEffectiveKind(x) === "ASSET" &&
            VALUABLES_TYPES.includes(x.type_code)
        )
        .reduce((sum, x) => sum + (getRubEquivalentCents(x) ?? 0), 0),
    [activeItemsForTotals, rateByCode]
  );

  const pensionTotal = useMemo(
    () =>
      activeItemsForTotals
        .filter(
          (x) =>
            resolveItemEffectiveKind(x) === "ASSET" &&
            PENSION_TYPES.includes(x.type_code)
        )
        .reduce((sum, x) => sum + (getRubEquivalentCents(x) ?? 0), 0),
    [activeItemsForTotals, rateByCode]
  );

  const otherAssetTotal = useMemo(
    () =>
      activeItemsForTotals
        .filter(
          (x) =>
            resolveItemEffectiveKind(x) === "ASSET" &&
            OTHER_ASSET_TYPES.includes(x.type_code)
        )
        .reduce((sum, x) => sum + (getRubEquivalentCents(x) ?? 0), 0),
    [activeItemsForTotals, rateByCode]
  );

  const creditLiabilityTotal = useMemo(
    () =>
      activeItemsForTotals
        .filter(
          (x) =>
            resolveItemEffectiveKind(x) === "LIABILITY" &&
            (CREDIT_LIABILITY_TYPES.includes(x.type_code) || x.type_code === "bank_card" || x.type_code === "bank_card_credit")
        )
        .reduce((sum, x) => sum + (getRubEquivalentCents(x) ?? 0), 0),
    [activeItemsForTotals, rateByCode]
  );

  const thirdPartyLoanTotal = useMemo(
    () =>
      activeItemsForTotals
        .filter(
          (x) =>
            resolveItemEffectiveKind(x) === "LIABILITY" &&
            THIRD_PARTY_LOAN_TYPES.includes(x.type_code)
        )
        .reduce((sum, x) => sum + (getRubEquivalentCents(x) ?? 0), 0),
    [activeItemsForTotals, rateByCode]
  );

  const taxLiabilityTotal = useMemo(
    () =>
      activeItemsForTotals
        .filter(
          (x) =>
            resolveItemEffectiveKind(x) === "LIABILITY" &&
            TAX_LIABILITY_TYPES.includes(x.type_code)
        )
        .reduce((sum, x) => sum + (getRubEquivalentCents(x) ?? 0), 0),
    [activeItemsForTotals, rateByCode]
  );

  const utilityLiabilityTotal = useMemo(
    () =>
      activeItemsForTotals
        .filter(
          (x) =>
            resolveItemEffectiveKind(x) === "LIABILITY" &&
            UTILITY_LIABILITY_TYPES.includes(x.type_code)
        )
        .reduce((sum, x) => sum + (getRubEquivalentCents(x) ?? 0), 0),
    [activeItemsForTotals, rateByCode]
  );

  const legalLiabilityTotal = useMemo(
    () =>
      activeItemsForTotals
        .filter(
          (x) =>
            resolveItemEffectiveKind(x) === "LIABILITY" &&
            LEGAL_LIABILITY_TYPES.includes(x.type_code)
        )
        .reduce((sum, x) => sum + (getRubEquivalentCents(x) ?? 0), 0),
    [activeItemsForTotals, rateByCode]
  );

  const otherLiabilityTotal = useMemo(
    () =>
      activeItemsForTotals
        .filter(
          (x) =>
            resolveItemEffectiveKind(x) === "LIABILITY" &&
            OTHER_LIABILITY_TYPES.includes(x.type_code)
        )
        .reduce((sum, x) => sum + (getRubEquivalentCents(x) ?? 0), 0),
    [activeItemsForTotals, rateByCode]
  );

  useEffect(() => {
    if (!isCreateOpen || typeOptions.length === 0) return;
    if (isGeneralCreate) return;
    if (!typeCode) {
      setTypeCode(typeOptions[0].code);
      return;
    }
    if (!typeOptions.some((option) => option.code === typeCode)) {
      setTypeCode(typeOptions[0].code);
    }
  }, [isCreateOpen, typeOptions, typeCode, isGeneralCreate]);

  // При создании предвыбираем «Основная стоимость» по выбранному виду актива/обязательства
  useEffect(() => {
    if (!isCreateOpen || editingItem) return;
    setPrimaryValueKind(getDefaultPrimaryValueKind(typeCode || "", kind));
  }, [isCreateOpen, typeCode, kind, editingItem]);

  async function loadItems() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchItems({ includeArchived: true, includeClosed: true });
      setItems(data);
    } catch (e: any) {
      setError(e?.message ?? "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }

  async function loadLinkedChains(itemId: number) {
    try {
      const data = await fetchTransactionChains({ linked_item_id: itemId });
      setLinkedChains(data.filter((chain) => !chain.deleted_at));
    } catch {
      setLinkedChains([]);
    }
  }

  async function loadTransactions() {
    try {
      const data = await fetchTransactions();
      setTxs(data);
    } catch {
      setTxs([]);
    }
  }

  async function loadCurrencies() {
    try {
      const data = await fetchCurrencies();
      setCurrencies(data);
    } catch (e: any) {
      setError(e?.message ?? "Не удалось загрузить список валют.");
    }
  }

  async function loadCounterparties() {
    setCounterpartyLoading(true);
    setCounterpartyError(null);
    try {
      const [counterpartiesData, industriesData] = await Promise.all([
        fetchCounterparties(),
        fetchCounterpartyIndustries(),
      ]);
      setCounterparties(counterpartiesData);
      setIndustries(industriesData);
    } catch (e: any) {
      setCounterpartyError(e?.message ?? "Не удалось загрузить список контрагентов.");
    } finally {
      setCounterpartyLoading(false);
    }
  }

  async function loadFxRates() {
    try {
      const data = await fetchFxRates();
      setFxRates(data);
    } catch (e: any) {
      setError(e?.message ?? "Не удалось загрузить курсы валют.");
    }
  }

  async function loadMoexMarketPrices() {
    const moexItems = items.filter(
      (item) =>
        !item.closed_at &&
        !item.archived_at &&
        MOEX_TYPE_CODES.includes(item.type_code) &&
        item.instrument_id &&
        item.instrument_board_id
    );
    if (moexItems.length === 0) {
      setMoexMarketPrices(new Map());
      return;
    }

    setMoexMarketPricesLoading(true);
    try {
      const pricesMap = new Map<number, MarketPriceOut>();
      await Promise.all(
        moexItems.map(async (item) => {
          try {
            const price = await fetchMarketInstrumentPrice(
              item.instrument_id!,
              item.instrument_board_id || undefined
            );
            pricesMap.set(item.id, price);
          } catch {
            // Игнорируем ошибки для отдельных активов
          }
        })
      );
      setMoexMarketPrices(pricesMap);
    } catch (e: any) {
      // Игнорируем ошибки загрузки цен
    } finally {
      setMoexMarketPricesLoading(false);
    }
  }

  useEffect(() => {
    if (sessionStatus === "authenticated") {
      loadItems();
      loadTransactions();
      loadCurrencies();
      loadFxRates();
      loadCounterparties();
    }
  }, [sessionStatus]);

  useEffect(() => {
    if (items.length > 0) {
      loadMoexMarketPrices();
    }
  }, [items]);

  useEffect(() => {
    if (!isCreateOpen || !showCounterpartyField || counterparties.length || counterpartyLoading) return;
    loadCounterparties();
  }, [isCreateOpen, showCounterpartyField, counterparties.length, counterpartyLoading]);

  useEffect(() => {
    if (showCounterpartyField) return;
    if (counterpartyId) {
      setCounterpartyId(null);
    }
  }, [showCounterpartyField]);

  useEffect(() => {
    if (showBankAccountFields) return;
    if (accountLast7) setAccountLast7("");
  }, [showBankAccountFields, accountLast7]);

  useEffect(() => {
    if (showContractNumberField) return;
    if (contractNumber) setContractNumber("");
  }, [showContractNumberField, contractNumber]);

  useEffect(() => {
    if (showBankCardFields) return;
    if (cardLast4) setCardLast4("");
    if (cardAccountId) setCardAccountId("");
    if (creditLimit) setCreditLimit("");
  }, [showBankCardFields, cardLast4, cardAccountId, creditLimit]);

  useEffect(() => {
    if (!showOpeningCounterparty) {
      if (openingCounterpartyId) setOpeningCounterpartyId("");
      return;
    }
    if (!openingCounterpartyId) return;
    const selected = itemsById.get(Number(openingCounterpartyId));
    if (
      !selected ||
      selected.kind !== "ASSET" ||
      selected.archived_at ||
      selected.closed_at ||
      selected.currency_code !== currencyCode
    ) {
      setOpeningCounterpartyId("");
    }
  }, [showOpeningCounterparty, openingCounterpartyId, itemsById, currencyCode]);
  useEffect(() => {
    if (!showMoexCommission) {
      if (commissionEnabled) setCommissionEnabled(false);
      if (commissionAmount) setCommissionAmount("");
      if (commissionPaymentItemId) setCommissionPaymentItemId("");
      return;
    }
    if (!commissionAllowed && commissionEnabled) {
      setCommissionEnabled(false);
    }
  }, [
    showMoexCommission,
    commissionAllowed,
    commissionEnabled,
    commissionAmount,
    commissionPaymentItemId,
  ]);
  useEffect(() => {
    if (!commissionEnabled) {
      if (commissionPaymentItemId) setCommissionPaymentItemId("");
      return;
    }
    if (!commissionPaymentItemId) return;
    const selected = itemsById.get(Number(commissionPaymentItemId));
    if (!selected || selected.archived_at || selected.closed_at || selected.instrument_id) {
      setCommissionPaymentItemId("");
    }
  }, [commissionEnabled, commissionPaymentItemId, itemsById]);
  useEffect(() => {
    if (!showBankCardFields) return;
    if (isCreditCard) return;
    if (creditLimit) setCreditLimit("");
  }, [showBankCardFields, isCreditCard, creditLimit]);
  useEffect(() => {
    if (!showBankCardFields) return;
    if (!isCreditCard) return;
    if (cardAccountId) setCardAccountId("");
  }, [showBankCardFields, isCreditCard, cardAccountId]);

  useEffect(() => {
    if (!showBankCardFields) return;
    if (!cardAccountId) return;
    const selectedAccount = itemsById.get(Number(cardAccountId));
    if (!selectedAccount) setCardAccountId("");
  }, [cardAccountId, itemsById, showBankCardFields]);

  useEffect(() => {
    if (showDepositFields) return;
    if (depositTermDays) setDepositTermDays("");
  }, [showDepositFields, depositTermDays]);

  useEffect(() => {
    if (showInterestFields || showLoanPlanSettings) return;
    if (interestRate) setInterestRate("");
    if (interestPayoutOrder) setInterestPayoutOrder("");
    if (interestCapitalization) setInterestCapitalization("");
    if (interestPayoutAccountId) setInterestPayoutAccountId("");
  }, [
    showInterestFields,
    showLoanPlanSettings,
    interestRate,
    interestPayoutOrder,
    interestCapitalization,
    interestPayoutAccountId,
  ]);
  useEffect(() => {
    if (interestCapitalization === "true" && interestPayoutAccountId) {
      setInterestPayoutAccountId("");
    }
  }, [interestCapitalization, interestPayoutAccountId]);
  useEffect(() => {
    if (!interestPayoutAccountId) return;
    const selected = itemsById.get(Number(interestPayoutAccountId));
    if (
      !selected ||
      selected.kind !== "ASSET" ||
      selected.archived_at ||
      selected.closed_at ||
      (currencyCode && selected.currency_code !== currencyCode)
    ) {
      setInterestPayoutAccountId("");
    }
  }, [interestPayoutAccountId, itemsById, currencyCode]);
  useEffect(() => {
    if (!repaymentAccountId) return;
    const selected = itemsById.get(Number(repaymentAccountId));
    if (!selected || selected.type_code !== "bank_account") {
      setRepaymentAccountId("");
    }
  }, [repaymentAccountId, itemsById]);

  useEffect(() => {
    if (!selectedCounterparty || !isCreateOpen) {
      logoNaturalSizeRef.current = null;
      setLogoOverlayHeight(0);
      return;
    }
    const raw =
      selectedCounterparty.entity_type === "PERSON"
        ? selectedCounterparty.photo_url
        : selectedCounterparty.logo_url;
    const imageUrl = raw ? resolveApiImageUrlToBase(raw, API_BASE) : null;
    if (!imageUrl) {
      logoNaturalSizeRef.current = null;
      setLogoOverlayHeight(0);
      return;
    }

    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      logoNaturalSizeRef.current = {
        width: image.naturalWidth,
        height: image.naturalHeight,
      };
      updateLogoOverlayHeight();
    };
    image.onerror = () => {
      if (!cancelled) setLogoOverlayHeight(0);
    };
    image.src = imageUrl;

    return () => {
      cancelled = true;
    };
  }, [selectedCounterparty, isCreateOpen, updateLogoOverlayHeight]);

  useEffect(() => {
    if (!selectedCounterparty || !isCreateOpen) return;
    const imageUrl =
      selectedCounterparty.entity_type === "PERSON"
        ? selectedCounterparty.photo_url
        : selectedCounterparty.logo_url;
    if (!imageUrl) return;
    const handleResize = () => updateLogoOverlayHeight();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [selectedCounterparty, isCreateOpen, updateLogoOverlayHeight]);

  useEffect(() => {
    if (!currencies.length) return;
    if (!currencyCode || !currencies.some((c) => c.iso_char_code === currencyCode)) {
      const rub = currencies.find((c) => c.iso_char_code === "RUB");
      setCurrencyCode(rub?.iso_char_code ?? currencies[0].iso_char_code);
    }
  }, [currencies, currencyCode]);

  useEffect(() => {
    if (!isMoexType && !isCryptoType) {
      setInstrumentOptions([]);
      setInstrumentQuery("");
      setInstrumentError(null);
      setSelectedInstrument(null);
      setInstrumentBoards([]);
      setInstrumentBoardId("");
      setPositionLots("");
      setQuantityUnitsStr("");
      setMoexPurchasePrice("");
      setCryptoPurchasePrice("");
      setHistoricalAcquisitionCost("");
      setMarketPrice(null);
      return;
    }
    const query = instrumentQuery.trim();
    if (!query) {
      setInstrumentOptions([]);
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
  }, [instrumentQuery, isMoexType, isCryptoType, typeCode]);

  useEffect(() => {
    if (!selectedInstrument) {
      setInstrumentBoards([]);
      setInstrumentBoardId("");
      setMarketPrice(null);
      return;
    }
    let active = true;
    const isCrypto = selectedInstrument.provider === "COINGECKO";
    fetchMarketInstrumentDetails(selectedInstrument.secid)
      .then((data) => {
        if (!active) return;
        setInstrumentBoards(data.boards ?? []);
        const defaultBoard = isCrypto
          ? "default"
          : (data.instrument.default_board_id || data.boards?.[0]?.board_id || "");
        if (!instrumentBoardId) {
          setInstrumentBoardId(defaultBoard);
        } else if (
          data.boards?.length &&
          !data.boards.some((board) => board.board_id === instrumentBoardId)
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
    const boardId = selectedInstrument?.provider === "COINGECKO" ? "default" : instrumentBoardId;
    if (!selectedInstrument || !boardId) {
      setMarketPrice(null);
      return;
    }
    let active = true;
    fetchMarketInstrumentPrice(selectedInstrument.secid, boardId)
      .then((price) => {
        if (!active) return;
        setMarketPrice(price);
        if (selectedInstrument?.provider === "COINGECKO" && price?.price_usd_cents != null) {
          setCryptoPurchasePrice((prev) =>
            prev.trim() ? prev : ((price?.price_usd_cents ?? 0) / 100).toFixed(2).replace(".", ",")
          );
        }
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
        prices.forEach((price) => {
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
  }, [
    accountingStartDate,
    instrumentBoardId,
    isMoexType,
    kind,
    openDate,
    selectedInstrument,
  ]);

  const openCreateModal = (
    nextKind: ItemKind,
    nextTypeCodes: string[],
    options?: { general?: boolean; sectionId?: string }
  ) => {
    setEditingItem(null);
    setInitialCreateOptions({
      kind: nextKind,
      typeCodes: nextTypeCodes,
      general: options?.general,
      sectionId: options?.sectionId,
    });
    setInitialCreateDefaults(null);
    setIsCreateOpen(true);
  };

  // Открытие формы добавления по ссылке с мобильной плавающей панели (?openCreate=1)
  useEffect(() => {
    if (pathname !== "/assets") return;
    if (searchParams.get("openCreate") !== "1") return;
    openCreateModal("ASSET", ALL_TYPE_CODES, { general: true });
    const params = new URLSearchParams(searchParams.toString());
    params.delete("openCreate");
    const next = params.toString() ? `/assets?${params}` : "/assets";
    router.replace(next);
  }, [pathname, searchParams, router]);

  useEffect(() => {
    if (!isWizardOpen || activeStep?.key !== "assets") return;
    if (!accountingStartDate) return;
    if (onboardingAppliedRef.current === "assets") return;
    onboardingAppliedRef.current = "assets";
    setEditingItem(null);
    setInitialCreateOptions({ kind: "ASSET", typeCodes: CASH_TYPES, general: true });
    setInitialCreateDefaults({
      name: "Наличные",
      amountStr: "50 000",
      openDate: accountingStartDate,
      typeCode: "cash",
    });
    setIsCreateOpen(true);
  }, [
    accountingStartDate,
    activeStep?.key,
    isWizardOpen,
  ]);

  const openEditModal = (item: ItemOut) => {
    setEditingItem(item);
    setInitialCreateOptions(null);
    setInitialCreateDefaults(null);
    setIsCreateOpen(true);
  };

  
  async function onArchive(item: ItemOut) {
    setLoading(true);
    setError(null);
    try {
      if (item.plan_settings?.enabled) {
        const confirmed = await askConfirm(
          "Архивировать актив?",
          "Есть плановые транзакции. Нереализованные будут удалены. Продолжить?"
        );
        if (!confirmed) {
          setLoading(false);
          return;
        }
      }
      await archiveItem(item.id);
      await loadItems();
    } catch (e: any) {
      setError(e?.message ?? "Ошибка архивации");
    } finally {
      setLoading(false);
    }
  }

  function hasNonZeroBalance(item: ItemOut): boolean {
    const isMoexItem = MOEX_TYPE_CODES.includes(item.type_code);
    if (isMoexItem) {
      const positionLots = item.position_lots ?? 0;
      return positionLots !== 0;
    } else {
      return !isBankCardItem(item) && item.current_value_rub !== 0;
    }
  }

  function onClose(item: ItemOut) {
    setError(null);
    setCloseDialogError(null);
    setClosingItem(item);
    setClosingDate(getTodayDateKey());
    setCloseTransferItemId("");
    setCloseWriteOff(false);
    setCloseItemDialogOpen(true);
  }

  async function onConfirmClose(errorSetter?: (msg: string | null) => void) {
    if (!closingItem) return;
    const hasBalance = hasNonZeroBalance(closingItem);
    const setErr = errorSetter ?? setError;

    setLoading(true);
    setErr(null);
    try {
      const payload: { closing_date: string; closeCards?: boolean; write_off?: boolean; transfer_to_item_id?: number } = {
        closing_date: closingDate,
      };

      if (hasBalance) {
        if (closeWriteOff) {
          payload.write_off = true;
        } else if (closeTransferItemId) {
          payload.transfer_to_item_id = Number(closeTransferItemId);
        } else {
          setErr("Выберите способ обработки остатка: перевод или списание");
          setLoading(false);
          return;
        }
      }

      if (closingItem.type_code === "bank_account") {
        const linkedCards = linkedCardsByAccountId.get(closingItem.id) ?? [];
        if (linkedCards.length > 0) {
          payload.closeCards = true;
        }
      }

      await closeItem(closingItem.id, payload);
      await loadItems();
      setCloseItemDialogOpen(false);
      setClosingItem(null);
    } catch (e: any) {
      setErr(e?.message ?? "Не удалось закрыть счет");
    } finally {
      setLoading(false);
    }
  }

  function CategoryTable({
    title,
    items: categoryItems,
    total,
    isLiability = false,
    icon: Icon,
    onAdd,
    isInvestmentAssets = false,
  }: {
    title: string;
    items: ItemOut[];
    total: number;
    isLiability?: boolean;
    icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
    onAdd?: () => void;
    isInvestmentAssets?: boolean;
  }) {
    const accountIds = new Set<number>();
    categoryItems.forEach((item) => {
      if (item.type_code === "bank_account") accountIds.add(item.id);
    });
    const linkedCardsByAccountId = new Map<number, ItemOut[]>();
    const groupedCardIds = new Set<number>();
    categoryItems.forEach((item) => {
      if (!isBankCardItem(item) || !item.card_account_id) return;
      if (!accountIds.has(item.card_account_id)) return;
      const bucket = linkedCardsByAccountId.get(item.card_account_id) ?? [];
      bucket.push(item);
      linkedCardsByAccountId.set(item.card_account_id, bucket);
      groupedCardIds.add(item.id);
    });
    const orderedItems: ItemOut[] = [];
    categoryItems.forEach((item) => {
      if (item.type_code === "bank_account") {
        orderedItems.push(item);
        const linked = linkedCardsByAccountId.get(item.id) ?? [];
        orderedItems.push(...linked);
        return;
      }
      if (groupedCardIds.has(item.id)) return;
      orderedItems.push(item);
    });

    return (
      <Card className="pb-0 overflow-hidden">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            {Icon && (
              <Icon className="h-7 w-7 text-violet-600" strokeWidth={1.5} />
            )}
            {title}
          </CardTitle>
          {onAdd && (
            <Button
              type="button"
              size="sm"
              className="h-8 bg-violet-600 hover:bg-violet-700 text-white"
              onClick={onAdd}
            >
              <Plus className="mr-2 h-4 w-4" />
              Добавить
            </Button>
          )}
        </CardHeader>
        <CardContent className="px-0">
          {orderedItems.length === 0 ? (
            <div className="h-24 px-4 flex items-center justify-center text-muted-foreground">
              Пока нет записей
            </div>
          ) : (
            <div className="-mx-6">
              <Table className="w-full">
                <TableHeader className="[&_tr]:border-b-2 [&_tr]:border-border/70">
                  <TableRow className="border-b-2 border-border/70">
                    <TableHead className="pl-[2.5rem] sm:pl-[3rem] font-medium text-muted-foreground whitespace-normal">
                      Название
                    </TableHead>
                    <TableHead className="w-16 min-w-16 max-w-16 font-medium text-muted-foreground text-center whitespace-normal">
                      
                    </TableHead>
                    <TableHead className="font-medium text-muted-foreground whitespace-normal text-center">
                      Дата появления / Статус
                    </TableHead>
                    <TableHead className="text-right font-medium text-muted-foreground whitespace-normal">
                      {isInvestmentAssets
                        ? "Текущая сумма в валюте/количество лотов"
                        : "Текущая сумма в валюте"}
                    </TableHead>
                    <TableHead className="font-medium text-muted-foreground text-center whitespace-normal">
                      
                    </TableHead>
                    <TableHead className="text-right font-medium text-muted-foreground whitespace-normal">
                      {isInvestmentAssets
                        ? "Актуальный курс валюты/стоимость одного лота"
                        : "Актуальный курс валюты"}
                    </TableHead>
                    <TableHead className="text-right font-medium text-muted-foreground whitespace-normal">
                      Текущая сумма в руб. экв.
                    </TableHead>
                    <TableHead className="pr-[2.5rem] sm:pr-[3rem]" />
                  </TableRow>
                </TableHeader>

              <TableBody>
                {orderedItems.map((it) => {
                  const typeLabel = getItemTypeLabel(it);
                  const typeMeta = typeLabel;
                  const rate = rateByCode[it.currency_code];
                  const rubEquivalent = getPrimaryValueRubCents(it);
                  const displayBalanceCents = getItemDisplayBalanceCents(it);
                  const currencyCode = it.currency_code || "";
                  const counterparty = it.counterparty_id ? counterpartiesById.get(it.counterparty_id) ?? null : null;
                  const counterpartyLogoRaw =
                    counterparty?.entity_type === "PERSON"
                      ? counterparty?.photo_url ?? null
                      : counterparty?.logo_url ?? null;
                  const counterpartyLogoUrl = counterpartyLogoRaw
                    ? resolveApiImageUrlToBase(counterpartyLogoRaw, API_BASE)
                    : null;
                  const counterpartyName = counterparty
                    ? counterparty.entity_type === "PERSON"
                      ? [counterparty.last_name, counterparty.first_name, counterparty.middle_name]
                          .filter(Boolean)
                          .join(" ")
                      : counterparty.name || counterparty.full_name || ""
                    : "";
                  const TypeIcon = TYPE_ICON_BY_CODE[it.type_code];
                  const isArchived = Boolean(it.archived_at);
                  const isClosed = Boolean(it.closed_at);
                  const isLinkedCard = isBankCardItem(it) && Boolean(it.card_account_id);
                  const isSettlements = it.type_code === "counterparty_settlements";
                  const canEdit = !isArchived && !isClosed && !isSettlements;
                  const canClose = !isArchived && !isClosed && !isSettlements;
                  const canDelete = !isArchived && !isSettlements;
                  const linkedAccount =
                    isBankCardItem(it) && it.card_account_id
                      ? itemsById.get(it.card_account_id)
                      : null;
                  const historyStatus =
                    it.history_status ??
                    (accountingStartDate && it.open_date
                      ? it.open_date > accountingStartDate
                        ? "NEW"
                        : "HISTORICAL"
                      : null);
                  const openDateLabel = it.open_date
                    ? formatShortDate(it.open_date)
                    : "—";
                  const rowToneClass = isArchived
                    ? "bg-rose-50/80"
                    : isClosed
                    ? "bg-muted/80"
                    : "";
                  const textToneClass = isArchived
                    ? "text-slate-400"
                    : isClosed
                    ? "text-slate-400"
                    : "";
                  const mutedToneClass = isArchived
                    ? "text-slate-300"
                    : isClosed
                    ? "text-slate-300"
                    : "text-muted-foreground";
                  const iconToneClass = isArchived
                    ? "text-slate-400"
                    : isClosed
                    ? "text-slate-400"
                    : "text-violet-600";
                  const isMoexItem = MOEX_TYPE_CODES.includes(it.type_code);
                  const moexMarketPrice = isMoexItem ? moexMarketPrices.get(it.id) : null;

                  return (
                    <TableRow
                      key={it.id}
                      className={["border-b-2 border-border/70", rowToneClass].join(" ")}
                    >
                      <TableCell
                        className={[
                          "whitespace-normal break-words",
                          isLinkedCard
                            ? "pl-[4rem] sm:pl-[4.5rem]"
                            : "pl-[2.5rem] sm:pl-[3rem]",
                        ].join(" ")}
                      >
                        <div className="flex items-center gap-2">
                          {TypeIcon && (
                            <TypeIcon
                              className={["h-7 w-7 shrink-0", iconToneClass].join(" ")}
                              strokeWidth={1.5}
                            />
                          )}
                          <div className="flex flex-col gap-1">
                            <span
                              className={["font-medium leading-tight", textToneClass].join(" ")}
                            >
                              {it.name}
                            </span>
                            <span className={["text-xs leading-tight", mutedToneClass].join(" ")}>
                              {typeMeta}
                            </span>
                            {linkedAccount ? (
                              <span
                                className={["text-xs leading-tight", mutedToneClass].join(" ")}
                              >
                                Привязана к: {linkedAccount.name}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </TableCell>

                      <TableCell
                        className={["w-16 min-w-16 max-w-16 text-center text-sm", mutedToneClass].join(" ")}
                      >
                        {!isLinkedCard && counterpartyLogoUrl ? (
                          <img
                            src={counterpartyLogoUrl}
                            alt={counterpartyName}
                            className={[
                              "mx-auto h-5 w-5 rounded object-contain",
                              isArchived || isClosed ? "opacity-40" : "",
                            ].join(" ")}
                            loading="lazy"
                          />
                        ) : null}
                      </TableCell>

                      <TableCell
                        className={["text-center text-sm", mutedToneClass].join(" ")}
                      >
                        <div className="flex flex-col items-center gap-1">
                          <span>{openDateLabel}</span>
                          {historyStatus ? (
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                historyStatus === "NEW"
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-muted text-foreground"
                              }`}
                            >
                              {historyStatus === "NEW" ? "Новый" : "Исторический"}
                            </span>
                          ) : (
                            <span className={["text-sm", mutedToneClass].join(" ")}>-</span>
                          )}
                        </div>
                      </TableCell>

                      <TableCell
                        className={[
                          "text-right font-semibold",
                          isArchived
                            ? "text-slate-400"
                            : isClosed
                            ? "text-slate-400"
                            : isLiability
                            ? "text-red-600"
                            : "",
                        ].join(" ")}
                      >
                        {isLinkedCard
                          ? "-"
                          : isInvestmentAssets && isMoexItem
                          ? it.position_lots != null
                            ? `${new Intl.NumberFormat("ru-RU").format(it.position_lots)} шт.`
                            : "-"
                          : isInvestmentAssets && !isMoexItem
                          ? isLiability
                            ? `${formatAmount(Math.abs(displayBalanceCents))} ${currencyCode}`
                            : `${formatAmount(displayBalanceCents)} ${currencyCode}`
                          : isLiability
                          ? `-${formatAmount(Math.abs(displayBalanceCents))}`
                          : formatAmount(displayBalanceCents)}
                      </TableCell>

                      <TableCell
                        className={["text-center text-sm", mutedToneClass].join(" ")}
                      >
                        {isLinkedCard ? (
                          "-"
                        ) : currencyCode ? (
                          <CurrencyChip
                            code={currencyCode}
                            className={["min-w-10 justify-center", isArchived || isClosed ? "opacity-40" : ""].join(" ")}
                          />
                        ) : (
                          "-"
                        )}
                      </TableCell>

                      <TableCell
                        className={["text-right text-sm", mutedToneClass].join(" ")}
                      >
                        {isLinkedCard
                          ? "-"
                          : isInvestmentAssets && isMoexItem
                          ? moexMarketPrice && moexMarketPrice.price_cents != null
                            ? (() => {
                                const lotSize = it.lot_size ?? 1;
                                const unitPrice = moexMarketPrice.price_cents;
                                const accint =
                                  it.type_code === "bonds"
                                    ? moexMarketPrice.accint_cents ?? 0
                                    : 0;
                                const lotPriceCents = Math.round((unitPrice + accint) * lotSize);
                                return formatMoney(
                                  lotPriceCents,
                                  moexMarketPrice.currency_code ?? currencyCode
                                );
                              })()
                            : moexMarketPricesLoading
                            ? "..."
                            : "-"
                          : rate
                          ? formatRate(rate)
                          : "-"}
                      </TableCell>

                      <TableCell
                        className={[
                          "text-right font-semibold",
                          isArchived
                            ? "text-slate-400"
                            : isClosed
                            ? "text-slate-400"
                            : isLiability
                            ? "text-red-600"
                            : "",
                        ].join(" ")}
                      >
                        {isLinkedCard
                          ? "-"
                          : rubEquivalent === null
                          ? "-"
                          : isLiability
                          ? `-${formatRub(rubEquivalent)}`
                          : formatRub(rubEquivalent)}
                      </TableCell>

                      <TableCell className="pr-[2.5rem] sm:pr-[3rem] text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <IconButton
                              aria-label="Открыть меню действий"
                              disabled={isArchived && !canDelete}
                            >
                              <MoreVertical />
                            </IconButton>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem
                              onSelect={() => openEditModal(it)}
                              disabled={!canEdit}
                            >
                              <Pencil className="h-4 w-4" />
                              Редактировать
                            </DropdownMenuItem>
                            {it.instrument_id && canEdit && (
                              <DropdownMenuItem
                                onSelect={() => setBuySellAsset(it)}
                              >
                                <TrendingUp className="h-4 w-4" />
                                Купить/продать актив
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onSelect={() => onClose(it)}
                              disabled={!canClose}
                            >
                              <Archive className="h-4 w-4" />
                              Закрыть
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              onSelect={() => onArchive(it)}
                              disabled={!canDelete}
                            >
                              <Trash2 className="h-4 w-4" />
                              Удалить
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>

              <TableFooter className="border-t-2 border-border/70">
                <TableRow className="bg-violet-50/70 border-b-0">
                  <TableCell className="pl-[2.5rem] sm:pl-[3rem] font-medium">Итого</TableCell>
                  <TableCell />
                  <TableCell />
                  <TableCell />
                  <TableCell />
                  <TableCell />
                  <TableCell />
                  <TableCell
                    className={[
                      "text-right font-semibold",
                      isLiability ? "text-red-600" : "",
                    ].join(" ")}
                  >
                    {isLiability ? `-${formatRub(total)}` : formatRub(total)}
                  </TableCell>
                  <TableCell className="pr-[2.5rem] sm:pr-[3rem]" />
                </TableRow>
                </TableFooter>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  /* ------------------ основной UI ------------------ */

  const { isCollapsed, filtersSlotId, isDesktop } = useSidebar();

  // Мини-график основной стоимости за 30 дней (только для мобильной версии)
  const itemDailyPrimaryValueByItemId = useMemo(() => {
    if (isDesktop) return new Map<number, { date: string; valueRubCents: number }[]>();
    const map = new Map<number, { date: string; valueRubCents: number }[]>();
    visibleItems.forEach((item) => {
      const rate = rateByCode[item.currency_code ?? "RUB"] ?? 1;
      const series = buildItemDailyPrimaryValueRubCents(
        item,
        txs,
        accountingStartDate,
        rate,
        { days: 30 }
      );
      map.set(item.id, series);
    });
    return map;
  }, [isDesktop, visibleItems, txs, accountingStartDate, rateByCode]);

  // Данные costs по активу (как на странице актива [id]) — только для мобильной версии, по активам с небалансовой основной стоимостью
  const [itemCostsByItemId, setItemCostsByItemId] = useState<Map<number, ItemCostsOut>>(new Map());

  useEffect(() => {
    if (isDesktop) return;
    const nonBalanceIds = visibleItems
      .filter((item) => (item.primary_value_kind ?? "BALANCE") !== "BALANCE")
      .map((item) => item.id);
    if (nonBalanceIds.length === 0) {
      setItemCostsByItemId(new Map());
      return;
    }
    let cancelled = false;
    Promise.all(nonBalanceIds.map((id) => fetchItemCosts(id)))
      .then((results) => {
        if (cancelled) return;
        const map = new Map<number, ItemCostsOut>();
        nonBalanceIds.forEach((id, i) => map.set(id, results[i]));
        setItemCostsByItemId(map);
      })
      .catch(() => {
        if (!cancelled) setItemCostsByItemId(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, [isDesktop, visibleItems]);

  // Доходы и расходы в валюте актива из costs (как на странице [id]: income_rub/expense_rub, для валютного — делим на курс)
  const itemIncomeExpenseCentsByItemId = useMemo(() => {
    if (isDesktop) return new Map<number, { incomeCents: number; expenseCents: number }>();
    const map = new Map<number, { incomeCents: number; expenseCents: number }>();
    itemCostsByItemId.forEach((costs, itemId) => {
      const item = itemsById.get(itemId);
      if (!item) return;
      const currency = item.currency_code ?? "RUB";
      const rate = currency === "RUB" ? 1 : rateByCode[currency] ?? 1;
      const incomeCents =
        currency === "RUB" ? costs.income_rub : Math.round(costs.income_rub / rate);
      const expenseCents =
        currency === "RUB" ? costs.expense_rub : Math.round(costs.expense_rub / rate);
      map.set(itemId, { incomeCents, expenseCents });
    });
    return map;
  }, [isDesktop, itemCostsByItemId, itemsById, rateByCode]);

  return (
    <main
      className={cn(
        "min-h-screen pb-8",
        isCollapsed ? "pl-0" : "pl-0"
      )}
    >
      <AddEditItemFormModal
        open={isCreateOpen}
        onOpenChange={(next) => {
          if (!next) setEditingItem(null);
          setIsCreateOpen(next);
        }}
        onSuccess={async () => {
          await loadItems();
          await loadTransactions();
          setIsCreateOpen(false);
          setEditingItem(null);
        }}
        editingItem={editingItem}
        onClearEditingItem={() => setEditingItem(null)}
        initialCreateOptions={initialCreateOptions}
        initialCreateDefaults={initialCreateDefaults}
        askConfirm={askConfirm}
        items={items}
      />



      <FormModal
        open={closeItemDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setCloseItemDialogOpen(false);
            setClosingItem(null);
            setCloseDialogError(null);
          }
        }}
        title="Закрытие актива/обязательства"
        icon={<Archive className="w-8 h-8" style={{ color: ACTIVE_TEXT_DARK }} />}
        formError={closeDialogError}
        onSubmit={(e) => {
          e.preventDefault();
          onConfirmClose(setCloseDialogError);
        }}
        onCancel={() => {
          setCloseItemDialogOpen(false);
          setClosingItem(null);
          setCloseDialogError(null);
        }}
        submitLabel={loading ? "Закрываем..." : "Закрыть"}
        cancelLabel="Отмена"
        loading={loading}
        disabled={
          !closingDate ||
          (closingItem != null &&
            hasNonZeroBalance(closingItem) &&
            !closeWriteOff &&
            !closeTransferItemId)
        }
      >
        <DateField
          label="Дата закрытия"
          required
          value={closingDate}
          onChange={(e) => setClosingDate(e.target.value)}
        />
        {closingItem && hasNonZeroBalance(closingItem) && (
          <>
            <FormField label="Обработка остатка">
              <SegmentedSelector
                options={[
                  { value: "transfer", label: "Перевести на", colorScheme: "purple" },
                  { value: "write_off", label: "Списать", colorScheme: "red" },
                ]}
                value={closeWriteOff ? "write_off" : "transfer"}
                onChange={(v) => {
                  setCloseWriteOff(v === "write_off");
                  if (v === "transfer") setCloseTransferItemId("");
                }}
              />
            </FormField>
            {!closeWriteOff && (
              <FormField label="Актив/обязательство для перевода">
                <ItemSelector
                  items={activeItems.filter((item) => item.id !== closingItem?.id)}
                  selectedIds={closeTransferItemId ? [Number(closeTransferItemId)] : []}
                  onChange={(ids) => {
                    const nextId = ids[0] ?? null;
                    setCloseTransferItemId(nextId ? String(nextId) : "");
                  }}
                  selectionMode="single"
                  placeholder="Выберите актив/обязательство"
                  clearLabel="Не выбрано"
                  getItemTypeLabel={getItemTypeLabel}
                  getItemKind={resolveItemEffectiveKind}
                  getItemBalance={getItemDisplayBalanceCents}
                  getCounterpartyForItemId={getCounterpartyForItemId}
                  apiBase={API_BASE}
                  getBankLogoUrl={itemCounterpartyLogoUrl}
                  getBankName={itemCounterpartyName}
                  itemCounts={itemTxCounts}
                  ariaLabel="Актив/обязательство для перевода"
                />
              </FormField>
            )}
          </>
        )}
      </FormModal>

      <CreateCounterpartyModal
        open={createCounterpartyOpen}
        onOpenChange={setCreateCounterpartyOpen}
        onSuccess={async (created) => {
          await loadCounterparties();
          setCounterpartyId(created.id);
        }}
      />

      {error && <div className="mb-4 text-sm text-red-600">{error}</div>}

      {mounted && typeof document !== "undefined" && (() => {
        const el = document.getElementById(filtersSlotId);
        return el ? createPortal(
          <div className="space-y-4 py-2">
            <FilterSection
            label="Тип"
            onReset={() => setFilterType(new Set())}
            showReset={filterType.size > 0}
          >
            <SegmentedSelector
              options={[
                { value: "ASSET", label: "Активы", colorScheme: "green" },
                { value: "LIABILITY", label: "Обязательства", colorScheme: "red" },
              ]}
              value={filterType}
              onChange={(value) => {
                if (value instanceof Set) {
                  setFilterType(value);
                } else if (Array.isArray(value)) {
                  setFilterType(new Set(value));
                } else {
                  setFilterType(new Set([value]));
                }
              }}
              multiple={true}
            />
          </FilterSection>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-1">
                <div className="text-sm font-medium" style={{ color: SIDEBAR_TEXT_ACTIVE }}>
                  Вид актива/обязательства
                </div>
                <button
                  type="button"
                  aria-label="Свернуть/развернуть"
                  className="rounded-md p-1 hover:bg-[rgba(108,93,215,0.22)] transition-colors"
                  onClick={() => setIsTypeCodeFilterOpen((prev) => !prev)}
                >
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${
                      isTypeCodeFilterOpen ? "rotate-0" : "-rotate-90"
                    }`}
                    style={{ color: PLACEHOLDER_COLOR_DARK }}
                  />
                </button>
              </div>
              {filterTypeCodes.size > 0 && (
                <button
                  type="button"
                  className="text-sm font-medium hover:underline disabled:opacity-50"
                  style={{ color: ACCENT }}
                  onClick={() => setFilterTypeCodes(new Set())}
                >
                  Сбросить
                </button>
              )}
            </div>

            {isTypeCodeFilterOpen && (
              <div className="space-y-2">
                {availableTypeCodes.length === 0 ? (
                  <div className="text-xs" style={{ color: PLACEHOLDER_COLOR_DARK }}>
                    Список видов пока пуст.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {availableTypeCodes.map((typeCode) => {
                      const label = ITEM_TYPE_LABELS[typeCode] || typeCode;
                      const isChecked = filterTypeCodes.has(typeCode);
                      return (
                        <label
                          key={typeCode}
                          className="flex items-center gap-2 cursor-pointer text-sm"
                          style={{ color: SIDEBAR_TEXT_ACTIVE }}
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            style={{ accentColor: ACCENT }}
                            checked={isChecked}
                            onChange={() => {
                              const next = new Set(filterTypeCodes);
                              if (isChecked) {
                                next.delete(typeCode);
                              } else {
                                next.add(typeCode);
                              }
                              setFilterTypeCodes(next);
                            }}
                          />
                          {label}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          <FilterSection
            label="Статус"
            onReset={() => setFilterStatus(new Set(["active"]))}
            showReset={!filterStatus.has("active") || filterStatus.size > 1}
          >
            <SegmentedSelector
              options={[
                { value: "active", label: "Активный", colorScheme: "green" },
                { value: "closed", label: "Закрытый" },
                { value: "deleted", label: "Удалено", colorScheme: "red" },
              ]}
              value={Array.from(filterStatus)}
              onChange={(value) => {
                const values = Array.isArray(value) ? value : [];
                setFilterStatus(new Set(values));
              }}
              multiple={true}
            />
          </FilterSection>

          <FilterSection
            label="Название"
            onReset={() => setFilterName("")}
            showReset={!!filterName}
          >
            <div className="[&_div.relative.flex.items-center]:h-10 [&_input]:text-sm [&_input]:font-normal [&_input:not(:placeholder-shown)]:text-white">
              <AuthInput
                type="text"
                placeholder="Начните вводить название"
                value={filterName}
                onChange={(e) => setFilterName(e.target.value)}
              />
            </div>
          </FilterSection>

          <FilterSection
            label="Сумма"
            onReset={() => {
              setFilterAmountFrom("");
              setFilterAmountTo("");
            }}
            showReset={!!filterAmountFrom || !!filterAmountTo}
          >
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <div className="flex-1 min-w-0 basis-0">
                <div className="[&_div.relative.flex.items-center]:h-10 [&_input]:text-sm [&_input]:font-normal [&_input:not(:placeholder-shown)]:text-white min-w-0">
                  <AuthInput
                    type="text"
                    inputMode="decimal"
                    placeholder="От"
                    value={filterAmountFrom}
                    onChange={(e) => setFilterAmountFrom(formatRubInput(e.target.value))}
                    onBlur={() => setFilterAmountFrom((prev) => normalizeRubOnBlur(prev))}
                  />
                </div>
              </div>
              <span className="text-sm shrink-0" style={{ color: SIDEBAR_TEXT_ACTIVE }}>—</span>
              <div className="flex-1 min-w-0 basis-0">
                <div className="[&_div.relative.flex.items-center]:h-10 [&_input]:text-sm [&_input]:font-normal [&_input:not(:placeholder-shown)]:text-white min-w-0">
                  <AuthInput
                    type="text"
                    inputMode="decimal"
                    placeholder="До"
                    value={filterAmountTo}
                    onChange={(e) => setFilterAmountTo(formatRubInput(e.target.value))}
                    onBlur={() => setFilterAmountTo((prev) => normalizeRubOnBlur(prev))}
                  />
                </div>
              </div>
            </div>
          </FilterSection>

          <FilterSection
            label="Дата появления"
            onReset={() => {
              setFilterDateFrom("");
              setFilterDateTo("");
            }}
            showReset={!!filterDateFrom || !!filterDateTo}
          >
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex-1 min-w-0">
                <div className="[&_div.relative.flex.items-center]:h-10 [&_input]:text-sm [&_input]:font-normal">
                  <AuthInput
                    type="date"
                    value={filterDateFrom}
                    onChange={(e) => setFilterDateFrom(e.target.value)}
                    style={{
                      color: !filterDateFrom ? PLACEHOLDER_COLOR_DARK : ACTIVE_TEXT_DARK,
                    }}
                  />
                </div>
              </div>
              <span className="text-sm" style={{ color: SIDEBAR_TEXT_ACTIVE }}>—</span>
              <div className="flex-1 min-w-0">
                <div className="[&_div.relative.flex.items-center]:h-10 [&_input]:text-sm [&_input]:font-normal">
                  <AuthInput
                    type="date"
                    value={filterDateTo}
                    onChange={(e) => setFilterDateTo(e.target.value)}
                    style={{
                      color: !filterDateTo ? PLACEHOLDER_COLOR_DARK : ACTIVE_TEXT_DARK,
                    }}
                  />
                </div>
              </div>
            </div>
          </FilterSection>

          <FilterSection
            label="Контрагент"
            onReset={() => setFilterCounterpartyIds([])}
            showReset={filterCounterpartyIds.length > 0}
          >
            <CounterpartySelector
              counterparties={counterparties}
              selectedIds={filterCounterpartyIds}
              onChange={setFilterCounterpartyIds}
              selectionMode="multi"
              placeholder="Начните вводить название"
              emptyMessage="Нет контрагентов"
              noResultsMessage="Ничего не найдено"
              counterpartyCounts={counterpartyTxCounts}
              apiBase={API_BASE}
            />
          </FilterSection>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-1">
                <div className="text-sm font-medium" style={{ color: SIDEBAR_TEXT_ACTIVE }}>
                  Валюта
                </div>
                <button
                  type="button"
                  aria-label="Свернуть/развернуть"
                  className="rounded-md p-1 hover:bg-[rgba(108,93,215,0.22)] transition-colors"
                  onClick={() => setIsCurrencyFilterOpen((prev) => !prev)}
                >
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${
                      isCurrencyFilterOpen ? "rotate-0" : "-rotate-90"
                    }`}
                    style={{ color: PLACEHOLDER_COLOR_DARK }}
                  />
                </button>
              </div>
              {filterCurrencyCodes.size > 0 && (
                <button
                  type="button"
                  className="text-sm font-medium hover:underline disabled:opacity-50"
                  style={{ color: ACCENT }}
                  onClick={() => setFilterCurrencyCodes(new Set<string>())}
                >
                  Сбросить
                </button>
              )}
            </div>

            {isCurrencyFilterOpen && (
              <div className="space-y-2">
                {currencyOptions.length === 0 ? (
                  <div className="text-sm" style={{ color: PLACEHOLDER_COLOR_DARK }}>
                    Нет валют.
                  </div>
                ) : (
                  currencyOptions.map((value) => (
                    <label
                      key={value}
                      className="flex items-center gap-3 text-sm cursor-pointer"
                      style={{ color: SIDEBAR_TEXT_ACTIVE }}
                    >
                      <input
                        type="checkbox"
                        className="h-5 w-5"
                        style={{ accentColor: ACCENT }}
                        checked={filterCurrencyCodes.has(value)}
                        onChange={() => toggleCurrencySelection(value)}
                      />
                      <span>{value}</span>
                    </label>
                  ))
                )}
              </div>
            )}
          </div>
          </div>,
          el
        ) : null;
      })()}

      <div className="flex-1 min-w-0">
        <div className={CONTENT_WIDTH_CLASS} style={{ paddingTop: "30px" }}>
            {loading ? (
              <div className="flex items-center justify-center py-16" style={{ color: PLACEHOLDER_COLOR_DARK }}>
                Загрузка…
              </div>
            ) : visibleItems.length === 0 ? (
              isDesktop ? (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Button
                      className="rounded-[9px] border-0 flex items-center justify-center transition-colors hover:opacity-90 text-sm font-normal"
                      style={{ backgroundColor: ACCENT }}
                      onClick={() => openCreateModal("ASSET", ALL_TYPE_CODES, { general: true })}
                    >
                      <Plus className="h-5 w-5 mr-2" style={{ color: "white", opacity: 0.85 }} />
                      <span style={{ color: "white", opacity: 0.85 }}>Добавить</span>
                    </Button>
                  </div>
                  <EmptyState />
                </div>
              ) : (
                <EmptyState />
              )
            ) : isDesktop ? (
              /* Десктоп: кнопка «Добавить», переключатель вида, карточки/список с градиентом сумм */
              <div className="relative">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                  <Button
                    className="rounded-[9px] border-0 flex items-center justify-center transition-colors hover:opacity-90 text-sm font-normal"
                    style={{ backgroundColor: ACCENT }}
                    onClick={() => openCreateModal("ASSET", ALL_TYPE_CODES, { general: true })}
                  >
                    <Plus className="h-5 w-5 mr-2" style={{ color: "white", opacity: 0.85 }} />
                    <span style={{ color: "white", opacity: 0.85 }}>Добавить</span>
                  </Button>
                  <div className="flex items-center rounded-[9px] border border-border overflow-hidden">
                    <Tooltip content="Карточки">
                      <button
                        type="button"
                        aria-label="Вид карточками"
                        className={cn(
                          "p-2 transition-colors",
                          cardsViewMode !== "grid" && "bg-transparent text-muted-foreground hover:bg-input/20 dark:hover:bg-input/30"
                        )}
                        style={cardsViewMode === "grid" ? { backgroundColor: ACCENT, color: "white" } : undefined}
                        onClick={() => setCardsViewMode("grid")}
                      >
                        <LayoutGrid className="h-4 w-4" />
                      </button>
                    </Tooltip>
                    <Tooltip content="Список">
                      <button
                        type="button"
                        aria-label="Вид списком"
                        className={cn(
                          "p-2 transition-colors",
                          cardsViewMode !== "list" && "bg-transparent text-muted-foreground hover:bg-input/20 dark:hover:bg-input/30"
                        )}
                        style={cardsViewMode === "list" ? { backgroundColor: ACCENT, color: "white" } : undefined}
                        onClick={() => setCardsViewMode("list")}
                      >
                        <List className="h-4 w-4" />
                      </button>
                    </Tooltip>
                  </div>
                </div>
                <div className="space-y-8">
                  {orderedSectionsWithItems.map(({ section, items, totalRubCents }) => (
                    <div key={section.id}>
                      <div
                        className="flex flex-wrap items-baseline justify-between gap-2 mb-3 px-3 py-2 rounded-lg"
                        style={{ background: PINK_GRADIENT }}
                      >
                        <h2
                          className="text-2xl font-medium"
                          style={{ color: "rgba(255,255,255,0.95)" }}
                        >
                          {section.label}
                        </h2>
                        <span
                          className="text-2xl font-medium tabular-nums"
                          style={{ color: "rgba(255,255,255,0.95)" }}
                        >
                          {section.kind === "LIABILITY"
                            ? totalRubCents < 0
                              ? formatRub(totalRubCents)
                              : `-${formatRub(totalRubCents)}`
                            : formatRub(totalRubCents)}
                        </span>
                      </div>
                      <div
                        className={
                          cardsViewMode === "list"
                            ? "flex flex-col gap-4"
                            : "columns-1 md:columns-2 @[1400px]:columns-3 gap-4"
                        }
                      >
                        {items.map((item) => {
                          const rate = rateByCode[item.currency_code];
                          const rubEquivalent = getPrimaryValueRubCents(item);
                          const counterparty = item.counterparty_id
                            ? counterpartiesById.get(item.counterparty_id) ?? null
                            : null;
                          return cardsViewMode === "list" ? (
                            <AssetCard
                              key={item.id}
                              item={item}
                              layout="row"
                              accountingStartDate={accountingStartDate}
                              rate={rate}
                              rubEquivalent={rubEquivalent}
                              showRubEquivalent={isDesktop}
                              primaryValueLabel={getPrimaryValueLabel(item.primary_value_kind)}
                              counterparty={counterparty}
                              moexMarketPrice={
                                MOEX_TYPE_CODES.includes(item.type_code)
                                  ? moexMarketPrices.get(item.id) ?? null
                                  : null
                              }
                              onEdit={(item) => openEditModal(item)}
                              onDelete={(item) => onArchive(item)}
                              onArchive={(item) => onArchive(item)}
                              onClose={(item) => onClose(item)}
                              onBuySell={(item) => setBuySellAsset(item)}
                              getItemDisplayBalanceCents={getItemDisplayBalanceCents}
                              onNavigate={(it) => router.push(`/assets/${it.id}`)}
                            />
                          ) : (
                            <div
                              key={item.id}
                              style={{
                                breakInside: "avoid",
                                marginBottom: "1rem",
                              }}
                            >
                              <AssetCard
                                item={item}
                                accountingStartDate={accountingStartDate}
                                rate={rate}
                                rubEquivalent={rubEquivalent}
                                showRubEquivalent={isDesktop}
                                primaryValueLabel={getPrimaryValueLabel(item.primary_value_kind)}
                                counterparty={counterparty}
                                moexMarketPrice={
                                  MOEX_TYPE_CODES.includes(item.type_code)
                                    ? moexMarketPrices.get(item.id) ?? null
                                    : null
                                }
                                onEdit={(item) => openEditModal(item)}
                                onDelete={(item) => onArchive(item)}
                                onArchive={(item) => onArchive(item)}
                                onClose={(item) => onClose(item)}
                                onBuySell={(item) => setBuySellAsset(item)}
                                getItemDisplayBalanceCents={getItemDisplayBalanceCents}
                                onNavigate={(it) => router.push(`/assets/${it.id}`)}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              /* Мобильная: поле поиска (при потягивании вниз видно) + карточки активов */
              <div className="relative flex flex-col gap-4">
                <div className="sticky top-0 z-10 -mx-4 px-4 pt-0 pb-1" style={{ backgroundColor: "var(--app-bg, #000)" }}>
                  <div
                    className="relative flex items-center rounded-lg transition-[background-color,box-shadow] duration-200"
                    style={{
                      backgroundColor:
                        mobileSearchFocused || mobileAssetsSearch.length > 0
                          ? "rgba(197, 191, 241, 0.32)"
                          : "rgba(197, 191, 241, 0.18)",
                      boxShadow: mobileSearchFocused
                        ? `inset 0 -2px 0 0 ${ACCENT2}, 0 8px 25px -8px ${ACCENT2}`
                        : "none",
                    }}
                  >
                    <Search
                      className="absolute left-3 h-4 w-4 shrink-0 pointer-events-none transition-colors duration-200"
                      style={{ color: mobileSearchFocused ? ACCENT : PLACEHOLDER_COLOR_DARK }}
                      aria-hidden
                    />
                    <Input
                      type="text"
                      placeholder="Поиск"
                      value={mobileAssetsSearch}
                      onChange={(e) => setMobileAssetsSearch(e.target.value)}
                      onFocus={() => setMobileSearchFocused(true)}
                      onBlur={() => setMobileSearchFocused(false)}
                      className="w-full pl-10 pr-10 py-2 text-base font-normal border-0 shadow-none outline-none focus-visible:ring-0 focus-visible:border-0 rounded-lg placeholder:text-[rgba(197,191,241,0.6)]"
                      style={{
                        color: ACTIVE_TEXT_DARK,
                        backgroundColor: "transparent",
                      }}
                      aria-label="Поиск активов и обязательств"
                    />
                    {mobileAssetsSearch.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setMobileAssetsSearch("")}
                        className="absolute right-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-md touch-manipulation transition-colors duration-200"
                        style={{ color: mobileSearchFocused ? ACCENT : PLACEHOLDER_COLOR_DARK }}
                        aria-label="Очистить поиск"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="space-y-8">
                  {mobileOrderedSectionsWithItems.map(({ section, items, totalRubCents }) => (
                    <div key={section.id}>
                      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                        <h2
                          className="text-xl font-semibold"
                          style={{ color: ACTIVE_TEXT_DARK }}
                        >
                          {section.label}
                        </h2>
                        <span className="inline-flex items-center gap-1.5">
                          <CurrencyChip code="RUB" className="text-sm" />
                          <span
                            className="text-xl font-semibold tabular-nums"
                            style={{ color: ACTIVE_TEXT_DARK }}
                          >
                            {section.kind === "LIABILITY"
                              ? totalRubCents < 0
                                ? formatRub(totalRubCents)
                                : `-${formatRub(totalRubCents)}`
                              : formatRub(totalRubCents)}
                          </span>
                        </span>
                      </div>
                      <div className="space-y-3">
                        {items.map((item) => {
                          const rate = rateByCode[item.currency_code];
                          const rubEquivalent = getPrimaryValueRubCents(item);
                          const counterparty = item.counterparty_id
                            ? counterpartiesById.get(item.counterparty_id) ?? null
                            : null;
                          return (
                            <MobileTapScale key={item.id} className="w-full">
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
                                      rate={rate}
                                      rubEquivalent={rubEquivalent}
                                      showRubEquivalent={isDesktop}
                                      primaryValueLabel={getPrimaryValueLabel(item.primary_value_kind)}
                                      counterparty={counterparty}
                                      moexMarketPrice={
                                        MOEX_TYPE_CODES.includes(item.type_code)
                                          ? moexMarketPrices.get(item.id) ?? null
                                          : null
                                      }
                                      onEdit={(item) => openEditModal(item)}
                                      onDelete={(item) => onArchive(item)}
                                      onArchive={(item) => onArchive(item)}
                                      onClose={(item) => onClose(item)}
                                      onBuySell={(item) => setBuySellAsset(item)}
                                      getItemDisplayBalanceCents={getItemDisplayBalanceCents}
                                      onNavigate={(it) => router.push(`/assets/${it.id}`)}
                                      dailyPrimaryValueRubCents={itemDailyPrimaryValueByItemId.get(item.id)}
                                      totalIncomeCents={itemIncomeExpenseCentsByItemId.get(item.id)?.incomeCents}
                                      totalExpenseCents={itemIncomeExpenseCentsByItemId.get(item.id)?.expenseCents}
                                    />
                                  </TableBody>
                                </Table>
                              </div>
                            </MobileTapScale>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

      <ConfirmModal
        open={confirmDialog !== null}
        onOpenChange={(open) => {
          if (!open && confirmDialog) {
            confirmDialog.resolve(false);
            setConfirmDialog(null);
          }
        }}
        title={confirmDialog?.title ?? ""}
        description={confirmDialog?.message ?? ""}
        confirmLabel="Продолжить"
        variant="primary"
        onConfirm={() => {
          if (confirmDialog) {
            confirmDialog.resolve(true);
            setConfirmDialog(null);
          }
        }}
      />

      {buySellAsset && (
        <BuySellAssetModal
          open={buySellAsset !== null}
          onOpenChange={(open) => {
            if (!open) setBuySellAsset(null);
          }}
          asset={buySellAsset}
          items={items}
          assetCurrencyToRubRateCents={
            buySellAsset.currency_code && buySellAsset.currency_code !== "RUB"
              ? (rateByCode[buySellAsset.currency_code] != null
                  ? rateByCode[buySellAsset.currency_code]! * 100
                  : undefined)
              : undefined
          }
          getCounterpartyForItemId={getCounterpartyForItemId}
          getBankLogoUrl={itemCounterpartyLogoUrl}
          getBankName={itemCounterpartyName}
          getItemBalance={getItemDisplayBalanceCents}
          itemCounts={itemTxCounts}
          onSuccess={async () => {
            await loadItems();
            await loadTransactions();
          }}
        />
      )}
    </main>
  );
}

