import { finalGrade, termGrade } from '@/lib/grading'
import type { GradePolicy, GradeSumsRow, TermKey } from '@/lib/types'

const TERMS: TermKey[] = ['prelim', 'midterm', 'finals']

export const VISIBLE_DELTA = 0.005

export interface GradeImpactRow {
  studentId: string
  fullName: string
  before: number | null
  after: number | null
  delta: number | null
}

export interface GradeImpact {
  movers: GradeImpactRow[]
  /** How many grades move at all. */
  changed: number
  /** How many students were considered. */
  total: number
  averageDelta: number | null
  appearing: number
  disappearing: number
}

/** One student's final computed grade under one set of weights. */
export function finalGradeFor(rows: GradeSumsRow[], policies: GradePolicy[]): number | null {
  const terms = TERMS.map((term) => {
    const policy = policies.find((p) => p.term === term)
    const row = rows.find((r) => r.term === term)
    if (!policy) return null
    return {
      grade: row ? termGrade(row.sums, policy, 'official') : null,
      weight: policy.finalWeight,
    }
  })
  if (terms.some((t) => t === null)) return null
  return finalGrade(terms as Array<{ grade: number | null; weight: number }>)
}

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
      if (a === null) appearing += 1
      else disappearing += 1
      movers.push({ studentId, fullName, before: a, after: b, delta: null })
      continue
    }

    const delta = b - a
    if (Math.abs(delta) < VISIBLE_DELTA) continue
    movers.push({ studentId, fullName, before: a, after: b, delta })
  }

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
