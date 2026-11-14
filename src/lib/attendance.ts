import { NEUTRAL_STATUSES, type AttendanceStatus, type MyAttendanceEntry } from '@/lib/types'

export interface AttendanceTally {
  present: number
  late: number
  absent: number
  excused: number
  irregular: number
  /** present + late + absent. The denominator. */
  counted: number
  neutral: number
  /** Every record, neutral ones included. */
  total: number
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

export function rateTone(rate: number): 'success' | 'warn' | 'danger' {
  if (rate >= 85) return 'success'
  if (rate >= 70) return 'warn'
  return 'danger'
}

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

export type TrailKind = 'present' | 'late' | 'absent' | 'neutral'

/** How a class is drawn in the trail: excused and irregular are NEUTRAL (a ring, not a colour). */
export function trailKind(status: AttendanceStatus): TrailKind {
  if (status === 'present' || status === 'late' || status === 'absent') return status
  return 'neutral'
}

/**
 * The last `n` classes, OLDEST first so the newest sits on the right. Ties on the start time
 * (two subjects in one day) fall back to the record id, so the order never shuffles between
 * renders.
 */
export function trailOf(
  items: readonly MyAttendanceEntry[],
  n = 10,
): Array<{ recordId: string; status: AttendanceStatus; startedAt: string }> {
  return [...items]
    .sort((a, b) => {
      const d = new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
      return d !== 0 ? d : a.recordId.localeCompare(b.recordId)
    })
    .slice(-n)
    .map((h) => ({ recordId: h.recordId, status: h.status, startedAt: h.startedAt }))
}

const DAY_MS = 86_400_000

const localDay = (ms: number) => {
  const d = new Date(ms)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/**
 * When an absence stops being excusable, as the real DATE. Never "N days left": the window
 * runs from the class start, so an evening class caught late in the window has barely a day,
 * and a relative count would be a lie at the edge (the same rule the nudge notification keeps).
 */
export function excuseClosesLabel(startedAt: string, now: number = Date.now(), days = 7): string {
  const closes = new Date(startedAt).getTime() + days * DAY_MS
  if (closes < now) return 'closed'
  const diff = Math.round((localDay(closes) - localDay(now)) / DAY_MS)
  if (diff <= 0) return 'closes today'
  if (diff === 1) return 'closes tomorrow'
  return `closes ${new Date(closes).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
}
