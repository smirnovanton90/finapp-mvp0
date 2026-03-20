/**
 * Режим импорта «перевод» по категории выписки (подстрока «перевод» в названии).
 */

import type { DzenParsedData, DzenParsedTransaction } from "@/lib/dzen-csv-parser";
import type { ImportAccountCardState } from "@/components/import-account-card";
import type { ImportCategoryCardState } from "@/components/import-category-card";

/** Настройки перевода по счёту выписки: поступление (на счёт) и/или списание (со счёта) */
export type TransferFlowForAccount = {
  /** Счёт списания — откуда деньги при поступлении на счёт выписки */
  inboundSourceItemId: number | null;
  /** Счёт зачисления — куда уходят деньги при списании со счёта выписки */
  outboundDestItemId: number | null;
};

export type TransferRowSpec = {
  accountKey: string;
  hasInbound: boolean;
  hasOutbound: boolean;
};

export function buildTransferFlowMap(
  prev: Record<string, TransferFlowForAccount>,
  rows: TransferRowSpec[]
): Record<string, TransferFlowForAccount> {
  const next: Record<string, TransferFlowForAccount> = {};
  for (const row of rows) {
    const k = row.accountKey;
    const p = prev[k] ?? {
      inboundSourceItemId: null,
      outboundDestItemId: null,
    };
    next[k] = {
      inboundSourceItemId: row.hasInbound ? p.inboundSourceItemId ?? null : null,
      outboundDestItemId: row.hasOutbound ? p.outboundDestItemId ?? null : null,
    };
  }
  return next;
}

/** Счета выписки с привязкой актива и операциями с данной категорией + направления потоков */
export function computeTransferRowsForCategory(
  categoryName: string,
  transactions: DzenParsedTransaction[],
  accounts: DzenParsedData["accounts"],
  accountCardStates: Map<string, ImportAccountCardState>
): TransferRowSpec[] {
  const cn = categoryName.trim();
  const rows: TransferRowSpec[] = [];
  for (const acc of accounts ?? []) {
    const accountKey = `${acc.name}|${acc.currency}`;
    const st = accountCardStates.get(accountKey);
    if (!st?.linkEnabled || st.linkedItemId == null) continue;

    let hasInbound = false;
    let hasOutbound = false;
    for (const tx of transactions) {
      if ((tx.categoryName ?? "").trim() !== cn) continue;
      if (tx.type === "transfer") continue;
      if (
        tx.type === "income" &&
        tx.income != null &&
        tx.income > 0 &&
        tx.incomeAccountName === acc.name &&
        tx.incomeCurrency === acc.currency
      ) {
        hasInbound = true;
      }
      if (
        tx.type === "expense" &&
        tx.outcome != null &&
        tx.outcome > 0 &&
        tx.outcomeAccountName === acc.name &&
        tx.outcomeCurrency === acc.currency
      ) {
        if (isLikelyInboundTransferMisclassifiedAsExpense(tx)) {
          hasInbound = true;
        } else {
          hasOutbound = true;
        }
      }
    }
    if (hasInbound || hasOutbound) {
      rows.push({ accountKey, hasInbound, hasOutbound });
    }
  }
  return rows.sort((a, b) => a.accountKey.localeCompare(b.accountKey));
}

/** Входящий СБП в выписке иногда парсится как расход; по тексту назначения восстанавливаем поток «на счёт». */
export function isLikelyInboundTransferMisclassifiedAsExpense(
  tx: DzenParsedTransaction
): boolean {
  if (tx.type !== "expense") return false;
  const c = (tx.comment ?? "").toLowerCase();
  return (
    c.includes("перевод") &&
    c.includes("сбп") &&
    c.includes("отправитель")
  );
}

/** Неблокирующие предупреждения при неполной настройке режима перевода */
export function getStep3TransferModeWarnings(
  parsedData: Pick<DzenParsedData, "categories" | "transactions" | "accounts">,
  categoryCardStates: Map<string, ImportCategoryCardState>,
  accountCardStates: Map<string, ImportAccountCardState>
): string[] {
  const warnings: string[] = [];
  const txs = parsedData.transactions ?? [];
  for (const cat of parsedData.categories ?? []) {
    const state = categoryCardStates.get(cat.name);
    if (!state?.transferModeEnabled) continue;
    let needWarning = false;
    for (const tx of txs) {
      if ((tx.categoryName ?? "").trim() !== cat.name.trim()) continue;
      if (tx.type === "transfer") continue;

      if (
        tx.type === "income" &&
        tx.income != null &&
        tx.income > 0
      ) {
        const ak = `${tx.incomeAccountName}|${tx.incomeCurrency}`;
        const ast = accountCardStates.get(ak);
        if (!ast?.linkEnabled || ast.linkedItemId == null) {
          needWarning = true;
          break;
        }
        const flow = state.transferFlowByAccountKey[ak];
        if (flow?.inboundSourceItemId == null) {
          needWarning = true;
          break;
        }
      } else if (
        tx.type === "expense" &&
        tx.outcome != null &&
        tx.outcome > 0
      ) {
        const ak = `${tx.outcomeAccountName}|${tx.outcomeCurrency}`;
        const ast = accountCardStates.get(ak);
        if (!ast?.linkEnabled || ast.linkedItemId == null) {
          needWarning = true;
          break;
        }
        if (isLikelyInboundTransferMisclassifiedAsExpense(tx)) {
          const flow = state.transferFlowByAccountKey[ak];
          if (flow?.inboundSourceItemId == null) {
            needWarning = true;
            break;
          }
        } else {
          const flow = state.transferFlowByAccountKey[ak];
          if (flow?.outboundDestItemId == null) {
            needWarning = true;
            break;
          }
        }
      }
    }
    if (needWarning) {
      warnings.push(
        `Часть операций с категорией «${cat.name}» будет импортирована как доход или расход без перевода: проверьте привязку счетов и выбор корреспондентов.`
      );
    }
  }
  return warnings;
}
