"use client";

import { useEffect, useRef } from "react";
import { usePrefersReducedMotion } from "@/hooks/use-media-query";
import { createWaveform, stillFrame } from "@/lib/speech-wave";
import { cn } from "@/lib/utils";
import { prefersReducedMotion } from "@/lib/voice-bus";

const BARS = 9;
/** Bars never shrink below this share of full height, so a pause still reads
 *  as a row of stubs rather than an empty gap. */
const REST = 0.18;
const STILL = stillFrame(BARS);

/** Rounded to 3 places: the browser re-serializes inline styles to 6
 *  significant digits, so a longer number from the server render wouldn't
 *  match the client's and React would report a hydration mismatch. */
const scale = (level: number) =>
  `scaleY(${Math.round((REST + (1 - REST) * level) * 1000) / 1000})`;

/**
 * The hero's "someone is talking" bars. lib/speech-wave invents the
 * syllables, words and pauses; this paints them. Frames are written straight
 * to the DOM from rAF, so React isn't re-rendering 60 times a second, and
 * as `scaleY` so no frame triggers layout.
 */
export function SpeechWaveform({ className }: { className?: string }) {
  const rowRef = useRef<HTMLSpanElement>(null);
  const reduceMotion = usePrefersReducedMotion();

  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const bars = Array.from(row.children) as HTMLElement[];
    const paint = (levels: readonly number[]) =>
      bars.forEach((bar, i) => (bar.style.transform = scale(levels[i])));

    // Checked directly too: the hook reads false until after mount, which
    // would give a reduced-motion visitor a frame or two of movement.
    if (reduceMotion || prefersReducedMotion()) {
      paint(STILL);
      return;
    }

    const wave = createWaveform(BARS, Math.random);
    let raf = 0;
    let last = 0;
    const frame = (now: number) => {
      paint(wave.step(last ? now - last : 0));
      last = now;
      raf = requestAnimationFrame(frame);
    };

    // Only talk while the hero is on screen.
    const observer = new IntersectionObserver(([entry]) => {
      cancelAnimationFrame(raf);
      raf = 0;
      if (entry.isIntersecting) {
        last = 0;
        raf = requestAnimationFrame(frame);
      }
    });
    observer.observe(row);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [reduceMotion]);

  return (
    <span ref={rowRef} aria-hidden className={cn("flex items-center gap-[3px] h-7", className)}>
      {STILL.map((level, i) => (
        <span
          key={i}
          className="w-[3px] h-full rounded-full bg-gradient-to-b from-magenta to-primary will-change-transform"
          style={{ transform: scale(level) }}
        />
      ))}
    </span>
  );
}
