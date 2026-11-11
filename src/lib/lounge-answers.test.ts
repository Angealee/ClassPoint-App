import { describe, expect, it } from 'vitest'
import { isCorrectAnswer, normalizeAnswer, pickWinners } from './lounge-answers'

describe('normalizeAnswer — mirrors cp_event_normalize', () => {
  it('folds case', () => {
    expect(normalizeAnswer('Polymorphism')).toBe('polymorphism')
    expect(normalizeAnswer('POLYMORPHISM')).toBe('polymorphism')
  })

  it('strips punctuation entirely, it does not replace it with a space', () => {
    expect(normalizeAnswer('Run-time polymorphism.')).toBe('runtime polymorphism')
    expect(normalizeAnswer('a.b,c!')).toBe('abc')
  })

  it('collapses runs of whitespace and trims the ends', () => {
    expect(normalizeAnswer('  two   words  ')).toBe('two words')
  })

  it('treats a newline as punctuation, not as a space', () => {
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
