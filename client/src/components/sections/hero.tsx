"use client";

// Aliased: the bare name would shadow the DOM MouseEvent that the mousemove
// handler below is typed against.
import { useRef, type MouseEvent as ReactMouseEvent } from "react";
import { useEffect } from "react";
import { useRafScroll, useRafWindowEvent } from "@/hooks/use-raf-listener";
import { usePrefersReducedMotion } from "@/hooks/use-media-query";
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

  // Both effects below write transforms from rAF, which the reduced-motion CSS
  // block cannot reach — it only clamps animation and transition durations. A
  // drifting glow and a parallaxing headline are exactly the vestibular
  // triggers that setting exists to suppress, so gate them here.
  const reduceMotion = usePrefersReducedMotion();

  // The two blurred glows drift opposite the pointer.
  useRafWindowEvent<MouseEvent>("mousemove", (e) => {
    if (reduceMotion) return;
    const x = (e.clientX / window.innerWidth - 0.5) * 60;
    const y = (e.clientY / window.innerHeight - 0.5) * 40;
    if (glowA.current) glowA.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    if (glowB.current) glowB.current.style.transform = `translate3d(${-x}px, ${-y}px, 0)`;
  });

  // Headline parallax against the page scroll.
  useRafScroll(() => {
    if (reduceMotion) return;
    const y = window.scrollY * 0.18;
    if (headRef.current) headRef.current.style.transform = `translate3d(0, ${y}px, 0)`;
  });

  // The hooks above only stop *updating* the transforms. useMediaQuery reports
  // false until after mount, and the setting can be toggled mid-session, so
  // clear whatever was already written.
  useEffect(() => {
    if (!reduceMotion) return;
    for (const ref of [glowA, glowB, headRef]) {
      if (ref.current) ref.current.style.transform = "";
    }
  }, [reduceMotion]);

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

  const onResume = (e: ReactMouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    scrollToSection("resume");
    // Scrolling alone leaves focus on <body>, so a screen-reader user gets no
    // signal that the viewport just moved ~10,000px. The section carries
    // tabIndex={-1} to accept this. preventScroll so the focus call doesn't
    // snap past the smooth scroll we just started.
    document.getElementById("resume")?.focus({ preventScroll: true });
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
        <div className="flex items-center gap-3 font-mono text-[13px] tracking-[0.1em] uppercase text-ink-soft max-[700px]:gap-2 max-[700px]:text-[10px] max-[700px]:tracking-[0.06em]">
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
          className="font-sans text-[clamp(64px,11vw,180px)] font-semibold -tracking-[0.03em] leading-[0.86] mt-[18px]"
        >
          Ask me
          <br />
          <em className="font-serif italic font-normal -tracking-[0.02em] bg-[image:var(--grad)] bg-clip-text text-transparent">
            anything.
          </em>
        </h1>

        <p className="mt-7 max-w-[640px] text-[19px] leading-[1.5] text-ink-soft max-[700px]:mt-5 max-[700px]:text-[16.5px]">
          I&apos;m <b className="text-ink font-semibold">Bill Zhang</b>, Applied AI Engineer
          at Scale, voice-first builder, serial hackathon winner. This site listens. Talk to it,
          scroll it, drag it around. It&apos;ll rearrange.
        </p>

        {/* Resume shortcut, using the same href + preventDefault pattern as
            the footer links. The bare `href` is a real no-JS fallback, but the
            click is intercepted on purpose: native fragment navigation
            resolves the target offset *before* hydration, and `projects`
            server-renders its taller desktop layout before `useIsMobile`
            swaps in the mobile carousel — so letting `#resume` into the URL
            lands phone visitors ~850px past the heading on any reload or
            shared link. scrollToSection runs post-hydration against real
            offsets, and honors prefers-reduced-motion.

            Solid `bg-violet` rather than `var(--grad)`: white on the
            gradient's #e879f9 midpoint measures 2.46:1, well under the 4.5:1
            WCAG AA floor for 14px text, while #7f5af0 clears it at 4.54:1.
            Staying off the gradient also keeps this visually distinct from the
            real download button, which is gradient-filled. */}
        <div className="mt-8 flex flex-wrap items-center gap-3 max-[700px]:mt-6 max-[700px]:gap-2.5">
          <a
            href="#resume"
            onClick={onResume}
            data-cursor-hover
            className="inline-flex items-center px-[22px] py-3 rounded-full text-[14px] font-medium text-white bg-violet border border-transparent shadow-[0_10px_30px_rgba(127,90,240,0.35)] touch-manipulation transition-transform duration-200 hover:-translate-y-0.5 active:translate-y-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent max-[700px]:px-[18px] max-[700px]:py-2.5 max-[700px]:text-[13.5px]"
          >
            View resume
          </a>
          <a
            href="/resume.pdf"
            download="Bill-Zhang-Resume.pdf"
            type="application/pdf"
            data-cursor-hover
            className="inline-flex items-center gap-2 px-[18px] py-3 rounded-full text-[14px] text-ink-soft border border-line bg-white/[0.02] touch-manipulation transition-[background-color,border-color,color] duration-200 hover:bg-[rgba(168,85,247,0.1)] hover:border-violet hover:text-ink active:bg-[rgba(168,85,247,0.18)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent max-[700px]:px-[15px] max-[700px]:py-2.5 max-[700px]:text-[13.5px]"
          >
            Download PDF
            <span className="text-muted text-[12px]">113&nbsp;KB</span>
          </a>
        </div>

        <div className="mt-7 flex flex-wrap gap-2.5 max-[700px]:mt-6">
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
