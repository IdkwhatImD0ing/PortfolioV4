"use client";

import { REVEAL_BASE, REVEAL_IN, useReveal } from "@/hooks/use-reveal";
import { cn } from "@/lib/utils";

const ABOUT = [
  {
    num: "01 / WHO",
    title: "I make AI feel like a real product.",
    body: "Most AI demos crumble under a real conversation. I obsess over the seams: latency, interruption handling, tool-use, fallback. The work that survives contact with users is the work I want to do.",
  },
  {
    num: "02 / WHAT",
    title: "Voice-first, agent-shaped systems.",
    body: "Phones. Smart glasses. Browser sidebars. Pinned terminals. Wherever the interface is least visual, I'm trying to make it more useful: for banking, education, public safety, food rescue, sports tape.",
  },
  {
    num: "03 / HOW",
    title: "Ship a startup-grade product every weekend.",
    body: "Thirty-six hackathon wins is a lot of weekends. The discipline of 36 hours sharpens the instinct: pick the smallest demo that proves the hypothesis, build the spine first, decorate last.",
  },
  {
    num: "04 / WHY",
    title: "The next billion users will talk to software.",
    body: "Most people on Earth still type slower than they speak, and a lot of them never learned to type at all. Every product I touch tries to bend the floor of access a little closer to the ground.",
  },
];

const STACK_GRADIENTS = [
  "linear-gradient(140deg, #1c1230 0%, #160e26 100%)",
  "linear-gradient(140deg, #221332 0%, #150c22 100%)",
  "linear-gradient(140deg, #2a1538 0%, #170d24 100%)",
  "linear-gradient(140deg, #31163e 0%, #190d28 100%)",
];

export function AboutSection() {
  const { ref, revealed } = useReveal<HTMLDivElement>();
  return (
    <section
      id="about"
      data-screen-label="02 About"
      className="max-w-[1280px] mx-auto px-8 pt-[150px] pb-[50px] max-[700px]:px-5 max-[700px]:pt-28 max-[700px]:pb-16"
    >
      <div ref={ref} className={cn(REVEAL_BASE, revealed && REVEAL_IN)}>
        <span className="inline-flex items-center gap-2.5 font-mono text-[12px] tracking-[0.14em] uppercase text-accent px-3 py-1.5 border border-[rgba(192,132,252,0.35)] rounded-full bg-[rgba(192,132,252,0.08)]">
          <span className="w-1.5 h-1.5 rounded-full bg-magenta shadow-[0_0_10px_var(--magenta)]" />
          ABOUT
        </span>
        <h2 className="font-sans text-[clamp(48px,7vw,96px)] -tracking-[0.02em] font-semibold leading-[0.95] mt-4 text-balance">
          A builder who{" "}
          <em className="font-serif italic font-normal bg-[image:var(--grad)] bg-clip-text text-transparent">
            listens
          </em>{" "}
          first.
        </h2>
      </div>

      <div className="relative mt-14 max-[700px]:mt-10">
        {ABOUT.map((c, i) => (
          <article
            key={c.num}
            className="sticky top-24 mb-5 min-h-[360px] flex flex-col justify-center px-9 py-8 rounded-[24px] border border-line shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_20px_60px_rgba(0,0,0,0.34)] overflow-hidden max-[700px]:relative max-[700px]:min-h-[260px] max-[700px]:px-6 max-[700px]:py-6 max-[700px]:rounded-[22px]"
            style={{ background: STACK_GRADIENTS[i] ?? STACK_GRADIENTS[0] }}
          >
            <div className="absolute -right-[100px] -top-[100px] w-[300px] h-[300px] rounded-full bg-[radial-gradient(circle,rgba(192,132,252,0.22),transparent_70%)] blur-[20px]" />
            <div className="font-mono text-[12px] tracking-[0.16em] text-accent uppercase">
              {c.num}
            </div>
            <h3 className="text-[clamp(28px,3.4vw,46px)] font-medium -tracking-[0.02em] leading-[1.04] mt-3 mb-4">
              {c.title}
            </h3>
            <p className="text-[15.5px] leading-[1.55] text-ink-soft max-w-[680px]">{c.body}</p>
          </article>
        ))}
        <div aria-hidden="true" className="h-[clamp(150px,22vh,220px)] max-[700px]:hidden" />
      </div>
    </section>
  );
}
