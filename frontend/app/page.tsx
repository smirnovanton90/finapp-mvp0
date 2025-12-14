"use client";

import { useEffect, useMemo, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";

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
  const { data: session, status } = useSession();

  const [items, setItems] = useState<ItemOut[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [kind, setKind] = useState<ItemKind>("ASSET");
  const [typeCode, setTypeCode] = useState("");
  const [name, setName] = useState("");
  const [initialValue, setInitialValue] = useState(0);

  const typeOptions = useMemo(
    () => (kind === "ASSET" ? ASSET_TYPES : LIABILITY_TYPES),
    [kind]
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
    if (!name.trim()) {
      setError("Название не может быть пустым");
      return;
    }

    setLoading(true);
    try {
      await createItem({
        kind,
        type_code: typeCode,
        name: name.trim(),
        initial_value_rub: Math.round(initialValue * 100),
      });
      setName("");
      setInitialValue(0);
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

  /* ------------------ auth экраны ------------------ */

  if (status === "loading") {
    return <main className="p-8">Загрузка…</main>;
  }

  if (!session) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted/40">
        <Card className="w-[360px]">
          <CardHeader>
            <CardTitle>FinApp</CardTitle>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => signIn("google")}>
              Войти через Google
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  /* ------------------ основной UI ------------------ */

  return (
    <main className="min-h-screen bg-muted/40 px-8 py-8">
      {/* header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Активы и обязательства</h1>
          <p className="text-sm text-muted-foreground">
            Все ваши активы и долги в одном месте
          </p>
        </div>
        <Button variant="outline" onClick={() => signOut()}>
          Выйти
        </Button>
      </div>

      {/* форма добавления */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Добавить запись</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-4" onSubmit={onCreate}>
            <select
              className="h-10 rounded-md border px-3"
              value={kind}
              onChange={(e) => setKind(e.target.value as ItemKind)}
            >
              <option value="ASSET">Актив</option>
              <option value="LIABILITY">Обязательство</option>
            </select>

            <select
              className="h-10 rounded-md border px-3"
              value={typeCode}
              onChange={(e) => setTypeCode(e.target.value)}
            >
              {typeOptions.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.label}
                </option>
              ))}
            </select>

            <input
              className="h-10 rounded-md border px-3"
              placeholder="Название"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <input
              className="h-10 rounded-md border px-3"
              type="number"
              placeholder="Сумма (например 1234.56)"
              value={initialValue}
              onChange={(e) => setInitialValue(Number(e.target.value))}
            />

            <Button
              type="submit"
              disabled={loading}
              className="bg-violet-600 hover:bg-violet-700 text-white"
            >
              Добавить
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* таблица */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">АКТИВЫ / ОБЯЗАТЕЛЬСТВА</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className="font-medium text-muted-foreground">
                  Название
                </TableHead>
                <TableHead className="font-medium text-muted-foreground">
                  Тип
                </TableHead>
                <TableHead className="text-right font-medium text-muted-foreground">
                  Текущая сумма
                </TableHead>
                <TableHead className="text-right font-medium text-muted-foreground">
                  Дата
                </TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>

            <TableBody>
              {items.map((it) => (
                <TableRow key={it.id}>
                  <TableCell>
                    <div className="font-medium">{it.name}</div>
                  </TableCell>

                  <TableCell>
                    {it.kind === "ASSET" ? (
                      <span className="inline-flex h-6 items-center rounded-full bg-violet-600 px-3 text-xs font-semibold leading-none text-white">
                        Актив
                      </span>
                    ) : (
                      <span className="inline-flex h-6 items-center rounded-full bg-red-100 px-3 text-xs font-semibold leading-none text-red-700">
                        Обязательство
                      </span>
                    )}
                  </TableCell>



                  <TableCell
                    className={[
                      "text-right font-semibold tabular-nums",
                      it.kind === "LIABILITY" ? "text-red-600" : "",
                    ].join(" ")}
                  >
                    {it.kind === "LIABILITY"
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
              ))}

              {items.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="h-24 text-center text-muted-foreground"
                  >
                    Пока нет записей
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
            <TableFooter>
              <TableRow className="bg-muted/30">
                <TableCell className="font-medium">
                  Итого
                  <div className="mt-1 text-xs text-muted-foreground">
                    Активы: {formatRub(totalAssets)} • Обязательства: -{formatRub(totalLiabilities)}
                  </div>
                </TableCell>

                <TableCell />

                <TableCell
                  className={[
                    "text-right font-semibold tabular-nums",
                    netTotal < 0 ? "text-red-600" : "",
                  ].join(" ")}
                >
                  {netTotal < 0 ? `-${formatRub(Math.abs(netTotal))}` : formatRub(netTotal)}
                </TableCell>

                <TableCell />

                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>

      {error && (
        <div className="mt-4 text-sm text-red-600">Ошибка: {error}</div>
      )}
    </main>
  );
}