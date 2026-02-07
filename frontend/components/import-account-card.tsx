"use client";

import * as React from "react";
import {
  ACCENT,
  ACCENT_FILL_LIGHT,
  ACTIVE_TEXT_DARK,
  BACKGROUND_DT,
  GREEN_TRANSACTION,
  PLACEHOLDER_COLOR_DARK,
  RED,
} from "@/lib/colors";
import { Pencil, PencilOff, Link, Unlink } from "lucide-react";
import { SegmentedSelector } from "@/components/ui/segmented-selector";
import { TextField, SelectField } from "@/components/ui/form-field";
import { IconButton } from "@/components/ui/icon-button";
import { ItemSelector } from "@/components/item-selector";
import { CounterpartySelector } from "@/components/counterparty-selector";
import { getItemTypeLabel } from "@/lib/item-types";
import { getTypeOptionsForKind } from "@/lib/item-type-options";
import { formatRubInput, normalizeRubOnBlur, parseRubToCents } from "@/lib/format-rub";
import type { DzenParsedAccount, DzenParsedTransaction } from "@/lib/dzen-csv-parser";
import type { ItemOut, CounterpartyOut, CounterpartyIndustryOut, ItemKind } from "@/lib/api";

const MANDATORY_COUNTERPARTY_TYPE_CODES = new Set([
  "bank_account",
  "bank_card",
  "deposit",
  "savings_account",
  "consumer_loan",
  "mortgage",
  "car_loan",
  "education_loan",
  "loan_to_third_party",
  "third_party_receivables",
  "private_loan",
  "third_party_payables",
]);

const CURRENCY_BADGE_CLASSES: Record<string, string> = {
  RUB: "bg-[#C46A2F]/20 text-[#C46A2F]",
  USD: "bg-[#2E7D32]/20 text-[#2E7D32]",
  EUR: "bg-[#003399]/20 text-[#003399]",
  JPY: "bg-[#BC002D]/20 text-[#BC002D]",
  CNY: "bg-[#DE2910]/20 text-[#DE2910]",
};

function getCurrencyBadgeClass(code: string) {
  return CURRENCY_BADGE_CLASSES[code] ?? "bg-muted/20 text-slate-600";
}

function formatShortDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return dateKey;
  return `${String(day).padStart(2, "0")}.${String(month).padStart(2, "0")}.${year}`;
}

function formatAmount(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
    .format(value)
    .replace(".", ",");
}

/** Рассчитать начальную сумму: current - income + outcome */
function calcInitialFromTransactions(
  account: DzenParsedAccount,
  transactions: DzenParsedTransaction[],
  currentBalance: number
): { initial: number; earliestDate: string | null } {
  let incomeSum = 0;
  let outcomeSum = 0;
  let earliestDate: string | null = null;

  for (const tx of transactions) {
    const isOutcome = tx.outcomeAccountName === account.name && tx.outcomeCurrency === account.currency;
    const isIncome = tx.incomeAccountName === account.name && tx.incomeCurrency === account.currency;

    if (isOutcome && tx.outcome != null) {
      outcomeSum += tx.outcome;
      if (!earliestDate || tx.date < earliestDate) earliestDate = tx.date;
    }
    if (isIncome && tx.income != null) {
      incomeSum += tx.income;
      if (!earliestDate || tx.date < earliestDate) earliestDate = tx.date;
    }
  }

  const initial = currentBalance - incomeSum + outcomeSum;
  return { initial, earliestDate };
}

const COMMON_CURRENCY_CODES = ["RUB", "USD", "EUR", "GBP", "CHF", "JPY", "CNY", "KZT", "UAH", "BYN", "GEL"];

export type ImportAccountCardState = {
  linkEnabled: boolean;
  kind: ItemKind;
  typeCode: string;
  name: string;
  balanceStr: string;
  linkedItemId: number | null;
  counterpartyId: number | null;
  /** Переопределённая валюта; при отсутствии используется account.currency */
  currency?: string;
};

