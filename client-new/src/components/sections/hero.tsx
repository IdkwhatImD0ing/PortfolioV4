"use client";

import { useEffect, useRef } from "react";
import { VoiceBus, scrollToSection } from "@/lib/voice-bus";

const HERO_CHIPS = [
  "Who is Bill?",
  "What voice AI projects has he built?",
  "Show me the hackathon wins.",
  "What does he do for fun?",
  "Take me to his projects.",
];

const WAVEFORM_DELAYS = ["0s", "0.12s", "0.24s", "0.36s", "0.48s", "0.6s", "0.72s"];

export function HeroSection() {
  const glowA = useRef<HTMLDivElement>(null);
  const glowB = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth - 0.5) * 60;
      const y = (e.clientY / window.innerHeight - 0.5) * 40;
      if (glowA.current) glowA.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      if (glowB.current) glowB.current.style.transform = `translate3d(${-x}px, ${-y}px, 0)`;
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY * 0.18;
      if (headRef.current) headRef.current.style.transform = `translate3d(0, ${y}px, 0)`;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const onChip = (chip: string) => {
    const lower = chip.toLowerCase();
    if (lower.includes("voice ai")) {
      VoiceBus.emit({ type: "filter", tag: "voice" });
      scrollToSection("projects");
    } else if (lower.includes("hackathon")) {
      VoiceBus.emit({ type: "scroll", id: "hackathons" });
      scrollToSection("hackathons");
    } else if (lower.includes("projects")) {
      scrollToSection("projects");
    } else if (lower.includes("fun")) {
      scrollToSection("personal");
    } else {
      scrollToSection("about");
    }
  };

  return (
    <section
      id="hero"
      data-screen-label="01 Hero"
      className="min-h-screen flex flex-col justify-center relative overflow-hidden"
    >
      <div
        ref={glowA}
        className="absolute pointer-events-none rounded-full blur-[80px] will-change-transform w-[600px] h-[600px] top-[-10%] left-[10%] bg-[radial-gradient(circle,rgba(162,89,255,0.45),transparent_70%)]"
      />
      <div
        ref={glowB}
        className="absolute pointer-events-none rounded-full blur-[80px] will-change-transform w-[500px] h-[500px] bottom-[-10%] right-[5%] bg-[radial-gradient(circle,rgba(232,121,249,0.4),transparent_70%)]"
      />

      <div className="max-w-[1280px] mx-auto px-8 max-[700px]:px-5 relative z-[2] w-full">
        <div className="flex items-center gap-3 font-mono text-[13px] tracking-[0.1em] uppercase text-ink-soft">
          <span className="w-2 h-2 rounded-full bg-[#4ade80] shadow-[0_0_10px_#4ade80] animate-pulse-dot" />
          <span>VOICE-DRIVEN PORTFOLIO · 2026</span>
          <span className="ml-auto flex items-center gap-1 h-7">
            {WAVEFORM_DELAYS.map((d, i) => (
              <span
                key={i}
                className="w-[3px] rounded-[2px] bg-gradient-to-b from-magenta to-primary animate-wf"
                style={{ animationDelay: d }}
              />
            ))}
          </span>
        </div>

        <h1
          ref={headRef}
          className="font-sans text-[clamp(64px,11vw,180px)] font-semibold -tracking-[0.06em] leading-[0.86] mt-[18px]"
        >
          Ask me
          <br />
          <em className="font-serif italic font-normal -tracking-[0.02em] bg-[image:var(--grad)] bg-clip-text text-transparent">
            anything.
          </em>
        </h1>

        <p className="mt-7 max-w-[640px] text-[19px] leading-[1.5] text-ink-soft">
          I&apos;m <b className="text-ink font-semibold">Bill Zhang</b>, Applied AI Engineer
          at Scale, voice-first builder, serial hackathon winner. This site listens. Talk to it,
          scroll it, drag it around. It&apos;ll rearrange.
        </p>

        <div className="mt-9 flex flex-wrap gap-2.5">
          {HERO_CHIPS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onChip(c)}
              data-cursor-hover
              className="font-mono text-[12.5px] px-4 py-2.5 rounded-full bg-white/[0.02] border border-line text-ink-soft transition-all duration-[250ms] inline-flex items-center gap-2 hover:bg-[rgba(192,132,252,0.1)] hover:border-[rgba(192,132,252,0.55)] hover:text-ink hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(162,89,255,0.22)]"
            >
              <span className="text-magenta">&ldquo;</span>
              <span>{c}</span>
            </button>
          ))}
        </div>
      </div>

    </section>
  );
}
