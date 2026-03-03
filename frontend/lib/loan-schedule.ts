/**
 * Построение графика погашения кредита (аннуитет / дифференцированный).
 * Логика совпадает с backend item_plan_service.
 */

import { parseDateKey, addDays, toDateKey } from "./asset-item-form-constants";

function daysInYear(d: Date): number {
  const y = d.getFullYear();
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 366 : 365;
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function roundCents(x: number): number {
  return Math.round(x);
}

/** Если дата попадает на субботу (6) или воскресенье (0), возвращает следующий понедельник. */
function shiftDateToWorkday(dateKey: string): string {
  const d = parseDateKey(dateKey);
  const w = d.getDay(); // 0=Sun, 6=Sat
  if (w >= 1 && w <= 5) return dateKey;
  const daysToMonday = w === 0 ? 1 : 2;
  return toDateKey(addDays(d, daysToMonday));
}

/** Проценты за период: с start по день перед end (дата платежа не включается в начисление). */
export function sumInterestCents(
  principalCents: number,
  rate: number,
  startKey: string,
  endKey: string
): number {
  if (principalCents <= 0 || rate <= 0) return 0;
  let start = parseDateKey(startKey);
  const end = parseDateKey(endKey);
  if (start > end) return 0;
  const endExclusive = addDays(end, -1);
  if (start > endExclusive) return 0;
  let total = 0;
  while (start <= endExclusive) {
    const dayRate = (rate / 100) / daysInYear(start);
    total += principalCents * dayRate;
    start = addDays(start, 1);
  }
  return total;
}

function applyTailAdjustment(interestPrecise: number[], interestRounded: number[]): void {
  if (interestPrecise.length === 0) return;
  const totalPrecise = interestPrecise.reduce((a, b) => a + b, 0);
  const totalRounded = interestRounded.reduce((a, b) => a + b, 0);
  const tail = roundCents(totalPrecise) - totalRounded;
  interestRounded[interestRounded.length - 1]! += tail;
}

/** Генерация дат графика по частоте (WEEKLY / MONTHLY / REGULAR). */
export function buildScheduleDateKeys(
  frequency: "WEEKLY" | "MONTHLY" | "REGULAR",
  startKey: string,
  endKey: string,
  options: {
    weeklyDay?: number;
    monthlyDay?: number;
    intervalDays?: number;
  }
): string[] {
  const start = parseDateKey(startKey);
  const end = parseDateKey(endKey);
  if (start > end) return [];

  if (frequency === "WEEKLY") {
    const weekday = options.weeklyDay ?? 0;
    const startWeekday = (start.getDay() + 6) % 7;
    const offset = (weekday - startWeekday + 7) % 7;
    let current = addDays(start, offset);
    const keys: string[] = [];
    while (current <= end) {
      keys.push(toDateKey(current));
      current = addDays(current, 7);
    }
    return keys;
  }

  if (frequency === "MONTHLY") {
    const monthlyDay = options.monthlyDay ?? 1;
    const keys: string[] = [];
    let y = start.getFullYear();
    let m = start.getMonth();
    while (true) {
      const lastDay = lastDayOfMonth(y, m + 1);
      const day = Math.min(monthlyDay, lastDay);
      const candidate = new Date(y, m, day);
      // Первый платёж — строго после даты выдачи (следующее число месяца), не в день выдачи
      if (candidate > start && candidate <= end) keys.push(toDateKey(candidate));
      if (m === 11) {
        y += 1;
        m = 0;
      } else {
        m += 1;
      }
      if (new Date(y, m, 1) > end) break;
    }
    return keys;
  }

  if (frequency === "REGULAR") {
    const interval = options.intervalDays ?? 1;
    if (interval < 1) return [];
    const keys: string[] = [];
    let current = start;
    while (current <= end) {
      keys.push(toDateKey(current));
      current = addDays(current, interval);
    }
    return keys;
  }

  return [];
}

/** Аннуитетный платёж по стандартной формуле: P = L * (r*(1+r)^n) / ((1+r)^n - 1), r = годовая/12. */
function annuityPaymentByFormula(principalCents: number, annualRatePercent: number, numPayments: number): number {
  if (principalCents <= 0 || numPayments <= 0) return 0;
  const r = annualRatePercent / 100 / 12;
  if (r <= 0) return Math.ceil(principalCents / numPayments);
  const factor = Math.pow(1 + r, numPayments);
  const payment = principalCents * (r * factor) / (factor - 1);
  return Math.round(payment);
}

function buildAnnuitySchedule(
  principalCents: number,
  rate: number,
  periodStartKey: string,
  payoutDateKeys: string[],
  firstPaymentInterestOnly: boolean = false
): { principal: number[]; interest: number[] } {
  if (payoutDateKeys.length === 0) return { principal: [], interest: [] };
  const paymentCents = annuityPaymentByFormula(principalCents, rate, payoutDateKeys.length);
  const interestPrecise: number[] = [];
  const interestRounded: number[] = [];
  const principalPayments: number[] = [];
  let outstanding = principalCents;
  let startKey = periodStartKey;
  for (let i = 0; i < payoutDateKeys.length; i++) {
    const payoutKey = payoutDateKeys[i]!;
    const interestVal = sumInterestCents(outstanding, rate, startKey, payoutKey);
    interestPrecise.push(interestVal);
    const roundedInterest = roundCents(interestVal);
    interestRounded.push(roundedInterest);
    const isLast = i === payoutDateKeys.length - 1;
    let principalPayment: number;
    if (i === 0 && firstPaymentInterestOnly) {
      principalPayment = 0;
    } else if (isLast) {
      principalPayment = Math.max(outstanding, 0);
    } else {
      principalPayment = paymentCents - roundedInterest;
      if (principalPayment <= 0) principalPayment = outstanding;
      else principalPayment = Math.min(principalPayment, outstanding);
    }
    principalPayments.push(principalPayment);
    outstanding = Math.max(outstanding - principalPayment, 0);
    const d = parseDateKey(payoutKey);
    startKey = toDateKey(addDays(d, 1));
  }
  applyTailAdjustment(interestPrecise, interestRounded);
  return { principal: principalPayments, interest: interestRounded };
}

function buildDifferentiatedSchedule(
  principalCents: number,
  rate: number,
  periodStartKey: string,
  payoutDateKeys: string[],
  firstPaymentInterestOnly: boolean = false
): { principal: number[]; interest: number[] } {
  if (payoutDateKeys.length === 0) return { principal: [], interest: [] };
  const totalPeriods = payoutDateKeys.length;
  const basePrincipal = Math.floor(principalCents / totalPeriods);
  const interestPrecise: number[] = [];
  const interestRounded: number[] = [];
  const principalPayments: number[] = [];
  let outstanding = principalCents;
  let startKey = periodStartKey;
  for (let i = 0; i < payoutDateKeys.length; i++) {
    const payoutKey = payoutDateKeys[i]!;
    const interestVal = sumInterestCents(outstanding, rate, startKey, payoutKey);
    interestPrecise.push(interestVal);
    interestRounded.push(roundCents(interestVal));
    const isLast = i === totalPeriods - 1;
    const principalPayment =
      i === 0 && firstPaymentInterestOnly
        ? 0
        : isLast
          ? Math.max(outstanding, 0)
          : basePrincipal;
    principalPayments.push(principalPayment);
    outstanding = Math.max(outstanding - principalPayment, 0);
    const d = parseDateKey(payoutKey);
    startKey = toDateKey(addDays(d, 1));
  }
  applyTailAdjustment(interestPrecise, interestRounded);
  return { principal: principalPayments, interest: interestRounded };
}

export type LoanScheduleRow = {
  dateKey: string;
  totalCents: number;
  principalCents: number;
  interestCents: number;
  remainingCents: number;
};

export type BuildLoanScheduleParams = {
  principalCents: number;
  rate: number;
  periodStartKey: string;
  endDateKey: string;
  repaymentType: "ANNUITY" | "DIFFERENTIATED";
  frequency: "WEEKLY" | "MONTHLY" | "REGULAR";
  weeklyDay?: number;
  monthlyDay?: number;
  intervalDays?: number;
  firstPaymentInterestOnly?: boolean;
  skipFirstPayment?: boolean;
  shiftWeekendToWorkday?: boolean;
};

/**
 * Строит график погашения для отображения в модалке.
 * Возвращает null, если параметров недостаточно для расчёта.
 */
export function buildLoanSchedule(params: BuildLoanScheduleParams): LoanScheduleRow[] | null {
  const {
    principalCents,
    rate,
    periodStartKey,
    endDateKey,
    repaymentType,
    frequency,
    weeklyDay,
    monthlyDay,
    intervalDays,
    firstPaymentInterestOnly = false,
    skipFirstPayment = false,
    shiftWeekendToWorkday = true,
  } = params;

  if (principalCents < 0 || rate < 0) return null;

  let dateKeys = buildScheduleDateKeys(frequency, periodStartKey, endDateKey, {
    weeklyDay,
    monthlyDay: monthlyDay != null && monthlyDay >= 1 && monthlyDay <= 31 ? monthlyDay : undefined,
    intervalDays: intervalDays != null && intervalDays >= 1 ? intervalDays : undefined,
  });

  if (dateKeys.length === 0) return null;

  const fullRepayment = true;
  if (fullRepayment && dateKeys[dateKeys.length - 1] !== endDateKey) {
    dateKeys = [...dateKeys, endDateKey].sort();
  }
  if (shiftWeekendToWorkday) {
    dateKeys = dateKeys.map(shiftDateToWorkday);
    dateKeys = [...new Set(dateKeys)].sort();
  }
  if (skipFirstPayment && dateKeys.length > 1) {
    dateKeys = dateKeys.slice(1);
  }

  if (principalCents === 0) {
    return dateKeys.map((dateKey) => ({
      dateKey,
      totalCents: 0,
      principalCents: 0,
      interestCents: 0,
      remainingCents: 0,
    }));
  }

  const { principal: principalList, interest: interestList } =
    repaymentType === "ANNUITY"
      ? buildAnnuitySchedule(principalCents, rate, periodStartKey, dateKeys, firstPaymentInterestOnly)
      : buildDifferentiatedSchedule(principalCents, rate, periodStartKey, dateKeys, firstPaymentInterestOnly);

  if (principalList.length !== dateKeys.length) return null;

  let remaining = principalCents;
  const rows: LoanScheduleRow[] = [];
  for (let i = 0; i < dateKeys.length; i++) {
    const p = principalList[i] ?? 0;
    const in_ = interestList[i] ?? 0;
    remaining -= p;
    if (remaining < 0) remaining = 0;
    rows.push({
      dateKey: dateKeys[i]!,
      totalCents: p + in_,
      principalCents: p,
      interestCents: in_,
      remainingCents: remaining,
    });
  }
  return rows;
}
