"use client";

import { useState, useEffect } from "react";

const DESKTOP_BREAKPOINT_PX = 768;

/**
 * Matches Tailwind md breakpoint (min-width: 768px).
 * true = desktop (sidebar visible in flow), false = mobile (drawer).
 * Default true to avoid flash of mobile layout on desktop before hydration.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(true);

  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query]);

  return matches;
}

export function useIsDesktop(): boolean {
  return useMediaQuery(`(min-width: ${DESKTOP_BREAKPOINT_PX}px)`);
}

export { DESKTOP_BREAKPOINT_PX };
