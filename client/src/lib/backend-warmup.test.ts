import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";
import { PROD_API_URL } from "./backend";
import {
  READY_TIMEOUT_MS,
  WARM_INTERVAL_MS,
  resetBackendWarmup,
  waitForBackend,
  warmBackend,
} from "./backend-warmup";

const devBackend = vi.hoisted(() => ({ preferred: false }));
vi.mock("./retell-agent", () => ({
  prefersDevBackend: () => devBackend.preferred,
}));

const T0 = Date.UTC(2026, 8, 11);

let fetchMock: Mock<typeof fetch>;

beforeEach(() => {
  resetBackendWarmup();
  devBackend.preferred = false;
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(new Response(null)));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("warmBackend", () => {
  it("sends a fire-and-forget GET to the backend's /ping", () => {
    warmBackend();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${PROD_API_URL}/ping`);
    // Opaque is fine (it only has to reach Cloud Run), and keepalive lets it
    // finish if the visitor leaves before the boot completes.
    expect(init).toMatchObject({
      mode: "no-cors",
      cache: "no-store",
      keepalive: true,
    });
  });

  it("does not re-ping inside the warm interval", () => {
    warmBackend();
    vi.setSystemTime(T0 + WARM_INTERVAL_MS - 1);
    warmBackend();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("pings again once the interval has passed", () => {
    warmBackend();
    vi.setSystemTime(T0 + WARM_INTERVAL_MS);
    warmBackend();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("lets the next trigger retry after a ping fails", async () => {
    // Doubles as the no-leak check: vitest fails the run on an unhandled
    // rejection.
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    warmBackend();
    await vi.advanceTimersByTimeAsync(0);

    vi.setSystemTime(T0 + 1_000);
    warmBackend();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("treats a clock that stepped backwards as expired", () => {
    warmBackend();
    vi.setSystemTime(T0 - 60 * 60 * 1000);
    warmBackend();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("stays quiet when the build dials a local dev backend", () => {
    devBackend.preferred = true;
    warmBackend();

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("waitForBackend", () => {
  it("resolves once the backend answers /ping", async () => {
    await expect(waitForBackend()).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith(
      `${PROD_API_URL}/ping`,
      expect.objectContaining({ mode: "no-cors" }),
    );
  });

  it("gives up after READY_TIMEOUT_MS and lets the call go ahead", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // A backend that never answers: the request settles only when aborted.
    fetchMock.mockImplementationOnce(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );

    const waiting = waitForBackend();
    await vi.advanceTimersByTimeAsync(READY_TIMEOUT_MS);

    await expect(waiting).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledOnce();
  });
});
