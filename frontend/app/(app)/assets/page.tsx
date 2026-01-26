"use client";

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
  MoreVertical,
  Package,
  Pencil,
  PiggyBank,
  Plus,
  Receipt,
  Trash2,
  TrendingUp,
  Users,
  Wallet,
  LineChart,
  Info,
} from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ItemSelector } from "@/components/item-selector";
import { CounterpartySelector } from "@/components/counterparty-selector";
import { useAccountingStart } from "@/components/accounting-start-context";
import { useOnboarding } from "@/components/onboarding-context";
import { FilterPanel, FilterSection } from "@/components/filter-panel";
import { AssetCard } from "@/components/asset-card";
import { AuthInput } from "@/components/ui/auth-input";
import { SegmentedSelector } from "@/components/ui/segmented-selector";
import { useSidebar } from "@/components/ui/sidebar-context";
import { TextField, DateField, SelectField } from "@/components/ui/form-field";
import { ACCENT, PLACEHOLDER_COLOR_DARK, ACTIVE_TEXT_DARK, SIDEBAR_TEXT_ACTIVE, SIDEBAR_TEXT_INACTIVE, DROPDOWN_BG, MODAL_BG, BACKGROUND_DT } from "@/lib/colors";
import { cn } from "@/lib/utils";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  createItem,
  updateItem,
  archiveItem,
  closeItem,
  CardKind,
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
  TransactionChainFrequency,
  TransactionChainMonthlyRule,
  FirstPayoutRule,
  RepaymentType,
  PaymentAmountKind,
} from "@/lib/api";
import { buildItemTransactionCounts, getEffectiveItemKind, formatAmount } from "@/lib/item-utils";
import { buildCounterpartyTransactionCounts } from "@/lib/counterparty-utils";
import { getItemTypeLabel, ITEM_TYPE_LABELS } from "@/lib/item-types";


/* ------------------ справочники ------------------ */

const ASSET_TYPES = [
  { code: "cash", label: "Наличные" },
  { code: "bank_account", label: "Банковский счёт" },
  { code: "bank_card", label: "Банковская карта" },
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
  { code: "third_party_receivables", label: "Долги третьих лиц" },
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
  { code: "third_party_payables", label: "Долги третьим лицам" },
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

// Категории активов
const CASH_TYPES = ["cash", "bank_account", "bank_card", "savings_account", "e_wallet", "brokerage"];
const INVESTMENT_TYPES = [
  "deposit",
  "securities",
  "bonds",
  "etf",
  "bpif",
  "pif",
  "iis",
  "precious_metals",
  "crypto",
];
const MOEX_TYPE_CODES = [
  "securities",
  "bonds",
  "etf",
  "bpif",
  "pif",
  "precious_metals",
];
const THIRD_PARTY_DEBT_TYPES = ["loan_to_third_party", "third_party_receivables"];
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
const THIRD_PARTY_LOAN_TYPES = ["private_loan", "third_party_payables"];
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
  "bank_card",
  "deposit",
  "savings_account",
  "consumer_loan",
  "mortgage",
  "car_loan",
  "education_loan",
  "loan_to_third_party",
  "third_party_receivables",
  "private_loan",
  "third_party_payables",
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
  "bank_card",
  "deposit",
  "savings_account",
  "brokerage",
  "consumer_loan",
  "mortgage",
  "car_loan",
  "education_loan",
];

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
  "third_party_receivables",
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
    label: "Займы от третьих лиц",
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
  third_party_receivables: Users,
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
  third_party_payables: Users,
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

const CURRENCY_BADGE_CLASSES: Record<string, string> = {
  RUB: "bg-[#C46A2F]/20 text-[#C46A2F]",
  USD: "bg-[#2E7D32]/20 text-[#2E7D32]",
  EUR: "bg-[#003399]/20 text-[#003399]",
  JPY: "bg-[#BC002D]/20 text-[#BC002D]",
  CNY: "bg-[#DE2910]/20 text-[#DE2910]",
};

function getCurrencyBadgeClass(code: string) {
  return CURRENCY_BADGE_CLASSES[code] ?? "bg-muted/20 text-slate-600";
}

