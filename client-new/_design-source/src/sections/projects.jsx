/* global React, VoiceBus */
const { useEffect, useRef, useState } = React;

const FILTERS = [
  { key: "all",    label: "All" },
  { key: "voice",  label: "Voice" },
  { key: "ai",     label: "AI" },
  { key: "fintech",label: "Fintech" },
  { key: "safety", label: "Safety" },
  { key: "education", label: "Education" },
  { key: "3d",     label: "3D" },
  { key: "winner", label: "Winners" },
];

window.ProjectsSection = function ProjectsSection() {
  const projects = window.PROJECTS;
  const wrapRef = useRef(null);
  const pinRef = useRef(null);
  const trackRef = useRef(null);
  const progressRef = useRef(null);

  const [filter, setFilter] = useState("all");
  const [year, setYear] = useState(null);
  const [focusId, setFocusId] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [transcript, setTranscript] = useState(null);

  // Subscribe to voice commands
  useEffect(() => VoiceBus.on((cmd) => {
    if (cmd.type === "filter") {
      if (cmd.tag) { setFilter(cmd.tag); setYear(null); setFocusId(null); }
      if (cmd.year) { setYear(cmd.year); setFilter("all"); setFocusId(null); }
      setTranscript(`Filtering by ${cmd.tag || cmd.year}.`);
      setTimeout(() => setTranscript(null), 2400);
      // scroll the projects section into view if not already
    }
    if (cmd.type === "focus") {
      setFocusId(cmd.id); setFilter("all"); setYear(null);
      setTranscript(`Focusing on ${cmd.id}.`);
      setTimeout(() => setTranscript(null), 2400);
    }
    if (cmd.type === "open") {
      setOpenId(cmd.id);
      setTranscript(`Opening ${cmd.id}.`);
      setTimeout(() => setTranscript(null), 2400);
    }
  }), []);

  // Close detail on Escape
  useEffect(() => {
    if (!openId) return;
    const onKey = (e) => { if (e.key === "Escape") setOpenId(null); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [openId]);

  const open = openId ? projects.find((p) => p.id === openId) : null;

  // Horizontal scroll: convert vertical scroll to translateX while pinned
  useEffect(() => {
    const wrap = wrapRef.current, track = trackRef.current, prog = progressRef.current;
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
    const onScroll = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); };
  }, []);

  const isMatch = (p) => {
    if (focusId) return p.id === focusId;
    if (year && p.year !== year) return false;
    if (filter === "all") return true;
    return p.tags.includes(filter);
  };

  return (
    <section id="projects" className="projects-section" data-screen-label="03 Projects">
      <div className="projects-track-wrap" ref={wrapRef}>
        <div className="projects-pin" ref={pinRef}>
          <div className="projects-head">
            <div>
              <span className="section-eyebrow"><span className="dot"></span>PROJECTS · 12</span>
              <h2 className="section-title" style={{ marginTop: 14 }}>Things I <em>shipped.</em></h2>
              <div className="proj-filters">
                {FILTERS.map((f) => (
                  <button
                    key={f.key}
                    className={`proj-filter ${(filter === f.key && !focusId && !year) ? "active" : ""}`}
                    onClick={() => { setFilter(f.key); setYear(null); setFocusId(null); }}
                    data-cursor-hover
                  >
                    {f.label}
                  </button>
                ))}
                <button
                  className={`proj-filter ${year === 2025 ? "active" : ""}`}
                  onClick={() => { setYear(year === 2025 ? null : 2025); setFocusId(null); }}
                  data-cursor-hover
                >2025</button>
                <button
                  className={`proj-filter ${year === 2024 ? "active" : ""}`}
                  onClick={() => { setYear(year === 2024 ? null : 2024); setFocusId(null); }}
                  data-cursor-hover
                >2024</button>
              </div>
            </div>
            <div style={{ minWidth: 260, textAlign: "right" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.14em", color: "var(--muted)", textTransform: "uppercase" }}>
                Voice-controlled gallery
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, color: "var(--ink-soft)", marginTop: 6 }}>
                Try: "Show me only voice AI projects."
              </div>
            </div>
          </div>

          <div className="projects-track" ref={trackRef}>
            {projects.map((p) => {
              const match = isMatch(p);
              const isFocus = focusId === p.id;
              return (
                <article
                  key={p.id}
                  className={`project-card ${match ? "" : "dim"} ${isFocus ? "focus" : ""}`}
                  data-cursor-hover
                  onClick={() => setOpenId(p.id)}
                >
                  <div className="thumb">
                    {p.award && <span className="award">★ {p.award}</span>}
                    <span className="label">/{p.id}</span>
                    <span className="open-hint">↗ deep dive</span>
                  </div>
                  <div className="body">
                    <h4>{p.name}</h4>
                    <p>{p.summary}</p>
                    <div className="tags">
                      {p.tags.map((t) => (
                        <span key={t} className={`tag ${match && (t === filter || (filter === "all" && focusId === p.id)) ? "match" : ""}`}>
                          #{t}
                        </span>
                      ))}
                      <span className="tag" style={{ marginLeft: "auto" }}>{p.year}</span>
                    </div>
                  </div>
                </article>
              );
            })}
            <div style={{ flex: "0 0 8vw" }}></div>
          </div>

          <div className="projects-foot">
            <div>
              <span style={{ color: "var(--ink-soft)" }}>SCROLL ↓</span> drives gallery →
            </div>
            <div className="projects-progress"><i ref={progressRef}></i></div>
            <div style={{ minWidth: 200, textAlign: "right" }}>
              {transcript ? (
                <span style={{ color: "var(--magenta)" }}>↳ {transcript}</span>
              ) : (
                <span>{projects.filter(isMatch).length}/{projects.length} match</span>
              )}
            </div>
          </div>
        </div>
      </div>
      {open && <ProjectDetail project={open} onClose={() => setOpenId(null)} />}
    </section>
  );
};

