import { NEUTRAL_STATUSES, type AttendanceStatus, type MyAttendanceEntry } from '@/lib/types'

/**
 * The one definition of a student's attendance figures.
 *
 * ── WHY THIS IS A MODULE AND NOT A HELPER IN ONE SCREEN ────────────────────
 * The show-up rate is the number the instructor's own screens flag students on,
 * and it was computed independently in three places — `AttendanceStats`,
 * `Attendance` and (as of Era 6.0 Phase 6) the Dashboard's summary card. Three
 * copies of a rule that produces an academic-facing figure is how they drift
 * apart, and a student comparing two screens has no way to know which is right.
 *
 * ── THE RULE ───────────────────────────────────────────────────────────────
 * `excused` and `irregular` are NEUTRAL: they leave the denominator entirely,
 * so a legitimate excuse can never drag the rate down. What counts is
 * present + late + absent; what "showed up" is present + late.
 *
 * That matches `get_section_attendance_stats` in migration 0031 and the
 * `NEUTRAL_STATUSES` rule in types.ts. If this ever needs to change, it has to
 * change in the SQL in the same commit, or the student's screen and the
 * instructor's workbook will disagree about the same class.
 */

export interface AttendanceTally {
  present: number
  late: number
  absent: number
  excused: number
  irregular: number
  /** present + late + absent. The denominator. */
  counted: number
  /** excused + irregular — real classes that don't count for or against you. */
  neutral: number
  /** Every record, neutral ones included. */
  total: number
  /** present + late, as a whole percentage of `counted`. 0 when nothing counts. */
  rate: number
}

/** Does this record count toward the rate at all? */
export function counts(status: AttendanceStatus): boolean {
  return !NEUTRAL_STATUSES.includes(status)
}

/** Did the student turn up? Late still counts as showing up. */
export function showedUp(status: AttendanceStatus): boolean {
  return status === 'present' || status === 'late'
}

/** Full tally for a set of attendance records. */
export function tally(items: readonly MyAttendanceEntry[]): AttendanceTally {
  const s: Record<AttendanceStatus, number> = {
    present: 0,
    late: 0,
    absent: 0,
    excused: 0,
    irregular: 0,
  }
  for (const h of items) s[h.status] += 1

  const counted = s.present + s.late + s.absent
  return {
    ...s,
    counted,
    neutral: s.excused + s.irregular,
    total: items.length,
    rate: rateOf(items),
  }
}

/** Show-up rate as a whole percentage. 0 when no class counted yet. */
export function rateOf(items: readonly MyAttendanceEntry[]): number {
  const counted = items.filter((h) => counts(h.status)).length
  if (counted === 0) return 0
  const showed = items.filter((h) => showedUp(h.status)).length
  return Math.round((showed / counted) * 100)
}

/** How many of these records count toward the rate. */
export function countedOf(items: readonly MyAttendanceEntry[]): number {
  return items.filter((h) => counts(h.status)).length
}

/**
 * The band a rate falls in, for colouring.
 *
 * 70% is the at-risk line the instructor's own risk overview uses (0034), so
 * the student sees the same threshold their instructor is looking at rather
 * than a friendlier one invented for the student side.
 */
export function rateTone(rate: number): 'success' | 'warn' | 'danger' {
  if (rate >= 85) return 'success'
  if (rate >= 70) return 'warn'
  return 'danger'
}

/**
 * The same tally, split per subject (0030).
 *
 * Attendance is subject-scoped, so a perfect record in one class shouldn't be
 * averaged away by a rough one in another. Sessions predating subjects (0028)
 * group into their own bucket rather than being dropped — they happened. The
 * bucket is labelled "Earlier classes" rather than "Earlier" so it doesn't sit
 * in the list looking like a subject code next to "IT 32" and "Elective 1".
 */
export function bySubject(
  items: readonly MyAttendanceEntry[],
): Array<{ key: string; label: string; counted: number; rate: number; absent: number }> {
  const groups = new Map<string, { label: string; items: MyAttendanceEntry[] }>()
  for (const h of items) {
    const key = h.subjectId ?? '__untagged'
    const g = groups.get(key) ?? { label: h.subjectCode ?? 'Earlier classes', items: [] }
    g.items.push(h)
    groups.set(key, g)
  }
  return [...groups.entries()]
    .map(([key, g]) => ({
      key,
      label: g.label,
      counted: countedOf(g.items),
      rate: rateOf(g.items),
      absent: g.items.filter((h) => h.status === 'absent').length,
    }))
    .filter((g) => g.counted > 0)
    .sort((a, b) => a.label.localeCompare(b.label))
}
