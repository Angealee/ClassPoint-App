import { describe, expect, it } from 'vitest'
import {
  bySubject,
  countedOf,
  counts,
  excuseClosesLabel,
  rateOf,
  rateTone,
  showedUp,
  tally,
  trailKind,
  trailOf,
} from './attendance'
import type { AttendanceStatus, MyAttendanceEntry } from './types'

let n = 0
const rec = (status: AttendanceStatus, subject?: [string, string]): MyAttendanceEntry =>
  ({
    id: `r${n++}`,
    status,
    subjectId: subject?.[0] ?? null,
    subjectCode: subject?.[1] ?? null,
  }) as unknown as MyAttendanceEntry

describe('counts / showedUp', () => {
  it('excludes exactly the two neutral statuses', () => {
    expect(counts('present')).toBe(true)
    expect(counts('late')).toBe(true)
    expect(counts('absent')).toBe(true)
    expect(counts('excused')).toBe(false)
    expect(counts('irregular')).toBe(false)
  })

  it('treats late as having shown up', () => {
    expect(showedUp('present')).toBe(true)
    expect(showedUp('late')).toBe(true)
    expect(showedUp('absent')).toBe(false)
    // Neutral rows never reach this question, but be explicit.
    expect(showedUp('excused')).toBe(false)
  })
})

describe('rateOf', () => {
  it('is present + late over present + late + absent', () => {
    expect(rateOf([rec('present'), rec('late'), rec('absent'), rec('absent')])).toBe(50)
    expect(rateOf([rec('present'), rec('present')])).toBe(100)
    expect(rateOf([rec('absent')])).toBe(0)
  })

  /** THE rule. An excuse must not cost a student anything. */
  it('keeps neutral statuses out of the denominator', () => {
    const withExcuses = [rec('present'), rec('excused'), rec('irregular'), rec('excused')]
    expect(rateOf(withExcuses)).toBe(100)
    expect(countedOf(withExcuses)).toBe(1)
  })

  it('is 0 rather than NaN when nothing counts yet', () => {
    expect(rateOf([])).toBe(0)
    expect(rateOf([rec('excused')])).toBe(0)
  })

  it('rounds to a whole percent', () => {
    // 2/3 = 66.67
    expect(rateOf([rec('present'), rec('present'), rec('absent')])).toBe(67)
  })
})

describe('tally', () => {
  it('reports counts, the neutral pair and the total separately', () => {
    const t = tally([
      rec('present'),
      rec('present'),
      rec('late'),
      rec('absent'),
      rec('excused'),
      rec('irregular'),
    ])
    expect(t.present).toBe(2)
    expect(t.late).toBe(1)
    expect(t.absent).toBe(1)
    expect(t.counted).toBe(4)
    expect(t.neutral).toBe(2)
    expect(t.total).toBe(6)
    expect(t.rate).toBe(75)
  })
})

describe('rateTone', () => {
  it('bands on the same thresholds the instructor sees', () => {
    expect(rateTone(100)).toBe('success')
    expect(rateTone(85)).toBe('success')
    expect(rateTone(84)).toBe('warn')
    expect(rateTone(70)).toBe('warn')
    expect(rateTone(69)).toBe('danger')
    expect(rateTone(0)).toBe('danger')
  })
})

describe('bySubject', () => {
  const IT = ['s1', 'IT 32'] as [string, string]
  const EL = ['s2', 'Elective 1'] as [string, string]

  it('splits the rate per subject rather than averaging them', () => {
    const rows = bySubject([
      rec('present', IT),
      rec('present', IT),
      rec('absent', EL),
      rec('present', EL),
    ])
    expect(rows.map((r) => [r.label, r.rate])).toEqual([
      ['Elective 1', 50],
      ['IT 32', 100],
    ])
  })

  /** Pre-subject sessions (0028) happened; they must not vanish. */
  it('keeps untagged sessions as their own labelled bucket', () => {
    const rows = bySubject([rec('present'), rec('absent'), rec('present', IT)])
    const untagged = rows.find((r) => r.key === '__untagged')
    expect(untagged?.label).toBe('Earlier classes')
    expect(untagged?.counted).toBe(2)
    expect(untagged?.rate).toBe(50)
  })

  it('drops a subject with nothing but neutral records', () => {
    const rows = bySubject([rec('excused', IT), rec('present', EL)])
    expect(rows.map((r) => r.label)).toEqual(['Elective 1'])
  })

  it('reports absences per subject for the detail line', () => {
    const rows = bySubject([rec('absent', IT), rec('absent', IT), rec('present', IT)])
    expect(rows[0].absent).toBe(2)
  })
})

describe('trailOf', () => {
  const at = (id: string, status: AttendanceStatus, day: number, hour = 8) =>
    ({
      recordId: id,
      status,
      startedAt: new Date(2026, 10, day, hour, 0).toISOString(),
    }) as unknown as MyAttendanceEntry

  it('returns the last n classes with the newest on the right', () => {
    const items = Array.from({ length: 14 }, (_, i) => at(`r${i}`, 'present', i + 1))
    const t = trailOf(items, 10)
    expect(t).toHaveLength(10)
    expect(t[0].recordId).toBe('r4')
    expect(t[9].recordId).toBe('r13')
  })

  it('is stable when two classes share a start time', () => {
    const a = at('b', 'present', 12)
    const b = at('a', 'absent', 12)
    expect(trailOf([a, b]).map((x) => x.recordId)).toEqual(['a', 'b'])
    expect(trailOf([b, a]).map((x) => x.recordId)).toEqual(['a', 'b'])
  })

  it('does not mutate what it is given', () => {
    const items = [at('r2', 'present', 5), at('r1', 'present', 3)]
    trailOf(items)
    expect(items.map((x) => x.recordId)).toEqual(['r2', 'r1'])
  })
})

describe('trailKind', () => {
  it('keeps excused and irregular neutral so they draw as a ring', () => {
    expect(trailKind('present')).toBe('present')
    expect(trailKind('late')).toBe('late')
    expect(trailKind('absent')).toBe('absent')
    expect(trailKind('excused')).toBe('neutral')
    expect(trailKind('irregular')).toBe('neutral')
  })
})

describe('excuseClosesLabel', () => {
  const started = new Date(2026, 10, 12, 18, 30).toISOString() // Nov 12, 6:30 PM
  const day = (d: number, h = 9) => new Date(2026, 10, d, h, 0).getTime()

  it('names the real date, not a count of days', () => {
    expect(excuseClosesLabel(started, day(14))).toBe('closes Nov 19')
    expect(excuseClosesLabel(started, day(13))).toBe('closes Nov 19')
  })

  it('says tomorrow and today at the edge', () => {
    expect(excuseClosesLabel(started, day(18))).toBe('closes tomorrow')
    expect(excuseClosesLabel(started, day(19, 9))).toBe('closes today')
  })

  it('says closed once the window has passed', () => {
    expect(excuseClosesLabel(started, day(20))).toBe('closed')
  })
})