function formatRub(valueInCents: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
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
  return formatAmount(chain.amount_rub);
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

export default function Page() {
  const { data: session } = useSession();
  const { accountingStartDate } = useAccountingStart();
  const { activeStep, isWizardOpen } = useOnboarding();

  const [items, setItems] = useState<ItemOut[]>([]);
  const [currencies, setCurrencies] = useState<CurrencyOut[]>([]);
  const [fxRates, setFxRates] = useState<FxRateOut[]>([]);
  const [txs, setTxs] = useState<TransactionOut[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  // Filter states
  const [filterType, setFilterType] = useState<Set<string>>(new Set());
  const [filterStatus, setFilterStatus] = useState<Set<string>>(new Set(["active"]));
  const [filterName, setFilterName] = useState("");
  const [filterAmountFrom, setFilterAmountFrom] = useState("");
  const [filterAmountTo, setFilterAmountTo] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterCounterpartyIds, setFilterCounterpartyIds] = useState<number[]>([]);
  const [filterTypeCodes, setFilterTypeCodes] = useState<Set<string>>(new Set());
  const [filterCurrencyCodes, setFilterCurrencyCodes] = useState<Set<string>>(new Set());
  const [isCurrencyFilterOpen, setIsCurrencyFilterOpen] = useState(false);
  const [isTypeCodeFilterOpen, setIsTypeCodeFilterOpen] = useState(false);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ItemOut | null>(null);
  const [isGeneralCreate, setIsGeneralCreate] = useState(false);
  const [sectionId, setSectionId] = useState("");

  const [closeItemDialogOpen, setCloseItemDialogOpen] = useState(false);
  const [closingItem, setClosingItem] = useState<ItemOut | null>(null);
  const [closingDate, setClosingDate] = useState(() => getTodayDateKey());
  const [closeTransferItemId, setCloseTransferItemId] = useState<string>("");
  const [closeWriteOff, setCloseWriteOff] = useState(false);

  const [kind, setKind] = useState<ItemKind>("ASSET");
  const [allowedTypeCodes, setAllowedTypeCodes] = useState<string[]>(CASH_TYPES);
  const [typeCode, setTypeCode] = useState("");
  const [currencyCode, setCurrencyCode] = useState("RUB");
  const [name, setName] = useState("");
  const [amountStr, setAmountStr] = useState(""); // строка: "1234.56" / "1 234,56"
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
  const [moexPurchasePrice, setMoexPurchasePrice] = useState("");
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
  const [linkedChains, setLinkedChains] = useState<TransactionChainOut[]>([]);
  const [originalPlanSignature, setOriginalPlanSignature] = useState<string | null>(null);
  const [logoOverlayHeight, setLogoOverlayHeight] = useState(0);
  const logoNaturalSizeRef = useRef<{ width: number; height: number } | null>(null);
  const dialogContentRef = useRef<HTMLDivElement | null>(null);
  const onboardingAppliedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isWizardOpen) {
      onboardingAppliedRef.current = null;
    }
  }, [isWizardOpen]);
  const isEditing = Boolean(editingItem);
  const segmentedButtonBase =
    "flex-1 min-w-0 rounded-full px-3 py-2 text-sm font-medium text-center whitespace-nowrap transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 flex items-center justify-center";

  function resetCreateForm() {
    setName("");
    setAmountStr("");
    setTypeCode("");
    setCurrencyCode("RUB");
    setCounterpartyId(null);
    setInstrumentQuery("");
    setInstrumentOptions([]);
    setInstrumentLoading(false);
    setInstrumentError(null);
    setInstrumentDropdownOpen(false);
    setSelectedInstrument(null);
    setInstrumentBoards([]);
    setInstrumentBoardId("");
    setPositionLots("");
    setMoexPurchasePrice("");
    setCommissionEnabled(false);
    setCommissionAmount("");
    setCommissionPaymentItemId("");
    setCommissionEnabled(false);
    setCommissionAmount("");
    setCommissionPaymentItemId("");
    setMarketPrice(null);
    setMoexDatePrices({});
    setMoexDatePricesLoading(false);
    setAccountLast7("");
    setContractNumber("");
    setOpenDate(getTodayDateKey());
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
    setLinkedChains([]);
    setOriginalPlanSignature(null);
    setSectionId("");
    setIsGeneralCreate(false);
  }

  function parseRubToCents(input: string): number {
    const normalized = input
      .trim()
      .replace(/\s/g, "")      // убираем пробелы-разделители
      .replace(",", ".");      // запятая -> точка
  
    const value = Number(normalized);
    if (!Number.isFinite(value)) return NaN;
  
    return Math.round(value * 100);
  }

  function formatRubInput(raw: string): string {
    if (!raw) return "";
    const trimmed = raw.trim();
    const isNegative = trimmed.startsWith("-");
  
    // оставляем только цифры и разделители
    const cleaned = trimmed.replace(/[^\d.,]/g, "");
    if (!cleaned) return isNegative ? "-" : "";
  
    // запоминаем: пользователь только что ввёл разделитель в конце
    const endsWithSep = /[.,]$/.test(cleaned);
  
    // берём первую встреченную точку/запятую как разделитель
    const sepIndex = cleaned.search(/[.,]/);
  
    let intPart = "";
    let decPart = "";
  
    if (sepIndex === -1) {
      intPart = cleaned;
    } else {
      intPart = cleaned.slice(0, sepIndex);
      decPart = cleaned.slice(sepIndex + 1).replace(/[.,]/g, ""); // убираем лишние разделители
    }
  
    // если начали с ",5" → считаем как "0,5"
    if (sepIndex === 0) intPart = "0";
  
    // нормализуем целую часть (убираем лидирующие нули)
    intPart = intPart.replace(/^0+(?=\d)/, "");
    if (!intPart) intPart = "0";
  
    // форматируем целую часть с пробелами
    const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  
    // ограничиваем копейки
    const formattedDec = decPart.slice(0, 2);
  
    // если пользователь только что ввёл запятую, показываем её
    if (endsWithSep && formattedDec.length === 0) {
      const value = `${formattedInt},`;
      return isNegative ? `-${value}` : value;
    }
  
    const value =
      formattedDec.length > 0 ? `${formattedInt},${formattedDec}` : formattedInt;
    return isNegative ? `-${value}` : value;
  }  
  
  function normalizeRubOnBlur(value: string): string {
    const v = value.trim();
    if (!v) return "";
    const isNegative = v.startsWith("-");
    const absValue = isNegative ? v.slice(1).trim() : v;
    if (!absValue) return "";
  
    // если заканчивается запятой: "123," -> "123,00"
    if (absValue.endsWith(",")) {
      const result = `${absValue}00`;
      return isNegative ? `-${result}` : result;
    }
  
    const parts = absValue.split(",");
    const intPart = parts[0] || "0";
    const decPart = parts[1] ?? "";
  
    const normalized =
      decPart.length === 0
        ? `${intPart},00`
        : decPart.length === 1
        ? `${intPart},${decPart}0`
        : `${intPart},${decPart.slice(0, 2)}`;
    if (isNegative && normalized !== "0,00") {
      return `-${normalized}`;
    }
    return normalized;
  
    // если больше 2 - обрежем
  }  

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
        initialValue: item.initial_value_rub,
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
      if (item.type_code === "bank_card" && item.card_account_id) {
        const linked = itemsById.get(item.card_account_id);
        if (linked) return linked.current_value_rub;
      }
      return item.current_value_rub;
    },
    [itemsById]
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
    
    // Для обычных активов/обязательств используем текущее значение из БД
    const rate = rateByCode[item.currency_code];
    if (!rate) return null;
    const amount = Math.abs(getItemDisplayBalanceCents(item)) / 100;
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
    return base.filter((option) => allowed.has(option.code));
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
  const showBankAccountFields = useMemo(
    () => typeCode === "bank_account" || typeCode === "savings_account",
    [typeCode]
  );
  const showBankCardFields = useMemo(() => typeCode === "bank_card", [typeCode]);
  const isCreditCard = useMemo(
    () => showBankCardFields && cardKind === "CREDIT",
    [showBankCardFields, cardKind]
  );
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
  const openDateLabel = "\u0414\u0430\u0442\u0430 \u043f\u043e\u044f\u0432\u043b\u0435\u043d\u0438\u044f";
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
    (showBankCardFields && Boolean(cardAccountId)) || isMoexType;
  const showContractNumberField = useMemo(
    () =>
      typeCode === "bank_account" ||
      typeCode === "bank_card" ||
      typeCode === "deposit" ||
      typeCode === "savings_account",
    [typeCode]
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
    return counterparty.entity_type === "PERSON"
      ? counterparty.photo_url ?? null
      : counterparty.logo_url ?? null;
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
  const linkedCardsByAccountId = useMemo(() => {
    const map = new Map<number, ItemOut[]>();
    items.forEach((item) => {
      if (item.closed_at || item.archived_at) return;
      if (item.type_code !== "bank_card" || !item.card_account_id) return;
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
    resolvedHistoryStatus === "NEW" &&
    (isMoexType ? hasNonZeroLots : hasNonZeroAmount);
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
      ? "\u0410\u043a\u0442\u0438\u0432 \u0434\u043b\u044f \u0437\u0430\u0447\u0438\u0441\u043b\u0435\u043d\u0438\u044f"
      : "\u0410\u043a\u0442\u0438\u0432-\u0438\u0441\u0442\u043e\u0447\u043d\u0438\u043a \u0441\u0440\u0435\u0434\u0441\u0442\u0432";
  const openingHint =
    showOpeningCounterparty
      ? kind === "LIABILITY"
        ? "Если не выбрать актив, будет создана фактическая транзакция с категорией «Прочие расходы»."
        : "Если не выбрать актив, будет создана фактическая транзакция с категорией «Прочие доходы»."
      : null;
  const amountLabel = useMemo(() => {
    if (resolvedHistoryStatus === "HISTORICAL") {
      const dateLabel = accountingStartDate
        ? formatShortDate(accountingStartDate)
        : "";
      return dateLabel
        ? `Сумма на дату начала учета (${dateLabel})`
        : "Сумма на дату начала учета";
    }
    if (resolvedHistoryStatus === "NEW") {
      return "\u0421\u0443\u043c\u043c\u0430 \u043d\u0430 \u0434\u0430\u0442\u0443 \u043f\u043e\u044f\u0432\u043b\u0435\u043d\u0438\u044f";
    }
    return "Сумма";
  }, [resolvedHistoryStatus, accountingStartDate, kind]);
  const activeItemsForTotals = useMemo(
    () =>
      activeItems.filter(
        (item) => !(item.type_code === "bank_card" && item.card_account_id)
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
    () => filteredItems,
    [filteredItems]
  );
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
      if (!CASH_TYPES.includes(item.type_code)) return false;
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
    const imageUrl =
      selectedCounterparty.entity_type === "PERSON"
        ? selectedCounterparty.photo_url
        : selectedCounterparty.logo_url;
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
          (CREDIT_LIABILITY_TYPES.includes(x.type_code) || x.type_code === "bank_card")
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
            (CREDIT_LIABILITY_TYPES.includes(x.type_code) || x.type_code === "bank_card")
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
    if (session) {
      loadItems();
      loadTransactions();
      loadCurrencies();
      loadFxRates();
      loadCounterparties();
    }
  }, [session]);

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
    if (cardKind !== "DEBIT") setCardKind("DEBIT");
    if (creditLimit) setCreditLimit("");
  }, [showBankCardFields, cardLast4, cardAccountId, cardKind, creditLimit]);

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
    if (cardKind !== "DEBIT") return;
    if (creditLimit) setCreditLimit("");
  }, [showBankCardFields, cardKind, creditLimit]);
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
    const imageUrl =
      selectedCounterparty.entity_type === "PERSON"
        ? selectedCounterparty.photo_url
        : selectedCounterparty.logo_url;
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
    if (!isMoexType) {
      setInstrumentOptions([]);
      setInstrumentQuery("");
      setInstrumentError(null);
      setSelectedInstrument(null);
      setInstrumentBoards([]);
      setInstrumentBoardId("");
      setPositionLots("");
      setMoexPurchasePrice("");
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
  }, [instrumentQuery, isMoexType, typeCode]);

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
          !data.boards.some((board) => board.board_id === instrumentBoardId)
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
    setIsGeneralCreate(Boolean(options?.general));
    setSectionId(options?.sectionId ?? "");
    setKind(nextKind);
    setAllowedTypeCodes(nextTypeCodes);
    setTypeCode("");
    setCurrencyCode("RUB");
    setName("");
    setAmountStr("");
    setCounterpartyId(null);
    setInstrumentQuery("");
    setInstrumentOptions([]);
    setInstrumentLoading(false);
    setInstrumentError(null);
    setInstrumentDropdownOpen(false);
    setSelectedInstrument(null);
    setInstrumentBoards([]);
    setInstrumentBoardId("");
    setPositionLots("");
    setMoexPurchasePrice("");
    setMarketPrice(null);
    setMoexDatePrices({});
    setMoexDatePricesLoading(false);
    setAccountLast7("");
    setContractNumber("");
    setOpenDate(getTodayDateKey());
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
    setLinkedChains([]);
    setOriginalPlanSignature(null);
    setFormError(null);
    setIsCreateOpen(true);
  };

  useEffect(() => {
    if (!isWizardOpen || activeStep?.key !== "assets") return;
    if (!accountingStartDate) return;
    if (onboardingAppliedRef.current === "assets") return;
    onboardingAppliedRef.current = "assets";
    openCreateModal("ASSET", CASH_TYPES);
    setKind("ASSET");
    setTypeCode("cash");
    setCurrencyCode("RUB");
    setName("Наличные");
    setAmountStr("50 000");
    setOpenDate(accountingStartDate);
  }, [
    accountingStartDate,
    activeStep?.key,
    isWizardOpen,
    openCreateModal,
  ]);

  const openEditModal = (item: ItemOut) => {
    setEditingItem(item);
    setIsGeneralCreate(false);
    setSectionId("");
    setKind(item.kind);
    setAllowedTypeCodes(item.kind === "ASSET" ? ASSET_TYPE_CODES : LIABILITY_TYPE_CODES);
    setTypeCode(item.type_code);
    setCurrencyCode(item.currency_code);
    setName(item.name);
    setAmountStr(formatAmount(item.initial_value_rub));
    setCounterpartyId(item.counterparty_id);
    setInstrumentQuery(
      item.instrument_id ? `${item.instrument_id} - ${item.name ?? ""}`.trim() : ""
    );
    setInstrumentOptions([]);
    setInstrumentLoading(false);
    setInstrumentError(null);
    if (item.instrument_id) {
      setSelectedInstrument({
        secid: item.instrument_id,
        provider: "MOEX",
        isin: null,
        short_name: item.name,
        name: item.name,
        type_code: item.type_code,
        engine: null,
        market: null,
        default_board_id: item.instrument_board_id,
        currency_code: item.currency_code,
        lot_size: item.lot_size,
        face_value_cents: item.face_value_cents,
        is_traded: null,
      });
      setInstrumentBoardId(item.instrument_board_id ?? "");
    } else {
      setSelectedInstrument(null);
      setInstrumentBoardId("");
    }
    setInstrumentBoards([]);
    setMarketPrice(null);
    setAccountLast7(item.account_last7 ?? "");
    setContractNumber(item.contract_number ?? "");
    setOpenDate(item.open_date ?? "");
    setCardLast4(item.card_last4 ?? "");
    setCardAccountId(item.card_account_id ? String(item.card_account_id) : "");
    setCardKind(item.card_kind ?? "DEBIT");
    setCreditLimit(item.credit_limit != null ? formatAmount(item.credit_limit) : "");
    setDepositTermDays(item.deposit_term_days != null ? String(item.deposit_term_days) : "");
    setPositionLots(item.position_lots != null ? String(item.position_lots) : "");
    setMoexPurchasePrice("");
    if (item.instrument_id && item.history_status === "NEW") {
      const commissionTx = txs.find(
        (tx) => tx.linked_item_id === item.id && tx.source === "AUTO_ITEM_COMMISSION"
      );
      if (commissionTx) {
        setCommissionEnabled(true);
        setCommissionAmount(formatAmount(commissionTx.amount_rub));
        setCommissionPaymentItemId(String(commissionTx.primary_item_id));
      } else {
        setCommissionEnabled(false);
        setCommissionAmount("");
        setCommissionPaymentItemId("");
      }
    } else {
      setCommissionEnabled(false);
      setCommissionAmount("");
      setCommissionPaymentItemId("");
    }
    setInterestRate(
      item.interest_rate != null ? String(item.interest_rate).replace(".", ",") : ""
    );
    setInterestPayoutOrder(item.interest_payout_order ?? "");
    setInterestCapitalization(
      item.interest_capitalization == null
        ? ""
        : item.interest_capitalization
        ? "true"
        : "false"
    );
    setInterestPayoutAccountId(
      item.interest_payout_account_id ? String(item.interest_payout_account_id) : ""
    );
    const planSettings = item.plan_settings ?? null;
    setPlanEnabled(planSettings?.enabled ?? false);
    setFirstPayoutRule(planSettings?.first_payout_rule ?? "");
    setPlanEndDate(planSettings?.plan_end_date ?? "");
    setLoanEndDate(planSettings?.loan_end_date ?? "");
    setRepaymentFrequency(planSettings?.repayment_frequency ?? "MONTHLY");
    setRepaymentWeeklyDay(
      planSettings?.repayment_weekly_day ?? (new Date().getDay() + 6) % 7
    );
    setRepaymentIntervalDays(
      planSettings?.repayment_interval_days != null
        ? String(planSettings.repayment_interval_days)
        : "1"
    );
    setRepaymentAccountId(
      planSettings?.repayment_account_id != null
        ? String(planSettings.repayment_account_id)
        : ""
    );
    setRepaymentType(planSettings?.repayment_type ?? "");
    setPaymentAmountKind(planSettings?.payment_amount_kind ?? "");
    setPaymentAmountStr(
      planSettings?.payment_amount_rub != null
        ? formatAmount(planSettings.payment_amount_rub)
        : ""
    );
    setOpeningCounterpartyId(
      item.opening_counterparty_item_id != null
        ? String(item.opening_counterparty_item_id)
        : ""
    );
    setOriginalPlanSignature(buildPlanSignatureFromItem(item));
    loadLinkedChains(item.id);
    setFormError(null);
    setIsCreateOpen(true);
  };

  async function onCreate(e: React.FormEvent) {
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
          setFormError(
            "\u0426\u0435\u043d\u0430 \u043f\u043e\u043a\u0443\u043f\u043a\u0438 \u0434\u043e\u043b\u0436\u043d\u0430 \u0431\u044b\u0442\u044c \u0447\u0438\u0441\u043b\u043e\u043c (\u043d\u0430\u043f\u0440\u0438\u043c\u0435\u0440: 123,45)."
          );
          return;
        }
      }
      if (commissionEnabled) {
        if (!commissionAllowed) {
          setFormError(
            "\u041a\u043e\u043c\u0438\u0441\u0441\u0438\u044e \u043c\u043e\u0436\u043d\u043e \u0443\u043a\u0430\u0437\u0430\u0442\u044c \u0442\u043e\u043b\u044c\u043a\u043e \u043f\u0440\u0438 \u043a\u043e\u043b\u0438\u0447\u0435\u0441\u0442\u0432\u0435 \u043b\u043e\u0442\u043e\u0432 \u0431\u043e\u043b\u044c\u0448\u0435 0."
          );
          return;
        }
        if (!commissionPaymentItemId) {
          setFormError(
            "\u0423\u043a\u0430\u0436\u0438\u0442\u0435 \u0441\u0447\u0435\u0442 \u043e\u043f\u043b\u0430\u0442\u044b \u043a\u043e\u043c\u0438\u0441\u0441\u0438\u0438."
          );
          return;
        }
        if (!commissionAmountCents || commissionAmountCents <= 0) {
          setFormError(
            "\u0421\u0443\u043c\u043c\u0430 \u043a\u043e\u043c\u0438\u0441\u0441\u0438\u0438 \u0434\u043e\u043b\u0436\u043d\u0430 \u0431\u044b\u0442\u044c \u0431\u043e\u043b\u044c\u0448\u0435 0."
          );
          return;
        }
        const paymentItem = itemsById.get(Number(commissionPaymentItemId));
        if (!paymentItem || paymentItem.archived_at || paymentItem.closed_at) {
          setFormError(
            "\u0421\u0447\u0435\u0442 \u043e\u043f\u043b\u0430\u0442\u044b \u043a\u043e\u043c\u0438\u0441\u0441\u0438\u0438 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d."
          );
          return;
        }
        if (paymentItem.instrument_id) {
          setFormError(
            "\u041e\u043f\u043b\u0430\u0442\u0430 \u043a\u043e\u043c\u0438\u0441\u0441\u0438\u0438 \u0434\u043e\u043b\u0436\u043d\u0430 \u0431\u044b\u0442\u044c \u0441 \u043d\u0435-MOEX \u0441\u0447\u0435\u0442\u0430."
          );
          return;
        }
      }
    }

    const todayKey = getTodayDateKey();
    if (!openDate) {
      setFormError("\u0423\u043a\u0430\u0436\u0438\u0442\u0435 \u0434\u0430\u0442\u0443 \u043f\u043e\u044f\u0432\u043b\u0435\u043d\u0438\u044f.");
      return;
    }
    if (openDate > todayKey) {
      setFormError("\u0414\u0430\u0442\u0430 \u043f\u043e\u044f\u0432\u043b\u0435\u043d\u0438\u044f \u043d\u0435 \u043c\u043e\u0436\u0435\u0442 \u0431\u044b\u0442\u044c \u043f\u043e\u0437\u0434\u043d\u0435\u0435 \u0441\u0435\u0433\u043e\u0434\u043d\u044f\u0448\u043d\u0435\u0439 \u0434\u0430\u0442\u044b.");
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
      if (!openDate) {
        setFormError("Дата появления вклада обязательна при заполнении срока вклада.");
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

    const amountValue = hideInitialAmountField
      ? amountStr.trim() || "0"
      : amountStr;
    const cents = isMoexType ? moexInitialValueCents ?? NaN : parseRubToCents(amountValue);
      if (isMoexType && moexInitialValueCents == null) {
        setFormError("\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0440\u0430\u0441\u0441\u0447\u0438\u0442\u0430\u0442\u044c \u0441\u0443\u043c\u043c\u0443 \u043f\u043e \u0442\u0435\u043a\u0443\u0449\u0435\u0439 \u0446\u0435\u043d\u0435.");
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
      const payload: ItemCreate = {
        kind,
        type_code: typeCode,
        name: name.trim(),
        currency_code: currencyCode,
        counterparty_id: showCounterpartyField ? counterpartyId : null,
        open_date: openDate,
        opening_counterparty_item_id: openingCounterpartyValue,
        initial_value_rub: cents,
      };

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
        const nextPlanSignature = buildPlanSignatureFromState();
        const wasPlanEnabled = editingItem.plan_settings?.enabled ?? false;
        if (originalPlanSignature && nextPlanSignature !== originalPlanSignature) {
          if (wasPlanEnabled && planEnabled) {
            const confirmed = window.confirm(
              "Параметры плана изменились. Плановые транзакции будут перестроены, а нереализованные удалены. Продолжить?"
            );
            if (!confirmed) {
              setLoading(false);
              return;
            }
          }
          if (wasPlanEnabled && !planEnabled) {
            const confirmed = window.confirm(
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
          const confirmed = window.confirm(
            "Все транзакции по карте будут удалены и карта будет привязана к счету. Продолжить?"
          );
          if (!confirmed) {
            setLoading(false);
            return;
          }
        }
        await updateItem(
          editingItem.id,
          payload,
          isCardLinkChange ? { purgeCardTransactions: true } : undefined
        );
      } else {
        await createItem(payload);
      }
  
      // очищаем форму и закрываем модалку
      setName("");
      setAmountStr("");
      setIsCreateOpen(false);
      setEditingItem(null);
  
      await loadItems();
      await loadTransactions();
    } catch (e: any) {
      setFormError(e?.message ?? "Ошибка создания");
    } finally {
      setLoading(false);
    }
  }
  
  async function onArchive(item: ItemOut) {
    setLoading(true);
    setError(null);
    try {
      if (item.plan_settings?.enabled) {
        const confirmed = window.confirm(
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
      return item.type_code !== "bank_card" && item.current_value_rub !== 0;
    }
  }

  async function onClose(item: ItemOut) {
    setError(null);
    
    const hasBalance = hasNonZeroBalance(item);
    
    if (hasBalance) {
      setClosingItem(item);
      setClosingDate(getTodayDateKey());
      setCloseTransferItemId("");
      setCloseWriteOff(false);
      setCloseItemDialogOpen(true);
      return;
    }
    
    // Если баланс нулевой, продолжаем как раньше
    setLoading(true);
    try {
      if (item.type_code === "bank_account") {
        const linkedCards = linkedCardsByAccountId.get(item.id) ?? [];
        if (linkedCards.length > 0) {
          const confirmed = window.confirm(
            "К счету привязаны активные карты. Закрыть счет вместе с привязанными картами?"
          );
          if (!confirmed) {
            setLoading(false);
            return;
          }
          await closeItem(item.id, { closeCards: true });
        } else {
          await closeItem(item.id);
        }
      } else {
        await closeItem(item.id);
      }
      await loadItems();
    } catch (e: any) {
      setError(e?.message ?? "Не удалось закрыть счет");
    } finally {
      setLoading(false);
    }
  }

  async function onConfirmClose() {
    if (!closingItem) return;
    
    setLoading(true);
    setError(null);
    try {
      const payload: any = {
        closing_date: closingDate,
      };
      
      if (closeWriteOff) {
        payload.write_off = true;
      } else if (closeTransferItemId) {
        payload.transfer_to_item_id = Number(closeTransferItemId);
      } else {
        setError("Выберите способ обработки остатка: перевод или списание");
        setLoading(false);
        return;
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
      setError(e?.message ?? "Не удалось закрыть счет");
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
      if (item.type_code !== "bank_card" || !item.card_account_id) return;
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
                  const rubEquivalent = getRubEquivalentCents(it);
                  const displayBalanceCents = getItemDisplayBalanceCents(it);
                  const currencyCode = it.currency_code || "";
                  const counterparty = it.counterparty_id ? counterpartiesById.get(it.counterparty_id) ?? null : null;
                  const counterpartyLogoUrl =
                    counterparty?.entity_type === "PERSON"
                      ? counterparty?.photo_url ?? null
                      : counterparty?.logo_url ?? null;
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
                  const isLinkedCard = it.type_code === "bank_card" && Boolean(it.card_account_id);
                  const canEdit = !isArchived && !isClosed;
                  const canClose = !isArchived && !isClosed;
                  const canDelete = !isArchived;
                  const linkedAccount =
                    it.type_code === "bank_card" && it.card_account_id
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
                              "mx-auto h-5 w-5 rounded object-contain bg-white",
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
                          "text-right font-semibold tabular-nums",
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
                          <span
                            className={[
                              "inline-flex min-w-10 items-center justify-center rounded-full px-1.5 py-[1px] text-[11px] font-semibold uppercase",
                              getCurrencyBadgeClass(currencyCode),
                              isArchived || isClosed ? "opacity-40" : "",
                            ].join(" ")}
                          >
                            {currencyCode}
                          </span>
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
                          "text-right font-semibold tabular-nums",
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
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className={[
                                "hover:bg-transparent",
                                isArchived
                                  ? "text-slate-400"
                                  : isClosed
                                  ? "text-slate-400"
                                  : "text-muted-foreground",
                              ].join(" ")}
                              aria-label="Открыть меню действий"
                              disabled={isArchived && !canDelete}
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem
                              onSelect={() => openEditModal(it)}
                              disabled={!canEdit}
                            >
                              <Pencil className="h-4 w-4" />
                              Редактировать
                            </DropdownMenuItem>
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
                      "text-right font-semibold tabular-nums",
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

  const { isCollapsed } = useSidebar();

  return (
    <main
      className={cn(
        "min-h-screen pb-8",
        isCollapsed ? "pl-0" : "pl-0"
      )}
    >
      <Dialog
        open={isCreateOpen}
        onOpenChange={(open) => {
          setIsCreateOpen(open);
          if (!open) {
            setFormError(null);
            resetCreateForm();
            setEditingItem(null);
          }
        }}
      >
        <DialogContent
          ref={dialogContentRef}
          className="max-h-[90vh] overflow-y-auto overflow-x-hidden sm:max-w-[1040px]"
          style={{ backgroundColor: MODAL_BG }}
        >
          <div className="grid gap-4">
            <DialogHeader>
              <DialogTitle>
                {isEditing
                  ? "Редактирование актива/обязательства"
                  : "Добавление актива/обязательства"}
              </DialogTitle>
            </DialogHeader>

            <form onSubmit={onCreate} noValidate className="grid gap-6">
            {formError && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3">
                {formError}
              </div>
            )}

            <div className="grid items-start gap-6 md:grid-cols-2">
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
                  setTypeCode("");
                }}
                options={sectionOptions.map((section) => ({
                  value: section.id,
                  label: section.label,
                }))}
                placeholder={
                  kind === "ASSET"
                    ? "Выберите раздел актива"
                    : "Выберите раздел обязательства"
                }
              />
            )}

            <SelectField
              label="Вид"
              value={typeCode}
              onValueChange={setTypeCode}
              disabled={isGeneralCreate && !sectionId}
              options={typeOptions.map((t) => ({
                value: t.code,
                label: t.label,
              }))}
              placeholder={
                isGeneralCreate && !sectionId ? "Сначала выберите раздел" : "Выберите вид"
              }
            />


            {isMoexType && (
              <div className="grid gap-3 rounded-lg border-2 border-border/70 p-3" style={{ backgroundColor: BACKGROUND_DT }}>
                <div className="grid gap-2">
                  <div className="flex items-center gap-2">
                    <Label style={{ color: ACTIVE_TEXT_DARK }}>Ценная бумага</Label>
                    <div className="group relative">
                      <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                      <div className="absolute left-0 top-6 z-50 hidden w-64 rounded-md border border-border/60 bg-white p-2 text-xs text-muted-foreground shadow-lg group-hover:block">
                        Поиск возможен по ISIN-коду, коду ценной бумаги, названию
                      </div>
                    </div>
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
                        style={instrumentDropdownStyle ?? {
                          position: "absolute",
                          top: "calc(100% + 4px)",
                          left: 0,
                          right: 0,
                          maxHeight: 256,
                          zIndex: 50,
                        }}
                      >
                        {/* Gradient border wrapper */}
                        <div className="relative rounded-lg">
                          {/* Stroke layer */}
                          <div
                            className="absolute inset-0 rounded-lg pointer-events-none z-0"
                            style={{
                              padding: "1px",
                              background: "linear-gradient(to right, #7C6CF1, #6C5DD7, #5544D1)",
                              WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
                              WebkitMaskComposite: "xor",
                              maskComposite: "exclude",
                              opacity: 1,
                            }}
                          />
                          {/* Inner container */}
                          <div className="relative rounded-lg p-1 z-10" style={{ backgroundColor: DROPDOWN_BG }}>
                            {instrumentLoading && (
                              <div className="px-2 py-1 text-sm" style={{ color: SIDEBAR_TEXT_INACTIVE }}>
                                Загружаем инструменты...
                              </div>
                            )}
                            {!instrumentLoading && instrumentError && (
                              <div className="px-2 py-1 text-sm text-red-600">{instrumentError}</div>
                            )}
                            {!instrumentLoading && !instrumentError && instrumentOptions.length === 0 && (
                              <div className="px-2 py-1 text-sm" style={{ color: SIDEBAR_TEXT_INACTIVE }}>
                                Ничего не найдено
                              </div>
                            )}
                            {!instrumentLoading &&
                              !instrumentError &&
                              instrumentOptions.map((option) => {
                                const title = option.short_name || option.name || option.secid;
                                const subtitle =
                                  option.name &&
                                  option.short_name &&
                                  option.name !== option.short_name
                                    ? option.name
                                    : null;
                                return (
                                  <button
                                    key={option.secid}
                                    type="button"
                                    className="flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors"
                                    style={{
                                      backgroundColor: "transparent",
                                      color: SIDEBAR_TEXT_ACTIVE,
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.backgroundColor = "rgba(108, 93, 215, 0.22)";
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.backgroundColor = "transparent";
                                    }}
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={() => {
                                      setSelectedInstrument(option);
                                      setInstrumentQuery(`${option.secid} - ${title}`);
                                      setInstrumentDropdownOpen(false);
                                    }}
                                  >
                                    <span className="text-sm font-normal" style={{ color: SIDEBAR_TEXT_ACTIVE }}>
                                      {option.secid} - {title}
                                    </span>
                                    {subtitle && (
                                      <span className="text-xs" style={{ color: SIDEBAR_TEXT_INACTIVE }}>
                                        {subtitle}
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                          </div>
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
                  options={instrumentBoards.map((board) => {
                    const boardLabel = board.title
                      ? `${board.board_id} - ${board.title}`
                      : board.board_id;
                    return {
                      value: board.board_id,
                      label: boardLabel,
                    };
                  })}
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
                    onChange={(e) => {
                      const formatted = formatRubInput(e.target.value);
                      setMoexPurchasePrice(formatted);
                    }}
                    onBlur={() =>
                      setMoexPurchasePrice((prev) => normalizeRubOnBlur(prev))
                    }
                    inputMode="decimal"
                    placeholder="Например: 123,45"
                  />
                )}
              </div>
            )}

            <TextField
              label="Название актива"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например: Кошелек / Ипотека"
            />

            {showCounterpartyField && (
              <div className="grid gap-2">
                <Label>{isBankCounterparty ? "Банк" : "Контрагент"}</Label>
                <CounterpartySelector
                  counterparties={counterparties}
                  selectedIds={counterpartyId ? [counterpartyId] : []}
                  onChange={(ids) => setCounterpartyId(ids[0] ?? null)}
                  selectionMode="single"
                  placeholder="Начните вводить название"
                  industries={industries}
                  disabled={counterpartyLoading}
                  counterpartyCounts={counterpartyTxCounts}
                  filterByIndustryId={
                    isBankCounterparty
                      ? industries.find((ind) => ind.name === "Банки")?.id ?? null
                      : null
                  }
                />
                {counterpartyError && (
                  <p className="text-xs text-red-600">{counterpartyError}</p>
                )}
              </div>
            )}

            {showBankCardFields && (
              <>
                <SelectField
                  label="Вид карты"
                  value={cardKind}
                  onValueChange={(value) => setCardKind(value as CardKind)}
                  disabled={isEditing}
                  options={[
                    { value: "DEBIT", label: "Дебетовая" },
                    { value: "CREDIT", label: "Кредитная" },
                  ]}
                  placeholder="Выберите вид карты"
                />

                {isCreditCard && (
                  <TextField
                    label="Кредитный лимит"
                    value={creditLimit}
                    onChange={(e) => {
                      const formatted = formatRubInput(e.target.value).replace(/^-/, "");
                      setCreditLimit(formatted);
                    }}
                    onBlur={() =>
                      setCreditLimit((prev) =>
                        normalizeRubOnBlur(prev.replace(/^-/, ""))
                      )
                    }
                    inputMode="decimal"
                    placeholder="Например: 120 000"
                  />
                )}
              </>
            )}

            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Label style={{ color: ACTIVE_TEXT_DARK }}>{openDateLabel}</Label>
                  <Tooltip
                    content={openDateHelpText}
                    contentClassName="w-80 max-w-[calc(100vw-2rem)]"
                  >
                    <span
                      className="text-muted-foreground"
                      aria-label="\u041f\u043e\u0434\u0441\u043a\u0430\u0437\u043a\u0430 \u043f\u043e \u0434\u0430\u0442\u0435 \u043f\u043e\u044f\u0432\u043b\u0435\u043d\u0438\u044f"
                    >
                      <Info className="h-4 w-4" />
                    </span>
                  </Tooltip>
                </div>
                {accountingStartDate && (
                  <button
                    type="button"
                    className="text-sm font-medium hover:underline"
                    style={{ color: ACCENT }}
                    onClick={() => setOpenDate(accountingStartDate)}
                  >
                    В дату начала учета
                  </button>
                )}
              </div>
              <DateField
                label=""
                value={openDate}
                onChange={(e) => setOpenDate(e.target.value)}
                max={getTodayDateKey()}
              />
              {resolvedHistoryStatus && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      resolvedHistoryStatus === "NEW"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-muted text-foreground"
                    }`}
                  >
                    {resolvedHistoryStatus === "NEW" ? "Новый" : "Исторический"}
                  </span>
                </div>
              )}
            </div>



            <SelectField
              label="Валюта"
              value={currencyCode}
              onValueChange={setCurrencyCode}
              disabled={currencies.length === 0}
              options={currencies.map((c) => ({
                value: c.iso_char_code,
                label: (
                  <div className="flex items-center gap-2">
                    <span
                      className={[
                        "inline-flex min-w-10 items-center justify-center rounded-full px-1.5 py-[1px] text-[11px] font-semibold uppercase",
                        getCurrencyBadgeClass(c.iso_char_code),
                      ].join(" ")}
                    >
                      {c.iso_char_code}
                    </span>
                    <span>{c.name}</span>
                  </div>
                ),
              }))}
              placeholder="Выберите валюту"
            />

            {!hideInitialAmountField && (
              <div className="grid gap-2">
                <TextField
                  label={amountLabel}
                  value={amountStr}
                  onChange={(e) => {
                    const formatted = formatRubInput(e.target.value);
                    setAmountStr(formatted);
                  }}
                  onBlur={() => setAmountStr((prev) => normalizeRubOnBlur(prev))}
                  inputMode="decimal"
                  placeholder="Укажите сумму"
                />
                {showLoanPlanSettings && (
                  <div className="text-xs text-muted-foreground">
                    Указывайте задолженность по основному долгу без процентов.
                  </div>
                )}
              </div>
            )}

            </div>
            <div className="grid content-start gap-4">
            {showMoexPricing && (
              <div className="rounded-lg border-2 border-border/70 p-3 text-sm" style={{ backgroundColor: BACKGROUND_DT }}>
                <div className="font-medium">
                  {"MOEX: \u0446\u0435\u043d\u044b \u0438 \u0441\u0442\u043e\u0438\u043c\u043e\u0441\u0442\u044c"}
                </div>
                {moexDatePricesLoading && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    {"\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430 \u043a\u043e\u0442\u0438\u0440\u043e\u0432\u043e\u043a..."}
                  </div>
                )}
                <table className="mt-2 w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="py-1 font-medium">{"\u0414\u0430\u0442\u0430"}</th>
                      <th className="py-1 text-right font-medium">{"\u0426\u0435\u043d\u0430"}</th>
                      <th className="py-1 text-right font-medium">{"\u0421\u0442\u043e\u0438\u043c\u043e\u0441\u0442\u044c"}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {showMoexStartDatePricing && accountingStartDate && (
                      <tr>
                        <td className="py-1 pr-2">
                          {"\u041d\u0430\u0447\u0430\u043b\u043e \u0443\u0447\u0435\u0442\u0430 ("}
                          {formatShortDate(accountingStartDate)}
                          {")"}
                        </td>
                        <td className="py-1 text-right tabular-nums">
                          {formatMoexPrice(moexStartDatePrice)}
                        </td>
                        <td className="py-1 text-right tabular-nums">
                          {formatMoexValue(moexStartDatePrice)}
                        </td>
                      </tr>
                    )}
                    {openDate && (
                      <tr>
                        <td className="py-1 pr-2">
                          {"\u0414\u0430\u0442\u0430 \u043f\u043e\u044f\u0432\u043b\u0435\u043d\u0438\u044f ("}
                          {formatShortDate(openDate)}
                          {")"}
                        </td>
                        <td className="py-1 text-right tabular-nums">
                          {formatMoexPrice(moexOpenDatePrice)}
                        </td>
                        <td className="py-1 text-right tabular-nums">
                          {formatMoexValue(moexOpenDatePrice)}
                        </td>
                      </tr>
                    )}
                    <tr>
                      <td className="py-1 pr-2">
                        {"\u0422\u0435\u043a\u0443\u0449\u0430\u044f ("}
                        {formatShortDate(getTodayDateKey())}
                        {")"}
                      </td>
                      <td className="py-1 text-right tabular-nums">
                        {formatMoexPrice(marketPrice)}
                      </td>
                      <td className="py-1 text-right tabular-nums">
                        {formatMoexValue(marketPrice)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
            {showMoexCommission && (
              <div className="rounded-lg border-2 border-border/70 p-3 text-sm" style={{ backgroundColor: BACKGROUND_DT }}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 font-medium">
                    {"\u041a\u043e\u043c\u0438\u0441\u0441\u0438\u044f \u043f\u0440\u0438 \u043f\u043e\u043a\u0443\u043f\u043a\u0435"}
                    <Tooltip content="Создать фактическую транзакцию по оплате комиссии за покупку ценной бумаги">
                      <span
                        className="text-muted-foreground"
                        aria-label="\u041f\u043e\u0434\u0441\u043a\u0430\u0437\u043a\u0430 \u043f\u043e \u043a\u043e\u043c\u0438\u0441\u0441\u0438\u0438"
                      >
                        <Info className="h-4 w-4" />
                      </span>
                    </Tooltip>
                  </div>
                  <Switch
                    checked={commissionEnabled}
                    onCheckedChange={setCommissionEnabled}
                  />
                </div>
                    {commissionEnabled && (
                      <div className="mt-3 grid gap-2">
                        <TextField
                          label="Сумма комиссии"
                          value={commissionAmount}
                          onChange={(e) => {
                            const formatted = formatRubInput(e.target.value);
                            setCommissionAmount(formatted);
                          }}
                          onBlur={() =>
                            setCommissionAmount((prev) => normalizeRubOnBlur(prev))
                          }
                          inputMode="decimal"
                          placeholder="Например: 1 234,56"
                        />
                    <div className="grid gap-2">
                      <Label>
                        {"\u0421\u0447\u0435\u0442 \u043e\u043f\u043b\u0430\u0442\u044b \u043a\u043e\u043c\u0438\u0441\u0441\u0438\u0438"}
                      </Label>
                      <ItemSelector
                        items={commissionPaymentItems}
                        selectedIds={
                          commissionPaymentItemId
                            ? [Number(commissionPaymentItemId)]
                            : []
                        }
                        onChange={(ids) => {
                          const nextId = ids[0] ?? null;
                          setCommissionPaymentItemId(nextId ? String(nextId) : "");
                        }}
                        selectionMode="single"
                        placeholder={"\u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u0430\u043a\u0442\u0438\u0432/\u043e\u0431\u044f\u0437\u0430\u0442\u0435\u043b\u044c\u0441\u0442\u0432\u043e"}
                        clearLabel={"\u041d\u0435 \u0432\u044b\u0431\u0440\u0430\u043d\u043e"}
                        getItemTypeLabel={getItemTypeLabel}
                        getItemKind={resolveItemEffectiveKind}
                        getItemBalance={getItemDisplayBalanceCents}
                        getBankLogoUrl={itemCounterpartyLogoUrl}
                        getBankName={itemCounterpartyName}
                        itemCounts={itemTxCounts}
                        ariaLabel={"\u0421\u0447\u0435\u0442 \u043e\u043f\u043b\u0430\u0442\u044b \u043a\u043e\u043c\u0438\u0441\u0441\u0438\u0438"}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
            {showBankAccountFields && (
              <TextField
                label="Последние 7 цифр номера счета"
                value={accountLast7}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, "").slice(0, 7);
                  setAccountLast7(digits);
                }}
                inputMode="numeric"
                maxLength={7}
                placeholder="Например: 1234567"
              />
            )}

            {showBankCardFields && (
              <>
                <TextField
                  label="Последние 4 цифры номера карты"
                  value={cardLast4}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "").slice(0, 4);
                    setCardLast4(digits);
                  }}
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="Например: 1234"
                />

                {!isCreditCard && (
                  <div className="grid gap-2">
                    <Label>Привязка карты к банковскому счету</Label>
                    <ItemSelector
                      items={bankAccountItems}
                      selectedIds={cardAccountId ? [Number(cardAccountId)] : []}
                      onChange={(ids) => {
                        const nextId = ids[0] ?? null;
                        if (!nextId) {
                          setCardAccountId("");
                          return;
                        }
                        setCardAccountId(String(nextId));
                        const account = itemsById.get(nextId);
                        if (account) {
                          setCurrencyCode(account.currency_code ?? "RUB");
                          setCounterpartyId(account.counterparty_id ?? null);
                        }
                      }}
                      selectionMode="single"
                      placeholder="Выберите счет"
                      clearLabel="Не выбрано"
                      getItemTypeLabel={getItemTypeLabel}
                      getItemKind={resolveItemEffectiveKind}
                      getItemBalance={getItemDisplayBalanceCents}
                      getBankLogoUrl={itemCounterpartyLogoUrl}
                      getBankName={itemCounterpartyName}
                      itemCounts={itemTxCounts}
                      ariaLabel="Привязка карты к банковскому счету"
                    />
                  </div>
                )}
              </>
            )}

            {showContractNumberField && (
              <TextField
                label="Номер договора"
                value={contractNumber}
                onChange={(e) => setContractNumber(e.target.value)}
                placeholder="Например: 01-2025/123"
              />
            )}

            {showDepositFields && (
              <div className="grid gap-2">
                <TextField
                  label="Срок вклада в днях"
                  value={depositTermDays}
                  onChange={(e) => setDepositTermDays(e.target.value.replace(/\D/g, ""))}
                  inputMode="numeric"
                  placeholder="Например: 365"
                />
                <div className="text-sm text-muted-foreground">
                  {depositEndDateText
                    ? `Дата окончания: ${depositEndDateText}`
                    : "Дата окончания: —"}
                </div>
              </div>
            )}

            {showInterestFields && (
              <>
                <TextField
                  label="Процентная ставка"
                  value={interestRate}
                  onChange={(e) => setInterestRate(e.target.value.replace(/[^\d.,]/g, ""))}
                  inputMode="decimal"
                  placeholder="Например: 8,5"
                />

                <SelectField
                  label="Порядок выплаты процентов"
                  value={interestPayoutOrder || "__none"}
                  onValueChange={(value) =>
                    setInterestPayoutOrder(value === "__none" ? "" : value)
                  }
                  options={[
                    { value: "__none", label: "Не выбрано" },
                    { value: "END_OF_TERM", label: "В конце срока" },
                    { value: "MONTHLY", label: "Ежемесячно" },
                  ]}
                  placeholder="Выберите вариант"
                />

                <SelectField
                  label="Капитализация процентов"
                  value={interestCapitalization || "__none"}
                  onValueChange={(value) =>
                    setInterestCapitalization(value === "__none" ? "" : value)
                  }
                  options={[
                    { value: "__none", label: "Не выбрано" },
                    { value: "true", label: "Да" },
                    { value: "false", label: "Нет" },
                  ]}
                  placeholder="Выберите вариант"
                />

                {interestCapitalization !== "true" && (
                  <div className="grid gap-2">
                    <Label>Счет выплаты процентов</Label>
                    <ItemSelector
                      items={interestPayoutItems}
                      selectedIds={
                        interestPayoutAccountId ? [Number(interestPayoutAccountId)] : []
                      }
                      onChange={(ids) => {
                        const nextId = ids[0] ?? null;
                        setInterestPayoutAccountId(nextId ? String(nextId) : "");
                      }}
                      selectionMode="single"
                      placeholder="Выберите актив"
                      clearLabel="Не выбрано"
                      getItemTypeLabel={getItemTypeLabel}
                      getItemKind={resolveItemEffectiveKind}
                      getItemBalance={getItemDisplayBalanceCents}
                      getBankLogoUrl={itemCounterpartyLogoUrl}
                      getBankName={itemCounterpartyName}
                      itemCounts={itemTxCounts}
                      ariaLabel="Счет выплаты процентов"
                    />
                  </div>
                )}
              </>
            )}

            {showPlanSection && (
              <div className={`rounded-lg border-2 border-border/70 bg-white ${planEnabled ? 'p-4 grid gap-4' : 'p-4 self-start'}`}>
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="text-sm font-medium">Плановые транзакции</div>
                  </div>
                  <Switch
                    checked={planEnabled}
                    onCheckedChange={setPlanEnabled}
                  />
                </div>
                {planEnabled && (
                  <>
                    {showInterestPlanSettings && (
                      <>
                        {interestPayoutOrder === "MONTHLY" && (
                          <SelectField
                            label="Правило первой выплаты"
                            value={firstPayoutRule || "__none"}
                            onValueChange={(value) =>
                              setFirstPayoutRule(
                                value === "__none" ? "" : (value as FirstPayoutRule)
                              )
                            }
                            options={[
                              { value: "__none", label: "Не выбрано" },
                              { value: "OPEN_DATE", label: "В дату открытия" },
                              { value: "MONTH_END", label: "В конце месяца" },
                              { value: "SHIFT_ONE_MONTH", label: "В конце следующего месяца" },
                            ]}
                            placeholder="Выберите правило"
                          />
                        )}
                        {typeCode === "savings_account" && (
                          <DateField
                            label="Дата окончания планирования"
                            value={planEndDate}
                            min={minPlanDate || undefined}
                            onChange={(e) => setPlanEndDate(e.target.value)}
                          />
                        )}
                      </>
                    )}
                    {showLoanPlanSettings && (
                      <>
                        <div className="grid gap-2">
                          <Label>Счет погашения</Label>
                          <ItemSelector
                            items={repaymentAccountItems}
                            selectedIds={repaymentAccountId ? [Number(repaymentAccountId)] : []}
                            onChange={(ids) => {
                              const nextId = ids[0] ?? null;
                              setRepaymentAccountId(nextId ? String(nextId) : "");
                            }}
                            selectionMode="single"
                            placeholder="Выберите актив"
                            clearLabel="Не выбрано"
                            getItemTypeLabel={getItemTypeLabel}
                            getItemKind={resolveItemEffectiveKind}
                            getItemBalance={getItemDisplayBalanceCents}
                            getBankLogoUrl={itemCounterpartyLogoUrl}
                            getBankName={itemCounterpartyName}
                            itemCounts={itemTxCounts}
                            ariaLabel="Счет погашения"
                          />
                        </div>
                        <SelectField
                          label="Частота выплат"
                          value={repaymentFrequency}
                          onValueChange={(value) =>
                            setRepaymentFrequency(value as TransactionChainFrequency)
                          }
                          options={[
                            { value: "DAILY", label: "Ежедневно" },
                            { value: "WEEKLY", label: "Еженедельно" },
                            { value: "MONTHLY", label: "Ежемесячно" },
                            { value: "REGULAR", label: "Регулярно" },
                          ]}
                          placeholder="Выберите вариант"
                        />
                        {repaymentFrequency === "WEEKLY" && (
                          <SelectField
                            label="День недели"
                            value={String(repaymentWeeklyDay)}
                            onValueChange={(value) => setRepaymentWeeklyDay(Number(value))}
                            options={WEEKDAY_LABELS.map((label, index) => ({
                              value: String(index),
                              label,
                            }))}
                            placeholder="Выберите день"
                          />
                        )}
                        {repaymentFrequency === "REGULAR" && (
                          <TextField
                            label="Интервал, дней"
                            value={repaymentIntervalDays}
                            onChange={(e) =>
                              setRepaymentIntervalDays(e.target.value.replace(/\D/g, ""))
                            }
                            inputMode="numeric"
                            placeholder="Например: 30"
                          />
                        )}
                        {repaymentFrequency === "MONTHLY" && (
                          <SelectField
                            label="Правило первого платежа"
                            value={firstPayoutRule || "__none"}
                            onValueChange={(value) =>
                              setFirstPayoutRule(
                                value === "__none" ? "" : (value as FirstPayoutRule)
                              )
                            }
                            options={[
                              { value: "__none", label: "Не выбрано" },
                              { value: "OPEN_DATE", label: "В дату открытия" },
                              { value: "MONTH_END", label: "В конце месяца" },
                              { value: "SHIFT_ONE_MONTH", label: "В конце следующего месяца" },
                            ]}
                            placeholder="Выберите правило"
                          />
                        )}
                        <SelectField
                          label="Тип выплат"
                          value={repaymentType || "__none"}
                          onValueChange={(value) =>
                            setRepaymentType(value === "__none" ? "" : (value as RepaymentType))
                          }
                          options={[
                            { value: "__none", label: "Не выбрано" },
                            { value: "ANNUITY", label: "Аннуитетный" },
                            { value: "DIFFERENTIATED", label: "Дифференцированный" },
                          ]}
                          placeholder="Выберите тип"
                        />
                        <DateField
                          label="Дата окончания планирования"
                          value={planEndDate}
                          min={minPlanDate || undefined}
                          onChange={(e) => setPlanEndDate(e.target.value)}
                        />
                        <DateField
                          label="Дата окончания кредита"
                          value={loanEndDate}
                          min={minPlanDate || undefined}
                          onChange={(e) => setLoanEndDate(e.target.value)}
                        />
                        {requiresLoanPaymentInput && (
                          <>
                            <SelectField
                              label="Тип платежей"
                              value={paymentAmountKind || "__none"}
                              onValueChange={(value) =>
                                setPaymentAmountKind(
                                  value === "__none" ? "" : (value as PaymentAmountKind)
                                )
                              }
                              options={[
                                { value: "__none", label: "Не выбрано" },
                                { value: "TOTAL", label: "Полный платеж" },
                                { value: "PRINCIPAL", label: "Только тело" },
                              ]}
                              placeholder="Выберите вариант"
                            />
                            <TextField
                              label="Сумма платежа"
                              value={paymentAmountStr}
                              onChange={(e) => {
                                const formatted = formatRubInput(e.target.value);
                                setPaymentAmountStr(formatted);
                              }}
                              onBlur={() =>
                                setPaymentAmountStr((prev) => normalizeRubOnBlur(prev))
                              }
                              inputMode="decimal"
                              placeholder="Например: 10 000,00"
                            />
                          </>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            )}
            {showOpeningCounterparty && (
              <div className="rounded-lg border-2 border-border/70 p-3" style={{ backgroundColor: BACKGROUND_DT }}>
                <div className="grid gap-2">
                  <div className="flex items-center gap-2">
                    <Label>{openingCounterpartyLabel}</Label>
                    {openingHint && (
                      <Tooltip
                        content={openingHint}
                        contentClassName="w-80 max-w-[calc(100vw-2rem)]"
                      >
                        <span
                          className="text-muted-foreground"
                          aria-label="\u041f\u043e\u0434\u0441\u043a\u0430\u0437\u043a\u0430 \u043f\u043e \u043f\u043e\u043b\u044e \u0430\u043a\u0442\u0438\u0432\u0430"
                        >
                          <Info className="h-4 w-4" />
                        </span>
                      </Tooltip>
                    )}
                  </div>
                  <ItemSelector
                    items={openingCounterpartyItems}
                    selectedIds={openingCounterpartyId ? [Number(openingCounterpartyId)] : []}
                    onChange={(ids) => {
                      const nextId = ids[0] ?? null;
                      setOpeningCounterpartyId(nextId ? String(nextId) : "");
                    }}
                    selectionMode="single"
                    placeholder="Выберите актив"
                    clearLabel="Не выбрано"
                    getItemTypeLabel={getItemTypeLabel}
                    getItemKind={resolveItemEffectiveKind}
                    getItemBalance={getItemDisplayBalanceCents}
                    getBankLogoUrl={itemCounterpartyLogoUrl}
                    getBankName={itemCounterpartyName}
                    itemCounts={itemTxCounts}
                    ariaLabel={openingCounterpartyLabel}
                  />
                </div>
              </div>
            )}

            </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="glass"
                className="rounded-lg border-0"
                style={
                  {
                    "--glass-bg": "rgba(108, 93, 215, 0.22)",
                    "--glass-bg-hover": "rgba(108, 93, 215, 0.4)",
                  } as React.CSSProperties
                }
                onClick={() => setIsCreateOpen(false)}
              >
                Отмена
              </Button>
              <Button
                type="submit"
                variant="authPrimary"
                disabled={loading}
                className="rounded-lg border-0 h-10 text-base font-bold"
                style={
                  {
                    "--auth-primary-bg":
                      "linear-gradient(135deg, #483BA6 0%, #6C5DD7 57%, #6C5DD7 79%, #9487F3 100%)",
                    "--auth-primary-bg-hover":
                      "linear-gradient(315deg, #9487F3 0%, #6C5DD7 57%, #6C5DD7 79%, #483BA6 100%)",
                  } as React.CSSProperties
                }
              >
                {loading ? "Сохраняем..." : isEditing ? "Сохранить" : "Добавить"}
              </Button>
            </div>
            </form>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={closeItemDialogOpen} onOpenChange={setCloseItemDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Закрытие актива/обязательства</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label>Дата закрытия</Label>
              <Input
                type="date"
                value={closingDate}
                onChange={(e) => setClosingDate(e.target.value)}
                className="border-2 border-border/70 bg-white shadow-none"
              />
            </div>
            
            <div className="grid gap-2">
              <Label>Обработка остатка</Label>
              <div className="inline-flex items-stretch overflow-hidden rounded-full border-2 border-border/70 bg-card p-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setCloseWriteOff(false);
                    setCloseTransferItemId("");
                  }}
                  className={[
                    segmentedButtonBase,
                    !closeWriteOff ? "bg-violet-600 text-white" : "bg-card text-foreground hover:bg-accent",
                  ].join(" ")}
                >
                  Перевести на
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCloseWriteOff(true);
                    setCloseTransferItemId("");
                  }}
                  className={[
                    segmentedButtonBase,
                    closeWriteOff ? "bg-violet-600 text-white" : "bg-card text-foreground hover:bg-accent",
                  ].join(" ")}
                >
                  Списать
                </button>
              </div>
            </div>

            {!closeWriteOff && (
              <div className="grid gap-2">
                <Label>Актив/обязательство для перевода</Label>
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
                  getBankLogoUrl={itemCounterpartyLogoUrl}
                  getBankName={itemCounterpartyName}
                  itemCounts={itemTxCounts}
                  ariaLabel="Актив/обязательство для перевода"
                />
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              className="border-2 border-border/70 bg-white shadow-none"
              onClick={() => setCloseItemDialogOpen(false)}
            >
              Отмена
            </Button>
            <Button
              type="button"
              disabled={loading || (!closeWriteOff && !closeTransferItemId)}
              onClick={onConfirmClose}
              className="bg-violet-600 hover:bg-violet-700 text-white"
            >
              {loading ? "Закрываем..." : "Закрыть"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {error && <div className="mb-4 text-sm text-red-600">{error}</div>}

      <div className="flex flex-col gap-6 lg:flex-row">
        <FilterPanel
          onAddClick={() => openCreateModal("ASSET", ALL_TYPE_CODES, { general: true })}
          addButtonLabel="Добавить"
        >
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
              onChange={setFilterType}
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
                { value: "active", label: "Активный" },
                { value: "closed", label: "Закрытый" },
                { value: "deleted", label: "Удаленный" },
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
        </FilterPanel>

        <div className="flex-1 min-w-0">
          <div className="w-full max-w-[900px] xl:max-w-[1350px] mx-auto" style={{ paddingTop: "30px" }}>
            {visibleItems.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                Нет активов или обязательств
              </div>
            ) : (
              <div 
                className="columns-2 xl:columns-3 gap-4"
              >
                {visibleItems.map((item, index) => {
                  const rate = rateByCode[item.currency_code];
                  const rubEquivalent = getRubEquivalentCents(item);
                  const counterparty = item.counterparty_id
                    ? counterpartiesById.get(item.counterparty_id) ?? null
                    : null;
                  return (
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
                        counterparty={counterparty}
                        onEdit={(item) => openEditModal(item)}
                        onDelete={(item) => onArchive(item)}
                        onArchive={(item) => onArchive(item)}
                        onClose={(item) => onClose(item)}
                        getItemDisplayBalanceCents={getItemDisplayBalanceCents}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

