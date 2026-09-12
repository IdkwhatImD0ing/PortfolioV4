import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Pin the backend so the dev-tunnel probe (vitest runs with NODE_ENV=test,
// which reads as dev) never hits the network or the fetch mock.
vi.mock("@/lib/backend", () => ({
  resolveApiBase: async () => "https://backend.test",
}));

import { POST } from "./route";

/** Build the NextRequest the route expects. `body` is sent raw so tests can
 *  exercise the malformed-JSON path too. */
function postRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const SSE =
  'data: {"type": "content", "content": "Hi"}\n\n' + 'data: {"type": "done"}\n\n';

/** Stand in for the backend's /chat endpoint. */
function mockUpstream(status: number, text: string, contentType = "text/event-stream") {
  const fetchMock = vi.fn(
    async () => new Response(text, { status, headers: { "Content-Type": contentType } }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  // Keep the route's console.error out of the test output.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const MESSAGES = [{ role: "user", content: "Tell me about Dispatch AI" }];

describe("POST /api/chat", () => {
  it("streams the backend's SSE body straight through", async () => {
    mockUpstream(200, SSE);

    const res = await POST(postRequest({ messages: MESSAGES }));

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(res.headers.get("Cache-Control")).toContain("no-cache");
    await expect(res.text()).resolves.toBe(SSE);
  });

  it("forwards only the messages to the backend's /chat, uncached", async () => {
    const fetchMock = mockUpstream(200, SSE);

    await POST(postRequest({ messages: MESSAGES, extra: "dropped" }));

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://backend.test/chat");
    expect(init.method).toBe("POST");
    expect(init.cache).toBe("no-store");
    expect(JSON.parse(init.body as string)).toEqual({ messages: MESSAGES });
  });

  it("rejects malformed JSON without calling the backend", async () => {
    const fetchMock = mockUpstream(200, SSE);

    const res = await POST(postRequest("{not json"));

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([[{}], [{ messages: [] }], [{ messages: "hi" }], [null]])(
    "rejects a body without a messages array (%j)",
    async (body) => {
      const fetchMock = mockUpstream(200, SSE);

      const res = await POST(postRequest(body));

      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({ error: "messages is required" });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("answers 502 when the backend returns an error status", async () => {
    mockUpstream(500, "Internal Server Error", "text/plain");

    const res = await POST(postRequest({ messages: MESSAGES }));

    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({ error: "Chat backend error" });
  });

  it("answers 502 when the backend can't be reached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );

    const res = await POST(postRequest({ messages: MESSAGES }));

    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({ error: "Chat backend unreachable" });
  });
});
