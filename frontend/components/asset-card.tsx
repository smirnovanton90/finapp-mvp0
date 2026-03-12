"use client";

import React from "react";
import type { CSSProperties } from "react";
import { MoreVertical, Pencil, Trash2, Archive, TrendingUp, AlertCircle } from "lucide-react";
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
  GREEN_TRANSACTION,
  RED,
  PLACEHOLDER_COLOR_DARK,
  ACTIVE_TEXT_DARK,
  ACCENT2,
  ACCENT,
} from "@/lib/colors";
import { PINK_GRADIENT as PINK_GRADIENT_CONST } from "@/lib/gradients";
import { User, Building2 } from "lucide-react";
import { assetIconPath } from "@/lib/image-paths";
import { TYPE_ICON_BY_CODE } from "@/lib/asset-icons";
import { useCounterpartyImage } from "@/hooks/use-counterparty-image";
import { CardIcon } from "@/components/card-icon";
import { CurrencyChip } from "@/components/currency-chip";
import { TableRow, TableCell } from "@/components/ui/table";
import { cn } from "@/lib/utils";

const MOEX_TYPE_CODES = ["securities", "bonds", "etf", "bpif", "pif"];
const isCryptoItem = (item: ItemOut) => item.type_code === "crypto";

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
  /** card — компактная карточка в сетке; row — на всю ширину, блоки по горизонтали; tableRow — одна строка таблицы (иконка, название, сумма) */
  layout?: "card" | "row" | "tableRow";
  accountingStartDate: string | null;
  rate?: number | null;
  rubEquivalent?: number | null;
  /** Подпись над значением в рублях (например «Балансовая стоимость», «Рыночная стоимость») */
  primaryValueLabel?: string | null;
  counterparty?: CounterpartyOut | null;
  moexMarketPrice?: MarketPriceOut | null;
  onEdit?: (item: ItemOut) => void;
  onDelete?: (item: ItemOut) => void;
  onArchive?: (item: ItemOut) => void;
  onClose?: (item: ItemOut) => void;
  /** Для рыночных активов (instrument_id): открыть модалку «Купить/продать актив» */
  onBuySell?: (item: ItemOut) => void;
  getItemDisplayBalanceCents: (item: ItemOut) => number;
  onReady?: () => void;
  /** При клике по карточке (не по меню) — переход на детальную страницу */
  onNavigate?: (item: ItemOut) => void;
  /** Показывать рублёвый эквивалент (по умолчанию true). На мобильной — false, только сальдо в валюте актива. */
  showRubEquivalent?: boolean;
}

