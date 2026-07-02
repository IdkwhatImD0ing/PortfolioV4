import { cn } from "@/lib/utils";

const FILTERS = [
  { key: "all", label: "Standouts" },
  { key: "voice", label: "Voice" },
  { key: "ai", label: "AI" },
  { key: "fintech", label: "Fintech" },
  { key: "safety", label: "Safety" },
  { key: "education", label: "Education" },
  { key: "3d", label: "3D" },
  { key: "winner", label: "Winners" },
] as const;

const filterBtnBase =
  "font-mono text-[11.5px] tracking-[0.05em] px-3.5 py-2 rounded-full border border-line text-ink-soft bg-white/[0.02] transition-all duration-200 hover:border-[rgba(192,132,252,0.5)] hover:text-ink";
const filterBtnActive =
  "bg-[image:var(--grad)] text-white border-transparent shadow-[0_6px_20px_rgba(162,89,255,0.4)] hover:border-transparent";

export function FilterBar({
  filter,
  year,
  focusId,
  onPick,
  onYear,
  className,
}: {
  filter: string;
  year: number | null;
  focusId: string | null;
  onPick: (key: string) => void;
  onYear: (year: number) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {FILTERS.map((f) => (
        <button
          key={f.key}
          type="button"
          data-cursor-hover
          onClick={() => onPick(f.key)}
          className={cn(
            filterBtnBase,
            filter === f.key && !focusId && !year && filterBtnActive,
          )}
        >
          {f.label}
        </button>
      ))}
      {[2025, 2024].map((y) => (
        <button
          key={y}
          type="button"
          data-cursor-hover
          onClick={() => onYear(y)}
          className={cn(filterBtnBase, year === y && filterBtnActive)}
        >
          {y}
        </button>
      ))}
    </div>
  );
}
