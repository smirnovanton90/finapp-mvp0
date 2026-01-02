"use client";

import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { useSession } from "next-auth/react";
import {
  ArrowRight,
  Ban,
  Car,
  ChevronDown,
  Pencil,
  PiggyBank,
  Plus,
  Trash2,
  Utensils,
  Wrench,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  createTransaction,
  deleteTransaction,
  fetchDeletedTransactions,
  fetchItems,
  fetchTransactions,
  ItemOut,
  TransactionOut,
} from "@/lib/api";

type TransactionsViewMode = "actual" | "planning";

type TransactionCard = TransactionOut & { isDeleted?: boolean };

const CATEGORY_L1 = ["Питание", "Транспорт", "Услуги"];

const CATEGORY_L2: Record<string, string[]> = {
  "Питание": ["Продукты", "Кафе", "Доставка"],
  "Транспорт": ["Такси", "Метро", "Бензин"],
  "Услуги": ["Связь", "Подписки", "Прочее"],
};

const CATEGORY_L3: Record<string, string[]> = {
  "Продукты": ["Супермаркет", "Рынок"],
  "Кафе": ["Кофе", "Ресторан"],
  "Такси": ["Яндекс", "Uber"],
  "Связь": ["Мобильная", "Интернет"],
};

const CATEGORY_ICON_BY_L1: Record<string, ComponentType<{ className?: string; strokeWidth?: number }>> =
  {
    "Питание": Utensils,
    "Транспорт": Car,
    "Услуги": Wrench,
  };

function formatAmount(valueInCents: number) {
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valueInCents / 100);
}

