import { PROJECT_HASH_PREFIX } from "@/components/sections/projects/constants";

/** How long after mount to keep re-pinning the fragment target.
 *
 *  Long enough to outlast hydration and the `useIsMobile` layout swap, short
 *  enough that it can't feel like the page is fighting the user. Any user
 *  scroll input cancels it before this elapses anyway. */
export const HASH_SETTLE_MS = 1200;

/** Largest gap we're willing to treat as a mis-landing rather than as the
 *  visitor simply being elsewhere on the page.
 *
 *  The shift this guards against is one section's worth of height — ~850px for
 *  the projects desktop→mobile swap, plus whatever late font or image loads
 *  add. A target further away than this means someone scrolled off deliberately,
 *  and dragging them back would be hostile. */
export const MAX_SHIFT_PX = 2000;

/**
 * Decide whether a fragment needs post-hydration re-pinning, and to what id.
 *
 * Native fragment navigation resolves the target's offset *before* hydration.
 * `ProjectsSection` server-renders its taller desktop layout and swaps in the
 * shorter mobile carousel once `useIsMobile` resolves, which lifts every later
 * section by ~850px — so a cold load of `/#resume` on a phone lands well past
 * the heading. Re-resolving after the layout settles fixes it.
 *
 * Returns the element id to re-pin, or null when the fragment should be left
 * alone. `#project/<id>` is excluded on purpose: `ProjectsSection` already
 * handles those itself, post-hydration, and opens a scroll-locked modal that
 * a competing scroll would disrupt.
 */
export function hashTargetToRepin(hash: string): string | null {
  if (!hash || hash === "#") return null;
  if (hash.startsWith(PROJECT_HASH_PREFIX)) return null;

  let id: string;
  try {
    id = decodeURIComponent(hash.slice(1));
  } catch {
    // A malformed percent-escape throws; nothing sensible to target.
    return null;
  }
  return id || null;
}
