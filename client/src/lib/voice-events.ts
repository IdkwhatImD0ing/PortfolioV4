import type { CreateWebCallRequest } from "@/types/api";
import type { VoiceLine } from "./transcript";
import type { NavigationMeta } from "./voice-bus";

/** Where a voice call's page moves and captions come from.
 *
 * Retell's v3 web calls don't pass the backend's `metadata` event or live
 * transcript updates through to the browser, so the backend publishes both to
 * Pusher instead (server/voice_events.py). Before dialing, the page makes up a
 * random id, subscribes to the public channel `voice-<id>`, and sends the id
 * in the call's metadata as `events_channel`.
 *
 * Neither value below is a secret. A key only lets you listen, and each call
 * listens on a channel named after an id only its own tab knows. */
export const PUSHER_KEY = process.env.NEXT_PUBLIC_PUSHER_KEY || "3b1aa13ad53a1a55ff03";
export const PUSHER_CLUSTER = process.env.NEXT_PUBLIC_PUSHER_CLUSTER || "us3";

/** Must match CHANNEL_PREFIX in server/voice_events.py. */
export const CHANNEL_PREFIX = "voice-";

/** How long a call waits for its channel (loading pusher-js included) before
 *  dialing anyway. The first event comes seconds into the call, so this
 *  rarely costs anything. */
export const SUBSCRIBE_TIMEOUT_MS = 3000;

export interface VoiceEventHandlers {
  onNavigation: (meta: NavigationMeta) => void;
  onTranscript: (window: VoiceLine[]) => void;
}

export interface VoiceEventsSubscription {
  /** Stop listening. Safe to call more than once. */
  close: () => void;
}

/** A fresh channel id: a lowercase UUID, the only shape the server accepts.
 *  crypto.randomUUID is missing on Safari before 15.4 and on plain-http pages
 *  (a phone trying a dev server over the LAN), so build one from
 *  getRandomValues there. */
export function newEventsChannelId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return uuidFromBytes(crypto.getRandomValues(new Uint8Array(16)));
}

/** A version 4 UUID from 16 random bytes. */
export function uuidFromBytes(bytes: Uint8Array): string {
  const b = Uint8Array.from(bytes);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20, 32)].join("-");
}

export function channelName(id: string): string {
  return CHANNEL_PREFIX + id;
}

/** The create-web-call body for a voice call whose events go to channel `id`.
 *  `events_channel` is the field server/voice_events.py reads. */
export function webCallBody(agentId: string, id: string, now = new Date()): CreateWebCallRequest {
  return {
    agent_id: agentId,
    metadata: {
      session_started: now.toISOString(),
      platform: "web",
      events_channel: id,
    },
  };
}

/** `promise`'s value, or null if it takes longer than `ms`. */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/** A `navigation` event's payload, or null if it isn't one. */
export function parseNavigation(data: unknown): NavigationMeta | null {
  if (!data || typeof data !== "object") return null;
  const meta = data as Partial<NavigationMeta>;
  if (meta.type !== "navigation" || typeof meta.page !== "string") return null;
  if (meta.project_id !== undefined && typeof meta.project_id !== "string") return null;
  return meta as NavigationMeta;
}

/** A `transcript` event's lines, or null if there are none worth merging.
 *  Each needs its index in Retell's transcript, which is what the panel
 *  replaces lines by. */
export function parseTranscript(data: unknown): VoiceLine[] | null {
  if (!data || typeof data !== "object") return null;
  const lines = (data as { transcript?: unknown }).transcript;
  if (!Array.isArray(lines)) return null;
  const entries: VoiceLine[] = [];
  for (const line of lines) {
    if (!line || typeof line !== "object") continue;
    const { index, role, content } = line as { index?: unknown; role?: unknown; content?: unknown };
    if (
      Number.isInteger(index) &&
      (index as number) >= 0 &&
      (role === "agent" || role === "user") &&
      typeof content === "string" &&
      content
    ) {
      entries.push({ index: index as number, role, content });
    }
  }
  return entries.length > 0 ? entries : null;
}

const NOOP_SUBSCRIPTION: VoiceEventsSubscription = { close: () => {} };

/** Subscribe to a call's channel. Resolves once Pusher confirms the
 *  subscription, or once `timeoutMs` has passed since the call (loading
 *  pusher-js counts), whichever comes first. Never rejects: if Pusher can't
 *  be reached the call still works, the page just doesn't follow along. */
export async function subscribeToVoiceEvents(
  id: string,
  handlers: VoiceEventHandlers,
  timeoutMs = SUBSCRIBE_TIMEOUT_MS,
): Promise<VoiceEventsSubscription> {
  const deadline = Date.now() + timeoutMs;
  let Pusher: typeof import("pusher-js").default | null;
  try {
    // Loaded with the call, like the Retell SDK, so the page doesn't pay for
    // it. A chunk that stalls on a bad connection must not hold up the call.
    Pusher = await withTimeout(
      import("pusher-js").then((m) => m.default),
      timeoutMs,
    );
  } catch (err) {
    console.warn("Voice events unavailable:", err);
    return NOOP_SUBSCRIPTION;
  }
  if (!Pusher) {
    console.warn("Voice events unavailable: pusher-js took too long to load");
    return NOOP_SUBSCRIPTION;
  }

  const name = channelName(id);
  const pusher = new Pusher(PUSHER_KEY, { cluster: PUSHER_CLUSTER });
  const channel = pusher.subscribe(name);
  channel.bind("navigation", (data: unknown) => {
    const meta = parseNavigation(data);
    if (meta) handlers.onNavigation(meta);
  });
  channel.bind("transcript", (data: unknown) => {
    const window = parseTranscript(data);
    if (window) handlers.onTranscript(window);
  });

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    // pusher-js keeps every instance it made; unbinding at least lets go of
    // the handlers, which hold this call's React setters.
    channel.unbind_all();
    pusher.unsubscribe(name);
    pusher.disconnect();
  };

  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, Math.max(0, deadline - Date.now()));
    const done = () => {
      clearTimeout(timer);
      resolve();
    };
    channel.bind("pusher:subscription_succeeded", done);
    channel.bind("pusher:subscription_error", (err: unknown) => {
      console.warn("Voice events subscription failed:", err);
      done();
    });
  });
  return { close };
}
