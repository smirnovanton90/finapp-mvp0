"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { Plus, Trash2 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
  fetchItems,
  fetchTransactions,
  fetchDeletedTransactions,
  createTransaction,
  deleteTransaction,
  ItemOut,
  TransactionOut,
} from "@/lib/api";


/* ------------ категории (временные справочники) ------------ */

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

/* ------------ helpers ------------ */

const ALL_VALUE = "__ALL__";

type CategoryOptions = {
  l1: string[];
  l2: Record<string, string[]>;
  l3: Record<string, string[]>;
};

type TransactionsViewMode = "actual" | "planning";

function buildCategoryOptions(txs: TransactionOut[]): CategoryOptions {
  const l1 = new Set(CATEGORY_L1);
  const l2 = new Map<string, Set<string>>();
  const l3 = new Map<string, Set<string>>();

  Object.entries(CATEGORY_L2).forEach(([level1, level2List]) => {
    l2.set(level1, new Set(level2List));
    level2List.forEach((level2) => {
      const level3List = CATEGORY_L3[level2];
      if (level3List) l3.set(level2, new Set(level3List));
    });
  });

  txs.forEach((tx) => {
    if (tx.category_l1) {
      l1.add(tx.category_l1);
      if (tx.category_l2) {
        if (!l2.has(tx.category_l1)) l2.set(tx.category_l1, new Set());
        l2.get(tx.category_l1)?.add(tx.category_l2);

        if (tx.category_l3) {
          if (!l3.has(tx.category_l2)) l3.set(tx.category_l2, new Set());
          l3.get(tx.category_l2)?.add(tx.category_l3);
        }
      }
    }
  });

  return {
    l1: Array.from(l1).sort(),
    l2: Object.fromEntries(
      Array.from(l2.entries()).map(([key, value]) => [key, Array.from(value).sort()])
    ),
    l3: Object.fromEntries(
      Array.from(l3.entries()).map(([key, value]) => [key, Array.from(value).sort()])
    ),
  };
}

function formatRub(valueInCents: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valueInCents / 100);
}

function formatDirection(dir: TransactionOut["direction"]) {
  if (dir === "INCOME") return "Доход";
  if (dir === "EXPENSE") return "Расход";
  return "Перевод";
}

// "1 234,56" -> 123456
function parseRubToCents(input: string): number {
  const normalized = input.trim().replace(/\s/g, "").replace(",", ".");
  const value = Number(normalized);
  if (!Number.isFinite(value)) return NaN;
  return Math.round(value * 100);
}

// ввод: разрешаем цифры + один разделитель, форматируем пробелы
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

// blur: добиваем до ",00"
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

/* ------------ page ------------ */

