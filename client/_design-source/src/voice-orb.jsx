/* global React, VoiceBus, scrollToSection */
const { useEffect, useRef, useState } = React;

// Pre-baked voice commands for the demo. Each one emits a structured event.
const COMMANDS = [
  { you: "Show me only the voice AI projects.", ai: "Filtering by voice + AI — 7 projects.", cmd: { type: "filter", tag: "voice" } },
  { you: "Highlight SentinelAI.", ai: "Focusing SentinelAI. Public-safety orchestration.", cmd: { type: "focus", id: "sentinelai" } },
  { you: "Tell me more about Dispatch AI.", ai: "Opening Dispatch AI deep-dive.", cmd: { type: "open", id: "dispatchai" } },
  { you: "Send me your resume.", ai: "Heading to the resume — download is right there.", cmd: { type: "scroll", id: "resume" } },
  { you: "How does this site work?", ai: "Heading to the architecture section.", cmd: { type: "scroll", id: "architecture" } },
  { you: "Take me to hackathons.", ai: "Jumping to hackathons.", cmd: { type: "scroll", id: "hackathons" } },
  { you: "Show me only the 2025 projects.", ai: "Filtering by year — 2025.", cmd: { type: "filter", year: 2025 } },
  { you: "What about the fintech work?", ai: "Filtering by fintech — 2 projects.", cmd: { type: "filter", tag: "fintech" } },
  { you: "Reset the projects.", ai: "Clearing filters.", cmd: { type: "filter", tag: "all" } },
  { you: "Take me to your education.", ai: "Heading to education.", cmd: { type: "scroll", id: "education" } },
  { you: "Take me back to the top.", ai: "Returning home.", cmd: { type: "scroll", id: "hero" } },
];

window.VoiceOrb = function VoiceOrb() {
  const [open, setOpen] = useState(false);
  const [transcript, setTranscript] = useState({ you: "", ai: "Tap the orb. Try a command." });
  const [pulsing, setPulsing] = useState(false);

  useEffect(() => {
    document.body.classList.toggle("voice-open", open);
    return () => document.body.classList.remove("voice-open");
  }, [open]);

  const fire = (item) => {
    setTranscript({ you: item.you, ai: "…thinking" });
    setPulsing(true);
    setTimeout(() => {
      setTranscript({ you: item.you, ai: item.ai });
      VoiceBus.emit(item.cmd);
      if (item.cmd.type === "scroll") scrollToSection(item.cmd.id);
      setPulsing(false);
    }, 480);
  };

  return (
    <React.Fragment>
      {open && <div className="voice-scrim" onClick={() => setOpen(false)} />}
      {open && (
        <div className="voice-panel" role="dialog" aria-label="Voice commands">
          <header>
            <span className="badge">VOICE · LIVE</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)" }}>
              powered by Retell
            </span>
            <button className="close" onClick={() => setOpen(false)} aria-label="Close panel">✕</button>
          </header>
          <div className="body">
            <h4>Ask anything.</h4>
            <p>The site rearranges as you speak. Try one of these:</p>
            <div className="commands">
              {COMMANDS.map((c, i) => (
                <button key={i} className="cmd" onClick={() => fire(c)} data-cursor-hover>
                  <span className="quote">"</span>
                  <span>{c.you}</span>
                  <span className="arr">→</span>
                </button>
              ))}
            </div>
            <div className="transcript">
              {transcript.you && <div className="you">› {transcript.you}</div>}
              <div className="ai">{pulsing ? "…" : "↳ " + transcript.ai}</div>
            </div>
          </div>
        </div>
      )}

      <div className="voice-orb">
        {!open && (
          <div className="voice-pill">
            <span className="live-dot"></span>
            <span>Tap to talk · or scroll</span>
          </div>
        )}
        <button
          className="voice-orb-bubble"
          onClick={() => setOpen((v) => !v)}
          aria-label="Open voice commands"
          data-cursor-hover
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="3" width="6" height="12" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0" />
            <line x1="12" y1="18" x2="12" y2="22" />
          </svg>
        </button>
      </div>
    </React.Fragment>
  );
};
