/**
 * Парсер выписки Озон Банка (PDF). Справка о движении средств.
 * Механизм как у Сбера/Альфы: границы операций по содержимому (дата в строке),
 * накопление назначения целыми строками до следующей даты, дата/время и сумма — по данным (регулярки).
 * Счёт — из шапки («Номер лицевого счёта: № …», последние 4 цифры как ****XXXX).
 * Категория и контрагент — из поля «Назначение платежа».
 */

import { getDocument } from "pdfjs-dist";
import { ensurePdfWorkerSrc } from "./pdf-worker";
import type {
  DzenParsedData,
  DzenParsedAccount,
  DzenParsedTransaction,
  BalanceCheckpointCandidate,
} from "@/lib/dzen-csv-parser";
import {
  IMPORT_DEFAULT_CATEGORY_EXPENSE,
  IMPORT_DEFAULT_CATEGORY_INCOME,
} from "@/lib/dzen-csv-parser";
import type { PdfTextItem } from "./pdf-utils";
import {
  buildPdfLines,
  normalizePdfText,
  parsePdfAmount,
} from "./pdf-utils";

const OZON_DATE_REGEX = /\b(\d{2})\.(\d{2})\.(\d{4})\b/;
const OZON_TIME_REGEX = /\b(\d{2}):(\d{2}):(\d{2})\b/;
/** Время HH:mm (без секунд), например в «Дата и время формирования документа» */
const OZON_TIME_SHORT_REGEX = /\b(\d{2}):(\d{2})\b(?!\d)/;
/** Сумма только с явным знаком: перед числом обязательно «+» или «-», чтобы не путать с датой (25.02.2026). */
const OZON_SIGNED_AMOUNT_REGEX = /[+\-\u2212]\s*\d+(?:[ \u00A0]\d{3})*[.,]\d{2}/g;
/** Число с десятичной частью в конце строки (для «Исходящий остаток» может быть 0 или 0,00 без знака) */
const OZON_BALANCE_NUMBER_REGEX = /\b(\d+(?:[ \u00A0]\d{3})*)([.,](\d{2}))?\s*$/;
const OZON_ACCOUNT_REGEX = /лицевого\s+счёта\s*:?\s*№?\s*([\d\s]+)/i;
const OZON_ACCOUNT_REGEX_ALT = /лицевого\s+счета\s*:?\s*№?\s*([\d\s]+)/i;
const OZON_ACCOUNT_REGEX_NUM = /(?:номер\s+)?(?:лицевого\s+)?счет[ау]\s*:?\s*№?\s*([\d\s]{4,})/i;

/** Ищем только суммы с явным «+» или «-» перед числом (как в колонке «Валюта»), чтобы не брать дату. */
function matchSignedAmounts(text: string): RegExpMatchArray | null {
  OZON_SIGNED_AMOUNT_REGEX.lastIndex = 0;
  return text.match(OZON_SIGNED_AMOUNT_REGEX);
}

function getLastAmountStr(text: string): string {
  const m = matchSignedAmounts(text);
  if (!m || m.length === 0) return "";
  return m[m.length - 1];
}

function removeAmountsFromText(text: string): string {
  OZON_SIGNED_AMOUNT_REGEX.lastIndex = 0;
  return text.replace(OZON_SIGNED_AMOUNT_REGEX, " ").trim();
}

function extractAccountFromHeader(lineText: string): string {
  const m =
    lineText.match(OZON_ACCOUNT_REGEX) ||
    lineText.match(OZON_ACCOUNT_REGEX_ALT) ||
    lineText.match(OZON_ACCOUNT_REGEX_NUM);
  if (!m || !m[1]) return "";
  const digits = m[1].replace(/\s/g, "");
  if (digits.length < 4) return "";
  return `****${digits.slice(-4)}`;
}

