"use client";

import { useEffect, useRef, useState } from "react";

export function useInView<T extends Element = Element>(
  threshold = 0.18,
): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return [ref, seen];
}

export function useReveal<T extends HTMLElement = HTMLElement>(): {
  ref: React.RefObject<T | null>;
  revealed: boolean;
} {
  const [ref, seen] = useInView<T>(0.15);
  return { ref, revealed: seen };
}

export const REVEAL_BASE =
  "opacity-0 translate-y-10 transition-[opacity,transform] duration-700 ease-out";
export const REVEAL_IN = "opacity-100 translate-y-0";
