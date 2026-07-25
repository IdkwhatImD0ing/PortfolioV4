"use client";

import { useEffect, useRef } from "react";

/** Keep a ref pointing at the latest callback so the subscribe effect can run
 *  once on mount instead of re-binding every render.
 *
 *  Caveat for future call sites: the ref is refreshed in an effect, so between
 *  a render and that effect flushing, a fired event still runs the *previous*
 *  render's callback. Every handler here reads live DOM/window state or closes
 *  over refs and module constants, so one render of staleness is invisible. A
 *  handler that closed over changing props or state would need those read from
 *  a ref instead. */
function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
}

/**
 * Run `handler` on scroll, coalesced to at most once per animation frame.
 *
 * Every scroll handler on this page reads layout (`getBoundingClientRect`,
 * `offsetHeight`) and then writes a transform. Doing that per scroll event
 * forces the browser to re-layout many times per frame; doing it per frame is
 * visually identical and does the work once.
 *
 * Fires once on mount too, so a mid-page refresh starts in the right position.
 * Pass `resize` for handlers whose math depends on viewport size.
 */
export function useRafScroll(handler: () => void, resize = false): void {
  const latest = useLatest(handler);

  useEffect(() => {
    let raf = 0;
    const run = () => {
      raf = 0;
      latest.current();
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(run);
    };

    latest.current();
    window.addEventListener("scroll", schedule, { passive: true });
    if (resize) window.addEventListener("resize", schedule, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule);
      if (resize) window.removeEventListener("resize", schedule);
    };
  }, [latest, resize]);
}

/**
 * Run `handler` for a high-frequency window event (pointer/mouse move),
 * coalesced to at most once per animation frame with that frame's most recent
 * event. High-polling-rate mice fire these far faster than the display
 * refreshes, so the extra callbacks can never paint anything.
 */
export function useRafWindowEvent<E extends Event>(
  type: string,
  handler: (event: E) => void,
): void {
  const latest = useLatest(handler);

  useEffect(() => {
    let raf = 0;
    let pending: E | null = null;
    const run = () => {
      raf = 0;
      if (pending) latest.current(pending);
    };
    const schedule = (event: Event) => {
      pending = event as E;
      if (!raf) raf = requestAnimationFrame(run);
    };

    window.addEventListener(type, schedule, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener(type, schedule);
    };
  }, [latest, type]);
}
