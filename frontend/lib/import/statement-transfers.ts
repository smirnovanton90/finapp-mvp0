/**
 * Переводы между своими счетами по номеру второго счёта из описания банковской выписки.
 * Операция становится переводом, только если второй счёт уже заведён у пользователя
 * (совпадение по названию или синониму актива, как при автопривязке на шаге «Счета»).
 * Иначе остаётся доходом/расходом — её можно оформить переводом вручную на шаге «Категории».
 */

import type { ItemOut } from "@/lib/api";
import type { DzenParsedData, DzenParsedTransaction } from "@/lib/dzen-csv-parser";
import { findMatchingItemId } from "@/lib/import-match-helpers";

export function hasStatementTransferCandidates(data: DzenParsedData): boolean {
  return data.transactions.some((tx) => !!tx.counterAccountName && tx.type !== "transfer");
}

export function resolveStatementTransfers(
  data: DzenParsedData,
  items: ItemOut[]
): DzenParsedData {
  if (items.length === 0 || !hasStatementTransferCandidates(data)) return data;

  const itemIdByAccountName = new Map<string, number | null>();
  const matchItem = (accountName: string): number | null => {
    if (!itemIdByAccountName.has(accountName)) {
      itemIdByAccountName.set(accountName, findMatchingItemId(accountName, items));
    }
    return itemIdByAccountName.get(accountName) ?? null;
  };

  const accounts = [...data.accounts];
  const accountKeys = new Set(accounts.map((a) => `${a.name}|${a.currency}`));
  const convertedCategories = new Set<string>();

  const transactions = data.transactions.map((tx): DzenParsedTransaction => {
    const counterAccount = tx.counterAccountName?.trim();
    if (!counterAccount || tx.type === "transfer") return tx;

    const isIncome = tx.type === "income";
    const ownAccount = isIncome ? tx.incomeAccountName : tx.outcomeAccountName;
    const currency = isIncome ? tx.incomeCurrency : tx.outcomeCurrency;
    const counterItemId = matchItem(counterAccount);
    if (counterItemId == null || counterItemId === matchItem(ownAccount)) return tx;

    const counterKey = `${counterAccount}|${currency}`;
    if (!accountKeys.has(counterKey)) {
      accountKeys.add(counterKey);
      accounts.push({ name: counterAccount, currency });
    }
    convertedCategories.add(tx.categoryName);

    return {
      ...tx,
      type: "transfer",
      counterparty: "",
      outcomeAccountName: isIncome ? counterAccount : ownAccount,
      outcome: tx.amount,
      outcomeCurrency: currency,
      incomeAccountName: isIncome ? ownAccount : counterAccount,
      income: tx.amount,
      incomeCurrency: currency,
    };
  });

  if (convertedCategories.size === 0) return data;

  // Переводы импортируются без категории — карточка нужна, только если остались доходы/расходы с ней.
  const stillUsedCategories = new Set(
    transactions.filter((tx) => tx.type !== "transfer").map((tx) => tx.categoryName)
  );
  const categories = data.categories.filter(
    (c) => !convertedCategories.has(c.name) || stillUsedCategories.has(c.name)
  );

  return { ...data, accounts, categories, transactions };
}
