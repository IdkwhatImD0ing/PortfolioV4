"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type AnimationEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import type { RetellWebClient as RetellWebClientType } from "retell-client-js-sdk";
import {
  VoiceBus,
  applyNavigation,
  scrollToSection,
  type VoiceCommand,
} from "@/lib/voice-bus";
import { mergeVoiceLines, withVoiceLines, type TranscriptEntry } from "@/lib/transcript";
import {
  newEventsChannelId,
  subscribeToVoiceEvents,
  webCallBody,
  type VoiceEventsSubscription,
} from "@/lib/voice-events";
import { createTalkDetector } from "@/lib/talk-detector";
import { PROD_AGENT_ID, resolveAgentId } from "@/lib/retell-agent";
import { waitForBackend, warmBackend } from "@/lib/backend-warmup";
import {
  applyReplyChunk,
  createSseParser,
  parseChatMarkdown,
  toChatMessages,
} from "@/lib/text-chat";
import { cn } from "@/lib/utils";
import type { RetellAIResponse } from "@/types/api";
import { SUGGESTIONS, cmdBtn, type Suggestion } from "./suggestions";

type Mode = "voice" | "text";

/** Upper bound on the close animation. `animationend` normally unmounts the
 *  panel sooner; this is the fallback if the event never fires. */
const CLOSE_FALLBACK_MS = 400;

/** Give up on a text reply after this long with no bytes from the backend.
 *  Reset on every chunk, so a slow but steady reply is never cut off; it
 *  mainly covers a cold start that never answers or a stalled connection. */
const CHAT_IDLE_TIMEOUT_MS = 30_000;

/** Keep a call's event channel open this long after it ends: the last
 *  captions reach the page a moment after the hang-up. */
const EVENTS_LINGER_MS = 2000;

/** A failure whose message is fit to show the visitor as-is (the backend's
 *  own error text, or a stream that ended without its `done` event). */
class ChatReplyError extends Error {}

/** Run a chip's page command locally. Scroll commands move the page here; the
 *  rest are picked up by the section listening on the VoiceBus. */
function runCommand(cmd: VoiceCommand) {
  VoiceBus.emit(cmd);
  if (cmd.type === "scroll") scrollToSection(cmd.id);
}

/** A chat bubble: the visitor's on the right, the agent's on the left. The
 *  visitor's uses solid violet rather than the gradient, which fails contrast
 *  for white text at its pink midpoint (see the hero's resume button). */
function Bubble({ from, children }: { from: "user" | "agent"; children: ReactNode }) {
  const mine = from === "user";
  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] px-3.5 py-2 rounded-2xl text-[13.5px] leading-[1.5] wrap-anywhere",
          mine
            ? "rounded-br-md bg-violet text-white"
            : "rounded-bl-md bg-white/[0.05] border border-line-soft text-ink",
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** An agent reply. Renders the markdown subset the text prompt asks for
 *  (bold, inline code, bullets); voice transcripts are plain text and pass
 *  through unchanged. */
function AgentTurn({ content }: { content: string }) {
  const lines = parseChatMarkdown(content);
  return (
    <Bubble from="agent">
      <div className="space-y-1">
        {lines.map((line, i) => (
          <div key={i} className={line.bullet ? "flex gap-1.5" : undefined}>
            {line.bullet && (
              <span aria-hidden className="text-accent">
                •
              </span>
            )}
            <span>
              {line.tokens.map((t, j) =>
                t.kind === "bold" ? (
                  <strong key={j} className="font-semibold text-white">
                    {t.text}
                  </strong>
                ) : t.kind === "italic" ? (
                  <em key={j}>{t.text}</em>
                ) : t.kind === "code" ? (
                  <code
                    key={j}
                    className="px-1 rounded bg-white/[0.08] font-mono text-[12.5px] text-accent"
                  >
                    {t.text}
                  </code>
                ) : (
                  <span key={j}>{t.text}</span>
                ),
              )}
            </span>
          </div>
        ))}
      </div>
    </Bubble>
  );
}

const TYPING_DOT_DELAYS = ["0s", "0.2s", "0.4s"];

/** The agent's "typing" bubble, with the backend's status (for example
 *  "Searching projects...") beside the dots when there is one. */
