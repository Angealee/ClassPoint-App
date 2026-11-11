import { roundTo } from '@/lib/peer-scale'
import type {
  GradeComponent,
  GradePolicy,
  GradeView,
  TermKey,
  TermSums,
} from '@/lib/types'

export const GRADE_COMPONENTS: readonly GradeComponent[] = [
  'performance_task',
  'quiz',
  'recitation',
  'exam',
]

export const COMPONENT_LABEL: Record<GradeComponent, string> = {
  performance_task: 'Performance Tasks',
  quiz: 'Quizzes',
  recitation: 'Recitation',
  exam: 'Exam',
}

/** The three components that make up Class Standing, in order. */
export const CS_COMPONENTS: readonly GradeComponent[] = ['performance_task', 'quiz', 'recitation']

const TERM_LABEL: Record<TermKey, string> = {
  prelim: 'Prelim',
  midterm: 'Midterm',
  finals: 'Finals',
}

export const DEFAULT_WEIGHTS = {
  ptWeight: 0.5,
  quizWeight: 0.25,
  recitWeight: 0.25,
  csWeight: 0.6,
  examWeight: 0.4,
  transmuteBase: 0.6,
  transmuteSpan: 0.4,
} as const

/** Prelim 30% · Midterm 30% · Finals 40%. */
export const DEFAULT_FINAL_WEIGHT: Record<TermKey, number> = {
  prelim: 0.3,
  midterm: 0.3,
  finals: 0.4,
}

export function defaultPolicy(subjectId: string, term: TermKey): GradePolicy {
  return { subjectId, term, ...DEFAULT_WEIGHTS, finalWeight: DEFAULT_FINAL_WEIGHT[term] }
}

export function emptySums(): TermSums {
  return {
    performance_task: { sumScore: 0, sumMax: 0, sumMaxMarked: 0 },
    quiz: { sumScore: 0, sumMax: 0, sumMaxMarked: 0 },
    recitation: { sumScore: 0, sumMax: 0, sumMaxMarked: 0 },
    exam: { sumScore: 0, sumMax: 0, sumMaxMarked: 0 },
  }
}

export interface AttendanceCounts {
  showed: number
  counted: number
}

export const NO_ATTENDANCE: AttendanceCounts = { showed: 0, counted: 0 }

/** Attendance counts as the `recitation` slot of a term's sums. */
export function attendanceSums(a: AttendanceCounts | undefined): TermSums['recitation'] {
  if (!a || !(a.counted > 0)) return { sumScore: 0, sumMax: 0, sumMaxMarked: 0 }
  return { sumScore: a.showed, sumMax: a.counted, sumMaxMarked: a.counted }
}

export function recitationScore(sums: TermSums['recitation'], policy: GradePolicy): number {
  if (!(sums.sumMax > 0)) return policy.transmuteBase * 100
  return (sums.sumScore / sums.sumMax) * 100
}

export function componentScore(
  sumScore: number,
  sumMax: number,
  base: number = DEFAULT_WEIGHTS.transmuteBase,
  span: number = DEFAULT_WEIGHTS.transmuteSpan,
): number {
  if (!(sumMax > 0)) return base * 100
  return ((sumScore / sumMax) * span + base) * 100
}

/** Every component's transmuted score, under one view. */
export function componentScores(
  sums: TermSums,
  policy: GradePolicy,
  view: GradeView = 'official',
): Record<GradeComponent, number> {
  const out = {} as Record<GradeComponent, number>
  for (const c of GRADE_COMPONENTS) {
    const s = sums[c]
    if (c === 'recitation') {
      out[c] = recitationScore(s, policy)
      continue
    }
    const total = view === 'official' ? s.sumMax : s.sumMaxMarked
    out[c] = componentScore(s.sumScore, total, policy.transmuteBase, policy.transmuteSpan)
  }
  return out
}

export function classStanding(
  scores: Record<GradeComponent, number>,
  policy: GradePolicy,
): number {
  return (
    scores.performance_task * policy.ptWeight +
    scores.quiz * policy.quizWeight +
    scores.recitation * policy.recitWeight
  )
}

export function componentShare(policy: GradePolicy, component: GradeComponent): number {
  switch (component) {
    case 'performance_task':
      return policy.csWeight * policy.ptWeight
    case 'quiz':
      return policy.csWeight * policy.quizWeight
    case 'recitation':
      return policy.csWeight * policy.recitWeight
    case 'exam':
      return policy.examWeight
  }
}

export function weightedComponents(policy: GradePolicy): GradeComponent[] {
  return GRADE_COMPONENTS.filter((c) => componentShare(policy, c) > 0)
}

export function hasAnyItems(sums: TermSums, view: GradeView = 'official'): boolean {
  return GRADE_COMPONENTS.some(
    (c) =>
      c !== 'recitation' && (view === 'official' ? sums[c].sumMax > 0 : sums[c].sumMaxMarked > 0),
  )
}

