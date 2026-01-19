import { CounterpartyOut, CounterpartyIndustryOut, TransactionOut } from "@/lib/api";

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

  // ОГРН
  if (counterparty.ogrn) {
    parts.push(counterparty.ogrn);
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
