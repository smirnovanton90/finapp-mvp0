"use client";

import type { CategoryLookup } from "@/lib/categories";
import { useCategoryImage } from "@/hooks/use-category-icon";
import { CardIcon } from "@/components/card-icon";
import { ACCENT } from "@/lib/colors";

type CategoryIconImageProps = {
  categoryId: number | null;
  categoryLookup: CategoryLookup;
  /** Базовый URL API для загрузки фото категории (если не передан — фото не подставляются). */
  apiBase: string;
  size?: number;
  className?: string;
  /** Цвет fallback-иконки (Lucide). По умолчанию ACCENT. */
  fallbackIconColor?: string;
};

/**
 * Единый компонент иконки категории: загруженное фото → 3D PNG → 2D Lucide fallback.
 * Переиспользует механизм каскада как у контрагентов и активов.
 */
export function CategoryIconImage({
  categoryId,
  categoryLookup,
  apiBase,
  size = 24,
  className = "",
  fallbackIconColor = ACCENT,
}: CategoryIconImageProps) {
  const {
    imageSrc,
    onError,
    showFallbackIcon,
    CategoryIcon,
    setCategoryIconFormat,
  } = useCategoryImage(categoryId, categoryLookup, apiBase);

  if (!categoryId) return null;

  return (
    <CardIcon
      src={!showFallbackIcon ? imageSrc : null}
      alt=""
      fallbackIcon={CategoryIcon}
      size={size}
      shadow={false}
      className={className}
      onError={() => {
        onError();
        setCategoryIconFormat(null);
      }}
      fallbackIconColor={fallbackIconColor}
      objectFit="contain"
    />
  );
}
