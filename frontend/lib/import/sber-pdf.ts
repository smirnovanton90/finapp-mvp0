/**
 * Парсер выписки Сбер (PDF).
 * Счета — из «Операция по счету»/«Операция по карте» ****1234 в КАТЕГОРИЯ.
 * Категория — первая строка блока КАТЕГОРИЯ, контрагент — начало второй строки до «. Операция ***».
 */

import { getDocument } from "pdfjs-dist";
import { ensurePdfWorkerSrc } from "./pdf-worker";
import type {
  DzenParsedData,
  DzenParsedAccount,
  DzenParsedTransaction,
} from "@/lib/dzen-csv-parser";
import {
  IMPORT_DEFAULT_CATEGORY_EXPENSE,
  IMPORT_DEFAULT_CATEGORY_INCOME,
} from "@/lib/dzen-csv-parser";
import type { PdfTextItem } from "./pdf-utils";
import {
  buildPdfLines,
  normalizePdfText,
  PDF_AMOUNT_REGEX,
  PDF_DATE_REGEX,
  PDF_DATE_TIME_REGEX,
  extractPdfAmountCandidates,
  pickPdfAmountText,
  extractPdfCategory,
  parsePdfAmount,
} from "./pdf-utils";

/** Последние 4 цифры карты: после «Операция по карте/счету» могут быть звёздочки и пробелы, затем 4 цифры. */
const OPERATION_ACCOUNT_CARD_REGEX = /(?:операция\s+по\s+(?:счету|счёту|карте)\s*)(?:[\s*·•]*\**\s*)?(\d{4})(?=\s|$|[^\d])/i;
/** Запасной поиск ****1234 в любом месте блока (2+ звёздочек/точек, затем 4 цифры). */
const CARD_LAST4_ANYWHERE_REGEX = /[*·•]{2,}\s*(\d{4})\b/;
/** Полный номер счёта (20 цифр, в выписке может быть с пробелами). */
const OPERATION_ACCOUNT_FULL_REGEX = /(?:операция\s+по\s+(?:счету|счёту|карте)\s+)((?:\d\s*){20})/i;
const OPERATION_ACCOUNT_CARD_REGEX_REPLACE = /(?:операция\s+по\s+(?:счету|счёту|карте)\s*)(?:[\s*·•]*\**\s*)?\d{4}(?=\s|$|[^\d])/gi;
const OPERATION_ACCOUNT_FULL_REGEX_REPLACE = /(?:операция\s+по\s+(?:счету|счёту|карте)\s+)(?:\d\s*){20}/gi;
/** Всё начиная с «.Операция» (в т.ч. «.Операция по», «.Операция ***») отрезаем от названия контрагента. */
const COUNTERPARTY_END_REGEX = /\.\s*Операция(?:\s+по|\s+\*\*\*)?/i;
/** Дата в начале строки (DD.MM.YYYY с опциональным временем) — убираем из названия контрагента. */
const LEADING_DATE_REGEX = /^\s*\d{2}\.\d{2}\.\d{4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?\s*/;

function normalizeAccountNumber(raw: string): string {
  const digits = raw.replace(/\s/g, "");
  if (digits.length === 20 && /^\d+$/.test(digits)) return digits;
  return "";
}

/** Извлекает номер карты (****1234) или полный номер счёта (20 цифр) из строки. */
function extractAccountFromCategoryLine(lineText: string): string {
  const cardMatch = lineText.match(OPERATION_ACCOUNT_CARD_REGEX);
  if (cardMatch) {
    const last4 = (cardMatch[1] ?? "").trim();
    if (last4) return `****${last4}`;
  }
  const fullMatch = lineText.match(OPERATION_ACCOUNT_FULL_REGEX);
  if (fullMatch) {
    const raw = (fullMatch[1] ?? "").trim();
    const normalized = normalizeAccountNumber(raw);
    if (normalized) return normalized;
  }
  return "";
}

/** Запасной поиск ****1234 в любом месте текста блока операции (номер может быть на отдельной строке в PDF). */
function extractCardLast4FromBlock(categoryLine: string, descriptionLines: string[]): string {
  const fullText = [categoryLine, ...descriptionLines].join(" ");
  const m = fullText.match(CARD_LAST4_ANYWHERE_REGEX);
  if (!m || !m[1]) return "";
  const last4 = m[1].trim();
  return last4.length === 4 ? `****${last4}` : "";
}

/** Извлекает название контрагента из строки описания: убирает дату в начале и всё начиная с «.Операция ***». */
function extractCounterpartyFromSecondLine(line: string): string {
  let text = line.trim();
  text = text.replace(LEADING_DATE_REGEX, "").trim();
  const endMatch = text.match(COUNTERPARTY_END_REGEX);
  if (endMatch && endMatch.index !== undefined) {
    text = text.slice(0, endMatch.index).trim();
  }
  return text;
}

function parseDateFromPdf(dateTimeStr: string): { dateKey: string; time: string } {
  const match = dateTimeStr.match(/(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})/);
  if (!match) return { dateKey: "", time: "00:00:00" };
  const [, d, m, y, hh, mm] = match;
  const dateKey = `${y}-${m}-${d}`;
  const time = `${hh}:${mm}:00`;
  return { dateKey, time };
}

