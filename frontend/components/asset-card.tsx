"use client";

import React from "react";
import { MoreVertical, Pencil, Trash2, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ItemOut, CounterpartyOut, API_BASE, MarketPriceOut } from "@/lib/api";
import { getEffectiveItemKind, formatAmount, getItemPhotoUrl } from "@/lib/item-utils";
import { getItemTypeLabel } from "@/lib/item-types";
import { buildCounterpartyDisplayName } from "@/lib/counterparty-utils";
import { useImagePreloader } from "@/hooks/use-image-preloader";
import {
  MODAL_BG,
  BACKGROUND_DT,
  GREEN,
  RED,
  PLACEHOLDER_COLOR_DARK,
  ACTIVE_TEXT_DARK,
  PINK_GRADIENT,
  ACCENT2,
  ACCENT,
} from "@/lib/colors";
import { PINK_GRADIENT as PINK_GRADIENT_CONST } from "@/lib/gradients";
import {
  Banknote,
  Landmark,
  CreditCard,
  PiggyBank,
  Wallet,
  LineChart,
  BarChart3,
  Coins,
  Users,
  Home,
  Car,
  Package,
  TrendingUp,
  Receipt,
  AlertCircle,
  User,
  Factory,
} from "lucide-react";

const MOEX_TYPE_CODES = ["securities", "bonds", "etf", "bpif", "pif"];

/** Кредитные обязательства: consumer_loan, mortgage, car_loan, education_loan, installment, microloan */
const CREDIT_LIABILITY_TYPE_CODES = new Set([
  "consumer_loan",
  "mortgage",
  "car_loan",
  "education_loan",
  "installment",
  "microloan",
]);

/** Недвижимость, Транспорт, Имущество — показываем "Рыночная стоимость" вместо "Баланс" */
const MARKET_VALUE_TYPE_CODES = new Set([
  "real_estate",
  "townhouse",
  "land_plot",
  "garage",
  "commercial_real_estate",
  "real_estate_share",
  "car",
  "motorcycle",
  "boat",
  "trailer",
  "special_vehicle",
  "jewelry",
  "electronics",
  "art",
  "collectibles",
  "other_valuables",
]);

const TYPE_ICON_BY_CODE: Record<
  string,
  React.ComponentType<{ className?: string; strokeWidth?: number }>
> = {
  cash: Banknote,
  bank_account: Landmark,
  bank_card: CreditCard,
  deposit: PiggyBank,
  savings_account: Wallet,
  e_wallet: Wallet,
  brokerage: LineChart,
  securities: BarChart3,
  bonds: BarChart3,
  etf: BarChart3,
  bpif: BarChart3,
  pif: BarChart3,
  iis: LineChart,
  precious_metals: Coins,
  crypto: Coins,
  loan_to_third_party: Users,
  third_party_receivables: Users,
  real_estate: Home,
  townhouse: Home,
  land_plot: Home,
  garage: Home,
  commercial_real_estate: Home,
  real_estate_share: Home,
  car: Car,
  motorcycle: Car,
  boat: Car,
  trailer: Car,
  special_vehicle: Car,
  jewelry: Package,
  electronics: Package,
  art: Package,
  collectibles: Package,
  other_valuables: Package,
  npf: PiggyBank,
  investment_life_insurance: PiggyBank,
  business_share: TrendingUp,
  sole_proprietor: TrendingUp,
  other_asset: Package,
  consumer_loan: Coins,
  mortgage: Home,
  car_loan: Car,
  education_loan: Coins,
  installment: Receipt,
  microloan: Coins,
  private_loan: Users,
  third_party_payables: Users,
  tax_debt: Receipt,
  personal_income_tax_debt: Receipt,
  property_tax_debt: Receipt,
  land_tax_debt: Receipt,
  transport_tax_debt: Receipt,
  fns_debt: Receipt,
  utilities_debt: Receipt,
  telecom_debt: Receipt,
  traffic_fines_debt: Receipt,
  enforcement_debt: AlertCircle,
  alimony_debt: AlertCircle,
  court_debt: AlertCircle,
  court_fine_debt: AlertCircle,
  business_liability: AlertCircle,
  other_liability: AlertCircle,
};

function getMoexUnitPriceCents(
  item: ItemOut,
  price: MarketPriceOut | null
): number | null {
  if (!price) return null;
  if (price.price_cents != null) {
    if (item.type_code === "bonds")
      return price.price_cents + (price.accint_cents ?? 0);
    return price.price_cents;
  }
  if (price.price_percent_bp != null && item.face_value_cents != null) {
    const base = Math.round(
      (item.face_value_cents * price.price_percent_bp) / 10000
    );
    return base + (price.accint_cents ?? 0);
  }
  return null;
}

