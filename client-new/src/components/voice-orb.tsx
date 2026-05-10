"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RetellWebClient as RetellWebClientType } from "retell-client-js-sdk";
import { VoiceBus, scrollToSection, type VoiceCommand } from "@/lib/voice-bus";
import { cn } from "@/lib/utils";

interface RegisterCallResponse {
  access_token: string;
  call_id: string;
}

interface NavigationMeta {
  type: string;
  page?:
    | "landing"
    | "education"
    | "project"
    | "personal"
    | "resume"
    | "hackathon"
    | "architecture";
  project_id?: string;
}

interface TranscriptEntry {
  role: "agent" | "user";
  content: string;
}

const PAGE_TO_SECTION: Record<NonNullable<NavigationMeta["page"]>, string> = {
  landing: "hero",
  personal: "personal",
  education: "education",
  project: "projects",
  resume: "resume",
  hackathon: "hackathons",
  architecture: "architecture",
};

const SHORTCUTS: Array<{ you: string; ai: string; cmd: VoiceCommand }> = [
  { you: "Show me only the voice AI projects.", ai: "Filtering by voice + AI.", cmd: { type: "filter", tag: "voice" } },
  { you: "Highlight SentinelAI.", ai: "Focusing SentinelAI.", cmd: { type: "focus", id: "sentinelai" } },
  { you: "Tell me more about Dispatch AI.", ai: "Opening Dispatch AI deep-dive.", cmd: { type: "open", id: "dispatchai" } },
  { you: "Send me your resume.", ai: "Heading to the resume.", cmd: { type: "scroll", id: "resume" } },
  { you: "How does this site work?", ai: "Heading to the architecture section.", cmd: { type: "scroll", id: "architecture" } },
  { you: "Take me to hackathons.", ai: "Jumping to hackathons.", cmd: { type: "scroll", id: "hackathons" } },
  { you: "Show me only the 2025 projects.", ai: "Filtering by year — 2025.", cmd: { type: "filter", year: 2025 } },
  { you: "What about the fintech work?", ai: "Filtering by fintech.", cmd: { type: "filter", tag: "fintech" } },
  { you: "Reset the projects.", ai: "Clearing filters.", cmd: { type: "filter", tag: "all" } },
  { you: "Take me to your education.", ai: "Heading to education.", cmd: { type: "scroll", id: "education" } },
  { you: "Take me back to the top.", ai: "Returning home.", cmd: { type: "scroll", id: "hero" } },
];

const cmdBtn =
  "text-left px-3 py-2.5 rounded-[10px] border border-line-soft bg-white/[0.02] text-[13.5px] text-ink flex items-center gap-2.5 transition-all duration-200 hover:border-[rgba(192,132,252,0.4)] hover:bg-[rgba(192,132,252,0.08)]";

