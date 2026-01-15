"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useSession } from "next-auth/react";
import { useAccountingStart } from "@/components/accounting-start-context";
import { Pencil, Plus, Trash2 } from "lucide-react";

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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CategorySelector } from "@/components/category-selector";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  buildCategoryDescendants,
  buildCategoryLookup,
  buildCategoryMaps,
  CategoryNode,
  makeCategoryPathKey,
} from "@/lib/categories";
import {
  CATEGORY_ICON_BY_NAME,
  CATEGORY_ICON_FALLBACK,
} from "@/lib/category-icons";
import {
  createLimit,
  deleteLimit,
  fetchCategories,
  fetchLimits,
  fetchTransactions,
  LimitCreate,
  LimitOut,
  LimitPeriod,
  TransactionOut,
  updateLimit,
} from "@/lib/api";
import { useOnboarding } from "@/components/onboarding-context";

const CATEGORY_PLACEHOLDER = "-";
const CATEGORY_PATH_SEPARATOR = " / ";

const PERIOD_LABELS: Record<LimitPeriod, string> = {
  MONTHLY: "Ежемесячный",
  WEEKLY: "Еженедельный",
  YEARLY: "Ежегодный",
  CUSTOM: "Произвольный период",
};

type CategoryPathOption = {
  l1: string;
  l2: string;
  l3: string;
  label: string;
  searchKey: string;
};

function formatRub(valueInCents: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valueInCents / 100);
}

function formatAmountInput(valueInCents: number) {
  const formatted = new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valueInCents / 100);
  return formatted.replace(/\u00a0/g, " ");
}

function formatDateLabel(dateKey: string) {
  const [year, month, day] = dateKey.split("-");
  return `${day}.${month}.${year}`;
}

function getLimitProgressTone(ratio: number) {
  if (ratio >= 1) return "over";
  if (ratio >= 0.75) return "warn";
  return "ok";
}

function getLimitProgressColorClass(tone: "over" | "warn" | "ok") {
  if (tone === "over") return "bg-rose-500";
  if (tone === "warn") return "bg-orange-500";
  return "bg-emerald-500";
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTodayKey() {
  return toDateKey(new Date());
}

function toTxDateKey(value: string) {
  return value ? value.slice(0, 10) : "";
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

function isRealizedTransaction(tx: TransactionOut) {
  return tx.transaction_type === "ACTUAL" || tx.status === "REALIZED";
}

function getWeekStart(date: Date) {
  const day = date.getDay();
  const diff = (day + 6) % 7;
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate() - diff);
  return start;
}

function getRangeLabel(startKey: string, endKey: string) {
  return `${formatDateLabel(startKey)} - ${formatDateLabel(endKey)}`;
}

function getLimitRange(limit: LimitOut, today: Date) {
  if (limit.period === "CUSTOM") {
    if (!limit.custom_start_date || !limit.custom_end_date) return null;
    return {
      startKey: limit.custom_start_date,
      endKey: limit.custom_end_date,
      rangeLabel: getRangeLabel(limit.custom_start_date, limit.custom_end_date),
    };
  }

  if (limit.period === "WEEKLY") {
    const start = getWeekStart(today);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
    const startKey = toDateKey(start);
    const endKey = toDateKey(end);
    return {
      startKey,
      endKey,
      rangeLabel: getRangeLabel(startKey, endKey),
    };
  }

  if (limit.period === "MONTHLY") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const startKey = toDateKey(start);
    const endKey = toDateKey(end);
    return {
      startKey,
      endKey,
      rangeLabel: getRangeLabel(startKey, endKey),
    };
  }

  const start = new Date(today.getFullYear(), 0, 1);
  const end = new Date(today.getFullYear(), 11, 31);
  const startKey = toDateKey(start);
  const endKey = toDateKey(end);
  return {
    startKey,
    endKey,
    rangeLabel: getRangeLabel(startKey, endKey),
  };
}

