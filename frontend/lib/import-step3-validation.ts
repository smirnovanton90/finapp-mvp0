/**
 * Валидация шага 3 импорта: обязательные поля и дубликаты категорий.
 */

import { buildCategoryLookup, makeCategoryPathKey } from "@/lib/categories";
import type { CategoryNode } from "@/lib/categories";
import type { DzenParsedCategory } from "@/lib/dzen-csv-parser";
import type { ImportCategoryCardState } from "@/components/import-category-card";

export type Step3ValidationResult =
  | { valid: true }
  | { valid: false; error: string };

function makeCategoryKey(
  name: string,
  parentRef: number | null | string
): string {
  const p =
    parentRef === null || parentRef === undefined
      ? "null"
      : typeof parentRef === "number"
        ? String(parentRef)
        : parentRef;
  return `${(name || "").trim().toLowerCase()}||${p}`;
}

function collectExistingCategoryKeys(nodes: CategoryNode[]): Set<string> {
  const keys = new Set<string>();
  const walk = (items: CategoryNode[], parentId: number | null) => {
    for (const item of items) {
      keys.add(makeCategoryKey(item.name, parentId));
      if (item.children?.length) {
        walk(item.children, item.id);
      }
    }
  };
  walk(nodes, null);
  return keys;
}

export function validateStep3(
  categories: DzenParsedCategory[],
  categoryCardStates: Map<string, ImportCategoryCardState>,
  existingCategories: CategoryNode[]
): Step3ValidationResult {
  const categoryLookup = buildCategoryLookup(existingCategories);
  const existingKeys = collectExistingCategoryKeys(existingCategories);
  const batchKeys = new Set<string>();
  // Пути категорий, которые создаём в этой пачке (pathToId-ключи)
  const batchPathKeys = new Set<string>();
  const sortedForPath = [...categories]
    .filter((c) => {
      const s = categoryCardStates.get(c.name);
      return (
        s &&
        !s.linkEnabled &&
        !s.transferModeEnabled &&
        (s.name || c.name).trim()
      );
    })
    .sort((a, b) => {
      const sa = categoryCardStates.get(a.name)!;
      const sb = categoryCardStates.get(b.name)!;
      const aHasParent = !!sa.parentPath?.l1?.trim();
      const bHasParent = !!sb.parentPath?.l1?.trim();
      return (aHasParent ? 1 : 0) - (bHasParent ? 1 : 0);
    });
  for (const c of sortedForPath) {
    const s = categoryCardStates.get(c.name)!;
    const name = (s.name || c.name).trim();
    let pathKey: string;
    if (!s.parentPath?.l1?.trim()) {
      pathKey = makeCategoryPathKey(name, "", "");
    } else {
      const [pl1, pl2, pl3] = [
        s.parentPath.l1?.trim() ?? "",
        s.parentPath.l2?.trim() ?? "",
        s.parentPath.l3?.trim() ?? "",
      ];
      const parentKey = makeCategoryPathKey(pl1, pl2, pl3);
      const parentId = categoryLookup.pathToId.get(parentKey);
      if (parentId != null) {
        const parentPath = categoryLookup.idToPath.get(parentId) ?? [pl1];
        const trail = [...parentPath, name].slice(0, 3) as [string, string, string];
        pathKey = makeCategoryPathKey(...trail);
      } else {
        pathKey = makeCategoryPathKey(pl1, pl2 || name, pl3 || (pl2 ? name : ""));
      }
    }
    batchPathKeys.add(pathKey.toLowerCase());
  }

  for (const category of categories) {
    const key = category.name;
    const state = categoryCardStates.get(key);
    if (!state) continue;

    if (state.transferModeEnabled) {
      continue;
    }

    if (state.linkEnabled) {
      if (!state.linkedPath) {
        return {
          valid: false,
          error: `Для категории «${category.name}» выберите категорию для связи.`,
        };
      }
      continue;
    }

    // Режим создания: проверяем обязательные поля
    const displayName = (state.name || category.name).trim();
    if (!displayName) {
      return {
        valid: false,
        error: `Для категории «${category.name}» укажите название.`,
      };
    }

    // Определяем parent ref: id из существующих, "batch:pathKey" если родитель из пачки, null для корня
    let parentRef: number | null | string = null;
    if (state.parentPath?.l1?.trim()) {
      const pathKey = makeCategoryPathKey(
        state.parentPath.l1,
        state.parentPath.l2,
        state.parentPath.l3
      );
      const existingId = categoryLookup.pathToId.get(pathKey);
      if (existingId != null) {
        parentRef = existingId;
      } else if (batchPathKeys.has(pathKey.toLowerCase())) {
        parentRef = `batch:${pathKey.toLowerCase()}`;
      }
    }
    const catKey = makeCategoryKey(displayName, parentRef);
    if (typeof parentRef === "number" && existingKeys.has(catKey)) {
      return {
        valid: false,
        error: `Категория с названием «${displayName}» уже существует в выбранной родительской категории.`,
      };
    }
    if (batchKeys.has(catKey)) {
      return {
        valid: false,
        error: `В импорте несколько категорий с одинаковым названием «${displayName}» в одной родительской категории.`,
      };
    }
    batchKeys.add(catKey);
  }

  return { valid: true };
}
