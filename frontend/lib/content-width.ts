/**
 * Эталонная ширина контента: 900px при недостатке места, 1350px при доступной ширине ≥ 1400px.
 * Переключение по container query (область контента с учётом сайдбара и панели фильтров).
 * Плавная анимация при смене ширины (как у сайдбара).
 * Использовать на обёртке контента внутри контейнера (layout content area с @container).
 */
export const CONTENT_WIDTH_CLASS =
  "w-full max-w-[900px] @[1400px]:max-w-[1350px] mx-auto transition-[max-width] duration-300 ease-out";
