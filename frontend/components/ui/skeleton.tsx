"use client";

import { cn } from "@/lib/utils";

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Круглый скелетон (для аватаров, иконок). */
  circle?: boolean;
}

/**
 * Переиспользуемый плейсхолдер для контента в процессе загрузки.
 * На мобильной вёрстке отображается с переливом ACCENT2.
 */
export function Skeleton({ className, circle, ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden animate-pulse rounded-[9px] skeleton-shimmer",
        circle && "rounded-full",
        className
      )}
      style={{
        backgroundColor: "rgba(255, 255, 255, 0.14)",
      }}
      {...props}
    />
  );
}
