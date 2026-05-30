import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PROJECTS, findProject } from "./portfolio-data";

describe("findProject", () => {
  it("resolves a project by its local id", () => {
    const project = findProject("dispatchai");
    expect(project?.name).toBe("Dispatch AI");
  });

  it("resolves a project by its Pinecone alias", () => {
    const project = findProject("dispatch-ai");
    expect(project?.id).toBe("dispatchai");
    expect(project?.name).toBe("Dispatch AI");
  });

  it("resolves projects whose local id already matches the Pinecone id", () => {
    expect(findProject("talktuahbank")?.id).toBe("talktuahbank");
    expect(findProject("slugloop")?.id).toBe("slugloop");
    expect(findProject("swarmaid")?.id).toBe("swarmaid");
  });

  it("resolves Devpost-style suffixed aliases", () => {
    expect(findProject("sentinelai-dec0jp")?.id).toBe("sentinelai");
    expect(findProject("courtvision-gtui7w")?.id).toBe("courtvision");
    expect(findProject("teachme-3p7bw1")?.id).toBe("adapted");
  });

  it("returns undefined for unknown ids", () => {
    expect(findProject("not-a-real-project")).toBeUndefined();
    expect(findProject("")).toBeUndefined();
  });

  it("never resolves the same alias to two different projects", () => {
    const allIds = PROJECTS.flatMap((p) => [p.id, ...(p.aliases ?? [])]);
    const dupes = allIds.filter((id, i) => allIds.indexOf(id) !== i);
    expect(dupes).toEqual([]);
  });
});

describe("Pinecone ↔ PROJECTS slug parity", () => {
  // The agent emits Pinecone canonical IDs in navigation metadata. If a
  // PROJECTS entry has the same name as a Pinecone entry, the Pinecone ID
  // must either equal the local id OR be listed in `aliases`. This test
  // catches the kind of drift that broke the "show me Dispatch AI" flow.

  interface PineconeEntry {
    id: string;
    name: string;
  }

  const pineconePath = join(__dirname, "../../../pinecone/data.json");
  const pinecone: PineconeEntry[] = JSON.parse(
    readFileSync(pineconePath, "utf8"),
  );

  it("every PROJECT name that exists in Pinecone is reachable via findProject(pineconeId)", () => {
    const mismatches: string[] = [];
    for (const project of PROJECTS) {
      const pineconeEntry = pinecone.find(
        (p) => p.name.toLowerCase() === project.name.toLowerCase(),
      );
      if (!pineconeEntry) continue;
      const resolved = findProject(pineconeEntry.id);
      if (resolved?.id !== project.id) {
        mismatches.push(
          `'${project.name}' is in Pinecone as id='${pineconeEntry.id}' but ` +
            `findProject('${pineconeEntry.id}') returned ` +
            `${resolved ? `id='${resolved.id}'` : "undefined"}`,
        );
      }
    }
    expect(mismatches).toEqual([]);
  });
});
