"use client";

import { createPortal } from "react-dom";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { CounterpartyOut, CounterpartyIndustryOut } from "@/lib/api";
import { CounterpartyIconImage } from "@/components/counterparty-icon-image";
import {
  normalizeCounterpartySearch,
  buildCounterpartyDisplayName,
  getCounterpartyTypeLabel,
  getCounterpartyIndustryName,
  buildCounterpartySearchText,
  sortCounterpartiesByTransactionCount,
} from "@/lib/counterparty-utils";
import { CirclePlus } from "lucide-react";
import { ACCENT0, ACCENT2, ACTIVE_TEXT_DARK, DROPDOWN_BG, SIDEBAR_TEXT_ACTIVE, SIDEBAR_TEXT_INACTIVE } from "@/lib/colors";
import { AuthInput } from "@/components/ui/auth-input";
import { useSelectorDropdownPortalContainer } from "@/components/selector-dropdown-portal-context";

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
  apiBase: string;
  /** When set, shows "Добавить" as first option; on click calls this and closes dropdown. */
  onAddCounterparty?: () => void;
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
  apiBase,
  onAddCounterparty,
}: CounterpartySelectorProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties | null>(null);
  const portalContainer = useSelectorDropdownPortalContainer();

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
    anchorRef.current?.querySelector<HTMLInputElement>("input")?.blur();
  };
  const clearSelection = () => {
    if (disabled) return;
    onChange([]);
    setQuery("");
    setOpen(false);
    anchorRef.current?.querySelector<HTMLInputElement>("input")?.blur();
  };

  const updateDropdownPosition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const padding = 8;
    const maxHeight = 256;
    const spaceBelow = window.innerHeight - rect.bottom - padding;
    const spaceAbove = rect.top - padding;
    const openUp = spaceBelow < 200 && spaceAbove > spaceBelow;
    const availableSpace = Math.max(0, openUp ? spaceAbove : spaceBelow);
    const height = Math.min(maxHeight, availableSpace);
    const resolvedHeight = height > 0 ? height : maxHeight;
    setDropdownStyle({
      position: "fixed",
      left: rect.left,
      width: rect.width,
      ...(openUp
        ? { bottom: window.innerHeight - rect.top + 4 }
        : { top: rect.bottom + 4 }),
      maxHeight: resolvedHeight,
      zIndex: 9999,
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
    position: "fixed",
    left: 0,
    top: 0,
    width: 200,
    maxHeight: 256,
    zIndex: 9999,
  };

  const prefix =
    selectedCounterparty && !query ? (
      <CounterpartyIconImage
        counterparty={selectedCounterparty}
        apiBase={apiBase}
        size={24}
        className="h-6 w-6 rounded object-contain"
        fallbackIconColor={SIDEBAR_TEXT_ACTIVE}
        alt={selectedLabel}
      />
    ) : undefined;

  const inputId = useId();

  return (
    <div className="space-y-3" ref={anchorRef}>
      <label
        htmlFor={inputId}
        className="relative block cursor-text [&_div.relative.flex.items-center]:h-10 [&_div.relative.flex.items-center]:min-h-[40px] [&_input]:text-sm [&_input]:font-normal"
      >
        <AuthInput
          id={inputId}
          type="text"
          aria-label={ariaLabel}
          placeholder={placeholder}
          value={inputValue}
          disabled={disabled}
          prefixPlClass="pl-12"
          prefix={prefix}
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
        {open &&
          createPortal(
            <div
              data-selector-dropdown
              className="selector-dropdown fixed z-[9999] mt-1 w-full overflow-auto overscroll-contain rounded-lg shadow-lg"
              style={resolvedDropdownStyle}
            >
            {/* Gradient border wrapper */}
            <div className="relative rounded-lg">
              {/* Stroke layer */}
              <div
                className="absolute inset-0 rounded-lg pointer-events-none z-0"
                style={{
                  padding: "1px",
                  background: "linear-gradient(to right, #7C6CF1, #6C5DD7, #5544D1)",
                  WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
                  WebkitMaskComposite: "xor",
                  maskComposite: "exclude",
                  opacity: 1,
                }}
              />
              {/* Inner container */}
              <div className="relative rounded-lg p-1 z-10" style={{ backgroundColor: DROPDOWN_BG }}>
                {clearLabel && (
                  <button
                    type="button"
                    className="w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors"
                    style={{
                      color: SIDEBAR_TEXT_ACTIVE,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "rgba(108, 93, 215, 0.22)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "transparent";
                    }}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      clearSelection();
                    }}
                  >
                    {clearLabel}
                  </button>
                )}
                {onAddCounterparty && (
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm transition-colors"
                    style={{ color: SIDEBAR_TEXT_ACTIVE }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "rgba(108, 93, 215, 0.22)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "transparent";
                    }}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      onAddCounterparty();
                      setOpen(false);
                    }}
                    aria-label="Добавить контрагента"
                  >
                    <CirclePlus className="h-5 w-5 shrink-0" />
                    <span>Добавить</span>
                  </button>
                )}
                {counterparties.length === 0 ? (
                  <div className="px-2 py-1 text-sm" style={{ color: SIDEBAR_TEXT_INACTIVE }}>
                    {emptyMessage}
                  </div>
                ) : filteredCounterparties.length === 0 ? (
                  <div className="px-2 py-1 text-sm" style={{ color: SIDEBAR_TEXT_INACTIVE }}>
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
                    const logoToneClass = isDeleted ? "opacity-50" : "";

                    return (
                      <button
                        key={counterparty.id}
                        type="button"
                        className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm transition-colors"
                        style={{
                          backgroundColor: isSelected ? "rgba(127, 92, 255, 0.2)" : "transparent",
                          color: isSelected ? "white" : SIDEBAR_TEXT_ACTIVE,
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected) {
                            e.currentTarget.style.backgroundColor = "rgba(108, 93, 215, 0.22)";
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) {
                            e.currentTarget.style.backgroundColor = "transparent";
                          }
                        }}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          applySelection(counterparty.id);
                        }}
                      >
                        <div className={`h-6 w-6 shrink-0 ${logoToneClass}`}>
                          <CounterpartyIconImage
                            counterparty={counterparty}
                            apiBase={apiBase}
                            size={24}
                            className="h-6 w-6 rounded object-contain"
                            fallbackIconColor={isSelected ? "white" : SIDEBAR_TEXT_ACTIVE}
                            alt={displayName}
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div
                            className="text-sm font-normal break-words"
                            style={{
                              color: isDeleted
                                ? SIDEBAR_TEXT_INACTIVE
                                : isSelected
                                ? "white"
                                : SIDEBAR_TEXT_ACTIVE,
                            }}
                          >
                            {displayName}
                          </div>
                          {details && (
                            <div
                              className="text-xs"
                              style={{
                                color: isDeleted
                                  ? SIDEBAR_TEXT_INACTIVE
                                  : SIDEBAR_TEXT_INACTIVE,
                              }}
                            >
                              {details}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>,
            portalContainer ?? document.body
          )}
      </label>
      {showChips && selectionMode === "multi" && selectedCounterparties.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedCounterparties.map((counterparty) => {
            const isDeleted = Boolean(counterparty.deleted_at);
            return (
              <div
                key={counterparty.id}
                className={
                  isDeleted
                    ? "flex items-center gap-2 rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs text-slate-500"
                    : "flex items-center gap-2 rounded-full px-3 py-1 text-xs"
                }
                style={
                  !isDeleted
                    ? { backgroundColor: ACCENT2, color: ACTIVE_TEXT_DARK }
                    : undefined
                }
              >
                <span>{buildCounterpartyDisplayName(counterparty)}</span>
                <button
                  type="button"
                  className={isDeleted ? "text-slate-500 hover:text-slate-600" : "transition-colors hover:opacity-80"}
                  style={!isDeleted ? { color: ACCENT0 } : undefined}
                  onClick={() => applySelection(counterparty.id)}
                  aria-label={`Удалить фильтр ${buildCounterpartyDisplayName(counterparty)}`}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
