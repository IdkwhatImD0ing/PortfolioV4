import { describe, expect, it } from "vitest";
import { loadFallbackProject } from "./project-fallback";
import { findProject } from "./portfolio-data";

// An id that is in the Pinecone corpus but deliberately not in the curated
// PROJECTS array — the exact case this fallback exists for.
const ARCHIVED_ID = "skysearch-t5ci1v";

describe("loadFallbackProject", () => {
  it("only covers ids the curated set doesn't already resolve", () => {
    expect(findProject(ARCHIVED_ID)).toBeUndefined();
  });

  it("loads an archived project out of the Pinecone corpus", async () => {
    const p = await loadFallbackProject(ARCHIVED_ID);
    expect(p?.id).toBe(ARCHIVED_ID);
    expect(p?.name).toBe("SkySearch");
    expect(p?.summary).toBeTruthy();
  });

  it("leaves year undefined rather than defaulting it to 0", async () => {
    // Regression: the detail modal renders `Project · ${year}`, so a 0 here
    // surfaced as the literal string "Project · 0".
    const p = await loadFallbackProject(ARCHIVED_ID);
    expect(p?.year).toBeUndefined();
    expect(p).not.toHaveProperty("year", 0);
  });

  it("returns null for an id that isn't in the corpus either", async () => {
    expect(await loadFallbackProject("not-a-real-project")).toBeNull();
    expect(await loadFallbackProject("")).toBeNull();
  });
});
