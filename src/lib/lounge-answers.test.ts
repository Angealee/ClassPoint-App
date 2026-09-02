import { describe, expect, it } from 'vitest'
import { isCorrectAnswer, normalizeAnswer, pickWinners } from './lounge-answers'

/**
 * ⚠ THE MOST IMPORTANT TEST IN THE RANDOM EVENTS FEATURE.
 *
 * `normalizeAnswer` here and `cp_event_normalize()` in migration 0045 must
 * agree exactly. The instructor previews who would win; the database pays. A
 * drift makes the preview a lie about real points.
 *
 * Every case below was written by reading the SQL, not by reading the TypeScript
 * — the point is to catch the TypeScript disagreeing with it.
 */

describe('normalizeAnswer — mirrors cp_event_normalize', () => {
  it('folds case', () => {
    expect(normalizeAnswer('Polymorphism')).toBe('polymorphism')
    expect(normalizeAnswer('POLYMORPHISM')).toBe('polymorphism')
  })

  it('strips punctuation entirely, it does not replace it with a space', () => {
    // The SQL removes `[^a-z0-9 ]` — so a hyphen VANISHES and the halves join.
    // Replacing it with a space instead would make "run-time" normalise to
    // "run time" here and "runtime" in the database.
    expect(normalizeAnswer('Run-time polymorphism.')).toBe('runtime polymorphism')
    expect(normalizeAnswer('a.b,c!')).toBe('abc')
  })

  it('collapses runs of whitespace and trims the ends', () => {
    expect(normalizeAnswer('  two   words  ')).toBe('two words')
  })

  it('treats a newline as punctuation, not as a space', () => {
    // Same reasoning: \n is not in [a-z0-9 ], so it is stripped, joining the
    // words. Both sides agree, which is what matters.
    expect(normalizeAnswer('a\nb')).toBe('ab')
  })

  it('drops accents and non-latin characters', () => {
    expect(normalizeAnswer('café')).toBe('caf')
    expect(normalizeAnswer('答え 42')).toBe('42')
  })

  it('keeps digits', () => {
    expect(normalizeAnswer('Answer 42')).toBe('answer 42')
  })

  it('handles null and empty safely', () => {
    expect(normalizeAnswer(null)).toBe('')
    expect(normalizeAnswer(undefined)).toBe('')
    expect(normalizeAnswer('   ')).toBe('')
    expect(normalizeAnswer('!!!')).toBe('')
  })
})

describe('isCorrectAnswer', () => {
  it('matches across case, spacing and punctuation', () => {
    expect(isCorrectAnswer('  Run-Time  Polymorphism! ', 'runtime polymorphism')).toBe(true)
  })

  it('rejects a near miss', () => {
    expect(isCorrectAnswer('polymorphism', 'runtime polymorphism')).toBe(false)
  })

  it('an EMPTY key matches nothing', () => {
    // Without this guard a blank key normalises to '' and pays everyone who
    // submitted whitespace — the whole class, silently.
    expect(isCorrectAnswer('', '')).toBe(false)
    expect(isCorrectAnswer('anything', '   ')).toBe(false)
    expect(isCorrectAnswer('!!!', '???')).toBe(false)
  })
})

describe('pickWinners', () => {
  const A = (id: string, body: string, t: string) => ({ id, body, createdAt: t })
  const key = 'polymorphism'

  it('pays the first N correct, in submission order', () => {
    const answers = [
      A('c', 'wrong', '2026-09-02T10:00:03Z'),
      A('a', 'Polymorphism', '2026-09-02T10:00:01Z'),
      A('b', 'poly-morphism', '2026-09-02T10:00:02Z'),
      A('d', 'POLYMORPHISM!', '2026-09-02T10:00:04Z'),
    ]
    // 'poly-morphism' normalises to 'polymorphism' — the hyphen vanishes.
    expect(pickWinners(answers, key, 2).map((x) => x.id)).toEqual(['a', 'b'])
  })

  it('respects the cap', () => {
    const answers = [
      A('a', 'polymorphism', '2026-09-02T10:00:01Z'),
      A('b', 'polymorphism', '2026-09-02T10:00:02Z'),
      A('c', 'polymorphism', '2026-09-02T10:00:03Z'),
    ]
    expect(pickWinners(answers, key, 1).map((x) => x.id)).toEqual(['a'])
    expect(pickWinners(answers, key, 10).map((x) => x.id)).toEqual(['a', 'b', 'c'])
    expect(pickWinners(answers, key, 0)).toEqual([])
  })

  it('breaks an identical timestamp by id, like the SQL does', () => {
    // `order by created_at, id` in 0045. Without the id tiebreak two answers in
    // the same millisecond could rank differently here than in the database,
    // which is exactly how the preview starts lying.
    const same = '2026-09-02T10:00:00Z'
    const answers = [A('zzz', 'polymorphism', same), A('aaa', 'polymorphism', same)]
    expect(pickWinners(answers, key, 1).map((x) => x.id)).toEqual(['aaa'])
  })

  it('pays nobody for an open-ended event', () => {
    const answers = [A('a', 'anything', '2026-09-02T10:00:01Z')]
    expect(pickWinners(answers, null, 5)).toEqual([])
  })

  it('does not mutate the input order', () => {
    const answers = [
      A('b', 'polymorphism', '2026-09-02T10:00:02Z'),
      A('a', 'polymorphism', '2026-09-02T10:00:01Z'),
    ]
    pickWinners(answers, key, 5)
    expect(answers.map((x) => x.id)).toEqual(['b', 'a'])
  })
})
