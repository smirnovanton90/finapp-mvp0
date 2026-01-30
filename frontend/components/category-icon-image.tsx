"use client";

import type { CategoryLookup } from "@/lib/categories";
import { useCategoryIcon } from "@/hooks/use-category-icon";
import { CardIcon } from "@/components/card-icon";
import { ACCENT } from "@/lib/colors";

type CategoryIconImageProps = {
  categoryId: number | null;
  categoryLookup: CategoryLookup;
  size?: number;
  className?: string;
  /** Цвет fallback-иконки (Lucide). По умолчанию ACCENT. */
  fallbackIconColor?: string;
};

/**
 * Единый компонент иконки категории: useCategoryIcon + CardIcon (3D PNG или 2D Lucide fallback).
 * Переиспользует логику карточки актива/транзакций для отображения иконки категории.
 */
export function CategoryIconImage({
  categoryId,
  categoryLookup,
  size = 24,
  className = "",
  fallbackIconColor = ACCENT,
}: CategoryIconImageProps) {
  const {
    categoryIcon3dPath,
    CategoryIcon,
    setCategoryIconFormat,
  } = useCategoryIcon(categoryId, categoryLookup);

  if (!categoryId) return null;

  return (
    <CardIcon
      src={categoryIcon3dPath}
      alt=""
      fallbackIcon={CategoryIcon}
      size={size}
      shadow={false}
      className={className}
      onError={() => setCategoryIconFormat(null)}
      fallbackIconColor={fallbackIconColor}
      objectFit="contain"
    />
  );
}
