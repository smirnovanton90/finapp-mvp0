"use client";

import { Plus, Wallet, TrendingUp, Home, Package, AlertCircle, Calculator } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { MoreHorizontal } from "lucide-react";

import {
  fetchItems,
  createItem,
  archiveItem,
  ItemKind,
  ItemOut,
} from "@/lib/api";


/* ------------------ справочники ------------------ */

const ASSET_TYPES = [
  { code: "cash", label: "Наличные" },
  { code: "bank_account", label: "Банковский счёт" },
  { code: "bank_card", label: "Карта" },
  { code: "deposit", label: "Вклад" },
  { code: "brokerage", label: "Брокерский счёт" },
  { code: "securities", label: "Ценные бумаги" },
  { code: "real_estate", label: "Недвижимость" },
  { code: "car", label: "Автомобиль" },
  { code: "other_asset", label: "Другое" },
];

const LIABILITY_TYPES = [
  { code: "credit_card_debt", label: "Долг по кредитке" },
  { code: "consumer_loan", label: "Потребкредит" },
  { code: "mortgage", label: "Ипотека" },
  { code: "car_loan", label: "Автокредит" },
  { code: "microloan", label: "МФО" },
  { code: "tax_debt", label: "Налоги / штрафы" },
  { code: "private_loan", label: "Частный заём" },
  { code: "other_liability", label: "Другое" },
];

// Категории активов
const CASH_TYPES = ["cash", "bank_account", "bank_card"];
const FINANCIAL_INSTRUMENTS_TYPES = ["deposit", "brokerage", "securities"];
const PROPERTY_TYPES = ["real_estate", "car"];
const OTHER_ASSET_TYPES = ["other_asset"];

function formatRub(valueInCents: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valueInCents / 100);
}

/* ------------------ страница ------------------ */

