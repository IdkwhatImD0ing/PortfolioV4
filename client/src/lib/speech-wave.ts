/**
 * A made-up voice for the hero's waveform to "speak" with.
 *
 * The old bars all bounced on one 1.2s loop, which reads as a loading
 * spinner. Talking has a different rhythm: about five syllables a second,
 * grouped into words, grouped into phrases, with real silence between
 * phrases. Each syllable gets loud fast and trails off slower. This file
 * invents that rhythm as it goes; the component only paints it.
 *
 * Randomness is injected so tests can seed it.
 */

export type Random = () => number;

/** Mulberry32: a tiny seedable PRNG, since Math.random can't be seeded. */
export function seededRandom(seed: number): Random {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One stretch of sound. Times are in ms; `from`, `peak` and `to` are the
 *  loudness (0 to 1) at its start, its loudest point, and its end. */
export interface Segment {
  kind: "voiced" | "hiss" | "pause";
  start: number;
  duration: number;
  from: number;
  peak: number;
  to: number;
  /** Where the sound sits across the bars: -1 far left, 0 middle, 1 far right. */
  center: number;
  /** How wide it spreads: 0 narrow, 1 nearly flat across every bar. */
  spread: number;
}

/** What the voice sounds like at one instant. */
export interface Sound {
  level: number;
  center: number;
  spread: number;
  /** 1 during a hiss, 0 otherwise. Hiss is noisy, so the bars jitter more. */
  hiss: number;
}

const range = (random: Random, min: number, max: number) => min + random() * (max - min);
const lerp = (a: number, b: number, x: number) => a + (b - a) * x;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const easeOut = (x: number) => 1 - (1 - x) * (1 - x);
const smoothstep = (x: number) => x * x * (3 - 2 * x);

/**
 * Plan one phrase: a few words, then a pause. Segments come back to back,
 * each starting at the loudness the one before it ended on, so the voice
 * never jumps.
 */
export function planPhrase(random: Random, start: number): Segment[] {
  const out: Segment[] = [];
  let t = start;
  let level = 0;
  const push = (seg: Omit<Segment, "start" | "from">) => {
    out.push({ ...seg, start: t, from: level });
    t += seg.duration;
    level = seg.to;
  };
  const pause = (duration: number) =>
    push({ kind: "pause", duration, peak: 0, to: 0, center: 0, spread: 1 });

  const words = 3 + Math.floor(random() * 5); // 3 to 7
  const gain = range(random, 0.85, 1); // some phrases come out louder than others
  for (let w = 0; w < words; w++) {
    const r = random();
    const syllables = r < 0.5 ? 1 : r < 0.85 ? 2 : 3;
    const stressed = Math.floor(random() * syllables);
    // Loudness sags over a phrase as the speaker runs low on breath.
    const sag = 1 - 0.25 * (w / (words - 1));

    // A word that opens on "s", "f", "sh" or "th" starts with a hiss.
    if (random() < 0.25) {
      const peak = range(random, 0.22, 0.34) * gain;
      push({ kind: "hiss", duration: range(random, 50, 100), peak, to: peak * 0.5, center: 0, spread: 1 });
    }

    for (let s = 0; s < syllables; s++) {
      const isStressed = s === stressed;
      const lastInWord = s === syllables - 1;
      const lastInPhrase = lastInWord && w === words - 1;
      const peak = Math.min(1, (isStressed ? 1.05 : 0.7) * sag * gain * range(random, 0.9, 1.1));
      // Inside a word the voice dips hard between syllables but never
      // stops. Between words it sometimes runs straight on. The end of the
      // phrase always drops to silence.
      const to = lastInPhrase
        ? 0
        : !lastInWord
          ? peak * range(random, 0.25, 0.45)
          : random() < 0.4
            ? peak * 0.1
            : 0;
      push({
        kind: "voiced",
        duration: isStressed ? range(random, 170, 290) : range(random, 110, 190),
        peak,
        to,
        // Different vowels put their energy in different places.
        center: range(random, -0.35, 0.35),
        spread: range(random, 0.3, 0.9),
      });
    }

    if (level === 0 && w < words - 1) pause(range(random, 40, 110));
  }

  // Usually a short gap before the next phrase; now and then a breath.
  pause(random() < 0.25 ? range(random, 700, 1200) : range(random, 250, 600));
  return out;
}

/** Loudness partway through a segment: up to the peak in the first fifth,
 *  sagging a little through the vowel, then easing down to `to`. */
export function loudness(seg: Segment, t: number): number {
  const x = clamp01((t - seg.start) / seg.duration);
  const held = seg.peak * 0.85;
  if (x < 0.2) return lerp(seg.from, seg.peak, easeOut(x / 0.2));
  if (x < 0.6) return lerp(seg.peak, held, (x - 0.2) / 0.4);
  return lerp(held, seg.to, smoothstep((x - 0.6) / 0.4));
}

/** If the caller skips further ahead than this, the voice starts a fresh
 *  phrase instead of planning every one in between. */
const MAX_BACKLOG_MS = 5000;

/** A voice that talks forever. Call it with a time in ms that only moves
 *  forward to hear what it's saying at that moment. */
export function createVoice(random: Random): (t: number) => Sound {
  let queue: Segment[] = [];
  let planned = 0;
  return (t) => {
    if (t - planned > MAX_BACKLOG_MS) {
      queue = [];
      planned = t;
    }
    while (planned <= t) {
      const phrase = planPhrase(random, planned);
      queue.push(...phrase);
      const last = phrase[phrase.length - 1];
      planned = last.start + last.duration;
    }
    while (queue[0].start + queue[0].duration <= t) queue.shift();
    const seg = queue[0];
    return {
      level: loudness(seg, t),
      center: seg.center,
      spread: seg.spread,
      hiss: seg.kind === "hiss" ? 1 : 0,
    };
  };
}

/** One bar's loudness for a sound. Bars near the sound's center get the most,
 *  the rest taper off, and `jitter` (-1 to 1) roughs it up so the bars don't
 *  move in lockstep. */
export function barLevel(sound: Sound, index: number, bars: number, jitter: number): number {
  const p = bars === 1 ? 0 : (index / (bars - 1)) * 2 - 1;
  const d = (p - sound.center) / (0.28 + 0.5 * sound.spread);
  const weight = 0.3 + 0.7 * Math.exp(-0.5 * d * d);
  const rough = 0.2 + 0.4 * sound.hiss;
  return clamp01(sound.level * weight * (1 + rough * jitter));
}

// A syllable lasts about 180ms, so the fall has to be well under that or the
// dips between syllables get smeared into one long hum.
const RISE_MS = 25;
const FALL_MS = 60;

/** Move toward `target` the way a level meter does: fast up, slower down. */
export function follow(current: number, target: number, dt: number): number {
  const tau = target > current ? RISE_MS : FALL_MS;
  return current + (target - current) * (1 - Math.exp(-dt / tau));
}

/** Frames longer than this (a stalled tab, a debugger pause) count as this. */
const MAX_FRAME_MS = 64;

/**
 * Bar heights for a voice that's talking. Call `step` once per animation
 * frame with the ms since the last one; it returns one level per bar, 0
 * (silent) to 1 (loudest). The array is reused between calls.
 */
export function createWaveform(bars: number, random: Random) {
  const voice = createVoice(random);
  const levels = new Array<number>(bars).fill(0);
  const jitter = new Array<number>(bars).fill(0);
  const jitterTarget = new Array<number>(bars).fill(0);
  const jitterNext = new Array<number>(bars).fill(0);
  let t = 0;

  return {
    step(dt: number): readonly number[] {
      dt = Math.min(MAX_FRAME_MS, Math.max(0, dt));
      t += dt;
      const sound = voice(t);
      for (let i = 0; i < bars; i++) {
        if (t >= jitterNext[i]) {
          jitterTarget[i] = random() * 2 - 1;
          jitterNext[i] = t + range(random, 50, 110);
        }
        jitter[i] += (jitterTarget[i] - jitter[i]) * (1 - Math.exp(-dt / 35));
        levels[i] = follow(levels[i], barLevel(sound, i, bars, jitter[i]), dt);
      }
      return levels;
    },
  };
}

/** A single frozen frame of speech, for the first paint and for visitors who
 *  asked for reduced motion. */
export function stillFrame(bars: number): number[] {
  const sound: Sound = { level: 0.85, center: 0, spread: 0.6, hiss: 0 };
  return Array.from({ length: bars }, (_, i) => barLevel(sound, i, bars, Math.sin(i * 2.4)));
}
