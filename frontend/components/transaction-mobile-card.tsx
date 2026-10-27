"use client";

import type { CSSProperties, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Building2, Check, User, Wallet } from "lucide-react";
import { CounterpartyOut, ItemOut, TransactionOut } from "@/lib/api";
import {
  ACCENT,
  ACCENT2,
  ACCENT_FILL_LIGHT,
  ACCENT_FILL_MEDIUM,
  ACTIVE_TEXT_DARK,
  GREEN,
  MODAL_BG,
  RED,
} from "@/lib/colors";
import { SIDEBAR_SELECTED_GRADIENT } from "@/lib/gradients";
import { buildCounterpartyDisplayName } from "@/lib/counterparty-utils";
import { formatAmount } from "@/lib/item-utils";
import type { buildCategoryLookup } from "@/lib/categories";
import { useCounterpartyImage } from "@/hooks/use-counterparty-image";
import { useCategoryImage } from "@/hooks/use-category-icon";
import { AssetItemIcon } from "@/components/asset-item-icon";
import { CardIcon } from "@/components/card-icon";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const MUTED = "rgba(255,255,255,0.55)";
const CHIP_TEXT = "#191732";

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

function currencyLabel(code: string | null | undefined) {
  const value = (code || "RUB").toUpperCase();
  return value === "RUB" ? "RUR" : value;
}

export type TransactionMobileCardTx = TransactionOut & { isDeleted?: boolean };

function IconWell({
  size,
  children,
}: {
  size: 24 | 36;
  children: ReactNode;
}) {
  return (
    <span
      className="grid shrink-0 place-items-center overflow-hidden rounded-[4px]"
      style={{ width: size, height: size, backgroundColor: ACCENT_FILL_LIGHT }}
    >
      {children}
    </span>
  );
}

function CategoryMark({
  categoryId,
  categoryLookup,
  apiBase,
}: {
  categoryId: number | null;
  categoryLookup: ReturnType<typeof buildCategoryLookup>;
  apiBase: string;
}) {
  const {
    imageSrc,
    onError,
    showFallbackIcon,
    CategoryIcon,
    setCategoryIconFormat,
  } = useCategoryImage(categoryId, categoryLookup, apiBase);

  return (
    <IconWell size={24}>
      {imageSrc && !showFallbackIcon ? (
        <CardIcon
          src={imageSrc}
          alt=""
          size={24}
          shadow={false}
          objectFit="contain"
          fallbackIcon={CategoryIcon}
          fallbackIconColor="rgba(255,255,255,0.85)"
          onError={() => {
            onError();
            setCategoryIconFormat(null);
          }}
        />
      ) : (
        <CategoryIcon className="size-3.5" strokeWidth={1.5} style={{ color: "rgba(255,255,255,0.85)" }} />
      )}
    </IconWell>
  );
}

function AccountMark({
  item,
  counterparty,
  apiBase,
}: {
  item: ItemOut | null;
  counterparty: CounterpartyOut | null;
  apiBase: string;
}) {
  return (
    <IconWell size={24}>
      {item ? (
        <AssetItemIcon
          item={item}
          counterparty={counterparty}
          apiBase={apiBase}
          size={20}
          fallbackIconColor="rgba(255,255,255,0.85)"
          alt=""
        />
      ) : (
        <Wallet className="size-3.5" strokeWidth={1.5} style={{ color: MUTED }} />
      )}
    </IconWell>
  );
}

function CounterpartyMark({
  counterparty,
  apiBase,
}: {
  counterparty: CounterpartyOut;
  apiBase: string;
}) {
  const { currentSrc, onError, showFallbackIcon } = useCounterpartyImage(counterparty, apiBase);
  const Fallback = counterparty.entity_type === "PERSON" ? User : Building2;
  return (
    <IconWell size={24}>
      <CardIcon
        src={currentSrc && !showFallbackIcon ? currentSrc : null}
        alt=""
        size={24}
        shadow={false}
        objectFit="contain"
        fallbackIcon={Fallback}
        fallbackIconColor="rgba(255,255,255,0.85)"
        onError={onError}
      />
    </IconWell>
  );
}

