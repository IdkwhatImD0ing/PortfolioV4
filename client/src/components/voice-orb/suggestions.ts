import type { VoiceCommand } from "@/lib/voice-bus";

export interface Suggestion {
  /** What the visitor says (or sends, in text mode). */
  you: string;
  /** The canned reply shown when the chip runs as a local demo command. */
  ai: string;
  /** The page command the demo fires. */
  cmd: VoiceCommand;
}

/** The three starter chips shown inside the panel until the visitor's first
 *  turn. In voice mode a tap runs the command locally (instant, works even
 *  with no backend); in text mode the text is sent to the agent as-is. */
export const SUGGESTIONS: Suggestion[] = [
  {
    you: "Show me only the voice AI projects.",
    ai: "Filtering by voice + AI.",
    cmd: { type: "filter", tag: "voice" },
  },
  {
    you: "Highlight SentinelAI.",
    ai: "Focusing SentinelAI.",
    cmd: { type: "focus", id: "sentinelai" },
  },
  {
    you: "Tell me more about Dispatch AI.",
    ai: "Opening Dispatch AI deep-dive.",
    cmd: { type: "open", id: "dispatchai" },
  },
];

export const cmdBtn =
  "text-left px-3 py-2.5 rounded-[10px] border border-line-soft bg-white/[0.02] text-[13.5px] text-ink flex items-center gap-2.5 transition-all duration-200 hover:border-[rgba(192,132,252,0.4)] hover:bg-[rgba(192,132,252,0.08)]";
