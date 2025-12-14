"use client";

import { useEffect, useMemo, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import {
  archiveItem,
  createItem,
  fetchItems,
  ItemKind,
  ItemOut,
} from "@/lib/api";

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
  { code: "tax_debt", label: "Налоги/штрафы" },
  { code: "private_loan", label: "Частный заём" },
  { code: "other_liability", label: "Другое" },
];

function formatRub(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function Home() {
  const { data: session, status } = useSession();

  const [items, setItems] = useState<ItemOut[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [kind, setKind] = useState<ItemKind>("ASSET");
  const [typeCode, setTypeCode] = useState<string>(ASSET_TYPES[0].code);
  const [name, setName] = useState("");
  const [initialValue, setInitialValue] = useState<number>(0);

  const typeOptions = useMemo(
    () => (kind === "ASSET" ? ASSET_TYPES : LIABILITY_TYPES),
    [kind]
  );

  useEffect(() => {
    // когда переключаем kind — подставляем первый тип из списка
    setTypeCode(typeOptions[0]?.code ?? "");
  }, [kind, typeOptions]);

  async function reload() {
    setError(null);
    setLoading(true);
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
    if (session) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

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
        initial_value_rub: Number(initialValue) || 0,
      });
      setName("");
      setInitialValue(0);
      await reload();
    } catch (e: any) {
      setError(e?.message ?? "Ошибка создания");
    } finally {
      setLoading(false);
    }
  }

  async function onArchive(id: number) {
    setError(null);
    setLoading(true);
    try {
      await archiveItem(id);
      await reload();
    } catch (e: any) {
      setError(e?.message ?? "Ошибка архивации");
    } finally {
      setLoading(false);
    }
  }

  // Auth UI
  if (status === "loading") {
    return <main style={{ padding: 24 }}>Загрузка… ☕</main>;
  }

  if (!session) {
    return (
      <main style={{ padding: 24 }}>
        <h1>FinApp MVP1</h1>
        <p>Сначала логин через Google, потом уже финансы и тревожность.</p>
        <button
          onClick={() => signIn("google")}
          style={{ padding: "10px 16px", marginTop: 12 }}
        >
          Войти через Google
        </button>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, maxWidth: 1000 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ marginBottom: 6 }}>Привет, {session.user?.name} 👋</h1>
          <div style={{ opacity: 0.8 }}>
            MVP1: активы/обязательства — список, добавление, архив
          </div>
        </div>
        <button onClick={() => signOut()} style={{ padding: "10px 16px" }}>
          Выйти
        </button>
      </div>

      <hr style={{ margin: "18px 0" }} />

      <h2>Добавить</h2>
      <form onSubmit={onCreate} style={{ display: "grid", gap: 10 }}>
        <label>
          Тип записи:
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as ItemKind)}
            style={{ marginLeft: 10 }}
          >
            <option value="ASSET">Актив</option>
            <option value="LIABILITY">Обязательство</option>
          </select>
        </label>

        <label>
          Вид:
          <select
            value={typeCode}
            onChange={(e) => setTypeCode(e.target.value)}
            style={{ marginLeft: 10, minWidth: 280 }}
          >
            {typeOptions.map((t) => (
              <option key={t.code} value={t.code}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Название:
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Например: Сбер счёт / Долг Пете"
            style={{ marginLeft: 10, minWidth: 320 }}
          />
        </label>

        <label>
          Начальная стоимость (₽):
          <input
            type="number"
            value={initialValue}
            onChange={(e) => setInitialValue(Number(e.target.value))}
            style={{ marginLeft: 10, width: 160 }}
          />
        </label>

        <div>
          <button
            type="submit"
            disabled={loading}
            style={{ padding: "10px 16px" }}
          >
            {loading ? "Секунду…" : "Добавить"}
          </button>
        </div>
      </form>

      <hr style={{ margin: "18px 0" }} />

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h2 style={{ margin: 0 }}>Список</h2>
        <button onClick={reload} disabled={loading} style={{ padding: "8px 12px" }}>
          Обновить
        </button>
        {loading && <span style={{ opacity: 0.7 }}>загрузка…</span>}
      </div>

      {error && (
        <div style={{ marginTop: 12, color: "crimson" }}>
          Ошибка: {error}
        </div>
      )}

      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          marginTop: 12,
        }}
      >
        <thead>
          <tr>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>
              Название
            </th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>
              Текущая (₽)
            </th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>
              Начальная (₽)
            </th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>
              Создано
            </th>
            <th style={{ borderBottom: "1px solid #ddd", padding: 8 }}></th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id}>
              <td style={{ padding: 8 }}>
                <div style={{ fontWeight: 600 }}>{it.name}</div>
                <div style={{ opacity: 0.7, fontSize: 12 }}>
                  {it.kind} • {it.type_code}
                </div>
              </td>
              <td style={{ padding: 8 }}>{formatRub(it.current_value_rub)}</td>
              <td style={{ padding: 8 }}>{formatRub(it.initial_value_rub)}</td>
              <td style={{ padding: 8 }}>
                {new Date(it.created_at).toLocaleString("ru-RU")}
              </td>
              <td style={{ padding: 8, textAlign: "right" }}>
                <button
                  onClick={() => onArchive(it.id)}
                  disabled={loading}
                  style={{ padding: "8px 12px" }}
                >
                  Архивировать
                </button>
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={5} style={{ padding: 12, opacity: 0.7 }}>
                Пока пусто. Добавь первый актив или обязательство.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}