/**
 * Поиск совпадений импортируемых категорий, контрагентов и счетов с уже имеющимися.
 * Используется для автоматического включения режима сопряжения при полном или частичном совпадении названия.
 */

import { buildCategoryLookup } from "@/lib/categories";
import type { CategoryNode, CategoryScope } from "@/lib/categories";
import type { CounterpartyOut, ItemOut } from "@/lib/api";
import type { DzenParsedTransaction } from "@/lib/dzen-csv-parser";

export type CategoryPath = { l1: string; l2: string; l3: string };

function pathArrayToCategoryPath(path: string[]): CategoryPath {
  return {
    l1: path[0]?.trim() ?? "",
    l2: path[1]?.trim() ?? "",
    l3: path[2]?.trim() ?? "",
  };
}

/** Нормализованная строка для сравнения (trim + lowerCase). */
function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

/** Категория выписки считается «переводной» по подстроке «перевод» (без учёта регистра). */
export function isTransferCategoryName(name: string | null | undefined): boolean {
  return norm(name).includes("перевод");
}

/** Полное или частичное совпадение: равны или одна строка содержит другую. */
function namesMatch(a: string, b: string): boolean {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  return na.includes(nb) || nb.includes(na);
}

/**
 * По операциям выписки определяет, какие scope допустимы для автосопоставления категории.
 * — Только доходы → INCOME и BOTH.
 * — Только расходы → EXPENSE и BOTH.
 * — И доходы, и расходы с одним именем категории → только BOTH (универсальные).
 * — Есть переводы с этой категорией → без фильтра (null).
 */
export function getAllowedScopesForImportedCategoryName(
  importedCategoryName: string,
  transactions: DzenParsedTransaction[]
): Set<CategoryScope> | null {
  const target = (importedCategoryName ?? "").trim();
  if (!target || !transactions?.length) return null;

  let seenIncome = false;
  let seenExpense = false;
  let seenTransfer = false;

  for (const tx of transactions) {
    if ((tx.categoryName ?? "").trim() !== target) continue;
    if (tx.type === "income") seenIncome = true;
    else if (tx.type === "expense") seenExpense = true;
    else if (tx.type === "transfer") seenTransfer = true;
  }

  if (!seenIncome && !seenExpense && !seenTransfer) return null;
  if (seenTransfer) return null;

  if (seenIncome && seenExpense) return new Set<CategoryScope>(["BOTH"]);
  if (seenIncome) return new Set<CategoryScope>(["INCOME", "BOTH"]);
  if (seenExpense) return new Set<CategoryScope>(["EXPENSE", "BOTH"]);
  return null;
}

function categoryIdMatchesAllowedScopes(
  id: number,
  allowedScopes: Set<CategoryScope> | null | undefined,
  idToScope: Map<number, CategoryScope>
): boolean {
  if (allowedScopes == null || allowedScopes.size === 0) return true;
  const scope = idToScope.get(id);
  return scope != null && allowedScopes.has(scope);
}

/**
 * Ищет существующую категорию по совпадению с импортируемым названием.
 * — Обход: все категории (по умолчанию + пользовательские), начиная с 3-го уровня, затем 2-й, затем 1-й.
 * — На совпадение проверяется только название самой категории (без названий родителей).
 * — Полное совпадение предпочитается частичному.
 * @param allowedScopes если задан — учитываются только категории с таким scope (автомэтчинг по типу операций выписки).
 */
export function findMatchingCategoryPath(
  importedName: string,
  existingNodes: CategoryNode[],
  allowedScopes?: Set<CategoryScope> | null
): CategoryPath | null {
  if (!importedName?.trim() || !existingNodes?.length) return null;
  const lookup = buildCategoryLookup(existingNodes);
  const { idToPath, idToScope } = lookup;
  const entries = Array.from(idToPath.entries())
    .filter(([id]) => categoryIdMatchesAllowedScopes(id, allowedScopes, idToScope))
    .map(([id, path]) => ({
      id,
      path,
    }));
  // Сначала 3-й уровень, затем 2-й, затем 1-й
  entries.sort((a, b) => b.path.length - a.path.length);

  const importedNorm = norm(importedName);
  if (!importedNorm) return null;

  // Собственное название категории — последний сегмент пути (без родителей)
  const getOwnName = (path: string[]) => path[path.length - 1]?.trim() ?? "";

  // Helper: get node by id from tree to read synonyms
  const getNodeById = (nodes: CategoryNode[], targetId: number): CategoryNode | null => {
    for (const n of nodes) {
      if (n.id === targetId) return n;
      if (n.children?.length) {
        const found = getNodeById(n.children, targetId);
        if (found) return found;
      }
    }
    return null;
  };

  // 1. Сначала полное совпадение по имени
  for (const { id, path } of entries) {
    const ownName = getOwnName(path);
    if (ownName && norm(ownName) === importedNorm) {
      return pathArrayToCategoryPath(path);
    }
  }

  // 2. Полное совпадение по синониму
  for (const { id, path } of entries) {
    const node = getNodeById(existingNodes, id);
    const syns = node?.synonyms ?? [];
    for (const s of syns) {
      const t = (s ?? "").trim();
      if (t && norm(t) === importedNorm) return pathArrayToCategoryPath(path);
    }
  }

  // 3. Частичное совпадение по имени
  for (const { path } of entries) {
    const ownName = getOwnName(path);
    const sn = norm(ownName);
    if (!sn) continue;
    if (importedNorm.includes(sn) || sn.includes(importedNorm)) {
      return pathArrayToCategoryPath(path);
    }
  }

  // 4. Частичное совпадение по синониму
  for (const { id, path } of entries) {
    const node = getNodeById(existingNodes, id);
    const syns = node?.synonyms ?? [];
    for (const s of syns) {
      const t = (s ?? "").trim();
      if (!t) continue;
      const sn = norm(t);
      if (importedNorm.includes(sn) || sn.includes(importedNorm)) {
        return pathArrayToCategoryPath(path);
      }
    }
  }
  return null;
}

