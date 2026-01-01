import { getSession } from "next-auth/react";

export type ItemKind = "ASSET" | "LIABILITY";

export type ItemOut = {
  id: number;
  kind: ItemKind;
  type_code: string;
  name: string;
  initial_value_rub: number;
  current_value_rub: number;
  created_at: string;
  archived_at: string | null;
};

export type ItemCreate = {
  kind: ItemKind;
  type_code: string;
  name: string;
  initial_value_rub: number;
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

export type CategoryOut = {
  id: number;
  name: string;
  level: number;
  parent_id: number | null;
  direction: "INCOME" | "EXPENSE" | "BOTH";
  created_at: string;
};

export type CategoryCreate = {
  name: string;
  level: number;
  parent_id?: number | null;
  direction: "INCOME" | "EXPENSE" | "BOTH";
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

const inferredBase = (() => {
  if (typeof window === "undefined") return "";

  // When running the Next.js dev server on :3000, the FastAPI backend is
  // expected to be on :8000. Fallback to that to avoid hitting the Next.js
  // HTML pages (which causes the "Unexpected token '<'" JSON parse error).
  if (window.location.port === "3000") {
    return `${window.location.protocol}//${window.location.hostname}:8000`;
  }

  // Otherwise, prefer same-origin absolute URL (helps when the app is
  // reverse-proxied and the API is available on the same host).
  return `${window.location.origin}`;
})();

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? inferredBase).replace(/\/$/, "");

function apiUrl(path: string) {
  if (!API_BASE) return path;
  if (path.startsWith("/")) return `${API_BASE}${path}`;
  return `${API_BASE}/${path}`;
}

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
  const res = await authFetch(apiUrl("/items"));
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function createItem(payload: ItemCreate): Promise<ItemOut> {
  const res = await authFetch(apiUrl("/items"), {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function archiveItem(id: number): Promise<ItemOut> {
    const res = await authFetch(apiUrl(`/items/${id}/archive`), {
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
  const res = await authFetch(apiUrl("/transactions"));
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function createTransaction(
  payload: TransactionCreate
): Promise<TransactionOut> {
  const res = await authFetch(apiUrl("/transactions"), {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function deleteTransaction(id: number): Promise<void> {
  const res = await authFetch(apiUrl(`/transactions/${id}`), {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(await readError(res));
}

export async function fetchCategories(): Promise<CategoryOut[]> {
  const res = await authFetch(apiUrl("/categories"));
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function createCategory(payload: CategoryCreate): Promise<CategoryOut> {
  const res = await authFetch(apiUrl("/categories"), {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function deleteCategory(id: number): Promise<void> {
  const res = await authFetch(apiUrl(`/categories/${id}`), {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(await readError(res));
}