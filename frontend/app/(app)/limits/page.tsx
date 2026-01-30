"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useSession } from "next-auth/react";
import { useAccountingStart } from "@/components/accounting-start-context";
import { Gauge, Plus } from "lucide-react";

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
import { CategorySelector } from "@/components/category-selector";
import { FormModal } from "@/components/form-modal";
import { TextField, DateField, SelectField } from "@/components/ui/form-field";
import { Label } from "@/components/ui/label";
import { CounterpartySelector } from "@/components/counterparty-selector";
import {
  buildCategoryDescendants,
  buildCategoryLookup,
  buildCategoryMaps,
  CategoryNode,
  makeCategoryPathKey,
} from "@/lib/categories";
import {
  API_BASE,
  createLimit,
  deleteLimit,
  fetchCategories,
  fetchLimits,
  fetchTransactions,
  fetchCounterparties,
  LimitCreate,
  LimitOut,
  LimitPeriod,
  TransactionOut,
  updateLimit,
} from "@/lib/api";
import { useOnboarding } from "@/components/onboarding-context";
import { FilterSection } from "@/components/filter-panel";
import { LimitCard } from "@/components/limit-card";
import { useSidebar } from "@/components/ui/sidebar-context";
import { AuthInput } from "@/components/ui/auth-input";
import { SegmentedSelector } from "@/components/ui/segmented-selector";
import { formatRubInput, normalizeRubOnBlur, parseRubToCents, formatCentsForInput } from "@/lib/format-rub";
import { PLACEHOLDER_COLOR_DARK, ACTIVE_TEXT_DARK, SIDEBAR_TEXT_ACTIVE, ACCENT } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { SIDEBAR_FILTERS_SLOT_ID } from "@/lib/sidebar-filters-slot";

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

