/**
 * Where the FastAPI backend lives, from the browser's point of view.
 *
 * Production talks to the Cloud Run service behind its custom domain. In
 * local dev you may run the backend locally, exposed through the Makefile's
 * ngrok tunnel (https://conversational.ngrok.app). When that tunnel answers
 * `/ping`, dev builds use it instead so requests hit your local server;
 * otherwise they fall back to production. `retell-agent.ts` runs the same
 * probe to decide which Retell agent to dial.
 *
 * The backend allows `http://localhost:3000` via CORS, so a normal GET to
 * `/ping` returns 200 with the CORS header when the tunnel is live. When the
 * tunnel has no running agent, ngrok answers with its own error page (no
 * matching CORS header), the browser blocks it, and `fetch` rejects — which we
 * treat as "dev backend down". That lets us tell a live backend apart from a
 * dormant tunnel without a false positive.
 */

/** Dev backend base URL, probed at `/ping`. Defaults to the Makefile tunnel. */
export const DEV_API_URL =
  process.env.NEXT_PUBLIC_DEV_API_URL ?? "https://conversational.ngrok.app";

/** Production backend (the Cloud Run custom domain from server/deploy.sh).
 *  Env wins; the literal is a fallback so prod works even if the env var is
 *  missing. */
export const PROD_API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "https://portfolio-ws.art3m1s.me";

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
 * Resolve the backend base URL for HTTP calls such as `/chat`. Production
 * builds skip the network round-trip entirely.
 */
export async function resolveApiBase(): Promise<string> {
  const isDev = process.env.NODE_ENV !== "production";
  const devReachable = isDev ? await isDevBackendUp() : false;
  return chooseApiBase({ isDev, devReachable });
}
