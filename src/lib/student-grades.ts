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
