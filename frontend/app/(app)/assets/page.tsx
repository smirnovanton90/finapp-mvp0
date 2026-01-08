"use client";

import {
  AlertCircle,
  Archive,
  Banknote,
  BarChart3,
  Car,
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

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  fetchCurrencies,
  fetchFxRates,
  createItem,
  updateItem,
  archiveItem,
  closeItem,
  ItemKind,
  ItemCreate,
  ItemOut,
  BankOut,
  CurrencyOut,
  FxRateOut,
} from "@/lib/api";


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
  { code: "credit_card_debt", label: "Задолженность по кредитной карте" },
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
  "credit_card_debt",
  "consumer_loan",
  "mortgage",
  "car_loan",
  "education_loan",
  "installment",
  "microloan",
];
const THIRD_PARTY_LOAN_TYPES = ["private_loan", "third_party_payables"];
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
const BANK_TYPE_CODES = [
  "bank_account",
  "bank_card",
  "deposit",
  "savings_account",
  "brokerage",
  "credit_card_debt",
  "consumer_loan",
  "mortgage",
  "car_loan",
  "education_loan",
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
  credit_card_debt: CreditCard,
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
  return CURRENCY_BADGE_CLASSES[code] ?? "bg-slate-100/20 text-slate-600";
}

function formatRub(valueInCents: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valueInCents / 100);
}

function formatAmount(valueInCents: number) {
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valueInCents / 100);
}

function formatRate(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(value);
}

function getTodayDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/* ------------------ страница ------------------ */

