"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/form-field";
import {
  fetchItem,
  fetchItemCosts,
  fetchItemMarketValues,
  updateItem,
  API_BASE,
  ItemOut,
  ItemCostsOut,
  ItemMarketValueOut,
  PrimaryValueKind,
} from "@/lib/api";
import { getItemTypeLabel } from "@/lib/item-types";
import { formatAmount, getItemPhotoUrl } from "@/lib/item-utils";
import { PRIMARY_VALUE_KIND_OPTIONS, getPrimaryValueLabel } from "@/lib/asset-item-form-constants";
import { ACCENT, ACTIVE_TEXT_DARK } from "@/lib/colors";
import { TYPE_ICON_BY_CODE } from "@/lib/asset-icons";

function formatRub(cents: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export default function AssetDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id != null ? Number(params.id) : NaN;
  const [item, setItem] = useState<ItemOut | null>(null);
  const [costs, setCosts] = useState<ItemCostsOut | null>(null);
  const [marketValues, setMarketValues] = useState<ItemMarketValueOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingPrimary, setSavingPrimary] = useState(false);
  const [costHistoryOpen, setCostHistoryOpen] = useState<"balance" | "acquisition" | "invested" | "market" | null>(null);

  const load = useCallback(async () => {
    if (!Number.isFinite(id)) return;
    setLoading(true);
    setError(null);
    try {
      const [itemRes, costsRes, marketRes] = await Promise.all([
        fetchItem(id),
        fetchItemCosts(id),
        fetchItemMarketValues(id),
      ]);
      setItem(itemRes);
      setCosts(costsRes);
      setMarketValues(marketRes);
    } catch (e: any) {
      setError(e?.message ?? "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const buildItemCreatePayload = useCallback(
    (overrides: { primary_value_kind?: PrimaryValueKind }) => {
      if (!item) return null;
      const payload: Parameters<typeof updateItem>[1] = {
        kind: item.kind,
        type_code: item.type_code,
        name: item.name,
        currency_code: item.currency_code ?? "RUB",
        open_date: item.open_date,
        initial_value_rub: item.initial_value_rub,
        counterparty_id: item.counterparty_id ?? null,
        opening_counterparty_item_id: item.opening_counterparty_item_id ?? null,
        account_last7: item.account_last7 ?? null,
        contract_number: item.contract_number ?? null,
        card_last4: item.card_last4 ?? null,
        card_account_id: item.card_account_id ?? null,
        card_kind: item.card_kind ?? null,
        credit_limit: item.credit_limit ?? null,
        deposit_term_days: item.deposit_term_days ?? null,
        interest_rate: item.interest_rate ?? null,
        interest_payout_order: item.interest_payout_order ?? null,
        interest_capitalization: item.interest_capitalization ?? null,
        interest_payout_account_id: item.interest_payout_account_id ?? null,
        instrument_id: item.instrument_id ?? null,
        instrument_board_id: item.instrument_board_id ?? null,
        position_lots: item.position_lots ?? null,
        synonyms: item.synonyms ?? [],
        plan_settings: item.plan_settings ?? null,
        primary_value_kind: overrides.primary_value_kind ?? item.primary_value_kind ?? null,
      };
      return payload;
    },
    [item]
  );

  const handlePrimaryValueKindChange = async (value: PrimaryValueKind) => {
    if (!item) return;
    const payload = buildItemCreatePayload({ primary_value_kind: value });
    if (!payload) return;
    setSavingPrimary(true);
    try {
      const updated = await updateItem(item.id, payload);
      setItem(updated);
    } catch (e: any) {
      setError(e?.message ?? "Не удалось сохранить");
    } finally {
      setSavingPrimary(false);
    }
  };

  if (loading && !item) {
    return (
      <main className="min-h-screen pb-8 px-4">
        <div className="max-w-2xl mx-auto py-8">Загрузка...</div>
      </main>
    );
  }

  if (error && !item) {
    return (
      <main className="min-h-screen pb-8 px-4">
        <div className="max-w-2xl mx-auto py-8">
          <p className="text-red-600">{error}</p>
          <Button variant="outline" className="mt-4" asChild>
            <Link href="/assets">К активам</Link>
          </Button>
        </div>
      </main>
    );
  }

  if (!item) {
    return (
      <main className="min-h-screen pb-8 px-4">
        <div className="max-w-2xl mx-auto py-8">
          <p className="text-muted-foreground">Актив не найден.</p>
          <Button variant="outline" className="mt-4" asChild>
            <Link href="/assets">К активам</Link>
          </Button>
        </div>
      </main>
    );
  }

  const TypeIcon = TYPE_ICON_BY_CODE[item.type_code];
  const photoUrl = getItemPhotoUrl(item, API_BASE);

  return (
    <main className="min-h-screen pb-8 px-4">
      <div className="max-w-2xl mx-auto py-6">
        <Button variant="ghost" size="sm" className="mb-4 -ml-2" asChild>
          <Link href="/assets" className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            К активам и обязательствам
          </Link>
        </Button>

        <Card className="mb-6">
          <CardHeader className="flex flex-row items-start gap-4">
            <div className="w-16 h-16 rounded-lg overflow-hidden bg-muted flex-shrink-0">
              {photoUrl ? (
                <img src={photoUrl} alt="" className="w-full h-full object-cover" />
              ) : TypeIcon ? (
                <div className="w-full h-full flex items-center justify-center" style={{ color: ACCENT }}>
                  <TypeIcon className="w-8 h-8" strokeWidth={1.5} />
                </div>
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <CardTitle className="text-xl">{item.name}</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">{getItemTypeLabel(item)}</p>
              {item.currency_code && (
                <p className="text-sm text-muted-foreground">{item.currency_code}</p>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              {item.open_date && (
                <>
                  <dt className="text-muted-foreground">Дата появления</dt>
                  <dd>{item.open_date}</dd>
                </>
              )}
              {item.contract_number && (
                <>
                  <dt className="text-muted-foreground">Номер договора</dt>
                  <dd>{item.contract_number}</dd>
                </>
              )}
              {item.account_last7 && (
                <>
                  <dt className="text-muted-foreground">Последние 4 цифры счёта</dt>
                  <dd>****{item.account_last7}</dd>
                </>
              )}
              {item.deposit_term_days != null && (
                <>
                  <dt className="text-muted-foreground">Срок вклада, дней</dt>
                  <dd>{item.deposit_term_days}</dd>
                </>
              )}
              {item.interest_rate != null && (
                <>
                  <dt className="text-muted-foreground">Процентная ставка</dt>
                  <dd>{item.interest_rate}%</dd>
                </>
              )}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Стоимости</CardTitle>
            <div className="mt-2">
              <SelectField
                label="Основная стоимость"
                value={item.primary_value_kind ?? "BALANCE"}
                onValueChange={(v) => handlePrimaryValueKindChange(v as PrimaryValueKind)}
                options={PRIMARY_VALUE_KIND_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                placeholder="Выберите"
                disabled={savingPrimary}
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {costs && (
              <div className="grid grid-cols-2 gap-4">
                <div
                  className="rounded-lg border p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => setCostHistoryOpen((v) => (v === "balance" ? null : "balance"))}
                >
                  <div className="text-xs text-muted-foreground mb-1">Балансовая стоимость</div>
                  <div className="text-lg font-semibold" style={{ color: ACTIVE_TEXT_DARK }}>
                    {formatRub(costs.balance_rub)}
                  </div>
                </div>
                <div
                  className="rounded-lg border p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => setCostHistoryOpen((v) => (v === "acquisition" ? null : "acquisition"))}
                >
                  <div className="text-xs text-muted-foreground mb-1">Стоимость приобретения</div>
                  <div className="text-lg font-semibold" style={{ color: ACTIVE_TEXT_DARK }}>
                    {formatRub(costs.acquisition_rub)}
                  </div>
                </div>
                <div
                  className="rounded-lg border p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => setCostHistoryOpen((v) => (v === "invested" ? null : "invested"))}
                >
                  <div className="text-xs text-muted-foreground mb-1">Стоимость вложенных средств</div>
                  <div className="text-lg font-semibold" style={{ color: ACTIVE_TEXT_DARK }}>
                    {formatRub(costs.invested_rub)}
                  </div>
                </div>
                <div
                  className="rounded-lg border p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => setCostHistoryOpen((v) => (v === "market" ? null : "market"))}
                >
                  <div className="text-xs text-muted-foreground mb-1">Рыночная стоимость</div>
                  <div className="text-lg font-semibold" style={{ color: ACTIVE_TEXT_DARK }}>
                    {costs.market_rub != null ? formatRub(costs.market_rub) : "—"}
                  </div>
                </div>
              </div>
            )}

            {costHistoryOpen === "market" && (
              <div className="mt-4 rounded-lg border p-4 bg-muted/30">
                <div className="text-sm font-medium mb-2">История ручной рыночной стоимости</div>
                {marketValues.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Нет записей.</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {[...marketValues].sort((a, b) => b.value_date.localeCompare(a.value_date)).map((mv) => (
                      <li key={mv.id} className="flex justify-between">
                        <span>{mv.value_date}</span>
                        <span>{formatRub(mv.value_rub)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {(costHistoryOpen === "balance" || costHistoryOpen === "acquisition" || costHistoryOpen === "invested") && (
              <div className="mt-4 rounded-lg border p-4 bg-muted/30">
                <div className="text-sm font-medium mb-2">
                  {costHistoryOpen === "balance" && "История балансовой стоимости"}
                  {costHistoryOpen === "acquisition" && "История стоимости приобретения"}
                  {costHistoryOpen === "invested" && "История стоимости вложенных средств"}
                </div>
                <p className="text-sm text-muted-foreground">
                  Детализация по транзакциям будет доступна в следующей версии.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
