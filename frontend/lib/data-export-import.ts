/**
 * Экспорт пользовательских данных в CSV и импорт из ранее экспортированного файла.
 * Секции: контрагенты (добавленные пользователем), категории (добавленные пользователем),
 * активы/обязательства, цепочки транзакций, транзакции, цели.
 */

import {
  fetchUserMe,
  fetchItems,
  fetchCounterparties,
  fetchCategories,
  fetchTransactionsPage,
  fetchTransactionChains,
  fetchGoals,
  fetchBalanceCheckpointsForItems,
  fetchItemMarketValues,
  setAccountingStartDate,
  createCounterparty,
  updateCounterpartyDeletedAt,
  createCategory,
  updateCategoryArchivedAt,
  createItem,
  updateItemClosedAt,
  updateItemArchivedAt,
  createTransactionChain,
  createTransaction,
  createGoal,
  updateGoalDeletedAt,
  createBalanceCheckpoint,
  createItemMarketValue,
  type ItemOut,
  type CounterpartyOut,
  type CategoryNode,
  type TransactionOut,
  type TransactionChainOut,
  type GoalOut,
  type CounterpartyCreate,
  type CategoryCreate,
  type ItemCreate,
  type TransactionChainCreate,
  type TransactionCreate,
  type GoalCreate,
  type CategoryScope,
  type TransactionDirection,
  type TransactionType,
  type TransactionStatus,
  type ItemKind,
  type CardKind,
  type GoalPeriod,
} from "@/lib/api";

const SECTION_ACCOUNTING_START_DATE = "[ACCOUNTING_START_DATE]";
const SECTION_COUNTERPARTIES = "[COUNTERPARTIES]";
const SECTION_CATEGORIES = "[CATEGORIES]";
const SECTION_ITEMS = "[ITEMS]";
const SECTION_ITEM_MARKET_VALUES = "[ITEM_MARKET_VALUES]";
const SECTION_TRANSACTION_CHAINS = "[TRANSACTION_CHAINS]";
const SECTION_TRANSACTIONS = "[TRANSACTIONS]";
const SECTION_GOALS = "[GOALS]";
const SECTION_BALANCE_CHECKPOINTS = "[BALANCE_CHECKPOINTS]";

const UTF8_BOM = "\uFEFF";

