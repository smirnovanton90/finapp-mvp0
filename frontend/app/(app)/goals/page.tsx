"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useSession } from "next-auth/react";
import { useAccountingStart } from "@/components/accounting-start-context";
import { Gauge, Plus } from "lucide-react";

import { ConfirmModal } from "@/components/confirm-modal";
import { CreateCategoryModal } from "@/components/create-category-modal";
import { CreateCounterpartyModal } from "@/components/create-counterparty-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buildCategoryPaths, CategorySelector } from "@/components/category-selector";
import { CounterpartySelector } from "@/components/counterparty-selector";
import { FormModal } from "@/components/form-modal";
import { TextField, DateField, SelectField } from "@/components/ui/form-field";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/empty-state";
import {
  buildCategoryDescendants,
  buildCategoryLookup,
  buildCategoryMaps,
  CategoryNode,
  makeCategoryPathKey,
} from "@/lib/categories";
import type { CategoryScope } from "@/lib/categories";
import {
  API_BASE,
  createGoal,
  deleteGoal,
  fetchCategories,
  fetchGoals,
  fetchTransactions,
  fetchCounterparties,
  GoalCreate,
  GoalOut,
  GoalPeriod,
  TransactionOut,
  updateGoal,
} from "@/lib/api";
import { useOnboarding } from "@/components/onboarding-context";
import { FilterSection } from "@/components/filter-panel";
import { GoalCard } from "@/components/goal-card";
import { useSidebar } from "@/components/ui/sidebar-context";
import { AuthInput } from "@/components/ui/auth-input";
import { SegmentedSelector } from "@/components/ui/segmented-selector";
import { formatRubInput, normalizeRubOnBlur, parseRubToCents, formatCentsForInput } from "@/lib/format-rub";
import { PLACEHOLDER_COLOR_DARK, ACTIVE_TEXT_DARK, SIDEBAR_TEXT_ACTIVE, ACCENT } from "@/lib/colors";
import { cn } from "@/lib/utils";

const CATEGORY_PLACEHOLDER = "-";
const CATEGORY_PATH_SEPARATOR = " / ";

const PERIOD_LABELS: Record<GoalPeriod, string> = {
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

function getGoalRange(goal: GoalOut, today: Date) {
  if (goal.period === "CUSTOM") {
    if (!goal.custom_start_date || !goal.custom_end_date) return null;
    return {
      startKey: goal.custom_start_date,
      endKey: goal.custom_end_date,
      rangeLabel: getRangeLabel(goal.custom_start_date, goal.custom_end_date),
    };
  }
  if (goal.period === "WEEKLY") {
    const start = getWeekStart(today);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
    return {
      startKey: toDateKey(start),
      endKey: toDateKey(end),
      rangeLabel: getRangeLabel(toDateKey(start), toDateKey(end)),
    };
  }
  if (goal.period === "MONTHLY") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return {
      startKey: toDateKey(start),
      endKey: toDateKey(end),
      rangeLabel: getRangeLabel(toDateKey(start), toDateKey(end)),
    };
  }
  const start = new Date(today.getFullYear(), 0, 1);
  const end = new Date(today.getFullYear(), 11, 31);
  return {
    startKey: toDateKey(start),
    endKey: toDateKey(end),
    rangeLabel: getRangeLabel(toDateKey(start), toDateKey(end)),
  };
}

