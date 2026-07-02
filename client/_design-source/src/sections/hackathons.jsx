/* global React */
const { useEffect, useRef } = React;

window.HackathonsSection = function HackathonsSection() {
  const list = window.HACKATHONS;
  // Duplicate items for seamless marquee
  const lineA = [...list, ...list];
  const lineB = [...list].reverse();
  const lineBDup = [...lineB, ...lineB];

  return (
    <section id="hackathons" data-screen-label="04 Hackathons" style={{ padding: "120px 0 80px" }}>
      <div className="container">
        <div className="reveal" ref={window.useReveal()}>
          <span className="section-eyebrow"><span className="dot"></span>HACKATHONS · 12 WINS</span>
          <h2 className="section-title" style={{ maxWidth: 1100 }}>
            Twelve weekends of <em>winning.</em>
          </h2>
          <p style={{ marginTop: 18, fontSize: 18, lineHeight: 1.5, color: "var(--ink-soft)", maxWidth: 640 }}>
            Hackathon culture is a forge. You start with nothing, you ship something, you defend it on a stage. I've done it from Berkeley to Davis to UTD.
          </p>
        </div>
      </div>

      <div style={{ marginTop: 64 }}>
        <div className="marquee">
          <div className="marquee-track">
            {lineA.map((h, i) => (
              <span key={i} className="marquee-item win">
                {h.name}
                <span className="award">★ {h.award}</span>
                <span className="star">✦</span>
              </span>
            ))}
          </div>
        </div>
        <div className="marquee reverse">
          <div className="marquee-track">
            {lineBDup.map((h, i) => (
              <span key={i} className="marquee-item">
                {h.year} <span className="star">/</span> {h.award}
                <span className="star">✦</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="container">
        <div className="hk-stats">
          <div className="hk-stat"><div className="n">12+</div><div className="l">Hackathons won</div></div>
          <div className="hk-stat"><div className="n">$25k</div><div className="l">Largest prize</div></div>
          <div className="hk-stat"><div className="n">36h</div><div className="l">Typical build</div></div>
          <div className="hk-stat"><div className="n">9</div><div className="l">Voice-AI shipped</div></div>
        </div>
      </div>
    </section>
  );
};

// ── Experience ─────────────────────────────────────────────
window.ExperienceSection = function ExperienceSection() {
  const items = window.EXPERIENCE;
  const wrapRef = useRef(null);
  const lineRef = useRef(null);

  useEffect(() => {
    const el = wrapRef.current; const line = lineRef.current; if (!el || !line) return;
    const onScroll = () => {
      const r = el.getBoundingClientRect();
      const start = window.innerHeight * 0.7;
      const end = -r.height + window.innerHeight * 0.3;
      const p = Math.max(0, Math.min(1, (start - r.top) / Math.max(1, start - end)));
      line.style.transform = `scaleY(${p})`;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <section id="experience" data-screen-label="05 Experience" className="container" style={{ padding: "120px 32px" }}>
      <div className="reveal" ref={window.useReveal()}>
        <span className="section-eyebrow"><span className="dot"></span>EXPERIENCE</span>
        <h2 className="section-title">A short, <em>productive</em> career.</h2>
      </div>

      <div ref={wrapRef} style={{ position: "relative", marginTop: 80 }}>
        <div style={{
          position: "absolute", left: 220, top: 0, bottom: 0, width: 1, background: "var(--line-soft)",
          transform: "translateX(-0.5px)"
        }}></div>
        <div ref={lineRef} style={{
          position: "absolute", left: 220, top: 0, width: 2, height: "100%",
          background: "linear-gradient(180deg, var(--magenta), var(--primary))",
          transform: "scaleY(0)", transformOrigin: "top",
          boxShadow: "0 0 12px rgba(232,121,249,.6)",
        }}></div>

        {items.map((it, i) => (
          <article key={i} className="exp-row reveal" ref={window.useReveal()}>
            <div className="when">{it.when}</div>
            <div className="what" style={{ position: "relative" }}>
              <span style={{
                position: "absolute", left: -40, top: 12, width: 12, height: 12, borderRadius: "50%",
                background: "var(--bg)", border: "2px solid var(--magenta)", boxShadow: "0 0 12px rgba(232,121,249,.6)",
                display: window.innerWidth > 800 ? "block" : "none"
              }}></span>
              <h4>{it.role}</h4>
              <div className="where">{it.where}</div>
              <p>{it.body}</p>
              {it.badge && <span className="badge"><span className="dot" style={{width:6,height:6,borderRadius:"50%",background:"#4ade80",boxShadow:"0 0 6px #4ade80"}}></span>{it.badge}</span>}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
};
