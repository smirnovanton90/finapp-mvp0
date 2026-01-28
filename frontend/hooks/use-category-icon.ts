import { useState, useMemo } from "react";
import {
  CATEGORY_ICON_BY_NAME,
  CATEGORY_ICON_FALLBACK,
  CATEGORY_ICON_NAME_BY_L1,
} from "@/lib/category-icons";
import { makeCategoryPathKey } from "@/lib/categories";

type CategoryLookup = {
  idToPath: Map<number, string[]>;
  idToIcon: Map<number, string | null>;
  pathToId: Map<string, number>;
};

type CategoryIcon = React.ComponentType<{
  className?: string;
  strokeWidth?: number;
  style?: React.CSSProperties;
}>;

/**
 * Хук для получения иконки категории с поддержкой 3D (PNG/WebP fallback) и 2D fallback
 * Использует ту же логику, что и карточка транзакции
 */
export function useCategoryIcon(
  categoryId: number | null,
  categoryLookup: CategoryLookup
): {
  categoryIcon3dPath: string | null;
  CategoryIcon: CategoryIcon;
  setCategoryIconFormat: (format: "png" | "webp" | null) => void;
} {
  // Получаем путь категории для определения L1
  const categoryPath = useMemo(() => {
    if (!categoryId) return null;
    return categoryLookup.idToPath.get(categoryId) ?? null;
  }, [categoryId, categoryLookup.idToPath]);

  const categoryL1 = categoryPath?.[0] ?? null;

  // Получаем имя иконки через L1 (как в транзакции)
  const categoryIconName = useMemo(() => {
    return categoryL1 ? CATEGORY_ICON_NAME_BY_L1[categoryL1] ?? null : null;
  }, [categoryL1]);

  // State для формата 3D иконки с fallback PNG -> WebP
  const [categoryIconFormat, setCategoryIconFormat] = useState<"png" | "webp" | null>(
    categoryIconName ? "png" : null
  );

  // Путь к 3D иконке
  const categoryIcon3dPath = useMemo(() => {
    return categoryIconName && categoryIconFormat
      ? `/icons-3d/categories/${categoryIconName}.${categoryIconFormat}`
      : null;
  }, [categoryIconName, categoryIconFormat]);

  // 2D fallback иконка через resolveCategoryIcon (поиск по иерархии)
  const CategoryIcon = useMemo(() => {
    if (!categoryId) return CATEGORY_ICON_FALLBACK;
    const path = categoryLookup.idToPath.get(categoryId);
    if (!path || path.length === 0) return CATEGORY_ICON_FALLBACK;
    
    // Ищем иконку по иерархии от текущей категории до корня
    for (let depth = path.length; depth >= 1; depth -= 1) {
      const key = makeCategoryPathKey(...path.slice(0, depth));
      const targetId = categoryLookup.pathToId.get(key);
      if (!targetId) continue;
      const iconName = categoryLookup.idToIcon.get(targetId);
      if (!iconName) continue;
      const normalizedIconName = iconName.trim();
      if (!normalizedIconName) continue;
      const Icon = CATEGORY_ICON_BY_NAME[normalizedIconName];
      if (Icon) return Icon;
    }
    return CATEGORY_ICON_FALLBACK;
  }, [categoryId, categoryLookup]);

  return {
    categoryIcon3dPath,
    CategoryIcon,
    setCategoryIconFormat,
  };
}
