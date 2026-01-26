"use client";

import React from "react";
import { useImagePreloader, ImagePreloaderOptions } from "@/hooks/use-image-preloader";

export interface ImagePreloaderProps extends Omit<ImagePreloaderOptions, "imageUrls"> {
  /**
   * URLs изображений для предзагрузки
   */
  imageUrls: (string | null | undefined)[];
  /**
   * Дочерние элементы, которые будут скрыты до загрузки изображений
   */
  children: React.ReactNode;
  /**
   * CSS класс для контейнера
   */
  className?: string;
  /**
   * Стили для контейнера
   */
  style?: React.CSSProperties;
  /**
   * Продолжительность перехода появления (в мс)
   */
  transitionDuration?: number;
  /**
   * Показывать ли placeholder во время загрузки
   */
  showPlaceholder?: boolean;
  /**
   * Кастомный placeholder
   */
  placeholder?: React.ReactNode;
  /**
   * Минимальная высота placeholder (в px)
   */
  placeholderMinHeight?: number;
}

/**
 * Компонент-обертка для автоматического скрытия контента до загрузки изображений.
 * Полезен для карточек и других компонентов с изображениями.
 * 
 * @example
 * ```tsx
 * <ImagePreloader
 *   imageUrls={[photoUrl, logoUrl]}
 *   placeholderMinHeight={200}
 * >
 *   <div>
 *     <img src={photoUrl} />
 *     <img src={logoUrl} />
 *   </div>
 * </ImagePreloader>
 * ```
 */
export function ImagePreloader({
  imageUrls,
  children,
  className,
  style,
  transitionDuration = 200,
  showPlaceholder = false,
  placeholder,
  placeholderMinHeight,
  onAllLoaded,
  cacheCheckDelay,
}: ImagePreloaderProps) {
  const { isReady } = useImagePreloader({
    imageUrls,
    onAllLoaded,
    cacheCheckDelay,
  });

  const transitionStyle: React.CSSProperties = {
    opacity: isReady ? 1 : 0,
    transition: `opacity ${transitionDuration}ms ease-in-out`,
    position: "relative",
  };

  return (
    <div
      className={className}
      style={{
        ...transitionStyle,
        ...style,
      }}
    >
      {children}
      {showPlaceholder && !isReady && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            minHeight: placeholderMinHeight,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          {placeholder || (
            <div
              style={{
                width: "100%",
                height: "100%",
                backgroundColor: "rgba(0, 0, 0, 0.05)",
                borderRadius: "8px",
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
