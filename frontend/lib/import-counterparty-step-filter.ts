/**
 * Какие контрагенты из выписки нужно показывать на шаге маппинга:
 * исключаем тех, у кого все операции уйдут в перевод по настройке категории (без counterparty_id).
 */

import {
  isDzenDebtsAccount,
  type DzenParsedCounterparty,
  type DzenParsedData,
  type DzenParsedTransaction,
} from "@/lib/dzen-csv-parser";
import type { ImportAccountCardState } from "@/components/import-account-card";
import type { ImportCategoryCardState } from "@/components/import-category-card";
import { isTransferCategoryName } from "@/lib/import-match-helpers";
import { isLikelyInboundTransferMisclassifiedAsExpense } from "@/lib/import-transfer-category";

/** Как в executor после шага счетов: только привязанные к существующему активу счета. */
function buildAccountKeyToItemIdPreview(
  accountCardStates: Map<string, ImportAccountCardState>,
  accounts: DzenParsedData["accounts"]
): Map<string, number> {
  const m = new Map<string, number>();
  for (const acc of accounts ?? []) {
    const key = `${acc.name}|${acc.currency}`;
    const st = accountCardStates.get(key);
    if (st?.linkEnabled && st.linkedItemId != null) {
      m.set(key, st.linkedItemId);
    }
  }
  return m;
}

/**
 * true, если при импорте для этой операции будет выставлен counterparty_id из маппинга контрагентов.
 * Не учитывает effectiveImportStartDate (консервативно: если операция могла бы импортироваться с КА).
 */
export function transactionUsesCounterpartyMapping(
  tx: DzenParsedTransaction,
  categoryCardStates: Map<string, ImportCategoryCardState>,
  accountKeyToItemId: Map<string, number>
): boolean {
  if (!(tx.counterparty ?? "").trim()) return false;

  const outcomeIsDebts = isDzenDebtsAccount({ name: tx.outcomeAccountName });
  const incomeIsDebts = isDzenDebtsAccount({ name: tx.incomeAccountName });

  if (tx.type === "transfer" && (outcomeIsDebts || incomeIsDebts)) {
    if (outcomeIsDebts && !incomeIsDebts && tx.income != null && tx.income > 0) {
      const incomeKey = `${tx.incomeAccountName}|${tx.incomeCurrency}`;
      return accountKeyToItemId.get(incomeKey) != null;
    }
    if (incomeIsDebts && !outcomeIsDebts && tx.outcome != null && tx.outcome > 0) {
      const outcomeKey = `${tx.outcomeAccountName}|${tx.outcomeCurrency}`;
      return accountKeyToItemId.get(outcomeKey) != null;
    }
    return false;
  }

  if (tx.type !== "transfer") {
    const catState =
      (tx.categoryName ?? "").trim() !== ""
        ? categoryCardStates.get(tx.categoryName)
        : undefined;
    if (
      catState?.transferModeEnabled &&
      isTransferCategoryName(tx.categoryName) &&
      !outcomeIsDebts &&
      !incomeIsDebts
    ) {
      const flowByKey = catState.transferFlowByAccountKey ?? {};
      const inbound =
        tx.type === "income" && tx.income != null && tx.income > 0;
      const inboundMisclassified =
        tx.type === "expense" &&
        tx.outcome != null &&
        tx.outcome > 0 &&
        isLikelyInboundTransferMisclassifiedAsExpense(tx);
      if (inbound || inboundMisclassified) {
        const accKey = inbound
          ? `${tx.incomeAccountName}|${tx.incomeCurrency}`
          : `${tx.outcomeAccountName}|${tx.outcomeCurrency}`;
        const flow = flowByKey[accKey];
        const sourceId = flow?.inboundSourceItemId ?? null;
        const toItemId = accountKeyToItemId.get(accKey) ?? null;
        if (
          toItemId != null &&
          sourceId != null &&
          Number.isFinite(sourceId)
        ) {
          return false;
        }
      } else if (
        tx.type === "expense" &&
        tx.outcome != null &&
        tx.outcome > 0 &&
        !isLikelyInboundTransferMisclassifiedAsExpense(tx)
      ) {
        const accKey = `${tx.outcomeAccountName}|${tx.outcomeCurrency}`;
        const flow = flowByKey[accKey];
        const destId = flow?.outboundDestItemId ?? null;
        const fromItemId = accountKeyToItemId.get(accKey) ?? null;
        if (
          fromItemId != null &&
          destId != null &&
          Number.isFinite(destId)
        ) {
          return false;
        }
      }
    }
  }

  let primaryItemId: number | null = null;
  let amountCents = 0;

  if (tx.type === "expense" && tx.outcome != null && tx.outcome > 0) {
    const key = `${tx.outcomeAccountName}|${tx.outcomeCurrency}`;
    primaryItemId = accountKeyToItemId.get(key) ?? null;
    amountCents = tx.outcome;
  } else if (tx.type === "income" && tx.income != null && tx.income > 0) {
    const key = `${tx.incomeAccountName}|${tx.incomeCurrency}`;
    primaryItemId = accountKeyToItemId.get(key) ?? null;
    amountCents = tx.income;
  } else if (tx.type === "transfer") {
    if (tx.outcome != null && tx.outcome > 0) {
      const key = `${tx.outcomeAccountName}|${tx.outcomeCurrency}`;
      primaryItemId = accountKeyToItemId.get(key) ?? null;
      amountCents = tx.outcome;
    }
  }

  if (primaryItemId == null || amountCents <= 0) return false;

  if (tx.type === "transfer") {
    const incomeKey = `${tx.incomeAccountName}|${tx.incomeCurrency}`;
    const counterpartyItemId = accountKeyToItemId.get(incomeKey) ?? null;
    if (counterpartyItemId != null) {
      return false;
    }
    return false;
  }

  return true;
}

export function filterCounterpartiesForMappingStep(
  parsedCounterparties: DzenParsedCounterparty[],
  transactions: DzenParsedTransaction[],
  categoryCardStates: Map<string, ImportCategoryCardState>,
  accountCardStates: Map<string, ImportAccountCardState>,
  accounts: DzenParsedData["accounts"]
): DzenParsedCounterparty[] {
  const accountKeyToItemId = buildAccountKeyToItemIdPreview(
    accountCardStates,
    accounts
  );
  return parsedCounterparties.filter((cp) => {
    const name = (cp.name ?? "").trim();
    if (!name) return false;
    const relevant = transactions.filter(
      (tx) => (tx.counterparty ?? "").trim() === name
    );
    if (relevant.length === 0) return false;
    return relevant.some((tx) =>
      transactionUsesCounterpartyMapping(
        tx,
        categoryCardStates,
        accountKeyToItemId
      )
    );
  });
}
