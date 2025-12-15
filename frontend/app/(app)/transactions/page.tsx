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

function formatTxType(t: TransactionOut["transaction_type"]) {
  return t === "ACTUAL" ? "Фактическая" : "Плановая";
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

  const isTransfer = direction === "TRANSFER";

  const cat2Options = useMemo(() => CATEGORY_L2[cat1] ?? [], [cat1]);
  const cat3Options = useMemo(() => CATEGORY_L3[cat2] ?? [], [cat2]);

  const itemsById = useMemo(() => new Map(items.map((x) => [x.id, x])), [items]);

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

  return (
    <main className="min-h-screen bg-muted/40 px-8 py-8">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">ТРАНЗАКЦИИ</CardTitle>

          <div className="flex items-center gap-3">
            <div className="text-sm text-muted-foreground">
              {loading ? "Обновляем…" : `${txs.length} шт.`}
            </div>

            <Dialog
              open={isOpen}
              onOpenChange={(open) => {
                setIsOpen(open);
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
                    setError(null);

                    const cents = parseRubToCents(amountStr);

                    if (!primaryItemId) {
                      setError("Выберите актив/обязательство");
                      return;
                    }
                    if (!Number.isFinite(cents) || cents < 0) {
                      setError("Сумма должна быть числом (например 1234,56)");
                      return;
                    }
                    if (isTransfer && !counterpartyItemId) {
                      setError("Для перевода выберите корреспондирующий актив");
                      return;
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
                      setError(e?.message ?? "Ошибка создания транзакции");
                    }
                  }}
                >
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
                    <Label>Тип транзакции</Label>
                    <Select
                      value={txType}
                      onValueChange={(v) => setTxType(v as "ACTUAL" | "PLANNED")}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ACTUAL">Фактическая</SelectItem>
                        <SelectItem value="PLANNED">Плановая</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

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
        </CardHeader>

        <CardContent>
          <div className="w-full overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead className="font-medium text-muted-foreground">
                    Дата транзакции
                  </TableHead>
                  <TableHead className="font-medium text-muted-foreground">Актив</TableHead>
                  <TableHead className="font-medium text-muted-foreground">Сумма</TableHead>
                  <TableHead className="font-medium text-muted-foreground">
                    Корреспондирующий актив
                  </TableHead>
                  <TableHead className="font-medium text-muted-foreground">Характер</TableHead>
                  <TableHead className="font-medium text-muted-foreground">Категория L1</TableHead>
                  <TableHead className="font-medium text-muted-foreground">Категория L2</TableHead>
                  <TableHead className="font-medium text-muted-foreground">Категория L3</TableHead>
                  <TableHead className="font-medium text-muted-foreground">Тип</TableHead>
                  <TableHead className="font-medium text-muted-foreground">Описание</TableHead>
                  <TableHead className="font-medium text-muted-foreground">Комментарий</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>

              <TableBody>
                {txs.map((tx) => {
                  const isExpense = tx.direction === "EXPENSE";
                  const isTxTransfer = tx.direction === "TRANSFER";

                  const amountText = isExpense
                    ? `-${formatRub(tx.amount_rub)}`
                    : formatRub(tx.amount_rub);

                  return (
                    <TableRow key={tx.id}>
                      <TableCell className="whitespace-nowrap">
                        {new Date(tx.transaction_date).toLocaleDateString("ru-RU")}
                      </TableCell>

                      <TableCell className="min-w-[220px]">
                        <div className="font-medium">{itemName(tx.primary_item_id)}</div>
                      </TableCell>

                      <TableCell
                        className={[
                          "text-right font-semibold tabular-nums whitespace-nowrap",
                          isExpense ? "text-red-600" : "",
                        ].join(" ")}
                      >
                        {amountText}
                      </TableCell>

                      <TableCell className="min-w-[220px]">
                        {isTxTransfer ? (
                          <div className="font-medium">{itemName(tx.counterparty_item_id)}</div>
                        ) : (
                          "—"
                        )}
                      </TableCell>

                      <TableCell className="whitespace-nowrap">{formatDirection(tx.direction)}</TableCell>

                      <TableCell className="whitespace-nowrap">{tx.category_l1 || "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">{tx.category_l2 || "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">{tx.category_l3 || "—"}</TableCell>

                      <TableCell className="whitespace-nowrap">
                        {formatTxType(tx.transaction_type)}
                      </TableCell>

                      <TableCell className="min-w-[260px]">{tx.description || "—"}</TableCell>
                      <TableCell className="min-w-[260px]">{tx.comment || "—"}</TableCell>

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

                {txs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={12} className="h-24 text-center text-muted-foreground">
                      Пока нет записей
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {error && <div className="mt-4 text-sm text-red-600">Ошибка: {error}</div>}
        </CardContent>
      </Card>

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