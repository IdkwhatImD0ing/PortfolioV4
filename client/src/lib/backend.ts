/**
 * Where the FastAPI backend lives.
 *
 * Production talks to the Cloud Run service behind its custom domain. In
 * local dev you may run the backend locally, exposed through the Makefile's
 * ngrok tunnel (https://conversational.ngrok.app). When that tunnel answers
 * `/ping`, dev builds use it instead so requests hit your local server;
 * otherwise they fall back to production.
 *
 * Three callers use it. `retell-agent.ts` probes the tunnel in the browser to
 * pick which Retell agent to dial. The `/api/chat` route runs on the Next
 * server and proxies text chat, so the browser never calls the backend
 * cross-origin (its CORS only allows localhost:3000 and *.art3m1s.me, which
 * would break Vercel previews and other dev ports). `backend-warmup.ts` pings
 * production on page load so Cloud Run is booting before anyone calls.
 *
 * Either way a dormant tunnel reads as "down". From the browser, the backend
 * allows `http://localhost:3000` via CORS, so a live tunnel's `/ping` returns
 * 200, while ngrok's own error page carries no CORS header and `fetch`
 * rejects. From the server there is no CORS, but that error page comes back
 * non-2xx, so `res.ok` is false.
 *
 * Both URLs use `||` rather than `??`: Next inlines a blank env var as "", and
 * a blank base URL would turn every request into a relative one against the
 * Next app itself.
 */

/** Dev backend base URL, probed at `/ping`. Defaults to the Makefile tunnel. */
export const DEV_API_URL =
  process.env.NEXT_PUBLIC_DEV_API_URL || "https://conversational.ngrok.app";

/**
 * Production backend. Env wins so a preview can point elsewhere.
 *
 * The same host is CUSTOM_DOMAIN in server/deploy.sh and the Retell agent's
 * llm_websocket_url. Move them together: the warm-up ping never reads its
 * response, so a stale value here fails silently.
 */
export const PROD_API_URL =
  process.env.NEXT_PUBLIC_API_URL || "https://portfolio-ws.art3m1s.me";

/**
 * Pure decision: which base URL to use given the inputs. Prefer the dev
 * backend only in dev, and only when it answered the probe.
 */
export function chooseApiBase(opts: {
  isDev: boolean;
  devReachable: boolean;
  devUrl?: string;
  prodUrl?: string;
}): string {
  const { isDev, devReachable, devUrl = DEV_API_URL, prodUrl = PROD_API_URL } = opts;
  return isDev && devReachable ? devUrl : prodUrl;
}

/**
 * Probe the dev backend's `/ping`. Resolves true only when the backend itself
 * answers ok (see module note on why a dormant ngrok tunnel reads as false).
 * Never throws — times out to false after `timeoutMs`.
 */
export async function isDevBackendUp(timeoutMs = 1200): Promise<boolean> {
  if (typeof fetch === "undefined") return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${DEV_API_URL}/ping`, {
      signal: controller.signal,
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolve the backend base URL for server-side calls such as the `/api/chat`
 * proxy. Production builds skip the network round-trip entirely.
 */
export async function resolveApiBase(): Promise<string> {
  const isDev = process.env.NODE_ENV !== "production";
  const devReachable = isDev ? await isDevBackendUp() : false;
  return chooseApiBase({ isDev, devReachable });
}
