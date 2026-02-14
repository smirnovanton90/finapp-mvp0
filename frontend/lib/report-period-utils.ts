/**
 * Utilities for report period granularity: day, ISO week, month, year.
 * Used by income-expense-dynamics and similar reports.
 */

export type ReportPeriodGranularity = "day" | "week" | "month" | "year";

export type PeriodPresetKey = "all" | "last_month" | "last_quarter" | "last_year" | "custom";

/** Пресет «История»: от какой даты смотрим назад (до сегодня). */
export type HistoryPresetKey = "all" | "last_month" | "last_quarter" | "last_year" | "custom";

/** Пресет «Прогноз»: до какой даты смотрим вперёд (от сегодня). */
export type ForecastPresetKey = "next_month" | "next_quarter" | "next_year" | "custom";

/** Дата начала для пресета «История» (без "custom"). */
export function getHistoryPresetStart(
  preset: Exclude<HistoryPresetKey, "custom">,
  accountingStartDate: string | null
): string {
  const today = new Date();
  if (preset === "all") {
    return accountingStartDate || toDateKey(new Date(today.getFullYear(), today.getMonth(), 1));
  }
  if (preset === "last_month") {
    const d = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    return toDateKey(d);
  }
  if (preset === "last_quarter") {
    const q = Math.floor(today.getMonth() / 3) + 1;
    const prevQ = q === 1 ? 4 : q - 1;
    const prevYear = q === 1 ? today.getFullYear() - 1 : today.getFullYear();
    const startMonth = (prevQ - 1) * 3;
    const d = new Date(prevYear, startMonth, 1);
    return toDateKey(d);
  }
  if (preset === "last_year") {
    const d = new Date(today.getFullYear() - 1, 0, 1);
    return toDateKey(d);
  }
  return toDateKey(today);
}

/** Последний день следующего календарного месяца. */
function lastDayOfNextMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 2, 0);
}

/** Последний день следующего календарного квартала. */
function lastDayOfNextQuarter(date: Date): Date {
  const q = Math.floor(date.getMonth() / 3) + 1;
  const nextQ = q === 4 ? 1 : q + 1;
  const nextYear = q === 4 ? date.getFullYear() + 1 : date.getFullYear();
  const endMonth = nextQ * 3;
  return new Date(nextYear, endMonth, 0);
}

/** Последний день следующего календарного года. */
function lastDayOfNextYear(date: Date): Date {
  return new Date(date.getFullYear() + 1, 11, 31);
}

/** Дата окончания для пресета «Прогноз» (без "custom"). */
export function getForecastPresetEnd(preset: Exclude<ForecastPresetKey, "custom">): string {
  const today = new Date();
  const d =
    preset === "next_month"
      ? lastDayOfNextMonth(today)
      : preset === "next_quarter"
        ? lastDayOfNextQuarter(today)
        : lastDayOfNextYear(today);
  return toDateKey(d);
}

/** Вычисляет диапазон дат для пресета периода (без "custom"). */
export function getPeriodPresetRange(
  preset: Exclude<PeriodPresetKey, "custom">,
  accountingStartDate: string | null
): { start: string; end: string } {
  const today = new Date();
  const end = toDateKey(today);
  const start = getHistoryPresetStart(preset, accountingStartDate);
  return { start, end };
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function parseDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function daysBetween(start: Date, end: Date): number {
  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.round((endUtc - startUtc) / MS_PER_DAY);
}

/** ISO week: Monday = 1. Returns [year, weekNumber]. */
function getISOWeek(date: Date): [number, number] {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / MS_PER_DAY + 1) / 7);
  const year = d.getFullYear();
  return [year, weekNo];
}

/** Monday of the given ISO week. */
function getMondayOfISOWeek(year: number, week: number): Date {
  const jan4 = new Date(year, 0, 4);
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - (jan4.getDay() || 7) + 1 + (week - 1) * 7);
  return monday;
}

/** Year and month for the period (for week: Monday's month/year). */
export function getPeriodMonthYear(
  periodKey: string,
  granularity: ReportPeriodGranularity
): { year: number; month: number } {
  if (granularity === "day") {
    const [y, m] = periodKey.split("-");
    return { year: Number.parseInt(y ?? "0", 10), month: Number.parseInt(m ?? "1", 10) };
  }
  if (granularity === "month") {
    const [y, m] = periodKey.split("-");
    return { year: Number.parseInt(y ?? "0", 10), month: Number.parseInt(m ?? "1", 10) };
  }
  if (granularity === "year") {
    return { year: Number.parseInt(periodKey, 10), month: 1 };
  }
  const match = periodKey.match(/^(\d{4})-W(\d{2})$/);
  if (!match) return { year: 0, month: 1 };
  const [, y, w] = match;
  const year = Number.parseInt(y ?? "0", 10);
  const week = Number.parseInt(w ?? "0", 10);
  const monday = getMondayOfISOWeek(year, week);
  return { year: monday.getFullYear(), month: monday.getMonth() + 1 };
}

/** Period key for the given date key and granularity. */
export function getPeriodKey(dateKey: string, granularity: ReportPeriodGranularity): string {
  if (granularity === "day") return dateKey;
  const date = parseDateKey(dateKey);
  if (granularity === "month") {
    return dateKey.slice(0, 7);
  }
  if (granularity === "year") {
    return String(date.getFullYear());
  }
  // week: YYYY-Www
  const [y, w] = getISOWeek(date);
  return `${y}-W${String(w).padStart(2, "0")}`;
}