export default function GoalsPage() {
  const { data: session } = useSession();
  const { accountingStartDate } = useAccountingStart();
  const { activeStep, isWizardOpen } = useOnboarding();

  const [createCategoryOpen, setCreateCategoryOpen] = useState(false);
  const [createCounterpartyOpen, setCreateCounterpartyOpen] = useState(false);

  const [goals, setGoals] = useState<GoalOut[]>([]);
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
  const [filterPeriod, setFilterPeriod] = useState<Set<GoalPeriod>>(new Set());
  const [filterCategoryIds, setFilterCategoryIds] = useState<number[]>([]);
  const [filterCounterpartyIds, setFilterCounterpartyIds] = useState<number[]>([]);
  const [filterComment, setFilterComment] = useState("");
  const [filterStatus, setFilterStatus] = useState<Set<string>>(new Set(["active"]));

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [editingGoal, setEditingGoal] = useState<GoalOut | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<GoalOut | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [goalName, setGoalName] = useState("");
  const [period, setPeriod] = useState<GoalPeriod>("MONTHLY");
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
    () => buildCategoryMaps(categoryNodes),
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

  const categoryPaths = useMemo(
    () => buildCategoryPaths(categoryNodes),
    [categoryNodes]
  );

  const activeGoals = useMemo(
    () => goals.filter((goal) => !goal.deleted_at),
    [goals]
  );
  const deletedGoals = useMemo(
    () => goals.filter((goal) => goal.deleted_at),
    [goals]
  );

  const visibleGoals = useMemo(() => {
    const nameNorm = filterName.trim().toLowerCase();
    const amountFromCents = filterAmountFrom.trim() ? parseRubToCents(filterAmountFrom) : NaN;
    const amountToCents = filterAmountTo.trim() ? parseRubToCents(filterAmountTo) : NaN;
    const showActive = filterStatus.has("active");
    const showDeleted = filterStatus.has("deleted");

    return goals.filter((goal) => {
      if (nameNorm && !goal.name.toLowerCase().includes(nameNorm)) return false;
      if (Number.isFinite(amountFromCents) && goal.amount_rub < amountFromCents) return false;
      if (Number.isFinite(amountToCents) && goal.amount_rub > amountToCents) return false;
      if (filterPeriod.size > 0 && !filterPeriod.has(goal.period)) return false;
      if (filterCategoryIds.length > 0 && !filterCategoryIds.includes(goal.category_id)) return false;
      const isDeleted = Boolean(goal.deleted_at);
      if (isDeleted && !showDeleted) return false;
      if (!isDeleted && !showActive) return false;

      if (filterCounterpartyIds.length > 0) {
        const categoryIds = categoryDescendants.get(goal.category_id) ?? new Set([goal.category_id]);
        const scope = categoryLookup.idToScope?.get(goal.category_id);
        const direction = scope === "INCOME" ? "INCOME" : "EXPENSE";
        const hasMatch = txs.some(
          (tx) =>
            tx.direction === direction &&
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
    goals,
    filterName,
    filterAmountFrom,
    filterAmountTo,
    filterPeriod,
    filterCategoryIds,
    filterCounterpartyIds,
    filterStatus,
    categoryDescendants,
    categoryLookup.idToScope,
    txs,
  ]);

  const goalSummaryById = useMemo(() => {
    const now = new Date();
    const map = new Map<
      number,
      { amount: number; progress: number; rangeLabel: string | null; isIncome: boolean }
    >();

    goals.forEach((goal) => {
      const range = getGoalRange(goal, now);
      const categoryIds =
        categoryDescendants.get(goal.category_id) ?? new Set([goal.category_id]);
      const scope: CategoryScope | undefined = categoryLookup.idToScope?.get(goal.category_id);
      const isIncome = scope === "INCOME";
      const direction = isIncome ? "INCOME" : "EXPENSE";
      let amount = 0;
      if (range) {
        txs.forEach((tx) => {
          if (tx.direction !== direction) return;
          if (!isRealizedTransaction(tx)) return;
          if (!tx.category_id || !categoryIds.has(tx.category_id)) return;
          const dateKey = toTxDateKey(tx.transaction_date);
          if (!dateKey) return;
          if (dateKey < range.startKey || dateKey > range.endKey) return;
          amount += tx.amount_rub;
        });
      }
      const progress =
        goal.amount_rub > 0 ? Math.min(amount / goal.amount_rub, 1) : 0;
      map.set(goal.id, {
        amount,
        progress,
        rangeLabel: range?.rangeLabel ?? null,
        isIncome,
      });
    });
    return map;
  }, [categoryDescendants, categoryLookup.idToScope, goals, txs]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [goalsData, txData, categoriesData, counterpartiesData] = await Promise.all([
        fetchGoals({ include_deleted: true }),
        fetchTransactions(),
        fetchCategories(),
        fetchCounterparties(),
      ]);
      setGoals(goalsData);
      setTxs(txData);
      setCategoryNodes(categoriesData);
      setCounterparties(counterpartiesData);
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(
        err?.message ??
          "Не удалось загрузить цели. Попробуйте обновить страницу."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    loadAll();
  }, [session, loadAll]);

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
    setGoalName("");
    setPeriod("MONTHLY");
    setCustomStartDate("");
    setCustomEndDate("");
    setAmountStr("");
    setFormError(null);
    setSelectedCategoryPath(null);
  };

  useEffect(() => {
    if (!isDialogOpen) return;
    if (!editingGoal) {
      resetForm();
      return;
    }

    setGoalName(editingGoal.name);
    setPeriod(editingGoal.period);
    setCustomStartDate(editingGoal.custom_start_date ?? "");
    setCustomEndDate(editingGoal.custom_end_date ?? "");
    setAmountStr(formatCentsForInput(editingGoal.amount_rub));
    const path = categoryLookup.idToPath.get(editingGoal.category_id) ?? [];
    const nextL1 = path[0] ?? "";
    const nextL2 = path[1] ?? CATEGORY_PLACEHOLDER;
    const nextL3 = path[2] ?? CATEGORY_PLACEHOLDER;
    applyCategorySelection(nextL1, nextL2, nextL3);
    setFormError(null);
  }, [categoryLookup.idToPath, editingGoal, isDialogOpen, categoryMaps.l1.length]);

  useEffect(() => {
    if (!isWizardOpen || activeStep?.key !== "limits") return;
    if (onboardingAppliedRef.current === "limits") return;
    if (categoryMaps.l1.length === 0) return;
    onboardingAppliedRef.current = "limits";
    setEditingGoal(null);
    setIsDialogOpen(true);
    setGoalName("Цель на расходы");
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
    setEditingGoal(null);
    setIsDialogOpen(true);
  };

  const openEditDialog = (goal: GoalOut) => {
    setEditingGoal(goal);
    setIsDialogOpen(true);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    const trimmedName = goalName.trim();
    if (!trimmedName) {
      setFormError("Укажите название цели.");
      return;
    }

    const amountCents = parseRubToCents(amountStr);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      setFormError("Укажите сумму цели.");
      return;
    }

    const categoryId = resolveCategoryId(cat1, cat2, cat3);
    if (!categoryId) {
      setFormError("Выберите категорию (доходов или расходов).");
      return;
    }

    if (period === "CUSTOM") {
      if (!customStartDate || !customEndDate) {
        setFormError("Укажите период для цели.");
        return;
      }
      if (customEndDate < customStartDate) {
        setFormError("Дата окончания не может быть раньше даты начала.");
        return;
      }
      if (accountingStartDate && customStartDate < accountingStartDate) {
        setFormError("Дата начала цели не может быть раньше даты начала учета.");
        return;
      }
    }

    const payload: GoalCreate = {
      name: trimmedName,
      period,
      category_id: categoryId,
      amount_rub: amountCents,
      custom_start_date: period === "CUSTOM" ? customStartDate : null,
      custom_end_date: period === "CUSTOM" ? customEndDate : null,
    };

    setIsSubmitting(true);
    try {
      if (editingGoal) {
        await updateGoal(editingGoal.id, payload);
      } else {
        await createGoal(payload);
      }
      await loadAll();
      setIsDialogOpen(false);
      setEditingGoal(null);
    } catch (e: unknown) {
      const err = e as { message?: string };
      setFormError(
        err?.message ??
          "Не удалось сохранить цель. Проверьте данные и попробуйте снова."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteGoal = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteGoal(deleteTarget.id);
      await loadAll();
      setDeleteTarget(null);
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(
        err?.message ??
          "Не удалось удалить цель. Попробуйте обновить страницу."
      );
      setDeleteTarget(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const { isCollapsed, filtersSlotId } = useSidebar();

  return (
    <main className={cn("min-h-screen pb-8", isCollapsed ? "pl-0" : "pl-0")}>
      <FormModal
        open={isDialogOpen}
        onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) {
            setEditingGoal(null);
            setFormError(null);
          }
        }}
        title={editingGoal ? "Изменить цель" : "Добавить цель"}
        icon={<Gauge className="w-8 h-8" style={{ color: ACTIVE_TEXT_DARK }} />}
        formError={formError}
        onSubmit={handleSubmit}
        onCancel={() => {
          setIsDialogOpen(false);
          setEditingGoal(null);
          setFormError(null);
        }}
        submitLabel={
          isSubmitting
            ? editingGoal
              ? "Сохраняем..."
              : "Добавляем..."
            : editingGoal
              ? "Сохранить"
              : "Добавить"
        }
        loading={isSubmitting}
        size="medium"
      >
        <TextField
          label="Название цели"
          value={goalName}
          onChange={(e) => setGoalName(e.target.value)}
          placeholder="Например, Рестораны или Зарплата"
        />

        <SelectField
          label="Период цели"
          value={period}
          onValueChange={(value) => setPeriod(value as GoalPeriod)}
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
          <Label style={{ color: ACTIVE_TEXT_DARK }}>Категория (доходов или расходов)</Label>
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
            disabled={isSubmitting}
            onAddCategory={() => setCreateCategoryOpen(true)}
          />
        </div>

        <TextField
          label="Сумма цели"
          value={amountStr}
          onChange={(e) => setAmountStr(formatRubInput(e.target.value))}
          onBlur={() => setAmountStr((prev) => normalizeRubOnBlur(prev))}
          inputMode="decimal"
          placeholder="Например, 10 000,00"
        />
      </FormModal>

      <CreateCategoryModal
        open={createCategoryOpen}
        onOpenChange={setCreateCategoryOpen}
        onSuccess={async (created) => {
          await loadAll();
          try {
            applyCategorySelection(created.name, "", "");
          } catch {
            // ignore
          }
        }}
      />
      <CreateCounterpartyModal
        open={createCounterpartyOpen}
        onOpenChange={setCreateCounterpartyOpen}
        onSuccess={async (created) => {
          await loadAll();
          setFilterCounterpartyIds([created.id]);
        }}
      />
      <ConfirmModal
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Удалить цель?"
        description="Цель будет перемещена в раздел удаленных."
        confirmLabel="Удалить"
        variant="destructive"
        loading={isDeleting}
        onConfirm={handleDeleteGoal}
      />

      {mounted && typeof document !== "undefined" && (() => {
        const el = document.getElementById(filtersSlotId);
        return el ? createPortal(
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
            label="Сумма цели"
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
              onAddCounterparty={() => setCreateCounterpartyOpen(true)}
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
          el
        ) : null;
      })()}

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

            {visibleGoals.length === 0 && !loading ? (
              <EmptyState />
            ) : (
              <div
                className="columns-1 md:columns-2 xl:columns-3 gap-4"
                style={{
                  position: "relative",
                  zIndex: 2,
                  opacity: loading ? 0 : 1,
                  transition: "opacity 0.3s ease-in-out",
                }}
              >
                {visibleGoals.map((goal) => {
                  const summary = goalSummaryById.get(goal.id) ?? {
                    amount: 0,
                    progress: 0,
                    rangeLabel: null,
                    isIncome: false,
                  };
                  return (
                    <div
                      key={goal.id}
                      style={{ breakInside: "avoid", marginBottom: "1rem" }}
                    >
                      <GoalCard
                        goal={goal}
                        isIncomeGoal={summary.isIncome}
                        categoryLookup={categoryLookup}
                        categoryPathLabel={formatCategoryLabel(goal.category_id)}
                        categoryDescendants={categoryDescendants}
                        txs={txs}
                        currentAmount={summary.amount}
                        currentProgress={summary.progress}
                        onEdit={goal.deleted_at ? undefined : openEditDialog}
                        onDelete={(g) => setDeleteTarget(g)}
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
