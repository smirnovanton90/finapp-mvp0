import {
  createDebtsTransaction,
  createTheyPaidForMeTransaction,
  createTransaction,
  type DebtDirection,
  type TransactionType,
} from "@/lib/api";
import { normalizeRubOnBlur, parseRubToCents } from "@/lib/format-rub";

export type SpecialFlow = "LOAN_REPAYMENT" | "DEBTS";

export const SPECIAL_STEP_TITLES: Record<string, string> = {
  type: "Тип",
  debtDirection: "Направление",
  date: "Дата",
  payFrom: "Откуда",
  payTo: "Куда",
  liability: "Обязательство",
  loanTotal: "Платёж",
  loanInterest: "Проценты",
  category: "Категория",
  comment: "Комментарий",
  counterparty: "Контрагент",
  wherePay: "Где платите",
  payFor: "За кого",
  whoPaid: "Кто платит",
  wherePaid: "Где платит",
  debtMode: "Долг",
  debtPick: "Долг",
  amount: "Сумма",
  fullAmount: "Сумма",
  debtPart: "В долг",
  debtAmount: "Долг",
  offsetFrom: "Откуда",
  offsetTo: "Куда",
  amountCp: "Зачисление",
  preview: "Проверка",
};

export const DEBT_DIRECTION_OPTIONS: { value: DebtDirection; label: string }[] = [
  { value: "I_PAID", label: "Вы дали в долг / заплатили по долгу" },
  { value: "I_PAID_FOR_SOMEONE", label: "Вы заплатили за кого-то" },
  { value: "THEY_PAID", label: "Вам дали в долг / заплатили по долгу" },
  { value: "THEY_PAID_FOR_ME", label: "Кто-то заплатил за вас" },
  { value: "DEBT_OFFSET", label: "Взаимозачёт долгов" },
];

export type SpecialWizardInput = {
  flow: SpecialFlow;
  debtDirection: DebtDirection;
  debtCross: boolean;
  offsetCross: boolean;
  transactionType: TransactionType;
  date: string;
  time: string;
  timezone: string;
  todayKey: string;
  primaryItemId: number | null;
  counterpartyItemId: number | null;
  counterpartyId: number | null;
  debtPayForCounterpartyId: number | null;
  wherePaidCounterpartyId: number | null;
  debtSettlementMode: "existing" | "new";
  debtSettlementItemId: number | null;
  debtSettlementNewName: string;
  loanTotalStr: string;
  loanInterestStr: string;
  amountStr: string;
  amountCounterpartyStr: string;
  debtAmountStr: string;
  debtSplitAmountStr: string;
  categoryId: number | null;
  comment: string;
  primaryIsMoex: boolean;
  counterpartyIsMoex: boolean;
  primaryMinDate: string;
  counterpartyMinDate: string;
  primaryCurrency: string | null;
  counterpartyCurrency: string | null;
  primarySkipsMinDate: boolean;
  counterpartySkipsMinDate: boolean;
};

export function specialWizardSteps(input: Pick<SpecialWizardInput, "flow" | "debtDirection" | "debtCross" | "offsetCross">): string[] {
  if (input.flow === "LOAN_REPAYMENT") {
    return ["type", "date", "payFrom", "liability", "loanTotal", "loanInterest", "category", "comment", "preview"];
  }
  const head = ["type", "debtDirection", "date"];
  const tail = ["comment", "preview"];
  switch (input.debtDirection) {
    case "I_PAID":
      return [...head, "payFrom", "counterparty", "debtMode", "debtPick", "amount", ...(input.debtCross ? ["debtAmount"] : []), ...tail];
    case "THEY_PAID":
      return [...head, "payTo", "counterparty", "debtMode", "debtPick", "amount", ...(input.debtCross ? ["debtAmount"] : []), ...tail];
    case "I_PAID_FOR_SOMEONE":
      return [...head, "payFrom", "wherePay", "payFor", "debtMode", "debtPick", "fullAmount", "debtPart", "category", ...tail];
    case "THEY_PAID_FOR_ME":
      return [...head, "whoPaid", "wherePaid", "debtMode", "debtPick", "amount", "category", ...tail];
    case "DEBT_OFFSET":
      return [...head, "offsetFrom", "offsetTo", "amount", ...(input.offsetCross ? ["amountCp"] : []), ...tail];
    default:
      return [...head, ...tail];
  }
}

