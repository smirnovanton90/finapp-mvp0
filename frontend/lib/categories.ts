export type CategoryScope = "INCOME" | "EXPENSE" | "BOTH";

export type CategoryNode = {
  id: number;
  name: string;
  scope: CategoryScope;
  icon_name?: string | null;
  parent_id?: number | null;
  owner_user_id?: number | null;
  enabled?: boolean;
  archived_at?: string | null;
  children?: CategoryNode[];
};

export type CategoryMaps = {
  l1: string[];
  l2: Record<string, string[]>;
  l3: Record<string, string[]>;
};

const LEGACY_CATEGORY_STORAGE_KEY = "finapp.categories.v1";
export const CATEGORY_STORAGE_KEY = "finapp.categories.v2";

function createId() {
  return Math.floor(Math.random() * 1_000_000_000) + Date.now();
}

function node(
  name: string,
  scope: CategoryScope,
  children?: CategoryNode[],
  iconName?: string
): CategoryNode {
  const next: CategoryNode = { id: createId(), name, scope };
  if (iconName) {
    next.icon_name = iconName;
  }
  if (children && children.length) {
    next.children = children;
  }
  return next;
}

export const DEFAULT_CATEGORIES: CategoryNode[] = [
  node("Доход от основного места работы", "INCOME", [
    node("Гарантированные выплаты", "INCOME", [
      node("Аванс", "INCOME"),
      node("Зарплата", "INCOME"),
    ]),
    node("Негарантированные выплаты", "INCOME", [
      node("Ежемесячная премия", "INCOME"),
      node("Квартальная премия", "INCOME"),
      node("Годовая премия", "INCOME"),
      node("13-я зарплата", "INCOME"),
      node("Внеплановая премия", "INCOME"),
    ]),
  ]),
  node("Доход от подработок", "INCOME"),
  node("Пассивный доход", "INCOME", [
    node("Проценты по вкладам и накопительным счетам", "INCOME", [
      node("Проценты по вкладам", "INCOME"),
      node("Проценты по накопительным счетам", "INCOME"),
    ]),
    node("Доход от финансовых инструментов", "INCOME", [
      node("Купонный доход от облигаций", "INCOME"),
      node("Доход от акций", "INCOME"),
    ]),
  ]),
  node("Бонусы и Cash-back", "INCOME", [
    node("Cash-back", "INCOME"),
    node("Бонусы", "INCOME", [
      node("Спасибо от СБера", "INCOME"),
      node("Яндекс.Плюс", "INCOME"),
    ]),
  ]),
  node("Прочие доходы", "INCOME", [
    node("Доходы от переоценки активов", "INCOME"),
    node("Доходы от актуализации счетов", "INCOME"),
    node("Налоговые вычеты", "INCOME"),
    node("Прочие доходы", "INCOME"),
  ]),
  node("Автомобиль", "EXPENSE", [
    node("Бензин", "EXPENSE"),
    node("Мойка", "EXPENSE"),
    node("Обслуживание и ремонт автомобиля", "EXPENSE"),
    node("Парковка", "EXPENSE", [
      node("Городские парковки", "EXPENSE"),
      node("Аренда парковочного места", "EXPENSE"),
    ]),
    node("Переобувка и хранение шин", "EXPENSE"),
    node("Техосмотр", "EXPENSE"),
    node("Штрафы", "EXPENSE"),
  ]),
  node("Недвижимость", "EXPENSE", [
    node("ЖКУ", "EXPENSE", [
      node("Коммунальные услуги", "EXPENSE"),
      node("Электричество", "EXPENSE"),
      node("Оплата ремонта и обслуживания жилья", "EXPENSE"),
    ]),
  ]),
  node("Услуги", "EXPENSE", [
    node("Клининг", "EXPENSE"),
    node("Химчистка", "EXPENSE"),
    node("Психолог", "EXPENSE"),
    node("Тренер", "EXPENSE"),
    node("Банковское обслуживание", "EXPENSE"),
  ]),
  node("Благотворительность", "EXPENSE"),
  node("Хобби и увлечения", "EXPENSE", [
    node("Спорт", "EXPENSE", [
      node("Абонемент в фитнес-клуб", "EXPENSE"),
      node("Спортивное питание", "EXPENSE"),
    ]),
    node("Видеоигры", "EXPENSE"),
    node("Книги", "EXPENSE"),
    node("Вокал", "EXPENSE"),
    node("Танцы", "EXPENSE"),
  ]),
  node("Интернет и связь", "EXPENSE", [
    node("Домашний интернет", "EXPENSE"),
    node("Мобильный интернет", "EXPENSE"),
    node("Сотовая связь", "EXPENSE"),
  ]),
  node("Домашние животные", "EXPENSE", [
    node("Питание домашних животных", "EXPENSE"),
    node("Наполнитель для туалета", "EXPENSE"),
    node("Груминг", "EXPENSE"),
  ]),
  node("Кредиты", "EXPENSE", [
    node("Оплата плановых процентов по кредитам", "EXPENSE"),
    node("Оплата пени/штрафов по кредитам", "EXPENSE"),
  ]),
  node("Здоровье", "EXPENSE", [
    node("Лекарственные препараты", "EXPENSE"),
    node("Посещение врачей", "EXPENSE"),
    node("Сдача анализов", "EXPENSE"),
    node("Стоматология", "EXPENSE"),
  ]),
  node("Налоги", "EXPENSE", [
    node("Налог на имущество", "EXPENSE"),
    node("Транспортный налог", "EXPENSE"),
    node("НДФЛ", "EXPENSE", [
      node("НДФЛ по доходам от деятельности", "EXPENSE"),
      node("НДФЛ по процентам по вкладам", "EXPENSE"),
      node("НДФЛ от операций на рынке ценных бумаг", "EXPENSE"),
    ]),
  ]),
  node("Одежда и обувь", "EXPENSE", [
    node("Одежда", "EXPENSE", [
      node("Повседневная одежда", "EXPENSE"),
      node("Спортивная одежда", "EXPENSE"),
    ]),
    node("Обувь", "EXPENSE", [
      node("Повседневная обувь", "EXPENSE"),
      node("Спортивная обувь", "EXPENSE"),
    ]),
    node("Аксессуары", "EXPENSE"),
    node("Украшения", "EXPENSE"),
  ]),
  node("Отдых и развлечения", "EXPENSE", [
    node("Кино", "EXPENSE"),
    node("Театр", "EXPENSE"),
    node("Концерты", "EXPENSE"),
    node("Музеи", "EXPENSE"),
  ]),
  node("Отпуска", "EXPENSE", [
    node("Авиабилеты", "EXPENSE"),
    node("Размещение", "EXPENSE"),
  ]),
  node("Вредные привычки", "EXPENSE", [
    node("Алкоголь", "EXPENSE"),
    node("Сигареты", "EXPENSE"),
  ]),
  node("Питание", "EXPENSE", [
    node("Продукты питания", "EXPENSE"),
    node("Готовая еда", "EXPENSE"),
    node("Рестораны", "EXPENSE"),
    node("Питание на работе", "EXPENSE"),
  ]),
  node("Подписки", "EXPENSE"),
  node("Подарки", "EXPENSE"),
  node("Страхование", "EXPENSE", [
    node("Ипотечное страхование", "EXPENSE"),
    node("ОСАГО", "EXPENSE"),
    node("КАСКО", "EXPENSE"),
    node("Страхование недвижимости", "EXPENSE"),
    node("Страхование жизни и здоровья", "EXPENSE"),
  ]),
  node("Транспорт", "EXPENSE", [
    node("Метро", "EXPENSE"),
    node("Городской транспорт", "EXPENSE"),
    node("Междугородний транспорт", "EXPENSE"),
    node("Такси", "EXPENSE"),
  ]),
  node("Уход за собой", "EXPENSE", [
    node("БАДы", "EXPENSE"),
    node("Косметические процедуры", "EXPENSE"),
    node("Косметические средства", "EXPENSE"),
    node("Солярий", "EXPENSE"),
  ]),
  node("Хозяйственные расходы", "EXPENSE", [
    node("Средства для уборки", "EXPENSE"),
  ]),
  node("Электроника", "EXPENSE"),
  node("Прочие расходы", "EXPENSE", [
    node("Расходы от переоценки активов", "EXPENSE"),
    node("Расходы от актуализации счетов", "EXPENSE"),
    node("Прочие расходы", "EXPENSE"),
  ]),
];

