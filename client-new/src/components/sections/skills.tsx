"use client";

import { useEffect, useRef, useState } from "react";
import { SKILLS_LINE } from "@/lib/portfolio-data";
import { cn } from "@/lib/utils";

export function SkillsSection() {
  const wrapRef = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);
  const words = SKILLS_LINE;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onScroll = () => {
      const r = el.getBoundingClientRect();
      const dist = el.offsetHeight - window.innerHeight;
      const p = Math.max(0, Math.min(1, -r.top / Math.max(1, dist)));
      const n = Math.round(p * (words.length - 1));
      setActive(n);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [words.length]);

  return (
    <section
      id="skills"
      data-screen-label="07 Skills"
      ref={wrapRef}
      className="relative min-h-[155vh] mt-24 mb-32 py-[110px] overflow-clip max-[700px]:min-h-[130vh] max-[700px]:mt-16 max-[700px]:mb-20 max-[700px]:py-16"
    >
      <div className="sticky top-[14vh] min-h-[72vh] flex items-center justify-center text-center max-[700px]:top-[12vh] max-[700px]:min-h-[68vh]">
        <div className="font-sans text-[clamp(32px,5vw,76px)] font-medium -tracking-[0.02em] leading-[1.12] max-w-[1020px] px-8 text-balance max-[700px]:px-5">
          {words.map((w, i) => (
            <span
              key={i}
              className={cn(
                "transition-[opacity,color] duration-300 mr-[0.25em]",
                i <= active ? "opacity-100" : "opacity-[0.18]",
                w.tag &&
                  "font-serif italic font-normal bg-[image:var(--grad)] bg-clip-text text-transparent",
              )}
            >
              {w.w}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
