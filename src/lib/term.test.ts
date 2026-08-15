import { beforeEach, describe, expect, it } from 'vitest'
import {
  configureTermCalendar,
  groupByTerm,
  groupByWeek,
  termCalendar,
  termLabel,
  termOf,
  termRanges,
  termStart,
  weekLabel,
  weekOf,
  weekRange,
} from './term'

/**
 * Week/term maths. The highest-risk part is date parsing: `new Date('2026-06-15')`
 * is UTC midnight, which lands on the PREVIOUS day in any negative-offset
 * timezone. term.ts parses date-only strings as LOCAL midnight specifically to
 * avoid that, and these tests would catch a regression to the naive form.
 *
 * term.ts holds a module-level calendar, so every test configures it first.
 */
const CALENDAR = {
  semesterId: 'sem-1',
  semesterName: '1st Sem AY 2026–2027',
  startsOn: '2026-06-15', // a Monday
  terms: [
    { term: 'prelim' as const, startsOn: '2026-06-15', endsOn: '2026-07-26' },
    { term: 'midterm' as const, startsOn: '2026-07-27', endsOn: '2026-09-06' },
    { term: 'finals' as const, startsOn: '2026-09-07', endsOn: '2026-10-18' },
  ],
}

/** Local-midnight date, matching how term.ts interprets a calendar day. */
const local = (y: number, m: number, d: number) => new Date(y, m - 1, d)

beforeEach(() => {
  configureTermCalendar(CALENDAR)
})

describe('configureTermCalendar', () => {
  it('parses date-only strings as LOCAL midnight, not UTC', () => {
    // The bug this guards: UTC parsing would make the semester start on Jun 14
    // for anyone west of Greenwich, shifting every week number by one.
    const start = termStart()
    expect(start.getFullYear()).toBe(2026)
    expect(start.getMonth()).toBe(5) // June
    expect(start.getDate()).toBe(15)
    expect(start.getHours()).toBe(0)
  })

  it('exposes the semester name and sorts terms chronologically', () => {
    expect(termCalendar().semesterName).toBe('1st Sem AY 2026–2027')
    expect(termRanges().map((t) => t.term)).toEqual(['prelim', 'midterm', 'finals'])
  })

  it('sorts terms even when supplied out of order', () => {
    configureTermCalendar({
      ...CALENDAR,
      terms: [CALENDAR.terms[2], CALENDAR.terms[0], CALENDAR.terms[1]],
    })
    expect(termRanges().map((t) => t.term)).toEqual(['prelim', 'midterm', 'finals'])
  })
})

describe('weekOf', () => {
  it('counts the first Mon–Sun as week 1', () => {
    expect(weekOf(local(2026, 6, 15))).toBe(1) // Monday
    expect(weekOf(local(2026, 6, 21))).toBe(1) // the following Sunday
  })

  it('rolls to week 2 on the next Monday', () => {
    expect(weekOf(local(2026, 6, 22))).toBe(2)
  })

  it('ignores the clock time within a day', () => {
    const morning = new Date(2026, 5, 22, 7, 30)
    const night = new Date(2026, 5, 22, 23, 59)
    expect(weekOf(morning)).toBe(weekOf(night))
  })

  it('clamps anything before the semester to week 1', () => {
    // A stray pre-semester session must not render as "Week -2".
    expect(weekOf(local(2026, 6, 1))).toBe(1)
    expect(weekOf(local(2020, 1, 1))).toBe(1)
  })

  it('reaches week 18 at the end of an 18-week semester', () => {
    expect(weekOf(local(2026, 10, 12))).toBe(18)
  })
})

describe('weekRange / weekLabel', () => {
  it('returns the Monday–Sunday span for a week', () => {
    const { start, end } = weekRange(2)
    expect(start.getDate()).toBe(22)
    expect(end.getDate()).toBe(28)
  })

  it('collapses the month when a week sits inside one', () => {
    expect(weekLabel(1)).toMatch(/^Week 1 · Jun 15–21$/)
  })

  it('repeats the month when a week straddles two', () => {
    // Week 3 is Jun 29 – Jul 5.
    expect(weekLabel(3)).toMatch(/Jun 29–Jul 5/)
  })
})

describe('termOf', () => {
  it('maps dates to their term', () => {
    expect(termOf(local(2026, 6, 15))).toBe('prelim')
    expect(termOf(local(2026, 7, 26))).toBe('prelim') // last day, inclusive
    expect(termOf(local(2026, 7, 27))).toBe('midterm') // first day
    expect(termOf(local(2026, 9, 6))).toBe('midterm')
    expect(termOf(local(2026, 9, 7))).toBe('finals')
    expect(termOf(local(2026, 10, 18))).toBe('finals')
  })

  it('returns null outside every configured range', () => {
    expect(termOf(local(2026, 6, 1))).toBeNull() // before the semester
    expect(termOf(local(2026, 12, 1))).toBeNull() // after finals
  })

  it('handles a gap between terms (a real break in the calendar)', () => {
    configureTermCalendar({
      ...CALENDAR,
      terms: [
        { term: 'prelim', startsOn: '2026-06-15', endsOn: '2026-07-26' },
        // One week of no classes, then midterm resumes.
        { term: 'midterm', startsOn: '2026-08-03', endsOn: '2026-09-13' },
        { term: 'finals', startsOn: '2026-09-14', endsOn: '2026-10-25' },
      ],
    })
    expect(termOf(local(2026, 7, 29))).toBeNull() // inside the break
    expect(termOf(local(2026, 8, 3))).toBe('midterm')
  })
})

describe('termLabel', () => {
  it('names each term and the outside case', () => {
    expect(termLabel('prelim')).toBe('Prelim')
    expect(termLabel('midterm')).toBe('Midterm')
    expect(termLabel('finals')).toBe('Finals')
    expect(termLabel(null)).toBe('Outside term')
  })
})

describe('groupByWeek', () => {
  const items = [
    { at: local(2026, 6, 16).toISOString() }, // week 1
    { at: local(2026, 6, 18).toISOString() }, // week 1
    { at: local(2026, 6, 23).toISOString() }, // week 2
  ]

  it('groups newest week first', () => {
    const groups = groupByWeek(items, (i) => i.at)
    expect(groups.map((g) => g.week)).toEqual([2, 1])
  })

  it('keeps incoming order inside a group', () => {
    const groups = groupByWeek(items, (i) => i.at)
    expect(groups[1].items).toHaveLength(2)
    expect(groups[1].items[0].at).toBe(items[0].at)
  })

  it('tags each group with its term', () => {
    const groups = groupByWeek(items, (i) => i.at)
    expect(groups.every((g) => g.term === 'prelim')).toBe(true)
  })

  it('returns nothing for no items', () => {
    expect(groupByWeek([], (i: { at: string }) => i.at)).toEqual([])
  })
})

describe('groupByTerm', () => {
  it('orders newest term first and keeps an outside bucket last', () => {
    const items = [
      { at: local(2026, 6, 16).toISOString() }, // prelim
      { at: local(2026, 9, 10).toISOString() }, // finals
      { at: local(2026, 12, 1).toISOString() }, // outside
    ]
    const groups = groupByTerm(items, (i) => i.at)
    expect(groups.map((g) => g.term)).toEqual(['finals', 'prelim', null])
  })

  it('omits terms with no items', () => {
    const groups = groupByTerm([{ at: local(2026, 6, 16).toISOString() }], (i) => i.at)
    expect(groups.map((g) => g.term)).toEqual(['prelim'])
  })
})
