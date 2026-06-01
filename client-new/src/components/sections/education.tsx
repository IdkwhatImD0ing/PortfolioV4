"use client";

import { useState } from "react";
import Image from "next/image";
import { EDUCATION } from "@/lib/portfolio-data";
import { REVEAL_BASE, REVEAL_IN, useReveal } from "@/hooks/use-reveal";
import { cn } from "@/lib/utils";

export function EducationSection() {
  const items = EDUCATION;
  const [flipped, setFlipped] = useState<Record<number, boolean>>({});
  const { ref, revealed } = useReveal<HTMLDivElement>();

  return (
    <section
      id="education"
      data-screen-label="06 Education"
      className="max-w-[1280px] mx-auto px-8 py-[120px] max-[700px]:px-5 max-[700px]:py-16"
    >
      <div ref={ref} className={cn(REVEAL_BASE, revealed && REVEAL_IN)}>
        <span className="inline-flex items-center gap-2.5 font-mono text-[12px] tracking-[0.14em] uppercase text-accent px-3 py-1.5 border border-[rgba(192,132,252,0.35)] rounded-full bg-[rgba(192,132,252,0.08)]">
          <span className="w-1.5 h-1.5 rounded-full bg-magenta shadow-[0_0_10px_var(--magenta)]" />
          EDUCATION
        </span>
        <h2 className="font-sans text-[clamp(48px,7vw,96px)] -tracking-[0.02em] font-semibold leading-[0.95] mt-4 text-balance">
          Three schools,{" "}
          <em className="font-serif italic font-normal bg-[image:var(--grad)] bg-clip-text text-transparent">
            one path.
          </em>
        </h2>
        <p className="mt-4 text-[17px] text-ink-soft max-w-[640px]">Click a card to flip it.</p>
      </div>

      <div
        className="grid grid-cols-3 gap-6 mt-16 max-[900px]:grid-cols-1 max-[700px]:mt-10 max-[700px]:gap-5"
        style={{ perspective: "1400px" }}
      >
        {items.map((e, i) => (
          <div
            key={e.school}
            onClick={() => setFlipped((f) => ({ ...f, [i]: !f[i] }))}
            data-cursor-hover
            className={cn(
              "relative h-[460px] rounded-[22px] will-change-transform transition-transform duration-[900ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] [transform-style:preserve-3d] cursor-pointer",
              flipped[i] && "[transform:rotateY(180deg)]",
            )}
          >
            <div className="absolute inset-0 rounded-[22px] [backface-visibility:hidden] [-webkit-backface-visibility:hidden] bg-gradient-to-b from-card to-card-2 border border-line p-7 flex flex-col justify-between overflow-hidden">
              <div className="absolute -right-20 -top-20 w-60 h-60 rounded-full bg-[radial-gradient(circle,rgba(192,132,252,0.4),transparent_70%)] blur-[20px]" />
              <div className="w-20 h-20 rounded-2xl bg-white p-2 grid place-items-center">
                <Image
                  src={e.logo}
                  alt={`${e.school} logo`}
                  width={64}
                  height={64}
                  unoptimized
                  className="w-full h-full object-contain"
                />
              </div>
              <div>
                <div className="font-mono text-[11px] text-muted tracking-[0.14em] uppercase">
                  {String(i + 1).padStart(2, "0")} / {String(items.length).padStart(2, "0")}
                </div>
                <h4 className="text-2xl -tracking-[0.02em] mt-4 mb-1 font-medium">{e.full}</h4>
                <div className="font-mono text-[12px] text-accent tracking-[0.06em]">{e.degree}</div>
                <div className="font-mono text-[11.5px] text-muted mt-2">{e.when}</div>
              </div>
              <div className="font-mono text-[10.5px] tracking-[0.14em] text-muted uppercase inline-flex items-center gap-1.5">
                FLIP <span className="text-magenta">↻</span>
              </div>
            </div>

            <div className="absolute inset-0 rounded-[22px] [backface-visibility:hidden] [-webkit-backface-visibility:hidden] [transform:rotateY(180deg)] bg-gradient-to-b from-[#1f1432] to-[#140b22] border border-line p-7 flex flex-col justify-between overflow-hidden">
              <div>
                <div className="font-mono text-[11px] tracking-[0.14em] text-accent uppercase">
                  {e.school} · NOTES
                </div>
                <h4 className="text-2xl -tracking-[0.02em] mt-4 mb-1 font-medium">{e.degree}</h4>
                <p className="mt-3.5 text-[15px] leading-[1.5] text-ink-soft">{e.detail}</p>
              </div>
              <div className="font-mono text-[10.5px] tracking-[0.14em] text-muted uppercase inline-flex items-center gap-1.5">
                BACK <span className="text-magenta">↺</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
