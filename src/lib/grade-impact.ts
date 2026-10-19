import { finalGrade, termGrade } from '@/lib/grading'
import type { GradePolicy, GradeSumsRow, TermKey } from '@/lib/types'

/**
 * What changing a subject's weights would do to the grades that already exist.
 *
 * This is the number the confirm dialog puts in front of the instructor before
 * a weight edit is saved. It has to be computed from the SAME functions that
 * produce the grades themselves — `grading.ts` — or the preview would be a
 * second opinion about the thing it is previewing.
 *
 * Pure: it takes the raw sums as fetched and both sets of weights, and returns
 * the diff. Nothing here fetches anything.
 */

const TERMS: TermKey[] = ['prelim', 'midterm', 'finals']

/**
 * Below this, the displayed grade is identical.
 *
 * Grades are shown to two decimals, so a delta under half of one is invisible —
 * and floating point guarantees that re-saving the same weights produces deltas
 * around 1e-15. Without this, "nothing changed" would report every student as
 * having moved.
 */
export const VISIBLE_DELTA = 0.005

export interface GradeImpactRow {
  studentId: string
  fullName: string
  before: number | null
  after: number | null
  /** Null when either side has no grade — a gap, not a movement of zero. */
  delta: number | null
}

export interface GradeImpact {
  /** Students whose displayed grade moves, biggest absolute move first. */
  movers: GradeImpactRow[]
  /** How many grades move at all. */
  changed: number
  /** How many students were considered. */
  total: number
  /** Signed mean across the movers — the direction of the change as a whole. */
  averageDelta: number | null
  /** Students who gain or lose a grade entirely (null on one side). */
  appearing: number
  disappearing: number
}

/** One student's final computed grade under one set of weights. */
export function finalGradeFor(rows: GradeSumsRow[], policies: GradePolicy[]): number | null {
  const terms = TERMS.map((term) => {
    const policy = policies.find((p) => p.term === term)
    const row = rows.find((r) => r.term === term)
    // A term with no policy row cannot be weighted at all — `grading.ts`
    // refuses a part-configured subject, and so does this.
    if (!policy) return null
    return {
      grade: row ? termGrade(row.sums, policy, 'official') : null,
      weight: policy.finalWeight,
    }
  })
  if (terms.some((t) => t === null)) return null
  return finalGrade(terms as Array<{ grade: number | null; weight: number }>)
}

/**
 * Diff every student's final grade between two sets of weights.
 *
 * `sums` is every row for the sections in question — one per (student, term) —
 * exactly as `getSectionGradeSums` returns it.
 */
export function computeImpact(
  sums: GradeSumsRow[],
  before: GradePolicy[],
  after: GradePolicy[],
): GradeImpact {
  const byStudent = new Map<string, GradeSumsRow[]>()
  for (const row of sums) {
    const list = byStudent.get(row.studentId)
    if (list) list.push(row)
    else byStudent.set(row.studentId, [row])
  }

  const movers: GradeImpactRow[] = []
  let appearing = 0
  let disappearing = 0

  for (const [studentId, rows] of byStudent) {
    const a = finalGradeFor(rows, before)
    const b = finalGradeFor(rows, after)
    const fullName = rows[0]?.fullName ?? ''

    if (a === null && b === null) continue
    if (a === null || b === null) {
      // A grade that appears or vanishes is a bigger deal than one that moves,
      // and averaging it as a delta would be meaningless — count it separately.
      if (a === null) appearing += 1
      else disappearing += 1
      movers.push({ studentId, fullName, before: a, after: b, delta: null })
      continue
    }

    const delta = b - a
    if (Math.abs(delta) < VISIBLE_DELTA) continue
    movers.push({ studentId, fullName, before: a, after: b, delta })
  }

  // Null deltas (appeared/vanished) sort first: they are the loudest outcome.
  movers.sort((x, y) => {
    if (x.delta === null && y.delta === null) return x.fullName.localeCompare(y.fullName)
    if (x.delta === null) return -1
    if (y.delta === null) return 1
    return Math.abs(y.delta) - Math.abs(x.delta)
  })

  const withDelta = movers.filter((m) => m.delta !== null)
  const averageDelta =
    withDelta.length === 0
      ? null
      : withDelta.reduce((sum, m) => sum + (m.delta as number), 0) / withDelta.length

  return {
    movers,
    changed: movers.length,
    total: byStudent.size,
    averageDelta,
    appearing,
    disappearing,
  }
}
