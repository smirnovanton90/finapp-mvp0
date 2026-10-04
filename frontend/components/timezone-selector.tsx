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

import { useSelectorDropdownPortalContainer } from "@/components/selector-dropdown-portal-context";
import { AuthInput } from "@/components/ui/auth-input";
import { DROPDOWN_BG, SIDEBAR_TEXT_ACTIVE, SIDEBAR_TEXT_INACTIVE } from "@/lib/colors";
import { timezoneOptions, type TimezoneOption } from "@/lib/timezone";

type TimezoneSelectorProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel?: string;
};

function normalizeSearch(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("ru");
}

export function TimezoneSelector({
  value,
  onChange,
  disabled = false,
  placeholder = "Начните вводить город",
  ariaLabel = "Часовой пояс",
}: TimezoneSelectorProps) {
  const options = useMemo(() => timezoneOptions(), []);
  const selected = options.find((option) => option.value === value) ?? null;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties | null>(null);
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const portalContainer = useSelectorDropdownPortalContainer();
  const inputId = useId();

  const filtered = useMemo(() => {
    const normalized = normalizeSearch(query);
    if (!normalized) return options;
    return options.filter((option) => option.searchText.includes(normalized));
  }, [options, query]);

  const inputValue = query || (!open ? selected?.label ?? "" : "");

  const applySelection = (option: TimezoneOption) => {
    if (disabled) return;
    onChange(option.value);
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
    setDropdownStyle({
      position: "fixed",
      left: rect.left,
      width: rect.width,
      ...(openUp
        ? { bottom: window.innerHeight - rect.top + 4 }
        : { top: rect.bottom + 4 }),
      maxHeight: height > 0 ? height : maxHeight,
      zIndex: 9999,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updateDropdownPosition();
  }, [open, updateDropdownPosition, filtered.length]);

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

  return (
    <div ref={anchorRef}>
      <label
        htmlFor={inputId}
        className="relative block cursor-text [&_div.relative.flex.items-center]:h-10 [&_div.relative.flex.items-center]:min-h-[40px] [&_input]:text-sm [&_input]:font-normal"
      >
        <AuthInput
          id={inputId}
          name="timezone-city-search"
          type="search"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-label={ariaLabel}
          placeholder={placeholder}
          value={disabled ? selected?.label ?? "" : inputValue}
          disabled={disabled}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          data-1p-ignore="true"
          data-lpignore="true"
          data-bwignore="true"
          data-form-type="other"
          readOnly
          onPointerDown={(event) => {
            event.currentTarget.readOnly = false;
          }}
          onChange={(event) => {
            if (disabled) return;
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={(event) => {
            event.currentTarget.readOnly = false;
            if (disabled) return;
            if (selected && !query) event.currentTarget.select();
            setOpen(true);
          }}
          onClick={(event) => {
            if (disabled) return;
            if (selected && !query) event.currentTarget.select();
            setOpen(true);
          }}
          onBlur={() => setTimeout(() => {
            setOpen(false);
            setQuery("");
          }, 150)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && open && query.trim() && filtered.length > 0) {
              event.preventDefault();
              applySelection(filtered[0]);
            }
          }}
        />
        {open &&
          createPortal(
            <div
              data-selector-dropdown
              className="selector-dropdown fixed z-[9999] mt-1 w-full overflow-auto overscroll-contain rounded-lg shadow-lg"
              style={{ ...resolvedDropdownStyle, pointerEvents: "auto" }}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <div className="relative rounded-lg">
                <div
                  className="absolute inset-0 rounded-lg pointer-events-none z-0"
                  style={{
                    padding: "1px",
                    background: "linear-gradient(to right, #7C6CF1, #6C5DD7, #5544D1)",
                    WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
                    WebkitMaskComposite: "xor",
                    maskComposite: "exclude",
                  }}
                />
                <div className="relative rounded-lg p-1 z-10" style={{ backgroundColor: DROPDOWN_BG }}>
                  {filtered.length === 0 ? (
                    <div className="px-2 py-1 text-sm" style={{ color: SIDEBAR_TEXT_INACTIVE }}>
                      Ничего не найдено
                    </div>
                  ) : (
                    filtered.map((option) => {
                      const isSelected = option.value === value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm transition-colors"
                          style={{
                            backgroundColor: isSelected ? "rgba(127, 92, 255, 0.2)" : "transparent",
                            color: isSelected ? "white" : SIDEBAR_TEXT_ACTIVE,
                          }}
                          onMouseEnter={(event) => {
                            if (!isSelected) {
                              event.currentTarget.style.backgroundColor = "rgba(108, 93, 215, 0.22)";
                            }
                          }}
                          onMouseLeave={(event) => {
                            if (!isSelected) {
                              event.currentTarget.style.backgroundColor = "transparent";
                            }
                          }}
                          onMouseDown={(event) => {
                            event.preventDefault();
                            applySelection(option);
                          }}
                        >
                          {option.label}
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
    </div>
  );
}
