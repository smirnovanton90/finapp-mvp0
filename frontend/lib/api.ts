import { getSession } from "next-auth/react";

export type ItemKind = "ASSET" | "LIABILITY";

export type ItemOut = {
  id: number;
  kind: ItemKind;
  type_code: string;
  name: string;
  currency_code: string;
  bank_id: number | null;
  open_date: string | null;
  account_last7: string | null;
  contract_number: string | null;
  card_last4: string | null;
  card_account_id: number | null;
  deposit_term_days: number | null;
  deposit_end_date: string | null;
  interest_rate: number | null;
  interest_payout_order: "END_OF_TERM" | "MONTHLY" | null;
  interest_capitalization: boolean | null;
  interest_payout_account_id: number | null;
  initial_value_rub: number;
  current_value_rub: number;
  start_date: string;
  created_at: string;
  closed_at: string | null;
  archived_at: string | null;
};

export type ItemCreate = {
  kind: ItemKind;
  type_code: string;
  name: string;
  currency_code: string;
  bank_id?: number | null;
  open_date?: string | null;
  account_last7?: string | null;
  contract_number?: string | null;
  card_last4?: string | null;
  card_account_id?: number | null;
  deposit_term_days?: number | null;
  interest_rate?: number | null;
  interest_payout_order?: "END_OF_TERM" | "MONTHLY" | null;
  interest_capitalization?: boolean | null;
  interest_payout_account_id?: number | null;
  initial_value_rub: number;
  start_date: string;
};

export type BankOut = {
  id: number;
  ogrn: string;
  name: string;
  license_status: string;
  logo_url: string | null;
};

export type CounterpartyType = "LEGAL" | "PERSON";

export type CounterpartyOut = {
  id: number;
  entity_type: CounterpartyType;
  industry_id: number | null;
  name: string;
  full_name: string | null;
  legal_form: string | null;
  inn: string | null;
  ogrn: string | null;
  first_name: string | null;
  last_name: string | null;
  middle_name: string | null;
  license_status: string | null;
  logo_url: string | null;
  owner_user_id: number | null;
  created_at: string;
  deleted_at: string | null;
};

export type CounterpartyCreate = {
  entity_type: CounterpartyType;
  industry_id?: number | null;
  name?: string | null;
  full_name?: string | null;
  legal_form?: string | null;
  inn?: string | null;
  ogrn?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  middle_name?: string | null;
};

export type CounterpartyUpdate = CounterpartyCreate;

export type LegalFormOut = {
  code: string;
  label: string;
};

export type CounterpartyIndustryOut = {
  id: number;
  name: string;
};

export type CurrencyOut = {
  iso_char_code: string;
  iso_num_code: string;
  nominal: number;
  name: string;
  eng_name: string;
};

export type FxRateOut = {
  char_code: string;
  nominal: number;
  value: number;
  rate: number;
};

export type CategoryScope = "INCOME" | "EXPENSE" | "BOTH";

export type CategoryNode = {
  id: number;
  name: string;
  scope: CategoryScope;
  icon_name: string | null;
  parent_id: number | null;
  owner_user_id: number | null;
  enabled: boolean;
  archived_at: string | null;
  children?: CategoryNode[];
};

export type CategoryCreate = {
  name: string;
  parent_id?: number | null;
  scope: CategoryScope;
  icon_name?: string | null;
};

export type TransactionDirection = "INCOME" | "EXPENSE" | "TRANSFER";
export type TransactionType = "ACTUAL" | "PLANNED";
export type TransactionStatus = "CONFIRMED" | "UNCONFIRMED" | "REALIZED";
export type TransactionChainFrequency = "DAILY" | "WEEKLY" | "MONTHLY" | "REGULAR";
export type TransactionChainMonthlyRule = "FIRST_DAY" | "LAST_DAY";

export type TransactionOut = {
  id: number;

  transaction_date: string; // YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss
  primary_item_id: number;
  counterparty_item_id: number | null;
  counterparty_id: number | null;
  chain_id: number | null;
  chain_name: string | null;

  amount_rub: number; // в копейках
  amount_counterparty: number | null;
  direction: TransactionDirection;
  transaction_type: TransactionType;
  status: TransactionStatus;

  category_id: number | null;

  description: string | null;
  comment: string | null;

  created_at: string;
  deleted_at: string | null;
};

