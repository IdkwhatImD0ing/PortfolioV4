import { describe, expect, it } from "vitest";
import {
  barLevel,
  createVoice,
  createWaveform,
  follow,
  loudness,
  planPhrase,
  seededRandom,
  stillFrame,
  type Segment,
} from "./speech-wave";

/** Back-to-back phrases covering at least `ms`, like the voice plans them. */
function planFor(ms: number, seed = 1): { segments: Segment[]; phrases: Segment[][]; end: number } {
  const random = seededRandom(seed);
  const phrases: Segment[][] = [];
  let end = 0;
  while (end < ms) {
    const phrase = planPhrase(random, end);
    phrases.push(phrase);
    const last = phrase[phrase.length - 1];
    end = last.start + last.duration;
  }
  return { segments: phrases.flat(), phrases, end };
}

/** Run a waveform at 60fps for `ms` and collect every frame. */
function record(ms: number, bars = 9, seed = 7): number[][] {
  const wave = createWaveform(bars, seededRandom(seed));
  const frames: number[][] = [];
  for (let t = 0; t < ms; t += 16) frames.push([...wave.step(16)]);
  return frames;
}

describe("seededRandom", () => {
  it("repeats for the same seed and stays in [0, 1)", () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    for (let i = 0; i < 1000; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});

describe("planPhrase", () => {
  it("talks at a human pace: 3 to 6 syllables a second, pauses included", () => {
    const { segments, end } = planFor(120_000);
    const syllables = segments.filter((s) => s.kind === "voiced").length;
    const perSecond = syllables / (end / 1000);
    expect(perSecond).toBeGreaterThan(3);
    expect(perSecond).toBeLessThan(6);
  });

  it("ends every phrase in at least 250ms of silence", () => {
    for (const phrase of planFor(60_000).phrases) {
      const last = phrase[phrase.length - 1];
      expect(last.kind).toBe("pause");
      expect(last.duration).toBeGreaterThanOrEqual(250);
      expect(last.from).toBe(0);
    }
  });

  it("lays segments end to end, each starting where the last one's loudness ended", () => {
    const { segments } = planFor(60_000);
    for (let i = 1; i < segments.length; i++) {
      const prev = segments[i - 1];
      expect(segments[i].start).toBeCloseTo(prev.start + prev.duration, 9);
      expect(segments[i].from).toBe(prev.to);
    }
  });

  it("keeps loudness between 0 and 1 throughout", () => {
    for (const seg of planFor(30_000).segments) {
      for (let t = seg.start; t <= seg.start + seg.duration; t += 5) {
        const level = loudness(seg, t);
        expect(level).toBeGreaterThanOrEqual(0);
        expect(level).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("loudness", () => {
  const syllable: Segment = {
    kind: "voiced",
    start: 1000,
    duration: 200,
    from: 0,
    peak: 0.9,
    to: 0.2,
    center: 0,
    spread: 0.5,
  };

  it("starts at `from`, peaks early, and ends at `to`", () => {
    expect(loudness(syllable, 1000)).toBe(0);
    expect(loudness(syllable, 1040)).toBeCloseTo(0.9, 9);
    expect(loudness(syllable, 1200)).toBeCloseTo(0.2, 9);
  });

  it("rises faster than it falls", () => {
    // Time to climb from 0 to half the peak, versus time to fall back there.
    const half = 0.45;
    let up = 1000;
    while (loudness(syllable, up) < half) up++;
    let down = 1200;
    while (loudness(syllable, down) < half) down--;
    expect(up - 1000).toBeLessThan((1200 - down) / 2);
  });
});

describe("createVoice", () => {
  it("jumps to a fresh phrase instead of planning through a long gap", () => {
    const voice = createVoice(seededRandom(3));
    voice(0);
    const start = performance.now();
    const sound = voice(10 * 60 * 60 * 1000); // ten hours later
    expect(performance.now() - start).toBeLessThan(50);
    expect(Number.isFinite(sound.level)).toBe(true);
  });
});

describe("barLevel", () => {
  it("gives the most to the bar under the sound's center", () => {
    const sound = { level: 1, center: 0, spread: 0.5, hiss: 0 };
    const levels = Array.from({ length: 9 }, (_, i) => barLevel(sound, i, 9, 0));
    expect(Math.max(...levels)).toBe(levels[4]);
    expect(levels[0]).toBeLessThan(levels[4] / 2);
  });

  it("follows the center when it moves off the middle", () => {
    const sound = { level: 1, center: 0.5, spread: 0.3, hiss: 0 };
    const levels = Array.from({ length: 9 }, (_, i) => barLevel(sound, i, 9, 0));
    expect(levels[6]).toBeGreaterThan(levels[2]);
  });

  it("is silent whenever the voice is", () => {
    const sound = { level: 0, center: 0, spread: 1, hiss: 1 };
    for (let i = 0; i < 9; i++) expect(barLevel(sound, i, 9, 1)).toBe(0);
  });
});

describe("follow", () => {
  it("rises faster than it falls, like a level meter", () => {
    const rise = follow(0, 1, 16);
    const fall = 1 - follow(1, 0, 16);
    expect(rise).toBeGreaterThan(fall * 2);
  });

  it("settles on the target given time", () => {
    let x = 1;
    for (let i = 0; i < 60; i++) x = follow(x, 0.3, 16);
    expect(x).toBeCloseTo(0.3, 3);
  });
});

describe("createWaveform", () => {
  it("is repeatable for a seed", () => {
    expect(record(3000, 9, 11)).toEqual(record(3000, 9, 11));
  });

  it("keeps every bar between 0 and 1", () => {
    for (const frame of record(20_000)) {
      for (const level of frame) {
        expect(level).toBeGreaterThanOrEqual(0);
        expect(level).toBeLessThanOrEqual(1);
      }
    }
  });

  it("goes quiet between phrases and loud within them", () => {
    const frames = record(30_000);
    const loudest = frames.map((f) => Math.max(...f));
    // Real pauses: runs of at least 200ms where every bar is near silent.
    let run = 0;
    let pauses = 0;
    for (const level of loudest) {
      run = level < 0.05 ? run + 1 : 0;
      if (run === Math.ceil(200 / 16)) pauses++;
    }
    expect(pauses).toBeGreaterThanOrEqual(6); // at least one every 5s
    // And plenty of talking, with syllables that actually get loud.
    const talking = loudest.filter((l) => l > 0.5).length / loudest.length;
    expect(talking).toBeGreaterThan(0.3);
  });

  it("moves the middle bars more than the edges", () => {
    const frames = record(30_000);
    const mean = (i: number) => frames.reduce((sum, f) => sum + f[i], 0) / frames.length;
    expect(mean(4)).toBeGreaterThan(mean(0) * 1.5);
    expect(mean(4)).toBeGreaterThan(mean(8) * 1.5);
  });

  it("treats a stalled frame as a short one", () => {
    const wave = createWaveform(9, seededRandom(5));
    const levels = wave.step(60_000);
    for (const level of levels) expect(Number.isFinite(level)).toBe(true);
  });
});

describe("stillFrame", () => {
  it("is tallest in the middle and uneven, like a paused waveform", () => {
    const frame = stillFrame(9);
    expect(frame).toHaveLength(9);
    expect(frame[4]).toBeGreaterThan(frame[0]);
    expect(frame[4]).toBeGreaterThan(frame[8]);
    expect(new Set(frame.map((x) => x.toFixed(3))).size).toBeGreaterThan(5);
  });
});
