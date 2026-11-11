import { describe, expect, it } from 'vitest'
import {
  SPACE_ACCESS_UNKNOWN,
  canPostNow,
  isMuted,
  spaceChip,
  type SpaceAccess,
} from './space-gate'

const NOW = Date.parse('2026-09-02T12:00:00Z')
const open = (over: Partial<SpaceAccess> = {}): SpaceAccess => ({
  state: 'open',
  canPost: true,
  timeoutUntil: null,
  timeoutReason: null,
  ...over,
})

describe('spaceChip', () => {
  it('labels each state distinctly', () => {
    expect(spaceChip('open').label).toBe('BETA')
    expect(spaceChip('paused').label).toBe('Paused')
    expect(spaceChip('locked').label).toBe('Soon')
  })

  it('uses warn for paused, never danger — the feature is coming back', () => {
    expect(spaceChip('paused').tone).toBe('warn')
    expect(spaceChip('open').tone).toBe('accent')
    expect(spaceChip('locked').tone).toBe('neutral')
  })
})

describe('canPostNow', () => {
  it('is false in every state but open', () => {
    expect(canPostNow(open({ state: 'paused' }), NOW)).toBe(false)
    expect(canPostNow(open({ state: 'locked' }), NOW)).toBe(false)
    expect(canPostNow(open(), NOW)).toBe(true)
  })

  it('honours a live mute even if the server said canPost', () => {
    const muted = open({
      canPost: true,
      timeoutUntil: new Date(NOW + 60 * 60 * 1000).toISOString(),
    })
    expect(canPostNow(muted, NOW)).toBe(false)
  })

  it('lets a lapsed mute expire without a refetch', () => {
    const lapsed = open({
      canPost: false, // what the server said an hour ago
      timeoutUntil: new Date(NOW - 1000).toISOString(),
    })
    expect(canPostNow(lapsed, NOW)).toBe(true)
  })

  it('treats the exact expiry instant as free', () => {
    const exact = open({ canPost: false, timeoutUntil: new Date(NOW).toISOString() })
    expect(canPostNow(exact, NOW)).toBe(true)
  })

  it('FAILS CLOSED on an unparseable timeout', () => {
    const corrupt = open({ canPost: false, timeoutUntil: 'not-a-date' })
    expect(canPostNow(corrupt, NOW)).toBe(false)
  })
})

describe('isMuted', () => {
  it('is true only when open AND blocked', () => {
    expect(isMuted(open(), NOW)).toBe(false)
    expect(
      isMuted(open({ timeoutUntil: new Date(NOW + 60_000).toISOString() }), NOW),
    ).toBe(true)
    expect(isMuted(open({ state: 'paused', canPost: false }), NOW)).toBe(false)
  })
})

describe('SPACE_ACCESS_UNKNOWN', () => {
  it('defaults to locked so the nav never flashes a BETA chip it must retract', () => {
    expect(SPACE_ACCESS_UNKNOWN.state).toBe('locked')
    expect(canPostNow(SPACE_ACCESS_UNKNOWN, NOW)).toBe(false)
    expect(spaceChip(SPACE_ACCESS_UNKNOWN.state).label).toBe('Soon')
  })
})
