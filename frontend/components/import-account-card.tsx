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
import { SegmentedSelector } from "@/components/ui/segmented-selector";
import { Switch } from "@/components/ui/switch";
import { TextField, SelectField } from "@/components/ui/form-field";
import { ItemSelector } from "@/components/item-selector";
import { CounterpartySelector } from "@/components/counterparty-selector";
import { getItemTypeLabel } from "@/lib/item-types";
import { getTypeOptionsForKind } from "@/lib/item-type-options";
import { formatRubInput, normalizeRubOnBlur, parseRubToCents } from "@/lib/format-rub";
import type { DzenParsedAccount, DzenParsedTransaction } from "@/lib/dzen-csv-parser";
import type { ItemOut, CounterpartyOut, CounterpartyIndustryOut, ItemKind } from "@/lib/api";

const NAME_BLOCK_WIDTH = 150;
const TOGGLES_BLOCK_WIDTH = 80;

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

export type ImportAccountCardState = {
  linkEnabled: boolean;
  kind: ItemKind;
  typeCode: string;
  name: string;
  balanceStr: string;
  linkedItemId: number | null;
  counterpartyId: number | null;
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

  const displayName = state.name || account.name;

  const balancePlaceholder =
    statementLastTransactionDate
      ? `Остаток на ${formatShortDate(statementLastTransactionDate)}`
      : "Укажите сумму";

  return (
    <div
      className="flex flex-row items-center rounded-[10px] overflow-hidden"
      style={{ backgroundColor: BACKGROUND_DT }}
    >
      {/* Подсветка */}
      <div
        className="w-[10px] shrink-0 self-stretch"
        style={{ backgroundColor: stripeColor }}
      />

      {/* Контент: название | туггл Связать | блок с полями */}
      <div className="flex flex-row items-center flex-1 min-w-0 gap-3 py-6 pr-6 pl-0">
        {/* 1. Блок с названием и шильдиком валюты — 150px, по центру, перенос */}
        <div
          className="flex flex-col items-center justify-center shrink-0 gap-0.5 text-center"
          style={{ width: NAME_BLOCK_WIDTH }}
        >
          <span
            className="text-base font-normal leading-[18px] break-words w-full"
            style={{ color: ACTIVE_TEXT_DARK }}
          >
            {account.name}
          </span>
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase w-fit ${
              getCurrencyBadgeClass(account.currency)
            }`}
          >
            {account.currency}
          </span>
        </div>

        {/* 2. Туггл Связать — 80px */}
        <div
          className="flex flex-col items-center justify-center gap-1.5 shrink-0"
          style={{ width: TOGGLES_BLOCK_WIDTH, color: PLACEHOLDER_COLOR_DARK }}
        >
          <span className="text-[14px] font-normal leading-4">Связать</span>
          <Switch
            checked={state.linkEnabled}
            onCheckedChange={(v) => update({ linkEnabled: v })}
            className="h-[26px] w-[46px]"
          />
        </div>

        {/* 3. Блок с полями — оставшаяся ширина, 2 столбца поровну */}
        <div className="flex-1 min-w-0 flex flex-col">
            {state.linkEnabled ? (
              <ItemSelector
                items={items}
                selectedIds={state.linkedItemId ? [state.linkedItemId] : []}
                onChange={(ids) => update({ linkedItemId: ids[0] ?? null })}
                selectionMode="single"
                placeholder="Начните вводить название актива/обязательства"
                getItemTypeLabel={getItemTypeLabel}
              />
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
                    {/* Строка 1: Актив/Обязательство | Банк/Контрагент (наверху) или Остаток */}
                    <div className="min-w-0">
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
                    <div className="min-w-0">
                      {showCounterpartyField ? (
                        <CounterpartySelector
                          counterparties={counterparties}
                          selectedIds={state.counterpartyId ? [state.counterpartyId] : []}
                          onChange={(ids) =>
                            update({ counterpartyId: ids[0] ?? null })
                          }
                          selectionMode="single"
                          placeholder={
                            isBankType
                              ? "Начните вводить название банка"
                              : "Начните вводить название"
                          }
                          industries={industries}
                          apiBase={apiBase}
                          filterByIndustryId={
                            isBankType ? bankIndustryId ?? null : null
                          }
                          showChips={false}
                        />
                      ) : (
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
                      )}
                    </div>
                    {/* Строка 2: Вид | Остаток (если показан контрагент) */}
                    <div className="min-w-0">
                      <SelectField
                        value={effectiveType}
                        onValueChange={(v) => update({ typeCode: v })}
                        options={typeOptions.map((t) => ({
                          value: t.code,
                          label: t.label,
                        }))}
                        placeholder="Выберите вид"
                      />
                    </div>
                    <div className="min-w-0">
                      {showCounterpartyField ? (
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
                      ) : null}
                    </div>
                    {/* Строка 3: Название | Сумма на дату и сумма в одну строку */}
                    <div className="min-w-0">
                      <TextField
                        value={displayName}
                        onChange={(e) => update({ name: e.target.value })}
                        placeholder="Например: Кошелек / Ипотека"
                      />
                    </div>
                    <div
                      className="min-w-0 flex flex-col justify-center"
                      style={{ color: ACTIVE_TEXT_DARK }}
                    >
                      <span
                        className="font-normal"
                        style={{ fontSize: 14, fontWeight: 400 }}
                      >
                        {(() => {
                          const displayDate = statementAccountingStartDate ?? earliestDate;
                          return displayDate
                            ? `Остаток на ${formatShortDate(displayDate)}: ${formatAmount(initial)}`
                            : `Начальная сумма: ${formatAmount(initial)}`;
                        })()}
                      </span>
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
