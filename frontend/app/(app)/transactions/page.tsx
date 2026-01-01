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
  ItemOut,
  TransactionOut,
} from "@/lib/api";


/* ------------ категории (временные справочники) ------------ */

const CATEGORY_L1 = ["Питание", "Транспорт", "Услуги"];

const CATEGORY_L2: Record<string, string[]> = {
  Питание: ["Продукты", "Кафе", "Доставка"],
  Транспорт: ["Такси", "Метро", "Бензин"],
  Услуги: ["Связь", "Подписки", "Прочее"],
};

const CATEGORY_L3: Record<string, string[]> = {
  Продукты: ["Супермаркет", "Рынок"],
  Кафе: ["Кофе", "Ресторан"],
  Такси: ["Яндекс", "Uber"],
  Связь: ["Мобильная", "Интернет"],
};

/* ------------ helpers ------------ */

const ALL_VALUE = "__ALL__";

type CategoryOptions = {
  l1: string[];
  l2: Record<string, string[]>;
  l3: Record<string, string[]>;
};

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

export default function TransactionsPage() {
  const { data: session } = useSession();

  const [items, setItems] = useState<ItemOut[]>([]);
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

  const [cat1, setCat1] = useState("Питание");
  const [cat2, setCat2] = useState("Продукты");
  const [cat3, setCat3] = useState("Супермаркет");

  const [txType, setTxType] = useState<"ACTUAL" | "PLANNED">("ACTUAL");
  const [description, setDescription] = useState("");
  const [comment, setComment] = useState("");

  const [txToDelete, setTxToDelete] = useState<TransactionOut | null>(null);

  const [actualCat1Filter, setActualCat1Filter] = useState<string>(ALL_VALUE);
  const [actualCat2Filter, setActualCat2Filter] = useState<string>(ALL_VALUE);
  const [actualCat3Filter, setActualCat3Filter] = useState<string>(ALL_VALUE);

  const [plannedCat1Filter, setPlannedCat1Filter] = useState<string>(ALL_VALUE);
  const [plannedCat2Filter, setPlannedCat2Filter] = useState<string>(ALL_VALUE);
  const [plannedCat3Filter, setPlannedCat3Filter] = useState<string>(ALL_VALUE);

  const isTransfer = direction === "TRANSFER";

  const cat2Options = useMemo(() => CATEGORY_L2[cat1] ?? [], [cat1]);
  const cat3Options = useMemo(() => CATEGORY_L3[cat2] ?? [], [cat2]);

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
    () => buildCategoryOptions(actualTxs),
    [actualTxs]
  );

  const plannedCategoryOptions = useMemo(
    () => buildCategoryOptions(plannedTxs),
    [plannedTxs]
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

  useEffect(() => {
    if (session) loadAll();
  }, [session]);

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
                  <div className="grid gap-2">
                    <Label>Тип транзакции</Label>
                    <div className="inline-flex w-full items-stretch rounded-md border border-input bg-muted/60 p-0.5 overflow-hidden">
                      <button
                        type="button"
                        aria-pressed={txType === "ACTUAL"}
                        onClick={() => setTxType("ACTUAL")}
                        className={`flex-1 rounded-sm px-4 py-2 text-sm font-medium transition-colors ${
                          txType === "ACTUAL"
                            ? "bg-violet-100 text-violet-700"
                            : "bg-white text-muted-foreground hover:bg-white"
                        }`}
                      >
                        Фактическая
                      </button>
                      <button
                        type="button"
                        aria-pressed={txType === "PLANNED"}
                        onClick={() => setTxType("PLANNED")}
                        className={`flex-1 rounded-sm px-4 py-2 text-sm font-medium transition-colors ${
                          txType === "PLANNED"
                            ? "bg-violet-100 text-violet-700"
                            : "bg-white text-muted-foreground hover:bg-white"
                        }`}
                      >
                        Плановая
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
                    <Label>Характер</Label>
                    <Select
                      value={direction}
                      onValueChange={(v) => {
                        const val = v as "INCOME" | "EXPENSE" | "TRANSFER";
                        setDirection(val);

                        if (val !== "TRANSFER") {
                          setCounterpartyItemId(null);
                        }

                        if (val === "TRANSFER") {
                          setCat1("");
                          setCat2("");
                          setCat3("");
                        } else {
                          setCat1("Питание");
                          setCat2("Продукты");
                          setCat3("Супермаркет");
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="INCOME">Доход</SelectItem>
                        <SelectItem value="EXPENSE">Расход</SelectItem>
                        <SelectItem value="TRANSFER">Перевод</SelectItem>
                      </SelectContent>
                    </Select>
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