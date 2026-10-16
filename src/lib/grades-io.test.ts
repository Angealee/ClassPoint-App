import { describe, expect, it } from 'vitest'
import { collectRows, columnLabel, detectStructure, type ParsedSheet } from './grades-io'

/**
 * Pins the spreadsheet reader against the instructor's real layout.
 *
 * The load-bearing test is **"a component with no marks yields null, not 0"**.
 * Importing a zero there would record every student as having scored nothing
 * in that component — which the official grade then counts, dragging a whole
 * class down with marks nobody ever gave. It is also the one failure that
 * looks completely ordinary on screen afterwards.
 *
 * The detection itself is only ever a SUGGESTION: one inserted column shifts
 * every range, so the importer shows what it found beside the real header text
 * and writes nothing until a person confirms it.
 */

/** The shape of the instructor's Finals sheet, trimmed to three items each. */
function instructorSheet(): ParsedSheet {
  //            0    1(B name)  2  3  4 (C:E perf)  5  6  7 (F:H quiz)  8 (I exam)
  const rows: string[][] = [
    ['', '', 'Performance Tasks (50%)', '', '', 'Quizzes', '', '', 'EXAM'],
    ['', 'FULL NAME', '50', '', '', '100', '', '', '50'],
    ['', 'Dela Cruz, Juan', '20', '10', '7.5', '40', '30', '27', '34'],
    ['', 'Santos, Maria', '', '', '', '50', '25', '25', ''],
  ]
  return {
    name: 'Finals',
    rows,
    merges: [
      { r1: 0, c1: 2, r2: 0, c2: 4 }, // Performance Tasks spans C:E
      { r1: 0, c1: 5, r2: 0, c2: 7 }, // Quizzes spans F:H
    ],
  }
}

describe('detectStructure', () => {
  const s = detectStructure(instructorSheet())

  it('finds the name column by its text, not its position', () => {
    expect(s.nameColumn).toBe(1)
  })

  it('finds the totals row above the first student', () => {
    expect(s.totalRow).toBe(1)
    expect(s.firstDataRow).toBe(2)
  })

  it('reads component ranges from the merged group headers', () => {
    expect(s.components.performance_task.range).toEqual({ from: 2, to: 4 })
    expect(s.components.quiz.range).toEqual({ from: 5, to: 7 })
  })

  it('picks up a single unmerged header, which is how the exam is written', () => {
    expect(s.components.exam.range).toEqual({ from: 8, to: 8 })
  })

  it('suggests each total from the totals row', () => {
    expect(s.components.performance_task.total).toBe(50)
    expect(s.components.quiz.total).toBe(100)
    expect(s.components.exam.total).toBe(50)
  })

  it('leaves a component the sheet never mentions empty', () => {
    // Recitation is absent here — it must come back unset rather than guessed
    // onto whatever columns happen to be free.
    expect(s.components.recitation.range).toBeNull()
    expect(s.components.recitation.total).toBeNull()
  })
})

describe('collectRows', () => {
  const sheet = instructorSheet()
  const rows = collectRows(sheet, detectStructure(sheet))

  it('sums each component across its range', () => {
    // 20 + 10 + 7.5 = 37.5, the value the instructor's own sheet carries.
    expect(rows[0].rawName).toBe('Dela Cruz, Juan')
    expect(rows[0].totals.performance_task).toBe(37.5)
    expect(rows[0].totals.quiz).toBe(97)
    expect(rows[0].totals.exam).toBe(34)
  })

  it('yields NULL for a component with no marks at all, never 0', () => {
    // Maria has no performance tasks and no exam. Importing zeros would record
    // marks nobody gave, and the official grade counts them.
    expect(rows[1].rawName).toBe('Santos, Maria')
    expect(rows[1].totals.performance_task).toBeNull()
    expect(rows[1].totals.exam).toBeNull()
    expect(rows[1].totals.quiz).toBe(100)
  })

  it('yields null for a component with no range', () => {
    expect(rows[0].totals.recitation).toBeNull()
  })

  it('skips rows with no name', () => {
    const withBlank: ParsedSheet = {
      ...sheet,
      rows: [...sheet.rows, ['', '', '', '', '', '', '', '', '']],
    }
    expect(collectRows(withBlank, detectStructure(sheet))).toHaveLength(2)
  })

  it('keeps the header row out of the body', () => {
    expect(rows.map((r) => r.rawName)).not.toContain('FULL NAME')
  })
})

describe('columnLabel', () => {
  it('writes ranges the way the spreadsheet does', () => {
    expect(columnLabel(0)).toBe('A')
    expect(columnLabel(25)).toBe('Z')
    expect(columnLabel(26)).toBe('AA')
    expect(columnLabel(27)).toBe('AB')
  })
})
