"use client";

import { EXPERIENCE } from "@/lib/portfolio-data";
import { REVEAL_BASE, REVEAL_IN, useReveal } from "@/hooks/use-reveal";
import { cn } from "@/lib/utils";

export function ExperienceRow({ item }: { item: (typeof EXPERIENCE)[number] }) {
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
