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
