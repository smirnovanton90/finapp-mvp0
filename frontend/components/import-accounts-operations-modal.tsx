"use client";

import * as React from "react";
import { Download, Upload } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmModal } from "@/components/confirm-modal";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ItemSelector } from "@/components/item-selector";
import { TbankProfileInfoBadges } from "@/components/tbank-profile-info-badges";
import { FormField } from "@/components/ui/form-field";
import { AuthInput } from "@/components/ui/auth-input";
import { TextField } from "@/components/ui/form-field";
import {
  ACTIVE_TEXT_DARK,
  ACCENT,
  ACCENT2,
  BACKGROUND_DT,
  MODAL_BG,
  PLACEHOLDER_COLOR_DARK,
} from "@/lib/colors";
import { PINK_GRADIENT } from "@/lib/gradients";
import { cn } from "@/lib/utils";
import type { ImportSourceKey } from "@/components/import-history-modal-content";
import {
  parseDzenCSVFile,
  type DzenParsedData,
  isDzenDebtsAccount,
  normalizeParsedDataUndefinedCategory,
} from "@/lib/dzen-csv-parser";
import { parseCoinKeeperCSVFile } from "@/lib/coinkeeper-csv-parser";
import {
  parseTBankXlsxFile,
  parseSberPdfFile,
  parseAlfaPdfFile,
  parseOzonPdfFile,
} from "@/lib/import";
import { formatImportFileParseError } from "@/lib/import/import-parse-error-message";
import { parseExportCsv } from "@/lib/data-export-import";
import { parsedExportToDzenParsedData } from "@/lib/prostofin-to-dzen";
import {
  ImportAccountCard,
  getInitialAccountCardState,
  type ImportAccountCardState,
} from "@/components/import-account-card";
import { CreateCounterpartyModal } from "@/components/create-counterparty-modal";
import { CreateCategoryModal } from "@/components/create-category-modal";
import {
  ImportCategoryCard,
  getInitialCategoryCardState,
  type ImportCategoryCardState,
} from "@/components/import-category-card";
import {
  ImportCounterpartyCard,
  getInitialCounterpartyCardState,
  type ImportCounterpartyCardState,
} from "@/components/import-counterparty-card";
import {
  fetchItems,
  fetchCategories,
  fetchCounterparties,
  fetchCounterpartyIndustries,
  createBalanceCheckpoint,
  API_BASE,
  completeTbankImport,
  fetchTbankAccounts,
  fetchTbankInfo,
  previewTbankImport,
  patchIntegration,
  putAccountLinks,
  createItem,
  type TbankAccountOut,
} from "@/lib/api";
import { parseRubToCents, formatRubInput, normalizeRubOnBlur, formatCentsForInput } from "@/lib/format-rub";
import { formatTimeInput } from "@/lib/format-time";
import { validateStep2, getAccountValidationError, getAccountValidationWarning } from "@/lib/import-step2-validation";
import { validateStep3 } from "@/lib/import-step3-validation";
import { validateStep4 } from "@/lib/import-step4-validation";
import { executeImportDzen, getStatementAccountingStartDate, getStatementLastTransactionDate, getEarliestStatementTransactionDate } from "@/lib/import-dzen-executor";
import { getTypeOptionsForKind, normalizeDisplayTypeCode } from "@/lib/item-type-options";
import { getItemTypeLabel } from "@/lib/item-types";
import { getTbankOperationTypeLabel, sortedTbankTypeEntries } from "@/lib/tbank-operation-type-labels";
import {
  readFileToHeadersAndRows,
  applyMappingToDzenParsedData,
  validateColumnMapping,
  type ColumnMapping,
} from "@/lib/own-statement-parser";
import { ImportOwnColumnMapping } from "@/components/import-own-column-mapping";
import { useAccountingStart } from "@/components/accounting-start-context";
import {
  findMatchingCategoryPath,
  getAllowedScopesForImportedCategoryName,
  findMatchingCounterpartyId,
  findMatchingItemId,
  isTransferCategoryName,
} from "@/lib/import-match-helpers";
import {
  buildTransferFlowMap,
  computeTransferRowsForCategory,
  getStep3TransferModeWarnings,
} from "@/lib/import-transfer-category";
import { filterCounterpartiesForMappingStep } from "@/lib/import-counterparty-step-filter";

/** Минимальная длина токена перед запросом профиля (debounce после ввода). */
const TBANK_TOKEN_PROBE_MIN_LEN = 12;
const TBANK_TOKEN_PROBE_DEBOUNCE_MS = 650;

/** Источники, для которых открывается пошаговый импорт */
type ServiceImportSourceKey =
  | "dzen"
  | "coinkeeper"
  | "own"
  | "tbank"
  | "sber"
  | "alfa"
  | "ozon"
  | "file";

/** Контент шага 1 по источнику импорта */
const STEP1_CONTENT: Record<
  ServiceImportSourceKey,
  { title: string; description: string; instructionLabel: string }
> = {
  dzen: {
    title: "Дзен-мани",
    description:
      "Импортируйте выписку в формате .csv, которую можно выгрузить из мобильного или WEB-приложения",
    instructionLabel: "Инструкция по выгрузке выписки",
  },
  coinkeeper: {
    title: "CoinKeeper",
    description:
      "Импортируйте выписку в формате .csv, которую можно выгрузить из мобильного или WEB-приложения",
    instructionLabel: "Инструкция по выгрузке выписки",
  },
  own: {
    title: "Своя выписка",
    description:
      "Если Вы ранее вели учет самостоятельно, например, в Excel или Google Sheets, то мы поможем Вам без труда импортировать их в ПРОСТОФИН, воспользовавшись несложной инструкцией",
    instructionLabel: "Инструкция по импорту собственной выписки",
  },
  tbank: {
    title: "Т-Банк",
    description: "Загрузите выписку по счёту или карте в формате .xlsx",
    instructionLabel: "",
  },
  sber: {
    title: "Сбербанк",
    description: "Загрузите выписку по счёту или карте в формате .pdf",
    instructionLabel: "",
  },
  alfa: {
    title: "Альфа-Банк",
    description: "Загрузите выписку по счёту или карте в формате .pdf",
    instructionLabel: "",
  },
  ozon: {
    title: "Озон Банк",
    description: "Загрузите выписку (справка о движении средств) в формате .pdf",
    instructionLabel: "",
  },
  file: {
    title: "Данные ПРОСТОФИН",
    description: "Загрузите ранее экспортированный файл .csv для переноса данных",
    instructionLabel: "",
  },
};

const STEPS_DZEN = [
  { key: 1, label: "Выбор файла" },
  { key: 2, label: "Счета" },
  { key: 3, label: "Категории" },
  { key: 4, label: "Контрагенты" },
  { key: 5, label: "Подтверждение" },
] as const;

const STEPS_BANK = [
  { key: 1, label: "Выбор файла" },
  { key: 2, label: "Счета" },
  { key: 3, label: "Категории" },
  { key: 4, label: "Контрагенты" },
  { key: 5, label: "КТ" },
  { key: 6, label: "Подтверждение" },
] as const;

const STEPS_OWN = [
  { key: 1, label: "Выбор файла" },
  { key: 2, label: "Определение данных" },
  { key: 3, label: "Счета" },
  { key: 4, label: "Категории" },
  { key: 5, label: "Контрагенты" },
  { key: 6, label: "Подтверждение" },
] as const;

type ImportStep = 1 | 2 | 3 | 4 | 5 | 6;

export type ImportAccountsOperationsModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Выбранный источник импорта (Дзен-мани, CoinKeeper, Своя выписка) */
  importSource?: ImportSourceKey;
  /** Вызывается при завершении импорта (кнопка «Завершить импорт» / «Подключить» для T-Invest) */
  onFinish?: () => void;
  /** Для режима интеграции T-Invest (tbank_invest_api) */
  tbankIntegrationId?: number | null;
};

function formatShortDateDisplay(dateKey: string): string {
  if (!dateKey || dateKey.length < 10) return dateKey;
  const [y, m, d] = [dateKey.slice(0, 4), dateKey.slice(5, 7), dateKey.slice(8, 10)];
  return `${d}.${m}.${y}`;
}

