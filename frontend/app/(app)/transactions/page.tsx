"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { MoreHorizontal, Plus } from "lucide-react";

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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
  createTransaction,
  deleteTransaction,
  fetchCategories,
  ItemOut,
  CategoryOut,
  TransactionOut,
} from "@/lib/api";

/* ------------ helpers ------------ */

const ALL_VALUE = "__ALL__";

type CategoryOptions = {
  l1: string[];
  l2: Record<string, string[]>;
  l3: Record<string, string[]>;
};

function buildCategoryOptions(
  txs: TransactionOut[],
  categories: CategoryOut[]
): CategoryOptions {
  const l1 = new Set<string>();
  const l2 = new Map<string, Set<string>>();
  const l3 = new Map<string, Set<string>>();

  const byId = new Map(categories.map((c) => [c.id, c]));

  categories.forEach((cat) => {
    if (cat.level === 1) {
      l1.add(cat.name);
    }

    if (cat.level === 2 && cat.parent_id) {
      const parent = byId.get(cat.parent_id);
      if (!parent) return;
      if (!l2.has(parent.name)) l2.set(parent.name, new Set());
      l2.get(parent.name)?.add(cat.name);
    }

    if (cat.level === 3 && cat.parent_id) {
      const parent = byId.get(cat.parent_id);
      if (!parent) return;
      const grandParent = parent.parent_id ? byId.get(parent.parent_id) : null;
      if (!grandParent) return;
      if (!l3.has(parent.name)) l3.set(parent.name, new Set());
      l3.get(parent.name)?.add(cat.name);
    }
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

function defaultCategorySelection(categories: CategoryOut[]) {
  const level1 = categories
    .filter((c) => c.level === 1)
    .sort((a, b) => a.name.localeCompare(b.name));
  const byParent = new Map<number, CategoryOut[]>();

  categories
    .filter((c) => c.parent_id)
    .forEach((c) => {
      if (!c.parent_id) return;
      byParent.set(c.parent_id, [...(byParent.get(c.parent_id) ?? []), c]);
    });

  const cat1 = level1[0]?.id ?? null;
  const cat2 = cat1 ? byParent.get(cat1)?.sort((a, b) => a.name.localeCompare(b.name))[0]?.id ?? null : null;
  const cat3 = cat2
    ? byParent.get(cat2)?.sort((a, b) => a.name.localeCompare(b.name))[0]?.id ?? null
    : null;

  return { cat1, cat2, cat3 };
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

export default function TransactionsPage() {
  const { data: session } = useSession();

  const [items, setItems] = useState<ItemOut[]>([]);
  const [categories, setCategories] = useState<CategoryOut[]>([]);
  const [txs, setTxs] = useState<TransactionOut[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [isOpen, setIsOpen] = useState(false);

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [direction, setDirection] = useState<"INCOME" | "EXPENSE" | "TRANSFER">(
    "EXPENSE"
  );

  const [primaryItemId, setPrimaryItemId] = useState<number | null>(null);
  const [counterpartyItemId, setCounterpartyItemId] = useState<number | null>(null);

  const [amountStr, setAmountStr] = useState("");

  const [cat1Id, setCat1Id] = useState<number | null>(null);
  const [cat2Id, setCat2Id] = useState<number | null>(null);
  const [cat3Id, setCat3Id] = useState<number | null>(null);

  const [txType, setTxType] = useState<"ACTUAL" | "PLANNED">("ACTUAL");
  const [description, setDescription] = useState("");
  const [comment, setComment] = useState("");

  const [txToDelete, setTxToDelete] = useState<TransactionOut | null>(null);

  const [actualCat1Filter, setActualCat1Filter] = useState<string>(ALL_VALUE);
  const [actualCat2Filter, setActualCat2Filter] = useState<string>(ALL_VALUE);
  const [actualCat3Filter, setActualCat3Filter] = useState<string>(ALL_VALUE);

  const segmentedButtonBase =
    "flex-1 rounded-sm px-4 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500";

  const [plannedCat1Filter, setPlannedCat1Filter] = useState<string>(ALL_VALUE);
  const [plannedCat2Filter, setPlannedCat2Filter] = useState<string>(ALL_VALUE);
  const [plannedCat3Filter, setPlannedCat3Filter] = useState<string>(ALL_VALUE);

  const isTransfer = direction === "TRANSFER";

  const categoriesById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories]
  );

  const level1Categories = useMemo(
    () => categories.filter((c) => c.level === 1).sort((a, b) => a.name.localeCompare(b.name)),
    [categories]
  );

  const level2ByParent = useMemo(() => {
    const map = new Map<number, CategoryOut[]>();
    categories
      .filter((c) => c.level === 2 && c.parent_id)
      .forEach((c) => {
        if (!c.parent_id) return;
        map.set(c.parent_id, [...(map.get(c.parent_id) ?? []), c]);
      });
    map.forEach((arr, key) =>
      map.set(
        key,
        arr.slice().sort((a, b) => a.name.localeCompare(b.name))
      )
    );
    return map;
  }, [categories]);

  const level3ByParent = useMemo(() => {
    const map = new Map<number, CategoryOut[]>();
    categories
      .filter((c) => c.level === 3 && c.parent_id)
      .forEach((c) => {
        if (!c.parent_id) return;
        map.set(c.parent_id, [...(map.get(c.parent_id) ?? []), c]);
      });
    map.forEach((arr, key) =>
      map.set(
        key,
        arr.slice().sort((a, b) => a.name.localeCompare(b.name))
      )
    );
    return map;
  }, [categories]);

  const cat2Options = useMemo(() => {
    if (!cat1Id) return [];
    return level2ByParent.get(cat1Id) ?? [];
  }, [cat1Id, level2ByParent]);

  const cat3Options = useMemo(() => {
    if (!cat2Id) return [];
    return level3ByParent.get(cat2Id) ?? [];
  }, [cat2Id, level3ByParent]);

  const itemsById = useMemo(() => new Map(items.map((x) => [x.id, x])), [items]);

  // Разделяем транзакции по типам
  const actualTxs = useMemo(
    () => txs.filter((tx) => tx.transaction_type === "ACTUAL"),
    [txs]
  );

  const plannedTxs = useMemo(
    () => txs.filter((tx) => tx.transaction_type === "PLANNED"),
    [txs]
  );

  // Итоги для фактических транзакций
  const actualCategoryOptions = useMemo(
    () => buildCategoryOptions(actualTxs, categories),
    [actualTxs, categories]
  );

  const plannedCategoryOptions = useMemo(
    () => buildCategoryOptions(plannedTxs, categories),
    [plannedTxs, categories]
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

  function itemName(id: number | null | undefined) {
    if (!id) return "—";
    return itemsById.get(id)?.name ?? `#${id}`;
  }

  function applyDefaultCategories() {
    const defaults = defaultCategorySelection(categories);
    setCat1Id(defaults.cat1);
    setCat2Id(defaults.cat2);
    setCat3Id(defaults.cat3);
  }

  function categoryName(id: number | null) {
    if (!id) return "";
    return categoriesById.get(id)?.name ?? "";
  }

  function resetForm() {
    setDate(new Date().toISOString().slice(0, 10));
    setDirection("EXPENSE");
    setPrimaryItemId(null);
    setCounterpartyItemId(null);
    setAmountStr("");
    const defaults = defaultCategorySelection(categories);
    setCat1Id(defaults.cat1);
    setCat2Id(defaults.cat2);
    setCat3Id(defaults.cat3);
    setTxType("ACTUAL");
    setDescription("");
    setComment("");
  }

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [itemsData, txData, categoryData] = await Promise.all([
        fetchItems(),
        fetchTransactions(),
        fetchCategories(),
      ]);
      setItems(itemsData);
      setTxs(txData);
      setCategories(categoryData);
    } catch (e: any) {
      setError(e?.message ?? "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (session) loadAll();
  }, [session]);

  useEffect(() => {
    if (!isTransfer && categories.length > 0 && cat1Id === null) {
      const defaults = defaultCategorySelection(categories);
      setCat1Id(defaults.cat1);
      setCat2Id(defaults.cat2);
      setCat3Id(defaults.cat3);
    }
  }, [categories, cat1Id, isTransfer]);

  useEffect(() => {
    if (!cat1Id) {
      setCat2Id(null);
      setCat3Id(null);
      return;
    }

    if (cat2Options.length === 0) {
      setCat2Id(null);
      setCat3Id(null);
      return;
    }

    if (!cat2Id || !cat2Options.some((c) => c.id === cat2Id)) {
      const first = cat2Options[0];
      setCat2Id(first?.id ?? null);
      const cat3List = first ? level3ByParent.get(first.id) ?? [] : [];
      setCat3Id(cat3List[0]?.id ?? null);
    }
  }, [cat1Id, cat2Id, cat2Options, level3ByParent]);

  useEffect(() => {
    if (!cat2Id) {
      setCat3Id(null);
      return;
    }

    const options = level3ByParent.get(cat2Id) ?? [];
    if (options.length === 0) {
      setCat3Id(null);
      return;
    }

    if (!cat3Id || !options.some((c) => c.id === cat3Id)) {
      setCat3Id(options[0].id);
    }
  }, [cat2Id, cat3Id, level3ByParent]);

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
  }: {
    transactions: TransactionOut[];
    totalAmount: number;
  }) {
    return (
      <div className="w-full overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow>
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
              <TableHead className="w-[50px] min-w-[50px]" />
            </TableRow>
          </TableHeader>

          <TableBody>
            {transactions.map((tx) => {
              const isExpense = tx.direction === "EXPENSE";
              const isTxTransfer = tx.direction === "TRANSFER";

              const amountText = isExpense
                ? `-${formatRub(tx.amount_rub)}`
                : formatRub(tx.amount_rub);

              // Определяем цвет фона строки в зависимости от характера транзакции
              const rowBgClass = 
                tx.direction === "EXPENSE" ? "bg-red-50 hover:!bg-red-100" :
                tx.direction === "INCOME" ? "bg-green-50 hover:!bg-green-100" :
                "bg-violet-50 hover:!bg-violet-100";

              return (
                <TableRow key={tx.id} className={rowBgClass}>
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

                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          className="text-red-600"
                          onClick={() => setTxToDelete(tx)}
                        >
                          Удалить
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}

            {transactions.length > 0 && (
              <TableRow className="bg-muted/60 font-semibold">
                <TableCell colSpan={2}>Итого</TableCell>
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
                <TableCell colSpan={5} />
              </TableRow>
            )}

            {transactions.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
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
      <div className="mb-6 flex justify-end">
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

                    if (!isTransfer && !cat1Id) {
                      setFormError("Выберите категорию первого уровня");
                      return;
                    }

                    try {
                      const category_l1 = categoryName(cat1Id);
                      const category_l2 = categoryName(cat2Id);
                      const category_l3 = categoryName(cat3Id);

                      await createTransaction({
                        transaction_date: date,
                        primary_item_id: primaryItemId,
                        counterparty_item_id: isTransfer ? counterpartyItemId : null,
                        amount_rub: cents,
                        direction,
                        transaction_type: txType,

                        // для TRANSFER категории не используем
                        category_l1: isTransfer ? "" : category_l1,
                        category_l2: isTransfer ? "" : category_l2,
                        category_l3: isTransfer ? "" : category_l3,

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
                          applyDefaultCategories();
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
                          applyDefaultCategories();
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
                          setCat1Id(null);
                          setCat2Id(null);
                          setCat3Id(null);
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
                          value={cat1Id ? String(cat1Id) : ""}
                          onValueChange={(v) => {
                            const id = Number(v);
                            setCat1Id(id);
                            const first2 = level2ByParent.get(id)?.[0];
                            setCat2Id(first2?.id ?? null);
                            const first3 = first2
                              ? level3ByParent.get(first2.id)?.[0]
                              : null;
                            setCat3Id(first3?.id ?? null);
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {level1Categories.map((c) => (
                              <SelectItem key={c.id} value={String(c.id)}>
                                {c.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="grid gap-2">
                        <Label>Категория L2</Label>
                        <Select
                          value={cat2Id ? String(cat2Id) : ""}
                          onValueChange={(v) => {
                            const id = Number(v);
                            setCat2Id(id);
                            const first3 = level3ByParent.get(id)?.[0];
                            setCat3Id(first3?.id ?? null);
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Не выбрано" />
                          </SelectTrigger>
                          <SelectContent>
                            {cat2Options.map((c) => (
                              <SelectItem key={c.id} value={String(c.id)}>
                                {c.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="grid gap-2">
                        <Label>Категория L3</Label>
                        <Select
                          value={cat3Id ? String(cat3Id) : ""}
                          onValueChange={(v) => setCat3Id(Number(v))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Не выбрано" />
                          </SelectTrigger>
                          <SelectContent>
                            {cat3Options.map((c) => (
                              <SelectItem key={c.id} value={String(c.id)}>
                                {c.name}
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
        {/* Фактические транзакции */}
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
            />
          </CardContent>
        </Card>

        {/* Плановые транзакции */}
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
            />
          </CardContent>
        </Card>
      </div>

      {error && <div className="mt-4 text-sm text-red-600">Ошибка: {error}</div>}

      {/* AlertDialog удаления */}
      <AlertDialog
        open={!!txToDelete}
        onOpenChange={(open) => {
          if (!open) setTxToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить транзакцию?</AlertDialogTitle>
            <AlertDialogDescription>
              Транзакция будет удалена, а балансы активов пересчитаны.
              <br />
              <span className="font-medium text-foreground">Это действие нельзя отменить.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>

            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={async () => {
                if (!txToDelete) return;
                try {
                  await deleteTransaction(txToDelete.id);
                  setTxToDelete(null);
                  await loadAll();
                } catch (e: any) {
                  setError(e?.message ?? "Ошибка удаления");
                  setTxToDelete(null);
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