export default function Page() {
  const { data: session } = useSession();

  const [items, setItems] = useState<ItemOut[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const [kind, setKind] = useState<ItemKind>("ASSET");
  const [typeCode, setTypeCode] = useState("");
  const [name, setName] = useState("");
  const [amountStr, setAmountStr] = useState(""); // строка: "1234.56" / "1 234,56"

  function resetCreateForm() {
    setKind("ASSET");
    setName("");
    setAmountStr("");
  }  

  function parseRubToCents(input: string): number {
    const normalized = input
      .trim()
      .replace(/\s/g, "")      // убираем пробелы-разделители
      .replace(",", ".");      // запятая -> точка
  
    const value = Number(normalized);
    if (!Number.isFinite(value)) return NaN;
  
    return Math.round(value * 100);
  }

  function formatRubInput(raw: string): string {
    if (!raw) return "";
  
    // оставляем только цифры и разделители
    const cleaned = raw.replace(/[^\d.,]/g, "");
  
    // запоминаем: пользователь только что ввёл разделитель в конце
    const endsWithSep = /[.,]$/.test(cleaned);
  
    // берём первую встреченную точку/запятую как разделитель
    const sepIndex = cleaned.search(/[.,]/);
  
    let intPart = "";
    let decPart = "";
  
    if (sepIndex === -1) {
      intPart = cleaned;
    } else {
      intPart = cleaned.slice(0, sepIndex);
      decPart = cleaned.slice(sepIndex + 1).replace(/[.,]/g, ""); // убираем лишние разделители
    }
  
    // если начали с ",5" → считаем как "0,5"
    if (sepIndex === 0) intPart = "0";
  
    // нормализуем целую часть (убираем лидирующие нули)
    intPart = intPart.replace(/^0+(?=\d)/, "");
    if (!intPart) intPart = "0";
  
    // форматируем целую часть с пробелами
    const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  
    // ограничиваем копейки
    const formattedDec = decPart.slice(0, 2);
  
    // если пользователь только что ввёл запятую, показываем её
    if (endsWithSep && formattedDec.length === 0) {
      return `${formattedInt},`;
    }
  
    return formattedDec.length > 0 ? `${formattedInt},${formattedDec}` : formattedInt;
  }  
  
  function normalizeRubOnBlur(value: string): string {
    const v = value.trim();
    if (!v) return "";
  
    // если заканчивается запятой: "123," -> "123,00"
    if (v.endsWith(",")) return `${v}00`;
  
    const parts = v.split(",");
    const intPart = parts[0] || "0";
    const decPart = parts[1] ?? "";
  
    if (decPart.length === 0) return `${intPart},00`;
    if (decPart.length === 1) return `${intPart},${decPart}0`;
  
    // если больше 2 — обрежем
    return `${intPart},${decPart.slice(0, 2)}`;
  }  

  const typeOptions = useMemo(
    () => (kind === "ASSET" ? ASSET_TYPES : LIABILITY_TYPES),
    [kind]
  );

  // Фильтрация по категориям
  const cashItems = useMemo(
    () => items.filter((x) => x.kind === "ASSET" && CASH_TYPES.includes(x.type_code)),
    [items]
  );

  const financialInstrumentsItems = useMemo(
    () => items.filter((x) => x.kind === "ASSET" && FINANCIAL_INSTRUMENTS_TYPES.includes(x.type_code)),
    [items]
  );

  const propertyItems = useMemo(
    () => items.filter((x) => x.kind === "ASSET" && PROPERTY_TYPES.includes(x.type_code)),
    [items]
  );

  const otherAssetItems = useMemo(
    () => items.filter((x) => x.kind === "ASSET" && OTHER_ASSET_TYPES.includes(x.type_code)),
    [items]
  );

  const liabilityItems = useMemo(
    () => items.filter((x) => x.kind === "LIABILITY"),
    [items]
  );

  // Итоги по категориям
  const cashTotal = useMemo(
    () => cashItems.reduce((sum, x) => sum + x.current_value_rub, 0),
    [cashItems]
  );

  const financialInstrumentsTotal = useMemo(
    () => financialInstrumentsItems.reduce((sum, x) => sum + x.current_value_rub, 0),
    [financialInstrumentsItems]
  );

  const propertyTotal = useMemo(
    () => propertyItems.reduce((sum, x) => sum + x.current_value_rub, 0),
    [propertyItems]
  );

  const otherAssetTotal = useMemo(
    () => otherAssetItems.reduce((sum, x) => sum + x.current_value_rub, 0),
    [otherAssetItems]
  );

  const liabilityTotal = useMemo(
    () => liabilityItems.reduce((sum, x) => sum + x.current_value_rub, 0),
    [liabilityItems]
  );

  const { totalAssets, totalLiabilities, netTotal } = useMemo(() => {
    const assets = items
      .filter((x) => x.kind === "ASSET")
      .reduce((sum, x) => sum + x.current_value_rub, 0);
  
    const liabilities = items
      .filter((x) => x.kind === "LIABILITY")
      .reduce((sum, x) => sum + x.current_value_rub, 0);
  
    return {
      totalAssets: assets,
      totalLiabilities: liabilities,
      netTotal: assets - liabilities, // обязательства вычитаем
    };
  }, [items]);

  useEffect(() => {
    if (typeOptions.length > 0) {
      setTypeCode(typeOptions[0].code);
    }
  }, [typeOptions]);

  async function loadItems() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchItems();
      setItems(data);
    } catch (e: any) {
      setError(e?.message ?? "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (session) {
      loadItems();
    }
  }, [session]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
  
    if (!name.trim()) {
      setError("Название не может быть пустым");
      return;
    }
  
    const cents = parseRubToCents(amountStr);
    if (!Number.isFinite(cents) || cents < 0) {
      setError("Сумма должна быть числом (например 1234,56)");
      return;
    }
  
    setLoading(true);
    try {
      await createItem({
        kind,
        type_code: typeCode,
        name: name.trim(),
        initial_value_rub: cents, // копейки
      });
  
      // очищаем форму и закрываем модалку
      setName("");
      setAmountStr("");
      setIsCreateOpen(false);
  
      await loadItems();
    } catch (e: any) {
      setError(e?.message ?? "Ошибка создания");
    } finally {
      setLoading(false);
    }
  }
  
  async function onArchive(id: number) {
    setLoading(true);
    try {
      await archiveItem(id);
      await loadItems();
    } catch (e: any) {
      setError(e?.message ?? "Ошибка архивации");
    } finally {
      setLoading(false);
    }
  }

  // Компонент таблицы категории
  function CategoryTable({
    title,
    items: categoryItems,
    total,
    isLiability = false,
    icon: Icon,
  }: {
    title: string;
    items: ItemOut[];
    total: number;
    isLiability?: boolean;
    icon?: React.ComponentType<{ className?: string }>;
  }) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            {Icon && <Icon className="h-5 w-5 text-violet-600" />}
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {categoryItems.length === 0 ? (
            <div className="h-24 flex items-center justify-center text-muted-foreground">
              Пока нет записей
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead className="font-medium text-muted-foreground">
                    Название
                  </TableHead>
                  <TableHead className="text-right font-medium text-muted-foreground">
                    Текущая сумма
                  </TableHead>
                  <TableHead className="text-right font-medium text-muted-foreground">
                    Дата добавления
                  </TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>

              <TableBody>
                {categoryItems.map((it) => {
                  const typeLabel = (it.kind === "ASSET" ? ASSET_TYPES : LIABILITY_TYPES).find(
                    (t) => t.code === it.type_code
                  )?.label || it.type_code;

                  return (
                    <TableRow key={it.id}>
                      <TableCell>
                        <div className="font-medium">{it.name}</div>
                        <div className="text-xs text-muted-foreground">{typeLabel}</div>
                      </TableCell>

                      <TableCell
                        className={[
                          "text-right font-semibold tabular-nums",
                          isLiability ? "text-red-600" : "",
                        ].join(" ")}
                      >
                        {isLiability
                          ? `-${formatRub(it.current_value_rub)}`
                          : formatRub(it.current_value_rub)}
                      </TableCell>

                      <TableCell className="text-right text-sm text-muted-foreground">
                        {new Date(it.created_at).toLocaleDateString("ru-RU")}
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
                              onClick={() => onArchive(it.id)}
                            >
                              Архивировать
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>

              <TableFooter>
                <TableRow className="bg-muted/30">
                  <TableCell className="font-medium">Итого</TableCell>
                  <TableCell
                    className={[
                      "text-right font-semibold tabular-nums",
                      isLiability ? "text-red-600" : "",
                    ].join(" ")}
                  >
                    {isLiability
                      ? `-${formatRub(total)}`
                      : formatRub(total)}
                  </TableCell>
                  <TableCell />
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>
          )}
        </CardContent>
      </Card>
    );
  }

  /* ------------------ основной UI ------------------ */

  return (
    <main className="min-h-screen bg-muted/40 px-8 py-8">
      <div className="mb-6 flex justify-end">
        <Dialog
          open={isCreateOpen}
          onOpenChange={(open) => {
            setIsCreateOpen(open);
            if (!open) {
              resetCreateForm();
            } else {
              resetCreateForm();
            }
          }}
        >
          <DialogTrigger asChild>
            <Button className="bg-violet-600 hover:bg-violet-700 text-white">
              <Plus className="mr-2 h-4 w-4" />
              Добавить
            </Button>
          </DialogTrigger>

          <DialogContent className="sm:max-w-[520px]">
            <DialogHeader>
              <DialogTitle>Добавление актива/обязательства</DialogTitle>
            </DialogHeader>

            <form onSubmit={onCreate} className="grid gap-4">
              <div className="grid gap-2">
                <Label>Актив/обязательство</Label>
                <Select
                  value={kind}
                  onValueChange={(v) => setKind(v as ItemKind)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите тип" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ASSET">Актив</SelectItem>
                    <SelectItem value="LIABILITY">Обязательство</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label>Вид</Label>
                <Select value={typeCode} onValueChange={setTypeCode}>
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите вид" />
                  </SelectTrigger>
                  <SelectContent>
                    {typeOptions.map((t) => (
                      <SelectItem key={t.code} value={t.code}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label>Название</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Например: Кошелек / Ипотека Газпромбанк"
                />
              </div>

              <div className="grid gap-2">
                <Label>Текущая сумма</Label>
                <Input
                  value={amountStr}
                  onChange={(e) => {
                    const formatted = formatRubInput(e.target.value);
                    setAmountStr(formatted);
                  }}
                  onBlur={() => setAmountStr((prev) => normalizeRubOnBlur(prev))}
                  inputMode="decimal"
                  placeholder="Например: 1 234 567,89"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreateOpen(false)}
                >
                  Отмена
                </Button>
                <Button
                  type="submit"
                  disabled={loading}
                  className="bg-violet-600 hover:bg-violet-700 text-white"
                >
                  {loading ? "Добавляем..." : "Добавить"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-6">
        <CategoryTable
          title="Денежные средства"
          items={cashItems}
          total={cashTotal}
          icon={Wallet}
        />

        <CategoryTable
          title="Финансовые инструменты"
          items={financialInstrumentsItems}
          total={financialInstrumentsTotal}
          icon={TrendingUp}
        />

        <CategoryTable
          title="Имущество"
          items={propertyItems}
          total={propertyTotal}
          icon={Home}
        />

        <CategoryTable
          title="Другие активы"
          items={otherAssetItems}
          total={otherAssetTotal}
          icon={Package}
        />

        <CategoryTable
          title="Обязательства"
          items={liabilityItems}
          total={liabilityTotal}
          isLiability={true}
          icon={AlertCircle}
        />

        {/* Общая итоговая плашка */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Calculator className="h-5 w-5 text-violet-600" />
              ИТОГО
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Активы:</span>
                <span className="font-semibold tabular-nums">{formatRub(totalAssets)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Обязательства:</span>
                <span className="font-semibold tabular-nums text-red-600">
                  -{formatRub(totalLiabilities)}
                </span>
              </div>
              <div className="pt-2 border-t flex justify-between items-center">
                <span className="font-medium">Чистые активы:</span>
                <span
                  className={[
                    "font-semibold tabular-nums",
                    netTotal < 0 ? "text-red-600" : "",
                  ].join(" ")}
                >
                  {netTotal < 0
                    ? `-${formatRub(Math.abs(netTotal))}`
                    : formatRub(netTotal)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {error && (
        <div className="mt-4 text-sm text-red-600">Ошибка: {error}</div>
      )}
    </main>
  );
}