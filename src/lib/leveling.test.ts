import { describe, expect, it } from 'vitest'
import { getLevelProgress, requirementForLevel } from './leveling'

describe('requirementForLevel', () => {
  it('starts at 50 and compounds by 1.5, rounded', () => {
    expect(requirementForLevel(1)).toBe(50)
    expect(requirementForLevel(2)).toBe(75)
    expect(requirementForLevel(3)).toBe(113) // 112.5 rounds up
    expect(requirementForLevel(4)).toBe(170) // 169.5 rounds up
    expect(requirementForLevel(5)).toBe(255)
  })

  it('treats levels below 1 as level 1', () => {
    expect(requirementForLevel(0)).toBe(50)
    expect(requirementForLevel(-3)).toBe(50)
  })

  it('is stable across repeated calls (the cache must not drift)', () => {
    const first = requirementForLevel(8)
    const second = requirementForLevel(8)
    expect(second).toBe(first)
    requirementForLevel(20)
    expect(requirementForLevel(8)).toBe(first)
    expect(requirementForLevel(1)).toBe(50)
  })
})

describe('getLevelProgress', () => {
  it('starts everyone at level 1 with an empty bar', () => {
    const p = getLevelProgress(0)
    expect(p.level).toBe(1)
    expect(p.expIntoLevel).toBe(0)
    expect(p.expForLevel).toBe(50)
    expect(p.expToNext).toBe(50)
    expect(p.progressPct).toBe(0)
  })

  it('levels up exactly ON the requirement, not one point after', () => {
    expect(getLevelProgress(49).level).toBe(1)
    expect(getLevelProgress(50).level).toBe(2)
  })

  it('overflows leftover points into the new level', () => {
    const p = getLevelProgress(60)
    expect(p.level).toBe(2)
    expect(p.expIntoLevel).toBe(10)
    expect(p.expForLevel).toBe(75)
    expect(p.expToNext).toBe(65)
  })

  it('walks the cumulative ladder correctly', () => {
    expect(getLevelProgress(124).level).toBe(2)
    expect(getLevelProgress(125).level).toBe(3)
    expect(getLevelProgress(237).level).toBe(3)
    expect(getLevelProgress(238).level).toBe(4)
    expect(getLevelProgress(408).level).toBe(5)
  })

  it('never goes below level 1 for negative or fractional input', () => {
    expect(getLevelProgress(-100).level).toBe(1)
    expect(getLevelProgress(-100).totalExp).toBe(0)
    expect(getLevelProgress(49.9).level).toBe(1)
    expect(getLevelProgress(50.9).level).toBe(2)
  })

  it('keeps the progress bar within 0–100', () => {
    for (const exp of [0, 1, 49, 50, 124, 407, 5000]) {
      const p = getLevelProgress(exp)
      expect(p.progressPct).toBeGreaterThanOrEqual(0)
      expect(p.progressPct).toBeLessThanOrEqual(100)
      expect(p.expToNext).toBeGreaterThan(0)
    }
  })

  it('terminates for a very large total', () => {
    const p = getLevelProgress(1_000_000)
    expect(p.level).toBeGreaterThan(10)
    expect(Number.isFinite(p.level)).toBe(true)
  })
})