/** Пытается извлечь последние 4 цифры карты из имени файла (например Выписка по карте_8566_....pdf). */
function extractCardLast4FromFileName(fileName: string): string {
  const m = fileName.match(/_(\d{4})(?:_|\.)/);
  return m ? m[1] : "";
}

export async function parseSberPdfFile(file: File): Promise<DzenParsedData> {
  ensurePdfWorkerSrc();
  const buffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: buffer }).promise;
  const fileFallbackLast4 = extractCardLast4FromFileName(file.name);
  const accountsMap = new Map<string, DzenParsedAccount>();
  const categoriesSet = new Set<string>();
  const counterpartiesSet = new Set<string>();
  const rows: Array<{
    dateKey: string;
    time: string;
    accountName: string;
    currency: string;
    category: string;
    /** Полное значение поля КАТЕГОРИЯ из выписки — в комментарий транзакции */
    categoryRaw: string;
    counterparty: string;
    amountCents: number;
    isIncome: boolean;
  }> = [];

  const defaultCurrency = "RUB";

  for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
    const page = await pdf.getPage(pageIndex);
    const viewport = page.getViewport({ scale: 1 });
    const textContent = await page.getTextContent();
    const rawItems = textContent.items as unknown[];
    const items = rawItems.filter((item): item is PdfTextItem => {
      if (!item || typeof item !== "object") return false;
      const c = item as PdfTextItem;
      return typeof c.str === "string" && Array.isArray(c.transform);
    });
    const lines = buildPdfLines(items);

    let inOperations = false;
    let currentRow: {
      dateTime: string;
      category: string;
      descriptionLines: string[];
      amountText: string;
      /** Номер карты/счёта из полной строки операции (****1234) */
      accountName: string;
    } | null = null;

    const stopPhrases = [
      "продолжение на следующей странице",
      "дата формирования документа",
      "для проверки подлинности документа",
      "qr-код",
      "документ подписан электронной подписью",
      "сведения о сертификате",
      "генеральная лицензия",
      "проверка квалифицированной электронной подписи",
      "действителен до",
    ];

    for (const line of lines) {
      const lineText = normalizePdfText(
        line.items.map((item) => item.text).join(" ")
      );
      if (!lineText) continue;
      const lineTextLower = lineText.toLowerCase();

      const isHeaderLine =
        lineTextLower.includes("дата операции") ||
        lineTextLower.includes("категория");
      if (
        lineTextLower.includes("расшифровка операций") ||
        isHeaderLine
      ) {
        inOperations = true;
        continue;
      }
      if (!inOperations) continue;

      if (stopPhrases.some((phrase) => lineTextLower.includes(phrase))) {
        currentRow = null;
        inOperations = false;
        continue;
      }
      if (lineTextLower.startsWith("выписка по платежному счету")) continue;
      if (lineTextLower.startsWith("страница")) continue;
      if (
        lineTextLower.includes("дата обработки") ||
        lineTextLower.includes("код авторизации") ||
        lineTextLower.includes("сумма в валюте") ||
        lineTextLower.includes("остаток средств")
      ) {
        continue;
      }

      const dateTimeMatch = lineText.match(PDF_DATE_TIME_REGEX);
      if (dateTimeMatch) {
        if (currentRow) {
          const amountMeta = parsePdfAmount(currentRow.amountText);
          if (amountMeta) {
            const categoryLine = currentRow.category;
            const accountName =
              currentRow.accountName ||
              extractAccountFromCategoryLine(categoryLine) ||
              extractCardLast4FromBlock(categoryLine, currentRow.descriptionLines) ||
              (fileFallbackLast4 ? `****${fileFallbackLast4}` : "Счёт");
            const categoryName = normalizePdfText(
              categoryLine
                .replace(OPERATION_ACCOUNT_CARD_REGEX_REPLACE, "")
                .replace(OPERATION_ACCOUNT_FULL_REGEX_REPLACE, "")
                .trim()
            );
            const secondLine = currentRow.descriptionLines[0] ?? "";
            const counterparty = extractCounterpartyFromSecondLine(secondLine);
            const effectiveCategory = categoryName
              ? categoryName
              : amountMeta.isIncome
                ? IMPORT_DEFAULT_CATEGORY_INCOME
                : IMPORT_DEFAULT_CATEGORY_EXPENSE;

            const key = `${accountName}|${defaultCurrency}`;
            if (!accountsMap.has(key)) {
              accountsMap.set(key, { name: accountName, currency: defaultCurrency });
            }
            categoriesSet.add(effectiveCategory);
            if (counterparty) counterpartiesSet.add(counterparty);

            const fullCategoryBlock = [categoryLine, ...currentRow.descriptionLines]
              .map((s) => s.trim())
              .filter(Boolean)
              .join("\n");
            const { dateKey, time } = parseDateFromPdf(currentRow.dateTime);
            rows.push({
              dateKey,
              time,
              accountName,
              currency: defaultCurrency,
              category: effectiveCategory,
              categoryRaw: fullCategoryBlock,
              counterparty,
              amountCents: amountMeta.amountCents,
              isIncome: amountMeta.isIncome,
            });
          }
        }

        const rightStart = viewport.width * 0.68;
        const amountCandidates = extractPdfAmountCandidates(line.items, viewport.width);
        const hasPlusSign = line.items.some(
          (item) => item.x >= rightStart && item.text.trim() === "+"
        );
        const hasMinusSign = line.items.some(
          (item) => item.x >= rightStart && item.text.trim() === "-"
        );
        let amountText = pickPdfAmountText(amountCandidates);
        if (
          amountText &&
          !amountText.startsWith("+") &&
          !amountText.startsWith("-")
        ) {
          if (hasPlusSign) amountText = `+${amountText}`;
          else if (hasMinusSign) amountText = `-${amountText}`;
        }
        const category = extractPdfCategory(line.items, viewport.width);
        const accountFromFullLine = extractAccountFromCategoryLine(lineText);
        currentRow = {
          dateTime: dateTimeMatch[0],
          category,
          descriptionLines: [],
          amountText,
          accountName: accountFromFullLine,
        };
        continue;
      }

      if (!currentRow) continue;
      if (PDF_DATE_REGEX.test(lineText)) continue;

      currentRow.descriptionLines.push(lineText);
    }

    if (currentRow) {
      const amountMeta = parsePdfAmount(currentRow.amountText);
      if (amountMeta) {
        const categoryLine = currentRow.category;
        const accountName =
          currentRow.accountName ||
          extractAccountFromCategoryLine(categoryLine) ||
          extractCardLast4FromBlock(categoryLine, currentRow.descriptionLines) ||
          (fileFallbackLast4 ? `****${fileFallbackLast4}` : "Счёт");
        const categoryName = normalizePdfText(
          categoryLine
                .replace(OPERATION_ACCOUNT_CARD_REGEX_REPLACE, "")
                .replace(OPERATION_ACCOUNT_FULL_REGEX_REPLACE, "")
                .trim()
        );
        const secondLine = currentRow.descriptionLines[0] ?? "";
        const counterparty = extractCounterpartyFromSecondLine(secondLine);
        const effectiveCategory = categoryName
          ? categoryName
          : amountMeta.isIncome
            ? IMPORT_DEFAULT_CATEGORY_INCOME
            : IMPORT_DEFAULT_CATEGORY_EXPENSE;

        const key = `${accountName}|${defaultCurrency}`;
        if (!accountsMap.has(key)) {
          accountsMap.set(key, { name: accountName, currency: defaultCurrency });
        }
        categoriesSet.add(effectiveCategory);
        if (counterparty) counterpartiesSet.add(counterparty);

        const fullCategoryBlock = [categoryLine, ...currentRow.descriptionLines]
          .map((s) => s.trim())
          .filter(Boolean)
          .join("\n");
        const { dateKey, time } = parseDateFromPdf(currentRow.dateTime);
        rows.push({
          dateKey,
          time,
          accountName,
          currency: defaultCurrency,
          category: effectiveCategory,
          categoryRaw: fullCategoryBlock,
          counterparty,
          amountCents: amountMeta.amountCents,
          isIncome: amountMeta.isIncome,
        });
      }
    }
  }

  const accounts = Array.from(accountsMap.values());
  const categories = Array.from(categoriesSet).map((name) => ({ name }));
  const counterparties = Array.from(counterpartiesSet).map((name) => ({ name }));

  const transactions: DzenParsedTransaction[] = rows.map((r) => {
    const acc = accountsMap.get(`${r.accountName}|${r.currency}`);
    const accountName = acc?.name ?? r.accountName;
    const comment = (r.categoryRaw ?? "").trim();
    if (r.isIncome) {
      return {
        date: r.dateKey,
        time: r.time,
        categoryName: r.category,
        counterparty: r.counterparty,
        comment,
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
      comment,
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

  transactions.sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));

  return {
    accounts,
    categories,
    counterparties,
    transactions,
  };
}