export function termGrade(
  sums: TermSums,
  policy: GradePolicy,
  view: GradeView = 'official',
): number | null {
  if (!hasAnyItems(sums, view)) return null
  if (!(policy.csWeight > 0) && !(policy.examWeight > 0)) return null

  const scores = componentScores(sums, policy, view)
  let out = 0
  if (policy.csWeight > 0) out += classStanding(scores, policy) * policy.csWeight
  if (policy.examWeight > 0) out += scores.exam * policy.examWeight
  return out
}

export function finalGrade(terms: Array<{ grade: number | null; weight: number }>): number | null {
  if (terms.length === 0) return null
  if (!sumsToOne(terms.map((t) => t.weight))) return null

  let out = 0
  for (const t of terms) {
    if (!(t.weight > 0)) continue
    if (t.grade === null) return null
    out += t.grade * t.weight
  }
  return out
}

const SUM_EPSILON = 1e-9

export function sumsToOne(values: number[]): boolean {
  return Math.abs(values.reduce((a, b) => a + b, 0) - 1) < SUM_EPSILON
}

function sumError(values: number[]): string | null {
  if (sumsToOne(values)) return null
  const total = values.reduce((a, b) => a + b, 0)
  return `They currently add up to ${roundTo(total * 100, 2)}%.`
}

export function policyError(policy: GradePolicy): string | null {
  const weights: Array<[string, number]> = [
    ['Performance Tasks', policy.ptWeight],
    ['Quizzes', policy.quizWeight],
    ['Recitation', policy.recitWeight],
    ['Class Standing', policy.csWeight],
    ['Exam', policy.examWeight],
    ['this term', policy.finalWeight],
  ]
  for (const [label, w] of weights) {
    if (!Number.isFinite(w)) return `The weight for ${label} is not a number.`
    if (w < 0 || w > 1) return `The weight for ${label} must be between 0% and 100%.`
  }
  if (!(policy.transmuteSpan > 0)) return 'The transmutation span must be above 0%.'
  if (policy.transmuteBase < 0 || policy.transmuteBase > 1) {
    return 'The transmutation base must be between 0% and 100%.'
  }

  const cs = sumError([policy.ptWeight, policy.quizWeight, policy.recitWeight])
  if (cs) return `Performance Tasks, Quizzes and Recitation must add up to 100%. ${cs}`
  const term = sumError([policy.csWeight, policy.examWeight])
  if (term) return `Class Standing and Exam must add up to 100%. ${term}`
  return null
}

export function subjectPolicyError(policies: GradePolicy[]): string | null {
  const terms: TermKey[] = ['prelim', 'midterm', 'finals']
  for (const t of terms) {
    if (!policies.some((p) => p.term === t)) return `${TERM_LABEL[t]} has no weights set yet.`
  }
  for (const p of policies) {
    const err = policyError(p)
    if (err) return `${TERM_LABEL[p.term]}: ${err}`
  }
  const final = sumError(policies.map((p) => p.finalWeight))
  if (final) return `Prelim, Midterm and Finals must add up to 100%. ${final}`
  return null
}

export interface GradeItemLike {
  id: string
  component: GradeComponent
  maxScore: number
  archivedAt: string | null
}

export function sumsFromScores(
  items: GradeItemLike[],
  scoreByItemId: Map<string, number>,
  attendance?: AttendanceCounts,
): TermSums {
  const out = emptySums()
  out.recitation = attendanceSums(attendance)
  for (const item of items) {
    if (item.archivedAt !== null) continue // archived items leave the denominator
    if (item.component === 'recitation') continue
    const bucket = out[item.component]
    bucket.sumMax += item.maxScore
    const score = scoreByItemId.get(item.id)
    if (score === undefined) continue // not marked yet — not a zero
    bucket.sumScore += score
    bucket.sumMaxMarked += item.maxScore
  }
  return out
}

export function orderedItems<T extends { component: GradeComponent; position: number }>(
  items: T[],
): T[] {
  return [...items].sort((a, b) => {
    const byComponent =
      GRADE_COMPONENTS.indexOf(a.component) - GRADE_COMPONENTS.indexOf(b.component)
    return byComponent !== 0 ? byComponent : a.position - b.position
  })
}

export function displayGrade(value: number | null): string {
  return value === null ? '—' : roundTo(value, 2).toFixed(2)
}

export function cellKey(itemId: string, studentId: string): string {
  return `${itemId}:${studentId}`
}

export function completionByTerm(
  rows: ReadonlyArray<{ term: TermKey; sums: TermSums }>,
): Record<TermKey, number | null> {
  const marked: Record<string, number> = {}
  const total: Record<string, number> = {}

  for (const row of rows) {
    for (const c of GRADE_COMPONENTS) {
      if (c === 'recitation') continue
      marked[row.term] = (marked[row.term] ?? 0) + row.sums[c].sumMaxMarked
      total[row.term] = (total[row.term] ?? 0) + row.sums[c].sumMax
    }
  }

  const out = {} as Record<TermKey, number | null>
  for (const t of ['prelim', 'midterm', 'finals'] as TermKey[]) {
    const max = total[t] ?? 0
    out[t] = max <= 0 ? null : Math.round(((marked[t] ?? 0) / max) * 100)
  }
  return out
}
