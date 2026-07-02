"use client";

import { cn } from "@/lib/utils";
import { highlightJs } from "@/lib/highlight";

const FLOW = [
  {
    k: "01",
    title: "Mic input",
    body: "Browser mic stream → Retell client SDK. Low-latency WebRTC pipe to a hosted agent.",
  },
  {
    k: "02",
    title: "LLM agent",
    body: "Retell agent runs an instruction-tuned model with this site's content + a small tool registry as its world.",
  },
  {
    k: "03",
    title: "Tool calls",
    body: "Agent emits structured tool calls: filter_projects(tag), focus_project(id), open_project(id), scroll_to(section).",
  },
  {
    k: "04",
    title: "VoiceBus",
    body: "A pub-sub on window broadcasts each tool call. No prop drilling, no router. Sections opt in.",
  },
  {
    k: "05",
    title: "Sections react",
    body: "Each section subscribes to the events it cares about and animates its own state. The site rearranges itself.",
  },
  {
    k: "06",
    title: "Voice reply",
    body: "The agent confirms in spoken English while the page settles. The user keeps both hands free.",
  },
];

const STACK = [
  { group: "Voice", items: ["Retell AI (agent runtime)", "WebRTC (stream)", "Custom tool registry"] },
  {
    group: "Brain",
    items: [
      "GPT-4 / Claude (selectable)",
      "Site-grounded system prompt",
      "Function-calling JSON schema",
    ],
  },
  { group: "Frame", items: ["Next.js + React 19", "Three.js + GLSL bg", "Framer Motion + GSAP"] },
  {
    group: "State",
    items: ["VoiceBus pub-sub", "URL-driven section anchors", "Per-section local React state"],
  },
];

const SNIPPET = `// every section subscribes to the same bus
VoiceBus.on((cmd) => {
  if (cmd.type === "filter") setFilter(cmd.tag);
  if (cmd.type === "focus")  setFocusId(cmd.id);
  if (cmd.type === "open")   setOpenId(cmd.id);
  if (cmd.type === "scroll") scrollToSection(cmd.id);
});

// the agent's tool calls become events
agent.onToolCall("filter_projects", ({ tag }) =>
  VoiceBus.emit({ type: "filter", tag })
);`;

export function ArchitectureSection() {
  const total = FLOW.length;
  return (
    <section
      id="architecture"
      data-screen-label="08 Architecture"
      className="px-[8vw] pt-[140px] pb-[160px] border-t border-line-soft bg-[radial-gradient(circle_at_20%_20%,rgba(126,109,253,0.12),transparent_50%),radial-gradient(circle_at_80%_80%,rgba(232,67,147,0.08),transparent_60%)] bg-bg max-[700px]:px-5 max-[700px]:pt-20 max-[700px]:pb-24"
    >
      <div className="max-w-[1240px] mx-auto">
        <div className="max-w-[760px] mb-20 max-[700px]:mb-10">
          <span className="inline-flex items-center gap-2.5 font-mono text-[12px] tracking-[0.14em] uppercase text-accent px-3 py-1.5 border border-[rgba(192,132,252,0.35)] rounded-full bg-[rgba(192,132,252,0.08)]">
            <span className="w-1.5 h-1.5 rounded-full bg-magenta shadow-[0_0_10px_var(--magenta)]" />
            HOW THIS SITE WORKS
          </span>
          <h2 className="font-sans text-[clamp(48px,7vw,96px)] -tracking-[0.02em] font-semibold leading-[0.95] mt-4 text-balance">
            A portfolio that{" "}
            <em className="font-serif italic font-normal bg-[image:var(--grad)] bg-clip-text text-transparent">
              talks back.
            </em>
          </h2>
          <p className="text-[19px] leading-[1.55] text-ink-soft mt-6 text-pretty">
            Most portfolios are read-only documents. This one is an agent. You speak, and the
            structured tool calls coming back from the LLM rearrange the page in real time:
            filter projects, scroll, expand a deep-dive, jump to a specific section. The voice
            agent <em className="font-serif italic text-ink">is</em> the navigation.
          </p>
        </div>

        <div className="grid grid-cols-3 mb-20 border border-line rounded-2xl bg-[rgba(15,12,28,0.4)] overflow-hidden max-[900px]:grid-cols-1 max-[700px]:mb-10">
          {FLOW.map((f, i) => {
            const isLastInRow = i % 3 === 2;
            const isLastRow = i >= total - (total % 3 === 0 ? 3 : total % 3);
            return (
              <div
                key={f.k}
                className={cn(
                  "flex gap-[18px] px-[26px] py-7 relative transition-colors duration-[250ms] hover:bg-[rgba(168,85,247,0.06)]",
                  !isLastInRow && "border-r border-line-soft",
                  !isLastRow && "border-b border-line-soft",
                  "max-[900px]:border-r-0 max-[900px]:border-b max-[900px]:border-line-soft max-[900px]:last:border-b-0",
                )}
              >
                <div className="flex flex-col items-center">
                  <span className="font-mono text-[11px] tracking-[0.14em] text-violet px-2 py-1 border border-line rounded-md bg-[rgba(126,109,253,0.1)]">
                    {f.k}
                  </span>
                </div>
                <div>
                  <h5 className="font-serif text-[22px] -tracking-[0.01em] mb-2 text-ink">
                    {f.title}
                  </h5>
                  <p className="text-ink-soft text-[14px] leading-[1.55] text-pretty">{f.body}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-7 max-[900px]:grid-cols-1">
          <div className="grid grid-cols-2 gap-5">
            {STACK.map((s) => (
              <div
                key={s.group}
                className="px-[22px] py-[22px] border border-line rounded-xl bg-[rgba(15,12,28,0.5)]"
              >
                <div className="font-mono text-[11px] tracking-[0.18em] uppercase text-magenta mb-3.5 pb-2.5 border-b border-line-soft">
                  {s.group}
                </div>
                <ul className="list-none flex flex-col gap-2">
                  {s.items.map((item) => (
                    <li
                      key={item}
                      className="text-[13.5px] text-ink pl-3.5 relative before:content-[''] before:absolute before:left-0 before:top-2 before:w-[5px] before:h-[5px] before:rounded-full before:bg-violet"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <pre className="font-mono text-[12.5px] leading-[1.75] text-ink p-[26px] border border-line rounded-xl bg-[#08070f] bg-[linear-gradient(180deg,rgba(126,109,253,0.05),rgba(232,67,147,0.04)),#08070f] overflow-auto whitespace-pre">
            <code>
              {highlightJs(SNIPPET).map((t, i) => (
                <span key={i} className={t.cls || undefined}>
                  {t.text}
                </span>
              ))}
            </code>
          </pre>
        </div>
      </div>
    </section>
  );
}
