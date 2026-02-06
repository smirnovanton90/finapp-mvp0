"use client";

import * as React from "react";

/** Ref to a container inside a dialog. When set, selector dropdowns should portal here instead of body so they receive pointer events (Radix sets body pointer-events: none). */
const SelectorDropdownPortalContext = React.createContext<React.RefObject<HTMLElement | null> | null>(null);

export function useSelectorDropdownPortalContainer(): HTMLElement | null {
  const ref = React.useContext(SelectorDropdownPortalContext);
  return ref?.current ?? null;
}

export const SelectorDropdownPortalProvider = SelectorDropdownPortalContext.Provider;
