"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type FormEvent,
} from "react";
import { useSession } from "next-auth/react";
import {
  ArrowRight,
  Ban,
  BadgeCheck,
  ChevronDown,
  CheckCircle2,
  CircleDashed,
  MoreVertical,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import * as XLSX from "xlsx";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  createTransaction,
  deleteTransaction,
  fetchBanks,
  fetchFxRates,
  fetchDeletedTransactions,
  fetchItems,
  fetchTransactions,
  BankOut,
  FxRateOut,
  ItemOut,
  TransactionCreate,
  TransactionOut,
  updateTransaction,
  updateTransactionStatus,
} from "@/lib/api";
import {
  buildCategoryMaps,
  CategoryNode,
  DEFAULT_CATEGORIES,
  readStoredCategories,
} from "@/lib/categories";
import {
  CATEGORY_ICON_BY_L1,
  CATEGORY_ICON_BY_NAME,
  CATEGORY_ICON_FALLBACK,
} from "@/lib/category-icons";

type TransactionsViewMode = "actual" | "planning";

type TransactionCard = TransactionOut & { isDeleted?: boolean };

type TransactionFormMode = "STANDARD" | "LOAN_REPAYMENT";

type BulkEditBaseline = {
  date: string;
  direction: TransactionOut["direction"];
  primaryItemId: number | null;
  counterpartyItemId: number | null;
  amountStr: string;
  amountCounterpartyStr: string;
  cat1: string;
  cat2: string;
  cat3: string;
  description: string;
  comment: string;
};

type CategoryPathOption = {
  l1: string;
  l2: string;
  l3: string;
  label: string;
  searchKey: string;
};

function formatAmount(valueInCents: number) {
  const hasCents = Math.abs(valueInCents) % 100 !== 0;
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(valueInCents / 100);
}

function formatRub(valueInCents: number) {
  const formatted = new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valueInCents / 100);
  return `${formatted} RUB`;
}

function formatRate(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(value);
}

function getDateKey(value: string) {
  return value ? value.slice(0, 10) : "";
}

function formatDate(value: string) {
  const dateKey = getDateKey(value);
  const parts = dateKey ? dateKey.split("-") : [];
  if (parts.length === 3) {
    const [year, month, day] = parts;
    if (year && month && day) {
      const dd = day.padStart(2, "0");
      const mm = month.padStart(2, "0");
      const yy = year.slice(-2);
      return `${dd}.${mm}.${yy}`;
    }
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

function toCbrDate(value: string) {
  const parts = value.split("-");
  if (parts.length === 3) {
    const [year, month, day] = parts;
    if (year && month && day) return `${day}/${month}/${year}`;
  }
  return value;
}

function formatTime(value: string) {
  const hasTime = /[T\s]\d{1,2}:\d{2}/.test(value);
  if (!hasTime) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  if (date.getHours() === 0 && date.getMinutes() === 0 && date.getSeconds() === 0) {
    return "";
  }
  return date.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

const IMPORT_HEADERS = [
  "Дата операции",
  "Сумма платежа",
  "Категория",
  "Описание",
];

function normalizeHeader(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("ru");
}

function normalizeCategory(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("ru");
}

const CATEGORY_PLACEHOLDER = "-";
const CATEGORY_PATH_SEPARATOR = " / ";

function formatCategoryPath(l1: string, l2: string, l3: string) {
  const parts = [l1, l2, l3]
    .map((value) => value?.trim())
    .filter((value) => value && value !== CATEGORY_PLACEHOLDER);
  return parts.join(CATEGORY_PATH_SEPARATOR);
}

function makeCategoryPathKey(l1?: string, l2?: string, l3?: string) {
  return [l1, l2, l3].map((value) => value?.trim() ?? "").join("||");
}

function parseDateFromString(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const isoMatch =
    /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(
      trimmed
    );
  if (isoMatch) {
    const [, y, m, d, hh = "0", mm = "0", ss = "0"] = isoMatch;
    return new Date(
      Number(y),
      Number(m) - 1,
      Number(d),
      Number(hh),
      Number(mm),
      Number(ss)
    );
  }

  const ruMatch =
    /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})(?:[,\sT]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(
      trimmed
    );
  if (ruMatch) {
    const [, d, m, y, hh = "0", mm = "0", ss = "0"] = ruMatch;
    const year = y.length === 2 ? Number(`20${y}`) : Number(y);
    return new Date(
      year,
      Number(m) - 1,
      Number(d),
      Number(hh),
      Number(mm),
      Number(ss)
    );
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) return parsed;

  return null;
}

function parseExcelDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return new Date(
      parsed.y,
      parsed.m - 1,
      parsed.d,
      parsed.H,
      parsed.M,
      parsed.S
    );
  }
  if (typeof value === "string") {
    return parseDateFromString(value);
  }
  return null;
}

function formatDateForApi(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateTimeForApi(date: Date) {
  const dateKey = formatDateForApi(date);
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = date.getSeconds();
  if (hours === 0 && minutes === 0 && seconds === 0) return dateKey;
  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return `${dateKey}T${hh}:${mm}:${ss}`;
}

function mergeDateWithTime(dateValue: string, existingDate?: string | null) {
  if (!existingDate) return dateValue;
  const match = /[T\s](\d{1,2}:\d{2}(?::\d{2})?)/.exec(existingDate);
  if (!match) return dateValue;
  return `${dateValue}T${match[1]}`;
}

function parseAmountCell(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const cleaned = value
      .trim()
      .replace(/\s/g, "")
      .replace(",", ".")
      .replace(/[^\d.-]/g, "");
    if (!cleaned) return null;
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : null;
  }
  return null;
}

