/**
 * Resolves which Retell agent the browser should dial.
 *
 * In local dev you may run the FastAPI backend locally, exposed through the
 * Makefile's ngrok tunnel (https://conversational.ngrok.app). A *dev* Retell
 * agent points its LLM websocket at that tunnel; the *prod* agent points at
 * Cloud Run. So during dev we probe the dev backend's `/ping`: if it's
 * reachable, use the dev agent so calls hit your local server; otherwise fall
 * back to the production agent.
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

/** Production Retell agent (public id, safe to ship). Env wins; the literal is
 *  a fallback so prod works even if the env var is missing. */
export const PROD_AGENT_ID =
  process.env.NEXT_PUBLIC_RETELL_AGENT_ID ?? "agent_c5ae64152c9091e17243c9bdfc";

/** Dev Retell agent wired to the local backend. Unset → no dev agent, always
 *  prod. */
export const DEV_AGENT_ID = process.env.NEXT_PUBLIC_RETELL_AGENT_ID_DEV;

/**
 * Pure decision: which agent id to dial given the inputs. No side effects, so
 * it's the unit-tested core. Prefer the dev agent only in dev, only when a dev
 * agent is configured, and only when the dev backend answered.
 */
export function chooseAgentId(opts: {
  isDev: boolean;
  devReachable: boolean;
  devAgentId?: string;
  prodAgentId?: string;
}): string | undefined {
  const { isDev, devReachable, devAgentId, prodAgentId } = opts;
  if (isDev && devAgentId && devReachable) return devAgentId;
  return prodAgentId;
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
 * Resolve the Retell agent id to dial. Only probes the dev backend when we're
 * in dev and a dev agent is configured — production builds skip the network
 * round-trip entirely and go straight to the prod agent.
 */
export async function resolveAgentId(): Promise<string | undefined> {
  const isDev = process.env.NODE_ENV !== "production";
  const devReachable = isDev && DEV_AGENT_ID ? await isDevBackendUp() : false;
  if (devReachable) {
    console.info(
      `[retell] dev backend reachable at ${DEV_API_URL} — using dev agent.`,
    );
  }
  return chooseAgentId({
    isDev,
    devReachable,
    devAgentId: DEV_AGENT_ID,
    prodAgentId: PROD_AGENT_ID,
  });
}