// Simplified industry icon mapping (can be expanded if needed)
const COUNTERPARTY_LEGAL_FALLBACK_ICON = Building2;

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
  layout = "card",
  accountingStartDate,
  rate,
  rubEquivalent,
  primaryValueLabel,
  counterparty,
  moexMarketPrice,
  onEdit,
  onDelete,
  onArchive,
  onClose,
  onBuySell,
  getItemDisplayBalanceCents,
  onReady,
  onNavigate,
  showRubEquivalent = true,
}: AssetCardProps) {
  const isArchived = Boolean(item.archived_at);
  const isClosed = Boolean(item.closed_at);
  const isDeleted = isArchived;
  const kind = getEffectiveItemKind(item, item.current_value_rub);
  const isAsset = kind === "ASSET";
  const stripeColor = isAsset ? GREEN_TRANSACTION : RED;
  const typeLabel = getItemTypeLabel(item);
  const currencyCode = item.currency_code || "";
  const TypeIcon = TYPE_ICON_BY_CODE[item.type_code];
  const isMoexItem = MOEX_TYPE_CODES.includes(item.type_code);
  const useMarketValueLabel = MARKET_VALUE_TYPE_CODES.has(item.type_code);
  const isCreditLiability = CREDIT_LIABILITY_TYPE_CODES.has(item.type_code);
  const useCreditPrincipalLabel = isCreditLiability;
  const valueLabel =
    primaryValueLabel ??
    (useCreditPrincipalLabel ? "Остаток основного долга" : useMarketValueLabel ? "Рыночная стоимость" : "Баланс");

  const displayBalanceCents = getItemDisplayBalanceCents(item);
  const hasNegativeBalance = isAsset && displayBalanceCents < 0;
  const ps = item.plan_settings;
  const showBalanceAndRate =
    ((currencyCode && currencyCode !== "RUB") || isMoexItem) && !isDeleted;
  const isMarketOrCryptoCard = (isMoexItem || isCryptoItem(item)) && Boolean(item.instrument_id) && !isDeleted;
  const moexUnitPriceCents = isMoexItem
    ? getMoexUnitPriceCents(item, moexMarketPrice ?? null)
    : null;
  const cryptoUnitPriceCents =
    isCryptoItem(item) && (item.quantity_units ?? 0) > 0 && displayBalanceCents !== 0
      ? Math.round(displayBalanceCents / (item.quantity_units ?? 1))
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
  const [iconFormat, setIconFormat] = React.useState<"png" | null>("png");
  const icon3dPath = assetIconPath(item.type_code, iconFormat);
  const hasPhoto = getItemPhotoUrl(item, API_BASE);

  // Counterparty: дефолтные — только статика; добавленные — API → person/legal → Lucide
  const {
    currentSrc: counterpartyCurrentSrc,
    onError: counterpartyOnError,
    showFallbackIcon: showCounterpartyIcon,
  } = useCounterpartyImage(counterparty ?? null, API_BASE);
  const CounterpartyFallbackIcon = counterparty
    ? (counterparty.entity_type === "PERSON" ? User : COUNTERPARTY_LEGAL_FALLBACK_ICON)
    : null;

  const mainImageUrl = hasPhoto || icon3dPath || null;
  const counterpartyLogoUrlForPreloader =
    counterparty && counterpartyCurrentSrc && !showCounterpartyIcon
      ? counterpartyCurrentSrc
      : null;

  const { isReady: isCardReady, imageRefs, setImageRef, handleImageLoad, handleImageError } = useImagePreloader({
    imageUrls: [mainImageUrl, counterpartyLogoUrlForPreloader],
    cacheCheckDelay: 0,
  });

  const mainImageRef = imageRefs[0];
  const counterpartyLogoRef = imageRefs[1];
  const hasCalledOnReady = React.useRef(false);
  const menuJustClosedRef = React.useRef(false);

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

  const tableRowFallbackIcon = (counterparty && CounterpartyFallbackIcon) || TypeIcon || null;

  const menuDropdown = item.type_code !== "counterparty_settlements" && layout !== "tableRow" && (
    <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
      <DropdownMenu
        onOpenChange={(open) => {
          if (!open) {
            menuJustClosedRef.current = true;
            setTimeout(() => {
              menuJustClosedRef.current = false;
            }, 150);
          }
        }}
      >
        <DropdownMenuTrigger asChild>
          <div onClick={(e) => e.stopPropagation()}>
            <IconButton aria-label="Открыть меню действий">
              <MoreVertical />
            </IconButton>
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-56"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {onEdit && !isArchived && !isClosed && (
            <DropdownMenuItem onClick={() => onEdit(item)}>
              <Pencil className="mr-2 h-4 w-4" />
              Редактировать
            </DropdownMenuItem>
          )}
          {onBuySell && item.instrument_id && !isArchived && !isClosed && (
            <DropdownMenuItem onClick={() => onBuySell(item)}>
              <TrendingUp className="mr-2 h-4 w-4" />
              Купить/продать актив
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
  );

  if (layout === "tableRow") {
    return (
      <TableRow
        className={cn(
          "border-b border-border bg-transparent hover:bg-transparent [&:last-child]:border-b",
          onNavigate && "cursor-pointer"
        )}
        onClick={() => onNavigate?.(item)}
        role={onNavigate ? "button" : undefined}
      >
        <TableCell className="w-10 py-2 pl-2 pr-2 align-middle">
          <div className="flex h-8 w-8 items-center justify-center shrink-0">
            {hasPhoto ? (
              <CardIcon
                src={hasPhoto}
                alt={item.name}
                size={32}
                shadow={false}
                objectFit="cover"
                imgRef={(el) => setImageRef(0, el)}
                onLoad={() => handleImageLoad(0)}
                onError={() => handleImageError(0)}
              />
            ) : counterparty && counterpartyCurrentSrc && !showCounterpartyIcon ? (
              <CardIcon
                src={counterpartyCurrentSrc}
                alt=""
                fallbackIcon={CounterpartyFallbackIcon ?? undefined}
                size={32}
                shadow={false}
                objectFit="contain"
                fallbackIconColor={PLACEHOLDER_COLOR_DARK}
                imgRef={(el) => setImageRef(1, el)}
                onLoad={() => handleImageLoad(1)}
                onError={() => {
                  counterpartyOnError();
                  handleImageError(1);
                }}
              />
            ) : icon3dPath ? (
              <CardIcon
                src={icon3dPath}
                alt=""
                fallbackIcon={TypeIcon ?? undefined}
                size={32}
                shadow={false}
                objectFit="contain"
                fallbackIconColor={ACCENT}
                imgRef={(el) => setImageRef(0, el)}
                onLoad={() => handleImageLoad(0)}
                onError={() => {
                  setIconFormat(null);
                  handleImageError(0);
                }}
              />
            ) : tableRowFallbackIcon ? (
              <CardIcon
                src={null}
                alt=""
                fallbackIcon={tableRowFallbackIcon}
                size={32}
                shadow={false}
                fallbackIconColor={ACCENT}
              />
            ) : null}
          </div>
        </TableCell>
        <TableCell className="w-[55%] py-2 px-2 align-middle">
          <span
            className="text-sm font-normal block break-words whitespace-normal line-clamp-2"
            style={{ color: textColor }}
          >
            {item.name}
          </span>
        </TableCell>
        <TableCell className="min-w-[90px] py-2 pr-2 pl-2 align-middle text-right">
          <div className="flex flex-col items-end gap-0.5">
            {showRubEquivalent ? (
              <>
                <span className="inline-flex items-center gap-1">
                  <CurrencyChip code="RUB" className="text-xs" />
                  <span className="text-sm font-medium tabular-nums" style={{ color: isDeleted ? PLACEHOLDER_COLOR_DARK : ACTIVE_TEXT_DARK }}>
                    {rubEquivalent != null
                      ? isAsset
                        ? hasNegativeBalance
                          ? `-${formatAmount(Math.abs(rubEquivalent))}`
                          : formatAmount(rubEquivalent)
                        : `-${formatAmount(Math.abs(rubEquivalent))}`
                      : "-"}
                  </span>
                </span>
                {currencyCode && currencyCode !== "RUB" && (
                  <span className="inline-flex items-center gap-1 text-xs" style={{ color: PLACEHOLDER_COLOR_DARK }}>
                    <CurrencyChip code={currencyCode} className="text-[10px]" />
                    <span className="tabular-nums">
                      {isAsset
                        ? hasNegativeBalance
                          ? `-${formatAmount(Math.abs(displayBalanceCents))}`
                          : formatAmount(displayBalanceCents)
                        : `-${formatAmount(Math.abs(displayBalanceCents))}`}
                    </span>
                  </span>
                )}
              </>
            ) : (
              <span className="inline-flex items-center gap-1">
                <CurrencyChip code={currencyCode || "RUB"} className="text-xs" />
                <span className="text-sm font-medium tabular-nums" style={{ color: isDeleted ? PLACEHOLDER_COLOR_DARK : ACTIVE_TEXT_DARK }}>
                  {isAsset
                    ? hasNegativeBalance
                      ? `-${formatAmount(Math.abs(displayBalanceCents))}`
                      : formatAmount(displayBalanceCents)
                    : `-${formatAmount(Math.abs(displayBalanceCents))}`}
                </span>
              </span>
            )}
          </div>
        </TableCell>
      </TableRow>
    );
  }

  if (layout === "row") {
    return (
      <div
        className="relative rounded-lg overflow-hidden w-full"
        style={{
          backgroundColor: cardBg,
          opacity: isCardReady ? 1 : 0,
          transition: "opacity 0.2s ease-in-out",
        }}
      >
        <div
          className="absolute left-0 top-0 bottom-0 w-[7px] rounded-l-md"
          style={{ backgroundColor: stripeColor }}
        />
        <div
          className={`flex flex-row items-center gap-4 py-3 pr-3 pl-5 ${onNavigate ? "cursor-pointer" : ""}`}
          onClick={() => {
            if (menuJustClosedRef.current) return;
            onNavigate?.(item);
          }}
          role={onNavigate ? "button" : undefined}
        >
          <div className="w-14 h-14 flex items-center justify-center shrink-0">
            {hasPhoto ? (
              <CardIcon
                src={hasPhoto}
                alt={item.name}
                size={56}
                shadow
                objectFit="cover"
                imgRef={(el) => setImageRef(0, el)}
                onLoad={() => handleImageLoad(0)}
                onError={() => handleImageError(0)}
              />
            ) : icon3dPath ? (
              <CardIcon
                src={icon3dPath}
                alt=""
                fallbackIcon={TypeIcon ?? undefined}
                size={56}
                shadow
                objectFit="contain"
                fallbackIconColor={ACCENT}
                imgRef={(el) => setImageRef(0, el)}
                onLoad={() => handleImageLoad(0)}
                onError={() => {
                  setIconFormat(null);
                  handleImageError(0);
                }}
              />
            ) : TypeIcon ? (
              <CardIcon
                src={null}
                alt=""
                fallbackIcon={TypeIcon}
                size={56}
                shadow
                fallbackIconColor={ACCENT}
              />
            ) : null}
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-normal" style={{ color: PLACEHOLDER_COLOR_DARK }}>
                {typeLabel}
              </span>
              {currencyCode && (
                <CurrencyChip
                  code={currencyCode}
                  style={badgeColor ? { color: badgeColor, backgroundColor: `${badgeColor}20` } : undefined}
                />
              )}
            </div>
            <h3 className="text-2xl font-medium truncate" style={{ color: textColor }}>
              {item.name}
            </h3>
            {counterparty && CounterpartyFallbackIcon && (
              <div className="flex items-center gap-2">
                <div className="relative h-5 w-5 shrink-0 flex items-center justify-center">
                  <CardIcon
                    src={counterpartyCurrentSrc && !showCounterpartyIcon ? counterpartyCurrentSrc : null}
                    alt={buildCounterpartyDisplayName(counterparty)}
                    fallbackIcon={CounterpartyFallbackIcon}
                    size={20}
                    shadow={false}
                    objectFit="contain"
                    fallbackIconColor={PLACEHOLDER_COLOR_DARK}
                    imgRef={(el) => setImageRef(1, el)}
                    onLoad={() => handleImageLoad(1)}
                    onError={() => {
                      counterpartyOnError();
                      handleImageError(1);
                    }}
                  />
                </div>
                <span className="text-sm font-normal truncate" style={{ color: PLACEHOLDER_COLOR_DARK }}>
                  {buildCounterpartyDisplayName(counterparty)}
                </span>
              </div>
            )}
          </div>
          {/* Стоимость: при showRubEquivalent — рубли и под ними валюта актива; иначе только сальдо в валюте актива. */}
          <div className="flex flex-col items-end shrink-0 text-right min-w-0 gap-0.5">
            {showRubEquivalent ? (
              <>
                <div className="flex items-center justify-end gap-1.5 flex-wrap">
                  <CurrencyChip code="RUB" />
                  {hasNegativeBalance && !(currencyCode && currencyCode !== "RUB") && (
                    <AlertCircle className="h-5 w-5 shrink-0" style={{ color: RED }} aria-label="Отрицательное сальдо" />
                  )}
                  <span
                    className="text-2xl font-medium tabular-nums"
                    style={{
                      background: isDeleted ? undefined : PINK_GRADIENT_CONST,
                      WebkitBackgroundClip: isDeleted ? undefined : "text",
                      WebkitTextFillColor: isDeleted ? PLACEHOLDER_COLOR_DARK : "transparent",
                      backgroundClip: isDeleted ? undefined : "text",
                    }}
                  >
                    {rubEquivalent != null
                      ? isAsset
                        ? hasNegativeBalance
                          ? `-${formatAmount(Math.abs(rubEquivalent))}`
                          : formatAmount(rubEquivalent)
                        : `-${formatAmount(Math.abs(rubEquivalent))}`
                      : "-"}
                  </span>
                </div>
                {currencyCode && currencyCode !== "RUB" && (
                  <div className="flex items-center justify-end gap-1.5 flex-wrap">
                    <CurrencyChip
                      code={currencyCode}
                      className={badgeColor ? "" : undefined}
                      style={badgeColor ? { color: badgeColor, backgroundColor: `${badgeColor}20` } : undefined}
                    />
                    {hasNegativeBalance && (
                      <AlertCircle className="h-5 w-5 shrink-0" style={{ color: RED }} aria-label="Отрицательное сальдо" />
                    )}
                    <span
                      className="text-2xl font-medium tabular-nums"
                      style={{
                        background: isDeleted ? undefined : PINK_GRADIENT_CONST,
                        WebkitBackgroundClip: isDeleted ? undefined : "text",
                        WebkitTextFillColor: isDeleted ? PLACEHOLDER_COLOR_DARK : "transparent",
                        backgroundClip: isDeleted ? undefined : "text",
                      }}
                    >
                      {isAsset
                        ? hasNegativeBalance
                          ? `-${formatAmount(Math.abs(displayBalanceCents))}`
                          : formatAmount(displayBalanceCents)
                        : `-${formatAmount(Math.abs(displayBalanceCents))}`}
                    </span>
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center justify-end gap-1.5 flex-wrap">
                {hasNegativeBalance && (
                  <AlertCircle className="h-5 w-5 shrink-0" style={{ color: RED }} aria-label="Отрицательное сальдо" />
                )}
                <CurrencyChip
                  code={currencyCode || "RUB"}
                  className={badgeColor ? "" : undefined}
                  style={badgeColor ? { color: badgeColor, backgroundColor: `${badgeColor}20` } : undefined}
                />
                <span
                  className="text-2xl font-medium tabular-nums"
                  style={{
                    background: isDeleted ? undefined : PINK_GRADIENT_CONST,
                    WebkitBackgroundClip: isDeleted ? undefined : "text",
                    WebkitTextFillColor: isDeleted ? PLACEHOLDER_COLOR_DARK : "transparent",
                    backgroundClip: isDeleted ? undefined : "text",
                  }}
                >
                  {isAsset
                    ? hasNegativeBalance
                      ? `-${formatAmount(Math.abs(displayBalanceCents))}`
                      : formatAmount(displayBalanceCents)
                    : `-${formatAmount(Math.abs(displayBalanceCents))}`}
                </span>
              </div>
            )}
          </div>
          {menuDropdown}
        </div>
      </div>
    );
  }

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
        className="absolute left-0 top-0 bottom-0 w-[7px] rounded-l-md"
        style={{ backgroundColor: stripeColor }}
      />

      <div
        className={`pt-[12px] pr-[12px] pb-[12px] pl-[19px] ${onNavigate ? "cursor-pointer" : ""}`}
        onClick={() => {
          if (menuJustClosedRef.current) return;
          onNavigate?.(item);
        }}
        role={onNavigate ? "button" : undefined}
      >
        {/* Header: иконка + основная информация + кнопка меню */}
        <div className="flex items-start justify-between mb-3 gap-3">
          {/* Icon — единый CardIcon, без фона и обводки, с тенью: фото → 3D → 2D */}
          <div className="w-[100px] h-[100px] flex items-center justify-center shrink-0">
            {hasPhoto ? (
              <CardIcon
                src={hasPhoto}
                alt={item.name}
                size={100}
                shadow
                objectFit="cover"
                imgRef={(el) => setImageRef(0, el)}
                onLoad={() => handleImageLoad(0)}
                onError={() => handleImageError(0)}
              />
            ) : icon3dPath ? (
              <CardIcon
                src={icon3dPath}
                alt=""
                fallbackIcon={TypeIcon ?? undefined}
                size={100}
                shadow
                objectFit="contain"
                fallbackIconColor={ACCENT}
                imgRef={(el) => setImageRef(0, el)}
                onLoad={() => handleImageLoad(0)}
                onError={() => {
                  setIconFormat(null);
                  handleImageError(0);
                }}
              />
            ) : TypeIcon ? (
              <CardIcon
                src={null}
                alt=""
                fallbackIcon={TypeIcon}
                size={100}
                shadow
                fallbackIconColor={ACCENT}
              />
            ) : null}
          </div>

          {/* Info */}
          <div className="flex flex-col items-center justify-center flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap justify-center max-w-full break-words">
              <span
                className="text-sm font-normal"
                style={{ color: PLACEHOLDER_COLOR_DARK }}
              >
                {typeLabel}
              </span>
              {currencyCode && (
                <CurrencyChip
                  code={currencyCode}
                  style={badgeColor ? { color: badgeColor, backgroundColor: `${badgeColor}20` } : undefined}
                />
              )}
            </div>
            <h3
              className="text-2xl font-medium mb-1 text-center break-words max-w-full"
              style={{ color: textColor }}
            >
              {item.name}
            </h3>
            {counterparty && CounterpartyFallbackIcon && (
              <div className="flex items-center gap-2 mb-1 justify-center">
                <div className="relative h-5 w-5 shrink-0 flex items-center justify-center">
                  <CardIcon
                    src={counterpartyCurrentSrc && !showCounterpartyIcon ? counterpartyCurrentSrc : null}
                    alt={buildCounterpartyDisplayName(counterparty)}
                    fallbackIcon={CounterpartyFallbackIcon}
                    size={20}
                    shadow={false}
                    objectFit="contain"
                    fallbackIconColor={PLACEHOLDER_COLOR_DARK}
                    imgRef={(el) => setImageRef(1, el)}
                    onLoad={() => handleImageLoad(1)}
                    onError={() => {
                      counterpartyOnError();
                      handleImageError(1);
                    }}
                  />
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

          {menuDropdown}
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

        {/* Рыночные активы и крипта: количество и текущая цена в валюте актива */}
        {isMarketOrCryptoCard && (
          <div className="flex items-center justify-center gap-6 mt-3 flex-wrap">
            <div className="flex flex-col items-center gap-0.5 text-center">
              <span className="text-sm font-normal" style={{ color: PLACEHOLDER_COLOR_DARK }}>
                Количество
              </span>
              <span className="text-lg font-normal" style={{ color: textColor }}>
                {isMoexItem
                  ? item.position_lots != null
                    ? `${new Intl.NumberFormat("ru-RU").format(item.position_lots)} л.`
                    : "-"
                  : item.quantity_units != null
                    ? new Intl.NumberFormat("ru-RU", {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 8,
                      }).format(item.quantity_units)
                    : "-"}
              </span>
            </div>
            <div className="flex flex-col items-center gap-0.5 text-center">
              <span className="text-sm font-normal" style={{ color: PLACEHOLDER_COLOR_DARK }}>
                Цена за ед.
              </span>
              <div className="flex items-center gap-1.5">
                {isMoexItem ? (
                  moexUnitPriceCents != null ? (
                    <>
                      <CurrencyChip code={currencyCode || "RUB"} style={badgeColor ? { color: badgeColor, backgroundColor: `${badgeColor}20` } : undefined} />
                      <span className="text-lg font-normal" style={{ color: textColor }}>
                        {formatAmount(moexUnitPriceCents)}
                      </span>
                    </>
                  ) : (
                    <span className="text-lg font-normal" style={{ color: textColor }}>-</span>
                  )
                ) : cryptoUnitPriceCents != null ? (
                  <>
                    <CurrencyChip code={currencyCode || "USD"} style={badgeColor ? { color: badgeColor, backgroundColor: `${badgeColor}20` } : undefined} />
                    <span className="text-lg font-normal" style={{ color: textColor }}>
                      {formatAmount(cryptoUnitPriceCents)}
                    </span>
                  </>
                ) : (
                  <span className="text-lg font-normal" style={{ color: textColor }}>-</span>
                )}
              </div>
            </div>
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
                  {isMoexItem ? "Кол-во" : valueLabel}
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
                  {valueLabel}
                </span>
              </div>
              {/* Строка сумм: одна линия */}
              <div className="flex h-9 w-full items-center justify-center gap-1.5 text-xl font-normal" style={{ color: textColor }}>
                {hasNegativeBalance && <AlertCircle className="h-5 w-5 shrink-0" style={{ color: RED }} aria-label="Отрицательное сальдо" />}
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
              <div className="flex h-9 w-full items-center justify-center">
                <span
                  className="text-2xl font-medium"
                  style={{
                    background: isDeleted ? undefined : PINK_GRADIENT_CONST,
                    WebkitBackgroundClip: isDeleted ? undefined : "text",
                    WebkitTextFillColor: isDeleted ? PLACEHOLDER_COLOR_DARK : "transparent",
                    backgroundClip: isDeleted ? undefined : "text",
                  }}
                >
                  {rubEquivalent ? formatAmount(rubEquivalent) : "-"}
                </span>
              </div>
            </>
          ) : (
            <>
              <div
                className="col-span-3 flex min-h-0 w-full flex-col items-center justify-center text-center"
                style={{ color: PLACEHOLDER_COLOR_DARK }}
              >
                <span className="text-sm font-normal">
                  {valueLabel}
                </span>
              </div>
              <div className="col-span-3 flex h-9 w-full items-center justify-center gap-1.5">
                {hasNegativeBalance && <AlertCircle className="h-5 w-5 shrink-0" style={{ color: RED }} aria-label="Отрицательное сальдо" />}
                <span
                  className="text-2xl font-medium"
                  style={{
                    background: isDeleted ? undefined : PINK_GRADIENT_CONST,
                    WebkitBackgroundClip: isDeleted ? undefined : "text",
                    WebkitTextFillColor: isDeleted ? PLACEHOLDER_COLOR_DARK : "transparent",
                    backgroundClip: isDeleted ? undefined : "text",
                  }}
                >
                  {formatAmount(displayBalanceCents)}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
