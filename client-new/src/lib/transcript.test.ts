import { describe, expect, it } from "vitest";
import { mergeTranscript, type TranscriptEntry } from "./transcript";

const u = (content: string): TranscriptEntry => ({ role: "user", content });
const a = (content: string): TranscriptEntry => ({ role: "agent", content });

describe("mergeTranscript", () => {
  it("returns the window when prev is empty", () => {
    expect(mergeTranscript([], [u("hi")])).toEqual([u("hi")]);
  });

  it("returns prev unchanged when window is empty", () => {
    const prev = [u("hi"), a("hello")];
    expect(mergeTranscript(prev, [])).toBe(prev);
  });

  it("appends new turns when window is contained in prev plus extras", () => {
    const prev = [u("hi"), a("hello")];
    const window = [u("hi"), a("hello"), u("bye")];
    expect(mergeTranscript(prev, window)).toEqual([
      u("hi"),
      a("hello"),
      u("bye"),
    ]);
  });

  it("preserves history that falls off the rolling window", () => {
    // Conversation has 6 turns; the SDK only sends the last 5 in this update.
    // The first turn must survive.
    const prev = [u("1"), a("2"), u("3"), a("4"), u("5"), a("6")];
    const window = [a("2"), u("3"), a("4"), u("5"), a("6")];
    const merged = mergeTranscript(prev, window);
    expect(merged).toEqual([u("1"), a("2"), u("3"), a("4"), u("5"), a("6")]);
  });

  it("retains the full conversation across many rolling updates", () => {
    // Simulate 7 turns arriving as repeated rolling-window-of-5 updates.
    const turns: TranscriptEntry[] = [
      u("1"),
      a("2"),
      u("3"),
      a("4"),
      u("5"),
      a("6"),
      u("7"),
    ];
    let history: TranscriptEntry[] = [];
    for (let i = 0; i < turns.length; i++) {
      const window = turns.slice(Math.max(0, i - 4), i + 1);
      history = mergeTranscript(history, window);
    }
    expect(history.length).toBe(7);
    expect(history.map((t) => t.content)).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
  });

  it("dedupes turns with identical role+content (streaming refinements)", () => {
    // The agent's turn gets re-emitted as it streams; the same final form
    // appears multiple times. We keep one copy.
    const prev = [u("hi"), a("hello there")];
    const window = [u("hi"), a("hello there")];
    expect(mergeTranscript(prev, window)).toEqual([u("hi"), a("hello there")]);
  });

  it("replaces a turn as its content streams in token-by-token", () => {
    // Retell grows the agent's turn one chunk at a time. Each update must
    // replace the partial in place, not stack a new line per token.
    let history: TranscriptEntry[] = [u("tell me about yourself")];
    const partials = ["I'm", "I'm Bill", "I'm Bill Zhang."];
    for (const p of partials) {
      history = mergeTranscript(history, [u("tell me about yourself"), a(p)]);
    }
    expect(history).toEqual([u("tell me about yourself"), a("I'm Bill Zhang.")]);
  });

  it("streams the very first turn without stacking partials", () => {
    // No preceding turn to anchor on — the growing turn is the whole window.
    let history: TranscriptEntry[] = [];
    for (const p of ["Hey,", "Hey, I'm", "Hey, I'm Bill."]) {
      history = mergeTranscript(history, [a(p)]);
    }
    expect(history).toEqual([a("Hey, I'm Bill.")]);
  });

  it("distinguishes turns with same content but different roles", () => {
    // Edge case: user says "ok" and agent also says "ok" — both should be
    // preserved.
    const merged = mergeTranscript([], [u("ok"), a("ok")]);
    expect(merged).toEqual([u("ok"), a("ok")]);
  });
});