function csvEscape(val: string): string {
  const s = String(val ?? "");
  if (s.includes(",") || s.includes("\n") || s.includes('"')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function csvRow(arr: (string | number | boolean | null | undefined)[]): string {
  return arr.map((v) => csvEscape(v == null ? "" : String(v))).join(",");
}

/** Собрать все категории (дерево) в плоский список; только с owner_user_id. */
function flattenUserCategories(nodes: CategoryNode[]): CategoryNode[] {
  const out: CategoryNode[] = [];
  function walk(list: CategoryNode[]) {
    for (const n of list) {
      if (n.owner_user_id != null) {
        out.push({ ...n, children: undefined });
      }
      if (n.children?.length) walk(n.children);
    }
  }
  walk(nodes);
  return out;
}

/** Собрать все категории дерева в плоский список (и пользовательские, и системные). */
function flattenAllCategories(nodes: CategoryNode[]): CategoryNode[] {
  const out: CategoryNode[] = [];
  function walk(list: CategoryNode[]) {
    for (const n of list) {
      out.push({ ...n, children: undefined });
      if (n.children?.length) walk(n.children);
    }
  }
  walk(nodes);
  return out;
}

/** Собрать id категорий, на которые ссылаются транзакции/цепочки/цели, плюс все их предки. */
function getCategoryIdsToExport(
  allCategoriesFlat: CategoryNode[],
  transactions: { category_id?: number | null }[],
  chains: { category_id?: number | null }[],
  goals: { category_id: number }[]
): Set<number> {
  const byId = new Map(allCategoriesFlat.map((c) => [c.id, c]));
  const referenced = new Set<number>();
  for (const t of transactions) {
    if (t.category_id != null) referenced.add(t.category_id);
  }
  for (const ch of chains) {
    if (ch.category_id != null) referenced.add(ch.category_id);
  }
  for (const g of goals) {
    referenced.add(g.category_id);
  }
  const toExport = new Set<number>(referenced);
  for (const id of referenced) {
    let c = byId.get(id);
    while (c?.parent_id != null) {
      toExport.add(c.parent_id);
      c = byId.get(c.parent_id);
    }
  }
  return toExport;
}

/** Сортировка категорий: сначала корневые, потом по parent_id. */
function sortCategoriesForImport(cats: CategoryNode[]): CategoryNode[] {
  const byId = new Map(cats.map((c) => [c.id, c]));
  const roots = cats.filter((c) => c.parent_id == null);
  const result: CategoryNode[] = [];
  function add(n: CategoryNode) {
    result.push(n);
    cats.filter((c) => c.parent_id === n.id).forEach(add);
  }
  roots.forEach(add);
  cats.filter((c) => c.parent_id != null && !result.includes(c)).forEach(add);
  return result;
}

/** Строит полный путь категории от корня: "Уровень1 > Уровень2 > Уровень3". */
function buildCategoryFullPathMap(
  sortedCats: { id: number; name: string; parent_id?: number | null }[]
): Map<number, string> {
  const byId = new Map(sortedCats.map((c) => [c.id, c]));
  const pathById = new Map<number, string>();
  for (const c of sortedCats) {
    const path: string[] = [c.name.trim()];
    let p: number | null | undefined = c.parent_id;
    while (p != null) {
      const parent = byId.get(p);
      if (!parent) break;
      path.unshift(parent.name.trim());
      p = parent.parent_id;
    }
    pathById.set(c.id, path.join(" > "));
  }
  return pathById;
}

/** Плоский список категорий для поиска по имени и parent_id. */
function flattenCategoriesForLookup(nodes: CategoryNode[]): { id: number; name: string; parent_id: number | null }[] {
  const out: { id: number; name: string; parent_id: number | null }[] = [];
  function walk(list: CategoryNode[]) {
    for (const n of list) {
      out.push({ id: n.id, name: n.name, parent_id: n.parent_id ?? null });
      if (n.children?.length) walk(n.children);
    }
  }
  walk(nodes);
  return out;
}

type CategoryFlatWithPath = { id: number; name: string; parent_id: number | null; full_path: string };

/** Плоский список категорий с полным путём "Уровень1 > Уровень2 > Уровень3" для поиска по полному совпадению. */
function flattenCategoriesWithFullPath(nodes: CategoryNode[], parentPath: string[] = []): CategoryFlatWithPath[] {
  const out: CategoryFlatWithPath[] = [];
  function walk(list: CategoryNode[], path: string[]) {
    for (const n of list) {
      const fullPath = [...path, n.name.trim()].join(" > ");
      out.push({
        id: n.id,
        name: n.name,
        parent_id: n.parent_id ?? null,
        full_path: fullPath,
      });
      if (n.children?.length) walk(n.children, [...path, n.name.trim()]);
    }
  }
  walk(nodes, parentPath);
  return out;
}

/** Полный путь категории из строки CSV: из колонки full_path или по цепочке parent_id. */
function getCategoryFullPathFromRow(
  catRows: Array<Record<string, string>>,
  row: Record<string, string>
): string {
  const fromCol = str(row.full_path).trim();
  if (fromCol) return fromCol;
  const byId = new Map<number, Record<string, string>>();
  for (const r of catRows) {
    const id = num(r.id);
    if (id != null) byId.set(id, r);
  }
  const path: string[] = [str(row.name).trim() || "Категория"];
  let p: number | null = num(row.parent_id);
  while (p != null) {
    const parent = byId.get(p);
    if (!parent) break;
    path.unshift(str(parent.name).trim() || "Категория");
    p = num(parent.parent_id);
  }
  return path.join(" > ");
}

/** Ищет существующую категорию по полному пути (все уровни, точное совпадение). */
function findExistingCategoryByFullPath(
  flat: CategoryFlatWithPath[],
  fullPath: string
): CategoryFlatWithPath | null {
  const norm = fullPath.trim();
  return flat.find((c) => c.full_path === norm) ?? null;
}

/** Ищет среди существующих категорий одну с тем же именем и тем же parent_id (как на бэкенде). */
function findExistingCategory(
  flat: { id: number; name: string; parent_id: number | null }[],
  name: string,
  parentId: number | null
): { id: number; name: string; parent_id: number | null } | null {
  const nameNorm = name.trim();
  return (
    flat.find(
      (c) => c.name === nameNorm && (c.parent_id === parentId || (c.parent_id == null && parentId == null))
    ) ?? null
  );
}

/** Ключ актива для поиска дубликата: kind + type_code + name + currency + counterparty (для банковских типов). */
function itemMatchKey(
  kind: string,
  typeCode: string,
  name: string,
  currencyCode: string,
  counterpartyId: number | null
): string {
  return `${kind}|${typeCode}|${name.trim()}|${currencyCode}|${counterpartyId ?? ""}`;
}

/** Ищет среди существующих активов/обязательств один с теми же kind, type_code, name, currency_code и counterparty_id. */
function findExistingItem(
  flat: { id: number; kind: string; type_code: string; name: string; currency_code: string; counterparty_id: number | null }[],
  kind: string,
  typeCode: string,
  name: string,
  currencyCode: string,
  counterpartyId: number | null
): { id: number } | null {
  const key = itemMatchKey(kind, typeCode, name, currencyCode, counterpartyId);
  return (
    flat.find(
      (i) =>
        itemMatchKey(i.kind, i.type_code, i.name, i.currency_code, i.counterparty_id) === key
    ) ?? null
  );
}

/** Порядок направления для сортировки (как при импорте из Дзен: сначала доходы, потом переводы, затем расходы — чтобы не получать отрицательное сальдо в течение дня). */
const TRANSACTION_DIRECTION_ORDER: Record<string, number> = {
  INCOME: 0,
  TRANSFER: 1,
  EXPENSE: 2,
};

/** Для перевода возвращает (receiver_old_id, sender_old_id): кто получает, кто отправляет. По правилам бэкенда: ASSET теряет, LIABILITY получает. */
function getTransferReceiverSender(
  row: Record<string, string>,
  itemRows: Array<Record<string, string>>
): { receiverOldId: number; senderOldId: number } | null {
  const primaryId = num(row.primary_item_id);
  const counterpartyId = num(row.counterparty_item_id);
  if (primaryId == null || counterpartyId == null) return null;
  const primaryRow = itemRows.find((r) => num(r.id) === primaryId);
  const kind = primaryRow ? str(primaryRow.kind).toUpperCase() : "ASSET";
  const isPrimaryReceiver = kind === "LIABILITY";
  return {
    receiverOldId: isPrimaryReceiver ? primaryId : counterpartyId,
    senderOldId: isPrimaryReceiver ? counterpartyId : primaryId,
  };
}

/** Сортирует транзакции для импорта: по дню по возрастанию, внутри дня — доходы → переводы → расходы; внутри переводов — сначала переводы НА счёт, потом СО счёта; родительские транзакции (split parent) всегда перед дочерними. */
function sortTransactionsForImport(
  rows: Array<Record<string, string>>,
  itemRows?: Array<Record<string, string>>
): Array<Record<string, string>> {
  return [...rows].sort((a, b) => {
    const rawA = str(a.transaction_date).trim();
    const rawB = str(b.transaction_date).trim();
    const dateOnlyA = rawA.slice(0, 10);
    const dateOnlyB = rawB.slice(0, 10);
    if (dateOnlyA !== dateOnlyB) return dateOnlyA.localeCompare(dateOnlyB);
    const dirA = TRANSACTION_DIRECTION_ORDER[str(a.direction)] ?? 2;
    const dirB = TRANSACTION_DIRECTION_ORDER[str(b.direction)] ?? 2;
    if (dirA !== dirB) return dirA - dirB;
    const parentIdA = num(a.parent_transaction_id);
    const parentIdB = num(b.parent_transaction_id);
    const idA = num(a.id);
    const idB = num(b.id);
    if (parentIdA === idB) return 1;
    if (parentIdB === idA) return -1;
    if (str(a.direction) === "TRANSFER" && str(b.direction) === "TRANSFER" && itemRows?.length) {
      const rsA = getTransferReceiverSender(a, itemRows);
      const rsB = getTransferReceiverSender(b, itemRows);
      if (rsA && rsB) {
        if (rsA.receiverOldId !== rsB.receiverOldId) return rsA.receiverOldId - rsB.receiverOldId;
        if (rsA.senderOldId !== rsB.senderOldId) return rsA.senderOldId - rsB.senderOldId;
      }
    }
    return rawA.slice(0, 19).localeCompare(rawB.slice(0, 19));
  });
}

/** Загрузить все транзакции постранично. */
export async function fetchAllTransactions(): Promise<TransactionOut[]> {
  const all: TransactionOut[] = [];
  let cursor: string | null = null;
  const limit = 200;
  for (;;) {
    const page = await fetchTransactionsPage({
      limit,
      cursor,
      include_deleted: true,
    });
    all.push(...page.items);
    if (!page.has_more || !page.next_cursor) break;
    cursor = page.next_cursor;
  }
  return all;
}

export type ExportDataResult = {
  csv: string;
  filename: string;
};

/** Собрать все данные и вернуть CSV-строку для скачивания. */
export async function buildExportCsv(): Promise<ExportDataResult> {
  const [
    me,
    items,
    counterparties,
    categoriesTree,
    transactions,
    chains,
    goals,
    checkpointsWithItems,
  ] = await Promise.all([
    fetchUserMe(),
    fetchItems({ includeArchived: true, includeClosed: true }),
    fetchCounterparties({ include_deleted: true }),
    fetchCategories({ includeArchived: true }),
    fetchAllTransactions(),
    fetchTransactionChains(),
    fetchGoals({ include_deleted: true }),
    fetchBalanceCheckpointsForItems(undefined, {
      includeClosed: true,
      includeArchived: true,
    }),
  ]);

  const userCounterparties = counterparties.filter((c) => c.owner_user_id != null);
  const counterpartyIdsReferenced = new Set<number>();
  for (const i of items) {
    if (i.counterparty_id != null) counterpartyIdsReferenced.add(i.counterparty_id);
  }
  for (const ch of chains) {
    if (ch.counterparty_id != null) counterpartyIdsReferenced.add(ch.counterparty_id);
  }
  for (const t of transactions) {
    if (t.counterparty_id != null) counterpartyIdsReferenced.add(t.counterparty_id);
  }
  const counterpartiesToExport = counterparties.filter(
    (c) => c.owner_user_id != null || counterpartyIdsReferenced.has(c.id)
  );
  const allCategoriesFlat = flattenAllCategories(categoriesTree);
  const categoryIdsToExport = getCategoryIdsToExport(
    allCategoriesFlat,
    transactions,
    chains,
    goals
  );
  const categoriesToExport = allCategoriesFlat.filter(
    (c) => c.owner_user_id != null || categoryIdsToExport.has(c.id)
  );
  const sortedCategories = sortCategoriesForImport(categoriesToExport);
  const categoryFullPathById = buildCategoryFullPathMap(sortedCategories);

  const marketValuesArrays = await Promise.all(
    items.map((i) => fetchItemMarketValues(i.id))
  );
  const marketValues: { item_id: number; value_date: string; value_rub: number; value_currency_cents?: number | null }[] = [];
  marketValuesArrays.forEach((list, idx) => {
    for (const mv of list) {
      marketValues.push({
        item_id: items[idx].id,
        value_date: typeof mv.value_date === "string" ? mv.value_date.slice(0, 10) : mv.value_date,
        value_rub: mv.value_rub,
        value_currency_cents: mv.value_currency_cents ?? undefined,
      });
    }
  });

  const lines: string[] = [];
  lines.push(UTF8_BOM);

  // Дата начала учёта (восстанавливается при импорте из резервной копии)
  if (me.accounting_start_date) {
    lines.push(SECTION_ACCOUNTING_START_DATE);
    lines.push(me.accounting_start_date);
    lines.push("");
  }

  // COUNTERPARTIES (все добавленные пользователем + все, на кого ссылаются активы/цепочки/транзакции)
  const cpDateOnly = (d: string | null | undefined): string =>
    d ? (typeof d === "string" ? d.slice(0, 10) : "") : "";
  lines.push(SECTION_COUNTERPARTIES);
  lines.push(
    csvRow([
      "id",
      "entity_type",
      "industry_id",
      "name",
      "full_name",
      "legal_form",
      "inn",
      "first_name",
      "last_name",
      "middle_name",
      "synonyms",
      "deleted_at",
    ])
  );
  for (const r of counterpartiesToExport) {
    lines.push(
      csvRow([
        r.id,
        r.entity_type,
        r.industry_id ?? "",
        r.name,
        r.full_name ?? "",
        r.legal_form ?? "",
        r.inn ?? "",
        r.first_name ?? "",
        r.last_name ?? "",
        r.middle_name ?? "",
        (r.synonyms ?? []).join(";"),
        cpDateOnly(r.deleted_at ?? undefined),
      ])
    );
  }
  lines.push("");

  // CATEGORIES (все уровни: корень, дочерние, внуки — с полным путём для импорта)
  const catDateOnly = (d: string | null | undefined): string =>
    d ? (typeof d === "string" ? d.slice(0, 10) : "") : "";
  lines.push(SECTION_CATEGORIES);
  lines.push(
    csvRow([
      "id",
      "name",
      "scope",
      "icon_name",
      "parent_id",
      "enabled",
      "synonyms",
      "full_path",
      "archived_at",
    ])
  );
  for (const c of sortedCategories) {
    lines.push(
      csvRow([
        c.id,
        c.name,
        c.scope,
        c.icon_name ?? "",
        c.parent_id ?? "",
        c.enabled,
        (c.synonyms ?? []).join(";"),
        categoryFullPathById.get(c.id) ?? c.name,
        catDateOnly(c.archived_at ?? undefined),
      ])
    );
  }
  lines.push("");

  // ITEMS
  lines.push(SECTION_ITEMS);
  const itemHeaders = [
    "id",
    "kind",
    "type_code",
    "name",
    "synonyms",
    "currency_code",
    "counterparty_id",
    "open_date",
    "opening_counterparty_item_id",
    "account_last7",
    "contract_number",
    "card_last4",
    "card_account_id",
    "card_kind",
    "credit_limit",
    "deposit_term_days",
    "deposit_end_date",
    "interest_rate",
    "interest_payout_order",
    "interest_capitalization",
    "interest_payout_account_id",
    "instrument_id",
    "instrument_board_id",
    "position_lots",
    "lot_size",
    "face_value_cents",
    "quantity_units",
    "initial_balance_minor",
    "plan_settings_json",
    "closed_at",
    "archived_at",
    "primary_value_kind",
    "acquisition_value_rub",
  ];
  lines.push(csvRow(itemHeaders));
  const dateOnly = (d: string | Date | null | undefined): string =>
    d ? (typeof d === "string" ? d : (d as Date).toISOString().slice(0, 10)) : "";
  for (const i of items) {
    const acqVal =
      (i as { acquisitionCents?: number | null }).acquisitionCents ??
      (i as { acquisition_rub?: number | null }).acquisition_rub ??
      "";
    lines.push(
      csvRow([
        i.id,
        i.kind,
        i.type_code,
        i.name,
        (i.synonyms ?? []).join(";"),
        i.currency_code,
        i.counterparty_id ?? "",
        i.open_date,
        i.opening_counterparty_item_id ?? "",
        i.account_last7 ?? "",
        i.contract_number ?? "",
        i.card_last4 ?? "",
        i.card_account_id ?? "",
        i.card_kind ?? "",
        i.credit_limit ?? "",
        i.deposit_term_days ?? "",
        i.deposit_end_date ?? "",
        i.interest_rate ?? "",
        i.interest_payout_order ?? "",
        i.interest_capitalization ?? "",
        i.interest_payout_account_id ?? "",
        i.instrument_id ?? "",
        i.instrument_board_id ?? "",
        i.position_lots ?? "",
        i.lot_size ?? "",
        i.face_value_cents ?? "",
        i.quantity_units ?? "",
        i.initial_balance_minor,
        i.plan_settings ? JSON.stringify(i.plan_settings) : "",
        dateOnly(i.closed_at ?? undefined),
        dateOnly(i.archived_at ?? undefined),
        (i as { primary_value_kind?: string | null }).primary_value_kind ?? "",
        acqVal !== "" ? String(acqVal) : "",
      ])
    );
  }
  lines.push("");

  // ITEM_MARKET_VALUES (данные по рыночной стоимости по датам)
  lines.push(SECTION_ITEM_MARKET_VALUES);
  lines.push(csvRow(["item_id", "value_date", "value_rub", "value_currency_cents"]));
  for (const mv of marketValues) {
    lines.push(
      csvRow([
        mv.item_id,
        mv.value_date,
        mv.value_rub,
        mv.value_currency_cents ?? "",
      ])
    );
  }
  lines.push("");

  // TRANSACTION_CHAINS
  lines.push(SECTION_TRANSACTION_CHAINS);
  lines.push(
    csvRow([
      "id",
      "name",
      "start_date",
      "end_date",
      "frequency",
      "weekly_day",
      "monthly_day",
      "monthly_rule",
      "interval_days",
      "primary_item_id",
      "counterparty_item_id",
      "counterparty_id",
      "amount",
      "amount_counterparty",
      "direction",
      "category_id",
      "comment",
      "related_item_id",
    ])
  );
  for (const ch of chains) {
    lines.push(
      csvRow([
        ch.id,
        ch.name,
        ch.start_date,
        ch.end_date,
        ch.frequency,
        ch.weekly_day ?? "",
        ch.monthly_day ?? "",
        ch.monthly_rule ?? "",
        ch.interval_days ?? "",
        ch.primary_item_id,
        ch.counterparty_item_id ?? "",
        ch.counterparty_id ?? "",
        ch.amount,
        ch.amount_counterparty ?? "",
        ch.direction,
        ch.category_id ?? "",
        ch.comment ?? "",
        ch.related_item_id ?? "",
      ])
    );
  }
  lines.push("");

  // TRANSACTIONS
  lines.push(SECTION_TRANSACTIONS);
  lines.push(
    csvRow([
      "id",
      "transaction_date",
      "primary_item_id",
      "counterparty_item_id",
      "counterparty_id",
      "amount",
      "amount_counterparty",
      "primary_quantity_lots",
      "counterparty_quantity_lots",
      "primary_quantity_units",
      "counterparty_quantity_units",
      "direction",
      "transaction_type",
      "status",
      "category_id",
      "comment",
      "related_item_id",
      "asset_link_type",
      "parent_transaction_id",
      "is_split_parent",
    ])
  );
  for (const t of transactions) {
    const exportCounterpartyItemId =
      t.direction === "TRANSFER"
        ? (t.counterparty_item_id ?? t.counterparty_card_item_id ?? "")
        : (t.counterparty_item_id ?? "");
    lines.push(
      csvRow([
        t.id,
        t.transaction_date,
        t.primary_item_id,
        exportCounterpartyItemId,
        t.counterparty_id ?? "",
        t.amount,
        t.amount_counterparty ?? "",
        t.primary_quantity_lots ?? "",
        t.counterparty_quantity_lots ?? "",
        t.primary_quantity_units ?? "",
        t.counterparty_quantity_units ?? "",
        t.direction,
        t.transaction_type,
        t.status,
        t.category_id ?? "",
        t.comment ?? "",
        t.related_item_id ?? "",
        t.asset_link_type ?? "",
        (t as { parent_transaction_id?: number | null }).parent_transaction_id ?? "",
        (t as { is_split_parent?: boolean }).is_split_parent ? "true" : "false",
      ])
    );
  }
  lines.push("");

  // GOALS
  const goalDateOnly = (d: string | null | undefined): string =>
    d ? (typeof d === "string" ? d.slice(0, 10) : "") : "";
  lines.push(SECTION_GOALS);
  lines.push(
    csvRow([
      "id",
      "name",
      "period",
      "custom_start_date",
      "custom_end_date",
      "category_id",
      "amount",
      "deleted_at",
    ])
  );
  for (const g of goals) {
    lines.push(
      csvRow([
        g.id,
        g.name,
        g.period,
        g.custom_start_date ?? "",
        g.custom_end_date ?? "",
        g.category_id,
        g.amount,
        goalDateOnly(g.deleted_at ?? undefined),
      ])
    );
  }
  lines.push("");

  // BALANCE_CHECKPOINTS (контрольные точки по активам с балансовой стоимостью)
  lines.push(SECTION_BALANCE_CHECKPOINTS);
  lines.push(csvRow(["item_id", "checkpoint_at", "stated_balance_cents", "source"]));
  for (const cp of checkpointsWithItems) {
    lines.push(
      csvRow([cp.item_id, cp.checkpoint_at, cp.stated_balance_cents, cp.source ?? "MANUAL"])
    );
  }

  const csv = lines.join("\r\n");
  const filename = `finapp-export-${new Date().toISOString().slice(0, 10)}.csv`;
  return { csv, filename };
}

export type ParsedExport = {
  accounting_start_date?: string | null;
  counterparties: Array<Record<string, string>>;
  categories: Array<Record<string, string>>;
  items: Array<Record<string, string>>;
  itemMarketValues: Array<Record<string, string>>;
  transactionChains: Array<Record<string, string>>;
  transactions: Array<Record<string, string>>;
  goals: Array<Record<string, string>>;
  balanceCheckpoints: Array<Record<string, string>>;
};

export type InvalidTransferItem = {
  type: "transaction" | "chain";
  /** Порядковый номер в файле (1-based). */
  index: number;
  name?: string;
  date?: string;
  amount?: number;
  comment?: string;
};

export type ValidateExportResult =
  | { valid: true }
  | { valid: false; invalidTransfers: InvalidTransferItem[] };

/**
 * Проверка перед импортом: в файле не должно быть переводов (TRANSFER) без связанного актива
 * (counterparty_item_id отсутствует или не входит в список активов в файле).
 */
export function validateExportForImport(data: ParsedExport): ValidateExportResult {
  const itemIds = new Set(
    data.items.map((i) => num(i.id)).filter((x): x is number => x != null)
  );
  const invalidTransfers: InvalidTransferItem[] = [];

  for (let i = 0; i < data.transactionChains.length; i++) {
    const row = data.transactionChains[i];
    const direction = (row?.direction ?? "").trim().toUpperCase();
    if (direction !== "TRANSFER") continue;
    const cpId = num(row?.counterparty_item_id ?? "");
    if (cpId == null || !itemIds.has(cpId)) {
      invalidTransfers.push({
        type: "chain",
        index: i + 1,
        name: (row?.name ?? "").trim() || "Цепочка",
      });
    }
  }

  const OPENING_PREFIX = "Открытие: ";
  for (let i = 0; i < data.transactions.length; i++) {
    const row = data.transactions[i];
    const comment = (row?.comment ?? "").trim();
    if (comment.startsWith(OPENING_PREFIX)) continue;
    const direction = (row?.direction ?? "").trim().toUpperCase();
    if (direction !== "TRANSFER") continue;
    const cpId = num(row?.counterparty_item_id ?? "");
    if (cpId == null || !itemIds.has(cpId)) {
      invalidTransfers.push({
        type: "transaction",
        index: i + 1,
        date: (row?.transaction_date ?? "").slice(0, 10),
        amount: num(row?.amount ?? "") ?? undefined,
        comment: comment.slice(0, 80) + (comment.length > 80 ? "…" : ""),
      });
    }
  }

  if (invalidTransfers.length === 0) return { valid: true };
  return { valid: false, invalidTransfers };
}

function parseCsvSection(
  lines: string[],
  startIndex: number
): { rows: Array<Record<string, string>>; nextIndex: number } {
  const rows: Array<Record<string, string>> = [];
  let i = startIndex;
  if (i >= lines.length) return { rows, nextIndex: i };
  const headerLine = lines[i];
  i += 1;
  const headers = parseCsvLine(headerLine);
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "" || line.startsWith("[")) break;
    const values = parseCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] ?? "";
    });
    rows.push(row);
    i += 1;
  }
  return { rows, nextIndex: i };
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      let s = "";
      i += 1;
      while (i < line.length) {
        if (line[i] === '"') {
          i += 1;
          if (line[i] === '"') {
            s += '"';
            i += 1;
          } else break;
        } else {
          s += line[i];
          i += 1;
        }
      }
      out.push(s);
      if (line[i] === ",") i += 1;
    } else {
      let s = "";
      while (i < line.length && line[i] !== ",") {
        s += line[i];
        i += 1;
      }
      out.push(s.trim());
      if (line[i] === ",") i += 1;
    }
  }
  return out;
}

