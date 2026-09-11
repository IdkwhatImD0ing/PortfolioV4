/**
 * Wake the voice backend before the visitor needs it.
 *
 * The FastAPI server runs on Cloud Run with min-instances 0, so after a quiet
 * stretch it scales to zero and the next request pays a 5–18 s cold start.
 * Retell only opens its LLM websocket once a call is already ringing, which
 * means the first caller after that idle period sits through the whole boot
 * in silence — and hangs up. (Seen 2026-09-11: caller gone at 17.9 s, server
 * ready at 18.0 s, empty transcript.)
 *
 * So we hit `/ping` as soon as the page is on screen. The instance boots while
 * the visitor is still reading the hero, and is warm for the call they place a
 * minute later. The request is fire-and-forget: we never read the response,
 * and a failure changes nothing — the call just cold-starts as it did before.
 */

/** Production backend base URL. Env wins so a preview can point elsewhere. */
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "https://portfolio-ws.art3m1s.me";

/**
 * Minimum gap between pings. Cloud Run keeps an idle instance around for
 * roughly 15 minutes, so 5 keeps it alive across a long read without turning
 * every panel toggle into a request.
 */
export const WARM_INTERVAL_MS = 5 * 60 * 1000;

let lastPingAt = -Infinity;

export interface WarmBackendOptions {
  /** Backend base URL; defaults to `API_URL`. */
  baseUrl?: string;
  /** Injectable for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Injectable clock for tests; defaults to `Date.now()`. */
  now?: number;
  /** Ping even if one went out within `WARM_INTERVAL_MS`. */
  force?: boolean;
}

/**
 * Fire-and-forget GET to `${baseUrl}/ping`. Returns whether a request was
 * attempted (false when deduplicated or when there is no `fetch`, e.g. during
 * server rendering). Never throws and leaves no unhandled rejection behind.
 */
export function warmBackend(opts: WarmBackendOptions = {}): boolean {
  const fetchImpl =
    opts.fetchImpl ?? (typeof fetch === "function" ? fetch : undefined);
  if (!fetchImpl) return false;

  const now = opts.now ?? Date.now();
  if (!opts.force && now - lastPingAt < WARM_INTERVAL_MS) return false;
  lastPingAt = now;

  try {
    // `no-cors`: the request only has to *arrive* to start the instance, so an
    // opaque response is fine — and a preview deployment outside the backend's
    // CORS allowlist doesn't fill the console with errors.
    // `keepalive`: let it complete even if the visitor navigates away mid-boot.
    void fetchImpl(`${opts.baseUrl ?? API_URL}/ping`, {
      mode: "no-cors",
      cache: "no-store",
      keepalive: true,
    }).catch(() => {});
  } catch {
    // A synchronous throw (malformed URL, exotic fetch shim) is just as
    // ignorable as a rejected one.
  }
  return true;
}

/** Test hook: forget the last ping so the next call is not deduplicated. */
export function resetBackendWarmup(): void {
  lastPingAt = -Infinity;
}
