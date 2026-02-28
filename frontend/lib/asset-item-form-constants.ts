/**
 * Constants for the asset/liability form (shared with Assets page and AddEditItemModal).
 */

import type { ItemKind, MarketPriceOut, PrimaryValueKind } from "./api";

export const PRIMARY_VALUE_KIND_OPTIONS: { value: PrimaryValueKind; label: string }[] = [
  { value: "BALANCE", label: "Балансовая стоимость" },
  { value: "MARKET", label: "Рыночная стоимость" },
  { value: "ACQUISITION", label: "Стоимость приобретения" },
  { value: "INVESTED", label: "Стоимость вложенных средств" },
];

export function getPrimaryValueLabel(primaryValueKind: PrimaryValueKind | null | undefined): string {
  if (!primaryValueKind) return "Балансовая стоимость";
  const opt = PRIMARY_VALUE_KIND_OPTIONS.find((o) => o.value === primaryValueKind);
  return opt?.label ?? "Балансовая стоимость";
}

export function getDefaultPrimaryValueKind(typeCode: string, kind: ItemKind): PrimaryValueKind {
  if (kind === "LIABILITY") return "BALANCE";
  if (typeCode === "deposit") return "BALANCE";
  if (typeCode === "savings_account" || typeCode === "brokerage") return "BALANCE";
  if (CASH_TYPES.includes(typeCode) || THIRD_PARTY_DEBT_TYPES.includes(typeCode) || PENSION_TYPES.includes(typeCode) || OTHER_ASSET_TYPES.includes(typeCode))
    return "BALANCE";
  if (INVESTMENT_TYPES.includes(typeCode) || REAL_ESTATE_TYPES.includes(typeCode) || TRANSPORT_TYPES.includes(typeCode) || VALUABLES_TYPES.includes(typeCode))
    return "MARKET";
  return "BALANCE";
}

export function getTodayDateKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export const ASSET_TYPES = [
  { code: "cash", label: "Наличные" },
  { code: "bank_account", label: "Банковский счёт" },
  { code: "bank_card", label: "Банковская карта" },
  { code: "savings_account", label: "Накопительный счет" },
  { code: "e_wallet", label: "Электронный кошелек" },
  { code: "brokerage", label: "Брокерский счёт" },
  { code: "deposit", label: "Вклад" },
  { code: "securities", label: "Акции" },
  { code: "bonds", label: "Облигации" },
  { code: "etf", label: "ETF" },
  { code: "bpif", label: "БПИФ" },
  { code: "pif", label: "ПИФ" },
  { code: "iis", label: "ИИС" },
  { code: "precious_metals", label: "Драгоценные металлы" },
  { code: "crypto", label: "Криптовалюта" },
  { code: "loan_to_third_party", label: "Предоставленные займы третьим лицам" },
  { code: "real_estate", label: "Квартира" },
  { code: "townhouse", label: "Дом / таунхаус" },
  { code: "land_plot", label: "Земельный участок" },
  { code: "garage", label: "Гараж / машиноместо" },
  { code: "commercial_real_estate", label: "Коммерческая недвижимость" },
  { code: "real_estate_share", label: "Доля в недвижимости" },
  { code: "car", label: "Автомобиль" },
  { code: "motorcycle", label: "Мотоцикл" },
  { code: "boat", label: "Катер / лодка" },
  { code: "trailer", label: "Прицеп" },
  { code: "special_vehicle", label: "Спецтехника" },
  { code: "jewelry", label: "Драгоценности" },
  { code: "electronics", label: "Техника и электроника" },
  { code: "art", label: "Ценные предметы искусства" },
  { code: "collectibles", label: "Коллекционные вещи" },
  { code: "other_valuables", label: "Прочие ценные вещи" },
  { code: "npf", label: "НПФ" },
  { code: "investment_life_insurance", label: "ИСЖ" },
  { code: "business_share", label: "Доля в бизнесе" },
  { code: "sole_proprietor", label: "ИП (оценка бизнеса)" },
  { code: "other_asset", label: "Прочие активы" },
];

