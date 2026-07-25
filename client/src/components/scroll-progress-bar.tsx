"use client";

import { useRef } from "react";
import { useRafScroll } from "@/hooks/use-raf-listener";

export function ScrollProgressBar() {
  const ref = useRef<HTMLDivElement>(null);

  useRafScroll(() => {
    const h = document.documentElement;
    const p = h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight);
    if (ref.current) ref.current.style.transform = `scaleX(${p})`;
  });

  return (
    <div
      ref={ref}
      className="fixed left-0 right-0 top-0 h-[2px] z-[100] bg-[image:var(--grad)] origin-left scale-x-0 pointer-events-none"
    />
  );
}
