/**
 * Валидация шага 4 импорта: обязательные поля и дубликаты контрагентов.
 */

import type { CounterpartyOut } from "@/lib/api";
import type { DzenParsedCounterparty } from "@/lib/dzen-csv-parser";
import type { ImportCounterpartyCardState } from "@/components/import-counterparty-card";

export type Step4ValidationResult =
  | { valid: true }
  | { valid: false; error: string };

function counterpartyKey(
  entityType: "LEGAL" | "PERSON",
  name: string,
  inn: string | null,
  firstName: string | null,
  lastName: string | null,
  middleName: string | null
): string {
  if (inn && /^\d+$/.test(inn)) {
    return `inn:${inn}`;
  }
  if (entityType === "LEGAL") {
    return `legal:${(name || "").trim().toLowerCase()}`;
  }
  const fn = (firstName || "").trim().toLowerCase();
  const ln = (lastName || "").trim().toLowerCase();
  const mn = (middleName || "").trim().toLowerCase();
  return `person:${fn}||${ln}||${mn}`;
}

export function validateStep4(
  counterparties: DzenParsedCounterparty[],
  counterpartyCardStates: Map<string, ImportCounterpartyCardState>,
  existingCounterparties: CounterpartyOut[]
): Step4ValidationResult {
  const existingKeys = new Set<string>();
  for (const cp of existingCounterparties) {
    if (cp.deleted_at) continue;
    const key = counterpartyKey(
      cp.entity_type,
      cp.name ?? "",
      cp.inn ?? null,
      cp.first_name ?? null,
      cp.last_name ?? null,
      cp.middle_name ?? null
    );
    existingKeys.add(key);
  }

  const batchKeys = new Set<string>();

  for (const cp of counterparties) {
    const key = cp.name;
    const state = counterpartyCardStates.get(key);
    if (!state) continue;

    if (state.linkEnabled) {
      if (state.linkedCounterpartyId == null) {
        return {
          valid: false,
          error: `Для контрагента «${cp.name}» выберите контрагента для связи.`,
        };
      }
      continue;
    }

    // Режим создания нового: проверяем обязательные поля
    if (state.entityType === "LEGAL") {
      const displayName = (state.name || cp.name).trim();
      if (!displayName) {
        return {
          valid: false,
          error: `Для контрагента «${cp.name}» укажите название.`,
        };
      }

      const cpKey = counterpartyKey(
        "LEGAL",
        displayName,
        null,
        null,
        null,
        null
      );
      if (existingKeys.has(cpKey)) {
        return {
          valid: false,
          error: `Контрагент с названием «${displayName}» уже существует.`,
        };
      }
      if (batchKeys.has(cpKey)) {
        return {
          valid: false,
          error: `В импорте несколько контрагентов с одинаковым названием «${displayName}».`,
        };
      }
      batchKeys.add(cpKey);
    } else {
      const lastName = (state.lastName ?? "").trim();
      const firstName = (state.firstName ?? "").trim();
      if (!lastName) {
        return {
          valid: false,
          error: `Для контрагента «${cp.name}» укажите фамилию.`,
        };
      }
      if (!firstName) {
        return {
          valid: false,
          error: `Для контрагента «${cp.name}» укажите имя.`,
        };
      }

      const cpKey = counterpartyKey(
        "PERSON",
        "",
        null,
        firstName,
        lastName,
        (state.middleName ?? "").trim() || null
      );
      if (existingKeys.has(cpKey)) {
        return {
          valid: false,
          error: `Контрагент с ФИО «${lastName} ${firstName}» уже существует.`,
        };
      }
      if (batchKeys.has(cpKey)) {
        return {
          valid: false,
          error: `В импорте несколько контрагентов с одинаковым ФИО «${lastName} ${firstName}».`,
        };
      }
      batchKeys.add(cpKey);
    }
  }

  return { valid: true };
}
