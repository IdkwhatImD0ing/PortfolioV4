"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { PROJECTS, type Project } from "@/lib/portfolio-data";
import { VoiceBus } from "@/lib/voice-bus";
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

const STANDOUT_PROJECT_IDS = [
  "dispatchai",
  "adapted",
  "talktuahbank",
  "slugloop",
  "soundsearch",
  "swarmaid",
] as const;

const filterBtnBase =
  "font-mono text-[11.5px] tracking-[0.05em] px-3.5 py-2 rounded-full border border-line text-ink-soft bg-white/[0.02] transition-all duration-200 hover:border-[rgba(192,132,252,0.5)] hover:text-ink";
const filterBtnActive =
  "bg-[image:var(--grad)] text-white border-transparent shadow-[0_6px_20px_rgba(162,89,255,0.4)] hover:border-transparent";

export function ProjectsSection() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLElement>(null);

  const [filter, setFilter] = useState<string>("all");
  const [year, setYear] = useState<number | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);

  useEffect(
    () =>
      VoiceBus.on((cmd) => {
        if (cmd.type === "filter") {
          if (cmd.tag) {
            setFilter(cmd.tag);
            setYear(null);
            setFocusId(null);
          }
          if (cmd.year) {
            setYear(cmd.year);
            setFilter("all");
            setFocusId(null);
          }
          setTranscript(`Filtering by ${cmd.tag ?? cmd.year}.`);
          window.setTimeout(() => setTranscript(null), 2400);
        }
        if (cmd.type === "focus") {
          setFocusId(cmd.id);
          setFilter("all");
          setYear(null);
          setTranscript(`Focusing on ${cmd.id}.`);
          window.setTimeout(() => setTranscript(null), 2400);
        }
        if (cmd.type === "open") {
          setOpenId(cmd.id);
          setTranscript(`Opening ${cmd.id}.`);
          window.setTimeout(() => setTranscript(null), 2400);
        }
      }),
    [],
  );

  useEffect(() => {
    if (!openId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenId(null);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [openId]);

  const open = openId ? PROJECTS.find((p) => p.id === openId) ?? null : null;
  const isCuratedRail = filter === "all" && !year && !focusId;
  const isMatch = (p: Project) => {
    if (focusId) return p.id === focusId;
    if (year && p.year !== year) return false;
    if (filter === "all") return true;
    return p.tags.includes(filter);
  };
  const standoutProjects = STANDOUT_PROJECT_IDS.map((id) =>
    PROJECTS.find((p) => p.id === id),
  ).filter((p): p is Project => Boolean(p));
  const railProjects = isCuratedRail
    ? standoutProjects
    : PROJECTS.filter(isMatch);
  const railHeight = `${Math.max(220, railProjects.length * 26)}vh`;

  useEffect(() => {
    const wrap = wrapRef.current;
    const track = trackRef.current;
    const prog = progressRef.current;
    if (!wrap || !track) return;

    let raf = 0;
    const update = () => {
      const r = wrap.getBoundingClientRect();
      const dist = wrap.offsetHeight - window.innerHeight;
      const p = Math.max(0, Math.min(1, -r.top / Math.max(1, dist)));
      const max = track.scrollWidth - window.innerWidth + 32;
      track.style.transform = `translate3d(${-p * Math.max(0, max)}px, 0, 0)`;
      if (prog) prog.style.width = `${p * 100}%`;
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [railProjects.length]);

  return (
    <section
      id="projects"
      data-screen-label="03 Projects"
      className="relative"
    >
      <div ref={wrapRef} className="relative" style={{ height: railHeight }}>
        <div className="sticky top-0 h-screen flex flex-col overflow-hidden">
          <div className="flex-none px-[8vw] pt-[5vh] pb-[18px] flex justify-between items-end gap-6 z-[5] bg-gradient-to-b from-[rgba(7,6,13,0.85)] from-0% via-[rgba(7,6,13,0.6)] via-70% to-transparent to-100% backdrop-blur-md">
            <div>
              <span className="inline-flex items-center gap-2.5 font-mono text-[12px] tracking-[0.14em] uppercase text-accent px-3 py-1.5 border border-[rgba(192,132,252,0.35)] rounded-full bg-[rgba(192,132,252,0.08)]">
                <span className="w-1.5 h-1.5 rounded-full bg-magenta shadow-[0_0_10px_var(--magenta)]" />
                PROJECTS ·{" "}
                {isCuratedRail
                  ? `${railProjects.length} STANDOUTS`
                  : `${railProjects.length}/${PROJECTS.length}`}
              </span>
              <h2 className="font-sans text-[clamp(48px,7vw,96px)] -tracking-[0.04em] font-semibold leading-[0.95] mt-3.5 text-balance">
                Things I{" "}
                <em className="font-serif italic font-normal bg-[image:var(--grad)] bg-clip-text text-transparent">
                  shipped.
                </em>
              </h2>
              <div className="flex flex-wrap gap-2 mt-[18px]">
                {FILTERS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    data-cursor-hover
                    onClick={() => {
                      setFilter(f.key);
                      setYear(null);
                      setFocusId(null);
                    }}
                    className={cn(
                      filterBtnBase,
                      filter === f.key && !focusId && !year && filterBtnActive,
                    )}
                  >
                    {f.label}
                  </button>
                ))}
                <button
                  type="button"
                  data-cursor-hover
                  onClick={() => {
                    setYear(year === 2025 ? null : 2025);
                    setFocusId(null);
                  }}
                  className={cn(filterBtnBase, year === 2025 && filterBtnActive)}
                >
                  2025
                </button>
                <button
                  type="button"
                  data-cursor-hover
                  onClick={() => {
                    setYear(year === 2024 ? null : 2024);
                    setFocusId(null);
                  }}
                  className={cn(filterBtnBase, year === 2024 && filterBtnActive)}
                >
                  2024
                </button>
              </div>
            </div>
            <div className="min-w-[260px] text-right">
              <div className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase">
                Curated gallery
              </div>
              <div className="font-mono text-[12.5px] text-ink-soft mt-1.5">
                Ask by voice for any project, or filter the archive.
              </div>
            </div>
          </div>

          <div
            ref={trackRef}
            className="flex-auto flex items-center gap-6 px-[8vw] will-change-transform min-h-0"
          >
            {railProjects.map((p) => {
              const match = isCuratedRail || isMatch(p);
              const isFocus = focusId === p.id;
              return (
                <article
                  key={p.id}
                  data-cursor-hover
                  onClick={() => setOpenId(p.id)}
                  className={cn(
                    "group/card flex-none w-[460px] h-[min(58vh,540px)] rounded-3xl bg-gradient-to-b from-card to-card-2 border border-line relative overflow-hidden flex flex-col cursor-pointer transition-[transform,opacity,filter] duration-[350ms] ease-[cubic-bezier(0.2,0.8,0.2,1)]",
                    !match && "opacity-[0.32] [filter:saturate(0.4)_blur(0.5px)]",
                    isFocus &&
                      "shadow-[0_30px_80px_rgba(162,89,255,0.45),0_0_0_1px_rgba(232,121,249,0.65)] -translate-y-1.5 scale-[1.015]",
                  )}
                >
                  <div className="h-[56%] relative overflow-hidden bg-[radial-gradient(120%_100%_at_0%_0%,rgba(192,132,252,0.35),transparent_60%),radial-gradient(120%_100%_at_100%_100%,rgba(232,121,249,0.35),transparent_60%),#1a1430]">
                    {p.poster ? (
                      <Image
                        src={p.poster}
                        alt={`${p.name} demo still`}
                        fill
                        sizes="460px"
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
            })}
            <div className="flex-none w-[8vw]" />
          </div>

          <div className="flex-none px-[8vw] py-[18px] pb-[4vh] flex justify-between items-end gap-6 bg-gradient-to-t from-[rgba(7,6,13,0.85)] from-0% via-[rgba(7,6,13,0.6)] via-70% to-transparent to-100% font-mono text-[11.5px] text-muted tracking-[0.04em] z-[5]">
            <div>
              <span className="text-ink-soft">SCROLL ↓</span> drives gallery →
            </div>
            <div className="w-[220px] h-0.5 bg-line rounded-full overflow-hidden">
              <i
                ref={progressRef}
                className="block h-full w-0 bg-[image:var(--grad)] transition-[width] duration-150 ease-linear"
              />
            </div>
            <div className="min-w-[200px] text-right">
              {transcript ? (
                <span className="text-magenta">↳ {transcript}</span>
              ) : (
                <span>
                  {isCuratedRail
                    ? `${railProjects.length}/${PROJECTS.length} standouts`
                    : `${railProjects.length}/${PROJECTS.length} match`}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
      {open && <ProjectDetail project={open} onClose={() => setOpenId(null)} />}
    </section>
  );
}

function toEmbed(url?: string) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "youtu.be") {
      const id = parsed.pathname.split("/").filter(Boolean)[0];
      return id ? `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1` : null;
    }
    if (parsed.hostname.endsWith("youtube.com")) {
      const embedId =
        parsed.searchParams.get("v") ??
        parsed.pathname.match(/^\/(?:embed|shorts)\/([^/?]+)/)?.[1];
      return embedId
        ? `https://www.youtube.com/embed/${embedId}?rel=0&modestbranding=1`
        : null;
    }
  } catch {
    return null;
  }
  return null;
}
function isImage(url?: string) {
  return /\.(jpg|jpeg|png|gif|webp)/i.test(url ?? "");
}

function ProjectDetail({
  project,
  onClose,
}: {
  project: Project;
  onClose: () => void;
}) {
  const p = project;
  const demoLink = p.videoUrl ?? p.demo;
  const embed = toEmbed(demoLink);
  const img = !embed && isImage(p.demo) ? p.demo : null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[200] bg-[rgba(4,3,12,0.78)] backdrop-blur-[18px] grid place-items-center p-8 animate-scrim-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-[min(1080px,100%)] max-h-[calc(100vh-64px)] bg-gradient-to-b from-[#14101e] to-[#0c0916] border border-line rounded-[22px] overflow-auto shadow-[0_40px_120px_rgba(168,85,247,0.18),0_0_0_1px_rgba(168,85,247,0.12)] animate-detail-in"
      >
        <button
          type="button"
          onClick={onClose}
          data-cursor-hover
          className="sticky top-4 left-[calc(100%-56px)] z-[4] w-10 h-10 rounded-full bg-[rgba(15,12,28,0.85)] border border-line text-ink text-[22px] leading-none cursor-pointer grid place-items-center transition-[background-color,transform] duration-200 hover:bg-magenta hover:text-white hover:rotate-90"
        >
          ×
        </button>
        <div className="px-9 pt-2 -mt-10 max-[800px]:px-6">
          <div className="inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.18em] uppercase text-violet">
            <span className="w-1.5 h-1.5 rounded-full bg-magenta shadow-[0_0_10px_var(--magenta)]" />
            {p.award ? `★ ${p.award}` : `Project · ${p.year}`}
          </div>
          <h3 className="font-serif text-[clamp(36px,4.4vw,56px)] -tracking-[0.02em] leading-[1.02] mt-3 mb-2 bg-gradient-to-br from-ink to-violet bg-clip-text text-transparent">
            {p.name}
          </h3>
          <p className="text-ink-soft text-[17px] leading-[1.5] max-w-[720px]">{p.summary}</p>
        </div>
        <div className="mx-9 mt-6 rounded-[14px] overflow-hidden border border-line aspect-video bg-[#050410] relative max-[800px]:mx-6 max-[800px]:mt-[18px]">
          {embed ? (
            <iframe
              src={embed}
              title={`${p.name} demo video`}
              allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              loading="lazy"
              className="absolute inset-0 w-full h-full border-0"
            />
          ) : img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img} alt={p.name} className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_50%_40%,rgba(168,85,247,0.18),transparent_60%)] text-center">
              <div>
                <span className="block font-serif text-[64px] -tracking-[0.03em] bg-gradient-to-br from-violet to-magenta bg-clip-text text-transparent">
                  /{p.id}
                </span>
                <span className="text-muted font-mono text-[12px] tracking-[0.12em] uppercase mt-3 block">
                  Demo media not available — check the project links.
                </span>
              </div>
            </div>
          )}
        </div>
        <div className="grid grid-cols-[1.6fr_1fr] gap-8 px-9 pt-8 pb-9 max-[800px]:grid-cols-1 max-[800px]:gap-6 max-[800px]:px-6">
          <div>
            <h5 className="font-mono text-[11px] tracking-[0.18em] uppercase text-muted mb-3">
              The story
            </h5>
            <p className="text-ink-soft text-[16px] leading-[1.65] mb-6 text-pretty">
              {p.long || p.summary}
            </p>
            {p.role && (
              <div className="grid grid-cols-[80px_1fr] gap-4 py-3.5 border-t border-line-soft items-start">
                <span className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-muted pt-1">
                  Role
                </span>
                <span className="text-ink text-[14.5px] leading-[1.55]">{p.role}</span>
              </div>
            )}
            {p.stack && (
              <div className="grid grid-cols-[80px_1fr] gap-4 py-3.5 border-t border-line-soft items-start">
                <span className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-muted pt-1">
                  Stack
                </span>
                <span className="flex flex-wrap gap-1.5">
                  {p.stack.map((s) => (
                    <span
                      key={s}
                      className="font-mono text-[11px] px-2.5 py-1 border border-line rounded-md bg-[rgba(168,85,247,0.08)] text-ink"
                    >
                      {s}
                    </span>
                  ))}
                </span>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-[18px]">
            <div className="grid grid-cols-[60px_1fr] gap-x-3.5 gap-y-2.5 px-[18px] py-[18px] border border-line rounded-xl bg-[rgba(15,12,28,0.4)] text-[13.5px]">
              <span className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-muted self-center">
                Year
              </span>
              <span>{p.year}</span>
              <span className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-muted self-center">
                ID
              </span>
              <span>/{p.id}</span>
              <span className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-muted self-center">
                Tags
              </span>
              <span className="flex flex-wrap gap-1.5">
                {p.tags.map((t) => (
                  <em
                    key={t}
                    className="not-italic font-mono text-[11px] text-violet px-2 py-0.5 rounded-full bg-[rgba(126,109,253,0.12)] border border-[rgba(126,109,253,0.3)]"
                  >
                    #{t}
                  </em>
                ))}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {demoLink && (
                <a
                  href={demoLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-cursor-hover
                  className="flex items-center gap-3 px-4 py-3.5 rounded-[10px] border border-line bg-[rgba(15,12,28,0.5)] text-ink no-underline text-[14px] transition-[background-color,border-color,transform] duration-200 hover:bg-[rgba(168,85,247,0.12)] hover:border-violet hover:translate-x-[3px]"
                >
                  <span className="w-7 h-7 grid place-items-center font-mono text-[12px] rounded-full bg-gradient-to-br from-violet to-magenta text-white">
                    ▶
                  </span>{" "}
                  {embed ? "Watch on YouTube" : "View demo media"}
                </a>
              )}
              {p.projectUrl && (
                <a
                  href={p.projectUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-cursor-hover
                  className="flex items-center gap-3 px-4 py-3.5 rounded-[10px] border border-line bg-[rgba(15,12,28,0.5)] text-ink no-underline text-[14px] transition-[background-color,border-color,transform] duration-200 hover:bg-[rgba(168,85,247,0.12)] hover:border-violet hover:translate-x-[3px]"
                >
                  <span className="w-7 h-7 grid place-items-center font-mono text-[12px] rounded-full bg-gradient-to-br from-violet to-magenta text-white">
                    ↗
                  </span>{" "}
                  Live project
                </a>
              )}
              {p.github && (
                <a
                  href={p.github}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-cursor-hover
                  className="flex items-center gap-3 px-4 py-3.5 rounded-[10px] border border-line bg-[rgba(15,12,28,0.5)] text-ink no-underline text-[14px] transition-[background-color,border-color,transform] duration-200 hover:bg-[rgba(168,85,247,0.12)] hover:border-violet hover:translate-x-[3px]"
                >
                  <span className="w-7 h-7 grid place-items-center font-mono text-[12px] rounded-full bg-gradient-to-br from-violet to-magenta text-white">
                    {`</>`}
                  </span>{" "}
                  Source on GitHub
                </a>
              )}
            </div>
            <div className="px-4 py-3.5 rounded-[10px] border border-dashed border-[rgba(168,85,247,0.35)] bg-[rgba(168,85,247,0.05)]">
              <span className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-magenta">
                Voice tip
              </span>
              <p className="mt-1.5 text-ink-soft text-[13px] leading-[1.5]">
                &ldquo;Tell me more about{" "}
                <em className="text-ink italic font-serif">{p.name.toLowerCase()}</em>
                &rdquo; opens this view.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