export const LIABILITY_TYPES = [
  { code: "consumer_loan", label: "Потребительский кредит" },
  { code: "mortgage", label: "Ипотека" },
  { code: "car_loan", label: "Автокредит" },
  { code: "education_loan", label: "Образовательный кредит" },
  { code: "installment", label: "Рассрочка" },
  { code: "microloan", label: "МФО" },
  { code: "private_loan", label: "Полученные займы от третьих лиц" },
  { code: "tax_debt", label: "Налоги и обязательные платежи" },
  { code: "personal_income_tax_debt", label: "Задолженность по НДФЛ" },
  { code: "property_tax_debt", label: "Задолженность по налогу на имущество" },
  { code: "land_tax_debt", label: "Задолженность по земельному налогу" },
  { code: "transport_tax_debt", label: "Задолженность по транспортному налогу" },
  { code: "fns_debt", label: "Задолженности перед ФНС" },
  { code: "utilities_debt", label: "Задолженность по ЖКХ" },
  { code: "telecom_debt", label: "Задолженность за интернет / связь" },
  { code: "traffic_fines_debt", label: "Задолженность по штрафам (ГИБДД и прочие)" },
  { code: "enforcement_debt", label: "Задолженность по исполнительным листам" },
  { code: "alimony_debt", label: "Задолженность по алиментам" },
  { code: "court_debt", label: "Судебные задолженности" },
  { code: "court_fine_debt", label: "Штрафы по решениям суда" },
  { code: "business_liability", label: "Бизнес-обязательства" },
  { code: "other_liability", label: "Прочие обязательства" },
];

/** Денежные активы (раздел без накопительного и брокерского счёта) */
export const CASH_TYPES = ["cash", "bank_account", "bank_card", "e_wallet"];
/** Инвестиционные активы: порядок типов в разделе (ETF, БПИФ, ПИФ, ИИС скрыты в v1) */
export const INVESTMENT_TYPES = ["deposit", "savings_account", "brokerage", "securities", "bonds", "crypto", "precious_metals"];
/** Типы счетов, с которых допускается погашение кредитов/займов */
export const REPAYMENT_ACCOUNT_TYPE_CODES = ["cash", "bank_account", "bank_card", "e_wallet", "savings_account", "brokerage"];
const THIRD_PARTY_DEBT_TYPES = ["loan_to_third_party", "counterparty_settlements"];
const REAL_ESTATE_TYPES = ["real_estate", "townhouse", "land_plot", "garage", "commercial_real_estate", "real_estate_share"];
const TRANSPORT_TYPES = ["car", "motorcycle", "boat", "trailer", "special_vehicle"];
const VALUABLES_TYPES = ["jewelry", "electronics", "art", "collectibles", "other_valuables"];
const PENSION_TYPES = ["npf", "investment_life_insurance"];
const OTHER_ASSET_TYPES = ["business_share", "sole_proprietor", "other_asset"];
const CREDIT_LIABILITY_TYPES = ["consumer_loan", "mortgage", "car_loan", "education_loan", "installment", "microloan"];
const THIRD_PARTY_LOAN_TYPES = ["private_loan", "counterparty_settlements"];
const TAX_LIABILITY_TYPES = ["tax_debt", "personal_income_tax_debt", "property_tax_debt", "land_tax_debt", "transport_tax_debt", "fns_debt"];
const UTILITY_LIABILITY_TYPES = ["utilities_debt", "telecom_debt", "traffic_fines_debt"];
const LEGAL_LIABILITY_TYPES = ["enforcement_debt", "alimony_debt", "court_debt", "court_fine_debt"];
const OTHER_LIABILITY_TYPES = ["business_liability", "other_liability"];

export const MOEX_TYPE_CODES = ["securities", "bonds", "etf", "bpif", "pif", "precious_metals"];

export const COUNTERPARTY_TYPE_CODES = [
  "bank_account", "bank_card", "deposit", "savings_account", "consumer_loan", "mortgage", "car_loan", "education_loan",
  "loan_to_third_party", "private_loan", "brokerage", "installment", "microloan", "e_wallet", "npf", "investment_life_insurance",
  "utilities_debt", "telecom_debt", "tax_debt", "fns_debt", "traffic_fines_debt", "enforcement_debt", "alimony_debt",
  "court_debt", "court_fine_debt", "personal_income_tax_debt", "property_tax_debt", "land_tax_debt", "transport_tax_debt",
];

