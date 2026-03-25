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

/** 3D-декор шапки раздела на странице активов: `public/images/asset-sections/<sectionId>.png`. */
export function assetSectionIconPath(sectionId: string): string {
  return `${IMAGES_BASE}/asset-sections/${sectionId}.png`;
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

/** Ключи банков в модалке импорта → ИНН (те же файлы, что и иконки контрагентов). */
export const IMPORT_BANK_INN: Record<"tbank" | "sber" | "alfa" | "ozon", string> = {
  tbank: "7710140679",
  sber: "7707083893",
  alfa: "7728168971",
  ozon: "9703077050",
};

/**
 * Путь к иконке банка для модалки импорта (тот же каталог и именование, что у контрагентов).
 */
export function importBankIconPath(
  bankKey: "tbank" | "sber" | "alfa" | "ozon"
): string {
  const inn = IMPORT_BANK_INN[bankKey];
  return counterpartyStaticIconPath(inn) ?? counterpartyDefaultIconPath("LEGAL");
}
