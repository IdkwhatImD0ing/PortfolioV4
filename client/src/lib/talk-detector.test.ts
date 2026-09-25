import { describe, expect, it, vi } from "vitest";
import { createTalkDetector, rms } from "./talk-detector";

const quiet = () => new Float32Array(256).fill(0.001);
const loud = () => Float32Array.from({ length: 256 }, (_, i) => (i % 2 ? 0.2 : -0.2));

describe("rms", () => {
  it("is 0 for silence and for no samples", () => {
    expect(rms(new Float32Array(128))).toBe(0);
    expect(rms(new Float32Array(0))).toBe(0);
  });

  it("is the amplitude of a square wave", () => {
    expect(rms(loud())).toBeCloseTo(0.2, 5);
  });
});

describe("createTalkDetector", () => {
  it("turns on as soon as the agent is loud", () => {
    const onChange = vi.fn();
    const feed = createTalkDetector(onChange);
    feed(quiet(), 0);
    expect(onChange).not.toHaveBeenCalled();
    feed(loud(), 16);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("turns off only after the quiet lasts", () => {
    const onChange = vi.fn();
    const feed = createTalkDetector(onChange, { releaseMs: 400 });
    feed(loud(), 0);
    feed(quiet(), 100);
    feed(quiet(), 300);
    expect(onChange).toHaveBeenLastCalledWith(true);
    feed(quiet(), 500);
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it("doesn't flicker in the gaps between words", () => {
    const onChange = vi.fn();
    const feed = createTalkDetector(onChange, { releaseMs: 400 });
    for (let t = 0; t < 3000; t += 16) {
      // 200 ms of speech, then a 150 ms pause, over and over.
      feed(t % 350 < 200 ? loud() : quiet(), t);
    }
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("reports each flip once", () => {
    const onChange = vi.fn();
    const feed = createTalkDetector(onChange, { releaseMs: 100 });
    for (const [samples, t] of [
      [loud(), 0],
      [loud(), 16],
      [quiet(), 32],
      [quiet(), 200],
      [quiet(), 300],
      [loud(), 316],
    ] as const) {
      feed(samples, t);
    }
    expect(onChange.mock.calls).toEqual([[true], [false], [true]]);
  });
});
