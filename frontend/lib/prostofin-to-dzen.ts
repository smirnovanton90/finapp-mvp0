/**
 * Преобразование экспорта ПРОСТОФИН (ParsedExport) в формат DzenParsedData
 * для единого пошагового импорта (счета → категории → контрагенты → подтверждение).
 */

import type { DzenParsedData, DzenParsedTransaction, DzenTransactionType } from "@/lib/dzen-csv-parser";
import {
  IMPORT_DEFAULT_CATEGORY_EXPENSE,
  IMPORT_DEFAULT_CATEGORY_INCOME,
} from "@/lib/dzen-csv-parser";
import type { ParsedExport } from "@/lib/data-export-import";

function num(s: string): number | null {
  if (s === "" || s == null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function str(s: string | undefined): string {
  return (s ?? "").trim();
}

/** Собирает полный путь категории по parent_id (если в экспорте нет full_path). */
function buildCategoryFullPath(
  rows: Array<Record<string, string>>,
  row: Record<string, string>,
  byId: Map<number, Record<string, string>>
): string {
  const fullPath = str(row.full_path);
  if (fullPath) return fullPath;
  const parentId = num(row.parent_id);
  if (parentId == null) return str(row.name) || "Категория";
  const parent = byId.get(parentId);
  if (!parent) return str(row.name) || "Категория";
  const parentPath = buildCategoryFullPath(rows, parent, byId);
  return parentPath ? `${parentPath} > ${str(row.name)}` : str(row.name) || "Категория";
}

/**
 * Преобразует распарсенный экспорт ПРОСТОФИН в DzenParsedData для использования
 * в общем потоке импорта (шаги 2–5 и executeImportDzen).
 */
export function parsedExportToDzenParsedData(data: ParsedExport): DzenParsedData {
  const itemById = new Map<number, { name: string; currency: string }>();
  for (const row of data.items) {
    const id = num(row.id);
    if (id == null) continue;
    itemById.set(id, {
      name: str(row.name) || "Без имени",
      currency: str(row.currency_code) || "RUB",
    });
  }

  const categoryById = new Map<number, string>();
  const catRows = data.categories;
  const catById = new Map<number, Record<string, string>>();
  for (const row of catRows) {
    const id = num(row.id);
    if (id != null) catById.set(id, row);
  }
  for (const row of catRows) {
    const id = num(row.id);
    if (id == null) continue;
    categoryById.set(id, buildCategoryFullPath(catRows, row, catById));
  }

  const counterpartyById = new Map<number, string>();
  for (const row of data.counterparties) {
    const id = num(row.id);
    if (id == null) continue;
    const name = str(row.name) || str(row.full_name) || "—";
    counterpartyById.set(id, name);
  }

  const accountsMap = new Map<string, { name: string; currency: string }>();
  for (const [, acc] of itemById) {
    const key = `${acc.name}|${acc.currency}`;
    accountsMap.set(key, acc);
  }
  const categoriesSet = new Set<string>();
  const counterpartiesSet = new Set<string>();
  const transactions: DzenParsedTransaction[] = [];

  for (const row of data.transactions) {
    const primaryId = num(row.primary_item_id);
    const direction = (str(row.direction) || "OUTCOME").toUpperCase();
    const amount = num(row.amount) ?? 0;
    const date = str(row.transaction_date) || new Date().toISOString().slice(0, 10);
    const categoryId = num(row.category_id);
    let categoryName = categoryId != null ? categoryById.get(categoryId) ?? "" : "";
    const cpId = num(row.counterparty_id);
    const counterparty = cpId != null ? counterpartyById.get(cpId) ?? "" : "";
    const comment = str(row.comment);

    const primary = primaryId != null ? itemById.get(primaryId) : undefined;
    const primaryName = primary?.name ?? "—";
    const primaryCurrency = primary?.currency ?? "RUB";

    let type: DzenTransactionType = "expense";
    let outcomeAccountName = primaryName;
    let outcomeCurrency = primaryCurrency;
    let incomeAccountName = "—";
    let incomeCurrency = "RUB";
    let outcome: number | null = null;
    let income: number | null = null;

    if (direction === "OUTCOME") {
      type = "expense";
      outcome = amount;
      income = null;
    } else if (direction === "INCOME") {
      type = "income";
      outcome = null;
      income = amount;
    } else {
      type = "transfer";
      const relatedId = num(row.related_item_id);
      const related = relatedId != null ? itemById.get(relatedId) : undefined;
      if (related) {
        incomeAccountName = related.name;
        incomeCurrency = related.currency;
        outcome = amount;
        income = amount;
      } else {
        outcome = amount;
        income = amount;
      }
    }

    if (!categoryName && type !== "transfer") {
      categoryName =
        type === "expense" ? IMPORT_DEFAULT_CATEGORY_EXPENSE : IMPORT_DEFAULT_CATEGORY_INCOME;
    }
    if (categoryName) categoriesSet.add(categoryName);

    transactions.push({
      date,
      time: "00:00:00",
      categoryName,
      counterparty,
      comment,
      outcomeAccountName,
      outcome,
      outcomeCurrency,
      incomeAccountName,
      income,
      incomeCurrency,
      type,
      amount: Math.abs(amount),
    });
  }

  const accounts = Array.from(accountsMap.values());
  const categories = Array.from(categoriesSet).map((name) => ({ name }));
  const counterparties = Array.from(counterpartiesSet).map((name) => ({ name }));

  return {
    accounts,
    categories,
    counterparties,
    transactions,
  };
}
