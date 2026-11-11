import { MAX_REDEEM_POINTS, type MyGradeItem } from './types'

/**
 * What a student may do about spending points on one grade column.
 *
 * ── THE SERVER IS THE AUTHORITY, THIS IS ITS PREVIEW ───────────────────────
 * `request_grade_boost` (0062) re-checks every one of these rules and refuses a
 * request that breaks them. This function exists so the screen can show the
 * RIGHT thing — a button, a reason, a receipt — instead of a button that always
 * fails. The two must agree, which is why each branch below names the exception
 * the SQL raises for it. Change one side, change the other, same commit (the
 * `lounge-answers.ts` rule).
 *
 * ── ORDER MATTERS ──────────────────────────────────────────────────────────
 * A boosted column stays "boosted" even if the instructor later removes the
 * terms from it — the receipt is history, not an offer. A waiting request beats
 * "not offered" for the same reason. Only then do the rules for a NEW request
 * apply.
 *
 * ── THERE IS NO ARITHMETIC ABOUT GRADES HERE ───────────────────────────────
 * Only about marks on one column: how many the bonus would really add, given
 * the cap. Weights and transmutation stay in `grading.ts`, the only definition.
 */
export type BoostState =
  /** The receipt exists. Draw the indicator. */
  | { kind: 'boosted'; marks: number; points: number; before: number }
  /** A request is with the instructor. */
  | { kind: 'pending' }
  /** The instructor has not offered this column. */
  | { kind: 'not-offered' }
  /**
   * Offered, but this student was absent for it (0063) — marked absent, or recorded
   * absent / excused in the class it was held in. Server: "You were marked absent for …".
   */
  | { kind: 'absent' }
  /** Offered, but their mark is not in — "Your mark … isn't in yet". */
  | { kind: 'unmarked' }
  /** Offered, but already at the maximum — "You already have full marks". */
  | { kind: 'full' }
  /**
   * A request can be made, and the STUDENT chooses how many points (0064): 1 point
   * = 1 mark, from 1 up to `maxPoints`. `gap` is the marks still missing to the
   * maximum; use `pointsGain` for what a given number of points really adds.
   */
  | { kind: 'available'; score: number; gap: number; maxPoints: number }

/** numeric(6,2) arithmetic without `0.1 + 0.2` showing up on a student's screen. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * A mark as a student reads it: "12", "12.5", "12.25" — never "12.00" and never
 * "12.299999999999999". The one formatter, so the grades screen, the confirm
 * dialog and the instructor's inbox cannot write the same mark two ways.
 */
export function formatMarks(n: number): string {
  return String(round2(n))
}

/**
 * How many marks the bonus REALLY adds, once the column's maximum is applied.
 *
 * Zero for an unmarked mark (nothing to add to) or one already at or past the
 * maximum. Never negative — a mark typed above the max (extra credit the
 * instructor chose to allow) gains nothing, it does not LOSE marks.
 */
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

  // Absent comes BEFORE "unmarked", as it does on the server: "you were absent" is
  // the truer reason and tells them not to wait for a mark that is not coming. It
  // applies even when a mark was typed (an absentee given a 0 cannot be assisted).
  if (item.absent) return { kind: 'absent' }

  if (item.score === null) return { kind: 'unmarked' }

  const gap = round2(item.maxScore - item.score)
  if (gap <= 0) return { kind: 'full' }

  return { kind: 'available', score: item.score, gap, maxPoints: maxPointsFor(item.score, item.maxScore) }
}

/**
 * The most points a student may use on a column: the marks still missing to the
 * maximum, rounded UP to a whole point (points are whole numbers — 17.5/20 may use
 * 3 and gains 2.5), and never more than the 50 a single request is allowed.
 *
 * Zero when there is nothing to gain. Mirrors the check in `request_grade_boost`
 * (0064): "You can use at most N points on …". Change one side, change the other.
 */
export function maxPointsFor(score: number, max: number): number {
  const gap = max - score
  if (!(gap > 0)) return 0
  return Math.min(MAX_REDEEM_POINTS, Math.ceil(round2(gap)))
}

/**
 * What `points` points ADD to a mark: 1 point = 1 mark, capped at the maximum so a
 * mark can never pass it. This is what the confirm shows BEFORE the request goes,
 * and what `request_grade_boost` stores as the bonus the student agreed to.
 */
export function pointsGain(points: number, score: number, max: number): number {
  return Math.max(0, round2(Math.min(points, max - score)))
}
