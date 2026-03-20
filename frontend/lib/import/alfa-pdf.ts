import "@/lib/import/pdfjs-polyfill";

/**
 * Парсер выписки Альфа-Банк (PDF).
 * Счёт — из поля «Описание» операций («Операция по карте: 555947++++++5809»); если не указан — из шапки выписки.
 * Категория — из «Описание» после «MCC», контрагент — между «место совершения операции: » и «MCC».
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
import { formatMccCategoryForImport } from "@/lib/mcc-codes";
import type { PdfTextItem } from "./pdf-utils";
import {
  buildPdfLines,
  normalizePdfText,
  PDF_AMOUNT_REGEX,
  PDF_DATE_REGEX,
  extractPdfRightAmountText,
  parsePdfAmount,
} from "./pdf-utils";

/** Метка начала контрагента в поле «Описание» (с опциональным двоеточием и пробелами). */
const PLACE_PREFIX_REGEX = /место\s+совершения\s+операции\s*:?\s*/i;
/** Метка MCC (код категории) — после неё идёт категория. */
const MCC_REGEX = /\bMCC\s*:?\s*/i;

function parseDescriptionAlfa(descriptionText: string): { counterparty: string; category: string } {
  const normalized = normalizePdfText(descriptionText);
  let counterparty = "";
  let category = "";

  const placeMatch = normalized.match(PLACE_PREFIX_REGEX);
  const mccMatch = normalized.match(MCC_REGEX);
  const mccIndex = mccMatch && mccMatch.index !== undefined ? mccMatch.index : -1;

  if (placeMatch && placeMatch.index !== undefined) {
    const valueStart = placeMatch.index + placeMatch[0].length;
    if (mccIndex >= valueStart) {
      counterparty = normalized.slice(valueStart, mccIndex).trim();
      category = normalized.slice(mccIndex + (mccMatch ? mccMatch[0].length : 3)).trim();
    } else {
      counterparty = normalized.slice(valueStart).trim();
      if (mccIndex >= 0 && mccMatch) {
        category = normalized.slice(mccIndex + mccMatch[0].length).trim();
      }
    }
  } else if (mccIndex >= 0 && mccMatch) {
    category = normalized.slice(mccIndex + mccMatch[0].length).trim();
  }

  return { counterparty, category };
}

function parseDateFromPdf(dateStr: string): { dateKey: string; time: string } {
  const m = dateStr.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (!m) return { dateKey: "", time: "00:00:00" };
  const [, d, month, y] = m;
  const dateKey = `${y}-${month}-${d}`;
  return { dateKey, time: "00:00:00" };
}

const ACCOUNT_NUMBER_REGEX = /(?:операции\s+по\s+счету|номер\s+счета|счет[а]?)\s*[:\s]*(\d{10,20})/i;

/** «Операция по карте: 555947++++++5809» — извлекаем номер карты из поля «Описание». */
const CARD_IN_DESCRIPTION_REGEX = /операция\s+по\s+карте\s*:?\s*(\d+[\s*+·]*\d{4})\s*/i;

function extractAccountFromLine(lineText: string): string {
  const m = lineText.match(ACCOUNT_NUMBER_REGEX);
  return m ? m[1].trim() : "";
}

/**
 * Извлекает номер карты из текста описания операции (например «Операция по карте: 555947++++++5809»).
 * Нормализует к виду 555947******5809 (плюсы/точки заменяются на *) для сравнения с названиями активов и синонимами.
 */
function extractAccountFromDescriptionAlfa(descriptionText: string): string {
  const normalized = normalizePdfText(descriptionText);
  const m = normalized.match(CARD_IN_DESCRIPTION_REGEX);
  if (!m || !m[1]) return "";
  const raw = m[1].replace(/\s/g, "");
  const masked = raw.replace(/[+·]/g, "*");
  if (!/^\d+[*]*\d{4}$/.test(masked)) return "";
  return masked;
}

