import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  API_URL,
  WARM_INTERVAL_MS,
  resetBackendWarmup,
  warmBackend,
} from "./backend-warmup";

type FetchMock = ReturnType<typeof vi.fn> & typeof fetch;

const okFetch = () =>
  vi.fn(() => Promise.resolve(new Response(null))) as unknown as FetchMock;

describe("warmBackend", () => {
  beforeEach(() => resetBackendWarmup());

  it("sends a fire-and-forget GET to /ping on the backend", () => {
    const fetchImpl = okFetch();

    expect(warmBackend({ fetchImpl, now: 1_000 })).toBe(true);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_URL}/ping`);
    // Opaque is fine — we only need the request to reach Cloud Run — and
    // keepalive lets it finish if the visitor leaves before the boot completes.
    expect(init).toMatchObject({
      mode: "no-cors",
      cache: "no-store",
      keepalive: true,
    });
  });

  it("targets a custom base URL when given one", () => {
    const fetchImpl = okFetch();

    warmBackend({ fetchImpl, now: 1_000, baseUrl: "https://example.test" });

    expect(fetchImpl.mock.calls[0][0]).toBe("https://example.test/ping");
  });

  it("does not re-ping inside the warm interval", () => {
    const fetchImpl = okFetch();

    warmBackend({ fetchImpl, now: 1_000 });
    const again = warmBackend({
      fetchImpl,
      now: 1_000 + WARM_INTERVAL_MS - 1,
    });

    expect(again).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("pings again once the interval has passed", () => {
    const fetchImpl = okFetch();

    warmBackend({ fetchImpl, now: 1_000 });
    const again = warmBackend({ fetchImpl, now: 1_000 + WARM_INTERVAL_MS });

    expect(again).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("force bypasses the interval", () => {
    const fetchImpl = okFetch();

    warmBackend({ fetchImpl, now: 1_000 });
    const again = warmBackend({ fetchImpl, now: 1_001, force: true });

    expect(again).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("never throws or leaks a rejection when the request fails", async () => {
    // Vitest fails the run on an unhandled rejection, so letting the rejected
    // promise settle here is the assertion.
    const rejecting = vi.fn(() =>
      Promise.reject(new Error("offline")),
    ) as unknown as FetchMock;
    expect(() => warmBackend({ fetchImpl: rejecting, now: 1_000 })).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const throwing = vi.fn(() => {
      throw new TypeError("bad url");
    }) as unknown as FetchMock;
    expect(warmBackend({ fetchImpl: throwing, now: 1_000, force: true })).toBe(
      true,
    );
  });

  it("is a no-op where fetch does not exist (server render)", () => {
    const saved = globalThis.fetch;
    // @ts-expect-error -- simulate a runtime without fetch
    globalThis.fetch = undefined;
    try {
      expect(warmBackend({ now: 1_000 })).toBe(false);
    } finally {
      globalThis.fetch = saved;
    }
  });
});
