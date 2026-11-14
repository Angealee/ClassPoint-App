/*
 * The podium's countdown reveal is a treat, not a toll: it plays on the first few times a
 * student opens the board and then stays out of the way, so the board is just there on the
 * fortieth visit. The rules live here, pure, with the store injected (the `tour.ts` pattern),
 * because every failure is silent and the safe failure is "do not play".
 */
export const REVEAL_PLAYS = 3

export interface RevealStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export const revealKey = (who: string) => `cp_podium_reveal_v1_${who}`

/**
 * True when THIS open should play the reveal. Calling it spends one of the plays, so call it
 * once per open. A storage that throws, or a stored value that is not a plain count, means
 * "do not play": the opposite default would replay the reveal on every open for anyone whose
 * browser blocks storage.
 */
export function takeReveal(store: RevealStore, who: string, limit = REVEAL_PLAYS): boolean {
  try {
    const raw = store.getItem(revealKey(who))
    // Number('') is 0, so a regex, not Number(): an empty value must not read as "fresh".
    const used = raw === null ? 0 : /^\d+$/.test(raw) ? Number(raw) : limit
    if (used >= limit) return false
    store.setItem(revealKey(who), String(used + 1))
    return true
  } catch {
    return false
  }
}
