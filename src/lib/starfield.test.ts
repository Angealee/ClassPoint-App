import { describe, expect, it } from 'vitest'
import { makeStars } from './starfield'

describe('makeStars', () => {
  it('is deterministic: the same seed always draws the same sky', () => {
    expect(makeStars(7, 30, 0.5, 1.2)).toEqual(makeStars(7, 30, 0.5, 1.2))
  })

  it('draws a different sky for a different seed', () => {
    expect(makeStars(7, 30, 0.5, 1.2)).not.toEqual(makeStars(8, 30, 0.5, 1.2))
  })

  it('returns exactly the count asked for, all inside their ranges', () => {
    const stars = makeStars(3, 40, 0.6, 1.4, 0.4, 0.8)
    expect(stars).toHaveLength(40)
    for (const s of stars) {
      expect(s.x).toBeGreaterThanOrEqual(0)
      expect(s.x).toBeLessThan(100)
      expect(s.y).toBeGreaterThanOrEqual(0)
      expect(s.y).toBeLessThan(100)
      expect(s.r).toBeGreaterThanOrEqual(0.6)
      expect(s.r).toBeLessThanOrEqual(1.4)
      expect(s.o).toBeGreaterThanOrEqual(0.4)
      expect(s.o).toBeLessThanOrEqual(0.8)
    }
  })

  it('does not pile the stars into one corner', () => {
    const stars = makeStars(11, 60, 0.5, 1)
    const left = stars.filter((s) => s.x < 50).length
    const top = stars.filter((s) => s.y < 50).length
    expect(left).toBeGreaterThan(15)
    expect(left).toBeLessThan(45)
    expect(top).toBeGreaterThan(15)
    expect(top).toBeLessThan(45)
  })
})