function levenshteinDistance(a: string, b: string) {
  if (a === b) return 0;
  const aLen = a.length;
  const bLen = b.length;
  if (aLen === 0) return bLen;
  if (bLen === 0) return aLen;

  const dp = Array.from({ length: aLen + 1 }, () => new Array(bLen + 1).fill(0));
  for (let i = 0; i <= aLen; i += 1) dp[i][0] = i;
  for (let j = 0; j <= bLen; j += 1) dp[0][j] = j;

  for (let i = 1; i <= aLen; i += 1) {
    for (let j = 1; j <= bLen; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[aLen][bLen];
}

function findClosestCategory(input: string, options: string[]) {
  const normalizedInput = normalizeCategory(input);
  if (!normalizedInput || options.length === 0) return null;

  let best: string | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  options.forEach((option) => {
    const normalizedOption = normalizeCategory(option);
    if (!normalizedOption) return;
    let score = 0;
    if (
      normalizedInput === normalizedOption ||
      normalizedInput.includes(normalizedOption) ||
      normalizedOption.includes(normalizedInput)
    ) {
      score = Math.abs(normalizedInput.length - normalizedOption.length);
    } else {
      score = levenshteinDistance(normalizedInput, normalizedOption);
    }
    if (score < bestScore) {
      bestScore = score;
      best = option;
    }
  });

  return best;
}

function parseAmountFilter(value: string) {
  const cleaned = value.trim().replace(/\s/g, "").replace(",", ".");
  if (!cleaned) return null;
  const num = Number(cleaned);
  if (!Number.isFinite(num)) return null;
  return Math.round(num * 100);
}

function parseRubToCents(input: string): number {
  const normalized = input.trim().replace(/\s/g, "").replace(",", ".");
  const value = Number(normalized);
  if (!Number.isFinite(value)) return NaN;
  return Math.round(value * 100);
}

function formatRubInput(raw: string): string {
  if (!raw) return "";

  const cleaned = raw.replace(/[^\d.,]/g, "");
  const endsWithSep = /[.,]$/.test(cleaned);
  const sepIndex = cleaned.search(/[.,]/);

  let intPart = "";
  let decPart = "";

  if (sepIndex === -1) {
    intPart = cleaned;
  } else {
    intPart = cleaned.slice(0, sepIndex);
    decPart = cleaned.slice(sepIndex + 1).replace(/[.,]/g, "");
  }

  if (sepIndex === 0) intPart = "0";

  intPart = intPart.replace(/^0+(?=\d)/, "");
  if (!intPart) intPart = "0";

  const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const formattedDec = decPart.slice(0, 2);

  if (endsWithSep && formattedDec.length === 0) {
    return `${formattedInt},`;
  }

  return formattedDec.length > 0 ? `${formattedInt},${formattedDec}` : formattedInt;
}

function normalizeRubOnBlur(value: string): string {
  const v = value.trim();
  if (!v) return "";

  if (v.endsWith(",")) return `${v}00`;

  const parts = v.split(",");
  const intPart = parts[0] || "0";
  const decPart = parts[1] ?? "";

  if (decPart.length === 0) return `${intPart},00`;
  if (decPart.length === 1) return `${intPart},${decPart}0`;

  return `${intPart},${decPart.slice(0, 2)}`;
}

function TransactionCardRow({
  tx,
  itemName,
  itemCurrencyCode,
  itemBankLogoUrl,
  itemBankName,
  categoryIconFor,
  getRubEquivalentCents,
  isSelected,
  onToggleSelection,
  onCreateFrom,
  onRealize,
  onEdit,
  onDelete,
  isDeleting,
  onConfirm,
  isConfirming,
}: {
  tx: TransactionCard;
  itemName: (id: number | null | undefined) => string;
  itemCurrencyCode: (id: number | null | undefined) => string;
  itemBankLogoUrl: (id: number | null | undefined) => string | null;
  itemBankName: (id: number | null | undefined) => string;
  categoryIconFor: (
    l1?: string | null,
    l2?: string | null,
    l3?: string | null
  ) => ComponentType<{ className?: string; strokeWidth?: number }>;
  getRubEquivalentCents: (tx: TransactionCard, currencyCode: string) => number | null;
  isSelected: boolean;
  onToggleSelection: (id: number, checked: boolean) => void;
  onCreateFrom: (tx: TransactionCard, trigger?: HTMLElement | null) => void;
  onRealize: (tx: TransactionCard, trigger?: HTMLElement | null) => void;
  onEdit: (tx: TransactionCard, trigger?: HTMLElement | null) => void;
  onDelete: (id: number) => void;
  isDeleting: boolean;
  onConfirm: (tx: TransactionCard) => void;
  isConfirming: boolean;
}) {
  const isTransfer = tx.direction === "TRANSFER";
  const isExpense = tx.direction === "EXPENSE";
  const isIncome = tx.direction === "INCOME";
  const isPlanned = tx.transaction_type === "PLANNED";
  const isConfirmed = tx.status === "CONFIRMED";
  const isRealized = tx.status === "REALIZED";

  const amountValue = formatAmount(tx.amount_rub);
  const counterpartyAmountValue = formatAmount(tx.amount_counterparty ?? tx.amount_rub);
  const currencyCode = itemCurrencyCode(tx.primary_item_id);
  const rubEquivalent = getRubEquivalentCents(tx, currencyCode);
  const showRubEquivalent =
    !isTransfer && currencyCode && currencyCode !== "RUB" && rubEquivalent !== null;
  const primaryCurrency = itemCurrencyCode(tx.primary_item_id);
  const counterpartyCurrency = itemCurrencyCode(tx.counterparty_item_id);
  const primaryBankLogo = itemBankLogoUrl(tx.primary_item_id);
  const primaryBankName = itemBankName(tx.primary_item_id);
  const counterpartyBankLogo = itemBankLogoUrl(tx.counterparty_item_id);
  const counterpartyBankName = itemBankName(tx.counterparty_item_id);
  const primaryAmountCents = tx.amount_rub;
  const counterpartyAmountCents = tx.amount_counterparty ?? tx.amount_rub;
  const isCrossWithRub =
    isTransfer &&
    ((primaryCurrency === "RUB" &&
      counterpartyCurrency &&
      counterpartyCurrency !== "RUB" &&
      counterpartyCurrency !== "-") ||
      (counterpartyCurrency === "RUB" &&
        primaryCurrency &&
        primaryCurrency !== "RUB" &&
        primaryCurrency !== "-"));
  const rubAmountCents =
    primaryCurrency === "RUB" ? primaryAmountCents : counterpartyAmountCents;
  const foreignAmountCents =
    primaryCurrency === "RUB" ? counterpartyAmountCents : primaryAmountCents;
  const foreignCurrency =
    primaryCurrency === "RUB" ? counterpartyCurrency : primaryCurrency;
  const conversionRate =
    isCrossWithRub && foreignAmountCents > 0
      ? rubAmountCents / foreignAmountCents
      : null;
  const timeValue = formatTime(tx.transaction_date);

  const actualTone = isExpense
    ? "bg-[linear-gradient(270deg,_#FEF2F2_0%,_#FCA5A5_100%)]"
    : isIncome
      ? "bg-[linear-gradient(270deg,_#F4F2E9_0%,_#BDDFB2_100%)]"
      : "bg-[linear-gradient(270deg,_#F5F3FF_0%,_#C4B5FD_100%)]";
  const plannedTone = isExpense
    ? "bg-[linear-gradient(270deg,_#FFF7F7_0%,_#FEE2E2_100%)]"
    : isIncome
      ? "bg-[linear-gradient(270deg,_#F9F7F0_0%,_#DDEFD7_100%)]"
      : "bg-[linear-gradient(270deg,_#FBFAFF_0%,_#DDD6FE_100%)]";
  const cardTone = tx.isDeleted
    ? "bg-slate-100"
    : isPlanned
      ? plannedTone
      : actualTone;
  const plannedBorderClass =
    !tx.isDeleted && isPlanned
      ? isExpense
        ? "border-2 border-dashed border-rose-300"
        : isIncome
          ? "border-2 border-dashed border-emerald-500"
          : "border-2 border-dashed border-violet-300"
      : "";

  const textClass = tx.isDeleted ? "text-slate-500" : "text-slate-900";

  const mutedTextClass = tx.isDeleted ? "text-slate-400" : "text-slate-600/80";
  const chainTextClass = tx.isDeleted ? "text-slate-400" : "text-violet-700";

  const amountClass = tx.isDeleted
    ? "text-slate-500"
    : isIncome
      ? "text-emerald-700"
      : isExpense
        ? "text-rose-700"
        : "text-slate-900";
  const transferNegativeClass = tx.isDeleted ? "text-slate-500" : "text-rose-700";
  const transferPositiveClass = tx.isDeleted ? "text-slate-500" : "text-emerald-700";

  const actionTextClass = tx.isDeleted ? "text-slate-400" : "text-slate-700";
  const actionHoverClass = tx.isDeleted ? "" : "hover:text-slate-900";
  const isEditDisabled = tx.isDeleted || isDeleting;
  const isDeleteDisabled = tx.isDeleted || isDeleting;
  const isCreateDisabled = isDeleting;
  const isRealizeDisabled = tx.isDeleted || isDeleting || isRealized;
  const canRealize = isPlanned && !tx.isDeleted && !isRealized;

  const StatusIcon = isRealized ? BadgeCheck : isConfirmed ? CheckCircle2 : CircleDashed;
  const statusBaseClass = tx.isDeleted
    ? "text-slate-400"
    : isRealized
      ? "text-sky-600"
      : isConfirmed
        ? "text-emerald-600"
        : "text-amber-600";
  const statusHoverClass = tx.isDeleted
    ? ""
    : isRealized
      ? "hover:text-sky-700"
      : isConfirmed
        ? "hover:text-emerald-700"
        : "hover:text-amber-700";

  const statusHint = isRealized
    ? "Реализована"
    : isConfirmed
      ? "Подтверждена"
      : "Неподтверждена. Нажмите, чтобы подтвердить";

  const commentText = tx.comment?.trim() ? tx.comment : "-";
  const chainLabel =
    isPlanned && tx.chain_name?.trim() ? tx.chain_name.trim() : null;

  const categoryLines = [
    tx.category_l1?.trim() ? tx.category_l1 : "-",
    tx.category_l2?.trim() ? tx.category_l2 : "-",
    tx.category_l3?.trim() ? tx.category_l3 : "-",
  ];
  const CategoryIcon = categoryIconFor(
    tx.category_l1,
    tx.category_l2,
    tx.category_l3
  );

  const checkboxDisabled = tx.isDeleted || isDeleting;

  return (
    <div
      className={`flex items-stretch overflow-hidden rounded-lg transition-transform duration-200 ease-out hover:-translate-y-1 ${cardTone} ${plannedBorderClass}`}
    >
      <div className="flex flex-1 flex-wrap items-center gap-3 px-3 py-3 lg:grid lg:grid-cols-[auto_4.5rem_8.5rem_6rem_8.5rem_minmax(10rem,1fr)_auto] lg:items-center lg:gap-2">
        <input
          type="checkbox"
          className="h-5 w-5 accent-violet-600"
          checked={isSelected}
          onChange={(e) => onToggleSelection(tx.id, e.target.checked)}
          disabled={checkboxDisabled}
          aria-label={`Выбрать транзакцию ${tx.id}`}
        />

        <div className="w-16 shrink-0">
          <div className={`text-sm font-medium ${mutedTextClass}`}>
            {formatDate(tx.transaction_date)}
          </div>
          {timeValue && (
            <div className={`text-xs ${mutedTextClass}`}>{timeValue}</div>
          )}
        </div>

        {isTransfer ? (
          <>
            <div className="flex h-full w-full min-w-[112px] flex-col self-stretch text-left sm:w-36 lg:w-full">
              <div className="flex flex-1 flex-col items-start justify-end">
                <div className="flex items-baseline gap-1">
                  <div
                    className={`text-xl font-semibold tabular-nums ${transferNegativeClass}`}
                  >
                    -{amountValue}
                  </div>
                  <div className={`text-xs font-semibold ${mutedTextClass}`}>
                    {itemCurrencyCode(tx.primary_item_id)}
                  </div>
                </div>
              </div>
              <div className="flex flex-1 items-start gap-2">
                {primaryBankLogo && (
                  <img
                    src={primaryBankLogo}
                    alt={primaryBankName || ""}
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded bg-white object-contain"
                    loading="lazy"
                  />
                )}
                <div
                  className={`text-sm font-semibold break-words whitespace-normal ${textClass}`}
                >
                  {itemName(tx.primary_item_id)}
                </div>
              </div>
            </div>

            <div className="relative flex w-24 shrink-0 items-center justify-center self-stretch">
              {conversionRate !== null && foreignCurrency && (
                <div
                  className={`absolute left-0 top-1/2 -translate-y-1/2 text-left text-xs font-semibold ${mutedTextClass} z-10`}
                >
                  {formatRate(conversionRate)} RUB/{foreignCurrency}
                </div>
              )}
              <ArrowRight className="pointer-events-none absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 text-white opacity-45" />
            </div>

            <div className="flex h-full w-full min-w-[112px] flex-col self-stretch text-left sm:w-36 lg:w-full">
              <div className="flex flex-1 flex-col items-start justify-end">
                <div className="flex items-baseline gap-1">
                  <div
                    className={`text-xl font-semibold tabular-nums ${transferPositiveClass}`}
                  >
                    +{counterpartyAmountValue}
                  </div>
                  <div className={`text-xs font-semibold ${mutedTextClass}`}>
                    {itemCurrencyCode(tx.counterparty_item_id)}
                  </div>
                </div>
              </div>
              <div className="flex flex-1 items-start gap-2">
                {counterpartyBankLogo && (
                  <img
                    src={counterpartyBankLogo}
                    alt={counterpartyBankName || ""}
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded bg-white object-contain"
                    loading="lazy"
                  />
                )}
                <div
                  className={`text-sm font-semibold break-words whitespace-normal ${textClass}`}
                >
                  {itemName(tx.counterparty_item_id)}
                </div>
              </div>
            </div>

            <div className="min-w-[120px] flex-1">
              <div className="space-y-1">
                {chainLabel && (
                  <div
                    className={`text-xs font-semibold break-words whitespace-normal ${chainTextClass}`}
                  >
                    Цепочка: {chainLabel}
                  </div>
                )}
                <div
                  className={`whitespace-normal break-words text-xs leading-tight ${mutedTextClass}`}
                >
                  {commentText}
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="flex h-full w-full min-w-[112px] flex-col self-stretch text-left sm:w-36 lg:w-full">
              <div className="flex flex-1 flex-col items-start justify-end">
                <div className="flex items-baseline gap-1">
                  <div className={`text-xl font-semibold tabular-nums ${amountClass}`}>
                    {isExpense ? "-" : "+"}
                    {amountValue}
                  </div>
                  <div className={`text-xs font-semibold ${mutedTextClass}`}>
                    {currencyCode}
                  </div>
                </div>
                {showRubEquivalent && (
                  <div className={`text-xs font-semibold ${mutedTextClass}`}>
                    {formatRub(rubEquivalent)}
                  </div>
                )}
              </div>
              <div className="flex flex-1 items-start gap-2">
                {primaryBankLogo && (
                  <img
                    src={primaryBankLogo}
                    alt={primaryBankName || ""}
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded bg-white object-contain"
                    loading="lazy"
                  />
                )}
                <div
                  className={`text-sm font-semibold break-words whitespace-normal ${textClass}`}
                >
                  {itemName(tx.primary_item_id)}
                </div>
              </div>
            </div>

            <div className="relative flex w-24 shrink-0 items-center justify-center self-stretch">
              <CategoryIcon
                className="pointer-events-none absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 text-white opacity-45"
                strokeWidth={1.5}
              />
            </div>

            <div className="w-full min-w-[112px] text-left sm:w-36 lg:w-full">
              <div
                className={`space-y-0.5 text-xs font-semibold leading-tight break-words whitespace-normal ${mutedTextClass}`}
              >
                <div
                  className={`text-sm font-semibold break-words whitespace-normal ${textClass}`}
                >
                  {categoryLines[0]}
                </div>
                <div>{categoryLines[1]}</div>
                <div>{categoryLines[2]}</div>
              </div>
            </div>

            <div className="min-w-[120px] flex-1">
              <div className="space-y-1">
                {chainLabel && (
                  <div
                    className={`text-xs font-semibold break-words whitespace-normal ${chainTextClass}`}
                  >
                    Цепочка: {chainLabel}
                  </div>
                )}
                <div
                  className={`whitespace-normal break-words text-xs leading-tight ${mutedTextClass}`}
                >
                  {commentText}
                </div>
              </div>
            </div>
          </>
        )}

        <div className="flex items-center gap-2">
          {tx.isDeleted && (
            <span className="inline-flex items-center text-slate-400" title="???????">
              <Ban className="h-4 w-4" />
            </span>
          )}

          <div className="flex flex-col items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              className={`hover:bg-transparent ${statusBaseClass} ${statusHoverClass}`}
              aria-label={statusHint}
              title={statusHint}
              onClick={() => onConfirm(tx)}
              disabled={
                tx.isDeleted ||
                isDeleting ||
                isConfirming ||
                isConfirmed ||
                isRealized
              }
            >
              <StatusIcon className="h-4 w-4" />
            </Button>
            {canRealize && (
              <Button
                variant="ghost"
                size="icon-sm"
                className={`hover:bg-transparent ${actionTextClass} ${actionHoverClass}`}
                aria-label="???????????"
                title="???????????"
                onClick={(event) =>
                  onRealize(tx, event.currentTarget as HTMLElement)
                }
                disabled={isRealizeDisabled}
              >
                <Sparkles className="h-4 w-4" />
              </Button>
            )}
          </div>


          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className={`hover:bg-transparent ${actionTextClass} ${actionHoverClass}`}
                aria-label="Открыть меню действий"
                disabled={isDeleting}
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem
                onSelect={(event) => {
                  onCreateFrom(tx, event.currentTarget as HTMLElement);
                }}
                disabled={isCreateDisabled}
              >
                <Plus className="h-4 w-4" />
                Создать на основе
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={(event) => {
                  onEdit(tx, event.currentTarget as HTMLElement);
                }}
                disabled={isEditDisabled}
              >
                <Pencil className="h-4 w-4" />
                Редактировать
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => onDelete(tx.id)}
                disabled={isDeleteDisabled}
              >
                <Trash2 className="h-4 w-4" />
                Удалить
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}

export function TransactionsView({
  view = "actual",
}: {
  view?: TransactionsViewMode;
}) {
  const { data: session } = useSession();
  const isPlanningView = view === "planning";
  const defaultShowActual = !isPlanningView;
  const defaultShowPlanned = isPlanningView;

  const [items, setItems] = useState<ItemOut[]>([]);
  const [banks, setBanks] = useState<BankOut[]>([]);
  const [txs, setTxs] = useState<TransactionOut[]>([]);
  const [deletedTxs, setDeletedTxs] = useState<TransactionOut[]>([]);
  const [fxRatesByDate, setFxRatesByDate] = useState<Record<string, FxRateOut[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [dialogMode, setDialogMode] = useState<
    "create" | "edit" | "bulk-edit" | null
  >(null);
  const [editingTx, setEditingTx] = useState<TransactionOut | null>(null);
  const [realizeSource, setRealizeSource] = useState<TransactionCard | null>(null);
  const [bulkEditIds, setBulkEditIds] = useState<number[] | null>(null);
  const [bulkEditBaseline, setBulkEditBaseline] = useState<BulkEditBaseline | null>(
    null
  );
  const [isBulkEditConfirmOpen, setIsBulkEditConfirmOpen] = useState(false);
  const [isBulkEditing, setIsBulkEditing] = useState(false);
  const [showActive, setShowActive] = useState(true);
  const [showDeleted, setShowDeleted] = useState(false);
  const [showConfirmed, setShowConfirmed] = useState(true);
  const [showUnconfirmed, setShowUnconfirmed] = useState(true);
  const [formTransactionType, setFormTransactionType] = useState<
    TransactionOut["transaction_type"]
  >(() => (defaultShowActual ? "ACTUAL" : "PLANNED"));
  const [showActual, setShowActual] = useState(defaultShowActual);
  const [showPlanned, setShowPlanned] = useState(defaultShowPlanned);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [commentFilter, setCommentFilter] = useState("");
  const [amountFrom, setAmountFrom] = useState("");
  const [amountTo, setAmountTo] = useState("");
  const [selectedDirections, setSelectedDirections] = useState<
    Set<TransactionOut["direction"]>
  >(() => new Set());
  const [selectedCategoryL1, setSelectedCategoryL1] = useState<Set<string>>(
    () => new Set()
  );
  const [selectedCategoryL2, setSelectedCategoryL2] = useState<Set<string>>(
    () => new Set()
  );
  const [selectedCategoryL3, setSelectedCategoryL3] = useState<Set<string>>(
    () => new Set()
  );
  const [isItemsFilterOpen, setIsItemsFilterOpen] = useState(false);
  const [isCategoryL1Open, setIsCategoryL1Open] = useState(false);
  const [isCategoryL2Open, setIsCategoryL2Open] = useState(false);
  const [isCategoryL3Open, setIsCategoryL3Open] = useState(false);
  const [isCurrencyFilterOpen, setIsCurrencyFilterOpen] = useState(false);
  const [selectedCurrencyCodes, setSelectedCurrencyCodes] = useState<Set<string>>(
    () => new Set()
  );
  const [selectedItemIds, setSelectedItemIds] = useState<Set<number>>(
    () => new Set()
  );

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [direction, setDirection] = useState<"INCOME" | "EXPENSE" | "TRANSFER">(
    "EXPENSE"
  );
  const [formMode, setFormMode] = useState<TransactionFormMode>("STANDARD");
  const [primaryItemId, setPrimaryItemId] = useState<number | null>(null);
  const [counterpartyItemId, setCounterpartyItemId] = useState<number | null>(null);
  const [amountStr, setAmountStr] = useState("");
  const [amountCounterpartyStr, setAmountCounterpartyStr] = useState("");
  const [loanTotalStr, setLoanTotalStr] = useState("");
  const [loanInterestStr, setLoanInterestStr] = useState("");
  const [cat1, setCat1] = useState("Питание");
  const [cat2, setCat2] = useState("Продукты питания");
  const [cat3, setCat3] = useState("-");
  const [categoryQuery, setCategoryQuery] = useState("");
  const [isCategorySearchOpen, setIsCategorySearchOpen] = useState(false);
  const [categoryNodes, setCategoryNodes] = useState(() => DEFAULT_CATEGORIES);
  const [description, setDescription] = useState("");
  const [comment, setComment] = useState("");
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importItemId, setImportItemId] = useState<number | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importConfirmed, setImportConfirmed] = useState(false);

  const [selectedTxIds, setSelectedTxIds] = useState<Set<number>>(() => new Set());
  const [deleteIds, setDeleteIds] = useState<number[] | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmingTxId, setConfirmingTxId] = useState<number | null>(null);
  const [isBulkConfirming, setIsBulkConfirming] = useState(false);

  useEffect(() => {
    const stored = readStoredCategories();
    setCategoryNodes(stored ?? DEFAULT_CATEGORIES);
  }, []);

  const categoryMaps = useMemo(
    () => buildCategoryMaps(categoryNodes),
    [categoryNodes]
  );
  const scopedCategoryMaps = useMemo(() => {
    const scope = direction === "TRANSFER" ? undefined : direction;
    return buildCategoryMaps(categoryNodes, scope);
  }, [categoryNodes, direction]);

  const categoryPaths = useMemo(() => {
    const paths: CategoryPathOption[] = [];
    const addPath = (l1: string, l2: string, l3: string) => {
      const label = formatCategoryPath(l1, l2, l3);
      if (!label) return;
      paths.push({
        l1,
        l2,
        l3,
        label,
        searchKey: normalizeCategory(label),
      });
    };

    scopedCategoryMaps.l1.forEach((l1) => {
      addPath(l1, CATEGORY_PLACEHOLDER, CATEGORY_PLACEHOLDER);
      const l2List = scopedCategoryMaps.l2[l1] ?? [];
      l2List.forEach((l2) => {
        addPath(l1, l2, CATEGORY_PLACEHOLDER);
        const l3List = scopedCategoryMaps.l3[l2] ?? [];
        l3List.forEach((l3) => {
          addPath(l1, l2, l3);
        });
      });
    });
    return paths;
  }, [scopedCategoryMaps]);

  const normalizedCategoryQuery = useMemo(
    () => normalizeCategory(categoryQuery),
    [categoryQuery]
  );
  const filteredCategoryPaths = useMemo(() => {
    if (!normalizedCategoryQuery) return categoryPaths;
    return categoryPaths.filter((path) =>
      path.searchKey.includes(normalizedCategoryQuery)
    );
  }, [categoryPaths, normalizedCategoryQuery]);

  const categoryIconByPath = useMemo(() => {
    const map = new Map<string, string>();
    const walk = (nodes: CategoryNode[], trail: string[]) => {
      nodes.forEach((node) => {
        const nextTrail = [...trail, node.name];
        const [l1, l2, l3] = nextTrail;
        const key = makeCategoryPathKey(l1, l2, l3);
        if (typeof node.icon === "string" && node.icon.trim().length > 0) {
          map.set(key, node.icon);
        }
        if (node.children && node.children.length > 0) {
          walk(node.children, nextTrail);
        }
      });
    };
    walk(categoryNodes, []);
    return map;
  }, [categoryNodes]);

  const resolveCategoryIcon = (
    l1?: string | null,
    l2?: string | null,
    l3?: string | null
  ) => {
    const l1Key = l1?.trim() ?? "";
    if (!l1Key) return CATEGORY_ICON_FALLBACK;
    const l2Key = l2?.trim() ?? "";
    const l3Key = l3?.trim() ?? "";
    const iconName =
      (l3Key && categoryIconByPath.get(makeCategoryPathKey(l1Key, l2Key, l3Key))) ??
      (l2Key && categoryIconByPath.get(makeCategoryPathKey(l1Key, l2Key))) ??
      categoryIconByPath.get(makeCategoryPathKey(l1Key));
    if (iconName) {
      if (iconName === "none") return CATEGORY_ICON_FALLBACK;
      return (
        CATEGORY_ICON_BY_NAME[iconName] ??
        CATEGORY_ICON_BY_L1[l1Key] ??
        CATEGORY_ICON_FALLBACK
      );
    }
    return CATEGORY_ICON_BY_L1[l1Key] ?? CATEGORY_ICON_FALLBACK;
  };

  const itemsById = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items]
  );
  const banksById = useMemo(
    () => new Map(banks.map((bank) => [bank.id, bank])),
    [banks]
  );
  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }, [items]);
  const assetItems = useMemo(
    () => items.filter((item) => item.kind === "ASSET"),
    [items]
  );
  const liabilityItems = useMemo(
    () => items.filter((item) => item.kind === "LIABILITY"),
    [items]
  );
  const categoryL1Options = useMemo(() => {
    return [...categoryMaps.l1].sort((a, b) => a.localeCompare(b, "ru"));
  }, [categoryMaps]);
  const categoryL2Options = useMemo(() => {
    const values = new Set<string>();
    const keys =
      selectedCategoryL1.size > 0
        ? Array.from(selectedCategoryL1)
        : categoryMaps.l1;
    keys.forEach((key) => {
      (categoryMaps.l2[key] ?? []).forEach((val) => values.add(val));
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b, "ru"));
  }, [selectedCategoryL1, categoryMaps]);
  const categoryL3Options = useMemo(() => {
    const values = new Set<string>();
    if (selectedCategoryL2.size > 0) {
      selectedCategoryL2.forEach((key) => {
        (categoryMaps.l3[key] ?? []).forEach((val) => values.add(val));
      });
    } else {
      const l2Keys =
        selectedCategoryL1.size > 0
          ? Array.from(selectedCategoryL1).flatMap(
              (key) => categoryMaps.l2[key] ?? []
            )
          : Object.keys(categoryMaps.l3);
      l2Keys.forEach((key) => {
        (categoryMaps.l3[key] ?? []).forEach((val) => values.add(val));
      });
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b, "ru"));
  }, [selectedCategoryL1, selectedCategoryL2, categoryMaps]);
  const currencyOptions = useMemo(() => {
    const values = new Set<string>();
    items.forEach((item) => {
      if (item.currency_code) values.add(item.currency_code);
    });
    [...txs, ...deletedTxs].forEach((tx) => {
      const primary = itemsById.get(tx.primary_item_id)?.currency_code;
      if (primary) values.add(primary);
      const counterparty =
        tx.counterparty_item_id != null
          ? itemsById.get(tx.counterparty_item_id)?.currency_code
          : null;
      if (counterparty) values.add(counterparty);
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b, "ru"));
  }, [items, txs, deletedTxs, itemsById]);

  const itemName = (id: number | null | undefined) => {
    if (!id) return "-";
    return itemsById.get(id)?.name ?? `#${id}`;
  };
  const itemCurrencyCode = (id: number | null | undefined) => {
    if (!id) return "-";
    return itemsById.get(id)?.currency_code ?? "-";
  };
  const itemBank = (id: number | null | undefined) => {
    if (!id) return null;
    const bankId = itemsById.get(id)?.bank_id;
    if (!bankId) return null;
    return banksById.get(bankId) ?? null;
  };
  const itemBankLogoUrl = (id: number | null | undefined) =>
    itemBank(id)?.logo_url ?? null;
  const itemBankName = (id: number | null | undefined) => itemBank(id)?.name ?? "";

  const getFxRateForDate = (date: string, currencyCode: string) => {
    if (!currencyCode || currencyCode === "RUB") return 1;
    const dateKey = getDateKey(date);
    if (!dateKey) return null;
    const rates = fxRatesByDate[dateKey];
    if (!rates) return null;
    return rates.find((rate) => rate.char_code === currencyCode)?.rate ?? null;
  };

  const getRubEquivalentCents = (tx: TransactionCard, currencyCode: string) => {
    const rate = getFxRateForDate(tx.transaction_date, currencyCode);
    if (!rate) return null;
    const amount = tx.amount_rub / 100;
    return Math.round(amount * rate * 100);
  };

  const isTransfer = direction === "TRANSFER";
  const isLoanRepayment = formMode === "LOAN_REPAYMENT";
  const isActualTransaction = formTransactionType === "ACTUAL";
  const isPlannedTransaction = formTransactionType === "PLANNED";
  const showCounterpartySelect = isTransfer || isLoanRepayment;
  const primarySelectItems = isLoanRepayment ? assetItems : items;
  const counterpartySelectItems = isLoanRepayment ? liabilityItems : items;
  const primaryCurrencyCode = primaryItemId
    ? itemsById.get(primaryItemId)?.currency_code ?? null
    : null;
  const counterpartyCurrencyCode = counterpartyItemId
    ? itemsById.get(counterpartyItemId)?.currency_code ?? null
    : null;
  const isCrossCurrencyTransfer =
    isTransfer &&
    primaryCurrencyCode &&
    counterpartyCurrencyCode &&
    primaryCurrencyCode !== counterpartyCurrencyCode;
  const loanTotals = useMemo(() => {
    const totalCents = loanTotalStr.trim()
      ? parseRubToCents(loanTotalStr)
      : null;
    const interestCents = loanInterestStr.trim()
      ? parseRubToCents(loanInterestStr)
      : null;
    const total =
      totalCents != null && Number.isFinite(totalCents) ? totalCents : null;
    const interest =
      interestCents != null && Number.isFinite(interestCents)
        ? interestCents
        : null;
    const principal =
      total != null && interest != null ? total - interest : null;
    return { total, interest, principal };
  }, [loanTotalStr, loanInterestStr]);
  const loanPrincipalLabel =
    loanTotals.principal == null
      ? "-"
      : `${formatAmount(loanTotals.principal)}${
          primaryCurrencyCode ? ` ${primaryCurrencyCode}` : ""
        }`;

  useEffect(() => {
    if (!isCrossCurrencyTransfer) {
      setAmountCounterpartyStr("");
    }
  }, [isCrossCurrencyTransfer]);

  const segmentedButtonBase =
    "flex-1 min-w-0 rounded-sm px-3 py-2 text-sm font-medium text-center whitespace-nowrap transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500";
  const isDialogOpen = dialogMode !== null;
  const isEditMode = dialogMode === "edit";
  const isBulkEdit = dialogMode === "bulk-edit";
  const isRealizeMode = realizeSource !== null;

  const applyCategorySelection = (l1: string, l2: string, l3: string) => {
    setCat1(l1);
    setCat2(l2);
    setCat3(l3);
    setCategoryQuery(formatCategoryPath(l1, l2, l3));
  };

  const resetForm = () => {
    setDate(new Date().toISOString().slice(0, 10));
    setDirection("EXPENSE");
    setFormMode("STANDARD");
    setFormTransactionType(defaultShowActual ? "ACTUAL" : "PLANNED");
    setPrimaryItemId(null);
    setCounterpartyItemId(null);
    setAmountStr("");
    setAmountCounterpartyStr("");
    setLoanTotalStr("");
    setLoanInterestStr("");
    setIsCategorySearchOpen(false);
    applyCategorySelection("", "", "");
    setDescription("");
    setComment("");
  };

  const formatCentsForInput = (cents?: number | null) => {
    if (cents == null) return "";
    const raw = (cents / 100).toFixed(2).replace(".", ",");
    return formatRubInput(raw);
  };

  const closeDialog = () => {
    setDialogMode(null);
    setEditingTx(null);
    setRealizeSource(null);
    setFormError(null);
    setBulkEditIds(null);
    setBulkEditBaseline(null);
    setIsBulkEditConfirmOpen(false);
    setIsBulkEditing(false);
    setIsCategorySearchOpen(false);
  };

  const openCreateDialog = () => {
    lastActiveElementRef.current = null;
    setFormError(null);
    setEditingTx(null);
    setRealizeSource(null);
    setBulkEditIds(null);
    setBulkEditBaseline(null);
    setIsBulkEditConfirmOpen(false);
    resetForm();
    setDialogMode("create");
  };

  const openEditDialog = (tx: TransactionCard, trigger?: HTMLElement | null) => {
    lastActiveElementRef.current =
      trigger ?? (document.activeElement as HTMLElement | null);
    setFormError(null);
    setEditingTx(tx);
    setRealizeSource(null);
    setFormMode("STANDARD");
    setIsCategorySearchOpen(false);
    setBulkEditIds(null);
    setBulkEditBaseline(null);
    setIsBulkEditConfirmOpen(false);
    setDialogMode("edit");
    setDate(getDateKey(tx.transaction_date));
    setDirection(tx.direction);
    setFormTransactionType(tx.transaction_type);
    setPrimaryItemId(tx.primary_item_id);
    setCounterpartyItemId(tx.counterparty_item_id);
    setAmountStr(formatCentsForInput(tx.amount_rub));
    setAmountCounterpartyStr(
      tx.direction === "TRANSFER" && tx.amount_counterparty != null
        ? formatCentsForInput(tx.amount_counterparty)
        : ""
    );
    applyCategorySelection(
      tx.category_l1 || "",
      tx.category_l2 || "",
      tx.category_l3 || ""
    );
    setDescription(tx.description ?? "");
    setComment(tx.comment ?? "");
  };

  const openCreateFromDialog = (
    tx: TransactionCard,
    trigger?: HTMLElement | null
  ) => {
    lastActiveElementRef.current =
      trigger ?? (document.activeElement as HTMLElement | null);
    setFormError(null);
    setEditingTx(null);
    setRealizeSource(null);
    setFormMode("STANDARD");
    setIsCategorySearchOpen(false);
    setBulkEditIds(null);
    setBulkEditBaseline(null);
    setIsBulkEditConfirmOpen(false);
    setDialogMode("create");
    setDate(getDateKey(tx.transaction_date));
    setDirection(tx.direction);
    setFormTransactionType(tx.transaction_type);
    setPrimaryItemId(tx.primary_item_id);
    setCounterpartyItemId(
      tx.direction === "TRANSFER" ? tx.counterparty_item_id : null
    );
    setAmountStr(formatCentsForInput(tx.amount_rub));
    setAmountCounterpartyStr(
      tx.direction === "TRANSFER" && tx.amount_counterparty != null
        ? formatCentsForInput(tx.amount_counterparty)
        : ""
    );
    applyCategorySelection(
      tx.category_l1 || "",
      tx.category_l2 || "",
      tx.category_l3 || ""
    );
    setDescription(tx.description ?? "");
    setComment(tx.comment ?? "");
  };

  const openRealizeDialog = (
    tx: TransactionCard,
    trigger?: HTMLElement | null
  ) => {
    lastActiveElementRef.current =
      trigger ?? (document.activeElement as HTMLElement | null);
    setFormError(null);
    setEditingTx(null);
    setRealizeSource(tx);
    setFormMode("STANDARD");
    setIsCategorySearchOpen(false);
    setBulkEditIds(null);
    setBulkEditBaseline(null);
    setIsBulkEditConfirmOpen(false);
    setDialogMode("create");
    setDate(getDateKey(tx.transaction_date));
    setDirection(tx.direction);
    setFormTransactionType("ACTUAL");
    setPrimaryItemId(tx.primary_item_id);
    setCounterpartyItemId(
      tx.direction === "TRANSFER" ? tx.counterparty_item_id : null
    );
    setAmountStr(formatCentsForInput(tx.amount_rub));
    setAmountCounterpartyStr(
      tx.direction === "TRANSFER" && tx.amount_counterparty != null
        ? formatCentsForInput(tx.amount_counterparty)
        : ""
    );
    applyCategorySelection(
      tx.category_l1 || "",
      tx.category_l2 || "",
      tx.category_l3 || ""
    );
    setDescription(tx.description ?? "");
    setComment(tx.comment ?? "");
  };

  const openBulkEditDialog = () => {
    lastActiveElementRef.current = document.activeElement as HTMLElement | null;
    const selectedTxs = sortedTxs.filter(
      (tx) => !tx.isDeleted && selectedTxIds.has(tx.id)
    );
    if (selectedTxs.length < 2) return;

    const baselineTx = selectedTxs[0];
    const baseline = {
      date: getDateKey(baselineTx.transaction_date),
      direction: baselineTx.direction,
      primaryItemId: baselineTx.primary_item_id,
      counterpartyItemId: baselineTx.counterparty_item_id,
      amountStr: formatCentsForInput(baselineTx.amount_rub),
      amountCounterpartyStr:
        baselineTx.direction === "TRANSFER" &&
        baselineTx.amount_counterparty != null
          ? formatCentsForInput(baselineTx.amount_counterparty)
          : "",
      cat1: baselineTx.category_l1 || "",
      cat2: baselineTx.category_l2 || "",
      cat3: baselineTx.category_l3 || "",
      description: baselineTx.description ?? "",
      comment: baselineTx.comment ?? "",
    };

    setFormError(null);
    setEditingTx(null);
    setRealizeSource(null);
    setFormMode("STANDARD");
    setIsCategorySearchOpen(false);
    setDialogMode("bulk-edit");
    setBulkEditIds(selectedTxs.map((tx) => tx.id));
    setBulkEditBaseline(baseline);
    setIsBulkEditConfirmOpen(false);
    setDate(baseline.date);
    setDirection(baseline.direction);
    setPrimaryItemId(baseline.primaryItemId);
    setCounterpartyItemId(baseline.counterpartyItemId);
    setAmountStr(baseline.amountStr);
    setAmountCounterpartyStr(baseline.amountCounterpartyStr);
    applyCategorySelection(baseline.cat1, baseline.cat2, baseline.cat3);
    setDescription(baseline.description);
    setComment(baseline.comment);
  };

  const handleConfirmStatus = async (tx: TransactionCard) => {
    if (tx.status === "CONFIRMED" || tx.status === "REALIZED") return;
    setConfirmingTxId(tx.id);
    setError(null);
    try {
      const updated = await updateTransactionStatus(tx.id, "CONFIRMED");
      setTxs((prev) =>
        prev.map((item) =>
          item.id === tx.id ? { ...item, status: updated.status } : item
        )
      );
      setDeletedTxs((prev) =>
        prev.map((item) =>
          item.id === tx.id ? { ...item, status: updated.status } : item
        )
      );
    } catch (e: any) {
      setError(e?.message ?? "Не удалось подтвердить транзакцию.");
    } finally {
      setConfirmingTxId(null);
    }
  };

  const getBulkEditChanges = () => {
    if (!bulkEditBaseline) return null;
    return {
      hasDateChanged: date !== bulkEditBaseline.date,
      hasDirectionChanged: direction !== bulkEditBaseline.direction,
      hasPrimaryItemChanged: primaryItemId !== bulkEditBaseline.primaryItemId,
      hasCounterpartyItemChanged:
        counterpartyItemId !== bulkEditBaseline.counterpartyItemId,
      hasAmountChanged: amountStr !== bulkEditBaseline.amountStr,
      hasAmountCounterpartyChanged:
        amountCounterpartyStr !== bulkEditBaseline.amountCounterpartyStr,
      hasCat1Changed: cat1 !== bulkEditBaseline.cat1,
      hasCat2Changed: cat2 !== bulkEditBaseline.cat2,
      hasCat3Changed: cat3 !== bulkEditBaseline.cat3,
      hasDescriptionChanged: description !== bulkEditBaseline.description,
      hasCommentChanged: comment !== bulkEditBaseline.comment,
    };
  };

  const validateBulkEdit = () => {
    if (!bulkEditIds || bulkEditIds.length === 0 || !bulkEditBaseline) {
      return "Выберите транзакции для редактирования.";
    }

    const changes = getBulkEditChanges();
    if (!changes) return "Не удалось подготовить изменения.";

    if (changes.hasDateChanged && !date) {
      return "Выберите дату транзакции.";
    }
    if (changes.hasPrimaryItemChanged && !primaryItemId) {
      return "Выберите актив/обязательство.";
    }
    if (changes.hasDirectionChanged && direction === "TRANSFER" && !counterpartyItemId) {
      return "Выберите корреспондирующий актив.";
    }

    if (changes.hasAmountChanged) {
      const cents = parseRubToCents(amountStr);
      if (!Number.isFinite(cents) || cents < 0) {
        return "Введите сумму в формате 1234,56.";
      }
    }

    let counterpartyCents: number | null = null;
    if (changes.hasAmountCounterpartyChanged) {
      const counterCents = parseRubToCents(amountCounterpartyStr);
      if (!Number.isFinite(counterCents) || counterCents < 0) {
        return "Введите сумму зачисления в формате 1234,56.";
      }
      counterpartyCents = counterCents;
    }

    const targets = txs.filter((tx) => bulkEditIds.includes(tx.id));
    if (targets.length === 0) {
      return "Выберите транзакции для редактирования.";
    }

    const today = new Date().toISOString().slice(0, 10);

    for (const tx of targets) {
      const nextDirection = changes.hasDirectionChanged ? direction : tx.direction;
      const nextDate = changes.hasDateChanged ? date : getDateKey(tx.transaction_date);
      const nextPrimaryItemId = changes.hasPrimaryItemChanged
        ? primaryItemId
        : tx.primary_item_id;
      const resolvedPrimaryItemId = nextPrimaryItemId ?? tx.primary_item_id;
      const nextCounterpartyItemId =
        nextDirection === "TRANSFER"
          ? changes.hasCounterpartyItemChanged
            ? counterpartyItemId
            : tx.counterparty_item_id
          : null;

      if (!resolvedPrimaryItemId) {
        return "Выберите актив/обязательство.";
      }
      if (nextDirection === "TRANSFER" && !nextCounterpartyItemId) {
        return "Выберите корреспондирующий актив.";
      }

      if (changes.hasDateChanged && tx.transaction_type === "PLANNED") {
        if (nextDate < today) {
          return "Плановая транзакция не может быть создана ранее текущего дня.";
        }
      }

      if (changes.hasDateChanged || changes.hasPrimaryItemChanged) {
        const primaryItem = itemsById.get(resolvedPrimaryItemId);
        if (primaryItem?.start_date && nextDate < primaryItem.start_date) {
          return "Дата транзакции не может быть раньше даты начала действия выбранного актива/обязательства.";
        }
      }

      if (
        nextDirection === "TRANSFER" &&
        (changes.hasDateChanged ||
          changes.hasCounterpartyItemChanged ||
          changes.hasDirectionChanged)
      ) {
        if (nextCounterpartyItemId) {
          const counterpartyItem = itemsById.get(nextCounterpartyItemId);
          if (counterpartyItem?.start_date && nextDate < counterpartyItem.start_date) {
            return "Дата транзакции не может быть раньше даты начала действия корреспондирующего актива/обязательства.";
          }
        }
      }

      const primaryCurrency =
        resolvedPrimaryItemId != null
          ? itemsById.get(resolvedPrimaryItemId)?.currency_code
          : null;
      const counterpartyCurrency =
        nextCounterpartyItemId != null
          ? itemsById.get(nextCounterpartyItemId)?.currency_code
          : null;
      const isCrossCurrencyTransfer =
        nextDirection === "TRANSFER" &&
        primaryCurrency &&
        counterpartyCurrency &&
        primaryCurrency !== counterpartyCurrency;

      if (isCrossCurrencyTransfer) {
        const nextCounterpartyAmount = changes.hasAmountCounterpartyChanged
          ? counterpartyCents
          : tx.amount_counterparty;
        if (nextCounterpartyAmount == null) {
          return "Введите сумму зачисления в формате 1234,56.";
        }
      }
    }

    return null;
  };

  const applyBulkEdit = async () => {
    if (!bulkEditBaseline || !bulkEditIds || bulkEditIds.length === 0) return;

    const validationError = validateBulkEdit();
    if (validationError) {
      setFormError(validationError);
      setIsBulkEditConfirmOpen(false);
      return;
    }

    const changes = getBulkEditChanges();
    if (!changes) return;

    const amountCents = changes.hasAmountChanged
      ? parseRubToCents(amountStr)
      : null;
    const counterpartyCents = changes.hasAmountCounterpartyChanged
      ? parseRubToCents(amountCounterpartyStr)
      : null;

    const targets = txs.filter((tx) => bulkEditIds.includes(tx.id));

    setIsBulkEditing(true);
    setFormError(null);

    try {
      const results = await Promise.allSettled(
        targets.map((tx) => {
          const nextDirection = changes.hasDirectionChanged ? direction : tx.direction;
          const baseDate = changes.hasDateChanged ? date : getDateKey(tx.transaction_date);
          const nextDate = mergeDateWithTime(baseDate, tx.transaction_date);
          const nextPrimaryItemId = changes.hasPrimaryItemChanged
            ? primaryItemId
            : tx.primary_item_id;
          const resolvedPrimaryItemId = nextPrimaryItemId ?? tx.primary_item_id;
          const nextCounterpartyItemId =
            nextDirection === "TRANSFER"
              ? changes.hasCounterpartyItemChanged
                ? counterpartyItemId
                : tx.counterparty_item_id
              : null;

          const primaryCurrency =
            resolvedPrimaryItemId != null
              ? itemsById.get(resolvedPrimaryItemId)?.currency_code
              : null;
          const counterpartyCurrency =
            nextCounterpartyItemId != null
              ? itemsById.get(nextCounterpartyItemId)?.currency_code
              : null;
          const isCrossCurrencyTransfer =
            nextDirection === "TRANSFER" &&
            primaryCurrency &&
            counterpartyCurrency &&
            primaryCurrency !== counterpartyCurrency;

          const nextAmountCounterparty =
            nextDirection !== "TRANSFER"
              ? null
              : isCrossCurrencyTransfer
                ? changes.hasAmountCounterpartyChanged
                  ? counterpartyCents
                  : tx.amount_counterparty ?? null
                : null;

          const payload: TransactionCreate = {
            transaction_date: nextDate,
            primary_item_id: resolvedPrimaryItemId ?? tx.primary_item_id,
            counterparty_item_id: nextCounterpartyItemId,
            amount_rub: changes.hasAmountChanged
              ? (amountCents as number)
              : tx.amount_rub,
            amount_counterparty: nextAmountCounterparty,
            direction: nextDirection,
            transaction_type: tx.transaction_type,
            category_l1:
              nextDirection === "TRANSFER"
                ? ""
                : changes.hasCat1Changed
                  ? cat1
                  : tx.category_l1 || "",
            category_l2:
              nextDirection === "TRANSFER"
                ? ""
                : changes.hasCat2Changed
                  ? cat2
                  : tx.category_l2 || "",
            category_l3:
              nextDirection === "TRANSFER"
                ? ""
                : changes.hasCat3Changed
                  ? cat3
                  : tx.category_l3 || "",
            description: changes.hasDescriptionChanged
              ? description || null
              : tx.description ?? null,
            comment: changes.hasCommentChanged ? comment || null : tx.comment ?? null,
          };

          return updateTransaction(tx.id, payload);
        })
      );

      const hasErrors = results.some((result) => result.status === "rejected");
      await loadAll();
      if (hasErrors) {
        setFormError("Не удалось обновить часть выбранных транзакций.");
        return;
      }
      closeDialog();
    } catch (e: any) {
      setFormError(e?.message ?? "Не удалось обновить выбранные транзакции.");
    } finally {
      setIsBulkEditing(false);
      setIsBulkEditConfirmOpen(false);
    }
  };

  const handleBulkConfirm = async () => {
    if (selectedConfirmableIds.length === 0) return;
    setIsBulkConfirming(true);
    setError(null);
    const idsToConfirm = [...selectedConfirmableIds];
    try {
      const results = await Promise.allSettled(
        idsToConfirm.map((id) => updateTransactionStatus(id, "CONFIRMED"))
      );
      const confirmedIds = new Set<number>();
      let hasErrors = false;

      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          confirmedIds.add(idsToConfirm[index]);
        } else {
          hasErrors = true;
        }
      });

      if (confirmedIds.size > 0) {
        setTxs((prev) =>
          prev.map((item) =>
            confirmedIds.has(item.id) ? { ...item, status: "CONFIRMED" } : item
          )
        );
        setDeletedTxs((prev) =>
          prev.map((item) =>
            confirmedIds.has(item.id) ? { ...item, status: "CONFIRMED" } : item
          )
        );
      }

      if (hasErrors) {
        setError("Не удалось подтвердить часть выбранных транзакций.");
      }
    } catch (e: any) {
      setError(e?.message ?? "Не удалось подтвердить выбранные транзакции.");
    } finally {
      setIsBulkConfirming(false);
    }
  };

  const resetImportForm = () => {
    setImportFile(null);
    setImportItemId(null);
    setImportError(null);
    setImportConfirmed(false);
    if (importInputRef.current) {
      importInputRef.current.value = "";
    }
  };

  const handleImportOpenChange = (open: boolean) => {
    setIsImportDialogOpen(open);
    if (!open) {
      resetImportForm();
      return;
    }
    setImportError(null);
  };

  const handleImportSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setImportError(null);

    if (!importFile) {
      setImportError("Выберите файл .xlsx для импорта.");
      return;
    }
    if (!importFile.name.toLowerCase().endsWith(".xlsx")) {
      setImportError("Формат файла должен быть .xlsx.");
      return;
    }
    if (importItemId == null) {
      setImportError("Выберите счет, на который импортируются транзакции.");
      return;
    }
    const selectedImportItemId = importItemId;
    const item = itemsById.get(selectedImportItemId);
    if (!item) {
      setImportError("Выбранный счет недоступен.");
      return;
    }
    if (categoryMaps.l1.length === 0) {
      setImportError("Нет доступных категорий для сопоставления.");
      return;
    }
    const importTxType = isPlanningView ? "PLANNED" : "ACTUAL";

    let rowsToImport: Array<{ rowNumber: number; payload: TransactionCreate }> = [];

    try {
      const arrayBuffer = await importFile.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: "array", cellDates: true });
      if (workbook.SheetNames.length !== 1) {
        throw new Error("Файл должен содержать один лист.");
      }
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        blankrows: false,
        defval: "",
      }) as unknown[][];

      if (rows.length < 2) {
        throw new Error("Файл не содержит данных для импорта.");
      }

      const headerRow = rows[0] ?? [];
      const normalizedHeader = headerRow.map((cell) =>
        normalizeHeader(String(cell ?? ""))
      );
      const expectedHeader = IMPORT_HEADERS.map(normalizeHeader);

      const isHeaderValid =
        normalizedHeader.length === expectedHeader.length &&
        expectedHeader.every((value, index) => value === normalizedHeader[index]);

      if (!isHeaderValid) {
        throw new Error(
          `Неверный формат заголовков. Ожидаются столбцы: ${IMPORT_HEADERS.join(
            ", "
          )}.`
        );
      }

      for (let i = 1; i < rows.length; i += 1) {
        const row = rows[i] ?? [];
        const rowNumber = i + 1;
        const hasValues = row.some((cell) => String(cell ?? "").trim() !== "");
        if (!hasValues) {
          continue;
        }

        if (
          row.slice(IMPORT_HEADERS.length).some((cell) => String(cell ?? "").trim() !== "")
        ) {
          throw new Error(`Строка ${rowNumber}: должно быть 4 столбца.`);
        }

        const [rawDate, rawAmount, rawCategory, rawComment] = row;

        const parsedDate = parseExcelDate(rawDate);
        if (!parsedDate) {
          throw new Error(`Строка ${rowNumber}: не удалось распознать дату операции.`);
        }
        const transactionDateKey = formatDateForApi(parsedDate);
        const transactionDate = formatDateTimeForApi(parsedDate);
        if (importTxType === "PLANNED") {
          const today = new Date().toISOString().slice(0, 10);
          if (transactionDateKey < today) {
            throw new Error(
              `Строка ${rowNumber}: плановая транзакция не может быть раньше текущего дня.`
            );
          }
        }
        if (item.start_date && transactionDateKey < item.start_date) {
          throw new Error(
            `Строка ${rowNumber}: дата операции раньше даты открытия счета.`
          );
        }

        const amountValue = parseAmountCell(rawAmount);
        if (amountValue == null || !Number.isFinite(amountValue)) {
          throw new Error(`Строка ${rowNumber}: не удалось распознать сумму.`);
        }
        const direction = amountValue < 0 ? "EXPENSE" : "INCOME";
        const amountCents = Math.round(Math.abs(amountValue) * 100);

        const categoryValue = String(rawCategory ?? "").trim();
        if (!categoryValue) {
          throw new Error(`Строка ${rowNumber}: категория не указана.`);
        }
        const categoryL1 = findClosestCategory(categoryValue, categoryMaps.l1);
        if (!categoryL1) {
          throw new Error(
            `Строка ${rowNumber}: не удалось сопоставить категорию первого уровня.`
          );
        }

        const commentValue = String(rawComment ?? "").trim();

        rowsToImport.push({
          rowNumber,
          payload: {
            transaction_date: transactionDate,
            primary_item_id: selectedImportItemId,
            amount_rub: amountCents,
            direction,
            transaction_type: importTxType,
            status: importConfirmed ? "CONFIRMED" : "UNCONFIRMED",
            category_l1: categoryL1,
            category_l2: "-",
            category_l3: "-",
            description: null,
            comment: commentValue ? commentValue : null,
          },
        });
      }

      if (rowsToImport.length === 0) {
        throw new Error("Файл не содержит строк для импорта.");
      }
    } catch (err: any) {
      setImportError(err?.message ?? "Не удалось подготовить файл к импорту.");
      return;
    }

    setIsImporting(true);
    try {
      for (const row of rowsToImport) {
        try {
          await createTransaction(row.payload);
        } catch (err: any) {
          const message = err?.message ?? "Не удалось импортировать транзакцию.";
          throw new Error(`Строка ${row.rowNumber}: ${message}`);
        }
      }
      handleImportOpenChange(false);
      await loadAll();
    } catch (err: any) {
      setImportError(err?.message ?? "Не удалось импортировать транзакции.");
    } finally {
      setIsImporting(false);
    }
  };

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [itemsData, txData, deletedData, banksData] = await Promise.all([
        fetchItems(),
        fetchTransactions(),
        fetchDeletedTransactions(),
        fetchBanks().catch(() => []),
      ]);
      setItems(itemsData);
      setTxs(txData);
      setDeletedTxs(deletedData);
      setBanks(banksData);
    } catch (e: any) {
      setError(e?.message ?? "Не удалось загрузить транзакции.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (session) loadAll();
  }, [session]);

  useEffect(() => {
    const dates = new Set<string>();
    [...txs, ...deletedTxs].forEach((tx) => {
      const dateKey = getDateKey(tx.transaction_date);
      if (dateKey) dates.add(dateKey);
    });

    const missingDates = Array.from(dates).filter(
      (date) => !fxRatesByDate[date]
    );
    if (missingDates.length === 0) return;

    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        missingDates.map(async (date) => {
          try {
            const rates = await fetchFxRates(toCbrDate(date));
            return [date, rates] as const;
          } catch {
            return [date, null] as const;
          }
        })
      );

      if (cancelled) return;

      setFxRatesByDate((prev) => {
        const next = { ...prev };
        entries.forEach(([date, rates]) => {
          if (rates && rates.length) next[date] = rates;
        });
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [txs, deletedTxs, fxRatesByDate]);

  useEffect(() => {
    setSelectedTxIds((prev) => {
      if (prev.size === 0) return prev;
      const availableIds = new Set(txs.map((tx) => tx.id));
      let changed = false;
      const next = new Set<number>();
      prev.forEach((id) => {
        if (availableIds.has(id)) {
          next.add(id);
        } else {
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [txs]);

  const filteredTxs = useMemo(() => {
    const active = showActive ? txs : [];
    const deleted = showDeleted ? deletedTxs : [];

    const combined = [
      ...active.map((tx) => ({ ...tx })),
      ...deleted.map((tx) => ({ ...tx, isDeleted: true })),
    ];

    const commentQuery = commentFilter.trim().toLowerCase();
    const minAmount = parseAmountFilter(amountFrom);
    const maxAmount = parseAmountFilter(amountTo);

    return combined.filter((tx) => {
      const matchesType =
        (showActual && tx.transaction_type === "ACTUAL") ||
        (showPlanned && tx.transaction_type === "PLANNED");
      if (!matchesType) return false;
      const matchesConfirmation =
        (showConfirmed &&
          (tx.status === "CONFIRMED" || tx.status === "REALIZED")) ||
        (showUnconfirmed && tx.status === "UNCONFIRMED");
      if (!matchesConfirmation) return false;
      const txDateKey = getDateKey(tx.transaction_date);
      if (dateFrom && txDateKey < dateFrom) return false;
      if (dateTo && txDateKey > dateTo) return false;
      if (commentQuery) {
        const commentText = (tx.comment ?? "").toLowerCase();
        if (!commentText.includes(commentQuery)) return false;
      }
      if (minAmount != null || maxAmount != null) {
        const absAmount = Math.abs(tx.amount_rub);
        if (minAmount != null && absAmount < minAmount) return false;
        if (maxAmount != null && absAmount > maxAmount) return false;
      }
      if (
        selectedCategoryL1.size > 0 &&
        !selectedCategoryL1.has(tx.category_l1)
      ) {
        return false;
      }
      if (
        selectedCategoryL2.size > 0 &&
        !selectedCategoryL2.has(tx.category_l2)
      ) {
        return false;
      }
      if (
        selectedCategoryL3.size > 0 &&
        !selectedCategoryL3.has(tx.category_l3)
      ) {
        return false;
      }
      if (selectedCurrencyCodes.size > 0) {
        const primaryCurrency = itemsById.get(tx.primary_item_id)?.currency_code;
        const counterpartyCurrency =
          tx.counterparty_item_id != null
            ? itemsById.get(tx.counterparty_item_id)?.currency_code
            : null;
        const hasCurrency =
          (primaryCurrency && selectedCurrencyCodes.has(primaryCurrency)) ||
          (counterpartyCurrency && selectedCurrencyCodes.has(counterpartyCurrency));
        if (!hasCurrency) return false;
      }
      if (selectedDirections.size > 0 && !selectedDirections.has(tx.direction)) {
        return false;
      }
      if (selectedItemIds.size > 0) {
        const hasPrimary = selectedItemIds.has(tx.primary_item_id);
        const hasCounterparty =
          tx.counterparty_item_id != null &&
          selectedItemIds.has(tx.counterparty_item_id);
        if (!hasPrimary && !hasCounterparty) return false;
      }
      return true;
    });
  }, [
    txs,
    deletedTxs,
    showActive,
    showDeleted,
    showConfirmed,
    showUnconfirmed,
    showActual,
    showPlanned,
    dateFrom,
    dateTo,
    commentFilter,
    amountFrom,
    amountTo,
    selectedCategoryL1,
    selectedCategoryL2,
    selectedCategoryL3,
    selectedCurrencyCodes,
    selectedDirections,
    selectedItemIds,
    itemsById,
  ]);

  const sortedTxs = useMemo(() => {
    return filteredTxs
      .slice()
      .sort((a, b) => {
        const dateDiff = b.transaction_date.localeCompare(a.transaction_date);
        if (dateDiff !== 0) return dateDiff;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [filteredTxs]);
  const selectableIds = useMemo(
    () => sortedTxs.filter((tx) => !tx.isDeleted).map((tx) => tx.id),
    [sortedTxs]
  );
  const selectedVisibleIds = useMemo(
    () => selectableIds.filter((id) => selectedTxIds.has(id)),
    [selectableIds, selectedTxIds]
  );
  const selectedVisibleCount = selectedVisibleIds.length;
  const selectedConfirmableIds = useMemo(
    () =>
      sortedTxs
        .filter(
          (tx) =>
            !tx.isDeleted &&
            selectedTxIds.has(tx.id) &&
            tx.status === "UNCONFIRMED"
        )
        .map((tx) => tx.id),
    [sortedTxs, selectedTxIds]
  );
  const selectedConfirmableIdSet = useMemo(
    () => new Set(selectedConfirmableIds),
    [selectedConfirmableIds]
  );
  const allSelected =
    selectableIds.length > 0 && selectedVisibleCount === selectableIds.length;
  const someSelected = selectedVisibleCount > 0 && !allSelected;
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const selectAllRef = useRef<HTMLInputElement | null>(null);
  const lastActiveElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  const toggleTxSelection = (id: number, checked: boolean) => {
    setSelectedTxIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const openDeleteDialog = (ids: number[]) => {
    if (ids.length === 0) return;
    setDeleteIds(ids);
  };
  const toggleItemSelection = (id: number, checked: boolean) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };
  const toggleAllSelection = (checked: boolean) => {
    setSelectedTxIds((prev) => {
      const next = new Set(prev);
      selectableIds.forEach((id) => {
        if (checked) {
          next.add(id);
        } else {
          next.delete(id);
        }
      });
      return next;
    });
  };
  const toggleCategoryL1Selection = (value: string) => {
    setSelectedCategoryL1((prev) => {
      const next = new Set(prev);
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
      }
      return next;
    });
  };
  const toggleCategoryL2Selection = (value: string) => {
    setSelectedCategoryL2((prev) => {
      const next = new Set(prev);
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
      }
      return next;
    });
  };
  const toggleCategoryL3Selection = (value: string) => {
    setSelectedCategoryL3((prev) => {
      const next = new Set(prev);
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
      }
      return next;
    });
  };
  const toggleCurrencySelection = (value: string) => {
    setSelectedCurrencyCodes((prev) => {
      const next = new Set(prev);
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
      }
      return next;
    });
  };
  const toggleDirectionFilter = (dir: TransactionOut["direction"]) => {
    setSelectedDirections((prev) => {
      const next = new Set(prev);
      if (next.has(dir)) {
        next.delete(dir);
      } else {
        next.add(dir);
      }
      return next;
    });
  };

  const deleteCount = deleteIds?.length ?? 0;
  const isBulkDelete = deleteCount > 1;
  const isIncomeSelected = selectedDirections.has("INCOME");
  const isExpenseSelected = selectedDirections.has("EXPENSE");
  const isTransferSelected = selectedDirections.has("TRANSFER");

  return (
    <main className="min-h-screen bg-[#F7F8FA] px-8 py-8">
      {loading && <div className="mb-4 text-sm text-muted-foreground">Загрузка...</div>}
      {error && <div className="mb-4 text-sm text-red-600">{error}</div>}

      <div className="flex flex-col gap-6 lg:flex-row">
        <aside className="w-full max-w-[340px] shrink-0">
          <div className="rounded-lg border-2 border-border/70 bg-white p-4">
            <div className="space-y-6">
              <Dialog
                open={isDialogOpen}
                onOpenChange={(open) => {
                  if (open) {
                    if (dialogMode === "edit" || dialogMode === "bulk-edit") return;
                    openCreateDialog();
                  } else {
                    closeDialog();
                  }
                }}
              >
                <DialogTrigger asChild>
                  <Button className="w-full bg-violet-600 text-white hover:bg-violet-700">
                    <Plus className="mr-2 h-4 w-4" />
                    Добавить
                  </Button>
                </DialogTrigger>
                <DialogContent
                  className="sm:max-w-[560px]"
                  onCloseAutoFocus={(event) => {
                    const lastActive = lastActiveElementRef.current;
                    if (!lastActive) return;
                    event.preventDefault();
                    if (lastActive.isConnected) {
                      lastActive.focus({ preventScroll: true });
                    }
                    lastActiveElementRef.current = null;
                  }}
                >
                  <DialogHeader>
                    <DialogTitle>
  {isBulkEdit
    ? "Редактировать транзакции"
    : isEditMode
      ? "Редактировать транзакцию"
      : "Добавить транзакцию"}
</DialogTitle>
                  </DialogHeader>

                  <form
                    className="grid gap-4"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setFormError(null);

                      if (isBulkEdit) {
                        const validationError = validateBulkEdit();
                        if (validationError) {
                          setFormError(validationError);
                          return;
                        }
                        setIsBulkEditConfirmOpen(true);
                        return;
                      }

                      if (isLoanRepayment) {
                        if (!primaryItemId) {
                          setFormError("Выберите актив, с которого производится погашение.");
                          return;
                        }
                        if (!counterpartyItemId) {
                          setFormError("Выберите обязательство.");
                          return;
                        }
                        const primaryItem = itemsById.get(primaryItemId);
                        if (primaryItem?.start_date && date < primaryItem.start_date) {
                          setFormError(
                            "Дата транзакции не может быть раньше даты начала действия выбранного актива/обязательства."
                          );
                          return;
                        }
                        const counterpartyItem = itemsById.get(counterpartyItemId);
                        if (
                          counterpartyItem?.start_date &&
                          date < counterpartyItem.start_date
                        ) {
                          setFormError(
                            "Дата транзакции не может быть раньше даты начала действия корреспондирующего актива/обязательства."
                          );
                          return;
                        }
                        if (
                          primaryItem?.currency_code &&
                          counterpartyItem?.currency_code &&
                          primaryItem.currency_code !== counterpartyItem.currency_code
                        ) {
                          setFormError(
                            "Для погашения кредита выберите актив и обязательство в одной валюте."
                          );
                          return;
                        }
                        if (!loanTotalStr.trim()) {
                          setFormError("Укажите общую сумму платежа.");
                          return;
                        }
                        const totalCents = parseRubToCents(loanTotalStr);
                        if (!Number.isFinite(totalCents) || totalCents < 0) {
                          setFormError(
                            "Введите корректную общую сумму платежа в формате 1234,56."
                          );
                          return;
                        }
                        if (!loanInterestStr.trim()) {
                          setFormError("Укажите сумму в погашение процентов.");
                          return;
                        }
                        const interestCents = parseRubToCents(loanInterestStr);
                        if (!Number.isFinite(interestCents) || interestCents < 0) {
                          setFormError(
                            "Введите корректную сумму в погашение процентов в формате 1234,56."
                          );
                          return;
                        }
                        const principalCents = totalCents - interestCents;
                        if (principalCents < 0) {
                          setFormError(
                            "Сумма в погашение процентов не может превышать общую сумму платежа."
                          );
                          return;
                        }
                        if (isPlannedTransaction) {
                          const today = new Date().toISOString().slice(0, 10);
                          if (date < today) {
                            setFormError(
                              "Плановая транзакция не может быть создана ранее текущего дня."
                            );
                            return;
                          }
                        }

                      try {
                        const payloadTransactionType = isRealizeMode
                          ? "ACTUAL"
                          : formTransactionType;
                        const transactionDate =
                          isEditMode && editingTx
                            ? mergeDateWithTime(date, editingTx.transaction_date)
                            : date;
                        const basePayload = {
                          transaction_date: transactionDate,
                          primary_item_id: primaryItemId,
                          transaction_type: payloadTransactionType,
                          description: description || null,
                          comment: comment || null,
                        };
                          const expensePayload = {
                            ...basePayload,
                            counterparty_item_id: null,
                            amount_rub: interestCents,
                            amount_counterparty: null,
                            direction: "EXPENSE" as const,
                            category_l1: cat1,
                            category_l2: cat2,
                            category_l3: cat3,
                          };
                          const transferPayload = {
                            ...basePayload,
                            counterparty_item_id: counterpartyItemId,
                            amount_rub: principalCents,
                            amount_counterparty: null,
                            direction: "TRANSFER" as const,
                            category_l1: "",
                            category_l2: "",
                            category_l3: "",
                          };

                          await Promise.all([
                            createTransaction(expensePayload),
                            createTransaction(transferPayload),
                          ]);
                          if (realizeSource) {
                            try {
                              await updateTransactionStatus(
                                realizeSource.id,
                                "REALIZED"
                              );
                            } catch (e: any) {
                              setError(
                                e?.message ??
                                  "Не удалось отметить плановую транзакцию как реализованную."
                              );
                            }
                            setRealizeSource(null);
                          }
                          closeDialog();
                          await loadAll();
                        } catch (e: any) {
                          setFormError(
                            e?.message ?? "Не удалось создать транзакции."
                          );
                        }
                        return;
                      }

                      const cents = parseRubToCents(amountStr);
                      let counterpartyCents: number | null = null;

                      if (!primaryItemId) {
                        setFormError("Выберите актив/обязательство.");
                        return;
                      }
                      const primaryItem = itemsById.get(primaryItemId);
                      if (primaryItem?.start_date && date < primaryItem.start_date) {
                        setFormError(
                          "Дата транзакции не может быть раньше даты начала действия выбранного актива/обязательства."
                        );
                        return;
                      }
                      if (!Number.isFinite(cents) || cents < 0) {
                        setFormError("Введите сумму в формате 1234,56.");
                        return;
                      }
                      if (isTransfer && !counterpartyItemId) {
                        setFormError("Выберите корреспондирующий актив.");
                        return;
                      }
                      if (isTransfer && counterpartyItemId) {
                        const counterpartyItem = itemsById.get(counterpartyItemId);
                        if (
                          counterpartyItem?.start_date &&
                          date < counterpartyItem.start_date
                        ) {
                          setFormError(
                            "Дата транзакции не может быть раньше даты начала действия корреспондирующего актива/обязательства."
                          );
                          return;
                        }
                      }
                      if (isTransfer && isCrossCurrencyTransfer) {
                        const counterCents = parseRubToCents(amountCounterpartyStr);
                        if (!Number.isFinite(counterCents) || counterCents < 0) {
                          setFormError("Введите сумму зачисления в формате 1234,56.");
                          return;
                        }
                        counterpartyCents = counterCents;
                      }
                      if (isPlannedTransaction) {
                        const today = new Date().toISOString().slice(0, 10);
                        if (date < today) {
                          setFormError(
                            "Плановая транзакция не может быть создана ранее текущего дня."
                          );
                          return;
                        }
                      }

                      try {
                        const payloadTransactionType = isRealizeMode
                          ? "ACTUAL"
                          : formTransactionType;
                        const transactionDate =
                          isEditMode && editingTx
                            ? mergeDateWithTime(date, editingTx.transaction_date)
                            : date;
                        const payload = {
                          transaction_date: transactionDate,
                          primary_item_id: primaryItemId,
                          counterparty_item_id: isTransfer
                            ? counterpartyItemId
                            : null,
                          amount_rub: cents,
                          amount_counterparty: isTransfer ? counterpartyCents : null,
                          direction,
                          transaction_type: payloadTransactionType,
                          category_l1: isTransfer ? "" : cat1,
                          category_l2: isTransfer ? "" : cat2,
                          category_l3: isTransfer ? "" : cat3,
                          description: description || null,
                          comment: comment || null,
                        };

                        if (isEditMode && editingTx) {
                          await updateTransaction(editingTx.id, payload);
                        } else {
                          await createTransaction(payload);
                        }

                        if (!isEditMode && realizeSource) {
                          try {
                            await updateTransactionStatus(
                              realizeSource.id,
                              "REALIZED"
                            );
                          } catch (e: any) {
                            setError(
                              e?.message ??
                                "Не удалось отметить плановую транзакцию как реализованную."
                            );
                          }
                          setRealizeSource(null);
                        }

                        closeDialog();
                        await loadAll();
                      } catch (e: any) {
                        setFormError(e?.message ?? "Не удалось создать транзакцию.");
                      }
                    }}
                  >
                    {formError && (
                      <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                        {formError}
                      </div>
                    )}

                    {!isBulkEdit && !isRealizeMode && (
                      <div className="grid gap-2" role="group" aria-label="Тип транзакции">
                        <div className="inline-flex w-full items-stretch overflow-hidden rounded-md border border-input bg-muted/60 p-0.5">
                          <button
                            type="button"
                            aria-pressed={isActualTransaction}
                            onClick={() => setFormTransactionType("ACTUAL")}
                            className={`${segmentedButtonBase} ${
                              isActualTransaction
                                ? "bg-violet-50 text-violet-700"
                                : "bg-white text-muted-foreground hover:bg-white"
                            }`}
                          >
                            Фактическая
                          </button>
                          <button
                            type="button"
                            aria-pressed={isPlannedTransaction}
                            onClick={() => setFormTransactionType("PLANNED")}
                            className={`${segmentedButtonBase} ${
                              isPlannedTransaction
                                ? "bg-amber-50 text-amber-700"
                                : "bg-white text-muted-foreground hover:bg-white"
                            }`}
                          >
                            Плановая
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="grid gap-2" role="group" aria-label="Характер транзакции">
                      <div className="inline-flex w-full items-stretch overflow-hidden rounded-md border border-input bg-muted/60 p-0.5">
                        <button
                          type="button"
                          aria-pressed={!isLoanRepayment && direction === "INCOME"}
                          onClick={() => {
                            setFormMode("STANDARD");
                            setDirection("INCOME");
                            setCounterpartyItemId(null);
                            applyCategorySelection(
                              "Доход от основного места работы",
                              "Гарантированные выплаты",
                              "Аванс"
                            );
                          }}
                          className={`${segmentedButtonBase} ${
                            !isLoanRepayment && direction === "INCOME"
                              ? "bg-green-50 text-green-700"
                              : "bg-white text-muted-foreground hover:bg-white"
                          }`}
                        >
                          Доход
                        </button>
                        <button
                          type="button"
                          aria-pressed={!isLoanRepayment && direction === "EXPENSE"}
                          onClick={() => {
                            setFormMode("STANDARD");
                            setDirection("EXPENSE");
                            setCounterpartyItemId(null);
                            applyCategorySelection("Питание", "Продукты питания", "-");
                          }}
                          className={`${segmentedButtonBase} ${
                            !isLoanRepayment && direction === "EXPENSE"
                              ? "bg-red-50 text-red-700"
                              : "bg-white text-muted-foreground hover:bg-white"
                          }`}
                        >
                          Расход
                        </button>
                        <button
                          type="button"
                          aria-pressed={!isLoanRepayment && direction === "TRANSFER"}
                          onClick={() => {
                            setFormMode("STANDARD");
                            setDirection("TRANSFER");
                            setCounterpartyItemId(null);
                            applyCategorySelection("", "", "");
                          }}
                          className={`${segmentedButtonBase} ${
                            !isLoanRepayment && direction === "TRANSFER"
                              ? "bg-violet-50 text-violet-700"
                              : "bg-white text-muted-foreground hover:bg-white"
                          }`}
                        >
                          Перевод
                        </button>
                        {!isEditMode && !isBulkEdit && (
                          <button
                            type="button"
                            aria-pressed={isLoanRepayment}
                            onClick={() => {
                              setFormMode("LOAN_REPAYMENT");
                              setDirection("EXPENSE");
                              applyCategorySelection("Расходы", "Продукты питания", "-");
                            }}
                            className={`${segmentedButtonBase} whitespace-normal leading-tight ${
                              isLoanRepayment
                                ? "bg-amber-50 text-amber-700"
                                : "bg-white text-muted-foreground hover:bg-white"
                            }`}
                          >
                            <span>
                              Погашение
                              <br />
                              кредитов
                            </span>
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid gap-2">
                      <Label>Дата транзакции</Label>
                      <Input
                        type="date"
                        className="border-2 border-border/70 bg-white shadow-none"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label>
                        {isLoanRepayment
                          ? "Актив, с которого производится погашение"
                          : "Актив / обязательство"}
                      </Label>
                      <Select
                        value={primaryItemId ? String(primaryItemId) : ""}
                        onValueChange={(v) => setPrimaryItemId(Number(v))}
                      >
                        <SelectTrigger className="border-2 border-border/70 bg-white shadow-none">
                          <SelectValue placeholder="Выберите" />
                        </SelectTrigger>
                        <SelectContent>
                          {primarySelectItems.map((it) => (
                            <SelectItem key={it.id} value={String(it.id)}>
                              {it.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {showCounterpartySelect && (
                      <div className="grid gap-2">
                        <Label>
                          {isLoanRepayment
                            ? "Обязательство"
                            : "Корреспондирующий актив"}
                        </Label>
                        <Select
                          value={
                            counterpartyItemId ? String(counterpartyItemId) : ""
                          }
                          onValueChange={(v) =>
                            setCounterpartyItemId(Number(v))
                          }
                        >
                          <SelectTrigger className="border-2 border-border/70 bg-white shadow-none">
                            <SelectValue placeholder="Выберите" />
                          </SelectTrigger>
                          <SelectContent>
                            {counterpartySelectItems
                              .filter((it) => it.id !== primaryItemId)
                              .map((it) => (
                                <SelectItem key={it.id} value={String(it.id)}>
                                  {it.name}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {isLoanRepayment ? (
                      <>
                        <div className="grid gap-2">
                          <Label>
                            {primaryCurrencyCode
                              ? `Общая сумма платежа (${primaryCurrencyCode})`
                              : "Общая сумма платежа"}
                          </Label>
                          <Input
                            className="border-2 border-border/70 bg-white shadow-none"
                            value={loanTotalStr}
                            onChange={(e) =>
                              setLoanTotalStr(formatRubInput(e.target.value))
                            }
                            onBlur={() =>
                              setLoanTotalStr((prev) => normalizeRubOnBlur(prev))
                            }
                            inputMode="decimal"
                            placeholder="Например: 1 234,56"
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label>
                            {primaryCurrencyCode
                              ? `Сумма в погашение процентов (${primaryCurrencyCode})`
                              : "Сумма в погашение процентов"}
                          </Label>
                          <Input
                            className="border-2 border-border/70 bg-white shadow-none"
                            value={loanInterestStr}
                            onChange={(e) =>
                              setLoanInterestStr(formatRubInput(e.target.value))
                            }
                            onBlur={() =>
                              setLoanInterestStr((prev) => normalizeRubOnBlur(prev))
                            }
                            inputMode="decimal"
                            placeholder="Например: 1 234,56"
                          />
                          <div className="text-xs text-muted-foreground">
                            Сумма в погашение основного долга: {loanPrincipalLabel}
                          </div>
                        </div>
                      </>
                    ) : isTransfer && isCrossCurrencyTransfer ? (
                      <>
                        <div className="grid gap-2">
                          <Label>
                            {`Сумма списания (${primaryCurrencyCode ?? "-"})`}
                          </Label>
                          <Input
                            className="border-2 border-border/70 bg-white shadow-none"
                            value={amountStr}
                            onChange={(e) =>
                              setAmountStr(formatRubInput(e.target.value))
                            }
                            onBlur={() =>
                              setAmountStr((prev) => normalizeRubOnBlur(prev))
                            }
                            inputMode="decimal"
                            placeholder="Например: 1 234,56"
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label>
                            {`Сумма поступления (${counterpartyCurrencyCode ?? "-"})`}
                          </Label>
                          <Input
                            className="border-2 border-border/70 bg-white shadow-none"
                            value={amountCounterpartyStr}
                            onChange={(e) =>
                              setAmountCounterpartyStr(formatRubInput(e.target.value))
                            }
                            onBlur={() =>
                              setAmountCounterpartyStr((prev) =>
                                normalizeRubOnBlur(prev)
                              )
                            }
                            inputMode="decimal"
                            placeholder="Например: 1 234,56"
                          />
                        </div>
                      </>
                    ) : (
                      <div className="grid gap-2">
                        <Label>
                          {primaryCurrencyCode
                            ? `Сумма (${primaryCurrencyCode})`
                            : "Сумма"}
                        </Label>
                        <Input
                          className="border-2 border-border/70 bg-white shadow-none"
                          value={amountStr}
                          onChange={(e) => setAmountStr(formatRubInput(e.target.value))}
                          onBlur={() =>
                            setAmountStr((prev) => normalizeRubOnBlur(prev))
                          }
                          inputMode="decimal"
                          placeholder="Например: 1 234,56"
                        />
                      </div>
                    )}
                    {!isTransfer && (
                      <div className="grid gap-2">
                        <Label>Категория</Label>
                        <div className="relative">
                          <Input
                            className="border-2 border-border/70 bg-white shadow-none"
                            value={categoryQuery}
                            onChange={(e) => {
                              setCategoryQuery(e.target.value);
                              setIsCategorySearchOpen(true);
                            }}
                            onFocus={() => setIsCategorySearchOpen(true)}
                            onBlur={() => {
                              setIsCategorySearchOpen(false);
                              setCategoryQuery(formatCategoryPath(cat1, cat2, cat3));
                            }}
                            onKeyDown={(event) => {
                              if (
                                event.key === "Enter" &&
                                isCategorySearchOpen &&
                                categoryQuery.trim()
                              ) {
                                const first = filteredCategoryPaths[0];
                                if (first) {
                                  event.preventDefault();
                                  applyCategorySelection(first.l1, first.l2, first.l3);
                                  setIsCategorySearchOpen(false);
                                }
                              }
                            }}
                            placeholder="Поиск категории"
                            type="text"
                          />
                          {isCategorySearchOpen && categoryQuery.trim() ? (
                            <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-border/70 bg-white p-1 shadow-lg">
                              {filteredCategoryPaths.length === 0 ? (
                                <div className="px-2 py-1 text-sm text-muted-foreground">
                                  Нет совпадений
                                </div>
                              ) : (
                                filteredCategoryPaths.map((option) => {
                                  const isSelected =
                                    option.l1 === cat1 &&
                                    option.l2 === cat2 &&
                                    option.l3 === cat3;
                                  return (
                                    <button
                                      key={`${option.l1}||${option.l2}||${option.l3}`}
                                      type="button"
                                      className={`flex w-full items-start rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                                        isSelected
                                          ? "bg-violet-50 text-violet-700"
                                          : "text-slate-700 hover:bg-slate-100"
                                      }`}
                                      onMouseDown={(event) => {
                                        event.preventDefault();
                                        applyCategorySelection(
                                          option.l1,
                                          option.l2,
                                          option.l3
                                        );
                                        setIsCategorySearchOpen(false);
                                      }}
                                    >
                                      {option.label}
                                    </button>
                                  );
                                })
                              )}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    )}

                    <div className="grid gap-2">
                      <Label>Описание</Label>
                      <Input
                        className="border-2 border-border/70 bg-white shadow-none"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Например: обед в кафе"
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label>Комментарий</Label>
                      <Input
                        className="border-2 border-border/70 bg-white shadow-none"
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder="Например: с коллегами"
                      />
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="border-2 border-border/70 bg-white shadow-none"
                        onClick={closeDialog}
                      >
                        Отмена
                      </Button>
                      <Button
                        type="submit"
                        className="bg-violet-600 text-white hover:bg-violet-700"
                        disabled={loading || isBulkEditing}
                      >
                        {isEditMode || isBulkEdit
                          ? "Сохранить изменения"
                          : isLoanRepayment
                            ? "Добавить транзакции"
                            : "Добавить транзакцию"}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>

              <Dialog open={isImportDialogOpen} onOpenChange={handleImportOpenChange}>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full border-2 border-border/70 bg-white shadow-none"
                  >
                    Импорт из Excel
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[520px]">
                  <DialogHeader>
                    <DialogTitle>Импорт из Excel</DialogTitle>
                  </DialogHeader>
                  <form className="grid gap-4" onSubmit={handleImportSubmit}>
                    <div className="grid gap-2">
                      <Label>Файл .xlsx</Label>
                      <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-muted-foreground">
                        Ожидаемые столбцы: {IMPORT_HEADERS.join(", ")}. Один лист,
                        ровно 4 столбца.
                      </div>
                      <Input
                        ref={importInputRef}
                        type="file"
                        accept=".xlsx"
                        className="border-2 border-border/70 bg-white shadow-none"
                        onChange={(e) => {
                          const file = e.target.files?.[0] ?? null;
                          setImportFile(file);
                          setImportError(null);
                        }}
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label>Счет</Label>
                      <Select
                        value={importItemId ? String(importItemId) : ""}
                        onValueChange={(v) => {
                          setImportItemId(Number(v));
                          setImportError(null);
                        }}
                      >
                        <SelectTrigger className="border-2 border-border/70 bg-white shadow-none">
                          <SelectValue placeholder="Выберите счет" />
                        </SelectTrigger>
                        <SelectContent>
                          {items.map((it) => (
                            <SelectItem key={it.id} value={String(it.id)}>
                              {it.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <label className="flex items-center gap-3 px-3 py-2 text-xs text-foreground">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-violet-600"
                        checked={importConfirmed}
                        onChange={(e) => setImportConfirmed(e.target.checked)}
                      />
                      Импортировать транзакции сразу в статусе "Подтвержденная"
                    </label>

                    {importError && (
                      <div className="text-sm text-red-600">{importError}</div>
                    )}

                    <div className="flex justify-end gap-2 pt-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="border-2 border-border/70 bg-white shadow-none"
                        onClick={() => handleImportOpenChange(false)}
                        disabled={isImporting}
                      >
                        Отмена
                      </Button>
                      <Button
                        type="submit"
                        className="bg-violet-600 text-white hover:bg-violet-700"
                        disabled={isImporting}
                      >
                        Импортировать
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>

              <div className="-mx-4 border-t-2 border-border/70" />

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="text-sm font-semibold text-foreground">
                    Вид транзакции
                  </div>
                  <button
                    type="button"
                    className="text-sm font-medium text-violet-600 hover:underline disabled:text-slate-300"
                    onClick={() =>
                      setSelectedDirections(
                        new Set<TransactionOut["direction"]>()
                      )
                    }
                    disabled={selectedDirections.size === 0}
                  >
                    Сбросить
                  </button>
                </div>
                <div className="inline-flex w-full items-stretch overflow-hidden rounded-md border-2 border-border/70 bg-white p-0.5">
                  <button
                    type="button"
                    aria-pressed={isIncomeSelected}
                    onClick={() => toggleDirectionFilter("INCOME")}
                    className={`${segmentedButtonBase} ${
                      isIncomeSelected
                        ? "bg-green-50 text-green-700"
                        : "bg-white text-muted-foreground hover:bg-white"
                    }`}
                  >
                    Доход
                  </button>
                  <button
                    type="button"
                    aria-pressed={isExpenseSelected}
                    onClick={() => toggleDirectionFilter("EXPENSE")}
                    className={`${segmentedButtonBase} ${
                      isExpenseSelected
                        ? "bg-red-50 text-red-700"
                        : "bg-white text-muted-foreground hover:bg-white"
                    }`}
                  >
                    Расход
                  </button>
                  <button
                    type="button"
                    aria-pressed={isTransferSelected}
                    onClick={() => toggleDirectionFilter("TRANSFER")}
                    className={`${segmentedButtonBase} ${
                      isTransferSelected
                        ? "bg-violet-50 text-violet-700"
                        : "bg-white text-muted-foreground hover:bg-white"
                    }`}
                  >
                    Перевод
                  </button>
                </div>
              </div><div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="text-sm font-semibold text-foreground">
                    Сумма транзакции
                  </div>
                  <button
                    type="button"
                    className="text-sm font-medium text-violet-600 hover:underline disabled:text-slate-300"
                    onClick={() => {
                      setAmountFrom("");
                      setAmountTo("");
                    }}
                    disabled={!amountFrom && !amountTo}
                  >
                    Сбросить
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    type="text"
                    inputMode="decimal"
                    className="h-10 w-full min-w-0 flex-1 border-2 border-border/70 bg-white shadow-none"
                    placeholder="От"
                    value={amountFrom}
                    onChange={(e) =>
                      setAmountFrom(formatRubInput(e.target.value))
                    }
                    onBlur={() =>
                      setAmountFrom((prev) => normalizeRubOnBlur(prev))
                    }
                  />
                  <span className="text-sm text-muted-foreground">—</span>
                  <Input
                    type="text"
                    inputMode="decimal"
                    className="h-10 w-full min-w-0 flex-1 border-2 border-border/70 bg-white shadow-none"
                    placeholder="До"
                    value={amountTo}
                    onChange={(e) => setAmountTo(formatRubInput(e.target.value))}
                    onBlur={() => setAmountTo((prev) => normalizeRubOnBlur(prev))}
                  />
                </div>
              </div><div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="text-sm font-semibold text-foreground">
                    Дата транзакции
                  </div>
                  <button
                    type="button"
                    className="text-sm font-medium text-violet-600 hover:underline disabled:text-slate-300"
                    onClick={() => {
                      setDateFrom("");
                      setDateTo("");
                    }}
                    disabled={!dateFrom && !dateTo}
                  >
                    Сбросить
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    type="date"
                    className={`h-10 w-full min-w-0 flex-1 border-2 border-border/70 bg-white shadow-none ${
                      dateFrom ? "text-foreground" : "text-muted-foreground"
                    }`}
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                  />
                  <span className="text-sm text-muted-foreground">—</span>
                  <Input
                    type="date"
                    className={`h-10 w-full min-w-0 flex-1 border-2 border-border/70 bg-white shadow-none ${
                      dateTo ? "text-foreground" : "text-muted-foreground"
                    }`}
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                  />
                </div>
              </div><div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setIsCurrencyFilterOpen((prev) => !prev)}
                      className="text-sm font-semibold text-foreground"
                    >
                      Валюта
                    </button>
                    <button
                      type="button"
                      aria-label="Свернуть/развернуть"
                      className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                      onClick={() => setIsCurrencyFilterOpen((prev) => !prev)}
                    >
                      <ChevronDown
                        className={`h-4 w-4 transition-transform ${
                          isCurrencyFilterOpen ? "rotate-0" : "-rotate-90"
                        }`}
                      />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="text-sm font-medium text-violet-600 hover:underline disabled:text-slate-300"
                      onClick={() => setSelectedCurrencyCodes(new Set<string>())}
                      disabled={selectedCurrencyCodes.size === 0}
                    >
                      Сбросить
                    </button>
                  </div>
                </div>

                {isCurrencyFilterOpen && (
                  <div className="space-y-2">
                    {currencyOptions.length === 0 ? (
                      <div className="text-sm text-muted-foreground">
                        Нет валют.
                      </div>
                    ) : (
                      currencyOptions.map((value) => (
                        <label
                          key={value}
                          className="flex items-center gap-3 text-sm text-foreground"
                        >
                          <input
                            type="checkbox"
                            className="h-5 w-5 accent-violet-600"
                            checked={selectedCurrencyCodes.has(value)}
                            onChange={() => toggleCurrencySelection(value)}
                          />
                          <span>{value}</span>
                        </label>
                      ))
                    )}
                  </div>
                )}
              </div><div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setIsItemsFilterOpen((prev) => !prev)}
                      className="text-sm font-semibold text-foreground"
                    >
                      Активы/обязательства
                    </button>
                    <button
                      type="button"
                      aria-label="Свернуть/развернуть"
                      className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                      onClick={() => setIsItemsFilterOpen((prev) => !prev)}
                    >
                      <ChevronDown
                        className={`h-4 w-4 transition-transform ${
                          isItemsFilterOpen ? "rotate-0" : "-rotate-90"
                        }`}
                      />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="text-sm font-medium text-violet-600 hover:underline disabled:text-slate-300"
                      onClick={() => setSelectedItemIds(new Set<number>())}
                      disabled={selectedItemIds.size === 0}
                    >
                      Сбросить
                    </button>
                  </div>
                </div>

                {isItemsFilterOpen && (
                  <div className="space-y-2">
                    {sortedItems.length === 0 ? (
                      <div className="text-sm text-muted-foreground">
                        Нет активов или обязательств.
                      </div>
                    ) : (
                      sortedItems.map((item) => {
                        const bankLogo = itemBankLogoUrl(item.id);
                        const bankName = itemBankName(item.id);
                        return (
                          <label
                            key={item.id}
                            className="flex items-center gap-3 text-sm text-foreground"
                          >
                            <input
                              type="checkbox"
                              className="h-5 w-5 accent-violet-600"
                              checked={selectedItemIds.has(item.id)}
                              onChange={(e) =>
                                toggleItemSelection(item.id, e.target.checked)
                              }
                            />
                            {bankLogo && (
                              <img
                                src={bankLogo}
                                alt={bankName || ""}
                                className="h-3.5 w-3.5 rounded border border-white/70 bg-white object-contain"
                                loading="lazy"
                              />
                            )}
                            <span>{item.name}</span>
                          </label>
                        );
                      })
                    )}
                  </div>
                )}
              </div><div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setIsCategoryL1Open((prev) => !prev)}
                      className="text-sm font-semibold text-foreground"
                    >
                      Категория 1
                    </button>
                    <button
                      type="button"
                      aria-label="Свернуть/развернуть"
                      className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                      onClick={() => setIsCategoryL1Open((prev) => !prev)}
                    >
                      <ChevronDown
                        className={`h-4 w-4 transition-transform ${
                          isCategoryL1Open ? "rotate-0" : "-rotate-90"
                        }`}
                      />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="text-sm font-medium text-violet-600 hover:underline disabled:text-slate-300"
                      onClick={() => setSelectedCategoryL1(new Set<string>())}
                      disabled={selectedCategoryL1.size === 0}
                    >
                      Сбросить
                    </button>
                  </div>
                </div>

                {isCategoryL1Open && (
                  <div className="space-y-2">
                    {categoryL1Options.length === 0 ? (
                      <div className="text-sm text-muted-foreground">
                        Нет категорий.
                      </div>
                    ) : (
                      categoryL1Options.map((value) => (
                        <label
                          key={value}
                          className="flex items-center gap-3 text-sm text-foreground"
                        >
                          <input
                            type="checkbox"
                            className="h-5 w-5 accent-violet-600"
                            checked={selectedCategoryL1.has(value)}
                            onChange={() => toggleCategoryL1Selection(value)}
                          />
                          <span>{value}</span>
                        </label>
                      ))
                    )}
                  </div>
                )}
              </div><div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setIsCategoryL2Open((prev) => !prev)}
                      className="text-sm font-semibold text-foreground"
                    >
                      Категория 2
                    </button>
                    <button
                      type="button"
                      aria-label="Свернуть/развернуть"
                      className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                      onClick={() => setIsCategoryL2Open((prev) => !prev)}
                    >
                      <ChevronDown
                        className={`h-4 w-4 transition-transform ${
                          isCategoryL2Open ? "rotate-0" : "-rotate-90"
                        }`}
                      />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="text-sm font-medium text-violet-600 hover:underline disabled:text-slate-300"
                      onClick={() => setSelectedCategoryL2(new Set<string>())}
                      disabled={selectedCategoryL2.size === 0}
                    >
                      Сбросить
                    </button>
                  </div>
                </div>

                {isCategoryL2Open && (
                  <div className="space-y-2">
                    {categoryL2Options.length === 0 ? (
                      <div className="text-sm text-muted-foreground">
                        Нет категорий.
                      </div>
                    ) : (
                      categoryL2Options.map((value) => (
                        <label
                          key={value}
                          className="flex items-center gap-3 text-sm text-foreground"
                        >
                          <input
                            type="checkbox"
                            className="h-5 w-5 accent-violet-600"
                            checked={selectedCategoryL2.has(value)}
                            onChange={() => toggleCategoryL2Selection(value)}
                          />
                          <span>{value}</span>
                        </label>
                      ))
                    )}
                  </div>
                )}
              </div><div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setIsCategoryL3Open((prev) => !prev)}
                      className="text-sm font-semibold text-foreground"
                    >
                      Категория 3
                    </button>
                    <button
                      type="button"
                      aria-label="Свернуть/развернуть"
                      className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                      onClick={() => setIsCategoryL3Open((prev) => !prev)}
                    >
                      <ChevronDown
                        className={`h-4 w-4 transition-transform ${
                          isCategoryL3Open ? "rotate-0" : "-rotate-90"
                        }`}
                      />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="text-sm font-medium text-violet-600 hover:underline disabled:text-slate-300"
                      onClick={() => setSelectedCategoryL3(new Set<string>())}
                      disabled={selectedCategoryL3.size === 0}
                    >
                      Сбросить
                    </button>
                  </div>
                </div>

                {isCategoryL3Open && (
                  <div className="space-y-2">
                    {categoryL3Options.length === 0 ? (
                      <div className="text-sm text-muted-foreground">
                        Нет категорий.
                      </div>
                    ) : (
                      categoryL3Options.map((value) => (
                        <label
                          key={value}
                          className="flex items-center gap-3 text-sm text-foreground"
                        >
                          <input
                            type="checkbox"
                            className="h-5 w-5 accent-violet-600"
                            checked={selectedCategoryL3.has(value)}
                            onChange={() => toggleCategoryL3Selection(value)}
                          />
                          <span>{value}</span>
                        </label>
                      ))
                    )}
                  </div>
                )}
              </div><div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="text-sm font-semibold text-foreground">
                    Комментарий
                  </div>
                  <button
                    type="button"
                    className="text-sm font-medium text-violet-600 hover:underline disabled:text-slate-300"
                    onClick={() => setCommentFilter("")}
                    disabled={!commentFilter}
                  >
                    Сбросить
                  </button>
                </div>
                <Input
                  type="text"
                  className="h-10 w-full border-2 border-border/70 bg-white shadow-none"
                  placeholder="Введите текст"
                  value={commentFilter}
                  onChange={(e) => setCommentFilter(e.target.value)}
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="text-sm font-semibold text-foreground">
                    Статус подтверждения
                  </div>
                  <button
                    type="button"
                    className="text-sm font-medium text-violet-600 hover:underline disabled:text-slate-300"
                    onClick={() => {
                      setShowConfirmed(true);
                      setShowUnconfirmed(true);
                    }}
                    disabled={showConfirmed && showUnconfirmed}
                  >
                    Сбросить
                  </button>
                </div>
                <div className="inline-flex w-full items-stretch overflow-hidden rounded-md border-2 border-border/70 bg-white p-0.5">
                  <button
                    type="button"
                    aria-pressed={showConfirmed}
                    onClick={() => setShowConfirmed((prev) => !prev)}
                    className={`${segmentedButtonBase} ${
                      showConfirmed
                        ? "bg-violet-50 text-violet-700"
                        : "bg-white text-muted-foreground hover:bg-white"
                    }`}
                  >
                    Подтвержденные
                  </button>
                  <button
                    type="button"
                    aria-pressed={showUnconfirmed}
                    onClick={() => setShowUnconfirmed((prev) => !prev)}
                    className={`${segmentedButtonBase} ${
                      showUnconfirmed
                        ? "bg-red-50 text-red-700"
                        : "bg-white text-muted-foreground hover:bg-white"
                    }`}
                  >
                    Неподтвержденные
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="text-sm font-semibold text-foreground">
                    Тип транзакции
                  </div>
                  <button
                    type="button"
                    className="text-sm font-medium text-violet-600 hover:underline disabled:text-slate-300"
                    onClick={() => {
                      setShowActual(defaultShowActual);
                      setShowPlanned(defaultShowPlanned);
                    }}
                    disabled={
                      showActual === defaultShowActual &&
                      showPlanned === defaultShowPlanned
                    }
                  >
                    Сбросить
                  </button>
                </div>
                <div className="inline-flex w-full items-stretch overflow-hidden rounded-md border-2 border-border/70 bg-white p-0.5">
                  <button
                    type="button"
                    aria-pressed={showActual}
                    onClick={() => setShowActual((prev) => !prev)}
                    className={`${segmentedButtonBase} ${
                      showActual
                        ? "bg-violet-50 text-violet-700"
                        : "bg-white text-muted-foreground hover:bg-white"
                    }`}
                  >
                    Фактическая
                  </button>
                  <button
                    type="button"
                    aria-pressed={showPlanned}
                    onClick={() => setShowPlanned((prev) => !prev)}
                    className={`${segmentedButtonBase} ${
                      showPlanned
                        ? "bg-amber-50 text-amber-700"
                        : "bg-white text-muted-foreground hover:bg-white"
                    }`}
                  >
                    Плановая
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="text-sm font-semibold text-foreground">
                    Статус транзакции
                  </div>
                  <button
                    type="button"
                    className="text-sm font-medium text-violet-600 hover:underline disabled:text-slate-300"
                    onClick={() => {
                      setShowActive(true);
                      setShowDeleted(false);
                    }}
                    disabled={showActive && !showDeleted}
                  >
                    Сбросить
                  </button>
                </div>
                <div className="inline-flex w-full items-stretch overflow-hidden rounded-md border-2 border-border/70 bg-white p-0.5">
                  <button
                    type="button"
                    aria-pressed={showActive}
                    onClick={() => setShowActive((prev) => !prev)}
                    className={`${segmentedButtonBase} ${
                      showActive
                        ? "bg-violet-50 text-violet-700"
                        : "bg-white text-muted-foreground hover:bg-white"
                    }`}
                  >
                    Активные
                  </button>
                  <button
                    type="button"
                    aria-pressed={showDeleted}
                    onClick={() => setShowDeleted((prev) => !prev)}
                    className={`${segmentedButtonBase} ${
                      showDeleted
                        ? "bg-slate-100 text-slate-700"
                        : "bg-white text-muted-foreground hover:bg-white"
                    }`}
                  >
                    Удаленные
                  </button>
                </div>
              </div>

              

              

              

              

              

              

              

              

              
            </div>
          </div>
        </aside>

        <div className="flex-1">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  className="h-5 w-5 accent-violet-600"
                  checked={allSelected}
                  onChange={(e) => toggleAllSelection(e.target.checked)}
                  disabled={selectableIds.length === 0}
                  aria-label="Выбрать все транзакции"
                />
                <span>Выбрать все</span>
              </div>
              {selectedVisibleCount > 1 && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    className="bg-violet-600 text-white hover:bg-violet-700"
                    onClick={handleBulkConfirm}
                    disabled={
                      isBulkConfirming ||
                      isBulkEditing ||
                      selectedConfirmableIds.length === 0
                    }
                  >
                    Подтвердить
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="border-2 border-violet-200 bg-white text-violet-700 shadow-none hover:bg-violet-50"
                    onClick={openBulkEditDialog}
                    disabled={isBulkEditing || isBulkConfirming}
                  >
                    Редактировать транзакции
                  </Button>
                  <Button
                    type="button"
                    className="bg-red-600 text-white hover:bg-red-700"
                    onClick={() => openDeleteDialog(selectedVisibleIds)}
                    disabled={isDeleting || isBulkEditing || isBulkConfirming}
                  >
                    Удалить выбранные
                  </Button>
                </div>
              )}
            </div>
            {sortedTxs.length === 0 ? (




              <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-muted-foreground">
                Нет транзакций.
              </div>
            ) : (
              sortedTxs.map((tx) => (
                <TransactionCardRow
                  key={`${tx.id}-${tx.isDeleted ? "deleted" : "active"}`}
                  tx={tx}
                  itemName={itemName}
                  itemCurrencyCode={itemCurrencyCode}
                  itemBankLogoUrl={itemBankLogoUrl}
                  itemBankName={itemBankName}
                  categoryIconFor={resolveCategoryIcon}
                  getRubEquivalentCents={getRubEquivalentCents}
                  isSelected={!tx.isDeleted && selectedTxIds.has(tx.id)}
                  onToggleSelection={toggleTxSelection}
                  onCreateFrom={openCreateFromDialog}
                  onRealize={openRealizeDialog}
                  onEdit={openEditDialog}
                  onDelete={(id) => openDeleteDialog([id])}
                  isDeleting={isDeleting}
                  onConfirm={handleConfirmStatus}
                  isConfirming={
                    confirmingTxId === tx.id ||
                    (isBulkConfirming && selectedConfirmableIdSet.has(tx.id))
                  }
                />
              ))
            )}
          </div>
        </div>
      </div>

      <AlertDialog
        open={isBulkEditConfirmOpen}
        onOpenChange={(open) => {
          if (!open) setIsBulkEditConfirmOpen(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Применить изменения ко всем выбранным транзакциям?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Изменения из формы будут применены ко всем выбранным транзакциям.
              Подтвердите действие перед сохранением.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkEditing}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="bg-violet-600 text-white hover:bg-violet-700"
              disabled={isBulkEditing}
              onClick={applyBulkEdit}
            >
              Подтвердить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deleteCount > 0}
        onOpenChange={(open) => {
          if (!open) setDeleteIds(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isBulkDelete ? "Удалить выбранные транзакции?" : "Удалить транзакцию?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Транзакции будут перемещены в список удаленных.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>

            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={isDeleting}
              onClick={async () => {
                if (!deleteIds || deleteIds.length === 0) return;
                const idsToDelete = deleteIds;
                setIsDeleting(true);
                try {
                  await Promise.all(idsToDelete.map((id) => deleteTransaction(id)));
                  setSelectedTxIds((prev) => {
                    if (prev.size === 0) return prev;
                    const next = new Set(prev);
                    idsToDelete.forEach((id) => next.delete(id));
                    return next;
                  });
                  setDeleteIds(null);
                  await loadAll();
                } catch (e: any) {
                  setError(e?.message ?? "Не удалось удалить транзакции.");
                  setDeleteIds(null);
                } finally {
                  setIsDeleting(false);
                }
              }}
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

export default function TransactionsPage() {
  return <TransactionsView view="actual" />;
}
