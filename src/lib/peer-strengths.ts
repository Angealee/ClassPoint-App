/**
 * "Strongest" and "Room to grow" on a student's own peer results.
 *
 * Framing, not a new number: it names which of the student's own questions
 * scored highest and lowest, so the big percentage reads less like a grade and
 * more like something to act on. Copy is neutral (the instructor's call),
 * matching the plain voice of the results notification.
 *
 * ── COMPARED ON PERCENT, NOT ON THE RAW AVERAGE ────────────────────────────
 * Criteria can use different scales. A 4.0 on a 1-to-5 question and a 0.8 on a
 * Yes/No question are not comparable as raw numbers, but their min-max
 * percentages are — which is the whole reason 0051 computes one.
 *
 * ── WHEN IT SAYS NOTHING ───────────────────────────────────────────────────
 * Fewer than two questions, or every question on the same percentage: there
 * is no strongest, and printing one anyway would invent a difference. Ties are
 * named together rather than broken by question order, because picking the
 * first of two equal scores would tell a student something that isn't true.
 */

export interface StrengthsInput {
  label: string
  pct: number
}

export interface Strengths {
  strongest: string[]
  roomToGrow: string[]
}

/**
 * Percentages arrive rounded to one decimal by the SQL. Anything closer than
 * this is treated as a tie, so 80.0 and 80.04 never produce a "strongest".
 */
const TIE = 0.05

export function strengthsOf(criteria: readonly StrengthsInput[]): Strengths | null {
  const usable = criteria.filter((c) => Number.isFinite(c.pct))
  if (usable.length < 2) return null

  const max = Math.max(...usable.map((c) => c.pct))
  const min = Math.min(...usable.map((c) => c.pct))
  if (max - min < TIE) return null

  return {
    strongest: usable.filter((c) => max - c.pct < TIE).map((c) => c.label),
    roomToGrow: usable.filter((c) => c.pct - min < TIE).map((c) => c.label),
  }
}

/** "Teamwork", "Teamwork and Effort", "Teamwork, Effort and Ideas". */
export function joinLabels(labels: readonly string[]): string {
  if (labels.length <= 1) return labels[0] ?? ''
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`
}
