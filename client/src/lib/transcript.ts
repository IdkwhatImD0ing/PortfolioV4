export interface TranscriptEntry {
  role: "agent" | "user";
  content: string;
  /** UI-only line (a failed request, a cut-off reply). Shown in the panel but
   *  never sent back to the agent as something it said. */
  notice?: boolean;
}

/** One line of a voice call's transcript, at its position in Retell's own
 *  transcript. The backend sends the last few of these on every `transcript`
 *  event; the shape must match caption_window in server/voice_events.py.
 *  Separate from TranscriptEntry, which also holds typed-chat lines that have
 *  no index. */
export interface VoiceLine {
  index: number;
  role: "agent" | "user";
  content: string;
}

/** Fold a window of voice lines into the call's lines so far.
 *
 * Retell re-sends a line as the speaker goes on, with more words or corrected
 * ones, and it keeps its index. So the newest version of each index wins, and
 * a new index is a new line. Lines that have scrolled out of the window stay
 * as they were last sent. Lines past the window's last index are dropped:
 * Retell has removed them (an agent line cut off before any audio played),
 * and windows arrive in order, since the server sends them one at a time.
 *
 * This replaced a merge that had to guess how each window lined up with what
 * was on screen. It could only allow the last line to have changed, so when
 * two lines changed between sends (the visitor still talking as the agent
 * starts), it gave up and stacked every partial as its own bubble.
 */
export function mergeVoiceLines(
  lines: ReadonlyMap<number, TranscriptEntry>,
  window: readonly VoiceLine[],
): Map<number, TranscriptEntry> {
  const next = new Map(lines);
  for (const { index, role, content } of window) next.set(index, { role, content });
  if (window.length > 0) {
    const last = Math.max(...window.map((l) => l.index));
    for (const index of next.keys()) if (index > last) next.delete(index);
  }
  return next;
}

/** The panel's transcript during a call: whatever was on screen before it
 *  started (a typed conversation, when switching back to voice), then the
 *  call's lines in the order Retell has them. */
export function withVoiceLines(
  before: readonly TranscriptEntry[],
  lines: ReadonlyMap<number, TranscriptEntry>,
): TranscriptEntry[] {
  const ordered = [...lines.entries()].sort(([a], [b]) => a - b).map(([, line]) => line);
  return [...before, ...ordered];
}
