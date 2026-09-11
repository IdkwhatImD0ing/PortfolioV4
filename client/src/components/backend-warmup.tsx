"use client";

import { useEffect } from "react";
import { warmBackend } from "@/lib/backend-warmup";

/**
 * Renders nothing. Pings the voice backend as soon as the page is on screen so
 * its Cloud Run instance boots while the visitor is still reading, and again
 * whenever the tab comes back into view after being hidden long enough for the
 * instance to have gone cold. See `lib/backend-warmup.ts` for the why.
 */
export function BackendWarmup() {
  useEffect(() => {
    warmBackend();

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") warmBackend();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  return null;
}