export function TransactionsView({
  view = "actual",
}: {
  view?: TransactionsViewMode;
}) {
  const { data: session } = useSession();
  const isPlanningView = view === "planning";

  const [items, setItems] = useState<ItemOut[]>([]);
  const [txs, setTxs] = useState<TransactionOut[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [deletedTxs, setDeletedTxs] = useState<TransactionOut[]>([]);
  const [deletedLoading, setDeletedLoading] = useState(false);
  const [deletedError, setDeletedError] = useState<string | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);

  const [isOpen, setIsOpen] = useState(false);

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

  const [txType, setTxType] = useState<"ACTUAL" | "PLANNED">("ACTUAL");
  const [description, setDescription] = useState("");
  const [comment, setComment] = useState("");

  const [selectedTxIds, setSelectedTxIds] = useState<Set<number>>(() => new Set());
  const [deleteIds, setDeleteIds] = useState<number[] | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [actualCat1Filter, setActualCat1Filter] = useState<string>(ALL_VALUE);
  const [actualCat2Filter, setActualCat2Filter] = useState<string>(ALL_VALUE);
  const [actualCat3Filter, setActualCat3Filter] = useState<string>(ALL_VALUE);

  const segmentedButtonBase =
    "flex-1 rounded-sm px-4 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500";

  const [plannedCat1Filter, setPlannedCat1Filter] = useState<string>(ALL_VALUE);
  const [plannedCat2Filter, setPlannedCat2Filter] = useState<string>(ALL_VALUE);
  const [plannedCat3Filter, setPlannedCat3Filter] = useState<string>(ALL_VALUE);
  const [deletedActualCat1Filter, setDeletedActualCat1Filter] =
    useState<string>(ALL_VALUE);
  const [deletedActualCat2Filter, setDeletedActualCat2Filter] =
    useState<string>(ALL_VALUE);
  const [deletedActualCat3Filter, setDeletedActualCat3Filter] =
    useState<string>(ALL_VALUE);
  const [deletedPlannedCat1Filter, setDeletedPlannedCat1Filter] =
    useState<string>(ALL_VALUE);
  const [deletedPlannedCat2Filter, setDeletedPlannedCat2Filter] =
    useState<string>(ALL_VALUE);
  const [deletedPlannedCat3Filter, setDeletedPlannedCat3Filter] =
    useState<string>(ALL_VALUE);

  const isTransfer = direction === "TRANSFER";

  const cat2Options = useMemo(() => CATEGORY_L2[cat1] ?? [], [cat1]);
  const cat3Options = useMemo(() => CATEGORY_L3[cat2] ?? [], [cat2]);

  const itemsById = useMemo(() => new Map(items.map((x) => [x.id, x])), [items]);
  const selectedCount = selectedTxIds.size;
  const deleteCount = deleteIds?.length ?? 0;
  const isBulkDelete = deleteCount > 1;

  // Разделяем транзакции по типам
  const actualTxs = useMemo(
    () => txs.filter((tx) => tx.transaction_type === "ACTUAL"),
    [txs]
  );

  const plannedTxs = useMemo(
    () => txs.filter((tx) => tx.transaction_type === "PLANNED"),
    [txs]
  );

  const deletedActualTxs = useMemo(
    () => deletedTxs.filter((tx) => tx.transaction_type === "ACTUAL"),
    [deletedTxs]
  );
  const deletedPlannedTxs = useMemo(
    () => deletedTxs.filter((tx) => tx.transaction_type === "PLANNED"),
    [deletedTxs]
  );

  // Итоги для фактических транзакций
  const actualCategoryOptions = useMemo(
    () => buildCategoryOptions(actualTxs),
    [actualTxs]
  );

  const plannedCategoryOptions = useMemo(
    () => buildCategoryOptions(plannedTxs),
    [plannedTxs]
  );

  const deletedActualCategoryOptions = useMemo(
    () => buildCategoryOptions(deletedActualTxs),
    [deletedActualTxs]
  );
  const deletedPlannedCategoryOptions = useMemo(
    () => buildCategoryOptions(deletedPlannedTxs),
    [deletedPlannedTxs]
  );

  const actualFilteredTxs = useMemo(() => {
    return actualTxs.filter((tx) => {
      if (actualCat1Filter !== ALL_VALUE && tx.category_l1 !== actualCat1Filter) {
        return false;
      }

      if (actualCat2Filter !== ALL_VALUE && tx.category_l2 !== actualCat2Filter) {
        return false;
      }

      if (actualCat3Filter !== ALL_VALUE && tx.category_l3 !== actualCat3Filter) {
        return false;
      }

      return true;
    });
  }, [actualCat1Filter, actualCat2Filter, actualCat3Filter, actualTxs]);

  const plannedFilteredTxs = useMemo(() => {
    return plannedTxs.filter((tx) => {
      if (plannedCat1Filter !== ALL_VALUE && tx.category_l1 !== plannedCat1Filter) {
        return false;
      }

      if (plannedCat2Filter !== ALL_VALUE && tx.category_l2 !== plannedCat2Filter) {
        return false;
      }

      if (plannedCat3Filter !== ALL_VALUE && tx.category_l3 !== plannedCat3Filter) {
        return false;
      }

      return true;
    });
  }, [plannedCat1Filter, plannedCat2Filter, plannedCat3Filter, plannedTxs]);

  const deletedActualFilteredTxs = useMemo(() => {
    return deletedActualTxs.filter((tx) => {
      if (
        deletedActualCat1Filter !== ALL_VALUE &&
        tx.category_l1 !== deletedActualCat1Filter
      ) {
        return false;
      }

      if (
        deletedActualCat2Filter !== ALL_VALUE &&
        tx.category_l2 !== deletedActualCat2Filter
      ) {
        return false;
      }

      if (
        deletedActualCat3Filter !== ALL_VALUE &&
        tx.category_l3 !== deletedActualCat3Filter
      ) {
        return false;
      }

      return true;
    });
  }, [
    deletedActualCat1Filter,
    deletedActualCat2Filter,
    deletedActualCat3Filter,
    deletedActualTxs,
  ]);
  const deletedPlannedFilteredTxs = useMemo(() => {
    return deletedPlannedTxs.filter((tx) => {
      if (
        deletedPlannedCat1Filter !== ALL_VALUE &&
        tx.category_l1 !== deletedPlannedCat1Filter
      ) {
        return false;
      }

      if (
        deletedPlannedCat2Filter !== ALL_VALUE &&
        tx.category_l2 !== deletedPlannedCat2Filter
      ) {
        return false;
      }

      if (
        deletedPlannedCat3Filter !== ALL_VALUE &&
        tx.category_l3 !== deletedPlannedCat3Filter
      ) {
        return false;
      }

      return true;
    });
  }, [
    deletedPlannedCat1Filter,
    deletedPlannedCat2Filter,
    deletedPlannedCat3Filter,
    deletedPlannedTxs,
  ]);

  const actualTotalAmount = useMemo(() => {
    return actualFilteredTxs.reduce((sum, tx) => {
      if (tx.direction === "EXPENSE") {
        return sum - tx.amount_rub;
      } else if (tx.direction === "INCOME") {
        return sum + tx.amount_rub;
      } else if (tx.direction === "TRANSFER") {
        return sum + tx.amount_rub;
      }
      return sum;
    }, 0);
  }, [actualFilteredTxs]);

  // Итоги для плановых транзакций
  const plannedTotalAmount = useMemo(() => {
    return plannedFilteredTxs.reduce((sum, tx) => {
      if (tx.direction === "EXPENSE") {
        return sum - tx.amount_rub;
      } else if (tx.direction === "INCOME") {
        return sum + tx.amount_rub;
      } else if (tx.direction === "TRANSFER") {
        return sum + tx.amount_rub;
      }
      return sum;
    }, 0);
  }, [plannedFilteredTxs]);

  const deletedActualTotalAmount = useMemo(() => {
    return deletedActualFilteredTxs.reduce((sum, tx) => {
      if (tx.direction === "EXPENSE") {
        return sum - tx.amount_rub;
      } else if (tx.direction === "INCOME") {
        return sum + tx.amount_rub;
      } else if (tx.direction === "TRANSFER") {
        return sum + tx.amount_rub;
      }
      return sum;
    }, 0);
  }, [deletedActualFilteredTxs]);
  const deletedPlannedTotalAmount = useMemo(() => {
    return deletedPlannedFilteredTxs.reduce((sum, tx) => {
      if (tx.direction === "EXPENSE") {
        return sum - tx.amount_rub;
      } else if (tx.direction === "INCOME") {
        return sum + tx.amount_rub;
      } else if (tx.direction === "TRANSFER") {
        return sum + tx.amount_rub;
      }
      return sum;
    }, 0);
  }, [deletedPlannedFilteredTxs]);

  function itemName(id: number | null | undefined) {
    if (!id) return "—";
    return itemsById.get(id)?.name ?? `#${id}`;
  }

  function resetForm() {
    setDate(new Date().toISOString().slice(0, 10));
    setDirection("EXPENSE");
    setPrimaryItemId(null);
    setCounterpartyItemId(null);
    setAmountStr("");
    setCat1("Питание");
    setCat2("Продукты");
    setCat3("Супермаркет");
    setTxType("ACTUAL");
    setDescription("");
    setComment("");
  }

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [itemsData, txData] = await Promise.all([
        fetchItems(),
        fetchTransactions(),
      ]);
      setItems(itemsData);
      setTxs(txData);
    } catch (e: any) {
      setError(e?.message ?? "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }

  async function loadDeleted() {
    setDeletedLoading(true);
    setDeletedError(null);
    try {
      const deletedData = await fetchDeletedTransactions();
      setDeletedTxs(deletedData);
    } catch (e: any) {
      setDeletedError(e?.message ?? "Не удалось загрузить удаленные транзакции");
    } finally {
      setDeletedLoading(false);
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

  const buildCat2Options = (
    cat1Filter: string,
    options: CategoryOptions
  ): string[] => {
    if (cat1Filter !== ALL_VALUE) return options.l2[cat1Filter] ?? [];

    const merged = new Set<string>();
    Object.values(options.l2).forEach((vals) => vals.forEach((v) => merged.add(v)));
    return Array.from(merged).sort();
  };

  const buildCat3Options = (
    cat1Filter: string,
    cat2Filter: string,
    options: CategoryOptions
  ): string[] => {
    if (cat2Filter !== ALL_VALUE) return options.l3[cat2Filter] ?? [];

    const merged = new Set<string>();

    if (cat1Filter !== ALL_VALUE) {
      const cat2List = options.l2[cat1Filter] ?? [];
      cat2List.forEach((cat2Value) => {
        (options.l3[cat2Value] ?? []).forEach((v) => merged.add(v));
      });
    } else {
      Object.values(options.l3).forEach((vals) => vals.forEach((v) => merged.add(v)));
    }

    return Array.from(merged).sort();
  };

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

  const toggleAllSelection = (ids: number[], checked: boolean) => {
    setSelectedTxIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => {
        if (checked) {
          next.add(id);
        } else {
          next.delete(id);
        }
      });
      return next;
    });
  };

  const openDeleteDialog = (ids: number[]) => {
    if (ids.length === 0) return;
    setDeleteIds(ids);
  };

  const handleToggleDeleted = () => {
    const next = !showDeleted;
    setShowDeleted(next);
    if (next && !deletedLoading) {
      loadDeleted();
    }
  };

  function CategoryFilters({
    title,
    cat1Filter,
    cat2Filter,
    cat3Filter,
    onCat1Change,
    onCat2Change,
    onCat3Change,
    options,
  }: {
    title: string;
    cat1Filter: string;
    cat2Filter: string;
    cat3Filter: string;
    onCat1Change: (val: string) => void;
    onCat2Change: (val: string) => void;
    onCat3Change: (val: string) => void;
    options: CategoryOptions;
  }) {
    const cat2Options = useMemo(
      () => buildCat2Options(cat1Filter, options),
      [cat1Filter, options]
    );

    const cat3Options = useMemo(
      () => buildCat3Options(cat1Filter, cat2Filter, options),
      [cat1Filter, cat2Filter, options]
    );

    return (
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <CardTitle className="text-base">{title}</CardTitle>

        <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-3 sm:gap-3">
          <div className="grid gap-1">
            <Label className="text-xs text-muted-foreground">Категория 1</Label>
            <Select
              value={cat1Filter}
              onValueChange={(v) => {
                onCat1Change(v);
                onCat2Change(ALL_VALUE);
                onCat3Change(ALL_VALUE);
              }}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Все" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>Все категории</SelectItem>
                {options.l1.map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1">
            <Label className="text-xs text-muted-foreground">Категория 2</Label>
            <Select
              value={cat2Filter}
              onValueChange={(v) => {
                onCat2Change(v);
                onCat3Change(ALL_VALUE);
              }}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Все" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>Все подкатегории</SelectItem>
                {cat2Options.map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1">
            <Label className="text-xs text-muted-foreground">Категория 3</Label>
            <Select value={cat3Filter} onValueChange={(v) => onCat3Change(v)}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Все" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>Все подкатегории</SelectItem>
                {cat3Options.map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    );
  }

  // Компонент таблицы транзакций
  function TransactionsTable({
    transactions,
    totalAmount,
    selectedIds,
    onToggleSelection,
    onToggleAll,
    isDeleting,
    readOnly = false,
  }: {
    transactions: TransactionOut[];
    totalAmount: number;
    selectedIds?: Set<number>;
    onToggleSelection?: (id: number, checked: boolean) => void;
    onToggleAll?: (ids: number[], checked: boolean) => void;
    isDeleting?: boolean;
    readOnly?: boolean;
  }) {
    const selectAllRef = useRef<HTMLInputElement | null>(null);
    const selectionEnabled = !readOnly;
    const safeSelectedIds = selectedIds ?? new Set<number>();
    const noopToggleSelection = (_id: number, _checked: boolean) => {};
    const noopToggleAll = (_ids: number[], _checked: boolean) => {};
    const safeOnToggleSelection = onToggleSelection ?? noopToggleSelection;
    const safeOnToggleAll = onToggleAll ?? noopToggleAll;
    const safeIsDeleting = isDeleting ?? false;
    const transactionIds = transactions.map((tx) => tx.id);
    const selectedVisibleCount = selectionEnabled
      ? transactionIds.reduce(
          (count, id) => count + (safeSelectedIds.has(id) ? 1 : 0),
          0
        )
      : 0;
    const allSelected =
      selectionEnabled &&
      transactionIds.length > 0 &&
      selectedVisibleCount === transactionIds.length;
    const someSelected =
      selectionEnabled && selectedVisibleCount > 0 && !allSelected;
    const totalLabelSpan = selectionEnabled ? 3 : 2;
    const totalTailSpan = selectionEnabled ? 5 : 4;
    const emptyColSpan = selectionEnabled ? 9 : 7;

    useEffect(() => {
      if (!selectionEnabled) return;
      if (selectAllRef.current) {
        selectAllRef.current.indeterminate = someSelected;
      }
    }, [selectionEnabled, someSelected]);

    return (
      <div className="w-full overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow>
              {selectionEnabled && (
                <TableHead className="w-[160px] min-w-[140px]">
                <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    className="h-4 w-4 accent-violet-600"
                    checked={allSelected}
                    onChange={(e) => safeOnToggleAll(transactionIds, e.target.checked)}
                    disabled={transactionIds.length === 0 || safeIsDeleting}
                    aria-label="Выделить все"
                  />
                  <span>Выделить все</span>
                </label>
              </TableHead>
              )}
              <TableHead className="font-medium text-muted-foreground w-[100px] min-w-[100px]">
                Дата
              </TableHead>
              <TableHead className="font-medium text-muted-foreground w-[120px] min-w-[100px]">Актив</TableHead>
              <TableHead className="font-medium text-muted-foreground w-[100px] min-w-[100px] whitespace-nowrap">Сумма</TableHead>
              <TableHead className="font-medium text-muted-foreground w-[120px] min-w-[100px]">
                Корр. актив
              </TableHead>
              <TableHead className="font-medium text-muted-foreground w-[120px] min-w-[100px]">Категория</TableHead>
              <TableHead className="font-medium text-muted-foreground min-w-0">Описание</TableHead>
              <TableHead className="font-medium text-muted-foreground min-w-0">Комментарий</TableHead>
              {selectionEnabled && (
                <TableHead className="w-[50px] min-w-[50px]" />
              )}
            </TableRow>
          </TableHeader>

          <TableBody>
            {transactions.map((tx) => {
              const isExpense = tx.direction === "EXPENSE";
              const isTxTransfer = tx.direction === "TRANSFER";
              const isSelected = selectionEnabled && safeSelectedIds.has(tx.id);

              const amountText = isExpense
                ? `-${formatRub(tx.amount_rub)}`
                : formatRub(tx.amount_rub);

              // Определяем цвет фона строки в зависимости от характера транзакции
              const rowBgClass = 
                tx.direction === "EXPENSE" ? "bg-red-50 hover:!bg-red-100" :
                tx.direction === "INCOME" ? "bg-green-50 hover:!bg-green-100" :
                "bg-violet-50 hover:!bg-violet-100";

              return (
                <TableRow
                  key={tx.id}
                  className={rowBgClass}
                  data-state={isSelected ? "selected" : undefined}
                >
                  {selectionEnabled && (
                    <TableCell>
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-violet-600"
                      checked={isSelected}
                      onChange={(e) => safeOnToggleSelection(tx.id, e.target.checked)}
                      disabled={safeIsDeleting}
                      aria-label={`Выделить транзакцию ${tx.id}`}
                    />
                  </TableCell>
                  )}
                  <TableCell className="whitespace-nowrap text-xs">
                    <div>{new Date(tx.transaction_date).toLocaleDateString("ru-RU")}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(tx.created_at).toLocaleTimeString("ru-RU", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="font-medium truncate" title={itemName(tx.primary_item_id)}>
                      {itemName(tx.primary_item_id)}
                    </div>
                  </TableCell>

                  <TableCell
                    className={[
                      "text-right font-semibold tabular-nums whitespace-nowrap",
                      isExpense ? "text-red-600" : "",
                    ].join(" ")}
                  >
                    {amountText}
                  </TableCell>

                  <TableCell>
                    {isTxTransfer ? (
                      <div className="font-medium truncate" title={itemName(tx.counterparty_item_id)}>
                        {itemName(tx.counterparty_item_id)}
                      </div>
                    ) : (
                      "—"
                    )}
                  </TableCell>

                  <TableCell className="text-xs">
                    {isTxTransfer ? (
                      "—"
                    ) : (
                      <div>
                        <div className="truncate">{tx.category_l1 || "—"}</div>
                        {(tx.category_l2 || tx.category_l3) && (
                          <div className="text-xs text-muted-foreground truncate">
                            {[tx.category_l2, tx.category_l3].filter(Boolean).join(" / ") || ""}
                          </div>
                        )}
                      </div>
                    )}
                  </TableCell>

                  <TableCell className="text-xs">
                    <div className="truncate" title={tx.description || undefined}>
                      {tx.description || "—"}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs">
                    <div className="truncate" title={tx.comment || undefined}>
                      {tx.comment || "—"}
                    </div>
                  </TableCell>

                  {selectionEnabled && (
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-violet-600 hover:bg-transparent"
                        onClick={() => openDeleteDialog([tx.id])}
                        aria-label="Удалить"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}

            {transactions.length > 0 && (
              <TableRow className="bg-muted/60 font-semibold">
                <TableCell colSpan={totalLabelSpan}>Итого</TableCell>
                <TableCell
                  className={[
                    "text-right font-semibold tabular-nums whitespace-nowrap",
                    totalAmount < 0 ? "text-red-600" : "",
                  ].join(" ")}
                >
                  {totalAmount < 0
                    ? `-${formatRub(Math.abs(totalAmount))}`
                    : formatRub(totalAmount)}
                </TableCell>
                <TableCell colSpan={totalTailSpan} />
              </TableRow>
            )}

            {transactions.length === 0 && (
              <TableRow>
                <TableCell colSpan={emptyColSpan} className="h-24 text-center text-muted-foreground">
                  Пока нет записей
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-muted/40 px-8 py-8 overflow-x-hidden">
      <div className="mb-6 flex items-center justify-end gap-2">
        {selectedCount > 0 && (
          <Button
            className="bg-red-600 hover:bg-red-700 text-white"
            onClick={() => openDeleteDialog(Array.from(selectedTxIds))}
            disabled={isDeleting}
          >
            Удалить ({selectedCount})
          </Button>
        )}
        <Button variant="outline" onClick={handleToggleDeleted}>
          {showDeleted ? "Скрыть удаленные транзакции" : "Показать удаленные транзакции"}
        </Button>
        <Dialog
          open={isOpen}
          onOpenChange={(open) => {
            setIsOpen(open);
            setFormError(null);
            if (open) resetForm();
          }}
        >
          <DialogTrigger asChild>
            <Button className="bg-violet-600 hover:bg-violet-700 text-white">
              <Plus className="mr-2 h-4 w-4" />
              Добавить
            </Button>
          </DialogTrigger>

              <DialogContent className="sm:max-w-[560px]">
                <DialogHeader>
                  <DialogTitle>Добавление транзакции</DialogTitle>
                </DialogHeader>

                <form
                  className="grid gap-4"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setFormError(null);

                    const cents = parseRubToCents(amountStr);

                    if (!primaryItemId) {
                      setFormError("Выберите актив/обязательство");
                      return;
                    }
                    if (!Number.isFinite(cents) || cents < 0) {
                      setFormError("Сумма должна быть числом (например 1234,56)");
                      return;
                    }
                    if (isTransfer && !counterpartyItemId) {
                      setFormError("Для перевода выберите корреспондирующий актив");
                      return;
                    }
                    if (txType === "PLANNED") {
                      const today = new Date().toISOString().slice(0, 10);
                      if (date < today) {
                        setFormError("Плановая транзакция не может быть создана ранее текущего дня");
                        return;
                      }
                    }

                    try {
                      await createTransaction({
                        transaction_date: date,
                        primary_item_id: primaryItemId,
                        counterparty_item_id: isTransfer ? counterpartyItemId : null,
                        amount_rub: cents,
                        direction,
                        transaction_type: txType,

                        // для TRANSFER категории не используем
                        category_l1: isTransfer ? "" : cat1,
                        category_l2: isTransfer ? "" : cat2,
                        category_l3: isTransfer ? "" : cat3,

                        description: description || null,
                        comment: comment || null,
                      });

                      setIsOpen(false);
                      await loadAll();
                    } catch (e: any) {
                      setFormError(e?.message ?? "Ошибка создания транзакции");
                    }
                  }}
                >
                  {formError && (
                    <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3">
                      {formError}
                    </div>
                  )}
                  <div className="grid gap-2" role="group" aria-label="Тип транзакции">
                    <div className="inline-flex w-full items-stretch rounded-md border border-input bg-muted/60 p-0.5 overflow-hidden">
                      <button
                        type="button"
                        aria-pressed={txType === "ACTUAL"}
                        onClick={() => setTxType("ACTUAL")}
                        className={`${segmentedButtonBase} ${
                          txType === "ACTUAL"
                            ? "bg-violet-50 text-violet-700"
                            : "bg-white text-muted-foreground hover:bg-white"
                        }`}
                      >
                        Фактическая
                      </button>
                      <button
                        type="button"
                        aria-pressed={txType === "PLANNED"}
                        onClick={() => setTxType("PLANNED")}
                        className={`${segmentedButtonBase} ${
                          txType === "PLANNED"
                            ? "bg-violet-50 text-violet-700"
                            : "bg-white text-muted-foreground hover:bg-white"
                        }`}
                      >
                        Плановая
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-2" role="group" aria-label="Характер транзакции">
                    <div className="inline-flex w-full items-stretch rounded-md border border-input bg-muted/60 p-0.5 overflow-hidden">
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
                      <SelectTrigger>
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
                        value={counterpartyItemId ? String(counterpartyItemId) : ""}
                        onValueChange={(v) => setCounterpartyItemId(Number(v))}
                      >
                        <SelectTrigger>
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
                      value={amountStr}
                      onChange={(e) => setAmountStr(formatRubInput(e.target.value))}
                      onBlur={() => setAmountStr((prev) => normalizeRubOnBlur(prev))}
                      inputMode="decimal"
                      placeholder="Например: 1 234,56"
                    />
                  </div>

                  {/* ✅ КАТЕГОРИИ СКРЫВАЕМ ДЛЯ TRANSFER */}
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
                          <SelectTrigger>
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
                          <SelectTrigger>
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
                          <SelectTrigger>
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
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Например: обед в кафе"
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label>Комментарий</Label>
                    <Input
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="Например: с коллегами"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                      Отмена
                    </Button>
                    <Button
                      type="submit"
                      className="bg-violet-600 hover:bg-violet-700 text-white"
                      disabled={loading}
                    >
                      Добавить
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
      </div>

      <div className="space-y-6">
        {isPlanningView ? (
          <Card>
            <CardHeader>
              <CategoryFilters
                title="Плановые транзакции"
                cat1Filter={plannedCat1Filter}
                cat2Filter={plannedCat2Filter}
                cat3Filter={plannedCat3Filter}
                onCat1Change={setPlannedCat1Filter}
                onCat2Change={setPlannedCat2Filter}
                onCat3Change={setPlannedCat3Filter}
                options={plannedCategoryOptions}
              />
            </CardHeader>
            <CardContent className="overflow-hidden">
              <TransactionsTable
                transactions={plannedFilteredTxs}
                totalAmount={plannedTotalAmount}
                selectedIds={selectedTxIds}
                onToggleSelection={toggleTxSelection}
                onToggleAll={toggleAllSelection}
                isDeleting={isDeleting}
              />
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CategoryFilters
                title="Фактические транзакции"
                cat1Filter={actualCat1Filter}
                cat2Filter={actualCat2Filter}
                cat3Filter={actualCat3Filter}
                onCat1Change={setActualCat1Filter}
                onCat2Change={setActualCat2Filter}
                onCat3Change={setActualCat3Filter}
                options={actualCategoryOptions}
              />
            </CardHeader>
            <CardContent className="overflow-hidden">
              <TransactionsTable
                transactions={actualFilteredTxs}
                totalAmount={actualTotalAmount}
                selectedIds={selectedTxIds}
                onToggleSelection={toggleTxSelection}
                onToggleAll={toggleAllSelection}
                isDeleting={isDeleting}
              />
            </CardContent>
          </Card>
        )}

        {showDeleted && (
          <Card>
            <CardHeader>
              <CategoryFilters
                title={
                  isPlanningView
                    ? "Удаленные плановые транзакции"
                    : "Удаленные фактические транзакции"
                }
                cat1Filter={
                  isPlanningView ? deletedPlannedCat1Filter : deletedActualCat1Filter
                }
                cat2Filter={
                  isPlanningView ? deletedPlannedCat2Filter : deletedActualCat2Filter
                }
                cat3Filter={
                  isPlanningView ? deletedPlannedCat3Filter : deletedActualCat3Filter
                }
                onCat1Change={
                  isPlanningView
                    ? setDeletedPlannedCat1Filter
                    : setDeletedActualCat1Filter
                }
                onCat2Change={
                  isPlanningView
                    ? setDeletedPlannedCat2Filter
                    : setDeletedActualCat2Filter
                }
                onCat3Change={
                  isPlanningView
                    ? setDeletedPlannedCat3Filter
                    : setDeletedActualCat3Filter
                }
                options={
                  isPlanningView
                    ? deletedPlannedCategoryOptions
                    : deletedActualCategoryOptions
                }
              />
            </CardHeader>
            <CardContent className="overflow-hidden">
              <TransactionsTable
                transactions={
                  isPlanningView ? deletedPlannedFilteredTxs : deletedActualFilteredTxs
                }
                totalAmount={
                  isPlanningView ? deletedPlannedTotalAmount : deletedActualTotalAmount
                }
                readOnly
              />
            </CardContent>
          </Card>
        )}
      </div>
      {showDeleted && deletedError && (
        <div className="mt-4 text-sm text-red-600">
          Ошибка загрузки удаленных транзакций: {deletedError}
        </div>
      )}
      {error && <div className="mt-4 text-sm text-red-600">Ошибка: {error}</div>}

      {/* AlertDialog удаления */}
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
              {isBulkDelete ? (
                <>
                  Будут удалены транзакции: {deleteCount}. Балансы активов будут
                  пересчитаны.
                  <br />
                  <span className="font-medium text-foreground">
                    Это действие нельзя отменить.
                  </span>
                </>
              ) : (
                <>
                  Транзакция будет удалена, а балансы активов пересчитаны.
                  <br />
                  <span className="font-medium text-foreground">
                    Это действие нельзя отменить.
                  </span>
                </>
              )}
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
                  if (showDeleted) {
                    await loadDeleted();
                  }
                } catch (e: any) {
                  setError(e?.message ?? "Ошибка удаления");
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

