"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthInput } from "@/components/ui/auth-input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  completeTbankImport,
  fetchItems,
  fetchIntegration,
  fetchTbankAccounts,
  fetchTbankInfo,
  previewTbankImport,
  patchIntegration,
  type ItemOut,
  type TbankAccountOut,
  type TbankInfoOut,
  type TbankOperationsPreviewResponse,
  type UserIntegrationOut,
} from "@/lib/api";
import { MODAL_BG, ACTIVE_TEXT_DARK, PLACEHOLDER_COLOR_DARK, ACCENT2 } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { CONTENT_WIDTH_CLASS } from "@/lib/content-width";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TbankProfileInfoBadges } from "@/components/tbank-profile-info-badges";

type MappingRow = {
  external_account_id: string;
  item_id: number | null;
  create_new: boolean;
  new_item_name: string | null;
};

function Stepper({ step }: { step: 1 | 2 | 3 }) {
  const steps = [
    { n: 1, label: "Токен" },
    { n: 2, label: "Счета" },
    { n: 3, label: "Импорт" },
  ] as const;
  return (
    <div className="flex items-center gap-3">
      {steps.map((s, idx) => (
        <div key={s.n} className="flex items-center gap-3">
          <div
            className={cn(
              "h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium border",
              s.n === step
                ? "border-transparent"
                : "border-white/10 text-white/70"
            )}
            style={{ backgroundColor: s.n === step ? ACCENT2 : "transparent" }}
          >
            {s.n}
          </div>
          <div className={cn("text-sm", s.n === step ? "text-white" : "text-white/70")}>
            {s.label}
          </div>
          {idx < steps.length - 1 && <div className="h-px w-10 bg-white/10" />}
        </div>
      ))}
    </div>
  );
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export default function TbankIntegrationSetupPage() {
  const params = useParams();
  const router = useRouter();
  const integrationId = Number(params.integrationId ?? "");

  const [integration, setIntegration] = useState<UserIntegrationOut | null>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // step1
  const [sandbox, setSandbox] = useState(false);
  const [token, setToken] = useState("");
  const [savingToken, setSavingToken] = useState(false);
  const [info, setInfo] = useState<TbankInfoOut | null>(null);

  // step2
  const [accounts, setAccounts] = useState<TbankAccountOut[]>([]);
  const [items, setItems] = useState<ItemOut[]>([]);
  const [mappings, setMappings] = useState<Record<string, MappingRow>>({});

  // step3
  const [preview, setPreview] = useState<TbankOperationsPreviewResponse | null>(null);
  const [importing, setImporting] = useState(false);

  const assetItems = useMemo(
    () => items.filter((i) => i.kind === "ASSET" && !i.archived_at),
    [items]
  );

  const loadIntegration = useCallback(async () => {
    if (!Number.isFinite(integrationId)) return;
    setLoading(true);
    setError(null);
    try {
      const integ = await fetchIntegration(integrationId);
      setIntegration(integ);
      setSandbox(Boolean(integ.sandbox));
      // if token already exists, try fetch info silently
      if (integ.has_token) {
        try {
          const inf = await fetchTbankInfo(integrationId);
          setInfo(inf);
        } catch {
          // ignore
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, [integrationId]);

  useEffect(() => {
    loadIntegration();
  }, [loadIntegration]);

  const goStep2 = useCallback(async () => {
    setError(null);
    try {
      const [acc, it] = await Promise.all([
        fetchTbankAccounts(integrationId),
        fetchItems(),
      ]);
      setAccounts(acc);
      setItems(it);
      const next: Record<string, MappingRow> = {};
      for (const a of acc) {
        next[a.external_account_id] = {
          external_account_id: a.external_account_id,
          item_id: null,
          create_new: false,
          new_item_name: a.name ?? "Брокерский счёт",
        };
      }
      setMappings(next);
      setStep(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить счета");
    }
  }, [integrationId]);

  const goStep3 = useCallback(async () => {
    setError(null);
    try {
      const p = await previewTbankImport(integrationId);
      setPreview(p);
      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось подготовить импорт");
    }
  }, [integrationId]);

  const onSaveToken = async () => {
    if (!token.trim()) {
      setError("Введите токен");
      return;
    }
    setSavingToken(true);
    setError(null);
    try {
      const u = await patchIntegration(integrationId, {
        token: token.trim(),
        sandbox,
      });
      setIntegration(u);
      const inf = await fetchTbankInfo(integrationId);
      setInfo(inf);
      setToken("");
      setSuccess("Токен проверен");
      setTimeout(() => setSuccess(null), 2500);
      await goStep2();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить токен");
    } finally {
      setSavingToken(false);
    }
  };

  const onImport = async () => {
    setImporting(true);
    setError(null);
    try {
      const payload = {
        mappings: Object.values(mappings).map((m) => ({
          external_account_id: m.external_account_id,
          item_id: m.item_id,
          create_new: m.create_new,
          new_item_name: m.new_item_name,
        })),
      };
      await completeTbankImport(integrationId, payload);
      router.push(`/cabinet/integrations/${integrationId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка импорта");
    } finally {
      setImporting(false);
    }
  };

  if (!Number.isFinite(integrationId)) {
    return <div className="p-6 text-white">Некорректный id интеграции</div>;
  }

  return (
    <div className={cn("mx-auto p-6 text-white", CONTENT_WIDTH_CLASS)}>
      <div className="mb-4">
        <Link
          href="/cabinet"
          className="inline-flex items-center gap-2 text-sm text-white/70 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Назад в кабинет
        </Link>
      </div>

      <div
        className="rounded-lg p-6 border border-white/10"
        style={{ backgroundColor: MODAL_BG }}
      >
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="text-xl font-semibold">Подключение Т-Инвестиций</div>
            <div className="text-sm text-white/70 mt-1">
              Подключение выполняется в три шага: токен → счета → импорт.
            </div>
          </div>
          <Stepper step={step} />
        </div>

        {loading || !integration ? (
          <div className="mt-6 text-white/70">Загрузка…</div>
        ) : (
          <>
            {error && (
              <div className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm">
                {error}
              </div>
            )}
            {success && (
              <div className="mt-4 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">
                {success}
              </div>
            )}

            {step === 1 && (
              <div className="mt-6 space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <Label style={{ color: ACTIVE_TEXT_DARK }}>Песочница T-Invest</Label>
                  <Switch checked={sandbox} onCheckedChange={setSandbox} />
                </div>

                <div>
                  <Label style={{ color: PLACEHOLDER_COLOR_DARK }}>
                    Токен API T-Invest
                  </Label>
                  <div className="mt-2 flex gap-2">
                    <AuthInput
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      placeholder={integration.has_token ? "••••••••" : ""}
                      type="password"
                      className="flex-1"
                    />
                    <Button
                      onClick={onSaveToken}
                      disabled={savingToken}
                      style={{ backgroundColor: ACCENT2 }}
                    >
                      {savingToken ? "Проверка…" : "Далее"}
                    </Button>
                  </div>
                  <div className="mt-2 text-xs text-white/60">
                    Токен хранится в приложении в зашифрованном виде.
                  </div>
                </div>

                {info && (
                  <TbankProfileInfoBadges info={info} variant="setup" />
                )}
              </div>
            )}

            {step === 2 && (
              <div className="mt-6 space-y-4">
                <div className="text-sm text-white/70">
                  Сопоставьте счета из Т-Инвестиций с активами в приложении или создайте новые.
                </div>

                <div className="space-y-3">
                  {accounts.map((a) => {
                    const m = mappings[a.external_account_id];
                    if (!m) return null;
                    return (
                      <div
                        key={a.external_account_id}
                        className="rounded-md border border-white/10 p-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="font-medium">
                              {a.type_label ?? a.type ?? "Счёт"} — {a.name ?? "—"}
                            </div>
                            <div className="text-xs text-white/60 mt-1">
                              Открыт: {formatDate(a.opened_date)}
                            </div>
                            <div className="text-xs text-white/60">
                              ID: {a.external_account_id}
                            </div>
                          </div>
                          <div className="min-w-[320px]">
                            <Label className="text-xs text-white/60">Связать с активом</Label>
                            <div className="mt-2">
                              <Select
                                value={
                                  m.create_new
                                    ? "__create_new__"
                                    : m.item_id == null
                                      ? "__none__"
                                      : String(m.item_id)
                                }
                                onValueChange={(v) => {
                                  setMappings((prev) => {
                                    const next = { ...prev };
                                    const cur = { ...next[a.external_account_id] };
                                    if (v === "__create_new__") {
                                      cur.create_new = true;
                                      cur.item_id = null;
                                    } else if (v === "__none__") {
                                      cur.create_new = false;
                                      cur.item_id = null;
                                    } else {
                                      cur.create_new = false;
                                      cur.item_id = Number(v);
                                    }
                                    next[a.external_account_id] = cur;
                                    return next;
                                  });
                                }}
                              >
                                <SelectTrigger className="w-full">
                                  <SelectValue placeholder="Выберите актив" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">Не импортировать</SelectItem>
                                  <SelectItem value="__create_new__">Создать новый счёт</SelectItem>
                                  {assetItems.map((it) => (
                                    <SelectItem key={it.id} value={String(it.id)}>
                                      {it.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            {m.create_new && (
                              <div className="mt-3 space-y-2">
                                <div className="text-xs text-white/60">
                                  Банк:{" "}
                                  <span className="text-white/90">Т-Банк</span> — будет указан автоматически при
                                  импорте.
                                </div>
                                <div>
                                  <Label className="text-xs text-white/60">Название нового счёта</Label>
                                  <AuthInput
                                    value={m.new_item_name ?? ""}
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      setMappings((prev) => ({
                                        ...prev,
                                        [a.external_account_id]: {
                                          ...prev[a.external_account_id],
                                          new_item_name: v,
                                        },
                                      }));
                                    }}
                                    placeholder="Например: Брокерский счёт"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <Button variant="secondary" onClick={() => setStep(1)}>
                    Назад
                  </Button>
                  <Button style={{ backgroundColor: ACCENT2 }} onClick={goStep3}>
                    Далее
                  </Button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="mt-6 space-y-4">
                <div className="text-sm text-white/70">
                  Проверьте количество операций, которые будут импортированы, и подтвердите импорт.
                </div>

                {!preview ? (
                  <div className="text-white/70">Загрузка превью…</div>
                ) : (
                  <div className="space-y-3">
                    {preview.accounts.map((p) => (
                      <div
                        key={p.external_account_id}
                        className="rounded-md border border-white/10 p-4"
                      >
                        <div className="font-medium">
                          Счёт {p.external_account_id}
                        </div>
                        <div className="mt-2 text-sm text-white/80">
                          Будет импортировано:{" "}
                          <span className="text-white font-medium">
                            {p.importable_total}
                          </span>
                        </div>
                        <div className="text-sm text-white/80">
                          Не будет импортировано:{" "}
                          <span className="text-white font-medium">
                            {p.not_imported_total}
                          </span>
                        </div>
                        {Object.keys(p.importable_by_type || {}).length > 0 && (
                          <div className="mt-3 text-xs text-white/70">
                            <div className="font-medium text-white/80 mb-1">
                              Импортируемые типы
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {Object.entries(p.importable_by_type).map(([k, v]) => (
                                <div
                                  key={k}
                                  className="rounded px-2 py-1 border border-white/10 bg-white/5"
                                >
                                  {k}: {v}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2">
                  <Button variant="secondary" onClick={() => setStep(2)}>
                    Назад
                  </Button>
                  <Button
                    style={{ backgroundColor: ACCENT2 }}
                    disabled={importing}
                    onClick={onImport}
                  >
                    {importing ? "Импорт…" : "Подтвердить и импортировать"}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

