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

/** Начальное сальдо в копейках. Все суммы в транзакциях — в копейках. */
function calcInitial(
  account: DzenParsedAccount,
  transactions: DzenParsedTransaction[],
  currentBalanceCents: number
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
  return currentBalanceCents - incomeSum + outcomeSum;
}

/** События по счёту с датой и временем для хронологической сортировки. delta в копейках. */
type AccountTxEvent = {
  date: string;
  dateTimeSortKey: string;
  delta: number;
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

/** Результат проверки сальдо: либо ок, либо дата, сумма (копейки) и разбивка по дням */
type BalanceCheckResult =
  | { ok: true }
  | { ok: false; date: string; balance: number; breakdown: string[] };

/** Форматирует дельту в копейках для отображения в рублях */
function formatDelta(valueCents: number): string {
  const rub = valueCents / 100;
  const formatted = new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
    .format(Math.abs(rub))
    .replace(".", ",");
  return valueCents >= 0 ? `+${formatted}` : `-${formatted}`;
}

/** Порог в копейках: сальдо считаем допустимым, если не ниже -epsilon (погрешность округления). */
const NEGATIVE_BALANCE_EPSILON_CENTS = 1;

/**
 * Проверяет, что баланс по счёту не уходит в минус на конец каждого дня.
 * Все суммы в копейках. Сальдо в пределах [-1, 0] коп. считается нулём и допускается.
 */
function checkBalanceNeverNegative(
  account: DzenParsedAccount,
  transactions: DzenParsedTransaction[],
  currentBalanceCents: number
): BalanceCheckResult {
  const initial = calcInitial(account, transactions, currentBalanceCents);
  const events = getAccountTxEvents(account, transactions);
  const breakdown: string[] = [];
  breakdown.push(`Начальное сальдо: ${formatBalanceForError(initial)}`);

  let balance = initial;
  let prevDate: string | null = null;
  let dayDelta = 0;

  const isNegative = (b: number) => b < -NEGATIVE_BALANCE_EPSILON_CENTS;

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

/** Форматирует сумму в копейках для отображения в рублях (нормализация околонулевых). */
function formatBalanceForError(valueCents: number): string {
  const normalized =
    Math.abs(valueCents) <= NEGATIVE_BALANCE_EPSILON_CENTS ? 0 : valueCents / 100;
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
    .format(normalized)
    .replace(".", ",");
}

/** Все балансы в копейках (целые числа). */
export type AccountBalanceStats = {
  earliestDate: string | null;
  balanceAtEarliestDate: number | null;
  latestDate: string | null;
  balanceAtLatestDate: number | null;
  minBalance: number | null;
  maxBalance: number | null;
};

/**
 * Считает по счёту: сальдо на дату самой ранней и самой поздней транзакции, мин и макс сальдо.
 * Все суммы в копейках. Если по счёту нет транзакций, все поля null.
 */
export function getAccountBalanceStats(
  account: DzenParsedAccount,
  transactions: DzenParsedTransaction[],
  currentBalanceCents: number
): AccountBalanceStats {
  const events = getAccountTxEvents(account, transactions);
  if (events.length === 0) {
    return {
      earliestDate: null,
      balanceAtEarliestDate: null,
      latestDate: null,
      balanceAtLatestDate: null,
      minBalance: null,
      maxBalance: null,
    };
  }
  const initial = calcInitial(account, transactions, currentBalanceCents);
  let balance = initial;
  let minB: number = Infinity;
  let maxB: number = -Infinity;
  let balanceAtEarliestDate: number | null = null;
  const earliestDate: string = events[0]!.date;
  let balanceAtLatestDate: number = balance;
  let latestDate: string = events[0]!.date;

  let prevDate: string | null = null;
  for (const e of events) {
    if (prevDate !== null && e.date !== prevDate) {
      if (balanceAtEarliestDate === null) balanceAtEarliestDate = balance;
      balanceAtLatestDate = balance;
      latestDate = prevDate;
      minB = Math.min(minB, balance);
      maxB = Math.max(maxB, balance);
    }
    balance += e.delta;
    prevDate = e.date;
  }
  balanceAtLatestDate = balance;
  latestDate = prevDate ?? latestDate;
  if (balanceAtEarliestDate === null) balanceAtEarliestDate = balance;
  minB = Math.min(minB, balance);
  maxB = Math.max(maxB, balance);

  const norm = (b: number) =>
    Math.abs(b) <= NEGATIVE_BALANCE_EPSILON_CENTS ? 0 : b;
  return {
    earliestDate,
    balanceAtEarliestDate: balanceAtEarliestDate != null ? norm(balanceAtEarliestDate) : null,
    latestDate,
    balanceAtLatestDate: norm(balanceAtLatestDate),
    minBalance: Number.isFinite(minB) ? norm(minB) : null,
    maxBalance: Number.isFinite(maxB) ? norm(maxB) : null,
  };
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

  return null;
}

/**
 * Возвращает предупреждение для одного счёта, если в течение периода по нему возникает отрицательное сальдо.
 * Не блокирует импорт — только информирует.
 */
export function getAccountValidationWarning(
  account: DzenParsedAccount,
  transactions: DzenParsedTransaction[],
  state: ImportAccountCardState
): string | null {
  if (state.linkEnabled) return null;
  const balanceStrTrimmed = (state.balanceStr ?? "").trim();
  if (!balanceStrTrimmed) return null;
  const balanceCents = parseRubToCents(state.balanceStr);
  if (!Number.isFinite(balanceCents)) return null;
  if (state.kind !== "ASSET") return null;

  const result = checkBalanceNeverNegative(
    account,
    transactions,
    balanceCents
  );
  if (!result.ok) {
    return "В течение действия актива есть моменты, когда у него появляется отрицательное сальдо.";
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
