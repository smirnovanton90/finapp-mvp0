"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type FormEvent,
} from "react";
import { useSession } from "next-auth/react";
import { useAccountingStart } from "@/components/accounting-start-context";
import { useSearchParams } from "next/navigation";
import { useSidebar } from "@/components/ui/sidebar-context";
import { cn } from "@/lib/utils";
import { ACCENT, ACCENT_FILL_MEDIUM, SIDEBAR_BG, SIDEBAR_TEXT_INACTIVE, SIDEBAR_TEXT_ACTIVE, PLACEHOLDER_COLOR, ACTIVE_TEXT } from "@/lib/colors";
import {
  ArrowRight,
  ArrowLeft,
  Ban,
  BadgeCheck,
  Briefcase,
  Building2,
  Calendar,
  ChevronDown,
  ChevronLeft,
  CheckCircle2,
  CircleDashed,
  Coins,
  Factory,
  FileDown,
  FileText,
  Filter,
  Folder,
  GraduationCap,
  HeartPulse,
  Home,
  Landmark,
  MessageSquare,
  MoreVertical,
  Pencil,
  Plus,
  QrCode,
  Receipt,
  Shield,
  ShoppingCart,
  Sparkles,
  Trophy,
  Trash2,
  Truck,
  Upload,
  User,
  Users,
  Wallet,
  Wifi,
  Zap,
  type LucideIcon,
} from "lucide-react";
import * as XLSX from "xlsx";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import jsQR from "jsqr";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthInput } from "@/components/ui/auth-input";
import { Label } from "@/components/ui/label";
import { Tooltip } from "@/components/ui/tooltip";
import { ItemSelector } from "@/components/item-selector";
import { CounterpartySelector } from "@/components/counterparty-selector";
import { CategorySelector } from "@/components/category-selector";
import { SegmentedSelector } from "@/components/ui/segmented-selector";
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
  fetchCategories,
  fetchCounterparties,
  fetchCounterpartyIndustries,
  fetchItems,
  fetchFxRatesBatch,
  fetchTransactions,
  fetchTransactionsPage,
  BankOut,
  CounterpartyOut,
  CounterpartyIndustryOut,
  FxRateOut,
  ItemOut,
  TransactionCreate,
  TransactionOut,
  updateTransaction,
  updateTransactionStatus,
  API_BASE,
} from "@/lib/api";
import { buildItemTransactionCounts, getEffectiveItemKind } from "@/lib/item-utils";
import { buildCounterpartyTransactionCounts } from "@/lib/counterparty-utils";
import { getItemTypeLabel } from "@/lib/item-types";
import {
  buildCategoryLookup,
  buildCategoryMaps,
  CategoryNode,
} from "@/lib/categories";
import {
  CATEGORY_ICON_BY_NAME,
  CATEGORY_ICON_FALLBACK,
} from "@/lib/category-icons";
import { useOnboarding } from "@/components/onboarding-context";

type TransactionsViewMode = "actual" | "planning";

type TransactionCard = TransactionOut & { isDeleted?: boolean };

type TransactionFormMode = "STANDARD" | "LOAN_REPAYMENT";

type BulkEditBaseline = {
  date: string;
  direction: TransactionOut["direction"];
  primaryItemId: number | null;
  counterpartyItemId: number | null;
  counterpartyId: number | null;
  amountStr: string;
  amountCounterpartyStr: string;
  primaryQuantityLots: string;
  counterpartyQuantityLots: string;
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

type PdfTextItem = {
  str: string;
  transform: number[];
};

type PdfLineItem = {
  text: string;
  x: number;
  y: number;
};

type ParsedPdfRow = {
  dateTime: string;
  category: string;
  descriptionLines: string[];
  amountText: string;
};

const PAGE_SIZE = 50;
GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();
const IMPORT_BANK_READY_OGRN = "1027739642281";
const IMPORT_BANK_IN_PROGRESS_OGRN = "1027700132195";
const IMPORT_BANK_ALFA_OGRN = "1027700067328";
const IMPORT_BANK_PDF_OGRNS = new Set([
  IMPORT_BANK_IN_PROGRESS_OGRN,
  IMPORT_BANK_ALFA_OGRN,
]);
const IMPORT_BANK_OGRNS = new Set([
  IMPORT_BANK_READY_OGRN,
  IMPORT_BANK_IN_PROGRESS_OGRN,
  IMPORT_BANK_ALFA_OGRN,
]);
const PDF_AMOUNT_REGEX = /[+\-\u2212]?\d{1,3}(?:[ \u00A0]\d{3})*(?:,\d{2})/g;
const PDF_DATE_TIME_REGEX = /\b\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2}\b/;
const PDF_DATE_REGEX = /^\d{2}\.\d{2}\.\d{4}$/;
const EMPTY_NUMBER_ARRAY: number[] = [];
const EMPTY_DIRECTION_ARRAY: TransactionOut["direction"][] = [];
const MOEX_TYPE_CODES = new Set([
  "securities",
  "bonds",
  "etf",
  "bpif",
  "pif",
  "precious_metals",
]);
const INDUSTRY_ICON_BY_ID: Record<number, LucideIcon> = {
  1: Zap,
  2: Truck,
  3: ShoppingCart,
  4: Shield,
  5: Landmark,
  6: Wifi,
  7: Building2,
  8: GraduationCap,
  9: HeartPulse,
  10: Briefcase,
  11: Trophy,
  12: Home,
};

function getLegalDefaultIcon(industryId: number | null): LucideIcon {
  if (!industryId) return Factory;
  return INDUSTRY_ICON_BY_ID[industryId] ?? Factory;
}

function isMoexItem(item?: ItemOut | null) {
  if (!item) return false;
  if (item.instrument_id) return true;
  return MOEX_TYPE_CODES.has(item.type_code);
}

function buildCounterpartyName(counterparty: CounterpartyOut) {
  if (counterparty.entity_type !== "PERSON") return counterparty.name;
  const parts = [
    counterparty.last_name,
    counterparty.first_name,
    counterparty.middle_name,
  ].filter(Boolean);
  return parts.join(" ") || counterparty.name;
}

function normalizeCounterpartySearch(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("ru");
}


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
  "Дата платежа",
  "Номер карты",
  "Статус",
  "Сумма операции",
  "Валюта операции",
  "Сумма платежа",
  "Валюта платежа",
  "Кэшбэк",
  "Категория",
  "MCC",
  "Описание",
  "Бонусы (включая кэшбэк)",
  "Округление на инвесткопилку",
  "Сумма операции с округлением",
];

const MCC_CATEGORY_BY_CODE: Record<string, string> = {
  "4111": "Транспорт",
  "4121": "Транспорт",
  "4131": "Транспорт",
  "4511": "Транспорт",
  "4784": "Отпуска",
  "4789": "Транспорт",
  "4812": "Интернет и связь",
  "4814": "Интернет и связь",
  "4821": "Интернет и связь",
  "4829": "Интернет и связь",
  "4899": "Интернет и связь",
  "4900": "Хозяйственные расходы",
  "5411": "Питание",
  "5422": "Питание",
  "5441": "Питание",
  "5451": "Питание",
  "5462": "Питание",
  "5499": "Питание",
  "5511": "Автомобиль",
  "5521": "Автомобиль",
  "5532": "Автомобиль",
  "5533": "Автомобиль",
  "5541": "Автомобиль",
  "5542": "Автомобиль",
  "5592": "Автомобиль",
  "5598": "Автомобиль",
  "5599": "Автомобиль",
  "5811": "Питание",
  "5812": "Питание",
  "5813": "Питание",
  "5814": "Питание",
  "5912": "Здоровье",
  "5921": "Вредные привычки",
  "5947": "Подарки",
  "5977": "Здоровье",
  "5995": "Домашние животные",
  "6300": "Страхование",
  "7011": "Отпуска",
  "7012": "Отпуска",
  "7032": "Отпуска",
  "7033": "Отпуска",
  "7230": "Уход за собой",
  "7297": "Уход за собой",
  "7298": "Уход за собой",
  "7299": "Уход за собой",
  "7399": "Услуги",
  "7511": "Автомобиль",
  "7512": "Автомобиль",
  "7531": "Автомобиль",
  "7534": "Автомобиль",
  "7538": "Автомобиль",
  "7542": "Автомобиль",
  "7549": "Автомобиль",
  "7622": "Электроника",
  "7623": "Электроника",
  "7631": "Электроника",
  "7641": "Электроника",
  "7812": "Отдых и развлечения",
  "7832": "Отдых и развлечения",
  "7911": "Отдых и развлечения",
  "7922": "Отдых и развлечения",
  "7929": "Отдых и развлечения",
  "7932": "Отдых и развлечения",
  "7991": "Отдых и развлечения",
  "7993": "Отдых и развлечения",
  "7994": "Отдых и развлечения",
  "7996": "Отдых и развлечения",
  "7997": "Отдых и развлечения",
  "7999": "Отдых и развлечения",
  "8011": "Здоровье",
  "8021": "Здоровье",
  "8031": "Здоровье",
  "8041": "Здоровье",
  "8042": "Здоровье",
  "8043": "Здоровье",
  "8049": "Здоровье",
  "8050": "Здоровье",
  "8062": "Здоровье",
  "8071": "Здоровье",
  "8099": "Здоровье",
  "5611": "Одежда и обувь",
  "5621": "Одежда и обувь",
  "5631": "Одежда и обувь",
  "5641": "Одежда и обувь",
  "5651": "Одежда и обувь",
  "5661": "Одежда и обувь",
  "5691": "Одежда и обувь",
  "5699": "Одежда и обувь",
  "5732": "Электроника",
  "5734": "Электроника",
};

const MCC_CATEGORY_RANGES: Array<{ from: number; to: number; category: string }> =
  [
    { from: 3000, to: 3299, category: "Отпуска" },
    { from: 3300, to: 3499, category: "Отпуска" },
    { from: 3500, to: 3999, category: "Отпуска" },
  ];

function normalizeHeader(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("ru");
}

function normalizeCategory(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("ru");
}

function resolveCategoryFromMcc(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const code = raw.replace(/\D/g, "");
  if (!code) return null;
  const directMatch = MCC_CATEGORY_BY_CODE[code];
  if (directMatch) return directMatch;
  const numericCode = Number(code);
  if (!Number.isFinite(numericCode)) return null;
  const rangeMatch = MCC_CATEGORY_RANGES.find(
    (range) => numericCode >= range.from && numericCode <= range.to
  );
  return rangeMatch ? rangeMatch.category : null;
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

function normalizePdfText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function buildPdfLines(items: PdfTextItem[]) {
  const lines: Array<{ y: number; items: PdfLineItem[] }> = [];
  const tolerance = 2;

  items.forEach((item) => {
    const text = item.str?.trim();
    if (!text) return;
    const x = item.transform[4];
    const y = item.transform[5];
    let line = lines.find((candidate) => Math.abs(candidate.y - y) <= tolerance);
    if (!line) {
      line = { y, items: [] };
      lines.push(line);
    }
    line.items.push({ text: item.str, x, y });
  });

  lines.forEach((line) => line.items.sort((a, b) => a.x - b.x));
  lines.sort((a, b) => b.y - a.y);
  return lines;
}

function extractPdfAmountCandidates(items: PdfLineItem[], pageWidth: number) {
  const rightStart = pageWidth * 0.68;
  const candidates: Array<{ text: string; x: number }> = [];

  items.forEach((item) => {
    if (item.x < rightStart) return;
    const matches = item.text.match(PDF_AMOUNT_REGEX);
    if (!matches) return;
    matches.forEach((match) => {
      candidates.push({ text: match, x: item.x });
    });
  });

  return candidates.sort((a, b) => a.x - b.x);
}

function pickPdfAmountText(candidates: Array<{ text: string; x: number }>) {
  if (candidates.length === 0) return "";
  if (candidates.length >= 2) return candidates[candidates.length - 2].text;
  return candidates[candidates.length - 1].text;
}

function extractPdfCategory(items: PdfLineItem[], pageWidth: number) {
  const middleStart = pageWidth * 0.28;
  const middleEnd = pageWidth * 0.68;
  const text = items
    .filter((item) => item.x >= middleStart && item.x < middleEnd)
    .map((item) => item.text)
    .join(" ");
  return normalizePdfText(text);
}

function parsePdfAmount(value: string) {
  const normalized = value
    .replace(/[ \u00A0]/g, "")
    .replace(",", ".")
    .replace(/\u2212/g, "-");
  if (!normalized) return null;
  const numberValue = Number(normalized.replace(/[+-]/g, ""));
  if (!Number.isFinite(numberValue)) return null;
  return {
    amountCents: Math.round(Math.abs(numberValue) * 100),
    isIncome: normalized.startsWith("+"),
  };
}

function extractPdfRightAmountText(items: PdfLineItem[], pageWidth: number) {
  const rightStart = pageWidth * 0.72;
  const candidates: Array<{ text: string; x: number }> = [];

  items.forEach((item) => {
    if (item.x < rightStart) return;
    const matches = item.text.match(PDF_AMOUNT_REGEX);
    if (!matches) return;
    matches.forEach((match) => {
      candidates.push({ text: match, x: item.x });
    });
  });

  if (candidates.length === 0) return "";
  candidates.sort((a, b) => a.x - b.x);
  return candidates[candidates.length - 1].text;
}

async function parsePdfStatementRows(file: File): Promise<ParsedPdfRow[]> {
  const buffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: buffer }).promise;
  const rows: ParsedPdfRow[] = [];

  for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
    const page = await pdf.getPage(pageIndex);
    const viewport = page.getViewport({ scale: 1 });
    const textContent = await page.getTextContent();
    const rawItems = textContent.items as unknown[];
    const items = rawItems.filter((item): item is PdfTextItem => {
      if (!item || typeof item !== "object") return false;
      const candidate = item as PdfTextItem;
      return typeof candidate.str === "string" && Array.isArray(candidate.transform);
    });
    const lines = buildPdfLines(items);

    let inOperations = false;
    let currentRow: ParsedPdfRow | null = null;

    const stopPhrases = [
      "продолжение на следующей странице",
      "дата формирования документа",
      "для проверки подлинности документа",
      "qr-код",
      "документ подписан электронной подписью",
      "сведения о сертификате",
      "генеральная лицензия",
      "проверка квалифицированной электронной подписи",
      "действителен до",
    ];

    lines.forEach((line) => {
      const lineText = normalizePdfText(
        line.items.map((item) => item.text).join(" ")
      );
      if (!lineText) return;
      const lineTextLower = lineText.toLowerCase();

      const isHeaderLine =
        lineTextLower.includes("дата операции") ||
        lineTextLower.includes("категория");
      if (
        lineTextLower.includes("расшифровка операций") ||
        isHeaderLine
      ) {
        inOperations = true;
        return;
      }
      if (!inOperations) return;

      if (stopPhrases.some((phrase) => lineTextLower.includes(phrase))) {
        if (currentRow) rows.push(currentRow);
        currentRow = null;
        inOperations = false;
        return;
      }
      if (lineTextLower.startsWith("выписка по платежному счету")) return;
      if (lineTextLower.startsWith("страница")) return;
      if (
        lineTextLower.includes("дата обработки") ||
        lineTextLower.includes("код авторизации") ||
        lineTextLower.includes("сумма в валюте") ||
        lineTextLower.includes("остаток средств")
      ) {
        return;
      }

      const dateTimeMatch = lineText.match(PDF_DATE_TIME_REGEX);
      if (dateTimeMatch) {
        if (currentRow) rows.push(currentRow);
        const amountCandidates = extractPdfAmountCandidates(
          line.items,
          viewport.width
        );
        const rightStart = viewport.width * 0.68;
        const hasPlusSign = line.items.some(
          (item) => item.x >= rightStart && item.text.trim() === "+"
        );
        const hasMinusSign = line.items.some(
          (item) => item.x >= rightStart && item.text.trim() === "-"
        );
        let amountText = pickPdfAmountText(amountCandidates);
        if (
          amountText &&
          !amountText.startsWith("+") &&
          !amountText.startsWith("-")
        ) {
          if (hasPlusSign) {
            amountText = `+${amountText}`;
          } else if (hasMinusSign) {
            amountText = `-${amountText}`;
          }
        }
        const category = extractPdfCategory(line.items, viewport.width);
        currentRow = {
          dateTime: dateTimeMatch[0],
          category,
          descriptionLines: [],
          amountText,
        };
        return;
      }

      if (!currentRow) return;
      if (PDF_DATE_REGEX.test(lineText)) return;

      currentRow.descriptionLines.push(lineText);
    });

    if (currentRow) rows.push(currentRow);
  }

  return rows;
}