export function parseExportCsv(csvText: string): ParsedExport {
  const raw = csvText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = raw.split("\n").map((l) => l.trimEnd());
  const result: ParsedExport = {
    counterparties: [],
    categories: [],
    items: [],
    itemMarketValues: [],
    transactionChains: [],
    transactions: [],
    goals: [],
    balanceCheckpoints: [],
  };
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line === SECTION_ACCOUNTING_START_DATE) {
      i += 1;
      const dateLine = lines[i]?.trim();
      if (dateLine && /^\d{4}-\d{2}-\d{2}$/.test(dateLine)) {
        result.accounting_start_date = dateLine;
      }
      i += 1;
      continue;
    }
    if (line === SECTION_COUNTERPARTIES) {
      i += 1;
      const { rows, nextIndex } = parseCsvSection(lines, i);
      result.counterparties = rows;
      i = nextIndex;
      continue;
    }
    if (line === SECTION_CATEGORIES) {
      i += 1;
      const { rows, nextIndex } = parseCsvSection(lines, i);
      result.categories = rows;
      i = nextIndex;
      continue;
    }
    if (line === SECTION_ITEMS) {
      i += 1;
      const { rows, nextIndex } = parseCsvSection(lines, i);
      result.items = rows;
      i = nextIndex;
      continue;
    }
    if (line === SECTION_ITEM_MARKET_VALUES) {
      i += 1;
      const { rows, nextIndex } = parseCsvSection(lines, i);
      result.itemMarketValues = rows;
      i = nextIndex;
      continue;
    }
    if (line === SECTION_TRANSACTION_CHAINS) {
      i += 1;
      const { rows, nextIndex } = parseCsvSection(lines, i);
      result.transactionChains = rows;
      i = nextIndex;
      continue;
    }
    if (line === SECTION_TRANSACTIONS) {
      i += 1;
      const { rows, nextIndex } = parseCsvSection(lines, i);
      result.transactions = rows;
      i = nextIndex;
      continue;
    }
    if (line === SECTION_GOALS) {
      i += 1;
      const { rows, nextIndex } = parseCsvSection(lines, i);
      result.goals = rows;
      i = nextIndex;
      continue;
    }
    if (line === SECTION_BALANCE_CHECKPOINTS) {
      i += 1;
      const { rows, nextIndex } = parseCsvSection(lines, i);
      result.balanceCheckpoints = rows;
      i = nextIndex;
      continue;
    }
    i += 1;
  }
  return result;
}

