"use client";

import type { ReactNode } from "react";
import { Banknote, Calendar, Coins, Tag, User, Wallet } from "lucide-react";
import { AssetCard } from "@/components/asset-card";
import { AssetItemIcon } from "@/components/asset-item-icon";
import { CategoryIconImage } from "@/components/category-icon-image";
import { CounterpartyIconImage } from "@/components/counterparty-icon-image";
import { MobileSearchSelectOverlay } from "@/components/mobile-search-select-overlay";
import { MobileTapScale } from "@/components/mobile-tap-scale";
import { TimezoneSelector } from "@/components/timezone-selector";
import { DateInput } from "@/components/ui/date-input";
import { FormField, TextField } from "@/components/ui/form-field";
import { SegmentedSelector } from "@/components/ui/segmented-selector";
import { TimeInput } from "@/components/ui/time-input";
import { Table, TableBody } from "@/components/ui/table";
import { AuthInput } from "@/components/ui/auth-input";
import { ACTIVE_TEXT_DARK, MODAL_BG, PLACEHOLDER_COLOR_DARK, RED } from "@/lib/colors";
import { formatAmount } from "@/lib/item-utils";
import { formatRubInput, normalizeRubOnBlur, parseRubToCents } from "@/lib/format-rub";
import { getPrimaryValueLabel } from "@/lib/asset-item-form-constants";
import { DEBT_DIRECTION_OPTIONS, type SpecialFlow } from "@/lib/special-transaction-wizard";
import { API_BASE, type CounterpartyOut, type DebtDirection, type ItemOut, type TransactionOut } from "@/lib/api";
import type { CategoryLookup } from "@/lib/categories";
import { cn } from "@/lib/utils";

const QUESTION = "text-[22px] font-medium leading-snug mb-6 flex items-center gap-2";

type CategoryOption = { id: number; path: [string, string, string]; label: string };

export type SpecialStepProps = {
  stepId: string;
  animClass: string;
  error: string | null;
  flow: SpecialFlow;
  debtDirection: DebtDirection;
  onDebtDirection: (value: DebtDirection) => void;
  transactionType: TransactionOut["transaction_type"];
  onTransactionType: (value: TransactionOut["transaction_type"]) => void;
  date: string;
  time: string;
  timezone: string;
  onDate: (value: string) => void;
  onTime: (value: string) => void;
  onTimezone: (value: string) => void;
  items: ItemOut[];
  itemsById: Map<number, ItemOut>;
  assetItems: ItemOut[];
  liabilityItems: ItemOut[];
  settlementAssetItems: ItemOut[];
  settlementLiabilityItems: ItemOut[];
  settlementItems: ItemOut[];
  primaryItemId: number | null;
  counterpartyItemId: number | null;
  onPrimaryItem: (id: number) => void;
  onCounterpartyItem: (id: number) => void;
  counterparties: CounterpartyOut[];
  counterpartyId: number | null;
  debtPayForCounterpartyId: number | null;
  wherePaidCounterpartyId: number | null;
  onCounterparty: (id: number) => void;
  onPayFor: (id: number) => void;
  onWherePaid: (id: number) => void;
  counterpartyName: (cp: CounterpartyOut) => string;
  debtSettlementMode: "existing" | "new";
  onDebtSettlementMode: (value: "existing" | "new") => void;
  debtSettlementItemId: number | null;
  onDebtSettlementItem: (id: number) => void;
  debtSettlementNewName: string;
  onDebtSettlementNewName: (value: string) => void;
  loanTotalStr: string;
  loanInterestStr: string;
  onLoanTotal: (value: string) => void;
  onLoanInterest: (value: string) => void;
  amountStr: string;
  amountCounterpartyStr: string;
  debtAmountStr: string;
  debtSplitAmountStr: string;
  onAmount: (value: string) => void;
  onAmountCounterparty: (value: string) => void;
  onDebtAmount: (value: string) => void;
  onDebtSplit: (value: string) => void;
  primaryCurrency: string | null;
  counterpartyCurrency: string | null;
  debtCurrency: string | null;
  categoryOptions: CategoryOption[];
  categoryLookup: CategoryLookup;
  selectedCategory: CategoryOption | null;
  onCategory: (path: [string, string, string]) => void;
  comment: string;
  onComment: (value: string) => void;
  accountingStartDate: string | null;
  getItemDisplayBalanceCents: (item: ItemOut) => number;
  getItemCounterparty: (id: number | null | undefined) => CounterpartyOut | null;
  counterpartiesById: Map<number, CounterpartyOut>;
};