export const MANDATORY_COUNTERPARTY_TYPE_CODES = [
  "bank_account", "bank_card", "deposit", "savings_account", "consumer_loan", "mortgage", "car_loan", "education_loan",
  "loan_to_third_party", "private_loan",
];

export const ITEM_SECTIONS: { id: string; kind: ItemKind; label: string; typeCodes: string[] }[] = [
  { id: "cash_assets", kind: "ASSET", label: "Денежные активы", typeCodes: CASH_TYPES },
  { id: "investment_assets", kind: "ASSET", label: "Инвестиционные активы", typeCodes: INVESTMENT_TYPES },
  { id: "third_party_assets", kind: "ASSET", label: "Долги третьих лиц", typeCodes: THIRD_PARTY_DEBT_TYPES },
  { id: "real_estate", kind: "ASSET", label: "Недвижимость", typeCodes: REAL_ESTATE_TYPES },
  { id: "transport", kind: "ASSET", label: "Транспорт", typeCodes: TRANSPORT_TYPES },
  { id: "valuables", kind: "ASSET", label: "Имущество", typeCodes: VALUABLES_TYPES },
  { id: "pension_assets", kind: "ASSET", label: "Пенсионные и страховые активы", typeCodes: PENSION_TYPES },
  { id: "other_assets", kind: "ASSET", label: "Прочие активы", typeCodes: OTHER_ASSET_TYPES },
  { id: "credit_liabilities", kind: "LIABILITY", label: "Кредитные обязательства", typeCodes: CREDIT_LIABILITY_TYPES },
  { id: "third_party_loans", kind: "LIABILITY", label: "Долги третьим лицам", typeCodes: THIRD_PARTY_LOAN_TYPES },
  { id: "tax_liabilities", kind: "LIABILITY", label: "Налоги и обязательные платежи", typeCodes: TAX_LIABILITY_TYPES },
  { id: "utility_liabilities", kind: "LIABILITY", label: "Коммунальные и бытовые долги", typeCodes: UTILITY_LIABILITY_TYPES },
  { id: "legal_liabilities", kind: "LIABILITY", label: "Судебные и иные обязательства", typeCodes: LEGAL_LIABILITY_TYPES },
  { id: "other_liabilities", kind: "LIABILITY", label: "Прочие обязательства", typeCodes: OTHER_LIABILITY_TYPES },
];

export const BANK_COUNTERPARTY_TYPE_CODES = [
  "bank_account", "bank_card", "deposit", "savings_account", "brokerage",
  "consumer_loan", "mortgage", "car_loan", "education_loan",
];

export const LOAN_LIABILITY_TYPES = [...CREDIT_LIABILITY_TYPES, ...THIRD_PARTY_LOAN_TYPES];

export const AUTO_PLAN_INTEREST_TYPES = ["deposit", "savings_account"];
export const AUTO_PLAN_LOAN_TYPES = [...CREDIT_LIABILITY_TYPES, ...THIRD_PARTY_LOAN_TYPES, "loan_to_third_party"];

export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
export const MAX_PHOTO_DIM = 1024;
export const ALLOWED_PHOTO_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

export function formatShortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${Math.round(bytes / (1024 * 1024))} МБ`;
}

export const ASSET_TYPE_CODES = ASSET_TYPES.map((t) => t.code);
export const LIABILITY_TYPE_CODES = LIABILITY_TYPES.map((t) => t.code);

export function parseDateKey(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function findPriceOnOrBefore(
  pricesByDate: Record<string, MarketPriceOut>,
  sortedDates: string[],
  targetDate: string
): MarketPriceOut | null {
  if (pricesByDate[targetDate]) return pricesByDate[targetDate];
  let lo = 0;
  let hi = sortedDates.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (sortedDates[mid] <= targetDate) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best >= 0 ? pricesByDate[sortedDates[best]] ?? null : null;
}
