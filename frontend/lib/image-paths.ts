/**
 * Единые пути к статичным изображениям (public/images/).
 */

export const IMAGES_BASE = "/images";

export function assetIconPath(
  typeCode: string,
  format?: "png" | null
): string | null {
  if (!format) return null;
  return `${IMAGES_BASE}/assets/${typeCode}.${format}`;
}

export function categoryIconPath(
  iconName: string,
  format?: "png" | null
): string | null {
  if (!format || !iconName) return null;
  return `${IMAGES_BASE}/categories/${iconName}.${format}`;
}

export function transferIconPath(format?: "png" | null): string | null {
  if (!format) return null;
  return `${IMAGES_BASE}/assets/transfer-arrow.${format}`;
}

export function counterpartyDefaultIconPath(
  entityType: "PERSON" | "LEGAL"
): string {
  const name = entityType === "PERSON" ? "person" : "legal";
  return `${IMAGES_BASE}/counterparties/${name}.png`;
}

/**
 * Статичная иконка контрагента по ИНН (для дефолтных LEGAL).
 * counterparty-<INN>.png. Возвращает null, если нет ИНН.
 */
export function counterpartyStaticIconPath(
  inn: string | null | undefined
): string | null {
  const hasInn = Boolean(inn?.trim());
  if (hasInn) return `${IMAGES_BASE}/counterparties/counterparty-${inn}.png`;
  return null;
}
