import { useState, useMemo, useCallback, useEffect } from "react";
import {
  CATEGORY_ICON_BY_NAME,
  CATEGORY_ICON_FALLBACK,
  CATEGORY_ICON_NAME_BY_L1,
} from "@/lib/category-icons";
import { makeCategoryPathKey } from "@/lib/categories";
import { resolveApiImageUrl } from "@/lib/api-image-url";
import { categoryIconPath } from "@/lib/image-paths";

type CategoryLookup = {
  idToPath: Map<number, string[]>;
  idToIcon: Map<number, string | null>;
  idToPhotoUrl?: Map<number, string | null>;
  idToPhotoUpdatedAt?: Map<number, string | null>;
  pathToId: Map<string, number>;
};

type CategoryIcon = React.ComponentType<{
  className?: string;
  strokeWidth?: number;
  style?: React.CSSProperties;
}>;

/**
 * Хук для получения иконки категории: 3D PNG или 2D fallback при отсутствии/404
 */
export function useCategoryIcon(
  categoryId: number | null,
  categoryLookup: CategoryLookup
): {
  categoryIcon3dPath: string | null;
  CategoryIcon: CategoryIcon;
  setCategoryIconFormat: (format: "png" | null) => void;
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

  // 3D иконка — только PNG; при 404 переключаемся на 2D
  const [categoryIconFormat, setCategoryIconFormat] = useState<"png" | null>(
    categoryIconName ? "png" : null
  );

  // Путь к 3D иконке
  const categoryIcon3dPath = useMemo(() => {
    return categoryIconPath(categoryIconName ?? "", categoryIconFormat);
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
      // Для L1 приоритет у маппинга из конфига (актуальная иконка без зависимости от БД)
      const l1Name = path[0];
      const iconName =
        depth === 1 && l1Name && CATEGORY_ICON_NAME_BY_L1[l1Name]
          ? CATEGORY_ICON_NAME_BY_L1[l1Name]
          : categoryLookup.idToIcon.get(targetId) ?? null;
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

/**
 * Хук для отображения иконки категории с каскадом: загруженное пользователем фото → 3D PNG → 2D Lucide.
 * Аналог useCounterpartyImage для категорий.
 */
export function useCategoryImage(
  categoryId: number | null,
  categoryLookup: CategoryLookup,
  apiBase: string
): {
  imageSrc: string | null;
  onError: () => void;
  showFallbackIcon: boolean;
  CategoryIcon: CategoryIcon;
  setCategoryIconFormat: (format: "png" | null) => void;
} {
  const {
    categoryIcon3dPath,
    CategoryIcon,
    setCategoryIconFormat,
  } = useCategoryIcon(categoryId, categoryLookup);

  const candidates = useMemo(() => {
    const list: string[] = [];
    const photoUrl = categoryLookup.idToPhotoUrl?.get(categoryId ?? 0);
    const photoUpdatedAt = categoryLookup.idToPhotoUpdatedAt?.get(categoryId ?? 0) ?? null;
    const resolved = resolveApiImageUrl(photoUrl ?? null, apiBase);
    if (resolved) {
      const withCacheBust = photoUpdatedAt
        ? `${resolved}?t=${new Date(photoUpdatedAt).getTime()}`
        : resolved;
      list.push(withCacheBust);
    }
    if (categoryIcon3dPath) list.push(categoryIcon3dPath);
    return list;
  }, [categoryId, categoryLookup.idToPhotoUrl, categoryLookup.idToPhotoUpdatedAt, categoryIcon3dPath, apiBase]);

  const [candidateIndex, setCandidateIndex] = useState(0);
  const imageSrc =
    candidateIndex < candidates.length ? candidates[candidateIndex] : null;
  const showFallbackIcon = candidateIndex >= candidates.length;

  const onError = useCallback(() => {
    setCandidateIndex((prev) => Math.min(prev + 1, candidates.length));
    if (candidateIndex === 0 && candidates.length > 1) setCategoryIconFormat(null);
  }, [candidates.length, candidateIndex, setCategoryIconFormat]);

  useEffect(() => {
    setCandidateIndex(0);
  }, [categoryId]);

  return {
    imageSrc,
    onError,
    showFallbackIcon,
    CategoryIcon,
    setCategoryIconFormat,
  };
}