function centsOf(raw: string): number | null {
  const parsed = parseRubToCents(normalizeRubOnBlur(raw));
  return parsed != null && Number.isFinite(parsed) ? parsed : null;
}

function dateTooEarly(date: string, minDate: string, skip: boolean): boolean {
  return !skip && !!minDate && date < minDate;
}

function settlementReady(input: SpecialWizardInput): boolean {
  if (input.debtSettlementMode === "existing") return input.debtSettlementItemId != null;
  return input.debtSettlementNewName.trim().length > 0;
}

export function specialStepError(stepId: string, input: SpecialWizardInput): string | null {
  if (stepId === "date" && input.transactionType === "PLANNED" && input.date < input.todayKey) {
    return "Плановая транзакция не может быть создана ранее текущего дня.";
  }
  if (stepId === "payFrom" || stepId === "payTo") {
    if (!input.primaryItemId) return stepId === "payTo" ? "Выберите, куда заплатили." : "Выберите актив.";
    if (dateTooEarly(input.date, input.primaryMinDate, input.primarySkipsMinDate)) {
      return "Дата не может быть раньше даты начала действия выбранного актива.";
    }
    return null;
  }
  if (stepId === "liability") {
    if (!input.counterpartyItemId) return "Выберите обязательство.";
    if (input.primaryIsMoex || input.counterpartyIsMoex) return "Операции погашения не поддерживают MOEX инструменты.";
    if (input.primaryCurrency && input.counterpartyCurrency && input.primaryCurrency !== input.counterpartyCurrency) {
      return "Для погашения кредита выберите актив и обязательство в одной валюте.";
    }
    if (dateTooEarly(input.date, input.counterpartyMinDate, input.counterpartySkipsMinDate)) {
      return "Дата не может быть раньше даты начала действия обязательства.";
    }
    return null;
  }
  if (stepId === "loanTotal") {
    if (!input.loanTotalStr.trim()) return "Укажите общую сумму платежа.";
    const total = centsOf(input.loanTotalStr);
    if (total == null || total <= 0) return "Введите корректную общую сумму платежа.";
    return null;
  }
  if (stepId === "loanInterest") {
    if (!input.loanInterestStr.trim()) return "Укажите сумму в погашение процентов.";
    const interest = centsOf(input.loanInterestStr);
    const total = centsOf(input.loanTotalStr);
    if (interest == null || interest < 0) return "Введите корректную сумму в погашение процентов.";
    if (total != null && interest > total) return "Сумма в погашение процентов не может превышать общую сумму платежа.";
    return null;
  }
  if (stepId === "category" && !input.categoryId) return "Выберите категорию.";
  if (stepId === "counterparty" && !input.counterpartyId) {
    return input.debtDirection === "I_PAID" ? "Выберите, кому платите." : "Выберите, кто платит.";
  }
  if (stepId === "wherePay" && !input.counterpartyId) return "Выберите, где платите.";
  if (stepId === "payFor" && !input.debtPayForCounterpartyId) return "Выберите, за кого платите.";
  if (stepId === "whoPaid" && !input.counterpartyId) return "Выберите, кто платит.";
  if (stepId === "wherePaid") {
    if (!input.wherePaidCounterpartyId) return "Выберите, где платит.";
    if (input.counterpartyId != null && input.counterpartyId === input.wherePaidCounterpartyId) {
      return "Кто платит и где платит должны различаться.";
    }
    return null;
  }
  if (stepId === "debtPick" && !settlementReady(input)) {
    return input.debtSettlementMode === "existing"
      ? "Выберите существующий долг или вернитесь и создайте новый."
      : "Укажите название нового долга.";
  }
  if (stepId === "amount" || stepId === "fullAmount") {
    const cents = centsOf(input.amountStr);
    if (cents == null || cents <= 0) return "Введите сумму больше нуля.";
    return null;
  }
  if (stepId === "debtPart") {
    const full = centsOf(input.amountStr);
    const part = centsOf(input.debtSplitAmountStr);
    if (part == null || part < 0) return "Введите часть суммы в долг (0 или больше).";
    if (full != null && part > full) return "Часть в долг не может быть больше полной суммы.";
    return null;
  }
  if (stepId === "debtAmount") {
    const cents = centsOf(input.debtAmountStr);
    if (cents == null || cents <= 0) return "Введите изменение суммы долга в валюте долга.";
    return null;
  }
  if (stepId === "offsetFrom" && !input.primaryItemId) return "Выберите долг, с которого зачитываете.";
  if (stepId === "offsetTo") {
    if (!input.counterpartyItemId) return "Выберите долг, на который зачитываете.";
    if (input.primaryItemId != null && input.primaryItemId === input.counterpartyItemId) return "Выберите другой долг.";
    return null;
  }
  if (stepId === "amountCp") {
    const cents = centsOf(input.amountCounterpartyStr);
    if (cents == null || cents <= 0) return "Введите сумму зачисления.";
    return null;
  }
  return null;
}

