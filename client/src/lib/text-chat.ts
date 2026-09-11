import type { TranscriptEntry } from "./transcript";
import type { NavigationMeta } from "./voice-bus";

/** One JSON payload from the backend's `/chat` Server-Sent Events stream.
 *  Mirrors `TextChatStreamChunk` in server/custom_types.py. */
export interface ChatChunk {
  type: "content" | "metadata" | "done" | "error" | "status";
  content?: string;
  metadata?: NavigationMeta;
}

/** One message in the `/chat` request body (`TextChatMessage` server-side). */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** How many recent turns each `/chat` request carries. Without a cap every
 *  send re-posts the whole session, so cost and latency grow per turn and a
 *  long voice call followed by text chat can overflow the model's context. */
export const MAX_HISTORY_MESSAGES = 20;

/** The transcript stores the speaker as "agent" (Retell's word); `/chat`
 *  wants "assistant". Empty turns and UI-only notices are dropped — neither
 *  is something the model said — and only the last `max` turns are kept. */
export function toChatMessages(
  transcript: TranscriptEntry[],
  max = MAX_HISTORY_MESSAGES,
): ChatMessage[] {
  return transcript
    .filter((e) => !e.notice && e.content.trim().length > 0)
    .slice(-max)
    .map((e) => ({
      role: e.role === "user" ? "user" : "assistant",
      content: e.content,
    }));
}

/**
 * Incremental SSE parser. Feed it response text as it arrives; each call
 * returns the complete `data:` payloads found so far and keeps any trailing
 * partial event for the next call. Non-`data:` lines (comments, `event:`,
 * blanks) are ignored, as is any payload that isn't valid JSON.
 */
export function createSseParser(): { push(text: string): ChatChunk[] } {
  let buffer = "";
  return {
    push(text: string): ChatChunk[] {
      buffer += text;
      const out: ChatChunk[] = [];
      // Events are separated by a blank line. Normalize CRLF first; a "\r"
      // left dangling at a chunk boundary is re-joined on the next push.
      const events = buffer.replace(/\r\n/g, "\n").split("\n\n");
      buffer = events.pop() ?? "";
      for (const evt of events) {
        const data = evt
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (!data) continue;
        try {
          out.push(JSON.parse(data) as ChatChunk);
        } catch {
          // Malformed payload — skip it rather than kill the stream.
        }
      }
      return out;
    },
  };
}

export interface InlineToken {
  kind: "text" | "bold" | "italic" | "code";
  text: string;
}

export interface ChatLine {
  bullet: boolean;
  tokens: InlineToken[];
}

// Italic needs a non-space just inside each `*`, as in markdown, so a
// spaced-out "5 * 3 * 2" stays literal.
const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s](?:[^*]*[^*\s])?\*)/g;
const BOLD = /^\*\*([^*]+)\*\*$/;
const CODE = /^`([^`]+)`$/;
const ITALIC = /^\*([^*\s](?:[^*]*[^*\s])?)\*$/;

/** Tokenize the inline markdown the model writes in text chat: `**bold**`,
 *  `*italic*` and `` `code` ``. Everything else stays literal. */
export function tokenizeInline(text: string): InlineToken[] {
  return text
    .split(INLINE)
    .filter((part) => part.length > 0)
    .map((part) => {
      const bold = BOLD.exec(part);
      if (bold) return { kind: "bold", text: bold[1] };
      const code = CODE.exec(part);
      if (code) return { kind: "code", text: code[1] };
      const italic = ITALIC.exec(part);
      if (italic) return { kind: "italic", text: italic[1] };
      return { kind: "text", text: part };
    });
}

/**
 * Split a reply into display lines. Handles the markdown subset the text
 * prompt requests — bold, inline code, `-`/`*`/`•` bullets — plus `#`
 * headings (rendered as a bold line). Blank lines are dropped; anything
 * else stays literal text, so a numbered list keeps its numbers.
 */
export function parseChatMarkdown(text: string): ChatLine[] {
  return text
    .split(/\r?\n/)
    .map((raw) => raw.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const heading = /^#{1,6}\s+(.*)$/.exec(line);
      if (heading) return { bullet: false, tokens: [{ kind: "bold", text: heading[1] }] };
      const bullet = /^[-*•]\s+(.*)$/.exec(line);
      if (bullet) return { bullet: true, tokens: tokenizeInline(bullet[1]) };
      return { bullet: false, tokens: tokenizeInline(line) };
    });
}
