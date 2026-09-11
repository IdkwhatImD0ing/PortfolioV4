"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type AnimationEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import type { RetellWebClient as RetellWebClientType } from "retell-client-js-sdk";
import {
  VoiceBus,
  scrollToSection,
  metaToNavigationAction,
  type NavigationMeta,
} from "@/lib/voice-bus";
import { mergeTranscript, type TranscriptEntry } from "@/lib/transcript";
import { resolveAgentId } from "@/lib/retell-agent";
import { resolveApiBase } from "@/lib/backend";
import { createSseParser, parseChatMarkdown, toChatMessages } from "@/lib/text-chat";
import { cn } from "@/lib/utils";
import type { RetellAIResponse } from "@/types/api";
import { SUGGESTIONS, cmdBtn, type Suggestion } from "./suggestions";

type Mode = "voice" | "text";

/** Upper bound on the close animation. `animationend` normally unmounts the
 *  panel sooner; this is the fallback if the event never fires. */
const CLOSE_FALLBACK_MS = 400;

const TEXT_HINT = "Type a question below. The page still rearranges as I answer.";

/** One agent turn. Renders the markdown subset the text prompt asks for;
 *  voice transcripts are plain text and pass through unchanged. */
function AgentTurn({ content }: { content: string }) {
  const lines = parseChatMarkdown(content);
  return (
    <div className="text-accent">
      {lines.map((line, i) => (
        <div key={i} className={line.bullet ? "pl-4" : undefined}>
          {i === 0 ? "↳ " : ""}
          {line.bullet ? "• " : ""}
          {line.tokens.map((t, j) =>
            t.kind === "bold" ? (
              <strong key={j} className="text-ink font-semibold">
                {t.text}
              </strong>
            ) : t.kind === "code" ? (
              <code key={j} className="px-1 rounded bg-white/[0.06] text-magenta">
                {t.text}
              </code>
            ) : (
              <span key={j}>{t.text}</span>
            ),
          )}
        </div>
      ))}
    </div>
  );
}

