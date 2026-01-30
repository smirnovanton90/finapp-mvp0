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
 * Статичная иконка контрагента по ИНН и/или ОГРН (для дефолтных LEGAL).
 * Оба: counterparty-<INN>-<OGRN>.png, только ИНН: counterparty-<INN>.png, только ОГРН: counterparty-<OGRN>.png.
 * Возвращает null, если нет ни ИНН, ни ОГРН.
 */
export function counterpartyStaticIconPath(
  inn: string | null | undefined,
  ogrn: string | null | undefined
): string | null {
  const hasInn = Boolean(inn?.trim());
  const hasOgrn = Boolean(ogrn?.trim());
  if (hasInn && hasOgrn) {
    return `${IMAGES_BASE}/counterparties/counterparty-${inn}-${ogrn}.png`;
  }
  if (hasInn) return `${IMAGES_BASE}/counterparties/counterparty-${inn}.png`;
  if (hasOgrn) return `${IMAGES_BASE}/counterparties/counterparty-${ogrn}.png`;
  return null;
}
