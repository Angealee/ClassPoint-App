import { MAX_REDEEM_POINTS, type MyGradeItem } from './types'

export type BoostState =
  /** The receipt exists. Draw the indicator. */
  | { kind: 'boosted'; marks: number; points: number; before: number }
  /** A request is with the instructor. */
  | { kind: 'pending' }
  /** The instructor has not offered this column. */
  | { kind: 'not-offered' }
  | { kind: 'absent' }
  | { kind: 'unmarked' }
  | { kind: 'full' }
  | { kind: 'available'; score: number; gap: number; maxPoints: number }

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function formatMarks(n: number): string {
  return String(round2(n))
}

export function boostGain(score: number | null, max: number, bonus: number): number {
  if (score === null) return 0
  return Math.max(0, round2(Math.min(max, score + bonus) - score))
}

export function boostState(item: MyGradeItem): BoostState {
  if (item.boost) {
    return {
      kind: 'boosted',
      marks: item.boost.marks,
      points: item.boost.points,
      before: item.boost.before,
    }
  }
  if (item.pending) return { kind: 'pending' }
  if (!item.offered) return { kind: 'not-offered' }

  if (item.absent) return { kind: 'absent' }

  if (item.score === null) return { kind: 'unmarked' }

  const gap = round2(item.maxScore - item.score)
  if (gap <= 0) return { kind: 'full' }

  return { kind: 'available', score: item.score, gap, maxPoints: maxPointsFor(item.score, item.maxScore) }
}

export function maxPointsFor(score: number, max: number): number {
  const gap = max - score
  if (!(gap > 0)) return 0
  return Math.min(MAX_REDEEM_POINTS, Math.ceil(round2(gap)))
}

export function pointsGain(points: number, score: number, max: number): number {
  return Math.max(0, round2(Math.min(points, max - score)))
}
