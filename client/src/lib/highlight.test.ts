import { describe, expect, it } from "vitest";
import { highlightJs } from "./highlight";

describe("highlightJs", () => {
  it("reconstructs the original source exactly (no chars dropped)", () => {
    const code = `const x = "hi"; // note\nfoo(x)\nVoiceBus.emit({ type: "scroll" });`;
    expect(highlightJs(code).map((t) => t.text).join("")).toBe(code);
  });

  it("colors comments, strings, numbers, and keywords distinctly", () => {
    const toks = highlightJs(`const a = "x" // c`);
    const find = (s: string) => toks.find((t) => t.text === s);
    expect(find("const")?.cls).toContain("magenta");
    expect(find('"x"')?.cls).toContain("cyan");
    expect(toks.find((t) => t.text.startsWith("//"))?.cls).toContain("muted");
  });

  it("treats a name followed by ( as a function call", () => {
    const toks = highlightJs(`emit(1)`);
    expect(toks.find((t) => t.text === "emit")?.cls).toContain("accent");
    expect(toks.find((t) => t.text === "1")?.cls).toContain("cyan");
  });

  it("colors PascalCase identifiers as namespaces", () => {
    const toks = highlightJs(`VoiceBus.on`);
    expect(toks.find((t) => t.text === "VoiceBus")?.cls).toContain("primary");
  });

  it("does not mistake a keyword prefix for a keyword", () => {
    // `constant` must stay an identifier, not match `const`.
    const toks = highlightJs(`constant`);
    expect(toks).toHaveLength(1);
    expect(toks[0].cls).toContain("ink");
  });
});
