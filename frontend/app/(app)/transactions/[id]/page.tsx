"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowDown, ArrowLeft, ArrowLeftRight, Building2, MessageSquare, User, Wallet } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { CurrencyChip } from "@/components/currency-chip";
import { AssetItemIcon } from "@/components/asset-item-icon";
import { CardIcon } from "@/components/card-icon";
import { Skeleton } from "@/components/ui/skeleton";
import { useSidebar } from "@/components/ui/sidebar-context";
import { useCounterpartyImage } from "@/hooks/use-counterparty-image";
import { useCategoryImage } from "@/hooks/use-category-icon";
import { buildCategoryLookup, type CategoryNode } from "@/lib/categories";
import { API_BASE, fetchCategories, fetchCounterparties, fetchItems, fetchTransaction, type CounterpartyOut, type ItemOut, type TransactionOut } from "@/lib/api";
import { formatAmount } from "@/lib/item-utils";
import { ACCENT2, ACTIVE_TEXT_DARK, GREEN, MODAL_BG, PLACEHOLDER_COLOR_DARK, RED } from "@/lib/colors";
import { CONTENT_WIDTH_CLASS } from "@/lib/content-width";
import { cn } from "@/lib/utils";
import { transferIconPath } from "@/lib/image-paths";

function dateLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ru-RU", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><div className="text-sm" style={{ color: PLACEHOLDER_COLOR_DARK }}>{label}</div><div className="text-base" style={{ color: ACTIVE_TEXT_DARK }}>{children}</div></div>;
}

