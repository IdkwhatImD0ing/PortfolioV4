"use client";

import { useEffect } from "react";
import { HASH_SETTLE_MS, MAX_SHIFT_PX, hashTargetToRepin } from "@/lib/hash-landing";

const ABORT_EVENTS = ["wheel", "touchstart", "keydown", "pointerdown"] as const;

/**
 * Keeps a cold-loaded `/#section` landing on its target while the page settles.
 *
 * The browser resolves a fragment's scroll offset before hydration and never
 * revisits it, so any post-hydration layout change silently strands the
 * landing. See `hashTargetToRepin` for the specific shift this exists for.
 *
 * Renders nothing, and is deliberately timid about taking the scroll position:
 *
 *  1. Waits for the scroll to stop moving, so it judges the real resting place
 *     rather than a frame of the browser's in-flight fragment animation.
 *  2. Corrects only gaps within `MAX_SHIFT_PX`. A layout shift is bounded; a
 *     visitor who scrolled off deliberately is not, and must be left alone.
 *     This is also what makes input arriving *before* hydration safe, which a
 *     React effect cannot otherwise observe.
 *  3. After that, re-pins only while the document height is still changing, and
 *     stops as soon as the position moves by anything other than its own hand.
 */
export function HashLanding() {
  useEffect(() => {
    const hashTarget = hashTargetToRepin(window.location.hash);
    if (!hashTarget) return;
    // Re-bound so the narrowing survives into the hoisted helpers below.
    const id: string = hashTarget;

    let raf = 0;
    let stopped = false;
    let pinned = false;
    let lastHeight = -1;
    let lastY = Number.NaN;
    let expected = -1;
    const deadline = performance.now() + HASH_SETTLE_MS;

    const stop = () => {
      stopped = true;
      cancelAnimationFrame(raf);
      for (const type of ABORT_EVENTS) window.removeEventListener(type, stop);
    };

    // Declarations, not consts: `tick` refers to `next` and vice versa.
    function next() {
      if (performance.now() < deadline) raf = requestAnimationFrame(tick);
      else stop();
    }

    /** scrollBy the target's own offset from the top — correct in either
     *  direction, and no absolute maths to get wrong. */
    function pinTo(el: HTMLElement) {
      const delta = el.getBoundingClientRect().top;
      if (Math.abs(delta) > 1) window.scrollBy({ top: delta, behavior: "instant" });
      lastHeight = document.documentElement.scrollHeight;
      expected = window.scrollY;
    }

    function tick() {
      if (stopped) return;
      const el = document.getElementById(id);
      const y = window.scrollY;

      if (!pinned) {
        if (!el) return next();
        // Still moving: the fragment scroll hasn't finished. Keep watching.
        if (y !== lastY) {
          lastY = y;
          return next();
        }
        if (Math.abs(el.getBoundingClientRect().top) > MAX_SHIFT_PX) return stop();
        pinTo(el);
        pinned = true;
        return next();
      }

      // Moved by something other than us: the visitor is driving now.
      if (Math.abs(y - expected) > 1) return stop();
      if (el && document.documentElement.scrollHeight !== lastHeight) pinTo(el);
      next();
    }

    for (const type of ABORT_EVENTS) {
      window.addEventListener(type, stop, { once: true, passive: true });
    }
    raf = requestAnimationFrame(tick);
    return stop;
  }, []);

  return null;
}