function txDate(date: string, time: string): string {
  const t = /^\d{1,2}:\d{2}$/.test(time) ? time : "00:00";
  return `${date}T${t}:00`;
}

export async function submitSpecialWizard(input: SpecialWizardInput): Promise<void> {
  const steps = specialWizardSteps(input);
  for (const stepId of steps) {
    if (stepId === "preview" || stepId === "comment" || stepId === "type" || stepId === "debtMode") continue;
    const error = specialStepError(stepId, input);
    if (error) throw new Error(error);
  }
  const transactionDate = txDate(input.date, input.time);
  const comment = input.comment.trim() || null;

  if (input.flow === "LOAN_REPAYMENT") {
    const total = centsOf(input.loanTotalStr) ?? 0;
    const interest = centsOf(input.loanInterestStr) ?? 0;
    const principal = total - interest;
    const base = {
      transaction_date: transactionDate,
      timezone: input.timezone,
      primary_item_id: input.primaryItemId!,
      counterparty_id: null,
      transaction_type: input.transactionType,
      comment,
    };
    const parent = await createTransaction({
      ...base,
      counterparty_item_id: null,
      amount: total,
      amount_counterparty: null,
      direction: "EXPENSE",
      category_id: input.categoryId,
      is_split_parent: true,
    });
    await Promise.all([
      createTransaction({
        ...base,
        counterparty_item_id: null,
        amount: interest,
        amount_counterparty: null,
        direction: "EXPENSE",
        category_id: input.categoryId,
        related_item_id: input.counterpartyItemId,
        asset_link_type: "ASSET_EXPENSE",
        parent_transaction_id: parent.id,
      }),
      createTransaction({
        ...base,
        counterparty_item_id: input.counterpartyItemId,
        amount: principal,
        amount_counterparty: null,
        direction: "TRANSFER",
        category_id: null,
        parent_transaction_id: parent.id,
      }),
    ]);
    return;
  }

  if (input.debtDirection === "THEY_PAID_FOR_ME") {
    const amount = centsOf(input.amountStr) ?? 0;
    await createTheyPaidForMeTransaction({
      who_paid_counterparty_id: input.counterpartyId!,
      where_paid_counterparty_id: input.wherePaidCounterpartyId!,
      amount,
      transaction_date: transactionDate,
      timezone: input.timezone,
      category_id: input.categoryId,
      comment,
      ...(input.debtSettlementMode === "existing" && input.debtSettlementItemId != null
        ? { counterparty_settlements_item_id: input.debtSettlementItemId }
        : { new_settlement_name: input.debtSettlementNewName.trim() }),
    });
    return;
  }

  if (input.debtDirection === "I_PAID_FOR_SOMEONE") {
    const full = centsOf(input.amountStr) ?? 0;
    const part = centsOf(input.debtSplitAmountStr) ?? 0;
    const expense = full - part;
    const base = {
      transaction_date: transactionDate,
      timezone: input.timezone,
      primary_item_id: input.primaryItemId!,
      counterparty_id: input.counterpartyId,
      transaction_type: input.transactionType,
      comment,
    };
    const settlement =
      input.debtSettlementMode === "existing" && input.debtSettlementItemId != null
        ? { counterparty_settlements_item_id: input.debtSettlementItemId }
        : { new_settlement_name: input.debtSettlementNewName.trim() };
    if (expense > 0 && part > 0) {
      const parent = await createTransaction({
        ...base,
        counterparty_item_id: null,
        amount: full,
        direction: "EXPENSE",
        category_id: input.categoryId,
        is_split_parent: true,
      });
      await Promise.all([
        createTransaction({
          ...base,
          counterparty_item_id: null,
          amount: expense,
          direction: "EXPENSE",
          category_id: input.categoryId,
          parent_transaction_id: parent.id,
        }),
        createDebtsTransaction({
          debt_direction: "I_PAID",
          counterparty_id: input.debtPayForCounterpartyId!,
          transaction_counterparty_id: input.counterpartyId,
          primary_item_id: input.primaryItemId!,
          transaction_date: transactionDate,
          timezone: input.timezone,
          amount: part,
          transaction_type: input.transactionType,
          comment,
          parent_transaction_id: parent.id,
          ...settlement,
        }),
      ]);
      return;
    }
    if (expense > 0) {
      await createTransaction({
        ...base,
        counterparty_item_id: null,
        amount: expense,
        direction: "EXPENSE",
        category_id: input.categoryId,
      });
    }
    if (part > 0) {
      await createDebtsTransaction({
        debt_direction: "I_PAID",
        counterparty_id: input.debtPayForCounterpartyId!,
        transaction_counterparty_id: input.counterpartyId,
        primary_item_id: input.primaryItemId!,
        transaction_date: transactionDate,
        timezone: input.timezone,
        amount: part,
        transaction_type: input.transactionType,
        comment,
        ...settlement,
      });
    }
    return;
  }

  if (input.debtDirection === "DEBT_OFFSET") {
    const amount = centsOf(input.amountStr) ?? 0;
    const counterAmount = input.offsetCross ? centsOf(input.amountCounterpartyStr) : null;
    await createTransaction({
      transaction_date: transactionDate,
      timezone: input.timezone,
      primary_item_id: input.primaryItemId!,
      counterparty_item_id: input.counterpartyItemId,
      counterparty_id: null,
      amount,
      amount_counterparty: counterAmount,
      direction: "TRANSFER",
      transaction_type: input.transactionType,
      category_id: null,
      comment,
    });
    return;
  }

  const amount = centsOf(input.amountStr) ?? 0;
  const debtCounter = input.debtCross ? centsOf(input.debtAmountStr) : null;
  await createDebtsTransaction({
    debt_direction: input.debtDirection === "THEY_PAID" ? "THEY_PAID" : "I_PAID",
    counterparty_id: input.counterpartyId!,
    primary_item_id: input.primaryItemId!,
    transaction_date: transactionDate,
    timezone: input.timezone,
    amount,
    amount_counterparty: debtCounter,
    transaction_type: input.transactionType,
    comment,
    ...(input.debtSettlementMode === "existing" && input.debtSettlementItemId != null
      ? { counterparty_settlements_item_id: input.debtSettlementItemId }
      : { new_settlement_name: input.debtSettlementNewName.trim() }),
  });
}
