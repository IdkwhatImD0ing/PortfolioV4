"use client";

import { PORTFOLIO } from "@/lib/portfolio-data";

const STATS = [
  { k: "Years building", v: "5+" },
  { k: "Hackathon wins", v: "36" },
  { k: "Voice apps shipped", v: "9" },
  { k: "Prizes won", v: "$150k+" },
];

export function ResumeSection() {
  return (
    <section
      id="resume"
      data-screen-label="07 Resume"
      className="px-[8vw] pt-[140px] pb-[160px] border-t border-line-soft bg-[radial-gradient(circle_at_80%_20%,rgba(232,67,147,0.08),transparent_50%)] bg-bg max-[700px]:px-5 max-[700px]:pt-20 max-[700px]:pb-24"
    >
      <div className="max-w-[1240px] mx-auto">
        <div className="max-w-[720px] mb-[60px] max-[700px]:mb-10">
          <span className="inline-flex items-center gap-2.5 font-mono text-[12px] tracking-[0.14em] uppercase text-accent px-3 py-1.5 border border-[rgba(192,132,252,0.35)] rounded-full bg-[rgba(192,132,252,0.08)]">
            <span className="w-1.5 h-1.5 rounded-full bg-magenta shadow-[0_0_10px_var(--magenta)]" />
            RESUME · ONE-PAGER
          </span>
          <h2 className="font-sans text-[clamp(48px,7vw,96px)] -tracking-[0.02em] font-semibold leading-[0.95] mt-4 text-balance">
            The{" "}
            <em className="font-serif italic font-normal bg-[image:var(--grad)] bg-clip-text text-transparent">
              printable
            </em>{" "}
            version.
          </h2>
          <p className="text-[18px] leading-[1.55] text-ink-soft mt-5">
            Same story, traditional format. Click through below or grab the PDF; both stay in
            lock-step with everything else on this page.
          </p>
        </div>

        <div className="grid grid-cols-[1.5fr_1fr] gap-9 items-start max-[900px]:grid-cols-1">
          <div className="border border-line rounded-2xl overflow-hidden bg-[#0a0814] shadow-[0_30px_80px_rgba(168,85,247,0.15)]">
            <div className="aspect-[8.5/11] w-full bg-[#f5f3ee] max-[700px]:aspect-auto max-[700px]:h-[440px]">
              <iframe
                src="/resume.pdf#toolbar=0&navpanes=0&view=FitH"
                title="Bill Zhang Resume"
                className="w-full h-full border-0"
              />
            </div>
            <div className="flex justify-between items-center gap-4 px-[18px] py-3.5 border-t border-line bg-[rgba(15,12,28,0.7)] max-[700px]:flex-col max-[700px]:items-stretch max-[700px]:gap-3">
              <span className="font-mono text-[11px] tracking-[0.14em] uppercase text-muted">
                resume.pdf · last updated May 10, 2026
              </span>
              <div className="flex gap-2.5 flex-wrap">
                <a
                  href="/resume.pdf"
                  target="_blank"
                  rel="noopener noreferrer"
                  data-cursor-hover
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-[13px] no-underline transition-[transform,background-color,border-color] duration-200 text-ink border border-line bg-transparent hover:bg-[rgba(168,85,247,0.08)] hover:border-violet"
                >
                  <span className="inline-grid place-items-center w-5 h-5 rounded-full font-mono text-[11px] bg-[rgba(168,85,247,0.18)] text-violet">
                    ↗
                  </span>
                  Open in new tab
                </a>
                <a
                  href="/resume.pdf"
                  download="Bill-Zhang-Resume.pdf"
                  data-cursor-hover
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-[13px] no-underline transition-transform duration-200 text-white bg-[image:var(--grad)] border border-transparent shadow-[0_8px_24px_rgba(162,89,255,0.4)] hover:-translate-y-0.5"
                >
                  <span className="inline-grid place-items-center w-5 h-5 rounded-full font-mono text-[11px] bg-white/20 text-white">
                    ↓
                  </span>
                  Download PDF
                </a>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-[18px]">
            <div className="grid grid-cols-2 border border-line rounded-xl overflow-hidden bg-[rgba(15,12,28,0.5)]">
              {STATS.map((s, i) => (
                <div
                  key={s.k}
                  className={`px-[18px] py-[18px] ${i % 2 === 0 ? "border-r border-line-soft" : ""} ${i < STATS.length - 2 ? "border-b border-line-soft" : ""}`}
                >
                  <div className="font-serif text-[32px] -tracking-[0.02em] bg-gradient-to-br from-violet to-magenta bg-clip-text text-transparent">
                    {s.v}
                  </div>
                  <div className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-muted mt-1">
                    {s.k}
                  </div>
                </div>
              ))}
            </div>

            <div className="px-5 py-[18px] border border-line rounded-xl bg-[rgba(15,12,28,0.4)]">
              <div className="font-mono text-[11px] tracking-[0.18em] uppercase text-magenta mb-3">
                At a glance
              </div>
              <ul className="list-none flex flex-col gap-2.5">
                <li className="text-[13.5px] text-ink-soft leading-[1.5] pl-3.5 relative before:content-[''] before:absolute before:left-0 before:top-[9px] before:w-[5px] before:h-[5px] before:rounded-full before:bg-violet">
                  <strong className="text-ink font-medium">AI engineer:</strong> voice-first
                  agents, multimodal pipelines, real-time inference.
                </li>
                <li className="text-[13.5px] text-ink-soft leading-[1.5] pl-3.5 relative before:content-[''] before:absolute before:left-0 before:top-[9px] before:w-[5px] before:h-[5px] before:rounded-full before:bg-violet">
                  <strong className="text-ink font-medium">Scale AI Applied AI Engineer:</strong>{" "}
                  enterprise GenAI, LLM evals, multi-agent systems.
                </li>
                <li className="text-[13.5px] text-ink-soft leading-[1.5] pl-3.5 relative before:content-[''] before:absolute before:left-0 before:top-[9px] before:w-[5px] before:h-[5px] before:rounded-full before:bg-violet">
                  <strong className="text-ink font-medium">USC:</strong> M.S. Computer Science,
                  AI specialization.
                </li>
                <li className="text-[13.5px] text-ink-soft leading-[1.5] pl-3.5 relative before:content-[''] before:absolute before:left-0 before:top-[9px] before:w-[5px] before:h-[5px] before:rounded-full before:bg-violet">
                  <strong className="text-ink font-medium">Stack:</strong> TypeScript / Python
                  / Rust, Next.js, Retell, Twilio, Mistral, Llama.
                </li>
              </ul>
            </div>

            <div className="px-5 py-[18px] border border-line rounded-xl bg-[rgba(15,12,28,0.4)]">
              <div className="font-mono text-[11px] tracking-[0.18em] uppercase text-magenta mb-3">
                Get in touch
              </div>
              <div className="flex flex-col gap-2">
                <a
                  href={`mailto:${PORTFOLIO.email}`}
                  data-cursor-hover
                  className="text-ink no-underline text-[13.5px] px-2.5 py-2 rounded-lg transition-colors duration-200 hover:bg-[rgba(168,85,247,0.1)] hover:text-violet"
                >
                  {PORTFOLIO.email}
                </a>
                <a
                  href="https://github.com/IdkwhatImD0ing"
                  target="_blank"
                  rel="noopener noreferrer"
                  data-cursor-hover
                  className="text-ink no-underline text-[13.5px] px-2.5 py-2 rounded-lg transition-colors duration-200 hover:bg-[rgba(168,85,247,0.1)] hover:text-violet"
                >
                  github.com/IdkwhatImD0ing
                </a>
                <a
                  href="https://www.linkedin.com/in/bill-zhang1/"
                  target="_blank"
                  rel="noopener noreferrer"
                  data-cursor-hover
                  className="text-ink no-underline text-[13.5px] px-2.5 py-2 rounded-lg transition-colors duration-200 hover:bg-[rgba(168,85,247,0.1)] hover:text-violet"
                >
                  linkedin.com/in/bill-zhang1
                </a>
              </div>
            </div>

            <div className="px-4 py-3.5 rounded-[10px] border border-dashed border-[rgba(168,85,247,0.35)] bg-[rgba(168,85,247,0.05)]">
              <span className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-magenta">
                Voice tip
              </span>
              <p className="mt-1.5 text-ink-soft text-[13px] leading-[1.5]">
                &ldquo;Send me your resume.&rdquo; → opens the download.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