async function parseAlfaStatementRows(file: File): Promise<ParsedPdfRow[]> {
  const buffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: buffer }).promise;
  const rows: ParsedPdfRow[] = [];

  for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
    const page = await pdf.getPage(pageIndex);
    const viewport = page.getViewport({ scale: 1 });
    const textContent = await page.getTextContent();
    const rawItems = textContent.items as unknown[];
    const items = rawItems.filter((item): item is PdfTextItem => {
      if (!item || typeof item !== "object") return false;
      const candidate = item as PdfTextItem;
      return typeof candidate.str === "string" && Array.isArray(candidate.transform);
    });
    const lines = buildPdfLines(items);

    const dateMaxX = viewport.width * 0.22;
    const codeMaxX = viewport.width * 0.38;
    const amountMinX = viewport.width * 0.72;

    let inOperations = false;
    let currentRow: ParsedPdfRow | null = null;

    const stopPhrases = [
      "альфа-банк",
      "alfabank.ru",
      "подпись сотрудника",
      "уполномоченное лицо",
      "телефон",
      "e-mail",
    ];

    lines.forEach((line) => {
      const lineText = normalizePdfText(
        line.items.map((item) => item.text).join(" ")
      );
      if (!lineText) return;
      const lineTextLower = lineText.toLowerCase();

      const isHeaderLine =
        lineTextLower.includes("дата проводки") ||
        lineTextLower.includes("код операции") ||
        lineTextLower.includes("описание");
      if (lineTextLower.includes("операции по счету") || isHeaderLine) {
        inOperations = true;
        return;
      }
      if (!inOperations) {
        const amountMatches = lineText.match(PDF_AMOUNT_REGEX);
        const hasDate = /^\d{2}\.\d{2}\.\d{4}\b/.test(lineText);
        if (!hasDate || !amountMatches) return;
        inOperations = true;
      }

      if (lineTextLower.startsWith("страница")) return;
      if (lineTextLower.startsWith("hold")) {
        if (currentRow) rows.push(currentRow);
        currentRow = null;
        inOperations = false;
        return;
      }

      if (stopPhrases.some((phrase) => lineTextLower.includes(phrase))) {
        if (currentRow) rows.push(currentRow);
        currentRow = null;
        inOperations = false;
        return;
      }

      const dateText = normalizePdfText(
        line.items
          .filter((item) => item.x <= dateMaxX)
          .map((item) => item.text)
          .join(" ")
      );
      const dateMatch =
        dateText.match(PDF_DATE_REGEX) ||
        lineText.match(/^(\d{2}\.\d{2}\.\d{4})\b/);

      if (dateMatch) {
        if (currentRow) rows.push(currentRow);

        let codeText = normalizePdfText(
          line.items
            .filter((item) => item.x > dateMaxX && item.x <= codeMaxX)
            .map((item) => item.text)
            .join(" ")
        );
        let descriptionText = normalizePdfText(
          line.items
            .filter((item) => item.x > codeMaxX && item.x < amountMinX)
            .map((item) => item.text)
            .join(" ")
        );
        let amountText = extractPdfRightAmountText(
          line.items,
          viewport.width
        );
        if (!amountText) {
          const amountMatches = lineText.match(PDF_AMOUNT_REGEX);
          if (amountMatches && amountMatches.length > 0) {
            amountText = amountMatches[amountMatches.length - 1];
          }
        }

        if (!codeText || !descriptionText) {
          const lineDate = dateMatch[0];
          const lineWithoutDate = lineText.replace(lineDate, "").trim();
          const parts = lineWithoutDate.split(" ");
          const codeCandidate = parts[0] ?? "";
          if (!codeText) codeText = codeCandidate;
          if (!descriptionText) {
            const rawDescription = lineWithoutDate
              .slice(codeCandidate.length)
              .trim();
            descriptionText = rawDescription
              .replace(
                /\s*[+\-\u2212]?\d{1,3}(?:[ \u00A0]\d{3})*(?:,\d{2})\s*RUR\s*$/i,
                ""
              )
              .trim();
          }
        }

        const normalizedCode = codeText.replace(/\s+/g, "").toUpperCase();
        if (
          normalizedCode.startsWith("WCRG") ||
          lineText.toUpperCase().includes("WCRG")
        ) {
          currentRow = null;
          return;
        }

        if (amountText) {
          const normalizedAmount = amountText.replace(/\u2212/g, "-");
          const hasNegativeSign =
            normalizedAmount.startsWith("-") ||
            line.items.some((item) => {
              if (item.x < amountMinX) return false;
              const marker = item.text.trim();
              return marker === "-" || marker === "−";
            }) ||
            /[-\u2212]\s*\d/.test(lineText);
          if (!/^[+-]/.test(normalizedAmount)) {
            amountText = hasNegativeSign
              ? `-${normalizedAmount}`
              : `+${normalizedAmount}`;
          } else if (hasNegativeSign && !normalizedAmount.startsWith("-")) {
            amountText = `-${normalizedAmount.replace(/^[+-]/, "")}`;
          } else {
            amountText = normalizedAmount;
          }
        }

        currentRow = {
          dateTime: dateMatch[0],
          category: "",
          descriptionLines: [],
          amountText,
        };
        if (descriptionText) {
          currentRow.descriptionLines.push(descriptionText);
        }
        return;
      }

      if (!currentRow) return;
      const descriptionText = normalizePdfText(
        line.items
          .filter((item) => item.x > codeMaxX && item.x < amountMinX)
          .map((item) => item.text)
          .join(" ")
      );
      if (descriptionText) {
        currentRow.descriptionLines.push(descriptionText);
      }
    });

    if (currentRow) rows.push(currentRow);
  }

  return rows;
}

function formatDateForApi(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getYesterdayDateKey() {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return formatDateForApi(date);
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

function parseLots(input: string): number {
  const trimmed = input.trim();
  if (!trimmed) return NaN;
  const cleaned = trimmed.replace(/\s/g, "");
  const value = Number(cleaned);
  if (!Number.isFinite(value) || !Number.isInteger(value)) return NaN;
  return value;
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

function formatAmountForInput(valueInCents: number): string {
  const value = valueInCents / 100;
  const valueStr = value.toFixed(2);
  const parts = valueStr.split(".");
  const intPart = parts[0] || "0";
  const decPart = parts[1] || "00";
  
  // Форматируем целую часть с разделителями тысяч
  const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  
  return `${formattedInt},${decPart}`;
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

type ParsedReceiptData = {
  date: string;
  amount: number;
  fn: string;
  fp: string;
  i: string;
};

async function decodeQRCode(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Не удалось создать контекст canvas"));
          return;
        }
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        if (code) {
          resolve(code.data);
        } else {
          reject(new Error("Не удалось декодировать QR-код. Убедитесь, что изображение содержит QR-код."));
        }
      } catch (error: any) {
        reject(new Error(error?.message || "Не удалось декодировать QR-код. Убедитесь, что изображение содержит QR-код."));
      }
    };
    img.onerror = () => {
      reject(new Error("Ошибка при загрузке изображения"));
    };
    const reader = new FileReader();
    reader.onload = (e) => {
      img.src = e.target?.result as string;
    };
    reader.onerror = () => {
      reject(new Error("Ошибка при чтении файла"));
    };
    reader.readAsDataURL(file);
  });
}

function parseReceiptQR(qrData: string): ParsedReceiptData | null {
  // Формат ФНС: t=YYYYMMDDTHHMM&s=SUM&fn=FN&i=INVOICE&fp=FP&n=N
  const params = new URLSearchParams(qrData);
  const t = params.get("t");
  const s = params.get("s");
  const fn = params.get("fn");
  const fp = params.get("fp");
  const i = params.get("i");

  if (!t || !s) return null;

  // Парсинг даты: YYYYMMDDTHHMM -> YYYY-MM-DD
  const year = t.slice(0, 4);
  const month = t.slice(4, 6);
  const day = t.slice(6, 8);
  const date = `${year}-${month}-${day}`;

  // Парсинг суммы
  const amount = parseFloat(s);
  if (isNaN(amount) || amount <= 0) return null;

  return {
    date,
    amount: Math.round(amount * 100), // конвертируем в копейки
    fn: fn || "",
    fp: fp || "",
    i: i || "",
  };
}

