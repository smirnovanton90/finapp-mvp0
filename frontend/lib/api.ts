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

const API_BASE = "http://localhost:8000";

async function authFetch(
    input: RequestInfo,
    init: RequestInit = {}
  ): Promise<Response> {
    const session = await getSession();
    const idToken = (session as any)?.idToken;
  
    if (!idToken) {
      throw new Error("No idToken in session");
    }
  
    const headers = new Headers(init.headers);
  
    headers.set("Authorization", `Bearer ${idToken}`);
  
    // ⚠️ ВАЖНО: Content-Type ставим ТОЛЬКО если есть body
    if (init.body) {
      headers.set("Content-Type", "application/json");
    }
  
    return fetch(input, {
      ...init,
      headers,
    });
  }

export async function fetchItems(): Promise<ItemOut[]> {
  const res = await authFetch(`${API_BASE}/items`);
  if (!res.ok) throw new Error("Failed to fetch items");
  return res.json();
}

export async function createItem(payload: ItemCreate): Promise<ItemOut> {
  const res = await authFetch(`${API_BASE}/items`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to create item");
  return res.json();
}

export async function archiveItem(id: number): Promise<ItemOut> {
    const res = await authFetch(`${API_BASE}/items/${id}/archive`, {
      method: "PATCH",
    });
    if (!res.ok) throw new Error("Failed to archive item");
    return res.json();
  }  