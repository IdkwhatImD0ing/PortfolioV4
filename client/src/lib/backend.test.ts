import { describe, it, expect } from "vitest";
import { chooseApiBase, DEV_API_URL, PROD_API_URL } from "./backend";

const DEV = "https://dev.example";
const PROD = "https://prod.example";

describe("chooseApiBase", () => {
  it("uses the dev backend only in dev and only when it answered", () => {
    expect(chooseApiBase({ isDev: true, devReachable: true, devUrl: DEV, prodUrl: PROD })).toBe(DEV);
  });

  it("falls back to prod in dev when the dev backend is down", () => {
    expect(chooseApiBase({ isDev: true, devReachable: false, devUrl: DEV, prodUrl: PROD })).toBe(PROD);
  });

  it("never uses the dev backend in production, even if reachable", () => {
    expect(chooseApiBase({ isDev: false, devReachable: true, devUrl: DEV, prodUrl: PROD })).toBe(PROD);
  });

  it("defaults production to the production backend, never the dev tunnel", () => {
    expect(chooseApiBase({ isDev: false, devReachable: false })).toBe(PROD_API_URL);
    expect(chooseApiBase({ isDev: false, devReachable: true })).toBe(PROD_API_URL);
    expect(PROD_API_URL).not.toBe(DEV_API_URL);
  });

  it("defaults dev to the dev tunnel when it answered", () => {
    expect(chooseApiBase({ isDev: true, devReachable: true })).toBe(DEV_API_URL);
  });
});
