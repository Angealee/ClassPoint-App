import type { PeerScaleOption } from '@/lib/types'

/**
 * Rating scales — the client half of `cp_peer_scale_clean()` (migration 0050).
 *
 * ⚠ THIS FILE MIRRORS A DATABASE FUNCTION AND IS PINNED BY A TEST.
 * The composer validates a scale here so the instructor sees the problem while
 * they are still typing; the database validates it again on write and is the
 * one that decides. A drift makes the composer either reject something the
 * database would accept (annoying) or accept something it would reject
 * (a save that fails with a message about a row nobody was looking at).
 * Change one side, change the other, in the same commit — the rule
 * `lounge-answers.ts` already carries for the same reason.
 *
 * The percent formula is NOT here yet. It lands in Phase 3 alongside the SQL
 * that computes the same number, so the two arrive together rather than one
 * sitting unused and slowly going stale.
 */

export const SCALE_MIN_OPTIONS = 2
export const SCALE_MAX_OPTIONS = 10
export const SCALE_LABEL_MAX = 40
/** Mirrors `peer_ratings_score_check`, the coarse envelope around any scale. */
export const SCALE_VALUE_MIN = 0
export const SCALE_VALUE_MAX = 100

/**
 * The presets the composer offers before it offers a row editor.
 *
 * These are ordinary scales, not a special case: picking one fills the editor
 * with its rows, and every one of them is then editable. So there is no
 * "preset" concept in the database at all, and adding one here costs nothing
 * anywhere else.
 */
export const SCALE_PRESETS: { key: string; name: string; scale: PeerScaleOption[] }[] = [
  {
    key: 'five',
    name: '1 to 5 · Poor to Excellent',
    scale: [
      { value: 1, label: 'Poor' },
      { value: 2, label: 'Fair' },
      { value: 3, label: 'Good' },
      { value: 4, label: 'Very good' },
      { value: 5, label: 'Excellent' },
    ],
  },
  {
    key: 'ten',
    name: '1 to 10',
    scale: Array.from({ length: 10 }, (_, i) => ({ value: i + 1, label: String(i + 1) })),
  },
  {
    key: 'yesno',
    name: 'Yes or no',
    scale: [
      { value: 0, label: 'No' },
      { value: 1, label: 'Yes' },
    ],
  },
  {
    key: 'agree',
    name: 'Disagree to agree',
    scale: [
      { value: 1, label: 'Strongly disagree' },
      { value: 2, label: 'Disagree' },
      { value: 3, label: 'Neutral' },
      { value: 4, label: 'Agree' },
      { value: 5, label: 'Strongly agree' },
    ],
  },
]

/**
 * Why is this scale unusable? Returns the reason, or null when it is fine.
 *
 * A message rather than a boolean because every one of these is shown to the
 * instructor as-is, and "invalid scale" tells them nothing about which of six
 * rules they broke.
 *
 * The wording deliberately matches the database's, so a value that somehow
 * reaches the server and is rejected there produces the same sentence rather
 * than a second vocabulary for one rule.
 */
export function scaleError(scale: PeerScaleOption[]): string | null {
  if (!Array.isArray(scale)) return 'A rating scale must be a list of options.'
  if (scale.length < SCALE_MIN_OPTIONS || scale.length > SCALE_MAX_OPTIONS) {
    return `A rating scale needs between ${SCALE_MIN_OPTIONS} and ${SCALE_MAX_OPTIONS} options.`
  }

  let prev: number | null = null
  for (const opt of scale) {
    if (!Number.isInteger(opt?.value)) return 'Every scale option needs a numeric value.'
    const label = (opt.label ?? '').trim()
    if (label.length === 0) return 'Every scale option needs a label.'
    if (label.length > SCALE_LABEL_MAX) {
      return `A scale label is at most ${SCALE_LABEL_MAX} characters.`
    }
    if (opt.value < SCALE_VALUE_MIN || opt.value > SCALE_VALUE_MAX) {
      return `Scale values must be between ${SCALE_VALUE_MIN} and ${SCALE_VALUE_MAX}.`
    }
    // Strictly ascending, which also makes them distinct. Phase 3 normalises a
    // percentage against the first and last values, so the order is load-
    // bearing rather than cosmetic.
    if (prev !== null && opt.value <= prev) return 'Scale values must go up, with no repeats.'
    prev = opt.value
  }

  return null
}

/**
 * The canonical form the database will store.
 *
 * Applied before sending rather than after, so what the composer previews is
 * what comes back on the next read.
 */
export function normalizeScale(scale: PeerScaleOption[]): PeerScaleOption[] {
  return scale.map((o) => ({ value: o.value, label: (o.label ?? '').trim() }))
}

/** Is `score` an option on this scale? Not a range check — see below. */
export function isOnScale(scale: PeerScaleOption[], score: number): boolean {
  // A range check would accept 2 on a scale of 1/3/5. The submit RPC asks the
  // same question the same way, against the stored jsonb.
  return scale.some((o) => o.value === score)
}