export function VoiceOrb() {
  const [open, setOpen] = useState(false);
  const [transcriptDisplay, setTranscriptDisplay] = useState({
    you: "",
    ai: "Tap the mic to talk — or try a quick command.",
  });
  const [pulsing, setPulsing] = useState(false);
  const [isCalling, setIsCalling] = useState(false);
  const [isAgentTalking, setIsAgentTalking] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  const retellRef = useRef<RetellWebClientType | null>(null);
  const listenersBoundRef = useRef(false);

  useEffect(() => {
    document.body.classList.toggle("voice-open", open);
    return () => document.body.classList.remove("voice-open");
  }, [open]);

  const fireShortcut = useCallback((item: (typeof SHORTCUTS)[number]) => {
    setTranscriptDisplay({ you: item.you, ai: "…thinking" });
    setPulsing(true);
    window.setTimeout(() => {
      setTranscriptDisplay({ you: item.you, ai: item.ai });
      VoiceBus.emit(item.cmd);
      if (item.cmd.type === "scroll") scrollToSection(item.cmd.id);
      setPulsing(false);
    }, 380);
  }, []);

  const setupListeners = useCallback((client: RetellWebClientType) => {
    if (listenersBoundRef.current) return;

    client.on("call_started", () => {
      setIsCalling(true);
      setTranscriptDisplay({ you: "", ai: "Connected. I'm listening…" });
    });
    client.on("call_ended", () => {
      setIsCalling(false);
      setIsAgentTalking(false);
    });
    client.on("agent_start_talking", () => setIsAgentTalking(true));
    client.on("agent_stop_talking", () => setIsAgentTalking(false));

    client.on("update", (update: { transcript?: TranscriptEntry[] }) => {
      const t = update?.transcript;
      if (!t || t.length === 0) return;
      const lastUser = [...t].reverse().find((e) => e.role === "user");
      const lastAgent = [...t].reverse().find((e) => e.role === "agent");
      setTranscriptDisplay({
        you: lastUser?.content ?? "",
        ai: lastAgent?.content ?? "…",
      });
    });

    client.on("metadata", (metadata: { metadata?: NavigationMeta }) => {
      const meta = metadata?.metadata;
      if (!meta || meta.type !== "navigation" || !meta.page) return;

      if (meta.page === "project" && meta.project_id) {
        VoiceBus.emit({ type: "open", id: meta.project_id });
        scrollToSection("projects");
        return;
      }

      const section = PAGE_TO_SECTION[meta.page];
      if (section) {
        VoiceBus.emit({ type: "scroll", id: section });
        scrollToSection(section);
      }
    });

    client.on("error", (error) => {
      console.error("Retell error:", error);
      client.stopCall();
      setIsCalling(false);
      setIsAgentTalking(false);
      setTranscriptDisplay({ you: "", ai: "Hit a snag — please try again." });
    });

    listenersBoundRef.current = true;
  }, []);

  const startCall = useCallback(async () => {
    if (isCalling || isStarting) return;
    setIsStarting(true);
    try {
      const agentId = process.env.NEXT_PUBLIC_RETELL_AGENT_ID;
      if (!agentId) {
        throw new Error("NEXT_PUBLIC_RETELL_AGENT_ID is not configured.");
      }

      if (!retellRef.current) {
        const { RetellWebClient } = await import("retell-client-js-sdk");
        retellRef.current = new RetellWebClient();
        setupListeners(retellRef.current);
      }

      const response = await fetch("/api/create-web-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_id: agentId,
          metadata: {
            session_started: new Date().toISOString(),
            platform: "web",
          },
        }),
      });
      if (!response.ok) {
        throw new Error(`Server error (${response.status})`);
      }
      const data = (await response.json()) as RegisterCallResponse;
      if (!data.access_token) throw new Error("No access token");

      await retellRef.current.startCall({ accessToken: data.access_token });
    } catch (err) {
      console.error("Failed to start call:", err);
      setTranscriptDisplay({
        you: "",
        ai: "Couldn't start the call. Use the demo commands below.",
      });
    } finally {
      setIsStarting(false);
    }
  }, [isCalling, isStarting, setupListeners]);

  const endCall = useCallback(() => {
    retellRef.current?.stopCall();
  }, []);

  useEffect(() => {
    return () => {
      if (retellRef.current && isCalling) {
        retellRef.current.stopCall();
      }
    };
  }, [isCalling]);

  const orbStatus = isCalling
    ? isAgentTalking
      ? "Agent talking…"
      : "Listening — speak"
    : isStarting
      ? "Connecting…"
      : "Tap to talk · or scroll";

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-[70] bg-[radial-gradient(ellipse_at_bottom_right,rgba(4,3,12,0.55),rgba(4,3,12,0.25)_60%)] backdrop-blur-[2px] animate-scrim-fade"
          onClick={() => setOpen(false)}
        />
      )}
      {open && (
        <div
          role="dialog"
          aria-label="Voice commands"
          className="fixed right-6 bottom-[110px] z-[80] w-[360px] max-w-[calc(100vw-48px)] max-h-[min(72vh,640px)] flex flex-col bg-[rgba(12,10,23,0.92)] backdrop-blur-xl border border-line rounded-[22px] shadow-[0_30px_80px_rgba(0,0,0,0.55),0_0_0_1px_rgba(192,132,252,0.1)_inset] overflow-hidden animate-panel-in"
        >
          <header className="px-[18px] py-4 border-b border-line-soft flex items-center gap-2.5">
            <span className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-accent px-2 py-1 border border-[rgba(192,132,252,0.35)] rounded-full bg-[rgba(192,132,252,0.08)] whitespace-nowrap">
              {isCalling ? "VOICE · LIVE" : "VOICE · READY"}
            </span>
            <span className="font-mono text-[11px] text-muted">powered by Retell</span>
            <button
              type="button"
              className="ml-auto text-muted p-1"
              onClick={() => setOpen(false)}
              aria-label="Close panel"
            >
              ✕
            </button>
          </header>

          <div className="overflow-y-auto p-[18px]">
            <h4 className="text-[18px] m-0 mb-1 -tracking-[0.01em] font-medium">Ask anything.</h4>
            <p className="font-mono text-[11.5px] text-muted m-0 mb-3.5 tracking-[0.04em]">
              The site rearranges as you speak. Tap the mic, or try a shortcut:
            </p>

            <div className="flex gap-2 mb-3.5">
              {!isCalling ? (
                <button
                  type="button"
                  onClick={startCall}
                  disabled={isStarting}
                  data-cursor-hover
                  className={cn(
                    cmdBtn,
                    "flex-1 justify-center bg-[image:var(--grad)] text-white border-transparent font-medium hover:bg-[image:var(--grad)] hover:border-transparent",
                  )}
                >
                  {isStarting ? "Connecting…" : "▶  Start voice call"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={endCall}
                  data-cursor-hover
                  className={cn(
                    cmdBtn,
                    "flex-1 justify-center bg-[rgba(232,121,249,0.12)] text-magenta border-[rgba(232,121,249,0.4)] font-medium",
                  )}
                >
                  ■  End call
                </button>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              {SHORTCUTS.map((c) => (
                <button
                  key={c.you}
                  type="button"
                  className={cmdBtn}
                  onClick={() => fireShortcut(c)}
                  data-cursor-hover
                >
                  <span className="text-magenta font-mono text-[11px]">&ldquo;</span>
                  <span>{c.you}</span>
                  <span className="ml-auto text-muted">→</span>
                </button>
              ))}
            </div>

            <div className="mt-3.5 p-3 rounded-[10px] bg-black/25 border border-line-soft font-mono text-[12px] text-ink-soft min-h-[70px]">
              {transcriptDisplay.you && (
                <div className="text-magenta">› {transcriptDisplay.you}</div>
              )}
              <div className="text-accent mt-1.5">
                {pulsing ? "…" : `↳ ${transcriptDisplay.ai}`}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="fixed right-7 bottom-7 z-[90] flex items-center gap-3 max-[700px]:right-4 max-[700px]:bottom-4">
        {!open && (
          <div className="font-mono text-[12px] px-3.5 py-2.5 rounded-full bg-[rgba(15,12,28,0.85)] backdrop-blur-md border border-line text-ink-soft flex items-center gap-2.5 max-w-[280px] max-[760px]:hidden max-[700px]:hidden">
            <span
              className={cn(
                "w-1.5 h-1.5 rounded-full",
                isCalling
                  ? "bg-[#f472b6] shadow-[0_0_8px_#f472b6]"
                  : "bg-[#4ade80] shadow-[0_0_8px_#4ade80]",
              )}
            />
            <span>{orbStatus}</span>
          </div>
        )}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Open voice commands"
          data-cursor-hover
          className="relative w-16 h-16 rounded-full bg-[image:var(--grad)] shadow-[0_12px_40px_rgba(162,89,255,0.55),0_0_0_1px_rgba(255,255,255,0.06)_inset] grid place-items-center cursor-pointer transition-transform duration-200 hover:scale-105 before:content-[''] before:absolute before:-inset-2 before:rounded-full before:border before:border-[rgba(232,121,249,0.4)] before:animate-orb-pulse after:content-[''] after:absolute after:-inset-4 after:rounded-full after:border after:border-[rgba(232,121,249,0.2)] after:animate-orb-pulse-delayed"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-[22px] h-[22px] text-white"
          >
            <rect x="9" y="3" width="6" height="12" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0" />
            <line x1="12" y1="18" x2="12" y2="22" />
          </svg>
        </button>
      </div>
    </>
  );
}