export type TransactionPageOut = {
  items: TransactionOut[];
  next_cursor: string | null;
  has_more: boolean;
};

export type FetchTransactionsPageParams = {
  limit?: number;
  cursor?: string | null;
  include_deleted?: boolean;
  deleted_only?: boolean;
  date_from?: string;
  date_to?: string;
  status?: TransactionStatus[];
  direction?: TransactionDirection[];
  transaction_type?: TransactionType[];
  item_ids?: number[];
  currency_item_ids?: number[];
  category_ids?: number[];
  counterparty_ids?: number[];
  comment_query?: string;
  min_amount?: number;
  max_amount?: number;
};

export type TransactionChainCreate = {
  name: string;
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD
  frequency: TransactionChainFrequency;
  weekly_day?: number | null;
  monthly_day?: number | null;
  monthly_rule?: TransactionChainMonthlyRule | null;
  interval_days?: number | null;
  primary_item_id: number;
  counterparty_item_id?: number | null;
  counterparty_id?: number | null;
  amount_rub: number;
  amount_counterparty?: number | null;
  direction: TransactionDirection;
  category_id: number | null;
  description?: string | null;
  comment?: string | null;
};

export type TransactionChainOut = {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  frequency: TransactionChainFrequency;
  weekly_day: number | null;
  monthly_day: number | null;
  monthly_rule: TransactionChainMonthlyRule | null;
  interval_days: number | null;
  primary_item_id: number;
  counterparty_item_id: number | null;
  counterparty_id: number | null;
  amount_rub: number;
  amount_counterparty: number | null;
  direction: TransactionDirection;
  category_id: number | null;
  description: string | null;
  comment: string | null;
  deleted_at: string | null;
  created_at: string;
};

export type LimitPeriod = "MONTHLY" | "WEEKLY" | "YEARLY" | "CUSTOM";

export type LimitOut = {
  id: number;
  name: string;
  period: LimitPeriod;
  custom_start_date: string | null;
  custom_end_date: string | null;
  category_id: number;
  amount_rub: number;
  created_at: string;
  deleted_at: string | null;
};

export type LimitCreate = {
  name: string;
  period: LimitPeriod;
  custom_start_date?: string | null;
  custom_end_date?: string | null;
  category_id: number;
  amount_rub: number;
};

export type TransactionCreate = {
  transaction_date: string; // YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss
  primary_item_id: number;
  counterparty_item_id?: number | null;
  counterparty_id?: number | null;

  amount_rub: number; // в копейках
  amount_counterparty?: number | null;
  direction: TransactionDirection;
  transaction_type: TransactionType;
  status?: TransactionStatus;

  category_id: number | null;

  description?: string | null;
  comment?: string | null;
};

const API_BASE = "http://localhost:8000";

