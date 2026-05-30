import { describe, expect, it } from "vitest";
import {
  metaToNavigationAction,
  PAGE_TO_SECTION,
  type NavigationMeta,
} from "./voice-bus";

describe("metaToNavigationAction", () => {
  it("returns null for null/undefined/missing-page payloads", () => {
    expect(metaToNavigationAction(null)).toBeNull();
    expect(metaToNavigationAction(undefined)).toBeNull();
    expect(metaToNavigationAction({ type: "navigation" } as NavigationMeta)).toBeNull();
  });

  it("returns null when type is not 'navigation'", () => {
    expect(
      metaToNavigationAction({ type: "other", page: "education" } as NavigationMeta),
    ).toBeNull();
  });

  it("emits an open command when navigating to a specific project", () => {
    const action = metaToNavigationAction({
      type: "navigation",
      page: "project",
      project_id: "dispatch-ai",
    });
    expect(action).toEqual({
      command: { type: "open", id: "dispatch-ai" },
      scrollTo: "projects",
    });
  });

  it("uses the canonical Pinecone slug for the open command", () => {
    // The agent emits Pinecone IDs; the routing layer should not rewrite
    // them. Alias resolution happens later in projects.tsx (findProject).
    const action = metaToNavigationAction({
      type: "navigation",
      page: "project",
      project_id: "sentinelai-dec0jp",
    });
    expect(action?.command).toEqual({ type: "open", id: "sentinelai-dec0jp" });
  });

  it("falls back to a scroll-to-projects when no project_id is provided", () => {
    const action = metaToNavigationAction({
      type: "navigation",
      page: "project",
    });
    expect(action).toEqual({
      command: { type: "scroll", id: "projects" },
      scrollTo: "projects",
    });
  });

  it.each([
    ["landing", "hero"],
    ["personal", "personal"],
    ["education", "education"],
    ["resume", "resume"],
    ["hackathon", "hackathons"],
    ["architecture", "architecture"],
  ] as const)("maps page='%s' to scroll-to-'%s'", (page, section) => {
    const action = metaToNavigationAction({ type: "navigation", page });
    expect(action).toEqual({
      command: { type: "scroll", id: section },
      scrollTo: section,
    });
  });

  it("returns null for an unknown page value", () => {
    expect(
      metaToNavigationAction({
        type: "navigation",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        page: "blog" as any,
      }),
    ).toBeNull();
  });
});

describe("PAGE_TO_SECTION", () => {
  it("has an entry for every page the server can emit", () => {
    // Mirrors the server-side `_PAGE_TOOLS` values + 'project'. If a new
    // page is added on the server, this test should be updated in lockstep.
    const expected = [
      "landing",
      "personal",
      "education",
      "resume",
      "hackathon",
      "architecture",
      "project",
    ];
    expect(Object.keys(PAGE_TO_SECTION).sort()).toEqual(expected.sort());
  });
});
