/* global React */
const { useEffect, useRef } = React;

window.PersonalSection = function PersonalSection() {
  const facts = window.PERSONAL_FACTS;
  const refL1 = useRef(null), refL2 = useRef(null), refL3 = useRef(null);
  const portRef = useRef(null);
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      if (refL1.current) refL1.current.style.transform = `translate3d(${-y * 0.18}px, 0, 0)`;
      if (refL2.current) refL2.current.style.transform = `translate3d(${y * 0.12}px, 0, 0)`;
      if (refL3.current) refL3.current.style.transform = `translate3d(${-y * 0.06}px, 0, 0)`;
      // portrait: subtle counter-parallax
      if (portRef.current) {
        const rect = portRef.current.getBoundingClientRect();
        if (rect.top < window.innerHeight && rect.bottom > 0) {
          const center = (rect.top + rect.height / 2) - window.innerHeight / 2;
          portRef.current.style.transform = `translate3d(0, ${center * -0.06}px, 0)`;
        }
      }
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <section id="personal" className="personal-section" data-screen-label="08 Personal">
      <div className="parallax-decor">
        <div className="layer l1" ref={refL1}>off the clock · off the clock · off the clock</div>
        <div className="layer l2" ref={refL2}>climbing · coffee · code</div>
        <div className="layer l3" ref={refL3}>made in los angeles</div>
      </div>

      <div className="container">
        <div className="reveal" ref={window.useReveal()}>
          <span className="section-eyebrow"><span className="dot"></span>OFF THE CLOCK</span>
          <h2 className="section-title">A few <em>true things.</em></h2>
        </div>

        <div className="personal-grid">
          <div ref={portRef} className="personal-portrait">
            <img src="assets/profile.webp" alt="Bill Zhang" />
            <div className="frame-tag">SHOT · 2025 · LA</div>
          </div>
          <div>
            <div className="fact-list">
              {facts.map((f, i) => (
                <div key={i} className="fact reveal" ref={window.useReveal()}>
                  <span className="icon">{f.icon}</span>
                  <span className="copy" dangerouslySetInnerHTML={{ __html: f.line }}></span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 28, fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--ink-soft)", lineHeight: 1.6 }}>
              <span style={{ color: "var(--magenta)" }}>›</span> Try asking the orb: <span style={{ color: "var(--ink)" }}>"What does Bill do for fun?"</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

window.FooterSection = function FooterSection() {
  const P = window.PORTFOLIO;
  return (
    <footer className="footer" data-screen-label="09 Contact">
      <div className="container">
        <div className="reveal" ref={window.useReveal()}>
          <span className="section-eyebrow"><span className="dot"></span>CONTACT</span>
          <h2 className="footer-mega" style={{ marginTop: 18 }}>
            Let's <em>talk.</em><br />
            (Literally.)
          </h2>
          <p style={{ marginTop: 24, fontSize: 19, color: "var(--ink-soft)", maxWidth: 560 }}>
            Tap the orb. Or, if you're old-school, send a normal email — I read every one.
          </p>
        </div>

        <div className="footer-grid">
          <div className="col">
            <h5>Direct</h5>
            <a href={`mailto:${P.email}`} data-cursor-hover>{P.email}<span className="arrow">↗</span></a>
            <a href="#" onClick={(e) => { e.preventDefault(); window.scrollToSection("hero"); }} data-cursor-hover>Tap voice orb<span className="arrow">↗</span></a>
          </div>
          <div className="col">
            <h5>Elsewhere</h5>
            <a href={P.github} target="_blank" rel="noreferrer" data-cursor-hover>GitHub<span className="arrow">↗</span></a>
            <a href={P.linkedin} target="_blank" rel="noreferrer" data-cursor-hover>LinkedIn<span className="arrow">↗</span></a>
            <a href={P.devpost} target="_blank" rel="noreferrer" data-cursor-hover>Devpost<span className="arrow">↗</span></a>
          </div>
          <div className="col">
            <h5>Index</h5>
            <a href="#projects" onClick={(e) => { e.preventDefault(); window.scrollToSection("projects"); }} data-cursor-hover>Projects<span className="arrow">↗</span></a>
            <a href="#hackathons" onClick={(e) => { e.preventDefault(); window.scrollToSection("hackathons"); }} data-cursor-hover>Hackathons<span className="arrow">↗</span></a>
            <a href="#experience" onClick={(e) => { e.preventDefault(); window.scrollToSection("experience"); }} data-cursor-hover>Experience<span className="arrow">↗</span></a>
          </div>
        </div>

        <div className="footer-fineprint">
          <span>© 2026 BILL ZHANG · BUILT IN A WEEKEND, AS USUAL</span>
          <span>VOICE: ON · SCROLL: WORKING · MOOD: VIOLET</span>
        </div>
      </div>
    </footer>
  );
};
