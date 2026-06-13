"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { PERSONAL_FACTS } from "@/lib/portfolio-data";
import { REVEAL_BASE, REVEAL_IN, useReveal } from "@/hooks/use-reveal";
import { cn } from "@/lib/utils";
import { FactItem } from "./fact-item";

const decorBase =
  "absolute font-serif italic text-[clamp(60px,9vw,160px)] text-[rgba(192,132,252,0.06)] -tracking-[0.02em] pointer-events-none whitespace-nowrap";

export function PersonalSection() {
  const facts = PERSONAL_FACTS;
  const sectionRef = useRef<HTMLElement>(null);
  const refL1 = useRef<HTMLDivElement>(null);
  const refL2 = useRef<HTMLDivElement>(null);
  const refL3 = useRef<HTMLDivElement>(null);
  const portRef = useRef<HTMLDivElement>(null);
  const { ref, revealed } = useReveal<HTMLDivElement>();

  useEffect(() => {
    const onScroll = () => {
      // Parallax is driven by the section's position in the viewport, not the
      // absolute page scroll — otherwise a section this far down the page gets
      // a huge constant offset that pushes the decor watermarks off-screen.
      const section = sectionRef.current;
      if (section) {
        const rect = section.getBoundingClientRect();
        const mid = rect.top + rect.height / 2;
        // -1 → section centered a viewport below; +1 → a viewport above.
        const p = Math.max(-1, Math.min(1, (window.innerHeight / 2 - mid) / window.innerHeight));
        if (refL1.current) refL1.current.style.transform = `translate3d(${-p * 90}px, 0, 0)`;
        if (refL2.current) refL2.current.style.transform = `translate3d(${p * 70}px, 0, 0)`;
        if (refL3.current) refL3.current.style.transform = `translate3d(${-p * 36}px, 0, 0)`;
      }
      if (portRef.current) {
        const rect = portRef.current.getBoundingClientRect();
        if (rect.top < window.innerHeight && rect.bottom > 0) {
          const center = rect.top + rect.height / 2 - window.innerHeight / 2;
          portRef.current.style.transform = `translate3d(0, ${center * -0.06}px, 0)`;
        }
      }
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <section
      ref={sectionRef}
      id="personal"
      data-screen-label="08 Personal"
      className="min-h-[130vh] py-20 relative overflow-hidden"
    >
      <div className="absolute inset-0 pointer-events-none">
        <div ref={refL1} className={cn(decorBase, "top-[10%] -left-[2%]")}>
          off the clock · off the clock · off the clock
        </div>
        <div ref={refL2} className={cn(decorBase, "top-1/2 -right-[4%]")}>
          music · climbing · coffee
        </div>
        <div ref={refL3} className={cn(decorBase, "bottom-[6%] left-[5%]")}>
          made in san francisco
        </div>
      </div>

      <div className="max-w-[1280px] mx-auto px-8 max-[700px]:px-5 relative">
        <div ref={ref} className={cn(REVEAL_BASE, revealed && REVEAL_IN)}>
          <span className="inline-flex items-center gap-2.5 font-mono text-[12px] tracking-[0.14em] uppercase text-accent px-3 py-1.5 border border-[rgba(192,132,252,0.35)] rounded-full bg-[rgba(192,132,252,0.08)]">
            <span className="w-1.5 h-1.5 rounded-full bg-magenta shadow-[0_0_10px_var(--magenta)]" />
            OFF THE CLOCK
          </span>
          <h2 className="font-sans text-[clamp(48px,7vw,96px)] -tracking-[0.02em] font-semibold leading-[0.95] mt-4 text-balance">
            A few{" "}
            <em className="font-serif italic font-normal bg-[image:var(--grad)] bg-clip-text text-transparent">
              true things.
            </em>
          </h2>
        </div>

        <div className="grid grid-cols-[0.9fr_1.1fr] gap-16 items-center py-20 max-[900px]:grid-cols-1 max-[900px]:gap-8 max-[700px]:py-10">
          <div
            ref={portRef}
            className="relative aspect-[4/5] rounded-[22px] overflow-hidden border border-line bg-card"
          >
            <Image
              src="/profile.webp"
              alt="Bill Zhang"
              fill
              sizes="(max-width: 900px) 90vw, 480px"
              style={{ objectFit: "cover" }}
              priority={false}
            />
            <div className="absolute bottom-3.5 left-3.5 font-mono text-[10.5px] tracking-[0.16em] uppercase text-ink bg-[rgba(7,6,13,0.65)] px-2.5 py-1.5 rounded backdrop-blur-md border border-white/10">
              SHOT · 2025 · LA
            </div>
          </div>
          <div>
            <div className="flex flex-col gap-3 mt-6">
              {facts.map((f, i) => (
                <FactItem key={i} fact={f} />
              ))}
            </div>
            <div className="mt-7 font-mono text-[13px] text-ink-soft leading-[1.6]">
              <span className="text-magenta">›</span> Try asking the orb:{" "}
              <span className="text-ink">
                &ldquo;What does Bill do for fun?&rdquo;
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
