import { describe, expect, it } from 'vitest'
import { getLevelProgress, requirementForLevel } from './leveling'

/**
 * The level ladder, pinned.
 *
 * These numbers MIRROR `cp_level()` in Postgres — if the two disagree, a
 * student's level flickers depending on which side computed it. Era 5.0 Phase E
 * deliberately retunes this curve; when it does, these expectations change in
 * the SAME commit as the migration, never separately.
 */
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
    // requirementCache is module-level mutable state — compounding on a stale
    // entry would silently shift the whole ladder.
    const first = requirementForLevel(8)
    const second = requirementForLevel(8)
    expect(second).toBe(first)
    // Reaching further and coming back must not change earlier rungs.
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
    // Cumulative thresholds: L2 at 50, L3 at 125, L4 at 238, L5 at 408.
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
    // Requirements grow, so the walk always ends — this guards an accidental
    // change that could make it loop forever on a big number.
    const p = getLevelProgress(1_000_000)
    expect(p.level).toBeGreaterThan(10)
    expect(Number.isFinite(p.level)).toBe(true)
  })
})
