"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ComponentType,
} from "react";

import { CategoryNode, buildCategoryLookup, makeCategoryPathKey } from "@/lib/categories";
import {
  CATEGORY_ICON_BY_NAME,
  CATEGORY_ICON_FALLBACK,
} from "@/lib/category-icons";
import { DROPDOWN_BG, SIDEBAR_TEXT_ACTIVE, SIDEBAR_TEXT_INACTIVE } from "@/lib/colors";
import { AuthInput } from "@/components/ui/auth-input";
import type { TransactionChainOut } from "@/lib/api";

export type ChainOption = {
  chainId: number;
  name: string;
  categoryLabel: string;
  searchKey: string;
  categoryId: number | null;
  direction: TransactionChainOut["direction"];
};

type ChainSelectorProps = {
  chains: TransactionChainOut[];
  categoryNodes: CategoryNode[];
  selectedChainId: number | null;
  onChange?: (chainId: number | null) => void;
  placeholder?: string;
  emptyMessage?: string;
  noResultsMessage?: string;
  clearLabel?: string;
  disabled?: boolean;
  resetSignal?: number | string;
  ariaLabel?: string;
  includeDeleted?: boolean;
};

const DEFAULT_EMPTY_MESSAGE = "Нет цепочек транзакций.";
const DEFAULT_NO_RESULTS_MESSAGE = "Ничего не найдено";

function normalizeSearch(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("ru");
}

function formatCategoryLabel(
  categoryId: number | null,
  direction: TransactionChainOut["direction"],
  idToPath: Map<number, string[]>
): string {
  if (direction === "TRANSFER") return "Перевод";
  if (categoryId === null) return "-";
  const parts = idToPath.get(categoryId) ?? [];
  const label = parts
    .map((p) => p?.trim())
    .filter((p) => p && p !== "-")
    .join(" / ");
  return label || "-";
}

function resolveCategoryIcon(
  categoryId: number | null,
  categoryLookup: ReturnType<typeof buildCategoryLookup>
): ComponentType<{ className?: string; strokeWidth?: number; style?: React.CSSProperties; "aria-hidden"?: string }> {
  if (!categoryId) return CATEGORY_ICON_FALLBACK;
  const path = categoryLookup.idToPath.get(categoryId);
  if (!path || path.length === 0) return CATEGORY_ICON_FALLBACK;
  for (let depth = path.length; depth >= 1; depth -= 1) {
    const key = makeCategoryPathKey(...path.slice(0, depth));
    const targetId = categoryLookup.pathToId.get(key);
    if (!targetId) continue;
    const iconName = categoryLookup.idToIcon.get(targetId);
    if (!iconName) continue;
    const normalizedIconName = iconName.trim();
    if (!normalizedIconName) continue;
    const Icon = CATEGORY_ICON_BY_NAME[normalizedIconName];
    if (Icon) return Icon;
  }
  return CATEGORY_ICON_FALLBACK;
}

function buildChainOptions(
  chains: TransactionChainOut[],
  categoryLookup: ReturnType<typeof buildCategoryLookup>,
  includeDeleted: boolean
): ChainOption[] {
  return chains
    .filter((c) => includeDeleted || !c.deleted_at)
    .map((chain) => {
      const categoryLabel = formatCategoryLabel(
        chain.category_id,
        chain.direction,
        categoryLookup.idToPath
      );
      const searchKey = normalizeSearch(`${chain.name} ${categoryLabel}`);
      return {
        chainId: chain.id,
        name: chain.name.trim() || `Цепочка #${chain.id}`,
        categoryLabel,
        searchKey,
        categoryId: chain.category_id,
        direction: chain.direction,
      };
    });
}