export default function TransactionDetailPage() {
  const params = useParams<{ id: string }>();
  const { isDesktop } = useSidebar();
  const id = Number(params.id);
  const [tx, setTx] = useState<TransactionOut | null>(null);
  const [items, setItems] = useState<ItemOut[]>([]);
  const [counterparties, setCounterparties] = useState<CounterpartyOut[]>([]);
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!Number.isFinite(id) || id < 1) { setError("Транзакция не найдена"); return; }
    Promise.all([fetchTransaction(id), fetchItems({ includeArchived: true, includeClosed: true }), fetchCounterparties({ include_deleted: true }), fetchCategories()])
      .then(([transaction, loadedItems, loadedCounterparties, loadedCategories]) => {
        setTx(transaction); setItems(loadedItems); setCounterparties(loadedCounterparties); setCategories(loadedCategories);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Не удалось загрузить транзакцию"));
  }, [id]);

  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const counterpartiesById = useMemo(() => new Map(counterparties.map((counterparty) => [counterparty.id, counterparty])), [counterparties]);
  const categoryLookup = useMemo(() => buildCategoryLookup(categories), [categories]);
  const primaryItem = tx ? itemsById.get(tx.primary_card_item_id ?? tx.primary_item_id) ?? null : null;
  const destinationItem = tx?.counterparty_card_item_id != null ? itemsById.get(tx.counterparty_card_item_id) ?? null : tx?.counterparty_item_id != null ? itemsById.get(tx.counterparty_item_id) ?? null : null;
  const counterparty = tx?.counterparty_id != null ? counterpartiesById.get(tx.counterparty_id) ?? null : null;
  const { currentSrc, onError, showFallbackIcon } = useCounterpartyImage(counterparty, API_BASE);
  const { imageSrc: categoryImageSrc, onError: categoryImageOnError, showFallbackIcon: categoryShowFallbackIcon, CategoryIcon, setCategoryIconFormat } = useCategoryImage(tx?.category_id ?? null, categoryLookup, API_BASE);

  if (error) return <main className={`${CONTENT_WIDTH_CLASS} py-12 text-center`} style={{ color: RED }}>{error}</main>;
  if (!tx) return <main className={`${CONTENT_WIDTH_CLASS} py-12 space-y-4`}><Skeleton className="h-10 w-32" /><Skeleton className="h-64 w-full rounded-[10px]" /></main>;

  const isIncome = tx.direction === "INCOME";
  const isTransfer = tx.direction === "TRANSFER";
  const amountColor = isIncome ? GREEN : isTransfer ? ACCENT2 : RED;
  const amountPrefix = isIncome ? "+" : isTransfer ? "" : "−";
  const merchantName = isTransfer ? `${primaryItem?.name ?? "Счёт"} → ${destinationItem?.name ?? "Счёт"}` : counterparty?.name ?? "Без контрагента";
  const categoryPath = tx.category_id != null ? categoryLookup.idToPath.get(tx.category_id) ?? [] : [];
  const categoryName = [...categoryPath].reverse().find(Boolean) ?? "Без категории";
  const FallbackIcon = isTransfer ? ArrowLeftRight : counterparty?.entity_type === "PERSON" ? User : Building2;

  const hero = <>
    <div className="flex items-center justify-between"><IconButton variant="ghost" size="icon" asChild aria-label="К транзакциям"><Link href="/transactions"><ArrowLeft className="h-5 w-5" /></Link></IconButton></div>
    <div className="flex flex-col items-center text-center">
      <div className="grid h-24 w-24 place-items-center overflow-hidden">
        {isTransfer ? <CardIcon src={transferIconPath("png")} alt="" size={88} shadow fallbackIcon={ArrowDown} fallbackIconColor={ACCENT2} /> : currentSrc && !showFallbackIcon ? <CardIcon src={currentSrc} alt="" size={76} shadow={false} objectFit="contain" fallbackIcon={FallbackIcon} fallbackIconColor={ACCENT2} onError={onError} /> : <FallbackIcon className="h-11 w-11" strokeWidth={1.5} style={{ color: ACCENT2 }} />}
      </div>
      <h1 className="mt-4 text-2xl font-medium" style={{ color: ACTIVE_TEXT_DARK }}>{merchantName}</h1>
      {!isTransfer && <div className="mt-2 inline-flex items-center gap-2 text-sm" style={{ color: PLACEHOLDER_COLOR_DARK }}>
        {categoryImageSrc && !categoryShowFallbackIcon ? <CardIcon src={categoryImageSrc} alt="" size={16} shadow={false} fallbackIcon={CategoryIcon} fallbackIconColor={PLACEHOLDER_COLOR_DARK} onError={() => { categoryImageOnError(); setCategoryIconFormat(null); }} /> : <CategoryIcon className="h-4 w-4" strokeWidth={1.5} />}
        <span>{categoryName}</span>
      </div>}
      <div className="mt-5 flex items-center gap-2"><span className="text-3xl font-semibold tabular-nums" style={{ color: amountColor }}>{amountPrefix}{formatAmount(tx.amount)}</span><CurrencyChip code={primaryItem?.currency_code ?? "RUB"} /></div>
      <div className="mt-2 text-sm" style={{ color: PLACEHOLDER_COLOR_DARK }}>{dateLabel(tx.transaction_date)}</div>
    </div>
  </>;

  return (
    <main className={cn("min-h-screen", CONTENT_WIDTH_CLASS, isDesktop ? "py-8" : "w-full max-w-none px-4 pb-28 pt-5")}>
      <div className={cn("mx-auto", isDesktop && "max-w-3xl space-y-8", !isDesktop && "space-y-6")}>
        {hero}
        <div className="grid grid-cols-2 gap-3">
          <section className="rounded-[10px] border border-white/10 p-4" style={{ backgroundColor: MODAL_BG }}><div className="text-xs" style={{ color: PLACEHOLDER_COLOR_DARK }}>Статус</div><div className="mt-1 text-sm font-medium" style={{ color: ACTIVE_TEXT_DARK }}>{tx.status === "CONFIRMED" ? "Подтверждена" : tx.status === "REALIZED" ? "Реализована" : "Не подтверждена"}</div></section>
          <section className="rounded-[10px] border border-white/10 p-4" style={{ backgroundColor: MODAL_BG }}><div className="text-xs" style={{ color: PLACEHOLDER_COLOR_DARK }}>Тип</div><div className="mt-1 text-sm font-medium" style={{ color: ACTIVE_TEXT_DARK }}>{tx.transaction_type === "ACTUAL" ? "Фактическая" : "Плановая"}</div></section>
        </div>
        {isTransfer ? (
          <div className="space-y-2">
            <section className="rounded-[10px] border border-white/10 p-4" style={{ backgroundColor: MODAL_BG }}><div className="mb-1 text-xs" style={{ color: PLACEHOLDER_COLOR_DARK }}>Счёт списания</div><div className="inline-flex items-center gap-2 text-sm" style={{ color: ACTIVE_TEXT_DARK }}>{primaryItem ? <AssetItemIcon item={primaryItem} counterparty={primaryItem.counterparty_id != null ? counterpartiesById.get(primaryItem.counterparty_id) ?? null : null} apiBase={API_BASE} size={20} alt="" /> : <Wallet className="h-5 w-5" />}{primaryItem?.name ?? "—"}</div></section>
            <div className="flex justify-center"><ArrowDown className="h-5 w-5" strokeWidth={1.5} style={{ color: ACCENT2 }} /></div>
            <section className="rounded-[10px] border border-white/10 p-4" style={{ backgroundColor: MODAL_BG }}><div className="mb-1 text-xs" style={{ color: PLACEHOLDER_COLOR_DARK }}>Счёт зачисления</div><div className="inline-flex items-center gap-2 text-sm" style={{ color: ACTIVE_TEXT_DARK }}>{destinationItem ? <AssetItemIcon item={destinationItem} counterparty={destinationItem.counterparty_id != null ? counterpartiesById.get(destinationItem.counterparty_id) ?? null : null} apiBase={API_BASE} size={20} alt="" /> : <Wallet className="h-5 w-5" />}{destinationItem?.name ?? "—"}</div></section>
          </div>
        ) : (
          <section className="rounded-[10px] border border-white/10 p-4" style={{ backgroundColor: MODAL_BG }}><div className="mb-1 text-xs" style={{ color: PLACEHOLDER_COLOR_DARK }}>Счёт операции</div><div className="inline-flex items-center gap-2 text-sm" style={{ color: ACTIVE_TEXT_DARK }}>{primaryItem ? <AssetItemIcon item={primaryItem} counterparty={primaryItem.counterparty_id != null ? counterpartiesById.get(primaryItem.counterparty_id) ?? null : null} apiBase={API_BASE} size={20} alt="" /> : <Wallet className="h-5 w-5" />}{primaryItem?.name ?? "—"}</div></section>
        )}
        <section className="rounded-[10px] border border-white/10 p-5" style={{ backgroundColor: MODAL_BG }}>
          <h2 className="mb-6 text-xl font-medium" style={{ color: ACTIVE_TEXT_DARK }}>Подробности</h2>
          <div className="space-y-6">
            <DetailRow label="Направление">{isIncome ? "Доход" : isTransfer ? "Перевод" : "Расход"}</DetailRow>
            {counterparty && <DetailRow label="Контрагент">{counterparty.name}</DetailRow>}
            {!isTransfer && <DetailRow label="Категория">{categoryName}</DetailRow>}
            {tx.chain_name && <DetailRow label="Цепочка транзакций">{tx.chain_name}</DetailRow>}
            {tx.related_item_id != null && <DetailRow label="Связанный актив">{itemsById.get(tx.related_item_id)?.name ?? "—"}</DetailRow>}
            {tx.amount_counterparty != null && <DetailRow label="Сумма второй стороны">{formatAmount(tx.amount_counterparty)}</DetailRow>}
            {tx.primary_quantity_lots != null && <DetailRow label="Количество лотов">{tx.primary_quantity_lots}</DetailRow>}
            {tx.primary_quantity_units != null && <DetailRow label="Количество единиц">{tx.primary_quantity_units}</DetailRow>}
            <DetailRow label="Дата создания">{dateLabel(tx.created_at)}</DetailRow>
            {tx.deleted_at && <DetailRow label="Удалена">{dateLabel(tx.deleted_at)}</DetailRow>}
          </div>
        </section>
        {tx.comment && <section className="px-1 py-2"><div className="mb-2 text-sm" style={{ color: PLACEHOLDER_COLOR_DARK }}>Комментарий</div><div className="inline-flex items-start gap-2 text-base" style={{ color: ACTIVE_TEXT_DARK }}><MessageSquare className="mt-0.5 h-4 w-4 shrink-0" style={{ color: PLACEHOLDER_COLOR_DARK }} />{tx.comment}</div></section>}
      </div>
    </main>
  );
}