function CurrencyChipBadge({
  code,
  tone,
}: {
  code: string;
  tone: "income" | "expense" | "transfer";
}) {
  const backgroundColor = tone === "income" ? GREEN : tone === "expense" ? RED : ACCENT;
  const color = tone === "transfer" ? ACTIVE_TEXT_DARK : CHIP_TEXT;
  return (
    <span
      className="inline-flex h-6 shrink-0 items-center justify-center rounded-[4px] px-2 text-xs font-normal leading-none"
      style={{ backgroundColor, color }}
    >
      {code}
    </span>
  );
}

function StatusMark({
  confirmed,
  disabled,
  onConfirm,
}: {
  confirmed: boolean;
  disabled: boolean;
  onConfirm: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={confirmed ? "Подтверждена" : "Подтвердить"}
      disabled={disabled || confirmed}
      onClick={(event) => {
        event.stopPropagation();
        if (!disabled && !confirmed) onConfirm();
      }}
      className="grid size-4 shrink-0 place-items-center rounded-[4px] disabled:opacity-100"
      style={{ backgroundColor: confirmed ? GREEN : "transparent", boxShadow: confirmed ? undefined : "inset 0 0 0 1px rgba(255,255,255,0.35)" }}
    >
      <Check className="size-3" strokeWidth={3} style={{ color: confirmed ? "#fff" : MUTED }} />
    </button>
  );
}

function CommentChip({ text }: { text: string }) {
  return (
    <div
      className="flex w-full min-w-0 items-center rounded-[10px] px-3 py-2 text-sm font-normal leading-4 text-white"
      style={{ backgroundColor: MODAL_BG }}
    >
      <span className="min-w-0 break-words">💬 {text}</span>
    </div>
  );
}

function AmountWithChip({
  text,
  color,
  currency,
  tone,
}: {
  text: string;
  color: string;
  currency: string;
  tone: "income" | "expense" | "transfer";
}) {
  return (
    <div className="flex items-center gap-3">
      <p className="text-[28px] font-semibold leading-8 tracking-[-0.6px] tabular-nums" style={{ color }}>
        {text}
      </p>
      <CurrencyChipBadge code={currency} tone={tone} />
    </div>
  );
}

