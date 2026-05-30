export interface TranscriptEntry {
  role: "agent" | "user";
  content: string;
}

/** Merge a new rolling window of transcript entries into the running history.
 *
 * Retell streams the **last ~5 sentences** on every `update` event, not a
 * cumulative log. We have to graft: find where the new window aligns with
 * the tail of our prior history, keep everything before that, then append
 * the window.
 *
 * Algorithm: find the smallest `i` such that `prev[i..]` is a prefix of
 * `window` (matching by role+content). That gives the maximum overlap.
 * Keep `prev[0..i]` and append the full window — this is robust to the
 * window shifting past what we previously knew.
 *
 * If no alignment exists (e.g. streaming refinement changed a turn's
 * content), fall back to append+dedup so no content is lost.
 *
 * Property: as long as turns are appended-only on the server, repeated
 * calls preserve every distinct turn ever passed in.
 */
export function mergeTranscript(
  prev: TranscriptEntry[],
  window: TranscriptEntry[],
): TranscriptEntry[] {
  if (window.length === 0) return prev;
  if (prev.length === 0) return [...window];

  const key = (e: TranscriptEntry) => `${e.role}|${e.content}`;

  for (let i = 0; i < prev.length; i++) {
    const tail = prev.length - i;
    if (tail > window.length) continue;
    let match = true;
    for (let j = 0; j < tail; j++) {
      if (key(prev[i + j]) !== key(window[j])) {
        match = false;
        break;
      }
    }
    if (match) {
      return [...prev.slice(0, i), ...window];
    }
  }

  // No alignment found — conversation jumped or a turn was refined mid-stream
  // and broke the prefix match. Append + dedupe so we don't drop history.
  const seen = new Set<string>();
  return [...prev, ...window].filter((e) => {
    const k = key(e);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
