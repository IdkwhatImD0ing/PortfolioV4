"use client";

import { useEffect, useRef, useState } from "react";

/** One-shot "has this scrolled into view yet" flag, driving the fade-and-rise
 *  reveal on section headers and cards. Disconnects on the first intersection
 *  — reveals never play twice. */
export function useReveal<T extends HTMLElement = HTMLElement>(): {
  ref: React.RefObject<T | null>;
  revealed: boolean;
} {
  const ref = useRef<T | null>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setRevealed(true);
          io.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return { ref, revealed };
}

export const REVEAL_BASE =
  "opacity-0 translate-y-10 transition-[opacity,transform] duration-700 ease-out";
export const REVEAL_IN = "opacity-100 translate-y-0";
