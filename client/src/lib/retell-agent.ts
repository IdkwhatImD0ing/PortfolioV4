/**
 * Resolves which Retell agent the browser should dial.
 *
 * A *dev* Retell agent points its LLM websocket at the local backend's ngrok
 * tunnel; the *prod* agent points at Cloud Run. So during dev we probe the
 * dev backend (see `backend.ts` for how the probe tells a live tunnel from a
 * dormant one): if it's reachable, use the dev agent so calls hit your local
 * server; otherwise fall back to the production agent.
 */

import { DEV_API_URL, isDevBackendUp } from "./backend";

/** Production Retell agent (public id, safe to ship). Env wins; the literal is
 *  a fallback so prod works even if the env var is missing. Its LLM websocket
 *  points at the Cloud Run backend. */
export const PROD_AGENT_ID =
  process.env.NEXT_PUBLIC_RETELL_AGENT_ID ?? "agent_c5ae64152c9091e17243c9bdfc";

/** Dev Retell agent wired to the local backend. Unset → no dev agent, always
 *  prod. */
const DEV_AGENT_ID = process.env.NEXT_PUBLIC_RETELL_AGENT_ID_DEV;

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
 * Whether this build dials a local dev backend when one answers: a dev build
 * with a dev agent configured. Production builds never do. `warmBackend` reads
 * this so a dev session doesn't wake production for calls bound for the tunnel.
 */
export function prefersDevBackend(): boolean {
  return process.env.NODE_ENV !== "production" && Boolean(DEV_AGENT_ID);
}

/**
 * Resolve the Retell agent id to dial. Only probes the dev backend when we're
 * in dev and a dev agent is configured — production builds skip the network
 * round-trip entirely and go straight to the prod agent.
 */
export async function resolveAgentId(): Promise<string | undefined> {
  const isDev = process.env.NODE_ENV !== "production";
  const devReachable = prefersDevBackend() ? await isDevBackendUp() : false;
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
