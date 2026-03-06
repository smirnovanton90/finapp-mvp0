import { CounterpartyOut, CounterpartyIndustryOut, TransactionOut } from "@/lib/api";
import { resolveApiImageUrlToBase } from "@/lib/api-image-url";
import {
  counterpartyDefaultIconPath,
  counterpartyStaticIconPath,
} from "@/lib/image-paths";

/** Контрагент общий для всех пользователей (дефолтный). Для него иконки грузятся только из статики. */
export function isDefaultCounterparty(
  counterparty: Pick<CounterpartyOut, "owner_user_id">
): boolean {
  return counterparty.owner_user_id === null;
}

/**
 * URL-кандидаты для отображения иконки контрагента.
 * Дефолтные LEGAL: статика counterparty-<INN>.png → legal.png.
 * Дефолтные без идентификаторов / PERSON: person.png или legal.png.
 * Добавленные пользователем: API (logo/photo) → person.png/legal.png.
 */
export function getCounterpartyImageUrlCandidates(
  counterparty: CounterpartyOut,
  apiBase: string
): string[] {
  const candidates: string[] = [];
  if (isDefaultCounterparty(counterparty)) {
    if (counterparty.entity_type === "LEGAL") {
      const staticPath = counterpartyStaticIconPath(counterparty.inn);
      if (staticPath) candidates.push(staticPath);
    }
  } else {
    const apiUrl =
      counterparty.entity_type === "PERSON"
        ? counterparty.photo_url
        : counterparty.logo_url;
    const resolved = resolveApiImageUrlToBase(apiUrl, apiBase);
    if (resolved) candidates.push(resolved);
  }
  candidates.push(counterpartyDefaultIconPath(counterparty.entity_type));
  return candidates;
}

export function normalizeCounterpartySearch(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("ru");
}

export function buildCounterpartyDisplayName(
  counterparty: CounterpartyOut
): string {
  if (counterparty.entity_type === "PERSON") {
    const parts = [
      counterparty.last_name,
      counterparty.first_name,
      counterparty.middle_name,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(" ") : "Физическое лицо";
  } else {
    return counterparty.name || counterparty.full_name || "Юридическое лицо";
  }
}

export function getCounterpartyTypeLabel(
  counterparty: CounterpartyOut
): string {
  return counterparty.entity_type === "PERSON" ? "Физическое лицо" : "ЮЛ/ИП";
}

export function getCounterpartyIndustryName(
  counterparty: CounterpartyOut,
  industries: Map<number, string> | CounterpartyIndustryOut[]
): string | null {
  if (counterparty.entity_type !== "LEGAL" || !counterparty.industry_id) {
    return null;
  }

  if (industries instanceof Map) {
    return industries.get(counterparty.industry_id) || null;
  } else {
    const industry = industries.find((ind) => ind.id === counterparty.industry_id);
    return industry?.name || null;
  }
}

export function buildCounterpartySearchText(
  counterparty: CounterpartyOut,
  industries?: Map<number, string> | CounterpartyIndustryOut[]
): string {
  const parts: string[] = [];

  // Основное название/ФИО
  parts.push(buildCounterpartyDisplayName(counterparty));

  // Полное название (для ЮЛ)
  if (counterparty.entity_type === "LEGAL" && counterparty.full_name) {
    parts.push(counterparty.full_name);
  }

  // ИНН
  if (counterparty.inn) {
    parts.push(counterparty.inn);
  }

  // Отрасль
  if (industries) {
    const industryName = getCounterpartyIndustryName(counterparty, industries);
    if (industryName) {
      parts.push(industryName);
    }
  }

  return parts.join(" ");
}

export function buildCounterpartyTransactionCounts(
  transactions: TransactionOut[]
): Map<number, number> {
  const counts = new Map<number, number>();
  transactions.forEach((tx) => {
    if (tx.counterparty_id) {
      counts.set(
        tx.counterparty_id,
        (counts.get(tx.counterparty_id) ?? 0) + 1
      );
    }
  });
  return counts;
}

export function sortCounterpartiesByTransactionCount(
  counterparties: CounterpartyOut[],
  countById: Map<number, number>
): CounterpartyOut[] {
  return [...counterparties].sort((a, b) => {
    // 1. Сначала по количеству транзакций (больше = выше)
    const countA = countById.get(a.id) ?? 0;
    const countB = countById.get(b.id) ?? 0;
    if (countA !== countB) return countB - countA;
    
    // 2. Затем по наличию логотипа (с логотипом = выше)
    const hasLogoA = Boolean(a.logo_url);
    const hasLogoB = Boolean(b.logo_url);
    if (hasLogoA !== hasLogoB) return hasLogoB ? 1 : -1;
    
    // 3. Затем по алфавиту
    const nameA = buildCounterpartyDisplayName(a);
    const nameB = buildCounterpartyDisplayName(b);
    return nameA.localeCompare(nameB, "ru", { sensitivity: "base" });
  });
}
