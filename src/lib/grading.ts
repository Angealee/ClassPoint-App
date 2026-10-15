import { roundTo } from '@/lib/peer-scale'
import type {
  GradeComponent,
  GradePolicy,
  GradeView,
  TermKey,
  TermSums,
} from '@/lib/types'

/**
 * Grade computation — transmutation, component weights, term and final grades.
 *
 * ⚠ THIS FILE IS THE ONLY DEFINITION. THERE IS DELIBERATELY NO SQL MIRROR.
 *
 * That is the opposite of `peer-scale.ts` and `lounge-answers.ts`, which DO
 * mirror a database function, and the difference is worth understanding before
 * anyone "fixes" the inconsistency. Those mirror because the server ACTS on the
 * value: `cp_event_normalize` decides who gets paid, `cp_peer_scale_clean`
 * decides whether a rating is valid. A client preview has to agree with an
 * authority, so the rule exists twice and a test pins the two together.
 *
 * Nothing server-side ever acts on a grade. There is no RLS branch that reads
 * one (grades are instructor-only), no trigger, no notification, and by the
 * project's hard rule no bridge to `point_events`. SQL's entire job here is
 * `sum(score)` and `sum(max_score)` — numbers that cannot drift. So a mirror
 * would be a second definition with nothing requiring it: exactly the pattern
 * that grew FIVE copies of the show-up rate and FOUR of the points row, each
 * pair drifting before it was merged.
 *
 * IF YOU ARE ABOUT TO PUT A WEIGHTING EXPRESSION IN A MIGRATION, STOP.
 *
 * The one place server and client must still agree is WHICH ITEMS COUNT:
 * `sum_max` covers NON-ARCHIVED items only, and `sumsFromScores` below applies
 * the identical filter.
 */

/** Fixed order — the grid, the export and both print routes all read it. */
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

/** DCT's current policy — what a subject gets before anyone edits its weights. */
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

/**
 * Transmute one component: `(raw / total * span + base) * 100`.
 *
 * With base 0.6 the floor is 60.00 and a perfect score is 100.00. A score above
 * the item's max is ALLOWED and transmutes past 100 — bonus marks are real, and
 * a silently clamped typo (95 entered on a /50 item) looks correct, which is
 * worse than a number that visibly does not belong.
 *
 * `sumMax <= 0` means the component has no items at all. It returns the floor
 * rather than NaN — the instructor's call: an empty component counts, so a
 * Finals grade reads low until its exam exists, which is what the "so far" view
 * is for. Excel answers #DIV/0! here, so there is no behaviour to be faithful to.
 */
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
    const total = view === 'official' ? s.sumMax : s.sumMaxMarked
    out[c] = componentScore(s.sumScore, total, policy.transmuteBase, policy.transmuteSpan)
  }
  return out
}

/** PT·0.50 + Quiz·0.25 + Recitation·0.25, with this subject-term's weights. */
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

/** Does this term have any item at all (official), or any marked one (so far)? */
export function hasAnyItems(sums: TermSums, view: GradeView = 'official'): boolean {
  return GRADE_COMPONENTS.some((c) =>
    view === 'official' ? sums[c].sumMax > 0 : sums[c].sumMaxMarked > 0,
  )
}

/**
 * CS·0.60 + Exam·0.40 — the term grade, unrounded.
 *
 * Null when the term has nothing in it at all. A term where no component has a
 * single item has not started, and a confident 60.00 would put a real-looking
 * number on a screen that describes nothing. An empty component INSIDE a term
 * that has other items still scores the floor — see `componentScore`.
 *
 * ⚠ A zero weight is EXCLUDED, never multiplied. `0 * null` is 0 in JavaScript
 * but `0 * NaN` is NaN, so leaning on the arithmetic to neutralise an unused
 * component works right up until the value changes shape.
 */
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

/**
 * Prelim·0.30 + Midterm·0.30 + Finals·0.40, unrounded.
 *
 * Null when any term carrying weight has no grade — never a partial sum. That
 * is the bug this whole feature exists to remove: the live spreadsheet reads
 * 68.508 for a student with 99.64 and 96.54 purely because the Midterms column
 * is empty, and a number that looks like a grade is far worse than no number.
 *
 * Also null when the weights do not sum to 1, rather than renormalising them
 * silently — a misconfigured policy has to be visible, not quietly corrected.
 */
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

/**
 * Floating point: 0.1 + 0.2 is not 0.3, and weights are stored as decimals, so
 * every "must sum to 1" check needs a tolerance. One place, so the grid, the
 * weights screen and `finalGrade` cannot disagree about what "sums to 1" means.
 */
const SUM_EPSILON = 1e-9

export function sumsToOne(values: number[]): boolean {
  return Math.abs(values.reduce((a, b) => a + b, 0) - 1) < SUM_EPSILON
}

function sumError(values: number[]): string | null {
  if (sumsToOne(values)) return null
  const total = values.reduce((a, b) => a + b, 0)
  return `They currently add up to ${roundTo(total * 100, 2)}%.`
}

/**
 * Why is this policy unusable? The message, or null when it is fine.
 *
 * A sentence rather than a boolean because it is shown to the instructor as-is,
 * and "invalid weights" says nothing about which of the rules was broken — the
 * reasoning `scaleError` in `peer-scale.ts` already follows.
 */
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

/**
 * Why can this subject not be graded? Checked across all three terms.
 *
 * A missing row is ambiguous — it could mean "components unset" or "term share
 * unset" — and defaulting the share to 0 would silently turn a config gap into
 * a final grade computed out of 70%. So a subject is gradeable only once all
 * three rows exist, and the screen names the term that is missing.
 */
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

/** The shape `sumsFromScores` needs — the grid's own item rows satisfy it. */
export interface GradeItemLike {
  id: string
  component: GradeComponent
  maxScore: number
  archivedAt: string | null
}

/**
 * Build one student's component totals from the raw cells.
 *
 * The grid computes its own sums from the scores already on screen rather than
 * asking the server again — but it must reach the same answer the aggregate RPC
 * does, so the archived filter lives here and is stated in both places.
 */
export function sumsFromScores(
  items: GradeItemLike[],
  scoreByItemId: Map<string, number>,
): TermSums {
  const out = emptySums()
  for (const item of items) {
    if (item.archivedAt !== null) continue // archived items leave the denominator
    const bucket = out[item.component]
    bucket.sumMax += item.maxScore
    const score = scoreByItemId.get(item.id)
    if (score === undefined) continue // not marked yet — not a zero
    bucket.sumScore += score
    bucket.sumMaxMarked += item.maxScore
  }
  return out
}

/** Column order, defined once so the grid, export and print cannot disagree. */
export function orderedItems<T extends { component: GradeComponent; position: number }>(
  items: T[],
): T[] {
  return [...items].sort((a, b) => {
    const byComponent =
      GRADE_COMPONENTS.indexOf(a.component) - GRADE_COMPONENTS.indexOf(b.component)
    return byComponent !== 0 ? byComponent : a.position - b.position
  })
}

/** Two decimal places — the one place a grade stops being exact. */
export function displayGrade(value: number | null): string {
  return value === null ? '—' : roundTo(value, 2).toFixed(2)
}
