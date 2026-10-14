/**
 * Парсер выписки Альфа-Банка (xlsx). Поддерживаются два варианта файла:
 * — из раздела «История» («Скачать» → XLSX): по строке на операцию, есть «Номер счета», «Номер карты»,
 *   «Категория», «MCC код», сумма без знака и направление в столбце «Тип»;
 * — «Выписка по счету»: номер счёта, валюта и текущий баланс в шапке, сумма со знаком,
 *   карта, место покупки и MCC — внутри «Описания».
 * Все карты счёта относятся к одному активу (номер счёта). Дата — «Дата операции» (день покупки).
 * Текст описания операции всегда попадает в комментарий.
 * «Со счёта … на счёт …» в описании → категория «Между своими счетами» и counterAccountName;
 * в перевод операцию превращает resolveStatementTransfers, если у пользователя есть второй счёт.
 */

import * as XLSX from "xlsx";
import type {
  BalanceCheckpointCandidate,
  DzenParsedData,
  DzenParsedAccount,
  DzenParsedTransaction,
} from "@/lib/dzen-csv-parser";
import {
  IMPORT_DEFAULT_CATEGORY_EXPENSE,
  IMPORT_DEFAULT_CATEGORY_INCOME,
} from "@/lib/dzen-csv-parser";
import { formatMccCategoryForImport } from "@/lib/mcc-codes";

type ColumnKey =
  | "operationDate"
  | "postingDate"
  | "accountName"
  | "accountNumber"
  | "cardNumber"
  | "description"
  | "amount"
  | "currency"
  | "status"
  | "category"
  | "mcc"
  | "type"
  | "comment";

/** «ё» заранее приводится к «е». */
const COLUMN_ALIASES: Record<ColumnKey, string[]> = {
  operationDate: ["дата операции"],
  postingDate: ["дата проводки"],
  accountName: ["название счета"],
  accountNumber: ["номер счета"],
  cardNumber: ["номер карты"],
  description: ["описание операции", "описание"],
  amount: ["сумма", "сумма в валюте счета"],
  currency: ["валюта"],
  status: ["статус"],
  category: ["категория"],
  mcc: ["mcc код", "mcc"],
  type: ["тип"],
  comment: ["комментарий"],
};

const FORMAT_HINT =
  "Нужны столбцы: Дата операции, Описание (или Описание операции), Сумма (или Сумма в валюте счёта). Скачайте выписку в разделе «История» → «Скачать» → XLSX.";

/** Операции, которые банк ещё не провёл или отменил, в учёт не попадают. */
const SKIPPED_STATUS_REGEX = /обработк|отклон|отмен|hold|холд/i;

/** Заголовок блока непроведённых операций в «Выписке по счету» — дальше идут холды. */
const PENDING_SECTION_REGEX = /^(?:hold|неподтвержденные операции)/i;

/** «…место совершения операции: RU/MOSCOW/DOSTAVKA IZ PYATEROCHK, MCC: 5411» */
const CARD_PLACE_REGEX = /место\s+совершения\s+операции\s*:?\s*(.+?)(?:,?\s*MCC\b|$)/i;
/** «220015++++++4487    11000004\KZ\Almaty\AviaCenter      05.10.26 03.10.26  48326.06  RUR MCC4722» */
const RAW_CARD_LINE_REGEX = /^\d{6}[+*]{6}\d{4}\s+(.+?)\s{2,}\d{2}\.\d{2}\.\d{2}\b/;
/** «MOSKVA\ADMINVPS RU» в выписке из «Истории». */
const CITY_MERCHANT_REGEX = /^[^\\]+\\(.+)$/;
const MCC_IN_TEXT_REGEX = /\bMCC\s*:?\s*(\d{4})\b/i;
/** «Категория: Перевод по СБП.Перевод C17…» */
const DESCRIPTION_CATEGORY_REGEX = /^Категория:\s*([^.]+)\./i;
/** «Внутрибанковский перевод между счетами, Смирнов А. В..Со счёта 40817… на счёт 30601…» */
const OWN_ACCOUNTS_TRANSFER_REGEX = /Со\s+сч[её]та\s+(\d{20})\s+на\s+сч[её]т\s+(\d{20})/i;
/** Так называет переводы между своими счетами выписка из «Истории» — одна категория для обоих форматов. */
const OWN_ACCOUNTS_TRANSFER_CATEGORY = "Между своими счетами";

