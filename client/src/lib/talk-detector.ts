/** "Is the agent speaking?" from the level of its audio.
 *
 * Retell's v3 web calls no longer send `agent_start_talking` and
 * `agent_stop_talking`, so the call panel's Speaking/Listening line reads the
 * agent's audio instead (the SDK's `audio` event, with `emitRawAudioSamples`).
 * It turns on as soon as the audio is loud enough and turns off only after
 * `releaseMs` of quiet, so the gaps between words don't make it flicker. */

/** Loudness of one snapshot of samples in [-1, 1]. */
export function rms(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

export interface TalkDetectorOptions {
  /** RMS above this counts as speech. Room noise on a WebRTC track sits
   *  well below it; normal speech sits well above. */
  threshold?: number;
  /** Quiet this long, in ms, before it counts as stopped. */
  releaseMs?: number;
}

/** Returns a function to feed each audio snapshot with its timestamp.
 *  `onChange` fires only when the state flips. */
export function createTalkDetector(
  onChange: (talking: boolean) => void,
  { threshold = 0.02, releaseMs = 400 }: TalkDetectorOptions = {},
): (samples: Float32Array, now: number) => void {
  let talking = false;
  let quietSince: number | null = null;
  return (samples, now) => {
    if (rms(samples) > threshold) {
      quietSince = null;
      if (!talking) {
        talking = true;
        onChange(true);
      }
      return;
    }
    if (!talking) return;
    if (quietSince === null) {
      quietSince = now;
    } else if (now - quietSince >= releaseMs) {
      talking = false;
      quietSince = null;
      onChange(false);
    }
  };
}