export function ImportAccountsOperationsModal({
  open,
  onOpenChange,
  importSource = "dzen",
  onFinish,
  tbankIntegrationId = null,
}: ImportAccountsOperationsModalProps) {
  const { accountingStartDate } = useAccountingStart();
  const [step, setStep] = React.useState<ImportStep>(1);
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [isDragOver, setIsDragOver] = React.useState(false);
  const [parsedData, setParsedData] = React.useState<DzenParsedData | null>(null);
  const [parseError, setParseError] = React.useState<string | null>(null);
  const [step2Error, setStep2Error] = React.useState<string | null>(null);
  const [step3Error, setStep3Error] = React.useState<string | null>(null);
  const [step4Error, setStep4Error] = React.useState<string | null>(null);
  const [step5Error, setStep5Error] = React.useState<string | null>(null);
  const [isParsing, setIsParsing] = React.useState(false);
  const [isImporting, setIsImporting] = React.useState(false);
  const [accountCardStates, setAccountCardStates] = React.useState<
    Map<string, ImportAccountCardState>
  >(new Map());
  const [categoryCardStates, setCategoryCardStates] = React.useState<
    Map<string, ImportCategoryCardState>
  >(new Map());
  const [counterpartyCardStates, setCounterpartyCardStates] = React.useState<
    Map<string, ImportCounterpartyCardState>
  >(new Map());
  const [items, setItems] = React.useState<Awaited<ReturnType<typeof fetchItems>>>([]);
  const [counterparties, setCounterparties] = React.useState<
    Awaited<ReturnType<typeof fetchCounterparties>>
  >([]);
  const [industries, setIndustries] = React.useState<
    Awaited<ReturnType<typeof fetchCounterpartyIndustries>>
  >([]);
  const [categories, setCategories] = React.useState<Awaited<ReturnType<typeof fetchCategories>>>([]);
  const [addCounterpartyModalOpen, setAddCounterpartyModalOpen] = React.useState(false);

  // --- T-Invest integration mode state (tbank_invest_api) ---
  const [tbankToken, setTbankToken] = React.useState("");
  const [tbankInfo, setTbankInfo] = React.useState<Awaited<ReturnType<typeof fetchTbankInfo>> | null>(null);
  const [tbankAccounts, setTbankAccounts] = React.useState<TbankAccountOut[]>([]);
  const [tbankError, setTbankError] = React.useState<string | null>(null);
  const [tbankLoading, setTbankLoading] = React.useState(false);
  /** Загрузка профиля по токену (debounce при вводе или повтор по «Далее») */
  const [tbankProfileLoading, setTbankProfileLoading] = React.useState(false);
  const [tbankPreview, setTbankPreview] = React.useState<Awaited<ReturnType<typeof previewTbankImport>> | null>(null);
  const tbankProbeSeqRef = React.useRef(0);
  const tbankLastSuccessfulTokenRef = React.useRef<string | null>(null);

  const isTbankInvestIntegration = importSource === "tbank_invest_api";
  const [addCounterpartyForAccountKey, setAddCounterpartyForAccountKey] = React.useState<string | null>(null);
  const [addCounterpartyDraftName, setAddCounterpartyDraftName] = React.useState("");
  const [confirmCloseOpen, setConfirmCloseOpen] = React.useState(false);
  const [createCategoryOpen, setCreateCategoryOpen] = React.useState(false);
  const [columnMapping, setColumnMapping] = React.useState<ColumnMapping>({});
  const [parsedFileData, setParsedFileData] = React.useState<{
    headers: string[];
    rows: (string | number | boolean | Date)[][];
  } | null>(null);
  const [step2MappingError, setStep2MappingError] = React.useState<string | null>(null);
  const [stepCheckpointError, setStepCheckpointError] = React.useState<string | null>(null);
  const [isReadingFile, setIsReadingFile] = React.useState(false);
  type CheckpointBlockState = {
    createCheckpoint: boolean;
    selectedItemId: number | null;
    dateKey: string;
    timeStr: string;
    amountStr: string;
  };
  const [checkpointStepState, setCheckpointStepState] = React.useState<Map<string, CheckpointBlockState>>(new Map());
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const contentScrollRef = React.useRef<HTMLDivElement>(null);
  const accountsStepAutoLinkApplied = React.useRef(false);
  const categoriesStepAutoLinkApplied = React.useRef(false);
  const counterpartiesStepAutoLinkApplied = React.useRef(false);

  const isBankImport =
    importSource === "tbank" ||
    importSource === "sber" ||
    importSource === "alfa" ||
    importSource === "ozon";
  const STEPS_TBANK_INVEST = [
    { key: 1, label: "Токен" },
    { key: 2, label: "Счета" },
    { key: 3, label: "Импорт" },
  ] as const;
  const STEPS = isTbankInvestIntegration
    ? STEPS_TBANK_INVEST
    : isBankImport
      ? STEPS_BANK
      : importSource === "own"
        ? STEPS_OWN
        : STEPS_DZEN;

  React.useEffect(() => {
    if (contentScrollRef.current) contentScrollRef.current.scrollTop = 0;
  }, [step]);
  const stepLineWidth = isTbankInvestIntegration
    ? 110
    : importSource === "own"
      ? 100
      : isBankImport
        ? 100
        : 130;
  const stepAccounts = isTbankInvestIntegration ? 2 : importSource === "own" ? 3 : 2;
  const stepCategories = isTbankInvestIntegration ? 0 : importSource === "own" ? 4 : 3;
  const stepCounterparties = isTbankInvestIntegration ? 0 : importSource === "own" ? 5 : 4;
  const stepCheckpoint = isTbankInvestIntegration ? 0 : isBankImport ? 5 : 0;
  const stepConfirm = isTbankInvestIntegration ? 3 : isBankImport ? 6 : importSource === "own" ? 6 : 5;
  const isLastStep = step === stepConfirm;
  /** На шагах с активами, категориями и контрагентами степпер прокручивается вместе с контентом */
  const stepperScrollsWithContent =
    step === stepAccounts || step === stepCategories || step === stepCounterparties || step === stepCheckpoint;

  const acceptedTypes =
    importSource === "own"
      ? ".csv,.xlsx,.xls"
      : importSource === "tbank"
        ? ".xlsx"
        : importSource === "sber" || importSource === "alfa" || importSource === "ozon"
          ? ".pdf"
          : importSource === "file"
            ? ".csv"
            : ".csv";

  const handleFileSelect = (file: File | null) => {
    setSelectedFile(file);
    setParsedData(null);
    setParseError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Парсинг файла при выборе — чтобы показать параметры выписки на шаге 1
  React.useEffect(() => {
    const parseableSources = ["dzen", "coinkeeper", "tbank", "sber", "alfa", "ozon", "file"];
    if (
      !selectedFile ||
      !importSource ||
      !parseableSources.includes(importSource)
    ) {
      setParsedData(null);
      setParseError(null);
      return;
    }
    let cancelled = false;
    setIsParsing(true);
    setParseError(null);

    if (importSource === "file") {
      selectedFile
        .text()
        .then((csvText) => {
          if (cancelled) return;
          try {
            const parsed = parseExportCsv(csvText);
            const dzenData = parsedExportToDzenParsedData(parsed);
            if (dzenData.transactions.length === 0) {
              setParseError("В файле не найдено транзакций.");
              return;
            }
            setParsedData(normalizeParsedDataUndefinedCategory(dzenData));
            setParseError(null);
          } catch (err) {
            setParseError(
              err instanceof Error
                ? formatImportFileParseError(err)
                : "Не удалось распознать файл экспорта."
            );
          }
        })
        .catch((err) => {
          if (!cancelled) {
            setParseError(
              err instanceof Error
                ? formatImportFileParseError(err)
                : "Не удалось прочитать файл."
            );
          }
        })
        .finally(() => {
          if (!cancelled) setIsParsing(false);
        });
      return () => {
        cancelled = true;
      };
    }

    const parseFile =
      importSource === "coinkeeper"
        ? parseCoinKeeperCSVFile
        : importSource === "tbank"
          ? parseTBankXlsxFile
          : importSource === "sber"
            ? parseSberPdfFile
            : importSource === "alfa"
              ? parseAlfaPdfFile
              : importSource === "ozon"
                ? parseOzonPdfFile
                : parseDzenCSVFile;
    parseFile(selectedFile)
      .then((data) => {
        if (!cancelled) setParsedData(normalizeParsedDataUndefinedCategory(data));
      })
      .catch((err) => {
        if (!cancelled) {
          setParseError(formatImportFileParseError(err));
        }
      })
      .finally(() => {
        if (!cancelled) setIsParsing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [importSource, selectedFile]);

  // Reset integration flow state on open/close
  React.useEffect(() => {
    if (!isTbankInvestIntegration) return;
    if (open) {
      setTbankError(null);
      return;
    }
    setTbankToken("");
    setTbankInfo(null);
    setTbankAccounts([]);
    setTbankPreview(null);
    setTbankError(null);
    setTbankLoading(false);
    setTbankProfileLoading(false);
    tbankProbeSeqRef.current += 1;
    tbankLastSuccessfulTokenRef.current = null;
  }, [open, isTbankInvestIntegration]);

  const applyTbankTokenForStep1 = React.useCallback(
    async (
      tokenTrimmed: string,
      loadingKind: "profile" | "next"
    ): Promise<boolean> => {
      if (!tbankIntegrationId) {
        setTbankError("Не выбран идентификатор интеграции.");
        return false;
      }
      const seq = ++tbankProbeSeqRef.current;
      if (loadingKind === "profile") setTbankProfileLoading(true);
      else setTbankLoading(true);
      setTbankError(null);
      try {
        await patchIntegration(tbankIntegrationId, {
          token: tokenTrimmed,
          sandbox: false,
        });
        const inf = await fetchTbankInfo(tbankIntegrationId);
        const acc = await fetchTbankAccounts(tbankIntegrationId);
        if (seq !== tbankProbeSeqRef.current) return false;
        setTbankInfo(inf);
        setTbankAccounts(acc);
        setParsedData({
          accounts: acc.map((a) => ({
            name: `${a.name ?? "Счёт"} · ${a.external_account_id}`,
            currency: "RUB",
          })),
          categories: [],
          counterparties: [],
          transactions: [],
        });
        tbankLastSuccessfulTokenRef.current = tokenTrimmed;
        return true;
      } catch (e) {
        if (seq !== tbankProbeSeqRef.current) return false;
        setTbankError(e instanceof Error ? e.message : "Ошибка проверки токена");
        setTbankInfo(null);
        setTbankAccounts([]);
        tbankLastSuccessfulTokenRef.current = null;
        return false;
      } finally {
        if (seq === tbankProbeSeqRef.current) {
          if (loadingKind === "profile") setTbankProfileLoading(false);
          else setTbankLoading(false);
        }
      }
    },
    [tbankIntegrationId]
  );

  /** После ввода токена — с задержкой запрашиваем профиль и счета (без перехода на шаг 2). */
  React.useEffect(() => {
    if (!open || !isTbankInvestIntegration || step !== 1) return;
    const t = tbankToken.trim();
    if (!tbankIntegrationId) return;

    if (!t) {
      tbankProbeSeqRef.current += 1;
      setTbankProfileLoading(false);
      setTbankInfo(null);
      setTbankAccounts([]);
      tbankLastSuccessfulTokenRef.current = null;
      return;
    }

    if (t.length < TBANK_TOKEN_PROBE_MIN_LEN) {
      tbankProbeSeqRef.current += 1;
      setTbankProfileLoading(false);
      setTbankInfo(null);
      setTbankAccounts([]);
      tbankLastSuccessfulTokenRef.current = null;
      setTbankError(null);
      return;
    }

    const timer = window.setTimeout(() => {
      if (t !== tbankLastSuccessfulTokenRef.current) {
        setTbankInfo(null);
        setTbankAccounts([]);
      }
      void applyTbankTokenForStep1(t, "profile");
    }, TBANK_TOKEN_PROBE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [
    open,
    isTbankInvestIntegration,
    step,
    tbankToken,
    tbankIntegrationId,
    applyTbankTokenForStep1,
  ]);

  const tbankAccountIdByDzenName = React.useMemo(() => {
    const map: Record<string, string> = {};
    for (const a of tbankAccounts) {
      const name = `${a.name ?? "Счёт"} · ${a.external_account_id}`;
      map[name] = a.external_account_id;
    }
    return map;
  }, [tbankAccounts]);

  const tbankOpenedDateByExternalId = React.useMemo(() => {
    const map: Record<string, string | null> = {};
    for (const a of tbankAccounts) {
      map[a.external_account_id] = a.opened_date ?? null;
    }
    return map;
  }, [tbankAccounts]);

  const isoToDateKey = React.useCallback(
    (iso: string | null): string => {
      if (!iso) return (accountingStartDate ?? "").slice(0, 10) || "1970-01-01";
      try {
        const d = new Date(iso);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
      } catch {
        return iso.slice(0, 10);
      }
    },
    [accountingStartDate]
  );

  const step1Content =
    importSource && importSource in STEP1_CONTENT
      ? STEP1_CONTENT[importSource as ServiceImportSourceKey]
      : STEP1_CONTENT.dzen;

  const tbankStep1Content = React.useMemo(
    () => ({
      title: "Т-Инвестиции",
      description:
        "Укажите токен доступа к API Т-Инвестиций. После проверки покажем параметры профиля и перейдём к сопоставлению счетов.",
    }),
    []
  );

  React.useEffect(() => {
    if (open) {
      setStep(1);
      setSelectedFile(null);
      setIsDragOver(false);
      setParsedData(null);
      setParseError(null);
      setStep2Error(null);
      setStep3Error(null);
      setStep4Error(null);
      setStep5Error(null);
      setStep2MappingError(null);
      setStepCheckpointError(null);
      setColumnMapping({});
      setParsedFileData(null);
      setAccountCardStates(new Map());
      setCategoryCardStates(new Map());
      setCounterpartyCardStates(new Map());
      setCheckpointStepState(new Map());
      setConfirmCloseOpen(false);
      accountsStepAutoLinkApplied.current = false;
      categoriesStepAutoLinkApplied.current = false;
      counterpartiesStepAutoLinkApplied.current = false;
    }
  }, [open]);

  React.useEffect(() => {
    if (parsedData?.accounts?.length) {
      const next = new Map<string, ImportAccountCardState>();
      const accountsToInit =
        importSource === "dzen"
          ? parsedData.accounts.filter((acc) => !isDzenDebtsAccount(acc))
          : parsedData.accounts;
      for (const acc of accountsToInit) {
        const key = `${acc.name}|${acc.currency}`;
        next.set(key, getInitialAccountCardState(acc));
      }
      setAccountCardStates(next);
    }
  }, [parsedData?.accounts, importSource]);

  React.useEffect(() => {
    if (parsedData && step === stepAccounts) {
      Promise.all([
        fetchItems(),
        fetchCounterparties(),
        fetchCounterpartyIndustries(),
      ])
        .then(([itemsData, counterpartiesData, industriesData]) => {
          setItems(itemsData);
          setCounterparties(counterpartiesData);
          setIndustries(industriesData);
        })
        .catch(() => {
          setItems([]);
          setCounterparties([]);
          setIndustries([]);
        });
    }
  }, [parsedData, step, stepAccounts]);

  React.useEffect(() => {
    if (parsedData?.categories?.length) {
      const next = new Map<string, ImportCategoryCardState>();
      for (const cat of parsedData.categories) {
        next.set(
          cat.name,
          getInitialCategoryCardState(cat, {
            defaultTransferMode: isTransferCategoryName(cat.name),
          })
        );
      }
      setCategoryCardStates(next);
    }
  }, [parsedData?.categories]);

  /** Синхронизация ключей счетов в маппинге переводов при смене привязок на шаге 2 */
  React.useEffect(() => {
    if (step !== stepCategories || !parsedData?.categories?.length) return;
    setCategoryCardStates((prev) => {
      let changed = false;
      const next = new Map(prev);
      const txs = parsedData.transactions ?? [];
      const accs = parsedData.accounts ?? [];
      for (const cat of parsedData.categories) {
        const st = next.get(cat.name);
        if (!st?.transferModeEnabled) continue;
        const rows = computeTransferRowsForCategory(
          cat.name,
          txs,
          accs,
          accountCardStates
        );
        const merged = buildTransferFlowMap(st.transferFlowByAccountKey, rows);
        if (JSON.stringify(merged) !== JSON.stringify(st.transferFlowByAccountKey)) {
          next.set(cat.name, { ...st, transferFlowByAccountKey: merged });
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [step, stepCategories, parsedData, accountCardStates]);

  React.useEffect(() => {
    if (!parsedData || step < stepCategories) return;
    fetchItems()
      .then(setItems)
      .catch(() => {});
  }, [parsedData, step, stepCategories]);

  const counterpartiesForMappingStep = React.useMemo(
    () =>
      parsedData
        ? filterCounterpartiesForMappingStep(
            parsedData.counterparties ?? [],
            parsedData.transactions ?? [],
            categoryCardStates,
            accountCardStates,
            parsedData.accounts ?? []
          )
        : [],
    [parsedData, categoryCardStates, accountCardStates]
  );

  React.useEffect(() => {
    if (!parsedData) return;
    setCounterpartyCardStates((prev) => {
      const next = new Map<string, ImportCounterpartyCardState>();
      for (const cp of counterpartiesForMappingStep) {
        next.set(cp.name, prev.get(cp.name) ?? getInitialCounterpartyCardState(cp));
      }
      return next;
    });
  }, [parsedData, counterpartiesForMappingStep]);

  const categoryStepTransferWarnings = React.useMemo(
    () =>
      parsedData
        ? getStep3TransferModeWarnings(
            parsedData,
            categoryCardStates,
            accountCardStates
          )
        : [],
    [parsedData, categoryCardStates, accountCardStates]
  );

  React.useEffect(() => {
    if (
      !isBankImport ||
      !parsedData?.accounts?.length ||
      step < stepCheckpoint
    ) return;
    setCheckpointStepState((prev) => {
      const candidates = parsedData.balanceCheckpointCandidates ?? [];
      const candidateByKey = new Map(candidates.map((c) => [c.accountKey, c]));
      const accountsToShow = parsedData.accounts;
      const next = new Map(prev);
      for (const acc of accountsToShow) {
        const key = `${acc.name}|${acc.currency}`;
        if (next.has(key)) continue;
        const candidate = candidateByKey.get(key);
        const state = accountCardStates.get(key);
        const linkedItemId = state?.linkEnabled && state?.linkedItemId != null ? state.linkedItemId : null;
        next.set(key, {
          createCheckpoint: !!candidate,
          selectedItemId: linkedItemId,
          dateKey: candidate?.dateKey ?? "",
          timeStr: candidate?.time?.slice(0, 5) ?? "23:59",
          amountStr: candidate != null ? formatCentsForInput(candidate.balanceCents) : "",
        });
      }
      return next;
    });
  }, [
    isBankImport,
    step,
    stepCheckpoint,
    parsedData?.accounts,
    parsedData?.balanceCheckpointCandidates,
    importSource,
    accountCardStates,
  ]);

  React.useEffect(() => {
    if (step !== stepAccounts) {
      accountsStepAutoLinkApplied.current = false;
    }
  }, [step, stepAccounts]);

  React.useEffect(() => {
    if (step !== stepCategories) {
      categoriesStepAutoLinkApplied.current = false;
    }
  }, [step, stepCategories]);

  React.useEffect(() => {
    if (step !== stepCounterparties) {
      counterpartiesStepAutoLinkApplied.current = false;
    }
  }, [step, stepCounterparties]);

  React.useEffect(() => {
    if (parsedData && step === stepCategories) {
      fetchCategories({ includeArchived: false })
        .then(setCategories)
        .catch(() => setCategories([]));
    }
  }, [parsedData, step, stepCategories]);

  React.useEffect(() => {
    if (parsedData && step === stepCounterparties) {
      fetchCounterparties()
        .then(setCounterparties)
        .catch(() => setCounterparties([]));
    }
  }, [parsedData, step, stepCounterparties]);

  // Авто-сопряжение счетов: при совпадении названия с существующим активом/обязательством включаем режим привязки и выбираем его.
  React.useEffect(() => {
    if (
      step !== stepAccounts ||
      items.length === 0 ||
      accountCardStates.size === 0 ||
      accountsStepAutoLinkApplied.current
    ) {
      return;
    }
    accountsStepAutoLinkApplied.current = true;
    setAccountCardStates((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const [key, state] of next) {
        if (state.linkEnabled) continue;
        const accountName = key.includes("|") ? key.split("|")[0] : key;
        const matchId = findMatchingItemId(state.name || accountName, items);
        if (matchId != null) {
          next.set(key, {
            ...state,
            linkEnabled: true,
            linkedItemId: matchId,
          });
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [step, stepAccounts, items, accountCardStates.size]);

  // Авто-сопряжение категорий: при совпадении (полном или частичном) с существующей включаем режим связи и выбираем категорию (поиск от листа к корню).
  React.useEffect(() => {
    if (
      step !== stepCategories ||
      categories.length === 0 ||
      categoryCardStates.size === 0 ||
      categoriesStepAutoLinkApplied.current
    ) {
      return;
    }
    categoriesStepAutoLinkApplied.current = true;
    const txs = parsedData?.transactions ?? [];
    setCategoryCardStates((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const [key, state] of next) {
        if (state.linkEnabled) continue;
        const name = state.name || key;
        if (isTransferCategoryName(name)) continue;
        const allowedScopes = getAllowedScopesForImportedCategoryName(name, txs);
        const match = findMatchingCategoryPath(name, categories, allowedScopes);
        if (match) {
          next.set(key, { ...state, linkEnabled: true, linkedPath: match });
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [step, stepCategories, categories, categoryCardStates.size, parsedData?.transactions]);

  // Авто-сопряжение контрагентов: при совпадении названия (полном или частичном) включаем режим связи и выбираем контрагента.
  React.useEffect(() => {
    if (
      step !== stepCounterparties ||
      counterparties.length === 0 ||
      counterpartyCardStates.size === 0 ||
      counterpartiesStepAutoLinkApplied.current
    ) {
      return;
    }
    counterpartiesStepAutoLinkApplied.current = true;
    setCounterpartyCardStates((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const [key, state] of next) {
        if (state.linkEnabled) continue;
        const matchId = findMatchingCounterpartyId(key, counterparties);
        if (matchId != null) {
          next.set(key, {
            ...state,
            linkEnabled: true,
            linkedCounterpartyId: matchId,
          });
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [step, stepCounterparties, counterparties, counterpartyCardStates.size]);

  // Ошибки и предупреждения валидации по каждому счёту для отображения в карточках на шаге «Счета»
  const accountValidationErrors = React.useMemo(() => {
    if (!parsedData) return new Map<string, string | null>();
    const accounts =
      importSource === "dzen"
        ? parsedData.accounts.filter((acc) => !isDzenDebtsAccount(acc))
        : parsedData.accounts;
    const map = new Map<string, string | null>();
    for (const account of accounts) {
      const key = `${account.name}|${account.currency}`;
      const state = accountCardStates.get(key) ?? getInitialAccountCardState(account);
      const error = getAccountValidationError(account, parsedData.transactions, state);
      map.set(key, error);
    }
    return map;
  }, [parsedData, accountCardStates, importSource]);

  const accountValidationWarnings = React.useMemo(() => {
    if (!parsedData) return new Map<string, string | null>();
    const accounts =
      importSource === "dzen"
        ? parsedData.accounts.filter((acc) => !isDzenDebtsAccount(acc))
        : parsedData.accounts;
    const map = new Map<string, string | null>();
    for (const account of accounts) {
      const key = `${account.name}|${account.currency}`;
      const state = accountCardStates.get(key) ?? getInitialAccountCardState(account);
      const warning = getAccountValidationWarning(account, parsedData.transactions, state);
      map.set(key, warning);
    }
    return map;
  }, [parsedData, accountCardStates, importSource]);

  const getCounterpartyForItemId = React.useCallback(
    (id: number) => {
      const item = items.find((i) => i.id === id);
      if (!item?.counterparty_id) return null;
      return counterparties.find((c) => c.id === item.counterparty_id) ?? null;
    },
    [items, counterparties]
  );

  const linkedItemLabelByAccountKey = React.useMemo(() => {
    const rec: Record<string, string> = {};
    for (const [accKey, st] of accountCardStates) {
      if (!st.linkEnabled || st.linkedItemId == null) continue;
      const item = items.find((i) => i.id === st.linkedItemId);
      const name = (item?.name ?? st.name ?? "").trim();
      if (name) rec[accKey] = name;
    }
    return rec;
  }, [accountCardStates, items]);

  const ownMappingPreview = React.useMemo((): DzenParsedData | null => {
    if (importSource !== "own" || !parsedFileData) return null;
    const validation = validateColumnMapping(parsedFileData.headers, columnMapping);
    if (!validation.valid) return null;
    try {
      return applyMappingToDzenParsedData(
        parsedFileData.headers,
        parsedFileData.rows,
        columnMapping
      );
    } catch {
      return null;
    }
  }, [importSource, parsedFileData, columnMapping]);

  const getTbankAccountTitle = React.useCallback(
    (externalId: string) => {
      const a = tbankAccounts.find((x) => x.external_account_id === externalId);
      if (a?.name) return `${a.name} · ${externalId}`;
      return `Счёт ${externalId}`;
    },
    [tbankAccounts]
  );

  const runTbankCompleteImport = React.useCallback(async () => {
    if (!tbankIntegrationId) {
      setTbankError("Не выбран идентификатор интеграции.");
      return;
    }
    if (!accountingStartDate) {
      setTbankError("Сначала установите дату начала учёта.");
      return;
    }
    if (!parsedData?.accounts?.length) {
      setTbankError("Сначала загрузите счета на шаге 1.");
      return;
    }
    setIsImporting(true);
    setTbankError(null);
    try {
      const createdIds: Record<string, number> = {};
      for (const acc of parsedData.accounts) {
        const key = `${acc.name}|${acc.currency}`;
        const state = accountCardStates.get(key) ?? getInitialAccountCardState(acc);
        const extId = tbankAccountIdByDzenName[acc.name];
        if (!extId) continue;

        if (state.linkEnabled && state.linkedItemId) {
          createdIds[extId] = state.linkedItemId;
          continue;
        }
        const openedIso = tbankOpenedDateByExternalId[extId] ?? null;
        const openDateKey = isoToDateKey(openedIso);
        const initial = parseRubToCents(state.balanceStr || "0");
        const item = await createItem({
          kind: state.kind,
          type_code: state.typeCode || "brokerage",
          name: (state.name || acc.name).replace(/ · .+$/, ""),
          currency_code: state.currency ?? acc.currency ?? "RUB",
          counterparty_id: state.counterpartyId ?? null,
          open_date: openDateKey,
          initial_balance_minor: Number.isFinite(initial) ? initial : 0,
        });
        createdIds[extId] = item.id;
      }

      await putAccountLinks(
        tbankIntegrationId,
        Object.entries(createdIds).map(([external_account_id, item_id]) => ({
          external_account_id,
          item_id,
        }))
      );

      await completeTbankImport(tbankIntegrationId, {
        mappings: Object.entries(createdIds).map(([external_account_id, item_id]) => ({
          external_account_id,
          item_id,
          create_new: false,
          new_item_name: null,
        })),
      });

      onOpenChange(false);
      onFinish?.();
    } catch (e) {
      setTbankError(e instanceof Error ? e.message : "Ошибка импорта");
    } finally {
      setIsImporting(false);
    }
  }, [
    tbankIntegrationId,
    accountingStartDate,
    parsedData,
    accountCardStates,
    tbankAccountIdByDzenName,
    tbankOpenedDateByExternalId,
    isoToDateKey,
    onOpenChange,
    onFinish,
  ]);

  React.useEffect(() => {
    if (!open || !isTbankInvestIntegration || step !== stepConfirm || !tbankIntegrationId) {
      return;
    }
    let cancelled = false;
    setTbankLoading(true);
    setTbankError(null);
    setTbankPreview(null);
    previewTbankImport(tbankIntegrationId)
      .then((p) => {
        if (!cancelled) setTbankPreview(p);
      })
      .catch((e) => {
        if (!cancelled) {
          setTbankError(e instanceof Error ? e.message : "Не удалось получить превью");
        }
      })
      .finally(() => {
        if (!cancelled) setTbankLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, isTbankInvestIntegration, step, stepConfirm, tbankIntegrationId]);

  const handleNext = async () => {
    if (isTbankInvestIntegration) {
      if (step === 1) {
        if (!tbankIntegrationId) {
          setTbankError("Не выбран идентификатор интеграции.");
          return;
        }
        const t = tbankToken.trim();
        if (!t) {
          setTbankError("Введите токен.");
          return;
        }
        if (
          tbankLastSuccessfulTokenRef.current === t &&
          tbankInfo &&
          (parsedData?.accounts?.length ?? 0) > 0
        ) {
          setStep(2);
          return;
        }
        const ok = await applyTbankTokenForStep1(t, "next");
        if (ok) setStep(2);
        return;
      }
      if (step === 2) {
        setStep3Error(null);
        if (!parsedData?.accounts?.length) {
          setStep3Error("Сначала загрузите счета на шаге 1.");
          return;
        }
        const result = validateStep2(
          parsedData.accounts,
          parsedData.transactions ?? [],
          accountCardStates
        );
        if (!result.valid) {
          setStep3Error(result.error || "Заполните обязательные поля по счетам.");
          return;
        }
        setStep(3);
        return;
      }
      if (step === stepConfirm) {
        await runTbankCompleteImport();
        return;
      }
      return;
    }
    const step1CsvOrBank =
      importSource === "dzen" ||
      importSource === "coinkeeper" ||
      importSource === "tbank" ||
      importSource === "sber" ||
      importSource === "alfa" ||
      importSource === "ozon" ||
      importSource === "file";
    if (step === 1 && step1CsvOrBank) {
      if (!selectedFile) {
        setParseError("Выберите файл для импорта.");
        return;
      }
      if (!parsedData) {
        if (parseError) return;
        return; // ещё идёт парсинг
      }
      setStep(2);
      return;
    }

    if (step === 1 && importSource === "own") {
      setParseError(null);
      setStep2MappingError(null);
      if (!selectedFile) {
        setParseError("Выберите файл для импорта.");
        return;
      }
      setIsReadingFile(true);
      try {
        const { headers, rows } = await readFileToHeadersAndRows(selectedFile);
        if (!headers.length) {
          setParseError("Файл не содержит заголовков столбцов.");
          return;
        }
        setParsedFileData({ headers, rows });
        setColumnMapping({});
        setStep(2);
      } catch (err) {
        setParseError(
          err instanceof Error ? err.message : "Не удалось прочитать файл."
        );
      } finally {
        setIsReadingFile(false);
      }
      return;
    }

    if (step === 2 && importSource === "own" && parsedFileData) {
      setStep2MappingError(null);
      const validation = validateColumnMapping(
        parsedFileData.headers,
        columnMapping
      );
      if (!validation.valid) {
        setStep2MappingError(validation.error);
        return;
      }
      try {
        const data = applyMappingToDzenParsedData(
          parsedFileData.headers,
          parsedFileData.rows,
          columnMapping
        );
        if (data.transactions.length === 0) {
          setStep2MappingError(
            "По указанному маппингу не найдено ни одной операции. Проверьте назначение столбцов."
          );
          return;
        }
        setParsedData(normalizeParsedDataUndefinedCategory(data));
        setStep(3);
      } catch (err) {
        setStep2MappingError(
          err instanceof Error ? err.message : "Не удалось обработать данные."
        );
      }
      return;
    }

    if (step === stepAccounts && parsedData) {
      setStep2Error(null);
      const result = validateStep2(
        parsedData.accounts,
        parsedData.transactions,
        accountCardStates
      );
      if (!result.valid) {
        setStep2Error(result.error);
        return;
      }
    }

    if (step === stepCategories && parsedData) {
      setStep3Error(null);
      const result = validateStep3(
        parsedData.categories ?? [],
        categoryCardStates,
        categories
      );
      if (!result.valid) {
        setStep3Error(result.error);
        return;
      }
    }

    if (step === stepCounterparties && parsedData) {
      setStep4Error(null);
      const result = validateStep4(
        counterpartiesForMappingStep,
        counterpartyCardStates,
        counterparties
      );
      if (!result.valid) {
        setStep4Error(result.error);
        return;
      }
    }

    if (step === stepCheckpoint && isBankImport) {
      setStepCheckpointError(null);
      for (const [, block] of checkpointStepState) {
        if (!block.createCheckpoint) continue;
        if (!block.selectedItemId) {
          setStepCheckpointError("Выберите актив для контрольной точки.");
          return;
        }
        if (!block.dateKey || block.dateKey.length < 10) {
          setStepCheckpointError("Укажите дату контрольной точки.");
          return;
        }
        const cents = parseRubToCents(normalizeRubOnBlur(block.amountStr));
        if (cents == null || !Number.isFinite(cents)) {
          setStepCheckpointError("Укажите корректную сумму контрольной точки.");
          return;
        }
      }
    }

    if (step < stepConfirm) {
      setStep((s) => (s + 1) as ImportStep);
      return;
    }

    // Финальный шаг: выполнить импорт
    const confirmWithDzenExecutor =
      importSource === "dzen" ||
      importSource === "coinkeeper" ||
      importSource === "own" ||
      importSource === "tbank" ||
      importSource === "sber" ||
      importSource === "alfa" ||
      importSource === "ozon" ||
      importSource === "file";
    if (step === stepConfirm && parsedData && confirmWithDzenExecutor) {
      setStep5Error(null);
      // Проверка: дата транзакции не может быть раньше даты начала действия связанного актива/обязательства
      for (const [key, state] of accountCardStates) {
        if (!state.linkEnabled || state.linkedItemId == null) continue;
        const item = items.find((i) => i.id === state.linkedItemId);
        if (!item?.open_date) continue;
        const [accountName, accountCurrency] = key.split("|");
        let minTxDate: string | null = null;
        for (const tx of parsedData.transactions) {
          const isOut =
            tx.outcomeAccountName === accountName &&
            tx.outcomeCurrency === accountCurrency;
          const isIn =
            tx.incomeAccountName === accountName &&
            tx.incomeCurrency === accountCurrency;
          if ((isOut || isIn) && tx.date) {
            if (!minTxDate || tx.date < minTxDate) minTxDate = tx.date;
          }
        }
        if (minTxDate != null && minTxDate < item.open_date) {
          const d = (s: string) =>
            s ? `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}` : "";
          setStep5Error(
            `По счёту «${accountName}» в выписке есть операции с ${d(minTxDate)}, что раньше даты начала действия связанного актива/обязательства (${d(item.open_date)}). Свяжите счёт с другим активом или создайте новый.`
          );
          return;
        }
      }
      setIsImporting(true);
      try {
        const result = await executeImportDzen({
          parsedData,
          accountCardStates,
          categoryCardStates,
          counterpartyCardStates,
          categoryNodes: categories,
        });
        if (result.success && isBankImport) {
          const buildCheckpointAtIso = (dateStr: string, timeStr: string) => {
            const [y, mo, day] = dateStr.split("-").map((x) => parseInt(x, 10));
            const t = timeStr && /^\d{1,2}:\d{2}$/.test(timeStr.trim()) ? timeStr.trim() : "00:00";
            const [h, m] = t.split(":").map((x) => parseInt(x, 10));
            const localDate = new Date(
              Number.isFinite(y) ? y : 0,
              Number.isFinite(mo) ? mo - 1 : 0,
              Number.isFinite(day) ? day : 1,
              Number.isFinite(h) ? h : 0,
              Number.isFinite(m) ? m : 0,
              0,
              0
            );
            return localDate.toISOString();
          };
          for (const [, block] of checkpointStepState) {
            if (!block.createCheckpoint || !block.selectedItemId || !block.dateKey) continue;
            const cents = parseRubToCents(normalizeRubOnBlur(block.amountStr));
            if (cents == null || !Number.isFinite(cents)) continue;
            try {
              await createBalanceCheckpoint(block.selectedItemId, {
                checkpoint_at: buildCheckpointAtIso(block.dateKey, block.timeStr),
                stated_balance_cents: cents,
                source: "IMPORTED",
              });
            } catch (cpErr) {
              setStep5Error(
                (cpErr instanceof Error ? cpErr.message : "Не удалось создать контрольную точку.") as string
              );
              setIsImporting(false);
              return;
            }
          }
        }
        if (result.success) {
          onFinish?.();
          onOpenChange(false);
        } else {
          setStep5Error(result.error);
        }
      } catch (err) {
        setStep5Error(
          err instanceof Error ? err.message : "Не удалось выполнить импорт."
        );
      } finally {
        setIsImporting(false);
      }
      return;
    }

    if (step === stepConfirm) {
      onFinish?.();
      onOpenChange(false);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep2Error(null);
      setStep3Error(null);
      setStep4Error(null);
      setStep5Error(null);
      setStepCheckpointError(null);
      setStep((s) => (s - 1) as ImportStep);
    }
  };

  const hasProgress = step > 1 || selectedFile != null || parsedFileData != null;

  const handleRequestClose = () => {
    if (hasProgress) {
      setConfirmCloseOpen(true);
    } else {
      onOpenChange(false);
    }
  };

  const handleConfirmClose = () => {
    onOpenChange(false);
  };

  const handleCancel = () => {
    handleRequestClose();
  };

  const stepperBox = (
    <div
      className="flex flex-col w-full"
      style={{
        backgroundColor: BACKGROUND_DT,
        borderRadius: 9,
        padding: "48px 24px 24px",
      }}
    >
      <div className="flex flex-row justify-center items-center w-full gap-0">
        {STEPS.map(({ key, label }, idx) => {
          const isPassed = step > key;
          const isCurrent = step === key;
          const isFilled = isPassed || isCurrent;
          return (
            <React.Fragment key={key}>
              <div
                className="flex items-center justify-center shrink-0 box-border"
                style={{
                  width: 50,
                  height: 50,
                  backgroundColor: isFilled ? ACCENT2 : "transparent",
                  border: `2px solid ${ACCENT2}`,
                  borderRadius: 9,
                  boxShadow: isCurrent ? `0px 0px 50px ${ACCENT}` : undefined,
                }}
              >
                <span
                  style={{
                    color: ACTIVE_TEXT_DARK,
                    fontSize: 24,
                    fontWeight: 500,
                    lineHeight: "27px",
                  }}
                >
                  {key}
                </span>
              </div>
              {idx < STEPS.length - 1 && (
                <div
                  className="flex items-center shrink-0"
                  style={{ width: stepLineWidth, height: 50 }}
                >
                  <div
                    className="w-full"
                    style={{ height: 0, borderTop: `2px solid ${ACCENT2}` }}
                  />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
      <div className="flex flex-row justify-center items-start w-full gap-0 mt-6">
        {STEPS.map(({ key, label }, idx) => {
          const isPassed = step > key;
          const isCurrent = step === key;
          const isFilled = isPassed || isCurrent;
          return (
            <React.Fragment key={key}>
              <div className="flex justify-center shrink-0" style={{ width: 50 }}>
                <span
                  className="text-center block"
                  style={{
                    color: isFilled ? ACTIVE_TEXT_DARK : PLACEHOLDER_COLOR_DARK,
                    fontSize: 14,
                    fontWeight: 400,
                    lineHeight: "20px",
                    width: 120,
                    maxWidth: 120,
                    overflowWrap: "break-word",
                  }}
                >
                  {label}
                </span>
              </div>
              {idx < STEPS.length - 1 && (
                <div className="shrink-0" style={{ width: stepLineWidth }} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );

  return (
    <>
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next === false) {
          handleRequestClose();
        } else {
          onOpenChange(next);
        }
      }}
      modal={true}
    >
      <DialogContent
        title={
          isTbankInvestIntegration
            ? "Подключение Т-Инвестиции"
            : "Импорт счетов и операций"
        }
        overlayClassName="z-[100] bg-black/60"
        containerClassName="z-[100]"
        onInteractOutside={(e) => {
          const target = e.target as HTMLElement;
          if (
            target.closest?.("[data-selector-dropdown]") ||
            target.closest?.(".selector-dropdown") ||
            target.closest?.(".import-add-counterparty-modal")
          ) {
            e.preventDefault();
          }
        }}
        onPointerDownOutside={(e) => {
          const target = e.target as HTMLElement;
          if (
            target.closest?.("[data-selector-dropdown]") ||
            target.closest?.(".selector-dropdown") ||
            target.closest?.(".import-add-counterparty-modal")
          ) {
            e.preventDefault();
          }
        }}
        className={cn(
          "w-full max-w-[calc(100%-2rem)] h-[920px] max-h-[min(920px,100dvh)] p-0 gap-0 overflow-hidden flex flex-col",
          "border-0 rounded-[9px]"
        )}
        style={{ backgroundColor: MODAL_BG, width: 1000, maxWidth: "min(1000px, calc(100vw - 2rem))" }}
      >
        <div className="flex flex-col w-full h-full min-h-0">
          <DialogHeader className="px-6 pt-6 pb-4 shrink-0">
            <DialogTitle
              className="flex items-center gap-3 text-[32px] font-medium"
              style={{ color: ACTIVE_TEXT_DARK }}
            >
              <Download className="w-8 h-8 shrink-0" />
              {isTbankInvestIntegration
                ? "Подключение Т-Инвестиции"
                : "Импорт счетов и операций"}
            </DialogTitle>
          </DialogHeader>

          {/* Степпер — фиксирован только когда не на шагах с карточками (счета/категории/контрагенты) */}
          {!stepperScrollsWithContent && (
            <div className="shrink-0 px-6 pb-6">{stepperBox}</div>
          )}

          {/* Блок контента */}
          <div
            ref={contentScrollRef}
            className="flex-1 min-h-0 overflow-auto overscroll-contain px-6 py-6"
            style={{
              color: ACTIVE_TEXT_DARK,
              fontSize: 18,
              fontWeight: 400,
            }}
          >
            {stepperScrollsWithContent && (
              <div className="pb-6">{stepperBox}</div>
            )}
            {step === 1 && !isTbankInvestIntegration && parseError && !selectedFile && (
              <p
                className="text-base shrink-0"
                style={{ color: "#FB4C4F" }}
              >
                {parseError}
              </p>
            )}
            {step === 1 && isTbankInvestIntegration && (
              <div className="flex flex-col gap-6">
                <h3
                  className="text-2xl font-medium"
                  style={{ color: ACTIVE_TEXT_DARK }}
                >
                  {tbankStep1Content.title}
                </h3>
                <p style={{ lineHeight: 1.4 }}>{tbankStep1Content.description}</p>

                {tbankError && (
                  <div
                    className="text-sm rounded-md border p-3"
                    style={{
                      color: "#FB4C4F",
                      backgroundColor: "rgba(251, 76, 79, 0.08)",
                      borderColor: "rgba(251, 76, 79, 0.3)",
                    }}
                  >
                    {tbankError}
                  </div>
                )}

                <div className="w-full">
                  <FormField label="Токен API T‑Invest">
                    <AuthInput
                      type="password"
                      autoComplete="off"
                      value={tbankToken}
                      onChange={(e) => setTbankToken(e.target.value)}
                      placeholder="Введите токен"
                      className="w-full min-w-0"
                    />
                  </FormField>
                </div>

                {tbankProfileLoading && !tbankInfo && (
                  <p className="text-sm" style={{ color: PLACEHOLDER_COLOR_DARK }}>
                    Загрузка профиля…
                  </p>
                )}

                {tbankInfo && (
                  <TbankProfileInfoBadges info={tbankInfo} variant="modal" />
                )}
              </div>
            )}
            {step === 1 && !isTbankInvestIntegration && (
              <div className="flex flex-col gap-6">
                <h3
                  className="text-2xl font-medium"
                  style={{ color: ACTIVE_TEXT_DARK }}
                >
                  {step1Content.title}
                </h3>
                <p style={{ lineHeight: 1.4 }}>
                  {step1Content.description.includes(".csv")
                    ? step1Content.description.split(".csv").map((part, i, arr) =>
                        i < arr.length - 1 ? (
                          <React.Fragment key={i}>
                            {part}
                            <span style={{ color: ACCENT }}>.csv</span>
                          </React.Fragment>
                        ) : (
                          part
                        )
                      )
                    : step1Content.description}
                </p>
                <button
                  type="button"
                  className="text-left font-normal underline hover:no-underline focus:outline-none focus:underline w-fit"
                  style={{ color: ACCENT }}
                  onClick={() => {
                    // Заглушка: инструкции пока не открываются
                  }}
                >
                  {step1Content.instructionLabel}
                </button>
                <div className="flex flex-col gap-2">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => fileInputRef.current?.click()}
                    onKeyDown={(e) =>
                      (e.key === "Enter" || e.key === " ") &&
                      fileInputRef.current?.click()
                    }
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDragOver(true);
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDragOver(false);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDragOver(false);
                      const file = e.dataTransfer.files?.[0];
                      if (file) handleFileSelect(file);
                    }}
                    className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed min-h-[140px] cursor-pointer transition-colors hover:opacity-90"
                    style={{
                      borderColor: isDragOver ? ACCENT : ACCENT2,
                      backgroundColor: isDragOver
                        ? "rgba(127, 92, 255, 0.12)"
                        : "rgba(85, 68, 209, 0.08)",
                    }}
                  >
                    <Upload
                      className="w-10 h-10 shrink-0"
                      style={{ color: ACCENT }}
                    />
                    {selectedFile ? (
                      <span className="px-4 text-center break-all">
                        {selectedFile.name}
                      </span>
                    ) : (
                      <span style={{ color: PLACEHOLDER_COLOR_DARK }}>
                        Нажмите для выбора или перетащите файл
                      </span>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    id="import-file-input"
                    type="file"
                    accept={acceptedTypes}
                    className="hidden"
                    onChange={(e) => {
                      handleFileSelect(e.target.files?.[0] ?? null);
                    }}
                  />
                  {/* Требования к файлу для «своей» выписки */}
                  {importSource === "own" && (
                    <div
                      className="p-4"
                      style={{
                        backgroundColor: BACKGROUND_DT,
                        borderRadius: 9,
                      }}
                    >
                      <p
                        className="text-base mb-2"
                        style={{ color: ACTIVE_TEXT_DARK }}
                      >
                        Импортируемые файлы должны быть в формате{" "}
                        <strong>Excel (.xlsx, .xls)</strong> или{" "}
                        <strong>CSV</strong> (в т.ч. экспорт из Google Sheets).
                      </p>
                      <p
                        className="text-base mb-2"
                        style={{ color: ACTIVE_TEXT_DARK }}
                      >
                        Файл должен представлять собой{" "}
                        <strong>список операций</strong> (одна строка — одна
                        операция).
                      </p>
                      <p
                        className="text-base mb-2"
                        style={{ color: ACTIVE_TEXT_DARK }}
                      >
                        Должен содержать <strong>один лист</strong> (для Excel).
                      </p>
                      <p
                        className="text-base"
                        style={{ color: ACTIVE_TEXT_DARK }}
                      >
                        В <strong>первой строке</strong> должны быть{" "}
                        <strong>заголовки столбцов</strong>.
                      </p>
                    </div>
                  )}
                  {/* Параметры выписки или ошибка — для источников с парсингом на шаге 1 (Дзен, CoinKeeper, банки, ПРОСТОФИН) */}
                  {(importSource === "dzen" ||
                    importSource === "coinkeeper" ||
                    importSource === "tbank" ||
                    importSource === "sber" ||
                    importSource === "alfa" ||
                    importSource === "ozon" ||
                    importSource === "file") &&
                    selectedFile && (
                    <div className="flex flex-col gap-4">
                      <p
                        className="text-base"
                        style={{ color: ACTIVE_TEXT_DARK }}
                      >
                        Параметры выбранной выписки:
                      </p>
                      {isParsing && (
                        <div
                          className="p-4"
                          style={{
                            backgroundColor: BACKGROUND_DT,
                            borderRadius: 9,
                          }}
                        >
                          <p
                            className="text-base"
                            style={{ color: PLACEHOLDER_COLOR_DARK }}
                          >
                            Обработка файла…
                          </p>
                        </div>
                      )}
                      {!isParsing && parseError && (
                        <div
                          className="p-4"
                          style={{
                            backgroundColor: BACKGROUND_DT,
                            borderRadius: 9,
                          }}
                        >
                          <p className="text-base" style={{ color: "#FB4C4F" }}>
                            {parseError}
                          </p>
                        </div>
                      )}
                      {!isParsing && parsedData && !parseError && (
                        <>
                          <div className="grid grid-cols-2 gap-4">
                            <div
                              className="flex flex-col gap-2 p-4 items-center text-center"
                              style={{
                                backgroundColor: BACKGROUND_DT,
                                borderRadius: 9,
                              }}
                            >
                              <span
                                className="text-base"
                                style={{ color: ACTIVE_TEXT_DARK }}
                              >
                                Дата первой операции
                              </span>
                              <div
                                className="w-full px-3 py-2 text-base box-border"
                                style={{
                                  color: ACTIVE_TEXT_DARK,
                                  backgroundColor: MODAL_BG,
                                  borderRadius: 9,
                                }}
                              >
                                {parsedData.transactions.length > 0
                                  ? (() => {
                                      const dates = parsedData.transactions.map(
                                        (t) => t.date
                                      );
                                      const first = [...dates].sort()[0];
                                      const [y, m, d] = first.split("-");
                                      return `${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.${y}`;
                                    })()
                                  : "—"}
                              </div>
                            </div>
                            <div
                              className="flex flex-col gap-2 p-4 items-center text-center"
                              style={{
                                backgroundColor: BACKGROUND_DT,
                                borderRadius: 9,
                              }}
                            >
                              <span
                                className="text-base"
                                style={{ color: ACTIVE_TEXT_DARK }}
                              >
                                Дата последней операции
                              </span>
                              <div
                                className="w-full px-3 py-2 text-base box-border"
                                style={{
                                  color: ACTIVE_TEXT_DARK,
                                  backgroundColor: MODAL_BG,
                                  borderRadius: 9,
                                }}
                              >
                                {parsedData.transactions.length > 0
                                  ? (() => {
                                      const dates = parsedData.transactions.map(
                                        (t) => t.date
                                      );
                                      const last = [...dates].sort().reverse()[0];
                                      const [y, m, d] = last.split("-");
                                      return `${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.${y}`;
                                    })()
                                  : "—"}
                              </div>
                            </div>
                          </div>
                          <div className="grid grid-cols-4 gap-4">
                            <div
                              className="flex items-center justify-between gap-2 p-4"
                              style={{
                                backgroundColor: BACKGROUND_DT,
                                borderRadius: 9,
                              }}
                            >
                              <span
                                className="text-base"
                                style={{ color: ACTIVE_TEXT_DARK }}
                              >
                                Счетов
                              </span>
                              <div
                                className="px-3 py-1.5 text-base shrink-0"
                                style={{
                                  color: ACTIVE_TEXT_DARK,
                                  backgroundColor: MODAL_BG,
                                  borderRadius: 9,
                                }}
                              >
                                {parsedData.accounts.length}
                              </div>
                            </div>
                            <div
                              className="flex items-center justify-between gap-2 p-4"
                              style={{
                                backgroundColor: BACKGROUND_DT,
                                borderRadius: 9,
                              }}
                            >
                              <span
                                className="text-base"
                                style={{ color: ACTIVE_TEXT_DARK }}
                              >
                                Категорий
                              </span>
                              <div
                                className="px-3 py-1.5 text-base shrink-0"
                                style={{
                                  color: ACTIVE_TEXT_DARK,
                                  backgroundColor: MODAL_BG,
                                  borderRadius: 9,
                                }}
                              >
                                {parsedData.categories.length}
                              </div>
                            </div>
                            <div
                              className="flex items-center justify-between gap-2 p-4"
                              style={{
                                backgroundColor: BACKGROUND_DT,
                                borderRadius: 9,
                              }}
                            >
                              <span
                                className="text-base"
                                style={{ color: ACTIVE_TEXT_DARK }}
                              >
                                Контрагентов
                              </span>
                              <div
                                className="px-3 py-1.5 text-base shrink-0"
                                style={{
                                  color: ACTIVE_TEXT_DARK,
                                  backgroundColor: MODAL_BG,
                                  borderRadius: 9,
                                }}
                              >
                                {parsedData.counterparties.length.toLocaleString(
                                  "ru-RU"
                                )}
                              </div>
                            </div>
                            <div
                              className="flex items-center justify-between gap-2 p-4"
                              style={{
                                backgroundColor: BACKGROUND_DT,
                                borderRadius: 9,
                              }}
                            >
                              <span
                                className="text-base"
                                style={{ color: ACTIVE_TEXT_DARK }}
                              >
                                Транзакций
                              </span>
                              <div
                                className="px-3 py-1.5 text-base shrink-0"
                                style={{
                                  color: ACTIVE_TEXT_DARK,
                                  backgroundColor: MODAL_BG,
                                  borderRadius: 9,
                                }}
                              >
                                {parsedData.transactions.length.toLocaleString(
                                  "ru-RU"
                                )}
                              </div>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
            {step === 2 && importSource === "own" && parsedFileData && (
              <div className="flex flex-col gap-4">
                <h3
                  className="text-2xl font-medium"
                  style={{ color: ACTIVE_TEXT_DARK }}
                >
                  Определение данных
                </h3>
                <ImportOwnColumnMapping
                  headers={parsedFileData.headers}
                  mapping={columnMapping}
                  onChange={setColumnMapping}
                  error={step2MappingError}
                />
                {ownMappingPreview && (
                  <div className="flex flex-col gap-4">
                    <p
                      className="text-base"
                      style={{ color: ACTIVE_TEXT_DARK }}
                    >
                      По текущему маппингу обнаружено:
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                      <div
                        className="flex flex-col gap-2 p-4 items-center text-center"
                        style={{
                          backgroundColor: BACKGROUND_DT,
                          borderRadius: 9,
                        }}
                      >
                        <span
                          className="text-base"
                          style={{ color: ACTIVE_TEXT_DARK }}
                        >
                          Дата первой операции
                        </span>
                        <div
                          className="w-full px-3 py-2 text-base box-border"
                          style={{
                            color: ACTIVE_TEXT_DARK,
                            backgroundColor: MODAL_BG,
                            borderRadius: 9,
                          }}
                        >
                          {(() => {
                            const dates = ownMappingPreview.transactions.map((t) => t.date).filter(Boolean);
                            const first = dates.length ? [...dates].sort()[0] : null;
                            if (!first) return "—";
                            const [y, m, d] = first.split("-");
                            return `${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.${y}`;
                          })()}
                        </div>
                      </div>
                      <div
                        className="flex flex-col gap-2 p-4 items-center text-center"
                        style={{
                          backgroundColor: BACKGROUND_DT,
                          borderRadius: 9,
                        }}
                      >
                        <span
                          className="text-base"
                          style={{ color: ACTIVE_TEXT_DARK }}
                        >
                          Дата последней операции
                        </span>
                        <div
                          className="w-full px-3 py-2 text-base box-border"
                          style={{
                            color: ACTIVE_TEXT_DARK,
                            backgroundColor: MODAL_BG,
                            borderRadius: 9,
                          }}
                        >
                          {(() => {
                            const dates = ownMappingPreview.transactions.map((t) => t.date).filter(Boolean);
                            const last = dates.length ? [...dates].sort().reverse()[0] : null;
                            if (!last) return "—";
                            const [y, m, d] = last.split("-");
                            return `${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.${y}`;
                          })()}
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-4">
                      <div
                        className="flex items-center justify-between gap-2 p-4"
                        style={{
                          backgroundColor: BACKGROUND_DT,
                          borderRadius: 9,
                        }}
                      >
                        <span
                          className="text-base"
                          style={{ color: ACTIVE_TEXT_DARK }}
                        >
                          Счетов
                        </span>
                        <div
                          className="px-3 py-1.5 text-base shrink-0"
                          style={{
                            color: ACTIVE_TEXT_DARK,
                            backgroundColor: MODAL_BG,
                            borderRadius: 9,
                          }}
                        >
                          {ownMappingPreview.accounts.length}
                        </div>
                      </div>
                      <div
                        className="flex items-center justify-between gap-2 p-4"
                        style={{
                          backgroundColor: BACKGROUND_DT,
                          borderRadius: 9,
                        }}
                      >
                        <span
                          className="text-base"
                          style={{ color: ACTIVE_TEXT_DARK }}
                        >
                          Категорий
                        </span>
                        <div
                          className="px-3 py-1.5 text-base shrink-0"
                          style={{
                            color: ACTIVE_TEXT_DARK,
                            backgroundColor: MODAL_BG,
                            borderRadius: 9,
                          }}
                        >
                          {ownMappingPreview.categories.length}
                        </div>
                      </div>
                      <div
                        className="flex items-center justify-between gap-2 p-4"
                        style={{
                          backgroundColor: BACKGROUND_DT,
                          borderRadius: 9,
                        }}
                      >
                        <span
                          className="text-base"
                          style={{ color: ACTIVE_TEXT_DARK }}
                        >
                          Контрагентов
                        </span>
                        <div
                          className="px-3 py-1.5 text-base shrink-0"
                          style={{
                            color: ACTIVE_TEXT_DARK,
                            backgroundColor: MODAL_BG,
                            borderRadius: 9,
                          }}
                        >
                          {ownMappingPreview.counterparties.length.toLocaleString("ru-RU")}
                        </div>
                      </div>
                      <div
                        className="flex items-center justify-between gap-2 p-4"
                        style={{
                          backgroundColor: BACKGROUND_DT,
                          borderRadius: 9,
                        }}
                      >
                        <span
                          className="text-base"
                          style={{ color: ACTIVE_TEXT_DARK }}
                        >
                          Транзакций
                        </span>
                        <div
                          className="px-3 py-1.5 text-base shrink-0"
                          style={{
                            color: ACTIVE_TEXT_DARK,
                            backgroundColor: MODAL_BG,
                            borderRadius: 9,
                          }}
                        >
                          {ownMappingPreview.transactions.length.toLocaleString("ru-RU")}
                        </div>
                      </div>
                    </div>
                    {accountingStartDate && (() => {
                      const earliest = getEarliestStatementTransactionDate(ownMappingPreview);
                      if (!earliest || accountingStartDate <= earliest) return null;
                      return (
                        <div
                          className="mt-4 p-4 rounded-lg border"
                          style={{
                            backgroundColor: "rgba(251, 76, 79, 0.1)",
                            borderColor: "#FB4C4F",
                            color: ACTIVE_TEXT_DARK,
                          }}
                        >
                          <p className="text-base">
                            В выписке есть операции раньше установленной даты начала учета ({formatShortDateDisplay(accountingStartDate)}). Будут импортированы только транзакции начиная с {formatShortDateDisplay(accountingStartDate)}. Дата начала действия импортируемых счетов будет установлена на {formatShortDateDisplay(accountingStartDate)}.
                          </p>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}
            {step === stepAccounts && parsedData && (
              <div className="flex flex-col gap-4">
                <div
                  className="shrink-0 text-center"
                  style={{
                    fontSize: 18,
                    fontWeight: 400,
                    color: ACTIVE_TEXT_DARK,
                    lineHeight: 1.4,
                  }}
                >
                  <p className="mb-2">
                    Выберите, какие счета вы хотите импортировать, с каким
                    типом, названием, а также укажите текущий остаток
                  </p>
                  <p className="mb-2">
                    Также Вы можете связать импортируемый счет с уже имеющимся
                    активом/обязательством — для этого включите движок «Связать»
                  </p>
                  {importSource === "dzen" && (
                    <p style={{ color: PLACEHOLDER_COLOR_DARK }}>
                      Счёт «Долги» из выписки не импортируется. Операции
                      перевода на него и с него будут загружены как расходы или
                      доходы с категориями «Прочие расходы» и «Прочие доходы»
                      соответственно.
                    </p>
                  )}
                </div>
                {step2Error && (
                  <p
                    className="text-base shrink-0"
                    style={{ color: "#FB4C4F" }}
                  >
                    {step2Error}
                  </p>
                )}
                <div className="flex flex-col gap-4 overflow-auto min-w-0">
                  {(importSource === "dzen"
                    ? parsedData.accounts.filter((acc) => !isDzenDebtsAccount(acc))
                    : parsedData.accounts
                  ).map((account) => {
                    const key = `${account.name}|${account.currency}`;
                    const cardState =
                      accountCardStates.get(key) ?? getInitialAccountCardState(account);
                    return (
                      <ImportAccountCard
                        key={key}
                        account={account}
                        transactions={parsedData.transactions}
                        items={items}
                        state={cardState}
                        onChange={(next) => {
                          setAccountCardStates((prev) => {
                            const m = new Map(prev);
                            m.set(key, next);
                            return m;
                          });
                        }}
                        apiBase={API_BASE}
                        counterparties={counterparties}
                        industries={industries}
                        statementAccountingStartDate={getStatementAccountingStartDate(
                          parsedData,
                          accountCardStates
                        )}
                        statementLastTransactionDate={getStatementLastTransactionDate(
                          parsedData
                        )}
                        onAddCounterparty={(draft) => {
                          setAddCounterpartyDraftName(draft);
                          setAddCounterpartyForAccountKey(key);
                          setAddCounterpartyModalOpen(true);
                        }}
                        validationError={accountValidationErrors.get(key) ?? null}
                        validationWarning={accountValidationWarnings.get(key) ?? null}
                        getCounterpartyForItemId={getCounterpartyForItemId}
                      />
                    );
                  })}
                </div>
              </div>
            )}
            {step === stepAccounts && !parsedData && (
              <div className="flex flex-col gap-4">
                <h3
                  className="text-2xl font-medium"
                  style={{ color: ACTIVE_TEXT_DARK }}
                >
                  Счета
                </h3>
                <p style={{ lineHeight: 1.4, color: PLACEHOLDER_COLOR_DARK }}>
                  Парсинг для выбранного источника пока не поддерживается.
                </p>
              </div>
            )}
            {step === stepCategories && parsedData && (
              <div className="flex flex-col gap-4">
                <div
                  className="shrink-0 text-center"
                  style={{
                    fontSize: 18,
                    fontWeight: 400,
                    color: ACTIVE_TEXT_DARK,
                    lineHeight: 1.4,
                  }}
                >
                  <p className="mb-2">
                    Выберите, какие категории импортировать, укажите тип,
                    родителя, название и иконку.
                  </p>
                  <p>
                    Также Вы можете связать импортируемую категорию с уже
                    имеющейся — для этого включите движок «Связать».
                  </p>
                </div>
                {categoryStepTransferWarnings.length > 0 && (
                  <div
                    className="shrink-0 space-y-2 rounded-lg px-4 py-3"
                    style={{ backgroundColor: "rgba(232, 163, 23, 0.12)" }}
                  >
                    {categoryStepTransferWarnings.map((w, i) => (
                      <p
                        key={i}
                        className="text-base"
                        style={{ color: "#E8A317", lineHeight: 1.4 }}
                      >
                        {w}
                      </p>
                    ))}
                  </div>
                )}
                {step3Error && (
                  <p
                    className="text-base shrink-0"
                    style={{ color: "#FB4C4F" }}
                  >
                    {step3Error}
                  </p>
                )}
                <div className="flex flex-col gap-4 overflow-auto min-w-0">
                  {parsedData.categories.map((category) => {
                    const key = category.name;
                    const cardState =
                      categoryCardStates.get(key) ??
                      getInitialCategoryCardState(category, {
                        defaultTransferMode: isTransferCategoryName(category.name),
                      });
                    const transferRows = computeTransferRowsForCategory(
                      category.name,
                      parsedData.transactions ?? [],
                      parsedData.accounts ?? [],
                      accountCardStates
                    );
                    return (
                      <ImportCategoryCard
                        key={key}
                        category={category}
                        categoryNodes={categories}
                        state={cardState}
                        onChange={(next) => {
                          setCategoryCardStates((prev) => {
                            const m = new Map(prev);
                            m.set(key, next);
                            return m;
                          });
                        }}
                        onAddCategory={() => setCreateCategoryOpen(true)}
                        showTransferMode={isTransferCategoryName(category.name)}
                        transferRows={transferRows}
                        linkedItemLabelByAccountKey={linkedItemLabelByAccountKey}
                        items={items}
                        getCounterpartyForItemId={getCounterpartyForItemId}
                        apiBase={API_BASE}
                      />
                    );
                  })}
                </div>
              </div>
            )}
            {step === stepCategories && !parsedData && (
              <p style={{ lineHeight: 1.4, color: PLACEHOLDER_COLOR_DARK }}>
                Сначала загрузите файл на шаге 1.
              </p>
            )}
            {step === stepCounterparties &&
              parsedData &&
              counterpartiesForMappingStep.length > 0 && (
              <div className="flex flex-col gap-4">
                <div
                  className="shrink-0 text-center"
                  style={{
                    fontSize: 18,
                    fontWeight: 400,
                    color: ACTIVE_TEXT_DARK,
                    lineHeight: 1.4,
                  }}
                >
                  <p className="mb-2">
                    Выберите, какие контрагенты импортировать, укажите тип
                    (ЮЛ/ИП или ФЛ) и необходимые данные.
                  </p>
                  <p>
                    Также Вы можете связать импортируемого контрагента с уже
                    имеющимся — для этого включите движок «Связать».
                  </p>
                </div>
                {step4Error && (
                  <p
                    className="text-base shrink-0"
                    style={{ color: "#FB4C4F" }}
                  >
                    {step4Error}
                  </p>
                )}
                <div className="flex flex-col gap-4 overflow-auto min-w-0">
                  {counterpartiesForMappingStep.map((cp) => {
                    const key = cp.name;
                    const cardState =
                      counterpartyCardStates.get(key) ??
                      getInitialCounterpartyCardState(cp);
                    return (
                      <ImportCounterpartyCard
                        key={key}
                        counterparty={cp}
                        counterparties={counterparties}
                        state={cardState}
                        onChange={(next) => {
                          setCounterpartyCardStates((prev) => {
                            const m = new Map(prev);
                            m.set(key, next);
                            return m;
                          });
                        }}
                        apiBase={API_BASE}
                      />
                    );
                  })}
                </div>
              </div>
            )}
            {step === stepCounterparties &&
              parsedData &&
              (parsedData.counterparties?.length ?? 0) === 0 && (
                <p style={{ lineHeight: 1.4, color: PLACEHOLDER_COLOR_DARK }}>
                  В выгрузке не найдено контрагентов. Перейдите к следующему
                  шагу.
                </p>
              )}
            {step === stepCounterparties &&
              parsedData &&
              (parsedData.counterparties?.length ?? 0) > 0 &&
              counterpartiesForMappingStep.length === 0 && (
                <p style={{ lineHeight: 1.4, color: PLACEHOLDER_COLOR_DARK }}>
                  Для операций с контрагентами из выписки не требуется
                  сопоставление: все такие операции обрабатываются как переводы
                  по настройкам категорий. Перейдите к следующему шагу.
                </p>
              )}
            {step === stepCounterparties && !parsedData && (
              <p style={{ lineHeight: 1.4, color: PLACEHOLDER_COLOR_DARK }}>
                Сначала загрузите файл на шаге 1.
              </p>
            )}
            {step === stepCheckpoint && isBankImport && parsedData?.accounts?.length && (
              <div className="flex flex-col gap-6">
                {stepCheckpointError && (
                  <p className="text-base shrink-0" style={{ color: "#FB4C4F" }}>
                    {stepCheckpointError}
                  </p>
                )}
                <p className="text-base" style={{ color: ACTIVE_TEXT_DARK }}>
                  По данным выписки можно создать контрольную точку (сальдо на дату). При необходимости отредактируйте параметры или отключите создание.
                </p>
                {parsedData.accounts.map((acc) => {
                  const accountKey = `${acc.name}|${acc.currency}`;
                  const block = checkpointStepState.get(accountKey) ?? {
                    createCheckpoint: false,
                    selectedItemId: null,
                    dateKey: "",
                    timeStr: "23:59",
                    amountStr: "",
                  };
                  const balanceItems = items.filter(
                    (i) => (i.primary_value_kind ?? "BALANCE") === "BALANCE"
                  );
                  return (
                    <div
                      key={accountKey}
                      className="rounded-lg p-6 flex flex-col gap-4"
                      style={{ backgroundColor: BACKGROUND_DT }}
                    >
                      <div className="flex items-center justify-between gap-4">
                        <span className="font-medium" style={{ color: ACTIVE_TEXT_DARK }}>
                          Счёт: {acc.name}
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-sm" style={{ color: PLACEHOLDER_COLOR_DARK }}>
                            Создать контрольную точку
                          </span>
                          <Switch
                            checked={block.createCheckpoint}
                            onCheckedChange={(checked) => {
                              setCheckpointStepState((prev) => {
                                const next = new Map(prev);
                                const cur = next.get(accountKey) ?? block;
                                next.set(accountKey, { ...cur, createCheckpoint: checked });
                                return next;
                              });
                            }}
                          />
                        </div>
                      </div>
                      {block.createCheckpoint && (
                        <div className="flex flex-row flex-wrap items-end gap-4">
                          <div className="min-w-[200px] flex-1 max-w-md">
                            <FormField label="Актив" required>
                              <ItemSelector
                                items={balanceItems}
                                selectedIds={block.selectedItemId ? [block.selectedItemId] : []}
                                onChange={(ids) => {
                                  setCheckpointStepState((prev) => {
                                    const next = new Map(prev);
                                    const cur = next.get(accountKey) ?? block;
                                    next.set(accountKey, { ...cur, selectedItemId: ids[0] ?? null });
                                    return next;
                                  });
                                }}
                                selectionMode="single"
                                placeholder="Выберите актив"
                                clearLabel="Не выбрано"
                                getItemTypeLabel={getItemTypeLabel}
                                getCounterpartyForItemId={getCounterpartyForItemId}
                                apiBase={API_BASE}
                                ariaLabel="Актив для контрольной точки"
                              />
                            </FormField>
                          </div>
                          <div className="flex items-end gap-2 shrink-0">
                            <FormField label="Дата" required>
                              <AuthInput
                                type="date"
                                value={block.dateKey}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setCheckpointStepState((prev) => {
                                    const next = new Map(prev);
                                    const cur = next.get(accountKey) ?? block;
                                    next.set(accountKey, { ...cur, dateKey: v });
                                    return next;
                                  });
                                }}
                                className="w-[140px]"
                              />
                            </FormField>
                            <FormField label="Время" required>
                              <AuthInput
                                type="text"
                                inputMode="numeric"
                                value={block.timeStr}
                                onChange={(e) => {
                                  const v = formatTimeInput(e.target.value);
                                  setCheckpointStepState((prev) => {
                                    const next = new Map(prev);
                                    const cur = next.get(accountKey) ?? block;
                                    next.set(accountKey, { ...cur, timeStr: v });
                                    return next;
                                  });
                                }}
                                placeholder="00:00"
                                maxLength={5}
                                className="w-[5.5rem]"
                              />
                            </FormField>
                          </div>
                          <div className="min-w-[120px] shrink-0">
                            <TextField
                              label="Сумма"
                              currencyCode={acc.currency}
                              value={block.amountStr}
                              onChange={(e) => {
                                setCheckpointStepState((prev) => {
                                  const next = new Map(prev);
                                  const cur = next.get(accountKey) ?? block;
                                  next.set(accountKey, { ...cur, amountStr: formatRubInput(e.target.value) });
                                  return next;
                                });
                              }}
                              onBlur={(e) => {
                                const v = e.target.value.trim() ? normalizeRubOnBlur(e.target.value) : e.target.value;
                                setCheckpointStepState((prev) => {
                                  const next = new Map(prev);
                                  const cur = next.get(accountKey) ?? block;
                                  next.set(accountKey, { ...cur, amountStr: v });
                                  return next;
                                });
                              }}
                              placeholder="0,00"
                              required
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {step === stepCheckpoint && isBankImport && (!parsedData?.accounts?.length || !parsedData) && (
              <p style={{ lineHeight: 1.4, color: PLACEHOLDER_COLOR_DARK }}>
                Сначала загрузите файл и пройдите предыдущие шаги.
              </p>
            )}
            {step === stepConfirm && isTbankInvestIntegration && (
              <div className="flex flex-col gap-6">
                {tbankError && (
                  <div
                    className="text-sm rounded-md border p-3"
                    style={{
                      color: "#FB4C4F",
                      backgroundColor: "rgba(251, 76, 79, 0.08)",
                      borderColor: "rgba(251, 76, 79, 0.3)",
                    }}
                  >
                    {tbankError}
                  </div>
                )}

                <div
                  className="rounded-[10px] p-5"
                  style={{ backgroundColor: BACKGROUND_DT }}
                >
                  <div className="text-base font-medium mb-3" style={{ color: ACTIVE_TEXT_DARK }}>
                    Превью операций
                  </div>

                  {tbankLoading && (
                    <p className="text-sm" style={{ color: PLACEHOLDER_COLOR_DARK }}>
                      Загрузка превью…
                    </p>
                  )}

                  {!tbankLoading && tbankPreview && (
                    <div className="space-y-4 mt-1">
                      {tbankPreview.accounts.map((a) => {
                        const impRows = sortedTbankTypeEntries(a.importable_by_type ?? {});
                        const skipRows = sortedTbankTypeEntries(a.not_imported_by_type ?? {});
                        return (
                          <div
                            key={a.external_account_id}
                            className="rounded-md border p-4"
                            style={{ borderColor: "rgba(255,255,255,0.1)" }}
                          >
                            <div className="text-sm font-medium mb-3" style={{ color: ACTIVE_TEXT_DARK }}>
                              {getTbankAccountTitle(a.external_account_id)}
                            </div>

                            <div className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: PLACEHOLDER_COLOR_DARK }}>
                              Импортируется
                            </div>
                            {impRows.length === 0 ? (
                              <p className="text-sm mb-4" style={{ color: PLACEHOLDER_COLOR_DARK }}>
                                Нет операций
                              </p>
                            ) : (
                              <ul className="space-y-1.5 mb-4">
                                {impRows.map(([typeKey, n]) => (
                                  <li
                                    key={`imp-${a.external_account_id}-${typeKey}`}
                                    className="flex justify-between gap-3 text-sm min-w-0"
                                    style={{ color: ACTIVE_TEXT_DARK }}
                                  >
                                    <span className="min-w-0 break-words">{getTbankOperationTypeLabel(typeKey)}</span>
                                    <span className="shrink-0 tabular-nums font-medium">{n}</span>
                                  </li>
                                ))}
                              </ul>
                            )}

                            <div className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: PLACEHOLDER_COLOR_DARK }}>
                              Не импортируется
                            </div>
                            {skipRows.length === 0 ? (
                              <p className="text-sm" style={{ color: PLACEHOLDER_COLOR_DARK }}>
                                Нет операций
                              </p>
                            ) : (
                              <ul className="space-y-1.5">
                                {skipRows.map(([typeKey, n]) => (
                                  <li
                                    key={`skip-${a.external_account_id}-${typeKey}`}
                                    className="flex justify-between gap-3 text-sm min-w-0"
                                    style={{ color: ACTIVE_TEXT_DARK }}
                                  >
                                    <span className="min-w-0 break-words">{getTbankOperationTypeLabel(typeKey)}</span>
                                    <span className="shrink-0 tabular-nums font-medium">{n}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {!tbankLoading && !tbankPreview && !tbankError && (
                    <p className="text-sm mt-1" style={{ color: PLACEHOLDER_COLOR_DARK }}>
                      Нет данных превью.
                    </p>
                  )}
                </div>
              </div>
            )}
            {step === stepConfirm && !isTbankInvestIntegration && (
              <div className="flex flex-col gap-6">
                {step5Error && (
                  <p
                    className="text-base shrink-0"
                    style={{ color: "#FB4C4F" }}
                  >
                    {step5Error}
                  </p>
                )}
                <div
                  className="shrink-0 text-center"
                  style={{
                    fontSize: 18,
                    fontWeight: 400,
                    color: ACTIVE_TEXT_DARK,
                    lineHeight: 1.4,
                  }}
                >
                  <p className="mb-2">Настройка импорта завершена!</p>
                  <p>Будут импортированы</p>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  {(() => {
                    const accountsTotal = (parsedData?.accounts ?? []).filter(
                      (a) => {
                        const key = `${a.name}|${a.currency}`;
                        return !!accountCardStates.get(key);
                      }
                    ).length;
                    const accountsLinked = (parsedData?.accounts ?? []).filter(
                      (a) => {
                        const key = `${a.name}|${a.currency}`;
                        const s = accountCardStates.get(key);
                        return !!s && s.linkEnabled;
                      }
                    ).length;
                    const categoriesTotal = (
                      parsedData?.categories ?? []
                    ).filter((c) => !!categoryCardStates.get(c.name)).length;
                    const categoriesLinked = (
                      parsedData?.categories ?? []
                    ).filter((c) => {
                      const s = categoryCardStates.get(c.name);
                      return !!s && s.linkEnabled;
                    }).length;
                    const counterpartiesTotal =
                      counterpartiesForMappingStep.filter(
                        (c) => !!counterpartyCardStates.get(c.name)
                      ).length;
                    const counterpartiesLinked =
                      counterpartiesForMappingStep.filter((c) => {
                        const s = counterpartyCardStates.get(c.name);
                        return !!s && s.linkEnabled;
                      }).length;

                    return (
                      <>
                        <div
                          className="rounded-lg p-6 flex flex-col items-center justify-center"
                          style={{
                            backgroundColor: BACKGROUND_DT,
                          }}
                        >
                          <span
                            className="mb-2"
                            style={{
                              fontSize: 32,
                              fontWeight: 500,
                              color: ACTIVE_TEXT_DARK,
                            }}
                          >
                            Счета
                          </span>
                          <span
                            className="font-semibold"
                            style={{
                              fontSize: 96,
                              fontWeight: 600,
                              background: PINK_GRADIENT,
                              WebkitBackgroundClip: "text",
                              WebkitTextFillColor: "transparent",
                              backgroundClip: "text",
                            }}
                          >
                            {accountsTotal}
                          </span>
                          <span
                            className="mt-1 px-3 py-1"
                            style={{
                              fontSize: 18,
                              fontWeight: 400,
                              color: ACTIVE_TEXT_DARK,
                              backgroundColor: MODAL_BG,
                              borderRadius: 9,
                            }}
                          >
                            Связанных — {accountsLinked}
                          </span>
                        </div>
                        <div
                          className="rounded-lg p-6 flex flex-col items-center justify-center"
                          style={{
                            backgroundColor: BACKGROUND_DT,
                          }}
                        >
                          <span
                            className="mb-2"
                            style={{
                              fontSize: 32,
                              fontWeight: 500,
                              color: ACTIVE_TEXT_DARK,
                            }}
                          >
                            Категории
                          </span>
                          <span
                            className="font-semibold"
                            style={{
                              fontSize: 96,
                              fontWeight: 600,
                              background: PINK_GRADIENT,
                              WebkitBackgroundClip: "text",
                              WebkitTextFillColor: "transparent",
                              backgroundClip: "text",
                            }}
                          >
                            {categoriesTotal}
                          </span>
                          <span
                            className="mt-1 px-3 py-1"
                            style={{
                              fontSize: 18,
                              fontWeight: 400,
                              color: ACTIVE_TEXT_DARK,
                              backgroundColor: MODAL_BG,
                              borderRadius: 9,
                            }}
                          >
                            Связанных — {categoriesLinked}
                          </span>
                        </div>
                        <div
                          className="rounded-lg p-6 flex flex-col items-center justify-center"
                          style={{
                            backgroundColor: BACKGROUND_DT,
                          }}
                        >
                          <span
                            className="mb-2"
                            style={{
                              fontSize: 32,
                              fontWeight: 500,
                              color: ACTIVE_TEXT_DARK,
                            }}
                          >
                            Контрагенты
                          </span>
                          <span
                            className="font-semibold"
                            style={{
                              fontSize: 96,
                              fontWeight: 600,
                              background: PINK_GRADIENT,
                              WebkitBackgroundClip: "text",
                              WebkitTextFillColor: "transparent",
                              backgroundClip: "text",
                            }}
                          >
                            {counterpartiesTotal}
                          </span>
                          <span
                            className="mt-1 px-3 py-1"
                            style={{
                              fontSize: 18,
                              fontWeight: 400,
                              color: ACTIVE_TEXT_DARK,
                              backgroundColor: MODAL_BG,
                              borderRadius: 9,
                            }}
                          >
                            Связанных — {counterpartiesLinked}
                          </span>
                        </div>
                      </>
                    );
                  })()}
                </div>
                <div
                  className="rounded-lg p-6 flex flex-col items-center justify-center"
                  style={{
                    backgroundColor: BACKGROUND_DT,
                  }}
                >
                  <span
                    className="mb-2"
                    style={{
                      fontSize: 32,
                      fontWeight: 500,
                      color: ACTIVE_TEXT_DARK,
                    }}
                  >
                    Транзакции
                  </span>
                  <span
                    className="font-semibold"
                    style={{
                      fontSize: 96,
                      fontWeight: 600,
                      background: PINK_GRADIENT,
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      backgroundClip: "text",
                    }}
                  >
                    {parsedData?.transactions?.length ?? 0}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Кнопки */}
          <div className="flex flex-wrap items-center justify-end gap-3 shrink-0 px-6 pb-6 pt-2">
            <Button
              variant="glass"
              className="h-12 rounded-lg border-0 px-6 font-normal"
              style={
                {
                  "--glass-bg": "rgba(108, 93, 215, 0.22)",
                  "--glass-bg-hover": "rgba(108, 93, 215, 0.4)",
                  fontSize: 18,
                  fontWeight: 400,
                } as React.CSSProperties
              }
              onClick={handleCancel}
            >
              Отмена
            </Button>
            {step > 1 && (
              <Button
                variant="glass"
                className="h-12 rounded-lg border-0 px-6 font-normal"
                style={
                  {
                    "--glass-bg": "rgba(108, 93, 215, 0.22)",
                    "--glass-bg-hover": "rgba(108, 93, 215, 0.4)",
                    fontSize: 18,
                    fontWeight: 400,
                  } as React.CSSProperties
                }
                onClick={handleBack}
              >
                Назад
              </Button>
            )}
            <Button
              variant="authPrimary"
              className="h-12 rounded-lg border-0 px-8 font-normal"
              style={
                {
                  "--auth-primary-bg":
                    "linear-gradient(135deg, #483BA6 0%, #6C5DD7 57%, #6C5DD7 79%, #9487F3 100%)",
                  "--auth-primary-bg-hover":
                    "linear-gradient(315deg, #9487F3 0%, #6C5DD7 57%, #6C5DD7 79%, #483BA6 100%)",
                  fontSize: 18,
                  fontWeight: 400,
                } as React.CSSProperties
              }
              onClick={() => void handleNext()}
              disabled={
                isParsing ||
                isImporting ||
                isReadingFile ||
                (isTbankInvestIntegration &&
                  step === 1 &&
                  (tbankLoading || tbankProfileLoading)) ||
                (isTbankInvestIntegration && isLastStep && tbankLoading)
              }
            >
              {isTbankInvestIntegration &&
              step === 1 &&
              (tbankLoading || tbankProfileLoading)
                ? "Проверка…"
                : isParsing || isReadingFile
                  ? "Обработка…"
                  : isImporting
                    ? "Импорт…"
                    : isLastStep
                      ? isTbankInvestIntegration
                        ? "Подключить"
                        : "Завершить импорт"
                      : "Далее"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    <ConfirmModal
      open={confirmCloseOpen}
      onOpenChange={setConfirmCloseOpen}
      title="Закрыть импорт?"
      description="Прогресс импорта будет потерян."
      onConfirm={handleConfirmClose}
      confirmLabel="Закрыть"
      cancelLabel="Отмена"
      variant="primary"
      overlayClassName="z-[110] bg-black/60"
      containerClassName="z-[110]"
    />
    <CreateCategoryModal
      open={createCategoryOpen}
      onOpenChange={setCreateCategoryOpen}
      onSuccess={() => {
        fetchCategories({ includeArchived: false })
          .then(setCategories)
          .catch(() => setCategories([]));
        setCreateCategoryOpen(false);
      }}
      categoryNodes={categories}
    />
    <CreateCounterpartyModal
      open={addCounterpartyModalOpen}
      onOpenChange={(next) => {
        setAddCounterpartyModalOpen(next);
        if (!next) {
          setAddCounterpartyForAccountKey(null);
          setAddCounterpartyDraftName("");
        }
      }}
      initialName={addCounterpartyDraftName || undefined}
      modal={false}
      onSuccess={(created) => {
        setCounterparties((prev) => [...prev, created]);
        if (addCounterpartyForAccountKey) {
          setAccountCardStates((prev) => {
            const m = new Map(prev);
            const state = m.get(addCounterpartyForAccountKey);
            if (state) {
              m.set(addCounterpartyForAccountKey, { ...state, counterpartyId: created.id });
            }
            return m;
          });
        }
        setAddCounterpartyModalOpen(false);
        setAddCounterpartyForAccountKey(null);
      }}
      initialIndustryId={(() => {
        if (!addCounterpartyForAccountKey) return undefined;
        const cardState = accountCardStates.get(addCounterpartyForAccountKey);
        if (!cardState) return undefined;
        const typeOptions = getTypeOptionsForKind(cardState.kind);
        const displayType = normalizeDisplayTypeCode(cardState.typeCode || "", cardState.kind);
        const effectiveType = (cardState.typeCode && typeOptions.some((o) => o.code === cardState.typeCode))
          ? cardState.typeCode
          : (displayType && typeOptions.some((o) => o.code === displayType) ? displayType : typeOptions[0]?.code ?? "");
        const isBankType = ["bank_account", "bank_card_debit", "bank_card_credit", "deposit", "savings_account"].includes(effectiveType);
        return isBankType ? industries.find((ind) => ind.name === "Банки")?.id ?? undefined : undefined;
      })()}
      overlayClassName="z-[100] import-add-counterparty-modal"
      containerClassName="z-[100] import-add-counterparty-modal"
    />
    </>
  );
}