export function TransactionMobileCard({
  tx,
  counterparty,
  itemName,
  categoryLookup,
  getCategoryLines,
  itemsById,
  getItemCounterparty,
  apiBase,
  onRealize,
  onConfirm,
  isConfirming,
  getRubEquivalentCents,
}: {
  tx: TransactionMobileCardTx;
  counterparty: CounterpartyOut | null;
  itemName: (id: number | null | undefined) => string;
  categoryLookup: ReturnType<typeof buildCategoryLookup>;
  getCategoryLines: (categoryId: number | null) => [string, string, string];
  itemsById: Map<number, ItemOut>;
  getItemCounterparty: (itemId: number | null | undefined) => CounterpartyOut | null;
  apiBase: string;
  onRealize?: (tx: TransactionMobileCardTx, trigger?: HTMLElement | null) => void;
  onConfirm?: (tx: TransactionMobileCardTx) => void;
  isConfirming?: boolean;
  getRubEquivalentCents?: (tx: TransactionMobileCardTx, currencyCode: string) => number | null;
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
  const isPlanned = tx.transaction_type === "PLANNED" && tx.status !== "REALIZED";
  const isConfirmed = tx.status === "CONFIRMED" || tx.status === "REALIZED";
  const canRealize = isPlanned && !tx.isDeleted;
  const accountName = itemName(primaryDisplayId) || "Счёт не указан";
  const destinationName = itemName(counterpartyDisplayId) || "Счёт не указан";
  const counterpartyName = counterparty ? buildCounterpartyDisplayName(counterparty) : "";
  const commentText = tx.comment?.trim() || "";
  const timeLabel = formatTxTime(tx.transaction_date);
  const primaryCode = (primaryItem?.currency_code || "RUB").toUpperCase();
  const destinationCode = (counterpartyItem?.currency_code || primaryCode).toUpperCase();
  const primaryCurrency = currencyLabel(primaryCode);
  const destinationCurrency = currencyLabel(destinationCode);
  const tone = isTransfer ? "transfer" : isIncome ? "income" : "expense";
  const amountColor = tx.isDeleted ? "rgba(255,255,255,0.35)" : isTransfer ? ACTIVE_TEXT_DARK : isIncome ? GREEN : RED;
  const signedAmount = `${isIncome ? "+" : "-"}${formatAmount(Math.abs(tx.amount))}`;
  const destinationAmount = `+${formatAmount(Math.abs(tx.amount_counterparty ?? tx.amount))}`;
  const title = isTransfer ? "Перевод" : categoryLabel;
  const rubCents =
    !isTransfer && primaryCode !== "RUB" ? getRubEquivalentCents?.(tx, primaryCode) ?? null : null;
  const rubLine =
    rubCents == null ? "" : `${isIncome ? "+" : "-"}${formatAmount(Math.abs(rubCents))} RUB`;

  const openDetails = () => {
    if (tx.isDeleted) return;
    router.push(`/transactions/${tx.id}`);
  };

  const confirm = () => {
    if (tx.isDeleted || isConfirmed || isConfirming) return;
    onConfirm?.(tx);
  };

  return (
    <article
      role={tx.isDeleted ? undefined : "link"}
      tabIndex={tx.isDeleted ? undefined : 0}
      onClick={openDetails}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openDetails();
        }
      }}
      className={`flex w-full cursor-pointer flex-col overflow-hidden rounded-[10px] text-left ${
        tx.isDeleted ? "opacity-60" : "active:opacity-90"
      } ${isPlanned ? "border-2 border-dashed" : ""}`}
      style={isPlanned ? { borderColor: ACCENT2 } : undefined}
    >
      <div className="flex items-center gap-3 px-6 py-3" style={{ backgroundColor: MODAL_BG }}>
        {isTransfer ? (
          <IconWell size={24}>
            <span className="size-3.5" />
          </IconWell>
        ) : (
          <CategoryMark categoryId={tx.category_id} categoryLookup={categoryLookup} apiBase={apiBase} />
        )}
        <p className="min-w-0 flex-1 truncate text-base font-semibold leading-[14px]" style={{ color: ACTIVE_TEXT_DARK }}>
          {title}
        </p>
        <StatusMark
          confirmed={isConfirmed}
          disabled={!!tx.isDeleted || !!isConfirming}
          onConfirm={confirm}
        />
        {timeLabel ? (
          <p className="shrink-0 text-sm font-normal leading-4" style={{ color: MUTED }}>
            {timeLabel}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 px-6 py-3" style={{ backgroundColor: ACCENT_FILL_MEDIUM }}>
        {isTransfer ? (
          <div className="flex items-center gap-3">
            <div className="flex min-w-0 flex-1 flex-col justify-center rounded-[10px] px-3 py-3" style={{ backgroundColor: MODAL_BG }}>
              <div className="flex items-center gap-3">
                <AccountMark item={primaryItem} counterparty={primaryCounterparty} apiBase={apiBase} />
                <p className="min-w-0 flex-1 text-sm font-normal leading-4" style={{ color: ACTIVE_TEXT_DARK }}>
                  {accountName}
                </p>
              </div>
              <AmountWithChip text={signedAmount} color={amountColor} currency={primaryCurrency} tone="transfer" />
            </div>
            <span className="shrink-0 text-[32px] font-semibold leading-none text-white">→</span>
            <div className="flex min-w-0 flex-1 flex-col justify-center rounded-[10px] px-3 py-3" style={{ backgroundColor: MODAL_BG }}>
              <div className="flex items-center gap-3">
                <AccountMark item={counterpartyItem} counterparty={counterpartyItemCounterparty} apiBase={apiBase} />
                <p className="min-w-0 flex-1 text-sm font-normal leading-4" style={{ color: ACTIVE_TEXT_DARK }}>
                  {destinationName}
                </p>
              </div>
              <AmountWithChip text={destinationAmount} color={amountColor} currency={destinationCurrency} tone="transfer" />
            </div>
          </div>
        ) : (
          <div className="flex items-stretch gap-3">
            <div className="flex shrink-0 flex-col justify-center rounded-[10px] px-6 py-3" style={{ backgroundColor: MODAL_BG }}>
              <AmountWithChip text={signedAmount} color={amountColor} currency={primaryCurrency} tone={tone} />
              {rubLine ? (
                <p className="text-sm font-normal leading-4" style={{ color: MUTED }}>
                  {rubLine}
                </p>
              ) : null}
            </div>
            <div className="flex min-w-0 flex-1 flex-col justify-center gap-3">
              <div className="flex items-center gap-3">
                <AccountMark item={primaryItem} counterparty={primaryCounterparty} apiBase={apiBase} />
                <p className="min-w-0 flex-1 text-sm font-normal leading-4" style={{ color: ACTIVE_TEXT_DARK }}>
                  {accountName}
                </p>
              </div>
              {counterparty && counterpartyName ? (
                <div className="flex items-center gap-3">
                  <CounterpartyMark counterparty={counterparty} apiBase={apiBase} />
                  <p className="min-w-0 flex-1 text-sm font-normal leading-4 text-white">
                    {counterpartyName}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        )}
        {commentText ? <CommentChip text={commentText} /> : null}
        {canRealize ? (
          <Button
            type="button"
            variant="authPrimary"
            className="h-12 w-full rounded-[10px] text-base font-medium"
            style={
              {
                "--auth-primary-bg": SIDEBAR_SELECTED_GRADIENT,
                "--auth-primary-bg-hover":
                  "linear-gradient(315deg, #9487F3 0%, #6C5DD7 43%, #483BA6 100%)",
              } as CSSProperties
            }
            onClick={(event) => {
              event.stopPropagation();
              onRealize?.(tx, event.currentTarget);
            }}
          >
            Реализовать
          </Button>
        ) : null}
      </div>
    </article>
  );
}

/** Плейсхолдер карточки: шапка, сумма с валютой, счёт и контрагент. */
export function TransactionMobileCardSkeleton() {
  return (
    <div className="flex w-full flex-col overflow-hidden rounded-[10px]" aria-hidden>
      <div className="flex items-center gap-3 px-6 py-3" style={{ backgroundColor: MODAL_BG }}>
        <Skeleton className="size-6 shrink-0 rounded-[4px]" />
        <Skeleton className="h-3.5 min-w-0 flex-1 rounded-[4px]" />
        <Skeleton className="size-4 shrink-0 rounded-[4px]" />
        <Skeleton className="h-3.5 w-10 shrink-0 rounded-[4px]" />
      </div>
      <div className="flex flex-col gap-3 px-6 py-3" style={{ backgroundColor: ACCENT_FILL_MEDIUM }}>
        <div className="flex items-stretch gap-3">
          <div
            className="flex shrink-0 flex-col justify-center rounded-[10px] px-6 py-3"
            style={{ backgroundColor: MODAL_BG }}
          >
            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-32 rounded-[4px]" />
              <Skeleton className="h-6 w-12 rounded-[4px]" />
            </div>
          </div>
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-3">
            <div className="flex items-center gap-3">
              <Skeleton className="size-6 shrink-0 rounded-[4px]" />
              <Skeleton className="h-3.5 flex-1 rounded-[4px]" />
            </div>
            <div className="flex items-center gap-3">
              <Skeleton className="size-6 shrink-0 rounded-[4px]" />
              <Skeleton className="h-3.5 w-2/3 rounded-[4px]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
