/**
 * Типы активов и обязательств для селекторов (импорт, создание и т.д.)
 * Синхронизировано с текущим списком видов активов/обязательств из asset-item-form-constants.
 */

import { ASSET_TYPES, LIABILITY_TYPES } from "@/lib/asset-item-form-constants";

/** Опции видов активов (тот же список, что в форме создания актива). */
export const ASSET_TYPE_OPTIONS = ASSET_TYPES.map((t) => ({
  code: t.code,
  label: t.label,
}));

/** Опции видов обязательств (тот же список, что в форме создания обязательства). */
export const LIABILITY_TYPE_OPTIONS = LIABILITY_TYPES.map((t) => ({
  code: t.code,
  label: t.label,
}));

export function getTypeOptionsForKind(kind: "ASSET" | "LIABILITY") {
  return kind === "ASSET" ? ASSET_TYPE_OPTIONS : LIABILITY_TYPE_OPTIONS;
}

/**
 * Нормализует typeCode из старого формата (bank_card) в текущий (bank_card_debit)
 * для отображения в селекторе при импорте.
 */
export function normalizeDisplayTypeCode(
  typeCode: string,
  kind: "ASSET" | "LIABILITY"
): string {
  if (kind === "ASSET" && typeCode === "bank_card") return "bank_card_debit";
  return typeCode;
}
