"use client";

import { HACKATHONS } from "@/lib/portfolio-data";
import { REVEAL_BASE, REVEAL_IN, useReveal } from "@/hooks/use-reveal";
import { cn } from "@/lib/utils";
import { HackCard } from "./hack-card";

export function HackathonsSection() {
  const list = HACKATHONS;
  // Split across the two rows so no hackathon appears in both (top half /
  // bottom half). Each row is doubled in place because the marquee animation
  // translates -50% — that duplication is what makes the loop seamless, it
  // isn't a content repeat across rows.
  const half = Math.ceil(list.length / 2);
  const topList = list.slice(0, half);
  const bottomList = list.slice(half);
  const lineA = [...topList, ...topList];
  const lineB = [...bottomList, ...bottomList];

  const { ref, revealed } = useReveal<HTMLDivElement>();

  return (
    <section
      id="hackathons"
      data-screen-label="04 Hackathons"
      className="pt-[120px] pb-20 relative max-[700px]:pt-20 max-[700px]:pb-12"
    >
      <div className="max-w-[1280px] mx-auto px-8 max-[700px]:px-5">
        <div ref={ref} className={cn(REVEAL_BASE, revealed && REVEAL_IN)}>
          <span className="inline-flex items-center gap-2.5 font-mono text-[12px] tracking-[0.14em] uppercase text-accent px-3 py-1.5 border border-[rgba(192,132,252,0.35)] rounded-full bg-[rgba(192,132,252,0.08)]">
            <span className="w-1.5 h-1.5 rounded-full bg-magenta shadow-[0_0_10px_var(--magenta)]" />
            HACKATHONS · {HACKATHONS.length} WINS
          </span>
          <h2 className="font-sans text-[clamp(48px,7vw,96px)] -tracking-[0.02em] font-semibold leading-[0.95] mt-4 max-w-[1100px] text-balance">
            Thirty-six wins from{" "}
            <em className="font-serif italic font-normal bg-[image:var(--grad)] bg-clip-text text-transparent">
              shipping.
            </em>
          </h2>
          <p className="mt-4 text-[18px] leading-[1.5] text-ink-soft max-w-[640px]">
            Hackathon culture is a forge. You start with nothing, you ship something, you
            defend it on a stage. These are selected public wins from a broader run with
            $150k+ in prizes.
          </p>
        </div>
      </div>

      <div className="mt-16 max-[700px]:mt-10">
        <div className="flex gap-8 py-8 max-[700px]:py-5 overflow-hidden border-t border-b border-line-soft bg-gradient-to-b from-[rgba(192,132,252,0.04)] to-transparent [mask-image:linear-gradient(90deg,transparent_0%,black_8%,black_92%,transparent_100%)]">
          <div className="flex gap-14 flex-none animate-marq">
            {lineA.map((h, i) => (
              <HackCard key={`a-${i}`} h={h} tone="text-ink" />
            ))}
          </div>
        </div>
        <div className="flex gap-8 py-8 max-[700px]:py-5 overflow-hidden border-t border-b border-line-soft bg-gradient-to-b from-[rgba(192,132,252,0.04)] to-transparent [mask-image:linear-gradient(90deg,transparent_0%,black_8%,black_92%,transparent_100%)]">
          <div className="flex gap-14 flex-none animate-marq-rev">
            {lineB.map((h, i) => (
              <HackCard key={`b-${i}`} h={h} tone="text-ink-soft" />
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-[1280px] mx-auto px-8 max-[700px]:px-5">
        <div className="grid grid-cols-4 gap-6 mt-14 max-[800px]:grid-cols-2 max-[700px]:mt-10 max-[700px]:gap-4">
          {[
            { n: `${HACKATHONS.length}`, l: "Hackathons won" },
            { n: "$74k", l: "Largest prize" },
            { n: "$150k+", l: "Prizes won" },
            { n: "17", l: "Colleges visited" },
          ].map((s) => (
            <div
              key={s.l}
              className="p-7 max-[800px]:p-5 rounded-[18px] border border-line bg-gradient-to-b from-[rgba(192,132,252,0.06)] to-transparent"
            >
              <div className="font-sans text-[clamp(28px,8vw,56px)] font-semibold -tracking-[0.02em] bg-[image:var(--grad)] bg-clip-text text-transparent leading-none">
                {s.n}
              </div>
              <div className="font-mono text-[11.5px] tracking-[0.14em] uppercase text-ink-soft mt-2.5">
                {s.l}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
