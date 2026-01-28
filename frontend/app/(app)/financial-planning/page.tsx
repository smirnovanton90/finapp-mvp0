"use client";

import {
  Briefcase,
  Building2,
  Factory,
  GraduationCap,
  HeartPulse,
  Home,
  Landmark,
  MessageSquare,
  MoreVertical,
  Plus,
  Shield,
  ShoppingCart,
  Trash2,
  Trophy,
  Truck,
  User,
  Wifi,
  Zap,
  type LucideIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useSession } from "next-auth/react";
import { useAccountingStart } from "@/components/accounting-start-context";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CategorySelector } from "@/components/category-selector";
import { ItemSelector } from "@/components/item-selector";
import { CounterpartySelector } from "@/components/counterparty-selector";
import { FilterPanel, FilterSection } from "@/components/filter-panel";
import { SegmentedSelector } from "@/components/ui/segmented-selector";
import { IconButton } from "@/components/ui/icon-button";
import { useSidebar } from "@/components/ui/sidebar-context";
import { AuthInput } from "@/components/ui/auth-input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  buildCategoryLookup,
  buildCategoryMaps,
  CategoryNode,
  makeCategoryPathKey,
} from "@/lib/categories";
import {
  CATEGORY_ICON_BY_NAME,
  CATEGORY_ICON_FALLBACK,
} from "@/lib/category-icons";
import { useCategoryIcon } from "@/hooks/use-category-icon";
import {
  createTransactionChain,
  deleteTransactionChain,
  fetchBanks,
  fetchCategories,
  fetchCounterparties,
  fetchCounterpartyIndustries,
  fetchItems,
  fetchTransactions,
  fetchDeletedTransactions,
  fetchTransactionChains,
  BankOut,
  API_BASE,
  CounterpartyOut,
  CounterpartyIndustryOut,
  ItemOut,
  TransactionChainFrequency,
  TransactionChainMonthlyRule,
  TransactionChainOut,
  TransactionOut,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  ACCENT,
  SIDEBAR_TEXT_ACTIVE,
  SIDEBAR_TEXT_INACTIVE,
  MODAL_BG,
  BACKGROUND_DT,
  GREEN_TRANSACTION,
  RED,
  PLACEHOLDER_COLOR_DARK,
  ACTIVE_TEXT_DARK,
} from "@/lib/colors";
import { PINK_GRADIENT as PINK_GRADIENT_CONST } from "@/lib/gradients";
import { useOnboarding } from "@/components/onboarding-context";
import { buildItemTransactionCounts, getEffectiveItemKind, formatAmount } from "@/lib/item-utils";
import { buildCounterpartyTransactionCounts } from "@/lib/counterparty-utils";
import { getItemTypeLabel } from "@/lib/item-types";

const CATEGORY_PLACEHOLDER = "-";
const CATEGORY_PATH_SEPARATOR = " / ";

type CategoryPathOption = {
  l1: string;
  l2: string;
  l3: string;
  label: string;
  searchKey: string;
};

const FREQUENCY_LABELS: Record<TransactionChainFrequency, string> = {
  DAILY: "Ежедневно",
  WEEKLY: "Еженедельно",
  MONTHLY: "Ежемесячно",
  REGULAR: "Регулярно",
};

const WEEKDAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

const INDUSTRY_ICON_BY_ID: Record<number, LucideIcon> = {
  1: Zap,
  2: Truck,
  3: ShoppingCart,
  4: Shield,
  5: Landmark,
  6: Wifi,
  7: Building2,
  8: GraduationCap,
  9: HeartPulse,
  10: Briefcase,
  11: Trophy,
  12: Home,
};

function getLegalDefaultIcon(industryId: number | null): LucideIcon {
  if (!industryId) return Factory;
  return INDUSTRY_ICON_BY_ID[industryId] ?? Factory;
}

function buildCounterpartyName(counterparty: CounterpartyOut) {
  if (counterparty.entity_type !== "PERSON") return counterparty.name;
  const parts = [
    counterparty.last_name,
    counterparty.first_name,
    counterparty.middle_name,
  ].filter(Boolean);
  return parts.join(" ") || counterparty.name;
}

function normalizeCounterpartySearch(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("ru");
}

function getCounterpartyFilterText(counterparty: CounterpartyOut) {
  const base = buildCounterpartyName(counterparty);
  const extra = counterparty.entity_type === "LEGAL" ? counterparty.full_name : null;
  return [base, extra].filter(Boolean).join(" ");
}


