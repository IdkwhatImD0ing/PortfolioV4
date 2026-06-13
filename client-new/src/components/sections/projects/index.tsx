"use client";

import { useEffect, useRef, useState } from "react";
import { PROJECTS, findProject, type Project } from "@/lib/portfolio-data";
import { loadFallbackProject } from "@/lib/project-fallback";
import { VoiceBus, scrollToSection } from "@/lib/voice-bus";
import { useIsMobile } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import { PROJECT_HASH_PREFIX, STANDOUT_PROJECT_IDS } from "./constants";
import { FilterBar } from "./filter-bar";
import { ProjectCard } from "./project-card";
import { ProjectDetail } from "./project-detail";

export function ProjectsSection() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLElement>(null);
  const carouselRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);

  const isMobile = useIsMobile();

  const [filter, setFilter] = useState<string>("all");
  const [year, setYear] = useState<number | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [openProject, setOpenProject] = useState<Project | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [activeCard, setActiveCard] = useState(0);

  const pickFilter = (key: string) => {
    setFilter(key);
    setYear(null);
    setFocusId(null);
  };
  const pickYear = (y: number) => {
    setYear(year === y ? null : y);
    setFocusId(null);
  };

  // Resolve openId to a Project: curated PROJECTS first, then lazy-load from
  // the Pinecone corpus for archived ones the agent surfaces.
  useEffect(() => {
    if (!openId) {
      setOpenProject(null);
      return;
    }
    const known = findProject(openId);
    if (known) {
      setOpenProject(known);
      return;
    }
    let cancelled = false;
    loadFallbackProject(openId).then((p) => {
      if (!cancelled) setOpenProject(p);
    });
    return () => {
      cancelled = true;
    };
  }, [openId]);

  // Deep linking: parse `#project/<id>` on mount + sync hash when modal opens/closes.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (hash.startsWith(PROJECT_HASH_PREFIX)) {
      const rawId = decodeURIComponent(hash.slice(PROJECT_HASH_PREFIX.length));
      if (rawId) {
        const known = findProject(rawId);
        setOpenId(known?.id ?? rawId);
        // Defer scroll so the section is laid out by the time we jump.
        requestAnimationFrame(() => scrollToSection("projects"));
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const currentHash = window.location.hash;
    if (openId) {
      const next = `${PROJECT_HASH_PREFIX}${encodeURIComponent(openId)}`;
      if (currentHash !== next) {
        window.history.replaceState(null, "", next);
      }
    } else if (currentHash.startsWith(PROJECT_HASH_PREFIX)) {
      // Clear only our own hash; don't clobber section anchors set by other code.
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, [openId]);

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
          setOpenId(null);
          setTranscript(`Filtering by ${cmd.tag ?? cmd.year}.`);
          window.setTimeout(() => setTranscript(null), 2400);
        }
        if (cmd.type === "focus") {
          const project = findProject(cmd.id);
          if (!project) return;
          setFocusId(project.id);
          setFilter("all");
          setYear(null);
          setOpenId(null);
          setTranscript(`Focusing on ${project.name}.`);
          window.setTimeout(() => setTranscript(null), 2400);
        }
        if (cmd.type === "open") {
          // Allow opening any project the agent surfaces, even archived ones
          // that aren't in the curated PROJECTS array. Known projects keep
          // their local id (for stable URLs); unknown ones use the raw id and
          // get lazy-loaded from the Pinecone corpus.
          const known = findProject(cmd.id);
          setOpenId(known?.id ?? cmd.id);
          setTranscript(`Opening ${known?.name ?? cmd.id}.`);
          window.setTimeout(() => setTranscript(null), 2400);
        }
        if (cmd.type === "scroll") {
          setOpenId(null);
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

  const open = openProject;
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
    // Mobile uses a native scroll-snap carousel, not the scroll-jacked rail.
    if (isMobile) return;
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
  }, [railProjects.length, isMobile]);

  // Mobile carousel: track which card is centered for the pagination dots.
  const onCarouselScroll = () => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const el = carouselRef.current;
      if (!el) return;
      const center = el.scrollLeft + el.clientWidth / 2;
      let best = 0;
      let bestDist = Infinity;
      Array.from(el.children).forEach((c, i) => {
        const card = c as HTMLElement;
        const cardCenter = card.offsetLeft + card.offsetWidth / 2;
        const d = Math.abs(cardCenter - center);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      });
      setActiveCard(best);
    });
  };

  const scrollToCard = (i: number) => {
    const el = carouselRef.current;
    const card = el?.children[i] as HTMLElement | undefined;
    card?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  };

  // When a filter/focus changes the mobile rail, snap back to the first card.
  useEffect(() => {
    if (!isMobile) return;
    carouselRef.current?.scrollTo({ left: 0 });
    setActiveCard(0);
  }, [filter, year, focusId, isMobile]);

  const railCount = isCuratedRail
    ? `${railProjects.length} STANDOUTS`
    : `${railProjects.length}/${PROJECTS.length}`;

  return (
    <section id="projects" data-screen-label="03 Projects" className="relative">
      {isMobile ? (
        <div className="px-[6vw] pt-[7vh] pb-[6vh]">
          <span className="inline-flex items-center gap-2.5 font-mono text-[11px] tracking-[0.14em] uppercase text-accent px-3 py-1.5 border border-[rgba(192,132,252,0.35)] rounded-full bg-[rgba(192,132,252,0.08)]">
            <span className="w-1.5 h-1.5 rounded-full bg-magenta shadow-[0_0_10px_var(--magenta)]" />
            PROJECTS · {railCount}
          </span>
          <h2 className="font-sans text-[clamp(40px,11vw,64px)] -tracking-[0.02em] font-semibold leading-[0.95] mt-4 text-balance">
            Things I{" "}
            <em className="font-serif italic font-normal bg-[image:var(--grad)] bg-clip-text text-transparent">
              shipped.
            </em>
          </h2>
          <p className="font-mono text-[12.5px] text-ink-soft mt-3">
            Swipe the cards, ask by voice, or filter the archive.
          </p>

          <FilterBar
            filter={filter}
            year={year}
            focusId={focusId}
            onPick={pickFilter}
            onYear={pickYear}
            className="mt-5"
          />

          <div
            ref={carouselRef}
            onScroll={onCarouselScroll}
            className="mt-6 flex gap-4 overflow-x-auto snap-x snap-mandatory -mx-[6vw] px-[6vw] pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          >
            {railProjects.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                match={isCuratedRail || isMatch(p)}
                isFocus={focusId === p.id}
                filter={filter}
                focusId={focusId}
                sizes="84vw"
                onOpen={setOpenId}
                className="snap-center shrink-0 w-[84vw] max-w-[400px] h-[62vh] max-h-[560px]"
              />
            ))}
          </div>

          {railProjects.length > 1 && (
            <div className="flex justify-center flex-wrap gap-2 mt-5">
              {railProjects.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => scrollToCard(i)}
                  aria-label={`Show ${p.name}`}
                  aria-current={i === activeCard}
                  className={cn(
                    "h-2 rounded-full transition-all duration-300",
                    i === activeCard
                      ? "w-6 bg-[image:var(--grad)]"
                      : "w-2 bg-line",
                  )}
                />
              ))}
            </div>
          )}

          <div className="mt-4 text-center font-mono text-[11.5px] text-muted tracking-[0.04em] min-h-[18px]">
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
      ) : (
        <div ref={wrapRef} className="relative" style={{ height: railHeight }}>
          <div className="sticky top-0 h-screen flex flex-col overflow-hidden">
            <div className="flex-none px-[8vw] pt-[5vh] pb-[18px] flex justify-between items-end gap-6 z-[5] bg-gradient-to-b from-[rgba(7,6,13,0.85)] from-0% via-[rgba(7,6,13,0.6)] via-70% to-transparent to-100% backdrop-blur-md">
              <div>
                <span className="inline-flex items-center gap-2.5 font-mono text-[12px] tracking-[0.14em] uppercase text-accent px-3 py-1.5 border border-[rgba(192,132,252,0.35)] rounded-full bg-[rgba(192,132,252,0.08)]">
                  <span className="w-1.5 h-1.5 rounded-full bg-magenta shadow-[0_0_10px_var(--magenta)]" />
                  PROJECTS · {railCount}
                </span>
                <h2 className="font-sans text-[clamp(48px,7vw,96px)] -tracking-[0.02em] font-semibold leading-[0.95] mt-3.5 text-balance">
                  Things I{" "}
                  <em className="font-serif italic font-normal bg-[image:var(--grad)] bg-clip-text text-transparent">
                    shipped.
                  </em>
                </h2>
                <FilterBar
                  filter={filter}
                  year={year}
                  focusId={focusId}
                  onPick={pickFilter}
                  onYear={pickYear}
                  className="mt-[18px]"
                />
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
              {railProjects.map((p) => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  match={isCuratedRail || isMatch(p)}
                  isFocus={focusId === p.id}
                  filter={filter}
                  focusId={focusId}
                  sizes="460px"
                  onOpen={setOpenId}
                  className="flex-none w-[460px] h-[min(58vh,540px)]"
                />
              ))}
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
      )}
      {open && <ProjectDetail project={open} onClose={() => setOpenId(null)} />}
    </section>
  );
}
