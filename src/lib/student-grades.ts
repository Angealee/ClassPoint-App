import { boostState, type BoostState } from './grade-boost'
import {
  COMPONENT_LABEL,
  GRADE_COMPONENTS,
  componentScores,
  componentShare,
  orderedItems,
  policyError,
  sumsFromScores,
  termGrade,
  weightedComponents,
} from './grading'
import type {
  GradeComponent,
  GradePolicy,
  MyGradeItem,
  MyGradeSubject,
  TermKey,
} from './types'

/**
 * What a student is shown of their own grades.
 *
 * ── THIS FILE CALCULATES NOTHING ITSELF ────────────────────────────────────
 * Every number comes from `grading.ts`, the only definition of the weights and
 * the transmutation in the codebase. The student's "so far" figure is
 * `termGrade(sums, policy, 'soFar')` — byte-for-byte the figure the instructor's
 * own sheet shows under its "So far" toggle, so a student who asks "why does
 * mine say 91.2?" is looking at the same number the instructor is.
 *
 * ── A STUDENT NEVER SEES THE OFFICIAL FIGURE ───────────────────────────────
 * Decision 15. The official grade counts an unmarked column as a zero; on a
 * student's screen that is a low-looking number for work the instructor simply
 * has not marked yet. So this module has no `official` path at all, rather than
 * a flag that could be flipped.
 *
 * It returns `null` — never a bare 60 — for a term with nothing marked, and for
 * a term whose weights do not add up (a wrong grade is worse than none).
 *
 * ── WHAT "SO FAR" MEANS HERE (the instructor's call, 2026-11-09) ──────────
 * Exactly what the instructor's own sheet shows under its "So far" toggle: each
 * component is scored over the columns that HAVE a mark, and a component with
 * none yet takes the 60.00 minimum. So a term with only quizzes marked reads
 * lower than it will end up, and the screen says so in words. The alternative —
 * averaging only the marked parts — was offered and declined: one number the
 * instructor and the student can both quote beats a friendlier one that only
 * the student sees. Per-component rows still show "—" for an unmarked part
 * rather than a bare 60; that is display only and moves no arithmetic.
 */

export const TERM_ORDER: readonly TermKey[] = ['prelim', 'midterm', 'finals']

export const TERM_TITLE: Record<TermKey, string> = {
  prelim: 'Prelim',
  midterm: 'Midterm',
  finals: 'Finals',
}

export interface ComponentSummary {
  component: GradeComponent
  label: string
  /** Transmuted, or null when nothing in this component is marked yet. */
  score: number | null
  /** Marks earned out of marks available, over what has been marked. */
  earned: number
  possible: number
}

export interface TermSummary {
  term: TermKey
  items: MyGradeItem[]
  /** Columns with a mark, and columns in all. */
  marked: number
  total: number
  /** "Based on what's marked so far" — null when there is nothing to base it on. */
  soFar: number | null
  components: ComponentSummary[]
}

/** The student's items for one term, in the same order the instructor's grid uses. */
export function itemsForTerm(subject: MyGradeSubject, term: TermKey): MyGradeItem[] {
  return orderedItems(subject.items.filter((i) => i.term === term))
}

function policyFor(subject: MyGradeSubject, term: TermKey): GradePolicy | null {
  return subject.policies.find((p) => p.term === term) ?? null
}

export function summarizeTerm(subject: MyGradeSubject, term: TermKey): TermSummary {
  const items = itemsForTerm(subject, term)
  const policy = policyFor(subject, term)

  const scoreById = new Map<string, number>()
  for (const i of items) if (i.score !== null) scoreById.set(i.id, i.score)

  // `archivedAt: null` — get_my_grades only ever returns live columns.
  // Recitation is the student’s attendance rate for the term (0063), so the counts
  // travel with the subject and go in beside their marks.
  const sums = sumsFromScores(
    items.map((i) => ({ id: i.id, component: i.component, maxScore: i.maxScore, archivedAt: null })),
    scoreById,
    subject.attendance?.[term],
  )

  const usable = policy !== null && policyError(policy) === null

  const scores = usable ? componentScores(sums, policy, 'soFar') : null
  const components: ComponentSummary[] = GRADE_COMPONENTS.map((component) => {
    const s = sums[component]
    return {
      component,
      label: COMPONENT_LABEL[component],
      // A component with nothing marked reads "—", not the 60.00 floor: the
      // floor is correct arithmetic and a misleading thing to put in front of
      // someone whose quiz simply has not been checked.
      score: scores !== null && s.sumMaxMarked > 0 ? scores[component] : null,
      earned: s.sumScore,
      possible: s.sumMaxMarked,
    }
  })

  return {
    term,
    items,
    marked: items.filter((i) => i.score !== null).length,
    total: items.length,
    soFar: usable ? termGrade(sums, policy, 'soFar') : null,
    components,
  }
}

