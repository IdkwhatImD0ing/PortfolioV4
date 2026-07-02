/* global React */

window.ArchitectureSection = function ArchitectureSection() {
  const flow = [
    { k: "01", title: "Mic input", body: "Browser mic stream → Retell client SDK. Low-latency WebRTC pipe to a hosted agent." },
    { k: "02", title: "LLM agent", body: "Retell agent runs an instruction-tuned model with this site's content + a small tool registry as its world." },
    { k: "03", title: "Tool calls", body: "Agent emits structured tool calls — filter_projects(tag), focus_project(id), open_project(id), scroll_to(section)." },
    { k: "04", title: "VoiceBus", body: "A pub-sub on window broadcasts each tool call. No prop drilling, no router — sections opt in." },
    { k: "05", title: "Sections react", body: "Each section subscribes to the events it cares about and animates its own state. The site rearranges itself." },
    { k: "06", title: "Voice reply", body: "The agent confirms in spoken English while the page settles. The user keeps both hands free." },
  ];
  const stack = [
    { group: "Voice", items: ["Retell AI (agent runtime)", "WebRTC (stream)", "Custom tool registry"] },
    { group: "Brain", items: ["GPT-4 / Claude (selectable)", "Site-grounded system prompt", "Function-calling JSON schema"] },
    { group: "Frame", items: ["Next.js + React 19", "Three.js + GLSL bg", "Framer Motion + GSAP"] },
    { group: "State", items: ["VoiceBus pub-sub", "URL-driven section anchors", "Per-section local React state"] },
  ];
  return (
    <section id="architecture" className="arch-section" data-screen-label="08 Architecture">
      <div className="arch-inner">
        <div className="arch-head">
          <span className="section-eyebrow"><span className="dot"></span>HOW THIS SITE WORKS</span>
          <h2 className="section-title">A portfolio that <em>talks back.</em></h2>
          <p className="arch-lede">
            Most portfolios are read-only documents. This one is an agent. You speak, and the structured tool calls coming
            back from the LLM rearrange the page in real time — filter projects, scroll, expand a deep-dive, jump to a
            specific section. The voice agent <em>is</em> the navigation.
          </p>
        </div>

        <div className="arch-flow">
          {flow.map((f, i) => (
            <div className="arch-step" key={f.k}>
              <div className="arch-step-rail">
                <span className="arch-k">{f.k}</span>
                {i < flow.length - 1 && <span className="arch-line" />}
              </div>
              <div className="arch-step-body">
                <h5>{f.title}</h5>
                <p>{f.body}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="arch-grid">
          <div className="arch-stack">
            {stack.map((s) => (
              <div key={s.group} className="arch-stack-col">
                <div className="arch-stack-head">{s.group}</div>
                <ul>
                  {s.items.map((i) => <li key={i}>{i}</li>)}
                </ul>
              </div>
            ))}
          </div>
          <pre className="arch-snippet">
{`// every section subscribes to the same bus
VoiceBus.on((cmd) => {
  if (cmd.type === "filter") setFilter(cmd.tag);
  if (cmd.type === "focus")  setFocusId(cmd.id);
  if (cmd.type === "open")   setOpenId(cmd.id);
  if (cmd.type === "scroll") scrollToSection(cmd.id);
});

// the agent's tool calls become events
agent.onToolCall("filter_projects", ({ tag }) =>
  VoiceBus.emit({ type: "filter", tag })
);`}
          </pre>
        </div>
      </div>
    </section>
  );
};