function parseOzonDate(dateStr: string): { dateKey: string; time: string } {
  const dateM = dateStr.match(OZON_DATE_REGEX);
  if (!dateM) return { dateKey: "", time: "00:00:00" };
  const [, d, month, y] = dateM;
  const dateKey = `${y}-${month}-${d}`;
  const timeM = dateStr.match(OZON_TIME_REGEX);
  if (timeM) {
    const [, hh, mm, ss] = timeM;
    return { dateKey, time: `${hh}:${mm}:${ss}` };
  }
  const timeShortM = dateStr.match(OZON_TIME_SHORT_REGEX);
  if (timeShortM) {
    const [, hh, mm] = timeShortM;
    return { dateKey, time: `${hh}:${mm}:00` };
  }
  return { dateKey, time: "00:00:00" };
}

/** Извлечь дату и время из строки (для блока операции). */
function extractDateTimeFromLine(lineText: string): string {
  const dateM = lineText.match(OZON_DATE_REGEX);
  const timeM = lineText.match(OZON_TIME_REGEX);
  const datePart = dateM ? dateM[0] : "";
  const timePart = timeM ? timeM[0] : "";
  return [datePart, timePart].filter(Boolean).join(" ");
}

/** Если в начале текста время HH:mm:ss (перенос из ячейки даты), извлечь и убрать из назначения. */
function extractTimeFromPurposeStart(purposeText: string): { time: string; purposeWithoutTime: string } {
  const timeAtStart = purposeText.match(/^\s*(\d{2}):(\d{2}):(\d{2})\b/);
  if (!timeAtStart) return { time: "00:00:00", purposeWithoutTime: purposeText };
  const [, hh, mm, ss] = timeAtStart;
  const rest = purposeText.slice(timeAtStart[0].length).trim();
  return { time: `${hh}:${mm}:${ss}`, purposeWithoutTime: rest };
}

const CATEGORY_OPLATA_OZON = "Покупки Ozon";
const CATEGORY_PEREWOD_SBP = "Перевод СБП";
const CATEGORY_VOZVRAT_OZON = "Возврат Ozon";
const COUNTERPARTY_OZON = "Платформа Ozon";
const COUNTERPARTY_SBP = "СБП";

function parsePurposeOzon(
  purposeText: string,
  isIncome: boolean
): { category: string; counterparty: string } {
  const normalized = normalizePdfText(purposeText).toLowerCase();
  let category: string;
  let counterparty: string;

  if (normalized.includes("оплата товаров") && normalized.includes("платформ") && normalized.includes("ozon")) {
    category = CATEGORY_OPLATA_OZON;
    counterparty = COUNTERPARTY_OZON;
  } else if (normalized.includes("перевод") && normalized.includes("сбп")) {
    category = CATEGORY_PEREWOD_SBP;
    counterparty = COUNTERPARTY_SBP;
  } else if (normalized.includes("возврат оплаты") && (normalized.includes("ozon") || normalized.includes("платформ"))) {
    category = CATEGORY_VOZVRAT_OZON;
    counterparty = COUNTERPARTY_OZON;
  } else {
    category = isIncome ? IMPORT_DEFAULT_CATEGORY_INCOME : IMPORT_DEFAULT_CATEGORY_EXPENSE;
    counterparty = "";
  }

  return { category, counterparty };
}

function isOpeningBalanceOrNonOperation(purposeText: string, amountCents: number): boolean {
  const n = normalizePdfText(purposeText).toLowerCase();
  if (n.includes("входящий остаток")) return true;
  if (n.includes("исходящий остаток")) return true;
  if (n.includes("дата открытия") || n.includes("открытие счета") || n.includes("открытие счёта")) return true;
  if (n.includes("остаток на начало") || n.includes("начало периода")) return true;
  if (n.includes("период выписки")) return true;
  if (amountCents === 0 && n.length < 5) return true;
  return false;
}

