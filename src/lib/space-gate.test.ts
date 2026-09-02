import { describe, expect, it } from 'vitest'
import {
  SPACE_ACCESS_UNKNOWN,
  canPostNow,
  isMuted,
  spaceChip,
  type SpaceAccess,
} from './space-gate'

/**
 * Pure-logic, no mocking — in the spirit of the other suites beside `qr`,
 * `term`, `leveling`, `offline-scans`, `attendance` and `danmaku`.
 *
 * The load-bearing case is the LAST one: an unparseable `timeout_until` must
 * leave the student muted. Every other branch here fails visibly; that one
 * would fail by silently handing posting rights to someone who was muted.
 */

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
      canPost: true, // stale — the server answered before the mute landed
      timeoutUntil: new Date(NOW + 60 * 60 * 1000).toISOString(),
    })
    expect(canPostNow(muted, NOW)).toBe(false)
  })

  it('lets a lapsed mute expire without a refetch', () => {
    // The whole reason this is not just `access.canPost`: a one-hour timeout
    // handed out at 09:00 must stop biting at 10:00 with the app still open.
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
    // NaN <= now is false, so the student stays muted. If this ever inverts,
    // a corrupt timestamp hands posting rights to someone who was muted —
    // the one failure here that would not be noticed.
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
    // Paused is not "muted" — the student is not being disciplined, and
    // telling them they are would be a lie with a real sting.
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
