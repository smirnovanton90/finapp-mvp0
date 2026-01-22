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
import { ACCENT0, ACCENT2, ACTIVE_TEXT, DROPDOWN_BG, SIDEBAR_TEXT_ACTIVE, SIDEBAR_TEXT_INACTIVE } from "@/lib/colors";
import { AuthInput } from "@/components/ui/auth-input";

export type CategoryPathOption = {
  l1: string;
  l2: string;
  l3: string;
  label: string;
  searchKey: string;
  categoryId: number | null;
};

type CategorySelectorProps = {
  categoryNodes: CategoryNode[];
  selectedPath?: { l1: string; l2: string; l3: string } | null;
  selectedPathKeys?: Set<string>;
  onChange?: (path: { l1: string; l2: string; l3: string } | null) => void;
  onTogglePath?: (path: { l1: string; l2: string; l3: string }) => void;
  selectionMode?: "single" | "multi";
  placeholder?: string;
  emptyMessage?: string;
  noResultsMessage?: string;
  clearLabel?: string;
  disabled?: boolean;
  resetSignal?: number | string;
  ariaLabel?: string;
  required?: boolean;
  direction?: "INCOME" | "EXPENSE";
  includeArchived?: boolean;
  includeDisabled?: boolean;
  showChips?: boolean;
};

const DEFAULT_EMPTY_MESSAGE = "Нет категорий.";
const DEFAULT_NO_RESULTS_MESSAGE = "Ничего не найдено";
const CATEGORY_PLACEHOLDER = "-";

function normalizeCategory(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("ru");
}

function normalizeCategoryValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed === CATEGORY_PLACEHOLDER) return "";
  return trimmed;
}

function formatCategoryPath(l1: string, l2: string, l3: string): string {
  const parts = [l1, l2, l3]
    .map((part) => part?.trim())
    .filter((part) => part && part !== CATEGORY_PLACEHOLDER);
  return parts.join(" / ");
}

function buildCategoryPaths(
  categoryNodes: CategoryNode[],
  direction?: "INCOME" | "EXPENSE",
  options?: { includeArchived?: boolean; includeDisabled?: boolean }
): CategoryPathOption[] {
  const paths: CategoryPathOption[] = [];
  const categoryLookup = buildCategoryLookup(categoryNodes);
  const includeArchived = options?.includeArchived ?? false;
  const includeDisabled = options?.includeDisabled ?? false;

  const matchesScope = (scope: string) => {
    if (!direction) return true;
    if (scope === "BOTH") return true;
    return scope === direction;
  };

  const walk = (nodes: CategoryNode[], trail: string[]) => {
    nodes.forEach((node) => {
      if (!includeArchived && node.archived_at) return;
      if (!includeDisabled && node.enabled === false) return;
      if (!matchesScope(node.scope)) return;

      const nextTrail = [...trail, node.name];
      const [l1, l2, l3] = nextTrail;
      const label = formatCategoryPath(
        l1 || "",
        l2 || "",
        l3 || ""
      );
      
      if (label) {
        const key = makeCategoryPathKey(
          normalizeCategoryValue(l1 || ""),
          normalizeCategoryValue(l2 || ""),
          normalizeCategoryValue(l3 || "")
        );
        const categoryId = categoryLookup.pathToId.get(key) ?? null;
        
        paths.push({
          l1: l1 || "",
          l2: l2 || "",
          l3: l3 || "",
          label,
          searchKey: normalizeCategory(label),
          categoryId,
        });
      }

      if (node.children && node.children.length > 0) {
        walk(node.children, nextTrail);
      }
    });
  };

  walk(categoryNodes, []);
  return paths;
}

