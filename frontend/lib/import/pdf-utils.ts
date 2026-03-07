/**
 * Общие утилиты для парсинга PDF-выписок (Сбер, Альфа-Банк).
 */

export type PdfTextItem = {
  str: string;
  transform: number[];
};

export type PdfLineItem = {
  text: string;
  x: number;
  y: number;
};

export const PDF_AMOUNT_REGEX = /[+\-\u2212]?\d{1,3}(?:[ \u00A0]\d{3})*(?:,\d{2})/g;
export const PDF_DATE_TIME_REGEX = /\b\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2}\b/;
export const PDF_DATE_REGEX = /^\d{2}\.\d{2}\.\d{4}$/;

export function normalizePdfText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function buildPdfLines(items: PdfTextItem[]): Array<{ y: number; items: PdfLineItem[] }> {
  const lines: Array<{ y: number; items: PdfLineItem[] }> = [];
  const tolerance = 2;

  items.forEach((item) => {
    const text = item.str?.trim();
    if (!text) return;
    const x = item.transform[4];
    const y = item.transform[5];
    let line = lines.find((candidate) => Math.abs(candidate.y - y) <= tolerance);
    if (!line) {
      line = { y, items: [] };
      lines.push(line);
    }
    line.items.push({ text: item.str, x, y });
  });

  lines.forEach((line) => line.items.sort((a, b) => a.x - b.x));
  lines.sort((a, b) => b.y - a.y);
  return lines;
}

export function extractPdfAmountCandidates(
  items: PdfLineItem[],
  pageWidth: number
): Array<{ text: string; x: number }> {
  const rightStart = pageWidth * 0.68;
  const candidates: Array<{ text: string; x: number }> = [];

  items.forEach((item) => {
    if (item.x < rightStart) return;
    const matches = item.text.match(PDF_AMOUNT_REGEX);
    if (!matches) return;
    matches.forEach((match) => {
      candidates.push({ text: match, x: item.x });
    });
  });

  return candidates.sort((a, b) => a.x - b.x);
}

export function pickPdfAmountText(candidates: Array<{ text: string; x: number }>): string {
  if (candidates.length === 0) return "";
  if (candidates.length >= 2) return candidates[candidates.length - 2].text;
  return candidates[candidates.length - 1].text;
}

export function extractPdfRightAmountText(items: PdfLineItem[], pageWidth: number): string {
  const rightStart = pageWidth * 0.72;
  const candidates: Array<{ text: string; x: number }> = [];

  items.forEach((item) => {
    if (item.x < rightStart) return;
    const matches = item.text.match(PDF_AMOUNT_REGEX);
    if (!matches) return;
    matches.forEach((match) => {
      candidates.push({ text: match, x: item.x });
    });
  });

  if (candidates.length === 0) return "";
  candidates.sort((a, b) => a.x - b.x);
  return candidates[candidates.length - 1].text;
}

export function parsePdfAmount(value: string): { amountCents: number; isIncome: boolean } | null {
  const normalized = value
    .replace(/[ \u00A0]/g, "")
    .replace(",", ".")
    .replace(/\u2212/g, "-");
  if (!normalized) return null;
  const numberValue = Number(normalized.replace(/[+-]/g, ""));
  if (!Number.isFinite(numberValue)) return null;
  return {
    amountCents: Math.round(Math.abs(numberValue) * 100),
    isIncome: normalized.startsWith("+"),
  };
}

export function extractPdfCategory(items: PdfLineItem[], pageWidth: number): string {
  const middleStart = pageWidth * 0.28;
  const middleEnd = pageWidth * 0.68;
  const text = items
    .filter((item) => item.x >= middleStart && item.x < middleEnd)
    .map((item) => item.text)
    .join(" ");
  return normalizePdfText(text);
}
