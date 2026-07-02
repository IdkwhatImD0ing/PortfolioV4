"use client";

import { PORTFOLIO } from "@/lib/portfolio-data";
import { REVEAL_BASE, REVEAL_IN, useReveal } from "@/hooks/use-reveal";
import { cn } from "@/lib/utils";
import { scrollToSection } from "@/lib/voice-bus";

export function FooterSection() {
  const { ref, revealed } = useReveal<HTMLDivElement>();
  const linkClass =
    "flex items-center gap-2.5 py-2.5 border-b border-line-soft text-ink text-[17px] transition-[color,padding-left] duration-200 hover:text-magenta hover:pl-1.5";
  const arrowClass =
    "ml-auto opacity-50 transition-[transform,opacity] duration-200 group-hover/link:translate-x-1 group-hover/link:-translate-y-1 group-hover/link:opacity-100";
  return (
    <footer
      data-screen-label="09 Contact"
      className="relative overflow-hidden pt-[120px] pb-14 border-t border-line-soft bg-gradient-to-b from-transparent to-[rgba(192,132,252,0.04)] max-[700px]:pt-20"
    >
      <div className="max-w-[1280px] mx-auto px-8 max-[700px]:px-5">
        <div ref={ref} className={cn(REVEAL_BASE, revealed && REVEAL_IN)}>
          <span className="inline-flex items-center gap-2.5 font-mono text-[12px] tracking-[0.14em] uppercase text-accent px-3 py-1.5 border border-[rgba(192,132,252,0.35)] rounded-full bg-[rgba(192,132,252,0.08)]">
            <span className="w-1.5 h-1.5 rounded-full bg-magenta shadow-[0_0_10px_var(--magenta)]" />
            CONTACT
          </span>
          <h2 className="font-sans font-semibold text-[clamp(64px,13vw,220px)] -tracking-[0.02em] leading-[0.86] uppercase mt-4">
            Let&apos;s{" "}
            <em className="font-serif italic font-normal bg-[image:var(--grad)] bg-clip-text text-transparent normal-case">
              talk.
            </em>
            <br />
            (Literally.)
          </h2>
          <p className="mt-6 text-[19px] text-ink-soft max-w-[560px]">
            Tap the orb. Or, if you&apos;re old-school, send a normal email. I read every one.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-8 mt-16 pt-8 border-t border-line-soft max-[800px]:grid-cols-1 max-[800px]:gap-4 max-[700px]:mt-10">
          <div className="group/col">
            <h5 className="font-mono text-[11px] tracking-[0.18em] uppercase text-muted mb-3.5">
              Direct
            </h5>
            <a href={`mailto:${PORTFOLIO.email}`} data-cursor-hover className={`group/link ${linkClass}`}>
              {PORTFOLIO.email}
              <span className={arrowClass}>↗</span>
            </a>
            <a
              href="#hero"
              onClick={(e) => {
                e.preventDefault();
                scrollToSection("hero");
              }}
              data-cursor-hover
              className={`group/link ${linkClass}`}
            >
              Tap voice orb<span className={arrowClass}>↗</span>
            </a>
          </div>
          <div>
            <h5 className="font-mono text-[11px] tracking-[0.18em] uppercase text-muted mb-3.5">
              Elsewhere
            </h5>
            <a
              href={PORTFOLIO.github}
              target="_blank"
              rel="noreferrer"
              data-cursor-hover
              className={`group/link ${linkClass}`}
            >
              GitHub<span className={arrowClass}>↗</span>
            </a>
            <a
              href={PORTFOLIO.linkedin}
              target="_blank"
              rel="noreferrer"
              data-cursor-hover
              className={`group/link ${linkClass}`}
            >
              LinkedIn<span className={arrowClass}>↗</span>
            </a>
            <a
              href={PORTFOLIO.devpost}
              target="_blank"
              rel="noreferrer"
              data-cursor-hover
              className={`group/link ${linkClass}`}
            >
              Devpost<span className={arrowClass}>↗</span>
            </a>
          </div>
          <div>
            <h5 className="font-mono text-[11px] tracking-[0.18em] uppercase text-muted mb-3.5">
              Index
            </h5>
            <a
              href="#projects"
              onClick={(e) => {
                e.preventDefault();
                scrollToSection("projects");
              }}
              data-cursor-hover
              className={`group/link ${linkClass}`}
            >
              Projects<span className={arrowClass}>↗</span>
            </a>
            <a
              href="#hackathons"
              onClick={(e) => {
                e.preventDefault();
                scrollToSection("hackathons");
              }}
              data-cursor-hover
              className={`group/link ${linkClass}`}
            >
              Hackathons<span className={arrowClass}>↗</span>
            </a>
            <a
              href="#experience"
              onClick={(e) => {
                e.preventDefault();
                scrollToSection("experience");
              }}
              data-cursor-hover
              className={`group/link ${linkClass}`}
            >
              Experience<span className={arrowClass}>↗</span>
            </a>
          </div>
        </div>

        <div className="mt-16 font-mono text-[11px] tracking-[0.12em] uppercase text-muted max-[700px]:mt-10">
          <span>© 2026 BILL ZHANG</span>
        </div>
      </div>
    </footer>
  );
}