const COUNTERPARTY_PATTERNS: RegExp[] = [
  /в\s+пользу\s+(.+?)(?:,|$)/i,
  /Платеж\s+\S+\s+в\s+(.+?)\s+через\s+Систему\s+быстрых\s+платежей/i,
  /Перевод\s+(?:клиенту|от\s+клиента)\s+(.+?)(?:\s+по\s+номеру|\.\s|\.?$)/i,
  /от\s+отправителя\s+(.+?)(?:\.\s|\.?$)/i,
];

type ParsedDescription = { counterparty: string; mcc: string; category: string };

function normalizeHeader(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/ё/g, "е")
    .toLocaleLowerCase("ru");
}

function mapColumns(header: unknown[]): Map<ColumnKey, number> | null {
  const normalized = header.map((cell) => normalizeHeader(String(cell ?? "")));
  const map = new Map<ColumnKey, number>();
  for (const key of Object.keys(COLUMN_ALIASES) as ColumnKey[]) {
    const idx = normalized.findIndex((cell) => COLUMN_ALIASES[key].includes(cell));
    if (idx >= 0) map.set(key, idx);
  }
  const recognized =
    (map.has("operationDate") || map.has("postingDate")) &&
    map.has("description") &&
    map.has("amount");
  return recognized ? map : null;
}