function TypingBubble({ label }: { label: string | null }) {
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-2xl rounded-bl-md bg-white/[0.05] border border-line-soft">
        <span aria-hidden className="flex gap-1">
          {TYPING_DOT_DELAYS.map((delay) => (
            <span
              key={delay}
              className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-dot"
              style={{ animationDelay: delay }}
            />
          ))}
        </span>
        {label ? (
          <span className="font-mono text-[11px] text-ink-soft">{label}</span>
        ) : (
          <span className="sr-only">Typing…</span>
        )}
      </div>
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
  const orbRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const transcriptScrollRef = useRef<HTMLDivElement>(null);
  const shortcutTimerRef = useRef(0);
  const closeTimerRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  // The current call's page moves and captions (lib/voice-events.ts).
  const eventsRef = useRef<VoiceEventsSubscription | null>(null);
  // A start's subscription before it becomes eventsRef, so abandoning the
  // start can close it without waiting for the start to notice.
  const pendingEventsRef = useRef<Promise<VoiceEventsSubscription> | null>(null);
  // Bumped when a call starts or is abandoned. Events carry the number they
  // were subscribed under, so a late one from an earlier call is ignored.
  const callGenRef = useRef(0);
  // Feeds the agent's audio level to the Speaking/Listening line.
  const talkRef = useRef<((samples: Float32Array, now: number) => void) | null>(null);
  // The current call's captions, keyed by each line's index in Retell's
  // transcript, and what the panel showed before the call started. The panel
  // during a call is the one followed by the other (lib/transcript.ts).
  const voiceLinesRef = useRef<Map<number, TranscriptEntry>>(new Map());
  const preCallRef = useRef<TranscriptEntry[]>([]);
  // Mirror of fullTranscript, read when a call starts.
  const transcriptRef = useRef<TranscriptEntry[]>([]);

  // Auto-scroll transcript to bottom on new turn, status, or while pulsing.
  useEffect(() => {
    const el = transcriptScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [fullTranscript, pulsing, status]);

  useEffect(() => {
    transcriptRef.current = fullTranscript;
  }, [fullTranscript]);

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
      runCommand(item.cmd);
      setPulsing(false);
    }, 380);
  }, []);

  /** Stop listening to the call's events. `lingerMs` keeps the channel open a
   *  little longer for captions still on their way. */
  const stopEvents = useCallback((lingerMs = 0) => {
    const sub = eventsRef.current;
    if (!sub) return;
    eventsRef.current = null;
    if (lingerMs > 0) window.setTimeout(sub.close, lingerMs);
    else sub.close();
  }, []);

  /** Leave the current call behind: its events stop and any late ones are
   *  ignored. For a close or a switch to text, not for a call that ended.
   *  A start still in progress gives up too, so reopening the panel or
   *  switching back to voice can dial straight away. */
  const abandonCall = useCallback(() => {
    callGenRef.current++;
    talkRef.current = null;
    stopEvents();
    // A start parked in a cold-start wait holds a live Pusher connection
    // that isn't in eventsRef yet. Close it now, not when the wait ends.
    const pending = pendingEventsRef.current;
    pendingEventsRef.current = null;
    void pending?.then((sub) => sub.close());
    setIsStarting(false);
  }, [stopEvents]);

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
      talkRef.current = null;
      stopEvents(EVENTS_LINGER_MS);
      if (modeRef.current === "voice") setHint("Call ended. Start again, or switch to text.");
    });

    // Retell's v3 calls send no agent_start_talking/agent_stop_talking,
    // `update` or `metadata` events. Captions and page moves come over the
    // call's event channel instead (see startCall), and whether the agent is
    // speaking comes from its audio level.
    client.on("audio", (samples: Float32Array) => {
      talkRef.current?.(samples, performance.now());
    });

    client.on("error", (error) => {
      console.error("Retell error:", error);
      client.stopCall();
      setIsCalling(false);
      setIsAgentTalking(false);
      talkRef.current = null;
      stopEvents();
      if (modeRef.current === "voice") setHint("Hit a snag. Please try again.");
    });

    listenersBoundRef.current = true;
  }, [stopEvents]);

  /** Dial the voice agent. A fresh call clears the transcript; switching back
   *  from text passes `keepTranscript` so the typed conversation stays on
   *  screen above the new call. */
  const startCall = useCallback(async (keepTranscript = false) => {
    if (isCalling || isStarting) return;
    setIsStarting(true);
    if (!keepTranscript) setFullTranscript([]);
    // The call's captions go after whatever stays on screen.
    preCallRef.current = keepTranscript ? transcriptRef.current : [];
    voiceLinesRef.current = new Map();
    setHint("Connecting…");

    // Each call gets its own event channel. The backend publishes the call's
    // page moves and captions there, since Retell's v3 calls don't pass them
    // through. Subscribing runs alongside the setup below and finishes before
    // the call is created, so nothing is published before anyone listens.
    stopEvents();
    const gen = ++callGenRef.current;
    const channelId = newEventsChannelId();
    const eventsReady = subscribeToVoiceEvents(channelId, {
      onNavigation: (meta) => {
        if (callGenRef.current === gen) applyNavigation(meta);
      },
      onTranscript: (lines) => {
        if (callGenRef.current !== gen) return;
        voiceLinesRef.current = mergeVoiceLines(voiceLinesRef.current, lines);
        setFullTranscript(withVoiceLines(preCallRef.current, voiceLinesRef.current));
      },
    });
    pendingEventsRef.current = eventsReady;
    let dialed = false;
    try {
      // In dev this prefers the dev agent when the local backend is reachable,
      // otherwise the prod agent. Production builds go straight to prod.
      const agentId = await resolveAgentId();
      if (!agentId) {
        throw new Error("No Retell agent id configured (NEXT_PUBLIC_RETELL_AGENT_ID).");
      }

      // The prod agent's LLM runs on Cloud Run, which may still be booting.
      // Hold the call under "Connecting…" until it answers, so a cold start
      // costs a longer spinner instead of a silent call. Capped; never throws.
      if (agentId === PROD_AGENT_ID) await waitForBackend();
      // Closed, or switched to text, during a cold start.
      if (callGenRef.current !== gen) return;

      if (!retellRef.current) {
        const { RetellWebClient } = await import("retell-client-js-sdk");
        // Checked again: an abandoned start and a newer one can both be
        // waiting on this import, and the listeners bind to one client only.
        if (!retellRef.current) {
          retellRef.current = new RetellWebClient();
          setupListeners(retellRef.current);
        }
      }

      const events = await eventsReady;
      // Closed, or switched to text, while subscribing.
      if (callGenRef.current !== gen) return;
      pendingEventsRef.current = null;
      eventsRef.current = events;

      const response = await fetch("/api/create-web-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Its metadata tells the backend where to publish.
        body: JSON.stringify(webCallBody(agentId, channelId)),
      });
      if (!response.ok) {
        throw new Error(`Server error (${response.status})`);
      }
      const data = (await response.json()) as RetellAIResponse;
      if (!data.access_token) throw new Error("No access token");

      // Closed or switched to text while the token was in flight.
      if (callGenRef.current !== gen || !openRef.current || modeRef.current !== "voice") return;
      talkRef.current = createTalkDetector(setIsAgentTalking);
      dialed = true;
      // v3 calls need the call id, transport and ICE servers, not just the
      // token. emitRawAudioSamples feeds the `audio` listener above.
      await retellRef.current.startCall({
        accessToken: data.access_token,
        callId: data.call_id,
        transport: data.transport,
        iceServers: data.ice_servers,
        emitRawAudioSamples: true,
      });
    } catch (err) {
      console.error("Failed to start call:", err);
      // An abandoned start must not overwrite a newer call's status.
      if (callGenRef.current === gen) {
        setHint("Couldn't start the call. Tap a suggestion, or switch to text chat.");
      }
    } finally {
      if (!dialed) {
        // No call to listen to: drop the channel, now or once it lands.
        void eventsReady.then((sub) => {
          if (eventsRef.current === sub) eventsRef.current = null;
          sub.close();
        });
      }
      // abandonCall already cleared these, and a newer start may own them now.
      if (callGenRef.current === gen) {
        if (pendingEventsRef.current === eventsReady) pendingEventsRef.current = null;
        setIsStarting(false);
      }
    }
  }, [isCalling, isStarting, setupListeners, stopEvents]);

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
      // A UI-only line placed after whatever reply streamed (or in its slot if
      // none did). Marked `notice` so it is never sent back as agent history.
      const notify = (content: string, afterReply: boolean) =>
        setFullTranscript((prev) => [
          ...prev.slice(0, replyIndex + (afterReply ? 1 : 0)),
          { role: "agent", content, notice: true },
        ]);

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setFullTranscript(next);
      setDraft("");
      setIsSending(true);
      setStatus("Thinking…");

      let timedOut = false;
      let idleTimer = 0;
      const armIdleTimer = () => {
        window.clearTimeout(idleTimer);
        idleTimer = window.setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, CHAT_IDLE_TIMEOUT_MS);
      };

      let reply = "";
      try {
        armIdleTimer();
        // Same-origin proxy (app/api/chat): the backend's CORS would block a
        // direct call from Vercel previews and other dev ports.
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // supports_replace: this page handles `replace` (see the loop below).
          body: JSON.stringify({ messages: toChatMessages(next), supports_replace: true }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) throw new Error(`Server error (${res.status})`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        const parser = createSseParser();
        let finished = false;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          armIdleTimer();
          for (const chunk of parser.push(decoder.decode(value, { stream: true }))) {
            if ((chunk.type === "content" && chunk.content) || chunk.type === "replace") {
              // `replace` swaps out the whole reply rather than adding to it.
              reply = applyReplyChunk(reply, chunk);
              setStatus(null);
              commit(reply);
            } else if (chunk.type === "status" && chunk.content) {
              setStatus(chunk.content);
            } else if (chunk.type === "metadata") {
              applyNavigation(chunk.metadata);
            } else if (chunk.type === "error") {
              throw new ChatReplyError(chunk.content || "Something went wrong. Please try again.");
            } else if (chunk.type === "done") {
              finished = true;
            }
          }
        }
        // The backend always ends a reply with `done`. Without it the stream
        // was cut, and a half answer shouldn't pass for a whole one.
        if (!finished) throw new ChatReplyError("The reply was cut off. Please try again.");
        if (!reply) notify("I didn't get a reply that time. Try asking again?", false);
      } catch (err) {
        if (controller.signal.aborted && !timedOut) return;
        console.error("Text chat failed:", err);
        const message = timedOut
          ? "The chat backend stopped responding. Please try again."
          : err instanceof ChatReplyError
            ? err.message
            : "Couldn't reach the chat backend. Please try again in a moment.";
        notify(message, reply.length > 0);
      } finally {
        window.clearTimeout(idleTimer);
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
    // The orb is already back (it renders while closing). Hand focus to it,
    // or focus drops to <body> when the panel that held it unmounts.
    if (panelRef.current?.contains(document.activeElement)) {
      orbRef.current?.focus({ preventScroll: true });
    }
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
    abandonCall();
    retellRef.current?.stopCall();
    setIsCalling(false);
    setIsAgentTalking(false);
    setIsSending(false);
    setStatus(null);
    setClosing(true);
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(finishClose, CLOSE_FALLBACK_MS);
  }, [open, closing, finishClose, abandonCall]);

  /** The orb tap: open the panel and dial in one go. */
  const openAndStart = useCallback(() => {
    if (open) return;
    // Opening the panel is the strongest "about to talk" signal we get. The
    // prod call path waits on the backend anyway; this nudge also covers a
    // visitor who switches straight to text chat, and it is deduplicated
    // inside, so it's free when the page-load ping was recent.
    warmBackend();
    openRef.current = true;
    modeRef.current = "voice";
    setMode("voice");
    setDraft("");
    setOpen(true);
    void startCall();
  }, [open, startCall]);

  const switchToText = useCallback(() => {
    modeRef.current = "text";
    abandonCall();
    retellRef.current?.stopCall();
    setIsCalling(false);
    setIsAgentTalking(false);
    setMode("text");
    setHint("Ask your own question, or tap a suggestion below. The page rearranges as I answer.");
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [abandonCall]);

  const switchToVoice = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsSending(false);
    setStatus(null);
    modeRef.current = "voice";
    setMode("voice");
    void startCall(true);
  }, [startCall]);

  const onSuggestion = useCallback(
    (s: Suggestion) => {
      if (modeRef.current === "text") {
        // The text agent has no filter tool, so move the page here as well
        // as asking the agent about it.
        runCommand(s.cmd);
        void sendText(s.you);
      } else if (isCalling || isStarting) {
        // The agent can't hear a tap, and turns written into the transcript
        // here would vanish at the next caption update, which rebuilds the
        // panel from the call's own lines. Just move the page.
        runCommand(s.cmd);
      } else {
        fireShortcut(s);
      }
    },
    [fireShortcut, sendText, isCalling, isStarting],
  );

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void sendText(draft);
  };

  const onPanelKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Escape") return;
    // Close only this panel. Without this the key also reaches the project
    // modal's window listener, and one press closes both.
    e.stopPropagation();
    closePanel();
  };

  const onPanelAnimationEnd = (e: AnimationEvent<HTMLDivElement>) => {
    // Child animations (the gradient wash, pulsing dots) bubble up too.
    if (closing && e.target === e.currentTarget) finishClose();
  };

  // Unmount-only teardown. Keying this on `isCalling` made the cleanup fire
  // every time the flag flipped, so ending a call ran stopCall() a second time
  // on an already-closed client. abandonCall is stable, so this still runs
  // once; it also stops a start parked in a cold-start wait from dialing
  // after the panel that could end the call is gone.
  useEffect(() => {
    return () => {
      window.clearTimeout(shortcutTimerRef.current);
      window.clearTimeout(closeTimerRef.current);
      abortRef.current?.abort();
      abandonCall();
      retellRef.current?.stopCall();
    };
  }, [abandonCall]);

  const userHasSpoken = fullTranscript.some((e) => e.role === "user");
  const showSuggestions = !userHasSpoken && !isSending;

  // Voice-mode status line, shown above the call buttons.
  const subtitle = isStarting
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
            // One fixed size, like any chat widget: the window doesn't grow or
            // shrink with the conversation, the message list scrolls instead.
            // `dvh` so mobile browser bars don't push the bottom offscreen.
            "fixed right-7 bottom-7 z-[310] w-[380px] max-w-[calc(100vw-32px)] h-[min(600px,calc(100dvh-56px))] flex flex-col bg-[rgba(12,10,23,0.92)] backdrop-blur-xl border border-line rounded-[22px] shadow-[0_30px_80px_rgba(0,0,0,0.55),0_0_0_1px_rgba(192,132,252,0.1)_inset] overflow-hidden outline-none max-[700px]:right-4 max-[700px]:bottom-4 max-[700px]:h-[min(600px,calc(100dvh-32px))]",
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

          {/* Messages: the visitor on the right, the agent on the left. A short
              conversation sits on the controls like a messaging app; a long
              one scrolls inside the fixed-size window. */}
          <div
            ref={transcriptScrollRef}
            className="flex-1 min-h-0 overflow-y-auto px-4 py-4 flex flex-col gap-2 [scrollbar-width:thin] [scrollbar-color:var(--line)_transparent]"
          >
            {fullTranscript.length === 0 ? (
              <div className="my-auto px-4 text-center">
                <h4 className="m-0 text-[18px] -tracking-[0.01em] font-medium text-ink">
                  Ask anything.
                </h4>
                <p className="m-0 mt-1.5 font-mono text-[11.5px] leading-[1.6] text-accent">
                  {hint}
                </p>
              </div>
            ) : (
              <>
                {/* Pushes a short conversation down onto the controls. It
                    collapses to nothing once the list overflows, so scrolling
                    still reaches the first message. */}
                <div aria-hidden className="mt-auto" />
                {fullTranscript.map((entry, i) =>
                  entry.notice ? (
                    <p
                      key={`notice-${i}`}
                      className="m-0 self-center max-w-[90%] text-center font-mono text-[11px] leading-[1.5] text-ink-soft"
                    >
                      {entry.content}
                    </p>
                  ) : entry.role === "user" ? (
                    <Bubble key={`user-${i}`} from="user">
                      {entry.content}
                    </Bubble>
                  ) : (
                    <AgentTurn key={`agent-${i}`} content={entry.content} />
                  ),
                )}
              </>
            )}
            {(pulsing || status) && <TypingBubble label={status} />}

            {showSuggestions && (
              <div className="flex flex-wrap justify-end gap-2 pt-1" aria-label="Suggestions">
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
          </div>

          {/* Controls pinned to the bottom, where the orb sat. */}
          <div className="shrink-0 px-[18px] pt-3 pb-[18px] border-t border-line-soft">
            {mode === "voice" ? (
              <>
                <p className="font-mono text-[11.5px] text-muted m-0 mb-2.5 tracking-[0.04em]">
                  {subtitle}
                </p>
                <div className="flex gap-2">
                  {isCalling ? (
                    <button
                      type="button"
                      onClick={endCall}
                      data-cursor-hover
                      className={cn(
                        cmdBtn,
                        "flex-1 justify-center font-medium text-danger border-danger/45 bg-danger/12 hover:border-danger/70 hover:bg-danger/18",
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
                      onClick={() => void startCall()}
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
              </>
            ) : (
              <>
                <form onSubmit={onSubmit} className="flex gap-2">
                  {/* 16px on touch screens: iOS Safari zooms the page into any
                      input smaller than that on focus. `data-keeps-focus`
                      tells the project modal not to steal the caret. */}
                  <input
                    ref={inputRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Ask about Bill's work…"
                    aria-label="Your message"
                    autoComplete="off"
                    maxLength={1000}
                    data-keeps-focus
                    className="flex-1 min-w-0 px-3 py-2.5 rounded-[10px] border border-line-soft bg-black/25 text-[13.5px] pointer-coarse:text-[16px] text-ink placeholder:text-muted outline-none focus:border-[rgba(192,132,252,0.5)] transition-colors"
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
            ref={orbRef}
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
