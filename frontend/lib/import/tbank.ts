/**
 * Парсер выписки Т-Банка (xlsx).
 * Счета — из столбца «Номер карты», категории — «Категория», контрагенты — «Описание».
 * Пары «Переводы» с одинаковой суммой по модулю в один день и подряд объединяются в одну транзакцию TRANSFER.
 */

import * as XLSX from "xlsx";
import type {
  DzenParsedData,
  DzenParsedAccount,
  DzenParsedCategory,
  DzenParsedCounterparty,
  DzenParsedTransaction,
  DzenTransactionType,
} from "@/lib/dzen-csv-parser";
import {
  IMPORT_DEFAULT_CATEGORY_EXPENSE,
  IMPORT_DEFAULT_CATEGORY_INCOME,
} from "@/lib/dzen-csv-parser";

const IMPORT_HEADERS = [
  "Дата операции",
  "Дата платежа",
  "Номер карты",
  "Статус",
  "Сумма операции",
  "Валюта операции",
  "Сумма платежа",
  "Валюта платежа",
  "Кэшбэк",
  "Категория",
  "MCC",
  "Описание",
  "Бонусы (включая кэшбэк)",
  "Округление на инвесткопилку",
  "Сумма операции с округлением",
];

function normalizeHeader(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("ru");
}

function parseDateFromString(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const isoMatch =
    /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(trimmed);
  if (isoMatch) {
    const [, y, m, d, hh = "0", mm = "0", ss = "0"] = isoMatch;
    return new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss));
  }
  const ruMatch =
    /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})(?:[,\sT]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(
      trimmed
    );
  if (ruMatch) {
    const [, d, m, y, hh = "0", mm = "0", ss = "0"] = ruMatch;
    const year = y.length === 2 ? Number(`20${y}`) : Number(y);
    return new Date(year, Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss));
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseExcelDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return new Date(parsed.y, parsed.m - 1, parsed.d, parsed.H, parsed.M, parsed.S);
  }
  if (typeof value === "string") return parseDateFromString(value);
  return null;
}

function parseAmountCell(value: unknown): number | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  const normalized = s.replace(/\s/g, "").replace(",", ".");
  const num = parseFloat(normalized);
  return Number.isNaN(num) ? null : num;
}