export type PeriodPoint = {
  periodKey: string;
  label: string;
};

/** List all periods (with labels) in [startKey, endKey] for the given granularity. */
export function listPeriodsInRange(
  startKey: string,
  endKey: string,
  granularity: ReportPeriodGranularity
): PeriodPoint[] {
  const start = parseDateKey(startKey);
  const end = parseDateKey(endKey);
  const [rangeStart, rangeEnd] = start > end ? [end, start] : [start, end];
  const seen = new Set<string>();
  const result: PeriodPoint[] = [];

  if (granularity === "day") {
    for (let d = new Date(rangeStart); d <= rangeEnd; d = addDays(d, 1)) {
      const key = toDateKey(d);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ periodKey: key, label: formatDayLabel(key) });
    }
    return result;
  }

  if (granularity === "month") {
    let y = rangeStart.getFullYear();
    let m = rangeStart.getMonth();
    const endY = rangeEnd.getFullYear();
    const endM = rangeEnd.getMonth();
    while (y < endY || (y === endY && m <= endM)) {
      const key = `${y}-${String(m + 1).padStart(2, "0")}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push({ periodKey: key, label: formatMonthLabel(key) });
      }
      m += 1;
      if (m > 11) {
        m = 0;
        y += 1;
      }
    }
    return result;
  }

  if (granularity === "year") {
    for (let y = rangeStart.getFullYear(); y <= rangeEnd.getFullYear(); y += 1) {
      const key = String(y);
      if (!seen.has(key)) {
        seen.add(key);
        result.push({ periodKey: key, label: formatYearLabel(key) });
      }
    }
    return result;
  }

  // week: walk by day and collect unique ISO weeks
  for (let d = new Date(rangeStart); d <= rangeEnd; d = addDays(d, 1)) {
    const [y, w] = getISOWeek(d);
    const key = `${y}-W${String(w).padStart(2, "0")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const monday = getMondayOfISOWeek(y, w);
    const sunday = addDays(monday, 6);
    result.push({
      periodKey: key,
      label: formatWeekRangeLabel(toDateKey(monday), toDateKey(sunday)),
    });
  }
  result.sort((a, b) => a.periodKey.localeCompare(b.periodKey));
  return result;
}

/** Format day for chart axis: "01.12.25". */
function formatDayLabel(dateKey: string): string {
  const [y, month, day] = dateKey.split("-");
  const yearShort = y?.slice(-2) ?? "";
  return `${day}.${month}.${yearShort}`;
}

/** Format week range for chart axis: "01.12 — 07.12.25". */
export function formatWeekRangeLabel(startDateKey: string, endDateKey: string): string {
  const [startY, startM, startD] = startDateKey.split("-");
  const [endY, endM, endD] = endDateKey.split("-");
  const yearShort = endY?.slice(-2) ?? "";
  return `${startD}.${startM} — ${endD}.${endM}.${yearShort}`;
}

/** Формат периода недели для подсказки: "ДД.ММ.ГГ - ДД.ММ.ГГ". */
export function formatWeekPeriodAsDateRange(periodKey: string): string {
  const match = periodKey.match(/^(\d{4})-W(\d{2})$/);
  if (!match) return periodKey;
  const [, y, w] = match;
  const year = Number.parseInt(y ?? "0", 10);
  const week = Number.parseInt(w ?? "0", 10);
  const monday = getMondayOfISOWeek(year, week);
  const sunday = addDays(monday, 6);
  const toDDMMYY = (dateKey: string) => {
    const [yr, mo, day] = dateKey.split("-");
    return `${day}.${mo}.${yr?.slice(-2) ?? ""}`;
  };
  return `${toDDMMYY(toDateKey(monday))} - ${toDDMMYY(toDateKey(sunday))}`;
}

function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-");
  const monthIndex = Number.parseInt(month ?? "1", 10) - 1;
  const monthNames = [
    "Янв", "Фев", "Мар", "Апр", "Май", "Июн",
    "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек",
  ];
  const name = monthNames[monthIndex] ?? month;
  const yearShort = year?.slice(-2) ?? "";
  return `${name} ${yearShort}`;
}

function formatYearLabel(yearKey: string): string {
  return yearKey;
}

/** Format period label for display (tooltip/axis). */
export function formatPeriodLabel(
  periodKey: string,
  granularity: ReportPeriodGranularity
): string {
  switch (granularity) {
    case "day":
      return formatDayLabel(periodKey);
    case "month":
      return formatMonthLabel(periodKey);
    case "year":
      return formatYearLabel(periodKey);
    case "week": {
      const match = periodKey.match(/^(\d{4})-W(\d{2})$/);
      if (!match) return periodKey;
      const [, y, w] = match;
      const year = Number.parseInt(y ?? "0", 10);
      const week = Number.parseInt(w ?? "0", 10);
      const monday = getMondayOfISOWeek(year, week);
      const sunday = addDays(monday, 6);
      return formatWeekRangeLabel(toDateKey(monday), toDateKey(sunday));
    }
    default:
      return periodKey;
  }
}