interface AssetCardProps {
  item: ItemOut;
  accountingStartDate: string | null;
  rate?: number | null;
  rubEquivalent?: number | null;
  counterparty?: CounterpartyOut | null;
  moexMarketPrice?: MarketPriceOut | null;
  onEdit?: (item: ItemOut) => void;
  onDelete?: (item: ItemOut) => void;
  onArchive?: (item: ItemOut) => void;
  onClose?: (item: ItemOut) => void;
  getItemDisplayBalanceCents: (item: ItemOut) => number;
  onReady?: () => void;
}

// Simplified industry icon mapping (can be expanded if needed)
const INDUSTRY_ICON_BY_ID: Record<number, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {};

function getLegalDefaultIcon(industryId: number | null): React.ComponentType<{ className?: string; strokeWidth?: number }> {
  if (!industryId) return Factory;
  return INDUSTRY_ICON_BY_ID[industryId] ?? Factory;
}

const CURRENCY_BADGE_CLASSES: Record<string, string> = {
  RUB: "bg-[#C46A2F]/20 text-[#C46A2F]",
  USD: "bg-[#2E7D32]/20 text-[#2E7D32]",
  EUR: "bg-[#003399]/20 text-[#003399]",
  JPY: "bg-[#BC002D]/20 text-[#BC002D]",
  CNY: "bg-[#DE2910]/20 text-[#DE2910]",
};

function getCurrencyBadgeClass(code: string) {
  return CURRENCY_BADGE_CLASSES[code] ?? "bg-muted/20 text-slate-600";
}

function formatRate(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value);
}

function formatShortDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return dateKey;
  const paddedDay = String(day).padStart(2, "0");
  const paddedMonth = String(month).padStart(2, "0");
  return `${paddedDay}.${paddedMonth}.${year}`;
}

const REPAYMENT_FREQUENCY_LABELS: Record<string, string> = {
  DAILY: "Ежедневно",
  WEEKLY: "Еженедельно",
  MONTHLY: "Ежемесячно",
  REGULAR: "Регулярно",
};

const REPAYMENT_TYPE_LABELS: Record<string, string> = {
  ANNUITY: "Аннуитетный",
  DIFFERENTIATED: "Дифференцированный",
};

