/**
 * Исполнение импорта: создание/связывание счетов, категорий, контрагентов и транзакций.
 * Используется и для выписки Дзен-мани, и для импорта «своей» выписки (own).
 * По переводам создаётся одна транзакция с direction TRANSFER (не две: расход + доход).
 */

import { parseRubToCents } from "@/lib/format-rub";
import { buildCategoryLookup, makeCategoryPathKey } from "@/lib/categories";
import { getTypeOptionsForKind } from "@/lib/item-type-options";
import {
  createItem,
  createCategory,
  createCounterparty,
  createTransaction,
  fetchUserMe,
  setAccountingStartDate,
} from "@/lib/api";
import {
  type DzenParsedData,
  type DzenParsedTransaction,
  isDzenDebtsAccount,
  getTransactionDateTimeSortKey,
} from "@/lib/dzen-csv-parser";
import type { ImportAccountCardState } from "@/components/import-account-card";
import type { ImportCategoryCardState } from "@/components/import-category-card";
import type { ImportCounterpartyCardState } from "@/components/import-counterparty-card";
import type { CategoryNode } from "@/lib/categories";

/**
 * Начальный остаток и дата первой операции по счёту.
 * Учитываются все операции из выписки по этому счёту: расходы, доходы и переводы,
 * в которых счёт — исходящий или входящий (в т.ч. переводы с активом «Долги» с другой стороны).
 * Если задан minDate, учитываются только операции с датой >= minDate (остаток на начало дня minDate).
 */
function calcInitialFromTransactions(
  accountName: string,
  accountCurrency: string,
  transactions: DzenParsedTransaction[],
  currentBalance: number,
  minDate?: string | null
): { initial: number; earliestDate: string } {
  let incomeSum = 0;
  let outcomeSum = 0;
  let earliestDate = minDate ?? new Date().toISOString().slice(0, 10);

  for (const tx of transactions) {
    if (minDate && tx.date && tx.date < minDate) continue;
    const isOutcome =
      tx.outcomeAccountName === accountName &&
      tx.outcomeCurrency === accountCurrency;
    const isIncome =
      tx.incomeAccountName === accountName &&
      tx.incomeCurrency === accountCurrency;

    if (isOutcome && tx.outcome != null) {
      outcomeSum += tx.outcome;
      if (!minDate && tx.date && tx.date < earliestDate) earliestDate = tx.date;
    }
    if (isIncome && tx.income != null) {
      incomeSum += tx.income;
      if (!minDate && tx.date && tx.date < earliestDate) earliestDate = tx.date;
    }
  }

  const initial = currentBalance - incomeSum + outcomeSum;
  return { initial, earliestDate: minDate ?? earliestDate };
}

/** Самая ранняя дата транзакции в выписке (только по полю date). */
export function getEarliestStatementTransactionDate(
  parsedData: { transactions?: Array<{ date?: string }> }
): string | null {
  const transactions = parsedData.transactions ?? [];
  let earliest: string | null = null;
  for (const tx of transactions) {
    const d = tx.date;
    if (d && (!earliest || d < earliest)) earliest = d;
  }
  return earliest;
}

/** Дата начала учёта по выписке — одинаковая для всех счетов импорта */
export function getStatementAccountingStartDate(
  parsedData: { accounts?: Array<{ name: string; currency: string }>; transactions?: DzenParsedTransaction[] },
  accountCardStates: Map<string, { balanceStr: string; linkEnabled: boolean }>
): string | null {
  const transactions = parsedData.transactions ?? [];
  let earliest: string | null = null;
  for (const tx of transactions) {
    const d = tx.date;
    if (d && (!earliest || d < earliest)) earliest = d;
  }
  if (!earliest && (parsedData.accounts ?? []).length > 0) {
    for (const acc of parsedData.accounts ?? []) {
      const key = `${acc.name}|${acc.currency}`;
      const state = accountCardStates.get(key);
      if (!state || state.linkEnabled) continue;
      const balanceCents = parseRubToCents(state.balanceStr);
      const currentBalance = Number.isFinite(balanceCents) ? balanceCents / 100 : 0;
      const { earliestDate: accEarliest } = calcInitialFromTransactions(
        acc.name,
        acc.currency,
        transactions,
        currentBalance
      );
      if (!earliest || accEarliest < earliest) earliest = accEarliest;
    }
  }
  return earliest;
}