export function VoiceOrb() {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [mode, setMode] = useState<Mode>("voice");
  const [fullTranscript, setFullTranscript] = useState<TranscriptEntry[]>([]);
  const [hint, setHint] = useState("Connecting…");
  const [pulsing, setPulsing] = useState(false);
  const [isCalling, setIsCalling] = useState(false);
  const [isAgentTalking, setIsAgentTalking] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  // Text mode.
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const retellRef = useRef<RetellWebClientType | null>(null);
  const listenersBoundRef = useRef(false);
  // Mirrors of `open` / `mode` for the Retell listeners, which are bound once
  // and would otherwise see the first render's values.
  const openRef = useRef(false);
  const modeRef = useRef<Mode>("voice");
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const transcriptScrollRef = useRef<HTMLDivElement>(null);
  const shortcutTimerRef = useRef(0);
  const closeTimerRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const apiBaseRef = useRef<string | null>(null);

  // Auto-scroll transcript to bottom on new turn, status, or while pulsing.
  useEffect(() => {
    const el = transcriptScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [fullTranscript, pulsing, status]);

  // Move focus into the dialog when it opens so Escape and tabbing work.
  useEffect(() => {
    if (open && !closing) panelRef.current?.focus({ preventScroll: true });
  }, [open, closing]);

  const fireShortcut = useCallback((item: Suggestion) => {
    setFullTranscript((prev) => [...prev, { role: "user", content: item.you }]);
    setPulsing(true);
    window.clearTimeout(shortcutTimerRef.current);
    shortcutTimerRef.current = window.setTimeout(() => {
      setFullTranscript((prev) => [...prev, { role: "agent", content: item.ai }]);
      VoiceBus.emit(item.cmd);
      if (item.cmd.type === "scroll") scrollToSection(item.cmd.id);
      setPulsing(false);
    }, 380);
  }, []);

  const setupListeners = useCallback((client: RetellWebClientType) => {
    if (listenersBoundRef.current) return;

    client.on("call_started", () => {
      // The panel was closed, or switched to text, while the call was still
      // connecting. Don't leave a live mic behind.
      if (!openRef.current || modeRef.current !== "voice") {
        client.stopCall();
        return;
      }
      setIsCalling(true);
      setHint("Connected. I'm listening…");
    });
    client.on("call_ended", () => {
      setIsCalling(false);
      setIsAgentTalking(false);
      if (modeRef.current === "voice") setHint("Call ended. Start again, or switch to text.");
    });
    client.on("agent_start_talking", () => setIsAgentTalking(true));
    client.on("agent_stop_talking", () => setIsAgentTalking(false));

    client.on("update", (update: { transcript?: TranscriptEntry[] }) => {
      const t = update?.transcript;
      if (!t || t.length === 0) return;
      setFullTranscript((prev) => mergeTranscript(prev, t));
    });

    client.on("metadata", (metadata: { metadata?: NavigationMeta }) => {
      const action = metaToNavigationAction(metadata?.metadata);
      if (!action) return;
      VoiceBus.emit(action.command);
      requestAnimationFrame(() => scrollToSection(action.scrollTo));
    });

    client.on("error", (error) => {
      console.error("Retell error:", error);
      client.stopCall();
      setIsCalling(false);
      setIsAgentTalking(false);
      if (modeRef.current === "voice") setHint("Hit a snag. Please try again.");
    });

    listenersBoundRef.current = true;
  }, []);

  const startCall = useCallback(async () => {
    if (isCalling || isStarting) return;
    setIsStarting(true);
    setFullTranscript([]);
    setHint("Connecting…");
    try {
      // In dev this prefers the dev agent when the local backend is reachable,
      // otherwise the prod agent. Production builds go straight to prod.
      const agentId = await resolveAgentId();
      if (!agentId) {
        throw new Error("No Retell agent id configured (NEXT_PUBLIC_RETELL_AGENT_ID).");
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
      const data = (await response.json()) as RetellAIResponse;
      if (!data.access_token) throw new Error("No access token");

      // Closed or switched to text while the token was in flight.
      if (!openRef.current || modeRef.current !== "voice") return;
      await retellRef.current.startCall({ accessToken: data.access_token });
    } catch (err) {
      console.error("Failed to start call:", err);
      setHint("Couldn't start the call. Tap a suggestion, or switch to text chat.");
    } finally {
      setIsStarting(false);
    }
  }, [isCalling, isStarting, setupListeners]);

  const endCall = useCallback(() => {
    retellRef.current?.stopCall();
  }, []);

  const sendText = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || isSending) return;

      const next: TranscriptEntry[] = [...fullTranscript, { role: "user", content: text }];
      // The reply lands right after the user's turn. Nothing else appends to
      // the transcript in text mode, so its slot is fixed for the whole
      // stream and each token just rewrites it.
      const replyIndex = next.length;
      const commit = (content: string) =>
        setFullTranscript((prev) => [...prev.slice(0, replyIndex), { role: "agent", content }]);

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setFullTranscript(next);
      setDraft("");
      setIsSending(true);
      setStatus("Thinking…");

      let reply = "";
      try {
        if (!apiBaseRef.current) apiBaseRef.current = await resolveApiBase();
        const res = await fetch(`${apiBaseRef.current}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: toChatMessages(next) }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) throw new Error(`Server error (${res.status})`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        const parser = createSseParser();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          for (const chunk of parser.push(decoder.decode(value, { stream: true }))) {
            if (chunk.type === "content" && chunk.content) {
              reply += chunk.content;
              setStatus(null);
              commit(reply);
            } else if (chunk.type === "status" && chunk.content) {
              setStatus(chunk.content);
            } else if (chunk.type === "metadata") {
              const action = metaToNavigationAction(chunk.metadata);
              if (action) {
                VoiceBus.emit(action.command);
                requestAnimationFrame(() => scrollToSection(action.scrollTo));
              }
            } else if (chunk.type === "error") {
              throw new Error(chunk.content || "Chat error");
            }
          }
        }
        if (!reply) commit("I didn't get a reply that time. Try asking again?");
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error("Text chat failed:", err);
        if (!reply) commit("Couldn't reach the chat backend. Please try again in a moment.");
      } finally {
        // A newer send, a mode switch, or a close may own the state by now.
        if (abortRef.current === controller) {
          abortRef.current = null;
          setIsSending(false);
          setStatus(null);
        }
      }
    },
    [fullTranscript, isSending],
  );

  const finishClose = useCallback(() => {
    window.clearTimeout(closeTimerRef.current);
    setClosing(false);
    setOpen(false);
  }, []);

  /** Close the panel. The conversation ends with it: the orb reads "tap to
   *  talk", so a call quietly continuing behind it would be a surprise. */
  const closePanel = useCallback(() => {
    if (!open || closing) return;
    openRef.current = false;
    abortRef.current?.abort();
    abortRef.current = null;
    retellRef.current?.stopCall();
    setIsCalling(false);
    setIsAgentTalking(false);
    setIsSending(false);
    setStatus(null);
    setClosing(true);
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(finishClose, CLOSE_FALLBACK_MS);
  }, [open, closing, finishClose]);

  /** The orb tap: open the panel and dial in one go. */
  const openAndStart = useCallback(() => {
    if (open) return;
    openRef.current = true;
    modeRef.current = "voice";
    setMode("voice");
    setDraft("");
    setOpen(true);
    void startCall();
  }, [open, startCall]);

  const switchToText = useCallback(() => {
    modeRef.current = "text";
    retellRef.current?.stopCall();
    setIsCalling(false);
    setIsAgentTalking(false);
    setMode("text");
    setHint("Tap a suggestion above, or ask your own question.");
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const switchToVoice = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsSending(false);
    setStatus(null);
    modeRef.current = "voice";
    setMode("voice");
    void startCall();
  }, [startCall]);

  const onSuggestion = useCallback(
    (s: Suggestion) => {
      if (modeRef.current === "text") void sendText(s.you);
      else fireShortcut(s);
    },
    [fireShortcut, sendText],
  );

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void sendText(draft);
  };

  const onPanelKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") closePanel();
  };

  const onPanelAnimationEnd = (e: AnimationEvent<HTMLDivElement>) => {
    // Child animations (the gradient wash, pulsing dots) bubble up too.
    if (closing && e.target === e.currentTarget) finishClose();
  };

  // Unmount-only teardown. Keying this on `isCalling` made the cleanup fire
  // every time the flag flipped, so ending a call ran stopCall() a second time
  // on an already-closed client.
  useEffect(() => {
    return () => {
      window.clearTimeout(shortcutTimerRef.current);
      window.clearTimeout(closeTimerRef.current);
      abortRef.current?.abort();
      retellRef.current?.stopCall();
    };
  }, []);

  const userHasSpoken = fullTranscript.some((e) => e.role === "user");
  const showSuggestions = !userHasSpoken && !isSending;

  const subtitle =
    mode === "text"
      ? TEXT_HINT
      : isStarting
        ? "Connecting to the voice agent…"
        : isCalling
          ? isAgentTalking
            ? "Speaking. The page moves as I answer."
            : "Listening. Ask me anything about Bill's work."
          : "Not connected. Start a call, or switch to text.";

  return (
    <>
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Talk to the portfolio"
          tabIndex={-1}
          onKeyDown={onPanelKeyDown}
          onAnimationEnd={onPanelAnimationEnd}
          className={cn(
            "fixed right-7 bottom-7 z-[310] w-[360px] max-w-[calc(100vw-32px)] max-h-[min(72vh,640px)] flex flex-col bg-[rgba(12,10,23,0.92)] backdrop-blur-xl border border-line rounded-[22px] shadow-[0_30px_80px_rgba(0,0,0,0.55),0_0_0_1px_rgba(192,132,252,0.1)_inset] overflow-hidden outline-none max-[700px]:right-4 max-[700px]:bottom-4",
            closing ? "animate-orb-morph-out" : "animate-orb-morph-in",
          )}
        >
          {/* The orb's gradient, fading out as the panel grows from its spot. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-10 bg-[image:var(--grad)] animate-orb-morph-fade"
          />

          <header className="px-[18px] py-4 border-b border-line-soft flex items-center gap-2.5">
            <span
              className={cn(
                "w-1.5 h-1.5 rounded-full",
                isCalling
                  ? "bg-danger shadow-[0_0_8px_var(--danger)] animate-pulse-dot"
                  : mode === "text"
                    ? "bg-cyan shadow-[0_0_8px_var(--cyan)]"
                    : "bg-muted",
              )}
            />
            <span className="font-mono text-[11px] text-muted">
              {mode === "voice" ? "voice · powered by Retell" : "text chat"}
            </span>
            <button
              type="button"
              className="ml-auto text-muted p-1 hover:text-ink transition-colors"
              onClick={closePanel}
              aria-label="Close panel"
            >
              ✕
            </button>
          </header>

          <div className="overflow-y-auto p-[18px]">
            <h4 className="text-[18px] m-0 mb-1 -tracking-[0.01em] font-medium">Ask anything.</h4>
            <p className="font-mono text-[11.5px] text-muted m-0 mb-3.5 tracking-[0.04em]">
              {subtitle}
            </p>

            {mode === "voice" && (
              <div className="flex gap-2 mb-3.5">
                {isCalling ? (
                  <button
                    type="button"
                    onClick={endCall}
                    data-cursor-hover
                    className={cn(
                      cmdBtn,
                      "flex-1 justify-center font-medium text-danger border-[rgba(248,113,113,0.45)] bg-[rgba(248,113,113,0.12)] hover:border-[rgba(248,113,113,0.7)] hover:bg-[rgba(248,113,113,0.18)]",
                    )}
                  >
                    <span
                      aria-hidden
                      className="w-2 h-2 rounded-full bg-danger shadow-[0_0_10px_var(--danger)] animate-pulse-dot"
                    />
                    End call
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={startCall}
                    disabled={isStarting}
                    data-cursor-hover
                    className={cn(
                      cmdBtn,
                      "flex-1 justify-center bg-[image:var(--grad)] text-white border-transparent font-medium hover:bg-[image:var(--grad)] hover:border-transparent disabled:opacity-70",
                    )}
                  >
                    {isStarting ? "Connecting…" : "▶  Start voice call"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={switchToText}
                  data-cursor-hover
                  className={cn(cmdBtn, "justify-center whitespace-nowrap text-ink-soft")}
                >
                  Prefer to chat?
                </button>
              </div>
            )}

            {showSuggestions && (
              <div className="flex flex-wrap gap-2 mb-3.5" aria-label="Suggestions">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.you}
                    type="button"
                    onClick={() => onSuggestion(s)}
                    data-cursor-hover
                    className="font-mono text-[11.5px] px-3 py-2 rounded-full bg-white/[0.02] border border-line text-ink-soft inline-flex items-center gap-1.5 transition-all duration-200 hover:bg-[rgba(192,132,252,0.1)] hover:border-[rgba(192,132,252,0.55)] hover:text-ink"
                  >
                    <span className="text-magenta">&ldquo;</span>
                    {s.you}
                  </button>
                ))}
              </div>
            )}

            <div
              ref={transcriptScrollRef}
              className="p-3 rounded-[10px] bg-black/25 border border-line-soft font-mono text-[12px] text-ink-soft min-h-[70px] max-h-[320px] overflow-y-auto space-y-1.5"
            >
              {fullTranscript.length === 0 ? (
                <div className="text-accent">↳ {hint}</div>
              ) : (
                <>
                  {fullTranscript.map((entry, i) =>
                    entry.role === "user" ? (
                      <div key={`user-${i}`} className="text-magenta">
                        › {entry.content}
                      </div>
                    ) : (
                      <AgentTurn key={`agent-${i}`} content={entry.content} />
                    ),
                  )}
                  {pulsing && <div className="text-accent">↳ …</div>}
                  {status && <div className="text-accent animate-pulse-dot">↳ {status}</div>}
                </>
              )}
            </div>

            {mode === "text" && (
              <>
                <form onSubmit={onSubmit} className="mt-3 flex gap-2">
                  <input
                    ref={inputRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Ask about Bill's work…"
                    aria-label="Your message"
                    autoComplete="off"
                    className="flex-1 min-w-0 px-3 py-2.5 rounded-[10px] border border-line-soft bg-black/25 text-[13.5px] text-ink placeholder:text-muted outline-none focus:border-[rgba(192,132,252,0.5)] transition-colors"
                  />
                  <button
                    type="submit"
                    disabled={isSending || !draft.trim()}
                    aria-label="Send"
                    data-cursor-hover
                    className={cn(
                      cmdBtn,
                      "px-3.5 justify-center bg-[image:var(--grad)] text-white border-transparent hover:bg-[image:var(--grad)] hover:border-transparent disabled:opacity-40",
                    )}
                  >
                    ➤
                  </button>
                </form>
                <button
                  type="button"
                  onClick={switchToVoice}
                  data-cursor-hover
                  className="mt-2.5 font-mono text-[11px] text-muted hover:text-ink transition-colors"
                >
                  Prefer talking? Switch back to voice →
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {(!open || closing) && (
        <div className="fixed right-7 bottom-7 z-[300] flex items-center gap-3 max-[700px]:right-4 max-[700px]:bottom-4 animate-panel-in">
          <div className="font-mono text-[12px] px-3.5 py-2.5 rounded-full bg-[rgba(15,12,28,0.85)] backdrop-blur-md border border-line text-ink-soft flex items-center gap-2.5 max-w-[280px] max-[760px]:hidden">
            <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80] shadow-[0_0_8px_#4ade80]" />
            <span>Tap to talk · or scroll</span>
          </div>
          <button
            type="button"
            onClick={openAndStart}
            aria-label="Start a voice conversation"
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
      )}
    </>
  );
}
