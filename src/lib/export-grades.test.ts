import { describe, expect, it } from 'vitest'
import { buildOverallSheet, buildTermSheet } from './export-grades'
import { cellKey, defaultPolicy } from './grading'
import type { GradeItem, GradePolicy, GradeSumsRow, RosterPerson, TermKey, TermSums } from './types'

/**
 * Pins the two rules the exported workbook has to obey.
 *
 * **An unmarked cell is BLANK, never 0.** A spreadsheet 0 gets averaged as one,
 * so writing zeros would turn "not marked yet" into a real mark the instant
 * anyone put `=AVERAGE()` under the column — and the whole blank-versus-zero
 * distinction this feature rests on would be destroyed on the way out of the
 * app. Same rule `export-peer.ts` follows for an unrated student.
 *
 * **Computed figures go out UNROUNDED.** The app shows two decimals, but a
 * spreadsheet is where people re-check arithmetic; rounding on the way out
 * means a hand-recomputed total disagrees with the column beside it. Excel can
 * format what it is given and cannot recover precision thrown away.
 */

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
  }) satisfies GradeItem

describe('buildTermSheet', () => {
  const items = [item('q1', 'Quiz 1', 20), item('q2', 'Quiz 2', 20)]

  it('writes an unmarked cell as BLANK, not zero', () => {
    // Ana sat Quiz 1 and scored nothing; Quiz 2 has not been marked for her.
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
    // An archived item is out of the denominator, so it must not appear as a
    // column either — a header with no bearing on the grade beside it.
    const withArchived = [...items, item('q3', 'Quiz 3', 60, '2026-10-01T00:00:00Z')]
    const rows = buildTermSheet(students, withArchived, new Map(), policy)
    expect(rows[0]).not.toContain('Quiz 3')
  })

  it('writes computed figures unrounded', () => {
    // 7/40 → (0.175 * 0.4 + 0.6) * 100 = 67.00000000000001 in IEEE754. The
    // point is not the artefact — it is that nothing rounded on the way out.
    const scores = new Map([
      [cellKey('q1', 's1'), 7],
      [cellKey('q2', 's1'), 0],
    ])
    const rows = buildTermSheet(students, items, scores, policy)
    const quizScore = rows[2][1 + items.length + 1] as number // Quizzes column

    expect(typeof quizScore).toBe('number')
    expect(quizScore).toBeCloseTo(67, 10)
    // A rounded export would be exactly 67; an unrounded one carries the full
    // double. Either way it must NOT be a pre-formatted string.
    expect(String(quizScore)).not.toMatch(/^"?67\.00"?$/)
  })

  it('writes a withheld term grade as blank', () => {
    // No items at all → termGrade is null, and a grade column must stay empty
    // rather than carrying a number nobody computed.
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
    // The spreadsheet bug, at the point it would leave the app: writing a
    // number here is the lie; writing "No Midterm" into the grade column would
    // put text where every downstream formula expects a number.
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