const defaultState: ImportAccountCardState = {
  linkEnabled: false,
  kind: "ASSET",
  typeCode: "",
  name: "",
  balanceStr: "",
  linkedItemId: null,
  counterpartyId: null,
};

export type ImportAccountCardProps = {
  account: DzenParsedAccount;
  transactions: DzenParsedTransaction[];
  items: ItemOut[];
  state: ImportAccountCardState;
  onChange: (state: ImportAccountCardState) => void;
  apiBase: string;
  counterparties?: CounterpartyOut[];
  industries?: CounterpartyIndustryOut[];
  getCounterpartyForItemId?: (id: number) => CounterpartyOut | null;
  /** Дата начала учёта по выписке — одинаковая для всех карточек при импорте */
  statementAccountingStartDate?: string | null;
  /** Дата последней транзакции по выписке — для подписи поля остатка «Остаток на …» */
  statementLastTransactionDate?: string | null;
  /** When set, shows "Добавить" in bank/counterparty selector; on click calls this. */
  onAddCounterparty?: () => void;
};

export function ImportAccountCard({
  account,
  transactions,
  items,
  state,
  onChange,
  apiBase,
  counterparties = [],
  industries = [],
  getCounterpartyForItemId,
  statementAccountingStartDate,
  statementLastTransactionDate,
  onAddCounterparty,
}: ImportAccountCardProps) {
  const typeOptions = getTypeOptionsForKind(state.kind);
  const effectiveKind =
    state.linkEnabled && state.linkedItemId
      ? items.find((i) => i.id === state.linkedItemId)?.kind ?? state.kind
      : state.kind;
  const stripeColor = effectiveKind === "ASSET" ? GREEN_TRANSACTION : RED;

  const balanceCents = React.useMemo(() => {
    const parsed = parseRubToCents(state.balanceStr);
    return Number.isFinite(parsed) ? parsed : 0;
  }, [state.balanceStr]);

  const currentBalance = balanceCents / 100;
  const { initial, earliestDate } = React.useMemo(
    () => calcInitialFromTransactions(account, transactions, currentBalance),
    [account, transactions, currentBalance]
  );

  const update = (patch: Partial<ImportAccountCardState>) => {
    onChange({ ...state, ...patch });
  };

  const [isEditingName, setIsEditingName] = React.useState(false);
  const [isEditingCurrency, setIsEditingCurrency] = React.useState(false);

  const effectiveCurrency = state.currency ?? account.currency;
  const currencyOptions = React.useMemo(() => {
    const codes = [...COMMON_CURRENCY_CODES];
    if (effectiveCurrency && !codes.includes(effectiveCurrency)) {
      codes.unshift(effectiveCurrency);
    }
    return codes.map((code) => ({ value: code, label: code }));
  }, [effectiveCurrency]);

  const balancePlaceholder =
    statementLastTransactionDate
      ? `Остаток на ${formatShortDate(statementLastTransactionDate)}`
      : "Текущий остаток";

  return (
    <div
      className="flex flex-row items-stretch rounded-[10px] overflow-hidden"
      style={{ backgroundColor: BACKGROUND_DT }}
    >
      {/* Подсветка */}
      <div
        className="w-[10px] shrink-0 self-stretch"
        style={{ backgroundColor: stripeColor }}
      />

      {/* Контент: первая строка — название, валюта, кнопки; вторая — блок с полями */}
      <div className="flex flex-col flex-1 min-w-0 py-6 pr-6 pl-4 gap-4">
        {/* Первая строка: валюта (слева — из выписки) | название | link; pencil-off справа от поля */}
        <div className="flex flex-row items-center flex-wrap justify-center gap-2 min-w-0">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase shrink-0 ${
              getCurrencyBadgeClass(account.currency)
            }`}
          >
            {account.currency}
          </span>
          {!isEditingCurrency ? (
            <IconButton
              onClick={() => setIsEditingCurrency(true)}
              aria-label="Изменить валюту"
            >
              <Pencil className="h-4 w-4" />
            </IconButton>
          ) : (
            <>
              <div className="min-w-[100px] shrink-0">
                <SelectField
                  label=""
                  value={effectiveCurrency}
                  onValueChange={(v) => update({ currency: v })}
                  options={currencyOptions}
                  placeholder="Валюта"
                />
              </div>
              <IconButton
                onClick={() => setIsEditingCurrency(false)}
                aria-label="Закончить редактирование валюты"
              >
                <PencilOff className="h-4 w-4" />
              </IconButton>
            </>
          )}
          {!isEditingName ? (
            <>
              <span
                className="shrink-0"
                style={{ color: ACTIVE_TEXT_DARK, fontSize: 18, fontWeight: 400 }}
              >
                {state.name || account.name}
              </span>
              <IconButton
                onClick={() => setIsEditingName(true)}
                aria-label="Изменить название"
              >
                <Pencil className="h-4 w-4" />
              </IconButton>
            </>
          ) : (
            <>
              <div className="min-w-[200px] flex-1 max-w-md">
                <TextField
                  value={state.name}
                  onChange={(e) => update({ name: e.target.value })}
                  placeholder="Начните вводить название"
                  onBlur={() => setIsEditingName(false)}
                  autoFocus
                />
              </div>
              <IconButton
                onClick={() => setIsEditingName(false)}
                aria-label="Закончить редактирование названия"
              >
                <PencilOff className="h-4 w-4" />
              </IconButton>
            </>
          )}
          <IconButton
            onClick={() => update({ linkEnabled: !state.linkEnabled })}
            aria-label={state.linkEnabled ? "Выключить связь с активом" : "Связать с активом"}
          >
            {state.linkEnabled ? (
              <Unlink className="h-4 w-4" />
            ) : (
              <Link className="h-4 w-4" />
            )}
          </IconButton>
        </div>

        {/* Вторая строка: блок с полями */}
        <div className="flex flex-col min-w-0">
          {state.linkEnabled ? (
            <div className="flex flex-row items-center gap-2 w-full min-w-0">
              <span
                className="font-normal min-w-0 flex-1 break-words"
                style={{ color: ACTIVE_TEXT_DARK, fontSize: 14, fontWeight: 400 }}
              >
                Выберите имеющийся актив/обязательство, к которому будут привязаны транзакции по этому счету
              </span>
              <div className="w-[400px] shrink-0">
                <ItemSelector
                  items={items}
                  selectedIds={state.linkedItemId ? [state.linkedItemId] : []}
                  onChange={(ids) => update({ linkedItemId: ids[0] ?? null })}
                  selectionMode="single"
                  placeholder="Начните вводить название"
                  getItemTypeLabel={getItemTypeLabel}
                />
              </div>
            </div>
          ) : (
            (() => {
              const effectiveType =
                state.typeCode && typeOptions.some((o) => o.code === state.typeCode)
                  ? state.typeCode
                  : typeOptions[0]?.code ?? "";
              const showCounterpartyField =
                MANDATORY_COUNTERPARTY_TYPE_CODES.has(effectiveType);
              const bankIndustryId = industries.find(
                (ind) => ind.name === "Банки"
              )?.id;
              const isBankType =
                ["bank_account", "bank_card", "deposit", "savings_account"].includes(
                  effectiveType
                );

              return (
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 w-full">
                  {/* Строка 1: Тип счета | Банк */}
                  <div className="min-w-0 flex flex-row items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <span
                        className="font-normal break-words"
                        style={{ color: ACTIVE_TEXT_DARK, fontSize: 14, fontWeight: 400 }}
                      >
                        Тип счета
                      </span>
                    </div>
                    <div className="w-[300px] shrink-0">
                      <SegmentedSelector
                        options={[
                          { value: "ASSET", label: "Актив", colorScheme: "green" },
                          { value: "LIABILITY", label: "Обязательство", colorScheme: "red" },
                        ]}
                        value={state.kind}
                        onChange={(v) => {
                          update({
                            kind: v as ItemKind,
                            typeCode: "",
                          });
                        }}
                      />
                    </div>
                  </div>
                  <div className="min-w-0 flex flex-row items-center gap-2">
                    {showCounterpartyField ? (
                      <>
                        <div className="flex-1 min-w-0">
                          <span
                            className="font-normal break-words"
                            style={{ color: ACTIVE_TEXT_DARK, fontSize: 14, fontWeight: 400 }}
                          >
                            Банк, в котором открыт счет
                          </span>
                        </div>
                        <div className="w-[300px] shrink-0">
                          <CounterpartySelector
                            counterparties={counterparties}
                            selectedIds={state.counterpartyId ? [state.counterpartyId] : []}
                            onChange={(ids) =>
                              update({ counterpartyId: ids[0] ?? null })
                            }
                            selectionMode="single"
                            placeholder="Начните вводить название банка"
                            industries={industries}
                            apiBase={apiBase}
                            filterByIndustryId={
                              isBankType ? bankIndustryId ?? null : null
                            }
                            showChips={false}
                            onAddCounterparty={onAddCounterparty}
                          />
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex-1 min-w-0">
                          <span
                            className="font-normal break-words"
                            style={{ color: ACTIVE_TEXT_DARK, fontSize: 14, fontWeight: 400 }}
                          >
                            Текущий остаток
                          </span>
                        </div>
                        <div className="w-[300px] shrink-0">
                          <TextField
                            value={state.balanceStr}
                            onChange={(e) =>
                              update({ balanceStr: formatRubInput(e.target.value) })
                            }
                            onBlur={() =>
                              update({
                                balanceStr: normalizeRubOnBlur(state.balanceStr),
                              })
                            }
                            placeholder={balancePlaceholder}
                            inputMode="decimal"
                          />
                        </div>
                      </>
                    )}
                  </div>
                  {/* Строка 2: Вид счета | Текущий остаток */}
                  <div className="min-w-0 flex flex-row items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <span
                        className="font-normal break-words"
                        style={{ color: ACTIVE_TEXT_DARK, fontSize: 14, fontWeight: 400 }}
                      >
                        Вид счета
                      </span>
                    </div>
                    <div className="w-[300px] shrink-0">
                      <SelectField
                        value={effectiveType}
                        onValueChange={(v) => update({ typeCode: v })}
                        options={typeOptions.map((t) => ({
                          value: t.code,
                          label: t.label,
                        }))}
                        placeholder="Вид"
                      />
                    </div>
                  </div>
                  <div className="min-w-0 flex flex-row items-center gap-2">
                    {showCounterpartyField ? (
                      <>
                        <div className="flex-1 min-w-0">
                          <span
                            className="font-normal break-words"
                            style={{ color: ACTIVE_TEXT_DARK, fontSize: 14, fontWeight: 400 }}
                          >
                            Текущий остаток
                          </span>
                        </div>
                        <div className="w-[300px] shrink-0">
                          <TextField
                            value={state.balanceStr}
                            onChange={(e) =>
                              update({ balanceStr: formatRubInput(e.target.value) })
                            }
                            onBlur={() =>
                              update({
                                balanceStr: normalizeRubOnBlur(state.balanceStr),
                              })
                            }
                            placeholder="Текущий остаток"
                            inputMode="decimal"
                          />
                        </div>
                      </>
                    ) : null}
                  </div>
                </div>
              );
            })()
          )}
        </div>
      </div>
    </div>
  );
}

export function getInitialAccountCardState(
  account: DzenParsedAccount
): ImportAccountCardState {
  return {
    ...defaultState,
    name: account.name,
  };
}
