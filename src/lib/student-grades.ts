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

export const TERM_ORDER: readonly TermKey[] = ['prelim', 'midterm', 'finals']

export const TERM_TITLE: Record<TermKey, string> = {
  prelim: 'Prelim',
  midterm: 'Midterm',
  finals: 'Finals',
}

export interface ComponentSummary {
  component: GradeComponent
  label: string
  score: number | null
  earned: number
  possible: number
}

export interface TermSummary {
  term: TermKey
  items: MyGradeItem[]
  /** Columns with a mark, and columns in all. */
  marked: number
  total: number
  soFar: number | null
  components: ComponentSummary[]
}

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

/** One part of the term, drawn as one segment of the breakdown bar. */
export interface BreakdownSegment {
  component: GradeComponent
  label: string
  /** Short enough for a segment a few dozen pixels wide. */
  short: string
  /** This part's share of the TERM, 0-100 (30 / 15 / 15 / 40 on the default policy). */
  weightPct: number
  /** The part's score as the term counts it (so far), or null when nothing is marked in it. */
  score: number | null
  /** 0-1 of what the part could still have earned; null when there is no score to draw. */
  fill: number | null
}

const SHORT_LABEL: Record<GradeComponent, string> = {
  performance_task: 'Perf',
  quiz: 'Quiz',
  recitation: 'Recit',
  exam: 'Exam',
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

/**
 * The weighted breakdown behind the hero bar. Every figure is read from grading.ts (the one
 * place the weights and the transmutation live); this only turns them into widths and fills.
 *
 * The fill is the share of the part's ATTAINABLE range, not the score over 100: a transmuted
 * part can never score below the 60 floor, so score / 100 would draw every part at least 60%
 * full and hide the difference between a weak and a strong one. Recitation is the attendance
 * rate as-is (no floor), so it is drawn as rate / 100.
 */
export function breakdownSegments(
  subject: MyGradeSubject,
  term: TermKey,
): BreakdownSegment[] | null {
  const policy = policyFor(subject, term)
  if (policy === null || policyError(policy) !== null) return null

  const summary = summarizeTerm(subject, term)
  const floor = policy.transmuteBase * 100
  const span = policy.transmuteSpan * 100

  return weightedComponents(policy).map((component) => {
    const part = summary.components.find((c) => c.component === component)
    const score = part?.score ?? null
    let fill: number | null = null
    if (score !== null) {
      fill = component === 'recitation' ? clamp01(score / 100) : span > 0 ? clamp01((score - floor) / span) : 0
    }
    return {
      component,
      label: COMPONENT_LABEL[component],
      short: SHORT_LABEL[component],
      weightPct: Math.round(componentShare(policy, component) * 1000) / 10,
      score,
      fill,
    }
  })
}

/**
 * Colour for a single mark. Neutral in the middle on purpose: the app's 70 / 85 bands are the
 * instructor's at-risk line for ATTENDANCE, and applying them to every quiz painted a perfectly
 * ordinary 65 / 100 red. Colour is kept for the two ends only; red is never used for a mark.
 */
export function markTone(pct: number): 'success' | 'warn' | null {
  if (pct >= 100) return 'success'
  if (pct < 50) return 'warn'
  return null
}

export interface TermExplanation {
  parts: Array<{ component: GradeComponent; label: string; sharePct: number }>
  floor: number
  ceiling: number
}

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

export function termsWithItems(subject: MyGradeSubject): TermKey[] {
  return TERM_ORDER.filter((t) => subject.items.some((i) => i.term === t))
}

export function latestSoFar(subject: MyGradeSubject): TermSummary | null {
  for (const term of [...TERM_ORDER].reverse()) {
    const summary = summarizeTerm(subject, term)
    if (summary.soFar !== null) return summary
  }
  return null
}

export type AvailableBoost = Extract<BoostState, { kind: 'available' }>

export interface BoostColumn<S extends BoostState = BoostState> {
  subject: MyGradeSubject
  item: MyGradeItem
  state: S
}

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

export function boostableCount(subjects: MyGradeSubject[]): number {
  let n = 0
  for (const s of subjects) {
    for (const i of s.items) if (boostState(i).kind === 'available') n += 1
  }
  return n
}

export function sortItems(items: MyGradeItem[], order: 'order' | 'lowest'): MyGradeItem[] {
  if (order === 'order') return items
  const share = (i: MyGradeItem) =>
    i.score === null || !(i.maxScore > 0) ? Number.POSITIVE_INFINITY : i.score / i.maxScore
  return [...items].sort((a, b) => share(a) - share(b))
}
