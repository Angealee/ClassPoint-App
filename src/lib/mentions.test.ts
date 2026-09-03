import { describe, expect, it } from 'vitest'
import {resolveMentions, type MentionCandidate, mentionQuery, matchMentions, applyMention } from './mentions'

/**
 * The three load-bearing cases are the last three in the first block. Each one
 * fails by notifying the WRONG PERSON, which is the kind of bug nobody reports
 * as a bug — they just quietly stop trusting the feature.
 */

const roster: MentionCandidate[] = [
  { id: 'maria', displayName: 'Maria' },
  { id: 'maria-santos', displayName: 'Maria Santos' },
  { id: 'ann', displayName: 'Ann' },
  { id: 'anna', displayName: 'Anna' },
  { id: 'koby', displayName: 'Koby Angelo' },
]

describe('resolveMentions', () => {
  it('finds a simple mention', () => {
    expect(resolveMentions('hey @Ann can you send it', roster)).toEqual(['ann'])
  })

  it('is case-insensitive', () => {
    expect(resolveMentions('@ann pls', roster)).toEqual(['ann'])
    expect(resolveMentions('@ANN pls', roster)).toEqual(['ann'])
  })

  it('finds several, deduplicated', () => {
    const got = resolveMentions('@Ann and @Koby Angelo — also @Ann again', roster)
    expect(got.sort()).toEqual(['ann', 'koby'])
  })

  it('returns nothing when there is nothing to find', () => {
    expect(resolveMentions('no mentions here', roster)).toEqual([])
    expect(resolveMentions('', roster)).toEqual([])
    expect(resolveMentions('@Ann', [])).toEqual([])
  })

  // ── The three that matter ────────────────────────────────────────────────

  it('prefers the LONGEST name, not the first match', () => {
    // Scanning shortest-first matches "Maria" inside "@Maria Santos" and pings
    // the wrong person.
    expect(resolveMentions('thanks @Maria Santos!', roster)).toEqual(['maria-santos'])
  })

  it('does not mention anyone inside an email address', () => {
    expect(resolveMentions('mail me at koby@Maria.com', roster)).toEqual([])
    expect(resolveMentions('x@Ann.org', roster)).toEqual([])
  })

  it('does not match a name that runs into more letters', () => {
    // "@Anna" must not notify Ann.
    expect(resolveMentions('@Anna hello', roster)).toEqual(['anna'])
  })

  it('matches at the very start and the very end of a message', () => {
    expect(resolveMentions('@Ann', roster)).toEqual(['ann'])
    expect(resolveMentions('ping @Ann', roster)).toEqual(['ann'])
  })

  it('handles punctuation right after the name', () => {
    expect(resolveMentions('@Ann, you around?', roster)).toEqual(['ann'])
    expect(resolveMentions('(@Ann)', roster)).toEqual(['ann'])
  })

  it('does not blow up on a name with regex characters', () => {
    const odd: MentionCandidate[] = [{ id: 'x', displayName: 'A.B (C)' }]
    expect(resolveMentions('hi @A.B (C) there', odd)).toEqual(['x'])
    expect(resolveMentions('hi @AxB (C) there', odd)).toEqual([])
  })
})


describe('mentionQuery', () => {
  it('opens on a bare @ at the start and after a space', () => {
    expect(mentionQuery('@')).toEqual({ query: '', start: 0 })
    expect(mentionQuery('hey @ma')).toEqual({ query: 'ma', start: 4 })
  })

  it('does NOT open inside an email address', () => {
    expect(mentionQuery('koby@dct.edu.ph')).toBeNull()
  })

  it('allows one space, so a two-word name keeps matching', () => {
    expect(mentionQuery('@Maria S')?.query).toBe('Maria S')
    expect(mentionQuery('@Maria Santos said hi')).toBeNull()
  })

  it('closes on a second @ or a newline', () => {
    expect(mentionQuery('@a@b')).toBeNull()
    expect(mentionQuery('@a\nb')).toBeNull()
  })
})

describe('matchMentions', () => {
  const people = [
    { id: '1', displayName: 'Maria Santos' },
    { id: '2', displayName: 'Mario Cruz' },
    { id: '3', displayName: 'Ann' },
  ]

  it('ranks a prefix match above a mid-name one', () => {
    const got = matchMentions('ar', people)
    // "Maria"/"Mario" match at index 1; "Ann" does not match at all.
    expect(got.map((c) => c.displayName)).toEqual(['Maria Santos', 'Mario Cruz'])
  })

  it('returns everyone for an empty query', () => {
    expect(matchMentions('', people)).toHaveLength(3)
  })
})

describe('applyMention', () => {
  it('replaces the typed query and leaves a trailing space', () => {
    // The space is load-bearing: resolveMentions requires the name not to be
    // followed by a word character, so without it the mention would not resolve.
    const { value, caret } = applyMention('hey @mar', 4, 8, 'Maria Santos')
    expect(value).toBe('hey @Maria Santos ')
    expect(caret).toBe(value.length)
    expect(resolveMentions(value, [{ id: '1', displayName: 'Maria Santos' }])).toEqual(['1'])
  })

  it('keeps whatever followed the caret', () => {
    expect(applyMention('@ma tapos', 0, 3, 'Maria').value).toBe('@Maria  tapos')
  })
})
