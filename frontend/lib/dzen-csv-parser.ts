/**
 * Парсер выгрузки Дзен-мани (CSV).
 * Формат: date, categoryName, payee, comment, outcomeAccountName, outcome,
 * outcomeCurrencyShortTitle, incomeAccountName, income, incomeCurrencyShortTitle,
 * createdDate, changedDate
 * Дата может быть "YYYY-MM-DD" или "YYYY-MM-DDTHH:mm:ss"; время можно взять из колонки time или createdDate.
 */

export type DzenParsedAccount = {
  name: string;
  currency: string;
};

export type DzenParsedCategory = {
  name: string;
};

export type DzenParsedCounterparty = {
  name: string;
};

export type DzenTransactionType = "expense" | "income" | "transfer";

export type DzenParsedTransaction = {
  date: string;
  /** Время в формате HH:mm или HH:mm:ss; при отсутствии — "00:00:00" */
  time: string;
  categoryName: string;
  counterparty: string;
  comment: string;
  outcomeAccountName: string;
  /** Сумма расхода в копейках (целое число) */
  outcome: number | null;
  outcomeCurrency: string;
  incomeAccountName: string;
  /** Сумма дохода в копейках (целое число) */
  income: number | null;
  incomeCurrency: string;
  type: DzenTransactionType;
  /** Сумма операции в копейках (целое число) */
  amount: number;
};

/** Нормализует время до HH:mm:ss для сортировки и API */
function normalizeTime(s: string): string {
  const t = (s ?? "").trim();
  if (!t) return "00:00:00";
  const parts = t.split(/[T\s]/);
  const timePart = parts.find((p) => /^\d{1,2}:\d{2}/.test(p)) ?? t;
  const [h, m, sec] = timePart.split(":");
  const hh = String(Number(h) || 0).padStart(2, "0");
  const mm = String(Number(m) || 0).padStart(2, "0");
  const ss = sec != null ? String(Number(sec) || 0).padStart(2, "0") : "00";
  return `${hh}:${mm}:${ss}`;
}

/** Ключ для хронологической сортировки и для API: YYYY-MM-DDTHH:mm:ss */
export function getTransactionDateTimeSortKey(tx: DzenParsedTransaction): string {
  return `${tx.date}T${normalizeTime(tx.time)}`;
}

export type DzenParsedData = {
  accounts: DzenParsedAccount[];
  categories: DzenParsedCategory[];
  counterparties: DzenParsedCounterparty[];
  transactions: DzenParsedTransaction[];
};

/** Имя счёта «Долги» в выгрузке Дзен-мани — такой счёт не импортируется, операции с ним обрабатываются отдельно */
export const DZEN_DEBTS_ACCOUNT_NAME = "Долги";

/** Категории по умолчанию при импорте, если категория не определена (пустая). */
export const IMPORT_DEFAULT_CATEGORY_EXPENSE = "Прочие расходы / Прочие расходы";
export const IMPORT_DEFAULT_CATEGORY_INCOME = "Прочие доходы / Прочие доходы";

/** Имя синтетической категории для операций с пустой категорией — показывается карточкой на шаге маппинга. */
export const IMPORT_UNDEFINED_CATEGORY_NAME = "Категория не определена";

/**
 * Если в выгрузке есть транзакции с пустой категорией, добавляет в categories запись
 * «Категория не определена» и проставляет её таким операциям, чтобы на шаге маппинга
 * отображалась карточка для привязки или создания категории.
 */
export function normalizeParsedDataUndefinedCategory(
  data: DzenParsedData
): DzenParsedData {
  const hasEmpty =
    data.transactions?.some(
      (tx) => !(tx.categoryName ?? "").trim()
    ) ?? false;
  if (!hasEmpty || !data.transactions?.length) return data;

  const undef = IMPORT_UNDEFINED_CATEGORY_NAME;
  const categories = data.categories ?? [];
  const hasUndef = categories.some((c) => c.name === undef);
  const newCategories = hasUndef
    ? categories
    : [...categories, { name: undef }];

  const newTransactions = data.transactions.map((tx) =>
    (tx.categoryName ?? "").trim()
      ? tx
      : { ...tx, categoryName: undef }
  );

  return {
    ...data,
    categories: newCategories,
    transactions: newTransactions,
  };
}

export function isDzenDebtsAccount(account: { name: string }): boolean {
  return (account.name ?? "").trim() === DZEN_DEBTS_ACCOUNT_NAME;
}

/** Парсит строку CSV с учётом кавычек и escaped-кавычек; разделитель — запятая или точка с запятой */
function parseCSVLine(line: string, delimiter: "," | ";" = ","): string[] {
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
    } else if (c === delimiter && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += c;
    }
  }
  result.push(current);
  return result;
}

/** Преобразует строку суммы "2945,08" (рубли) в копейки (целое число). */
function parseAmountToCents(value: string): number | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  const normalized = trimmed.replace(",", ".");
  const num = parseFloat(normalized);
  if (Number.isNaN(num)) return null;
  return Math.round(num * 100);
}

