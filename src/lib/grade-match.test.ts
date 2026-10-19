import { describe, expect, it } from 'vitest'
import { coreKey, exactKey, isLikelyHeading, matchRows, nameTokens } from './grade-match'
import type { MatchCandidate, SheetRow } from './grade-match'

/**
 * Pins the spreadsheet-to-roster matcher.
 *
 * This is the riskiest code in the grades feature: everything else fails
 * loudly, and a mis-matched name writes a whole class's marks onto the wrong
 * person with nothing looking broken.
 *
 * Two load-bearing rules. **Nothing is ever auto-resolved when the answer is
 * not certain** — a name matching two students comes back ambiguous even when
 * one of them is "obviously" right, because `students.full_name` has no unique
 * constraint and two real people can share one. And **an initial is never
 * treated as noise**: "Juan P. Dela Cruz" and "Juan R. Dela Cruz" are two
 * people whose only distinguishing mark is that letter, so dropping it
 * downgrades a match to fuzzy and a collision to ambiguous.
 */

const app = (id: string, fullName: string): MatchCandidate => ({ studentId: id, fullName })
const sheet = (names: string[]): SheetRow[] =>
  names.map((rawName, index) => ({ index, rawName }))

const bucketOf = (report: ReturnType<typeof matchRows>, raw: string) =>
  report.rows.find((r) => r.row.rawName === raw)?.bucket

describe('nameTokens', () => {
  it('is order-independent, which kills "Last, First" outright', () => {
    expect(nameTokens('Dela Cruz, Juan')).toEqual(nameTokens('Juan Dela Cruz'))
  })

  it('joins particles so registrar spacing stops mattering', () => {
    // The most likely real mismatch in this roster.
    expect(nameTokens('De La Cruz, Juan')).toEqual(nameTokens('Juan Dela Cruz'))
    expect(nameTokens('Juan delos Santos')).toEqual(nameTokens('Delos Santos, Juan'))
  })

  it('folds accents', () => {
    expect(nameTokens('Peña, Maria')).toEqual(nameTokens('Maria Pena'))
  })

  it('drops generational suffixes', () => {
    expect(nameTokens('Juan Santos Jr.')).toEqual(nameTokens('Santos, Juan'))
  })

  it('keeps an initial as its own token', () => {
    expect(nameTokens('Juan P. Dela Cruz')).toContain('p')
  })
})

describe('exact matching', () => {
  const students = [app('s1', 'Dela Cruz, Juan'), app('s2', 'Santos, Maria Cristina')]

  it('matches across name order and particle spacing', () => {
    const report = matchRows(sheet(['Juan Dela Cruz', 'De La Cruz, Juan']), students)
    expect(bucketOf(report, 'Juan Dela Cruz')).toBe('exact')
    expect(bucketOf(report, 'De La Cruz, Juan')).toBe('exact')
  })

  it('does not match a name carrying an extra word', () => {
    // "(LOA)" becomes a token, so the sets differ and the row is surfaced
    // rather than quietly attached to the nearest person.
    const report = matchRows(sheet(['Juan Dela Cruz (LOA)']), students)
    expect(bucketOf(report, 'Juan Dela Cruz (LOA)')).toBe('unmatched')
  })
})

describe('ambiguity is never resolved', () => {
  it('reports two identically-named students rather than picking one', () => {
    // Two real people can share a name — the schema permits it today.
    const students = [app('s1', 'Juan Dela Cruz'), app('s2', 'Juan Dela Cruz')]
    const report = matchRows(sheet(['Juan Dela Cruz']), students)
    const row = report.rows[0]

    expect(row.bucket).toBe('ambiguous')
    expect(row.candidates).toHaveLength(2)
  })

  it('reports a bare name that two initials could both be', () => {
    // The sheet says "Juan Dela Cruz"; the app has a P. and an R. Dropping the
    // initial makes both plausible, and guessing would be a coin flip on whose
    // grades these are.
    const students = [app('s1', 'Juan P. Dela Cruz'), app('s2', 'Juan R. Dela Cruz')]
    const report = matchRows(sheet(['Juan Dela Cruz']), students)

    expect(report.rows[0].bucket).toBe('ambiguous')
    expect(report.rows[0].candidates.map((c) => c.studentId).sort()).toEqual(['s1', 's2'])
  })
})

describe('fuzzy is a suggestion, never a match', () => {
  it('downgrades a name that differs only by an initial', () => {
    const students = [app('s1', 'Juan Dela Cruz')]
    const report = matchRows(sheet(['Juan P. Dela Cruz']), students)

    expect(report.rows[0].bucket).toBe('fuzzy')
    expect(report.rows[0].candidates[0].studentId).toBe('s1')
  })

  it('leaves the student in "missing from sheet", because fuzzy is not covered', () => {
    // A fuzzy row might be rejected by the instructor, so the student is still
    // at risk of getting no marks — and this list exists to catch exactly that.
    const students = [app('s1', 'Juan Dela Cruz')]
    const report = matchRows(sheet(['Juan P. Dela Cruz']), students)
    expect(report.missingFromSheet.map((s) => s.studentId)).toEqual(['s1'])
  })
})

describe('rows that are not people', () => {
  it('skips headings, totals and blanks instead of calling them unmatched', () => {
    const report = matchRows(
      sheet(['FULL NAME', 'TOTAL', '   ', 'Juan Dela Cruz']),
      [app('s1', 'Juan Dela Cruz')],
    )
    expect(report.skipped.map((r) => r.rawName)).toEqual(['FULL NAME', 'TOTAL', '   '])
    expect(report.rows).toHaveLength(1)
  })

  it('does not skip a real name that merely contains a heading word', () => {
    // "Student" alone is a heading; "Maria Student" is a person's row.
    expect(isLikelyHeading('Student')).toBe(true)
    expect(isLikelyHeading('Maria Student')).toBe(false)
  })
})

describe('missingFromSheet', () => {
  it('names the students the sheet never mentions', () => {
    const students = [app('s1', 'Juan Dela Cruz'), app('s2', 'Maria Santos')]
    const report = matchRows(sheet(['Juan Dela Cruz']), students)
    expect(report.missingFromSheet.map((s) => s.fullName)).toEqual(['Maria Santos'])
  })

  it('is empty when every student is matched exactly', () => {
    const students = [app('s1', 'Juan Dela Cruz')]
    const report = matchRows(sheet(['Dela Cruz, Juan']), students)
    expect(report.missingFromSheet).toEqual([])
  })
})

describe('keys', () => {
  it('coreKey drops initials and exactKey keeps them', () => {
    expect(exactKey('Juan P. Dela Cruz')).not.toBe(exactKey('Juan Dela Cruz'))
    expect(coreKey('Juan P. Dela Cruz')).toBe(coreKey('Juan Dela Cruz'))
  })
})
