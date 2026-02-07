/**
 * Парсер «своей» выписки: чтение CSV/Excel, применение маппинга столбцов → DzenParsedData.
 */

import * as XLSX from "xlsx";
import type {
  DzenParsedData,
  DzenParsedAccount,
  DzenParsedTransaction,
  DzenTransactionType,
} from "@/lib/dzen-csv-parser";

/** Назначение столбца в маппинге (date = дата и время транзакции из одного столбца) */
export type OwnColumnRole =
  | ""
  | "date"
  | "amount_signed"
  | "account"
  | "account_transfer"
  | "currency"
  | "category"
  | "category_l1"
  | "category_l2"
  | "category_l3"
  | "counterparty"
  | "comment";

/** Маппинг: индекс столбца → роль */
export type OwnColumnMapping = Map<number, OwnColumnRole>;

/** Варианты назначения для UI */
export type ColumnMappingKey =
  | ""
  | "transaction_date"
  | "amount"
  | "account"
  | "account_transfer"
  | "currency"
  | "category"
  | "category_l1"
  | "category_l2"
  | "category_l3"
  | "counterparty"
  | "comment";

export type ColumnMapping = Record<number, ColumnMappingKey>;

export const COLUMN_MAPPING_OPTIONS: { value: ColumnMappingKey; label: string }[] = [
  { value: "", label: "Не использовать" },
  { value: "transaction_date", label: "Дата и время транзакции" },
  { value: "amount", label: "Сумма операции" },
  { value: "account", label: "Счет операции" },
  { value: "account_transfer", label: "Счет перевода" },
  { value: "currency", label: "Валюта" },
  { value: "category", label: "Категория транзакции" },
  { value: "category_l1", label: "Категория транзакции (уровень 1)" },
  { value: "category_l2", label: "Категория транзакции (уровень 2)" },
  { value: "category_l3", label: "Категория транзакции (уровень 3)" },
  { value: "counterparty", label: "Контрагент" },
  { value: "comment", label: "Комментарий" },
];

function columnKeyToOwnRole(key: ColumnMappingKey): OwnColumnRole {
  const map: Record<string, OwnColumnRole> = {
    transaction_date: "date",
    amount: "amount_signed",
    account: "account",
    account_transfer: "account_transfer",
    currency: "currency",
    category: "category",
    category_l1: "category_l1",
    category_l2: "category_l2",
    category_l3: "category_l3",
    counterparty: "counterparty",
    comment: "comment",
  };
  return (map[key as string] ?? "") as OwnColumnRole;
}

const DEFAULT_CURRENCY = "RUB";

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

function parseAmount(value: unknown): number | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  const normalized = s.replace(",", ".");
  const num = parseFloat(normalized);
  return Number.isNaN(num) ? null : num;
}

function isFilled(value: string): boolean {
  return (value?.trim() ?? "").length > 0;
}

function formatExcelSerialAsDate(serial: number): string | null {
  try {
    const date = XLSX.SSF.parse_date_code(serial);
    if (date) {
      const m = String(date.m).padStart(2, "0");
      const d = String(date.d).padStart(2, "0");
      return `${date.y}-${m}-${d}`;
    }
  } catch {
    // ignore
  }
  return null;
}

