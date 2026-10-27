"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Building2, Check, Pencil, Plus, Trash2, Undo2, User, Wallet, type LucideIcon } from "lucide-react";
import { CounterpartyOut, ItemOut, TransactionOut } from "@/lib/api";
import {
  ACCENT,
  ACCENT2,
  ACCENT_FILL_MEDIUM,
  ACTIVE_TEXT_DARK,
  DROPDOWN_BG,
  GREEN,
  MODAL_BG,
  RED,
} from "@/lib/colors";
import { buildCounterpartyDisplayName } from "@/lib/counterparty-utils";
import { formatAmount } from "@/lib/item-utils";
import type { buildCategoryLookup } from "@/lib/categories";
import { useCounterpartyImage } from "@/hooks/use-counterparty-image";
import { useCategoryImage } from "@/hooks/use-category-icon";
import { AssetItemIcon } from "@/components/asset-item-icon";
import { CardIcon } from "@/components/card-icon";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const MUTED = "rgba(255,255,255,0.55)";
const CHIP_TEXT = "#191732";

/** Как MobileCardPress на дашборде: масштаб только после короткой задержки и без сдвига пальца. */
const TAP_MOVE_PX = 10;
const PRESS_DELAY_MS = 80;
const PRESS_RELEASE_MS = 90;
const LONG_PRESS_MS = 500;

const dropdownSelectorWrapperStyle = {
  padding: "1px",
  background: "linear-gradient(to right, #7C6CF1, #6C5DD7, #5544D1)",
  WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
  WebkitMaskComposite: "xor" as const,
  maskComposite: "exclude" as const,
};

function isGestureBlockedTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest("button, a, input, textarea, select, [role='button']"));
}

type MenuAnchor = { x: number; y: number; pointerId: number; releasePending: boolean };

type ContextAction = {
  key: string;
  label: string;
  icon: LucideIcon;
  disabled?: boolean;
  destructive?: boolean;
  separatorBefore?: boolean;
  onSelect: (trigger: HTMLButtonElement) => void;
};

function clampMenuPosition(anchorX: number, anchorY: number, width: number, height: number) {
  const margin = 8;
  const maxLeft = Math.max(margin, window.innerWidth - margin - width);
  const maxTop = Math.max(margin, window.innerHeight - margin - height);
  let left = anchorX - width / 2;
  let top = anchorY - height - 8;
  if (top < margin) top = Math.min(anchorY + 8, maxTop);
  left = Math.min(Math.max(margin, left), maxLeft);
  top = Math.min(Math.max(margin, top), maxTop);
  return { left, top };
}