function isScope(value: unknown): value is CategoryScope {
  return value === "INCOME" || value === "EXPENSE" || value === "BOTH";
}

function coerceNodes(value: unknown): CategoryNode[] | null {
  if (!Array.isArray(value)) return null;
  const walk = (items: any[]): CategoryNode[] =>
    items
      .filter((item) => item && typeof item.name === "string" && typeof item.id === "number")
      .map((item) => ({
        id: item.id,
        name: item.name,
        scope: isScope(item.scope) ? item.scope : "BOTH",
        icon_name:
          typeof item.icon_name === "string" && item.icon_name.trim().length > 0
            ? item.icon_name
            : undefined,
        parent_id: typeof item.parent_id === "number" ? item.parent_id : undefined,
        owner_user_id:
          typeof item.owner_user_id === "number" ? item.owner_user_id : undefined,
        enabled: typeof item.enabled === "boolean" ? item.enabled : undefined,
        archived_at:
          typeof item.archived_at === "string" && item.archived_at.trim().length > 0
            ? item.archived_at
            : undefined,
        children: Array.isArray(item.children) ? walk(item.children) : undefined,
      }));
  return walk(value);
}

export function readStoredCategories(): CategoryNode[] | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(CATEGORY_STORAGE_KEY);
  if (!raw) {
    if (window.localStorage.getItem(LEGACY_CATEGORY_STORAGE_KEY)) {
      window.localStorage.removeItem(LEGACY_CATEGORY_STORAGE_KEY);
    }
    return null;
  }
  try {
    return coerceNodes(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeStoredCategories(nodes: CategoryNode[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CATEGORY_STORAGE_KEY, JSON.stringify(nodes));
}

function matchesScope(scope: CategoryScope, direction?: "INCOME" | "EXPENSE") {
  if (!direction) return true;
  if (scope === "BOTH") return true;
  return scope === direction;
}

export function buildCategoryMaps(
  nodes: CategoryNode[],
  direction?: "INCOME" | "EXPENSE",
  options?: { includeArchived?: boolean; includeDisabled?: boolean }
): CategoryMaps {
  const includeArchived = options?.includeArchived ?? false;
  const includeDisabled = options?.includeDisabled ?? false;
  const l1: string[] = [];
  const l2: Record<string, string[]> = {};
  const l3: Record<string, string[]> = {};

  nodes.forEach((root) => {
    if (!includeArchived && root.archived_at) return;
    if (!includeDisabled && root.enabled === false) return;
    if (!matchesScope(root.scope, direction)) return;
    l1.push(root.name);
    const level2 = (root.children ?? []).filter((child) => {
      if (!includeArchived && child.archived_at) return false;
      if (!includeDisabled && child.enabled === false) return false;
      return matchesScope(child.scope, direction);
    });
    l2[root.name] = level2.map((child) => child.name);
    level2.forEach((child) => {
      const level3 = (child.children ?? []).filter((leaf) => {
        if (!includeArchived && leaf.archived_at) return false;
        if (!includeDisabled && leaf.enabled === false) return false;
        return matchesScope(leaf.scope, direction);
      });
      if (level3.length > 0) {
        l3[child.name] = level3.map((leaf) => leaf.name);
      }
    });
  });

  return { l1, l2, l3 };
}

export function makeCategoryPathKey(l1?: string, l2?: string, l3?: string) {
  return [l1, l2, l3].map((value) => value?.trim() ?? "").join("||");
}

export function buildCategoryLookup(nodes: CategoryNode[]) {
  const idToPath = new Map<number, string[]>();
  const idToIcon = new Map<number, string | null>();
  const pathToId = new Map<string, number>();

  const walk = (items: CategoryNode[], trail: string[]) => {
    items.forEach((item) => {
      const nextTrail = [...trail, item.name];
      idToPath.set(item.id, nextTrail);
      idToIcon.set(item.id, item.icon_name ?? null);
      pathToId.set(makeCategoryPathKey(...nextTrail), item.id);
      if (item.children?.length) {
        walk(item.children, nextTrail);
      }
    });
  };

  walk(nodes, []);

  return { idToPath, idToIcon, pathToId };
}

export function buildCategoryDescendants(nodes: CategoryNode[]) {
  const map = new Map<number, Set<number>>();

  const walk = (node: CategoryNode) => {
    const descendants = new Set<number>();
    descendants.add(node.id);
    (node.children ?? []).forEach((child) => {
      const childDescendants = walk(child);
      childDescendants.forEach((id) => descendants.add(id));
    });
    map.set(node.id, descendants);
    return descendants;
  };

  nodes.forEach((node) => walk(node));

  return map;
}