function StepError({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div
      className="text-base rounded-md border p-2 mt-4"
      style={{ color: "#FB4C4F", backgroundColor: "rgba(251, 76, 79, 0.08)", borderColor: "rgba(251, 76, 79, 0.3)" }}
    >
      {error}
    </div>
  );
}

function Question({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <p className={QUESTION} style={{ color: ACTIVE_TEXT_DARK }}>
      {icon}
      {children}
    </p>
  );
}

export function MobileSpecialTransactionStep(props: SpecialStepProps) {
  const { stepId, animClass, error } = props;

  const renderItemOption = (item: ItemOut) => (
    <div className="rounded-lg overflow-hidden border-0 outline-none shadow-lg p-4" style={{ backgroundColor: MODAL_BG }}>
      <Table className="table-fixed w-full border-separate border-spacing-0 [&_tr]:border-b-0">
        <TableBody className="[&_tr]:bg-transparent [&_tr:hover]:bg-transparent">
          <AssetCard
            item={item}
            layout="tableRow"
            accountingStartDate={props.accountingStartDate}
            getItemDisplayBalanceCents={props.getItemDisplayBalanceCents}
            counterparty={props.getItemCounterparty(item.id)}
            counterpartiesById={props.counterpartiesById}
            showRubEquivalent={false}
            primaryValueLabel={getPrimaryValueLabel(item.primary_value_kind)}
          />
        </TableBody>
      </Table>
    </div>
  );

  const itemPicker = (valueId: number | null, options: ItemOut[], onSelect: (id: number) => void, placeholder: string, emptyMessage: string) => (
    <MobileTapScale className="block w-full">
      <MobileSearchSelectOverlay
        value={valueId != null ? props.itemsById.get(valueId) ?? null : null}
        options={options}
        getOptionLabel={(item) => item.name}
        getOptionKey={(item) => item.id}
        onSelect={(item) => onSelect(item.id)}
        placeholder={placeholder}
        searchPlaceholder="Поиск"
        emptyMessage={emptyMessage}
        renderTriggerContent={(item) => (
          <>
            <AssetItemIcon item={item} counterparty={props.getItemCounterparty(item.id)} apiBase={API_BASE} size={20} />
            <span className="truncate">{item.name}</span>
          </>
        )}
        renderOption={renderItemOption}
      />
    </MobileTapScale>
  );

  const personPicker = (
    valueId: number | null,
    onSelect: (id: number) => void,
    placeholder: string,
  ) => (
    <MobileTapScale className="block w-full">
      <MobileSearchSelectOverlay
        value={valueId != null ? props.counterparties.find((c) => c.id === valueId) ?? null : null}
        options={props.counterparties}
        getOptionLabel={props.counterpartyName}
        getOptionKey={(c) => c.id}
        onSelect={(c) => onSelect(c.id)}
        placeholder={placeholder}
        searchPlaceholder="Поиск контрагента"
        emptyMessage="Нет контрагентов"
        noResultsMessage="Ничего не найдено"
        renderTriggerContent={(c) => (
          <>
            <CounterpartyIconImage counterparty={c} apiBase={API_BASE} size={20} />
            <span className="truncate">{props.counterpartyName(c)}</span>
          </>
        )}
      />
    </MobileTapScale>
  );

  const amountField = (value: string, onChange: (value: string) => void, currency: string | null, placeholder: string) => (
    <TextField
      label=""
      currencyCode={currency ?? undefined}
      value={value}
      onChange={(e) => onChange(formatRubInput(e.target.value))}
      onBlur={() => onChange(normalizeRubOnBlur(value))}
      inputMode="decimal"
      placeholder={placeholder}
    />
  );

  let body: ReactNode = null;

  if (stepId === "type") {
    body = (
      <>
        <Question>Какую транзакцию хотите добавить?</Question>
        <SegmentedSelector
          options={[
            { value: "ACTUAL", label: "Фактическая", colorScheme: "purple" },
            { value: "PLANNED", label: "Плановая", colorScheme: "orange" },
          ]}
          value={props.transactionType}
          onChange={(v) => props.onTransactionType(v as TransactionOut["transaction_type"])}
        />
      </>
    );
  } else if (stepId === "debtDirection") {
    body = (
      <>
        <Question>Что произошло с долгом?</Question>
        <div className="grid gap-2">
          {DEBT_DIRECTION_OPTIONS.map((option) => {
            const selected = props.debtDirection === option.value;
            return (
              <button
                key={option.value}
                type="button"
                className="w-full rounded-lg px-4 py-3 text-left text-base min-h-12 active:opacity-80"
                style={{
                  color: ACTIVE_TEXT_DARK,
                  backgroundColor: selected ? "rgba(127, 92, 255, 0.45)" : MODAL_BG,
                }}
                onClick={() => props.onDebtDirection(option.value)}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </>
    );
  } else if (stepId === "date") {
    body = (
      <>
        <Question icon={<Calendar className="h-5 w-5 shrink-0" strokeWidth={1.5} />}>Выберите дату и время</Question>
        <div className="flex items-center gap-2 flex-wrap">
          <DateInput value={props.date} onChange={props.onDate} />
          <TimeInput value={props.time} onChange={props.onTime} />
        </div>
        <div className="mt-4">
          <FormField label="Часовой пояс">
            <TimezoneSelector value={props.timezone} onChange={props.onTimezone} />
          </FormField>
        </div>
      </>
    );
  } else if (stepId === "payFrom") {
    body = (
      <>
        <Question icon={<Wallet className="h-5 w-5 shrink-0" strokeWidth={1.5} />}>
          {props.flow === "LOAN_REPAYMENT" ? "С какого актива платите?" : "Откуда заплатили?"}
        </Question>
        {itemPicker(props.primaryItemId, props.flow === "LOAN_REPAYMENT" ? props.assetItems : props.items, props.onPrimaryItem, "Выберите", "Нет активов")}
      </>
    );
  } else if (stepId === "payTo") {
    body = (
      <>
        <Question icon={<Wallet className="h-5 w-5 shrink-0" strokeWidth={1.5} />}>Куда заплатили?</Question>
        {itemPicker(props.primaryItemId, props.items, props.onPrimaryItem, "Выберите", "Нет активов")}
      </>
    );
  } else if (stepId === "liability") {
    body = (
      <>
        <Question icon={<Wallet className="h-5 w-5 shrink-0" strokeWidth={1.5} />}>Какое обязательство гасите?</Question>
        {itemPicker(
          props.counterpartyItemId,
          props.liabilityItems.filter((it) => it.id !== props.primaryItemId),
          props.onCounterpartyItem,
          "Обязательство",
          "Нет обязательств",
        )}
      </>
    );
  } else if (stepId === "loanTotal") {
    body = (
      <>
        <Question icon={<Banknote className="h-5 w-5 shrink-0" strokeWidth={1.5} />}>Общая сумма платежа</Question>
        {amountField(props.loanTotalStr, props.onLoanTotal, props.primaryCurrency, "Сумма")}
      </>
    );
  } else if (stepId === "loanInterest") {
    const total = parseRubToCents(normalizeRubOnBlur(props.loanTotalStr));
    const interest = parseRubToCents(normalizeRubOnBlur(props.loanInterestStr));
    const principal = total != null && interest != null && Number.isFinite(total) && Number.isFinite(interest) ? total - interest : null;
    body = (
      <>
        <Question icon={<Banknote className="h-5 w-5 shrink-0" strokeWidth={1.5} />}>Сколько уходит в проценты?</Question>
        {amountField(props.loanInterestStr, props.onLoanInterest, props.primaryCurrency, "Проценты")}
        <p className="text-sm mt-3" style={{ color: principal != null && principal < 0 ? RED : PLACEHOLDER_COLOR_DARK }}>
          В основной долг: {principal == null ? "—" : formatAmount(principal)}
          {props.primaryCurrency ? ` ${props.primaryCurrency}` : ""}
        </p>
      </>
    );
  } else if (stepId === "category") {
    body = (
      <>
        <Question icon={<Tag className="h-5 w-5 shrink-0" strokeWidth={1.5} />}>Какая категория?</Question>
        <MobileTapScale className="block w-full">
          <MobileSearchSelectOverlay
            value={props.selectedCategory}
            options={props.categoryOptions}
            getOptionLabel={(opt) => opt.label}
            getOptionKey={(opt) => opt.id}
            onSelect={(opt) => props.onCategory(opt.path)}
            placeholder="Категория"
            searchPlaceholder="Поиск категории"
            emptyMessage="Нет категорий"
            noResultsMessage="Ничего не найдено"
            renderTriggerContent={(opt) => (
              <>
                <CategoryIconImage categoryId={opt.id} categoryLookup={props.categoryLookup} apiBase={API_BASE} size={20} fallbackIconColor={ACTIVE_TEXT_DARK} />
                <span className="break-words">{opt.path[2] || opt.path[1] || opt.path[0] || "—"}</span>
              </>
            )}
          />
        </MobileTapScale>
      </>
    );
  } else if (stepId === "counterparty" || stepId === "wherePay" || stepId === "whoPaid") {
    const title = stepId === "wherePay" ? "Где платите?" : stepId === "whoPaid" || props.debtDirection === "THEY_PAID" ? "Кто платит?" : "Кому платите?";
    body = (
      <>
        <Question icon={<User className="h-5 w-5 shrink-0" strokeWidth={1.5} />}>{title}</Question>
        {personPicker(props.counterpartyId, props.onCounterparty, "Контрагент")}
      </>
    );
  } else if (stepId === "payFor") {
    body = (
      <>
        <Question icon={<User className="h-5 w-5 shrink-0" strokeWidth={1.5} />}>За кого платите?</Question>
        {personPicker(props.debtPayForCounterpartyId, props.onPayFor, "Контрагент")}
      </>
    );
  } else if (stepId === "wherePaid") {
    body = (
      <>
        <Question icon={<User className="h-5 w-5 shrink-0" strokeWidth={1.5} />}>Где платит?</Question>
        {personPicker(props.wherePaidCounterpartyId, props.onWherePaid, "Контрагент")}
      </>
    );
  } else if (stepId === "debtMode") {
    body = (
      <>
        <Question icon={<Coins className="h-5 w-5 shrink-0" strokeWidth={1.5} />}>Это новый долг?</Question>
        <SegmentedSelector
          options={[
            { value: "existing", label: "Существующий", colorScheme: "purple" },
            { value: "new", label: "Новый", colorScheme: "green" },
          ]}
          value={props.debtSettlementMode}
          onChange={(v) => props.onDebtSettlementMode(v as "existing" | "new")}
        />
      </>
    );
  } else if (stepId === "debtPick") {
    body = props.debtSettlementMode === "new" ? (
      <>
        <Question>Как назвать долг?</Question>
        <TextField label="" value={props.debtSettlementNewName} onChange={(e) => props.onDebtSettlementNewName(e.target.value)} placeholder="Например: Займ на ремонт" />
      </>
    ) : (
      <>
        <Question icon={<Coins className="h-5 w-5 shrink-0" strokeWidth={1.5} />}>Какой долг?</Question>
        {itemPicker(props.debtSettlementItemId, props.settlementItems, props.onDebtSettlementItem, "Выберите долг", "Нет долгов с этим контрагентом")}
      </>
    );
  } else if (stepId === "amount" || stepId === "fullAmount") {
    body = (
      <>
        <Question icon={<Banknote className="h-5 w-5 shrink-0" strokeWidth={1.5} />}>
          {stepId === "fullAmount" ? "Полная сумма" : "Какая сумма?"}
        </Question>
        {amountField(props.amountStr, props.onAmount, props.primaryCurrency, "Сумма")}
      </>
    );
  } else if (stepId === "debtPart") {
    body = (
      <>
        <Question icon={<Banknote className="h-5 w-5 shrink-0" strokeWidth={1.5} />}>Какая часть уходит в долг?</Question>
        {amountField(props.debtSplitAmountStr, props.onDebtSplit, props.primaryCurrency, "Часть в долг")}
      </>
    );
  } else if (stepId === "debtAmount") {
    body = (
      <>
        <Question icon={<Banknote className="h-5 w-5 shrink-0" strokeWidth={1.5} />}>На сколько меняется долг?</Question>
        {amountField(props.debtAmountStr, props.onDebtAmount, props.debtCurrency, "Сумма долга")}
      </>
    );
  } else if (stepId === "offsetFrom") {
    body = (
      <>
        <Question icon={<Wallet className="h-5 w-5 shrink-0" strokeWidth={1.5} />}>С какого долга зачитываете?</Question>
        {itemPicker(props.primaryItemId, props.settlementAssetItems, props.onPrimaryItem, "Откуда", "Нет долгов, где вам должны")}
      </>
    );
  } else if (stepId === "offsetTo") {
    body = (
      <>
        <Question icon={<Wallet className="h-5 w-5 shrink-0" strokeWidth={1.5} />}>На какой долг зачитываете?</Question>
        {itemPicker(
          props.counterpartyItemId,
          props.settlementLiabilityItems.filter((it) => it.id !== props.primaryItemId),
          props.onCounterpartyItem,
          "Куда",
          "Нет долгов, где должны вы",
        )}
      </>
    );
  } else if (stepId === "amountCp") {
    body = (
      <>
        <Question icon={<Banknote className="h-5 w-5 shrink-0" strokeWidth={1.5} />}>Сумма зачисления</Question>
        {amountField(props.amountCounterpartyStr, props.onAmountCounterparty, props.counterpartyCurrency, "Сумма")}
      </>
    );
  } else if (stepId === "comment") {
    body = (
      <>
        <Question>Комментарий</Question>
        <p className="text-sm -mt-4 mb-6" style={{ color: PLACEHOLDER_COLOR_DARK }}>Можно пропустить</p>
        <AuthInput value={props.comment} onChange={(e) => props.onComment(e.target.value)} placeholder="Комментарий" className="w-full text-base" />
      </>
    );
  } else if (stepId === "preview") {
    body = <Preview {...props} />;
  }

  return (
    <div className={animClass}>
      {body}
      <StepError error={error} />
    </div>
  );
}

function money(cents: number | null, currency: string | null) {
  if (cents == null || !Number.isFinite(cents)) return "—";
  return `${formatAmount(cents)}${currency ? ` ${currency}` : ""}`;
}

function Preview(props: SpecialStepProps) {
  const nameOf = (id: number | null) => (id != null ? props.itemsById.get(id)?.name ?? "—" : "—");
  const person = (id: number | null) => {
    const cp = id != null ? props.counterparties.find((c) => c.id === id) : null;
    return cp ? props.counterpartyName(cp) : "—";
  };
  const rows: { label: string; value: string }[] = [];
  const dateLabel = props.date.split("-").reverse().join(".");
  rows.push({ label: "Дата", value: props.time && props.time !== "00:00" ? `${dateLabel}, ${props.time}` : dateLabel });
  rows.push({ label: "Тип", value: props.transactionType === "PLANNED" ? "Плановая" : "Фактическая" });

  let title = "Проверьте транзакцию";
  let amountLabel = "";
  let amountColor: string = ACTIVE_TEXT_DARK;

  if (props.flow === "LOAN_REPAYMENT") {
    title = "Проверьте погашение";
    const total = parseRubToCents(normalizeRubOnBlur(props.loanTotalStr));
    const interest = parseRubToCents(normalizeRubOnBlur(props.loanInterestStr));
    const principal = total != null && interest != null ? total - interest : null;
    amountLabel = money(total, props.primaryCurrency);
    amountColor = RED;
    rows.push({ label: "Откуда", value: nameOf(props.primaryItemId) });
    rows.push({ label: "Обязательство", value: nameOf(props.counterpartyItemId) });
    rows.push({ label: "Проценты", value: money(interest, props.primaryCurrency) });
    rows.push({ label: "Основной долг", value: money(principal, props.primaryCurrency) });
    if (props.selectedCategory) rows.push({ label: "Категория", value: props.selectedCategory.path.filter(Boolean).slice(-1)[0] || "—" });
  } else if (props.debtDirection === "DEBT_OFFSET") {
    title = "Проверьте взаимозачёт";
    amountLabel = money(parseRubToCents(normalizeRubOnBlur(props.amountStr)), props.primaryCurrency);
    rows.push({ label: "Откуда", value: nameOf(props.primaryItemId) });
    rows.push({ label: "Куда", value: nameOf(props.counterpartyItemId) });
    if (props.amountCounterpartyStr.trim()) {
      rows.push({ label: "Зачисление", value: money(parseRubToCents(normalizeRubOnBlur(props.amountCounterpartyStr)), props.counterpartyCurrency) });
    }
  } else if (props.debtDirection === "I_PAID_FOR_SOMEONE") {
    title = "Проверьте платёж";
    amountLabel = money(parseRubToCents(normalizeRubOnBlur(props.amountStr)), props.primaryCurrency);
    amountColor = RED;
    rows.push({ label: "Откуда", value: nameOf(props.primaryItemId) });
    rows.push({ label: "Где", value: person(props.counterpartyId) });
    rows.push({ label: "За кого", value: person(props.debtPayForCounterpartyId) });
    rows.push({ label: "В долг", value: money(parseRubToCents(normalizeRubOnBlur(props.debtSplitAmountStr)), props.primaryCurrency) });
  } else if (props.debtDirection === "THEY_PAID_FOR_ME") {
    title = "Проверьте платёж";
    amountLabel = money(parseRubToCents(normalizeRubOnBlur(props.amountStr)), null);
    rows.push({ label: "Кто платит", value: person(props.counterpartyId) });
    rows.push({ label: "Где платит", value: person(props.wherePaidCounterpartyId) });
  } else {
    title = props.debtDirection === "THEY_PAID" ? "Проверьте поступление" : "Проверьте платёж";
    amountLabel = money(parseRubToCents(normalizeRubOnBlur(props.amountStr)), props.primaryCurrency);
    amountColor = props.debtDirection === "THEY_PAID" ? "#34D399" : RED;
    rows.push({ label: props.debtDirection === "THEY_PAID" ? "Куда" : "Откуда", value: nameOf(props.primaryItemId) });
    rows.push({ label: "Контрагент", value: person(props.counterpartyId) });
    if (props.debtAmountStr.trim()) {
      rows.push({ label: "Изменение долга", value: money(parseRubToCents(normalizeRubOnBlur(props.debtAmountStr)), props.debtCurrency) });
    }
  }
  if (props.debtDirection !== "DEBT_OFFSET" && props.flow === "DEBTS") {
    rows.push({
      label: "Долг",
      value: props.debtSettlementMode === "new"
        ? props.debtSettlementNewName.trim() || "Новый"
        : nameOf(props.debtSettlementItemId),
    });
  }
  if (props.comment.trim()) rows.push({ label: "Комментарий", value: props.comment.trim() });

  return (
    <>
      <p className="text-[22px] font-medium leading-snug mb-2" style={{ color: "rgba(255,255,255,0.95)" }}>{title}</p>
      <p className="text-sm mb-6" style={{ color: PLACEHOLDER_COLOR_DARK }}>Так операция будет сохранена</p>
      <div className="rounded-lg overflow-hidden flex items-stretch" style={{ backgroundColor: MODAL_BG }}>
        <div className="shrink-0" style={{ width: 6, backgroundColor: amountColor }} />
        <div className="flex-1 px-3 py-3 text-[20px] font-medium tabular-nums" style={{ color: amountColor }}>{amountLabel}</div>
      </div>
      <dl className={cn("grid gap-3 mt-5")}>
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-4">
            <dt className="text-sm shrink-0" style={{ color: PLACEHOLDER_COLOR_DARK }}>{row.label}</dt>
            <dd className="text-sm text-right min-w-0" style={{ color: ACTIVE_TEXT_DARK }}>{row.value}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}