export default function LimitsPage() {
  const { data: session } = useSession();
  const { accountingStartDate } = useAccountingStart();
  const { activeStep, isWizardOpen } = useOnboarding();

  const [limits, setLimits] = useState<LimitOut[]>([]);
  const [txs, setTxs] = useState<TransactionOut[]>([]);
  const [categoryNodes, setCategoryNodes] = useState<CategoryNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [editingLimit, setEditingLimit] = useState<LimitOut | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<LimitOut | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [limitName, setLimitName] = useState("");
  const [period, setPeriod] = useState<LimitPeriod>("MONTHLY");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [selectedCategoryPath, setSelectedCategoryPath] = useState<{
    l1: string;
    l2: string;
    l3: string;
  } | null>(null);
  const onboardingAppliedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isWizardOpen) {
      onboardingAppliedRef.current = null;
    }
  }, [isWizardOpen]);

  const categoryMaps = useMemo(
    () => buildCategoryMaps(categoryNodes, "EXPENSE"),
    [categoryNodes]
  );

  const categoryLookup = useMemo(
    () => buildCategoryLookup(categoryNodes),
    [categoryNodes]
  );
  const categoryDescendants = useMemo(
    () => buildCategoryDescendants(categoryNodes),
    [categoryNodes]
  );

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
        l3List.forEach((l3) => addPath(l1, l2, l3));
      });
    });

    return paths;
  }, [categoryMaps]);


  const activeLimits = useMemo(
    () => limits.filter((limit) => !limit.deleted_at),
    [limits]
  );
  const deletedLimits = useMemo(
    () => limits.filter((limit) => limit.deleted_at),
    [limits]
  );

  const limitSummaryById = useMemo(() => {
    const now = new Date();
    const map = new Map<
      number,
      { spent: number; progress: number; rangeLabel: string | null }
    >();

    limits.forEach((limit) => {
      const range = getLimitRange(limit, now);
      const categoryIds =
        categoryDescendants.get(limit.category_id) ?? new Set([limit.category_id]);
      let spent = 0;
      if (range) {
        txs.forEach((tx) => {
          if (tx.direction !== "EXPENSE") return;
          if (!isRealizedTransaction(tx)) return;
          if (!tx.category_id || !categoryIds.has(tx.category_id)) return;
          const dateKey = toTxDateKey(tx.transaction_date);
          if (!dateKey) return;
          if (dateKey < range.startKey || dateKey > range.endKey) return;
          spent += tx.amount_rub;
        });
      }
      const progress =
        limit.amount_rub > 0 ? Math.min(spent / limit.amount_rub, 1) : 0;
      map.set(limit.id, {
        spent,
        progress,
        rangeLabel: range?.rangeLabel ?? null,
      });
    });
    return map;
  }, [categoryDescendants, limits, txs]);

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [limitsData, txData, categoriesData] = await Promise.all([
        fetchLimits({ include_deleted: true }),
        fetchTransactions(),
        fetchCategories(),
      ]);
      setLimits(limitsData);
      setTxs(txData);
      setCategoryNodes(categoriesData);
    } catch (e: any) {
      setError(
        e?.message ??
          "Не удалось загрузить лимиты. Попробуйте обновить страницу."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!session) return;
    loadAll();
  }, [session]);

  useEffect(() => {
    if (period !== "CUSTOM") return;
    const today = getTodayKey();
    if (!customStartDate) setCustomStartDate(today);
    if (!customEndDate) setCustomEndDate(today);
  }, [period, customEndDate, customStartDate]);

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

  const formatCategoryLabel = (categoryId: number | null) => {
    if (!categoryId) return "-";
    const parts = categoryLookup.idToPath.get(categoryId) ?? [];
    const label = parts
      .map((part) => part?.trim())
      .filter((part) => part && part !== CATEGORY_PLACEHOLDER)
      .join(" / ");
    return label || "-";
  };

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
    setLimitName("");
    setPeriod("MONTHLY");
    setCustomStartDate("");
    setCustomEndDate("");
    setAmountStr("");
    setFormError(null);
    setSelectedCategoryPath(null);
  };

  useEffect(() => {
    if (!isDialogOpen) return;
    if (!editingLimit) {
      resetForm();
      return;
    }

    setLimitName(editingLimit.name);
    setPeriod(editingLimit.period);
    setCustomStartDate(editingLimit.custom_start_date ?? "");
    setCustomEndDate(editingLimit.custom_end_date ?? "");
    setAmountStr(formatAmountInput(editingLimit.amount_rub));
    const path = categoryLookup.idToPath.get(editingLimit.category_id) ?? [];
    const nextL1 = path[0] ?? "";
    const nextL2 = path[1] ?? CATEGORY_PLACEHOLDER;
    const nextL3 = path[2] ?? CATEGORY_PLACEHOLDER;
    applyCategorySelection(nextL1, nextL2, nextL3);
    setFormError(null);
  }, [categoryLookup.idToPath, editingLimit, isDialogOpen, categoryMaps.l1.length]);

  useEffect(() => {
    if (!isWizardOpen || activeStep?.key !== "limits") return;
    if (onboardingAppliedRef.current === "limits") return;
    if (categoryMaps.l1.length === 0) return;
    onboardingAppliedRef.current = "limits";
    setEditingLimit(null);
    setIsDialogOpen(true);
    setLimitName("Лимит на расходы");
    setPeriod("MONTHLY");
    setAmountStr("10 000");
    const l1 = categoryMaps.l1[0];
    const l2 = (categoryMaps.l2[l1] ?? [CATEGORY_PLACEHOLDER])[0];
    const l3 =
      l2 && l2 !== CATEGORY_PLACEHOLDER
        ? (categoryMaps.l3[l2] ?? [CATEGORY_PLACEHOLDER])[0]
        : CATEGORY_PLACEHOLDER;
    applyCategorySelection(l1, l2 ?? CATEGORY_PLACEHOLDER, l3 ?? CATEGORY_PLACEHOLDER);
  }, [activeStep?.key, categoryMaps, isWizardOpen]);

  const openCreateDialog = () => {
    setEditingLimit(null);
    setIsDialogOpen(true);
  };

  const openEditDialog = (limit: LimitOut) => {
    setEditingLimit(limit);
    setIsDialogOpen(true);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    const trimmedName = limitName.trim();
    if (!trimmedName) {
      setFormError("Укажите название лимита.");
      return;
    }

    const amountCents = parseRubToCents(amountStr);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      setFormError("Укажите сумму лимита.");
      return;
    }

    const categoryId = resolveCategoryId(cat1, cat2, cat3);
    if (!categoryId) {
      setFormError("Выберите категорию расхода.");
      return;
    }

    if (period === "CUSTOM") {
      if (!customStartDate || !customEndDate) {
        setFormError("Укажите период для лимита.");
        return;
      }
      if (customEndDate < customStartDate) {
        setFormError("Дата окончания не может быть раньше даты начала.");
        return;
      }
      if (accountingStartDate && customStartDate < accountingStartDate) {
        setFormError("Дата начала лимита не может быть раньше даты начала учета.");
        return;
      }
    }

    const payload: LimitCreate = {
      name: trimmedName,
      period,
      category_id: categoryId,
      amount_rub: amountCents,
      custom_start_date: period === "CUSTOM" ? customStartDate : null,
      custom_end_date: period === "CUSTOM" ? customEndDate : null,
    };

    setIsSubmitting(true);
    try {
      if (editingLimit) {
        await updateLimit(editingLimit.id, payload);
      } else {
        await createLimit(payload);
      }
      await loadAll();
      setIsDialogOpen(false);
      setEditingLimit(null);
    } catch (e: any) {
      setFormError(
        e?.message ??
          "Не удалось сохранить лимит. Проверьте данные и попробуйте снова."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteLimit = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteLimit(deleteTarget.id);
      await loadAll();
      setDeleteTarget(null);
    } catch (e: any) {
      setError(
        e?.message ??
          "Не удалось удалить лимит. Попробуйте обновить страницу."
      );
      setDeleteTarget(null);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <main className="min-h-screen bg-background px-8 py-8">
      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) {
            setEditingLimit(null);
            setFormError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>
              {editingLimit ? "Изменить лимит" : "Добавить лимит"}
            </DialogTitle>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={handleSubmit}>
            {formError && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                {formError}
              </div>
            )}

            <div className="grid gap-2">
              <Label>Название лимита</Label>
              <Input
                className="border-2 border-border/70 bg-card shadow-none"
                value={limitName}
                onChange={(e) => setLimitName(e.target.value)}
                placeholder="Например, Рестораны"
              />
            </div>

            <div className="grid gap-2">
              <Label>Период лимита</Label>
              <Select value={period} onValueChange={(value) => setPeriod(value as LimitPeriod)}>
                <SelectTrigger className="border-2 border-border/70 bg-card shadow-none">
                  <SelectValue placeholder="Выберите период" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MONTHLY">Ежемесячный</SelectItem>
                  <SelectItem value="WEEKLY">Еженедельный</SelectItem>
                  <SelectItem value="YEARLY">Ежегодный</SelectItem>
                  <SelectItem value="CUSTOM">Произвольный период</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {period === "CUSTOM" && (
              <div className="grid gap-2 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Дата начала</Label>
                  <Input
                    type="date"
                    className="border-2 border-border/70 bg-card shadow-none"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    min={accountingStartDate ?? undefined}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Дата окончания</Label>
                  <Input
                    type="date"
                    className="border-2 border-border/70 bg-card shadow-none"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    min={accountingStartDate ?? undefined}
                  />
                </div>
              </div>
            )}

            <div className="grid gap-2">
              <Label>Категория расхода</Label>
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
                placeholder="Выберите категорию"
                direction="EXPENSE"
                disabled={isSubmitting}
              />
            </div>

            <div className="grid gap-2">
              <Label>Сумма лимита</Label>
              <Input
                className="border-2 border-border/70 bg-card shadow-none"
                value={amountStr}
                onChange={(e) => setAmountStr(formatRubInput(e.target.value))}
                onBlur={() => setAmountStr((prev) => normalizeRubOnBlur(prev))}
                inputMode="decimal"
                placeholder="Например, 10 000,00"
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
                {editingLimit ? "Сохранить" : "Добавить"}
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
            <AlertDialogTitle>Удалить лимит?</AlertDialogTitle>
            <AlertDialogDescription>
              Лимит будет перемещен в раздел удаленных.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 text-white hover:bg-rose-700"
              onClick={handleDeleteLimit}
              disabled={isDeleting}
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Лимиты</h1>
            <p className="text-sm text-muted-foreground">
              Настраивайте лимиты расходов и контролируйте траты по категориям.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              className="bg-violet-600 text-white hover:bg-violet-700"
              onClick={openCreateDialog}
            >
              <Plus className="h-4 w-4" />
              Добавить лимит
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="text-sm text-muted-foreground">Загрузка лимитов...</div>
        ) : (
          <div className="space-y-4">
            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                {error}
              </div>
            )}
            {activeLimits.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 bg-card p-6 text-center text-sm text-muted-foreground">
                Пока нет активных лимитов.
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-2">
                {activeLimits.map((limit) => {
                  const summary = limitSummaryById.get(limit.id) ?? {
                    spent: 0,
                    progress: 0,
                    rangeLabel: null,
                  };
                  const ratio =
                    limit.amount_rub > 0 ? summary.spent / limit.amount_rub : 0;
                  const tone = getLimitProgressTone(ratio);
                  const progressColorClass = getLimitProgressColorClass(tone);
                  const periodLabel = PERIOD_LABELS[limit.period];
                  const rangeLabel = summary.rangeLabel;
                  return (
                    <Card key={limit.id} className="bg-card">
                      <CardHeader className="space-y-2">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1">
                            <CardTitle className="text-lg">{limit.name}</CardTitle>
                            <div className="text-xs text-muted-foreground">
                              {periodLabel}
                              {rangeLabel ? ` | ${rangeLabel}` : ""}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {formatCategoryLabel(limit.category_id)}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="text-sm font-semibold text-foreground">
                              {formatRub(limit.amount_rub)}
                            </div>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="text-muted-foreground hover:bg-transparent hover:text-violet-600"
                              onClick={() => openEditDialog(limit)}
                              aria-label="Изменить лимит"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="text-muted-foreground hover:bg-transparent hover:text-rose-500"
                              onClick={() => setDeleteTarget(limit)}
                              aria-label="Удалить лимит"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3 text-sm text-slate-700">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>
                            Потрачено:{" "}
                            <span
                              className={
                                tone === "over" ? "text-rose-500 font-medium" : "font-medium"
                              }
                            >
                              {formatRub(summary.spent)}
                            </span>
                          </span>
                          <span>Лимит: {formatRub(limit.amount_rub)}</span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={`h-full ${progressColorClass}`}
                            style={{ width: `${summary.progress * 100}%` }}
                          />
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {deletedLimits.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">Удаленные</h2>
              <Badge className="bg-slate-100 text-slate-500">Удаленные</Badge>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-2">
              {deletedLimits.map((limit) => {
                const summary = limitSummaryById.get(limit.id) ?? {
                  spent: 0,
                  progress: 0,
                  rangeLabel: null,
                };
                const periodLabel = PERIOD_LABELS[limit.period];
                const rangeLabel = summary.rangeLabel;
                return (
                  <Card key={limit.id} className="bg-card/70">
                    <CardHeader className="space-y-2">
                      <div className="flex flex-wrap items-start gap-2">
                        <CardTitle className="text-lg text-slate-600">
                          {limit.name}
                        </CardTitle>
                        <Badge className="bg-slate-100 text-slate-500">
                          Удалено
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {periodLabel}
                        {rangeLabel ? ` | ${rangeLabel}` : ""}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatCategoryLabel(limit.category_id)}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm text-slate-600">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Потрачено: {formatRub(summary.spent)}</span>
                        <span>Лимит: {formatRub(limit.amount_rub)}</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full bg-slate-300"
                          style={{ width: `${summary.progress * 100}%` }}
                        />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
