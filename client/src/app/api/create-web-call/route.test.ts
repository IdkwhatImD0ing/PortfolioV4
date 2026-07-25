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

/** `corsHeaders` is built at module load from NEXT_PUBLIC_APP_URL, which is
 *  unset here, so the route falls back to this origin. */
const EXPECTED_ORIGIN = "http://localhost:3000";

beforeEach(() => {
  // Keep the route's console.error out of the test output.
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("RETELLAI_API_KEY", "sk_test_key_123");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** Pull the RequestInit the route handed to fetch. */
function requestInit(fetchMock: ReturnType<typeof vi.fn>) {
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  return { url, init, headers: init.headers as Record<string, string> };
}

describe("POST /api/create-web-call", () => {
  it("returns 201 and passes Retell's body straight through", async () => {
    const upstream = { call_id: "call_123", access_token: "tok_abc" };
    mockUpstream(201, upstream);

    const res = await POST(postRequest({ agent_id: "agent_1" }));

    expect(res.status).toBe(201);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    await expect(res.json()).resolves.toEqual(upstream);
  });

  it("always answers 201 on success, whatever 2xx Retell used", async () => {
    // Mocking a 200 here is the point: if the handler ever passed the upstream
    // status through instead of pinning 201, this is what would catch it.
    mockUpstream(200, { call_id: "c", access_token: "t" });

    const res = await POST(postRequest({ agent_id: "agent_1" }));

    expect(res.status).toBe(201);
  });

  it("injects the server-side API key as a bearer token", async () => {
    // The whole reason this proxy exists — the browser must never hold the key.
    const fetchMock = mockUpstream(201, { call_id: "c", access_token: "t" });

    await POST(postRequest({ agent_id: "agent_1" }));

    const { headers } = requestInit(fetchMock);
    expect(headers.Authorization).toBe("Bearer sk_test_key_123");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("never lets the upstream call be served from cache", async () => {
    const fetchMock = mockUpstream(201, { call_id: "c", access_token: "t" });

    await POST(postRequest({ agent_id: "agent_1" }));

    expect(requestInit(fetchMock).init.cache).toBe("no-store");
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

    const { url, init } = requestInit(fetchMock);
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

    expect(JSON.parse(requestInit(fetchMock).init.body as string)).toEqual({
      agent_id: "agent_1",
    });
  });

  it("rejects a missing agent_id without calling Retell", async () => {
    const fetchMock = mockUpstream(201, {});

    const res = await POST(postRequest({}));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "agent_id is required" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an empty-string agent_id without calling Retell", async () => {
    const fetchMock = mockUpstream(201, {});

    const res = await POST(postRequest({ agent_id: "" }));

    expect(res.status).toBe(400);
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

  it("does not leak a non-string upstream error into the response", async () => {
    // Retell (or a gateway) answering {error: {...}} must not have that object
    // spliced into our body — the client contract is a plain string.
    mockUpstream(500, { error: { code: 17, detail: "internal" } });

    const res = await POST(postRequest({ agent_id: "agent_1" }));

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: "Failed to create web call",
    });
  });

  it("returns an object, not null, when a 2xx carries no body", async () => {
    // The browser does `data.access_token`; null would throw a TypeError there
    // instead of the intended "No access token" error.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 201 })),
    );

    const res = await POST(postRequest({ agent_id: "agent_1" }));

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).not.toBeNull();
    expect(body.access_token).toBeUndefined();
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

  it("pins the CORS origin on every path rather than widening it", async () => {
    // Asserting the exact value, not just truthiness — a wildcard '*' would
    // otherwise sail through.
    mockUpstream(201, { call_id: "c", access_token: "t" });
    const ok = await POST(postRequest({ agent_id: "agent_1" }));
    expect(ok.headers.get("Access-Control-Allow-Origin")).toBe(EXPECTED_ORIGIN);

    const bad = await POST(postRequest({}));
    expect(bad.headers.get("Access-Control-Allow-Origin")).toBe(EXPECTED_ORIGIN);

    mockUpstream(422, { error: "nope" });
    const upstreamErr = await POST(postRequest({ agent_id: "agent_1" }));
    expect(upstreamErr.headers.get("Access-Control-Allow-Origin")).toBe(
      EXPECTED_ORIGIN,
    );
  });
});

describe("OPTIONS /api/create-web-call", () => {
  it("answers the preflight with the allowed origin, methods and headers", async () => {
    const res = await OPTIONS();

    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(EXPECTED_ORIGIN);
    expect(res.headers.get("Access-Control-Allow-Methods")).toBe("POST, OPTIONS");
    expect(res.headers.get("Access-Control-Allow-Headers")).toBe(
      "Content-Type, Authorization",
    );
  });
});