/**
 * Ищет существующего контрагента, чьё название (или ФИО) либо любой из синонимов полностью или частично совпадает с импортируемым.
 */
export function findMatchingCounterpartyId(
  importedName: string,
  existingCounterparties: CounterpartyOut[]
): number | null {
  if (!importedName?.trim() || !existingCounterparties?.length) return null;
  for (const cp of existingCounterparties) {
    if (cp.deleted_at) continue;
    if (cp.entity_type === "LEGAL") {
      const cpName = (cp.name ?? "").trim();
      if (cpName && namesMatch(importedName, cpName)) return cp.id;
    } else {
      const lastName = (cp.last_name ?? "").trim();
      const firstName = (cp.first_name ?? "").trim();
      const middleName = (cp.middle_name ?? "").trim();
      const fullName = [lastName, firstName, middleName].filter(Boolean).join(" ");
      if (fullName && namesMatch(importedName, fullName)) return cp.id;
      if (lastName && namesMatch(importedName, lastName)) return cp.id;
      if (firstName && namesMatch(importedName, firstName)) return cp.id;
    }
    const synonyms = cp.synonyms ?? [];
    for (const syn of synonyms) {
      const s = (syn ?? "").trim();
      if (s && namesMatch(importedName, s)) return cp.id;
    }
  }
  return null;
}

/**
 * Нормализация для точного совпадения (trim + toLowerCase).
 */
export function normalizeExactKey(s: string): string {
  return (s ?? "").trim().toLowerCase();
}

/**
 * Ищет контрагента по точному совпадению (без учёта регистра после trim) импортируемой строки
 * с отображаемым названием контрагента или любым из его синонимов.
 */
export function findExactMatchingCounterpartyId(
  importedName: string,
  existingCounterparties: CounterpartyOut[]
): number | null {
  const key = normalizeExactKey(importedName);
  if (!key) return null;
  for (const cp of existingCounterparties) {
    if (cp.deleted_at) continue;
    let displayName: string;
    if (cp.entity_type === "LEGAL") {
      displayName = (cp.name ?? "").trim();
    } else {
      const parts = [
        cp.last_name,
        cp.first_name,
        cp.middle_name,
      ].filter(Boolean) as string[];
      displayName = parts.map((p) => (p ?? "").trim()).join(" ");
    }
    if (displayName && normalizeExactKey(displayName) === key) return cp.id;
    const synonyms = cp.synonyms ?? [];
    for (const syn of synonyms) {
      const s = (syn ?? "").trim();
      if (s && normalizeExactKey(s) === key) return cp.id;
    }
  }
  return null;
}

/**
 * Ищет категорию по точному совпадению (нормализованному) импортируемой строки
 * с именем категории или любым из её синонимов. Обход по всему дереву.
 * Используется при импорте выписки Т-Банка.
 */
export function findCategoryIdByExactNameOrSynonym(
  statementCategory: string,
  categoryNodes: CategoryNode[]
): number | null {
  const key = normalizeExactKey(statementCategory);
  if (!key) return null;
  const walk = (nodes: CategoryNode[]): number | null => {
    for (const node of nodes) {
      if (node.name && normalizeExactKey(node.name) === key) return node.id;
      const syns = node.synonyms ?? [];
      for (const s of syns) {
        const t = (s ?? "").trim();
        if (t && normalizeExactKey(t) === key) return node.id;
      }
      if (node.children?.length) {
        const found = walk(node.children);
        if (found != null) return found;
      }
    }
    return null;
  };
  return walk(categoryNodes);
}

/**
 * Ищет существующий актив/обязательство (item), чьё название или синоним полностью или частично совпадает с импортируемым счётом.
 */
export function findMatchingItemId(
  importedAccountName: string,
  existingItems: ItemOut[]
): number | null {
  if (!importedAccountName?.trim() || !existingItems?.length) return null;
  for (const item of existingItems) {
    const itemName = (item.name ?? "").trim();
    if (itemName && namesMatch(importedAccountName, itemName)) return item.id;
    const syns = item.synonyms ?? [];
    for (const s of syns) {
      const t = (s ?? "").trim();
      if (t && namesMatch(importedAccountName, t)) return item.id;
    }
  }
  return null;
}
