/**
 * Shared utilities for RUB amount input formatting and parsing.
 * Used by assets, transactions, limits, financial-planning.
 */

export function parseRubToCents(input: string): number {
  const normalized = input
    .trim()
    .replace(/\s/g, "")
    .replace(",", ".");
  const value = Number(normalized);
  if (!Number.isFinite(value)) return NaN;
  return Math.round(value * 100);
}

export function formatRubInput(raw: string): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  const isNegative = trimmed.startsWith("-");

  const cleaned = trimmed.replace(/[^\d.,]/g, "");
  if (!cleaned) return isNegative ? "-" : "";

  const endsWithSep = /[.,]$/.test(cleaned);
  const sepIndex = cleaned.search(/[.,]/);

  let intPart = "";
  let decPart = "";

  if (sepIndex === -1) {
    intPart = cleaned;
  } else {
    intPart = cleaned.slice(0, sepIndex);
    decPart = cleaned.slice(sepIndex + 1).replace(/[.,]/g, "");
  }

  if (sepIndex === 0) intPart = "0";

  intPart = intPart.replace(/^0+(?=\d)/, "");
  if (!intPart) intPart = "0";

  const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const formattedDec = decPart.slice(0, 2);

  if (endsWithSep && formattedDec.length === 0) {
    const value = `${formattedInt},`;
    return isNegative ? `-${value}` : value;
  }

  const value =
    formattedDec.length > 0 ? `${formattedInt},${formattedDec}` : formattedInt;
  return isNegative ? `-${value}` : value;
}

export function normalizeRubOnBlur(value: string): string {
  const v = value.trim();
  if (!v) return "";
  const isNegative = v.startsWith("-");
  const absValue = isNegative ? v.slice(1).trim() : v;
  if (!absValue) return "";

  if (absValue.endsWith(",")) {
    const result = `${absValue}00`;
    return isNegative ? `-${result}` : result;
  }

  const parts = absValue.split(",");
  const intPart = parts[0] || "0";
  const decPart = parts[1] ?? "";

  const normalized =
    decPart.length === 0
      ? `${intPart},00`
      : decPart.length === 1
        ? `${intPart},${decPart}0`
        : `${intPart},${decPart.slice(0, 2)}`;
  return isNegative && normalized !== "0,00" ? `-${normalized}` : normalized;
}

/** Format cents for pre-filling inputs (e.g. edit mode). */
export function formatCentsForInput(cents: number | null | undefined): string {
  if (cents == null) return "";
  const raw = (cents / 100).toFixed(2).replace(".", ",");
  return formatRubInput(raw);
}
