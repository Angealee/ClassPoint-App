/**
 * Term calendar — week numbering for the attendance history.
 *
 * Classes started Monday, June 15 2026. Week 1 is Jun 15–21, week 2 is
 * Jun 22–28, and so on. This lives in code rather than the database on
 * purpose: it's purely presentational, there's one instructor and one term
 * running at a time, and a new term is a one-line edit here instead of a
 * migration + API + UI change.
 *
 * To roll over to a new term: set TERM_START to that term's Monday.
 */

/** First day of the term (a Monday), in local time. */
export const TERM_START = new Date(2026, 5, 15) // June is month 5

const DAY_MS = 24 * 60 * 60 * 1000

/** Local midnight for a date — week math must ignore the clock time. */
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/**
 * Which term week a date falls in. Week 1 = the term's first Mon–Sun.
 * Anything before the term start clamps to 1 (a stray pre-term session
 * shouldn't render as "Week -2").
 */
export function weekOf(date: Date | string): number {
  const d = startOfDay(typeof date === 'string' ? new Date(date) : date)
  const days = Math.floor((d.getTime() - TERM_START.getTime()) / DAY_MS)
  if (days < 0) return 1
  return Math.floor(days / 7) + 1
}

/** The Monday–Sunday range covered by a given term week. */
export function weekRange(week: number): { start: Date; end: Date } {
  const start = new Date(TERM_START)
  start.setDate(start.getDate() + (week - 1) * 7)
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  return { start, end }
}

const MD = { month: 'short', day: 'numeric' } as const

/**
 * The divider label for a term week, e.g. "Week 5 · Jul 13–19".
 * The month repeats only when the week straddles two months
 * ("Week 3 · Jun 29–Jul 5").
 */
export function weekLabel(week: number): string {
  const { start, end } = weekRange(week)
  const startText = start.toLocaleDateString(undefined, MD)
  const endText =
    start.getMonth() === end.getMonth()
      ? String(end.getDate())
      : end.toLocaleDateString(undefined, MD)
  return `Week ${week} · ${startText}–${endText}`
}

/**
 * Group items into term weeks, newest week first (matching the history list's
 * newest-first order). Items within a group keep their incoming order.
 */
export function groupByWeek<T>(
  items: T[],
  getDate: (item: T) => string | Date,
): Array<{ week: number; label: string; items: T[] }> {
  const buckets = new Map<number, T[]>()
  for (const item of items) {
    const w = weekOf(getDate(item))
    const list = buckets.get(w)
    if (list) list.push(item)
    else buckets.set(w, [item])
  }
  return [...buckets.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([week, list]) => ({ week, label: weekLabel(week), items: list }))
}