export interface TermExplanation {
  /** What each part is worth of THIS term, as a percentage. Zero-weight parts are left out. */
  parts: Array<{ component: GradeComponent; label: string; sharePct: number }>
  /** What a part scores with no marks, and with full marks — out of 100. */
  floor: number
  ceiling: number
}

/**
 * "How is this worked out?" — what each part is worth, in plain percentages.
 *
 * A part's share of the TERM is its weight inside Class Standing times Class
 * Standing's weight, or the exam's own weight: with the usual 50/25/25 and 60/40
 * that is 30 / 15 / 15 / 40, which is the number a student can actually reason
 * with, where "50% of 60%" is not. It reads the same policy `termGrade` does and
 * derives nothing new — it only restates the weights.
 *
 * Null when there is no usable policy, for the same reason the term figure is:
 * explaining weights that do not add up would be explaining a number that is not
 * being shown.
 *
 * Rounded to one decimal, from thousandths, so 0.6 × 0.25 reads 15 and not
 * 15.000000000000002.
 */
export function explainTerm(subject: MyGradeSubject, term: TermKey): TermExplanation | null {
  const policy = policyFor(subject, term)
  if (policy === null || policyError(policy) !== null) return null

  const share = (w: number) => Math.round(w * 1000) / 10

  return {
    parts: weightedComponents(policy).map((c) => ({
      component: c,
      label: COMPONENT_LABEL[c],
      sharePct: share(componentShare(policy, c)),
    })),
    floor: Math.round(policy.transmuteBase * 1000) / 10,
    ceiling: Math.round((policy.transmuteBase + policy.transmuteSpan) * 1000) / 10,
  }
}

/** Only the terms that have at least one column — an empty Finals is not a row. */
export function termsWithItems(subject: MyGradeSubject): TermKey[] {
  return TERM_ORDER.filter((t) => subject.items.some((i) => i.term === t))
}

/**
 * The term the Home card should speak about: the LATEST one with a figure.
 *
 * Latest, not "current": the app does not know which term the class is in for
 * certain (the calendar is editable and holidays move it), but it knows which
 * terms have marks in them, and the newest of those is what a student means by
 * "my grade right now". Null when nothing is marked anywhere.
 */
export function latestSoFar(subject: MyGradeSubject): TermSummary | null {
  for (const term of [...TERM_ORDER].reverse()) {
    const summary = summarizeTerm(subject, term)
    if (summary.soFar !== null) return summary
  }
  return null
}

export type AvailableBoost = Extract<BoostState, { kind: 'available' }>

/** One column with the subject it belongs to and what can be done about it. */
export interface BoostColumn<S extends BoostState = BoostState> {
  subject: MyGradeSubject
  item: MyGradeItem
  state: S
}

/**
 * Every column the student has, split into what they can act on and what they
 * cannot — the shape the Use-points screen draws.
 *
 * ACTIONABLE FIRST, by the instructor's choice: most columns are not boostable
 * (unmarked, already full, or simply not offered), and a screen of mostly dead
 * rows teaches students to ignore it. So the boostable ones are the screen, and
 * the rest are one collapsed list that says WHY — a student who cannot find the
 * quiz they care about should be able to learn that it is unmarked or not
 * offered, not wonder whether the app lost it.
 *
 * Both lists keep the grid's own order (subject, then term, then component and
 * position), so a column sits in the same place here as on the Grades screen.
 * The decision of what a column IS comes from `boostState`, never re-derived.
 */
export function boostColumns(subjects: MyGradeSubject[]): {
  actionable: Array<BoostColumn<AvailableBoost>>
  other: BoostColumn[]
} {
  const actionable: Array<BoostColumn<AvailableBoost>> = []
  const other: BoostColumn[] = []
  for (const subject of subjects) {
    for (const term of TERM_ORDER) {
      for (const item of itemsForTerm(subject, term)) {
        const state = boostState(item)
        if (state.kind === 'available') actionable.push({ subject, item, state })
        else other.push({ subject, item, state })
      }
    }
  }
  return { actionable, other }
}

/** Why a column is not actionable, in the words the student reads. */
export function boostReason(state: BoostState): string {
  switch (state.kind) {
    case 'boosted':
      return `+${state.marks} from ${state.points} pts`
    case 'pending':
      return 'Waiting on your instructor'
    case 'unmarked':
      return 'Your mark isn’t in yet'
    case 'full':
      return 'Already at full marks'
    case 'not-offered':
      return 'Not offered for points'
    case 'absent':
      return 'You were absent for this one'
    case 'available':
      return 'Available'
  }
}

/** Columns that could be boosted right now, across every subject — for the nudge. */
export function boostableCount(subjects: MyGradeSubject[]): number {
  // Asks `boostState` rather than re-stating its rules: a second copy of "can
  // this column be boosted" is how the Home nudge and the Grades screen would
  // come to disagree about the same column.
  let n = 0
  for (const s of subjects) {
    for (const i of s.items) if (boostState(i).kind === 'available') n += 1
  }
  return n
}
