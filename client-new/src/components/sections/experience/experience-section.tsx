"use client";

import { useEffect, useRef } from "react";
import { EXPERIENCE } from "@/lib/portfolio-data";
import { REVEAL_BASE, REVEAL_IN, useReveal } from "@/hooks/use-reveal";
import { cn } from "@/lib/utils";
import { ExperienceRow } from "./experience-row";

export function ExperienceSection() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const { ref, revealed } = useReveal<HTMLDivElement>();

  useEffect(() => {
    const el = wrapRef.current;
    const line = lineRef.current;
    if (!el || !line) return;
    const onScroll = () => {
      const r = el.getBoundingClientRect();
      const start = window.innerHeight * 0.7;
      const end = -r.height + window.innerHeight * 0.3;
      const p = Math.max(0, Math.min(1, (start - r.top) / Math.max(1, start - end)));
      line.style.transform = `scaleY(${p})`;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <section
      id="experience"
      data-screen-label="05 Experience"
      className="max-w-[1280px] mx-auto px-8 py-[120px] max-[700px]:px-5 max-[700px]:py-16"
    >
      <div ref={ref} className={cn(REVEAL_BASE, revealed && REVEAL_IN)}>
        <span className="inline-flex items-center gap-2.5 font-mono text-[12px] tracking-[0.14em] uppercase text-accent px-3 py-1.5 border border-[rgba(192,132,252,0.35)] rounded-full bg-[rgba(192,132,252,0.08)]">
          <span className="w-1.5 h-1.5 rounded-full bg-magenta shadow-[0_0_10px_var(--magenta)]" />
          EXPERIENCE
        </span>
        <h2 className="font-sans text-[clamp(48px,7vw,96px)] -tracking-[0.02em] font-semibold leading-[0.95] mt-4 text-balance">
          A short,{" "}
          <em className="font-serif italic font-normal bg-[image:var(--grad)] bg-clip-text text-transparent">
            productive
          </em>{" "}
          career.
        </h2>
      </div>

      <div ref={wrapRef} className="relative mt-20 max-[700px]:mt-10">
        <div className="absolute top-0 bottom-0 w-px bg-line-soft -translate-x-1/2 left-[220px] max-[800px]:hidden" />
        <div
          ref={lineRef}
          className="absolute top-0 w-[2px] h-full bg-gradient-to-b from-magenta to-primary scale-y-0 origin-top shadow-[0_0_12px_rgba(232,121,249,0.6)] left-[220px] max-[800px]:hidden"
        />

        {EXPERIENCE.map((it, i) => (
          <ExperienceRow key={i} item={it} />
        ))}
      </div>
    </section>
  );
}