function toEmbed(url) {
  if (!url) return null;
  const m = url.match(/youtu\.be\/([^?&/]+)/) || url.match(/youtube\.com\/watch\?v=([^&]+)/);
  return m ? `https://www.youtube.com/embed/${m[1]}?rel=0&modestbranding=1` : null;
}
function isImage(url) { return /\.(jpg|jpeg|png|gif|webp)/i.test(url || ""); }

function ProjectDetail({ project, onClose }) {
  const p = project;
  const embed = toEmbed(p.demo);
  const img = !embed && isImage(p.demo) ? p.demo : null;
  return (
    <div className="pdetail-scrim" onClick={onClose}>
      <div className="pdetail" onClick={(e) => e.stopPropagation()}>
        <button className="pdetail-close" onClick={onClose} data-cursor-hover>×</button>
        <div className="pdetail-head">
          <div className="pdetail-eyebrow">
            <span className="dot"></span>
            {p.award ? `★ ${p.award}` : `Project · ${p.year}`}
          </div>
          <h3>{p.name}</h3>
          <p className="pdetail-tag">{p.summary}</p>
        </div>
        <div className="pdetail-media">
          {embed ? (
            <iframe src={embed} title={p.name} allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowFullScreen></iframe>
          ) : img ? (
            <img src={img} alt={p.name} />
          ) : (
            <div className="pdetail-noembed">
              <span className="label">/{p.id}</span>
              <span className="hint">Demo media not available — check the GitHub.</span>
            </div>
          )}
        </div>
        <div className="pdetail-grid">
          <div className="pdetail-body">
            <h5>The story</h5>
            <p>{p.long || p.summary}</p>
            {p.role && (
              <div className="pdetail-row">
                <span className="k">Role</span>
                <span className="v">{p.role}</span>
              </div>
            )}
            {p.stack && (
              <div className="pdetail-row">
                <span className="k">Stack</span>
                <span className="v stack">
                  {p.stack.map((s) => <span key={s} className="chip">{s}</span>)}
                </span>
              </div>
            )}
          </div>
          <div className="pdetail-side">
            <div className="pdetail-meta">
              <span className="k">Year</span><span>{p.year}</span>
              <span className="k">ID</span><span>/{p.id}</span>
              <span className="k">Tags</span>
              <span className="tagrow">{p.tags.map((t) => <em key={t}>#{t}</em>)}</span>
            </div>
            <div className="pdetail-links">
              {p.demo && (
                <a href={p.demo} target="_blank" rel="noopener" data-cursor-hover>
                  <span>▶</span> Watch demo
                </a>
              )}
              {p.projectUrl && (
                <a href={p.projectUrl} target="_blank" rel="noopener" data-cursor-hover>
                  <span>↗</span> Live project
                </a>
              )}
              {p.github && (
                <a href={p.github} target="_blank" rel="noopener" data-cursor-hover>
                  <span>{`</>`}</span> Source on GitHub
                </a>
              )}
            </div>
            <div className="pdetail-voice">
              <span className="eyebrow">Voice tip</span>
              <p>“Tell me more about <em>{p.name.toLowerCase()}</em>” opens this view.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
