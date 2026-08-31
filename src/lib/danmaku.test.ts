import { describe, expect, it } from 'vitest'
import {
  MIN_GAP_PX,
  SPEED_PX_PER_SEC,
  flightDurationMs,
  laneCount,
  laneHoldMs,
  pickLane,
} from './danmaku'

/**
 * The load-bearing test here is `neverOverlap`.
 *
 * The old implementation reserved a lane using a GUESSED pill width, and the
 * guess was the entire anti-overlap guarantee. This simulates two pills sharing
 * a lane at the earliest moment the rules allow and asserts their boxes are
 * still disjoint — which is the property the guess was silently failing.
 */

/** Left edge of a pill at time t, given it launched from `deckWidth` at t=0. */
function leftEdgeAt(deckWidth: number, launchedAt: number, t: number): number {
  return deckWidth - ((t - launchedAt) / 1000) * SPEED_PX_PER_SEC
}

describe('flightDurationMs', () => {
  it('covers the deck plus the pill, so it enters and exits off-screen', () => {
    // 375 + 225 = 600px at 46px/s ≈ 13043ms
    expect(flightDurationMs(375, 225)).toBe(13043)
  })

  it('scales with distance at a constant speed', () => {
    const short = flightDurationMs(375, 100)
    const long = flightDurationMs(375, 300)
    expect(long).toBeGreaterThan(short)
    // Twice the extra width → twice the extra time.
    expect(long - short).toBe(flightDurationMs(0, 200) - flightDurationMs(0, 0))
  })
})

describe('laneHoldMs', () => {
  it('holds only until the tail plus the gap clears the entry point', () => {
    // (200 + 64) / 46 ≈ 5739ms
    expect(laneHoldMs(200)).toBe(5739)
  })

  /** The reason several lanes can keep up: a lane frees long before the pill lands. */
  it('is far shorter than the full crossing', () => {
    expect(laneHoldMs(200)).toBeLessThan(flightDurationMs(375, 200) / 2)
  })
})

describe('pickLane', () => {
  it('returns the lane free longest, not the first free one', () => {
    // lane 2 has been free since t=100, lane 0 since t=900.
    expect(pickLane([900, 5000, 100], 1000)).toBe(2)
  })

  it('returns null when every lane is still busy', () => {
    expect(pickLane([2000, 3000, 2500], 1000)).toBeNull()
  })

  it('treats a lane free exactly now as available', () => {
    expect(pickLane([1000], 1000)).toBe(0)
  })

  it('is null with no lanes at all', () => {
    expect(pickLane([], 1000)).toBeNull()
  })
})

describe('two pills in one lane never overlap', () => {
  /**
   * Launch pill A at t=0, then pill B at the earliest instant the lane rules
   * permit. Walk the whole flight and assert the boxes stay disjoint.
   */
  const neverOverlap = (deckWidth: number, widthA: number, widthB: number) => {
    const launchB = laneHoldMs(widthA)
    const end = launchB + flightDurationMs(deckWidth, widthB)
    let minGap = Infinity
    for (let t = launchB; t <= end; t += 50) {
      const aLeft = leftEdgeAt(deckWidth, 0, t)
      const bLeft = leftEdgeAt(deckWidth, launchB, t)
      // B is behind A, so the gap is B's nose to A's tail.
      minGap = Math.min(minGap, bLeft - (aLeft + widthA))
    }
    return minGap
  }

  it('keeps at least the minimum gap for equal-width pills', () => {
    expect(neverOverlap(375, 200, 200)).toBeGreaterThanOrEqual(MIN_GAP_PX - 1)
  })

  it('holds when a narrow pill follows a wide one', () => {
    expect(neverOverlap(375, 320, 90)).toBeGreaterThanOrEqual(MIN_GAP_PX - 1)
  })

  it('holds when a wide pill follows a narrow one', () => {
    expect(neverOverlap(375, 90, 320)).toBeGreaterThanOrEqual(MIN_GAP_PX - 1)
  })

  it('holds on a desktop-width deck', () => {
    expect(neverOverlap(1280, 260, 180)).toBeGreaterThanOrEqual(MIN_GAP_PX - 1)
  })
})

describe('laneCount', () => {
  /** 812 - 76 - 104 = 632 usable; 632 / 90 = 7 lanes, capped at 5. */
  it('caps lanes on a tall phone', () => {
    expect(laneCount(812, 76, 104, 90, 5)).toBe(5)
  })

  it('fits fewer lanes on a short screen', () => {
    // 500 - 76 - 104 = 320; 320 / 90 = 3.
    expect(laneCount(500, 76, 104, 90, 5)).toBe(3)
  })

  /** Never zero — a cramped screen still shows one lane rather than nothing. */
  it('always yields at least one lane', () => {
    expect(laneCount(200, 76, 104, 90, 5)).toBe(1)
    expect(laneCount(0, 76, 104, 90, 5)).toBe(1)
  })
})