function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatTimeHHmmss(date: Date): string {
  const h = date.getHours();
  const m = date.getMinutes();
  const s = date.getSeconds();
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

type RawTBankRow = {
  dateKey: string;
  date: Date;
  cardNumber: string;
  currency: string;
  amount: number;
  category: string;
  description: string;
  rowIndex: number;
};

const CATEGORY_TRANSFERS = "Переводы";

/** Проверяет, являются ли две строки парой перевода (один день, подряд, одна сумма, разные счета) */
function isTransferPair(a: RawTBankRow, b: RawTBankRow): boolean {
  if ((a.category || "").trim() !== CATEGORY_TRANSFERS) return false;
  if ((b.category || "").trim() !== CATEGORY_TRANSFERS) return false;
  if (a.dateKey !== b.dateKey) return false;
  if (Math.abs(Math.abs(a.amount) - Math.abs(b.amount)) > 0.01) return false;
  return (a.cardNumber || "").trim() !== (b.cardNumber || "").trim();
}

export async function parseTBankXlsxFile(file: File): Promise<DzenParsedData> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: "array", cellDates: true });
  if (workbook.SheetNames.length !== 1) {
    throw new Error("Файл должен содержать ровно один лист.");
  }
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    blankrows: false,
    defval: "",
  }) as unknown[][];

  if (rows.length < 2) {
    throw new Error("Файл не содержит данных для импорта.");
  }

  const expectedHeader = IMPORT_HEADERS.map(normalizeHeader);
  let headerRowIndex = -1;
  for (let r = 0; r < Math.min(rows.length, 5); r++) {
    const row = rows[r] ?? [];
    const normalized = row.map((cell) => normalizeHeader(String(cell ?? "")));
    const valid =
      normalized.length >= expectedHeader.length &&
      expectedHeader.every((value, index) => value === normalized[index]);
    if (valid) {
      headerRowIndex = r;
      break;
    }
  }
  if (headerRowIndex < 0) {
    throw new Error(
      `Файл не соответствует формату. Ожидаемые столбцы: ${IMPORT_HEADERS.join(", ")}.`
    );
  }

  const dataStartIndex = headerRowIndex + 1;

  const accountsMap = new Map<string, DzenParsedAccount>();
  const categoriesSet = new Set<string>([
    IMPORT_DEFAULT_CATEGORY_EXPENSE,
    IMPORT_DEFAULT_CATEGORY_INCOME,
  ]);
  const counterpartiesSet = new Set<string>();
  const rawRows: RawTBankRow[] = [];

  for (let i = dataStartIndex; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const rowNumber = i + 1;
    const hasValues = row.some((cell) => String(cell ?? "").trim() !== "");
    if (!hasValues) continue;

    const rawStatus = row[3];
    const statusValue = String(rawStatus ?? "").trim().toUpperCase();
    if (statusValue !== "OK") continue;

    const rawOperationDate = row[0];
    const parsedDate = parseExcelDate(rawOperationDate);
    if (!parsedDate) {
      throw new Error(`Строка ${rowNumber}: не удалось распознать дату операции.`);
    }
    const dateKey = formatDateKey(parsedDate);

    const rawPaymentAmount = row[6];
    const amountValue = parseAmountCell(rawPaymentAmount);
    if (amountValue == null || !Number.isFinite(amountValue)) {
      throw new Error(`Строка ${rowNumber}: не удалось распознать сумму операции.`);
    }

    const cardNumber = String(row[2] ?? "").trim();
    const currency = String(row[7] ?? row[5] ?? "RUB").trim() || "RUB";
    const category = String(row[9] ?? "").trim();
    const description = String(row[11] ?? "").trim();

    const key = `${cardNumber}|${currency}`;
    if (!accountsMap.has(key)) {
      accountsMap.set(key, { name: cardNumber || "Счёт", currency });
    }
    if (category) categoriesSet.add(category);
    if (description) counterpartiesSet.add(description);

    rawRows.push({
      dateKey,
      date: parsedDate,
      cardNumber,
      currency,
      amount: amountValue,
      category,
      description,
      rowIndex: i,
    });
  }

  const accounts = Array.from(accountsMap.values());
  const categories = Array.from(categoriesSet).map((name) => ({ name }));
  const counterparties = Array.from(counterpartiesSet).map((name) => ({ name }));

  const transactions: DzenParsedTransaction[] = [];
  const used = new Set<number>();

  for (let i = 0; i < rawRows.length; i++) {
    if (used.has(i)) continue;
    const a = rawRows[i];
    const b = rawRows[i + 1];

    if (b && isTransferPair(a, b)) {
      used.add(i);
      used.add(i + 1);
      const outcomeRow = a.amount < 0 ? a : b;
      const incomeRow = a.amount < 0 ? b : a;
      const outcomeAcc = accountsMap.get(`${outcomeRow.cardNumber}|${outcomeRow.currency}`);
      const incomeAcc = accountsMap.get(`${incomeRow.cardNumber}|${incomeRow.currency}`);
      if (outcomeAcc && incomeAcc) {
        const amountCents = Math.round(Math.abs(a.amount) * 100);
        transactions.push({
          date: a.dateKey,
          time: formatTimeHHmmss(a.date),
          categoryName: CATEGORY_TRANSFERS,
          counterparty: "",
          comment: a.description || b.description || "",
          outcomeAccountName: outcomeAcc.name,
          outcome: amountCents,
          outcomeCurrency: outcomeAcc.currency,
          incomeAccountName: incomeAcc.name,
          income: amountCents,
          incomeCurrency: incomeAcc.currency,
          type: "transfer",
          amount: amountCents,
        });
      }
      continue;
    }

    const accKey = `${a.cardNumber}|${a.currency}`;
    const acc = accountsMap.get(accKey);
    if (!acc) continue;

    const amountCents = Math.round(Math.abs(a.amount) * 100);
    const type: DzenTransactionType = a.amount < 0 ? "expense" : "income";
    const effectiveCategory =
      a.category ||
      (type === "expense" ? IMPORT_DEFAULT_CATEGORY_EXPENSE : IMPORT_DEFAULT_CATEGORY_INCOME);

    if (type === "expense") {
      transactions.push({
        date: a.dateKey,
        time: formatTimeHHmmss(a.date),
        categoryName: effectiveCategory,
        counterparty: a.description,
        comment: "",
        outcomeAccountName: acc.name,
        outcome: amountCents,
        outcomeCurrency: acc.currency,
        incomeAccountName: "",
        income: null,
        incomeCurrency: "",
        type: "expense",
        amount: amountCents,
      });
    } else {
      transactions.push({
        date: a.dateKey,
        time: formatTimeHHmmss(a.date),
        categoryName: effectiveCategory,
        counterparty: a.description,
        comment: "",
        outcomeAccountName: "",
        outcome: null,
        outcomeCurrency: "",
        incomeAccountName: acc.name,
        income: amountCents,
        incomeCurrency: acc.currency,
        type: "income",
        amount: amountCents,
      });
    }
  }

  transactions.sort((a, b) => {
    const da = `${a.date}T${a.time}`;
    const db = `${b.date}T${b.time}`;
    return da.localeCompare(db);
  });

  return {
    accounts,
    categories,
    counterparties,
    transactions,
    balanceCheckpointCandidates: [],
  };
}
