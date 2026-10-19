import { describe, expect, it } from 'vitest'
import {
  formatScoreInput,
  isColumnPaste,
  isOverMax,
  parsePastedColumn,
  parseScoreInput,
  SCORE_MAX,
} from './grade-entry'

/**
 * Pins what the instructor can type into a cell, and what a paste turns into.
 *
 * The load-bearing one is "an empty cell is null, not zero". Clearing a cell
 * DELETES the row, which takes that item out of the student's in-progress
 * denominator; typing 0 stores a real mark that counts against them. If those
 * two ever collapse into each other, the "so far" figure stops being able to
 * tell a student who is behind from one who has not been marked — and nothing
 * on screen would look wrong.
 *
 * Second: a paste keeps interior blanks. A column copied out of Excel has a gap
 * exactly where a student was unmarked, and dropping those would shift every
 * score below the gap up a row — marks silently assigned to the wrong people.
 */

describe('parseScoreInput', () => {
  it('reads an empty cell as cleared, NOT as zero', () => {
    expect(parseScoreInput('')).toEqual({ ok: true, value: null })
    expect(parseScoreInput('   ')).toEqual({ ok: true, value: null })
  })

  it('reads a typed zero as a real mark', () => {
    expect(parseScoreInput('0')).toEqual({ ok: true, value: 0 })
  })

  it('accepts whole numbers and decimals', () => {
    expect(parseScoreInput('18')).toEqual({ ok: true, value: 18 })
    expect(parseScoreInput('18.5')).toEqual({ ok: true, value: 18.5 })
    expect(parseScoreInput('48.25')).toEqual({ ok: true, value: 48.25 })
    expect(parseScoreInput(' 35.58 ')).toEqual({ ok: true, value: 35.58 })
    expect(parseScoreInput('.5')).toEqual({ ok: true, value: 0.5 })
  })

  it('rejects what Number() would quietly accept', () => {
    // Every one of these parses to a number in JavaScript. '1e3' is the one
    // that matters: a typo'd exponent becoming 1000 on a quiz out of 20.
    for (const bad of ['1e3', '0x10', '-5', 'abc', '1,000', '12 5', '--1']) {
      expect(parseScoreInput(bad).ok, bad).toBe(false)
    }
  })

  it('rounds to the two decimals the column actually stores', () => {
    // numeric(6,2) would round this on the way in, and the cell would keep
    // showing 18.567 until the next reload.
    expect(parseScoreInput('18.567')).toEqual({ ok: true, value: 18.57 })
  })

  it('refuses a value the column cannot hold', () => {
    expect(parseScoreInput(String(SCORE_MAX)).ok).toBe(true)
    expect(parseScoreInput('10000').ok).toBe(false)
  })
})

describe('formatScoreInput', () => {
  it('writes a cleared cell as empty', () => {
    expect(formatScoreInput(null)).toBe('')
    expect(formatScoreInput(undefined)).toBe('')
  })

  it('does not pad a whole number with decimals', () => {
    // The grade figures want two decimals; a cell wants what was typed.
    expect(formatScoreInput(18)).toBe('18')
    expect(formatScoreInput(0)).toBe('0')
    expect(formatScoreInput(18.5)).toBe('18.5')
  })
})

describe('parsePastedColumn', () => {
  it('splits a column copied out of Excel', () => {
    expect(parsePastedColumn('18\n19\n20\n')).toEqual(['18', '19', '20'])
  })

  it('handles Windows and old Mac line endings', () => {
    expect(parsePastedColumn('18\r\n19\r\n')).toEqual(['18', '19'])
    expect(parsePastedColumn('18\r19')).toEqual(['18', '19'])
  })

  it('KEEPS an interior blank, because it means "clear this one"', () => {
    // Dropping it would shift every score below the gap up a row.
    expect(parsePastedColumn('18\n\n20\n')).toEqual(['18', '', '20'])
  })

  it('drops only the single trailing newline the copy itself added', () => {
    expect(parsePastedColumn('18\n19\n\n')).toEqual(['18', '19', ''])
  })

  it('takes only the first column of a block paste', () => {
    // Filling sideways would need to know which items the other columns belong
    // to, and guessing wrong writes marks into the wrong quiz.
    expect(parsePastedColumn('18\t9\n19\t10\n')).toEqual(['18', '19'])
  })

  it('treats a single cell as one value', () => {
    expect(parsePastedColumn('18')).toEqual(['18'])
    expect(parsePastedColumn('')).toEqual([])
  })
})

describe('isColumnPaste', () => {
  it('is false for an ordinary single value', () => {
    expect(isColumnPaste('18')).toBe(false)
    // Excel adds a trailing newline even to one cell — still not a column.
    expect(isColumnPaste('18\n')).toBe(false)
  })

  it('is true once there is more than one row', () => {
    expect(isColumnPaste('18\n19')).toBe(true)
    expect(isColumnPaste('18\n19\n')).toBe(true)
  })
})

describe('isOverMax', () => {
  it('flags a bonus mark without rejecting it', () => {
    expect(isOverMax(21, 20)).toBe(true)
    expect(isOverMax(20, 20)).toBe(false)
  })

  it('says nothing about a cleared cell', () => {
    expect(isOverMax(null, 20)).toBe(false)
  })
})
