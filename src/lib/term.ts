
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

export interface TermCalendarInput {
  semesterId: string
  semesterName: string
  startsOn: string
  terms: Array<{ term: TermName; startsOn: string; endsOn: string }>
}

const DAY_MS = 24 * 60 * 60 * 1000

function parseDateOnly(value: string): Date {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y ?? 2026, (m ?? 1) - 1, d ?? 1)
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function toDate(value: Date | string): Date {
  return typeof value === 'string' ? new Date(value) : value
}

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

export function termCalendar(): TermCalendar {
  return calendar
}

/** First day of the semester (a Monday), in local time. */
export function termStart(): Date {
  return calendar.start
}

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

export function termRanges(): TermRange[] {
  return calendar.terms
}

const MD = { month: 'short', day: 'numeric' } as const

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
  term: TermName | null
  items: T[]
}

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
