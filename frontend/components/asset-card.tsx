"use client";

import React from "react";
import { MoreVertical, Pencil, Trash2, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ItemOut, CounterpartyOut, API_BASE } from "@/lib/api";
import { getEffectiveItemKind, formatAmount } from "@/lib/item-utils";
import { getItemTypeLabel } from "@/lib/item-types";
import { buildCounterpartyDisplayName } from "@/lib/counterparty-utils";
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

interface AssetCardProps {
  item: ItemOut;
  accountingStartDate: string | null;
  rate?: number | null;
  rubEquivalent?: number | null;
  counterparty?: CounterpartyOut | null;
  onEdit?: (item: ItemOut) => void;
  onDelete?: (item: ItemOut) => void;
  onArchive?: (item: ItemOut) => void;
  onClose?: (item: ItemOut) => void;
  getItemDisplayBalanceCents: (item: ItemOut) => number;
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

export function AssetCard({
  item,
  accountingStartDate,
  rate,
  rubEquivalent,
  counterparty,
  onEdit,
  onDelete,
  onArchive,
  onClose,
  getItemDisplayBalanceCents,
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
  
  const displayBalanceCents = getItemDisplayBalanceCents(item);
  const showBalanceAndRate = currencyCode && currencyCode !== "RUB" && !isDeleted;
  
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
  const hasPhoto = item.photo_url 
    ? (item.photo_url.startsWith("http") 
        ? item.photo_url 
        : `${API_BASE}${item.photo_url.startsWith("/") ? item.photo_url : `/${item.photo_url}`}`)
    : null;

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

  const cardBg = isDeleted ? BACKGROUND_DT : MODAL_BG;
  const textColor = isDeleted ? PLACEHOLDER_COLOR_DARK : ACTIVE_TEXT_DARK;
  const badgeColor = isDeleted ? PLACEHOLDER_COLOR_DARK : undefined;

  return (
    <div
      className="relative rounded-lg overflow-hidden"
      style={{
        backgroundColor: cardBg,
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
              // 1. Priority: User uploaded image
              <img
                src={hasPhoto}
                alt={item.name}
                className="w-[100px] h-[100px] rounded-lg object-cover"
              />
            ) : (
              // 2. Priority: 3D icon, fallback to 2D icon
              <>
                {icon3dPath && (
                  <img
                    src={icon3dPath}
                    alt=""
                    className="w-[100px] h-[100px] object-contain"
                    onError={() => {
                      // Try WebP if PNG failed, otherwise fallback to 2D icon
                      if (iconFormat === "png") {
                        setIconFormat("webp");
                      } else {
                        setIconFormat(null);
                      }
                    }}
                  />
                )}
                {!icon3dPath && TypeIcon && (
                  // 3. Priority: 2D icon
                  <div className="w-full h-full flex items-center justify-center">
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
                      src={counterpartyLogoUrlFull}
                      alt=""
                      className="h-5 w-5 rounded object-contain"
                      style={{ border: `1px solid ${PLACEHOLDER_COLOR_DARK}40` }}
                      onError={() => setShowCounterpartyIcon(true)}
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
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0 hover:bg-transparent"
                  style={{ color: textColor }}
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
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
              <div className="flex flex-col items-center gap-1 flex-1">
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
                <div className="flex flex-col items-center gap-1 text-center flex-1">
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

        {/* Financial info */}
        <div className="grid grid-cols-3 gap-4 mt-3 justify-items-center">
          {showBalanceAndRate ? (
            <>
              <div className="text-center">
                <div className="text-sm font-normal mb-1" style={{ color: PLACEHOLDER_COLOR_DARK }}>
                  Баланс
                </div>
                <div className="text-lg font-normal" style={{ color: textColor }}>
                  {formatAmount(displayBalanceCents)}
                </div>
              </div>
              <div className="text-center">
                <div className="text-sm font-normal mb-1" style={{ color: PLACEHOLDER_COLOR_DARK }}>
                  Курс
                </div>
                <div className="text-lg font-normal" style={{ color: textColor }}>
                  {rate ? formatRate(rate) : "-"}
                </div>
              </div>
              <div className="text-center">
                <div className="text-sm font-normal mb-1" style={{ color: PLACEHOLDER_COLOR_DARK }}>
                  Баланс
                </div>
                <div
                  className="text-2xl font-medium"
                  style={{
                    background: isDeleted ? undefined : PINK_GRADIENT_CONST,
                    WebkitBackgroundClip: isDeleted ? undefined : "text",
                    WebkitTextFillColor: isDeleted ? PLACEHOLDER_COLOR_DARK : "transparent",
                    backgroundClip: isDeleted ? undefined : "text",
                  }}
                >
                  {rubEquivalent ? formatAmount(rubEquivalent) : "-"}
                </div>
              </div>
            </>
          ) : (
            <div className="col-span-3 text-center">
              <div className="text-sm font-normal mb-1" style={{ color: PLACEHOLDER_COLOR_DARK }}>
                Баланс
              </div>
              <div
                className="text-2xl font-medium"
                style={{
                  background: isDeleted ? undefined : PINK_GRADIENT_CONST,
                  WebkitBackgroundClip: isDeleted ? undefined : "text",
                  WebkitTextFillColor: isDeleted ? PLACEHOLDER_COLOR_DARK : "transparent",
                  backgroundClip: isDeleted ? undefined : "text",
                }}
              >
                {formatAmount(displayBalanceCents)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
