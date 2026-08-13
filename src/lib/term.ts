/**
 * Term calendar — week and term numbering for attendance history.
 *
 * Since 0027 this is DB-driven: the active semester's `starts_on` anchors week
 * 1, and `semester_terms` supplies the prelim / midterm / finals ranges. Real
 * calendars move for holidays and suspensions, so the dates are stored and
 * editable rather than computed from rigid six-week arithmetic.
 *
 * The module keeps a mutable calendar with the pre-0027 values as its fallback,
 * so every function here is synchronous and safe to call before the fetch lands
 * — screens render identically to before, then sharpen once the real calendar
 * arrives. Call `configureTermCalendar()` once per mount point that needs it:
 * InstructorLayout does it for the whole instructor area, and StudentReport does
 * it separately because it renders OUTSIDE that layout (see router.tsx).
 *
 * Deliberately free of Supabase imports — the fetch lives in api.ts
 * (`loadTermCalendar`), per the data-layer convention.
 */

export type TermName = 'prelim' | 'midterm' | 'finals'

export interface TermRange {
  term: TermName
  start: Date
  end: Date
}

export interface TermCalendar {
  semesterId: string | null
  semesterName: string
  /** First day of week 1 (a Monday), local time. */
  start: Date
  terms: TermRange[]
}

/** The raw shape as it comes out of the DB — dates are 'YYYY-MM-DD' strings. */
export interface TermCalendarInput {
  semesterId: string
  semesterName: string
  startsOn: string
  terms: Array<{ term: TermName; startsOn: string; endsOn: string }>
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Parse a date-only string as LOCAL midnight.
 *
 * `new Date('2026-06-15')` parses as UTC midnight, which lands on the previous
 * day in any negative-offset timezone. Week maths must not depend on where the
 * viewer is standing.
 */
function parseDateOnly(value: string): Date {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y ?? 2026, (m ?? 1) - 1, d ?? 1)
}

/** Local midnight for a date — week maths must ignore the clock time. */
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function toDate(value: Date | string): Date {
  return typeof value === 'string' ? new Date(value) : value
}

/**
 * Pre-0027 defaults: the hardcoded June 15 2026 anchor and six-week terms.
 * Kept as the fallback so nothing renders blank before the calendar loads.
 */
const FALLBACK: TermCalendar = {
  semesterId: null,
  semesterName: '1st Sem AY 2026–2027',
  start: new Date(2026, 5, 15), // June is month 5
  terms: [
    { term: 'prelim', start: new Date(2026, 5, 15), end: new Date(2026, 6, 26) },
    { term: 'midterm', start: new Date(2026, 6, 27), end: new Date(2026, 8, 6) },
    { term: 'finals', start: new Date(2026, 8, 7), end: new Date(2026, 9, 18) },
  ],
}

let calendar: TermCalendar = FALLBACK

/** Swap in the real calendar. Safe to call repeatedly (last write wins). */
export function configureTermCalendar(input: TermCalendarInput): void {
  calendar = {
    semesterId: input.semesterId,
    semesterName: input.semesterName,
    start: parseDateOnly(input.startsOn),
    terms: input.terms
      .map((t) => ({
        term: t.term,
        start: parseDateOnly(t.startsOn),
        end: parseDateOnly(t.endsOn),
      }))
      .sort((a, b) => a.start.getTime() - b.start.getTime()),
  }
}

/** The active calendar, for screens that need the semester's name or ranges. */
export function termCalendar(): TermCalendar {
  return calendar
}

/** First day of the semester (a Monday), in local time. */
export function termStart(): Date {
  return calendar.start
}

/**
 * Which semester week a date falls in. Week 1 = the semester's first Mon–Sun.
 * Anything before the start clamps to 1 (a stray pre-semester session shouldn't
 * render as "Week -2").
 */
export function weekOf(date: Date | string): number {
  const d = startOfDay(toDate(date))
  const days = Math.floor((d.getTime() - startOfDay(calendar.start).getTime()) / DAY_MS)
  if (days < 0) return 1
  return Math.floor(days / 7) + 1
}

/** The Monday–Sunday range covered by a given semester week. */
export function weekRange(week: number): { start: Date; end: Date } {
  const start = new Date(calendar.start)
  start.setDate(start.getDate() + (week - 1) * 7)
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  return { start, end }
}

/**
 * Which term a date belongs to, or null when it falls outside every configured
 * range (a make-up class during the break, or a term whose dates aren't set).
 */
export function termOf(date: Date | string): TermName | null {
  const t = startOfDay(toDate(date)).getTime()
  for (const range of calendar.terms) {
    if (t >= startOfDay(range.start).getTime() && t <= startOfDay(range.end).getTime()) {
      return range.term
    }
  }
  return null
}

const TERM_LABELS: Record<TermName, string> = {
  prelim: 'Prelim',
  midterm: 'Midterm',
  finals: 'Finals',
}

export function termLabel(term: TermName | null): string {
  return term ? TERM_LABELS[term] : 'Outside term'
}

/** Every term of the active semester, earliest first. Empty until configured. */
export function termRanges(): TermRange[] {
  return calendar.terms
}

const MD = { month: 'short', day: 'numeric' } as const

/**
 * The divider label for a semester week, e.g. "Week 5 · Jul 13–19".
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

export interface WeekGroup<T> {
  week: number
  label: string
  /** The term this week falls in, from its Monday. Null outside every range. */
  term: TermName | null
  items: T[]
}

/**
 * Group items into semester weeks, newest week first (matching the history
 * list's newest-first order). Items within a group keep their incoming order.
 */
export function groupByWeek<T>(
  items: T[],
  getDate: (item: T) => string | Date,
): Array<WeekGroup<T>> {
  const buckets = new Map<number, T[]>()
  for (const item of items) {
    const w = weekOf(getDate(item))
    const list = buckets.get(w)
    if (list) list.push(item)
    else buckets.set(w, [item])
  }
  return [...buckets.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([week, list]) => ({
      week,
      label: weekLabel(week),
      term: termOf(weekRange(week).start),
      items: list,
    }))
}

export interface TermGroup<T> {
  term: TermName | null
  label: string
  items: T[]
}

/**
 * Group items into prelim / midterm / finals, newest term first. Anything
 * outside every configured range collects in a trailing null bucket rather than
 * being dropped — a session that happened is a session that happened.
 */
export function groupByTerm<T>(
  items: T[],
  getDate: (item: T) => string | Date,
): Array<TermGroup<T>> {
  const order: Array<TermName | null> = [
    ...calendar.terms.map((t) => t.term).reverse(),
    null,
  ]
  const buckets = new Map<TermName | null, T[]>()
  for (const item of items) {
    const key = termOf(getDate(item))
    const list = buckets.get(key)
    if (list) list.push(item)
    else buckets.set(key, [item])
  }
  return order
    .filter((term) => buckets.has(term))
    .map((term) => ({ term, label: termLabel(term), items: buckets.get(term) ?? [] }))
}
