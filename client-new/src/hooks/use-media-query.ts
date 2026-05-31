"use client";

import { useEffect, useState } from "react";

/** Subscribe to a CSS media query. SSR-safe: always returns `false` on the
 *  server and the first client render (so markup matches), then updates to the
 *  real match after mount. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

/** True on phone-width viewports. Matches the section's mobile breakpoint. */
export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 768px)");
}
