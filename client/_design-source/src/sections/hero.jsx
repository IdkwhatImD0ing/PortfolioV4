/* global React, useReveal, VoiceBus */
const { useEffect, useRef, useState } = React;

const HERO_CHIPS = [
  "Who is Bill?",
  "What voice AI projects has he built?",
  "Show me the hackathon wins.",
  "What does he do for fun?",
  "Take me to his projects.",
];

window.HeroSection = function HeroSection() {
  const ref = useRef(null);
  const glowA = useRef(null), glowB = useRef(null);

  // Mouse-driven glow + cursor parallax
  useEffect(() => {
    const onMove = (e) => {
      const x = (e.clientX / window.innerWidth - 0.5) * 60;
      const y = (e.clientY / window.innerHeight - 0.5) * 40;
      if (glowA.current) glowA.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      if (glowB.current) glowB.current.style.transform = `translate3d(${-x}px, ${-y}px, 0)`;
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  // Headline parallax on scroll
  const headRef = useRef(null);
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY * 0.18;
      if (headRef.current) headRef.current.style.transform = `translate3d(0, ${y}px, 0)`;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const onChip = (chip) => {
    // pretend voice command
    const lower = chip.toLowerCase();
    if (lower.includes("voice ai")) VoiceBus.emit({ type: "filter", tag: "voice" });
    else if (lower.includes("hackathon")) { VoiceBus.emit({ type: "scroll", id: "hackathons" }); window.scrollToSection("hackathons"); }
    else if (lower.includes("projects")) { window.scrollToSection("projects"); }
    else if (lower.includes("fun")) { window.scrollToSection("personal"); }
    else { window.scrollToSection("about"); }
  };

  return (
    <section id="hero" className="hero" ref={ref} data-screen-label="01 Hero">
      <div className="hero-glow g1" ref={glowA}></div>
      <div className="hero-glow g2" ref={glowB}></div>

      <div className="container" style={{ position: "relative", zIndex: 2 }}>
        <div className="hero-eyebrow">
          <span className="live"></span>
          <span>VOICE-DRIVEN PORTFOLIO · 2026</span>
          <span style={{ marginLeft: "auto" }} className="waveform">
            {Array.from({ length: 7 }).map((_, i) => <span key={i} className="bar"></span>)}
          </span>
        </div>

        <h1 ref={headRef} className="hero-headline">
          Ask me<br />
          <em>anything.</em>
        </h1>

        <p className="hero-sub">
          I'm <b style={{ color: "var(--ink)" }}>Bill Zhang</b> — AI engineer, voice-first builder,
          serial hackathon winner. This site listens. Talk to it, scroll it, drag it around — it'll rearrange.
        </p>

        <div className="chip-row">
          {HERO_CHIPS.map((c) => (
            <button key={c} className="chip" onClick={() => onChip(c)} data-cursor-hover>
              <span className="quote">"</span>
              <span>{c}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="hero-meta">
        <div className="col">
          <span>Latest</span>
          <b>Building voice agents that ship.</b>
        </div>
        <div className="col" style={{ alignItems: "center" }}>
          <div className="scroll-cue">
            <span>SCROLL</span>
            <span className="line"></span>
          </div>
        </div>
        <div className="col" style={{ textAlign: "right" }}>
          <span>Currently</span>
          <b>Software engineer · Los Angeles</b>
        </div>
      </div>
    </section>
  );
};
