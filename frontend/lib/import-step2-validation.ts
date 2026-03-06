/**
 * Валидация шага 2 импорта: обязательные поля и проверка отрицательного остатка.
 */

import { parseRubToCents } from "@/lib/format-rub";
import { getTypeOptionsForKind, normalizeDisplayTypeCode } from "@/lib/item-type-options";
import { MANDATORY_COUNTERPARTY_TYPE_CODES as MANDATORY_CP_CODES } from "@/lib/asset-item-form-constants";
import {
  type DzenParsedAccount,
  type DzenParsedTransaction,
  getTransactionDateTimeSortKey,
} from "@/lib/dzen-csv-parser";
import type { ImportAccountCardState } from "@/components/import-account-card";

const MANDATORY_COUNTERPARTY_TYPE_CODES = new Set(MANDATORY_CP_CODES);

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

/** События по счёту с датой и временем для хронологической сортировки */
type AccountTxEvent = {
  date: string;
  dateTimeSortKey: string;
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
    const key = getTransactionDateTimeSortKey(tx);
    if (isOut && tx.outcome != null) {
      events.push({ date: tx.date, dateTimeSortKey: key, delta: -tx.outcome });
    }
    if (isIn && tx.income != null) {
      events.push({ date: tx.date, dateTimeSortKey: key, delta: tx.income });
    }
  }
  events.sort((a, b) => a.dateTimeSortKey.localeCompare(b.dateTimeSortKey));
  return events;
}

/** Результат проверки сальдо: либо ок, либо дата, сумма и разбивка по дням */
type BalanceCheckResult =
  | { ok: true }
  | { ok: false; date: string; balance: number; breakdown: string[] };

function formatDelta(value: number): string {
  const formatted = new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
    .format(Math.abs(value))
    .replace(".", ",");
  return value >= 0 ? `+${formatted}` : `-${formatted}`;
}

/** Порог (в рублях): сальдо считаем допустимым, если не ниже -epsilon (погрешность округления). */
const NEGATIVE_BALANCE_EPSILON = 0.01;

/**
 * Проверяет, что баланс по счёту не уходит в минус на конец каждого дня.
 * Внутри дня транзакции могут идти в любом порядке, проверка только по итогу дня.
 * Сальдо в пределах [-epsilon, 0] (например -0,00 из-за float) считается нулём и допускается.
 * При отрицательном сальдо возвращает разбивку: начальное сальдо и дельты по дням до минуса.
 */
function checkBalanceNeverNegative(
  account: DzenParsedAccount,
  transactions: DzenParsedTransaction[],
  currentBalance: number
): BalanceCheckResult {
  const initial = calcInitial(account, transactions, currentBalance);
  const events = getAccountTxEvents(account, transactions);
  const breakdown: string[] = [];
  breakdown.push(`Начальное сальдо: ${formatBalanceForError(initial)}`);

  let balance = initial;
  let prevDate: string | null = null;
  let dayDelta = 0;

  const isNegative = (b: number) => b < -NEGATIVE_BALANCE_EPSILON;

  const flushDay = (date: string) => {
    if (date) {
      breakdown.push(
        `${formatDateForError(date)}: ${formatDelta(dayDelta)} → ${formatBalanceForError(balance)}`
      );
    }
  };

  for (const e of events) {
    if (e.date !== prevDate && prevDate != null) {
      flushDay(prevDate);
      if (isNegative(balance)) return { ok: false, date: prevDate, balance, breakdown };
      dayDelta = 0;
    }
    balance += e.delta;
    dayDelta += e.delta;
    prevDate = e.date;
  }

  if (prevDate != null) flushDay(prevDate);
  if (isNegative(balance)) {
    const date = prevDate ?? "";
    return { ok: false, date, balance, breakdown };
  }
  return { ok: true };
}

function formatDateForError(dateKey: string): string {
  if (!dateKey) return "на конец периода";
  const [y, m, d] = dateKey.split("-").map(Number);
  if (!y || !m || !d) return dateKey;
  return `${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.${y}`;
}

function formatBalanceForError(value: number): string {
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
    .format(value)
    .replace(".", ",");
}

export type Step2ValidationResult =
  | { valid: true }
  | { valid: false; error: string };

/**
 * Возвращает сообщение об ошибке валидации для одного счёта или null, если проверки пройдены.
 * Используется для отображения статуса валидации в карточке счёта на шаге «Счета».
 */
export function getAccountValidationError(
  account: DzenParsedAccount,
  transactions: DzenParsedTransaction[],
  state: ImportAccountCardState
): string | null {
  if (state.linkEnabled) {
    if (state.linkedItemId == null) {
      return `Для счёта «${account.name}» выберите актив/обязательство для связи.`;
    }
    return null;
  }

  const typeOptions = getTypeOptionsForKind(state.kind);
  const displayType = normalizeDisplayTypeCode(state.typeCode || "", state.kind);
  const effectiveType =
    displayType && typeOptions.some((o) => o.code === displayType)
      ? displayType
      : (state.typeCode && typeOptions.some((o) => o.code === state.typeCode)
          ? state.typeCode
          : typeOptions[0]?.code ?? "");

  if (!effectiveType) {
    return `Для счёта «${account.name}» укажите вид актива/обязательства.`;
  }

  if (
    MANDATORY_COUNTERPARTY_TYPE_CODES.has(effectiveType) &&
    !state.counterpartyId
  ) {
    return 'Заполните поле «Банк, в котором открыт счет»';
  }

  const displayName = (state.name || account.name).trim();
  if (!displayName) {
    return `Для счёта «${account.name}» укажите название.`;
  }

  // Сначала проверяем, что поле заполнено; только потом проверка отрицательного сальдо
  const balanceStrTrimmed = (state.balanceStr ?? "").trim();
  if (!balanceStrTrimmed) {
    return 'Заполните поле «Текущий остаток»';
  }
  const balanceCents = parseRubToCents(state.balanceStr);
  if (!Number.isFinite(balanceCents)) {
    return 'Заполните поле «Текущий остаток»';
  }

  const currentBalance = balanceCents / 100;

  if (state.kind === "ASSET") {
    const result = checkBalanceNeverNegative(
      account,
      transactions,
      currentBalance
    );
    if (!result.ok) {
      const dateStr = formatDateForError(result.date);
      const balanceStr = formatBalanceForError(result.balance);
      const breakdownText = result.breakdown.join("\n");
      return `По счёту «${account.name}» при указанном остатке и транзакциях формируется отрицательное сальдо: ${balanceStr} на ${dateStr}. Проверьте остаток или транзакции.\n\nРасчёт по дням:\n${breakdownText}`;
    }
  }

  return null;
}

export function validateStep2(
  accounts: DzenParsedAccount[],
  transactions: DzenParsedTransaction[],
  accountCardStates: Map<string, ImportAccountCardState>
): Step2ValidationResult {
  for (const account of accounts) {
    const key = `${account.name}|${account.currency}`;
    const state = accountCardStates.get(key);
    if (!state) continue;

    const error = getAccountValidationError(account, transactions, state);
    if (error) return { valid: false, error };
  }

  return { valid: true };
}
