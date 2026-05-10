"use client";

import { useEffect, useRef } from "react";

export function CustomCursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(max-width: 900px)").matches) return;

    const syncCursor = (e: PointerEvent) => {
      const transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0) translate(-50%, -50%)`;
      if (dotRef.current) dotRef.current.style.transform = transform;
      if (ringRef.current) ringRef.current.style.transform = transform;

      const t = e.target as Element | null;
      const hov =
        t?.closest?.(
          "a, button, [data-cursor-hover]",
        ) ?? null;
      dotRef.current?.setAttribute("data-hover", hov ? "true" : "false");
      ringRef.current?.setAttribute("data-hover", hov ? "true" : "false");
    };

    const hideCursor = () => {
      const transform = "translate3d(-100px, -100px, 0) translate(-50%, -50%)";
      if (dotRef.current) dotRef.current.style.transform = transform;
      if (ringRef.current) ringRef.current.style.transform = transform;
    };

    window.addEventListener("pointermove", syncCursor, { passive: true });
    window.addEventListener("pointerleave", hideCursor);

    return () => {
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
