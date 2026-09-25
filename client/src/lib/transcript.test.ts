import { describe, expect, it } from "vitest";
import {
  mergeVoiceLines,
  withVoiceLines,
  type TranscriptEntry,
  type VoiceLine,
} from "./transcript";

const u = (content: string): TranscriptEntry => ({ role: "user", content });
const a = (content: string): TranscriptEntry => ({ role: "agent", content });
const line = (index: number, e: TranscriptEntry): VoiceLine => ({ index, ...e });

/** Run a call's windows through the merge and return what the panel shows. */
function show(windows: VoiceLine[][], before: TranscriptEntry[] = []): TranscriptEntry[] {
  let lines = new Map<number, TranscriptEntry>();
  for (const w of windows) lines = mergeVoiceLines(lines, w);
  return withVoiceLines(before, lines);
}

describe("mergeVoiceLines", () => {
  it("replaces a line in place as it streams", () => {
    expect(
      show([
        [line(0, u("tell me about yourself")), line(1, a("I'm"))],
        [line(0, u("tell me about yourself")), line(1, a("I'm Bill"))],
        [line(0, u("tell me about yourself")), line(1, a("I'm Bill Zhang."))],
      ]),
    ).toEqual([u("tell me about yourself"), a("I'm Bill Zhang.")]);
  });

  it("handles two lines changing in one window", () => {
    // The bug this replaced: the visitor's line grew while the agent started
    // talking, and every partial became its own bubble.
    expect(
      show([
        [line(0, a("Hi!")), line(1, u("Let me"))],
        [line(0, a("Hi!")), line(1, u("Let me solve")), line(2, a("I've"))],
        [line(0, a("Hi!")), line(1, u("Let me solve your projects.")), line(2, a("I've built a"))],
      ]),
    ).toEqual([a("Hi!"), u("Let me solve your projects."), a("I've built a")]);
  });

  it("takes a correction that isn't a longer version", () => {
    // Speech-to-text revises earlier words, not only adds new ones.
    expect(
      show([[line(0, u("Your project's"))], [line(0, u("Your projects."))]]),
    ).toEqual([u("Your projects.")]);
  });

  it("keeps lines that scrolled out of the window", () => {
    const turns = [u("1"), a("2"), u("3"), a("4"), u("5"), a("6"), u("7")];
    const windows = turns.map((_, i) =>
      turns.slice(Math.max(0, i - 4), i + 1).map((t, j) => line(Math.max(0, i - 4) + j, t)),
    );
    expect(show(windows).map((t) => t.content)).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
  });

  it("orders lines by index, whatever order windows arrive in", () => {
    expect(show([[line(3, a("later"))], [line(1, u("earlier"))]])).toEqual([
      u("earlier"),
      a("later"),
    ]);
  });

  it("keeps the same words said twice as two lines", () => {
    expect(show([[line(0, u("ok")), line(1, a("ok")), line(2, u("ok"))]])).toEqual([
      u("ok"),
      a("ok"),
      u("ok"),
    ]);
  });

  it("doesn't change the map it was given", () => {
    const lines = new Map([[0, u("hi")]]);
    mergeVoiceLines(lines, [line(0, u("hi there"))]);
    expect(lines.get(0)).toEqual(u("hi"));
  });
});

describe("withVoiceLines", () => {
  it("puts the call after what was on screen before it", () => {
    // Switching back to voice keeps the typed conversation above the call.
    const typed = [u("typed question"), a("typed answer")];
    expect(show([[line(0, a("Hi, voice here."))]], typed)).toEqual([
      ...typed,
      a("Hi, voice here."),
    ]);
  });

  it("is just what came before when the call has no lines yet", () => {
    const typed = [u("typed question")];
    expect(withVoiceLines(typed, new Map())).toEqual(typed);
  });
});
