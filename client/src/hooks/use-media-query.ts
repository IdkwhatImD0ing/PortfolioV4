"use client";

import { useEffect, useState } from "react";

/** Subscribe to a CSS media query. SSR-safe: always returns `false` on the
 *  server and the first client render (so markup matches), then updates to the
 *  real match after mount. */
function useMediaQuery(query: string): boolean {
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

/** True when the user asked the OS for less motion. Gate JS-driven animation on
 *  this — the reduced-motion block in globals.css can only clamp CSS animations
 *  and transitions, so anything written from rAF has to opt out itself.
 *  (`prefersReducedMotion()` in lib/voice-bus is the one-shot equivalent for
 *  non-React call sites.) */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
}