/** Дата последней транзакции по выписке — для подписи поля «Остаток на …» на шаге «Счета» */
export function getStatementLastTransactionDate(
  parsedData: { transactions?: Array<{ date: string }> }
): string | null {
  const transactions = parsedData.transactions ?? [];
  let latest: string | null = null;
  for (const tx of transactions) {
    const d = tx.date;
    if (d && (!latest || d > latest)) latest = d;
  }
  return latest;
}

export type ImportDzenParams = {
  parsedData: DzenParsedData;
  accountCardStates: Map<string, ImportAccountCardState>;
  categoryCardStates: Map<string, ImportCategoryCardState>;
  counterpartyCardStates: Map<string, ImportCounterpartyCardState>;
  categoryNodes: CategoryNode[];
};

export type ImportDzenResult =
  | { success: true }
  | { success: false; error: string };

export async function executeImportDzen(
  params: ImportDzenParams
): Promise<ImportDzenResult> {
  const {
    parsedData,
    accountCardStates,
    categoryCardStates,
    counterpartyCardStates,
    categoryNodes,
  } = params;

  const accountKeyToItemId = new Map<string, number>();
  const categoryNameToId = new Map<string, number>();
  const counterpartyNameToId = new Map<string, number>();
  const categoryLookup = buildCategoryLookup(categoryNodes);

  try {
    const me = await fetchUserMe();
    const transactions = parsedData.transactions ?? [];
    let earliestDate: string | null = null;
    for (const tx of transactions) {
      const d = tx.date;
      if (d && (!earliestDate || d < earliestDate)) earliestDate = d;
    }
    if (!earliestDate && (parsedData.accounts ?? []).length > 0) {
      for (const acc of parsedData.accounts ?? []) {
        const key = `${acc.name}|${acc.currency}`;
        const state = accountCardStates.get(key);
        if (!state || state.linkEnabled) continue;
        const { earliestDate: accEarliest } = calcInitialFromTransactions(
          acc.name,
          acc.currency,
          transactions,
          Number.isFinite(parseRubToCents(state.balanceStr) / 100)
            ? parseRubToCents(state.balanceStr) / 100
            : 0
        );
        if (!earliestDate || accEarliest < earliestDate) earliestDate = accEarliest;
      }
    }
    // Если у пользователя уже задана дата начала учёта и она позже самой ранней транзакции в выписке —
    // импортируем только с даты начала учёта, не меняем её и ставим open_date счетов на неё.
    const effectiveImportStartDate: string | null =
      me.accounting_start_date && earliestDate && me.accounting_start_date > earliestDate
        ? me.accounting_start_date
        : null;
    if (earliestDate && !effectiveImportStartDate) {
      if (!me.accounting_start_date) {
        await setAccountingStartDate({
          accounting_start_date: earliestDate,
        });
      }
    }

    // 1. Создать категории (новые) — сначала без родителя, затем с родителем
    const catsToCreate = (parsedData.categories ?? []).filter(
      (cat) => categoryCardStates.has(cat.name)
    );
    const sortedCats = [...catsToCreate].sort((a, b) => {
      const sa = categoryCardStates.get(a.name)!;
      const sb = categoryCardStates.get(b.name)!;
      const aHasParent = !!sa.parentPath?.l1?.trim();
      const bHasParent = !!sb.parentPath?.l1?.trim();
      return (aHasParent ? 1 : 0) - (bHasParent ? 1 : 0);
    });
    for (const cat of sortedCats) {
      const state = categoryCardStates.get(cat.name)!;
      if (state.linkEnabled && state.linkedPath) {
        const key = makeCategoryPathKey(
          state.linkedPath.l1,
          state.linkedPath.l2,
          state.linkedPath.l3
        );
        const id = categoryLookup.pathToId.get(key);
        if (id != null) categoryNameToId.set(cat.name, id);
      } else {
        const parentId = (() => {
          if (!state.parentPath?.l1?.trim()) return null;
          const key = makeCategoryPathKey(
            state.parentPath.l1,
            state.parentPath.l2,
            state.parentPath.l3
          );
          return (
            categoryLookup.pathToId.get(key) ??
            categoryNameToId.get(state.parentPath.l1) ??
            null
          );
        })();
        const created = await createCategory({
          name: (state.name || cat.name).trim(),
          parent_id: parentId,
          scope: state.scope,
          icon_name: state.iconName || null,
        });
        categoryNameToId.set(cat.name, created.id);
      }
    }

    // 2. Создать контрагентов (новых)
    for (const cp of parsedData.counterparties ?? []) {
      const state = counterpartyCardStates.get(cp.name);
      if (!state) continue;

      if (state.linkEnabled && state.linkedCounterpartyId != null) {
        counterpartyNameToId.set(cp.name, state.linkedCounterpartyId);
      } else {
        const payload =
          state.entityType === "LEGAL"
            ? {
                entity_type: "LEGAL" as const,
                name: (state.name || cp.name).trim() || null,
              }
            : {
                entity_type: "PERSON" as const,
                last_name: state.lastName?.trim() || null,
                first_name: state.firstName?.trim() || null,
                middle_name: state.middleName?.trim() || null,
              };
        const created = await createCounterparty(payload);
        counterpartyNameToId.set(cp.name, created.id);
      }
    }

    // 3. Создать счета (новые). Счёт «Долги» не импортируется.
    // open_date каждого счёта = самая ранняя дата операций по этому счёту (все операции выписки, включая переводы и переводы с «Долги»).
    for (const acc of parsedData.accounts ?? []) {
      if (isDzenDebtsAccount(acc)) continue;
      const key = `${acc.name}|${acc.currency}`;
      const state = accountCardStates.get(key);
      if (!state) continue;

      if (state.linkEnabled && state.linkedItemId != null) {
        accountKeyToItemId.set(key, state.linkedItemId);
      } else {
        const typeOptions = getTypeOptionsForKind(state.kind);
        const typeCode =
          state.typeCode && typeOptions.some((o) => o.code === state.typeCode)
            ? state.typeCode
            : typeOptions[0]?.code ?? "cash";

        const balanceCents = parseRubToCents(state.balanceStr);
        const currentBalance = Number.isFinite(balanceCents)
          ? balanceCents / 100
          : 0;
        const { initial, earliestDate: accountEarliest } = calcInitialFromTransactions(
          acc.name,
          acc.currency,
          parsedData.transactions ?? [],
          currentBalance,
          effectiveImportStartDate
        );
        const initialValueCents = Math.round(initial * 100);
        const accountOpenDate = effectiveImportStartDate ?? accountEarliest;

        const created = await createItem({
          kind: state.kind,
          type_code: typeCode,
          name: (state.name || acc.name).trim(),
          currency_code: (state.currency ?? acc.currency) || "RUB",
          open_date: accountOpenDate,
          initial_value_rub: initialValueCents,
          counterparty_id: state.counterpartyId ?? null,
        });
        accountKeyToItemId.set(key, created.id);
      }
    }

    // Категории по умолчанию для операций счёта «Долги» (второй уровень)
    const otherIncomeCategoryId =
      categoryLookup.pathToId.get(
        makeCategoryPathKey("Прочие доходы", "Прочие доходы", "")
      ) ?? null;
    const otherExpenseCategoryId =
      categoryLookup.pathToId.get(
        makeCategoryPathKey("Прочие расходы", "Прочие расходы", "")
      ) ?? null;

    // 4. Создать транзакции: по дням от раннего к позднему; внутри дня — сначала доходы, потом переводы, затем расходы (чтобы не получать отрицательное сальдо в течение дня)
    const TYPE_ORDER: Record<"income" | "transfer" | "expense", number> = {
      income: 0,
      transfer: 1,
      expense: 2,
    };
    const sortedTransactions = [...(parsedData.transactions ?? [])].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      const orderA = TYPE_ORDER[a.type] ?? 2;
      const orderB = TYPE_ORDER[b.type] ?? 2;
      if (orderA !== orderB) return orderA - orderB;
      return getTransactionDateTimeSortKey(a).localeCompare(getTransactionDateTimeSortKey(b));
    });
    for (const tx of sortedTransactions) {
      if (effectiveImportStartDate && tx.date < effectiveImportStartDate) continue;
      const outcomeIsDebts = isDzenDebtsAccount({ name: tx.outcomeAccountName });
      const incomeIsDebts = isDzenDebtsAccount({ name: tx.incomeAccountName });

      // Трансфер с участием счёта «Долги» — один доход или расход с категорией по умолчанию
      if (tx.type === "transfer" && (outcomeIsDebts || incomeIsDebts)) {
        if (outcomeIsDebts && !incomeIsDebts && tx.income != null && tx.income > 0) {
          const incomeKey = `${tx.incomeAccountName}|${tx.incomeCurrency}`;
          const incomeItemId = accountKeyToItemId.get(incomeKey) ?? null;
          if (incomeItemId != null) {
            const counterpartyId = tx.counterparty
              ? (counterpartyNameToId.get(tx.counterparty) ?? null)
              : null;
            await createTransaction({
              transaction_date: getTransactionDateTimeSortKey(tx),
              primary_item_id: incomeItemId,
              counterparty_id: counterpartyId,
              amount_rub: Math.round(tx.income * 100),
              direction: "INCOME",
              transaction_type: "ACTUAL",
              status: "CONFIRMED",
              category_id: otherIncomeCategoryId,
              comment: tx.comment || null,
            });
          }
        } else if (incomeIsDebts && !outcomeIsDebts && tx.outcome != null && tx.outcome > 0) {
          const outcomeKey = `${tx.outcomeAccountName}|${tx.outcomeCurrency}`;
          const outcomeItemId = accountKeyToItemId.get(outcomeKey) ?? null;
          if (outcomeItemId != null) {
            const counterpartyId = tx.counterparty
              ? (counterpartyNameToId.get(tx.counterparty) ?? null)
              : null;
            await createTransaction({
              transaction_date: getTransactionDateTimeSortKey(tx),
              primary_item_id: outcomeItemId,
              counterparty_id: counterpartyId,
              amount_rub: Math.round(tx.outcome * 100),
              direction: "EXPENSE",
              transaction_type: "ACTUAL",
              status: "CONFIRMED",
              category_id: otherExpenseCategoryId,
              comment: tx.comment || null,
            });
          }
        }
        continue;
      }

      let primaryItemId: number | null = null;
      let direction: "INCOME" | "EXPENSE" | "TRANSFER" = "EXPENSE";
      let amountRub = 0;

      if (tx.type === "expense" && tx.outcome != null && tx.outcome > 0) {
        const key = `${tx.outcomeAccountName}|${tx.outcomeCurrency}`;
        primaryItemId = accountKeyToItemId.get(key) ?? null;
        direction = "EXPENSE";
        amountRub = Math.round(tx.outcome * 100);
      } else if (tx.type === "income" && tx.income != null && tx.income > 0) {
        const key = `${tx.incomeAccountName}|${tx.incomeCurrency}`;
        primaryItemId = accountKeyToItemId.get(key) ?? null;
        direction = "INCOME";
        amountRub = Math.round(tx.income * 100);
      } else if (tx.type === "transfer") {
        if (tx.outcome != null && tx.outcome > 0) {
          const key = `${tx.outcomeAccountName}|${tx.outcomeCurrency}`;
          primaryItemId = accountKeyToItemId.get(key) ?? null;
          direction = "EXPENSE";
          amountRub = Math.round(tx.outcome * 100);
        }
      }

      if (primaryItemId == null || amountRub <= 0) continue;

      const categoryId = categoryNameToId.get(tx.categoryName) ?? null;
      const counterpartyId = tx.counterparty
        ? (counterpartyNameToId.get(tx.counterparty) ?? null)
        : null;

      // Перевод (Дзен и своя выписка): одна транзакция TRANSFER с counterparty_item_id
      if (tx.type === "transfer") {
        const incomeKey = `${tx.incomeAccountName}|${tx.incomeCurrency}`;
        const counterpartyItemId = accountKeyToItemId.get(incomeKey) ?? null;
        if (counterpartyItemId != null) {
          const amountCounterparty =
            tx.outcomeCurrency !== tx.incomeCurrency && tx.income != null
              ? Math.round(tx.income * 100)
              : undefined;
          await createTransaction({
            transaction_date: getTransactionDateTimeSortKey(tx),
            primary_item_id: primaryItemId,
            counterparty_item_id: counterpartyItemId,
            amount_rub: amountRub,
            amount_counterparty: amountCounterparty,
            direction: "TRANSFER",
            transaction_type: "ACTUAL",
            status: "CONFIRMED",
            category_id: null,
            comment: tx.comment || null,
          });
        }
        continue;
      }

      await createTransaction({
        transaction_date: getTransactionDateTimeSortKey(tx),
        primary_item_id: primaryItemId,
        counterparty_id: counterpartyId,
        amount_rub: amountRub,
        direction,
        transaction_type: "ACTUAL",
        status: "CONFIRMED",
        category_id: categoryId,
        comment: tx.comment || null,
      });
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Не удалось выполнить импорт.",
    };
  }
}