function num(s: string): number | null {
  if (s === "" || s == null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function str(s: string): string {
  return s ?? "";
}

/** Нормализация строки как на бэкенде: trim, схлопнуть пробелы. */
function normText(s: string | null | undefined): string {
  if (s == null) return "";
  return s.trim().replace(/\s+/g, " ") || "";
}

/** Ищет среди существующих контрагентов того, у кого те же реквизиты (как в ensure_unique_counterparty на бэкенде). */
function findExistingCounterparty(
  existing: CounterpartyOut[],
  payload: CounterpartyCreate
): CounterpartyOut | null {
  const entityType = payload.entity_type;
  const inn = payload.inn ? payload.inn.replace(/\s+/g, "") : null;

  if (entityType === "LEGAL") {
    if (inn) {
      const match = existing.find(
        (c) => c.entity_type === "LEGAL" && c.inn != null && c.inn.replace(/\s+/g, "") === inn
      );
      return match ?? null;
    }
    const nameKey = normText(payload.name).toLowerCase();
    const legalForm = normText(payload.legal_form).toLowerCase();
    const fullName = normText(payload.full_name).toLowerCase();
    return (
      existing.find((c) => {
        if (c.entity_type !== "LEGAL") return false;
        if (normText(c.name).toLowerCase() !== nameKey) return false;
        if (legalForm && normText(c.legal_form).toLowerCase() !== legalForm) return false;
        if (fullName && normText(c.full_name).toLowerCase() !== fullName) return false;
        return true;
      }) ?? null
    );
  }

  if (entityType === "PERSON") {
    if (inn) {
      const match = existing.find(
        (c) => c.entity_type === "PERSON" && c.inn != null && c.inn.replace(/\s+/g, "") === inn
      );
      return match ?? null;
    }
    const first = normText(payload.first_name).toLowerCase();
    const last = normText(payload.last_name).toLowerCase();
    const middle = normText(payload.middle_name).toLowerCase();
    return (
      existing.find((c) => {
        if (c.entity_type !== "PERSON") return false;
        if (normText(c.first_name).toLowerCase() !== first) return false;
        if (normText(c.last_name).toLowerCase() !== last) return false;
        if (normText(c.middle_name ?? "").toLowerCase() !== middle) return false;
        return true;
      }) ?? null
    );
  }

  return null;
}

/** Нормализация ИНН из CSV (только цифры; научная запись → целое) и проверка контрольной суммы. При неверном ИНН возвращает null. */
function normalizeInnForImport(raw: string, entityType: string): string | null {
  if (!raw || typeof raw !== "string") return null;
  let s = raw.trim().replace(/\s+/g, "");
  if (s.toLowerCase().includes("e")) {
    const n = Number(s);
    if (!Number.isFinite(n) || n < 0 || n > 999999999999) return null;
    s = String(Math.round(n));
  }
  if (!/^\d+$/.test(s)) return null;
  const length = s.length;
  if (entityType === "PERSON") {
    if (length !== 12) return null;
  } else {
    if (length !== 10 && length !== 12) return null;
  }
  const digits = s.split("").map(Number);
  if (length === 10) {
    const coeffs = [2, 4, 10, 3, 5, 9, 4, 6, 8];
    const checksum = coeffs.reduce((sum, c, i) => sum + c * digits[i], 0) % 11 % 10;
    if (checksum !== digits[9]) return null;
  } else {
    const coeffs_11 = [7, 2, 4, 10, 3, 5, 9, 4, 6, 8];
    const coeffs_12 = [3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8];
    const checksum_11 = coeffs_11.reduce((sum, c, i) => sum + c * digits[i], 0) % 11 % 10;
    const checksum_12 = coeffs_12.reduce((sum, c, i) => sum + c * digits[i], 0) % 11 % 10;
    if (checksum_11 !== digits[10] || checksum_12 !== digits[11]) return null;
  }
  return s;
}

export type ImportProgress = {
  stage: string;
  current: number;
  total: number;
  error?: string;
};

export type ImportResult = {
  success: boolean;
  error?: string;
  counts?: {
    counterparties: number;
    categories: number;
    items: number;
    itemMarketValues: number;
    transactionChains: number;
    transactions: number;
    goals: number;
    balanceCheckpoints: number;
  };
};

/** Импортировать данные из распарсенного экспорта. Вызывает onProgress. */
export async function runImport(
  data: ParsedExport,
  onProgress?: (p: ImportProgress) => void
): Promise<ImportResult> {
  const report = (stage: string, current: number, total: number, error?: string) => {
    onProgress?.({ stage, current, total, error });
  };

  const counterpartyIdMap = new Map<number, number>();
  const categoryIdMap = new Map<number, number>();
  const itemIdMap = new Map<number, number>();
  const chainIdMap = new Map<number, number>();

  const counts = {
    counterparties: 0,
    categories: 0,
    items: 0,
    itemMarketValues: 0,
    transactionChains: 0,
    transactions: 0,
    goals: 0,
    balanceCheckpoints: 0,
  };

  try {
    // Дата начала учёта задаётся в начале импорта, чтобы бэкенд не возвращал "Accounting start date is not set" при создании активов/транзакций.
    let dateToSet = data.accounting_start_date?.trim() || null;
    if (!dateToSet && data.transactions?.length > 0) {
      const dates = data.transactions
        .map((r) => (r.transaction_date ?? "").slice(0, 10))
        .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
      if (dates.length > 0) dateToSet = dates.sort()[0];
    }
    if (dateToSet) {
      report("Установка даты начала учёта", 1, 1);
      try {
        await setAccountingStartDate({ accounting_start_date: dateToSet });
      } catch (dateErr) {
        const msg = dateErr instanceof Error ? dateErr.message : String(dateErr);
        report("Ошибка", 0, 0, `Не удалось установить дату начала учёта: ${msg}`);
        return { success: false, error: `Дата начала учёта: ${msg}` };
      }
    }

    // 1. Контрагенты (если с такими реквизитами уже есть — используем существующего)
    // Синонимы на бэкенде уникальны среди контрагентов: при импорте пропускаем уже «занятые» синонимы, чтобы не падать на дубликатах в файле.
    const usedSynonyms = new Set<string>();
    const existingCounterparties = await fetchCounterparties({ include_deleted: true });
    const totalCp = data.counterparties.length;
    for (let i = 0; i < totalCp; i++) {
      const row = data.counterparties[i];
      const oldId = num(row.id);
      if (oldId == null) continue;
      report("Контрагенты", i + 1, totalCp);
      const rawSynonyms = str(row.synonyms) ? str(row.synonyms).split(";").map((s) => s.trim()).filter(Boolean) : [];
      const synonyms = rawSynonyms.filter((s) => {
        if (usedSynonyms.has(s)) return false;
        usedSynonyms.add(s);
        return true;
      });
      const entityType = (str(row.entity_type) || "PERSON") as "LEGAL" | "PERSON";
      const payload: CounterpartyCreate = {
        entity_type: entityType,
        industry_id: num(row.industry_id) ?? null,
        name: str(row.name) || null,
        full_name: str(row.full_name) || null,
        legal_form: str(row.legal_form) || null,
        inn: normalizeInnForImport(str(row.inn), entityType) ?? null,
        first_name: str(row.first_name) || null,
        last_name: str(row.last_name) || null,
        middle_name: str(row.middle_name) || null,
        synonyms,
      };
      const existing = findExistingCounterparty(existingCounterparties, payload);
      let counterpartyId: number;
      if (existing) {
        counterpartyIdMap.set(oldId, existing.id);
        counterpartyId = existing.id;
        counts.counterparties += 1;
      } else {
        try {
          const created = await createCounterparty(payload);
          counterpartyIdMap.set(oldId, created.id);
          existingCounterparties.push(created);
          counterpartyId = created.id;
          counts.counterparties += 1;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes("уже существует")) {
            const refreshed = await fetchCounterparties({ include_deleted: true });
            const found = findExistingCounterparty(refreshed, payload);
            if (found) {
              counterpartyIdMap.set(oldId, found.id);
              counterpartyId = found.id;
              counts.counterparties += 1;
            } else {
              throw err;
            }
          } else if (msg.includes("синоним") && synonyms.length > 0) {
            const payloadWithoutSynonyms: CounterpartyCreate = { ...payload, synonyms: [] };
            const created = await createCounterparty(payloadWithoutSynonyms);
            counterpartyIdMap.set(oldId, created.id);
            existingCounterparties.push(created);
            counterpartyId = created.id;
            counts.counterparties += 1;
          } else {
            throw err;
          }
        }
      }
      const deletedAtRaw = str(row.deleted_at).trim().slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(deletedAtRaw)) {
        try {
          await updateCounterpartyDeletedAt(counterpartyId, deletedAtRaw);
        } catch {
          // игнорируем ошибку
        }
      }
    }

    // 2. Категории: все уровни; поиск по полному пути (Уровень1 > Уровень2 > Уровень3); если не найдено — создаём
    const existingCategoriesTree = await fetchCategories({ includeArchived: true });
    let existingCategoriesFlat: CategoryFlatWithPath[] = flattenCategoriesWithFullPath(existingCategoriesTree);
    const catRows = data.categories;
    const sortedCats: Array<Record<string, string>> = [];
    const added = new Set<number>();
    function addCatsWithParent(parentOldId: number | null) {
      for (const row of catRows) {
        const id = num(row.id);
        const p = num(row.parent_id);
        if (id == null) continue;
        if (added.has(id)) continue;
        const parentMatch = (parentOldId == null && p == null) || (parentOldId != null && p === parentOldId);
        if (!parentMatch) continue;
        sortedCats.push(row);
        added.add(id);
        addCatsWithParent(id);
      }
    }
    addCatsWithParent(null);
    for (const row of catRows) {
      const id = num(row.id);
      if (id != null && !added.has(id)) sortedCats.push(row);
    }
    const totalCat = sortedCats.length;
    for (let i = 0; i < totalCat; i++) {
      const row = sortedCats[i];
      const oldId = num(row.id);
      if (oldId == null) continue;
      report("Категории", i + 1, totalCat);
      const parentId = num(row.parent_id);
      const newParentId =
        parentId != null && categoryIdMap.has(parentId) ? categoryIdMap.get(parentId)! : null;
      const name = str(row.name) || "Категория";
      const fullPath = getCategoryFullPathFromRow(catRows, row);
      const existingCat = findExistingCategoryByFullPath(existingCategoriesFlat, fullPath);
      let categoryId: number;
      if (existingCat) {
        categoryIdMap.set(oldId, existingCat.id);
        categoryId = existingCat.id;
        counts.categories += 1;
      } else {
        try {
          const payload: CategoryCreate = {
            name,
            parent_id: newParentId,
            scope: (str(row.scope) || "BOTH") as CategoryScope,
            icon_name: str(row.icon_name) || null,
            synonyms: str(row.synonyms) ? str(row.synonyms).split(";").filter(Boolean) : [],
          };
          const created = await createCategory(payload);
          categoryIdMap.set(oldId, created.id);
          categoryId = created.id;
          const parentFullPath =
            newParentId != null ? existingCategoriesFlat.find((c) => c.id === newParentId)?.full_path : null;
          const newFullPath = parentFullPath ? `${parentFullPath} > ${created.name}` : created.name;
          existingCategoriesFlat.push({
            id: created.id,
            name: created.name,
            parent_id: created.parent_id ?? null,
            full_path: newFullPath,
          });
          counts.categories += 1;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes("same name already exists")) {
            const refreshed = await fetchCategories({ includeArchived: true });
            existingCategoriesFlat = flattenCategoriesWithFullPath(refreshed);
            const found = findExistingCategoryByFullPath(existingCategoriesFlat, fullPath);
            if (found) {
              categoryIdMap.set(oldId, found.id);
              categoryId = found.id;
              counts.categories += 1;
            } else {
              throw err;
            }
          } else {
            throw err;
          }
        }
      }
      const archivedAtRaw = str(row.archived_at).trim().slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(archivedAtRaw)) {
        try {
          await updateCategoryArchivedAt(categoryId, archivedAtRaw);
        } catch {
          // игнорируем ошибку
        }
      }
    }

    // 3. Активы/обязательства (если с такими же реквизитами уже есть — используем существующий)
    const existingItems = await fetchItems({ includeArchived: true, includeClosed: true });
    const existingItemsFlat = existingItems.map((i) => ({
      id: i.id,
      kind: i.kind,
      type_code: i.type_code,
      name: i.name,
      currency_code: i.currency_code,
      counterparty_id: i.counterparty_id,
    }));
    const itemRows = data.items;
    const sortedItems = [...itemRows].sort((a, b) => {
      const aOpen = num(a.opening_counterparty_item_id);
      const bOpen = num(b.opening_counterparty_item_id);
      const aCardAcc = num(a.card_account_id);
      const bCardAcc = num(b.card_account_id);
      const aPayoutAcc = num(a.interest_payout_account_id);
      const bPayoutAcc = num(b.interest_payout_account_id);
      const bId = num(b.id);
      const aId = num(a.id);
      const aDependsOnB =
        (aOpen !== null && aOpen === bId) ||
        (aCardAcc !== null && aCardAcc === bId) ||
        (aPayoutAcc !== null && aPayoutAcc === bId);
      const bDependsOnA =
        (bOpen !== null && bOpen === aId) ||
        (bCardAcc !== null && bCardAcc === aId) ||
        (bPayoutAcc !== null && bPayoutAcc === aId);
      if (aDependsOnB) return 1;
      if (bDependsOnA) return -1;
      return 0;
    });
    const totalItems = sortedItems.length;
    for (let i = 0; i < totalItems; i++) {
      const row = sortedItems[i];
      const oldId = num(row.id);
      if (oldId == null) continue;
      report("Активы и обязательства", i + 1, totalItems);
      const counterpartyId = num(row.counterparty_id);
      const newCounterpartyId =
        counterpartyId != null && counterpartyIdMap.has(counterpartyId)
          ? counterpartyIdMap.get(counterpartyId)!
          : null;
      const kind = (str(row.kind) || "ASSET") as ItemKind;
      const typeCode = str(row.type_code) || "CASH";
      const name = str(row.name) || "Без имени";
      const currencyCode = str(row.currency_code) || "RUB";
      const existingItem = findExistingItem(
        existingItemsFlat,
        kind,
        typeCode,
        name,
        currencyCode,
        newCounterpartyId
      );
      if (existingItem) {
        itemIdMap.set(oldId, existingItem.id);
        counts.items += 1;
        continue;
      }
      const openingCounterpartyItemId = num(row.opening_counterparty_item_id);
      const payload: ItemCreate = {
        kind,
        type_code: typeCode,
        name,
        currency_code: currencyCode,
        counterparty_id: newCounterpartyId,
        open_date: str(row.open_date) || new Date().toISOString().slice(0, 10),
        opening_counterparty_item_id:
          openingCounterpartyItemId != null && itemIdMap.has(openingCounterpartyItemId)
            ? itemIdMap.get(openingCounterpartyItemId)!
            : null,
        account_last7: str(row.account_last7) || null,
        contract_number: str(row.contract_number) || null,
        card_last4: str(row.card_last4) || null,
        card_account_id: (() => {
          const old = num(row.card_account_id);
          return old != null && itemIdMap.has(old) ? itemIdMap.get(old)! : null;
        })(),
        card_kind: (str(row.card_kind) || null) as CardKind | null,
        credit_limit: num(row.credit_limit) ?? null,
        deposit_term_days: num(row.deposit_term_days) ?? null,
        interest_rate: num(row.interest_rate) ?? null,
        ...(typeCode === "deposit" || typeCode === "savings_account"
          ? {
              interest_payout_order: (str(row.interest_payout_order) || null) as
                | "END_OF_TERM"
                | "MONTHLY"
                | null,
              interest_capitalization: row.interest_capitalization === "true",
              interest_payout_account_id: (() => {
                const old = num(row.interest_payout_account_id);
                return old != null && itemIdMap.has(old) ? itemIdMap.get(old)! : null;
              })(),
            }
          : {}),
        instrument_id: str(row.instrument_id) || null,
        instrument_board_id: str(row.instrument_board_id) || null,
        position_lots: num(row.position_lots) ?? null,
        quantity_units: num(row.quantity_units) ?? null,
        initial_balance_minor: num(row.initial_balance_minor ?? row.initial_value_rub) ?? 0,
        synonyms: str(row.synonyms) ? str(row.synonyms).split(";").filter(Boolean) : [],
      };
      const primaryValueKindRaw = str(row.primary_value_kind).toUpperCase();
      const primaryValueKind =
        primaryValueKindRaw && ["BALANCE", "ACQUISITION", "INVESTED", "MARKET"].includes(primaryValueKindRaw)
          ? (primaryValueKindRaw as ItemCreate["primary_value_kind"])
          : undefined;
      if (primaryValueKind) payload.primary_value_kind = primaryValueKind;
      const acquisitionValueRub = num(row.acquisition_value_rub);
      if (acquisitionValueRub != null && acquisitionValueRub >= 0) payload.acquisition_value_rub = acquisitionValueRub;
      if (row.plan_settings_json) {
        try {
          payload.plan_settings = JSON.parse(row.plan_settings_json) as ItemCreate["plan_settings"];
        } catch {
          // ignore
        }
      }
      const created = await createItem(payload);
      itemIdMap.set(oldId, created.id);
      const closedAtRaw = str(row.closed_at).trim().slice(0, 10);
      const archivedAtRaw = str(row.archived_at).trim().slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(closedAtRaw)) {
        try {
          await updateItemClosedAt(created.id, closedAtRaw);
        } catch {
          // игнорируем ошибку (например, ограничения бэкенда)
        }
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(archivedAtRaw)) {
        try {
          await updateItemArchivedAt(created.id, archivedAtRaw);
        } catch {
          // игнорируем ошибку (например, «Взаиморасчёты»)
        }
      }
      existingItemsFlat.push({
        id: created.id,
        kind: created.kind,
        type_code: created.type_code,
        name: created.name,
        currency_code: created.currency_code,
        counterparty_id: created.counterparty_id,
      });
      counts.items += 1;
    }

    // 4. Данные по рыночной стоимости (item_market_values)
    const totalMv = data.itemMarketValues?.length ?? 0;
    for (let i = 0; i < totalMv; i++) {
      const row = data.itemMarketValues[i];
      report("Рыночные стоимости", i + 1, totalMv);
      const oldItemId = num(row.item_id);
      const valueDate = str(row.value_date).trim().slice(0, 10);
      const valueRub = num(row.value_rub);
      const valueCurrencyCents = num(row.value_currency_cents);
      if (oldItemId == null || !itemIdMap.has(oldItemId) || !/^\d{4}-\d{2}-\d{2}$/.test(valueDate)) continue;
      if (valueRub == null && valueCurrencyCents == null) continue;
      const newItemId = itemIdMap.get(oldItemId)!;
      await createItemMarketValue(newItemId, {
        value_date: valueDate,
        value_rub: valueRub ?? undefined,
        value_currency_cents: valueCurrencyCents ?? undefined,
      });
      counts.itemMarketValues += 1;
    }

    // 5. Цепочки транзакций
    const totalChains = data.transactionChains.length;
    for (let i = 0; i < totalChains; i++) {
      const row = data.transactionChains[i];
      const oldId = num(row.id);
      if (oldId == null) continue;
      report("Цепочки транзакций", i + 1, totalChains);
      const primaryItemId = num(row.primary_item_id);
      const counterpartyItemId = num(row.counterparty_item_id);
      const counterpartyId = num(row.counterparty_id);
      const categoryId = num(row.category_id);
      const relatedItemId = num(row.related_item_id);
      if (primaryItemId == null || !itemIdMap.has(primaryItemId)) continue;
      const direction = (str(row.direction) || "EXPENSE") as TransactionDirection;
      const resolvedCounterpartyItemId =
        counterpartyItemId != null && itemIdMap.has(counterpartyItemId)
          ? itemIdMap.get(counterpartyItemId)!
          : null;
      const chainName = str(row.name) || "Цепочка";
      const chainRowInfo = `цепочка «${chainName}», строка цепочек ${i + 1} из ${totalChains}`;
      if (direction === "TRANSFER" && resolvedCounterpartyItemId == null) {
        throw new Error(
          `counterparty_item_id is required for TRANSFER (${chainRowInfo}). Укажите контрагентский счёт или удалите цепочку из файла.`
        );
      }
      // Для переводов не импортируем атрибуты, запрещённые для TRANSFER (counterparty_id, category_id, related_item_id)
      const payload: TransactionChainCreate = {
        name: str(row.name) || "Цепочка",
        start_date: str(row.start_date) || new Date().toISOString().slice(0, 10),
        end_date: str(row.end_date) || new Date().toISOString().slice(0, 10),
        frequency: (str(row.frequency) || "MONTHLY") as TransactionChainCreate["frequency"],
        weekly_day: num(row.weekly_day) ?? null,
        monthly_day: num(row.monthly_day) ?? null,
        monthly_rule: (str(row.monthly_rule) || null) as TransactionChainCreate["monthly_rule"],
        interval_days: num(row.interval_days) ?? null,
        primary_item_id: itemIdMap.get(primaryItemId)!,
        counterparty_item_id: resolvedCounterpartyItemId,
        counterparty_id:
          direction === "TRANSFER"
            ? null
            : counterpartyId != null && counterpartyIdMap.has(counterpartyId)
              ? counterpartyIdMap.get(counterpartyId)!
              : null,
        amount: num(row.amount) ?? 0,
        amount_counterparty: num(row.amount_counterparty) ?? null,
        direction,
        category_id:
          direction === "TRANSFER"
            ? null
            : categoryId != null && categoryIdMap.has(categoryId)
              ? categoryIdMap.get(categoryId)!
              : null,
        comment: str(row.comment) || null,
        related_item_id:
          direction === "TRANSFER"
            ? null
            : relatedItemId != null && itemIdMap.has(relatedItemId)
              ? itemIdMap.get(relatedItemId)!
              : null,
      };
      try {
        const created = await createTransactionChain(payload);
        chainIdMap.set(oldId, created.id);
        counts.transactionChains += 1;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(
          msg.includes("counterparty_item_id") || msg.includes("TRANSFER")
            ? `${msg} (${chainRowInfo})`
            : msg
        );
      }
    }

    // 6. Транзакции (сортируем по дате; родительские транзакции split — перед дочерними)
    // Транзакции открытия по обязательствам/активам не импортируем — бэкенд создаёт их при создании позиции (createItem).
    const OPENING_COMMENT_PREFIX = "Открытие: ";
    const sortedTransactions = sortTransactionsForImport(data.transactions, data.items);
    const transactionIdMap = new Map<number, number>();
    const totalTx = sortedTransactions.length;
    for (let i = 0; i < totalTx; i++) {
      const row = sortedTransactions[i];
      report("Транзакции", i + 1, totalTx);
      const comment = str(row.comment).trim();
      if (comment.startsWith(OPENING_COMMENT_PREFIX)) continue;
      const oldTxId = num(row.id);
      const primaryItemId = num(row.primary_item_id);
      const counterpartyItemId = num(row.counterparty_item_id);
      const counterpartyId = num(row.counterparty_id);
      const categoryId = num(row.category_id);
      const relatedItemId = num(row.related_item_id);
      if (primaryItemId == null || !itemIdMap.has(primaryItemId)) continue;
      const resolvedCounterpartyItemId =
        counterpartyItemId != null && itemIdMap.has(counterpartyItemId)
          ? itemIdMap.get(counterpartyItemId)!
          : null;
      const resolvedRelatedItemId =
        relatedItemId != null && itemIdMap.has(relatedItemId) ? itemIdMap.get(relatedItemId)! : null;
      const assetLinkTypeRaw = str(row.asset_link_type);
      const assetLinkType = assetLinkTypeRaw
        ? (assetLinkTypeRaw as TransactionCreate["asset_link_type"])
        : undefined;
      const direction = (str(row.direction) || "EXPENSE") as TransactionDirection;
      const txDate = str(row.transaction_date) || new Date().toISOString().slice(0, 10);
      const amount = num(row.amount) ?? 0;
      const txRowInfo = `транзакция ${i + 1} из ${totalTx}, дата ${txDate}, сумма ${amount}${comment ? `, комментарий: ${comment.slice(0, 50)}${comment.length > 50 ? "…" : ""}` : ""}`;
      if (direction === "TRANSFER" && resolvedCounterpartyItemId == null) {
        throw new Error(
          `counterparty_item_id is required for TRANSFER (${txRowInfo}). Для перевода должен быть указан контрагентский счёт в файле и он должен быть импортирован.`
        );
      }
      const parentOldId = num(row.parent_transaction_id);
      const resolvedParentId =
        parentOldId != null && transactionIdMap.has(parentOldId)
          ? transactionIdMap.get(parentOldId)!
          : null;
      const isSplitParent = str(row.is_split_parent).toLowerCase() === "true";
      const payload: TransactionCreate = {
        transaction_date: txDate,
        primary_item_id: itemIdMap.get(primaryItemId)!,
        counterparty_item_id: resolvedCounterpartyItemId,
        counterparty_id:
          direction === "TRANSFER"
            ? null
            : counterpartyId != null && counterpartyIdMap.has(counterpartyId)
              ? counterpartyIdMap.get(counterpartyId)!
              : null,
        amount,
        amount_counterparty: num(row.amount_counterparty) ?? null,
        primary_quantity_lots: num(row.primary_quantity_lots) ?? null,
        counterparty_quantity_lots: num(row.counterparty_quantity_lots) ?? null,
        primary_quantity_units: num(row.primary_quantity_units) ?? null,
        counterparty_quantity_units: num(row.counterparty_quantity_units) ?? null,
        direction,
        transaction_type: (str(row.transaction_type) || "ACTUAL") as TransactionType,
        status: "UNCONFIRMED",
        category_id:
          direction === "TRANSFER"
            ? null
            : categoryId != null && categoryIdMap.has(categoryId)
              ? categoryIdMap.get(categoryId)!
              : null,
        comment: str(row.comment) || null,
        related_item_id: direction === "TRANSFER" ? null : resolvedRelatedItemId,
        asset_link_type:
          direction === "TRANSFER"
            ? undefined
            : assetLinkType && resolvedRelatedItemId != null
              ? assetLinkType
              : undefined,
        ...(resolvedParentId != null ? { parent_transaction_id: resolvedParentId } : {}),
        ...(isSplitParent ? { is_split_parent: true } : {}),
      };
      try {
        const created = await createTransaction(payload);
        if (oldTxId != null) transactionIdMap.set(oldTxId, created.id);
        counts.transactions += 1;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(
          msg.includes("counterparty_item_id") ||
            msg.includes("TRANSFER") ||
            msg.includes("Transfer")
            ? `${msg} (${txRowInfo})`
            : msg
        );
      }
    }

    // 7. Цели
    const totalGoals = data.goals.length;
    for (let i = 0; i < totalGoals; i++) {
      const row = data.goals[i];
      report("Цели", i + 1, totalGoals);
      const categoryId = num(row.category_id);
      if (categoryId == null || !categoryIdMap.has(categoryId)) continue;
      const payload: GoalCreate = {
        name: str(row.name) || "Цель",
        period: (str(row.period) || "MONTHLY") as GoalPeriod,
        custom_start_date: str(row.custom_start_date) || null,
        custom_end_date: str(row.custom_end_date) || null,
        category_id: categoryIdMap.get(categoryId)!,
        amount: num(row.amount) ?? 0,
      };
      const created = await createGoal(payload);
      counts.goals += 1;
      const deletedAtRaw = str(row.deleted_at).trim().slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(deletedAtRaw)) {
        try {
          await updateGoalDeletedAt(created.id, deletedAtRaw);
        } catch {
          // игнорируем ошибку
        }
      }
    }

    // 8. Контрольные точки (только для актива, который импортирован или сопоставлен)
    const totalCheckpoints = data.balanceCheckpoints?.length ?? 0;
    for (let i = 0; i < totalCheckpoints; i++) {
      const row = data.balanceCheckpoints[i];
      report("Контрольные точки", i + 1, totalCheckpoints);
      const oldItemId = num(row.item_id);
      const checkpointAt = str(row.checkpoint_at).trim();
      const statedCents = num(row.stated_balance_cents);
      if (oldItemId == null || !itemIdMap.has(oldItemId) || !checkpointAt || statedCents == null) continue;
      const source = str(row.source).toUpperCase() === "IMPORTED" ? "IMPORTED" : "MANUAL";
      try {
        await createBalanceCheckpoint(itemIdMap.get(oldItemId)!, {
          checkpoint_at: checkpointAt,
          stated_balance_cents: statedCents,
          source,
        });
        counts.balanceCheckpoints += 1;
      } catch {
        // пропускаем при ошибке (например, актив не балансовый)
      }
    }

    report("Готово", 1, 1);
    return { success: true, counts };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    report("Ошибка", 0, 0, message);
    return { success: false, error: message };
  }
}