function formatChainAmount(chain: TransactionChainOut) {
  if (
    chain.amount_is_variable &&
    chain.amount_min_rub != null &&
    chain.amount_max_rub != null
  ) {
    if (chain.amount_min_rub === chain.amount_max_rub) {
      return formatAmount(chain.amount_min_rub);
    }
    return `${formatAmount(chain.amount_min_rub)}–${formatAmount(chain.amount_max_rub)}`;
  }
  return formatAmount(chain.amount_rub);
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

function getDateKey(value: string) {
  return value ? value.slice(0, 10) : "";
}

function parseRubToCents(input: string): number {
  const normalized = input.trim().replace(/\s/g, "").replace(",", ".");
  const value = Number(normalized);
  if (!Number.isFinite(value)) return NaN;
  return Math.round(value * 100);
}

function formatRubInput(raw: string): string {
  if (!raw) return "";

  const cleaned = raw.replace(/[^\d.,]/g, "");
  const endsWithSep = /[.,]$/.test(cleaned);
  const sepIndex = cleaned.search(/[.,]/);

  let intPart = "";
  let decPart = "";

  if (sepIndex === -1) {
    intPart = cleaned;
  } else {
    intPart = cleaned.slice(0, sepIndex);
    decPart = cleaned.slice(sepIndex + 1).replace(/[.,]/g, "");
  }

  if (sepIndex === 0) intPart = "0";

  intPart = intPart.replace(/^0+(?=\d)/, "");
  if (!intPart) intPart = "0";

  const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const formattedDec = decPart.slice(0, 2);

  if (endsWithSep && formattedDec.length === 0) {
    return `${formattedInt},`;
  }

  return formattedDec.length > 0 ? `${formattedInt},${formattedDec}` : formattedInt;
}

function normalizeRubOnBlur(value: string): string {
  const v = value.trim();
  if (!v) return "";

  if (v.endsWith(",")) return `${v}00`;

  const parts = v.split(",");
  const intPart = parts[0] || "0";
  const decPart = parts[1] ?? "";

  if (decPart.length === 0) return `${intPart},00`;
  if (decPart.length === 1) return `${intPart},${decPart}0`;

  return `${intPart},${decPart.slice(0, 2)}`;
}

function normalizeCategory(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("ru");
}

function formatCategoryPath(l1: string, l2: string, l3: string) {
  const parts = [l1, l2, l3]
    .map((value) => value?.trim())
    .filter((value) => value && value !== CATEGORY_PLACEHOLDER);
  return parts.join(CATEGORY_PATH_SEPARATOR);
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

export default function FinancialPlanningPage() {
  const { data: session } = useSession();
  const { accountingStartDate } = useAccountingStart();
  const { activeStep, isWizardOpen } = useOnboarding();
  const { isCollapsed } = useSidebar();

  const [chains, setChains] = useState<TransactionChainOut[]>([]);
  const [items, setItems] = useState<ItemOut[]>([]);
  const [counterparties, setCounterparties] = useState<CounterpartyOut[]>([]);
  const [industries, setIndustries] = useState<CounterpartyIndustryOut[]>([]);
  const [txs, setTxs] = useState<TransactionOut[]>([]);
  const [deletedTxs, setDeletedTxs] = useState<TransactionOut[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TransactionChainOut | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [chainName, setChainName] = useState("");
  const [startDate, setStartDate] = useState(getTodayKey());
  const [endDate, setEndDate] = useState(getTodayKey());
  const [frequency, setFrequency] = useState<TransactionChainFrequency>("MONTHLY");
  const [weeklyDay, setWeeklyDay] = useState<number>(() => {
    const jsDay = new Date().getDay();
    return (jsDay + 6) % 7;
  });
  const [monthlyMode, setMonthlyMode] =
    useState<"DAY_OF_MONTH" | TransactionChainMonthlyRule>("DAY_OF_MONTH");
  const [monthlyDay, setMonthlyDay] = useState(() => String(new Date().getDate()));
  const [intervalDays, setIntervalDays] = useState("1");

  const [direction, setDirection] = useState<"INCOME" | "EXPENSE" | "TRANSFER">(
    "EXPENSE"
  );
  const [primaryItemId, setPrimaryItemId] = useState<number | null>(null);
  const [counterpartyItemId, setCounterpartyItemId] = useState<number | null>(null);
  const [counterpartyId, setCounterpartyId] = useState<number | null>(null);
  const [counterpartyLoading, setCounterpartyLoading] = useState(false);
  const [counterpartyError, setCounterpartyError] = useState<string | null>(null);
  const [amountStr, setAmountStr] = useState("");
  const [amountCounterpartyStr, setAmountCounterpartyStr] = useState("");
  const [selectedCategoryPath, setSelectedCategoryPath] = useState<{
    l1: string;
    l2: string;
    l3: string;
  } | null>(null);
  const [comment, setComment] = useState("");
  const onboardingAppliedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isWizardOpen) {
      onboardingAppliedRef.current = null;
    }
  }, [isWizardOpen]);

  const [categoryNodes, setCategoryNodes] = useState<CategoryNode[]>([]);

  const categoryMaps = useMemo(() => {
    const scope = direction === "TRANSFER" ? undefined : direction;
    return buildCategoryMaps(categoryNodes, scope);
  }, [categoryNodes, direction]);

  const categoryLookup = useMemo(
    () => buildCategoryLookup(categoryNodes),
    [categoryNodes]
  );

  const normalizeCategoryValue = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || trimmed === CATEGORY_PLACEHOLDER) return "";
    return trimmed;
  };

  const resolveCategoryId = (l1: string, l2: string, l3: string) => {
    const key = makeCategoryPathKey(
      normalizeCategoryValue(l1),
      normalizeCategoryValue(l2),
      normalizeCategoryValue(l3)
    );
    return categoryLookup.pathToId.get(key) ?? null;
  };

  const resolveCategoryIcon = useCallback(
    (categoryId: number | null) => {
      if (!categoryId) return CATEGORY_ICON_FALLBACK;
      const path = categoryLookup.idToPath.get(categoryId);
      if (!path || path.length === 0) return CATEGORY_ICON_FALLBACK;
      for (let depth = path.length; depth >= 1; depth -= 1) {
        const key = makeCategoryPathKey(...path.slice(0, depth));
        const targetId = categoryLookup.pathToId.get(key);
        if (!targetId) continue;
        const iconName = categoryLookup.idToIcon.get(targetId);
        if (!iconName) continue;
        const normalizedIconName = iconName.trim();
        if (!normalizedIconName) continue;
        const Icon = CATEGORY_ICON_BY_NAME[normalizedIconName];
        if (Icon) return Icon;
      }
      return CATEGORY_ICON_FALLBACK;
    },
    [categoryLookup.idToIcon, categoryLookup.idToPath, categoryLookup.pathToId]
  );

  const getCategoryIconByPath = useCallback(
    (l1: string, l2: string, l3: string) => {
      const categoryId = resolveCategoryId(l1, l2, l3);
      return resolveCategoryIcon(categoryId);
    },
    [categoryLookup.pathToId, resolveCategoryIcon]
  );

  const formatCategoryLabel = (categoryId: number | null, txDirection: string) => {
    if (txDirection === "TRANSFER") return "Перевод";
    if (categoryId === null) return "-";
    const parts = categoryLookup.idToPath.get(categoryId) ?? [];
    const label = parts
      .map((part) => part?.trim())
      .filter((part) => part && part !== CATEGORY_PLACEHOLDER)
      .join(" / ");
    return label || "-";
  };

  const categoryPaths = useMemo(() => {
    const paths: CategoryPathOption[] = [];
    const addPath = (l1: string, l2: string, l3: string) => {
      const label = formatCategoryPath(l1, l2, l3);
      if (!label) return;
      paths.push({
        l1,
        l2,
        l3,
        label,
        searchKey: normalizeCategory(label),
      });
    };

    categoryMaps.l1.forEach((l1) => {
      addPath(l1, CATEGORY_PLACEHOLDER, CATEGORY_PLACEHOLDER);
      const l2List = categoryMaps.l2[l1] ?? [];
      l2List.forEach((l2) => {
        addPath(l1, l2, CATEGORY_PLACEHOLDER);
        const l3List = categoryMaps.l3[l2] ?? [];
        l3List.forEach((l3) => {
          addPath(l1, l2, l3);
        });
      });
    });
    return paths;
  }, [categoryMaps]);


  const itemTxCounts = useMemo(() => buildItemTransactionCounts(txs), [txs]);
  const itemsById = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items]
  );
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
  const itemBankLogoUrl = itemCounterpartyLogoUrl;
  const itemBankName = itemCounterpartyName;
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
  const resolveMinDate = useCallback(
    (item: ItemOut | null | undefined) => {
      if (!item) return null;
      let minDate = accountingStartDate ?? item.open_date ?? "";
      if (item.open_date && item.open_date > minDate) {
        minDate = item.open_date;
      }
      if (item.type_code === "bank_card" && item.card_account_id) {
        const account = itemsById.get(item.card_account_id);
        if (account?.open_date && account.open_date > minDate) {
          minDate = account.open_date;
        }
      }
      return minDate || null;
    },
    [accountingStartDate, itemsById]
  );
  const resolveItemEffectiveKind = (item: ItemOut) =>
    getEffectiveItemKind(item, item.current_value_rub);
  const counterpartiesById = useMemo(
    () => new Map(counterparties.map((counterparty) => [counterparty.id, counterparty])),
    [counterparties]
  );
  const selectableCounterparties = useMemo(
    () => counterparties.filter((counterparty) => !counterparty.deleted_at),
    [counterparties]
  );
  const counterpartyTxCounts = useMemo(() => buildCounterpartyTransactionCounts(txs), [txs]);

  const primaryCurrency = primaryItemId
    ? itemsById.get(primaryItemId)?.currency_code ?? null
    : null;
  const counterpartyCurrency = counterpartyItemId
    ? itemsById.get(counterpartyItemId)?.currency_code ?? null
    : null;
  const isTransfer = direction === "TRANSFER";
  const isIncome = direction === "INCOME";
  const isExpense = direction === "EXPENSE";
  const isCrossCurrencyTransfer =
    direction === "TRANSFER" &&
    primaryCurrency &&
    counterpartyCurrency &&
    primaryCurrency !== counterpartyCurrency;

  useEffect(() => {
    if (!isCrossCurrencyTransfer) {
      setAmountCounterpartyStr("");
    }
  }, [isCrossCurrencyTransfer]);


  const reloadPlanningData = async () => {
    const [chainsData, txData, deletedData] = await Promise.all([
      fetchTransactionChains(),
      fetchTransactions(),
      fetchDeletedTransactions(),
    ]);
    setChains(chainsData);
    setTxs(txData);
    setDeletedTxs(deletedData);
  };

  useEffect(() => {
    if (!session) return;
    const loadAll = async () => {
      setLoading(true);
      setError(null);
      setCounterpartyLoading(true);
      setCounterpartyError(null);
      try {
        const [
          itemsData,
          chainsData,
          txData,
          deletedData,
          categoriesData,
          counterpartiesData,
          industriesData,
        ] =
          await Promise.all([
            fetchItems(),
            fetchTransactionChains(),
            fetchTransactions(),
            fetchDeletedTransactions(),
            fetchCategories(),
            fetchCounterparties({ include_deleted: true }),
            fetchCounterpartyIndustries(),
          ]);
        setItems(itemsData);
        setChains(chainsData);
        setTxs(txData);
        setDeletedTxs(deletedData);
        setCategoryNodes(categoriesData);
        setCounterparties(counterpartiesData);
        setIndustries(industriesData);
      } catch (e: any) {
        setCounterpartyError(
          e?.message ?? "Не удалось загрузить контрагентов."
        );
        setError(e?.message ?? "Не удалось загрузить планирование.");
      } finally {
        setLoading(false);
        setCounterpartyLoading(false);
      }
    };
    loadAll();
  }, [session]);

  const segmentedButtonBase =
    "flex-1 min-w-0 rounded-full px-3 py-2 text-sm font-medium text-center whitespace-nowrap transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500";

  const applyCategorySelection = (l1: string, l2: string, l3: string) => {
    if (!l1 || (l1 === CATEGORY_PLACEHOLDER && !l2 && !l3)) {
      setSelectedCategoryPath(null);
    } else {
      setSelectedCategoryPath({ l1, l2, l3 });
    }
  };

  const cat1 = selectedCategoryPath?.l1 || "";
  const cat2 = selectedCategoryPath?.l2 || "";
  const cat3 = selectedCategoryPath?.l3 || "";

  const resetForm = () => {
    const today = getTodayKey();
    setChainName("");
    setStartDate(today);
    setEndDate(today);
    setFrequency("MONTHLY");
    const jsDay = new Date().getDay();
    setWeeklyDay((jsDay + 6) % 7);
    setMonthlyMode("DAY_OF_MONTH");
    setMonthlyDay(String(new Date().getDate()));
    setIntervalDays("1");
    setDirection("EXPENSE");
    setPrimaryItemId(null);
    setCounterpartyItemId(null);
    setCounterpartyId(null);
    setAmountStr("");
    setAmountCounterpartyStr("");
    setComment("");
    setFormError(null);
    setSelectedCategoryPath(null);
  };

  useEffect(() => {
    if (isDialogOpen) {
      resetForm();
    }
  }, [isDialogOpen]);

  useEffect(() => {
    if (!isWizardOpen || activeStep?.key !== "planning") return;
    if (onboardingAppliedRef.current === "planning") return;
    if (items.length === 0 || categoryNodes.length === 0) return;
    onboardingAppliedRef.current = "planning";
    setIsDialogOpen(true);

    const demoItem =
      items.find(
        (item) =>
          !item.archived_at &&
          !item.closed_at &&
          getEffectiveItemKind(item, item.current_value_rub) === "ASSET"
      ) ?? null;
    const today = getTodayKey();
    const endDateValue = (() => {
      const date = new Date();
      date.setDate(date.getDate() + 180);
      return date.toISOString().slice(0, 10);
    })();

    setChainName("Зарплата");
    setDirection("INCOME");
    setStartDate(today);
    setEndDate(endDateValue);
    setFrequency("MONTHLY");
    setMonthlyMode("DAY_OF_MONTH");
    setMonthlyDay("1");
    setAmountStr("120 000");
    if (demoItem) {
      setPrimaryItemId(demoItem.id);
    }

  }, [activeStep?.key, categoryNodes, isWizardOpen, items]);

  useEffect(() => {
    if (!isDialogOpen) return;
    if (direction === "TRANSFER") {
      setSelectedCategoryPath(null);
    }
  }, [direction, isDialogOpen]);

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);

    const name = chainName.trim();
    if (!name) {
      setFormError("Укажите название цепочки.");
      return;
    }

    if (!startDate || !endDate) {
      setFormError("Укажите даты начала и окончания цепочки.");
      return;
    }

    if (endDate < startDate) {
      setFormError("Дата окончания должна быть не раньше даты начала.");
      return;
    }

    const today = getTodayKey();
    if (startDate < today) {
      setFormError("Дата начала не может быть в прошлом.");
      return;
    }

    if (!primaryItemId) {
      setFormError("Выберите основной счет.");
      return;
    }

    const primaryItem = itemsById.get(primaryItemId);
    const primaryMinDate = resolveMinDate(primaryItem);
    if (primaryMinDate && startDate < primaryMinDate) {
      setFormError("Дата начала раньше даты открытия основного счета.");
      return;
    }

    if (direction === "TRANSFER") {
      if (!counterpartyItemId) {
        setFormError("Выберите счет контрагента.");
        return;
      }
      if (counterpartyItemId === primaryItemId) {
        setFormError("Счета перевода должны отличаться.");
        return;
      }
      const counterpartyItem = itemsById.get(counterpartyItemId);
      const counterpartyMinDate = resolveMinDate(counterpartyItem);
      if (counterpartyMinDate && startDate < counterpartyMinDate) {
        setFormError("Дата начала раньше даты открытия счета контрагента.");
        return;
      }
    }

    const amountCents = parseRubToCents(amountStr);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      setFormError("Укажите сумму больше нуля.");
      return;
    }

    let counterpartyCents: number | null = null;
    if (direction === "TRANSFER" && isCrossCurrencyTransfer) {
      counterpartyCents = parseRubToCents(amountCounterpartyStr);
      if (!Number.isFinite(counterpartyCents) || counterpartyCents <= 0) {
        setFormError("Укажите сумму контрагента больше нуля.");
        return;
      }
    }

    if (frequency === "WEEKLY" && weeklyDay === null) {
      setFormError("Выберите день недели.");
      return;
    }

    if (frequency === "MONTHLY" && monthlyMode === "DAY_OF_MONTH") {
      const dayValue = Number(monthlyDay);
      if (!Number.isFinite(dayValue) || dayValue < 1 || dayValue > 31) {
        setFormError("Укажите корректное число месяца.");
        return;
      }
    }
    let intervalValue: number | null = null;
    if (frequency === "REGULAR") {
      const parsed = Number(intervalDays);
      if (!Number.isFinite(parsed) || parsed < 1 || !Number.isInteger(parsed)) {
        setFormError("Укажите корректный интервал в днях.");
        return;
      }
      intervalValue = parsed;
    }

    const resolvedCategoryId =
      direction === "TRANSFER" ? null : resolveCategoryId(cat1, cat2, cat3);
    if (direction !== "TRANSFER" && !resolvedCategoryId) {
      setFormError("Выберите категорию из списка.");
      return;
    }
    const payload = {
      name,
      start_date: startDate,
      end_date: endDate,
      frequency,
      weekly_day: frequency === "WEEKLY" ? weeklyDay : null,
      monthly_day:
        frequency === "MONTHLY" && monthlyMode === "DAY_OF_MONTH"
          ? Number(monthlyDay)
          : null,
      monthly_rule:
        frequency === "MONTHLY" && monthlyMode !== "DAY_OF_MONTH"
          ? monthlyMode
          : null,
      interval_days: frequency === "REGULAR" ? intervalValue : null,
      primary_item_id: primaryItemId,
      counterparty_item_id: direction === "TRANSFER" ? counterpartyItemId : null,
      counterparty_id: counterpartyId ?? null,
      amount_rub: amountCents,
      amount_counterparty: direction === "TRANSFER" ? counterpartyCents : null,
      direction,
      category_id: resolvedCategoryId,
      comment: comment || null,
    };

    try {
      setIsSubmitting(true);
      await createTransactionChain(payload);
      await reloadPlanningData();
      setIsDialogOpen(false);
    } catch (e: any) {
      setFormError(e?.message ?? "Не удалось создать цепочку.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteChain = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteTransactionChain(deleteTarget.id);
      await reloadPlanningData();
      setDeleteTarget(null);
    } catch (e: any) {
      setError(e?.message ?? "Не удалось удалить цепочку.");
      setDeleteTarget(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const getItemName = (id: number | null) => {
    if (!id) return "-";
    return itemsById.get(id)?.name ?? `#${id}`;
  };

  const getFrequencyLabel = (chain: TransactionChainOut) => {
    if (chain.start_date === chain.end_date) {
      return "Разово";
    }
    if (chain.frequency === "DAILY") return FREQUENCY_LABELS.DAILY;
    if (chain.frequency === "WEEKLY") {
      const dayLabel =
        chain.weekly_day != null ? WEEKDAY_LABELS[chain.weekly_day] : "-";
      return `${FREQUENCY_LABELS.WEEKLY}, ${dayLabel}`;
    }
    if (chain.frequency === "REGULAR") {
      const intervalLabel =
        chain.interval_days != null ? `${chain.interval_days}` : "-";
      return `${FREQUENCY_LABELS.REGULAR}, каждые ${intervalLabel} дн.`;
    }
    if (chain.monthly_rule === "FIRST_DAY") {
      return `${FREQUENCY_LABELS.MONTHLY}, первый день`;
    }
    if (chain.monthly_rule === "LAST_DAY") {
      return `${FREQUENCY_LABELS.MONTHLY}, последний день`;
    }
    if (chain.monthly_day != null) {
      return `${FREQUENCY_LABELS.MONTHLY}, ${chain.monthly_day}-е число`;
    }
    return FREQUENCY_LABELS.MONTHLY;
  };

  const chainStatsById = useMemo(() => {
    const todayKey = getDateKey(new Date().toISOString());
    const map = new Map<
      number,
      {
        total: number;
        realized: number;
        overdue: number;
        upcoming: number;
        deleted: number;
      }
    >();
    const add = (
      chainId: number,
      field: "total" | "realized" | "overdue" | "upcoming" | "deleted"
    ) => {
      const current = map.get(chainId) ?? {
        total: 0,
        realized: 0,
        overdue: 0,
        upcoming: 0,
        deleted: 0,
      };
      current[field] += 1;
      map.set(chainId, current);
    };

    const combined = [
      ...txs.map((tx) => ({ ...tx, isDeleted: false })),
      ...deletedTxs.map((tx) => ({ ...tx, isDeleted: true })),
    ];

    combined.forEach((tx) => {
      if (tx.transaction_type !== "PLANNED") return;
      if (!tx.chain_id) return;
      add(tx.chain_id, "total");
      if (tx.isDeleted) {
        add(tx.chain_id, "deleted");
        return;
      }
      if (tx.status === "REALIZED") {
        add(tx.chain_id, "realized");
        return;
      }
      const dateKey = getDateKey(tx.transaction_date);
      if (dateKey && dateKey < todayKey) {
        add(tx.chain_id, "overdue");
      } else {
        add(tx.chain_id, "upcoming");
      }
    });

    return map;
  }, [txs, deletedTxs]);

  const [selectedDirections, setSelectedDirections] = useState<
    Set<TransactionChainOut["direction"]>
  >(new Set());
  const [showActiveChains, setShowActiveChains] = useState(true);
  const [showDeletedChains, setShowDeletedChains] = useState(false);
  const [filterAmountFrom, setFilterAmountFrom] = useState("");
  const [filterAmountTo, setFilterAmountTo] = useState("");
  const [selectedItemFilterIds, setSelectedItemFilterIds] = useState<Set<number>>(
    () => new Set()
  );
  const [selectedCategoryFilterKeys, setSelectedCategoryFilterKeys] = useState<
    Set<string>
  >(() => new Set());
  const [selectedCounterpartyFilterIds, setSelectedCounterpartyFilterIds] =
    useState<Set<number>>(() => new Set());
  const [commentFilter, setCommentFilter] = useState("");
  const [onlyWithOverdue, setOnlyWithOverdue] = useState(false);

  const commentQuery = useMemo(
    () => commentFilter.trim().toLocaleLowerCase("ru"),
    [commentFilter]
  );

  const minAmountFilter = useMemo(() => parseRubToCents(filterAmountFrom), [filterAmountFrom]);
  const maxAmountFilter = useMemo(() => parseRubToCents(filterAmountTo), [filterAmountTo]);

  const categoryFilterIds = useMemo(() => {
    if (selectedCategoryFilterKeys.size === 0) return null;
    const ids: number[] = [];
    selectedCategoryFilterKeys.forEach((key) => {
      const id = categoryLookup.pathToId.get(key);
      if (id) ids.push(id);
    });
    return ids;
  }, [selectedCategoryFilterKeys, categoryLookup.pathToId]);

  const visibleChains = useMemo(() => {
    return chains
      .filter((chain) => {
        if (!showActiveChains && !showDeletedChains) return false;
        if (!showActiveChains && !chain.deleted_at) return false;
        if (!showDeletedChains && chain.deleted_at) return false;
        return true;
      })
      .filter((chain) => {
        if (selectedDirections.size === 0) return true;
        return selectedDirections.has(chain.direction);
      })
      .filter((chain) => {
        if (minAmountFilter <= 0 && maxAmountFilter <= 0) return true;
        const minChainAmount =
          chain.amount_is_variable && chain.amount_min_rub != null
            ? chain.amount_min_rub
            : chain.amount_rub;
        const maxChainAmount =
          chain.amount_is_variable && chain.amount_max_rub != null
            ? chain.amount_max_rub
            : chain.amount_rub;
        if (Number.isFinite(minAmountFilter) && minAmountFilter > 0 && maxChainAmount < minAmountFilter) {
          return false;
        }
        if (Number.isFinite(maxAmountFilter) && maxAmountFilter > 0 && minChainAmount > maxAmountFilter) {
          return false;
        }
        return true;
      })
      .filter((chain) => {
        if (selectedItemFilterIds.size === 0) return true;
        return selectedItemFilterIds.has(chain.primary_item_id);
      })
      .filter((chain) => {
        if (!categoryFilterIds || categoryFilterIds.length === 0) return true;
        if (chain.category_id == null) return false;
        return categoryFilterIds.includes(chain.category_id);
      })
      .filter((chain) => {
        if (selectedCounterpartyFilterIds.size === 0) return true;
        if (!chain.counterparty_id) return false;
        return selectedCounterpartyFilterIds.has(chain.counterparty_id);
      })
      .filter((chain) => {
        if (!commentQuery) return true;
        const text = (chain.comment ?? "").toLocaleLowerCase("ru");
        return text.includes(commentQuery);
      })
      .filter((chain) => {
        if (!onlyWithOverdue) return true;
        const stats = chainStatsById.get(chain.id);
        return !!stats && stats.overdue > 0;
      })
      .sort((a, b) => a.start_date.localeCompare(b.start_date));
  }, [
    chains,
    selectedDirections,
    showActiveChains,
    showDeletedChains,
    minAmountFilter,
    maxAmountFilter,
    selectedItemFilterIds,
    categoryFilterIds,
    selectedCounterpartyFilterIds,
    commentQuery,
    onlyWithOverdue,
    chainStatsById,
  ]);

  const ChainCard = ({ chain }: { chain: TransactionChainOut }) => {
    const amountLabel = formatChainAmount(chain);
    const currency = itemsById.get(chain.primary_item_id)?.currency_code ?? "";
    const primaryItem = itemsById.get(chain.primary_item_id) ?? null;
    const stats = chainStatsById.get(chain.id) ?? {
      total: 0,
      realized: 0,
      overdue: 0,
      upcoming: 0,
      deleted: 0,
    };
    const directionBadge =
      chain.direction === "INCOME"
        ? "bg-emerald-50 text-emerald-700"
        : chain.direction === "EXPENSE"
          ? "bg-rose-50 text-rose-700"
          : "bg-violet-50 text-violet-700";
    const chainDirectionLabel =
      chain.direction === "INCOME"
        ? "Доход"
        : chain.direction === "EXPENSE"
          ? "Расход"
          : "Перевод";
    const categoryLabel = formatCategoryLabel(chain.category_id, chain.direction);
    const counterparty = chain.counterparty_id
      ? counterpartiesById.get(chain.counterparty_id) ?? null
      : null;
    const counterpartyName = counterparty ? buildCounterpartyName(counterparty) : null;
    const counterpartyLogo =
      counterparty?.entity_type === "PERSON"
        ? counterparty?.photo_url
        : counterparty?.logo_url;

    // Банк/контрагент по активу, как в карточке актива
    const primaryCounterparty =
      primaryItem?.counterparty_id != null
        ? counterpartiesById.get(primaryItem.counterparty_id) ?? null
        : null;
    const rawPrimaryLogoUrl =
      primaryCounterparty?.entity_type === "PERSON"
        ? primaryCounterparty?.photo_url
        : primaryCounterparty?.logo_url;
    const primaryLogoUrlFull = rawPrimaryLogoUrl
      ? rawPrimaryLogoUrl.startsWith("http")
        ? rawPrimaryLogoUrl
        : rawPrimaryLogoUrl.startsWith("/")
          ? `${API_BASE}${rawPrimaryLogoUrl}`
          : `${API_BASE}/${rawPrimaryLogoUrl}`
      : null;
    const CounterpartyIcon =
      counterparty?.entity_type === "PERSON"
        ? User
        : getLegalDefaultIcon(counterparty?.industry_id ?? null);
    const isDeleted = Boolean(chain.deleted_at);
    const stripeColor =
      chain.direction === "INCOME"
        ? GREEN_TRANSACTION
        : chain.direction === "EXPENSE"
          ? RED
          : ACCENT;
    const cardBg = isDeleted ? BACKGROUND_DT : MODAL_BG;
    const textColor = isDeleted ? PLACEHOLDER_COLOR_DARK : ACTIVE_TEXT_DARK;

    // Используем хук для получения иконки категории (та же логика, что и в транзакции)
    const { categoryIcon3dPath, CategoryIcon: CategoryIconComponent, setCategoryIconFormat } =
      useCategoryIcon(chain.category_id, categoryLookup);

    return (
      <div
        className="relative w-full rounded-lg overflow-hidden"
        style={{ backgroundColor: cardBg }}
      >
        <div
          className="absolute left-0 top-0 bottom-0 w-[7px] rounded-l-md"
          style={{ backgroundColor: stripeColor }}
        />

        <div className="p-[12px] pl-[19px] pr-[60px]">
          {/* Кнопка действий фиксированно в правом верхнем углу карточки */}
          {!isDeleted && (
            <div className="absolute top-[12px] right-[16px]">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <IconButton aria-label="Открыть меню действий">
                    <MoreVertical />
                  </IconButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => setDeleteTarget(chain)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Удалить цепочку
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}

          <div className="flex items-start justify-between gap-4">
            {/* Иконка категории 100x100 */}
            <div className="w-[100px] h-[100px] flex items-center justify-center shrink-0">
              {categoryIcon3dPath ? (
                <img
                  src={categoryIcon3dPath}
                  alt=""
                  className="w-[100px] h-[100px] object-contain"
                  style={{ filter: "drop-shadow(0 34px 48.8px rgba(0,0,0,0.25))" }}
                  onError={() => {
                    // Fallback PNG -> WebP -> 2D иконка
                    if (categoryIcon3dPath.endsWith(".png")) {
                      setCategoryIconFormat("webp");
                    } else {
                      setCategoryIconFormat(null);
                    }
                  }}
                />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center"
                  style={{ filter: "drop-shadow(0 34px 48.8px rgba(0,0,0,0.25))" }}
                >
                  <CategoryIconComponent
                    className="w-16 h-16"
                    style={{ color: ACCENT }}
                    strokeWidth={1.5}
                  />
                </div>
              )}
            </div>

            {/* Текстовый контент */}
            <div className="flex-1 min-w-0 flex flex-col gap-3 items-center">
              {/* Верхняя строка и заголовок */}
              <div className="flex flex-col gap-1 max-w-full break-words">
                <div
                  className="text-sm font-normal text-center break-words max-w-full"
                  style={{ color: PLACEHOLDER_COLOR_DARK }}
                >
                  {categoryLabel}
                </div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3
                      className={cn(
                        "text-2xl font-medium text-center break-words max-w-full",
                        isDeleted && "opacity-70"
                      )}
                      style={{ color: textColor }}
                    >
                      {chain.name}
                    </h3>
                    <div
                      className="mt-1 text-sm font-normal text-center"
                      style={{ color: PLACEHOLDER_COLOR_DARK }}
                    >
                      {getFrequencyLabel(chain)}
                      <br />
                      с {formatDate(chain.start_date)} по {formatDate(chain.end_date)}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    {isDeleted && (
                      <Badge
                        className="bg-muted/10 text-xs"
                        style={{ color: PLACEHOLDER_COLOR_DARK }}
                      >
                        Удаленная
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

            </div>
          </div>

          {/* Блок Актив / Контрагент / Сумма — на всю ширину карточки */}
          <div className="mt-3 grid grid-cols-3 gap-x-4 gap-y-1 justify-items-center">
            {/* Заголовки */}
            <div
              className="flex min-h-0 w-full flex-col items-center justify-center text-center"
              style={{ color: PLACEHOLDER_COLOR_DARK }}
            >
              <span className="text-sm font-normal">Актив</span>
            </div>
            <div
              className="flex min-h-0 w-full flex-col items-center justify-center text-center"
              style={{ color: PLACEHOLDER_COLOR_DARK }}
            >
              <span className="text-sm font-normal">Контрагент</span>
            </div>
            <div
              className="flex min-h-0 w-full flex-col items-center justify-center text-center"
              style={{ color: PLACEHOLDER_COLOR_DARK }}
            >
              <span className="text-sm font-normal">Сумма</span>
            </div>

            {/* Значения */}
            <div className="flex h-9 w-full items-center justify-center text-sm font-normal">
              <div className="flex items-center gap-2">
                {primaryItem && (
                  <div className="h-5 w-5 rounded flex items-center justify-center overflow-hidden"
                    style={{
                      border: `1px solid ${PLACEHOLDER_COLOR_DARK}40`,
                      backgroundColor: `${PLACEHOLDER_COLOR_DARK}10`,
                    }}
                  >
                    {primaryLogoUrlFull ? (
                      <img
                        src={primaryLogoUrlFull}
                        alt=""
                        className="h-5 w-5 rounded object-contain"
                      />
                    ) : (
                      <>
                        {primaryCounterparty && (
                          (primaryCounterparty.entity_type === "PERSON" ? (
                            <User
                              className="h-3.5 w-3.5"
                              style={{ color: PLACEHOLDER_COLOR_DARK }}
                              strokeWidth={1.5}
                            />
                          ) : (
                            <>
                              {(() => {
                                const Icon = getLegalDefaultIcon(
                                  primaryCounterparty.industry_id ?? null
                                );
                                return (
                                  <Icon
                                    className="h-3.5 w-3.5"
                                    style={{ color: PLACEHOLDER_COLOR_DARK }}
                                    strokeWidth={1.5}
                                  />
                                );
                              })()}
                            </>
                          ))
                        )}
                      </>
                    )}
                  </div>
                )}
                <span style={{ color: textColor }}>
                  {getItemName(chain.primary_item_id)}
                </span>
              </div>
            </div>
            <div className="flex h-9 w-full items-center justify-center text-sm font-normal">
              {counterpartyName ? (
                <div className="flex items-center gap-2">
                  <div
                    className="h-5 w-5 rounded flex items-center justify-center overflow-hidden"
                    style={{
                      border: `1px solid ${PLACEHOLDER_COLOR_DARK}40`,
                      backgroundColor: `${PLACEHOLDER_COLOR_DARK}10`,
                    }}
                  >
                    {counterpartyLogo ? (
                      <img
                        src={counterpartyLogo}
                        alt=""
                        className="h-5 w-5 rounded object-contain"
                      />
                    ) : (
                      <CounterpartyIcon
                        className="h-3.5 w-3.5"
                        aria-hidden="true"
                        style={{ color: PLACEHOLDER_COLOR_DARK }}
                      />
                    )}
                  </div>
                  <span style={{ color: textColor }}>{counterpartyName}</span>
                </div>
              ) : (
                <span style={{ color: textColor }}>—</span>
              )}
            </div>
            <div className="flex h-9 w-full items-center justify-center">
              <span
                className="text-2xl font-medium"
                style={{
                  background: isDeleted ? undefined : PINK_GRADIENT_CONST,
                  WebkitBackgroundClip: isDeleted ? undefined : "text",
                  WebkitTextFillColor: isDeleted ? PLACEHOLDER_COLOR_DARK : "transparent",
                  backgroundClip: isDeleted ? undefined : "text",
                }}
              >
                {amountLabel}
              </span>
            </div>
          </div>

          {/* Комментарий внизу карточки на всю ширину */}
          {chain.comment && chain.comment.trim() && (
            <div className="mt-3 flex items-center gap-2">
              <MessageSquare
                style={{
                  width: 20,
                  height: 20,
                  color: PLACEHOLDER_COLOR_DARK,
                  flexShrink: 0,
                }}
              />
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 400,
                  color: PLACEHOLDER_COLOR_DARK,
                }}
              >
                {chain.comment}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <main
      className={cn(
        "min-h-screen pb-8",
        isCollapsed ? "pl-0" : "pl-0"
      )}
    >
      {error && <div className="mb-4 text-sm text-red-600">{error}</div>}

      <div className="flex flex-col gap-6 lg:flex-row">
        <FilterPanel
          addButton={(collapsed) => (
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  className="w-full h-10 rounded-[9px] border-0 flex items-center justify-center transition-colors hover:opacity-90 text-sm font-normal"
                  style={{ backgroundColor: ACCENT }}
                  aria-label={collapsed ? "Добавить цепочку" : undefined}
                >
                  <Plus
                    className={cn("h-5 w-5", !collapsed && "mr-2")}
                    style={{ color: "white", opacity: 0.85 }}
                  />
                  {!collapsed && (
                    <span style={{ color: "white", opacity: 0.85 }}>Добавить цепочку</span>
                  )}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Новая цепочка транзакций</DialogTitle>
                </DialogHeader>
                <form className="grid gap-4" onSubmit={handleCreate}>
            {formError && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                {formError}
              </div>
            )}

            <div className="grid gap-2">
              <Label>Название цепочки</Label>
              <Input
                className="border-2 border-border/70 bg-card shadow-none"
                value={chainName}
                onChange={(e) => setChainName(e.target.value)}
                placeholder="Например, аренда офиса"
              />
            </div>

            <div className="grid gap-2 md:grid-cols-2">
              <div className="grid gap-2">
                <Label>Дата начала</Label>
                <Input
                  type="date"
                  className="border-2 border-border/70 bg-card shadow-none"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label>Дата окончания</Label>
                <Input
                  type="date"
                  className="border-2 border-border/70 bg-card shadow-none"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-2 md:grid-cols-2">
              <div className="grid gap-2">
                <Label>Частота</Label>
                <Select
                  value={frequency}
                  onValueChange={(value) =>
                    setFrequency(value as TransactionChainFrequency)
                  }
                >
                  <SelectTrigger className="border-2 border-border/70 bg-card shadow-none">
                    <SelectValue placeholder="Выберите частоту" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DAILY">Ежедневно</SelectItem>
                    <SelectItem value="WEEKLY">Еженедельно</SelectItem>
                    <SelectItem value="MONTHLY">Ежемесячно</SelectItem>
                    <SelectItem value="REGULAR">Регулярно</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {frequency === "WEEKLY" && (
                <div className="grid gap-2">
                  <Label>День недели</Label>
                  <Select
                    value={String(weeklyDay)}
                    onValueChange={(value) => setWeeklyDay(Number(value))}
                  >
                    <SelectTrigger className="border-2 border-border/70 bg-card shadow-none">
                      <SelectValue placeholder="Выберите день недели" />
                    </SelectTrigger>
                    <SelectContent>
                      {WEEKDAY_LABELS.map((label, index) => (
                        <SelectItem key={label} value={String(index)}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {frequency === "MONTHLY" && (
                <div className="grid gap-2">
                  <Label>Правило месяца</Label>
                  <Select
                    value={monthlyMode}
                    onValueChange={(value) =>
                      setMonthlyMode(
                        value as "DAY_OF_MONTH" | TransactionChainMonthlyRule
                      )
                    }
                  >
                    <SelectTrigger className="border-2 border-border/70 bg-card shadow-none">
                      <SelectValue placeholder="Выберите правило" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DAY_OF_MONTH">Число месяца</SelectItem>
                      <SelectItem value="FIRST_DAY">Первый день</SelectItem>
                      <SelectItem value="LAST_DAY">Последний день</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {frequency === "MONTHLY" && monthlyMode === "DAY_OF_MONTH" && (
                <div className="grid gap-2">
                  <Label>Число месяца</Label>
                  <Input
                    type="number"
                    min={1}
                    max={31}
                    className="border-2 border-border/70 bg-card shadow-none"
                    value={monthlyDay}
                    onChange={(e) => setMonthlyDay(e.target.value)}
                  />
                </div>
              )}
              {frequency === "REGULAR" && (
                <div className="grid gap-2">
                  <Label>Интервал (дней)</Label>
                  <Input
                    type="number"
                    min={1}
                    className="border-2 border-border/70 bg-card shadow-none"
                    value={intervalDays}
                    onChange={(e) => setIntervalDays(e.target.value)}
                  />
                </div>
              )}
            </div>

            <div className="grid gap-2" role="group" aria-label="Направление">
              <div className="inline-flex w-full items-stretch overflow-hidden rounded-full border border-input bg-muted/60 p-0.5">
                <button
                  type="button"
                  aria-pressed={isIncome}
                  onClick={() => {
                    setDirection("INCOME");
                    setCounterpartyItemId(null);
                  }}
                  className={`${segmentedButtonBase} ${
                    isIncome
                      ? "bg-green-50 text-green-700"
                      : "bg-card text-muted-foreground hover:bg-accent"
                  }`}
                >
                  Доход
                </button>
                <button
                  type="button"
                  aria-pressed={isExpense}
                  onClick={() => {
                    setDirection("EXPENSE");
                    setCounterpartyItemId(null);
                  }}
                  className={`${segmentedButtonBase} ${
                    isExpense
                      ? "bg-red-50 text-red-700"
                      : "bg-card text-muted-foreground hover:bg-accent"
                  }`}
                >
                  Расход
                </button>
                <button
                  type="button"
                  aria-pressed={isTransfer}
                  onClick={() => {
                    setDirection("TRANSFER");
                    setCounterpartyItemId(null);
                  }}
                  className={`${segmentedButtonBase} ${
                    isTransfer
                      ? "bg-violet-50 text-violet-700"
                      : "bg-card text-muted-foreground hover:bg-accent"
                  }`}
                >
                  Перевод
                </button>
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Актив/обязательство</Label>
              <ItemSelector
                items={items}
                selectedIds={primaryItemId ? [primaryItemId] : []}
                onChange={(ids) => setPrimaryItemId(ids[0] ?? null)}
                selectionMode="single"
                placeholder="Выберите счет"
                getItemTypeLabel={getItemTypeLabel}
                getItemKind={resolveItemEffectiveKind}
                getBankLogoUrl={itemBankLogoUrl}
                getBankName={itemBankName}
                getItemBalance={getItemDisplayBalanceCents}
                itemCounts={itemTxCounts}
              />
            </div>
            {isTransfer && (
              <div className="grid gap-2">
                <Label>Контрагент</Label>
                <ItemSelector
                  items={items.filter((item) => item.id !== primaryItemId)}
                  selectedIds={counterpartyItemId ? [counterpartyItemId] : []}
                  onChange={(ids) => setCounterpartyItemId(ids[0] ?? null)}
                  selectionMode="single"
                  placeholder="Выберите счет"
                  getItemTypeLabel={getItemTypeLabel}
                  getItemKind={resolveItemEffectiveKind}
                  getBankLogoUrl={itemBankLogoUrl}
                  getBankName={itemBankName}
                  getItemBalance={getItemDisplayBalanceCents}
                  itemCounts={itemTxCounts}
                />
              </div>
            )}

            <div className="grid gap-2">
              <Label>Контрагент</Label>
              <CounterpartySelector
                counterparties={selectableCounterparties}
                selectedIds={counterpartyId ? [counterpartyId] : []}
                onChange={(ids) => setCounterpartyId(ids[0] ?? null)}
                selectionMode="single"
                placeholder="Начните вводить название"
                industries={industries}
                disabled={counterpartyLoading}
                counterpartyCounts={counterpartyTxCounts}
              />
              {counterpartyError && (
                <p className="text-xs text-red-600">{counterpartyError}</p>
              )}
            </div>

            {isTransfer && isCrossCurrencyTransfer ? (
              <>
                <div className="grid gap-2">
                  <Label>{`Сумма списания (${primaryCurrency ?? "-"})`}</Label>
                  <Input
                    className="border-2 border-border/70 bg-card shadow-none"
                    value={amountStr}
                    onChange={(e) => setAmountStr(formatRubInput(e.target.value))}
                    onBlur={() => setAmountStr((prev) => normalizeRubOnBlur(prev))}
                    inputMode="decimal"
                    placeholder="Например: 1 234,56"
                  />
                </div>
                <div className="grid gap-2">
                  <Label>{`Сумма поступления (${counterpartyCurrency ?? "-"})`}</Label>
                  <Input
                    className="border-2 border-border/70 bg-card shadow-none"
                    value={amountCounterpartyStr}
                    onChange={(e) =>
                      setAmountCounterpartyStr(formatRubInput(e.target.value))
                    }
                    onBlur={() =>
                      setAmountCounterpartyStr((prev) => normalizeRubOnBlur(prev))
                    }
                    inputMode="decimal"
                    placeholder="Например: 1 234,56"
                  />
                </div>
              </>
            ) : (
              <div className="grid gap-2">
                <Label>
                  {primaryCurrency ? `Сумма (${primaryCurrency})` : "Сумма"}
                </Label>
                <Input
                  className="border-2 border-border/70 bg-card shadow-none"
                  value={amountStr}
                  onChange={(e) => setAmountStr(formatRubInput(e.target.value))}
                  onBlur={() => setAmountStr((prev) => normalizeRubOnBlur(prev))}
                  inputMode="decimal"
                  placeholder="Например: 1 234,56"
                />
              </div>
            )}

            {!isTransfer && (
              <div className="grid gap-2">
                <Label>Категория</Label>
                <CategorySelector
                  categoryNodes={categoryNodes}
                  selectedPath={selectedCategoryPath}
                  onChange={(path) => {
                    if (path) {
                      applyCategorySelection(path.l1, path.l2, path.l3);
                    } else {
                      applyCategorySelection("", "", "");
                    }
                  }}
                  placeholder="Начните вводить категорию"
                  direction={direction}
                  disabled={isSubmitting}
                />
              </div>
            )}

            <div className="grid gap-2">
              <Label>Комментарий</Label>
              <Input
                className="border-2 border-border/70 bg-card shadow-none"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Комментарий"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                className="border-2 border-border/70 bg-card shadow-none"
                onClick={() => setIsDialogOpen(false)}
                disabled={isSubmitting}
              >
                Отмена
              </Button>
              <Button
                type="submit"
                className="bg-violet-600 text-white hover:bg-violet-700"
                disabled={isSubmitting}
              >
                Создать цепочку
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
          )}
          additionalActions={[]}
        >
          <FilterSection
            label="Вид цепочки"
            onReset={() => setSelectedDirections(new Set())}
            showReset={selectedDirections.size > 0}
          >
            <SegmentedSelector
              options={[
                { value: "INCOME", label: "Доход", colorScheme: "green" },
                { value: "EXPENSE", label: "Расход", colorScheme: "red" },
                { value: "TRANSFER", label: "Перевод", colorScheme: "purple" },
              ]}
              value={selectedDirections}
              onChange={(value) => {
                if (value instanceof Set) {
                  setSelectedDirections(value as Set<TransactionChainOut["direction"]>);
                } else if (Array.isArray(value)) {
                  setSelectedDirections(
                    new Set(value as TransactionChainOut["direction"][])
                  );
                }
              }}
              multiple={true}
            />
          </FilterSection>

          <FilterSection
            label="Сумма цепочки"
            onReset={() => {
              setFilterAmountFrom("");
              setFilterAmountTo("");
            }}
            showReset={!!filterAmountFrom || !!filterAmountTo}
          >
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 min-w-0">
                <div className="flex-1 min-w-0 basis-0">
                  <div className="[&_div.relative.flex.items-center]:h-10 [&_input]:text-sm [&_input]:font-normal [&_input:not(:placeholder-shown)]:text-white min-w-0">
                    <AuthInput
                      type="text"
                      inputMode="decimal"
                      placeholder="От"
                      value={filterAmountFrom}
                      onChange={(e) =>
                        setFilterAmountFrom(formatRubInput(e.target.value))
                      }
                      onBlur={() =>
                        setFilterAmountFrom((prev) => normalizeRubOnBlur(prev))
                      }
                    />
                  </div>
                </div>
                <span className="text-sm shrink-0" style={{ color: SIDEBAR_TEXT_INACTIVE }}>
                  —
                </span>
                <div className="flex-1 min-w-0 basis-0">
                  <div className="[&_div.relative.flex.items-center]:h-10 [&_input]:text-sm [&_input]:font-normal [&_input:not(:placeholder-shown)]:text-white min-w-0">
                    <AuthInput
                      type="text"
                      inputMode="decimal"
                      placeholder="До"
                      value={filterAmountTo}
                      onChange={(e) => setFilterAmountTo(formatRubInput(e.target.value))}
                      onBlur={() =>
                        setFilterAmountTo((prev) => normalizeRubOnBlur(prev))
                      }
                    />
                  </div>
                </div>
              </div>
            </div>
          </FilterSection>

          <FilterSection
            label="Активы/обязательства"
            onReset={() => setSelectedItemFilterIds(new Set())}
            showReset={selectedItemFilterIds.size > 0}
          >
            <div className="space-y-3">
              <ItemSelector
                items={items}
                selectedIds={Array.from(selectedItemFilterIds)}
                onChange={(ids) => setSelectedItemFilterIds(new Set(ids))}
                selectionMode="multi"
                placeholder="Начните вводить название"
                getItemTypeLabel={getItemTypeLabel}
                getItemKind={resolveItemEffectiveKind}
                getBankLogoUrl={itemBankLogoUrl}
                getBankName={itemBankName}
                getItemBalance={getItemDisplayBalanceCents}
                itemCounts={itemTxCounts}
              />
            </div>
          </FilterSection>

          <FilterSection
            label="Категории"
            onReset={() => setSelectedCategoryFilterKeys(new Set())}
            showReset={selectedCategoryFilterKeys.size > 0}
          >
            <div className="space-y-3">
              <CategorySelector
                categoryNodes={categoryNodes}
                selectedPathKeys={selectedCategoryFilterKeys}
                onTogglePath={(path) => {
                  const key = makeCategoryPathKey(
                    normalizeCategoryValue(path.l1),
                    normalizeCategoryValue(path.l2),
                    normalizeCategoryValue(path.l3)
                  );
                  setSelectedCategoryFilterKeys((prev) => {
                    const next = new Set(prev);
                    if (next.has(key)) {
                      next.delete(key);
                    } else {
                      next.add(key);
                    }
                    return next;
                  });
                }}
                selectionMode="multi"
                placeholder="Поиск категории"
                showChips={true}
              />
            </div>
          </FilterSection>

          <FilterSection
            label="Контрагенты"
            onReset={() => setSelectedCounterpartyFilterIds(new Set())}
            showReset={selectedCounterpartyFilterIds.size > 0}
          >
            <div className="space-y-3">
              <CounterpartySelector
                counterparties={selectableCounterparties}
                selectedIds={Array.from(selectedCounterpartyFilterIds)}
                onChange={(ids) => setSelectedCounterpartyFilterIds(new Set(ids))}
                selectionMode="multi"
                placeholder="Начните вводить название"
                industries={industries}
                counterpartyCounts={counterpartyTxCounts}
                showChips={true}
              />
            </div>
          </FilterSection>

          <FilterSection
            label="Комментарий"
            onReset={() => setCommentFilter("")}
            showReset={!!commentFilter}
          >
            <div className="space-y-3">
              <div className="[&_div.relative.flex.items-center]:h-10 [&_input]:text-sm [&_input]:font-normal [&_input:not(:placeholder-shown)]:text-white">
                <AuthInput
                  type="text"
                  placeholder="Начните вводить текст"
                  value={commentFilter}
                  onChange={(e) => setCommentFilter(e.target.value)}
                />
              </div>
            </div>
          </FilterSection>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm font-medium" style={{ color: SIDEBAR_TEXT_ACTIVE }}>
                Только цепочки с просроченными транзакциями
              </span>
              <Switch checked={onlyWithOverdue} onCheckedChange={setOnlyWithOverdue} />
            </div>
          </div>

          <FilterSection
            label="Статус"
            onReset={() => {
              setShowActiveChains(true);
              setShowDeletedChains(false);
            }}
            showReset={!showActiveChains || !showDeletedChains}
          >
            <SegmentedSelector
              options={[
                { value: "active", label: "Активные", colorScheme: "purple" },
                { value: "deleted", label: "Удаленные", colorScheme: "red" },
              ]}
              value={[
                ...(showActiveChains ? ["active"] : []),
                ...(showDeletedChains ? ["deleted"] : []),
              ]}
              onChange={(value) => {
                const values = Array.isArray(value) ? value : [];
                setShowActiveChains(values.includes("active"));
                setShowDeletedChains(values.includes("deleted"));
              }}
              multiple={true}
            />
          </FilterSection>
        </FilterPanel>

        <div className="flex-1 min-w-0 pt-[30px]">
          <div className="w-[900px] mx-auto">
            {loading ? (
              <div className="text-sm text-muted-foreground">Загрузка...</div>
            ) : visibleChains.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
                Пока нет цепочек плановых транзакций.
              </div>
            ) : (
              <div className="space-y-4">
                {visibleChains.map((chain) => (
                  <ChainCard key={chain.id} chain={chain} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить цепочку?</AlertDialogTitle>
            <AlertDialogDescription>
              Все плановые транзакции из этой цепочки будут перенесены в удаленные.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 text-white hover:bg-rose-700"
              onClick={handleDeleteChain}
              disabled={isDeleting}
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
