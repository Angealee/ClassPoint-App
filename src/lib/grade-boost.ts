import type { MyGradeItem } from './types'

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
  | { kind: 'unmarked'; cost: number; bonus: number }
  /** Offered, but already at the maximum — "You already have full marks". */
  | { kind: 'full' }
  /** A request can be made. `gain` is the REAL gain after the cap. */
  | { kind: 'available'; cost: number; bonus: number; gain: number; newScore: number; score: number }

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
  if (item.pointsCost === null || item.pointsBonus === null) return { kind: 'not-offered' }

  // Absent comes BEFORE "unmarked", as it does on the server: "you were absent" is
  // the truer reason and tells them not to wait for a mark that is not coming. It
  // applies even when a mark was typed (an absentee given a 0 cannot be assisted).
  if (item.absent) return { kind: 'absent' }

  const cost = item.pointsCost
  const bonus = item.pointsBonus
  if (item.score === null) return { kind: 'unmarked', cost, bonus }

  const gain = boostGain(item.score, item.maxScore, bonus)
  if (gain <= 0) return { kind: 'full' }

  return {
    kind: 'available',
    cost,
    bonus,
    gain,
    newScore: round2(item.score + gain),
    score: item.score,
  }
}

/**
 * Could the instructor's terms ever be saved as typed? The Columns panel asks
 * this so it can show a sentence ("5 points for 10 marks") or the reason there
 * is none — mirroring `grade_items_boost_range_check`, which would otherwise
 * reject the write with a constraint name.
 *
 * Both blank = not offered, which is valid. One blank is not.
 */
export function boostTermsError(
  cost: number | null,
  bonus: number | null,
  max: number,
): string | null {
  if (cost === null && bonus === null) return null
  if (cost === null || bonus === null) return 'Fill in both the points and the marks, or neither.'
  if (!Number.isInteger(cost) || cost < 1 || cost > 50) return 'Points must be a whole number from 1 to 50.'
  if (!(bonus > 0)) return 'Marks must be more than 0.'
  if (bonus > max) return `Marks can’t be more than the column’s ${max}.`
  return null
}
