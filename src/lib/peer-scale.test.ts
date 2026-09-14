import { describe, expect, it } from 'vitest'
import {
  SCALE_PRESETS,
  describeOption,
  isOnScale,
  normalizeScale,
  percentOf,
  roundTo,
  scaleError,
} from './peer-scale'
import type { PeerScaleOption } from './types'

/**
 * These pin the client half of `cp_peer_scale_clean()` (migration 0050).
 *
 * The load-bearing one is `isOnScale`: a range check would accept 2 on a scale
 * of 1/3/5, and the whole point of a per-criterion custom scale is that the
 * gaps are real. If this test and the SQL ever disagree, the composer and the
 * submit RPC disagree about what a valid rating is.
 */

const ok = (scale: PeerScaleOption[]) => scaleError(scale)

describe('scaleError', () => {
  it('accepts every preset the composer offers', () => {
    for (const p of SCALE_PRESETS) {
      expect(ok(p.scale), p.key).toBeNull()
    }
  })

  it('rejects fewer than two options', () => {
    expect(ok([{ value: 1, label: 'Only' }])).toMatch(/between 2 and 10/)
  })

  it('rejects more than ten options', () => {
    const eleven = Array.from({ length: 11 }, (_, i) => ({ value: i, label: String(i) }))
    expect(ok(eleven)).toMatch(/between 2 and 10/)
  })

  it('rejects a descending scale', () => {
    expect(
      ok([
        { value: 5, label: 'High' },
        { value: 1, label: 'Low' },
      ]),
    ).toMatch(/must go up/)
  })

  it('rejects a repeated value', () => {
    expect(
      ok([
        { value: 3, label: 'A' },
        { value: 3, label: 'B' },
      ]),
    ).toMatch(/must go up/)
  })

  it('rejects a blank or whitespace-only label', () => {
    expect(
      ok([
        { value: 1, label: '   ' },
        { value: 2, label: 'Fine' },
      ]),
    ).toMatch(/needs a label/)
  })

  it('rejects a label over 40 characters', () => {
    expect(
      ok([
        { value: 1, label: 'x'.repeat(41) },
        { value: 2, label: 'Fine' },
      ]),
    ).toMatch(/at most 40/)
  })

  it('rejects a non-integer value', () => {
    expect(
      ok([
        { value: 1.5, label: 'Half' },
        { value: 2, label: 'Two' },
      ]),
    ).toMatch(/numeric value/)
  })

  it('rejects a value outside the 0 to 100 envelope', () => {
    expect(
      ok([
        { value: 0, label: 'Low' },
        { value: 101, label: 'Too high' },
      ]),
    ).toMatch(/between 0 and 100/)
  })

  it('accepts a sparse scale, because the gaps are the point', () => {
    expect(
      ok([
        { value: 1, label: 'Poor' },
        { value: 3, label: 'Okay' },
        { value: 5, label: 'Great' },
      ]),
    ).toBeNull()
  })

  it('accepts a scale that starts at zero', () => {
    expect(ok([{ value: 0, label: 'No' }, { value: 1, label: 'Yes' }])).toBeNull()
  })
})

describe('normalizeScale', () => {
  it('trims labels and keeps values untouched', () => {
    expect(
      normalizeScale([
        { value: 1, label: '  Poor  ' },
        { value: 2, label: 'Good' },
      ]),
    ).toEqual([
      { value: 1, label: 'Poor' },
      { value: 2, label: 'Good' },
    ])
  })

  it('drops any extra keys the composer carried around', () => {
    const messy = [
      { value: 1, label: 'A', tempId: 'x' },
      { value: 2, label: 'B', tempId: 'y' },
    ] as unknown as PeerScaleOption[]
    expect(normalizeScale(messy)).toEqual([
      { value: 1, label: 'A' },
      { value: 2, label: 'B' },
    ])
  })
})

describe('isOnScale', () => {
  const sparse: PeerScaleOption[] = [
    { value: 1, label: 'Poor' },
    { value: 3, label: 'Okay' },
    { value: 5, label: 'Great' },
  ]

  it('accepts a value that is actually an option', () => {
    expect(isOnScale(sparse, 3)).toBe(true)
  })

  /**
   * THE ONE THAT MATTERS. 2 lies between the ends and is still not a rating
   * anyone can give. A range check would let it through here and the submit
   * RPC would then reject the whole submission with a message the student
   * cannot act on.
   */
  it('rejects a value that merely lies between two options', () => {
    expect(isOnScale(sparse, 2)).toBe(false)
    expect(isOnScale(sparse, 4)).toBe(false)
  })

  it('rejects a value outside the ends', () => {
    expect(isOnScale(sparse, 0)).toBe(false)
    expect(isOnScale(sparse, 6)).toBe(false)
  })

  it('handles a zero-based scale, where 0 is a real answer', () => {
    const yesno: PeerScaleOption[] = [
      { value: 0, label: 'No' },
      { value: 1, label: 'Yes' },
    ]
    // Guards against anyone "simplifying" this to a truthiness check.
    expect(isOnScale(yesno, 0)).toBe(true)
  })
})

