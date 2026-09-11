/**
 * Wake the voice backend before the visitor needs it.
 *
 * The FastAPI server runs on Cloud Run with min-instances 0 (`KEEP_WARM=0` in
 * server/deploy.sh), so after a quiet stretch it scales to zero and the next
 * request pays a 5–18 s cold start. Retell only opens its LLM websocket once a
 * call is already ringing, which means the first caller after that idle period
 * sits through the whole boot in silence and hangs up. (Seen 2026-09-11:
 * caller gone at 17.9 s, server ready at 18.0 s, empty transcript.)
 *
 * Two layers:
 * - `warmBackend()` hits `/ping` on page load, when the tab comes back into
 *   view, and when the voice panel opens, so the instance is usually already
 *   booting by the time anyone calls.
 * - `waitForBackend()` sits on the call path and holds the call under
 *   "Connecting…" until the backend answers, so a visitor who beats the boot
 *   waits on a spinner instead of a silent call.
 *
 * Both only cover calls placed from this page. Phone calls, Retell dashboard
 * test calls and webhooks still cold-start. Setting `KEEP_WARM=1` in
 * server/deploy.sh fixes every caller for about $7 a month (one idle
 * 1 vCPU / 512 MiB instance).
 */

import { PROD_API_URL } from "./backend";
import { prefersDevBackend } from "./retell-agent";

/**
 * Minimum gap between passive pings. This only rate-limits the triggers; it is
 * not a heartbeat. A visitor who keeps reading past Cloud Run's ~15-minute idle
 * window can still find the instance cold, and `waitForBackend()` covers them.
 */
export const WARM_INTERVAL_MS = 5 * 60 * 1000;

/** Longest a call waits for the backend. Measured cold starts run 5–18 s. */
export const READY_TIMEOUT_MS = 20 * 1000;

const PING_URL = `${PROD_API_URL}/ping`;

let lastPingAt = -Infinity;

/**
 * Fire-and-forget GET to `/ping`, at most once per `WARM_INTERVAL_MS`.
 *
 * Skipped in a dev build with a dev agent configured, since that build dials
 * the local backend (see `prefersDevBackend`). Call it from effects and event
 * handlers only; nothing here stops it from running during a server render.
 */
export function warmBackend(): void {
  if (prefersDevBackend()) return;

  const now = Date.now();
  // `now >= lastPingAt`: a clock that stepped backwards reads as expired, not
  // as "pinged in the future", which would hold off pings until it caught up.
  if (now >= lastPingAt && now - lastPingAt < WARM_INTERVAL_MS) return;
  lastPingAt = now;

  // `no-cors`: the request only has to *arrive* to start the instance, so an
  // opaque response is fine, and a preview outside the backend's CORS
  // allowlist doesn't log errors. `keepalive`: finish even if the visitor
  // navigates away mid-boot.
  fetch(PING_URL, { mode: "no-cors", cache: "no-store", keepalive: true }).catch(
    () => {
      // A ping that never left (offline, DNS blip) must not hold off the next
      // trigger for the whole interval.
      if (lastPingAt === now) lastPingAt = -Infinity;
    },
  );
}

/**
 * Resolve once the backend answers `/ping`, or after `READY_TIMEOUT_MS`.
 * Never rejects: if the backend stays silent the call goes ahead exactly as it
 * would have without the wait, and the console says why it was slow.
 */
export async function waitForBackend(): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), READY_TIMEOUT_MS);
  try {
    // Even an opaque no-cors response only arrives once the instance is up.
    await fetch(PING_URL, {
      mode: "no-cors",
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (err) {
    console.warn(
      `[backend] ${PING_URL} did not answer; starting the call anyway.`,
      err,
    );
  } finally {
    clearTimeout(timer);
  }
}

/** Test hook: forget the last ping so the next call is not deduplicated. */
export function resetBackendWarmup(): void {
  lastPingAt = -Infinity;
}
