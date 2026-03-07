/**
 * Парсер выгрузки CoinKeeper (CSV).
 * Формат: Date, Type, From, To, Tags, Amount, Currency, Amount converted, Currency of conversion, Recurrence, Note
 * Используемые поля: Date, Type, From, To, Amount, Currency, Note
 */

import type {
  DzenParsedData,
  DzenParsedAccount,
  DzenParsedTransaction,
  DzenTransactionType,
} from "@/lib/dzen-csv-parser";
import {
  IMPORT_DEFAULT_CATEGORY_EXPENSE,
  IMPORT_DEFAULT_CATEGORY_INCOME,
} from "@/lib/dzen-csv-parser";

/** Парсит строку CSV с учётом кавычек и escaped-кавычек */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += c;
    }
  }
  result.push(current);
  return result;
}

function parseAmount(value: string): number | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  const normalized = trimmed.replace(",", ".");
  const num = parseFloat(normalized);
  return Number.isNaN(num) ? null : num;
}

function isFilled(value: string): boolean {
  return (value?.trim() ?? "").length > 0;
}

/** DD.MM.YYYY → YYYY-MM-DD */
function parseCoinKeeperDate(value: string): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return "";
  const m = /^(\d{1,2})[./\s-](\d{1,2})[./\s-](\d{2,4})\b/.exec(trimmed);
  if (!m) return "";
  const [, d, month, y] = m;
  const year = (y?.length ?? 0) === 2 ? `20${y}` : y ?? "";
  return `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

type RawRow = {
  date: string;
  typeRaw: string;
  from: string;
  to: string;
  amount: number;
  currency: string;
  note: string;
  /** true если строка участвовала в merge и должна быть пропущена */
  merged?: boolean;
};

/** Сырая строка после первого прохода, до объединения пар */
function parseRawRows(lines: string[], headerColumns: string[]): RawRow[] {
  const rows: RawRow[] = [];
  const getCol = (cells: string[], name: string): string => {
    const idx = headerColumns.indexOf(name);
    return idx >= 0 ? (cells[idx] ?? "").trim() : "";
  };

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const cells = parseCSVLine(line);
    const date = parseCoinKeeperDate(getCol(cells, "Date"));
    const amount = parseAmount(getCol(cells, "Amount"));

    if (!date || amount == null || amount === 0) continue;

    rows.push({
      date,
      typeRaw: getCol(cells, "Type"),
      from: getCol(cells, "From"),
      to: getCol(cells, "To"),
      amount,
      currency: getCol(cells, "Currency") || "RUB",
      note: getCol(cells, "Note"),
    });
  }
  return rows;
}

/** Объединяет подряд идущие пары (From=A, To=пусто) + (From=пусто, To=B) с одинаковой суммой и датой в transfer.
 * Если в результате From и To указывают на один и тот же счёт (A = B), объединение не выполняется,
 * чтобы не создавать переводы «сам в себя».
 */
function mergeTransferPairs(rows: RawRow[]): RawRow[] {
  const result: RawRow[] = [];
  const merged = new Set<number>();

  for (let i = 0; i < rows.length; i++) {
    if (merged.has(i)) continue;

    const a = rows[i];
    const hasFromOnly = isFilled(a.from) && !isFilled(a.to);
    const hasToOnly = !isFilled(a.from) && isFilled(a.to);

    if (!hasFromOnly && !hasToOnly) {
      result.push(a);
      continue;
    }

    // Парная строка должна идти сразу после (подряд)
    const j = i + 1;
    if (j >= rows.length) {
      result.push(a);
      continue;
    }

    const b = rows[j];
    if (b.date !== a.date || Math.abs(b.amount - a.amount) > 0.0001) {
      result.push(a);
      continue;
    }

    const bHasFromOnly = isFilled(b.from) && !isFilled(b.to);
    const bHasToOnly = !isFilled(b.from) && isFilled(b.to);

    const canMerge =
      (hasFromOnly && bHasToOnly) || (hasToOnly && bHasFromOnly);

    if (canMerge) {
      const fromAcc = isFilled(a.from) ? a.from : b.from;
      const toAcc = isFilled(a.to) ? a.to : b.to;

      // Если после объединения источник и получатель совпадают, это не перевод между счетами — не мержим.
      if (!isFilled(fromAcc) || !isFilled(toAcc) || fromAcc.trim() === toAcc.trim()) {
        result.push(a);
        continue;
      }

      merged.add(i);
      merged.add(j);

      result.push({
        date: a.date,
        typeRaw: "transfer",
        from: fromAcc,
        to: toAcc,
        amount: a.amount,
        currency: a.currency,
        note: a.note || b.note,
      });
    } else {
      result.push(a);
    }
  }

  return result;
}

/** Определяет тип по Type и From/To */
function inferType(row: RawRow): DzenTransactionType {
  const typeLower = row.typeRaw.toLowerCase();
  if (typeLower === "income") return "income";
  if (typeLower === "expense") return "expense";
  if (typeLower === "transfer") return "transfer";

  const hasFrom = isFilled(row.from);
  const hasTo = isFilled(row.to);

  if (hasFrom && hasTo) return "transfer";
  if (hasFrom) return "expense";
  if (hasTo) return "income";

  return "expense"; // fallback
}

export function parseCoinKeeperCSV(text: string): DzenParsedData {
  const normalizedText = text.replace(/^\uFEFF/, "");
  const lines = normalizedText.split(/\r?\n/);

  const headerLine = lines[0];
  if (!headerLine?.trim()) {
    return { accounts: [], categories: [], counterparties: [], transactions: [] };
  }

  const headerColumns = parseCSVLine(headerLine);
  const hasRequired =
    headerColumns.includes("Date") &&
    headerColumns.includes("Amount") &&
    (headerColumns.includes("From") || headerColumns.includes("To"));

  if (!hasRequired) {
    return { accounts: [], categories: [], counterparties: [], transactions: [] };
  }

  let rawRows = parseRawRows(lines, headerColumns);
  rawRows = mergeTransferPairs(rawRows);

  const accountsMap = new Map<string, DzenParsedAccount>();
  const categoriesSet = new Set<string>();
  const transactions: DzenParsedTransaction[] = [];

  for (const row of rawRows) {
    const type = inferType(row);
    /** Сумма в копейках (целое число), как в DzenParsedTransaction */
    const amountCents = Math.round(Math.abs(row.amount) * 100);
    const currency = row.currency || "RUB";

    let outcomeAccountName = "";
    let incomeAccountName = "";
    let categoryName = "";

    if (type === "expense") {
      outcomeAccountName = row.from;
      categoryName = row.to;
    } else if (type === "income") {
      incomeAccountName = row.to;
      categoryName = row.from;
    } else {
      outcomeAccountName = row.from;
      incomeAccountName = row.to;
    }

    if (isFilled(outcomeAccountName)) {
      const key = `${outcomeAccountName}|${currency}`;
      if (!accountsMap.has(key)) {
        accountsMap.set(key, { name: outcomeAccountName, currency });
      }
    }
    if (isFilled(incomeAccountName)) {
      const key = `${incomeAccountName}|${currency}`;
      if (!accountsMap.has(key)) {
        accountsMap.set(key, { name: incomeAccountName, currency });
      }
    }
    const effectiveCategory =
      type !== "transfer"
        ? (isFilled(categoryName)
            ? categoryName
            : type === "expense"
              ? IMPORT_DEFAULT_CATEGORY_EXPENSE
              : IMPORT_DEFAULT_CATEGORY_INCOME)
        : categoryName;
    if (type !== "transfer") {
      categoriesSet.add(effectiveCategory);
    }

    transactions.push({
      date: row.date,
      time: "00:00:00",
      categoryName: effectiveCategory,
      counterparty: "",
      comment: row.note,
      outcomeAccountName,
      outcome: type === "expense" || type === "transfer" ? amountCents : null,
      outcomeCurrency: currency,
      incomeAccountName,
      income: type === "income" || type === "transfer" ? amountCents : null,
      incomeCurrency: currency,
      type,
      amount: amountCents,
    });
  }

  return {
    accounts: Array.from(accountsMap.values()),
    categories: Array.from(categoriesSet).map((name) => ({ name })),
    counterparties: [],
    transactions,
  };
}

export async function parseCoinKeeperCSVFile(file: File): Promise<DzenParsedData> {
  const text = await file.text();
  return parseCoinKeeperCSV(text);
}