async function authFetch(input: RequestInfo, init?: RequestInit) {
  const session = await getSession();
  const idToken = (session as any)?.idToken;

  if (!idToken) throw new Error("No idToken in session");

  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${idToken}`);
  const isFormData =
    typeof FormData !== "undefined" && init?.body instanceof FormData;
  if (!headers.has("Content-Type") && !isFormData) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(input, { ...init, headers, cache: init?.cache ?? "no-store" });
}

export async function fetchItems(options?: {
  includeArchived?: boolean;
  includeClosed?: boolean;
}): Promise<ItemOut[]> {
  const params = new URLSearchParams();
  if (options?.includeArchived) params.set("include_archived", "true");
  if (options?.includeClosed) params.set("include_closed", "true");
  const qs = params.toString();
  const res = await authFetch(`${API_BASE}/items${qs ? `?${qs}` : ""}`);
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function fetchBanks(query?: string): Promise<BankOut[]> {
  const qs = query ? `?q=${encodeURIComponent(query)}` : "";
  const res = await authFetch(`${API_BASE}/banks${qs}`);
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function fetchCounterparties(options?: {
  include_deleted?: boolean;
  deleted_only?: boolean;
}): Promise<CounterpartyOut[]> {
  const params = new URLSearchParams();
  if (options?.include_deleted) params.set("include_deleted", "true");
  if (options?.deleted_only) params.set("deleted_only", "true");
  const qs = params.toString();
  const res = await authFetch(`${API_BASE}/counterparties${qs ? `?${qs}` : ""}`);
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function fetchLegalForms(): Promise<LegalFormOut[]> {
  const res = await authFetch(`${API_BASE}/counterparties/legal-forms`);
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function fetchCounterpartyIndustries(): Promise<
  CounterpartyIndustryOut[]
> {
  const res = await authFetch(`${API_BASE}/counterparties/industries`);
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function createCounterparty(
  payload: CounterpartyCreate
): Promise<CounterpartyOut> {
  const res = await authFetch(`${API_BASE}/counterparties`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function updateCounterparty(
  id: number,
  payload: CounterpartyUpdate
): Promise<CounterpartyOut> {
  const res = await authFetch(`${API_BASE}/counterparties/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function deleteCounterparty(id: number): Promise<void> {
  const res = await authFetch(`${API_BASE}/counterparties/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(await readError(res));
}

export async function uploadCounterpartyLogo(
  id: number,
  file: File
): Promise<CounterpartyOut> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await authFetch(`${API_BASE}/counterparties/${id}/logo`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function fetchCurrencies(): Promise<CurrencyOut[]> {
  const res = await authFetch(`${API_BASE}/currencies`);
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function fetchFxRates(dateReq?: string): Promise<FxRateOut[]> {
  const qs = dateReq ? `?date_req=${encodeURIComponent(dateReq)}` : "";
  const res = await authFetch(`${API_BASE}/fx-rates${qs}`);
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function fetchFxRatesBatch(
  dates: string[]
): Promise<Record<string, FxRateOut[]>> {
  if (dates.length === 0) return {};
  const res = await authFetch(`${API_BASE}/fx-rates/batch`, {
    method: "POST",
    body: JSON.stringify({ dates }),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function fetchCategories(options?: {
  includeArchived?: boolean;
  noCache?: boolean;
}): Promise<CategoryNode[]> {
  const params = new URLSearchParams();
  if (options?.includeArchived === false) {
    params.set("include_archived", "false");
  }
  const qs = params.toString();
  const res = await authFetch(
    `${API_BASE}/categories${qs ? `?${qs}` : ""}`,
    options?.noCache ? { cache: "no-store" } : undefined
  );
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function createCategory(payload: CategoryCreate): Promise<CategoryNode> {
  const res = await authFetch(`${API_BASE}/categories`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function updateCategoryScope(
  id: number,
  scope: CategoryScope
): Promise<CategoryNode> {
  const res = await authFetch(`${API_BASE}/categories/${id}/scope`, {
    method: "PATCH",
    body: JSON.stringify({ scope }),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function updateCategoryVisibility(
  id: number,
  enabled: boolean
): Promise<CategoryNode> {
  const res = await authFetch(`${API_BASE}/categories/${id}/visibility`, {
    method: "PATCH",
    body: JSON.stringify({ enabled }),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function updateCategoryIcon(
  id: number,
  iconName: string | null
): Promise<CategoryNode> {
  const res = await authFetch(`${API_BASE}/categories/${id}/icon`, {
    method: "PATCH",
    body: JSON.stringify({ icon_name: iconName }),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function deleteCategory(id: number): Promise<void> {
  const res = await authFetch(`${API_BASE}/categories/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(await readError(res));
}

export async function createItem(payload: ItemCreate): Promise<ItemOut> {
  const res = await authFetch(`${API_BASE}/items`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function updateItem(id: number, payload: ItemCreate): Promise<ItemOut> {
  const res = await authFetch(`${API_BASE}/items/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function archiveItem(id: number): Promise<ItemOut> {
    const res = await authFetch(`${API_BASE}/items/${id}/archive`, {
      method: "PATCH",
    });
    if (!res.ok) throw new Error(await readError(res));
    return res.json();
  }

export async function closeItem(id: number): Promise<ItemOut> {
  const res = await authFetch(`${API_BASE}/items/${id}/close`, {
    method: "PATCH",
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

async function readError(res: Response) {
  const text = await res.text();
  if (!text) return res.statusText || "Request failed";

  const tryParseJson = () => {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  };

  let data: unknown = null;
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    data = tryParseJson();
  } else {
    const trimmed = text.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      data = tryParseJson();
    }
  }

  if (data && typeof data === "object") {
    const detail = (data as { detail?: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0] as { msg?: unknown };
      if (typeof first?.msg === "string") return first.msg;
    }
    const message = (data as { message?: unknown }).message;
    if (typeof message === "string") return message;
    const error = (data as { error?: unknown }).error;
    if (typeof error === "string") return error;
  }

  if (typeof data === "string") return data;
  return text;
}

export async function fetchTransactions(): Promise<TransactionOut[]> {
  const res = await authFetch(`${API_BASE}/transactions`);
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function fetchTransactionsPage(
  options: FetchTransactionsPageParams
): Promise<TransactionPageOut> {
  const params = new URLSearchParams();
  if (options.limit) params.set("limit", String(options.limit));
  if (options.cursor) params.set("cursor", options.cursor);
  if (options.include_deleted) params.set("include_deleted", "true");
  if (options.deleted_only) params.set("deleted_only", "true");
  if (options.date_from) params.set("date_from", options.date_from);
  if (options.date_to) params.set("date_to", options.date_to);
  if (options.comment_query) params.set("comment_query", options.comment_query);
  if (options.min_amount != null) params.set("min_amount", String(options.min_amount));
  if (options.max_amount != null) params.set("max_amount", String(options.max_amount));
  options.status?.forEach((value) => params.append("status", value));
  options.direction?.forEach((value) => params.append("direction", value));
  options.transaction_type?.forEach((value) =>
    params.append("transaction_type", value)
  );
  options.item_ids?.forEach((value) => params.append("item_ids", String(value)));
  options.currency_item_ids?.forEach((value) =>
    params.append("currency_item_ids", String(value))
  );
  options.category_ids?.forEach((value) =>
    params.append("category_ids", String(value))
  );
  options.counterparty_ids?.forEach((value) =>
    params.append("counterparty_ids", String(value))
  );
  const qs = params.toString();
  const res = await authFetch(`${API_BASE}/transactions/page${qs ? `?${qs}` : ""}`);
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function fetchDeletedTransactions(): Promise<TransactionOut[]> {
  const res = await authFetch(`${API_BASE}/transactions/deleted`);
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function createTransaction(
  payload: TransactionCreate
): Promise<TransactionOut> {
  const res = await authFetch(`${API_BASE}/transactions`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function deleteTransaction(id: number): Promise<void> {
  const res = await authFetch(`${API_BASE}/transactions/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(await readError(res));
}

export async function updateTransaction(
  id: number,
  payload: TransactionCreate
): Promise<TransactionOut> {
  const res = await authFetch(`${API_BASE}/transactions/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function updateTransactionStatus(
  id: number,
  status: TransactionStatus
): Promise<TransactionOut> {
  const res = await authFetch(`${API_BASE}/transactions/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function fetchTransactionChains(): Promise<TransactionChainOut[]> {
  const res = await authFetch(`${API_BASE}/transaction-chains`);
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function createTransactionChain(
  payload: TransactionChainCreate
): Promise<TransactionChainOut> {
  const res = await authFetch(`${API_BASE}/transaction-chains`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function deleteTransactionChain(id: number): Promise<void> {
  const res = await authFetch(`${API_BASE}/transaction-chains/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(await readError(res));
}

export async function fetchLimits(options?: {
  include_deleted?: boolean;
  deleted_only?: boolean;
}): Promise<LimitOut[]> {
  const params = new URLSearchParams();
  if (options?.include_deleted) params.set("include_deleted", "true");
  if (options?.deleted_only) params.set("deleted_only", "true");
  const qs = params.toString();
  const res = await authFetch(`${API_BASE}/limits${qs ? `?${qs}` : ""}`);
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function createLimit(payload: LimitCreate): Promise<LimitOut> {
  const res = await authFetch(`${API_BASE}/limits`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function updateLimit(
  id: number,
  payload: LimitCreate
): Promise<LimitOut> {
  const res = await authFetch(`${API_BASE}/limits/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function deleteLimit(id: number): Promise<void> {
  const res = await authFetch(`${API_BASE}/limits/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(await readError(res));
}
