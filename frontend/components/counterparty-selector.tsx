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
import { User, Building2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import { CounterpartyOut, CounterpartyIndustryOut } from "@/lib/api";
import {
  normalizeCounterpartySearch,
  buildCounterpartyDisplayName,
  getCounterpartyTypeLabel,
  getCounterpartyIndustryName,
  buildCounterpartySearchText,
  sortCounterpartiesByTransactionCount,
} from "@/lib/counterparty-utils";

type CounterpartySelectorProps = {
  counterparties: CounterpartyOut[];
  selectedIds: number[];
  onChange: (nextIds: number[]) => void;
  selectionMode?: "single" | "multi";
  placeholder?: string;
  emptyMessage?: string;
  noResultsMessage?: string;
  clearLabel?: string;
  disabled?: boolean;
  resetSignal?: number | string;
  showChips?: boolean;
  ariaLabel?: string;
  required?: boolean;
  filterByIndustryId?: number | null;
  industries?: CounterpartyIndustryOut[];
  counterpartyCounts?: Map<number, number> | Record<number, number>;
};

const DEFAULT_EMPTY_MESSAGE = "Нет контрагентов.";
const DEFAULT_NO_RESULTS_MESSAGE = "Ничего не найдено";

export function CounterpartySelector({
  counterparties,
  selectedIds,
  onChange,
  selectionMode = "single",
  placeholder = "Начните вводить название",
  emptyMessage = DEFAULT_EMPTY_MESSAGE,
  noResultsMessage = DEFAULT_NO_RESULTS_MESSAGE,
  clearLabel,
  disabled = false,
  resetSignal,
  showChips = true,
  ariaLabel,
  required = false,
  filterByIndustryId,
  industries = [],
  counterpartyCounts,
}: CounterpartySelectorProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties | null>(null);

  useEffect(() => {
    if (resetSignal === undefined) return;
    setQuery("");
    setOpen(false);
  }, [resetSignal]);

  const industriesMap = useMemo(() => {
    const map = new Map<number, string>();
    industries.forEach((ind) => map.set(ind.id, ind.name));
    return map;
  }, [industries]);

  const countById = useMemo(() => {
    if (!counterpartyCounts) return new Map<number, number>();
    if (counterpartyCounts instanceof Map) return counterpartyCounts;
    const map = new Map<number, number>();
    Object.entries(counterpartyCounts).forEach(([key, value]) => {
      map.set(Number(key), Number(value));
    });
    return map;
  }, [counterpartyCounts]);

  const sortedCounterparties = useMemo(
    () => sortCounterpartiesByTransactionCount(counterparties, countById),
    [counterparties, countById]
  );

  const filteredCounterparties = useMemo(() => {
    let filtered = sortedCounterparties;

    // Фильтрация по отрасли
    if (filterByIndustryId !== undefined && filterByIndustryId !== null) {
      filtered = filtered.filter(
        (cp) => cp.industry_id === filterByIndustryId
      );
    }

    // Фильтрация по поисковому запросу
    if (query.trim()) {
      const normalizedQuery = normalizeCounterpartySearch(query);
      filtered = filtered.filter((cp) => {
        const searchText = buildCounterpartySearchText(cp, industriesMap);
        return normalizeCounterpartySearch(searchText).includes(normalizedQuery);
      });
    }

    return filtered;
  }, [sortedCounterparties, query, filterByIndustryId, industriesMap]);

  const counterpartiesById = useMemo(
    () => new Map(counterparties.map((cp) => [cp.id, cp])),
    [counterparties]
  );
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedCounterparties = useMemo(
    () =>
      selectedIds
        .map((id) => counterpartiesById.get(id))
        .filter(Boolean) as CounterpartyOut[],
    [counterpartiesById, selectedIds]
  );
  const selectedLabel =
    selectionMode === "single" && selectedCounterparties[0]
      ? buildCounterpartyDisplayName(selectedCounterparties[0])
      : "";
  const inputValue = query || selectedLabel;
  const selectedCounterparty = selectionMode === "single" ? selectedCounterparties[0] : null;
  const selectedImageUrl = selectedCounterparty
    ? selectedCounterparty.entity_type === "PERSON"
      ? selectedCounterparty.photo_url
      : selectedCounterparty.logo_url
    : null;

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
    const container = anchor.closest('[data-slot="dialog-content"]');
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
  }, [open, updateDropdownPosition, filteredCounterparties.length, selectedCounterparties.length]);

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

  const DefaultIcon = selectedCounterparty
    ? selectedCounterparty.entity_type === "PERSON" ? User : Building2
    : null;

  return (
    <div className="space-y-3">
      <div className="relative" ref={anchorRef}>
        <div className="relative flex items-center">
          {selectedImageUrl && !query && (
            <img
              src={selectedImageUrl}
              alt={selectedLabel}
              className="absolute left-4 h-6 w-6 rounded bg-white object-contain z-10 pointer-events-none"
              loading="lazy"
            />
          )}
          {!selectedImageUrl && selectedCounterparty && !query && DefaultIcon && (
            <div className="absolute left-4 flex h-6 w-6 items-center justify-center rounded bg-white text-slate-500 z-10 pointer-events-none">
              <DefaultIcon className="h-4 w-4" aria-hidden="true" />
            </div>
          )}
          <Input
            type="text"
            aria-label={ariaLabel}
            className={`h-10 w-full border-2 border-border/70 bg-white shadow-none ${
              (selectedImageUrl || (selectedCounterparty && !query)) ? "pl-11" : ""
            }`}
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
                filteredCounterparties.length > 0
              ) {
                event.preventDefault();
                applySelection(filteredCounterparties[0].id);
              }
            }}
          />
        </div>
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
            {counterparties.length === 0 ? (
              <div className="px-2 py-1 text-sm text-muted-foreground">
                {emptyMessage}
              </div>
            ) : filteredCounterparties.length === 0 ? (
              <div className="px-2 py-1 text-sm text-muted-foreground">
                {noResultsMessage}
              </div>
            ) : (
              filteredCounterparties.map((counterparty) => {
                const isSelected = selectedSet.has(counterparty.id);
                const displayName = buildCounterpartyDisplayName(counterparty);
                const typeLabel = getCounterpartyTypeLabel(counterparty);
                const industryName = getCounterpartyIndustryName(
                  counterparty,
                  industriesMap
                );
                const details = [typeLabel, industryName]
                  .filter(Boolean)
                  .join(" • ");
                const isDeleted = Boolean(counterparty.deleted_at);
                const nameToneClass = isDeleted
                  ? "text-slate-400"
                  : "text-slate-700";
                const detailsToneClass = isDeleted
                  ? "text-slate-400"
                  : "text-muted-foreground";
                const logoToneClass = isDeleted ? "opacity-50" : "";

                const DefaultIcon =
                  counterparty.entity_type === "PERSON" ? User : Building2;
                const imageUrl =
                  counterparty.entity_type === "PERSON"
                    ? counterparty.photo_url
                    : counterparty.logo_url;

                return (
                  <button
                    key={counterparty.id}
                    type="button"
                    className={`flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                      isSelected ? "bg-violet-50" : "hover:bg-slate-100"
                    }`}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => applySelection(counterparty.id)}
                  >
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={displayName}
                        className={`h-6 w-6 rounded bg-white object-contain ${logoToneClass}`}
                        loading="lazy"
                      />
                    ) : (
                      <div
                        className={`flex h-6 w-6 items-center justify-center rounded bg-white text-slate-500 ${logoToneClass}`}
                      >
                        <DefaultIcon className="h-4 w-4" aria-hidden="true" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div
                        className={`text-sm font-medium break-words ${nameToneClass}`}
                      >
                        {displayName}
                      </div>
                      {details && (
                        <div className={`text-xs ${detailsToneClass}`}>
                          {details}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>
      {showChips && selectionMode === "multi" && selectedCounterparties.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedCounterparties.map((counterparty) => {
            const isDeleted = Boolean(counterparty.deleted_at);
            const chipClass = isDeleted
              ? "border-slate-200 bg-slate-100 text-slate-500"
              : "border-violet-200 bg-violet-50 text-violet-800";
            const chipButtonClass = isDeleted
              ? "text-slate-500 hover:text-slate-600"
              : "text-violet-700 hover:text-violet-900";
            return (
              <div
                key={counterparty.id}
                className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${chipClass}`}
              >
                <span>{buildCounterpartyDisplayName(counterparty)}</span>
                <button
                  type="button"
                  className={chipButtonClass}
                  onClick={() => applySelection(counterparty.id)}
                  aria-label={`Удалить фильтр ${buildCounterpartyDisplayName(counterparty)}`}
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