function formatDateLabel(dateKey: string) {
  const [year, month, day] = dateKey.split("-");
  return `${day}.${month}.${year}`;
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
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [counterparties, setCounterparties] = useState<import("@/lib/api").CounterpartyOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterName, setFilterName] = useState("");
  const [filterAmountFrom, setFilterAmountFrom] = useState("");
  const [filterAmountTo, setFilterAmountTo] = useState("");
  const [filterPeriod, setFilterPeriod] = useState<Set<LimitPeriod>>(new Set());
  const [filterCategoryIds, setFilterCategoryIds] = useState<number[]>([]);
  const [filterCounterpartyIds, setFilterCounterpartyIds] = useState<number[]>([]);
  const [filterComment, setFilterComment] = useState("");
  const [filterStatus, setFilterStatus] = useState<Set<string>>(new Set(["active"]));

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

  const visibleLimits = useMemo(() => {
    const nameNorm = filterName.trim().toLowerCase();
    const amountFromCents = filterAmountFrom.trim() ? parseRubToCents(filterAmountFrom) : NaN;
    const amountToCents = filterAmountTo.trim() ? parseRubToCents(filterAmountTo) : NaN;
    const showActive = filterStatus.has("active");
    const showDeleted = filterStatus.has("deleted");

    return limits.filter((limit) => {
      if (nameNorm && !limit.name.toLowerCase().includes(nameNorm)) return false;
      if (Number.isFinite(amountFromCents) && limit.amount_rub < amountFromCents) return false;
      if (Number.isFinite(amountToCents) && limit.amount_rub > amountToCents) return false;
      if (filterPeriod.size > 0 && !filterPeriod.has(limit.period)) return false;
      if (filterCategoryIds.length > 0 && !filterCategoryIds.includes(limit.category_id)) return false;
      const isDeleted = Boolean(limit.deleted_at);
      if (isDeleted && !showDeleted) return false;
      if (!isDeleted && !showActive) return false;

      if (filterCounterpartyIds.length > 0) {
        const categoryIds = categoryDescendants.get(limit.category_id) ?? new Set([limit.category_id]);
        const hasMatch = txs.some(
          (tx) =>
            tx.direction === "EXPENSE" &&
            isRealizedTransaction(tx) &&
            tx.category_id != null &&
            categoryIds.has(tx.category_id) &&
            tx.counterparty_id != null &&
            filterCounterpartyIds.includes(tx.counterparty_id)
        );
        if (!hasMatch) return false;
      }
      return true;
    });
  }, [
    limits,
    filterName,
    filterAmountFrom,
    filterAmountTo,
    filterPeriod,
    filterCategoryIds,
    filterCounterpartyIds,
    filterStatus,
    categoryDescendants,
    txs,
  ]);

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
      const [limitsData, txData, categoriesData, counterpartiesData] = await Promise.all([
        fetchLimits({ include_deleted: true }),
        fetchTransactions(),
        fetchCategories(),
        fetchCounterparties(),
      ]);
      setLimits(limitsData);
      setTxs(txData);
      setCategoryNodes(categoriesData);
      setCounterparties(counterpartiesData);
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
    setAmountStr(formatCentsForInput(editingLimit.amount_rub));
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

  const { isCollapsed } = useSidebar();

  return (
    <main className={cn("min-h-screen pb-8", isCollapsed ? "pl-0" : "pl-0")}>
      <FormModal
        open={isDialogOpen}
        onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) {
            setEditingLimit(null);
            setFormError(null);
          }
        }}
        title={editingLimit ? "Изменить лимит" : "Добавить лимит"}
        icon={<Gauge className="w-8 h-8" style={{ color: ACTIVE_TEXT_DARK }} />}
        formError={formError}
        onSubmit={handleSubmit}
        onCancel={() => {
          setIsDialogOpen(false);
          setEditingLimit(null);
          setFormError(null);
        }}
        submitLabel={
          isSubmitting
            ? editingLimit
              ? "Сохраняем..."
              : "Добавляем..."
            : editingLimit
              ? "Сохранить"
              : "Добавить"
        }
        loading={isSubmitting}
        size="medium"
      >
        <TextField
          label="Название лимита"
          value={limitName}
          onChange={(e) => setLimitName(e.target.value)}
          placeholder="Например, Рестораны"
        />

        <SelectField
          label="Период лимита"
          value={period}
          onValueChange={(value) => setPeriod(value as LimitPeriod)}
          options={[
            { value: "MONTHLY", label: "Ежемесячный" },
            { value: "WEEKLY", label: "Еженедельный" },
            { value: "YEARLY", label: "Ежегодный" },
            { value: "CUSTOM", label: "Произвольный период" },
          ]}
          placeholder="Выберите период"
        />

        {period === "CUSTOM" && (
          <div className="grid gap-4 md:grid-cols-2">
            <DateField
              label="Дата начала"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              min={accountingStartDate ?? undefined}
            />
            <DateField
              label="Дата окончания"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              min={accountingStartDate ?? undefined}
            />
          </div>
        )}

        <div className="grid gap-2">
          <Label style={{ color: ACTIVE_TEXT_DARK }}>Категория расхода</Label>
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

        <TextField
          label="Сумма лимита"
          value={amountStr}
          onChange={(e) => setAmountStr(formatRubInput(e.target.value))}
          onBlur={() => setAmountStr((prev) => normalizeRubOnBlur(prev))}
          inputMode="decimal"
          placeholder="Например, 10 000,00"
        />
      </FormModal>

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

      {mounted && typeof document !== "undefined" &&
        createPortal(
          <div className="space-y-4 py-2">
            <FilterSection
            label="Название"
            onReset={() => setFilterName("")}
            showReset={!!filterName}
          >
            <div className="[&_div.relative.flex.items-center]:h-10 [&_input]:text-sm [&_input]:font-normal [&_input:not(:placeholder-shown)]:text-white">
              <AuthInput
                type="text"
                placeholder="Начните вводить текст"
                value={filterName}
                onChange={(e) => setFilterName(e.target.value)}
              />
            </div>
          </FilterSection>

          <FilterSection
            label="Сумма лимита"
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
            label="Период"
            onReset={() => setFilterPeriod(new Set())}
            showReset={filterPeriod.size > 0}
          >
            <div className="space-y-2">
              {(["MONTHLY", "WEEKLY", "YEARLY", "CUSTOM"] as const).map((p) => (
                <label
                  key={p}
                  className="flex items-center gap-2 cursor-pointer text-sm"
                  style={{ color: SIDEBAR_TEXT_ACTIVE }}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    style={{ accentColor: ACCENT }}
                    checked={filterPeriod.has(p)}
                    onChange={() => {
                      const next = new Set(filterPeriod);
                      if (filterPeriod.has(p)) next.delete(p);
                      else next.add(p);
                      setFilterPeriod(next);
                    }}
                  />
                  {PERIOD_LABELS[p]}
                </label>
              ))}
            </div>
          </FilterSection>

          <FilterSection
            label="Категории"
            onReset={() => setFilterCategoryIds([])}
            showReset={filterCategoryIds.length > 0}
          >
            <CategorySelector
              categoryNodes={categoryNodes}
              selectedPath={filterCategoryIds.length > 0 ? null : null}
              onChange={(path) => {
                if (path) {
                  const id = categoryLookup.pathToId.get(
                    makeCategoryPathKey(
                      path.l1?.trim() ?? "",
                      path.l2?.trim() ?? "",
                      path.l3?.trim() ?? ""
                    )
                  );
                  setFilterCategoryIds(id != null ? [id] : []);
                } else {
                  setFilterCategoryIds([]);
                }
              }}
              placeholder="Начните вводить название"
              direction="EXPENSE"
            />
          </FilterSection>

          <FilterSection
            label="Контрагенты"
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
              apiBase={API_BASE}
            />
          </FilterSection>

          <FilterSection
            label="Комментарий"
            onReset={() => setFilterComment("")}
            showReset={!!filterComment}
          >
            <div className="[&_div.relative.flex.items-center]:h-10 [&_input]:text-sm [&_input]:font-normal [&_input:not(:placeholder-shown)]:text-white">
              <AuthInput
                type="text"
                placeholder="Начните вводить текст"
                value={filterComment}
                onChange={(e) => setFilterComment(e.target.value)}
              />
            </div>
          </FilterSection>

          <FilterSection
            label="Статус"
            onReset={() => setFilterStatus(new Set(["active"]))}
            showReset={!filterStatus.has("active") || filterStatus.size > 1}
          >
            <SegmentedSelector
              options={[
                { value: "active", label: "Активный", colorScheme: "green" },
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
          </div>,
          document.getElementById(SIDEBAR_FILTERS_SLOT_ID)!
        )}

      <div className="flex-1 min-w-0">
        <div className="w-full max-w-[900px] xl:max-w-[1350px] mx-auto pt-[30px]">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <Button
              className="rounded-[9px] border-0 flex items-center justify-center transition-colors hover:opacity-90 text-sm font-normal"
              style={{ backgroundColor: ACCENT }}
              onClick={openCreateDialog}
            >
              <Plus className="h-5 w-5 mr-2" style={{ color: "white", opacity: 0.85 }} />
              <span style={{ color: "white", opacity: 0.85 }}>Добавить</span>
            </Button>
          </div>
            {error && (
              <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                {error}
              </div>
            )}

            {visibleLimits.length === 0 && !loading ? (
              <div
                className="rounded-lg border border-dashed p-6 text-center text-sm"
                style={{ borderColor: PLACEHOLDER_COLOR_DARK, color: PLACEHOLDER_COLOR_DARK }}
              >
                Нет лимитов по заданным фильтрам.
              </div>
            ) : (
              <div
                className="columns-2 xl:columns-3 gap-4"
                style={{
                  position: "relative",
                  zIndex: 2,
                  opacity: loading ? 0 : 1,
                  transition: "opacity 0.3s ease-in-out",
                }}
              >
                {visibleLimits.map((limit) => {
                  const summary = limitSummaryById.get(limit.id) ?? {
                    spent: 0,
                    progress: 0,
                    rangeLabel: null,
                  };
                  return (
                    <div
                      key={limit.id}
                      style={{ breakInside: "avoid", marginBottom: "1rem" }}
                    >
                      <LimitCard
                        limit={limit}
                        categoryLookup={categoryLookup}
                        categoryPathLabel={formatCategoryLabel(limit.category_id)}
                        categoryDescendants={categoryDescendants}
                        txs={txs}
                        currentSpent={summary.spent}
                        currentProgress={summary.progress}
                        onEdit={limit.deleted_at ? undefined : openEditDialog}
                        onDelete={(l) => setDeleteTarget(l)}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
    </main>
  );
}
