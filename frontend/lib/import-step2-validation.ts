/**
 * Валидация шага 2 импорта: обязательные поля и проверка отрицательного остатка.
 */

import { parseRubToCents } from "@/lib/format-rub";
import { getTypeOptionsForKind } from "@/lib/item-type-options";
import type { DzenParsedAccount, DzenParsedTransaction } from "@/lib/dzen-csv-parser";
import type { ImportAccountCardState } from "@/components/import-account-card";

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

function calcInitial(
  account: DzenParsedAccount,
  transactions: DzenParsedTransaction[],
  currentBalance: number
): number {
  let incomeSum = 0;
  let outcomeSum = 0;
  for (const tx of transactions) {
    const isOut =
      tx.outcomeAccountName === account.name &&
      tx.outcomeCurrency === account.currency;
    const isIn =
      tx.incomeAccountName === account.name &&
      tx.incomeCurrency === account.currency;
    if (isOut && tx.outcome != null) outcomeSum += tx.outcome;
    if (isIn && tx.income != null) incomeSum += tx.income;
  }
  return currentBalance - incomeSum + outcomeSum;
}

/** События по счёту с датой для сортировки */
type AccountTxEvent = {
  date: string;
  delta: number; // положительное = приход, отрицательное = расход
};

function getAccountTxEvents(
  account: DzenParsedAccount,
  transactions: DzenParsedTransaction[]
): AccountTxEvent[] {
  const events: AccountTxEvent[] = [];
  for (const tx of transactions) {
    const isOut =
      tx.outcomeAccountName === account.name &&
      tx.outcomeCurrency === account.currency;
    const isIn =
      tx.incomeAccountName === account.name &&
      tx.incomeCurrency === account.currency;
    if (isOut && tx.outcome != null) {
      events.push({ date: tx.date, delta: -tx.outcome });
    }
    if (isIn && tx.income != null) {
      events.push({ date: tx.date, delta: tx.income });
    }
  }
  events.sort((a, b) => a.date.localeCompare(b.date));
  return events;
}

/**
 * Проверяет, что баланс по счёту (активу) никогда не уходит в минус
 * при заданной текущей сумме и всех транзакциях.
 */
function checkBalanceNeverNegative(
  account: DzenParsedAccount,
  transactions: DzenParsedTransaction[],
  currentBalance: number
): boolean {
  const initial = calcInitial(account, transactions, currentBalance);
  const events = getAccountTxEvents(account, transactions);
  let balance = initial;
  for (const e of events) {
    balance += e.delta;
    if (balance < 0) return false;
  }
  return true;
}

export type Step2ValidationResult =
  | { valid: true }
  | { valid: false; error: string };

export function validateStep2(
  accounts: DzenParsedAccount[],
  transactions: DzenParsedTransaction[],
  accountCardStates: Map<string, ImportAccountCardState>
): Step2ValidationResult {
  for (const account of accounts) {
    const key = `${account.name}|${account.currency}`;
    const state = accountCardStates.get(key);
    if (!state) continue;

    if (state.linkEnabled) {
      if (state.linkedItemId == null) {
        return {
          valid: false,
          error: `Для счёта «${account.name}» выберите актив/обязательство для связи.`,
        };
      }
      continue;
    }

    // Режим создания нового: проверяем обязательные поля
    const typeOptions = getTypeOptionsForKind(state.kind);
    const effectiveType =
      state.typeCode && typeOptions.some((o) => o.code === state.typeCode)
        ? state.typeCode
        : typeOptions[0]?.code ?? "";

    if (!effectiveType) {
      return {
        valid: false,
        error: `Для счёта «${account.name}» укажите вид актива/обязательства.`,
      };
    }

    if (
      MANDATORY_COUNTERPARTY_TYPE_CODES.has(effectiveType) &&
      !state.counterpartyId
    ) {
      return {
        valid: false,
        error: `Для счёта «${account.name}» выберите банк/контрагента.`,
      };
    }

    const displayName = (state.name || account.name).trim();
    if (!displayName) {
      return {
        valid: false,
        error: `Для счёта «${account.name}» укажите название.`,
      };
    }

    const balanceCents = parseRubToCents(state.balanceStr);
    if (!Number.isFinite(balanceCents)) {
      return {
        valid: false,
        error: `Для счёта «${account.name}» укажите остаток.`,
      };
    }

    const currentBalance = balanceCents / 100;

    // Для активов проверяем, что баланс никогда не уходит в минус
    if (state.kind === "ASSET") {
      const ok = checkBalanceNeverNegative(
        account,
        transactions,
        currentBalance
      );
      if (!ok) {
        return {
          valid: false,
          error: `По счёту «${account.name}» при указанном остатке и транзакциях в какой-то момент возникает отрицательный баланс. Проверьте остаток или транзакции.`,
        };
      }
    }
  }

  return { valid: true };
}