function TransactionCardRow({
  tx,
  counterparty,
  itemName,
  itemCurrencyCode,
  itemBankLogoUrl,
  itemBankName,
  categoryIconForId,
  categoryLinesForId,
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
  counterparty: CounterpartyOut | null;
  itemName: (id: number | null | undefined) => string;
  itemCurrencyCode: (id: number | null | undefined) => string;
  itemBankLogoUrl: (id: number | null | undefined) => string | null;
  itemBankName: (id: number | null | undefined) => string;
  categoryIconForId: (
    categoryId: number | null
  ) => ComponentType<{ className?: string; strokeWidth?: number }>;
  categoryLinesForId: (
    categoryId: number | null
  ) => [string, string, string];
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
  const primaryDisplayId = tx.primary_card_item_id ?? tx.primary_item_id;
  const counterpartyDisplayId =
    tx.counterparty_card_item_id ?? tx.counterparty_item_id;

  const amountValue = formatAmount(tx.amount_rub);
  const counterpartyAmountValue = formatAmount(tx.amount_counterparty ?? tx.amount_rub);
  const currencyCode = itemCurrencyCode(primaryDisplayId);
  const rubEquivalent = getRubEquivalentCents(tx, currencyCode);
  const showRubEquivalent =
    !isTransfer && currencyCode && currencyCode !== "RUB" && rubEquivalent !== null;
  const primaryCurrency = itemCurrencyCode(primaryDisplayId);
  const counterpartyCurrency = itemCurrencyCode(counterpartyDisplayId);
  const primaryBankLogo = itemBankLogoUrl(primaryDisplayId);
  const primaryBankName = itemBankName(primaryDisplayId);
  const counterpartyBankLogo = itemBankLogoUrl(counterpartyDisplayId);
  const counterpartyBankName = itemBankName(counterpartyDisplayId);
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

  /* Transparent / subtle fill so APP_BG_GRADIENT shows through; no opaque card background */
  const cardBg = tx.isDeleted ? "bg-white/5" : "bg-transparent";
  const defaultBorderClass = "border border-[rgba(93,95,215,0.4)]";
  const plannedBorderClass =
    !tx.isDeleted && isPlanned
      ? isExpense
        ? "border-2 border-dashed border-rose-300"
        : isIncome
          ? "border-2 border-dashed border-emerald-500"
          : "border-2 border-dashed border-violet-300"
      : "";

  const textClass = tx.isDeleted ? "text-muted-foreground" : "text-foreground";

  const mutedTextClass = tx.isDeleted ? "text-muted-foreground" : "text-muted-foreground";
  const chainTextClass = tx.isDeleted ? "text-muted-foreground" : "text-violet-700";

  const amountClass = tx.isDeleted
    ? "text-muted-foreground"
    : isIncome
      ? "text-emerald-600"
      : isExpense
        ? "text-rose-600"
        : "text-foreground";
  const transferNegativeClass = tx.isDeleted ? "text-muted-foreground" : "text-rose-600";
  const transferPositiveClass = tx.isDeleted ? "text-muted-foreground" : "text-emerald-600";

  const actionTextClass = tx.isDeleted ? "text-muted-foreground" : "text-foreground";
  const actionHoverClass = tx.isDeleted ? "" : "hover:text-foreground";
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
  const counterpartyName = counterparty ? buildCounterpartyName(counterparty) : null;
  const rawCounterpartyLogoUrl =
    counterparty?.entity_type === "PERSON"
      ? counterparty?.photo_url ?? null
      : counterparty?.logo_url ?? null;
  // Преобразуем относительные URL в абсолютные
  const counterpartyLogoUrl = rawCounterpartyLogoUrl
    ? rawCounterpartyLogoUrl.startsWith("http://") || rawCounterpartyLogoUrl.startsWith("https://")
      ? rawCounterpartyLogoUrl
      : rawCounterpartyLogoUrl.startsWith("/")
        ? `${API_BASE}${rawCounterpartyLogoUrl}`
        : `${API_BASE}/${rawCounterpartyLogoUrl}`
    : null;
  const CounterpartyFallbackIcon =
    counterparty?.entity_type === "PERSON"
      ? User
      : getLegalDefaultIcon(counterparty?.industry_id ?? null);
  const counterpartyIconTone = tx.isDeleted ? "text-slate-400" : "text-muted-foreground";

  const categoryLines = categoryLinesForId(tx.category_id);
  const CategoryIcon = categoryIconForId(tx.category_id);

  const checkboxDisabled = tx.isDeleted || isDeleting;

  return (
    <div
      className={`flex items-stretch overflow-hidden rounded-lg transition-transform duration-200 ease-out hover:-translate-y-1 ${cardBg} ${defaultBorderClass} ${plannedBorderClass}`}
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
                    {itemCurrencyCode(primaryDisplayId)}
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
                  {itemName(primaryDisplayId)}
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
                    {itemCurrencyCode(counterpartyDisplayId)}
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
                  {itemName(counterpartyDisplayId)}
                </div>
              </div>
            </div>

            <div className="min-w-[120px] flex-1">
              <div className="space-y-1">
                {counterpartyName && (
                  <div className="flex items-center gap-2">
                    {counterpartyLogoUrl ? (
                      <img
                        src={counterpartyLogoUrl}
                        alt=""
                        className="h-4 w-4 shrink-0 rounded bg-white object-contain"
                        loading="lazy"
                      />
                    ) : (
                      <div
                        className={`flex h-4 w-4 items-center justify-center rounded bg-white ${counterpartyIconTone}`}
                      >
                        <CounterpartyFallbackIcon
                          className="h-3 w-3"
                          aria-hidden="true"
                        />
                      </div>
                    )}
                    <div
                      className={`text-xs font-semibold break-words whitespace-normal ${textClass}`}
                    >
                      {counterpartyName}
                    </div>
                  </div>
                )}
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
                  {itemName(primaryDisplayId)}
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
                {counterpartyName && (
                  <div className="flex items-center gap-2">
                    {counterpartyLogoUrl ? (
                      <img
                        src={counterpartyLogoUrl}
                        alt=""
                        className="h-4 w-4 shrink-0 rounded bg-white object-contain"
                        loading="lazy"
                      />
                    ) : (
                      <div
                        className={`flex h-4 w-4 items-center justify-center rounded bg-white ${counterpartyIconTone}`}
                      >
                        <CounterpartyFallbackIcon
                          className="h-3 w-3"
                          aria-hidden="true"
                        />
                      </div>
                    )}
                    <div
                      className={`text-xs font-semibold break-words whitespace-normal ${textClass}`}
                    >
                      {counterpartyName}
                    </div>
                  </div>
                )}
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
            <Tooltip content="Удалена">
              <span className="inline-flex items-center text-slate-400" aria-label="Удалена">
                <Ban className="h-4 w-4" />
              </span>
            </Tooltip>
          )}

          <div className="flex flex-col items-center gap-1">
            <Tooltip content={statusHint}>
              <Button
                variant="ghost"
                size="icon-sm"
                className={`hover:bg-transparent ${statusBaseClass} ${statusHoverClass}`}
                aria-label={statusHint}
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
            </Tooltip>
            {canRealize && (
              <Tooltip content="Реализовать">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className={`hover:bg-transparent ${actionTextClass} ${actionHoverClass}`}
                  aria-label="Реализовать"
                  onClick={(event) =>
                    onRealize(tx, event.currentTarget as HTMLElement)
                  }
                  disabled={isRealizeDisabled}
                >
                  <Sparkles className="h-4 w-4" />
                </Button>
              </Tooltip>
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

function TransactionsView({
  view = "actual",
}: {
  view?: TransactionsViewMode;
}) {
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const { accountingStartDate } = useAccountingStart();
  const { activeStep, isWizardOpen } = useOnboarding();
  const { isFilterPanelCollapsed, toggleFilterPanel, isCollapsed } = useSidebar();
  const isPlanningView = view === "planning";
  const defaultShowActual = !isPlanningView;
  const defaultShowPlannedRealized = isPlanningView;
  const defaultShowPlannedUnrealized = isPlanningView;
  const isOverduePreset = searchParams.get("preset") === "overdue-planned";
  const initialShowActual = isOverduePreset ? false : defaultShowActual;
  const initialShowPlannedRealized = isOverduePreset
    ? false
    : defaultShowPlannedRealized;
  const initialShowPlannedUnrealized = isOverduePreset
    ? true
    : defaultShowPlannedUnrealized;
  const initialFormTransactionType = isOverduePreset
    ? "PLANNED"
    : defaultShowActual
      ? "ACTUAL"
      : "PLANNED";
  const initialDateTo = isOverduePreset ? getYesterdayDateKey() : "";

  const [items, setItems] = useState<ItemOut[]>([]);
  const [itemTxCounts, setItemTxCounts] = useState<Map<number, number>>(new Map());
  const [banks, setBanks] = useState<BankOut[]>([]);
  const [counterparties, setCounterparties] = useState<CounterpartyOut[]>([]);
  const [industries, setIndustries] = useState<CounterpartyIndustryOut[]>([]);
  const [counterpartyLoading, setCounterpartyLoading] = useState(false);
  const [counterpartyError, setCounterpartyError] = useState<string | null>(null);
  const [txs, setTxs] = useState<TransactionOut[]>([]);
  const counterpartyTxCounts = useMemo(() => buildCounterpartyTransactionCounts(txs), [txs]);
  const [txCursor, setTxCursor] = useState<string | null>(null);
  const [hasMoreTxs, setHasMoreTxs] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [fxRatesByDate, setFxRatesByDate] = useState<Record<string, FxRateOut[]>>({});
  const [loading, setLoading] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
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
  >(() => initialFormTransactionType);
  const [showActual, setShowActual] = useState(initialShowActual);
  const [showPlanned, setShowPlanned] = useState(
    initialShowPlannedRealized || initialShowPlannedUnrealized
  );
  const [showPlannedRealized, setShowPlannedRealized] = useState(
    initialShowPlannedRealized
  );
  const [showPlannedUnrealized, setShowPlannedUnrealized] = useState(
    initialShowPlannedUnrealized
  );
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState(initialDateTo);
  const [commentFilter, setCommentFilter] = useState("");
  const [itemFilterResetKey, setItemFilterResetKey] = useState(0);
  const [selectedCounterpartyIds, setSelectedCounterpartyIds] = useState<Set<number>>(
    () => new Set()
  );
  const [amountFrom, setAmountFrom] = useState("");
  const [amountTo, setAmountTo] = useState("");
  const [selectedDirections, setSelectedDirections] = useState<
    Set<TransactionOut["direction"]>
  >(() => new Set());
  const [selectedCategoryFilterKeys, setSelectedCategoryFilterKeys] = useState<
    Set<string>
  >(() => new Set());
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
  const [counterpartyId, setCounterpartyId] = useState<number | null>(null);
  const [amountStr, setAmountStr] = useState("");
  const [amountCounterpartyStr, setAmountCounterpartyStr] = useState("");
  const [primaryQuantityLots, setPrimaryQuantityLots] = useState("");
  const [counterpartyQuantityLots, setCounterpartyQuantityLots] = useState("");
  const [loanTotalStr, setLoanTotalStr] = useState("");
  const [loanInterestStr, setLoanInterestStr] = useState("");
  const [selectedCategoryPath, setSelectedCategoryPath] = useState<{
    l1: string;
    l2: string;
    l3: string;
  } | null>(null);
  const [categoryNodes, setCategoryNodes] = useState<CategoryNode[]>([]);
  const [description, setDescription] = useState("");
  const [comment, setComment] = useState("");
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [importBankId, setImportBankId] = useState<number | null>(null);
  const [importBankSearch, setImportBankSearch] = useState("");
  const [importBankDropdownOpen, setImportBankDropdownOpen] = useState(false);
  const [importPdfFile, setImportPdfFile] = useState<File | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importItemId, setImportItemId] = useState<number | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importConfirmed, setImportConfirmed] = useState(false);
  const [isQrCodeLoading, setIsQrCodeLoading] = useState(false);
  const qrCodeInputRef = useRef<HTMLInputElement>(null);

  const [selectedTxIds, setSelectedTxIds] = useState<Set<number>>(() => new Set());
  const [deleteIds, setDeleteIds] = useState<number[] | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmingTxId, setConfirmingTxId] = useState<number | null>(null);
  const [isBulkConfirming, setIsBulkConfirming] = useState(false);
  const txRequestIdRef = useRef(0);
  const onboardingAppliedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isWizardOpen) {
      onboardingAppliedRef.current = null;
    }
  }, [isWizardOpen]);

  useEffect(() => {
    let cancelled = false;
    fetchCategories()
      .then((data) => {
        if (!cancelled) setCategoryNodes(data);
      })
      .catch((err: any) => {
        if (!cancelled) {
          setError(err?.message ?? "Не удалось загрузить категории.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [setError]);


  const normalizeCategoryValue = useCallback((value: string) => {
    const trimmed = value.trim();
    if (!trimmed || trimmed === CATEGORY_PLACEHOLDER) return "";
    return trimmed;
  }, []);

  const categoryMaps = useMemo(
    () => buildCategoryMaps(categoryNodes),
    [categoryNodes]
  );
  const scopedCategoryMaps = useMemo(() => {
    const scope = direction === "TRANSFER" ? undefined : direction;
    return buildCategoryMaps(categoryNodes, scope);
  }, [categoryNodes, direction]);


  const filterCategoryPaths = useMemo(() => {
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

    categoryMaps.l1.forEach((l1) => {
      addPath(l1, CATEGORY_PLACEHOLDER, CATEGORY_PLACEHOLDER);
      const l2List = categoryMaps.l2[l1] ?? [];
      l2List.forEach((l2) => {
        addPath(l1, l2, CATEGORY_PLACEHOLDER);
        const l3List = categoryMaps.l3[l2] ?? [];
        l3List.forEach((l3) => {
          addPath(l1, l2, l3);
        });
      });
    });
    return paths;
  }, [categoryMaps]);


  const categoryFilterPathByKey = useMemo(() => {
    return new Map(
      filterCategoryPaths.map((option) => [
        makeCategoryPathKey(
          normalizeCategoryValue(option.l1),
          normalizeCategoryValue(option.l2),
          normalizeCategoryValue(option.l3)
        ),
        option,
      ])
    );
  }, [filterCategoryPaths, normalizeCategoryValue]);

  const selectedCategoryFilterOptions = useMemo(() => {
    const options: CategoryPathOption[] = [];
    selectedCategoryFilterKeys.forEach((key) => {
      const option = categoryFilterPathByKey.get(key);
      if (option) options.push(option);
    });
    return options;
  }, [selectedCategoryFilterKeys, categoryFilterPathByKey]);

  const categoryLookup = useMemo(
    () => buildCategoryLookup(categoryNodes),
    [categoryNodes]
  );

  const getCategoryParts = useCallback(
    (categoryId: number | null): [string, string, string] => {
      if (!categoryId) return ["", "", ""];
      const parts = categoryLookup.idToPath.get(categoryId) ?? [];
      const [l1, l2, l3] = parts;
      return [l1 ?? "", l2 ?? "", l3 ?? ""];
    },
    [categoryLookup.idToPath]
  );

  const getCategoryLines = useCallback(
    (categoryId: number | null): [string, string, string] => {
      const [l1, l2, l3] = getCategoryParts(categoryId);
      return [
        l1 || CATEGORY_PLACEHOLDER,
        l2 || CATEGORY_PLACEHOLDER,
        l3 || CATEGORY_PLACEHOLDER,
      ];
    },
    [getCategoryParts]
  );

  const resolveCategoryIcon = useCallback(
    (categoryId: number | null) => {
      if (!categoryId) return CATEGORY_ICON_FALLBACK;
      const path = categoryLookup.idToPath.get(categoryId);
      if (!path || path.length === 0) return CATEGORY_ICON_FALLBACK;
      for (let depth = path.length; depth >= 1; depth -= 1) {
        const key = makeCategoryPathKey(...path.slice(0, depth));
        const targetId = categoryLookup.pathToId.get(key);
        if (!targetId) continue;
        const iconName = categoryLookup.idToIcon.get(targetId);
        if (!iconName) continue;
        const normalizedIconName = iconName.trim();
        if (!normalizedIconName) continue;
        const Icon = CATEGORY_ICON_BY_NAME[normalizedIconName];
        if (Icon) return Icon;
      }
      return CATEGORY_ICON_FALLBACK;
    },
    [categoryLookup.idToIcon, categoryLookup.idToPath, categoryLookup.pathToId]
  );

  const categoryFilterIds = useMemo(() => {
    if (selectedCategoryFilterOptions.length === 0) return EMPTY_NUMBER_ARRAY;
    const ids: number[] = [];
    categoryLookup.idToPath.forEach((path, id) => {
      const [l1 = "", l2 = "", l3 = ""] = path;
      const matches = selectedCategoryFilterOptions.some((option) => {
        if (option.l1 !== l1) return false;
        if (option.l2 !== CATEGORY_PLACEHOLDER && option.l2 !== l2) return false;
        if (option.l3 !== CATEGORY_PLACEHOLDER && option.l3 !== l3) return false;
        return true;
      });
      if (matches) ids.push(id);
    });
    return ids;
  }, [categoryLookup.idToPath, selectedCategoryFilterOptions]);

  const itemsById = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items]
  );
  const currencyItemIds = useMemo(() => {
    if (selectedCurrencyCodes.size === 0) return EMPTY_NUMBER_ARRAY;
    return items
      .filter((item) => selectedCurrencyCodes.has(item.currency_code))
      .map((item) => item.id);
  }, [items, selectedCurrencyCodes]);
  const activeItems = useMemo(
    () => items.filter((item) => !item.archived_at && !item.closed_at),
    [items]
  );
  const banksById = useMemo(
    () => new Map(banks.map((bank) => [bank.id, bank])),
    [banks]
  );
  const counterpartiesById = useMemo(
    () => new Map(counterparties.map((counterparty) => [counterparty.id, counterparty])),
    [counterparties]
  );
  const selectableCounterparties = useMemo(
    () => counterparties.filter((counterparty) => !counterparty.deleted_at),
    [counterparties]
  );
  const sortedCounterparties = useMemo(() => {
    return [...selectableCounterparties].sort((a, b) =>
      buildCounterpartyName(a).localeCompare(buildCounterpartyName(b), "ru", {
        sensitivity: "base",
      })
    );
  }, [selectableCounterparties]);
  const importBankOptions = useMemo(
    () => banks.filter((bank) => IMPORT_BANK_OGRNS.has(bank.ogrn)),
    [banks]
  );

  const filteredImportBanks = useMemo(() => {
    const query = importBankSearch.trim().toLowerCase();
    const list = query
      ? importBankOptions.filter((bank) =>
          bank.name.toLowerCase().includes(query)
        )
      : importBankOptions.slice();
    return list.sort((a, b) => {
      const aHasLogo = Boolean(a.logo_url);
      const bHasLogo = Boolean(b.logo_url);
      if (aHasLogo !== bHasLogo) return aHasLogo ? -1 : 1;
      return a.name.localeCompare(b.name, "ru", { sensitivity: "base" });
    });
  }, [importBankOptions, importBankSearch]);
  const selectedImportBank = useMemo(
    () => importBankOptions.find((bank) => bank.id === importBankId) ?? null,
    [importBankId, importBankOptions]
  );
  const isImportBankReady = selectedImportBank?.ogrn === IMPORT_BANK_READY_OGRN;
  const isImportBankInProgress = selectedImportBank
    ? IMPORT_BANK_PDF_OGRNS.has(selectedImportBank.ogrn)
    : false;
  const isImportSupported = isImportBankReady || isImportBankInProgress;
  const isImportFormDisabled = isImporting;
  const resolveItemEffectiveKind = useCallback(
    (item: ItemOut) => getEffectiveItemKind(item, item.current_value_rub),
    []
  );
  const assetItems = useMemo(
    () => activeItems.filter((item) => resolveItemEffectiveKind(item) === "ASSET"),
    [activeItems, resolveItemEffectiveKind]
  );
  const liabilityItems = useMemo(
    () => activeItems.filter((item) => resolveItemEffectiveKind(item) === "LIABILITY"),
    [activeItems, resolveItemEffectiveKind]
  );
  const currencyOptions = useMemo(() => {
    const values = new Set<string>();
    items.forEach((item) => {
      if (item.currency_code) values.add(item.currency_code);
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b, "ru"));
  }, [items]);

  const itemName = (id: number | null | undefined) => {
    if (!id) return "-";
    return itemsById.get(id)?.name ?? `#${id}`;
  };
  const itemCurrencyCode = (id: number | null | undefined) => {
    if (!id) return "-";
    return itemsById.get(id)?.currency_code ?? "-";
  };
  const getDisplayPrimaryItemId = (tx: TransactionOut) =>
    tx.primary_card_item_id ?? tx.primary_item_id;
  const getDisplayCounterpartyItemId = (tx: TransactionOut) =>
    tx.counterparty_card_item_id ?? tx.counterparty_item_id;
  const itemCounterpartyLogoUrl = (id: number | null | undefined) => {
    if (!id) return null;
    const cpId = itemsById.get(id)?.counterparty_id;
    if (!cpId) return null;
    const counterparty = counterpartiesById.get(cpId);
    if (!counterparty) return null;
    return counterparty.entity_type === "PERSON"
      ? counterparty.photo_url ?? null
      : counterparty.logo_url ?? null;
  };
  const itemCounterpartyName = (id: number | null | undefined) => {
    if (!id) return "";
    const cpId = itemsById.get(id)?.counterparty_id;
    if (!cpId) return "";
    const cp = counterpartiesById.get(cpId);
    if (!cp) return "";
    if (cp.entity_type === "PERSON") {
      const parts = [cp.last_name, cp.first_name, cp.middle_name].filter(Boolean);
      return parts.length > 0 ? parts.join(" ") : "";
    }
    return cp.name || cp.full_name || "";
  };
  const itemBankLogoUrl = itemCounterpartyLogoUrl;
  const itemBankName = itemCounterpartyName;
  const getItemDisplayBalanceCents = useCallback(
    (item: ItemOut) => {
      if (item.type_code === "bank_card" && item.card_account_id) {
        const linked = itemsById.get(item.card_account_id);
        if (linked) return linked.current_value_rub;
      }
      return item.current_value_rub;
    },
    [itemsById]
  );
  const getEffectiveItemMeta = (itemId: number | null | undefined) => {
    if (!itemId) return null;
    const selected = itemsById.get(itemId);
    if (!selected) return null;
    let effective = selected;
    let minDate = accountingStartDate ?? selected.open_date ?? "";
    if (selected.open_date && selected.open_date > minDate) {
      minDate = selected.open_date;
    }
    if (selected.type_code === "bank_card" && selected.card_account_id) {
      const account = itemsById.get(selected.card_account_id);
      if (account) {
        effective = account;
        if (account.open_date && account.open_date > minDate) {
          minDate = account.open_date;
        }
      }
    }
    const currencyCode = effective.currency_code || selected.currency_code || "";
    return { selected, effective, minDate, currencyCode };
  };
  const counterpartyLabel = (id: number | null | undefined) => {
    if (!id) return "";
    const counterparty = counterpartiesById.get(id);
    return counterparty ? buildCounterpartyName(counterparty) : "";
  };
  const primaryItem = primaryItemId ? itemsById.get(primaryItemId) ?? null : null;
  const counterpartyItem = counterpartyItemId
    ? itemsById.get(counterpartyItemId) ?? null
    : null;

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
  const primaryIsMoex = isMoexItem(primaryItem);
  const counterpartyIsMoex = isTransfer && isMoexItem(counterpartyItem);
  const isLoanRepayment = formMode === "LOAN_REPAYMENT";
  const isActualTransaction = formTransactionType === "ACTUAL";
  const isPlannedTransaction = formTransactionType === "PLANNED";
  const showCounterpartySelect = isTransfer || isLoanRepayment;
  const primarySelectItems = isLoanRepayment ? assetItems : activeItems;
  const counterpartySelectItems = isLoanRepayment ? liabilityItems : activeItems;
  const primaryCurrencyCode = primaryItemId
    ? getEffectiveItemMeta(primaryItemId)?.currencyCode ?? null
    : null;
  const counterpartyCurrencyCode = counterpartyItemId
    ? getEffectiveItemMeta(counterpartyItemId)?.currencyCode ?? null
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

  const getFullAmountForTransfer = useCallback(() => {
    if (!primaryItemId || !isTransfer) return null;
    const item = itemsById.get(primaryItemId);
    if (!item) return null;

    // Для обычных активов получаем текущую сумму
    let balanceCents = getItemDisplayBalanceCents(item);
    
    // Если валюта не RUB, конвертируем в валюту актива
    const currencyCode = primaryCurrencyCode;
    if (currencyCode && currencyCode !== "RUB") {
      const rate = getFxRateForDate(date, currencyCode);
      if (!rate) return null;
      // Конвертируем из рублей в валюту: рубли / курс
      const amountInCurrency = balanceCents / 100 / rate;
      return formatAmountForInput(Math.round(amountInCurrency * 100));
    }

    // Для RUB просто форматируем
    return formatAmountForInput(balanceCents);
  }, [primaryItemId, isTransfer, itemsById, primaryCurrencyCode, date, getItemDisplayBalanceCents, getFxRateForDate]);

  const handleFullAmountClick = useCallback(() => {
    if (!primaryItemId || !isTransfer) return;
    const item = itemsById.get(primaryItemId);
    if (!item) return;

    // Для MOEX активов заполняем поле "Количество лотов"
    if (isMoexItem(item)) {
      const lots = item.position_lots ?? 0;
      if (lots > 0) {
        setPrimaryQuantityLots(String(lots));
      }
      return;
    }

    // Для обычных активов заполняем поле "Сумма"
    const fullAmount = getFullAmountForTransfer();
    if (fullAmount !== null) {
      setAmountStr(fullAmount);
    }
  }, [primaryItemId, isTransfer, itemsById, getFullAmountForTransfer]);

  useEffect(() => {
    if (!isCrossCurrencyTransfer) {
      setAmountCounterpartyStr("");
    }
  }, [isCrossCurrencyTransfer]);

  useEffect(() => {
    if (primaryIsMoex) return;
    if (primaryQuantityLots) setPrimaryQuantityLots("");
  }, [primaryIsMoex, primaryQuantityLots]);

  useEffect(() => {
    if (isTransfer && counterpartyIsMoex) return;
    if (counterpartyQuantityLots) setCounterpartyQuantityLots("");
  }, [counterpartyIsMoex, counterpartyQuantityLots, isTransfer]);

  const segmentedButtonBase =
    "flex-1 min-w-0 rounded-full px-3 py-2 text-sm font-medium text-center whitespace-nowrap transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 flex items-center justify-center";
  const isDialogOpen = dialogMode !== null;
  const isEditMode = dialogMode === "edit";
  const isBulkEdit = dialogMode === "bulk-edit";
  const isRealizeMode = realizeSource !== null;

  const applyCategorySelection = (l1: string, l2: string, l3: string) => {
    if (!l1 || (l1 === CATEGORY_PLACEHOLDER && !l2 && !l3)) {
      setSelectedCategoryPath(null);
    } else {
      setSelectedCategoryPath({ l1, l2, l3 });
    }
  };

  const applyCategorySelectionById = (categoryId: number | null) => {
    const [l1, l2, l3] = getCategoryParts(categoryId);
    applyCategorySelection(
      l1,
      l2 || CATEGORY_PLACEHOLDER,
      l3 || CATEGORY_PLACEHOLDER
    );
  };

  const cat1 = selectedCategoryPath?.l1 || "";
  const cat2 = selectedCategoryPath?.l2 || "";
  const cat3 = selectedCategoryPath?.l3 || "";

  const resolveCategoryId = (l1: string, l2: string, l3: string) => {
    const key = makeCategoryPathKey(
      normalizeCategoryValue(l1),
      normalizeCategoryValue(l2),
      normalizeCategoryValue(l3)
    );
    return categoryLookup.pathToId.get(key) ?? null;
  };


  const resetForm = () => {
    setDate(new Date().toISOString().slice(0, 10));
    setDirection("EXPENSE");
    setFormMode("STANDARD");
    setFormTransactionType(defaultShowActual ? "ACTUAL" : "PLANNED");
    setPrimaryItemId(null);
    setCounterpartyItemId(null);
    setCounterpartyId(null);
    setAmountStr("");
    setAmountCounterpartyStr("");
    setPrimaryQuantityLots("");
    setCounterpartyQuantityLots("");
    setLoanTotalStr("");
    setLoanInterestStr("");
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

  const handleQrCodeUpload = async (file: File) => {
    setIsQrCodeLoading(true);
    try {
      const qrData = await decodeQRCode(file);
      const receiptData = parseReceiptQR(qrData);
      
      if (!receiptData) {
        alert("Не удалось распарсить данные из QR-кода. Убедитесь, что это QR-код чека ФНС.");
        setIsQrCodeLoading(false);
        if (qrCodeInputRef.current) {
          qrCodeInputRef.current.value = "";
        }
        return;
      }

      // Предзаполняем форму данными из чека ПЕРЕД открытием диалога
      lastActiveElementRef.current = null;
      setEditingTx(null);
      setRealizeSource(null);
      setBulkEditIds(null);
      setBulkEditBaseline(null);
      setIsBulkEditConfirmOpen(false);
      setFormError(null);
      
      // Устанавливаем данные формы
      setDate(receiptData.date);
      setDirection("EXPENSE");
      setFormMode("STANDARD");
      setFormTransactionType("ACTUAL");
      setPrimaryItemId(null);
      setCounterpartyItemId(null);
      setCounterpartyId(null);
      setAmountStr(formatCentsForInput(receiptData.amount));
      setAmountCounterpartyStr("");
      setPrimaryQuantityLots("");
      setCounterpartyQuantityLots("");
      setLoanTotalStr("");
      setLoanInterestStr("");
      applyCategorySelection("", "", "");
      setDescription("");
      
      // Формируем комментарий с параметрами чека
      const commentParts: string[] = [];
      if (receiptData.fn) commentParts.push(`ФН: ${receiptData.fn}`);
      if (receiptData.fp) commentParts.push(`ФП: ${receiptData.fp}`);
      if (receiptData.i) commentParts.push(`ФД: ${receiptData.i}`);
      setComment(commentParts.join(", "));
      
      // Открываем диалог
      setDialogMode("create");
      
      // Очищаем input
      if (qrCodeInputRef.current) {
        qrCodeInputRef.current.value = "";
      }
    } catch (error: any) {
      alert(error?.message ?? "Не удалось обработать QR-код.");
      if (qrCodeInputRef.current) {
        qrCodeInputRef.current.value = "";
      }
    } finally {
      setIsQrCodeLoading(false);
    }
  };

  useEffect(() => {
    if (!isWizardOpen || activeStep?.key !== "transactions") return;
    if (onboardingAppliedRef.current === "transactions") return;
    if (scopedCategoryMaps.l1.length === 0) return;
    onboardingAppliedRef.current = "transactions";
    openCreateDialog();

    const demoItem =
      items.find(
        (item) =>
          !item.archived_at &&
          !item.closed_at &&
          getEffectiveItemKind(item, item.current_value_rub) === "ASSET" &&
          !isMoexItem(item)
      ) ?? null;
    const todayKey = new Date().toISOString().slice(0, 10);
    let targetDate = accountingStartDate ?? todayKey;
    if (demoItem?.open_date && demoItem.open_date > targetDate) {
      targetDate = demoItem.open_date;
    }

    setDate(targetDate);
    setDirection("EXPENSE");
    setFormTransactionType("ACTUAL");
    if (demoItem) {
      setPrimaryItemId(demoItem.id);
    }
    setAmountStr("450");
    setDescription("Кофе");

    if (scopedCategoryMaps.l1.length > 0) {
      const l1 = scopedCategoryMaps.l1[0];
      const l2 = (scopedCategoryMaps.l2[l1] ?? [CATEGORY_PLACEHOLDER])[0];
      const l3 =
        l2 && l2 !== CATEGORY_PLACEHOLDER
          ? (scopedCategoryMaps.l3[l2] ?? [CATEGORY_PLACEHOLDER])[0]
          : CATEGORY_PLACEHOLDER;
      applyCategorySelection(l1, l2 ?? CATEGORY_PLACEHOLDER, l3 ?? CATEGORY_PLACEHOLDER);
    }

    if (counterparties.length > 0) {
      const demoCounterparty =
        counterparties.find((item) =>
          (item.name ?? "").toLocaleLowerCase("ru").includes("магазин")
        ) ?? counterparties[0];
      setCounterpartyId(demoCounterparty.id);
    }
  }, [
    accountingStartDate,
    activeStep?.key,
    counterparties,
    isWizardOpen,
    items,
    openCreateDialog,
    scopedCategoryMaps,
  ]);

  const openEditDialog = (tx: TransactionCard, trigger?: HTMLElement | null) => {
    lastActiveElementRef.current =
      trigger ?? (document.activeElement as HTMLElement | null);
    setFormError(null);
    setEditingTx(tx);
    setRealizeSource(null);
    setFormMode("STANDARD");
    setBulkEditIds(null);
    setBulkEditBaseline(null);
    setIsBulkEditConfirmOpen(false);
    setDialogMode("edit");
    setDate(getDateKey(tx.transaction_date));
    setDirection(tx.direction);
    setFormTransactionType(tx.transaction_type);
    setPrimaryItemId(getDisplayPrimaryItemId(tx));
    setCounterpartyItemId(getDisplayCounterpartyItemId(tx));
    setCounterpartyId(tx.counterparty_id);
    setAmountStr(formatCentsForInput(tx.amount_rub));
    setAmountCounterpartyStr(
      tx.direction === "TRANSFER" && tx.amount_counterparty != null
        ? formatCentsForInput(tx.amount_counterparty)
        : ""
    );
    setPrimaryQuantityLots(
      tx.primary_quantity_lots != null ? String(tx.primary_quantity_lots) : ""
    );
    setCounterpartyQuantityLots(
      tx.direction === "TRANSFER" && tx.counterparty_quantity_lots != null
        ? String(tx.counterparty_quantity_lots)
        : ""
    );
    applyCategorySelectionById(tx.category_id);
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
    setBulkEditIds(null);
    setBulkEditBaseline(null);
    setIsBulkEditConfirmOpen(false);
    setDialogMode("create");
    setDate(getDateKey(tx.transaction_date));
    setDirection(tx.direction);
    setFormTransactionType(tx.transaction_type);
    setPrimaryItemId(getDisplayPrimaryItemId(tx));
    setCounterpartyItemId(
      tx.direction === "TRANSFER" ? getDisplayCounterpartyItemId(tx) : null
    );
    setCounterpartyId(tx.counterparty_id);
    setAmountStr(formatCentsForInput(tx.amount_rub));
    setAmountCounterpartyStr(
      tx.direction === "TRANSFER" && tx.amount_counterparty != null
        ? formatCentsForInput(tx.amount_counterparty)
        : ""
    );
    setPrimaryQuantityLots(
      tx.primary_quantity_lots != null ? String(tx.primary_quantity_lots) : ""
    );
    setCounterpartyQuantityLots(
      tx.direction === "TRANSFER" && tx.counterparty_quantity_lots != null
        ? String(tx.counterparty_quantity_lots)
        : ""
    );
    applyCategorySelectionById(tx.category_id);
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
    setBulkEditIds(null);
    setBulkEditBaseline(null);
    setIsBulkEditConfirmOpen(false);
    setDialogMode("create");
    setDate(getDateKey(tx.transaction_date));
    setDirection(tx.direction);
    setFormTransactionType("ACTUAL");
    setPrimaryItemId(getDisplayPrimaryItemId(tx));
    setCounterpartyItemId(
      tx.direction === "TRANSFER" ? getDisplayCounterpartyItemId(tx) : null
    );
    setCounterpartyId(tx.counterparty_id);
    setAmountStr(formatCentsForInput(tx.amount_rub));
    setAmountCounterpartyStr(
      tx.direction === "TRANSFER" && tx.amount_counterparty != null
        ? formatCentsForInput(tx.amount_counterparty)
        : ""
    );
    setPrimaryQuantityLots(
      tx.primary_quantity_lots != null ? String(tx.primary_quantity_lots) : ""
    );
    setCounterpartyQuantityLots(
      tx.direction === "TRANSFER" && tx.counterparty_quantity_lots != null
        ? String(tx.counterparty_quantity_lots)
        : ""
    );
    applyCategorySelectionById(tx.category_id);
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
    const [baselineCat1, baselineCat2, baselineCat3] = getCategoryParts(
      baselineTx.category_id
    );
    const baseline = {
      date: getDateKey(baselineTx.transaction_date),
      direction: baselineTx.direction,
      primaryItemId: getDisplayPrimaryItemId(baselineTx),
      counterpartyItemId: getDisplayCounterpartyItemId(baselineTx),
      counterpartyId: baselineTx.counterparty_id,
      amountStr: formatCentsForInput(baselineTx.amount_rub),
      amountCounterpartyStr:
        baselineTx.direction === "TRANSFER" &&
        baselineTx.amount_counterparty != null
          ? formatCentsForInput(baselineTx.amount_counterparty)
          : "",
      primaryQuantityLots:
        baselineTx.primary_quantity_lots != null
          ? String(baselineTx.primary_quantity_lots)
          : "",
      counterpartyQuantityLots:
        baselineTx.direction === "TRANSFER" &&
        baselineTx.counterparty_quantity_lots != null
          ? String(baselineTx.counterparty_quantity_lots)
          : "",
      cat1: baselineCat1,
      cat2: baselineCat2 || CATEGORY_PLACEHOLDER,
      cat3: baselineCat3 || CATEGORY_PLACEHOLDER,
      description: baselineTx.description ?? "",
      comment: baselineTx.comment ?? "",
    };

    setFormError(null);
    setEditingTx(null);
    setRealizeSource(null);
    setFormMode("STANDARD");
    setDialogMode("bulk-edit");
    setBulkEditIds(selectedTxs.map((tx) => tx.id));
    setBulkEditBaseline(baseline);
    setIsBulkEditConfirmOpen(false);
    setDate(baseline.date);
    setDirection(baseline.direction);
    setPrimaryItemId(baseline.primaryItemId);
    setCounterpartyItemId(baseline.counterpartyItemId);
    setCounterpartyId(baseline.counterpartyId);
    setAmountStr(baseline.amountStr);
    setAmountCounterpartyStr(baseline.amountCounterpartyStr);
    setPrimaryQuantityLots(baseline.primaryQuantityLots);
    setCounterpartyQuantityLots(baseline.counterpartyQuantityLots);
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
      hasCounterpartyChanged: counterpartyId !== bulkEditBaseline.counterpartyId,
      hasAmountChanged: amountStr !== bulkEditBaseline.amountStr,
      hasAmountCounterpartyChanged:
        amountCounterpartyStr !== bulkEditBaseline.amountCounterpartyStr,
      hasPrimaryQuantityLotsChanged:
        primaryQuantityLots !== bulkEditBaseline.primaryQuantityLots,
      hasCounterpartyQuantityLotsChanged:
        counterpartyQuantityLots !== bulkEditBaseline.counterpartyQuantityLots,
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
      const basePrimaryItemId = getDisplayPrimaryItemId(tx);
      const baseCounterpartyItemId = getDisplayCounterpartyItemId(tx);
      const nextPrimaryItemId = changes.hasPrimaryItemChanged
        ? primaryItemId
        : basePrimaryItemId;
      const resolvedPrimaryItemId = nextPrimaryItemId ?? basePrimaryItemId;
      const nextCounterpartyItemId =
        nextDirection === "TRANSFER"
          ? changes.hasCounterpartyItemChanged
            ? counterpartyItemId
            : baseCounterpartyItemId
          : null;

      if (!resolvedPrimaryItemId) {
        return "Выберите актив/обязательство.";
      }
      if (nextDirection === "TRANSFER" && !nextCounterpartyItemId) {
        return "Выберите корреспондирующий актив.";
      }

      

      const primaryMoex = resolvedPrimaryItemId
        ? isMoexItem(itemsById.get(resolvedPrimaryItemId))
        : false;
      if (primaryMoex) {
        const lotsValue = changes.hasPrimaryQuantityLotsChanged
          ? parseLots(primaryQuantityLots)
          : tx.primary_quantity_lots ?? NaN;
        if (!Number.isFinite(lotsValue) || lotsValue < 0) {
          return "Укажите корректное количество лотов для MOEX инструмента.";
        }
      } else if (changes.hasPrimaryQuantityLotsChanged && primaryQuantityLots.trim()) {
        return "Количество лотов можно указывать только для MOEX инструментов.";
      }

      const counterpartyMoex =
        nextDirection === "TRANSFER" && nextCounterpartyItemId
          ? isMoexItem(itemsById.get(nextCounterpartyItemId))
          : false;
      if (counterpartyMoex) {
        const lotsValue = changes.hasCounterpartyQuantityLotsChanged
          ? parseLots(counterpartyQuantityLots)
          : tx.counterparty_quantity_lots ?? NaN;
        if (!Number.isFinite(lotsValue) || lotsValue < 0) {
          return "Укажите корректное количество лотов для MOEX инструмента.";
        }
      } else if (
        changes.hasCounterpartyQuantityLotsChanged &&
        counterpartyQuantityLots.trim()
      ) {
        return "Количество лотов можно указывать только для MOEX инструментов.";
      }

      if (changes.hasDateChanged && tx.transaction_type === "PLANNED") {
        if (nextDate < today) {
          return "Плановая транзакция не может быть создана ранее текущего дня.";
        }
      }

      if (changes.hasDateChanged || changes.hasPrimaryItemChanged) {
        const primaryMeta = getEffectiveItemMeta(resolvedPrimaryItemId);
        if (primaryMeta?.minDate && nextDate < primaryMeta.minDate) {
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
          const counterpartyMeta = getEffectiveItemMeta(nextCounterpartyItemId);
          if (counterpartyMeta?.minDate && nextDate < counterpartyMeta.minDate) {
            return "Дата транзакции не может быть раньше даты начала действия корреспондирующего актива/обязательства.";
          }
        }
      }

      const primaryCurrency =
        getEffectiveItemMeta(resolvedPrimaryItemId)?.currencyCode ?? null;
      const counterpartyCurrency =
        getEffectiveItemMeta(nextCounterpartyItemId)?.currencyCode ?? null;
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
          const basePrimaryItemId = getDisplayPrimaryItemId(tx);
          const baseCounterpartyItemId = getDisplayCounterpartyItemId(tx);
          const nextPrimaryItemId = changes.hasPrimaryItemChanged
            ? primaryItemId
            : basePrimaryItemId;
          const resolvedPrimaryItemId = nextPrimaryItemId ?? basePrimaryItemId;
          const nextCounterpartyItemId =
            nextDirection === "TRANSFER"
              ? changes.hasCounterpartyItemChanged
                ? counterpartyItemId
                : baseCounterpartyItemId
              : null;
          const nextCounterpartyId = changes.hasCounterpartyChanged
            ? counterpartyId
            : tx.counterparty_id;

          const primaryCurrency =
            getEffectiveItemMeta(resolvedPrimaryItemId)?.currencyCode ?? null;
          const counterpartyCurrency =
            getEffectiveItemMeta(nextCounterpartyItemId)?.currencyCode ?? null;
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

          const primaryMoex = resolvedPrimaryItemId
            ? isMoexItem(itemsById.get(resolvedPrimaryItemId))
            : false;
          const counterpartyMoex =
            nextDirection === "TRANSFER" && nextCounterpartyItemId
              ? isMoexItem(itemsById.get(nextCounterpartyItemId))
              : false;
          const nextPrimaryLots = primaryMoex
            ? changes.hasPrimaryQuantityLotsChanged
              ? parseLots(primaryQuantityLots)
              : tx.primary_quantity_lots ?? 0
            : null;
          const nextCounterpartyLots = counterpartyMoex
            ? changes.hasCounterpartyQuantityLotsChanged
              ? parseLots(counterpartyQuantityLots)
              : tx.counterparty_quantity_lots ?? 0
            : null;

          const payload: TransactionCreate = {
            transaction_date: nextDate,
            primary_item_id: resolvedPrimaryItemId ?? basePrimaryItemId,
            counterparty_item_id: nextCounterpartyItemId,
            counterparty_id: nextCounterpartyId ?? null,
            amount_rub: changes.hasAmountChanged
              ? (amountCents as number)
              : tx.amount_rub,
            amount_counterparty: nextAmountCounterparty,
            primary_quantity_lots: primaryMoex ? nextPrimaryLots : null,
            counterparty_quantity_lots: counterpartyMoex ? nextCounterpartyLots : null,
            direction: nextDirection,
            transaction_type: tx.transaction_type,
            category_id: (() => {
              if (nextDirection === "TRANSFER") return null;
              const [existingL1, existingL2, existingL3] = getCategoryParts(
                tx.category_id
              );
              const nextL1 = changes.hasCat1Changed ? cat1 : existingL1;
              const nextL2 = changes.hasCat2Changed ? cat2 : existingL2;
              const nextL3 = changes.hasCat3Changed ? cat3 : existingL3;
              return resolveCategoryId(nextL1, nextL2, nextL3);
            })(),
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
    setImportBankId(null);
    setImportBankSearch("");
    setImportBankDropdownOpen(false);
    setImportPdfFile(null);
    setImportFile(null);
    setImportItemId(null);
    setImportError(null);
    setImportConfirmed(false);
    if (importInputRef.current) {
      importInputRef.current.value = "";
    }
    if (importPdfInputRef.current) {
      importPdfInputRef.current.value = "";
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

    if (!selectedImportBank) {
      setImportError("Выберите банк для импорта.");
      return;
    }

    if (importItemId == null) {
      setImportError("Выберите счет, на который импортируются транзакции.");
      return;
    }
    const selectedImportItemId = importItemId;
    const item = itemsById.get(selectedImportItemId);
    const itemMeta = getEffectiveItemMeta(selectedImportItemId);
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

    if (isImportBankReady) {
      if (!importFile) {
        setImportError("Выберите файл .xlsx для импорта.");
        return;
      }
      if (!importFile.name.toLowerCase().endsWith(".xlsx")) {
        setImportError("Формат файла должен быть .xlsx.");
        return;
      }

      try {
        const arrayBuffer = await importFile.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: "array", cellDates: true });
        if (workbook.SheetNames.length !== 1) {
          throw new Error("Файл должен содержать ровно один лист.");
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
            `Файл не соответствует формату. Ожидаемые столбцы: ${IMPORT_HEADERS.join(
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
            throw new Error(
              `Строка ${rowNumber}: ожидается ровно ${IMPORT_HEADERS.length} столбцов.`
            );
          }

          const rawOperationDate = row[0];
          const rawStatus = row[3];
          const rawPaymentAmount = row[6];
          const rawCategory = row[9];
          const rawMcc = row[10];
          const rawDescription = row[11];

          const statusValue = String(rawStatus ?? "").trim().toUpperCase();
          if (statusValue !== "OK") {
            continue;
          }

          const parsedDate = parseExcelDate(rawOperationDate);
          if (!parsedDate) {
            throw new Error(`Строка ${rowNumber}: не удалось распознать дату операции.`);
          }
          const transactionDateKey = formatDateForApi(parsedDate);
          const transactionDate = formatDateTimeForApi(parsedDate);
          if (importTxType === "PLANNED") {
            const today = new Date().toISOString().slice(0, 10);
            if (transactionDateKey < today) {
              throw new Error(
                `Строка ${rowNumber}: запланированная дата не может быть в прошлом.`
              );
            }
          }
          if (itemMeta?.minDate && transactionDateKey < itemMeta.minDate) {
            throw new Error(
              `Строка ${rowNumber}: дата операции раньше даты открытия счета.`
            );
          }

          const amountValue = parseAmountCell(rawPaymentAmount);
          if (amountValue == null || !Number.isFinite(amountValue)) {
            throw new Error(
              `Строка ${rowNumber}: не удалось распознать сумму операции.`
            );
          }
          const direction = amountValue < 0 ? "EXPENSE" : "INCOME";
          const amountCents = Math.round(Math.abs(amountValue) * 100);

          const mccCategory = resolveCategoryFromMcc(rawMcc);
          const categoryValue = (mccCategory ?? String(rawCategory ?? "")).trim();
          if (!categoryValue) {
            throw new Error(`Строка ${rowNumber}: категория не заполнена.`);
          }
          const categoryL1 = findClosestCategory(categoryValue, categoryMaps.l1);
          if (!categoryL1) {
            throw new Error(
              `Строка ${rowNumber}: не удалось сопоставить категорию операции.`
            );
          }
          const categoryId = resolveCategoryId(
            categoryL1,
            CATEGORY_PLACEHOLDER,
            CATEGORY_PLACEHOLDER
          );
          if (!categoryId) {
            throw new Error(
              `Строка ${rowNumber}: не удалось сопоставить категорию операции.`
            );
          }

          const commentValue = String(rawDescription ?? "").trim();

          rowsToImport.push({
            rowNumber,
            payload: {
              transaction_date: transactionDate,
              primary_item_id: selectedImportItemId,
              amount_rub: amountCents,
              direction,
              transaction_type: importTxType,
              status: importConfirmed ? "CONFIRMED" : "UNCONFIRMED",
              category_id: categoryId,
              description: null,
              comment: commentValue ? commentValue : null,
            },
          });
        }

        if (rowsToImport.length === 0) {
          throw new Error("Файл не содержит данных для импорта.");
        }
      } catch (err: any) {
        setImportError(err?.message ?? "Не удалось обработать файл для импорта.");
        return;
      }
    } else if (isImportBankInProgress) {
      if (!importPdfFile) {
        setImportError("Выберите файл .pdf для импорта.");
        return;
      }
      if (!importPdfFile.name.toLowerCase().endsWith(".pdf")) {
        setImportError("Формат файла должен быть .pdf.");
        return;
      }

      try {
        const parsedRows =
          selectedImportBank.ogrn === IMPORT_BANK_ALFA_OGRN
            ? await parseAlfaStatementRows(importPdfFile)
            : await parsePdfStatementRows(importPdfFile);
        if (parsedRows.length === 0) {
          throw new Error("В выписке не найдены операции.");
        }

        const isAlfaImport = selectedImportBank.ogrn === IMPORT_BANK_ALFA_OGRN;

        for (let i = 0; i < parsedRows.length; i += 1) {
          const row = parsedRows[i];
          const rowNumber = i + 1;
          const parsedDate = parseDateFromString(row.dateTime);
          if (!parsedDate) {
            throw new Error(`Строка ${rowNumber}: не удалось распознать дату операции.`);
          }

          const transactionDateKey = formatDateForApi(parsedDate);
          if (itemMeta?.minDate && transactionDateKey < itemMeta.minDate) {
            throw new Error(
              `Строка ${rowNumber}: дата операции раньше даты открытия счета.`
            );
          }

          const amountMeta = parsePdfAmount(row.amountText);
          if (!amountMeta) {
            throw new Error(
              `Строка ${rowNumber}: не удалось распознать сумму операции.`
            );
          }

          const fallbackCategory = row.descriptionLines[0] ?? "";
          const statementCategory = (row.category || fallbackCategory).trim();
          const categoryValue = amountMeta.isIncome
            ? statementCategory
            : "Прочие расходы";
          if (!categoryValue) {
            throw new Error(`Строка ${rowNumber}: не удалось распознать категорию.`);
          }
          const categoryL1 = findClosestCategory(categoryValue, categoryMaps.l1);
          if (!categoryL1) {
            throw new Error(
              `Строка ${rowNumber}: не удалось сопоставить категорию операции.`
            );
          }
          const categoryId = resolveCategoryId(
            categoryL1,
            CATEGORY_PLACEHOLDER,
            CATEGORY_PLACEHOLDER
          );
          if (!categoryId) {
            throw new Error(
              `Строка ${rowNumber}: не удалось сопоставить категорию операции.`
            );
          }

          const descriptionLines = row.category
            ? row.descriptionLines
            : isAlfaImport
              ? row.descriptionLines
              : row.descriptionLines.slice(1);
          const commentValue = normalizePdfText(descriptionLines.join(" "));

          rowsToImport.push({
            rowNumber,
            payload: {
              transaction_date: formatDateTimeForApi(parsedDate),
              primary_item_id: selectedImportItemId,
              amount_rub: amountMeta.amountCents,
              direction: amountMeta.isIncome ? "INCOME" : "EXPENSE",
              transaction_type: importTxType,
              status: importConfirmed ? "CONFIRMED" : "UNCONFIRMED",
              category_id: categoryId,
              description: null,
              comment: commentValue ? commentValue : null,
            },
          });
        }
      } catch (err: any) {
        setImportError(err?.message ?? "Не удалось обработать PDF-выписку.");
        return;
      }
    } else {
      setImportError("Импорт для выбранного банка пока не поддерживается.");
      return;
    }

    setIsImporting(true);
    try {
      for (const row of rowsToImport) {
        try {
          await createTransaction(row.payload);
        } catch (err: any) {
          const message =
            err?.message ??
            "Не удалось создать транзакцию по данным импорта.";
          throw new Error(`Строка ${row.rowNumber}: ${message}`);
        }
      }
      handleImportOpenChange(false);
      await loadAll();
    } catch (err: any) {
      setImportError(
        err?.message ?? "Не удалось завершить импорт транзакций."
      );
    } finally {
      setIsImporting(false);
    }
  };

  const statusFilter = useMemo(() => {
    const values: TransactionOut["status"][] = [];
    const allowConfirmed = showActual || (showPlanned && showPlannedUnrealized);
    if (allowConfirmed) {
      if (showConfirmed) values.push("CONFIRMED");
      if (showUnconfirmed) values.push("UNCONFIRMED");
    }
    if (showPlanned && showPlannedRealized) values.push("REALIZED");
    return values;
  }, [
    showActual,
    showConfirmed,
    showPlanned,
    showPlannedRealized,
    showPlannedUnrealized,
    showUnconfirmed,
  ]);
  const transactionTypeFilter = useMemo(() => {
    const values: TransactionOut["transaction_type"][] = [];
    if (showActual) values.push("ACTUAL");
    if (showPlanned) values.push("PLANNED");
    return values;
  }, [showActual, showPlanned]);
  const directionFilter = useMemo(() => {
    if (selectedDirections.size === 0) return EMPTY_DIRECTION_ARRAY;
    return Array.from(selectedDirections);
  }, [selectedDirections]);
  const { itemFilterIds, cardItemFilterIds } = useMemo(() => {
    if (selectedItemIds.size === 0) {
      return { itemFilterIds: EMPTY_NUMBER_ARRAY, cardItemFilterIds: EMPTY_NUMBER_ARRAY };
    }
    const itemIds: number[] = [];
    const cardIds: number[] = [];
    selectedItemIds.forEach((id) => {
      const item = itemsById.get(id);
      if (item?.type_code === "bank_card" && item.card_account_id) {
        cardIds.push(id);
      } else {
        itemIds.push(id);
      }
    });
    return { itemFilterIds: itemIds, cardItemFilterIds: cardIds };
  }, [itemsById, selectedItemIds]);
  const counterpartyFilterIds = useMemo(() => {
    if (selectedCounterpartyIds.size === 0) return EMPTY_NUMBER_ARRAY;
    return Array.from(selectedCounterpartyIds);
  }, [selectedCounterpartyIds]);
  const commentQuery = useMemo(() => commentFilter.trim(), [commentFilter]);
  const minAmount = useMemo(() => parseAmountFilter(amountFrom), [amountFrom]);
  const maxAmount = useMemo(() => parseAmountFilter(amountTo), [amountTo]);
  const includeDeleted = showActive && showDeleted;
  const deletedOnly = showDeleted && !showActive;

  const txQuery = useMemo(() => {
    const disabled =
      (!showActive && !showDeleted) ||
      statusFilter.length === 0 ||
      transactionTypeFilter.length === 0;
    return {
      disabled,
      params: {
        include_deleted: includeDeleted,
        deleted_only: deletedOnly,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        status: statusFilter,
        direction: directionFilter,
        transaction_type: transactionTypeFilter,
        item_ids: itemFilterIds,
        card_item_ids: cardItemFilterIds,
        currency_item_ids: currencyItemIds,
        category_ids: categoryFilterIds,
        counterparty_ids: counterpartyFilterIds,
        comment_query: commentQuery || undefined,
        min_amount: minAmount ?? undefined,
        max_amount: maxAmount ?? undefined,
      },
    };
  }, [
    cardItemFilterIds,
    categoryFilterIds,
    commentQuery,
    currencyItemIds,
    counterpartyFilterIds,
    dateFrom,
    dateTo,
    deletedOnly,
    directionFilter,
    includeDeleted,
    itemFilterIds,
    maxAmount,
    minAmount,
    showActive,
    showDeleted,
    statusFilter,
    transactionTypeFilter,
  ]);

  const loadItems = useCallback(async () => {
    try {
      const itemsData = await fetchItems({
        includeArchived: true,
        includeClosed: true,
      });
      setItems(itemsData);
    } catch (e: any) {
      setError(
        e?.message ?? "گ?گç ‘?گ?г?г>г?‘?‘? гْгّг?‘?‘?гْгٌ‘'‘? ‘'‘?гّг?гْгّгَ‘إгٌгٌ."
      );
    }
  }, []);

  const loadItemTransactionCounts = useCallback(async () => {
    try {
      const txData = await fetchTransactions();
      setItemTxCounts(buildItemTransactionCounts(txData));
    } catch {
      setItemTxCounts(new Map());
    }
  }, []);

  const loadBanks = useCallback(async () => {
    const banksData = await fetchBanks().catch(() => []);
    setBanks(banksData);
  }, []);

  const loadCounterparties = useCallback(async () => {
    setCounterpartyLoading(true);
    setCounterpartyError(null);
    try {
      const [counterpartiesData, industriesData] = await Promise.all([
        fetchCounterparties({ include_deleted: true }),
        fetchCounterpartyIndustries(),
      ]);
      setCounterparties(counterpartiesData);
      setIndustries(industriesData);
    } catch (e: any) {
      setCounterpartyError(
        e?.message ?? "Не удалось загрузить контрагентов."
      );
    } finally {
      setCounterpartyLoading(false);
    }
  }, []);

  const loadTransactions = useCallback(
    async ({
      cursor,
      append = false,
    }: {
      cursor?: string | null;
      append?: boolean;
    } = {}) => {
      if (!session) return;
      if (txQuery.disabled) {
        setTxs([]);
        setTxCursor(null);
        setHasMoreTxs(false);
        setLoading(false);
        setIsLoadingMore(false);
        setIsInitialLoading(false);
        return;
      }
      const requestId = (txRequestIdRef.current += 1);
      if (append) {
        setIsLoadingMore(true);
      } else {
        setLoading(true);
        setIsInitialLoading(true);
      }
      setError(null);
      try {
        const page = await fetchTransactionsPage({
          ...txQuery.params,
          limit: PAGE_SIZE,
          cursor: cursor ?? undefined,
        });
        if (requestId !== txRequestIdRef.current) return;
        setTxs((prev) => (append ? [...prev, ...page.items] : page.items));
        setTxCursor(page.next_cursor);
        setHasMoreTxs(page.has_more);
      } catch (e: any) {
        if (requestId !== txRequestIdRef.current) return;
        setError(
          e?.message ?? "г?гç ‘?г?гّг>г?‘?‘? гْгّг?‘?‘?гْгٌ‘'‘? ‘'‘?гّг?гْгّгَ‘إгٌгٌ."
        );
      } finally {
        if (requestId !== txRequestIdRef.current) return;
        if (append) {
          setIsLoadingMore(false);
        } else {
          setLoading(false);
          setIsInitialLoading(false);
        }
      }
    },
    [session, txQuery]
  );

  const refreshAfterMutation = useCallback(async () => {
    await loadItems();
    await loadTransactions({ cursor: null, append: false });
    await loadItemTransactionCounts();
  }, [loadItems, loadTransactions, loadItemTransactionCounts]);

  async function loadAll() {
    await refreshAfterMutation();
    await loadBanks();
    return;
    /*
    setLoading(true);
    setError(null);
    try {
      const [itemsData, txData, deletedData, banksData] = await Promise.all([
        fetchItems({ includeArchived: true, includeClosed: true }),
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
    */
  }

  useEffect(() => {
    if (!session) return;
    loadItems();
    loadItemTransactionCounts();
    loadBanks();
    loadCounterparties();
  }, [session, loadBanks, loadCounterparties, loadItems, loadItemTransactionCounts]);

  useEffect(() => {
    if (!session) return;
    setIsInitialLoading(true);
    const handle = setTimeout(() => {
      setTxs([]);
      setTxCursor(null);
      setHasMoreTxs(false);
      loadTransactions({ cursor: null, append: false });
    }, 300);
    return () => clearTimeout(handle);
  }, [session, loadTransactions, txQuery]);

  useEffect(() => {
    const dates = new Set<string>();
    txs.forEach((tx) => {
      const dateKey = getDateKey(tx.transaction_date);
      if (dateKey) dates.add(dateKey);
    });

    const missingDates = Array.from(dates).filter(
      (date) => !fxRatesByDate[date]
    );
    if (missingDates.length === 0) return;

    let cancelled = false;
    (async () => {
      try {
        const ratesByDate = await fetchFxRatesBatch(missingDates);
        if (cancelled) return;
        setFxRatesByDate((prev) => {
          const next = { ...prev };
          Object.entries(ratesByDate).forEach(([date, rates]) => {
            if (rates && rates.length) next[date] = rates;
          });
          return next;
        });
      } catch {
        // ignore fx-rate batch errors
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [txs, fxRatesByDate]);

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

  const filteredTxs = useMemo(
    () => txs.map((tx) => ({ ...tx, isDeleted: Boolean(tx.deleted_at) })),
    [txs]
  );

  const sortedTxs = useMemo(() => filteredTxs, [filteredTxs]);
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
  const showSkeleton = (loading || isInitialLoading) && sortedTxs.length === 0;
  const handleLoadMore = useCallback(() => {
    if (!hasMoreTxs || isLoadingMore || loading) return;
    loadTransactions({ cursor: txCursor, append: true });
  }, [hasMoreTxs, isLoadingMore, loading, loadTransactions, txCursor]);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const importPdfInputRef = useRef<HTMLInputElement | null>(null);
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
  const resetItemFilters = () => {
    setSelectedItemIds(new Set());
    setItemFilterResetKey((prev) => prev + 1);
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
  const toggleCategoryFilterSelection = (path: { l1: string; l2: string; l3: string }) => {
    const key = makeCategoryPathKey(
      normalizeCategoryValue(path.l1),
      normalizeCategoryValue(path.l2),
      normalizeCategoryValue(path.l3)
    );
    setSelectedCategoryFilterKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };
  const resetCategoryFilters = () => {
    setSelectedCategoryFilterKeys(new Set());
  };
  const resetCounterpartyFilters = () => {
    setSelectedCounterpartyIds(new Set());
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
    <main
      className={cn(
        "min-h-screen pr-8 py-8",
        isCollapsed ? "pl-[56px]" : "pl-[32px]"
      )}
    >
      {error && <div className="mb-4 text-sm text-red-600">{error}</div>}

      <div className="flex flex-col gap-6 lg:flex-row">
        <aside
          className={`shrink-0 transition-[width] duration-300 ${
            isFilterPanelCollapsed ? "w-[100px]" : "w-[350px]"
          }`}
        >
          <div 
            className="sticky top-[10px] flex flex-col rounded-[9px] p-[10px]"
            style={{ backgroundColor: SIDEBAR_BG }}
          >
            {/* Collapse button */}
            <div className="relative h-[55px] shrink-0">
              <Button
                variant="glass"
                onClick={toggleFilterPanel}
                className={`absolute top-[10px] h-[35px] w-[35px] rounded-[9px] p-0 ${
                  isFilterPanelCollapsed ? "left-1/2 -translate-x-1/2" : "right-0"
                }`}
                style={
                  {
                    "--glass-bg": "rgba(108, 93, 215, 0.22)",
                    "--glass-bg-hover": "rgba(108, 93, 215, 0.32)",
                  } as React.CSSProperties
                }
                aria-label={isFilterPanelCollapsed ? "Развернуть фильтры" : "Свернуть фильтры"}
              >
                {isFilterPanelCollapsed ? (
                  <ArrowRight
                    className="size-[15px]"
                    strokeWidth={1.5}
                    style={{ color: SIDEBAR_TEXT_INACTIVE }}
                  />
                ) : (
                  <ArrowLeft
                    className="size-[15px]"
                    strokeWidth={1.5}
                    style={{ color: SIDEBAR_TEXT_INACTIVE }}
                  />
                )}
              </Button>
            </div>
            
            {isFilterPanelCollapsed ? (
              /* Collapsed state - icons only */
              <div className="mt-[10px] flex flex-col items-center gap-4 pb-[10px]">
                <Tooltip content="Добавить транзакцию" side="right">
                  <Button
                    className="h-[50px] w-[50px] rounded-[9px] p-0"
                    style={{
                      backgroundColor: ACCENT,
                    }}
                    onClick={() => {
                      if (dialogMode === "edit" || dialogMode === "bulk-edit") return;
                      openCreateDialog();
                    }}
                  >
                    <Plus className="h-6 w-6 text-white" />
                  </Button>
                </Tooltip>
                <Tooltip content="Загрузить чек" side="right">
                  <button
                    type="button"
                    className="flex h-[50px] w-[50px] items-center justify-center rounded-[9px] border border-[rgba(181,174,230,0.7)] bg-transparent transition-colors hover:bg-[rgba(108,93,215,0.22)]"
                    onClick={() => qrCodeInputRef.current?.click()}
                    disabled={isQrCodeLoading}
                  >
                    <Receipt className="h-6 w-6" style={{ color: SIDEBAR_TEXT_INACTIVE }} />
                  </button>
                </Tooltip>
                <Tooltip content="Импортировать выписку" side="right">
                  <button
                    type="button"
                    className="flex h-[50px] w-[50px] items-center justify-center rounded-[9px] border border-[rgba(181,174,230,0.7)] bg-transparent transition-colors hover:bg-[rgba(108,93,215,0.22)]"
                    onClick={() => handleImportOpenChange(true)}
                  >
                    <FileDown className="h-6 w-6" style={{ color: SIDEBAR_TEXT_INACTIVE }} />
                  </button>
                </Tooltip>
                <div className="my-2 h-px w-full bg-[rgba(181,174,230,0.3)]" />
                <Tooltip content="Вид транзакции" side="right">
                  <button
                    type="button"
                    className="flex h-[50px] w-[50px] items-center justify-center rounded-[9px] border border-[rgba(181,174,230,0.7)] bg-transparent transition-colors hover:bg-[rgba(108,93,215,0.22)]"
                  >
                    <ArrowRight className="h-6 w-6" style={{ color: SIDEBAR_TEXT_INACTIVE }} />
                  </button>
                </Tooltip>
                <Tooltip content="Сумма" side="right">
                  <button
                    type="button"
                    className="flex h-[50px] w-[50px] items-center justify-center rounded-[9px] border border-[rgba(181,174,230,0.7)] bg-transparent transition-colors hover:bg-[rgba(108,93,215,0.22)]"
                  >
                    <Coins className="h-6 w-6" style={{ color: SIDEBAR_TEXT_INACTIVE }} />
                  </button>
                </Tooltip>
                <Tooltip content="Дата" side="right">
                  <button
                    type="button"
                    className="flex h-[50px] w-[50px] items-center justify-center rounded-[9px] border border-[rgba(181,174,230,0.7)] bg-transparent transition-colors hover:bg-[rgba(108,93,215,0.22)]"
                  >
                    <Calendar className="h-6 w-6" style={{ color: SIDEBAR_TEXT_INACTIVE }} />
                  </button>
                </Tooltip>
                <Tooltip content="Валюта" side="right">
                  <button
                    type="button"
                    className="flex h-[50px] w-[50px] items-center justify-center rounded-[9px] border border-[rgba(181,174,230,0.7)] bg-transparent transition-colors hover:bg-[rgba(108,93,215,0.22)]"
                  >
                    <Coins className="h-6 w-6" style={{ color: SIDEBAR_TEXT_INACTIVE }} />
                  </button>
                </Tooltip>
                <Tooltip content="Активы/обязательства" side="right">
                  <button
                    type="button"
                    className="flex h-[50px] w-[50px] items-center justify-center rounded-[9px] border border-[rgba(181,174,230,0.7)] bg-transparent transition-colors hover:bg-[rgba(108,93,215,0.22)]"
                  >
                    <Wallet className="h-6 w-6" style={{ color: SIDEBAR_TEXT_INACTIVE }} />
                  </button>
                </Tooltip>
                <Tooltip content="Категории" side="right">
                  <button
                    type="button"
                    className="flex h-[50px] w-[50px] items-center justify-center rounded-[9px] border border-[rgba(181,174,230,0.7)] bg-transparent transition-colors hover:bg-[rgba(108,93,215,0.22)]"
                  >
                    <Folder className="h-6 w-6" style={{ color: SIDEBAR_TEXT_INACTIVE }} />
                  </button>
                </Tooltip>
                <Tooltip content="Контрагенты" side="right">
                  <button
                    type="button"
                    className="flex h-[50px] w-[50px] items-center justify-center rounded-[9px] border border-[rgba(181,174,230,0.7)] bg-transparent transition-colors hover:bg-[rgba(108,93,215,0.22)]"
                  >
                    <Users className="h-6 w-6" style={{ color: SIDEBAR_TEXT_INACTIVE }} />
                  </button>
                </Tooltip>
                <Tooltip content="Комментарий" side="right">
                  <button
                    type="button"
                    className="flex h-[50px] w-[50px] items-center justify-center rounded-[9px] border border-[rgba(181,174,230,0.7)] bg-transparent transition-colors hover:bg-[rgba(108,93,215,0.22)]"
                  >
                    <MessageSquare className="h-6 w-6" style={{ color: SIDEBAR_TEXT_INACTIVE }} />
                  </button>
                </Tooltip>
                <Tooltip content="Статус" side="right">
                  <button
                    type="button"
                    className="flex h-[50px] w-[50px] items-center justify-center rounded-[9px] border border-[rgba(181,174,230,0.7)] bg-transparent transition-colors hover:bg-[rgba(108,93,215,0.22)]"
                  >
                    <CheckCircle2 className="h-6 w-6" style={{ color: SIDEBAR_TEXT_INACTIVE }} />
                  </button>
                </Tooltip>
                <Tooltip content="Тип транзакции" side="right">
                  <button
                    type="button"
                    className="flex h-[50px] w-[50px] items-center justify-center rounded-[9px] border border-[rgba(181,174,230,0.7)] bg-transparent transition-colors hover:bg-[rgba(108,93,215,0.22)]"
                  >
                    <FileText className="h-6 w-6" style={{ color: SIDEBAR_TEXT_INACTIVE }} />
                  </button>
                </Tooltip>
              </div>
            ) : (
              /* Expanded state - full filters */
              <div className="mt-[10px] flex flex-1 flex-col gap-4 pb-[10px]">
                <div className="space-y-[10px]">
                {/* Add button with gradient */}
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
                    <Button
                      className="w-full h-10 rounded-[9px] border-0 flex items-center justify-center transition-colors hover:opacity-90 text-sm font-normal"
                      style={{
                        backgroundColor: ACCENT,
                      }}
                    >
                      <Plus className="mr-2 h-5 w-5" style={{ color: "white", opacity: 0.85 }} />
                      <span style={{ color: "white", opacity: 0.85 }}>Добавить</span>
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
                        if (primaryIsMoex || counterpartyIsMoex) {
                          setFormError("Операции погашения не поддерживают MOEX инструменты.");
                          return;
                        }

                        const primaryMeta = getEffectiveItemMeta(primaryItemId);
                        if (primaryMeta?.minDate && date < primaryMeta.minDate) {
                          setFormError(
                            "Дата транзакции не может быть раньше даты начала действия выбранного актива/обязательства."
                          );
                          return;
                        }
                        const counterpartyMeta = getEffectiveItemMeta(counterpartyItemId);
                        if (
                          counterpartyMeta?.minDate &&
                          date < counterpartyMeta.minDate
                        ) {
                          setFormError(
                            "Дата транзакции не может быть раньше даты начала действия корреспондирующего актива/обязательства."
                          );
                          return;
                        }
                        if (
                          primaryMeta?.currencyCode &&
                          counterpartyMeta?.currencyCode &&
                          primaryMeta.currencyCode !== counterpartyMeta.currencyCode
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
                        const expenseCategoryId = resolveCategoryId(cat1, cat2, cat3);
                        if (!expenseCategoryId) {
                          setFormError("Выберите категорию из списка.");
                          return;
                        }
                        const basePayload = {
                          transaction_date: transactionDate,
                          primary_item_id: primaryItemId,
                          counterparty_id: counterpartyId ?? null,
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
                            category_id: expenseCategoryId,
                          };
                          const transferPayload = {
                            ...basePayload,
                            counterparty_item_id: counterpartyItemId,
                            amount_rub: principalCents,
                            amount_counterparty: null,
                            direction: "TRANSFER" as const,
                            category_id: null,
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
                      let primaryLotsValue: number | null = null;
                      let counterpartyLotsValue: number | null = null;

                      if (primaryIsMoex) {
                        const parsedLots = parseLots(primaryQuantityLots);
                        if (!Number.isFinite(parsedLots) || parsedLots < 0) {
                          setFormError("Укажите корректное количество лотов для MOEX инструмента.");
                          return;
                        }
                        primaryLotsValue = parsedLots;
                      } else if (primaryQuantityLots.trim()) {
                        setFormError("Количество лотов можно указывать только для MOEX инструментов.");
                        return;
                      }

                      if (isTransfer && counterpartyIsMoex) {
                        const parsedLots = parseLots(counterpartyQuantityLots);
                        if (!Number.isFinite(parsedLots) || parsedLots < 0) {
                          setFormError("Укажите корректное количество лотов для MOEX инструмента.");
                          return;
                        }
                        counterpartyLotsValue = parsedLots;
                      } else if (counterpartyQuantityLots.trim()) {
                        setFormError("Количество лотов можно указывать только для MOEX инструментов.");
                        return;
                      }

                      const primaryMeta = getEffectiveItemMeta(primaryItemId);
                      if (primaryMeta?.minDate && date < primaryMeta.minDate) {
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
                        const counterpartyMeta = getEffectiveItemMeta(counterpartyItemId);
                        if (
                          counterpartyMeta?.minDate &&
                          date < counterpartyMeta.minDate
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
                        const resolvedCategoryId = isTransfer
                          ? null
                          : resolveCategoryId(cat1, cat2, cat3);
                        if (!isTransfer && !resolvedCategoryId) {
                          setFormError("Выберите категорию из списка.");
                          return;
                        }
                        const payload = {
                          transaction_date: transactionDate,
                          primary_item_id: primaryItemId,
                          counterparty_item_id: isTransfer
                            ? counterpartyItemId
                            : null,
                          counterparty_id: counterpartyId ?? null,
                          amount_rub: cents,
                          amount_counterparty: isTransfer ? counterpartyCents : null,
                          primary_quantity_lots: primaryIsMoex ? primaryLotsValue : null,
                          counterparty_quantity_lots: isTransfer && counterpartyIsMoex ? counterpartyLotsValue : null,
                          direction,
                          transaction_type: payloadTransactionType,
                          category_id: resolvedCategoryId,
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
                        <div className="inline-flex w-full items-stretch overflow-hidden rounded-full border-2 border-border/70 bg-card p-0.5">
                          <button
                            type="button"
                            aria-pressed={isActualTransaction}
                            onClick={() => setFormTransactionType("ACTUAL")}
                            className={`${segmentedButtonBase} ${
                              isActualTransaction
                                ? "bg-violet-50 text-violet-700"
                                : "bg-card text-muted-foreground hover:bg-accent"
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
                                : "bg-card text-muted-foreground hover:bg-accent"
                            }`}
                          >
                            Плановая
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="grid gap-2" role="group" aria-label="Характер транзакции">
                      <div className="inline-flex w-full items-stretch overflow-hidden rounded-full border-2 border-border/70 bg-card p-0.5">
                        <button
                          type="button"
                          aria-pressed={!isLoanRepayment && direction === "INCOME"}
                          onClick={() => {
                            setFormMode("STANDARD");
                            setDirection("INCOME");
                            setCounterpartyItemId(null);
                            applyCategorySelection("", "", "");
                          }}
                          className={`${segmentedButtonBase} ${
                            !isLoanRepayment && direction === "INCOME"
                              ? "bg-green-50 text-green-700"
                              : "bg-card text-muted-foreground hover:bg-accent"
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
                            applyCategorySelection("", "", "");
                          }}
                          className={`${segmentedButtonBase} ${
                            !isLoanRepayment && direction === "EXPENSE"
                              ? "bg-red-50 text-red-700"
                              : "bg-card text-muted-foreground hover:bg-accent"
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
                              : "bg-card text-muted-foreground hover:bg-accent"
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
                              applyCategorySelection("", "", "");
                            }}
                            className={`${segmentedButtonBase} whitespace-normal leading-tight ${
                              isLoanRepayment
                                ? "bg-amber-50 text-amber-700"
                                : "bg-card text-muted-foreground hover:bg-accent"
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
                        className="border-2 border-border/70 bg-card shadow-none"
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
                      <ItemSelector
                        items={primarySelectItems}
                        selectedIds={primaryItemId ? [primaryItemId] : []}
                        onChange={(ids) => setPrimaryItemId(ids[0] ?? null)}
                        selectionMode="single"
                        placeholder="Выберите"
                        getItemTypeLabel={getItemTypeLabel}
                        getItemKind={resolveItemEffectiveKind}
                        getBankLogoUrl={itemBankLogoUrl}
                        getBankName={itemBankName}
                        getItemBalance={getItemDisplayBalanceCents}
                        itemCounts={itemTxCounts}
                        disabled={isImportFormDisabled}
                      />
                    </div>

                    {showCounterpartySelect && (
                      <div className="grid gap-2">
                        <Label>
                          {isLoanRepayment
                            ? "Обязательство"
                            : "Корреспондирующий актив"}
                        </Label>
                        <ItemSelector
                          items={counterpartySelectItems.filter(
                            (it) => it.id !== primaryItemId
                          )}
                          selectedIds={
                            counterpartyItemId ? [counterpartyItemId] : []
                          }
                          onChange={(ids) => setCounterpartyItemId(ids[0] ?? null)}
                          selectionMode="single"
                          placeholder="Выберите"
                          getItemTypeLabel={getItemTypeLabel}
                          getItemKind={resolveItemEffectiveKind}
                          getBankLogoUrl={itemBankLogoUrl}
                          getBankName={itemBankName}
                          getItemBalance={getItemDisplayBalanceCents}
                          itemCounts={itemTxCounts}
                        />
                      </div>
                    )}

                    {!isTransfer && (
                      <div className="grid gap-2">
                        <Label>Контрагент</Label>
                        <CounterpartySelector
                          counterparties={selectableCounterparties}
                          selectedIds={counterpartyId ? [counterpartyId] : []}
                          onChange={(ids) => setCounterpartyId(ids[0] ?? null)}
                          selectionMode="single"
                          placeholder="Начните вводить название"
                          industries={industries}
                          disabled={counterpartyLoading}
                          counterpartyCounts={counterpartyTxCounts}
                        />
                        {counterpartyError && (
                          <p className="text-xs text-red-600">{counterpartyError}</p>
                        )}
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
                            className="border-2 border-border/70 bg-card shadow-none"
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
                            className="border-2 border-border/70 bg-card shadow-none"
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
                            className="border-2 border-border/70 bg-card shadow-none"
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
                            className="border-2 border-border/70 bg-card shadow-none"
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
                        <div className="flex items-center justify-between">
                          <Label>
                            {primaryCurrencyCode
                              ? `Сумма (${primaryCurrencyCode})`
                              : "Сумма"}
                          </Label>
                          {isTransfer && primaryItemId && (
                            <button
                              type="button"
                              onClick={handleFullAmountClick}
                              className="text-sm font-medium text-violet-600 hover:underline"
                            >
                              Вся сумма
                            </button>
                          )}
                        </div>
                        <Input
                          className="border-2 border-border/70 bg-card shadow-none"
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
                    {!isBulkEdit &&
                      !isLoanRepayment &&
                      (primaryIsMoex || (isTransfer && counterpartyIsMoex)) && (
                        <div className="grid gap-3 rounded-lg border border-dashed border-violet-200 bg-violet-50/40 p-3">
                          {primaryIsMoex && (
                            <div className="grid gap-2">
                              <Label>Количество лотов (основной актив)</Label>
                              <Input
                                className="border-2 border-border/70 bg-card shadow-none"
                                value={primaryQuantityLots}
                                onChange={(e) => setPrimaryQuantityLots(e.target.value)}
                                inputMode="numeric"
                                placeholder="Например: 10"
                              />
                            </div>
                          )}
                          {isTransfer && counterpartyIsMoex && (
                            <div className="grid gap-2">
                              <Label>Количество лотов (контрагент)</Label>
                              <Input
                                className="border-2 border-border/70 bg-card shadow-none"
                                value={counterpartyQuantityLots}
                                onChange={(e) => setCounterpartyQuantityLots(e.target.value)}
                                inputMode="numeric"
                                placeholder="Например: 10"
                              />
                            </div>
                          )}
                        </div>
                      )}

                    {!isTransfer && (
                      <div className="grid gap-2">
                        <Label>Категория</Label>
                        <CategorySelector
                          categoryNodes={categoryNodes}
                          selectedPath={selectedCategoryPath}
                          onChange={(path) => {
                            if (path) {
                              applyCategorySelection(path.l1, path.l2, path.l3);
                            } else {
                              applyCategorySelection("", "", "");
                            }
                          }}
                          placeholder="Поиск категории"
                          direction={direction}
                          disabled={false}
                        />
                      </div>
                    )}

                    <div className="grid gap-2">
                      <Label>Описание</Label>
                      <Input
                        className="border-2 border-border/70 bg-card shadow-none"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Например: обед в кафе"
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label>Комментарий</Label>
                      <Input
                        className="border-2 border-border/70 bg-card shadow-none"
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder="Например: с коллегами"
                      />
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="border-2 border-border/70 bg-card shadow-none"
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

              <input
                ref={qrCodeInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    handleQrCodeUpload(file);
                  }
                }}
              />
              <Button
                type="button"
                variant="glass"
                className="w-full h-10 text-sm font-normal rounded-[9px] border-0 flex items-center justify-center"
                style={
                  {
                    "--glass-bg": "rgba(108, 93, 215, 0.22)",
                    "--glass-bg-hover": "rgba(108, 93, 215, 0.4)",
                  } as React.CSSProperties
                }
                onClick={() => qrCodeInputRef.current?.click()}
                disabled={isQrCodeLoading}
              >
                <QrCode className="mr-2 h-5 w-5" style={{ color: "white", opacity: 0.85 }} />
                <span style={{ color: "white", opacity: 0.85 }}>
                  {isQrCodeLoading ? "Обработка..." : "Загрузить чек"}
                </span>
              </Button>

              <Dialog open={isImportDialogOpen} onOpenChange={handleImportOpenChange}>
                <DialogTrigger asChild>
                  <Button
                    variant="glass"
                    className="w-full h-10 text-sm font-normal rounded-[9px] border-0 flex items-center justify-center"
                    style={
                      {
                        "--glass-bg": "rgba(108, 93, 215, 0.22)",
                        "--glass-bg-hover": "rgba(108, 93, 215, 0.4)",
                      } as React.CSSProperties
                    }
                  >
                    <FileDown className="mr-2 h-5 w-5" style={{ color: "white", opacity: 0.85 }} />
                    <span style={{ color: "white", opacity: 0.85 }}>Импортировать выписку</span>
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[520px]">
                  <DialogHeader>
                    <DialogTitle>Импорт</DialogTitle>
                  </DialogHeader>
                  <form className="grid gap-4" onSubmit={handleImportSubmit}>
                    <div className="grid gap-2">
                      <Label>Банк</Label>
                      <div className="relative">
                        <Input
                          value={importBankSearch}
                          onChange={(e) => {
                            setImportBankSearch(e.target.value);
                            setImportBankId(null);
                            setImportBankDropdownOpen(true);
                            setImportError(null);
                          }}
                          onClick={() => {
                            setImportBankDropdownOpen(true);
                            setImportError(null);
                          }}
                          onBlur={() =>
                            setTimeout(() => setImportBankDropdownOpen(false), 150)
                          }
                          placeholder="Начните вводить название банка"
                          className="border-2 border-border/70 bg-card shadow-none"
                        />
                        {importBankDropdownOpen && (
                          <div className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border/60 bg-card shadow-lg">
                            {filteredImportBanks.length === 0 ? (
                              <div className="px-3 py-2 text-sm text-muted-foreground">
                                Банк не найден
                              </div>
                            ) : (
                              filteredImportBanks.map((bank) => (
                                <button
                                  key={bank.id}
                                  type="button"
                                  className={[
                                    "flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50",
                                    importBankId === bank.id ? "bg-slate-50" : "",
                                  ].join(" ")}
                                  onMouseDown={(event) => event.preventDefault()}
                                  onClick={() => {
                                    setImportBankId(bank.id);
                                    setImportBankSearch(bank.name);
                                    setImportBankDropdownOpen(false);
                                    setImportError(null);
                                  }}
                                >
                                  {bank.logo_url ? (
                                    <img
                                      src={bank.logo_url}
                                      alt=""
                                      className="h-8 w-8 rounded border border-border/60 object-contain bg-white"
                                      loading="lazy"
                                    />
                                  ) : (
                                    <div className="h-8 w-8 rounded border border-border/60 bg-slate-100" />
                                  )}
                                  <div className="flex flex-col">
                                    <span className="text-sm font-medium">{bank.name}</span>
                                    <span className="text-xs text-muted-foreground">
                                      {bank.license_status}
                                    </span>
                                  </div>
                                </button>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {isImportBankInProgress && (
                      <>
                        <div className="grid gap-2">
                          <Label>Файл .pdf</Label>
                          <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-muted-foreground">
                            Поддерживаются выписки Сбербанк Онлайн и Альфа-Банк. Можно
                            загружать многостраничные документы.
                          </div>
                          <Input
                            ref={importPdfInputRef}
                            type="file"
                            accept=".pdf"
                            className="border-2 border-border/70 bg-card shadow-none"
                            disabled={isImportFormDisabled}
                            onChange={(e) => {
                              const file = e.target.files?.[0] ?? null;
                              setImportPdfFile(file);
                              setImportError(null);
                            }}
                          />
                        </div>

                        <div className="grid gap-2">
                          <Label>Счет</Label>
                          <ItemSelector
                            items={activeItems}
                            selectedIds={importItemId ? [importItemId] : []}
                            onChange={(ids) => {
                              setImportItemId(ids[0] ?? null);
                              setImportError(null);
                            }}
                            selectionMode="single"
                            placeholder="Выберите счет"
                            getItemTypeLabel={getItemTypeLabel}
                            getItemKind={resolveItemEffectiveKind}
                            getBankLogoUrl={itemBankLogoUrl}
                            getBankName={itemBankName}
                            getItemBalance={getItemDisplayBalanceCents}
                            itemCounts={itemTxCounts}
                            disabled={isImportFormDisabled}
                            ariaLabel="Счет"
                          />
                        </div>

                        <label className="flex items-center gap-3 px-3 py-2 text-xs text-foreground">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-violet-600"
                            disabled={isImportFormDisabled}
                            checked={importConfirmed}
                            onChange={(e) => setImportConfirmed(e.target.checked)}
                          />
                          Импортировать транзакции сразу в статусе "Подтвержденная"
                        </label>
                      </>
                    )}

                    {isImportBankReady && (
                      <>
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
                        className="border-2 border-border/70 bg-card shadow-none"
                        disabled={isImportFormDisabled}
                        onChange={(e) => {
                          const file = e.target.files?.[0] ?? null;
                          setImportFile(file);
                          setImportError(null);
                        }}
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label>Счет</Label>
                      <ItemSelector
                        items={activeItems}
                        selectedIds={importItemId ? [importItemId] : []}
                        onChange={(ids) => {
                          setImportItemId(ids[0] ?? null);
                          setImportError(null);
                        }}
                        selectionMode="single"
                        placeholder="Выберите счет"
                      getItemTypeLabel={getItemTypeLabel}
                      getItemKind={resolveItemEffectiveKind}
                      getBankLogoUrl={itemBankLogoUrl}
                        getBankName={itemBankName}
                        getItemBalance={getItemDisplayBalanceCents}
                        itemCounts={itemTxCounts}
                        disabled={isImportFormDisabled}
                        ariaLabel="Счет"
                      />
                    </div>

                    <label className="flex items-center gap-3 px-3 py-2 text-xs text-foreground">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-violet-600"
                        disabled={isImportFormDisabled}
                        checked={importConfirmed}
                        onChange={(e) => setImportConfirmed(e.target.checked)}
                      />
                      Импортировать транзакции сразу в статусе "Подтвержденная"
                    </label>
                    </>
                  )}

                    {importError && (
                      <div className="text-sm text-red-600">{importError}</div>
                    )}

                    <div className="flex justify-end gap-2 pt-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="border-2 border-border/70 bg-card shadow-none"
                        onClick={() => handleImportOpenChange(false)}
                        disabled={isImporting}
                      >
                        Отмена
                      </Button>
                      <Button
                        type="submit"
                        className="bg-violet-600 text-white hover:bg-violet-700"
                        disabled={isImportFormDisabled || !isImportSupported}
                      >
                        Импортировать
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="text-sm font-medium" style={{ color: SIDEBAR_TEXT_ACTIVE }}>
                    Вид транзакции
                  </div>
                  {selectedDirections.size > 0 && (
                    <button
                      type="button"
                      className="text-sm font-medium hover:underline disabled:opacity-50"
                      style={{ color: ACCENT }}
                      onClick={() =>
                        setSelectedDirections(
                          new Set<TransactionOut["direction"]>()
                        )
                      }
                    >
                      Сбросить
                    </button>
                  )}
                </div>
                <SegmentedSelector
                  options={[
                    { value: "INCOME", label: "Доход" },
                    { value: "EXPENSE", label: "Расход" },
                    { value: "TRANSFER", label: "Перевод" },
                  ]}
                  value={selectedDirections}
                  onChange={(value) => setSelectedDirections(value as Set<TransactionOut["direction"]>)}
                  multiple={true}
                />
              </div>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="text-sm font-medium" style={{ color: SIDEBAR_TEXT_ACTIVE }}>
                    Сумма транзакции
                  </div>
                  {(amountFrom || amountTo) && (
                    <button
                      type="button"
                      className="text-sm font-medium hover:underline disabled:opacity-50"
                      style={{ color: ACCENT }}
                      onClick={() => {
                        setAmountFrom("");
                        setAmountTo("");
                      }}
                    >
                      Сбросить
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="[&_div.relative.flex.items-center]:h-10 [&_input]:text-sm [&_input]:font-normal [&_input:not(:placeholder-shown)]:text-white">
                      <AuthInput
                        type="text"
                        inputMode="decimal"
                        placeholder="От"
                        value={amountFrom}
                        onChange={(e) =>
                          setAmountFrom(formatRubInput(e.target.value))
                        }
                        onBlur={() =>
                          setAmountFrom((prev) => normalizeRubOnBlur(prev))
                        }
                      />
                    </div>
                  </div>
                  <span className="text-sm" style={{ color: SIDEBAR_TEXT_INACTIVE }}>—</span>
                  <div className="flex-1 min-w-0">
                    <div className="[&_div.relative.flex.items-center]:h-10 [&_input]:text-sm [&_input]:font-normal [&_input:not(:placeholder-shown)]:text-white">
                      <AuthInput
                        type="text"
                        inputMode="decimal"
                        placeholder="До"
                        value={amountTo}
                        onChange={(e) => setAmountTo(formatRubInput(e.target.value))}
                        onBlur={() => setAmountTo((prev) => normalizeRubOnBlur(prev))}
                      />
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="text-sm font-medium" style={{ color: SIDEBAR_TEXT_ACTIVE }}>
                    Дата транзакции
                  </div>
                  {(dateFrom || dateTo) && (
                    <button
                      type="button"
                      className="text-sm font-medium hover:underline disabled:opacity-50"
                      style={{ color: ACCENT }}
                      onClick={() => {
                        setDateFrom("");
                        setDateTo("");
                      }}
                    >
                      Сбросить
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="[&_div.relative.flex.items-center]:h-10 [&_input]:text-sm [&_input]:font-normal">
                      <AuthInput
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        style={{
                          color: !dateFrom ? PLACEHOLDER_COLOR : ACTIVE_TEXT,
                        }}
                      />
                    </div>
                  </div>
                  <span className="text-sm" style={{ color: SIDEBAR_TEXT_INACTIVE }}>—</span>
                  <div className="flex-1 min-w-0">
                    <div className="[&_div.relative.flex.items-center]:h-10 [&_input]:text-sm [&_input]:font-normal">
                      <AuthInput
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        style={{
                          color: !dateTo ? PLACEHOLDER_COLOR : ACTIVE_TEXT,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-1">
                    <div className="text-sm font-medium" style={{ color: SIDEBAR_TEXT_ACTIVE }}>
                      Валюта
                    </div>
                    <button
                      type="button"
                      aria-label="Свернуть/развернуть"
                      className="rounded-md p-1 hover:bg-[rgba(108,93,215,0.22)] transition-colors"
                      onClick={() => setIsCurrencyFilterOpen((prev) => !prev)}
                    >
                      <ChevronDown
                        className={`h-4 w-4 transition-transform ${
                          isCurrencyFilterOpen ? "rotate-0" : "-rotate-90"
                        }`}
                        style={{ color: SIDEBAR_TEXT_INACTIVE }}
                      />
                    </button>
                  </div>
                  {selectedCurrencyCodes.size > 0 && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="text-sm font-medium hover:underline disabled:opacity-50"
                        style={{ color: ACCENT }}
                        onClick={() => setSelectedCurrencyCodes(new Set<string>())}
                      >
                        Сбросить
                      </button>
                    </div>
                  )}
                </div>

                {isCurrencyFilterOpen && (
                  <div className="space-y-2">
                    {currencyOptions.length === 0 ? (
                      <div className="text-sm" style={{ color: SIDEBAR_TEXT_INACTIVE }}>
                        Нет валют.
                      </div>
                    ) : (
                      currencyOptions.map((value) => (
                        <label
                          key={value}
                          className="flex items-center gap-3 text-sm cursor-pointer"
                          style={{ color: SIDEBAR_TEXT_ACTIVE }}
                        >
                          <input
                            type="checkbox"
                            className="h-5 w-5"
                            style={{ accentColor: ACCENT }}
                            checked={selectedCurrencyCodes.has(value)}
                            onChange={() => toggleCurrencySelection(value)}
                          />
                          <span>{value}</span>
                        </label>
                      ))
                    )}
                  </div>
                )}
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="text-sm font-medium" style={{ color: SIDEBAR_TEXT_ACTIVE }}>
                    Активы/обязательства
                  </div>
                  {selectedItemIds.size > 0 && (
                    <button
                      type="button"
                      className="text-sm font-medium hover:underline disabled:opacity-50"
                      style={{ color: ACCENT }}
                      onClick={resetItemFilters}
                    >
                      Сбросить
                    </button>
                  )}
                </div>
                <ItemSelector
                  items={activeItems}
                  selectedIds={Array.from(selectedItemIds)}
                  onChange={(ids) => setSelectedItemIds(new Set(ids))}
                  selectionMode="multi"
                  placeholder="Начните вводить название"
                  emptyMessage="Нет активов или обязательств."
                  noResultsMessage="Ничего не найдено"
                  getItemTypeLabel={getItemTypeLabel}
                  getItemKind={resolveItemEffectiveKind}
                  getBankLogoUrl={itemBankLogoUrl}
                  getBankName={itemBankName}
                  getItemBalance={getItemDisplayBalanceCents}
                  itemCounts={itemTxCounts}
                  resetSignal={itemFilterResetKey}
                  ariaLabel="Активы/обязательства"
                />
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="text-sm font-medium" style={{ color: SIDEBAR_TEXT_ACTIVE }}>
                    Категории
                  </div>
                  {selectedCategoryFilterKeys.size > 0 && (
                    <button
                      type="button"
                      className="text-sm font-medium hover:underline disabled:opacity-50"
                      style={{ color: ACCENT }}
                      onClick={resetCategoryFilters}
                    >
                      Сбросить
                    </button>
                  )}
                </div>
                <CategorySelector
                  categoryNodes={categoryNodes}
                  selectedPathKeys={selectedCategoryFilterKeys}
                  onTogglePath={toggleCategoryFilterSelection}
                  selectionMode="multi"
                  placeholder="Поиск категории"
                  showChips={true}
                />
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="text-sm font-medium" style={{ color: SIDEBAR_TEXT_ACTIVE }}>
                    Контрагенты
                  </div>
                  {selectedCounterpartyIds.size > 0 && (
                    <button
                      type="button"
                      className="text-sm font-medium hover:underline disabled:opacity-50"
                      style={{ color: ACCENT }}
                      onClick={resetCounterpartyFilters}
                    >
                      Сбросить
                    </button>
                  )}
                </div>
                <CounterpartySelector
                  counterparties={selectableCounterparties}
                  selectedIds={Array.from(selectedCounterpartyIds)}
                  onChange={(ids) => setSelectedCounterpartyIds(new Set(ids))}
                  selectionMode="multi"
                  placeholder="Начните вводить название"
                  industries={industries}
                  counterpartyCounts={counterpartyTxCounts}
                  showChips={true}
                />
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="text-sm font-medium" style={{ color: SIDEBAR_TEXT_ACTIVE }}>
                    Комментарий
                  </div>
                  {!!commentFilter && (
                    <button
                      type="button"
                      className="text-sm font-medium hover:underline disabled:opacity-50"
                      style={{ color: ACCENT }}
                      onClick={() => setCommentFilter("")}
                    >
                      Сбросить
                    </button>
                  )}
                </div>
                <div className="[&_div.relative.flex.items-center]:h-10 [&_input]:text-sm [&_input]:font-normal [&_input:not(:placeholder-shown)]:text-white">
                  <AuthInput
                    type="text"
                    placeholder="Введите текст"
                    value={commentFilter}
                    onChange={(e) => setCommentFilter(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="text-sm font-medium" style={{ color: SIDEBAR_TEXT_ACTIVE }}>
                    Статус подтверждения
                  </div>
                  {!(showConfirmed && showUnconfirmed) && (
                    <button
                      type="button"
                      className="text-sm font-medium hover:underline disabled:opacity-50"
                      style={{ color: ACCENT }}
                      onClick={() => {
                        setShowConfirmed(true);
                        setShowUnconfirmed(true);
                      }}
                    >
                      Сбросить
                    </button>
                  )}
                </div>
                <SegmentedSelector
                  options={[
                    { value: "confirmed", label: "Подтвержденные" },
                    { value: "unconfirmed", label: "Неподтвержденные" },
                  ]}
                  value={[
                    ...(showConfirmed ? ["confirmed"] : []),
                    ...(showUnconfirmed ? ["unconfirmed"] : []),
                  ]}
                  onChange={(value) => {
                    const values = Array.isArray(value) ? value : [];
                    setShowConfirmed(values.includes("confirmed"));
                    setShowUnconfirmed(values.includes("unconfirmed"));
                  }}
                  multiple={true}
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="text-sm font-medium" style={{ color: SIDEBAR_TEXT_ACTIVE }}>
                    Тип транзакции
                  </div>
                  {(showActual !== defaultShowActual ||
                    showPlanned !== (defaultShowPlannedRealized || defaultShowPlannedUnrealized)) && (
                    <button
                      type="button"
                      className="text-sm font-medium hover:underline disabled:opacity-50"
                      style={{ color: ACCENT }}
                      onClick={() => {
                        setShowActual(defaultShowActual);
                        setShowPlanned(defaultShowPlannedRealized || defaultShowPlannedUnrealized);
                      }}
                    >
                      Сбросить
                    </button>
                  )}
                </div>
                <SegmentedSelector
                  options={[
                    { value: "actual", label: "Фактическая" },
                    { value: "planned", label: "Плановая" },
                  ]}
                  value={[
                    ...(showActual ? ["actual"] : []),
                    ...(showPlanned ? ["planned"] : []),
                  ]}
                  onChange={(value) => {
                    const values = Array.isArray(value) ? value : [];
                    setShowActual(values.includes("actual"));
                    const newShowPlanned = values.includes("planned");
                    setShowPlanned(newShowPlanned);
                    // Если плановая отключена, сбрасываем подтипы
                    if (!newShowPlanned) {
                      setShowPlannedRealized(false);
                      setShowPlannedUnrealized(false);
                    } else if (!showPlannedRealized && !showPlannedUnrealized) {
                      // Если плановая включена, но подтипы не выбраны, выбираем оба по умолчанию
                      setShowPlannedRealized(true);
                      setShowPlannedUnrealized(true);
                    }
                  }}
                  multiple={true}
                />
              </div>

              {showPlanned && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="text-sm font-medium" style={{ color: SIDEBAR_TEXT_ACTIVE }}>
                      Тип плановой транзакции
                    </div>
                    {(showPlannedRealized !== defaultShowPlannedRealized ||
                      showPlannedUnrealized !== defaultShowPlannedUnrealized) && (
                      <button
                        type="button"
                        className="text-sm font-medium hover:underline disabled:opacity-50"
                        style={{ color: ACCENT }}
                        onClick={() => {
                          setShowPlannedRealized(defaultShowPlannedRealized);
                          setShowPlannedUnrealized(defaultShowPlannedUnrealized);
                        }}
                      >
                        Сбросить
                      </button>
                    )}
                  </div>
                  <SegmentedSelector
                    options={[
                      {
                        value: "realized",
                        label: "Реализованная",
                      },
                      {
                        value: "unrealized",
                        label: "Нереализованная",
                      },
                    ]}
                    value={[
                      ...(showPlannedRealized ? ["realized"] : []),
                      ...(showPlannedUnrealized ? ["unrealized"] : []),
                    ]}
                    onChange={(value) => {
                      const values = Array.isArray(value) ? value : [];
                      const newShowPlannedRealized = values.includes("realized");
                      const newShowPlannedUnrealized = values.includes("unrealized");
                      setShowPlannedRealized(newShowPlannedRealized);
                      setShowPlannedUnrealized(newShowPlannedUnrealized);
                      // Если оба подтипа отключены, отключаем "Плановая"
                      if (!newShowPlannedRealized && !newShowPlannedUnrealized) {
                        setShowPlanned(false);
                      }
                    }}
                    multiple={true}
                  />
                </div>
              )}

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="text-sm font-medium" style={{ color: SIDEBAR_TEXT_ACTIVE }}>
                    Статус транзакции
                  </div>
                  {(!showActive || showDeleted) && (
                    <button
                      type="button"
                      className="text-sm font-medium hover:underline disabled:opacity-50"
                      style={{ color: ACCENT }}
                      onClick={() => {
                        setShowActive(true);
                        setShowDeleted(false);
                      }}
                    >
                      Сбросить
                    </button>
                  )}
                </div>
                <SegmentedSelector
                  options={[
                    { value: "active", label: "Активные" },
                    { value: "deleted", label: "Удаленные" },
                  ]}
                  value={[
                    ...(showActive ? ["active"] : []),
                    ...(showDeleted ? ["deleted"] : []),
                  ]}
                  onChange={(value) => {
                    const values = Array.isArray(value) ? value : [];
                    setShowActive(values.includes("active"));
                    setShowDeleted(values.includes("deleted"));
                  }}
                  multiple={true}
                />
              </div>
                </div>
              </div>
            )}
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
            {showSkeleton ? (
              <div className="space-y-3" aria-hidden="true">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div
                    key={`tx-skeleton-${index}`}
                    className="rounded-lg border-2 border-border/70 bg-card p-4"
                  >
                    <div className="flex items-start gap-4">
                      <div className="h-12 w-12 shrink-0 rounded-full bg-slate-100 animate-pulse" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 w-1/3 rounded bg-slate-100 animate-pulse" />
                        <div className="h-3 w-2/3 rounded bg-slate-100 animate-pulse" />
                        <div className="h-3 w-1/2 rounded bg-slate-100 animate-pulse" />
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <div className="h-4 w-20 rounded bg-slate-100 animate-pulse" />
                        <div className="h-3 w-16 rounded bg-slate-100 animate-pulse" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : sortedTxs.length === 0 ? (
              <div
                className="rounded-lg border border-dashed p-6 text-center text-sm bg-transparent"
                style={{ borderColor: ACCENT_FILL_MEDIUM, color: ACTIVE_TEXT }}
              >
                Нет транзакций.
              </div>
            ) : (
              sortedTxs.map((tx) => (
                  <TransactionCardRow
                    key={`${tx.id}-${tx.isDeleted ? "deleted" : "active"}`}
                    tx={tx}
                    counterparty={tx.counterparty_id ? counterpartiesById.get(tx.counterparty_id) ?? null : null}
                    itemName={itemName}
                    itemCurrencyCode={itemCurrencyCode}
                    itemBankLogoUrl={itemBankLogoUrl}
                    itemBankName={itemBankName}
                    categoryIconForId={resolveCategoryIcon}
                    categoryLinesForId={getCategoryLines}
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
            {hasMoreTxs && (
              <div className="flex justify-center pt-2">
                <Button
                  type="button"
                  variant="outline"
                  className="border-2 border-slate-200 bg-card shadow-none"
                  onClick={handleLoadMore}
                  disabled={isLoadingMore || loading}
                >
                  {isLoadingMore ? "Loading..." : "Load more"}
                </Button>
              </div>
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
