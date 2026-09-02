import { describe, expect, it } from 'vitest'
import { resolveMentions, type MentionCandidate } from './mentions'

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