function MenuActionButton({
  action,
  onClose,
}: {
  action: ContextAction;
  onClose: () => void;
}) {
  const [pressed, setPressed] = useState(false);
  const Icon = action.icon;
  return (
    <button
      type="button"
      role="menuitem"
      disabled={action.disabled}
      className={cn(
        "flex min-h-11 w-full origin-center items-center gap-2 whitespace-nowrap rounded-md px-2 py-2 text-left text-sm text-[rgba(207,207,214,1)] outline-none select-none transition-transform duration-75 ease-out motion-reduce:transition-none active:bg-[rgba(108,93,215,0.22)] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:opacity-80",
        pressed && "scale-[0.97] motion-reduce:scale-100",
        action.destructive && "text-destructive active:bg-destructive/10"
      )}
      onPointerDown={(event) => {
        if (action.disabled || (event.pointerType === "mouse" && event.button !== 0)) return;
        setPressed(true);
      }}
      onPointerUp={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onClick={(event) => {
        if (action.disabled) return;
        onClose();
        action.onSelect(event.currentTarget);
      }}
    >
      <Icon />
      {action.label}
    </button>
  );
}

function TransactionContextMenu({
  anchor,
  actions,
  onClose,
}: {
  anchor: MenuAnchor;
  actions: ContextAction[];
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    setBox(clampMenuPosition(anchor.x, anchor.y, rect.width, rect.height));
  }, [anchor.x, anchor.y]);

  useEffect(() => {
    let waitingForRelease = anchor.releasePending;
    let swallowClick = false;
    let clearSwallow = 0;
    const onPointerUp = (event: PointerEvent) => {
      if (!waitingForRelease || event.pointerId !== anchor.pointerId) return;
      waitingForRelease = false;
      swallowClick = true;
      clearSwallow = window.setTimeout(() => {
        swallowClick = false;
      }, 80);
    };
    const onClick = (event: MouseEvent) => {
      if (!swallowClick) return;
      swallowClick = false;
      event.preventDefault();
      event.stopPropagation();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    let scrollArmed = false;
    const armScroll = window.setTimeout(() => {
      scrollArmed = true;
    }, 400);
    const onScroll = () => {
      if (scrollArmed) onClose();
    };
    window.addEventListener("pointerup", onPointerUp, true);
    window.addEventListener("click", onClick, true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.clearTimeout(clearSwallow);
      window.clearTimeout(armScroll);
      window.removeEventListener("pointerup", onPointerUp, true);
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [anchor.pointerId, anchor.releasePending, onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50"
      onClick={onClose}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div
        ref={panelRef}
        role="menu"
        aria-label="Действия с транзакцией"
        data-transaction-context-menu
        className={cn("absolute w-max min-w-56", box && "transaction-menu-enter")}
        style={{
          left: box?.left ?? 0,
          top: box?.top ?? 0,
          visibility: box ? "visible" : "hidden",
          transformOrigin: box && box.top + 8 < anchor.y ? "bottom center" : "top center",
          ["--menu-enter-y" as string]: box && box.top + 8 < anchor.y ? "10px" : "-10px",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative rounded-lg shadow-lg">
          <div
            className="pointer-events-none absolute inset-0 z-0 rounded-lg"
            style={dropdownSelectorWrapperStyle}
          />
          <div className="relative z-10 min-h-8 rounded-lg p-1" style={{ backgroundColor: DROPDOWN_BG }}>
            {actions.map((action) => (
              <div key={action.key}>
                {action.separatorBefore ? (
                  <div className="-mx-1 my-1 h-px" style={{ backgroundColor: "rgba(255,255,255,0.1)" }} role="separator" />
                ) : null}
                <MenuActionButton action={action} onClose={onClose} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

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
      className="grid shrink-0 place-items-center overflow-hidden"
      style={{ width: size, height: size }}
    >
      {children}
    </span>
  );
}

function CategoryMark({
  categoryId,
  categoryLookup,
  apiBase,
  size = 24,
}: {
  categoryId: number | null;
  categoryLookup: ReturnType<typeof buildCategoryLookup>;
  apiBase: string;
  size?: 24 | 36;
}) {
  const {
    imageSrc,
    onError,
    showFallbackIcon,
    CategoryIcon,
    setCategoryIconFormat,
  } = useCategoryImage(categoryId, categoryLookup, apiBase);

  return (
    <IconWell size={size}>
      {imageSrc && !showFallbackIcon ? (
        <CardIcon
          src={imageSrc}
          alt=""
          size={size}
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
        <CategoryIcon className={size === 36 ? "size-8" : "size-3.5"} strokeWidth={1.5} style={{ color: "rgba(255,255,255,0.85)" }} />
      )}
    </IconWell>
  );
}

function AccountMark({
  item,
  counterparty,
  apiBase,
  size = 24,
}: {
  item: ItemOut | null;
  counterparty: CounterpartyOut | null;
  apiBase: string;
  size?: 24 | 36;
}) {
  return (
    <IconWell size={size}>
      {item ? (
        <AssetItemIcon
          item={item}
          counterparty={counterparty}
          apiBase={apiBase}
          size={size === 36 ? 28 : 20}
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
  onConfirm,
  isConfirming,
  getRubEquivalentCents,
  onCreateFrom,
  onEdit,
  onDelete,
  onUnsplit,
  onAddChild,
  actionsDisabled,
}: {
  tx: TransactionMobileCardTx;
  counterparty: CounterpartyOut | null;
  itemName: (id: number | null | undefined) => string;
  categoryLookup: ReturnType<typeof buildCategoryLookup>;
  getCategoryLines: (categoryId: number | null) => [string, string, string];
  itemsById: Map<number, ItemOut>;
  getItemCounterparty: (itemId: number | null | undefined) => CounterpartyOut | null;
  apiBase: string;
  onConfirm?: (tx: TransactionMobileCardTx) => void;
  isConfirming?: boolean;
  getRubEquivalentCents?: (tx: TransactionMobileCardTx, currencyCode: string) => number | null;
  onCreateFrom?: (tx: TransactionMobileCardTx, trigger?: HTMLElement | null) => void;
  onEdit?: (tx: TransactionMobileCardTx, trigger?: HTMLElement | null) => void;
  onDelete?: (id: number) => void;
  onUnsplit?: (tx: TransactionMobileCardTx) => void;
  onAddChild?: (tx: TransactionMobileCardTx, trigger?: HTMLElement | null) => void;
  actionsDisabled?: boolean;
}) {
  const router = useRouter();
  const [pressed, setPressed] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<MenuAnchor | null>(null);
  const pointRef = useRef<{ x: number; y: number; id: number; at: number } | null>(null);
  const movedRef = useRef(false);
  const pressTimerRef = useRef<number | null>(null);
  const releaseTimerRef = useRef<number | null>(null);
  const longTimerRef = useRef<number | null>(null);
  const longPressOpenedRef = useRef(false);
  const suppressClickRef = useRef(false);
  const gestureCleanupRef = useRef<(() => void) | null>(null);
  const closeMenu = useCallback(() => setMenuAnchor(null), []);
  const canLongPress =
    !actionsDisabled && Boolean(onCreateFrom || onEdit || onDelete || onUnsplit || onAddChild);

  const clearTimer = (timerRef: { current: number | null }) => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      clearTimer(pressTimerRef);
      clearTimer(releaseTimerRef);
      clearTimer(longTimerRef);
      gestureCleanupRef.current?.();
    };
  }, []);
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

  const openMenu = (point: { x: number; y: number; id: number }, releasePending: boolean) => {
    longPressOpenedRef.current = true;
    suppressClickRef.current = true;
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(10);
    }
    setMenuAnchor({ x: point.x, y: point.y, pointerId: point.id, releasePending });
  };

  const finishPress = (pointerId: number) => {
    const start = pointRef.current;
    if (!start || start.id !== pointerId) return;
    clearTimer(pressTimerRef);
    clearTimer(longTimerRef);
    const heldLong = performance.now() - start.at >= LONG_PRESS_MS;
    const opened = longPressOpenedRef.current;
    const justOpened = !movedRef.current && canLongPress && heldLong && !opened;
    if (justOpened) openMenu(start, false);
    pointRef.current = null;
    if (opened || justOpened) {
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 300);
      setPressed(false);
    } else if (!movedRef.current) {
      setPressed(true);
      releaseTimerRef.current = window.setTimeout(() => setPressed(false), PRESS_RELEASE_MS);
    } else {
      setPressed(false);
    }
    movedRef.current = false;
    longPressOpenedRef.current = false;
  };

  const contextActions: ContextAction[] = [];
  const isSplitParent = tx.is_split_parent === true;
  if (isSplitParent && onUnsplit) {
    contextActions.push({
      key: "unsplit",
      label: "Отменить разделение",
      icon: Undo2,
      onSelect: () => onUnsplit(tx),
    });
  }
  if (isSplitParent && onAddChild) {
    contextActions.push({
      key: "add-child",
      label: "Добавить дочернюю",
      icon: Plus,
      onSelect: (trigger) => onAddChild(tx, trigger),
    });
  }
  const hasSplitActions = contextActions.length > 0;
  if (onCreateFrom) {
    contextActions.push({
      key: "create",
      label: "Создать на основе",
      icon: Plus,
      disabled: !!actionsDisabled,
      separatorBefore: hasSplitActions,
      onSelect: (trigger) => onCreateFrom(tx, trigger),
    });
  }
  if (onEdit) {
    contextActions.push({
      key: "edit",
      label: "Редактировать",
      icon: Pencil,
      disabled: !!tx.isDeleted || !!actionsDisabled,
      separatorBefore: Boolean(onCreateFrom) || hasSplitActions,
      onSelect: (trigger) => onEdit(tx, trigger),
    });
  }
  if (onDelete) {
    contextActions.push({
      key: "delete",
      label: "Удалить",
      icon: Trash2,
      destructive: true,
      disabled: !!tx.isDeleted || !!actionsDisabled,
      onSelect: () => onDelete(tx.id),
    });
  }

  return (
    <>
    <article
      role={tx.isDeleted ? undefined : "link"}
      tabIndex={tx.isDeleted ? undefined : 0}
      onClick={(event) => {
        if (suppressClickRef.current) {
          suppressClickRef.current = false;
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        openDetails();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openDetails();
        }
      }}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        if (isGestureBlockedTarget(event.target)) return;
        pointRef.current = { x: event.clientX, y: event.clientY, id: event.pointerId, at: performance.now() };
        movedRef.current = false;
        longPressOpenedRef.current = false;
        clearTimer(pressTimerRef);
        clearTimer(releaseTimerRef);
        clearTimer(longTimerRef);
        const pointerId = event.pointerId;
        gestureCleanupRef.current?.();
        const detachGesture = () => {
          window.removeEventListener("pointerup", endFromWindow);
          window.removeEventListener("pointercancel", cancelFromWindow);
          if (gestureCleanupRef.current === detachGesture) gestureCleanupRef.current = null;
        };
        const endFromWindow = (endEvent: PointerEvent) => {
          if (endEvent.pointerId !== pointerId) return;
          detachGesture();
          finishPress(pointerId);
        };
        const cancelFromWindow = (endEvent: PointerEvent) => {
          if (endEvent.pointerId !== pointerId) return;
          detachGesture();
          clearTimer(pressTimerRef);
          clearTimer(longTimerRef);
          if (pointRef.current?.id === pointerId) pointRef.current = null;
          movedRef.current = true;
          longPressOpenedRef.current = false;
          suppressClickRef.current = false;
          setPressed(false);
          closeMenu();
        };
        gestureCleanupRef.current = detachGesture;
        window.addEventListener("pointerup", endFromWindow);
        window.addEventListener("pointercancel", cancelFromWindow);
        pressTimerRef.current = window.setTimeout(() => {
          if (!movedRef.current) setPressed(true);
        }, PRESS_DELAY_MS);
        if (!canLongPress) return;
        longTimerRef.current = window.setTimeout(() => {
          const point = pointRef.current;
          if (!point || movedRef.current || longPressOpenedRef.current) return;
          openMenu(point, true);
        }, LONG_PRESS_MS);
      }}
      onPointerMove={(event) => {
        const start = pointRef.current;
        if (!start || event.pointerId !== start.id || movedRef.current) return;
        const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y);
        if (distance > TAP_MOVE_PX) {
          movedRef.current = true;
          clearTimer(pressTimerRef);
          clearTimer(longTimerRef);
          setPressed(false);
        }
      }}
      onPointerCancel={() => {
        clearTimer(pressTimerRef);
        clearTimer(longTimerRef);
        pointRef.current = null;
        movedRef.current = true;
        longPressOpenedRef.current = false;
        suppressClickRef.current = false;
        setPressed(false);
        closeMenu();
      }}
      className={cn(
        "flex w-full cursor-pointer flex-col overflow-hidden rounded-[10px] text-left origin-center touch-manipulation select-none transition-transform duration-75 ease-out motion-reduce:transition-none",
        tx.isDeleted && "opacity-60",
        isPlanned && "border-2 border-dashed",
        pressed && "scale-[0.97] motion-reduce:scale-100"
      )}
      style={{
        ...(isPlanned ? { borderColor: ACCENT2 } : {}),
        WebkitTouchCallout: "none",
        WebkitUserSelect: "none",
      }}
    >
      <div className="flex items-center gap-3 px-6 py-3" style={{ backgroundColor: MODAL_BG }}>
        {isTransfer ? (
          <IconWell size={24}>
            <span className="size-3.5" />
          </IconWell>
        ) : (
          <CategoryMark categoryId={tx.category_id} categoryLookup={categoryLookup} apiBase={apiBase} size={36} />
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

      <div
        className="flex flex-col gap-3 px-6 py-3"
        style={{ backgroundColor: isPlanned ? "transparent" : ACCENT_FILL_MEDIUM }}
      >
        {isTransfer ? (
          <div className="flex flex-col items-center gap-3">
            <div className="flex w-full flex-col justify-center rounded-[10px] px-3 py-3" style={{ backgroundColor: MODAL_BG }}>
              <div className="flex items-center gap-3">
                <AccountMark item={primaryItem} counterparty={primaryCounterparty} apiBase={apiBase} />
                <p className="min-w-0 flex-1 text-sm font-normal leading-4" style={{ color: ACTIVE_TEXT_DARK }}>
                  {accountName}
                </p>
              </div>
              <AmountWithChip text={signedAmount} color={amountColor} currency={primaryCurrency} tone="transfer" />
            </div>
            <span className="text-[36px] font-semibold leading-none text-white">↓</span>
            <div className="flex w-full flex-col justify-center rounded-[10px] px-3 py-3" style={{ backgroundColor: MODAL_BG }}>
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
      </div>
    </article>
    {menuAnchor && contextActions.length > 0 ? (
      <TransactionContextMenu
        anchor={menuAnchor}
        actions={contextActions}
        onClose={closeMenu}
      />
    ) : null}
    </>
  );
}

/** Плейсхолдер карточки: шапка, сумма и одна строка. */
export function TransactionMobileCardSkeleton() {
  return (
    <div className="flex w-full flex-col overflow-hidden rounded-[10px]" aria-hidden>
      <div className="flex items-center px-6 py-3" style={{ backgroundColor: MODAL_BG }}>
        <Skeleton className="h-3.5 w-2/5 rounded-[4px]" />
      </div>
      <div className="flex flex-col gap-3 px-6 py-3" style={{ backgroundColor: ACCENT_FILL_MEDIUM }}>
        <Skeleton className="h-8 w-36 rounded-[10px]" />
        <Skeleton className="h-3.5 w-1/2 rounded-[4px]" />
      </div>
    </div>
  );
}
