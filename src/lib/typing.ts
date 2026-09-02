/**
 * Who is typing, as ephemeral state.
 *
 * ── WHY THERE IS NO TABLE, AND NO MIGRATION ────────────────────────────────
 * A typing indicator fires on keystrokes. Writing that to Postgres would mean
 * hundreds of rows a minute for information that is worthless two seconds
 * later, and it would leave a permanent record of when each student was at
 * their keyboard — which is precisely the kind of surveillance the "no seen
 * receipts" decision exists to avoid.
 *
 * Realtime BROADCAST carries it instead: the event goes peer-to-peer through
 * the channel and touches no table. Nothing about it is ever persisted, so
 * there is nothing to leak, subpoena, or accidentally render later.
 *
 * This module is the pure part — the timing rules — so they can be tested
 * without a socket.
 */

/** Don't broadcast more than this often, however fast someone types. */
export const TYPING_THROTTLE_MS = 2500
/** A name disappears this long after their last keystroke. */
export const TYPING_TIMEOUT_MS = 5000

export interface TypingEntry {
  name: string
  /** epoch ms of their most recent keystroke */
  at: number
}

/**
 * Merge an incoming "still typing" ping into the set.
 *
 * Keyed by name rather than id because that is all the indicator ever shows —
 * carrying the id would put a student identifier into a broadcast that does not
 * need one.
 */
export function noteTyping(
  current: TypingEntry[],
  name: string,
  now: number = Date.now(),
): TypingEntry[] {
  const rest = current.filter((e) => e.name !== name)
  return [...rest, { name, at: now }]
}

/** Drop anyone whose last keystroke has gone stale. */
export function activeTypers(
  current: TypingEntry[],
  now: number = Date.now(),
): TypingEntry[] {
  return current.filter((e) => now - e.at < TYPING_TIMEOUT_MS)
}

/**
 * The sentence under the composer, or null when nobody is typing.
 *
 * Caps at two names then counts the rest: "Ana, Bea and 4 others are typing"
 * stays one line, where listing six names wraps and pushes the composer around
 * — which is worse than the information is worth.
 */
export function typingLabel(entries: TypingEntry[], now: number = Date.now()): string | null {
  const live = activeTypers(entries, now).map((e) => e.name)
  if (live.length === 0) return null
  if (live.length === 1) return `${live[0]} is typing…`
  if (live.length === 2) return `${live[0]} and ${live[1]} are typing…`
  return `${live[0]}, ${live[1]} and ${live.length - 2} others are typing…`
}

/**
 * Should we broadcast now?
 *
 * Throttling is not politeness — without it every keystroke is a socket
 * message, so a fast typist in a 40-person room floods every other client.
 */
export function shouldBroadcast(lastSentAt: number | null, now: number = Date.now()): boolean {
  return lastSentAt === null || now - lastSentAt >= TYPING_THROTTLE_MS
}
