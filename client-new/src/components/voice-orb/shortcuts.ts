import type { VoiceCommand } from "@/lib/voice-bus";

export const SHORTCUTS: Array<{ you: string; ai: string; cmd: VoiceCommand }> = [
  { you: "Show me only the voice AI projects.", ai: "Filtering by voice + AI.", cmd: { type: "filter", tag: "voice" } },
  { you: "Highlight SentinelAI.", ai: "Focusing SentinelAI.", cmd: { type: "focus", id: "sentinelai" } },
  { you: "Tell me more about Dispatch AI.", ai: "Opening Dispatch AI deep-dive.", cmd: { type: "open", id: "dispatchai" } },
  { you: "Send me your resume.", ai: "Heading to the resume.", cmd: { type: "scroll", id: "resume" } },
  { you: "How does this site work?", ai: "Heading to the architecture section.", cmd: { type: "scroll", id: "architecture" } },
  { you: "Take me to hackathons.", ai: "Jumping to hackathons.", cmd: { type: "scroll", id: "hackathons" } },
  { you: "Show me only the 2025 projects.", ai: "Filtering to 2025.", cmd: { type: "filter", year: 2025 } },
  { you: "What about the fintech work?", ai: "Filtering by fintech.", cmd: { type: "filter", tag: "fintech" } },
  { you: "Reset the projects.", ai: "Clearing filters.", cmd: { type: "filter", tag: "all" } },
  { you: "Take me to your education.", ai: "Heading to education.", cmd: { type: "scroll", id: "education" } },
  { you: "Take me back to the top.", ai: "Returning home.", cmd: { type: "scroll", id: "hero" } },
];

export const cmdBtn =
  "text-left px-3 py-2.5 rounded-[10px] border border-line-soft bg-white/[0.02] text-[13.5px] text-ink flex items-center gap-2.5 transition-all duration-200 hover:border-[rgba(192,132,252,0.4)] hover:bg-[rgba(192,132,252,0.08)]";