/** Из дробной части Excel serial (0..1 = 00:00..24:00) получаем HH:mm:ss */
function formatExcelSerialAsTime(serial: number): string {
  const fractional = serial - Math.floor(serial);
  const totalSeconds = Math.round(fractional * 86400) % 86400;
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Нормализует строку времени до HH:mm:ss */
function normalizeTimeString(s: string): string {
  const t = (s ?? "").trim();
  if (!t) return "00:00:00";
  const timePart = t.split(/[T\s]/).find((p) => /^\d{1,2}:\d{2}/.test(p)) ?? t;
  const [h, m, sec] = timePart.split(":");
  return `${String(Number(h) || 0).padStart(2, "0")}:${String(Number(m) || 0).padStart(2, "0")}:${sec != null ? String(Number(sec) || 0).padStart(2, "0") : "00"}`;
}

/** Извлекает время из того же сырого значения, что и дата (Excel serial с дробной частью, Date, строка с временем) */
function normalizeTimeFromRaw(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const h = value.getUTCHours();
    const m = value.getUTCMinutes();
    const s = value.getUTCSeconds();
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  if (typeof value === "number") {
    const fractional = value - Math.floor(value);
    if (fractional > 0 || value % 1 !== 0) return formatExcelSerialAsTime(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    const timeMatch = /(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(trimmed);
    if (timeMatch) return normalizeTimeString(trimmed);
    const tMatch = /T(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(trimmed);
    if (tMatch) {
      const [, h, m, s] = tMatch;
      return `${String(Number(h)).padStart(2, "0")}:${String(Number(m)).padStart(2, "0")}:${s != null ? String(Number(s)).padStart(2, "0") : "00"}`;
    }
  }
  return "00:00:00";
}

function normalizeDate(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const excelSerial = value.getTime() / 86400000 + 25569;
    const s = formatExcelSerialAsDate(excelSerial);
    if (s) return s;
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, "0");
    const d = String(value.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof value === "number") {
    const s = formatExcelSerialAsDate(value);
    if (s) return s;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";
    const asNum = parseFloat(trimmed);
    if (Number.isFinite(asNum) && asNum > 1000 && asNum < 1000000) {
      const s = formatExcelSerialAsDate(asNum);
      if (s) return s;
    }
    const iso = /^\d{4}-\d{2}-\d{2}/.exec(trimmed);
    if (iso) return iso[0];
    // ДД.ММ.ГГГГ или ДД/ММ/ГГГГ
    const ddmmyy = /^(\d{1,2})[./\s-](\d{1,2})[./\s-](\d{2,4})/.exec(trimmed);
    if (ddmmyy) {
      const [, d, m, y] = ddmmyy;
      const year = (y?.length ?? 0) === 2 ? `20${y}` : y ?? "";
      return `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
    // ГГГГ-ММ-ДД с временем
    const isoFull = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(trimmed);
    if (isoFull) {
      const [, y, m, d] = isoFull;
      return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }
  return "";
}

function getCell(row: (string | number | boolean | Date)[], index: number): string {
  const v = row[index];
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (v instanceof Date) {
    const s = formatExcelSerialAsDate(v.getTime() / 86400000 + 25569);
    return s ?? `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, "0")}-${String(v.getUTCDate()).padStart(2, "0")}`;
  }
  if (typeof v === "number" && v > 1000 && v < 1000000) {
    const s = formatExcelSerialAsDate(v);
    if (s) return s;
  }
  return String(v).trim();
}

export async function readCSVToRows(file: File): Promise<{ headers: string[]; rows: string[][] }> {
  const text = await file.text();
  const normalized = text.replace(/^\uFEFF/, "");
  const lines = normalized.split(/\r?\n/);
  let headerLine: string[] = [];
  const rows: string[][] = [];
  let foundHeader = false;
  for (const line of lines) {
    if (!line.trim()) continue;
    const cells = parseCSVLine(line);
    if (!foundHeader) {
      headerLine = cells;
      foundHeader = true;
    } else {
      rows.push(cells);
    }
  }
  return { headers: headerLine, rows };
}

export async function readExcelToRows(
  file: File
): Promise<{ headers: string[]; rows: (string | number | boolean | Date)[][] }> {
  const buf = await file.arrayBuffer();
  // cellDates: false — получаем числа (Excel serial), чтобы избежать сдвига дат из-за часовых поясов
  const workbook = XLSX.read(buf, { type: "array", cellDates: false });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return { headers: [], rows: [] };
  const sheet = workbook.Sheets[firstSheetName];
  const data = XLSX.utils.sheet_to_json<(string | number | boolean | Date)[]>(sheet, {
    header: 1,
    raw: true,
    defval: "",
    blankrows: true,
  });
  if (data.length === 0) return { headers: [], rows: [] };
  const headerRow = data[0] ?? [];
  const headers = headerRow.map((c) => (c != null ? String(c).trim() : ""));
  const rows = data.slice(1) as (string | number | boolean | Date)[][];
  return { headers, rows };
}

export function buildDzenParsedDataFromMapping(
  headers: string[],
  rows: (string | number | boolean | Date)[][],
  mapping: OwnColumnMapping
): DzenParsedData {
  const accountsMap = new Map<string, DzenParsedAccount>();
  const categoriesSet = new Set<string>();
  const counterpartiesSet = new Set<string>();
  const transactions: DzenParsedTransaction[] = [];

  const getCol = (row: (string | number | boolean | Date)[], role: OwnColumnRole): string => {
    for (let i = 0; i < headers.length; i++) {
      if (mapping.get(i) === role) return getCell(row, i);
    }
    return "";
  };

  const getColRaw = (row: (string | number | boolean | Date)[], role: OwnColumnRole): unknown => {
    for (let i = 0; i < headers.length; i++) {
      if (mapping.get(i) === role) return row[i];
    }
    return undefined;
  };

  const getColIndex = (role: OwnColumnRole): number => {
    for (let i = 0; i < headers.length; i++) {
      if (mapping.get(i) === role) return i;
    }
    return -1;
  };

  const idxSigned = getColIndex("amount_signed");

  for (const row of rows) {
    const dateRaw = getColRaw(row, "date");
    const date = dateRaw !== undefined && dateRaw !== null && dateRaw !== ""
      ? normalizeDate(dateRaw)
      : "";
    if (!date) continue;

    const timeStr = normalizeTimeFromRaw(dateRaw);

    if (idxSigned < 0) continue;
    const val = parseAmount(row[idxSigned]);
    if (val == null || val === 0) continue;

    const accountName = getCol(row, "account").trim();
    if (!accountName) continue;

    const currencyStr = getCol(row, "currency") || DEFAULT_CURRENCY;
    const currency = currencyStr.trim() || DEFAULT_CURRENCY;
    const transferAccountName = getCol(row, "account_transfer").trim();

    let type: DzenTransactionType;
    let amount: number;
    let outAcc: string;
    let inAcc: string;

    if (transferAccountName) {
      type = "transfer";
      amount = Math.abs(val);
      if (val < 0) {
        outAcc = accountName;
        inAcc = transferAccountName;
      } else {
        outAcc = transferAccountName;
        inAcc = accountName;
      }
    } else {
      amount = Math.abs(val);
      if (val < 0) {
        type = "expense";
        outAcc = accountName;
        inAcc = "";
      } else {
        type = "income";
        outAcc = "";
        inAcc = accountName;
      }
    }

    if (isFilled(outAcc)) {
      const key = `${outAcc}|${currency}`;
      if (!accountsMap.has(key)) accountsMap.set(key, { name: outAcc, currency });
    }
    if (isFilled(inAcc)) {
      const key = `${inAcc}|${currency}`;
      if (!accountsMap.has(key)) accountsMap.set(key, { name: inAcc, currency });
    }

    const categoryName =
      getCol(row, "category") ||
      getCol(row, "category_l1") ||
      getCol(row, "category_l2") ||
      getCol(row, "category_l3");
    if (isFilled(categoryName)) categoriesSet.add(categoryName.trim());

    const counterparty = getCol(row, "counterparty");
    if (isFilled(counterparty)) counterpartiesSet.add(counterparty.trim());

    transactions.push({
      date,
      time: timeStr,
      categoryName: categoryName.trim(),
      counterparty: counterparty.trim(),
      comment: getCol(row, "comment").trim(),
      outcomeAccountName: outAcc,
      outcome: type === "expense" || type === "transfer" ? amount : null,
      outcomeCurrency: currency,
      incomeAccountName: inAcc,
      income: type === "income" || type === "transfer" ? amount : null,
      incomeCurrency: currency,
      type,
      amount,
    });
  }

  return {
    accounts: Array.from(accountsMap.values()),
    categories: Array.from(categoriesSet).map((name) => ({ name })),
    counterparties: Array.from(counterpartiesSet).map((name) => ({ name })),
    transactions,
  };
}

export async function readFileToRows(
  file: File
): Promise<{ headers: string[]; rows: (string | number | boolean | Date)[][] }> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) {
    const { headers, rows } = await readCSVToRows(file);
    return { headers, rows };
  }
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    return readExcelToRows(file);
  }
  throw new Error("Поддерживаются только файлы .csv, .xlsx и .xls");
}

/** Единая точка входа: читает CSV или Excel, возвращает заголовки и строки */
export async function readFileToHeadersAndRows(
  file: File
): Promise<{ headers: string[]; rows: (string | number | boolean | Date)[][] }> {
  const result = await readFileToRows(file);
  if (!result.headers.length) {
    throw new Error("Файл не содержит заголовков столбцов.");
  }
  return result;
}

/** Преобразует ColumnMapping (Record) в OwnColumnMapping (Map) */
function mappingToOwn(mapping: ColumnMapping): OwnColumnMapping {
  const m = new Map<number, OwnColumnRole>();
  for (const [k, v] of Object.entries(mapping)) {
    const idx = parseInt(k, 10);
    if (!Number.isNaN(idx) && v) {
      m.set(idx, columnKeyToOwnRole(v as ColumnMappingKey));
    }
  }
  return m;
}

/** Строит DzenParsedData из маппинга (API для модалки) */
export function applyMappingToDzenParsedData(
  headers: string[],
  rows: (string | number | boolean | Date)[][],
  mapping: ColumnMapping
): DzenParsedData {
  return buildDzenParsedDataFromMapping(headers, rows, mappingToOwn(mapping));
}

/** Валидация маппинга для перехода «Далее» */
export function validateColumnMapping(
  headers: string[],
  mapping: ColumnMapping
): { valid: true } | { valid: false; error: string } {
  const m = mappingToOwn(mapping);
  const hasDate = Array.from(m.values()).includes("date");
  const hasAmount = Array.from(m.values()).includes("amount_signed");
  const hasAccount = Array.from(m.values()).includes("account");

  if (!hasDate) {
    return { valid: false, error: "Укажите столбец «Дата и время транзакции»." };
  }
  if (!hasAmount) {
    return {
      valid: false,
      error: "Укажите столбец «Сумма операции».",
    };
  }
  if (!hasAccount) {
    return {
      valid: false,
      error:
        "Укажите столбец «Счет операции».",
    };
  }
  return { valid: true };
}