export async function parseAlfaPdfFile(file: File): Promise<DzenParsedData> {
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
    amountCents: number;
    isIncome: boolean;
  }> = [];

  let headerAccountNumber = "";
  const defaultCurrency = "RUB";

  let alfaOutgoingBalanceCents: number | null = null;
  let alfaPeriodEndDateKey = "";

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

    const dateMaxX = viewport.width * 0.22;
    const codeMaxX = viewport.width * 0.38;
    const amountMinX = viewport.width * 0.72;

    let inOperations = false;
    let currentRow: {
      dateTime: string;
      descriptionText: string;
      amountText: string;
    } | null = null;

    const stopPhrases = [
      "альфа-банк",
      "alfabank.ru",
      "подпись сотрудника",
      "уполномоченное лицо",
      "телефон",
      "e-mail",
    ];

    for (const line of lines) {
      const lineText = normalizePdfText(
        line.items.map((item) => item.text).join(" ")
      );
      if (!lineText) continue;
      const lineTextLower = lineText.toLowerCase();

      if (!inOperations && pageIndex === 1) {
        const acc = extractAccountFromLine(lineText);
        if (acc) headerAccountNumber = acc;
        if (lineTextLower.includes("исходящий остаток")) {
          const amountText = extractPdfRightAmountText(line.items, viewport.width) || (lineText.match(PDF_AMOUNT_REGEX) ?? [])[0];
          const meta = amountText ? parsePdfAmount(amountText) : null;
          if (meta) alfaOutgoingBalanceCents = meta.amountCents;
        }
        if (lineTextLower.includes("за период") && lineTextLower.includes("по")) {
          const periodEndM = lineText.match(/по\s+(\d{2})\.(\d{2})\.(\d{4})\b/i) ?? lineText.match(/(\d{2})\.(\d{2})\.(\d{4})\s*$/);
          if (periodEndM) {
            const [, d, m, y] = periodEndM;
            if (d && m && y) alfaPeriodEndDateKey = `${y}-${m}-${d}`;
          }
        }
      }

      const isHeaderLine =
        lineTextLower.includes("дата проводки") ||
        lineTextLower.includes("код операции") ||
        lineTextLower.includes("описание");
      if (lineTextLower.includes("операции по счету") || isHeaderLine) {
        inOperations = true;
        if (!headerAccountNumber) {
          const acc = extractAccountFromLine(lineText);
          if (acc) headerAccountNumber = acc;
        }
        continue;
      }
      if (!inOperations) {
        const amountMatches = lineText.match(PDF_AMOUNT_REGEX);
        const hasDate = /^\d{2}\.\d{2}\.\d{4}\b/.test(lineText);
        if (!hasDate || !amountMatches) continue;
        inOperations = true;
      }

      if (lineTextLower.startsWith("страница")) continue;
      if (lineTextLower.startsWith("hold")) {
        currentRow = null;
        inOperations = false;
        continue;
      }

      if (stopPhrases.some((phrase) => lineTextLower.includes(phrase))) {
        currentRow = null;
        inOperations = false;
        continue;
      }

      const dateText = normalizePdfText(
        line.items
          .filter((item) => item.x <= dateMaxX)
          .map((item) => item.text)
          .join(" ")
      );
      const dateMatch =
        dateText.match(PDF_DATE_REGEX) ||
        lineText.match(/^(\d{2}\.\d{2}\.\d{4})\b/);

      if (dateMatch) {
        if (currentRow) {
          const amountMeta = parsePdfAmount(currentRow.amountText);
          if (amountMeta) {
            const { counterparty, category } = parseDescriptionAlfa(currentRow.descriptionText);
            const accountName =
              extractAccountFromDescriptionAlfa(currentRow.descriptionText) ||
              headerAccountNumber ||
              "Счёт";
            const effectiveCategory = category
              ? formatMccCategoryForImport(category)
              : (amountMeta.isIncome ? IMPORT_DEFAULT_CATEGORY_INCOME : IMPORT_DEFAULT_CATEGORY_EXPENSE);

            const key = `${accountName}|${defaultCurrency}`;
            if (!accountsMap.has(key)) {
              accountsMap.set(key, { name: accountName, currency: defaultCurrency });
            }
            categoriesSet.add(effectiveCategory);
            if (counterparty) counterpartiesSet.add(counterparty);

            const { dateKey, time } = parseDateFromPdf(currentRow.dateTime);
            rows.push({
              dateKey,
              time,
              accountName,
              currency: defaultCurrency,
              category: effectiveCategory,
              counterparty,
              amountCents: amountMeta.amountCents,
              isIncome: amountMeta.isIncome,
            });
          }
        }

        let codeText = normalizePdfText(
          line.items
            .filter((item) => item.x > dateMaxX && item.x <= codeMaxX)
            .map((item) => item.text)
            .join(" ")
        );
        // Поле «Описание» — вся середина строки (от даты до суммы), чтобы гарантированно захватить «место совершения операции: … MCC»
        let descriptionText = normalizePdfText(
          line.items
            .filter((item) => item.x > dateMaxX && item.x < amountMinX)
            .map((item) => item.text)
            .join(" ")
        );
        let amountText = extractPdfRightAmountText(line.items, viewport.width);
        if (!amountText) {
          const amountMatches = lineText.match(PDF_AMOUNT_REGEX);
          if (amountMatches && amountMatches.length > 0) {
            amountText = amountMatches[amountMatches.length - 1];
          }
        }

        if (!codeText || !descriptionText) {
          const lineDate = dateMatch[0];
          const lineWithoutDate = lineText.replace(lineDate, "").trim();
          const parts = lineWithoutDate.split(" ");
          const codeCandidate = parts[0] ?? "";
          if (!codeText) codeText = codeCandidate;
          if (!descriptionText) {
            const rawDescription = lineWithoutDate.slice(codeCandidate.length).trim();
            descriptionText = rawDescription
              .replace(/\s*[+\-\u2212]?\d{1,3}(?:[ \u00A0]\d{3})*(?:,\d{2})\s*RUR\s*$/i, "")
              .trim();
          }
        }

        const normalizedCode = codeText.replace(/\s+/g, "").toUpperCase();
        if (
          normalizedCode.startsWith("WCRG") ||
          lineText.toUpperCase().includes("WCRG")
        ) {
          currentRow = null;
          continue;
        }

        if (amountText) {
          const normalizedAmount = amountText.replace(/\u2212/g, "-");
          const hasNegativeSign =
            normalizedAmount.startsWith("-") ||
            line.items.some((item) => {
              if (item.x < amountMinX) return false;
              const marker = item.text.trim();
              return marker === "-" || marker === "−";
            }) ||
            /[-\u2212]\s*\d/.test(lineText);
          if (!/^[+-]/.test(normalizedAmount)) {
            amountText = hasNegativeSign
              ? `-${normalizedAmount}`
              : `+${normalizedAmount}`;
          } else if (hasNegativeSign && !normalizedAmount.startsWith("-")) {
            amountText = `-${normalizedAmount.replace(/^[+-]/, "")}`;
          } else {
            amountText = normalizedAmount;
          }
        }

        currentRow = {
          dateTime: dateMatch[0],
          descriptionText,
          amountText,
        };
        continue;
      }

      if (!currentRow) continue;
      const descriptionText = normalizePdfText(
        line.items
          .filter((item) => item.x > dateMaxX && item.x < amountMinX)
          .map((item) => item.text)
          .join(" ")
      );
      if (descriptionText) {
        currentRow.descriptionText = (currentRow.descriptionText + " " + descriptionText).trim();
      }
    }

    if (currentRow) {
      const amountMeta = parsePdfAmount(currentRow.amountText);
      if (amountMeta) {
        const { counterparty, category } = parseDescriptionAlfa(currentRow.descriptionText);
        const accountName =
          extractAccountFromDescriptionAlfa(currentRow.descriptionText) ||
          headerAccountNumber ||
          "Счёт";
        const effectiveCategory = category
          ? formatMccCategoryForImport(category)
          : (amountMeta.isIncome ? IMPORT_DEFAULT_CATEGORY_INCOME : IMPORT_DEFAULT_CATEGORY_EXPENSE);

        const key = `${accountName}|${defaultCurrency}`;
        if (!accountsMap.has(key)) {
          accountsMap.set(key, { name: accountName, currency: defaultCurrency });
        }
        categoriesSet.add(effectiveCategory);
        if (counterparty) counterpartiesSet.add(counterparty);

        const { dateKey, time } = parseDateFromPdf(currentRow.dateTime);
        rows.push({
          dateKey,
          time,
          accountName,
          currency: defaultCurrency,
          category: effectiveCategory,
          counterparty,
          amountCents: amountMeta.amountCents,
          isIncome: amountMeta.isIncome,
        });
      }
    }
  }

  if (accountsMap.size === 0 && headerAccountNumber) {
    accountsMap.set(`${headerAccountNumber}|${defaultCurrency}`, {
      name: headerAccountNumber,
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
        comment: "",
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
      comment: "",
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

  let balanceCheckpointCandidates: BalanceCheckpointCandidate[] | undefined;
  if (alfaOutgoingBalanceCents != null && alfaPeriodEndDateKey) {
    const accountKey = `${headerAccountNumber || "Счёт"}|${defaultCurrency}`;
    balanceCheckpointCandidates = [
      {
        accountKey,
        balanceCents: alfaOutgoingBalanceCents,
        dateKey: alfaPeriodEndDateKey,
        time: "23:59:00",
      },
    ];
  }

  return {
    accounts,
    categories,
    counterparties,
    transactions,
    balanceCheckpointCandidates,
  };
}
