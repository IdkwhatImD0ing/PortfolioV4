import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CHANNEL_PREFIX,
  PUSHER_CLUSTER,
  PUSHER_KEY,
  channelName,
  newEventsChannelId,
  parseNavigation,
  parseTranscript,
  subscribeToVoiceEvents,
  uuidFromBytes,
  webCallBody,
  withTimeout,
} from "./voice-events";

/** A stand-in for pusher-js: records what was subscribed and bound, and lets
 *  a test fire events on a channel. */
const fake = vi.hoisted(() => {
  type Handler = (data?: unknown) => void;
  const state = {
    instances: [] as Array<{
      key: string;
      options: unknown;
      subscribed: string[];
      unsubscribed: string[];
      disconnected: boolean;
      handlers: Map<string, Handler[]>;
    }>,
    fire(event: string, data?: unknown) {
      const inst = state.instances[state.instances.length - 1];
      for (const h of inst.handlers.get(event) ?? []) h(data);
    },
  };
  class FakePusher {
    constructor(key: string, options: unknown) {
      state.instances.push({
        key,
        options,
        subscribed: [],
        unsubscribed: [],
        disconnected: false,
        handlers: new Map(),
      });
    }
    private get me() {
      return state.instances[state.instances.length - 1];
    }
    subscribe(name: string) {
      const me = this.me;
      me.subscribed.push(name);
      return {
        bind(event: string, handler: Handler) {
          me.handlers.set(event, [...(me.handlers.get(event) ?? []), handler]);
        },
        unbind_all() {
          me.handlers.clear();
        },
      };
    }
    unsubscribe(name: string) {
      this.me.unsubscribed.push(name);
    }
    disconnect() {
      this.me.disconnected = true;
    }
  }
  return { state, FakePusher };
});

vi.mock("pusher-js", () => ({ default: fake.FakePusher }));

const ID = "123e4567-e89b-42d3-a456-426614174000";

describe("channel ids", () => {
  it("are UUIDs in the lowercase form the server accepts", () => {
    const pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    for (let i = 0; i < 20; i++) expect(newEventsChannelId()).toMatch(pattern);
  });

  it("are fresh every time", () => {
    expect(newEventsChannelId()).not.toBe(newEventsChannelId());
  });

  it("name the channel with the server's prefix", () => {
    expect(CHANNEL_PREFIX).toBe("voice-");
    expect(channelName(ID)).toBe(`voice-${ID}`);
  });

  it("have a fallback where crypto.randomUUID is missing", () => {
    // Safari before 15.4, and plain-http pages, have getRandomValues only.
    const pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    expect(uuidFromBytes(new Uint8Array(16))).toBe("00000000-0000-4000-8000-000000000000");
    expect(uuidFromBytes(new Uint8Array(16).fill(255))).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff");
    for (let i = 0; i < 20; i++) {
      expect(uuidFromBytes(crypto.getRandomValues(new Uint8Array(16)))).toMatch(pattern);
    }
  });
});

describe("webCallBody", () => {
  it("names the call's channel where the server looks for it", () => {
    const now = new Date(Date.UTC(2026, 8, 21, 12));
    expect(webCallBody("agent_1", ID, now)).toEqual({
      agent_id: "agent_1",
      metadata: {
        session_started: "2026-09-21T12:00:00.000Z",
        platform: "web",
        events_channel: ID,
      },
    });
  });
});

describe("withTimeout", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("passes a prompt value through", async () => {
    await expect(withTimeout(Promise.resolve(5), 100)).resolves.toBe(5);
  });

  it("gives null for a promise that doesn't settle in time", async () => {
    const pending = withTimeout(new Promise<number>(() => {}), 100);
    await vi.advanceTimersByTimeAsync(100);
    await expect(pending).resolves.toBeNull();
  });

  it("passes a rejection through", async () => {
    await expect(withTimeout(Promise.reject(new Error("no chunk")), 100)).rejects.toThrow("no chunk");
  });
});

describe("parseNavigation", () => {
  it("accepts the server's navigation payload", () => {
    expect(parseNavigation({ type: "navigation", page: "resume" })).toEqual({
      type: "navigation",
      page: "resume",
    });
    expect(parseNavigation({ type: "navigation", page: "project", project_id: "gitpt" })).toEqual({
      type: "navigation",
      page: "project",
      project_id: "gitpt",
    });
  });

  it.each([
    null,
    undefined,
    "navigation",
    42,
    {},
    { type: "other", page: "resume" },
    { type: "navigation" },
    { type: "navigation", page: 3 },
    { type: "navigation", page: "project", project_id: 7 },
  ])("rejects %j", (data) => {
    expect(parseNavigation(data)).toBeNull();
  });
});

