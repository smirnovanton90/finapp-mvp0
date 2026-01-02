import { getSession } from "next-auth/react";

export type ItemKind = "ASSET" | "LIABILITY";

export type ItemOut = {
  id: number;
  kind: ItemKind;
  type_code: string;
  name: string;
  currency_code: string;
  initial_value_rub: number;
  current_value_rub: number;
  created_at: string;
  archived_at: string | null;
};

export type ItemCreate = {
  kind: ItemKind;
  type_code: string;
  name: string;
  currency_code: string;
  initial_value_rub: number;
};

export type CurrencyOut = {
  iso_char_code: string;
  iso_num_code: string;
  nominal: number;
  name: string;
  eng_name: string;
};

export type TransactionDirection = "INCOME" | "EXPENSE" | "TRANSFER";
export type TransactionType = "ACTUAL" | "PLANNED";

export type TransactionOut = {
  id: number;

  transaction_date: string; // YYYY-MM-DD
  primary_item_id: number;
  counterparty_item_id: number | null;

  amount_rub: number; // в копейках
  direction: TransactionDirection;
  transaction_type: TransactionType;

  category_l1: string;
  category_l2: string;
  category_l3: string;

  description: string | null;
  comment: string | null;

  created_at: string;
};

export type TransactionCreate = {
  transaction_date: string; // YYYY-MM-DD
  primary_item_id: number;
  counterparty_item_id?: number | null;

  amount_rub: number; // в копейках
  direction: TransactionDirection;
  transaction_type: TransactionType;

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

export async function fetchCurrencies(): Promise<CurrencyOut[]> {
  const res = await authFetch(`${API_BASE}/currencies`);
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
  return `HTTP ${res.status}: ${text || res.statusText}`;
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