export async function parseOzonPdfFile(file: File): Promise<DzenParsedData> {
  ensurePdfWorkerSrc();
  const buffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: buffer }).promise;
  const accountsMap = new Map<string, DzenParsedAccount>();
  const categoriesSet = new Set<string>();
  const counterpartiesSet = new Set<string>();
  const rows: Array<{
    dateKey: string;
    time: string;
    accountName: string;
    currency: string;
    category: string;
    counterparty: string;
    comment: string;
    amountCents: number;
    isIncome: boolean;
  }> = [];

  let headerAccountName = "Счёт";
  const defaultCurrency = "RUB";

  let periodEndDateKey = "";
  let documentDateKey = "";
  let documentTime = "23:59:00";
  let outgoingBalanceCents: number | null = null;

  const stopPhrases = [
    "озон банк",
    "справка о движении средств",
    "период выписки",
    "входящий остаток",
    "дата и время формирования документа",
    "владелец",
  ];

  for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
    const page = await pdf.getPage(pageIndex);
    const textContent = await page.getTextContent();
    const rawItems = textContent.items as unknown[];
    const items = rawItems.filter((item): item is PdfTextItem => {
      if (!item || typeof item !== "object") return false;
      const c = item as PdfTextItem;
      return typeof c.str === "string" && Array.isArray(c.transform);
    });
    const lines = buildPdfLines(items);

    // Проход по полному тексту страницы: дата/время и остаток могут быть на разных строках
    const fullPageText = lines
      .map((l) => normalizePdfText(l.items.map((i) => i.text).join(" ")))
      .join("\n");
    const fullPageLower = fullPageText.toLowerCase();

    if (!documentDateKey && fullPageLower.includes("дата и время формирования")) {
      const docDateM = fullPageText.match(
        /дата\s+и\s+время\s+формирования\s*(?:документа)?\s*[:\s]*[\s\S]*?(\d{2})\.(\d{2})\.(\d{4})[\s\S]*?(\d{1,2})\s*:\s*(\d{2})(?:\s*:\s*(\d{2}))?/i
      );
      if (docDateM) {
        const [, d, m, y, hh, mm, ss] = docDateM;
        if (d && m && y) {
          documentDateKey = `${y}-${m}-${d}`;
          documentTime = ss != null ? `${String(hh).padStart(2, "0")}:${mm}:${ss}` : `${String(hh).padStart(2, "0")}:${mm}:00`;
        }
      }
      // Дата/время на разных строках: ищем дату и время по отдельности в блоке после заголовка
      if (!documentDateKey || !documentTime) {
        const idx = fullPageLower.indexOf("дата и время формирования");
        const chunk = fullPageText.slice(idx, idx + 200);
        if (!documentDateKey) {
          const dateInChunk = chunk.match(OZON_DATE_REGEX);
          if (dateInChunk) {
            const [, d, m, y] = dateInChunk;
            if (d && m && y) documentDateKey = `${y}-${m}-${d}`;
          }
        }
        if (!documentTime) {
          const timeFull = chunk.match(OZON_TIME_REGEX);
          if (timeFull) {
            const [, hh, mm, ss] = timeFull;
            documentTime = `${hh}:${mm}:${ss}`;
          } else {
            const timeShort = chunk.match(OZON_TIME_SHORT_REGEX);
            if (timeShort) {
              const [, hh, mm] = timeShort;
              documentTime = `${hh}:${mm}:00`;
            }
          }
        }
      }
    }
    if (!periodEndDateKey && fullPageLower.includes("период выписки")) {
      const periodM = fullPageText.match(/по\s+(\d{2})\.(\d{2})\.(\d{4})\b/i);
      if (periodM) {
        const [, d, m, y] = periodM;
        if (d && m && y) periodEndDateKey = `${y}-${m}-${d}`;
      }
      if (!periodEndDateKey) {
        const allDates = fullPageText.match(/\d{2}\.\d{2}\.\d{4}/g);
        if (allDates && allDates.length > 0) {
          const last = allDates[allDates.length - 1]!;
          const [dd, mm, yy] = last.split(".");
          if (dd && mm && yy) periodEndDateKey = `${yy}-${mm}-${dd}`;
        }
      }
    }
    if (outgoingBalanceCents === null && fullPageLower.includes("исходящий остаток")) {
      const idx = fullPageLower.indexOf("исходящий остаток");
      const afterOutgoing = fullPageText.slice(idx + "исходящий остаток".length, idx + 450);
      const amountM = afterOutgoing.match(/(\d+)([.,](\d{2}))?/g);
      if (amountM && amountM.length > 0) {
        const lastAmount = amountM[amountM.length - 1]!.replace(/\s/g, "");
        const normalized = lastAmount.replace(",", ".");
        const num = parseFloat(normalized);
        if (Number.isFinite(num)) outgoingBalanceCents = Math.round(num * 100);
      }
    }

    let inOperations = false;
    let currentRow: {
      dateTime: string;
      purposeLines: string[];
      amountText: string;
    } | null = null;

    function flushRow() {
      if (!currentRow) return;
      const amountMeta = parsePdfAmount(currentRow.amountText);
      if (!amountMeta) return;
      const fullPurpose = currentRow.purposeLines
        .map((s) => s.trim())
        .filter(Boolean)
        .join(" ");
      if (isOpeningBalanceOrNonOperation(fullPurpose, amountMeta.amountCents)) return;
      const { dateKey, time: timeParsed } = parseOzonDate(currentRow.dateTime);
      if (!dateKey) return;
      let time = timeParsed;
      let comment = normalizePdfText(fullPurpose);
      if (time === "00:00:00") {
        const extracted = extractTimeFromPurposeStart(comment);
        time = extracted.time;
        comment = extracted.purposeWithoutTime.trim();
      }
      const { category, counterparty } = parsePurposeOzon(comment, amountMeta.isIncome);
      categoriesSet.add(category);
      if (counterparty) counterpartiesSet.add(counterparty);
      const key = `${headerAccountName}|${defaultCurrency}`;
      if (!accountsMap.has(key)) {
        accountsMap.set(key, { name: headerAccountName, currency: defaultCurrency });
      }
      rows.push({
        dateKey,
        time,
        accountName: headerAccountName,
        currency: defaultCurrency,
        category,
        counterparty,
        comment: normalizePdfText(comment),
        amountCents: amountMeta.amountCents,
        isIncome: amountMeta.isIncome,
      });
    }

    for (const line of lines) {
      const lineText = normalizePdfText(
        line.items.map((item) => item.text).join(" ")
      );
      if (!lineText) continue;
      const lineTextLower = lineText.toLowerCase();

      if (pageIndex === 1 && headerAccountName === "Счёт") {
        const acc = extractAccountFromHeader(lineText);
        if (acc) headerAccountName = acc;
      }

      if (lineTextLower.includes("период выписки")) {
        const periodEndM = lineText.match(/по\s+(\d{2})\.(\d{2})\.(\d{4})\b/i) ?? lineText.match(/(\d{2})\.(\d{2})\.(\d{4})\s*$/);
        if (periodEndM) {
          const [, d, m, y] = periodEndM;
          if (d && m && y) periodEndDateKey = `${y}-${m}-${d}`;
        } else {
          const allDates = lineText.match(OZON_DATE_REGEX);
          if (allDates && allDates.length > 0) {
            const lastDate = allDates[allDates.length - 1]!;
            const parts = lastDate.split(".");
            if (parts.length === 3) periodEndDateKey = `${parts[2]}-${parts[1]}-${parts[0]}`;
          }
        }
      }
      if (lineTextLower.includes("дата и время формирования")) {
        const dt = parseOzonDate(lineText);
        if (dt.dateKey) {
          documentDateKey = dt.dateKey;
          documentTime = dt.time;
        }
      }
      if (lineTextLower.includes("исходящий остаток")) {
        let amountStr = getLastAmountStr(lineText);
        if (!amountStr) {
          const balanceM = lineText.match(OZON_BALANCE_NUMBER_REGEX);
          if (balanceM) {
            const numPart = (balanceM[1] ?? "").replace(/\s/g, "");
            const decPart = balanceM[3] ?? "00";
            amountStr = `+${numPart},${decPart}`;
          }
        }
        const meta = amountStr ? parsePdfAmount(amountStr) : null;
        if (meta) outgoingBalanceCents = meta.amountCents;
        currentRow = null;
        continue;
      }

      const isTableHeader =
        lineTextLower.includes("дата операции") && lineTextLower.includes("документ");
      if (isTableHeader || lineTextLower.includes("сумма операции") && lineTextLower.includes("рубл")) {
        inOperations = true;
        continue;
      }

      if (stopPhrases.some((p) => lineTextLower.includes(p))) {
        currentRow = null;
        continue;
      }

      if (!inOperations) continue;

      const hasDate = OZON_DATE_REGEX.test(lineText);
      const amountStr = getLastAmountStr(lineText);

      if (hasDate) {
        flushRow();
        const dateTime = extractDateTimeFromLine(lineText);
        if (!dateTime) continue;
        const purposeWithoutDateAndAmount = removeAmountsFromText(lineText)
          .replace(OZON_DATE_REGEX, " ")
          .replace(OZON_TIME_REGEX, " ")
          .trim();
        let amountText = amountStr ?? "";
        if (!amountText) {
          const fallback = matchSignedAmounts(lineText);
          amountText = fallback && fallback.length > 0 ? fallback[fallback.length - 1] : "";
        }
        currentRow = {
          dateTime,
          purposeLines: purposeWithoutDateAndAmount ? [purposeWithoutDateAndAmount] : [],
          amountText,
        };
        continue;
      }

      if (!currentRow) continue;

      if (amountStr && !currentRow.amountText) {
        currentRow.amountText = amountStr;
        const purposePart = removeAmountsFromText(lineText).trim();
        if (purposePart) currentRow.purposeLines.push(purposePart);
      } else {
        currentRow.purposeLines.push(lineText);
      }
    }

    flushRow();
  }

  if (accountsMap.size === 0) {
    accountsMap.set(`${headerAccountName}|${defaultCurrency}`, {
      name: headerAccountName,
      currency: defaultCurrency,
    });
  }

  const accounts = Array.from(accountsMap.values());
  const categories = Array.from(categoriesSet).map((name) => ({ name }));
  const counterparties = Array.from(counterpartiesSet).map((name) => ({ name }));

  const transactions: DzenParsedTransaction[] = rows.map((r) => {
    const acc = accountsMap.get(`${r.accountName}|${r.currency}`);
    const accountName = acc?.name ?? r.accountName;
    if (r.isIncome) {
      return {
        date: r.dateKey,
        time: r.time,
        categoryName: r.category,
        counterparty: r.counterparty,
        comment: r.comment,
        outcomeAccountName: "",
        outcome: null,
        outcomeCurrency: "",
        incomeAccountName: accountName,
        income: r.amountCents,
        incomeCurrency: r.currency,
        type: "income" as const,
        amount: r.amountCents,
      };
    }
    return {
      date: r.dateKey,
      time: r.time,
      categoryName: r.category,
      counterparty: r.counterparty,
      comment: r.comment,
      outcomeAccountName: accountName,
      outcome: r.amountCents,
      outcomeCurrency: r.currency,
      incomeAccountName: "",
      income: null,
      incomeCurrency: "",
      type: "expense" as const,
      amount: r.amountCents,
    };
  });

  transactions.sort((a, b) =>
    `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`)
  );

  let balanceCheckpointCandidates: BalanceCheckpointCandidate[] | undefined;
  if (outgoingBalanceCents != null) {
    const dateKey = periodEndDateKey || documentDateKey;
    if (dateKey) {
      const time =
        periodEndDateKey && documentDateKey === periodEndDateKey
          ? documentTime
          : periodEndDateKey
            ? "23:59:00"
            : documentTime;
      const accountKey = `${headerAccountName}|${defaultCurrency}`;
      balanceCheckpointCandidates = [
        { accountKey, balanceCents: outgoingBalanceCents, dateKey, time },
      ];
    }
  }

  return {
    accounts,
    categories,
    counterparties,
    transactions,
    balanceCheckpointCandidates,
  };
}