function formatDate(value: string) {
  const parts = value.split("-");
  if (parts.length === 3) {
    const [year, month, day] = parts;
    if (year && month && day) return `${day}.${month}.${year}`;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ru-RU");
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function parseAmountFilter(value: string) {
  const cleaned = value.trim().replace(/\s/g, "").replace(",", ".");
  if (!cleaned) return null;
  const num = Number(cleaned);
  if (!Number.isFinite(num)) return null;
  return Math.round(num * 100);
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

function TransactionCardRow({
  tx,
  itemName,
  isSelected,
  onToggleSelection,
  onDelete,
  isDeleting,
}: {
  tx: TransactionCard;
  itemName: (id: number | null | undefined) => string;
  isSelected: boolean;
  onToggleSelection: (id: number, checked: boolean) => void;
  onDelete: (id: number) => void;
  isDeleting: boolean;
}) {
  const isTransfer = tx.direction === "TRANSFER";
  const isExpense = tx.direction === "EXPENSE";
  const isIncome = tx.direction === "INCOME";

  const amountValue = formatAmount(tx.amount_rub);

  const cardTone = tx.isDeleted
    ? "bg-slate-100"
    : isExpense
      ? "bg-[linear-gradient(270deg,_#FEF2F2_0%,_#FCA5A5_100%)]"
      : isIncome
        ? "bg-[linear-gradient(270deg,_#F4F2E9_0%,_#BDDFB2_100%)]"
        : "bg-[linear-gradient(270deg,_#F5F3FF_0%,_#C4B5FD_100%)]";

  const textClass = tx.isDeleted ? "text-slate-500" : "text-slate-900";

  const mutedTextClass = tx.isDeleted ? "text-slate-400" : "text-slate-600/80";

  const amountClass = tx.isDeleted ? "text-slate-500" : "text-slate-900";

  const actionTextClass = tx.isDeleted ? "text-slate-400" : "text-slate-700";
  const actionHoverClass = tx.isDeleted ? "" : "hover:text-slate-900";
  const deleteHoverClass = tx.isDeleted ? "" : "hover:text-rose-500";

  const iconClass = tx.isDeleted ? "text-slate-300" : "text-slate-700";

  const commentText = tx.comment?.trim() ? tx.comment : "-";

  const categoryLines = [
    tx.category_l1?.trim() ? tx.category_l1 : "-",
    tx.category_l2?.trim() ? tx.category_l2 : "-",
    tx.category_l3?.trim() ? tx.category_l3 : "-",
  ];
  const categoryKey = tx.category_l1?.trim() ?? "";
  const CategoryIcon = CATEGORY_ICON_BY_L1[categoryKey] ?? PiggyBank;

  const checkboxDisabled = tx.isDeleted || isDeleting;

  return (
    <div
      className={`flex items-stretch overflow-hidden rounded-lg transition-transform duration-200 ease-out hover:-translate-y-1 ${cardTone}`}
    >
      <div className="flex flex-1 flex-wrap items-center gap-4 px-4 py-3 sm:flex-nowrap">
        <input
          type="checkbox"
          className="h-5 w-5 accent-violet-600"
          checked={isSelected}
          onChange={(e) => onToggleSelection(tx.id, e.target.checked)}
          disabled={checkboxDisabled}
          aria-label={`Выбрать транзакцию ${tx.id}`}
        />

        <div className="w-24 shrink-0">
          <div className={`text-base font-semibold ${textClass}`}>
            {formatDate(tx.transaction_date)}
          </div>
          <div className={`text-xs ${mutedTextClass}`}>
            {formatTime(tx.created_at)}
          </div>
        </div>

        {isTransfer ? (
          <>
            <div className="flex min-w-[280px] items-center gap-4">
              <div className="min-w-[120px] text-center">
                <div className={`truncate text-sm font-medium ${mutedTextClass}`}>
                  {itemName(tx.primary_item_id)}
                </div>
                <div className={`text-xl font-semibold tabular-nums ${amountClass}`}>
                  -{amountValue}
                </div>
                <div className={`text-xs font-semibold ${mutedTextClass}`}>RUB</div>
              </div>
              <ArrowRight className={`h-6 w-6 ${mutedTextClass}`} />
              <div className="min-w-[120px] text-center">
                <div className={`truncate text-sm font-medium ${mutedTextClass}`}>
                  {itemName(tx.counterparty_item_id)}
                </div>
                <div className={`text-xl font-semibold tabular-nums ${amountClass}`}>
                  +{amountValue}
                </div>
                <div className={`text-xs font-semibold ${mutedTextClass}`}>RUB</div>
              </div>
            </div>

            <div className="min-w-[160px] flex-1">
              <div className={`truncate text-sm font-medium ${mutedTextClass}`}>
                {commentText}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="w-full min-w-[140px] text-center sm:w-40">
              <div className={`truncate text-sm font-medium ${mutedTextClass}`}>
                {itemName(tx.primary_item_id)}
              </div>
              <div className={`text-xl font-semibold tabular-nums ${amountClass}`}>
                {isExpense ? "-" : "+"}
                {amountValue}
              </div>
              <div className={`text-xs font-semibold ${mutedTextClass}`}>RUB</div>
            </div>

            <div className="w-full sm:w-32">
              <div className="flex flex-col items-center gap-2 text-center">
                <CategoryIcon className={`h-8 w-8 ${iconClass}`} strokeWidth={1.5} />
                <div className={`space-y-0.5 text-xs leading-tight ${mutedTextClass}`}>
                  <div className={`font-medium ${textClass}`}>{categoryLines[0]}</div>
                  <div>{categoryLines[1]}</div>
                  <div>{categoryLines[2]}</div>
                </div>
              </div>
            </div>

            <div className="min-w-[160px] flex-1">
              <div className={`truncate text-sm font-medium ${mutedTextClass}`}>
                {commentText}
              </div>
            </div>
          </>
        )}

        <div className="flex items-center gap-1">
          {tx.isDeleted && (
            <span className="inline-flex items-center text-slate-400" title="Удалено">
              <Ban className="h-4 w-4" />
            </span>
          )}

          <Button
            variant="ghost"
            size="icon-sm"
            className={`hover:bg-transparent ${actionTextClass} ${actionHoverClass}`}
            aria-label="Редактировать"
          >
            <Pencil className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon-sm"
            className={`hover:bg-transparent ${actionTextClass} ${deleteHoverClass}`}
            onClick={() => onDelete(tx.id)}
            aria-label="Удалить"
            disabled={tx.isDeleted || isDeleting}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function TransactionsView({
  view = "actual",
}: {
  view?: TransactionsViewMode;
}) {
  const { data: session } = useSession();
  const isPlanningView = view === "planning";

  const [items, setItems] = useState<ItemOut[]>([]);
  const [txs, setTxs] = useState<TransactionOut[]>([]);
  const [deletedTxs, setDeletedTxs] = useState<TransactionOut[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [commentFilter, setCommentFilter] = useState("");
  const [amountFrom, setAmountFrom] = useState("");
  const [amountTo, setAmountTo] = useState("");
  const [selectedDirections, setSelectedDirections] = useState<
    Set<TransactionOut["direction"]>
  >(() => new Set());
  const [selectedCategoryL1, setSelectedCategoryL1] = useState<Set<string>>(
    () => new Set()
  );
  const [selectedCategoryL2, setSelectedCategoryL2] = useState<Set<string>>(
    () => new Set()
  );
  const [selectedCategoryL3, setSelectedCategoryL3] = useState<Set<string>>(
    () => new Set()
  );
  const [isItemsFilterOpen, setIsItemsFilterOpen] = useState(false);
  const [isCategoryL1Open, setIsCategoryL1Open] = useState(false);
  const [isCategoryL2Open, setIsCategoryL2Open] = useState(false);
  const [isCategoryL3Open, setIsCategoryL3Open] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<number>>(
    () => new Set()
  );

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [direction, setDirection] = useState<"INCOME" | "EXPENSE" | "TRANSFER">(
    "EXPENSE"
  );
  const [primaryItemId, setPrimaryItemId] = useState<number | null>(null);
  const [counterpartyItemId, setCounterpartyItemId] = useState<number | null>(null);
  const [amountStr, setAmountStr] = useState("");
  const [cat1, setCat1] = useState("Питание");
  const [cat2, setCat2] = useState("Продукты");
  const [cat3, setCat3] = useState("Супермаркет");
  const [description, setDescription] = useState("");
  const [comment, setComment] = useState("");

  const [selectedTxIds, setSelectedTxIds] = useState<Set<number>>(() => new Set());
  const [deleteIds, setDeleteIds] = useState<number[] | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const itemsById = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items]
  );
  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }, [items]);
  const categoryL1Options = useMemo(() => {
    return [...CATEGORY_L1].sort((a, b) => a.localeCompare(b, "ru"));
  }, []);
  const categoryL2Options = useMemo(() => {
    const values = new Set<string>();
    const keys =
      selectedCategoryL1.size > 0
        ? Array.from(selectedCategoryL1)
        : Object.keys(CATEGORY_L2);
    keys.forEach((key) => {
      (CATEGORY_L2[key] ?? []).forEach((val) => values.add(val));
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b, "ru"));
  }, [selectedCategoryL1]);
  const categoryL3Options = useMemo(() => {
    const values = new Set<string>();
    if (selectedCategoryL2.size > 0) {
      selectedCategoryL2.forEach((key) => {
        (CATEGORY_L3[key] ?? []).forEach((val) => values.add(val));
      });
    } else {
      const l2Keys =
        selectedCategoryL1.size > 0
          ? Array.from(selectedCategoryL1).flatMap(
              (key) => CATEGORY_L2[key] ?? []
            )
          : Object.keys(CATEGORY_L3);
      l2Keys.forEach((key) => {
        (CATEGORY_L3[key] ?? []).forEach((val) => values.add(val));
      });
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b, "ru"));
  }, [selectedCategoryL1, selectedCategoryL2]);

  const itemName = (id: number | null | undefined) => {
    if (!id) return "-";
    return itemsById.get(id)?.name ?? `#${id}`;
  };

  const isTransfer = direction === "TRANSFER";
  const cat2Options = useMemo(() => CATEGORY_L2[cat1] ?? [], [cat1]);
  const cat3Options = useMemo(() => CATEGORY_L3[cat2] ?? [], [cat2]);
  const segmentedButtonBase =
    "flex-1 rounded-sm px-4 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500";

  const resetForm = () => {
    setDate(new Date().toISOString().slice(0, 10));
    setDirection("EXPENSE");
    setPrimaryItemId(null);
    setCounterpartyItemId(null);
    setAmountStr("");
    setCat1("Питание");
    setCat2("Продукты");
    setCat3("Супермаркет");
    setDescription("");
    setComment("");
  };

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [itemsData, txData, deletedData] = await Promise.all([
        fetchItems(),
        fetchTransactions(),
        fetchDeletedTransactions(),
      ]);
      setItems(itemsData);
      setTxs(txData);
      setDeletedTxs(deletedData);
    } catch (e: any) {
      setError(e?.message ?? "Не удалось загрузить транзакции.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (session) loadAll();
  }, [session]);

  useEffect(() => {
    setSelectedTxIds((prev) => {
      if (prev.size === 0) return prev;
      const availableIds = new Set(txs.map((tx) => tx.id));
      let changed = false;
      const next = new Set<number>();
      prev.forEach((id) => {
        if (availableIds.has(id)) {
          next.add(id);
        } else {
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [txs]);

  const filteredTxs = useMemo(() => {
    const active = isPlanningView
      ? txs.filter((tx) => tx.transaction_type === "PLANNED")
      : txs;
    const deleted = showDeleted
      ? isPlanningView
        ? deletedTxs.filter((tx) => tx.transaction_type === "PLANNED")
        : deletedTxs
      : [];

    const combined = [
      ...active.map((tx) => ({ ...tx })),
      ...deleted.map((tx) => ({ ...tx, isDeleted: true })),
    ];

    const commentQuery = commentFilter.trim().toLowerCase();
    const minAmount = parseAmountFilter(amountFrom);
    const maxAmount = parseAmountFilter(amountTo);

    return combined.filter((tx) => {
      if (dateFrom && tx.transaction_date < dateFrom) return false;
      if (dateTo && tx.transaction_date > dateTo) return false;
      if (commentQuery) {
        const commentText = (tx.comment ?? "").toLowerCase();
        if (!commentText.includes(commentQuery)) return false;
      }
      if (minAmount != null || maxAmount != null) {
        const absAmount = Math.abs(tx.amount_rub);
        if (minAmount != null && absAmount < minAmount) return false;
        if (maxAmount != null && absAmount > maxAmount) return false;
      }
      if (
        selectedCategoryL1.size > 0 &&
        !selectedCategoryL1.has(tx.category_l1)
      ) {
        return false;
      }
      if (
        selectedCategoryL2.size > 0 &&
        !selectedCategoryL2.has(tx.category_l2)
      ) {
        return false;
      }
      if (
        selectedCategoryL3.size > 0 &&
        !selectedCategoryL3.has(tx.category_l3)
      ) {
        return false;
      }
      if (selectedDirections.size > 0 && !selectedDirections.has(tx.direction)) {
        return false;
      }
      if (selectedItemIds.size > 0) {
        const hasPrimary = selectedItemIds.has(tx.primary_item_id);
        const hasCounterparty =
          tx.counterparty_item_id != null &&
          selectedItemIds.has(tx.counterparty_item_id);
        if (!hasPrimary && !hasCounterparty) return false;
      }
      return true;
    });
  }, [
    txs,
    deletedTxs,
    isPlanningView,
    showDeleted,
    dateFrom,
    dateTo,
    commentFilter,
    amountFrom,
    amountTo,
    selectedCategoryL1,
    selectedCategoryL2,
    selectedCategoryL3,
    selectedDirections,
    selectedItemIds,
  ]);

  const sortedTxs = useMemo(() => {
    return filteredTxs
      .slice()
      .sort((a, b) => {
        const dateDiff = b.transaction_date.localeCompare(a.transaction_date);
        if (dateDiff !== 0) return dateDiff;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [filteredTxs]);
  const selectableIds = useMemo(
    () => sortedTxs.filter((tx) => !tx.isDeleted).map((tx) => tx.id),
    [sortedTxs]
  );
  const selectedVisibleCount = useMemo(
    () =>
      selectableIds.reduce(
        (count, id) => count + (selectedTxIds.has(id) ? 1 : 0),
        0
      ),
    [selectableIds, selectedTxIds]
  );
  const allSelected =
    selectableIds.length > 0 && selectedVisibleCount === selectableIds.length;
  const someSelected = selectedVisibleCount > 0 && !allSelected;
  const selectAllRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  const toggleTxSelection = (id: number, checked: boolean) => {
    setSelectedTxIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const openDeleteDialog = (ids: number[]) => {
    if (ids.length === 0) return;
    setDeleteIds(ids);
  };
  const toggleItemSelection = (id: number, checked: boolean) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };
  const toggleAllSelection = (checked: boolean) => {
    setSelectedTxIds((prev) => {
      const next = new Set(prev);
      selectableIds.forEach((id) => {
        if (checked) {
          next.add(id);
        } else {
          next.delete(id);
        }
      });
      return next;
    });
  };
  const toggleCategoryL1Selection = (value: string) => {
    setSelectedCategoryL1((prev) => {
      const next = new Set(prev);
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
      }
      return next;
    });
  };
  const toggleCategoryL2Selection = (value: string) => {
    setSelectedCategoryL2((prev) => {
      const next = new Set(prev);
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
      }
      return next;
    });
  };
  const toggleCategoryL3Selection = (value: string) => {
    setSelectedCategoryL3((prev) => {
      const next = new Set(prev);
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
      }
      return next;
    });
  };
  const toggleDirectionFilter = (dir: TransactionOut["direction"]) => {
    setSelectedDirections((prev) => {
      const next = new Set(prev);
      if (next.has(dir)) {
        next.delete(dir);
      } else {
        next.add(dir);
      }
      return next;
    });
  };

  const deleteCount = deleteIds?.length ?? 0;
  const isBulkDelete = deleteCount > 1;
  const txType = isPlanningView ? "PLANNED" : "ACTUAL";
  const isIncomeSelected = selectedDirections.has("INCOME");
  const isExpenseSelected = selectedDirections.has("EXPENSE");
  const isTransferSelected = selectedDirections.has("TRANSFER");

  return (
    <main className="min-h-screen bg-[#F7F8FA] px-8 py-8">
      {loading && <div className="mb-4 text-sm text-muted-foreground">Загрузка...</div>}
      {error && <div className="mb-4 text-sm text-red-600">{error}</div>}

      <div className="flex flex-col gap-6 lg:flex-row">
        <aside className="w-full max-w-[380px] shrink-0">
          <div className="rounded-lg border-2 border-border/70 bg-white p-4">
            <div className="space-y-6">
              <Dialog
                open={isOpen}
                onOpenChange={(open) => {
                  setIsOpen(open);
                  setFormError(null);
                  if (open) resetForm();
                }}
              >
                <DialogTrigger asChild>
                  <Button className="w-full bg-violet-600 text-white hover:bg-violet-700">
                    <Plus className="mr-2 h-4 w-4" />
                    Добавить
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[560px]">
                  <DialogHeader>
                    <DialogTitle>Добавить транзакцию</DialogTitle>
                  </DialogHeader>

                  <form
                    className="grid gap-4"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setFormError(null);

                      const cents = parseRubToCents(amountStr);

                      if (!primaryItemId) {
                        setFormError("Выберите актив/обязательство.");
                        return;
                      }
                      if (!Number.isFinite(cents) || cents < 0) {
                        setFormError("Введите сумму в формате 1234,56.");
                        return;
                      }
                      if (isTransfer && !counterpartyItemId) {
                        setFormError("Выберите корреспондирующий актив.");
                        return;
                      }
                      if (txType === "PLANNED") {
                        const today = new Date().toISOString().slice(0, 10);
                        if (date < today) {
                          setFormError(
                            "Плановая транзакция не может быть создана ранее текущего дня."
                          );
                          return;
                        }
                      }

                      try {
                        await createTransaction({
                          transaction_date: date,
                          primary_item_id: primaryItemId,
                          counterparty_item_id: isTransfer
                            ? counterpartyItemId
                            : null,
                          amount_rub: cents,
                          direction,
                          transaction_type: txType,
                          category_l1: isTransfer ? "" : cat1,
                          category_l2: isTransfer ? "" : cat2,
                          category_l3: isTransfer ? "" : cat3,
                          description: description || null,
                          comment: comment || null,
                        });

                        setIsOpen(false);
                        await loadAll();
                      } catch (e: any) {
                        setFormError(e?.message ?? "Не удалось создать транзакцию.");
                      }
                    }}
                  >
                    {formError && (
                      <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                        {formError}
                      </div>
                    )}

                    <div className="grid gap-2" role="group" aria-label="Характер транзакции">
                      <div className="inline-flex w-full items-stretch overflow-hidden rounded-md border border-input bg-muted/60 p-0.5">
                        <button
                          type="button"
                          aria-pressed={direction === "INCOME"}
                          onClick={() => {
                            setDirection("INCOME");
                            setCounterpartyItemId(null);
                            setCat1("Питание");
                            setCat2("Продукты");
                            setCat3("Супермаркет");
                          }}
                          className={`${segmentedButtonBase} ${
                            direction === "INCOME"
                              ? "bg-green-50 text-green-700"
                              : "bg-white text-muted-foreground hover:bg-white"
                          }`}
                        >
                          Доход
                        </button>
                        <button
                          type="button"
                          aria-pressed={direction === "EXPENSE"}
                          onClick={() => {
                            setDirection("EXPENSE");
                            setCounterpartyItemId(null);
                            setCat1("Питание");
                            setCat2("Продукты");
                            setCat3("Супермаркет");
                          }}
                          className={`${segmentedButtonBase} ${
                            direction === "EXPENSE"
                              ? "bg-red-50 text-red-700"
                              : "bg-white text-muted-foreground hover:bg-white"
                          }`}
                        >
                          Расход
                        </button>
                        <button
                          type="button"
                          aria-pressed={direction === "TRANSFER"}
                          onClick={() => {
                            setDirection("TRANSFER");
                            setCounterpartyItemId(null);
                            setCat1("");
                            setCat2("");
                            setCat3("");
                          }}
                          className={`${segmentedButtonBase} ${
                            direction === "TRANSFER"
                              ? "bg-violet-50 text-violet-700"
                              : "bg-white text-muted-foreground hover:bg-white"
                          }`}
                        >
                          Перевод
                        </button>
                      </div>
                    </div>

                    <div className="grid gap-2">
                      <Label>Дата транзакции</Label>
                      <Input
                        type="date"
                        className="border-2 border-border/70 bg-white shadow-none"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label>Актив / обязательство</Label>
                      <Select
                        value={primaryItemId ? String(primaryItemId) : ""}
                        onValueChange={(v) => setPrimaryItemId(Number(v))}
                      >
                        <SelectTrigger className="border-2 border-border/70 bg-white shadow-none">
                          <SelectValue placeholder="Выберите" />
                        </SelectTrigger>
                        <SelectContent>
                          {items.map((it) => (
                            <SelectItem key={it.id} value={String(it.id)}>
                              {it.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {isTransfer && (
                      <div className="grid gap-2">
                        <Label>Корреспондирующий актив</Label>
                        <Select
                          value={
                            counterpartyItemId ? String(counterpartyItemId) : ""
                          }
                          onValueChange={(v) =>
                            setCounterpartyItemId(Number(v))
                          }
                        >
                          <SelectTrigger className="border-2 border-border/70 bg-white shadow-none">
                            <SelectValue placeholder="Выберите" />
                          </SelectTrigger>
                          <SelectContent>
                            {items
                              .filter((it) => it.id !== primaryItemId)
                              .map((it) => (
                                <SelectItem key={it.id} value={String(it.id)}>
                                  {it.name}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    <div className="grid gap-2">
                      <Label>Сумма</Label>
                      <Input
                        className="border-2 border-border/70 bg-white shadow-none"
                        value={amountStr}
                        onChange={(e) => setAmountStr(formatRubInput(e.target.value))}
                        onBlur={() =>
                          setAmountStr((prev) => normalizeRubOnBlur(prev))
                        }
                        inputMode="decimal"
                        placeholder="Например: 1 234,56"
                      />
                    </div>

                    {!isTransfer && (
                      <>
                        <div className="grid gap-2">
                          <Label>Категория L1</Label>
                          <Select
                            value={cat1}
                            onValueChange={(v) => {
                              setCat1(v);
                              const first2 = (CATEGORY_L2[v] ?? [])[0] ?? "";
                              setCat2(first2);
                              const first3 = (CATEGORY_L3[first2] ?? [])[0] ?? "";
                              setCat3(first3);
                            }}
                          >
                            <SelectTrigger className="border-2 border-border/70 bg-white shadow-none">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {CATEGORY_L1.map((c) => (
                                <SelectItem key={c} value={c}>
                                  {c}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="grid gap-2">
                          <Label>Категория L2</Label>
                          <Select
                            value={cat2}
                            onValueChange={(v) => {
                              setCat2(v);
                              const first3 = (CATEGORY_L3[v] ?? [])[0] ?? "";
                              setCat3(first3);
                            }}
                          >
                            <SelectTrigger className="border-2 border-border/70 bg-white shadow-none">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {cat2Options.map((c) => (
                                <SelectItem key={c} value={c}>
                                  {c}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="grid gap-2">
                          <Label>Категория L3</Label>
                          <Select value={cat3} onValueChange={setCat3}>
                            <SelectTrigger className="border-2 border-border/70 bg-white shadow-none">
                              <SelectValue placeholder="—" />
                            </SelectTrigger>
                            <SelectContent>
                              {(cat3Options.length ? cat3Options : ["—"]).map((c) => (
                                <SelectItem key={c} value={c}>
                                  {c}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </>
                    )}

                    <div className="grid gap-2">
                      <Label>Описание</Label>
                      <Input
                        className="border-2 border-border/70 bg-white shadow-none"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Например: обед в кафе"
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label>Комментарий</Label>
                      <Input
                        className="border-2 border-border/70 bg-white shadow-none"
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder="Например: с коллегами"
                      />
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="border-2 border-border/70 bg-white shadow-none"
                        onClick={() => setIsOpen(false)}
                      >
                        Отмена
                      </Button>
                      <Button
                        type="submit"
                        className="bg-violet-600 text-white hover:bg-violet-700"
                        disabled={loading}
                      >
                        Добавить
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>

              <div className="-mx-4 border-t-2 border-border/70" />

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="text-base font-semibold text-foreground">
                    Вид транзакции
                  </div>
                  <button
                    type="button"
                    className="text-sm font-medium text-violet-600 hover:underline disabled:text-slate-300"
                    onClick={() =>
                      setSelectedDirections(
                        new Set<TransactionOut["direction"]>()
                      )
                    }
                    disabled={selectedDirections.size === 0}
                  >
                    Сбросить
                  </button>
                </div>
                <div className="inline-flex w-full items-stretch overflow-hidden rounded-md border-2 border-border/70 bg-white p-0.5">
                  <button
                    type="button"
                    aria-pressed={isIncomeSelected}
                    onClick={() => toggleDirectionFilter("INCOME")}
                    className={`${segmentedButtonBase} ${
                      isIncomeSelected
                        ? "bg-green-50 text-green-700"
                        : "bg-white text-muted-foreground hover:bg-white"
                    }`}
                  >
                    Доход
                  </button>
                  <button
                    type="button"
                    aria-pressed={isExpenseSelected}
                    onClick={() => toggleDirectionFilter("EXPENSE")}
                    className={`${segmentedButtonBase} ${
                      isExpenseSelected
                        ? "bg-red-50 text-red-700"
                        : "bg-white text-muted-foreground hover:bg-white"
                    }`}
                  >
                    Расход
                  </button>
                  <button
                    type="button"
                    aria-pressed={isTransferSelected}
                    onClick={() => toggleDirectionFilter("TRANSFER")}
                    className={`${segmentedButtonBase} ${
                      isTransferSelected
                        ? "bg-violet-50 text-violet-700"
                        : "bg-white text-muted-foreground hover:bg-white"
                    }`}
                  >
                    Перевод
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <button
                    type="button"
                    onClick={() => setIsItemsFilterOpen((prev) => !prev)}
                    className="text-base font-semibold text-foreground"
                  >
                    Активы/обязательства
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="text-sm font-medium text-violet-600 hover:underline disabled:text-slate-300"
                      onClick={() => setSelectedItemIds(new Set<number>())}
                      disabled={selectedItemIds.size === 0}
                    >
                      Сбросить
                    </button>
                    <button
                      type="button"
                      aria-label="Свернуть/развернуть"
                      className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                      onClick={() => setIsItemsFilterOpen((prev) => !prev)}
                    >
                      <ChevronDown
                        className={`h-4 w-4 transition-transform ${
                          isItemsFilterOpen ? "rotate-0" : "-rotate-90"
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {isItemsFilterOpen && (
                  <div className="space-y-2">
                    {sortedItems.length === 0 ? (
                      <div className="text-sm text-muted-foreground">
                        Нет активов или обязательств.
                      </div>
                    ) : (
                      sortedItems.map((item) => (
                        <label
                          key={item.id}
                          className="flex items-center gap-3 text-base text-foreground"
                        >
                          <input
                            type="checkbox"
                            className="h-5 w-5 accent-violet-600"
                            checked={selectedItemIds.has(item.id)}
                            onChange={(e) =>
                              toggleItemSelection(item.id, e.target.checked)
                            }
                          />
                          <span>{item.name}</span>
                        </label>
                      ))
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <button
                    type="button"
                    onClick={() => setIsCategoryL1Open((prev) => !prev)}
                    className="text-base font-semibold text-foreground"
                  >
                    Категория 1
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="text-sm font-medium text-violet-600 hover:underline disabled:text-slate-300"
                      onClick={() => setSelectedCategoryL1(new Set<string>())}
                      disabled={selectedCategoryL1.size === 0}
                    >
                      Сбросить
                    </button>
                    <button
                      type="button"
                      aria-label="Свернуть/развернуть"
                      className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                      onClick={() => setIsCategoryL1Open((prev) => !prev)}
                    >
                      <ChevronDown
                        className={`h-4 w-4 transition-transform ${
                          isCategoryL1Open ? "rotate-0" : "-rotate-90"
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {isCategoryL1Open && (
                  <div className="space-y-2">
                    {categoryL1Options.length === 0 ? (
                      <div className="text-sm text-muted-foreground">
                        Нет категорий.
                      </div>
                    ) : (
                      categoryL1Options.map((value) => (
                        <label
                          key={value}
                          className="flex items-center gap-3 text-base text-foreground"
                        >
                          <input
                            type="checkbox"
                            className="h-5 w-5 accent-violet-600"
                            checked={selectedCategoryL1.has(value)}
                            onChange={() => toggleCategoryL1Selection(value)}
                          />
                          <span>{value}</span>
                        </label>
                      ))
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <button
                    type="button"
                    onClick={() => setIsCategoryL2Open((prev) => !prev)}
                    className="text-base font-semibold text-foreground"
                  >
                    Категория 2
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="text-sm font-medium text-violet-600 hover:underline disabled:text-slate-300"
                      onClick={() => setSelectedCategoryL2(new Set<string>())}
                      disabled={selectedCategoryL2.size === 0}
                    >
                      Сбросить
                    </button>
                    <button
                      type="button"
                      aria-label="Свернуть/развернуть"
                      className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                      onClick={() => setIsCategoryL2Open((prev) => !prev)}
                    >
                      <ChevronDown
                        className={`h-4 w-4 transition-transform ${
                          isCategoryL2Open ? "rotate-0" : "-rotate-90"
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {isCategoryL2Open && (
                  <div className="space-y-2">
                    {categoryL2Options.length === 0 ? (
                      <div className="text-sm text-muted-foreground">
                        Нет категорий.
                      </div>
                    ) : (
                      categoryL2Options.map((value) => (
                        <label
                          key={value}
                          className="flex items-center gap-3 text-base text-foreground"
                        >
                          <input
                            type="checkbox"
                            className="h-5 w-5 accent-violet-600"
                            checked={selectedCategoryL2.has(value)}
                            onChange={() => toggleCategoryL2Selection(value)}
                          />
                          <span>{value}</span>
                        </label>
                      ))
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <button
                    type="button"
                    onClick={() => setIsCategoryL3Open((prev) => !prev)}
                    className="text-base font-semibold text-foreground"
                  >
                    Категория 3
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="text-sm font-medium text-violet-600 hover:underline disabled:text-slate-300"
                      onClick={() => setSelectedCategoryL3(new Set<string>())}
                      disabled={selectedCategoryL3.size === 0}
                    >
                      Сбросить
                    </button>
                    <button
                      type="button"
                      aria-label="Свернуть/развернуть"
                      className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                      onClick={() => setIsCategoryL3Open((prev) => !prev)}
                    >
                      <ChevronDown
                        className={`h-4 w-4 transition-transform ${
                          isCategoryL3Open ? "rotate-0" : "-rotate-90"
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {isCategoryL3Open && (
                  <div className="space-y-2">
                    {categoryL3Options.length === 0 ? (
                      <div className="text-sm text-muted-foreground">
                        Нет категорий.
                      </div>
                    ) : (
                      categoryL3Options.map((value) => (
                        <label
                          key={value}
                          className="flex items-center gap-3 text-base text-foreground"
                        >
                          <input
                            type="checkbox"
                            className="h-5 w-5 accent-violet-600"
                            checked={selectedCategoryL3.has(value)}
                            onChange={() => toggleCategoryL3Selection(value)}
                          />
                          <span>{value}</span>
                        </label>
                      ))
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="text-base font-semibold text-foreground">
                    Дата транзакции
                  </div>
                  <button
                    type="button"
                    className="text-sm font-medium text-violet-600 hover:underline disabled:text-slate-300"
                    onClick={() => {
                      setDateFrom("");
                      setDateTo("");
                    }}
                    disabled={!dateFrom && !dateTo}
                  >
                    Сбросить
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    type="date"
                    className={`h-10 w-full min-w-0 flex-1 border-2 border-border/70 bg-white shadow-none ${
                      dateFrom ? "text-foreground" : "text-muted-foreground"
                    }`}
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                  />
                  <span className="text-sm text-muted-foreground">—</span>
                  <Input
                    type="date"
                    className={`h-10 w-full min-w-0 flex-1 border-2 border-border/70 bg-white shadow-none ${
                      dateTo ? "text-foreground" : "text-muted-foreground"
                    }`}
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="text-base font-semibold text-foreground">
                    Комментарий
                  </div>
                  <button
                    type="button"
                    className="text-sm font-medium text-violet-600 hover:underline disabled:text-slate-300"
                    onClick={() => setCommentFilter("")}
                    disabled={!commentFilter}
                  >
                    Сбросить
                  </button>
                </div>
                <Input
                  type="text"
                  className="h-10 w-full border-2 border-border/70 bg-white shadow-none"
                  placeholder="Введите текст"
                  value={commentFilter}
                  onChange={(e) => setCommentFilter(e.target.value)}
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="text-base font-semibold text-foreground">
                    Сумма транзакции
                  </div>
                  <button
                    type="button"
                    className="text-sm font-medium text-violet-600 hover:underline disabled:text-slate-300"
                    onClick={() => {
                      setAmountFrom("");
                      setAmountTo("");
                    }}
                    disabled={!amountFrom && !amountTo}
                  >
                    Сбросить
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    type="text"
                    inputMode="decimal"
                    className="h-10 w-full min-w-0 flex-1 border-2 border-border/70 bg-white shadow-none"
                    placeholder="От"
                    value={amountFrom}
                    onChange={(e) =>
                      setAmountFrom(formatRubInput(e.target.value))
                    }
                    onBlur={() =>
                      setAmountFrom((prev) => normalizeRubOnBlur(prev))
                    }
                  />
                  <span className="text-sm text-muted-foreground">—</span>
                  <Input
                    type="text"
                    inputMode="decimal"
                    className="h-10 w-full min-w-0 flex-1 border-2 border-border/70 bg-white shadow-none"
                    placeholder="До"
                    value={amountTo}
                    onChange={(e) => setAmountTo(formatRubInput(e.target.value))}
                    onBlur={() => setAmountTo((prev) => normalizeRubOnBlur(prev))}
                  />
                </div>
              </div>

              <div className="-mx-4 border-t-2 border-border/70" />

              <button
                type="button"
                aria-pressed={showDeleted}
                onClick={() => setShowDeleted((prev) => !prev)}
                className={`inline-flex w-full items-center justify-center rounded-md border-2 border-border/70 px-4 py-2 text-sm font-medium transition-colors ${
                  showDeleted
                    ? "bg-violet-50 text-violet-700"
                    : "bg-white text-muted-foreground hover:bg-white"
                }`}
              >
                Показывать удаленные транзакции
              </button>
            </div>
          </div>
        </aside>

        <div className="flex-1">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                ref={selectAllRef}
                type="checkbox"
                className="h-5 w-5 accent-violet-600"
                checked={allSelected}
                onChange={(e) => toggleAllSelection(e.target.checked)}
                disabled={selectableIds.length === 0}
                aria-label="Выбрать все транзакции"
              />
              <span>Выбрать все</span>
            </div>
            {sortedTxs.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-muted-foreground">
                Нет транзакций.
              </div>
            ) : (
              sortedTxs.map((tx) => (
                <TransactionCardRow
                  key={`${tx.id}-${tx.isDeleted ? "deleted" : "active"}`}
                  tx={tx}
                  itemName={itemName}
                  isSelected={!tx.isDeleted && selectedTxIds.has(tx.id)}
                  onToggleSelection={toggleTxSelection}
                  onDelete={(id) => openDeleteDialog([id])}
                  isDeleting={isDeleting}
                />
              ))
            )}
          </div>
        </div>
      </div>

      <AlertDialog
        open={deleteCount > 0}
        onOpenChange={(open) => {
          if (!open) setDeleteIds(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isBulkDelete ? "Удалить выбранные транзакции?" : "Удалить транзакцию?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Транзакции будут перемещены в список удаленных.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>

            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={isDeleting}
              onClick={async () => {
                if (!deleteIds || deleteIds.length === 0) return;
                const idsToDelete = deleteIds;
                setIsDeleting(true);
                try {
                  await Promise.all(idsToDelete.map((id) => deleteTransaction(id)));
                  setSelectedTxIds((prev) => {
                    if (prev.size === 0) return prev;
                    const next = new Set(prev);
                    idsToDelete.forEach((id) => next.delete(id));
                    return next;
                  });
                  setDeleteIds(null);
                  await loadAll();
                } catch (e: any) {
                  setError(e?.message ?? "Не удалось удалить транзакции.");
                  setDeleteIds(null);
                } finally {
                  setIsDeleting(false);
                }
              }}
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

export default function TransactionsPage() {
  return <TransactionsView view="actual" />;
}