function resolveCategoryIcon(
  categoryId: number | null,
  categoryLookup: ReturnType<typeof buildCategoryLookup>
): ComponentType<{ className?: string; strokeWidth?: number }> {
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

export function CategorySelector({
  categoryNodes,
  selectedPath,
  selectedPathKeys,
  onChange,
  onTogglePath,
  selectionMode = "single",
  placeholder = "Начните вводить категорию",
  emptyMessage = DEFAULT_EMPTY_MESSAGE,
  noResultsMessage = DEFAULT_NO_RESULTS_MESSAGE,
  clearLabel,
  disabled = false,
  resetSignal,
  ariaLabel,
  required = false,
  direction,
  includeArchived = false,
  includeDisabled = false,
  showChips = true,
}: CategorySelectorProps) {
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

  const categoryPaths = useMemo(
    () => buildCategoryPaths(categoryNodes, direction, { includeArchived, includeDisabled }),
    [categoryNodes, direction, includeArchived, includeDisabled]
  );

  const normalizedQuery = useMemo(() => normalizeCategory(query), [query]);
  const filteredPaths = useMemo(() => {
    if (!normalizedQuery) return categoryPaths;
    return categoryPaths.filter((path) =>
      path.searchKey.includes(normalizedQuery)
    );
  }, [categoryPaths, normalizedQuery]);

  const selectedLabel =
    selectionMode === "single" && selectedPath
      ? formatCategoryPath(selectedPath.l1, selectedPath.l2, selectedPath.l3)
      : "";
  // В multi режиме поле всегда пустое, показываем только query
  const inputValue = selectionMode === "multi" ? query : (query || selectedLabel);

  const selectedCategoryId = useMemo(() => {
    if (selectionMode === "single") {
      if (!selectedPath) return null;
      const key = makeCategoryPathKey(
        normalizeCategoryValue(selectedPath.l1),
        normalizeCategoryValue(selectedPath.l2),
        normalizeCategoryValue(selectedPath.l3)
      );
      return categoryLookup.pathToId.get(key) ?? null;
    }
    return null;
  }, [selectedPath, categoryLookup.pathToId, selectionMode]);

  const selectedCategoryIcon = useMemo(() => {
    if (selectionMode === "single") {
      return resolveCategoryIcon(selectedCategoryId, categoryLookup);
    }
    return null;
  }, [selectedCategoryId, categoryLookup, selectionMode]);

  const applySelection = (path: CategoryPathOption) => {
    if (disabled) return;
    if (selectionMode === "single" && onChange) {
      onChange({ l1: path.l1, l2: path.l2, l3: path.l3 });
      setQuery("");
      setOpen(false);
    } else if (selectionMode === "multi" && onTogglePath) {
      onTogglePath({ l1: path.l1, l2: path.l2, l3: path.l3 });
      setQuery("");
      setOpen(false);
    }
  };

  const clearSelection = () => {
    if (disabled) return;
    if (selectionMode === "single" && onChange) {
      onChange(null);
      setQuery("");
      setOpen(false);
    }
  };

  const selectedPathsSet = selectionMode === "multi" ? selectedPathKeys || new Set<string>() : null;
  const selectedPathsOptions = useMemo(() => {
    if (selectionMode !== "multi" || !selectedPathsSet) return [];
    const options: CategoryPathOption[] = [];
    selectedPathsSet.forEach((key) => {
      const option = categoryPaths.find((p) => {
        const pathKey = makeCategoryPathKey(
          normalizeCategoryValue(p.l1),
          normalizeCategoryValue(p.l2),
          normalizeCategoryValue(p.l3)
        );
        return pathKey === key;
      });
      if (option) options.push(option);
    });
    return options;
  }, [selectionMode, selectedPathsSet, categoryPaths]);

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
  }, [open, updateDropdownPosition, filteredPaths.length, selectedPathsOptions.length]);

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

  const showPrefix = selectionMode === "single" && selectedPath && !query && selectedCategoryIcon;
  const CategoryIconNode = selectedCategoryIcon;

  return (
    <div className="space-y-3">
      <div className="relative [&_div.relative.flex.items-center]:h-10 [&_div.relative.flex.items-center]:min-h-[40px] [&_input]:text-sm [&_input]:font-normal" ref={anchorRef}>
        <AuthInput
          type="text"
          aria-label={ariaLabel}
          placeholder={placeholder}
          value={inputValue}
          disabled={disabled}
          prefix={
            showPrefix && CategoryIconNode ? (
              <CategoryIconNode className="h-4 w-4" style={{ color: SIDEBAR_TEXT_ACTIVE }} aria-hidden="true" />
            ) : undefined
          }
          onChange={(event) => {
            if (disabled) return;
            const value = event.target.value;
            setQuery(value);
            if (selectionMode === "single" && value.trim() === "" && onChange) {
              onChange(null);
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
              filteredPaths.length > 0
            ) {
              event.preventDefault();
              applySelection(filteredPaths[0]);
            }
          }}
        />
        {open && (
          <div
            className="selector-dropdown absolute z-50 mt-1 w-full overflow-auto overscroll-contain rounded-lg shadow-lg"
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
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={clearSelection}
                  >
                    {clearLabel}
                  </button>
                )}
                {categoryPaths.length === 0 ? (
                  <div className="px-2 py-1 text-sm" style={{ color: SIDEBAR_TEXT_INACTIVE }}>
                    {emptyMessage}
                  </div>
                ) : filteredPaths.length === 0 ? (
                  <div className="px-2 py-1 text-sm" style={{ color: SIDEBAR_TEXT_INACTIVE }}>
                    {noResultsMessage}
                  </div>
                ) : (
                  filteredPaths.map((path) => {
                    const pathKey = makeCategoryPathKey(
                      normalizeCategoryValue(path.l1),
                      normalizeCategoryValue(path.l2),
                      normalizeCategoryValue(path.l3)
                    );
                    const isSelected =
                      selectionMode === "single"
                        ? selectedPath &&
                          path.l1 === selectedPath.l1 &&
                          path.l2 === selectedPath.l2 &&
                          path.l3 === selectedPath.l3
                        : selectedPathsSet?.has(pathKey) ?? false;

                    const CategoryIcon = path.categoryId
                      ? resolveCategoryIcon(path.categoryId, categoryLookup)
                      : CATEGORY_ICON_FALLBACK;

                    return (
                      <button
                        key={`${path.l1}||${path.l2}||${path.l3}`}
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
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => applySelection(path)}
                      >
                        <CategoryIcon className="h-4 w-4" style={{ color: isSelected ? "white" : SIDEBAR_TEXT_ACTIVE }} aria-hidden="true" />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-normal break-words">
                            {path.label}
                          </div>
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
      {showChips && selectionMode === "multi" && selectedPathsOptions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedPathsOptions.map((path) => {
            const pathKey = makeCategoryPathKey(
              normalizeCategoryValue(path.l1),
              normalizeCategoryValue(path.l2),
              normalizeCategoryValue(path.l3)
            );
            return (
              <div
                key={pathKey}
                className="flex items-center gap-2 rounded-full px-3 py-1 text-xs"
                style={{ backgroundColor: ACCENT2, color: ACTIVE_TEXT }}
              >
                <span>{path.label}</span>
                {onTogglePath && (
                  <button
                    type="button"
                    className="transition-colors hover:opacity-80"
                    style={{ color: ACCENT0 }}
                    onClick={() => onTogglePath(path)}
                    aria-label={`Удалить фильтр ${path.label}`}
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
