import { type Hackathon } from "@/lib/portfolio-data";
import { cn } from "@/lib/utils";

/** One marquee card: name → year → prize, all on one line. */
export function HackCard({ h, tone }: { h: Hackathon; tone: string }) {
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
