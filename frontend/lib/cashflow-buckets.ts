import type { TransactionOut } from "@/lib/api";

export type CashflowBucket =
  | "actual"
  | "planned"
  | "overdue_month"
  | "overdue_prev";

export const CASHFLOW_BUCKET_ORDER: CashflowBucket[] = [
  "actual",
  "planned",
  "overdue_month",
  "overdue_prev",
];

export const CASHFLOW_LABELS: Record<CashflowBucket, string> = {
  actual: "Факт",
  planned: "План в периоде",
  overdue_month: "Просроченный план периода",
  overdue_prev: "Просроченный план до периода",
};

function toTxDateKey(value: string) {
  return value ? value.slice(0, 10) : "";
}

function isRealizedTransaction(tx: TransactionOut) {
  return tx.transaction_type === "ACTUAL" || tx.status === "REALIZED";
}

function isOpenPlannedTransaction(tx: TransactionOut) {
  return tx.transaction_type === "PLANNED" && tx.status !== "REALIZED";
}

export function classifyCashflowBucket(
  tx: TransactionOut,
  direction: "INCOME" | "EXPENSE",
  periodStartKey: string,
  periodEndKey: string,
  todayKey: string
): CashflowBucket | null {
  if (tx.is_split_parent) return null;
  if (tx.direction !== direction) return null;
  const dateKey = toTxDateKey(tx.transaction_date);
  if (!dateKey) return null;

  if (isRealizedTransaction(tx)) {
    if (dateKey < periodStartKey || dateKey > periodEndKey) return null;
    return "actual";
  }

  if (!isOpenPlannedTransaction(tx)) return null;

  if (dateKey < periodStartKey) return "overdue_prev";
  if (dateKey > periodEndKey) return null;
  if (dateKey < todayKey) return "overdue_month";
  return "planned";
}

export function getMonthDateRange(monthKey: string) {
  const [yearStr, monthStr] = monthKey.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!year || !month) {
    return { startKey: "", endKey: "" };
  }
  const startKey = `${yearStr}-${monthStr}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endKey = `${yearStr}-${monthStr}-${String(lastDay).padStart(2, "0")}`;
  return { startKey, endKey };
}

function shiftDateKey(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return "";
  const date = new Date(year, month - 1, day + days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isValidDateKey(value: string | null | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

/** Диапазон дат для API-запроса под bucket (дополнительно уточняется client-side). */
export function getCashflowApiDateRange(
  periodStartKey: string,
  periodEndKey: string,
  bucket: CashflowBucket,
  todayKey: string
) {
  if (!periodStartKey || !periodEndKey) return { dateFrom: "", dateTo: "" };

  if (bucket === "actual") {
    return { dateFrom: periodStartKey, dateTo: periodEndKey };
  }
  if (bucket === "planned") {
    const from = todayKey > periodStartKey ? todayKey : periodStartKey;
    return { dateFrom: from, dateTo: periodEndKey };
  }
  if (bucket === "overdue_month") {
    const yesterday = shiftDateKey(todayKey, -1);
    const to = yesterday < periodEndKey ? yesterday : periodEndKey;
    return {
      dateFrom: periodStartKey,
      dateTo: to >= periodStartKey ? to : periodStartKey,
    };
  }
  // overdue_prev
  return { dateFrom: "", dateTo: shiftDateKey(periodStartKey, -1) };
}

export type CashflowTransactionsHrefParams = {
  direction: "INCOME" | "EXPENSE";
  bucket: CashflowBucket;
  periodStartKey: string;
  periodEndKey: string;
  categoryL1?: string | null;
  uncategorized?: boolean;
};

export function buildCashflowTransactionsHref(
  params: CashflowTransactionsHrefParams
) {
  const qs = new URLSearchParams({
    preset: "cashflow",
    direction: params.direction,
    bucket: params.bucket,
    date_from: params.periodStartKey,
    date_to: params.periodEndKey,
  });
  if (params.uncategorized) {
    qs.set("uncategorized", "1");
  } else if (params.categoryL1) {
    qs.set("category_l1", params.categoryL1);
  }
  return `/transactions?${qs.toString()}`;
}

/** Разбирает период cashflow-пресета из query (date_from/date_to или legacy month). */
export function resolveCashflowPeriodFromParams(params: {
  dateFrom?: string | null;
  dateTo?: string | null;
  month?: string | null;
}): { startKey: string; endKey: string } | null {
  if (isValidDateKey(params.dateFrom) && isValidDateKey(params.dateTo)) {
    const startKey =
      params.dateFrom <= params.dateTo ? params.dateFrom : params.dateTo;
    const endKey =
      params.dateFrom <= params.dateTo ? params.dateTo : params.dateFrom;
    return { startKey, endKey };
  }
  if (params.month && /^\d{4}-\d{2}$/.test(params.month)) {
    const range = getMonthDateRange(params.month);
    if (range.startKey && range.endKey) return range;
  }
  return null;
}
