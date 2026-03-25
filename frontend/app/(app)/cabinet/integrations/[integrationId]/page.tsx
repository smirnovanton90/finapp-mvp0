"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AuthInput } from "@/components/ui/auth-input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  fetchIntegration,
  patchIntegration,
  deleteIntegrationToken,
  syncIntegration,
  fetchAccountLinks,
  putAccountLinks,
  fetchItems,
  fetchTbankInfo,
  type TbankInfoOut,
  type UserIntegrationOut,
  type BrokerAccountLinkOut,
  type ItemOut,
} from "@/lib/api";
import { ImportAccountsOperationsModal } from "@/components/import-accounts-operations-modal";
import { MODAL_BG, ACTIVE_TEXT_DARK, PLACEHOLDER_COLOR_DARK, ACCENT2 } from "@/lib/colors";
import { getItemTypeLabel } from "@/lib/item-types";
import { cn } from "@/lib/utils";
import { CONTENT_WIDTH_CLASS } from "@/lib/content-width";

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function TbankIntegrationPage() {
  const params = useParams();
  const integrationId = Number(params.integrationId ?? "");

  const [integration, setIntegration] = useState<UserIntegrationOut | null>(null);
  const [links, setLinks] = useState<BrokerAccountLinkOut[]>([]);
  const [items, setItems] = useState<ItemOut[]>([]);
  const [tokenInput, setTokenInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingToken, setSavingToken] = useState(false);
  const [clearTokenOpen, setClearTokenOpen] = useState(false);
  const [clearingToken, setClearingToken] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [savingMaps, setSavingMaps] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tbankInfo, setTbankInfo] = useState<TbankInfoOut | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);

  const localMap = useCallback(
    (rows: BrokerAccountLinkOut[]) => {
      const m: Record<string, number | null> = {};
      for (const r of rows) {
        m[r.external_account_id] = r.item_id ?? null;
      }
      return m;
    },
    []
  );
  const [itemIdByAccount, setItemIdByAccount] = useState<
    Record<string, number | null>
  >({});

  const load = useCallback(async () => {
    if (!Number.isFinite(integrationId)) return;
    setLoading(true);
    setError(null);
    try {
      const [integ, ln, it] = await Promise.all([
        fetchIntegration(integrationId),
        fetchAccountLinks(integrationId),
        fetchItems(),
      ]);
      setIntegration(integ);
      setLinks(ln);
      setItemIdByAccount(localMap(ln));
      setItems(it.filter((i) => i.kind === "ASSET" && !i.archived_at));
      if (integ.has_token) {
        fetchTbankInfo(integrationId)
          .then(setTbankInfo)
          .catch(() => setTbankInfo(null));
      } else {
        setTbankInfo(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, [integrationId, localMap]);

  useEffect(() => {
    load();
  }, [load]);

  const saveToken = async () => {
    if (!tokenInput.trim()) {
      setError("Введите токен");
      return;
    }
    setSavingToken(true);
    setError(null);
    try {
      const u = await patchIntegration(integrationId, { token: tokenInput.trim() });
      setIntegration(u);
      setTokenInput("");
      setSuccess("Токен сохранён");
      setTimeout(() => setSuccess(null), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить токен");
    } finally {
      setSavingToken(false);
    }
  };

  const confirmDeleteToken = async () => {
    setClearingToken(true);
    setError(null);
    try {
      const u = await deleteIntegrationToken(integrationId);
      setIntegration(u);
      setTokenInput("");
      setClearTokenOpen(false);
      setSuccess("Токен удалён");
      setTimeout(() => setSuccess(null), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось удалить токен");
    } finally {
      setClearingToken(false);
    }
  };

  const onSandbox = async (sandbox: boolean) => {
    setError(null);
    try {
      const u = await patchIntegration(integrationId, { sandbox });
      setIntegration(u);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const onSync = async () => {
    setSyncing(true);
    setError(null);
    try {
      const u = await syncIntegration(integrationId);
      setIntegration(u);
      if (u.has_token) {
        fetchTbankInfo(integrationId)
          .then(setTbankInfo)
          .catch(() => setTbankInfo(null));
      }
      const ln = await fetchAccountLinks(integrationId);
      setLinks(ln);
      setItemIdByAccount(localMap(ln));
      setSuccess("Данные обновлены");
      setTimeout(() => setSuccess(null), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка синхронизации");
      await load();
    } finally {
      setSyncing(false);
    }
  };

  const saveMappings = async () => {
    setSavingMaps(true);
    setError(null);
    try {
      const payload = links.map((r) => ({
        external_account_id: r.external_account_id,
        item_id: itemIdByAccount[r.external_account_id] ?? null,
      }));
      const updated = await putAccountLinks(integrationId, payload);
      setLinks(updated);
      setItemIdByAccount(localMap(updated));
      setSuccess("Сопоставления сохранены");
      setTimeout(() => setSuccess(null), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сохранения");
    } finally {
      setSavingMaps(false);
    }
  };

  if (!Number.isFinite(integrationId)) {
    return (
      <main className={cn("min-h-screen px-8 py-8", CONTENT_WIDTH_CLASS)}>
        <p style={{ color: ACTIVE_TEXT_DARK }}>Неверный идентификатор</p>
      </main>
    );
  }

  return (
    <main className={cn("min-h-screen px-8 py-8", CONTENT_WIDTH_CLASS)}>
      <div className="mb-6">
        <Link
          href="/cabinet"
          className="inline-flex items-center gap-2 text-sm mb-4"
          style={{ color: ACTIVE_TEXT_DARK }}
        >
          <ArrowLeft className="w-4 h-4" />
          Личный кабинет
        </Link>
        <h1
          className="text-2xl font-medium"
          style={{ color: ACTIVE_TEXT_DARK }}
        >
          Т-Инвестиции
        </h1>
        <p className="text-sm mt-1" style={{ color: PLACEHOLDER_COLOR_DARK }}>
          Токен API и сопоставление счетов с активами. Справочник инструментов — из MOEX.
        </p>
      </div>

      {(error || success) && (
        <div className="mb-4 space-y-2">
          {error && (
            <div
              className="text-sm rounded-md border p-3"
              style={{
                color: "#FB4C4F",
                backgroundColor: "rgba(251, 76, 79, 0.08)",
                borderColor: "rgba(251, 76, 79, 0.3)",
              }}
            >
              {error}
            </div>
          )}
          {success && (
            <div
              className="text-sm rounded-md border p-3"
              style={{
                color: "#34D399",
                backgroundColor: "rgba(52, 211, 153, 0.08)",
                borderColor: "rgba(52, 211, 153, 0.3)",
              }}
            >
              {success}
            </div>
          )}
        </div>
      )}

      <div
        className="rounded-lg overflow-hidden p-6 space-y-6"
        style={{ backgroundColor: MODAL_BG }}
      >
        {loading || !integration ? (
          <p style={{ color: PLACEHOLDER_COLOR_DARK }}>Загрузка…</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm" style={{ color: PLACEHOLDER_COLOR_DARK }}>
                  Последнее обновление данных
                </p>
                <p className="text-base font-medium" style={{ color: ACTIVE_TEXT_DARK }}>
                  {formatDateTime(integration.last_sync_at)}
                </p>
                {integration.last_error && (
                  <p className="text-xs mt-1" style={{ color: "#FB4C4F" }}>
                    {integration.last_error}
                  </p>
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={syncing || !integration.has_token}
                className="rounded-md"
                style={{ borderColor: ACCENT2, color: ACTIVE_TEXT_DARK }}
                onClick={onSync}
              >
                <RefreshCw className={cn("w-4 h-4 mr-2", syncing && "animate-spin")} />
                {syncing ? "Обновление…" : "Обновить"}
              </Button>
            </div>

            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="rounded-md border p-4 flex-1 min-w-[280px]" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
                <p className="text-sm" style={{ color: PLACEHOLDER_COLOR_DARK }}>
                  Профиль (GetInfo)
                </p>
                <div className="mt-2 text-sm" style={{ color: ACTIVE_TEXT_DARK }}>
                  <div>
                    Премиум:{" "}
                    {tbankInfo?.is_premium == null ? "—" : tbankInfo.is_premium ? "Да" : "Нет"}
                  </div>
                  <div>
                    Квал. инвестор:{" "}
                    {tbankInfo?.is_qualified == null
                      ? "—"
                      : tbankInfo.is_qualified
                        ? "Да"
                        : "Нет"}
                  </div>
                  <div>Категория риска: {tbankInfo?.risk_category ?? "—"}</div>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                className="rounded-md"
                style={{ borderColor: ACCENT2, color: ACTIVE_TEXT_DARK }}
                onClick={() => setSetupOpen(true)}
              >
                Открыть мастер подключения
              </Button>
            </div>

            <ImportAccountsOperationsModal
              open={setupOpen}
              onOpenChange={setSetupOpen}
              importSource="tbank_invest_api"
              tbankIntegrationId={integrationId}
              onFinish={load}
            />

            <div className="flex items-center justify-between gap-4">
              <Label style={{ color: ACTIVE_TEXT_DARK }}>Песочница T-Invest</Label>
              <Switch
                checked={integration.sandbox}
                onCheckedChange={(v) => onSandbox(v)}
              />
            </div>

            <div className="space-y-2">
              <Label>
                {integration.has_token
                  ? "Токен API (скрыт). Введите новый, чтобы заменить."
                  : "Токен API T-Invest"}
              </Label>
              <div className="flex flex-wrap gap-2 items-end max-w-xl">
                <AuthInput
                  type="password"
                  autoComplete="off"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder={integration.has_token ? "••••••••" : ""}
                  className="flex-1 min-w-[200px]"
                />
                <Button
                  type="button"
                  className="rounded-md"
                  style={{ background: ACCENT2, color: "#fff" }}
                  disabled={savingToken}
                  onClick={saveToken}
                >
                  {savingToken ? "Сохранение…" : "Сохранить токен"}
                </Button>
                {integration.has_token && (
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-md border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    disabled={savingToken || clearingToken}
                    onClick={() => setClearTokenOpen(true)}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Удалить токен
                  </Button>
                )}
              </div>
            </div>

            <AlertDialog open={clearTokenOpen} onOpenChange={setClearTokenOpen}>
              <AlertDialogContent className="rounded-lg">
                <AlertDialogHeader>
                  <AlertDialogTitle>Удалить токен?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Токен будет удалён из приложения. Синхронизация с T-Invest станет
                    недоступна, пока вы снова не сохраните токен.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="rounded-md">Отмена</AlertDialogCancel>
                  <Button
                    type="button"
                    variant="destructive"
                    className="rounded-md"
                    disabled={clearingToken}
                    onClick={confirmDeleteToken}
                  >
                    {clearingToken ? "Удаление…" : "Удалить"}
                  </Button>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <div className="space-y-3">
              <h2 className="text-lg font-medium" style={{ color: ACTIVE_TEXT_DARK }}>
                Счета из T-Invest → активы
              </h2>
              <p className="text-sm" style={{ color: PLACEHOLDER_COLOR_DARK }}>
                Сопоставьте счёт брокера с активом (брокерский счёт, ИИС и т.д.). Без
                сопоставления импорт по этому счёту не выполняется.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ color: PLACEHOLDER_COLOR_DARK }}>
                      <th className="text-left py-2 pr-4">Счёт</th>
                      <th className="text-left py-2 pr-4">Тип</th>
                      <th className="text-left py-2">Актив</th>
                    </tr>
                  </thead>
                  <tbody>
                    {links.map((row) => (
                      <tr key={row.id} style={{ color: ACTIVE_TEXT_DARK }}>
                        <td className="py-2 pr-4 align-top">
                          {row.display_name || row.external_account_id}
                          <div className="text-xs mt-0.5" style={{ color: PLACEHOLDER_COLOR_DARK }}>
                            {row.external_account_id}
                          </div>
                        </td>
                        <td className="py-2 pr-4 align-top">
                          {row.account_type_hint || "—"}
                        </td>
                        <td className="py-2 align-top min-w-[220px]">
                          <Select
                            value={
                              itemIdByAccount[row.external_account_id] != null
                                ? String(itemIdByAccount[row.external_account_id])
                                : "__none__"
                            }
                            onValueChange={(v) => {
                              setItemIdByAccount((prev) => ({
                                ...prev,
                                [row.external_account_id]:
                                  v === "__none__" ? null : Number(v),
                              }));
                            }}
                          >
                            <SelectTrigger className="w-full h-10 rounded-md">
                              <SelectValue placeholder="Не выбрано" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">Не выбрано</SelectItem>
                              {items.map((it) => (
                                <SelectItem key={it.id} value={String(it.id)}>
                                  {it.name} — {getItemTypeLabel(it)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {links.length === 0 && (
                  <p className="text-sm" style={{ color: PLACEHOLDER_COLOR_DARK }}>
                    Нет счетов. Нажмите «Обновить» после сохранения токена.
                  </p>
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={savingMaps || links.length === 0}
                className="rounded-md"
                style={{ borderColor: ACCENT2, color: ACTIVE_TEXT_DARK }}
                onClick={saveMappings}
              >
                {savingMaps ? "Сохранение…" : "Сохранить сопоставления"}
              </Button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
