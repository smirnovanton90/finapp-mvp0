"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import { Input } from "@/components/ui/input";
import { ItemKind, ItemOut } from "@/lib/api";
import {
  formatAmount,
  normalizeItemSearch,
  sortItemsByTransactionCount,
} from "@/lib/item-utils";

type ItemSelectorProps = {
  items: ItemOut[];
  selectedIds: number[];
  onChange: (nextIds: number[]) => void;
  selectionMode?: "single" | "multi";
  placeholder?: string;
  emptyMessage?: string;
  noResultsMessage?: string;
  clearLabel?: string;
  getItemTypeLabel: (item: ItemOut) => string;
  getItemKind?: (item: ItemOut) => ItemKind;
  getBankLogoUrl?: (id: number | null | undefined) => string | null;
  getBankName?: (id: number | null | undefined) => string;
  getItemBalance?: (item: ItemOut) => number;
  itemCounts?: Map<number, number> | Record<number, number>;
  disabled?: boolean;
  resetSignal?: number | string;
  showChips?: boolean;
  ariaLabel?: string;
};

const DEFAULT_EMPTY_MESSAGE = "Нет активов или обязательств.";
const DEFAULT_NO_RESULTS_MESSAGE = "Ничего не найдено";

export function ItemSelector({
  items,
  selectedIds,
  onChange,
  selectionMode = "multi",
  placeholder = "Начните вводить название",
  emptyMessage = DEFAULT_EMPTY_MESSAGE,
  noResultsMessage = DEFAULT_NO_RESULTS_MESSAGE,
  clearLabel,
  getItemTypeLabel,
  getItemKind,
  getBankLogoUrl,
  getBankName,
  getItemBalance,
  itemCounts,
  disabled = false,
  resetSignal,
  showChips = true,
  ariaLabel,
}: ItemSelectorProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties | null>(null);

  useEffect(() => {
    if (resetSignal === undefined) return;
    setQuery("");
    setOpen(false);
  }, [resetSignal]);

  const countById = useMemo(() => {
    if (!itemCounts) return new Map<number, number>();
    if (itemCounts instanceof Map) return itemCounts;
    const map = new Map<number, number>();
    Object.entries(itemCounts).forEach(([key, value]) => {
      map.set(Number(key), Number(value));
    });
    return map;
  }, [itemCounts]);

  const sortedItems = useMemo(
    () => sortItemsByTransactionCount(items, countById),
    [items, countById]
  );
  const itemsById = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items]
  );
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedItems = useMemo(
    () =>
      selectedIds
        .map((id) => itemsById.get(id))
        .filter(Boolean) as ItemOut[],
    [itemsById, selectedIds]
  );
  const selectedLabel =
    selectionMode === "single" && selectedItems[0] ? selectedItems[0].name : "";
  const inputValue = query || selectedLabel;
  const normalizedQuery = useMemo(() => normalizeItemSearch(query), [query]);
  const filteredItems = useMemo(() => {
    if (!normalizedQuery) return sortedItems;
    return sortedItems.filter((item) => {
      const bankName = getBankName ? getBankName(item.id) : "";
      const searchText = [
        item.name,
        getItemTypeLabel(item),
        item.currency_code,
        bankName,
      ]
        .filter(Boolean)
        .join(" ");
      return normalizeItemSearch(searchText).includes(normalizedQuery);
    });
  }, [getBankName, getItemTypeLabel, normalizedQuery, sortedItems]);

  const applySelection = (id: number) => {
    if (disabled) return;
    if (selectionMode === "single") {
      const next = selectedSet.has(id) ? [] : [id];
      onChange(next);
    } else {
      const next = new Set(selectedSet);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      onChange(Array.from(next));
    }
    setQuery("");
    setOpen(false);
  };
  const clearSelection = () => {
    if (disabled) return;
    onChange([]);
    setQuery("");
    setOpen(false);
  };

  const updateDropdownPosition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const container = anchor.closest("[data-slot=\"dialog-content\"]");
    const containerRect = container?.getBoundingClientRect();
    const containerTop = containerRect ? containerRect.top : 0;
    const containerBottom = containerRect
      ? containerRect.bottom
      : window.innerHeight;
    const padding = 8;
    const maxHeight = 256;
    const spaceBelow = containerBottom - rect.bottom - padding;
    const spaceAbove = rect.top - containerTop - padding;
    const openUp = spaceBelow < 200 && spaceAbove > spaceBelow;
    const availableSpace = Math.max(0, openUp ? spaceAbove : spaceBelow);
    const height = Math.min(maxHeight, availableSpace);
    const resolvedHeight = height > 0 ? height : maxHeight;
    setDropdownStyle({
      position: "absolute",
      top: openUp ? "auto" : "calc(100% + 4px)",
      bottom: openUp ? "calc(100% + 4px)" : "auto",
      left: 0,
      right: 0,
      maxHeight: resolvedHeight,
      zIndex: 50,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updateDropdownPosition();
  }, [open, updateDropdownPosition, filteredItems.length, selectedItems.length]);

  useEffect(() => {
    if (!open) return;
    const handle = () => updateDropdownPosition();
    window.addEventListener("resize", handle);
    window.addEventListener("scroll", handle, true);
    return () => {
      window.removeEventListener("resize", handle);
      window.removeEventListener("scroll", handle, true);
    };
  }, [open, updateDropdownPosition]);


  const resolvedDropdownStyle: CSSProperties = dropdownStyle ?? {
    position: "absolute",
    top: "calc(100% + 4px)",
    left: 0,
    right: 0,
    maxHeight: 256,
    zIndex: 50,
  };

  return (
    <div className="space-y-3">
      <div className="relative" ref={anchorRef}>
        <Input
          type="text"
          aria-label={ariaLabel}
          className="h-10 w-full border-2 border-border/70 bg-white shadow-none"
          placeholder={placeholder}
          value={inputValue}
          disabled={disabled}
          onChange={(event) => {
            if (disabled) return;
            const value = event.target.value;
            setQuery(value);
            if (selectionMode === "single" && value.trim() === "") {
              onChange([]);
            }
            setOpen(true);
          }}
          onFocus={(event) => {
            if (disabled) return;
            if (selectionMode === "single" && selectedLabel && !query) {
              event.currentTarget.select();
            }
            setOpen(true);
          }}
          onClick={(event) => {
            if (disabled) return;
            if (selectionMode === "single" && selectedLabel && !query) {
              event.currentTarget.select();
            }
            setOpen(true);
          }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              open &&
              query.trim() &&
              filteredItems.length > 0
            ) {
              event.preventDefault();
              applySelection(filteredItems[0].id);
            }
          }}
        />
        {open && (
          <div
            className="absolute z-50 mt-1 w-full overflow-auto overscroll-contain rounded-md border border-border/70 bg-white p-1 shadow-lg"
            style={resolvedDropdownStyle}
          >
            {clearLabel && (
              <button
                type="button"
                className="w-full rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-slate-100"
                onMouseDown={(event) => event.preventDefault()}
                onClick={clearSelection}
              >
                {clearLabel}
              </button>
            )}
            {sortedItems.length === 0 ? (
              <div className="px-2 py-1 text-sm text-muted-foreground">
                {emptyMessage}
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="px-2 py-1 text-sm text-muted-foreground">
                {noResultsMessage}
              </div>
            ) : (
              filteredItems.map((item) => {
                const isSelected = selectedSet.has(item.id);
                const bankLogo = getBankLogoUrl ? getBankLogoUrl(item.id) : null;
                const bankName = getBankName ? getBankName(item.id) : "";
                const typeLabel = getItemTypeLabel(item);
                const balance = getItemBalance
                  ? getItemBalance(item)
                  : item.current_value_rub;
                const amount = formatAmount(Math.abs(balance));
                const itemKind = getItemKind ? getItemKind(item) : item.kind;
                const signedAmount =
                  itemKind === "LIABILITY" ? `-${amount}` : amount;
                const amountLabel = item.currency_code
                  ? `${signedAmount} ${item.currency_code}`
                  : signedAmount;
                const details = [typeLabel, amountLabel]
                  .filter(Boolean)
                  .join(" • ");
                const isClosed = Boolean(item.closed_at);
                const isArchived = Boolean(item.archived_at);
                const nameToneClass = isClosed
                  ? "text-red-500 opacity-70"
                  : isArchived
                  ? "text-slate-400"
                  : "text-slate-700";
                const detailsToneClass = isClosed
                  ? "text-red-400 opacity-70"
                  : isArchived
                  ? "text-slate-400"
                  : "text-muted-foreground";
                const logoToneClass = isClosed
                  ? "opacity-50"
                  : isArchived
                  ? "opacity-60"
                  : "";
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                      isSelected ? "bg-violet-50" : "hover:bg-slate-100"
                    }`}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => applySelection(item.id)}
                  >
                    {bankLogo ? (
                      <img
                        src={bankLogo}
                        alt={bankName || ""}
                        className={`h-6 w-6 rounded border border-border/60 bg-white object-contain ${logoToneClass}`}
                        loading="lazy"
                      />
                    ) : (
                      <div className="h-6 w-6 rounded border border-border/60 bg-slate-100" />
                    )}
                    <div className="min-w-0">
                      <div
                        className={`text-sm font-medium break-words ${nameToneClass}`}
                      >
                        {item.name}
                      </div>
                      <div className={`text-xs ${detailsToneClass}`}>
                        {details}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>
      {showChips && selectionMode === "multi" && selectedItems.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedItems.map((item) => {
            const isClosed = Boolean(item.closed_at);
            const isArchived = Boolean(item.archived_at);
            const chipClass = isClosed
              ? "border-red-200 bg-red-50 text-red-700"
              : isArchived
              ? "border-slate-200 bg-slate-100 text-slate-500"
              : "border-violet-200 bg-violet-50 text-violet-800";
            const chipButtonClass = isClosed
              ? "text-red-600 hover:text-red-700"
              : isArchived
              ? "text-slate-500 hover:text-slate-600"
              : "text-violet-700 hover:text-violet-900";
            return (
              <div
                key={item.id}
                className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${chipClass}`}
              >
                <span>{item.name}</span>
                <button
                  type="button"
                  className={chipButtonClass}
                  onClick={() => applySelection(item.id)}
                  aria-label={`Удалить фильтр ${item.name}`}
                >
                  x
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