/** Проверяет, заполнено ли значение (не пустая строка) */
function isFilled(value: string): boolean {
  return (value?.trim() ?? "").length > 0;
}

export function parseDzenCSV(text: string): DzenParsedData {
  const normalizedText = text.replace(/^\uFEFF/, "");
  const lines = normalizedText.split(/\r?\n/);
  const accountsMap = new Map<string, DzenParsedAccount>();
  const categoriesSet = new Set<string>();
  const counterpartiesSet = new Set<string>();
  const transactions: DzenParsedTransaction[] = [];

  let headerLineIndex = -1;
  let headerColumns: string[] = [];
  let delimiter: "," | ";" = ",";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    let cells: string[];
    if (headerLineIndex < 0) {
      const bySemicolon = parseCSVLine(line, ";");
      const isHeaderSemicolon =
        bySemicolon.length >= 10 &&
        bySemicolon[0]?.trim() === "date" &&
        bySemicolon[1]?.trim() === "categoryName";
      if (isHeaderSemicolon) {
        delimiter = ";";
        cells = bySemicolon;
      } else {
        cells = parseCSVLine(line, ",");
      }
    } else {
      cells = parseCSVLine(line, delimiter);
    }
    if (cells.length < 10) continue;

    if (cells[0]?.trim() === "date" && cells[1]?.trim() === "categoryName") {
      headerLineIndex = i;
      headerColumns = cells;
      continue;
    }

    if (headerLineIndex < 0) continue;

    const getCol = (name: string): string => {
      const idx = headerColumns.indexOf(name);
      return idx >= 0 ? (cells[idx] ?? "").trim() : "";
    };

    let date = getCol("date");
    let timeStr = "00:00:00";
    if (date.includes("T")) {
      const [d, t] = date.split("T");
      if (d) date = d;
      if (t) timeStr = normalizeTime(t);
    } else {
      const timeCol = getCol("time");
      const createdDate = getCol("createdDate");
      if (timeCol) timeStr = normalizeTime(timeCol);
      else if (createdDate && createdDate.includes("T")) {
        const t = createdDate.split("T")[1];
        if (t) timeStr = normalizeTime(t);
      }
    }
    const categoryName = getCol("categoryName");
    const payee = getCol("payee");
    const comment = getCol("comment");
    const outcomeAccountName = getCol("outcomeAccountName");
    const outcomeStr = getCol("outcome");
    const outcomeCurrency = getCol("outcomeCurrencyShortTitle") || "RUB";
    const incomeAccountName = getCol("incomeAccountName");
    const incomeStr = getCol("income");
    const incomeCurrency = getCol("incomeCurrencyShortTitle") || "RUB";

    const outcome = parseAmountToCents(outcomeStr);
    const income = parseAmountToCents(incomeStr);

    const hasOutcome = isFilled(outcomeStr) && outcome != null && outcome !== 0;
    const hasIncome = isFilled(incomeStr) && income != null && income !== 0;

    let type: DzenTransactionType;
    let amount: number;

    if (hasOutcome && hasIncome) {
      type = "transfer";
      amount = outcome ?? income ?? 0;
    } else if (hasOutcome) {
      type = "expense";
      amount = outcome ?? 0;
    } else if (hasIncome) {
      type = "income";
      amount = income ?? 0;
    } else {
      continue;
    }

    if (isFilled(outcomeAccountName)) {
      const key = `${outcomeAccountName}|${outcomeCurrency}`;
      if (!accountsMap.has(key)) {
        accountsMap.set(key, { name: outcomeAccountName, currency: outcomeCurrency });
      }
    }
    if (isFilled(incomeAccountName)) {
      const key = `${incomeAccountName}|${incomeCurrency}`;
      if (!accountsMap.has(key)) {
        accountsMap.set(key, { name: incomeAccountName, currency: incomeCurrency });
      }
    }
    // Категорию и контрагента по переводам не выводим на шагах маппинга
    const effectiveCategory =
      type === "transfer"
        ? categoryName
        : isFilled(categoryName)
          ? categoryName
          : type === "expense"
            ? IMPORT_DEFAULT_CATEGORY_EXPENSE
            : IMPORT_DEFAULT_CATEGORY_INCOME;
    if (type !== "transfer") {
      categoriesSet.add(effectiveCategory);
      if (isFilled(payee)) {
        counterpartiesSet.add(payee);
      }
    }

    transactions.push({
      date,
      time: timeStr,
      categoryName: effectiveCategory,
      counterparty: payee,
      comment,
      outcomeAccountName,
      outcome: hasOutcome ? (outcome ?? 0) : null,
      outcomeCurrency,
      incomeAccountName,
      income: hasIncome ? (income ?? 0) : null,
      incomeCurrency,
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

export async function parseDzenCSVFile(file: File): Promise<DzenParsedData> {
  const text = await file.text();
  return parseDzenCSV(text);
}
