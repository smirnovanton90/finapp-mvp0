/**
 * Поиск совпадений импортируемых категорий, контрагентов и счетов с уже имеющимися.
 * Используется для автоматического включения режима сопряжения при полном или частичном совпадении названия.
 */

import { buildCategoryLookup } from "@/lib/categories";
import type { CategoryNode } from "@/lib/categories";
import type { CounterpartyOut, ItemOut } from "@/lib/api";

export type CategoryPath = { l1: string; l2: string; l3: string };

function pathArrayToCategoryPath(path: string[]): CategoryPath {
  return {
    l1: path[0]?.trim() ?? "",
    l2: path[1]?.trim() ?? "",
    l3: path[2]?.trim() ?? "",
  };
}

/** Нормализованная строка для сравнения (trim + lowerCase). */
function norm(s: string): string {
  return (s ?? "").trim().toLowerCase();
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
 * Ищет существующую категорию по совпадению с импортируемым названием.
 * — Обход: все категории (по умолчанию + пользовательские), начиная с 3-го уровня, затем 2-й, затем 1-й.
 * — На совпадение проверяется только название самой категории (без названий родителей).
 * — Полное совпадение предпочитается частичному.
 */
export function findMatchingCategoryPath(
  importedName: string,
  existingNodes: CategoryNode[]
): CategoryPath | null {
  if (!importedName?.trim() || !existingNodes?.length) return null;
  const lookup = buildCategoryLookup(existingNodes);
  const { idToPath } = lookup;
  const entries = Array.from(idToPath.entries()).map(([id, path]) => ({
    id,
    path,
  }));
  // Сначала 3-й уровень, затем 2-й, затем 1-й
  entries.sort((a, b) => b.path.length - a.path.length);

  const importedNorm = norm(importedName);
  if (!importedNorm) return null;

  // Собственное название категории — последний сегмент пути (без родителей)
  const getOwnName = (path: string[]) => path[path.length - 1]?.trim() ?? "";

  // 1. Сначала полное совпадение (нормализованное равенство)
  for (const { path } of entries) {
    const ownName = getOwnName(path);
    if (ownName && norm(ownName) === importedNorm) {
      return pathArrayToCategoryPath(path);
    }
  }

  // 2. Затем частичное совпадение (одна строка содержит другую)
  for (const { path } of entries) {
    const ownName = getOwnName(path);
    const sn = norm(ownName);
    if (!sn) continue;
    if (importedNorm.includes(sn) || sn.includes(importedNorm)) {
      return pathArrayToCategoryPath(path);
    }
  }
  return null;
}

/**
 * Ищет существующего контрагента, чьё название (или ФИО) полностью или частично совпадает с импортируемым.
 */
export function findMatchingCounterpartyId(
  importedName: string,
  existingCounterparties: CounterpartyOut[]
): number | null {
  if (!importedName?.trim() || !existingCounterparties?.length) return null;
  const nameNorm = norm(importedName);
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
  }
  return null;
}

/**
 * Ищет существующий актив/обязательство (item), чьё название полностью или частично совпадает с импортируемым счётом.
 */
export function findMatchingItemId(
  importedAccountName: string,
  existingItems: ItemOut[]
): number | null {
  if (!importedAccountName?.trim() || !existingItems?.length) return null;
  for (const item of existingItems) {
    const itemName = (item.name ?? "").trim();
    if (itemName && namesMatch(importedAccountName, itemName)) return item.id;
  }
  return null;
}