/**
 * The percent formula, mirroring `cp_peer_scores()` in migration 0051.
 *
 * Every expected value below is computed by hand rather than by calling the
 * function under test, which is the only way a mirror test is worth anything.
 */
describe('percentOf', () => {
  const five: PeerScaleOption[] = SCALE_PRESETS[0].scale
  const yesno: PeerScaleOption[] = SCALE_PRESETS[2].scale
  const ten: PeerScaleOption[] = SCALE_PRESETS[1].scale

  /**
   * THE ONE THAT MATTERS. `avg / max` would answer 20 here, and 20% is a lie:
   * on a 1-to-5 scale a straight 1 is the worst rating anyone can give.
   */
  it('reads the bottom of a 1-to-5 scale as 0, not 20', () => {
    expect(percentOf(five, 1)).toBe(0)
  })

  it('reads the top as 100', () => {
    expect(percentOf(five, 5)).toBe(100)
    expect(percentOf(ten, 10)).toBe(100)
    expect(percentOf(yesno, 1)).toBe(100)
  })

  it('reads the midpoint as 50', () => {
    // (3 - 1) / (5 - 1) = 0.5
    expect(percentOf(five, 3)).toBe(50)
    // (5.5 - 1) / (10 - 1) = 0.5
    expect(percentOf(ten, 5.5)).toBe(50)
  })

  it('matches hand-computed values off the midpoint', () => {
    // (4.25 - 1) / 4 = 0.8125
    expect(percentOf(five, 4.25)).toBeCloseTo(81.25, 10)
    // (2 - 1) / 9 = 0.111…
    expect(percentOf(ten, 2)).toBeCloseTo(11.1111111111, 8)
  })

  it('agrees with avg/max ONLY on a zero-based scale', () => {
    // The coincidence that hides the bug: on 0/1 both formulas give 0 and 100.
    expect(percentOf(yesno, 0)).toBe(0)
    expect(percentOf(yesno, 0.5)).toBe(50)
  })

  it('normalises against the ends of a SPARSE scale, not its option count', () => {
    const sparse: PeerScaleOption[] = [
      { value: 1, label: 'Poor' },
      { value: 3, label: 'Okay' },
      { value: 5, label: 'Great' },
    ]
    // Three options, but the range is still 1 to 5.
    expect(percentOf(sparse, 3)).toBe(50)
  })

  it('returns null rather than a number it cannot justify', () => {
    expect(percentOf(five, null)).toBeNull()
    expect(percentOf([], 3)).toBeNull()
    expect(percentOf([{ value: 2, label: 'Only' }], 2)).toBeNull()
    // No range: every rating is simultaneously the best and the worst.
    expect(
      percentOf(
        [
          { value: 3, label: 'A' },
          { value: 3, label: 'B' },
        ],
        3,
      ),
    ).toBeNull()
  })
})

describe('roundTo', () => {
  it('rounds once, at the requested precision', () => {
    expect(roundTo(81.2549, 1)).toBe(81.3)
    expect(roundTo(81.2549, 2)).toBe(81.25)
    expect(roundTo(3, 2)).toBe(3)
  })

  /**
   * The compounding peer2peer shipped: rounding each criterion to a whole
   * number and then averaging drifts from averaging first. Pinned so nobody
   * "simplifies" the unrounded carry out of the result screens.
   */
  it('differs from averaging pre-rounded values', () => {
    const exact = [81.25, 62.5, 43.75]
    const avgOfExact = roundTo(exact.reduce((a, b) => a + b, 0) / 3, 1)
    const preRounded = exact.map((v) => Math.round(v))
    const avgOfRounded = roundTo(preRounded.reduce((a, b) => a + b, 0) / 3, 1)
    expect(avgOfExact).toBe(62.5)
    expect(avgOfRounded).not.toBe(avgOfExact)
  })
})

describe('describeOption', () => {
  const five = SCALE_PRESETS[0].scale
  const ten = SCALE_PRESETS[1].scale
  const yesno = SCALE_PRESETS[2].scale

  it('writes a labelled option as number and word', () => {
    expect(describeOption(five, 4)).toBe('4 · Very good')
  })

  it('writes a bare number when the label is the number', () => {
    expect(describeOption(ten, 7)).toBe('7')
  })

  /**
   * THE ONE THAT MATTERS. The review screen printed "0 · No" while the form's
   * button said "No". A student never chose a 0.
   */
  it('writes only the word for a two-option word scale', () => {
    expect(describeOption(yesno, 0)).toBe('No')
    expect(describeOption(yesno, 1)).toBe('Yes')
  })

  it('returns null for an unanswered or off-scale value', () => {
    expect(describeOption(five, null)).toBeNull()
    expect(describeOption(five, undefined)).toBeNull()
    expect(describeOption(five, 9)).toBeNull()
  })
})
