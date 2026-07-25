import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { OPTIONS, POST } from "./route";

/** Build the NextRequest the route expects. `body` is sent raw so tests can
 *  exercise the malformed-JSON path too. */
function postRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/create-web-call", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

/** Stand in for Retell's endpoint. */
function mockUpstream(status: number, payload: unknown, { html = false } = {}) {
  const fetchMock = vi.fn(async () =>
    html
      ? new Response("<html>502 Bad Gateway</html>", {
          status,
          headers: { "Content-Type": "text/html" },
        })
      : new Response(JSON.stringify(payload), {
          status,
          headers: { "Content-Type": "application/json" },
        }),
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

describe("POST /api/create-web-call", () => {
  it("returns 201 and passes Retell's body straight through", async () => {
    const upstream = { call_id: "call_123", access_token: "tok_abc" };
    mockUpstream(201, upstream);

    const res = await POST(postRequest({ agent_id: "agent_1" }));

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual(upstream);
  });

  it("forwards agent_id, metadata and dynamic variables to Retell", async () => {
    const fetchMock = mockUpstream(201, { call_id: "c", access_token: "t" });

    await POST(
      postRequest({
        agent_id: "agent_1",
        metadata: { platform: "web" },
        retell_llm_dynamic_variables: { name: "Bill" },
      }),
    );

    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://api.retellai.com/v2/create-web-call");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      agent_id: "agent_1",
      metadata: { platform: "web" },
      retell_llm_dynamic_variables: { name: "Bill" },
    });
  });

  it("omits optional fields that weren't supplied", async () => {
    const fetchMock = mockUpstream(201, { call_id: "c", access_token: "t" });

    await POST(postRequest({ agent_id: "agent_1" }));

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ agent_id: "agent_1" });
  });

  it("rejects a missing agent_id without calling Retell", async () => {
    const fetchMock = mockUpstream(201, {});

    const res = await POST(postRequest({}));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "agent_id is required" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("propagates the upstream status and error message", async () => {
    mockUpstream(422, { error: "agent not found" });

    const res = await POST(postRequest({ agent_id: "nope" }));

    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toEqual({ error: "agent not found" });
  });

  it("keeps the upstream status when the error body isn't JSON", async () => {
    mockUpstream(502, null, { html: true });

    const res = await POST(postRequest({ agent_id: "agent_1" }));

    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({
      error: "Failed to create web call",
    });
  });

  it("returns 500 when the upstream request throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );

    const res = await POST(postRequest({ agent_id: "agent_1" }));

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: "Failed to create web call",
    });
  });

  it("returns 500 on a malformed request body", async () => {
    const fetchMock = mockUpstream(201, {});

    const res = await POST(postRequest("{not json"));

    expect(res.status).toBe(500);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sets CORS headers on success and on failure", async () => {
    mockUpstream(201, { call_id: "c", access_token: "t" });
    const ok = await POST(postRequest({ agent_id: "agent_1" }));
    expect(ok.headers.get("Access-Control-Allow-Origin")).toBeTruthy();

    const bad = await POST(postRequest({}));
    expect(bad.headers.get("Access-Control-Allow-Origin")).toBeTruthy();
  });
});

describe("OPTIONS /api/create-web-call", () => {
  it("answers the preflight with the allowed methods and headers", async () => {
    const res = await OPTIONS();

    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Methods")).toBe("POST, OPTIONS");
    expect(res.headers.get("Access-Control-Allow-Headers")).toBe(
      "Content-Type, Authorization",
    );
  });
});
