import { describe, it, expect } from "vitest";
import { chooseApiBase } from "./backend";

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

  it("defaults to the shipped URLs when none are passed", () => {
    expect(chooseApiBase({ isDev: false, devReachable: false })).toMatch(/^https:\/\//);
  });
});