export function AssetCard({
  item,
  accountingStartDate,
  rate,
  rubEquivalent,
  counterparty,
  moexMarketPrice,
  onEdit,
  onDelete,
  onArchive,
  onClose,
  getItemDisplayBalanceCents,
  onReady,
}: AssetCardProps) {
  const isArchived = Boolean(item.archived_at);
  const isClosed = Boolean(item.closed_at);
  const isDeleted = isArchived;
  const kind = getEffectiveItemKind(item, item.current_value_rub);
  const isAsset = kind === "ASSET";
  const stripeColor = isAsset ? GREEN : RED;
  const typeLabel = getItemTypeLabel(item);
  const currencyCode = item.currency_code || "";
  const TypeIcon = TYPE_ICON_BY_CODE[item.type_code];
  const isMoexItem = MOEX_TYPE_CODES.includes(item.type_code);
  const useMarketValueLabel = MARKET_VALUE_TYPE_CODES.has(item.type_code);
  const isCreditLiability = CREDIT_LIABILITY_TYPE_CODES.has(item.type_code);
  const useCreditPrincipalLabel = isCreditLiability;

  const displayBalanceCents = getItemDisplayBalanceCents(item);
  const ps = item.plan_settings;
  const showBalanceAndRate =
    ((currencyCode && currencyCode !== "RUB") || isMoexItem) && !isDeleted;
  const moexUnitPriceCents = isMoexItem
    ? getMoexUnitPriceCents(item, moexMarketPrice ?? null)
    : null;
  
  const historyStatus =
    item.history_status ??
    (accountingStartDate && item.open_date
      ? item.open_date > accountingStartDate
        ? "NEW"
        : "HISTORICAL"
      : null);
  
  const openDateLabel = item.open_date
    ? formatShortDate(item.open_date)
    : "";

  // Priority: 1. User uploaded photo, 2. 3D icon, 3. 2D icon
  // Try PNG first, then WebP, then fallback to 2D icon
  const [iconFormat, setIconFormat] = React.useState<"png" | "webp" | null>("png");
  const icon3dPath = iconFormat ? `/icons-3d/${item.type_code}.${iconFormat}` : null;
  const hasPhoto = getItemPhotoUrl(item, API_BASE);

  // Counterparty logo/icon handling
  const counterpartyLogoUrl = counterparty
    ? (counterparty.entity_type === "PERSON" ? counterparty.photo_url : counterparty.logo_url)
    : null;
  const rawCounterpartyLogoUrl = counterpartyLogoUrl;
  const counterpartyLogoUrlFull = rawCounterpartyLogoUrl
    ? rawCounterpartyLogoUrl.startsWith("http")
      ? rawCounterpartyLogoUrl
      : rawCounterpartyLogoUrl.startsWith("/")
      ? `${API_BASE}${rawCounterpartyLogoUrl}`
      : `${API_BASE}/${rawCounterpartyLogoUrl}`
    : null;
  const CounterpartyFallbackIcon = counterparty
    ? (counterparty.entity_type === "PERSON"
        ? User
        : getLegalDefaultIcon(counterparty.industry_id ?? null))
    : null;
  const [showCounterpartyIcon, setShowCounterpartyIcon] = React.useState(!counterpartyLogoUrlFull);
  
  // Reset icon state when counterparty changes
  React.useEffect(() => {
    setShowCounterpartyIcon(!counterpartyLogoUrlFull);
  }, [counterpartyLogoUrlFull]);

  // Track image loading using universal hook
  // Main image: hasPhoto or icon3dPath (if exists)
  // Counterparty logo: only if exists and not showing fallback icon
  const mainImageUrl = hasPhoto || icon3dPath || null;
  const counterpartyLogoUrlForPreloader = (counterpartyLogoUrlFull && !showCounterpartyIcon) 
    ? counterpartyLogoUrlFull 
    : null;

  const { isReady: isCardReady, imageRefs, setImageRef, handleImageLoad, handleImageError } = useImagePreloader({
    imageUrls: [mainImageUrl, counterpartyLogoUrlForPreloader],
    cacheCheckDelay: 0,
  });

  const mainImageRef = imageRefs[0];
  const counterpartyLogoRef = imageRefs[1];
  const hasCalledOnReady = React.useRef(false);

  // Вызываем onReady один раз, когда карточка готова
  React.useEffect(() => {
    if (isCardReady && onReady && !hasCalledOnReady.current) {
      hasCalledOnReady.current = true;
      onReady();
    }
  }, [isCardReady, onReady]);

  // Сбрасываем флаг при изменении item
  React.useEffect(() => {
    hasCalledOnReady.current = false;
  }, [item.id]);

  const cardBg = isDeleted ? BACKGROUND_DT : MODAL_BG;
  const textColor = isDeleted ? PLACEHOLDER_COLOR_DARK : ACTIVE_TEXT_DARK;
  const badgeColor = isDeleted ? PLACEHOLDER_COLOR_DARK : undefined;

  return (
    <div
      className="relative rounded-lg overflow-hidden"
      style={{
        backgroundColor: cardBg,
        opacity: isCardReady ? 1 : 0,
        transition: "opacity 0.2s ease-in-out",
      }}
    >
      {/* Left stripe */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1"
        style={{ backgroundColor: stripeColor }}
      />

      <div className="pl-4 pr-4 pt-4 pb-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          {/* Icon */}
          <div className="w-[100px] h-[100px] flex items-center justify-center shrink-0">
            {hasPhoto ? (
              // 1. Priority: User uploaded image — тень по контуру скруглённого изображения
              <img
                ref={(el) => setImageRef(0, el)}
                src={hasPhoto}
                alt={item.name}
                className="w-[100px] h-[100px] rounded-lg object-cover"
                style={{ boxShadow: "0 34px 48.8px 0 rgba(0,0,0,0.25)" }}
                onLoad={() => handleImageLoad(0)}
                onError={() => handleImageError(0)}
              />
            ) : (
              // 2. Priority: 3D icon, fallback to 2D icon — тень по контуру иконки (drop-shadow)
              <>
                {icon3dPath && (
                  <img
                    ref={(el) => setImageRef(0, el)}
                    src={icon3dPath}
                    alt=""
                    className="w-[100px] h-[100px] object-contain"
                    style={{ filter: "drop-shadow(0 34px 48.8px rgba(0,0,0,0.25))" }}
                    onLoad={() => handleImageLoad(0)}
                    onError={() => {
                      // Try WebP if PNG failed, otherwise fallback to 2D icon
                      if (iconFormat === "png") {
                        setIconFormat("webp");
                      } else {
                        setIconFormat(null);
                        handleImageError(0); // 2D icon doesn't need loading, mark as "loaded"
                      }
                    }}
                  />
                )}
                {!icon3dPath && TypeIcon && (
                  // 3. Priority: 2D icon (doesn't need loading) — тень по контуру иконки
                  <div
                    className="w-full h-full flex items-center justify-center"
                    style={{ filter: "drop-shadow(0 34px 48.8px rgba(0,0,0,0.25))" }}
                  >
                    <TypeIcon
                      className="w-16 h-16"
                      style={{ color: ACCENT }}
                      strokeWidth={1.5}
                    />
                  </div>
                )}
              </>
            )}
          </div>

          {/* Info */}
          <div className="flex flex-col items-center justify-center flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap justify-center">
              <span
                className="text-sm font-normal"
                style={{ color: PLACEHOLDER_COLOR_DARK }}
              >
                {typeLabel}
              </span>
              {currencyCode && (
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase ${
                    getCurrencyBadgeClass(currencyCode)
                  }`}
                  style={badgeColor ? { color: badgeColor, backgroundColor: `${badgeColor}20` } : undefined}
                >
                  {currencyCode}
                </span>
              )}
            </div>
            <h3
              className="text-2xl font-medium mb-1 text-center"
              style={{ color: textColor }}
            >
              {item.name}
            </h3>
            {counterparty && CounterpartyFallbackIcon && (
              <div className="flex items-center gap-2 mb-1 justify-center">
                <div className="relative h-5 w-5 shrink-0">
                  {counterpartyLogoUrlFull && !showCounterpartyIcon ? (
                    <img
                      ref={(el) => setImageRef(1, el)}
                      src={counterpartyLogoUrlFull}
                      alt=""
                      className="h-5 w-5 rounded object-contain"
                      style={{ border: `1px solid ${PLACEHOLDER_COLOR_DARK}40` }}
                      onLoad={() => handleImageLoad(1)}
                      onError={() => {
                        setShowCounterpartyIcon(true);
                        handleImageError(1); // Fallback icon doesn't need loading, mark as "loaded"
                      }}
                    />
                  ) : (
                    <div
                      className="h-5 w-5 rounded flex items-center justify-center"
                      style={{
                        border: `1px solid ${PLACEHOLDER_COLOR_DARK}40`,
                        backgroundColor: `${PLACEHOLDER_COLOR_DARK}10`,
                      }}
                    >
                      <CounterpartyFallbackIcon
                        className="h-3.5 w-3.5"
                        style={{ color: PLACEHOLDER_COLOR_DARK }}
                        strokeWidth={1.5}
                      />
                    </div>
                  )}
                </div>
                <span
                  className="text-sm font-normal text-center"
                  style={{ color: PLACEHOLDER_COLOR_DARK }}
                >
                  {buildCounterpartyDisplayName(counterparty)}
                </span>
              </div>
            )}
          </div>

          {/* Menu */}
          <div className="shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton
                  aria-label="Открыть меню действий"
                >
                  <MoreVertical />
                </IconButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {onEdit && !isArchived && !isClosed && (
                  <DropdownMenuItem onClick={() => onEdit(item)}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Редактировать
                  </DropdownMenuItem>
                )}
                {onClose && !isArchived && !isClosed && (
                  <DropdownMenuItem onClick={() => onClose(item)}>
                    <Archive className="mr-2 h-4 w-4" />
                    Закрыть
                  </DropdownMenuItem>
                )}
                {onArchive && !isArchived && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => onArchive(item)}>
                      <Archive className="mr-2 h-4 w-4" />
                      Архивировать
                    </DropdownMenuItem>
                  </>
                )}
                {onDelete && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => onDelete(item)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Удалить
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Deposit details */}
        {item.type_code === "deposit" && (
          (item.deposit_term_days != null || item.deposit_end_date != null || item.interest_rate != null) && (
            <div className="flex items-center justify-center gap-4 mt-3">
              <div className="flex flex-col items-center gap-0.5 flex-1">
                {item.deposit_term_days != null && (
                  <div className="flex items-baseline gap-2 text-center">
                    <span className="text-sm font-normal" style={{ color: PLACEHOLDER_COLOR_DARK }}>
                      Срок:
                    </span>
                    <span className="text-[18px] font-normal" style={{ color: textColor }}>
                      {item.deposit_term_days}
                    </span>
                  </div>
                )}
                {item.deposit_end_date != null && (
                  <div className="flex items-baseline gap-2 text-center">
                    <span className="text-sm font-normal" style={{ color: PLACEHOLDER_COLOR_DARK }}>
                      Закроется:
                    </span>
                    <span className="text-[18px] font-normal" style={{ color: textColor }}>
                      {formatShortDate(item.deposit_end_date)}
                    </span>
                  </div>
                )}
              </div>
              {item.interest_rate != null && (
                <div className="flex flex-col items-center gap-0.5 text-center flex-1">
                  <span className="text-sm font-normal" style={{ color: PLACEHOLDER_COLOR_DARK }}>
                    Ставка
                  </span>
                  <span className="text-2xl font-medium" style={{ color: textColor }}>
                    {new Intl.NumberFormat("ru-RU", {
                      minimumFractionDigits: 1,
                      maximumFractionDigits: 1,
                    }).format(item.interest_rate)}%
                  </span>
                </div>
              )}
            </div>
          )
        )}

        {/* Savings account: ставка по центру */}
        {item.type_code === "savings_account" && item.interest_rate != null && (
          <div className="flex items-center justify-center mt-3">
            <div className="flex flex-col items-center gap-0.5 text-center">
              <span className="text-sm font-normal" style={{ color: PLACEHOLDER_COLOR_DARK }}>
                Ставка
              </span>
              <span className="text-2xl font-medium" style={{ color: textColor }}>
                {new Intl.NumberFormat("ru-RU", {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1,
                }).format(item.interest_rate)}%
              </span>
            </div>
          </div>
        )}

        {/* Кредитные обязательства: срок, дата окончания, ставка (как вклад); затем частота, тип, сумма */}
        {isCreditLiability &&
          (item.deposit_term_days != null ||
            ps?.loan_end_date != null ||
            item.interest_rate != null ||
            ps?.repayment_frequency != null ||
            ps?.repayment_type != null ||
            (ps?.payment_amount_rub != null && ps.payment_amount_rub > 0)) && (
          <div className="mt-3 space-y-3">
            {(item.deposit_term_days != null || ps?.loan_end_date != null || item.interest_rate != null) && (
              <div className="flex items-center justify-center gap-4">
                {item.deposit_term_days != null && (
                  <div className="flex flex-col items-center gap-0.5 flex-1 text-center">
                    <span className="text-sm font-normal" style={{ color: PLACEHOLDER_COLOR_DARK }}>
                      Срок
                    </span>
                    <span className="text-[18px] font-normal" style={{ color: textColor }}>
                      {item.deposit_term_days}
                    </span>
                  </div>
                )}
                {ps?.loan_end_date != null && (
                  <div className="flex flex-col items-center gap-0.5 flex-1 text-center">
                    <span className="text-sm font-normal" style={{ color: PLACEHOLDER_COLOR_DARK }}>
                      Дата окончания
                    </span>
                    <span className="text-[18px] font-normal" style={{ color: textColor }}>
                      {formatShortDate(ps.loan_end_date)}
                    </span>
                  </div>
                )}
                {item.interest_rate != null && (
                  <div className="flex flex-col items-center gap-0.5 flex-1 text-center">
                    <span className="text-sm font-normal" style={{ color: PLACEHOLDER_COLOR_DARK }}>
                      Ставка
                    </span>
                    <span className="text-2xl font-medium" style={{ color: textColor }}>
                      {new Intl.NumberFormat("ru-RU", {
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 1,
                      }).format(item.interest_rate)}%
                    </span>
                  </div>
                )}
              </div>
            )}
            {(ps?.repayment_frequency != null || ps?.repayment_type != null || (ps?.payment_amount_rub != null && ps.payment_amount_rub > 0)) && (
              <div className="flex items-center justify-center gap-4">
                {ps?.repayment_frequency != null && (
                  <div className="flex flex-col items-center gap-0.5 flex-1 text-center">
                    <span className="text-sm font-normal" style={{ color: PLACEHOLDER_COLOR_DARK }}>
                      Частота выплат
                    </span>
                    <span className="text-[18px] font-normal" style={{ color: textColor }}>
                      {REPAYMENT_FREQUENCY_LABELS[ps.repayment_frequency] ?? ps.repayment_frequency}
                    </span>
                  </div>
                )}
                {ps?.repayment_type != null && (
                  <div className="flex flex-col items-center gap-0.5 flex-1 text-center">
                    <span className="text-sm font-normal" style={{ color: PLACEHOLDER_COLOR_DARK }}>
                      Тип выплат
                    </span>
                    <span className="text-[18px] font-normal" style={{ color: textColor }}>
                      {REPAYMENT_TYPE_LABELS[ps.repayment_type] ?? ps.repayment_type}
                    </span>
                  </div>
                )}
                {ps?.payment_amount_rub != null && ps.payment_amount_rub > 0 && (
                  <div className="flex flex-col items-center gap-0.5 flex-1 text-center">
                    <span className="text-sm font-normal" style={{ color: PLACEHOLDER_COLOR_DARK }}>
                      Сумма платежа
                    </span>
                    <span className="text-[18px] font-normal" style={{ color: textColor }}>
                      {formatAmount(ps.payment_amount_rub)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Financial info: 2 строки — заголовки (общая высота = макс из трёх), затем суммы на одной линии */}
        <div className="grid grid-cols-3 gap-x-4 gap-y-1 mt-3 justify-items-center">
          {showBalanceAndRate ? (
            <>
              {/* Строка заголовков: высота ряда = макс из трёх, текст по центру по вертикали */}
              <div
                className="flex min-h-0 w-full flex-col items-center justify-center text-center"
                style={{ color: PLACEHOLDER_COLOR_DARK }}
              >
                <span className="text-sm font-normal">
                  {isMoexItem ? "Кол-во" : useCreditPrincipalLabel ? "Остаток основного долга" : useMarketValueLabel ? "Рыночная стоимость" : "Баланс"}
                </span>
              </div>
              <div
                className="flex min-h-0 w-full flex-col items-center justify-center text-center"
                style={{ color: PLACEHOLDER_COLOR_DARK }}
              >
                <span className="text-sm font-normal">
                  {isMoexItem ? "Цена" : "Курс"}
                </span>
              </div>
              <div
                className="flex min-h-0 w-full flex-col items-center justify-center text-center"
                style={{ color: PLACEHOLDER_COLOR_DARK }}
              >
                <span className="text-sm font-normal">
                  {useCreditPrincipalLabel ? "Остаток основного долга" : useMarketValueLabel ? "Рыночная стоимость" : "Баланс"}
                </span>
              </div>
              {/* Строка сумм: одна линия */}
              <div className="flex h-9 w-full items-center justify-center text-xl font-normal" style={{ color: textColor }}>
                {isMoexItem
                  ? item.position_lots != null
                    ? new Intl.NumberFormat("ru-RU").format(item.position_lots)
                    : "-"
                  : formatAmount(displayBalanceCents)}
              </div>
              <div className="flex h-9 w-full items-center justify-center text-xl font-normal" style={{ color: textColor }}>
                {isMoexItem
                  ? moexUnitPriceCents != null
                    ? formatAmount(moexUnitPriceCents)
                    : "-"
                  : rate
                  ? formatRate(rate)
                  : "-"}
              </div>
              <div
                className="flex h-9 w-full items-center justify-center text-2xl font-medium"
                style={{
                  background: isDeleted ? undefined : PINK_GRADIENT_CONST,
                  WebkitBackgroundClip: isDeleted ? undefined : "text",
                  WebkitTextFillColor: isDeleted ? PLACEHOLDER_COLOR_DARK : "transparent",
                  backgroundClip: isDeleted ? undefined : "text",
                }}
              >
                {rubEquivalent ? formatAmount(rubEquivalent) : "-"}
              </div>
            </>
          ) : (
            <>
              <div
                className="col-span-3 flex min-h-0 w-full flex-col items-center justify-center text-center"
                style={{ color: PLACEHOLDER_COLOR_DARK }}
              >
                <span className="text-sm font-normal">
                  {useCreditPrincipalLabel ? "Остаток основного долга" : useMarketValueLabel ? "Рыночная стоимость" : "Баланс"}
                </span>
              </div>
              <div
                className="col-span-3 flex h-9 w-full items-center justify-center text-2xl font-medium"
                style={{
                  background: isDeleted ? undefined : PINK_GRADIENT_CONST,
                  WebkitBackgroundClip: isDeleted ? undefined : "text",
                  WebkitTextFillColor: isDeleted ? PLACEHOLDER_COLOR_DARK : "transparent",
                  backgroundClip: isDeleted ? undefined : "text",
                }}
              >
                {formatAmount(displayBalanceCents)}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
