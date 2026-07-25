"use client";

import { useEffect, useRef } from "react";

export function CustomCursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Touch viewports never show the custom cursor (the dot/ring are hidden
    // below 900px), so don't subscribe at all there.
    if (window.matchMedia("(max-width: 900px)").matches) return;

    let raf = 0;
    let pending: PointerEvent | null = null;
    let hovering: boolean | null = null;

    // High-polling-rate mice fire pointermove far faster than the screen
    // refreshes; coalescing to one frame keeps the `closest()` tree walk and
    // the style writes to once per paint.
    const paint = () => {
      raf = 0;
      const e = pending;
      if (!e) return;

      const transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0) translate(-50%, -50%)`;
      if (dotRef.current) dotRef.current.style.transform = transform;
      if (ringRef.current) ringRef.current.style.transform = transform;

      const target = e.target as Element | null;
      const hov = Boolean(target?.closest?.("a, button, [data-cursor-hover]"));
      if (hov !== hovering) {
        hovering = hov;
        const value = hov ? "true" : "false";
        dotRef.current?.setAttribute("data-hover", value);
        ringRef.current?.setAttribute("data-hover", value);
      }
    };

    const syncCursor = (e: PointerEvent) => {
      pending = e;
      if (!raf) raf = requestAnimationFrame(paint);
    };

    const hideCursor = () => {
      const transform = "translate3d(-100px, -100px, 0) translate(-50%, -50%)";
      if (dotRef.current) dotRef.current.style.transform = transform;
      if (ringRef.current) ringRef.current.style.transform = transform;
    };

    window.addEventListener("pointermove", syncCursor, { passive: true });
    window.addEventListener("pointerleave", hideCursor);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", syncCursor);
      window.removeEventListener("pointerleave", hideCursor);
    };
  }, []);

  return (
    <>
      <div
        ref={dotRef}
        data-hover="false"
        style={{ transform: "translate3d(-100px, -100px, 0) translate(-50%, -50%)" }}
        className="fixed top-0 left-0 pointer-events-none z-[9999] will-change-transform w-[6px] h-[6px] rounded-full bg-magenta shadow-[0_0_12px_var(--magenta)] transition-[width,height,background-color] duration-200 data-[hover=true]:bg-accent max-[900px]:hidden"
      />
      <div
        ref={ringRef}
        data-hover="false"
        style={{ transform: "translate3d(-100px, -100px, 0) translate(-50%, -50%)" }}
        className="fixed top-0 left-0 pointer-events-none z-[9999] will-change-transform w-9 h-9 rounded-full border border-[rgba(192,132,252,0.55)] transition-[width,height,border-color,background-color] duration-200 data-[hover=true]:w-16 data-[hover=true]:h-16 data-[hover=true]:border-[rgba(232,121,249,0.9)] data-[hover=true]:bg-[rgba(192,132,252,0.06)] max-[900px]:hidden"
      />
    </>
  );
}
