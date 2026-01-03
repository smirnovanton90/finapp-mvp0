"use client";

import {
  AlertCircle,
  Banknote,
  BarChart3,
  Calculator,
  Car,
  Coins,
  CreditCard,
  Home,
  Landmark,
  Package,
  PiggyBank,
  Plus,
  Receipt,
  Trash2,
  TrendingUp,
  Users,
  Wallet,
  LineChart,
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
  fetchItems,
  fetchBanks,
  fetchCurrencies,
  fetchFxRates,
  createItem,
  archiveItem,
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
  { code: "bank_card", label: "Карта" },
  { code: "deposit", label: "Вклад" },
  { code: "savings_account", label: "Накопительный счёт" },
  { code: "brokerage", label: "Брокерский счёт" },
  { code: "securities", label: "Ценные бумаги" },
  { code: "real_estate", label: "Недвижимость" },
  { code: "car", label: "Автомобиль" },
  { code: "other_asset", label: "Другое" },
];

const LIABILITY_TYPES = [
  { code: "credit_card_debt", label: "Задолженность по кредитной карте" },
  { code: "consumer_loan", label: "Потребительский кредит" },
  { code: "mortgage", label: "Ипотека" },
  { code: "car_loan", label: "Автокредит" },
  { code: "microloan", label: "МФО" },
  { code: "tax_debt", label: "Налоги / штрафы" },
  { code: "private_loan", label: "Частный заём" },
  { code: "other_liability", label: "Другое" },
];

const LIABILITY_TYPE_CODES = LIABILITY_TYPES.map((type) => type.code);

// Категории активов
const CASH_TYPES = ["cash", "bank_account", "bank_card"];
const FINANCIAL_INSTRUMENTS_TYPES = ["deposit", "savings_account", "brokerage", "securities"];
const PROPERTY_TYPES = ["real_estate", "car"];
const OTHER_ASSET_TYPES = ["other_asset"];
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
];

