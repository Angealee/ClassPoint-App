/**
 * Random Event answer matching — the CLIENT half.
 *
 * ── ⚠ THIS MIRRORS SQL, AND THE MIRROR IS LOAD-BEARING ─────────────────────
 * `cp_event_normalize()` in migration 0045 is:
 *
 *   btrim(regexp_replace(regexp_replace(lower(coalesce(t,'')),
 *                                       '[^a-z0-9 ]', '', 'g'),
 *                        '\s+', ' ', 'g'))
 *
 * and the two must agree exactly. The instructor previews who WOULD win before
 * closing an event; the database decides who actually gets paid. A drift
 * between them means the preview is a lie about real points — and points are
 * the thing this entire app is about. Change one, change the other, in the same
 * commit, and run this test.
 *
 * The five pure-lib suites this joins (`qr`, `term`, `leveling`,
 * `offline-scans`, `attendance`) exist for exactly this shape of risk.
 */

/** Fold case, strip punctuation, collapse whitespace. Mirrors cp_event_normalize. */
export function normalizeAnswer(text: string | null | undefined): string {
  return (text ?? '')
    .toLowerCase()
    // Everything that is not a lowercase letter, a digit or a space goes —
    // which also removes newlines and accents, exactly as the SQL does.
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function isCorrectAnswer(body: string, answerKey: string): boolean {
  const key = normalizeAnswer(answerKey)
  // An empty key matches nothing. Otherwise a blank answer key would pay
  // everyone who submitted whitespace.
  if (key === '') return false
  return normalizeAnswer(body) === key
}

export interface AnswerLike {
  id: string
  body: string
  createdAt: string
}

/**
 * Who would be paid if this event closed now: the first `winnerCap` correct
 * answers, in submission order.
 *
 * Ordered by `(createdAt, id)` — the same total order the SQL uses. A timestamp
 * alone is not one, and two answers in the same millisecond would otherwise
 * rank differently here than in the database, which is the precise way this
 * preview would start lying.
 */
export function pickWinners<T extends AnswerLike>(
  answers: T[],
  answerKey: string | null,
  winnerCap: number,
): T[] {
  if (!answerKey) return []
  const cap = Math.max(0, Math.floor(winnerCap))
  if (cap === 0) return []

  return [...answers]
    .sort((a, b) =>
      a.createdAt === b.createdAt
        ? a.id.localeCompare(b.id)
        : a.createdAt.localeCompare(b.createdAt),
    )
    .filter((a) => isCorrectAnswer(a.body, answerKey))
    .slice(0, cap)
}
