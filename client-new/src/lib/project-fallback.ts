import type { Project } from "./portfolio-data";

/** Raw entry as it appears in pinecone/data.json. */
interface PineconeEntry {
  id: string;
  name: string;
  summary: string;
  details?: string;
  github?: string;
  demo?: string;
}

function mapPineconeToProject(entry: PineconeEntry): Project {
  return {
    id: entry.id,
    name: entry.name,
    summary: entry.summary,
    long: entry.details,
    github: entry.github,
    demo: entry.demo,
    // Defaults for fields Pinecone doesn't carry. The full curated set lives
    // in portfolio-data.ts; this fallback is only for archived projects
    // surfaced by the agent but not displayed on the projects rail.
    year: 0,
    tags: [],
    accent: "violet",
  };
}

/** Lazy-load a project that exists in the agent's Pinecone corpus but isn't
 *  part of the curated PROJECTS array. The Pinecone JSON is code-split, so
 *  it's only fetched when a user opens an archived project. Returns null if
 *  the id isn't in the corpus either.
 *
 *  Note: `src/data/pinecone-projects.json` is a mirror of the repo-level
 *  `pinecone/data.json`. Keep them in sync when ingesting new projects. */
export async function loadFallbackProject(id: string): Promise<Project | null> {
  try {
    const mod = await import("@/data/pinecone-projects.json");
    const data = (mod as { default: PineconeEntry[] }).default;
    const entry = data.find((p) => p.id === id);
    return entry ? mapPineconeToProject(entry) : null;
  } catch (err) {
    console.error("Failed to load fallback project data:", err);
    return null;
  }
}
