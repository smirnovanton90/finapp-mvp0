"use client";

import { useRouter } from "next/navigation";
import { ArrowDown, ArrowLeftRight, Building2, User, Wallet } from "lucide-react";
import { CounterpartyOut, ItemOut, TransactionOut } from "@/lib/api";
import { ACCENT2, ACTIVE_TEXT_DARK, GREEN, PLACEHOLDER_COLOR_DARK, RED } from "@/lib/colors";
import { buildCounterpartyDisplayName } from "@/lib/counterparty-utils";
import { formatAmount } from "@/lib/item-utils";
import { transferIconPath } from "@/lib/image-paths";
import type { buildCategoryLookup } from "@/lib/categories";
import { useCounterpartyImage } from "@/hooks/use-counterparty-image";
import { useCategoryImage } from "@/hooks/use-category-icon";
import { AssetItemIcon } from "@/components/asset-item-icon";
import { CardIcon } from "@/components/card-icon";
import { CurrencyChip } from "@/components/currency-chip";

function formatTxTime(value: string) {
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

export type TransactionMobileCardTx = TransactionOut & { isDeleted?: boolean };

export function TransactionMobileCard({
  tx,
  counterparty,
  itemName,
  categoryLookup,
  getCategoryLines,
  itemsById,
  getItemCounterparty,
  apiBase,
}: {
  tx: TransactionMobileCardTx;
  counterparty: CounterpartyOut | null;
  itemName: (id: number | null | undefined) => string;
  categoryLookup: ReturnType<typeof buildCategoryLookup>;
  getCategoryLines: (categoryId: number | null) => [string, string, string];
  itemsById: Map<number, ItemOut>;
  getItemCounterparty: (itemId: number | null | undefined) => CounterpartyOut | null;
  apiBase: string;
}) {
  const router = useRouter();
  const primaryDisplayId = tx.primary_card_item_id ?? tx.primary_item_id;
  const counterpartyDisplayId = tx.counterparty_card_item_id ?? tx.counterparty_item_id;
  const primaryItem = primaryDisplayId != null ? itemsById.get(primaryDisplayId) ?? null : null;
  const counterpartyItem = counterpartyDisplayId != null ? itemsById.get(counterpartyDisplayId) ?? null : null;
  const primaryCounterparty = getItemCounterparty(primaryDisplayId);
  const counterpartyItemCounterparty = getItemCounterparty(counterpartyDisplayId);
  const [l1, l2, l3] = getCategoryLines(tx.category_id);
  const categoryLabel =
    [l3, l2, l1].find((value) => value?.trim() && value !== "-") ??
    (tx.direction === "TRANSFER" ? "Перевод" : "Без категории");
  const isIncome = tx.direction === "INCOME";
  const isTransfer = tx.direction === "TRANSFER";
  const amountColor = tx.isDeleted ? PLACEHOLDER_COLOR_DARK : isIncome ? GREEN : isTransfer ? ACCENT2 : RED;
  const amountPrefix = isTransfer ? "" : isIncome ? "+" : "−";
  const merchant = isTransfer
    ? `${itemName(primaryDisplayId) || "Счёт"} → ${itemName(counterpartyDisplayId) || "Счёт"}`
    : counterparty
      ? buildCounterpartyDisplayName(counterparty)
      : categoryLabel;
  const accountName = itemName(primaryDisplayId) || "Счёт не указан";
  const timeLabel = formatTxTime(tx.transaction_date);
  const {
    currentSrc: counterpartyLogoUrl,
    onError: counterpartyLogoOnError,
    showFallbackIcon: counterpartyShowFallbackIcon,
  } = useCounterpartyImage(counterparty, apiBase);
  const {
    imageSrc: categoryImageSrc,
    onError: categoryImageOnError,
    showFallbackIcon: categoryShowFallbackIcon,
    CategoryIcon,
    setCategoryIconFormat,
  } = useCategoryImage(tx.category_id, categoryLookup, apiBase);
  const CounterpartyFallbackIcon = isTransfer
    ? ArrowLeftRight
    : counterparty?.entity_type === "PERSON"
      ? User
      : Building2;

  return (
    <button
      type="button"
      className="w-full px-4 py-2 text-left transition-opacity active:opacity-70"
      onClick={() => !tx.isDeleted && router.push(`/transactions/${tx.id}`)}
      disabled={tx.isDeleted}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden">
          {isTransfer ? (
            <CardIcon
              src={transferIconPath("png")}
              alt=""
              size={56}
              shadow
              fallbackIcon={ArrowDown}
              fallbackIconColor={ACCENT2}
            />
          ) : counterpartyLogoUrl && !counterpartyShowFallbackIcon ? (
            <CardIcon
              src={counterpartyLogoUrl}
              alt=""
              size={56}
              shadow={false}
              objectFit="contain"
              fallbackIcon={CounterpartyFallbackIcon}
              fallbackIconColor={ACCENT2}
              onError={counterpartyLogoOnError}
            />
          ) : (
            <CounterpartyFallbackIcon
              className="h-10 w-10"
              strokeWidth={1.5}
              style={{ color: tx.isDeleted ? PLACEHOLDER_COLOR_DARK : ACCENT2 }}
            />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          {isTransfer ? (
            <div
              className="flex flex-col gap-1.5 text-sm"
              style={{ color: tx.isDeleted ? PLACEHOLDER_COLOR_DARK : ACTIVE_TEXT_DARK }}
            >
              <span className="flex min-w-0 items-center gap-1.5">
                {primaryItem ? (
                  <AssetItemIcon
                    item={primaryItem}
                    counterparty={primaryCounterparty}
                    apiBase={apiBase}
                    size={14}
                    fallbackIconColor={PLACEHOLDER_COLOR_DARK}
                    alt=""
                  />
                ) : (
                  <Wallet className="h-3.5 w-3.5" strokeWidth={1.5} />
                )}
                <span className="truncate">{accountName}</span>
              </span>
              <ArrowDown className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} style={{ color: ACCENT2 }} />
              <span className="flex min-w-0 items-center gap-1.5">
                {counterpartyItem ? (
                  <AssetItemIcon
                    item={counterpartyItem}
                    counterparty={counterpartyItemCounterparty}
                    apiBase={apiBase}
                    size={14}
                    fallbackIconColor={PLACEHOLDER_COLOR_DARK}
                    alt=""
                  />
                ) : (
                  <Wallet className="h-3.5 w-3.5" strokeWidth={1.5} />
                )}
                <span className="truncate">{itemName(counterpartyDisplayId) || "Счёт не указан"}</span>
              </span>
            </div>
          ) : (
            <>
              <div
                className="truncate text-base font-medium"
                style={{ color: tx.isDeleted ? PLACEHOLDER_COLOR_DARK : ACTIVE_TEXT_DARK }}
              >
                {merchant}
              </div>
              <div className="flex min-w-0 items-center gap-1.5 text-sm" style={{ color: PLACEHOLDER_COLOR_DARK }}>
                {categoryImageSrc && !categoryShowFallbackIcon ? (
                  <CardIcon
                    src={categoryImageSrc}
                    alt=""
                    size={14}
                    shadow={false}
                    fallbackIcon={CategoryIcon}
                    fallbackIconColor={PLACEHOLDER_COLOR_DARK}
                    onError={() => {
                      categoryImageOnError();
                      setCategoryIconFormat(null);
                    }}
                  />
                ) : (
                  <CategoryIcon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                )}
                <span className="truncate">{categoryLabel}</span>
              </div>
              <div className="flex min-w-0 items-center gap-1.5 text-xs" style={{ color: PLACEHOLDER_COLOR_DARK }}>
                {primaryItem ? (
                  <AssetItemIcon
                    item={primaryItem}
                    counterparty={primaryCounterparty}
                    apiBase={apiBase}
                    size={14}
                    fallbackIconColor={PLACEHOLDER_COLOR_DARK}
                    alt=""
                  />
                ) : (
                  <Wallet className="h-3.5 w-3.5" strokeWidth={1.5} />
                )}
                <span className="truncate">{accountName}</span>
              </div>
            </>
          )}
        </div>
        <div className="relative h-16 shrink-0 self-stretch min-w-[92px]">
          <span
            className="absolute right-0 top-0 flex items-center gap-1.5 text-xs"
            style={{ color: PLACEHOLDER_COLOR_DARK }}
          >
            <CurrencyChip code={primaryItem?.currency_code ?? "RUB"} className="text-[10px]" />
            {timeLabel || "—"}
          </span>
          <span
            className="absolute right-0 top-1/2 -translate-y-1/2 text-xl font-semibold tabular-nums"
            style={{ color: amountColor }}
          >
            {amountPrefix}
            {formatAmount(tx.amount)}
          </span>
        </div>
      </div>
    </button>
  );
}
