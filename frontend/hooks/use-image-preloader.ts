"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";

export interface ImagePreloaderOptions {
  /**
   * URLs изображений для предзагрузки
   */
  imageUrls: (string | null | undefined)[];
  /**
   * Callback, вызываемый когда все изображения загружены
   */
  onAllLoaded?: () => void;
  /**
   * Задержка перед проверкой кеша (в мс)
   */
  cacheCheckDelay?: number;
}

export interface ImagePreloaderResult {
  /**
   * true, если все изображения загружены (или их нет)
   */
  isReady: boolean;
  /**
   * Количество загруженных изображений
   */
  loadedCount: number;
  /**
   * Общее количество изображений для загрузки
   */
  totalCount: number;
  /**
   * Refs для каждого изображения (для проверки кеша)
   */
  imageRefs: React.MutableRefObject<HTMLImageElement | null>[];
  /**
   * Callback для установки ref изображения по индексу
   */
  setImageRef: (index: number, element: HTMLImageElement | null) => void;
  /**
   * Callback для обработки загрузки изображения по индексу
   */
  handleImageLoad: (index: number) => void;
  /**
   * Callback для обработки ошибки загрузки изображения по индексу
   */
  handleImageError: (index: number) => void;
}

/**
 * Универсальный хук для отслеживания загрузки изображений.
 * Полезен для скрытия контента до полной загрузки всех изображений.
 * 
 * @example
 * ```tsx
 * const { isReady, imageRefs, handleImageLoad, handleImageError } = useImagePreloader({
 *   imageUrls: [photoUrl, logoUrl],
 * });
 * 
 * return (
 *   <div style={{ opacity: isReady ? 1 : 0 }}>
 *     <img
 *       ref={(el) => imageRefs[0].current = el}
 *       src={photoUrl}
 *       onLoad={() => handleImageLoad(0)}
 *       onError={() => handleImageError(0)}
 *     />
 *   </div>
 * );
 * ```
 */
export function useImagePreloader({
  imageUrls,
  onAllLoaded,
  cacheCheckDelay = 0,
}: ImagePreloaderOptions): ImagePreloaderResult {
  // Работаем с исходными индексами, но учитываем только валидные URL
  const totalCount = imageUrls.length;
  
  // Создаем мапу: исходный индекс -> валидный URL
  const validUrlMap = useMemo(() => {
    const map = new Map<number, string>();
    imageUrls.forEach((url, index) => {
      if (url) {
        map.set(index, url);
      }
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrls.join(",")]);

  // Состояния загрузки для каждого изображения (по исходным индексам)
  // null/undefined URL считаются сразу загруженными
  const [loadedStates, setLoadedStates] = useState<boolean[]>(() => {
    return imageUrls.map((url) => !Boolean(url)); // null/undefined = уже "загружено"
  });

  // Refs для каждого изображения (для проверки кеша) - по исходным индексам
  const imageRefs = useRef<React.MutableRefObject<HTMLImageElement | null>[]>(
    imageUrls.map(() => ({ current: null }))
  ).current;

  // Callback для установки ref
  const setImageRef = useCallback((index: number, element: HTMLImageElement | null) => {
    if (imageRefs[index]) {
      imageRefs[index].current = element;
    }
  }, [imageRefs]);

  // Callback для обработки загрузки
  const handleImageLoad = useCallback((index: number) => {
    setLoadedStates((prev) => {
      const next = [...prev];
      next[index] = true;
      return next;
    });
  }, []);

  // Callback для обработки ошибки
  const handleImageError = useCallback((index: number) => {
    setLoadedStates((prev) => {
      const next = [...prev];
      next[index] = true; // Считаем ошибку как "загружено" (fallback будет показан)
      return next;
    });
  }, []);

  // Проверка кеша для всех изображений
  useEffect(() => {
    if (totalCount === 0) {
      return;
    }

    const checkCache = () => {
      const newStates = [...loadedStates];
      let hasChanges = false;

      imageRefs.forEach((ref, index) => {
        // Проверяем только валидные URL (не null/undefined)
        if (validUrlMap.has(index) && !newStates[index] && ref.current?.complete) {
          newStates[index] = true;
          hasChanges = true;
        }
      });

      if (hasChanges) {
        setLoadedStates(newStates);
      }
    };

    if (cacheCheckDelay > 0) {
      const timeoutId = setTimeout(checkCache, cacheCheckDelay);
      return () => clearTimeout(timeoutId);
    } else {
      checkCache();
    }
  }, [totalCount, cacheCheckDelay, imageRefs, loadedStates, validUrlMap]);

  // Инициализация: сбрасываем состояния при изменении URLs
  useEffect(() => {
    if (totalCount === 0) {
      setLoadedStates([]);
    } else {
      // Сбрасываем состояния: null/undefined = сразу "загружено", остальные = false
      setLoadedStates(imageUrls.map((url) => !Boolean(url)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalCount, imageUrls.join(",")]);

  // Проверка готовности: все изображения должны быть загружены
  const loadedCount = loadedStates.filter(Boolean).length;
  const isReady = totalCount === 0 || loadedCount === totalCount;

  // Вызов callback при полной загрузке
  useEffect(() => {
    if (isReady && onAllLoaded) {
      onAllLoaded();
    }
  }, [isReady, onAllLoaded]);

  return {
    isReady,
    loadedCount,
    totalCount: validUrlMap.size, // Возвращаем количество валидных URL
    imageRefs,
    setImageRef,
    handleImageLoad,
    handleImageError,
  };
}
