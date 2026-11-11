
export const TYPING_THROTTLE_MS = 2500
/** A name disappears this long after their last keystroke. */
export const TYPING_TIMEOUT_MS = 5000

export interface TypingEntry {
  name: string
  /** epoch ms of their most recent keystroke */
  at: number
}

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

export function typingLabel(entries: TypingEntry[], now: number = Date.now()): string | null {
  const live = activeTypers(entries, now).map((e) => e.name)
  if (live.length === 0) return null
  if (live.length === 1) return `${live[0]} is typing…`
  if (live.length === 2) return `${live[0]} and ${live[1]} are typing…`
  return `${live[0]}, ${live[1]} and ${live.length - 2} others are typing…`
}

export function shouldBroadcast(lastSentAt: number | null, now: number = Date.now()): boolean {
  return lastSentAt === null || now - lastSentAt >= TYPING_THROTTLE_MS
}
