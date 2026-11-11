import { describe, expect, it } from 'vitest'
import {
  MIN_GAP_PX,
  SPEED_PX_PER_SEC,
  flightDurationMs,
  laneHoldMs,
  pickLane,
} from './danmaku'

/**
 * The load-bearing test here is `neverOverlap`.
 *
 * The old implementation reserved a lane using a GUESSED pill size, and the
 * guess was the entire anti-overlap guarantee. This simulates two pills sharing
 * a lane at the earliest moment the rules allow and asserts their boxes are
 * still disjoint — which is the property the guess was silently failing.
 *
 * ── AXIS-NEUTRAL SINCE THE COLUMN REWRITE (2026-11-08) ─────────────────────
 * Comments used to fly right-to-left across up to five horizontal lanes and
 * now rise in a single column. The arithmetic is unchanged, because the
 * guarantee was never about which axis was being measured — so the simulation
 * below talks about a TRACK and an EDGE, and the final block runs the same
 * proof with the vertical numbers the rising column actually produces.
 *
 * `laneCount` and its three tests went with that rewrite: it derived a number
 * of lanes from the viewport height, which only means something when lanes are
 * stacked vertically. One column needs no such answer, and a tested function
 * nothing calls is a test that can only ever pass.
 */

/**
 * The leading edge of a pill at time t, given it launched from the track's far
 * end at `launchedAt`.
 *
 * Horizontally that is the left edge travelling from `trackPx` toward 0;
 * vertically it is the top edge doing exactly the same thing. One function,
 * because it is one rule.
 */
function edgeAt(trackPx: number, launchedAt: number, t: number): number {
  return trackPx - ((t - launchedAt) / 1000) * SPEED_PX_PER_SEC
}

/**
 * Launch pill A at t=0, then pill B at the earliest instant the lane rules
 * permit. Walk the whole flight and return the smallest gap between them.
 *
 * `sizeA` / `sizeB` are measured on the axis of travel: widths for the old
 * horizontal stream, HEIGHTS for the rising column.
 */
const neverOverlap = (trackPx: number, sizeA: number, sizeB: number) => {
  const launchB = laneHoldMs(sizeA)
  const end = launchB + flightDurationMs(trackPx, sizeB)
  let minGap = Infinity
  for (let t = launchB; t <= end; t += 50) {
    const aEdge = edgeAt(trackPx, 0, t)
    const bEdge = edgeAt(trackPx, launchB, t)
    // B is behind A, so the gap is B's nose to A's tail.
    minGap = Math.min(minGap, bEdge - (aEdge + sizeA))
  }
  return minGap
}

describe('flightDurationMs', () => {
  it('covers the track plus the pill, so it enters and exits out of sight', () => {
    // 375 + 225 = 600px at 46px/s ≈ 13043ms
    expect(flightDurationMs(375, 225)).toBe(13043)
  })

  it('scales with distance at a constant speed', () => {
    const short = flightDurationMs(375, 100)
    const long = flightDurationMs(375, 300)
    expect(long).toBeGreaterThan(short)
    // Twice the extra size → twice the extra time.
    expect(long - short).toBe(flightDurationMs(0, 200) - flightDurationMs(0, 0))
  })

  it('is symmetric in its two arguments, which is why one axis is not special', () => {
    // The distance is a sum, so a 632px track with a 40px pill and a 40px
    // track with a 632px pill take the same time. That is the property that
    // let the rising column reuse this untouched.
    expect(flightDurationMs(632, 40)).toBe(flightDurationMs(40, 632))
  })
})

describe('laneHoldMs', () => {
  it('holds only until the tail plus the gap clears the entry point', () => {
    // (200 + 64) / 46 ≈ 5739ms
    expect(laneHoldMs(200)).toBe(5739)
  })

  /** The reason a lane keeps up: it frees long before the pill lands. */
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

  it('schedules a single column, which is what the rising stream uses', () => {
    // CommentsOverlay keeps `laneFreeAtRef` as an array of one so there is
    // still exactly one scheduler. Busy means busy; free means lane 0.
    expect(pickLane([0], 1000)).toBe(0)
    expect(pickLane([4000], 1000)).toBeNull()
  })
})

describe('two pills in one lane never overlap', () => {
  it('keeps at least the minimum gap for equal-size pills', () => {
    expect(neverOverlap(375, 200, 200)).toBeGreaterThanOrEqual(MIN_GAP_PX - 1)
  })

  it('holds when a small pill follows a large one', () => {
    expect(neverOverlap(375, 320, 90)).toBeGreaterThanOrEqual(MIN_GAP_PX - 1)
  })

  it('holds when a large pill follows a small one', () => {
    expect(neverOverlap(375, 90, 320)).toBeGreaterThanOrEqual(MIN_GAP_PX - 1)
  })

  it('holds on a desktop-width track', () => {
    expect(neverOverlap(1280, 260, 180)).toBeGreaterThanOrEqual(MIN_GAP_PX - 1)
  })
})

describe('the rising column (Era 8.0)', () => {
  /**
   * The same proof, with the numbers the vertical stream actually produces.
   *
   * The track is the viewport minus the header and the tab bar — 812 - 76 - 104
   * = 632 on the phone this app is designed for. Pill HEIGHTS: a one-line
   * comment measures about 40px, a three-line one (the `line-clamp-3` maximum,
   * and a comment can now be three lines because a tall pill in a column costs
   * nothing) about 78px.
   *
   * These are the cases where passing the pill's WIDTH instead of its height
   * would have been invisible in review and wrong on screen: a 300px-wide,
   * 40px-tall pill would hold the column almost eight times too long, and a
   * 90px-wide, 78px-tall one not long enough.
   */
  const TRACK = 632
  const ONE_LINE = 40
  const THREE_LINES = 78

  it('keeps the gap between two one-line comments', () => {
    expect(neverOverlap(TRACK, ONE_LINE, ONE_LINE)).toBeGreaterThanOrEqual(MIN_GAP_PX - 1)
  })

  it('keeps the gap when a three-line comment follows a one-line one', () => {
    expect(neverOverlap(TRACK, ONE_LINE, THREE_LINES)).toBeGreaterThanOrEqual(MIN_GAP_PX - 1)
  })

  it('keeps the gap when a one-line comment follows a three-line one', () => {
    expect(neverOverlap(TRACK, THREE_LINES, ONE_LINE)).toBeGreaterThanOrEqual(MIN_GAP_PX - 1)
  })

  it('keeps the gap on a short screen, where the track is barely taller than a pill', () => {
    // A landscape phone: 375 tall, so 375 - 76 - 104 = 195px of track. The
    // guarantee must not depend on the track being long.
    expect(neverOverlap(195, THREE_LINES, THREE_LINES)).toBeGreaterThanOrEqual(MIN_GAP_PX - 1)
  })

  it('reads slowly enough to be read, and clears fast enough to keep up', () => {
    // A pill crosses in ~14.6s, which is the "floating" pace the rising column
    // is for — the old horizontal flight was ~9s across a 375px deck.
    const flight = flightDurationMs(TRACK, ONE_LINE)
    expect(flight).toBeGreaterThan(12_000)
    expect(flight).toBeLessThan(18_000)

    // But the column frees in ~2.3s, so roughly six comments are in the air at
    // once and a class posting steadily is never throttled.
    const hold = laneHoldMs(ONE_LINE)
    expect(hold).toBeLessThan(3_000)
    expect(Math.floor(flight / hold)).toBeGreaterThanOrEqual(5)
  })
})