describe("parseTranscript", () => {
  it("keeps visitor and agent lines with their index", () => {
    expect(
      parseTranscript({
        transcript: [
          { index: 0, role: "agent", content: "Hi!" },
          { index: 1, role: "user", content: "Show me your resume" },
        ],
      }),
    ).toEqual([
      { index: 0, role: "agent", content: "Hi!" },
      { index: 1, role: "user", content: "Show me your resume" },
    ]);
  });

  it("drops lines that aren't indexed visitor or agent text", () => {
    expect(
      parseTranscript({
        transcript: [
          { index: 0, role: "system", content: "x" },
          { index: 1, role: "agent", content: "" },
          { index: 2, role: "user", content: 5 },
          { role: "user", content: "no index" },
          { index: -1, role: "user", content: "negative" },
          { index: 1.5, role: "user", content: "fraction" },
          { index: "3", role: "user", content: "string index" },
          null,
          "text",
          { index: 4, role: "user", content: "Hello", notice: true },
        ],
      }),
    ).toEqual([{ index: 4, role: "user", content: "Hello" }]);
  });

  it.each([
    null,
    "x",
    {},
    { transcript: "x" },
    { transcript: [] },
    { transcript: [{ role: "x" }] },
    { transcript: [{ role: "user", content: "no index" }] },
  ])("has nothing to merge for %j", (data) => {
    expect(parseTranscript(data)).toBeNull();
  });
});

describe("subscribeToVoiceEvents", () => {
  beforeEach(() => {
    fake.state.instances.length = 0;
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  async function subscribed(handlers = { onNavigation: vi.fn(), onTranscript: vi.fn() }) {
    const pending = subscribeToVoiceEvents(ID, handlers);
    await vi.waitFor(() => expect(fake.state.instances).toHaveLength(1));
    fake.state.fire("pusher:subscription_succeeded");
    return { sub: await pending, handlers };
  }

  it("connects with the app key and cluster and subscribes to the call's channel", async () => {
    await subscribed();
    const [inst] = fake.state.instances;
    expect(inst.key).toBe(PUSHER_KEY);
    expect(inst.options).toEqual({ cluster: PUSHER_CLUSTER });
    expect(inst.subscribed).toEqual([`voice-${ID}`]);
  });

  it("passes valid navigation and transcript events on", async () => {
    const { handlers } = await subscribed();
    fake.state.fire("navigation", { type: "navigation", page: "education" });
    fake.state.fire("transcript", { transcript: [{ index: 0, role: "agent", content: "Here." }] });
    expect(handlers.onNavigation).toHaveBeenCalledWith({ type: "navigation", page: "education" });
    expect(handlers.onTranscript).toHaveBeenCalledWith([{ index: 0, role: "agent", content: "Here." }]);
  });

  it("ignores malformed events", async () => {
    const { handlers } = await subscribed();
    fake.state.fire("navigation", { type: "navigation" });
    fake.state.fire("transcript", { transcript: [] });
    expect(handlers.onNavigation).not.toHaveBeenCalled();
    expect(handlers.onTranscript).not.toHaveBeenCalled();
  });

  it("waits for Pusher to confirm the subscription", async () => {
    // Otherwise the call could dial, and the server publish, before the
    // channel is live, and the first page moves would reach nobody.
    let resolved = false;
    const pending = subscribeToVoiceEvents(ID, { onNavigation: vi.fn(), onTranscript: vi.fn() }).then(
      (sub) => {
        resolved = true;
        return sub;
      },
    );
    await vi.waitFor(() => expect(fake.state.instances).toHaveLength(1));
    await vi.advanceTimersByTimeAsync(1000);
    expect(resolved).toBe(false);
    fake.state.fire("pusher:subscription_succeeded");
    await pending;
    expect(resolved).toBe(true);
  });

  it("dials anyway if Pusher never confirms", async () => {
    const pending = subscribeToVoiceEvents(ID, { onNavigation: vi.fn(), onTranscript: vi.fn() }, 3000);
    await vi.waitFor(() => expect(fake.state.instances).toHaveLength(1));
    await vi.advanceTimersByTimeAsync(3000);
    await expect(pending).resolves.toHaveProperty("close");
  });

  it("dials anyway if the subscription fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const pending = subscribeToVoiceEvents(ID, { onNavigation: vi.fn(), onTranscript: vi.fn() });
    await vi.waitFor(() => expect(fake.state.instances).toHaveLength(1));
    fake.state.fire("pusher:subscription_error", { status: 500 });
    await expect(pending).resolves.toHaveProperty("close");
  });

  it("close unsubscribes, drops its handlers and disconnects, once", async () => {
    const { sub, handlers } = await subscribed();
    sub.close();
    sub.close();
    const [inst] = fake.state.instances;
    expect(inst.unsubscribed).toEqual([`voice-${ID}`]);
    expect(inst.disconnected).toBe(true);
    fake.state.fire("navigation", { type: "navigation", page: "resume" });
    expect(handlers.onNavigation).not.toHaveBeenCalled();
  });
});
