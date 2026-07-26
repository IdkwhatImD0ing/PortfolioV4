import { describe, expect, it } from "vitest";
import { hashTargetToRepin } from "./hash-landing";

describe("hashTargetToRepin", () => {
  it("returns the bare id for a section fragment", () => {
    expect(hashTargetToRepin("#resume")).toBe("resume");
    expect(hashTargetToRepin("#hackathons")).toBe("hackathons");
  });

  it("returns null for an empty or bare-# fragment", () => {
    expect(hashTargetToRepin("")).toBeNull();
    expect(hashTargetToRepin("#")).toBeNull();
  });

  it("leaves project deep links to ProjectsSection", () => {
    // That section scrolls itself post-hydration and opens a scroll-locked
    // modal; a second scroll from here would fight it.
    expect(hashTargetToRepin("#project/dispatch-ai")).toBeNull();
    expect(hashTargetToRepin("#project/sentinelai-dec0jp")).toBeNull();
  });

  it("decodes percent-escaped ids", () => {
    expect(hashTargetToRepin("#some%20section")).toBe("some section");
  });

  it("returns null for a malformed percent-escape instead of throwing", () => {
    expect(hashTargetToRepin("#%E0%A4%A")).toBeNull();
  });
});