export default function Page() {
  const { data: session } = useSession();

  const [items, setItems] = useState<ItemOut[]>([]);
  const [currencies, setCurrencies] = useState<CurrencyOut[]>([]);
  const [fxRates, setFxRates] = useState<FxRateOut[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ItemOut | null>(null);
  const [isGeneralCreate, setIsGeneralCreate] = useState(false);
  const [sectionId, setSectionId] = useState("");

  const [kind, setKind] = useState<ItemKind>("ASSET");
  const [allowedTypeCodes, setAllowedTypeCodes] = useState<string[]>(CASH_TYPES);
  const [typeCode, setTypeCode] = useState("");
  const [currencyCode, setCurrencyCode] = useState("RUB");
  const [name, setName] = useState("");
  const [amountStr, setAmountStr] = useState(""); // строка: "1234.56" / "1 234,56"
  const [startDate, setStartDate] = useState(() => getTodayDateKey());
  const [banks, setBanks] = useState<BankOut[]>([]);
  const [bankId, setBankId] = useState<number | null>(null);
  const [bankSearch, setBankSearch] = useState("");
  const [bankDropdownOpen, setBankDropdownOpen] = useState(false);
  const [bankLoading, setBankLoading] = useState(false);
  const [bankError, setBankError] = useState<string | null>(null);
  const [accountLast7, setAccountLast7] = useState("");
  const [contractNumber, setContractNumber] = useState("");
  const [openDate, setOpenDate] = useState("");
  const [cardLast4, setCardLast4] = useState("");
  const [cardAccountId, setCardAccountId] = useState("");
  const [depositTermDays, setDepositTermDays] = useState("");
  const [interestRate, setInterestRate] = useState("");
  const [interestPayoutOrder, setInterestPayoutOrder] = useState("");
  const [interestCapitalization, setInterestCapitalization] = useState("");
  const [interestPayoutAccountId, setInterestPayoutAccountId] = useState("");
  const [logoOverlayHeight, setLogoOverlayHeight] = useState(0);
  const logoNaturalSizeRef = useRef<{ width: number; height: number } | null>(null);
  const dialogContentRef = useRef<HTMLDivElement | null>(null);
  const isEditing = Boolean(editingItem);
  const segmentedButtonBase =
    "flex-1 min-w-0 rounded-sm px-3 py-2 text-sm font-medium text-center whitespace-nowrap transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 flex items-center justify-center";

  function resetCreateForm() {
    setName("");
    setAmountStr("");
    setTypeCode("");
    setCurrencyCode("RUB");
    setStartDate(getTodayDateKey());
    setBankId(null);
    setBankSearch("");
    setBankDropdownOpen(false);
    setBankError(null);
    setAccountLast7("");
    setContractNumber("");
    setOpenDate("");
    setCardLast4("");
    setCardAccountId("");
    setDepositTermDays("");
    setInterestRate("");
    setInterestPayoutOrder("");
    setInterestCapitalization("");
    setInterestPayoutAccountId("");
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
  
    // оставляем только цифры и разделители
    const cleaned = raw.replace(/[^\d.,]/g, "");
  
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
      return `${formattedInt},`;
    }
  
    return formattedDec.length > 0 ? `${formattedInt},${formattedDec}` : formattedInt;
  }  
  
  function normalizeRubOnBlur(value: string): string {
    const v = value.trim();
    if (!v) return "";
  
    // если заканчивается запятой: "123," -> "123,00"
    if (v.endsWith(",")) return `${v}00`;
  
    const parts = v.split(",");
    const intPart = parts[0] || "0";
    const decPart = parts[1] ?? "";
  
    if (decPart.length === 0) return `${intPart},00`;
    if (decPart.length === 1) return `${intPart},${decPart}0`;
  
    // если больше 2 — обрежем
    return `${intPart},${decPart.slice(0, 2)}`;
  }  

  const rateByCode = useMemo(() => {
    const map: Record<string, number> = { RUB: 1 };
    fxRates.forEach((rate) => {
      map[rate.char_code] = rate.rate;
    });
    return map;
  }, [fxRates]);

  function getRubEquivalentCents(item: ItemOut): number | null {
    const rate = rateByCode[item.currency_code];
    if (!rate) return null;
    const amount = item.current_value_rub / 100;
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

  const showBankField = useMemo(
    () => BANK_TYPE_CODES.includes(typeCode),
    [typeCode]
  );
  const showBankAccountFields = useMemo(
    () => typeCode === "bank_account" || typeCode === "savings_account",
    [typeCode]
  );
  const showBankCardFields = useMemo(() => typeCode === "bank_card", [typeCode]);
  const showDepositFields = useMemo(() => typeCode === "deposit", [typeCode]);
  const showInterestFields = useMemo(
    () => typeCode === "deposit" || typeCode === "savings_account",
    [typeCode]
  );
  const showOpenDateField = useMemo(
    () => typeCode === "bank_account" || typeCode === "deposit" || typeCode === "savings_account",
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

  const filteredBanks = useMemo(() => {
    const query = bankSearch.trim().toLowerCase();
    const list = query
      ? banks.filter((bank) => bank.name.toLowerCase().includes(query))
      : banks.slice();
    return list.sort((a, b) => {
      const aHasLogo = Boolean(a.logo_url);
      const bHasLogo = Boolean(b.logo_url);
      if (aHasLogo !== bHasLogo) return aHasLogo ? -1 : 1;
      return a.name.localeCompare(b.name, "ru", { sensitivity: "base" });
    });
  }, [banks, bankSearch]);

  const selectedBank = useMemo(
    () => banks.find((bank) => bank.id === bankId) ?? null,
    [banks, bankId]
  );
  const banksById = useMemo(
    () => new Map(banks.map((bank) => [bank.id, bank])),
    [banks]
  );
  const activeItems = useMemo(
    () => items.filter((item) => !item.archived_at && !item.closed_at),
    [items]
  );
  const visibleItems = useMemo(
    () =>
      items.filter((item) => {
        if (item.archived_at) return showArchived;
        if (item.closed_at) return showClosed;
        return true;
      }),
    [items, showArchived, showClosed]
  );
  const activeAssetItems = useMemo(
    () => activeItems.filter((item) => item.kind === "ASSET"),
    [activeItems]
  );
  const bankAccountItems = useMemo(
    () => activeAssetItems.filter((item) => item.type_code === "bank_account"),
    [activeAssetItems]
  );
  const depositEndDateText = useMemo(() => {
    if (!openDate || !depositTermDays) return "";
    const days = Number(depositTermDays);
    if (!Number.isFinite(days) || days <= 0) return "";
    const baseDate = new Date(`${openDate}T00:00:00`);
    if (Number.isNaN(baseDate.getTime())) return "";
    baseDate.setDate(baseDate.getDate() + days);
    return baseDate.toLocaleDateString("ru-RU");
  }, [openDate, depositTermDays]);

  const logoLayerStyle = useMemo(() => {
    if (!showBankField || !selectedBank?.logo_url) return undefined;
    const mask = "linear-gradient(to bottom, rgba(0, 0, 0, 0.5) 0%, rgba(0, 0, 0, 0) 100%)";
    return {
      backgroundImage: `url("${selectedBank.logo_url}")`,
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
  }, [showBankField, selectedBank?.logo_url]);

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
        (x) => x.kind === "ASSET" && CASH_TYPES.includes(x.type_code)
      ),
    [visibleItems]
  );

  const investmentItems = useMemo(
    () =>
      visibleItems.filter(
        (x) => x.kind === "ASSET" && INVESTMENT_TYPES.includes(x.type_code)
      ),
    [visibleItems]
  );

  const thirdPartyDebtItems = useMemo(
    () =>
      visibleItems.filter(
        (x) => x.kind === "ASSET" && THIRD_PARTY_DEBT_TYPES.includes(x.type_code)
      ),
    [visibleItems]
  );

  const realEstateItems = useMemo(
    () =>
      visibleItems.filter(
        (x) => x.kind === "ASSET" && REAL_ESTATE_TYPES.includes(x.type_code)
      ),
    [visibleItems]
  );

  const transportItems = useMemo(
    () =>
      visibleItems.filter(
        (x) => x.kind === "ASSET" && TRANSPORT_TYPES.includes(x.type_code)
      ),
    [visibleItems]
  );

  const valuablesItems = useMemo(
    () =>
      visibleItems.filter(
        (x) => x.kind === "ASSET" && VALUABLES_TYPES.includes(x.type_code)
      ),
    [visibleItems]
  );

  const pensionItems = useMemo(
    () =>
      visibleItems.filter(
        (x) => x.kind === "ASSET" && PENSION_TYPES.includes(x.type_code)
      ),
    [visibleItems]
  );

  const otherAssetItems = useMemo(
    () =>
      visibleItems.filter(
        (x) => x.kind === "ASSET" && OTHER_ASSET_TYPES.includes(x.type_code)
      ),
    [visibleItems]
  );

  const creditLiabilityItems = useMemo(
    () =>
      visibleItems.filter(
        (x) => x.kind === "LIABILITY" && CREDIT_LIABILITY_TYPES.includes(x.type_code)
      ),
    [visibleItems]
  );

  const thirdPartyLoanItems = useMemo(
    () =>
      visibleItems.filter(
        (x) => x.kind === "LIABILITY" && THIRD_PARTY_LOAN_TYPES.includes(x.type_code)
      ),
    [visibleItems]
  );

  const taxLiabilityItems = useMemo(
    () =>
      visibleItems.filter(
        (x) => x.kind === "LIABILITY" && TAX_LIABILITY_TYPES.includes(x.type_code)
      ),
    [visibleItems]
  );

  const utilityLiabilityItems = useMemo(
    () =>
      visibleItems.filter(
        (x) => x.kind === "LIABILITY" && UTILITY_LIABILITY_TYPES.includes(x.type_code)
      ),
    [visibleItems]
  );

  const legalLiabilityItems = useMemo(
    () =>
      visibleItems.filter(
        (x) => x.kind === "LIABILITY" && LEGAL_LIABILITY_TYPES.includes(x.type_code)
      ),
    [visibleItems]
  );

  const otherLiabilityItems = useMemo(
    () =>
      visibleItems.filter(
        (x) => x.kind === "LIABILITY" && OTHER_LIABILITY_TYPES.includes(x.type_code)
      ),
    [visibleItems]
  );

  const cashTotal = useMemo(
    () =>
      activeItems
        .filter((x) => x.kind === "ASSET" && CASH_TYPES.includes(x.type_code))
        .reduce((sum, x) => sum + (getRubEquivalentCents(x) ?? 0), 0),
    [activeItems, rateByCode]
  );

  const investmentTotal = useMemo(
    () =>
      activeItems
        .filter((x) => x.kind === "ASSET" && INVESTMENT_TYPES.includes(x.type_code))
        .reduce((sum, x) => sum + (getRubEquivalentCents(x) ?? 0), 0),
    [activeItems, rateByCode]
  );

  const thirdPartyDebtTotal = useMemo(
    () =>
      activeItems
        .filter((x) => x.kind === "ASSET" && THIRD_PARTY_DEBT_TYPES.includes(x.type_code))
        .reduce((sum, x) => sum + (getRubEquivalentCents(x) ?? 0), 0),
    [activeItems, rateByCode]
  );

  const realEstateTotal = useMemo(
    () =>
      activeItems
        .filter((x) => x.kind === "ASSET" && REAL_ESTATE_TYPES.includes(x.type_code))
        .reduce((sum, x) => sum + (getRubEquivalentCents(x) ?? 0), 0),
    [activeItems, rateByCode]
  );

  const transportTotal = useMemo(
    () =>
      activeItems
        .filter((x) => x.kind === "ASSET" && TRANSPORT_TYPES.includes(x.type_code))
        .reduce((sum, x) => sum + (getRubEquivalentCents(x) ?? 0), 0),
    [activeItems, rateByCode]
  );

  const valuablesTotal = useMemo(
    () =>
      activeItems
        .filter((x) => x.kind === "ASSET" && VALUABLES_TYPES.includes(x.type_code))
        .reduce((sum, x) => sum + (getRubEquivalentCents(x) ?? 0), 0),
    [activeItems, rateByCode]
  );

  const pensionTotal = useMemo(
    () =>
      activeItems
        .filter((x) => x.kind === "ASSET" && PENSION_TYPES.includes(x.type_code))
        .reduce((sum, x) => sum + (getRubEquivalentCents(x) ?? 0), 0),
    [activeItems, rateByCode]
  );

  const otherAssetTotal = useMemo(
    () =>
      activeItems
        .filter((x) => x.kind === "ASSET" && OTHER_ASSET_TYPES.includes(x.type_code))
        .reduce((sum, x) => sum + (getRubEquivalentCents(x) ?? 0), 0),
    [activeItems, rateByCode]
  );

  const creditLiabilityTotal = useMemo(
    () =>
      activeItems
        .filter(
          (x) => x.kind === "LIABILITY" && CREDIT_LIABILITY_TYPES.includes(x.type_code)
        )
        .reduce((sum, x) => sum + (getRubEquivalentCents(x) ?? 0), 0),
    [activeItems, rateByCode]
  );

  const thirdPartyLoanTotal = useMemo(
    () =>
      activeItems
        .filter(
          (x) => x.kind === "LIABILITY" && THIRD_PARTY_LOAN_TYPES.includes(x.type_code)
        )
        .reduce((sum, x) => sum + (getRubEquivalentCents(x) ?? 0), 0),
    [activeItems, rateByCode]
  );

  const taxLiabilityTotal = useMemo(
    () =>
      activeItems
        .filter((x) => x.kind === "LIABILITY" && TAX_LIABILITY_TYPES.includes(x.type_code))
        .reduce((sum, x) => sum + (getRubEquivalentCents(x) ?? 0), 0),
    [activeItems, rateByCode]
  );

  const utilityLiabilityTotal = useMemo(
    () =>
      activeItems
        .filter(
          (x) => x.kind === "LIABILITY" && UTILITY_LIABILITY_TYPES.includes(x.type_code)
        )
        .reduce((sum, x) => sum + (getRubEquivalentCents(x) ?? 0), 0),
    [activeItems, rateByCode]
  );

  const legalLiabilityTotal = useMemo(
    () =>
      activeItems
        .filter(
          (x) => x.kind === "LIABILITY" && LEGAL_LIABILITY_TYPES.includes(x.type_code)
        )
        .reduce((sum, x) => sum + (getRubEquivalentCents(x) ?? 0), 0),
    [activeItems, rateByCode]
  );

  const otherLiabilityTotal = useMemo(
    () =>
      activeItems
        .filter(
          (x) => x.kind === "LIABILITY" && OTHER_LIABILITY_TYPES.includes(x.type_code)
        )
        .reduce((sum, x) => sum + (getRubEquivalentCents(x) ?? 0), 0),
    [activeItems, rateByCode]
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

  async function loadCurrencies() {
    try {
      const data = await fetchCurrencies();
      setCurrencies(data);
    } catch (e: any) {
      setError(e?.message ?? "Не удалось загрузить список валют.");
    }
  }

  async function loadBanks() {
    setBankLoading(true);
    setBankError(null);
    try {
      const data = await fetchBanks();
      setBanks(data);
    } catch (e: any) {
      setBankError(e?.message ?? "Не удалось загрузить список банков.");
    } finally {
      setBankLoading(false);
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

  useEffect(() => {
    if (session) {
      loadItems();
      loadCurrencies();
      loadFxRates();
      loadBanks();
    }
  }, [session]);

  useEffect(() => {
    if (!isCreateOpen || !showBankField || banks.length || bankLoading) return;
    loadBanks();
  }, [isCreateOpen, showBankField, banks.length, bankLoading]);

  useEffect(() => {
    if (showBankField) return;
    if (bankId || bankSearch) {
      setBankId(null);
      setBankSearch("");
    }
    setBankDropdownOpen(false);
  }, [showBankField]);

  useEffect(() => {
    if (showBankAccountFields) return;
    if (accountLast7) setAccountLast7("");
  }, [showBankAccountFields, accountLast7]);

  useEffect(() => {
    if (showContractNumberField) return;
    if (contractNumber) setContractNumber("");
  }, [showContractNumberField, contractNumber]);

  useEffect(() => {
    if (showOpenDateField) return;
    if (openDate) setOpenDate("");
  }, [showOpenDateField, openDate]);

  useEffect(() => {
    if (showBankCardFields) return;
    if (cardLast4) setCardLast4("");
    if (cardAccountId) setCardAccountId("");
  }, [showBankCardFields, cardLast4, cardAccountId]);

  useEffect(() => {
    if (showDepositFields) return;
    if (depositTermDays) setDepositTermDays("");
  }, [showDepositFields, depositTermDays]);

  useEffect(() => {
    if (showInterestFields) return;
    if (interestRate) setInterestRate("");
    if (interestPayoutOrder) setInterestPayoutOrder("");
    if (interestCapitalization) setInterestCapitalization("");
    if (interestPayoutAccountId) setInterestPayoutAccountId("");
  }, [
    showInterestFields,
    interestRate,
    interestPayoutOrder,
    interestCapitalization,
    interestPayoutAccountId,
  ]);

  useEffect(() => {
    if (!selectedBank?.logo_url || !isCreateOpen) {
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
    image.src = selectedBank.logo_url;

    return () => {
      cancelled = true;
    };
  }, [selectedBank?.logo_url, isCreateOpen, updateLogoOverlayHeight]);

  useEffect(() => {
    if (!selectedBank?.logo_url || !isCreateOpen) return;
    const handleResize = () => updateLogoOverlayHeight();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [selectedBank?.logo_url, isCreateOpen, updateLogoOverlayHeight]);

  useEffect(() => {
    if (!currencies.length) return;
    if (!currencyCode || !currencies.some((c) => c.iso_char_code === currencyCode)) {
      const rub = currencies.find((c) => c.iso_char_code === "RUB");
      setCurrencyCode(rub?.iso_char_code ?? currencies[0].iso_char_code);
    }
  }, [currencies, currencyCode]);

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
    setStartDate(getTodayDateKey());
    setBankId(null);
    setBankSearch("");
    setBankDropdownOpen(false);
    setBankError(null);
    setAccountLast7("");
    setContractNumber("");
    setOpenDate("");
    setCardLast4("");
    setCardAccountId("");
    setDepositTermDays("");
    setInterestRate("");
    setInterestPayoutOrder("");
    setInterestCapitalization("");
    setInterestPayoutAccountId("");
    setFormError(null);
    setIsCreateOpen(true);
  };

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
    setStartDate(item.start_date);
    setBankId(item.bank_id);
    const bankName = item.bank_id ? banksById.get(item.bank_id)?.name ?? "" : "";
    setBankSearch(bankName);
    setBankDropdownOpen(false);
    setBankError(null);
    setAccountLast7(item.account_last7 ?? "");
    setContractNumber(item.contract_number ?? "");
    setOpenDate(item.open_date ?? "");
    setCardLast4(item.card_last4 ?? "");
    setCardAccountId(item.card_account_id ? String(item.card_account_id) : "");
    setDepositTermDays(item.deposit_term_days != null ? String(item.deposit_term_days) : "");
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

    if (!startDate) {
      setFormError("Укажите дату начала действия.");
      return;
    }

    const todayKey = getTodayDateKey();
    if (startDate > todayKey) {
      setFormError("Дата начала действия не может быть позже сегодняшней даты.");
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

    let depositTermDaysValue: number | null = null;
    if (showDepositFields && depositTermDays.trim()) {
      const parsed = Number(depositTermDays);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setFormError("Срок вклада должен быть положительным числом.");
        return;
      }
      if (!openDate) {
        setFormError("Дата открытия вклада обязательна при заполнении срока вклада.");
        return;
      }
      depositTermDaysValue = Math.trunc(parsed);
    }

    let interestRateValue: number | null = null;
    if (showInterestFields && trimmedInterestRate) {
      const parsed = Number(trimmedInterestRate.replace(",", "."));
      if (!Number.isFinite(parsed) || parsed < 0) {
        setFormError("Процентная ставка должна быть числом.");
        return;
      }
      interestRateValue = parsed;
    }

    const cents = parseRubToCents(amountStr);
    if (!Number.isFinite(cents) || cents < 0) {
      setFormError("Сумма должна быть числом (например 1234,56)");
      return;
    }
  
    setLoading(true);
    try {
      const payload: ItemCreate = {
        kind,
        type_code: typeCode,
        name: name.trim(),
        currency_code: currencyCode,
        bank_id: showBankField ? bankId : null,
        initial_value_rub: cents, // копейки
        start_date: startDate,
      };

      if (showOpenDateField && openDate) payload.open_date = openDate;

      if (showBankAccountFields) {
        if (trimmedAccountLast7) payload.account_last7 = trimmedAccountLast7;
      }

      if (showContractNumberField && trimmedContractNumber) {
        payload.contract_number = trimmedContractNumber;
      }

      if (showBankCardFields) {
        if (trimmedCardLast4) payload.card_last4 = trimmedCardLast4;
        if (cardAccountId) payload.card_account_id = Number(cardAccountId);
      }

      if (showDepositFields && depositTermDaysValue !== null) {
        payload.deposit_term_days = depositTermDaysValue;
      }

      if (showInterestFields) {
        if (interestRateValue !== null) payload.interest_rate = interestRateValue;
        if (interestPayoutOrder) {
          payload.interest_payout_order = interestPayoutOrder as "END_OF_TERM" | "MONTHLY";
        }
        if (interestCapitalization === "true") payload.interest_capitalization = true;
        if (interestCapitalization === "false") payload.interest_capitalization = false;
        if (interestPayoutAccountId) {
          payload.interest_payout_account_id = Number(interestPayoutAccountId);
        }
      }

      if (editingItem) {
        await updateItem(editingItem.id, payload);
      } else {
        await createItem(payload);
      }
  
      // очищаем форму и закрываем модалку
      setName("");
      setAmountStr("");
      setIsCreateOpen(false);
      setEditingItem(null);
  
      await loadItems();
    } catch (e: any) {
      setFormError(e?.message ?? "Ошибка создания");
    } finally {
      setLoading(false);
    }
  }
  
  async function onArchive(id: number) {
    setLoading(true);
    setError(null);
    try {
      await archiveItem(id);
      await loadItems();
    } catch (e: any) {
      setError(e?.message ?? "Ошибка архивации");
    } finally {
      setLoading(false);
    }
  }

  async function onClose(id: number) {
    setLoading(true);
    setError(null);
    try {
      await closeItem(id);
      await loadItems();
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
  }: {
    title: string;
    items: ItemOut[];
    total: number;
    isLiability?: boolean;
    icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
    onAdd?: () => void;
  }) {
    return (
      <Card className="pb-0">
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
          {categoryItems.length === 0 ? (
            <div className="h-24 px-4 flex items-center justify-center text-muted-foreground">
              Пока нет записей
            </div>
          ) : (
            <Table className="table-fixed">
              <TableHeader className="[&_tr]:border-b-2 [&_tr]:border-border/70">
                <TableRow className="border-b-2 border-border/70">
                  <TableHead className="w-40 min-w-40 pl-6 font-medium text-muted-foreground whitespace-normal">
                    Название
                  </TableHead>
                  <TableHead className="w-10 min-w-10 font-medium text-muted-foreground text-center whitespace-normal">
                    
                  </TableHead>
                  <TableHead className="w-16 min-w-16 font-medium text-muted-foreground text-center whitespace-normal">
                    
                  </TableHead>
                  <TableHead className="w-36 min-w-36 text-right font-medium text-muted-foreground whitespace-normal">
                    Текущая сумма в валюте
                  </TableHead>
                  <TableHead className="w-24 min-w-24 text-right font-medium text-muted-foreground whitespace-normal">
                    Актуальный курс валюты
                  </TableHead>
                  <TableHead className="w-36 min-w-36 text-right font-medium text-muted-foreground whitespace-normal">
                    Текущая сумма в руб. экв.
                  </TableHead>
                  <TableHead className="w-28 min-w-28 text-right font-medium text-muted-foreground whitespace-normal">
                    Дата начала действия
                  </TableHead>
                  <TableHead className="w-12 min-w-12 pr-6" />
                </TableRow>
              </TableHeader>

              <TableBody>
                {categoryItems.map((it) => {
                  const typeLabel = (it.kind === "ASSET" ? ASSET_TYPES : LIABILITY_TYPES).find(
                    (t) => t.code === it.type_code
                  )?.label || it.type_code;
                  const typeMeta = typeLabel;
                  const rate = rateByCode[it.currency_code];
                  const rubEquivalent = getRubEquivalentCents(it);
                  const currencyCode = it.currency_code || "";
                  const bank = it.bank_id ? banksById.get(it.bank_id) ?? null : null;
                  const bankLogoUrl = bank?.logo_url ?? null;
                  const bankName = bank?.name ?? "";
                  const TypeIcon = TYPE_ICON_BY_CODE[it.type_code];
                  const isArchived = Boolean(it.archived_at);
                  const isClosed = Boolean(it.closed_at);
                  const canEdit = !isArchived && !isClosed;
                  const canClose = !isArchived && !isClosed && it.current_value_rub === 0;
                  const canDelete = !isArchived;
                  const rowToneClass = isArchived
                    ? "bg-rose-50/80"
                    : isClosed
                    ? "bg-slate-100/80"
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

                  return (
                    <TableRow
                      key={it.id}
                      className={["border-b-2 border-border/70", rowToneClass].join(" ")}
                    >
                      <TableCell className="w-40 min-w-40 pl-6 whitespace-normal break-words">
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
                          </div>
                        </div>
                      </TableCell>

                      <TableCell
                        className={["w-10 min-w-10 text-center text-sm", mutedToneClass].join(
                          " "
                        )}
                      >
                        {bankLogoUrl ? (
                          <img
                            src={bankLogoUrl}
                            alt={bankName}
                            className={[
                              "mx-auto h-5 w-5 rounded object-contain bg-white",
                              isArchived || isClosed ? "opacity-40" : "",
                            ].join(" ")}
                            loading="lazy"
                          />
                        ) : null}
                      </TableCell>

                      <TableCell
                        className={["w-16 min-w-16 text-center text-sm", mutedToneClass].join(
                          " "
                        )}
                      >
                        {currencyCode ? (
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
                        className={[
                          "w-36 min-w-36 text-right font-semibold tabular-nums",
                          isArchived
                            ? "text-slate-400"
                            : isClosed
                            ? "text-slate-400"
                            : isLiability
                            ? "text-red-600"
                            : "",
                        ].join(" ")}
                      >
                        {isLiability
                          ? `-${formatAmount(it.current_value_rub)}`
                          : formatAmount(it.current_value_rub)}
                      </TableCell>

                      <TableCell
                        className={["w-24 min-w-24 text-right text-sm", mutedToneClass].join(
                          " "
                        )}
                      >
                        {rate ? formatRate(rate) : "-"}
                      </TableCell>

                      <TableCell
                        className={[
                          "w-36 min-w-36 text-right font-semibold tabular-nums",
                          isArchived
                            ? "text-slate-400"
                            : isClosed
                            ? "text-slate-400"
                            : isLiability
                            ? "text-red-600"
                            : "",
                        ].join(" ")}
                      >
                        {rubEquivalent === null
                          ? "-"
                          : isLiability
                          ? `-${formatRub(rubEquivalent)}`
                          : formatRub(rubEquivalent)}
                      </TableCell>

                      <TableCell
                        className={["w-28 min-w-28 text-right text-sm", mutedToneClass].join(
                          " "
                        )}
                      >
                        {new Date(`${it.start_date}T00:00:00`).toLocaleDateString("ru-RU")}
                      </TableCell>

                      <TableCell className="w-12 min-w-12 pr-6 text-right">
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
                              onSelect={() => onClose(it.id)}
                              disabled={!canClose}
                            >
                              <Archive className="h-4 w-4" />
                              Закрыть
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              onSelect={() => onArchive(it.id)}
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
                  <TableCell className="pl-6 font-medium">Итого</TableCell>
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
                  <TableCell />
                  <TableCell className="pr-6" />
                </TableRow>
              </TableFooter>
            </Table>
          )}
        </CardContent>
      </Card>
    );
  }

  /* ------------------ основной UI ------------------ */

  return (
    <main className="min-h-screen bg-[#F7F8FA] px-8 py-8">
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
          className="overflow-hidden sm:max-w-[520px]"
        >
          {selectedBank?.logo_url && logoOverlayHeight > 0 && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 z-0"
              style={{ height: `${logoOverlayHeight}px`, ...logoLayerStyle }}
            />
          )}

          <div className="relative z-10 grid gap-4">
            <DialogHeader>
              <DialogTitle>
                {isEditing
                  ? "Редактирование актива/обязательства"
                  : "Добавление актива/обязательства"}
              </DialogTitle>
            </DialogHeader>

            <form onSubmit={onCreate} noValidate className="grid gap-4">
            {formError && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3">
                {formError}
              </div>
            )}

            {isGeneralCreate && (
              <div className="grid gap-2" role="group" aria-label="Тип актива или обязательства">
                <div className="inline-flex w-full items-stretch overflow-hidden rounded-md border border-input bg-muted/60 p-0.5">
                  <button
                    type="button"
                    aria-pressed={kind === "ASSET"}
                    onClick={() => {
                      setKind("ASSET");
                      setSectionId("");
                      setTypeCode("");
                    }}
                    className={`${segmentedButtonBase} ${
                      kind === "ASSET"
                        ? "bg-violet-50 text-violet-700"
                        : "bg-white text-muted-foreground hover:bg-white"
                    }`}
                  >
                    Актив
                  </button>
                  <button
                    type="button"
                    aria-pressed={kind === "LIABILITY"}
                    onClick={() => {
                      setKind("LIABILITY");
                      setSectionId("");
                      setTypeCode("");
                    }}
                    className={`${segmentedButtonBase} ${
                      kind === "LIABILITY"
                        ? "bg-rose-50 text-rose-700"
                        : "bg-white text-muted-foreground hover:bg-white"
                    }`}
                  >
                    Обязательство
                  </button>
                </div>
              </div>
            )}

            {isGeneralCreate && (
              <div className="grid gap-2">
                <Label>Раздел</Label>
                <Select
                  value={sectionId}
                  onValueChange={(value) => {
                    setSectionId(value);
                    setTypeCode("");
                  }}
                >
                  <SelectTrigger className="border-2 border-border/70 bg-white shadow-none">
                    <SelectValue
                      placeholder={
                        kind === "ASSET"
                          ? "Выберите раздел актива"
                          : "Выберите раздел обязательства"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {sectionOptions.map((section) => (
                      <SelectItem key={section.id} value={section.id}>
                        {section.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid gap-2">
              <Label>Вид</Label>
              <Select
                value={typeCode}
                onValueChange={setTypeCode}
                disabled={isGeneralCreate && !sectionId}
              >
                <SelectTrigger className="border-2 border-border/70 bg-white shadow-none">
                  <SelectValue
                    placeholder={
                      isGeneralCreate && !sectionId ? "Сначала выберите раздел" : "Выберите вид"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {typeOptions.map((t) => (
                    <SelectItem key={t.code} value={t.code}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Название</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Например: Кошелек / Ипотека Газпромбанк"
                className="border-2 border-border/70 bg-white shadow-none"
              />
            </div>

            {showBankField && (
              <div className="grid gap-2">
                <Label>Банк</Label>
                <div className="relative">
                  <Input
                    value={bankSearch}
                    onChange={(e) => {
                      setBankSearch(e.target.value);
                      setBankId(null);
                      setBankDropdownOpen(true);
                    }}
                    onFocus={() => setBankDropdownOpen(true)}
                    onBlur={() => setTimeout(() => setBankDropdownOpen(false), 150)}
                    placeholder="Начните вводить название банка"
                    className="border-2 border-border/70 bg-white shadow-none"
                  />
                  {bankDropdownOpen && (
                    <div className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border/60 bg-white shadow-lg">
                      {bankLoading && (
                        <div className="px-3 py-2 text-sm text-muted-foreground">
                          Загрузка...
                        </div>
                      )}
                      {!bankLoading && bankError && (
                        <div className="px-3 py-2 text-sm text-red-600">{bankError}</div>
                      )}
                      {!bankLoading && !bankError && filteredBanks.length === 0 && (
                        <div className="px-3 py-2 text-sm text-muted-foreground">
                          Нет совпадений
                        </div>
                      )}
                      {!bankLoading &&
                        !bankError &&
                        filteredBanks.map((bank) => (
                          <button
                            key={bank.id}
                            type="button"
                            className={[
                              "flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50",
                              bankId === bank.id ? "bg-slate-50" : "",
                            ].join(" ")}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                              setBankId(bank.id);
                              setBankSearch(bank.name);
                              setBankDropdownOpen(false);
                            }}
                          >
                            {bank.logo_url ? (
                              <img
                                src={bank.logo_url}
                                alt=""
                                className="h-8 w-8 rounded border border-border/60 object-contain bg-white"
                                loading="lazy"
                              />
                            ) : (
                              <div className="h-8 w-8 rounded border border-border/60 bg-slate-100" />
                            )}
                            <div className="flex flex-col">
                              <span className="text-sm font-medium">{bank.name}</span>
                              <span className="text-xs text-muted-foreground">
                                {bank.license_status}
                              </span>
                            </div>
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {showBankAccountFields && (
              <div className="grid gap-2">
                <Label>Последние 7 цифр номера счета</Label>
                <Input
                  value={accountLast7}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "").slice(0, 7);
                    setAccountLast7(digits);
                  }}
                  inputMode="numeric"
                  maxLength={7}
                  placeholder="Например: 1234567"
                  className="border-2 border-border/70 bg-white shadow-none"
                />
              </div>
            )}

            {showBankCardFields && (
              <>
                <div className="grid gap-2">
                  <Label>Последние 4 цифры номера карты</Label>
                  <Input
                    value={cardLast4}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, "").slice(0, 4);
                      setCardLast4(digits);
                    }}
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="Например: 1234"
                    className="border-2 border-border/70 bg-white shadow-none"
                  />
                </div>

                <div className="grid gap-2">
                  <Label>Привязка дебетовой карты к счету</Label>
                  <Select
                    value={cardAccountId}
                    onValueChange={(value) =>
                      setCardAccountId(value === "__none" ? "" : value)
                    }
                  >
                    <SelectTrigger className="border-2 border-border/70 bg-white shadow-none">
                      <SelectValue placeholder="Выберите счет" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Не выбрано</SelectItem>
                      {bankAccountItems.map((item) => (
                        <SelectItem key={item.id} value={String(item.id)}>
                          <div className="flex flex-col">
                            <span className="text-sm font-medium">{item.name}</span>
                            {item.account_last7 && (
                              <span className="text-xs text-muted-foreground">
                                Последние 7 цифр: {item.account_last7}
                              </span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {showContractNumberField && (
              <div className="grid gap-2">
                <Label>Номер договора</Label>
                <Input
                  value={contractNumber}
                  onChange={(e) => setContractNumber(e.target.value)}
                  placeholder="Например: 01-2025/123"
                  className="border-2 border-border/70 bg-white shadow-none"
                />
              </div>
            )}

            {showOpenDateField && (
              <div className="grid gap-2">
                <Label>Дата открытия</Label>
                <Input
                  type="date"
                  value={openDate}
                  onChange={(e) => setOpenDate(e.target.value)}
                  className="border-2 border-border/70 bg-white shadow-none"
                />
              </div>
            )}

            {showDepositFields && (
              <div className="grid gap-2">
                <Label>Срок вклада в днях</Label>
                <div className="flex items-center gap-3">
                  <Input
                    value={depositTermDays}
                    onChange={(e) => setDepositTermDays(e.target.value.replace(/\D/g, ""))}
                    inputMode="numeric"
                    placeholder="Например: 365"
                    className="border-2 border-border/70 bg-white shadow-none"
                  />
                  <div className="text-sm text-muted-foreground min-w-[140px]">
                    {depositEndDateText
                      ? `Окончание: ${depositEndDateText}`
                      : "Окончание: —"}
                  </div>
                </div>
              </div>
            )}

            {showInterestFields && (
              <>
                <div className="grid gap-2">
                  <Label>Процентная ставка</Label>
                  <Input
                    value={interestRate}
                    onChange={(e) => setInterestRate(e.target.value.replace(/[^\d.,]/g, ""))}
                    inputMode="decimal"
                    placeholder="Например: 8,5"
                    className="border-2 border-border/70 bg-white shadow-none"
                  />
                </div>

                <div className="grid gap-2">
                  <Label>Порядок выплаты процентов</Label>
                  <Select
                    value={interestPayoutOrder}
                    onValueChange={(value) =>
                      setInterestPayoutOrder(value === "__none" ? "" : value)
                    }
                  >
                    <SelectTrigger className="border-2 border-border/70 bg-white shadow-none">
                      <SelectValue placeholder="Выберите вариант" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Не выбрано</SelectItem>
                      <SelectItem value="END_OF_TERM">В конце срока</SelectItem>
                      <SelectItem value="MONTHLY">Ежемесячно</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label>Капитализация процентов</Label>
                  <Select
                    value={interestCapitalization}
                    onValueChange={(value) =>
                      setInterestCapitalization(value === "__none" ? "" : value)
                    }
                  >
                    <SelectTrigger className="border-2 border-border/70 bg-white shadow-none">
                      <SelectValue placeholder="Выберите вариант" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Не выбрано</SelectItem>
                      <SelectItem value="true">Да</SelectItem>
                      <SelectItem value="false">Нет</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label>Счет выплаты процентов</Label>
                  <Select
                    value={interestPayoutAccountId}
                    onValueChange={(value) =>
                      setInterestPayoutAccountId(value === "__none" ? "" : value)
                    }
                  >
                    <SelectTrigger className="border-2 border-border/70 bg-white shadow-none">
                      <SelectValue placeholder="Выберите счет" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Не выбрано</SelectItem>
                      {activeAssetItems.map((item) => {
                        const typeLabel =
                          ASSET_TYPES.find((t) => t.code === item.type_code)?.label ||
                          item.type_code;
                        return (
                          <SelectItem key={item.id} value={String(item.id)}>
                            <div className="flex flex-col">
                              <span className="text-sm font-medium">{item.name}</span>
                              <span className="text-xs text-muted-foreground">{typeLabel}</span>
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}


            <div className="grid gap-2">
              <Label>Валюта</Label>
              <Select
                value={currencyCode}
                onValueChange={setCurrencyCode}
                disabled={currencies.length === 0}
              >
                <SelectTrigger className="border-2 border-border/70 bg-white shadow-none">
                  <SelectValue placeholder="Выберите валюту" />
                </SelectTrigger>
                <SelectContent>
                  {currencies.map((c) => (
                    <SelectItem key={c.iso_char_code} value={c.iso_char_code}>
                      {c.iso_char_code} — {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <div className="flex items-center gap-2">
                <Label>Дата начала действия</Label>
                <span
                  className="text-muted-foreground"
                  title="Дата, с которой актив или обязательство участвуют в расчетах. Нужна для корректной истории и отчетов."
                  aria-label="Подсказка по дате начала действия"
                >
                  <Info className="h-4 w-4" />
                </span>
              </div>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                max={getTodayDateKey()}
                className="border-2 border-border/70 bg-white shadow-none"
              />
            </div>

            <div className="grid gap-2">
              <Label>Сумма на дату начала действия</Label>
              <Input
                value={amountStr}
                onChange={(e) => {
                  const formatted = formatRubInput(e.target.value);
                  setAmountStr(formatted);
                }}
                onBlur={() => setAmountStr((prev) => normalizeRubOnBlur(prev))}
                inputMode="decimal"
                placeholder="Например: 1 234 567,89"
                className="border-2 border-border/70 bg-white shadow-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCreateOpen(false)}
              >
                Отмена
              </Button>
              <Button
                type="submit"
                disabled={loading}
                className="bg-violet-600 hover:bg-violet-700 text-white"
              >
                {loading ? "Сохраняем..." : isEditing ? "Сохранить" : "Добавить"}
              </Button>
            </div>
            </form>
          </div>
        </DialogContent>
      </Dialog>

      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border/70 bg-white px-4 py-3">
          <span className="text-sm font-medium text-muted-foreground">Показывать:</span>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={showClosed}
              onChange={(event) => setShowClosed(event.target.checked)}
            />
            Закрытые
          </label>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={showArchived}
              onChange={(event) => setShowArchived(event.target.checked)}
            />
            Удаленные
          </label>
          <Button
            type="button"
            size="sm"
            className="ml-auto h-8 bg-violet-600 hover:bg-violet-700 text-white"
            onClick={() => openCreateModal("ASSET", ALL_TYPE_CODES, { general: true })}
          >
            <Plus className="mr-2 h-4 w-4" />
            Добавить
          </Button>
        </div>

        {cashItems.length > 0 && (
          <CategoryTable
            title="Денежные активы"
            items={cashItems}
            total={cashTotal}
            icon={Wallet}
            onAdd={() => openCreateModal("ASSET", CASH_TYPES)}
          />
        )}

        {investmentItems.length > 0 && (
          <CategoryTable
            title="Инвестиционные активы"
            items={investmentItems}
            total={investmentTotal}
            icon={TrendingUp}
            onAdd={() => openCreateModal("ASSET", INVESTMENT_TYPES)}
          />
        )}

        {thirdPartyDebtItems.length > 0 && (
          <CategoryTable
            title="Долги третьих лиц"
            items={thirdPartyDebtItems}
            total={thirdPartyDebtTotal}
            icon={Users}
            onAdd={() => openCreateModal("ASSET", THIRD_PARTY_DEBT_TYPES)}
          />
        )}

        {realEstateItems.length > 0 && (
          <CategoryTable
            title="Недвижимость"
            items={realEstateItems}
            total={realEstateTotal}
            icon={Home}
            onAdd={() => openCreateModal("ASSET", REAL_ESTATE_TYPES)}
          />
        )}

        {transportItems.length > 0 && (
          <CategoryTable
            title="Транспорт"
            items={transportItems}
            total={transportTotal}
            icon={Car}
            onAdd={() => openCreateModal("ASSET", TRANSPORT_TYPES)}
          />
        )}

        {valuablesItems.length > 0 && (
          <CategoryTable
            title="Имущество"
            items={valuablesItems}
            total={valuablesTotal}
            icon={Package}
            onAdd={() => openCreateModal("ASSET", VALUABLES_TYPES)}
          />
        )}

        {pensionItems.length > 0 && (
          <CategoryTable
            title="Пенсионные и страховые активы"
            items={pensionItems}
            total={pensionTotal}
            icon={PiggyBank}
            onAdd={() => openCreateModal("ASSET", PENSION_TYPES)}
          />
        )}

        {otherAssetItems.length > 0 && (
          <CategoryTable
            title="Прочие активы"
            items={otherAssetItems}
            total={otherAssetTotal}
            icon={Package}
            onAdd={() => openCreateModal("ASSET", OTHER_ASSET_TYPES)}
          />
        )}

        {creditLiabilityItems.length > 0 && (
          <CategoryTable
            title="Кредитные обязательства"
            items={creditLiabilityItems}
            total={creditLiabilityTotal}
            isLiability={true}
            icon={CreditCard}
            onAdd={() => openCreateModal("LIABILITY", CREDIT_LIABILITY_TYPES)}
          />
        )}

        {thirdPartyLoanItems.length > 0 && (
          <CategoryTable
            title="Займы от третьих лиц"
            items={thirdPartyLoanItems}
            total={thirdPartyLoanTotal}
            isLiability={true}
            icon={Users}
            onAdd={() => openCreateModal("LIABILITY", THIRD_PARTY_LOAN_TYPES)}
          />
        )}

        {taxLiabilityItems.length > 0 && (
          <CategoryTable
            title="Налоги и обязательные платежи"
            items={taxLiabilityItems}
            total={taxLiabilityTotal}
            isLiability={true}
            icon={Receipt}
            onAdd={() => openCreateModal("LIABILITY", TAX_LIABILITY_TYPES)}
          />
        )}

        {utilityLiabilityItems.length > 0 && (
          <CategoryTable
            title="Коммунальные и бытовые долги"
            items={utilityLiabilityItems}
            total={utilityLiabilityTotal}
            isLiability={true}
            icon={Receipt}
            onAdd={() => openCreateModal("LIABILITY", UTILITY_LIABILITY_TYPES)}
          />
        )}

        {legalLiabilityItems.length > 0 && (
          <CategoryTable
            title="Судебные и иные обязательства"
            items={legalLiabilityItems}
            total={legalLiabilityTotal}
            isLiability={true}
            icon={AlertCircle}
            onAdd={() => openCreateModal("LIABILITY", LEGAL_LIABILITY_TYPES)}
          />
        )}

        {otherLiabilityItems.length > 0 && (
          <CategoryTable
            title="Прочие обязательства"
            items={otherLiabilityItems}
            total={otherLiabilityTotal}
            isLiability={true}
            icon={AlertCircle}
            onAdd={() => openCreateModal("LIABILITY", OTHER_LIABILITY_TYPES)}
          />
        )}
      </div>

      {error && (
        <div className="mt-4 text-sm text-red-600">Ошибка: {error}</div>
      )}
    </main>
  );
}