export function ChainSelector({
  chains,
  categoryNodes,
  selectedChainId,
  onChange,
  placeholder = "Название цепочки или категория",
  emptyMessage = DEFAULT_EMPTY_MESSAGE,
  noResultsMessage = DEFAULT_NO_RESULTS_MESSAGE,
  clearLabel,
  disabled = false,
  resetSignal,
  ariaLabel,
  includeDeleted = false,
}: ChainSelectorProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties | null>(null);

  useEffect(() => {
    if (resetSignal === undefined) return;
    setQuery("");
    setOpen(false);
  }, [resetSignal]);

  const categoryLookup = useMemo(
    () => buildCategoryLookup(categoryNodes),
    [categoryNodes]
  );

  const chainOptions = useMemo(
    () => buildChainOptions(chains, categoryLookup, includeDeleted),
    [chains, categoryLookup, includeDeleted]
  );

  const normalizedQuery = useMemo(() => normalizeSearch(query), [query]);
  const filteredOptions = useMemo(() => {
    if (!normalizedQuery) return chainOptions;
    return chainOptions.filter((opt) => opt.searchKey.includes(normalizedQuery));
  }, [chainOptions, normalizedQuery]);

  const selectedOption = useMemo(
    () => chainOptions.find((o) => o.chainId === selectedChainId) ?? null,
    [chainOptions, selectedChainId]
  );

  const selectedLabel = selectedOption?.name ?? "";
  const inputValue = query || selectedLabel;

  const selectedIcon = useMemo(() => {
    if (!selectedOption) return null;
    return resolveCategoryIcon(selectedOption.categoryId, categoryLookup);
  }, [selectedOption, categoryLookup]);

  const applySelection = (opt: ChainOption) => {
    if (disabled) return;
    onChange?.(opt.chainId);
    setQuery("");
    setOpen(false);
  };

  const clearSelection = () => {
    if (disabled) return;
    onChange?.(null);
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
  }, [open, updateDropdownPosition, filteredOptions.length]);

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

  const showPrefix = Boolean(selectedChainId && !query && selectedIcon);
  const IconNode = selectedIcon;

  return (
    <div className="space-y-3">
      <div
        className="relative [&_div.relative.flex.items-center]:h-10 [&_div.relative.flex.items-center]:min-h-[40px] [&_input]:text-sm [&_input]:font-normal"
        ref={anchorRef}
      >
        <AuthInput
          type="text"
          aria-label={ariaLabel}
          placeholder={placeholder}
          value={inputValue}
          disabled={disabled}
          prefixPlClass="pl-12"
          prefix={
            showPrefix && IconNode ? (
              <IconNode
                className="h-4 w-4"
                style={{ color: SIDEBAR_TEXT_ACTIVE }}
                aria-hidden="true"
              />
            ) : undefined
          }
          onChange={(e) => {
            if (disabled) return;
            const value = e.target.value;
            setQuery(value);
            if (value.trim() === "" && onChange) onChange(null);
            setOpen(true);
          }}
          onFocus={(e) => {
            if (disabled) return;
            if (selectedLabel && !query) e.currentTarget.select();
            setOpen(true);
          }}
          onClick={(e) => {
            if (disabled) return;
            if (selectedLabel && !query) e.currentTarget.select();
            setOpen(true);
          }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              open &&
              query.trim() &&
              filteredOptions.length > 0
            ) {
              e.preventDefault();
              applySelection(filteredOptions[0]);
            }
          }}
        />
        {open && (
          <div
            className="selector-dropdown absolute z-50 mt-1 w-full overflow-auto overscroll-contain rounded-lg shadow-lg"
            style={resolvedDropdownStyle}
          >
            <div className="relative rounded-lg">
              <div
                className="absolute inset-0 rounded-lg pointer-events-none z-0"
                style={{
                  padding: "1px",
                  background:
                    "linear-gradient(to right, #7C6CF1, #6C5DD7, #5544D1)",
                  WebkitMask:
                    "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
                  WebkitMaskComposite: "xor",
                  maskComposite: "exclude",
                  opacity: 1,
                }}
              />
              <div
                className="relative rounded-lg p-1 z-10"
                style={{ backgroundColor: DROPDOWN_BG }}
              >
                {clearLabel && (
                  <button
                    type="button"
                    className="w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors"
                    style={{ color: SIDEBAR_TEXT_ACTIVE }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor =
                        "rgba(108, 93, 215, 0.22)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "transparent";
                    }}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={clearSelection}
                  >
                    {clearLabel}
                  </button>
                )}
                {chainOptions.length === 0 ? (
                  <div
                    className="px-2 py-1 text-sm"
                    style={{ color: SIDEBAR_TEXT_INACTIVE }}
                  >
                    {emptyMessage}
                  </div>
                ) : filteredOptions.length === 0 ? (
                  <div
                    className="px-2 py-1 text-sm"
                    style={{ color: SIDEBAR_TEXT_INACTIVE }}
                  >
                    {noResultsMessage}
                  </div>
                ) : (
                  filteredOptions.map((opt) => {
                    const isSelected = opt.chainId === selectedChainId;
                    const Icon = resolveCategoryIcon(
                      opt.categoryId,
                      categoryLookup
                    );
                    return (
                      <button
                        key={opt.chainId}
                        type="button"
                        className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm transition-colors"
                        style={{
                          backgroundColor: isSelected
                            ? "rgba(127, 92, 255, 0.2)"
                            : "transparent",
                          color: isSelected ? "white" : SIDEBAR_TEXT_ACTIVE,
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected)
                            e.currentTarget.style.backgroundColor =
                              "rgba(108, 93, 215, 0.22)";
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected)
                            e.currentTarget.style.backgroundColor =
                              "transparent";
                        }}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => applySelection(opt)}
                      >
                        <Icon
                          className="h-4 w-4"
                          style={{
                            color: isSelected ? "white" : SIDEBAR_TEXT_ACTIVE,
                          }}
                          aria-hidden="true"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-normal break-words">
                            {opt.name}
                          </div>
                          {opt.categoryLabel && opt.categoryLabel !== "-" && (
                            <div
                              className="text-xs truncate"
                              style={{
                                color: isSelected
                                  ? "rgba(255,255,255,0.75)"
                                  : SIDEBAR_TEXT_INACTIVE,
                              }}
                            >
                              {opt.categoryLabel}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
