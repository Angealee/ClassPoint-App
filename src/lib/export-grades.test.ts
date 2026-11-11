import { describe, expect, it } from 'vitest'
import { buildOverallSheet, buildTermSheet } from './export-grades'
import { cellKey, defaultPolicy } from './grading'
import type { GradeItem, GradePolicy, GradeSumsRow, RosterPerson, TermKey, TermSums } from './types'

const policy = defaultPolicy('sub', 'finals')

const students: RosterPerson[] = [
  { id: 's1', fullName: 'Ana', displayName: 'Ana', avatarUrl: null },
  { id: 's2', fullName: 'Ben', displayName: 'Ben', avatarUrl: null },
]

const item = (id: string, name: string, maxScore: number, archivedAt: string | null = null) =>
  ({
    id,
    sectionId: 'sec',
    subjectId: 'sub',
    term: 'finals' as const,
    component: 'quiz' as const,
    name,
    maxScore,
    position: 0,
    archivedAt,
    assistOff: false,
    sessionId: null,
  }) satisfies GradeItem

describe('buildTermSheet', () => {
  const items = [item('q1', 'Quiz 1', 20), item('q2', 'Quiz 2', 20)]

  it('writes an unmarked cell as BLANK, not zero', () => {
    const scores = new Map([[cellKey('q1', 's1'), 0]])
    const rows = buildTermSheet(students, items, scores, policy)
    const ana = rows[2]

    expect(ana[0]).toBe('Ana')
    expect(ana[1]).toBe(0) // a real mark survives as a real zero
    expect(ana[2]).toBe('') // not marked — blank, never 0
  })

  it('carries two header rows: names, then what each is out of', () => {
    const rows = buildTermSheet(students, items, new Map(), policy)
    expect(rows[0].slice(0, 3)).toEqual(['Student', 'Quiz 1', 'Quiz 2'])
    expect(rows[1].slice(0, 3)).toEqual(['Out of', 20, 20])
  })

  it('leaves archived columns out entirely', () => {
    const withArchived = [...items, item('q3', 'Quiz 3', 60, '2026-10-01T00:00:00Z')]
    const rows = buildTermSheet(students, withArchived, new Map(), policy)
    expect(rows[0]).not.toContain('Quiz 3')
  })

  it('writes computed figures unrounded', () => {
    const scores = new Map([
      [cellKey('q1', 's1'), 7],
      [cellKey('q2', 's1'), 0],
    ])
    const rows = buildTermSheet(students, items, scores, policy)
    const quizScore = rows[2][1 + items.length + 1] as number // Quizzes column

    expect(typeof quizScore).toBe('number')
    expect(quizScore).toBeCloseTo(67, 10)
    expect(String(quizScore)).not.toMatch(/^"?67\.00"?$/)
  })

  it('writes a withheld term grade as blank', () => {
    const rows = buildTermSheet(students, [], new Map(), policy)
    expect(rows[2][rows[2].length - 1]).toBe('')
  })
})

describe('buildOverallSheet', () => {
  const all: GradePolicy[] = (['prelim', 'midterm', 'finals'] as TermKey[]).map((t) =>
    defaultPolicy('sub', t),
  )

  function sums(fraction: number): TermSums {
    const p = { sumScore: 100 * fraction, sumMax: 100, sumMaxMarked: 100 }
    return {
      performance_task: { ...p },
      quiz: { ...p },
      recitation: { ...p },
      exam: { ...p },
    }
  }

  const rowsFor = (id: string, name: string, terms: TermKey[]): GradeSumsRow[] =>
    terms.map((term) => ({ studentId: id, fullName: name, term, sums: sums(1) }))

  it('puts the term weights in their own header row', () => {
    const sheet = buildOverallSheet(rowsFor('s1', 'Ana', ['prelim', 'midterm', 'finals']), all)
    expect(sheet[0]).toEqual(['Student', 'Prelim', 'Midterm', 'Finals', 'Final Grade', 'Note'])
    expect(sheet[1]).toEqual(['Weight', 0.3, 0.3, 0.4, '', ''])
  })

  it('leaves a withheld final BLANK and names the missing term in a Note column', () => {
    const sheet = buildOverallSheet(rowsFor('s1', 'Ana', ['prelim', 'finals']), all)
    const ana = sheet[2]

    expect(ana[2]).toBe('') // Midterm
    expect(ana[4]).toBe('') // Final Grade — blank, not 70
    expect(ana[5]).toBe('No Midterm')
  })

  it('writes a complete final with no note', () => {
    const sheet = buildOverallSheet(rowsFor('s1', 'Ana', ['prelim', 'midterm', 'finals']), all)
    expect(sheet[2][4]).toBe(100)
    expect(sheet[2][5]).toBe('')
  })

  it('sorts by name', () => {
    const sheet = buildOverallSheet(
      [
        ...rowsFor('s2', 'Ben', ['prelim', 'midterm', 'finals']),
        ...rowsFor('s1', 'Ana', ['prelim', 'midterm', 'finals']),
      ],
      all,
    )
    expect(sheet.slice(2).map((r) => r[0])).toEqual(['Ana', 'Ben'])
  })
})
