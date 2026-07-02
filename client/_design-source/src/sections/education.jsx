/* global React */
const { useState } = React;

window.EducationSection = function EducationSection() {
  const items = window.EDUCATION;
  const [flipped, setFlipped] = useState({});

  return (
    <section id="education" data-screen-label="06 Education" className="container" style={{ padding: "120px 32px" }}>
      <div className="reveal" ref={window.useReveal()}>
        <span className="section-eyebrow"><span className="dot"></span>EDUCATION</span>
        <h2 className="section-title">Three schools, <em>one path.</em></h2>
        <p style={{ marginTop: 18, fontSize: 17, color: "var(--ink-soft)", maxWidth: 640 }}>
          Click a card to flip it.
        </p>
      </div>

      <div className="edu-grid" style={{ marginTop: 64 }}>
        {items.map((e, i) => (
          <div
            key={e.school}
            className={`edu-card ${flipped[i] ? "flipped" : ""}`}
            onClick={() => setFlipped((f) => ({ ...f, [i]: !f[i] }))}
            data-cursor-hover
          >
            <div className="face">
              <div className="glow"></div>
              <div className="logo"><img src={e.logo} alt={`${e.school} logo`} /></div>
              <div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)", letterSpacing: ".14em", textTransform: "uppercase" }}>
                  {String(i + 1).padStart(2, "0")} / {String(items.length).padStart(2, "0")}
                </div>
                <h4>{e.full}</h4>
                <div className="deg">{e.degree}</div>
                <div className="when">{e.when}</div>
              </div>
              <div className="flip-hint">FLIP <span style={{ color: "var(--magenta)" }}>↻</span></div>
            </div>
            <div className="face back">
              <div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".14em", color: "var(--accent)", textTransform: "uppercase" }}>
                  {e.school} · NOTES
                </div>
                <h4 style={{ marginTop: 16 }}>{e.degree}</h4>
                <p style={{ marginTop: 14 }}>{e.detail}</p>
              </div>
              <div className="flip-hint">BACK <span style={{ color: "var(--magenta)" }}>↺</span></div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
