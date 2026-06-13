import Image from "next/image";
import { type Project } from "@/lib/portfolio-data";
import { cn } from "@/lib/utils";

export function ProjectCard({
  project: p,
  match,
  isFocus,
  filter,
  focusId,
  sizes,
  onOpen,
  className,
}: {
  project: Project;
  match: boolean;
  isFocus: boolean;
  filter: string;
  focusId: string | null;
  sizes: string;
  onOpen: (id: string) => void;
  className?: string;
}) {
  return (
    <article
      data-cursor-hover
      onClick={() => onOpen(p.id)}
      className={cn(
        "group/card rounded-3xl bg-gradient-to-b from-card to-card-2 border border-line relative overflow-hidden flex flex-col cursor-pointer transition-[transform,opacity,filter] duration-[350ms] ease-[cubic-bezier(0.2,0.8,0.2,1)]",
        !match && "opacity-[0.32] [filter:saturate(0.4)_blur(0.5px)]",
        isFocus &&
          "shadow-[0_30px_80px_rgba(162,89,255,0.45),0_0_0_1px_rgba(232,121,249,0.65)] -translate-y-1.5 scale-[1.015]",
        className,
      )}
    >
      <div className="h-[56%] relative overflow-hidden bg-[radial-gradient(120%_100%_at_0%_0%,rgba(192,132,252,0.35),transparent_60%),radial-gradient(120%_100%_at_100%_100%,rgba(232,121,249,0.35),transparent_60%),#1a1430]">
        {p.poster ? (
          <Image
            src={p.poster}
            alt={`${p.name} demo still`}
            fill
            sizes={sizes}
            className="object-cover opacity-80 saturate-[0.95] transition-[transform,opacity,filter] duration-500 group-hover/card:scale-105 group-hover/card:opacity-100"
          />
        ) : (
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.05)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.05)_50%,rgba(255,255,255,0.05)_75%,transparent_75%)] [background-size:40px_40px] opacity-60" />
        )}
        <div className="absolute inset-0 bg-[radial-gradient(120%_100%_at_0%_0%,rgba(192,132,252,0.26),transparent_58%),linear-gradient(to_bottom,rgba(6,5,13,0.12),rgba(6,5,13,0.7))]" />
        {p.award && (
          <span className="absolute top-3.5 left-3.5 max-w-[calc(100%-28px)] font-mono text-[10.5px] tracking-[0.12em] uppercase text-[#fff7cc] bg-[rgba(7,6,13,0.82)] px-3 py-1.5 rounded-full border border-[rgba(252,211,77,0.55)] inline-flex items-center gap-1.5 z-[1] shadow-[0_8px_24px_rgba(0,0,0,0.45)] backdrop-blur-md">
            ★ {p.award}
          </span>
        )}
        <span className="absolute bottom-3 left-3.5 font-mono text-[11px] tracking-[0.14em] uppercase text-ink-soft bg-black/40 px-2 py-1 rounded backdrop-blur-sm z-[1]">
          /{p.id}
        </span>
        <span className="absolute right-3.5 top-3.5 font-mono text-[10.5px] tracking-[0.14em] uppercase text-ink px-2.5 py-1 rounded-full bg-[rgba(168,85,247,0.22)] border border-[rgba(168,85,247,0.4)] opacity-0 -translate-y-1 transition-[opacity,transform] duration-[250ms] group-hover/card:opacity-100 group-hover/card:translate-y-0 z-[1]">
          ↗ deep dive
        </span>
      </div>
      <div className="px-6 pt-5 pb-6 flex flex-col gap-2.5 flex-1">
        <h4 className="text-[26px] -tracking-[0.02em] font-semibold m-0">{p.name}</h4>
        <p className="text-[14px] leading-[1.45] text-ink-soft m-0 flex-1">{p.summary}</p>
        <div className="flex flex-wrap gap-1.5 mt-auto">
          {p.tags.map((t) => (
            <span
              key={t}
              className={cn(
                "font-mono text-[10.5px] px-2 py-1 rounded border border-line-soft text-ink-soft lowercase",
                match &&
                  (t === filter || (filter === "all" && focusId === p.id)) &&
                  "text-magenta border-[rgba(232,121,249,0.45)] bg-[rgba(232,121,249,0.08)]",
              )}
            >
              #{t}
            </span>
          ))}
          <span className="font-mono text-[10.5px] px-2 py-1 rounded border border-line-soft text-ink-soft lowercase ml-auto">
            {p.year}
          </span>
        </div>
      </div>
    </article>
  );
}