function cleanText(value: unknown): string {
  if (value == null) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

function cellText(row: unknown[], columns: Map<ColumnKey, number>, key: ColumnKey): string {
  const index = columns.get(key);
  return index == null ? "" : cleanText(row[index]);
}

function cellRaw(row: unknown[], columns: Map<ColumnKey, number>, key: ColumnKey): unknown {
  const index = columns.get(key);
  return index == null ? "" : (row[index] ?? "");
}

function formatDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Даты в выписке — строки «13.10.2026»; на случай пересохранения в Excel принимаем и дату-число. */
function parseDateKey(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatDateKey(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    return parsed ? formatDateKey(parsed.y, parsed.m, parsed.d) : null;
  }
  const text = String(value ?? "").trim();
  const ru = /^(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(text);
  if (ru) return formatDateKey(Number(ru[3]), Number(ru[2]), Number(ru[1]));
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text);
  if (iso) return formatDateKey(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  return null;
}

/** «-1 332,92», «6 057,70 RUR», 5527 → число. */
function parseAmount(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const normalized = String(value ?? "")
    .replace(/[A-Za-zА-Яа-я]+\s*$/, "")
    .replace(/[\s\u00A0]/g, "")
    .replace(/\u2212/g, "-")
    .replace(",", ".");
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(normalized)) return null;
  return Number(normalized);
}

function normalizeCurrency(value: string): string {
  const code = value.trim().toUpperCase();
  if (!code || code === "RUR") return "RUB";
  return code;
}

/** Последний сегмент «RU/MOSCOW/DOSTAVKA» или «KZ\Almaty\AviaCenter» — сам продавец. */
function merchantFromPlace(place: string): string {
  const segments = place.split(/[\\/]/).map((s) => s.trim()).filter(Boolean);
  return segments[segments.length - 1] ?? "";
}

/** Второй счёт перевода: тот из пары «со счёта / на счёт», что не совпадает со счётом выписки. */
function extractCounterAccount(description: string, ownAccount: string, isIncome: boolean): string {
  const m = OWN_ACCOUNTS_TRANSFER_REGEX.exec(description);
  if (!m) return "";
  const [, from, to] = m;
  if (from === ownAccount) return to === ownAccount ? "" : to;
  if (to === ownAccount) return from;
  return isIncome ? from : to;
}

function parseDescription(description: string, hasCardColumn: boolean): ParsedDescription {
  const mcc = description.match(MCC_IN_TEXT_REGEX)?.[1] ?? "";
  const category = description.match(DESCRIPTION_CATEGORY_REGEX)?.[1]?.trim() ?? "";

  const place =
    description.match(CARD_PLACE_REGEX)?.[1] ?? description.match(RAW_CARD_LINE_REGEX)?.[1];
  if (place) return { counterparty: merchantFromPlace(place), mcc, category };

  for (const pattern of COUNTERPARTY_PATTERNS) {
    const m = description.match(pattern);
    if (m?.[1]) {
      return { counterparty: m[1].trim().replace(/\.+$/, "").trim(), mcc, category };
    }
  }

  // В «Истории» описание — уже короткое имя получателя («ГАИ (ШТРАФЫ)», «Антон С.»),
  // а в «Выписке по счету» это длинный уникальный текст, который засорил бы список контрагентов.
  if (hasCardColumn) {
    const cityMerchant = CITY_MERCHANT_REGEX.exec(description);
    return { counterparty: cityMerchant ? cityMerchant[1].trim() : description, mcc, category };
  }
  return { counterparty: "", mcc, category };
}

type StatementHeader = {
  accountNumber: string;
  currency: string;
  generatedDateKey: string;
  balance: number | null;
};

/** Значение справа от подписи в шапке «Выписки по счету» («Номер счета» | | «40817…»). */
function readHeader(rows: unknown[][], headerRowIndex: number): StatementHeader {
  const header: StatementHeader = { accountNumber: "", currency: "", generatedDateKey: "", balance: null };
  for (let r = 0; r < headerRowIndex; r++) {
    const row = rows[r] ?? [];
    for (let c = 0; c < row.length; c++) {
      const label = normalizeHeader(String(row[c] ?? ""));
      if (!label) continue;
      const value = row.slice(c + 1).find((cell) => cleanText(cell) !== "");
      if (value == null) continue;
      if (label === "номер счета") header.accountNumber = cleanText(value);
      else if (label === "валюта счета") header.currency = cleanText(value);
      else if (label === "дата формирования выписки") header.generatedDateKey = parseDateKey(value) ?? "";
      else if (label === "текущий баланс") header.balance = parseAmount(value);
    }
  }
  return header;
}

export async function parseAlfaXlsxFile(file: File): Promise<DzenParsedData> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("Файл не содержит листов.");
  }
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    blankrows: false,
    defval: "",
  }) as unknown[][];

  let headerRowIndex = -1;
  let columns: Map<ColumnKey, number> | null = null;
  for (let r = 0; r < Math.min(rows.length, 40); r++) {
    const mapped = mapColumns(rows[r] ?? []);
    if (mapped) {
      headerRowIndex = r;
      columns = mapped;
      break;
    }
  }
  if (headerRowIndex < 0 || !columns) {
    throw new Error(`Файл не соответствует формату выписки Альфа-Банка. ${FORMAT_HINT}`);
  }

  const statementHeader = readHeader(rows, headerRowIndex);
  const hasCardColumn = columns.has("cardNumber");

  const accountsMap = new Map<string, DzenParsedAccount>();
  const categoriesSet = new Set<string>();
  const counterpartiesSet = new Set<string>();
  const transactions: DzenParsedTransaction[] = [];

  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const rowNumber = i + 1;
    if (!row.some((cell) => cleanText(cell) !== "")) continue;

    const dateKey =
      parseDateKey(cellRaw(row, columns, "operationDate")) ??
      parseDateKey(cellRaw(row, columns, "postingDate"));
    const amount = parseAmount(cellRaw(row, columns, "amount"));

    // Подпись сотрудника, номер страницы и заголовки разделов.
    if (!dateKey && amount == null) {
      if (PENDING_SECTION_REGEX.test(cleanText(row[0]))) break;
      continue;
    }
    if (!dateKey) {
      throw new Error(`Строка ${rowNumber}: не удалось распознать дату операции.`);
    }
    if (amount == null) {
      throw new Error(`Строка ${rowNumber}: не удалось распознать сумму операции.`);
    }
    if (amount === 0) continue;
    if (SKIPPED_STATUS_REGEX.test(cellText(row, columns, "status"))) continue;

    const typeText = cellText(row, columns, "type").toLocaleLowerCase("ru");
    const isIncome = typeText.startsWith("пополн")
      ? true
      : typeText.startsWith("списан")
        ? false
        : amount > 0;
    const amountCents = Math.round(Math.abs(amount) * 100);

    const accountName =
      cellText(row, columns, "accountNumber") ||
      statementHeader.accountNumber ||
      cellText(row, columns, "accountName") ||
      "Счёт";
    const currency = normalizeCurrency(
      cellText(row, columns, "currency") || statementHeader.currency
    );
    const key = `${accountName}|${currency}`;
    if (!accountsMap.has(key)) {
      accountsMap.set(key, { name: accountName, currency });
    }

    const description = cellText(row, columns, "description");
    const parsed = parseDescription(description, hasCardColumn);
    const counterAccountName = extractCounterAccount(description, accountName, isIncome);
    const mcc = cellText(row, columns, "mcc") || parsed.mcc;
    const bankCategory = cellText(row, columns, "category");
    // В «Выписке по счету» столбец «Категория» почти всегда «Прочие операции», точнее MCC и «Категория:» из описания.
    const categoryCandidates = counterAccountName
      ? [OWN_ACCOUNTS_TRANSFER_CATEGORY]
      : hasCardColumn
        ? [bankCategory, mcc ? formatMccCategoryForImport(mcc) : ""]
        : [mcc ? formatMccCategoryForImport(mcc) : "", parsed.category, bankCategory];
    const category =
      categoryCandidates.find(Boolean) ||
      (isIncome ? IMPORT_DEFAULT_CATEGORY_INCOME : IMPORT_DEFAULT_CATEGORY_EXPENSE);
    categoriesSet.add(category);

    const counterparty = parsed.counterparty;
    if (counterparty) counterpartiesSet.add(counterparty);
    const comment = [description, cellText(row, columns, "comment")].filter(Boolean).join(" · ");

    if (isIncome) {
      transactions.push({
        date: dateKey,
        time: "00:00:00",
        categoryName: category,
        counterparty,
        comment,
        outcomeAccountName: "",
        outcome: null,
        outcomeCurrency: "",
        incomeAccountName: accountName,
        income: amountCents,
        incomeCurrency: currency,
        type: "income",
        amount: amountCents,
        ...(counterAccountName ? { counterAccountName } : {}),
      });
    } else {
      transactions.push({
        date: dateKey,
        time: "00:00:00",
        categoryName: category,
        counterparty,
        comment,
        outcomeAccountName: accountName,
        outcome: amountCents,
        outcomeCurrency: currency,
        incomeAccountName: "",
        income: null,
        incomeCurrency: "",
        type: "expense",
        amount: amountCents,
        ...(counterAccountName ? { counterAccountName } : {}),
      });
    }
  }

  if (transactions.length === 0) {
    throw new Error("В выписке не найдено операций для импорта.");
  }

  transactions.sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));

  const balanceCheckpointCandidates: BalanceCheckpointCandidate[] = [];
  if (
    statementHeader.balance != null &&
    statementHeader.generatedDateKey &&
    statementHeader.accountNumber
  ) {
    const currency = normalizeCurrency(statementHeader.currency);
    balanceCheckpointCandidates.push({
      accountKey: `${statementHeader.accountNumber}|${currency}`,
      balanceCents: Math.round(statementHeader.balance * 100),
      dateKey: statementHeader.generatedDateKey,
      time: "23:59:00",
    });
  }

  return {
    accounts: Array.from(accountsMap.values()),
    categories: Array.from(categoriesSet).map((name) => ({ name })),
    counterparties: Array.from(counterpartiesSet).map((name) => ({ name })),
    transactions,
    balanceCheckpointCandidates,
  };
}
