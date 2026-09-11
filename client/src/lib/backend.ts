/**
 * Where the FastAPI backend lives.
 *
 * Production talks to the Cloud Run service behind its custom domain. In
 * local dev you may run the backend locally, exposed through the Makefile's
 * ngrok tunnel (https://conversational.ngrok.app); `retell-agent.ts` probes
 * it to decide which Retell agent to dial.
 *
 * Both use `||` rather than `??`: Next inlines a blank env var as "", and a
 * blank base URL would turn every request into a relative one against the Next
 * app itself.
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
