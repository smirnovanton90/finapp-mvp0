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
  chain_id: number | null;
  chain_name: string | null;

  amount_rub: number; // в копейках
  amount_counterparty: number | null;
  direction: TransactionDirection;
  transaction_type: TransactionType;
  status: TransactionStatus;

  category_l1: string;
  category_l2: string;
  category_l3: string;

  description: string | null;
  comment: string | null;

  created_at: string;
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
  amount_rub: number;
  amount_counterparty?: number | null;
  direction: TransactionDirection;
  category_l1: string;
  category_l2: string;
  category_l3: string;
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
  amount_rub: number;
  amount_counterparty: number | null;
  direction: TransactionDirection;
  category_l1: string;
  category_l2: string;
  category_l3: string;
  description: string | null;
  comment: string | null;
  deleted_at: string | null;
  created_at: string;
};

export type TransactionCreate = {
  transaction_date: string; // YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss
  primary_item_id: number;
  counterparty_item_id?: number | null;

  amount_rub: number; // в копейках
  amount_counterparty?: number | null;
  direction: TransactionDirection;
  transaction_type: TransactionType;
  status?: TransactionStatus;

  category_l1: string;
  category_l2: string;
  category_l3: string;

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
  headers.set("Content-Type", "application/json");

  return fetch(input, { ...init, headers });
}

export async function fetchItems(): Promise<ItemOut[]> {
  const res = await authFetch(`${API_BASE}/items`);
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function fetchBanks(query?: string): Promise<BankOut[]> {
  const qs = query ? `?q=${encodeURIComponent(query)}` : "";
  const res = await authFetch(`${API_BASE}/banks${qs}`);
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

export async function createItem(payload: ItemCreate): Promise<ItemOut> {
  const res = await authFetch(`${API_BASE}/items`, {
    method: "POST",
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
