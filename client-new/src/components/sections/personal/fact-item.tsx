"use client";

import { REVEAL_BASE, REVEAL_IN, useReveal } from "@/hooks/use-reveal";
import { cn } from "@/lib/utils";

export function FactItem({ fact }: { fact: { icon: string; line: string } }) {
  const { ref, revealed } = useReveal<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={cn(
        "flex gap-4 px-[18px] py-3.5 rounded-[14px] border border-line-soft bg-white/[0.015]",
        REVEAL_BASE,
        revealed && REVEAL_IN,
      )}
    >
      <span className="font-serif italic text-magenta text-[22px] leading-none min-w-[28px]">
        {fact.icon}
      </span>
      <span
        className="text-[15.5px] leading-[1.4] text-ink-soft [&>b]:text-ink [&>b]:font-semibold"
        dangerouslySetInnerHTML={{ __html: fact.line }}
      />
    </div>
  );
}
