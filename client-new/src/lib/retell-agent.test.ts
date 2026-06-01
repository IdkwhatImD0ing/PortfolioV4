import { describe, it, expect } from "vitest";
import { chooseAgentId } from "./retell-agent";

const DEV = "agent_dev";
const PROD = "agent_prod";

describe("chooseAgentId", () => {
  it("uses the dev agent only when in dev, configured, and backend reachable", () => {
    expect(
      chooseAgentId({ isDev: true, devReachable: true, devAgentId: DEV, prodAgentId: PROD }),
    ).toBe(DEV);
  });

  it("falls back to prod when the dev backend is unreachable", () => {
    expect(
      chooseAgentId({ isDev: true, devReachable: false, devAgentId: DEV, prodAgentId: PROD }),
    ).toBe(PROD);
  });

  it("ignores the dev agent in production even if the backend is reachable", () => {
    // A prod build should never dial a dev agent — guards against a stray
    // NEXT_PUBLIC_RETELL_AGENT_ID_DEV leaking into a deployed bundle.
    expect(
      chooseAgentId({ isDev: false, devReachable: true, devAgentId: DEV, prodAgentId: PROD }),
    ).toBe(PROD);
  });

  it("falls back to prod when no dev agent is configured", () => {
    expect(
      chooseAgentId({ isDev: true, devReachable: true, devAgentId: undefined, prodAgentId: PROD }),
    ).toBe(PROD);
  });

  it("returns undefined when neither agent is configured (caller validates)", () => {
    expect(
      chooseAgentId({ isDev: true, devReachable: false, devAgentId: undefined, prodAgentId: undefined }),
    ).toBeUndefined();
  });
});
