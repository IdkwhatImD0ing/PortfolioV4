"use client";

import { useEffect, useRef } from "react";
import { HACKATHONS, EXPERIENCE, type Hackathon } from "@/lib/portfolio-data";
import { REVEAL_BASE, REVEAL_IN, useReveal } from "@/hooks/use-reveal";
import { cn } from "@/lib/utils";

/** One marquee card: name → year → prize, all on one line. */
function HackCard({ h, tone }: { h: Hackathon; tone: string }) {
  return (
    <span
      className={cn(
        "font-serif italic text-[clamp(36px,5vw,72px)] whitespace-nowrap inline-flex items-center gap-7",
        tone,
      )}
    >
      {h.name}
      {h.year && (
        <span className="font-mono not-italic text-[0.2em] tracking-[0.12em] text-muted">
          {h.year}
        </span>
      )}
      <span className="font-mono not-italic text-[0.2em] tracking-[0.1em] uppercase text-magenta border border-[rgba(232,121,249,0.4)] px-2.5 py-1.5 rounded-full">
        ★ {h.prize}
      </span>
      <span className="font-sans not-italic text-[0.5em] text-magenta">✦</span>
    </span>
  );
}

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
            HACKATHONS · 36 WINS
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
            { n: "36", l: "Hackathons won" },
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

function ExperienceRow({ item }: { item: (typeof EXPERIENCE)[number] }) {
  const { ref, revealed } = useReveal<HTMLDivElement>();
  return (
    <article
      ref={ref}
      className={cn(
        "grid grid-cols-[220px_1fr] gap-14 py-14 border-t border-line-soft items-start max-[800px]:grid-cols-1 max-[800px]:gap-4 max-[800px]:py-8",
        REVEAL_BASE,
        revealed && REVEAL_IN,
      )}
    >
      <div className="font-mono text-[13px] text-muted tracking-[0.06em]">{item.when}</div>
      <div className="relative">
        <span className="absolute -left-10 top-3 w-3 h-3 rounded-full bg-bg border-2 border-magenta shadow-[0_0_12px_rgba(232,121,249,0.6)] max-[800px]:hidden" />
        <h4 className="text-[32px] -tracking-[0.02em] m-0 mb-1.5 font-medium">{item.role}</h4>
        <div className="font-mono text-[13px] text-accent">
          {item.link ? (
            <a
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:text-magenta transition-colors"
            >
              {item.where}
              <span className="text-[0.85em] opacity-70">↗</span>
            </a>
          ) : (
            item.where
          )}
        </div>
        <p className="text-[17px] leading-[1.55] text-ink-soft mt-3.5 max-w-[680px]">{item.body}</p>
        {item.badge && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-mono text-[10.5px] tracking-[0.1em] uppercase border border-[rgba(192,132,252,0.4)] text-accent bg-[rgba(192,132,252,0.06)] mt-3">
            <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80] shadow-[0_0_6px_#4ade80]" />
            {item.badge}
          </span>
        )}
      </div>
    </article>
  );
}
