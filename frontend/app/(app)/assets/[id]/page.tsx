"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/form-field";
import {
  fetchItem,
  fetchItems,
  fetchItemCosts,
  fetchItemMarketValues,
  fetchCounterparties,
  updateItem,
  fetchTransactionsPage,
  API_BASE,
  ItemOut,
  ItemCostsOut,
  ItemMarketValueOut,
  CounterpartyOut,
  PrimaryValueKind,
  TransactionOut,
} from "@/lib/api";
import { getItemTypeLabel } from "@/lib/item-types";
import { formatAmount, getItemPhotoUrl, getItemPrimaryValueCents } from "@/lib/item-utils";
import { PRIMARY_VALUE_KIND_OPTIONS, getPrimaryValueLabel } from "@/lib/asset-item-form-constants";
import { ACCENT, ACTIVE_TEXT_DARK, GREEN, RED, PLACEHOLDER_COLOR_DARK, BACKGROUND_DT, MODAL_BG } from "@/lib/colors";
import { TYPE_ICON_BY_CODE } from "@/lib/asset-icons";
import { BuySellAssetModal } from "@/components/buy-sell-asset-modal";

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
  const [buySellModalOpen, setBuySellModalOpen] = useState(false);
  const [allItems, setAllItems] = useState<ItemOut[]>([]);
  const [counterparties, setCounterparties] = useState<CounterpartyOut[]>([]);
  const [quantityHistoryTx, setQuantityHistoryTx] = useState<TransactionOut[]>([]);
  const [loadingQuantityHistory, setLoadingQuantityHistory] = useState(false);

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
      if (itemRes.instrument_id) {
        setLoadingQuantityHistory(true);
        fetchTransactionsPage({ related_item_ids: [itemRes.id], limit: 200 })
          .then((page) => {
            const list = page.items.filter(
              (tx) =>
                tx.primary_quantity_lots != null &&
                (tx.asset_link_type === "ASSET_PURCHASE" || tx.asset_link_type === "ASSET_SALE")
            );
            setQuantityHistoryTx(list);
          })
          .catch(() => setQuantityHistoryTx([]))
          .finally(() => setLoadingQuantityHistory(false));
      } else {
        setQuantityHistoryTx([]);
      }
    } catch (e: any) {
      setError(e?.message ?? "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const loadItemsAndCounterparties = useCallback(async () => {
    try {
      const [itemsRes, cpRes] = await Promise.all([
        fetchItems(),
        fetchCounterparties(),
      ]);
      setAllItems(itemsRes);
      setCounterparties(cpRes);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (buySellModalOpen && item?.instrument_id) {
      loadItemsAndCounterparties();
    }
  }, [buySellModalOpen, item?.instrument_id, loadItemsAndCounterparties]);

  const counterpartiesById = useMemo(() => {
    const map = new Map<number, CounterpartyOut>();
    counterparties.forEach((c) => map.set(c.id, c));
    return map;
  }, [counterparties]);

  const getCounterpartyForItemId = useCallback(
    (itemId: number) => {
      const it = allItems.find((i) => i.id === itemId);
      if (!it?.counterparty_id) return null;
      return counterpartiesById.get(it.counterparty_id) ?? null;
    },
    [allItems, counterpartiesById]
  );

  const itemCounterpartyLogoUrl = useCallback(
    (id: number | null | undefined) => {
      if (!id) return null;
      const it = allItems.find((i) => i.id === id);
      if (!it?.counterparty_id) return null;
      const cp = counterpartiesById.get(it.counterparty_id);
      if (!cp) return null;
      return cp.entity_type === "PERSON" ? cp.photo_url ?? null : cp.logo_url ?? null;
    },
    [allItems, counterpartiesById]
  );

  const itemCounterpartyName = useCallback(
    (id: number | null | undefined) => {
      if (!id) return "";
      const it = allItems.find((i) => i.id === id);
      if (!it?.counterparty_id) return "";
      const cp = counterpartiesById.get(it.counterparty_id);
      if (!cp) return "";
      if (cp.entity_type === "PERSON") {
        const parts = [cp.last_name, cp.first_name, cp.middle_name].filter(Boolean);
        return parts.join(" ") || "";
      }
      return cp.name || cp.full_name || "";
    },
    [allItems, counterpartiesById]
  );

  const quantityHistoryRows = useMemo(() => {
    const openDate = item?.open_date ?? "";
    const fromOpen = openDate
      ? quantityHistoryTx.filter((tx) => (tx.transaction_date || "").slice(0, 10) >= openDate)
      : quantityHistoryTx;
    // Одна строка на каждую операцию (не объединяем по дате): сортировка по дате/времени, затем по id
    const sorted = [...fromOpen].sort((a, b) => {
      const dateA = a.transaction_date || "";
      const dateB = b.transaction_date || "";
      const d = dateA.localeCompare(dateB);
      if (d !== 0) return d;
      return (a.id ?? 0) - (b.id ?? 0);
    });
    let totalBuy = 0;
    let totalSell = 0;
    sorted.forEach((tx) => {
      const lots = tx.primary_quantity_lots ?? 0;
      if (tx.asset_link_type === "ASSET_PURCHASE") totalBuy += lots;
      else if (tx.asset_link_type === "ASSET_SALE") totalSell += lots;
    });
    const current = item?.position_lots ?? 0;
    const startQty = current - totalBuy + totalSell;
    let balance = startQty;
    return sorted.map((tx) => {
      const lots = tx.primary_quantity_lots ?? 0;
      const isBuy = tx.asset_link_type === "ASSET_PURCHASE";
      const delta = isBuy ? lots : -lots;
      balance += delta;
      return { tx, type: isBuy ? "Покупка" as const : "Продажа" as const, delta, balanceAfter: balance };
    });
  }, [quantityHistoryTx, item?.open_date, item?.position_lots]);

  const quantitySummary = useMemo(() => {
    const openDate = item?.open_date ?? "";
    const fromOpen = openDate
      ? quantityHistoryTx.filter((tx) => (tx.transaction_date || "").slice(0, 10) >= openDate)
      : quantityHistoryTx;
    let totalBuy = 0;
    let totalSell = 0;
    fromOpen.forEach((tx) => {
      const lots = tx.primary_quantity_lots ?? 0;
      if (tx.asset_link_type === "ASSET_PURCHASE") totalBuy += lots;
      else if (tx.asset_link_type === "ASSET_SALE") totalSell += lots;
    });
    const current = item?.position_lots ?? 0;
    const startQty = current - totalBuy + totalSell;
    return { startQty, totalBuy, totalSell, current };
  }, [quantityHistoryTx, item?.open_date, item?.position_lots]);

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
      <main className="min-h-screen px-8 py-8">
        <div className="mx-auto w-full max-w-6xl" style={{ color: PLACEHOLDER_COLOR_DARK }}>Загрузка...</div>
      </main>
    );
  }

  if (error && !item) {
    return (
      <main className="min-h-screen px-8 py-8">
        <div className="mx-auto w-full max-w-6xl">
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
      <main className="min-h-screen px-8 py-8">
        <div className="mx-auto w-full max-w-6xl">
          <p style={{ color: PLACEHOLDER_COLOR_DARK }}>Актив не найден.</p>
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
    <main className="min-h-screen px-8 py-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="flex flex-wrap items-center gap-2 -ml-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/assets" className="flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              К активам и обязательствам
            </Link>
          </Button>
          {item.instrument_id && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBuySellModalOpen(true)}
              className="flex items-center gap-2"
            >
              <TrendingUp className="h-4 w-4" />
              Купить/продать актив
            </Button>
          )}
        </div>

        <div className="relative rounded-lg overflow-hidden border-0 outline-none" style={{ backgroundColor: MODAL_BG }}>
          <div className="p-6">
            <div className="flex flex-row items-start gap-4">
              <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0" style={{ backgroundColor: BACKGROUND_DT }}>
                {photoUrl ? (
                  <img src={photoUrl} alt="" className="w-full h-full object-cover" />
                ) : TypeIcon ? (
                  <div className="w-full h-full flex items-center justify-center" style={{ color: ACCENT }}>
                    <TypeIcon className="w-8 h-8" strokeWidth={1.5} />
                  </div>
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-semibold" style={{ color: ACTIVE_TEXT_DARK }}>{item.name}</h2>
                <p className="text-sm mt-1" style={{ color: PLACEHOLDER_COLOR_DARK }}>{getItemTypeLabel(item)}</p>
                {item.currency_code && (
                  <p className="text-sm" style={{ color: PLACEHOLDER_COLOR_DARK }}>{item.currency_code}</p>
                )}
              </div>
            </div>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm mt-4">
              {item.open_date && (
                <>
                  <dt style={{ color: PLACEHOLDER_COLOR_DARK }}>Дата появления</dt>
                  <dd style={{ color: ACTIVE_TEXT_DARK }}>{item.open_date}</dd>
                </>
              )}
              {item.contract_number && (
                <>
                  <dt style={{ color: PLACEHOLDER_COLOR_DARK }}>Номер договора</dt>
                  <dd style={{ color: ACTIVE_TEXT_DARK }}>{item.contract_number}</dd>
                </>
              )}
              {item.account_last7 && (
                <>
                  <dt style={{ color: PLACEHOLDER_COLOR_DARK }}>Последние 4 цифры счёта</dt>
                  <dd style={{ color: ACTIVE_TEXT_DARK }}>****{item.account_last7}</dd>
                </>
              )}
              {item.deposit_term_days != null && (
                <>
                  <dt style={{ color: PLACEHOLDER_COLOR_DARK }}>Срок вклада, дней</dt>
                  <dd style={{ color: ACTIVE_TEXT_DARK }}>{item.deposit_term_days}</dd>
                </>
              )}
              {item.interest_rate != null && (
                <>
                  <dt style={{ color: PLACEHOLDER_COLOR_DARK }}>Процентная ставка</dt>
                  <dd style={{ color: ACTIVE_TEXT_DARK }}>{item.interest_rate}%</dd>
                </>
              )}
              {item.position_lots != null && (
                <>
                  <dt style={{ color: PLACEHOLDER_COLOR_DARK }}>Количество лотов</dt>
                  <dd style={{ color: ACTIVE_TEXT_DARK }}>{new Intl.NumberFormat("ru-RU").format(item.position_lots)}</dd>
                </>
              )}
            </dl>
          </div>
        </div>

        <div className="relative rounded-lg overflow-hidden border-0 outline-none" style={{ backgroundColor: MODAL_BG }}>
          <div className="p-6">
            <h3 className="text-base font-semibold mb-4" style={{ color: ACTIVE_TEXT_DARK }}>Стоимости</h3>
            <div className="mt-2 mb-4">
              <SelectField
                label="Основная стоимость"
                value={item.primary_value_kind ?? "BALANCE"}
                onValueChange={(v) => handlePrimaryValueKindChange(v as PrimaryValueKind)}
                options={PRIMARY_VALUE_KIND_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                placeholder="Выберите"
                disabled={savingPrimary}
              />
            </div>
            {costs && (
              <div className="grid grid-cols-2 gap-4">
                <div
                  className="rounded-lg p-4 cursor-pointer transition-colors hover:opacity-90"
                  style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
                  onClick={() => setCostHistoryOpen((v) => (v === "balance" ? null : "balance"))}
                >
                  <div className="text-xs mb-1" style={{ color: PLACEHOLDER_COLOR_DARK }}>Балансовая стоимость</div>
                  <div className="text-lg font-semibold" style={{ color: ACTIVE_TEXT_DARK }}>
                    {formatRub(costs.balance_rub)}
                  </div>
                </div>
                <div
                  className="rounded-lg p-4 cursor-pointer transition-colors hover:opacity-90"
                  style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
                  onClick={() => setCostHistoryOpen((v) => (v === "acquisition" ? null : "acquisition"))}
                >
                  <div className="text-xs mb-1" style={{ color: PLACEHOLDER_COLOR_DARK }}>Стоимость приобретения</div>
                  <div className="text-lg font-semibold" style={{ color: ACTIVE_TEXT_DARK }}>
                    {formatRub(costs.acquisition_rub)}
                  </div>
                </div>
                <div
                  className="rounded-lg p-4 cursor-pointer transition-colors hover:opacity-90"
                  style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
                  onClick={() => setCostHistoryOpen((v) => (v === "invested" ? null : "invested"))}
                >
                  <div className="text-xs mb-1" style={{ color: PLACEHOLDER_COLOR_DARK }}>Стоимость вложенных средств</div>
                  <div className="text-lg font-semibold" style={{ color: ACTIVE_TEXT_DARK }}>
                    {formatRub(costs.invested_rub)}
                  </div>
                </div>
                <div
                  className="rounded-lg p-4 cursor-pointer transition-colors hover:opacity-90"
                  style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
                  onClick={() => setCostHistoryOpen((v) => (v === "market" ? null : "market"))}
                >
                  <div className="text-xs mb-1" style={{ color: PLACEHOLDER_COLOR_DARK }}>Рыночная стоимость</div>
                  <div className="text-lg font-semibold" style={{ color: ACTIVE_TEXT_DARK }}>
                    {costs.market_rub != null ? formatRub(costs.market_rub) : "—"}
                  </div>
                </div>
              </div>
            )}

            {costHistoryOpen === "market" && (
              <div className="mt-4 rounded-lg p-4" style={{ backgroundColor: BACKGROUND_DT }}>
                <div className="text-sm font-medium mb-2" style={{ color: ACTIVE_TEXT_DARK }}>История ручной рыночной стоимости</div>
                {marketValues.length === 0 ? (
                  <p className="text-sm" style={{ color: PLACEHOLDER_COLOR_DARK }}>Нет записей.</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {[...marketValues].sort((a, b) => b.value_date.localeCompare(a.value_date)).map((mv) => (
                      <li key={mv.id} className="flex justify-between" style={{ color: ACTIVE_TEXT_DARK }}>
                        <span>{mv.value_date}</span>
                        <span>{formatRub(mv.value_rub)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {(costHistoryOpen === "balance" || costHistoryOpen === "acquisition" || costHistoryOpen === "invested") && (
              <div className="mt-4 rounded-lg p-4" style={{ backgroundColor: BACKGROUND_DT }}>
                <div className="text-sm font-medium mb-2" style={{ color: ACTIVE_TEXT_DARK }}>
                  {costHistoryOpen === "balance" && "История балансовой стоимости"}
                  {costHistoryOpen === "acquisition" && "История стоимости приобретения"}
                  {costHistoryOpen === "invested" && "История стоимости вложенных средств"}
                </div>
                <p className="text-sm" style={{ color: PLACEHOLDER_COLOR_DARK }}>
                  Детализация по транзакциям будет доступна в следующей версии.
                </p>
              </div>
            )}
          </div>
        </div>

        {item.instrument_id && (
          <div className="relative rounded-lg overflow-hidden border-0 outline-none" style={{ backgroundColor: MODAL_BG }}>
            <div className="p-6">
              <h3 className="text-base font-semibold mb-4" style={{ color: ACTIVE_TEXT_DARK }}>История операций по количеству</h3>
              {loadingQuantityHistory ? (
                <p className="text-sm" style={{ color: PLACEHOLDER_COLOR_DARK }}>Загрузка...</p>
              ) : (
                <>
                  <div className="rounded-lg overflow-hidden">
                    <table className="w-full text-left border-collapse text-sm">
                      <thead>
                        <tr style={{ color: PLACEHOLDER_COLOR_DARK, backgroundColor: BACKGROUND_DT }}>
                          <th className="pl-6 pr-4 py-3 text-sm font-medium">Дата</th>
                          <th className="px-4 py-3 text-sm font-medium">Тип операции</th>
                          <th className="px-4 py-3 text-sm font-medium text-right">Куплено / продано</th>
                          <th className="px-6 py-3 text-sm font-medium text-right">Количество после операции</th>
                        </tr>
                      </thead>
                      <tbody>
                        {quantityHistoryRows.length === 0 ? (
                          <tr style={{ backgroundColor: MODAL_BG }}>
                            <td colSpan={4} className="px-6 py-4 text-center text-sm" style={{ color: PLACEHOLDER_COLOR_DARK }}>Нет операций покупки и продажи</td>
                          </tr>
                        ) : (
                          quantityHistoryRows.map(({ tx, type, delta, balanceAfter }) => {
                            const dateStr = tx.transaction_date ? new Date(tx.transaction_date.replace("T", " ")).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";
                            const amountColor = type === "Покупка" ? GREEN : RED;
                            return (
                              <tr key={tx.id} className="border-t border-white/10" style={{ backgroundColor: MODAL_BG }}>
                                <td className="pl-6 pr-4 py-2 text-sm" style={{ color: ACTIVE_TEXT_DARK }}>{dateStr}</td>
                                <td className="px-4 py-2 text-sm" style={{ color: amountColor }}>{type}</td>
                                <td className="px-4 py-2 text-sm text-right tabular-nums" style={{ color: amountColor }}>{delta > 0 ? `+${delta}` : delta}</td>
                                <td className="px-6 py-2 text-sm text-right tabular-nums" style={{ color: ACTIVE_TEXT_DARK }}>{new Intl.NumberFormat("ru-RU").format(balanceAfter)}</td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex flex-wrap gap-4 mt-4">
                    {(() => {
                      const SummaryBlock = ({ title, value }: { title: string; value: number }) => (
                        <div className="flex flex-1 min-w-[120px] flex-col gap-1.5 rounded-lg px-3 py-2" style={{ backgroundColor: "rgba(255,255,255,0.06)" }}>
                          <div className="text-xs text-center" style={{ color: PLACEHOLDER_COLOR_DARK }}>{title}</div>
                          <div className="rounded-md px-2 py-1 flex justify-center text-sm tabular-nums" style={{ backgroundColor: BACKGROUND_DT, color: ACTIVE_TEXT_DARK }}>
                            {new Intl.NumberFormat("ru-RU").format(value)}
                          </div>
                        </div>
                      );
                      return (
                        <>
                          <SummaryBlock title="Количество на начало" value={quantitySummary.startQty} />
                          <SummaryBlock title="Всего куплено" value={quantitySummary.totalBuy} />
                          <SummaryBlock title="Всего продано" value={quantitySummary.totalSell} />
                          <SummaryBlock title="Количество на текущую дату" value={quantitySummary.current} />
                        </>
                      );
                    })()}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {item.instrument_id && (
          <BuySellAssetModal
            open={buySellModalOpen}
            onOpenChange={setBuySellModalOpen}
            asset={item}
            items={allItems}
            getCounterpartyForItemId={getCounterpartyForItemId}
            getBankLogoUrl={itemCounterpartyLogoUrl}
            getBankName={itemCounterpartyName}
            getItemBalance={getItemPrimaryValueCents}
            onSuccess={load}
          />
        )}
      </div>
    </main>
  );
}
