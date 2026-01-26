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
import { ItemOut } from "@/lib/api";
import { getEffectiveItemKind } from "@/lib/item-utils";
import { getItemTypeLabel } from "@/lib/item-types";
import {
  MODAL_BG,
  BACKGROUND_DT,
  GREEN,
  RED,
  PLACEHOLDER_COLOR_DARK,
  ACTIVE_TEXT_DARK,
  PINK_GRADIENT,
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
  onEdit?: (item: ItemOut) => void;
  onDelete?: (item: ItemOut) => void;
  onArchive?: (item: ItemOut) => void;
  onClose?: (item: ItemOut) => void;
  getItemDisplayBalanceCents: (item: ItemOut) => number;
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

function formatAmount(valueInCents: number) {
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valueInCents / 100);
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

  // Try to load 3D icon, fallback to 2D icon
  const icon3dPath = `/icons-3d/${item.type_code}.png`;
  const hasPhoto = false; // TODO: implement photo upload when backend supports it
  const [show3dIcon, setShow3dIcon] = React.useState(true);

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
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            {/* Icon */}
            <div className="w-16 h-16 flex items-center justify-center shrink-0 relative">
              {hasPhoto ? (
                <img
                  src={hasPhoto}
                  alt={item.name}
                  className="w-16 h-16 rounded-lg object-cover"
                />
              ) : (
                <>
                  {show3dIcon && (
                    <img
                      src={icon3dPath}
                      alt=""
                      className="w-16 h-16 object-contain"
                      onError={() => setShow3dIcon(false)}
                    />
                  )}
                  {!show3dIcon && TypeIcon && (
                    <TypeIcon
                      className="w-12 h-12"
                      style={{ color: isDeleted ? PLACEHOLDER_COLOR_DARK : undefined }}
                      strokeWidth={1.5}
                    />
                  )}
                </>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span
                  className="text-sm"
                  style={{ color: textColor }}
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
                className="text-lg font-bold mb-1"
                style={{ color: textColor }}
              >
                {item.name}
              </h3>
              <div className="flex items-center gap-2 flex-wrap">
                {openDateLabel && (
                  <span
                    className="text-sm"
                    style={{ color: textColor }}
                  >
                    с {openDateLabel}
                  </span>
                )}
                {historyStatus && (
                  <span
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
                    style={{
                      backgroundColor: isDeleted
                        ? `${PLACEHOLDER_COLOR_DARK}20`
                        : historyStatus === "NEW"
                        ? "rgba(52, 211, 153, 0.2)"
                        : "rgba(93, 95, 215, 0.2)",
                      color: badgeColor || (historyStatus === "NEW" ? GREEN : undefined),
                    }}
                  >
                    {historyStatus === "NEW" ? "Новый" : "Исторический"}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Menu */}
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

        {/* Financial info */}
        <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t" style={{ borderColor: `${textColor}20` }}>
          {showBalanceAndRate ? (
            <>
              <div>
                <div className="text-xs mb-1" style={{ color: textColor }}>
                  Баланс
                </div>
                <div className="text-base font-semibold" style={{ color: textColor }}>
                  {formatAmount(displayBalanceCents)}
                </div>
              </div>
              <div>
                <div className="text-xs mb-1" style={{ color: textColor }}>
                  Курс
                </div>
                <div className="text-base font-semibold" style={{ color: textColor }}>
                  {rate ? formatRate(rate) : "-"}
                </div>
              </div>
              <div>
                <div className="text-xs mb-1" style={{ color: textColor }}>
                  Баланс
                </div>
                <div
                  className="text-lg font-bold"
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
            <div className="col-span-3">
              <div className="text-xs mb-1" style={{ color: textColor }}>
                Баланс
              </div>
              <div
                className="text-lg font-bold"
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
