"use client";

import {
  Briefcase,
  Building2,
  Factory,
  GraduationCap,
  HeartPulse,
  Home,
  Landmark,
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
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useSession } from "next-auth/react";

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
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ItemSelector } from "@/components/item-selector";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  buildCategoryLookup,
  buildCategoryMaps,
  CategoryNode,
  makeCategoryPathKey,
} from "@/lib/categories";
import {
  createTransactionChain,
  deleteTransactionChain,
  fetchCategories,
  fetchCounterparties,
  fetchItems,
  fetchTransactions,
  fetchDeletedTransactions,
  fetchTransactionChains,
  CounterpartyOut,
  ItemOut,
  TransactionChainFrequency,
  TransactionChainMonthlyRule,
  TransactionChainOut,
  TransactionOut,
} from "@/lib/api";
import { buildItemTransactionCounts, getEffectiveItemKind } from "@/lib/item-utils";
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

function formatAmount(valueInCents: number) {
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valueInCents / 100);
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

  const [chains, setChains] = useState<TransactionChainOut[]>([]);
  const [items, setItems] = useState<ItemOut[]>([]);
  const [counterparties, setCounterparties] = useState<CounterpartyOut[]>([]);
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
  const [counterpartySearch, setCounterpartySearch] = useState("");
  const [counterpartyDropdownOpen, setCounterpartyDropdownOpen] = useState(false);
  const [counterpartyLoading, setCounterpartyLoading] = useState(false);
  const [counterpartyError, setCounterpartyError] = useState<string | null>(null);
  const [amountStr, setAmountStr] = useState("");
  const [amountCounterpartyStr, setAmountCounterpartyStr] = useState("");
  const [cat1, setCat1] = useState("");
  const [cat2, setCat2] = useState("");
  const [cat3, setCat3] = useState("");
  const [categoryQuery, setCategoryQuery] = useState("");
  const [isCategorySearchOpen, setIsCategorySearchOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [comment, setComment] = useState("");

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

  const formatCategoryLabel = (categoryId: number | null, txDirection: string) => {
    if (txDirection === "TRANSFER") return "Перевод";
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

  const normalizedCategoryQuery = useMemo(
    () => normalizeCategory(categoryQuery),
    [categoryQuery]
  );
  const filteredCategoryPaths = useMemo(() => {
    if (!normalizedCategoryQuery) return categoryPaths;
    return categoryPaths.filter((path) =>
      path.searchKey.includes(normalizedCategoryQuery)
    );
  }, [categoryPaths, normalizedCategoryQuery]);

  const itemTxCounts = useMemo(() => buildItemTransactionCounts(txs), [txs]);
  const itemsById = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items]
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
  const sortedCounterparties = useMemo(() => {
    return [...selectableCounterparties].sort((a, b) =>
      buildCounterpartyName(a).localeCompare(buildCounterpartyName(b), "ru", {
        sensitivity: "base",
      })
    );
  }, [selectableCounterparties]);
  const normalizedCounterpartySearch = useMemo(
    () => normalizeCounterpartySearch(counterpartySearch),
    [counterpartySearch]
  );
  const filteredCounterparties = useMemo(() => {
    if (!normalizedCounterpartySearch) return sortedCounterparties;
    return sortedCounterparties.filter((counterparty) =>
      normalizeCounterpartySearch(getCounterpartyFilterText(counterparty)).includes(
        normalizedCounterpartySearch
      )
    );
  }, [normalizedCounterpartySearch, sortedCounterparties]);

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

  useEffect(() => {
    if (!counterpartyId || counterpartySearch.trim()) return;
    const selected = counterpartiesById.get(counterpartyId);
    if (selected) {
      setCounterpartySearch(buildCounterpartyName(selected));
    }
  }, [counterpartyId, counterpartySearch, counterpartiesById]);

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
        ] =
          await Promise.all([
            fetchItems(),
            fetchTransactionChains(),
            fetchTransactions(),
            fetchDeletedTransactions(),
            fetchCategories(),
            fetchCounterparties({ include_deleted: true }),
          ]);
        setItems(itemsData);
        setChains(chainsData);
        setTxs(txData);
        setDeletedTxs(deletedData);
        setCategoryNodes(categoriesData);
        setCounterparties(counterpartiesData);
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
    "flex-1 min-w-0 rounded-sm px-3 py-2 text-sm font-medium text-center whitespace-nowrap transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500";

  const applyCategorySelection = (l1: string, l2: string, l3: string) => {
    setCat1(l1);
    setCat2(l2);
    setCat3(l3);
    setCategoryQuery(formatCategoryPath(l1, l2, l3));
  };

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
    setCounterpartySearch("");
    setCounterpartyDropdownOpen(false);
    setAmountStr("");
    setAmountCounterpartyStr("");
    setCategoryQuery("");
    setDescription("");
    setComment("");
    setFormError(null);
    const expenseMaps = buildCategoryMaps(categoryNodes, "EXPENSE");
    if (expenseMaps.l1.length > 0) {
      const nextL1 = expenseMaps.l1[0];
      const nextL2 = (expenseMaps.l2[nextL1] ?? [CATEGORY_PLACEHOLDER])[0];
      const nextL3 =
        nextL2 && nextL2 !== CATEGORY_PLACEHOLDER
          ? (expenseMaps.l3[nextL2] ?? [CATEGORY_PLACEHOLDER])[0]
          : CATEGORY_PLACEHOLDER;
      applyCategorySelection(
        nextL1,
        nextL2 ?? CATEGORY_PLACEHOLDER,
        nextL3 ?? CATEGORY_PLACEHOLDER
      );
    } else {
      setCat1("");
      setCat2("");
      setCat3("");
      setCategoryQuery("");
    }
  };

  useEffect(() => {
    if (isDialogOpen) {
      resetForm();
    }
  }, [isDialogOpen]);

  useEffect(() => {
    if (!isDialogOpen) return;
    if (direction === "TRANSFER") {
      setCat1("");
      setCat2("");
      setCat3("");
      setCategoryQuery("");
      return;
    }
    if (categoryMaps.l1.length > 0) {
      const nextL1 = categoryMaps.l1[0];
      const nextL2 = (categoryMaps.l2[nextL1] ?? [CATEGORY_PLACEHOLDER])[0];
      const nextL3 =
        nextL2 && nextL2 !== CATEGORY_PLACEHOLDER
          ? (categoryMaps.l3[nextL2] ?? [CATEGORY_PLACEHOLDER])[0]
          : CATEGORY_PLACEHOLDER;
      applyCategorySelection(
        nextL1,
        nextL2 ?? CATEGORY_PLACEHOLDER,
        nextL3 ?? CATEGORY_PLACEHOLDER
      );
    }
  }, [direction, categoryMaps, isDialogOpen]);

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
    if (primaryItem?.start_date && startDate < primaryItem.start_date) {
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
      if (counterpartyItem?.start_date && startDate < counterpartyItem.start_date) {
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
      description: description || null,
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

  const activeChains = useMemo(
    () => chains.filter((chain) => !chain.deleted_at),
    [chains]
  );
  const deletedChains = useMemo(
    () => chains.filter((chain) => chain.deleted_at),
    [chains]
  );

  return (
    <main className="flex min-h-screen flex-col gap-6 bg-slate-50 px-4 py-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Планирование</h1>
          <p className="text-sm text-muted-foreground">
            Цепочки плановых транзакций и расписание будущих операций.
          </p>
        </div>
        <Button
          type="button"
          className="bg-violet-600 text-white hover:bg-violet-700"
          onClick={() => setIsDialogOpen(true)}
        >
          <Plus className="h-4 w-4" />
          Добавить
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-muted-foreground">Загрузка...</div>
      ) : activeChains.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-muted-foreground">
          Пока нет цепочек плановых транзакций.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {activeChains.map((chain) => {
            const amountLabel = formatAmount(chain.amount_rub);
            const currency = itemsById.get(chain.primary_item_id)?.currency_code ?? "";
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
            const categoryLabel = formatCategoryLabel(
              chain.category_id,
              chain.direction
            );
            const counterparty = chain.counterparty_id
              ? counterpartiesById.get(chain.counterparty_id) ?? null
              : null;
            const counterpartyName = counterparty
              ? buildCounterpartyName(counterparty)
              : null;
            const CounterpartyIcon =
              counterparty?.entity_type === "PERSON"
                ? User
                : getLegalDefaultIcon(counterparty?.industry_id ?? null);

            return (
              <Card key={chain.id} className="bg-white">
                <CardHeader className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="text-lg">{chain.name}</CardTitle>
                      <Badge className={directionBadge}>{chainDirectionLabel}</Badge>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-rose-200 text-rose-600 hover:bg-rose-50"
                      onClick={() => setDeleteTarget(chain)}
                    >
                      <Trash2 className="h-4 w-4" />
                      Удалить
                    </Button>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {getFrequencyLabel(chain)}
                  </div>
                </CardHeader>
                <CardContent className="text-sm text-slate-700">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6 sm:flex-nowrap">
                    <div className="min-w-0 space-y-2">
                      <div>
                        С {formatDate(chain.start_date)} по{" "}
                        {formatDate(chain.end_date)}
                      </div>
                      <div className="font-semibold text-slate-900">
                        {chain.direction === "EXPENSE" ? "-" : "+"}
                        {amountLabel} {currency}
                      </div>
                      <div>{categoryLabel || "-"}</div>
                    </div>
                    <div className="shrink-0 space-y-1 text-xs text-muted-foreground text-right">
                      <div>Всего: {stats.total}</div>
                      <div>Реализовано: {stats.realized}</div>
                      <div>Просрочено: {stats.overdue}</div>
                      <div>Не наступило: {stats.upcoming}</div>
                      <div>Удалено: {stats.deleted}</div>
                    </div>
                  </div>
                  <div className="mt-2 space-y-2">
                    <div>
                      Основной счет:{" "}
                      <span className="font-medium text-slate-900">
                        {getItemName(chain.primary_item_id)}
                      </span>
                    </div>
                    {chain.direction === "TRANSFER" && (
                      <div>
                        Контрагент:{" "}
                        <span className="font-medium text-slate-900">
                          {getItemName(chain.counterparty_item_id)}
                        </span>
                      </div>
                    )}
                    {counterpartyName && (
                      <div className="flex items-center gap-2">
                        {counterparty?.logo_url ? (
                          <img
                            src={counterparty.logo_url}
                            alt=""
                            className="h-5 w-5 rounded border border-border/60 bg-white object-contain"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex h-5 w-5 items-center justify-center rounded border border-border/60 bg-white text-slate-500">
                            <CounterpartyIcon className="h-3.5 w-3.5" aria-hidden="true" />
                          </div>
                        )}
                        <span>
                          Контрагент:{" "}
                          <span className="font-medium text-slate-900">
                            {counterpartyName}
                          </span>
                        </span>
                      </div>
                    )}
                    {chain.description && (
                      <div className="text-muted-foreground">
                        {chain.description}
                      </div>
                    )}
                    {chain.comment && (
                      <div className="text-xs text-muted-foreground">
                        {chain.comment}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {deletedChains.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Удаленные</h2>
            <Badge className="bg-slate-100 text-slate-500">Удаленные</Badge>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {deletedChains.map((chain) => {
              const amountLabel = formatAmount(chain.amount_rub);
              const currency =
                itemsById.get(chain.primary_item_id)?.currency_code ?? "";
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
              const categoryLabel = formatCategoryLabel(
                chain.category_id,
                chain.direction
              );
              const counterparty = chain.counterparty_id
                ? counterpartiesById.get(chain.counterparty_id) ?? null
                : null;
              const counterpartyName = counterparty
                ? buildCounterpartyName(counterparty)
                : null;
              const CounterpartyIcon =
                counterparty?.entity_type === "PERSON"
                  ? User
                  : getLegalDefaultIcon(counterparty?.industry_id ?? null);
              const chainDirectionLabel =
                chain.direction === "INCOME"
                  ? "Доход"
                  : chain.direction === "EXPENSE"
                    ? "Расход"
                    : "Перевод";
              return (
                <Card key={chain.id} className="bg-white/70">
                  <CardHeader className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="text-lg text-slate-600">
                        {chain.name}
                      </CardTitle>
                      <Badge className={directionBadge}>{chainDirectionLabel}</Badge>
                      <Badge className="bg-slate-100 text-slate-500">
                        Удаленная
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {getFrequencyLabel(chain)}
                    </div>
                  </CardHeader>
                  <CardContent className="text-sm text-slate-600">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6 sm:flex-nowrap">
                      <div className="min-w-0 space-y-2">
                        <div>
                          С {formatDate(chain.start_date)} по{" "}
                          {formatDate(chain.end_date)}
                        </div>
                        <div className="font-semibold text-slate-700">
                          {chain.direction === "EXPENSE" ? "-" : "+"}
                          {amountLabel} {currency}
                        </div>
                        <div>{categoryLabel || "-"}</div>
                      </div>
                      <div className="shrink-0 space-y-1 text-xs text-muted-foreground text-right">
                        <div>Всего: {stats.total}</div>
                        <div>Реализовано: {stats.realized}</div>
                        <div>Просрочено: {stats.overdue}</div>
                        <div>Не наступило: {stats.upcoming}</div>
                        <div>Удалено: {stats.deleted}</div>
                      </div>
                    </div>
                    <div className="mt-2 space-y-2">
                      <div>
                        Основной счет:{" "}
                        <span className="font-medium text-slate-700">
                          {getItemName(chain.primary_item_id)}
                        </span>
                      </div>
                      {chain.direction === "TRANSFER" && (
                        <div>
                          Контрагент:{" "}
                        <span className="font-medium text-slate-700">
                          {getItemName(chain.counterparty_item_id)}
                        </span>
                      </div>
                    )}
                    {counterpartyName && (
                      <div className="flex items-center gap-2">
                        {counterparty?.logo_url ? (
                          <img
                            src={counterparty.logo_url}
                            alt=""
                            className="h-5 w-5 rounded border border-border/60 bg-white object-contain"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex h-5 w-5 items-center justify-center rounded border border-border/60 bg-white text-slate-500">
                            <CounterpartyIcon className="h-3.5 w-3.5" aria-hidden="true" />
                          </div>
                        )}
                        <span>
                          Контрагент:{" "}
                          <span className="font-medium text-slate-700">
                            {counterpartyName}
                          </span>
                        </span>
                      </div>
                    )}
                  </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
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
                className="border-2 border-border/70 bg-white shadow-none"
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
                  className="border-2 border-border/70 bg-white shadow-none"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label>Дата окончания</Label>
                <Input
                  type="date"
                  className="border-2 border-border/70 bg-white shadow-none"
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
                  <SelectTrigger className="border-2 border-border/70 bg-white shadow-none">
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
                    <SelectTrigger className="border-2 border-border/70 bg-white shadow-none">
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
                    <SelectTrigger className="border-2 border-border/70 bg-white shadow-none">
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
                    className="border-2 border-border/70 bg-white shadow-none"
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
                    className="border-2 border-border/70 bg-white shadow-none"
                    value={intervalDays}
                    onChange={(e) => setIntervalDays(e.target.value)}
                  />
                </div>
              )}
            </div>

            <div className="grid gap-2" role="group" aria-label="Направление">
              <div className="inline-flex w-full items-stretch overflow-hidden rounded-md border border-input bg-muted/60 p-0.5">
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
                      : "bg-white text-muted-foreground hover:bg-white"
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
                      : "bg-white text-muted-foreground hover:bg-white"
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
                      : "bg-white text-muted-foreground hover:bg-white"
                  }`}
                >
                  Перевод
                </button>
              </div>
            </div>

            <div className="grid gap-2 md:grid-cols-2">
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
                    itemCounts={itemTxCounts}
                  />
                </div>
              )}
            </div>

            <div className="grid gap-2">
              <Label>Контрагент</Label>
              <div className="relative">
                <Input
                  value={counterpartySearch}
                  onChange={(e) => {
                    setCounterpartySearch(e.target.value);
                    setCounterpartyId(null);
                    setCounterpartyDropdownOpen(true);
                  }}
                  onFocus={() => setCounterpartyDropdownOpen(true)}
                  onBlur={() =>
                    setTimeout(() => setCounterpartyDropdownOpen(false), 150)
                  }
                  placeholder="Начните вводить название"
                  className="border-2 border-border/70 bg-white shadow-none"
                />
                {counterpartyDropdownOpen && (
                  <div className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border/60 bg-white shadow-lg">
                    {counterpartyLoading && (
                      <div className="px-3 py-2 text-sm text-muted-foreground">
                        Загрузка...
                      </div>
                    )}
                    {!counterpartyLoading && counterpartyError && (
                      <div className="px-3 py-2 text-sm text-red-600">
                        {counterpartyError}
                      </div>
                    )}
                    {!counterpartyLoading &&
                      !counterpartyError &&
                      filteredCounterparties.length === 0 && (
                        <div className="px-3 py-2 text-sm text-muted-foreground">
                          Ничего не найдено
                        </div>
                      )}
                    {!counterpartyLoading &&
                      !counterpartyError &&
                      filteredCounterparties.map((counterparty) => {
                        const name = buildCounterpartyName(counterparty);
                        const DefaultIcon =
                          counterparty.entity_type === "PERSON"
                            ? User
                            : getLegalDefaultIcon(counterparty.industry_id);
                        return (
                          <button
                            key={counterparty.id}
                            type="button"
                            className={[
                              "flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50",
                              counterpartyId === counterparty.id ? "bg-slate-50" : "",
                            ].join(" ")}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                              setCounterpartyId(counterparty.id);
                              setCounterpartySearch(name);
                              setCounterpartyDropdownOpen(false);
                            }}
                          >
                            {counterparty.logo_url ? (
                              <img
                                src={counterparty.logo_url}
                                alt=""
                                className="h-8 w-8 rounded border border-border/60 bg-white object-contain"
                                loading="lazy"
                              />
                            ) : (
                              <div className="flex h-8 w-8 items-center justify-center rounded border border-border/60 bg-white text-slate-500">
                                <DefaultIcon className="h-4 w-4" aria-hidden="true" />
                              </div>
                            )}
                            <div className="flex flex-col">
                              <span className="text-sm font-medium">{name}</span>
                              {counterparty.entity_type === "LEGAL" &&
                                counterparty.full_name && (
                                  <span className="text-xs text-muted-foreground">
                                    {counterparty.full_name}
                                  </span>
                                )}
                            </div>
                          </button>
                        );
                      })}
                  </div>
                )}
              </div>
            </div>

            {isTransfer && isCrossCurrencyTransfer ? (
              <>
                <div className="grid gap-2">
                  <Label>{`Сумма списания (${primaryCurrency ?? "-"})`}</Label>
                  <Input
                    className="border-2 border-border/70 bg-white shadow-none"
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
                    className="border-2 border-border/70 bg-white shadow-none"
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
                  className="border-2 border-border/70 bg-white shadow-none"
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
                <div className="relative">
                  <Input
                    className="border-2 border-border/70 bg-white shadow-none"
                    value={categoryQuery}
                    onChange={(e) => {
                      setCategoryQuery(e.target.value);
                      setIsCategorySearchOpen(true);
                    }}
                    onFocus={() => setIsCategorySearchOpen(true)}
                    onBlur={() => {
                      setIsCategorySearchOpen(false);
                      setCategoryQuery(formatCategoryPath(cat1, cat2, cat3));
                    }}
                    onKeyDown={(event) => {
                      if (
                        event.key === "Enter" &&
                        isCategorySearchOpen &&
                        categoryQuery.trim()
                      ) {
                        const first = filteredCategoryPaths[0];
                        if (first) {
                          event.preventDefault();
                          applyCategorySelection(first.l1, first.l2, first.l3);
                          setIsCategorySearchOpen(false);
                        }
                      }
                    }}
                    placeholder="Начните вводить категорию"
                    type="text"
                  />
                  {isCategorySearchOpen && categoryQuery.trim() ? (
                    <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-border/70 bg-white p-1 shadow-lg">
                      {filteredCategoryPaths.length === 0 ? (
                        <div className="px-2 py-1 text-sm text-muted-foreground">
                          Ничего не найдено
                        </div>
                      ) : (
                        filteredCategoryPaths.map((option) => {
                          const isSelected =
                            option.l1 === cat1 &&
                            option.l2 === cat2 &&
                            option.l3 === cat3;
                          return (
                            <button
                              key={`${option.l1}||${option.l2}||${option.l3}`}
                              type="button"
                              className={`flex w-full items-start rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                                isSelected
                                  ? "bg-violet-50 text-violet-700"
                                  : "text-slate-700 hover:bg-slate-100"
                              }`}
                              onMouseDown={(event) => {
                                event.preventDefault();
                                applyCategorySelection(
                                  option.l1,
                                  option.l2,
                                  option.l3
                                );
                                setIsCategorySearchOpen(false);
                              }}
                            >
                              {option.label}
                            </button>
                          );
                        })
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
            )}

            <div className="grid gap-2">
              <Label>Описание</Label>
              <Input
                className="border-2 border-border/70 bg-white shadow-none"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Назначение транзакции"
              />
            </div>

            <div className="grid gap-2">
              <Label>Комментарий</Label>
              <Input
                className="border-2 border-border/70 bg-white shadow-none"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Комментарий"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                className="border-2 border-border/70 bg-white shadow-none"
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