const TYPE_ICON_BY_CODE: Record<string, React.ComponentType<{ className?: string }>> = {
  cash: Banknote,
  bank_account: Landmark,
  bank_card: CreditCard,
  deposit: PiggyBank,
  savings_account: Wallet,
  brokerage: LineChart,
  securities: BarChart3,
  real_estate: Home,
  car: Car,
  other_asset: Package,
  credit_card_debt: CreditCard,
  consumer_loan: Coins,
  mortgage: Home,
  car_loan: Car,
  microloan: Coins,
  tax_debt: Receipt,
  private_loan: Users,
  other_liability: AlertCircle,
};

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

  const [isCreateOpen, setIsCreateOpen] = useState(false);

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
  const [logoOverlayHeight, setLogoOverlayHeight] = useState(0);
  const logoNaturalSizeRef = useRef<{ width: number; height: number } | null>(null);
  const dialogContentRef = useRef<HTMLDivElement | null>(null);

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

  const typeOptions = useMemo(() => {
    const base = kind === "ASSET" ? ASSET_TYPES : LIABILITY_TYPES;
    if (!allowedTypeCodes.length) return base;
    const allowed = new Set(allowedTypeCodes);
    return base.filter((option) => allowed.has(option.code));
  }, [kind, allowedTypeCodes]);

  const showBankField = useMemo(
    () => BANK_TYPE_CODES.includes(typeCode),
    [typeCode]
  );
  const showBankAccountFields = useMemo(() => typeCode === "bank_account", [typeCode]);

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
    () => items.filter((x) => x.kind === "ASSET" && CASH_TYPES.includes(x.type_code)),
    [items]
  );

  const financialInstrumentsItems = useMemo(
    () => items.filter((x) => x.kind === "ASSET" && FINANCIAL_INSTRUMENTS_TYPES.includes(x.type_code)),
    [items]
  );

  const propertyItems = useMemo(
    () => items.filter((x) => x.kind === "ASSET" && PROPERTY_TYPES.includes(x.type_code)),
    [items]
  );

  const otherAssetItems = useMemo(
    () => items.filter((x) => x.kind === "ASSET" && OTHER_ASSET_TYPES.includes(x.type_code)),
    [items]
  );

  const liabilityItems = useMemo(
    () => items.filter((x) => x.kind === "LIABILITY"),
    [items]
  );

  // Итоги по категориям
  const cashTotal = useMemo(
    () => cashItems.reduce((sum, x) => sum + (getRubEquivalentCents(x) ?? 0), 0),
    [cashItems, rateByCode]
  );

  const financialInstrumentsTotal = useMemo(
    () =>
      financialInstrumentsItems.reduce((sum, x) => sum + (getRubEquivalentCents(x) ?? 0), 0),
    [financialInstrumentsItems, rateByCode]
  );

  const propertyTotal = useMemo(
    () => propertyItems.reduce((sum, x) => sum + (getRubEquivalentCents(x) ?? 0), 0),
    [propertyItems, rateByCode]
  );

  const otherAssetTotal = useMemo(
    () => otherAssetItems.reduce((sum, x) => sum + (getRubEquivalentCents(x) ?? 0), 0),
    [otherAssetItems, rateByCode]
  );

  const liabilityTotal = useMemo(
    () => liabilityItems.reduce((sum, x) => sum + (getRubEquivalentCents(x) ?? 0), 0),
    [liabilityItems, rateByCode]
  );

  const { totalAssets, totalLiabilities, netTotal } = useMemo(() => {
    const assets = items
      .filter((x) => x.kind === "ASSET")
      .reduce((sum, x) => sum + (getRubEquivalentCents(x) ?? 0), 0);
  
    const liabilities = items
      .filter((x) => x.kind === "LIABILITY")
      .reduce((sum, x) => sum + (getRubEquivalentCents(x) ?? 0), 0);
  
    return {
      totalAssets: assets,
      totalLiabilities: liabilities,
      netTotal: assets - liabilities, // обязательства вычитаем
    };
  }, [items, rateByCode]);

  useEffect(() => {
    if (!isCreateOpen || typeOptions.length === 0) return;
    if (!typeCode || !typeOptions.some((option) => option.code === typeCode)) {
      setTypeCode(typeOptions[0].code);
    }
  }, [isCreateOpen, typeOptions, typeCode]);

  async function loadItems() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchItems();
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
    if (accountLast7 || contractNumber) {
      setAccountLast7("");
      setContractNumber("");
    }
  }, [showBankAccountFields, accountLast7, contractNumber]);

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

  const openCreateModal = (nextKind: ItemKind, nextTypeCodes: string[]) => {
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
    setFormError(null);
    setIsCreateOpen(true);
  };

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
  
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

    if (showBankAccountFields && trimmedAccountLast7 && !/^\d{7}$/.test(trimmedAccountLast7)) {
      setFormError("Последние 7 цифр номера счета должны содержать ровно 7 цифр.");
      return;
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

      if (showBankAccountFields) {
        if (trimmedAccountLast7) payload.account_last7 = trimmedAccountLast7;
        if (trimmedContractNumber) payload.contract_number = trimmedContractNumber;
      }

      await createItem(payload);
  
      // очищаем форму и закрываем модалку
      setName("");
      setAmountStr("");
      setIsCreateOpen(false);
  
      await loadItems();
    } catch (e: any) {
      setFormError(e?.message ?? "Ошибка создания");
    } finally {
      setLoading(false);
    }
  }
  
  async function onArchive(id: number) {
    setLoading(true);
    try {
      await archiveItem(id);
      await loadItems();
    } catch (e: any) {
      setError(e?.message ?? "Ошибка архивации");
    } finally {
      setLoading(false);
    }
  }

  // Компонент таблицы категории
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
    icon?: React.ComponentType<{ className?: string }>;
    onAdd?: () => void;
  }) {
    return (
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            {Icon && <Icon className="h-5 w-5 text-violet-600" />}
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
        <CardContent>
          {categoryItems.length === 0 ? (
            <div className="h-24 flex items-center justify-center text-muted-foreground">
              Пока нет записей
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead className="font-medium text-muted-foreground whitespace-normal">
                    Название
                  </TableHead>
                  <TableHead className="font-medium text-muted-foreground whitespace-normal">
                    Валюта
                  </TableHead>
                  <TableHead className="text-right font-medium text-muted-foreground whitespace-normal">
                    Текущая сумма в валюте актива / обязательства
                  </TableHead>
                  <TableHead className="text-right font-medium text-muted-foreground whitespace-normal">
                    Актуальный курс валюты
                  </TableHead>
                  <TableHead className="text-right font-medium text-muted-foreground whitespace-normal">
                    Текущая сумма актива / обязательства в рублевом эквиваленте
                  </TableHead>
                  <TableHead className="text-right font-medium text-muted-foreground whitespace-normal">
                    Дата начала действия
                  </TableHead>
                  <TableHead />
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
                  const TypeIcon = TYPE_ICON_BY_CODE[it.type_code];

                  return (
                    <TableRow key={it.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {TypeIcon && <TypeIcon className="h-5 w-5 text-violet-600" />}
                          <span className="font-medium leading-tight">{it.name}</span>
                        </div>
                        <div className="text-xs text-muted-foreground leading-tight">
                          {typeMeta}
                        </div>
                      </TableCell>

                      <TableCell className="text-sm text-muted-foreground">
                        {it.currency_code || "-"}
                      </TableCell>

                      <TableCell
                        className={[
                          "text-right font-semibold tabular-nums",
                          isLiability ? "text-red-600" : "",
                        ].join(" ")}
                      >
                        {isLiability
                          ? `-${formatAmount(it.current_value_rub)}`
                          : formatAmount(it.current_value_rub)}
                      </TableCell>

                      <TableCell className="text-right text-sm text-muted-foreground">
                        {rate ? formatRate(rate) : "-"}
                      </TableCell>

                      <TableCell
                        className={[
                          "text-right font-semibold tabular-nums",
                          isLiability ? "text-red-600" : "",
                        ].join(" ")}
                      >
                        {rubEquivalent === null
                          ? "-"
                          : isLiability
                          ? `-${formatRub(rubEquivalent)}`
                          : formatRub(rubEquivalent)}
                      </TableCell>

                      <TableCell className="text-right text-sm text-muted-foreground">
                        {new Date(`${it.start_date}T00:00:00`).toLocaleDateString("ru-RU")}
                      </TableCell>

                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-rose-500 hover:bg-transparent"
                          onClick={() => onArchive(it.id)}
                          aria-label="Архивировать"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>

              <TableFooter>
                <TableRow className="bg-muted/30">
                  <TableCell className="font-medium">Итого</TableCell>
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
                  <TableCell />
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
              <DialogTitle>Добавление актива/обязательства</DialogTitle>
            </DialogHeader>

            <form onSubmit={onCreate} className="grid gap-4">
            {formError && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3">
                {formError}
              </div>
            )}

            <div className="grid gap-2">
              <Label>Вид</Label>
              <Select value={typeCode} onValueChange={setTypeCode}>
                <SelectTrigger className="border-2 border-border/70 bg-white shadow-none">
                  <SelectValue placeholder="Выберите вид" />
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
              <>
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
                    pattern="\\d{7}"
                    placeholder="Например: 1234567"
                    className="border-2 border-border/70 bg-white shadow-none"
                  />
                </div>

                <div className="grid gap-2">
                  <Label>Номер договора</Label>
                  <Input
                    value={contractNumber}
                    onChange={(e) => setContractNumber(e.target.value)}
                    placeholder="Например: 01-2025/123"
                    className="border-2 border-border/70 bg-white shadow-none"
                  />
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
              <Label>Дата начала действия актива/обязательства</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                max={getTodayDateKey()}
                required
                className="border-2 border-border/70 bg-white shadow-none"
              />
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

            <div className="grid gap-2">
              <Label>Текущая сумма</Label>
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
                {loading ? "Добавляем..." : "Добавить"}
              </Button>
            </div>
            </form>
          </div>
        </DialogContent>
      </Dialog>

      <div className="space-y-6">
        {/* Общая итоговая плашка */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Calculator className="h-5 w-5 text-violet-600" />
              ИТОГО
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Активы:</span>
                <span className="font-semibold tabular-nums">{formatRub(totalAssets)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Обязательства:</span>
                <span className="font-semibold tabular-nums text-red-600">
                  -{formatRub(totalLiabilities)}
                </span>
              </div>
              <div className="pt-2 border-t flex justify-between items-center">
                <span className="font-medium">Чистые активы:</span>
                <span
                  className={[
                    "font-semibold tabular-nums",
                    netTotal < 0 ? "text-red-600" : "",
                  ].join(" ")}
                >
                  {netTotal < 0
                    ? `-${formatRub(Math.abs(netTotal))}`
                    : formatRub(netTotal)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <CategoryTable
          title="Денежные средства"
          items={cashItems}
          total={cashTotal}
          icon={Wallet}
          onAdd={() => openCreateModal("ASSET", CASH_TYPES)}
        />

        <CategoryTable
          title="Финансовые инструменты"
          items={financialInstrumentsItems}
          total={financialInstrumentsTotal}
          icon={TrendingUp}
          onAdd={() => openCreateModal("ASSET", FINANCIAL_INSTRUMENTS_TYPES)}
        />

        <CategoryTable
          title="Имущество"
          items={propertyItems}
          total={propertyTotal}
          icon={Home}
          onAdd={() => openCreateModal("ASSET", PROPERTY_TYPES)}
        />

        <CategoryTable
          title="Другие активы"
          items={otherAssetItems}
          total={otherAssetTotal}
          icon={Package}
          onAdd={() => openCreateModal("ASSET", OTHER_ASSET_TYPES)}
        />

        <CategoryTable
          title="Обязательства"
          items={liabilityItems}
          total={liabilityTotal}
          isLiability={true}
          icon={AlertCircle}
          onAdd={() => openCreateModal("LIABILITY", LIABILITY_TYPE_CODES)}
        />
      </div>

      {error && (
        <div className="mt-4 text-sm text-red-600">Ошибка: {error}</div>
      )}
    </main>
  );
}
