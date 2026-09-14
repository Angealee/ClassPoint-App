import { describe, expect, it } from 'vitest'
import {
  buildGroupPlan,
  describeSizes,
  nextGroupNames,
  planGroupSizes,
  shuffled,
} from './peer-shuffle'

/**
 * Pins the shuffle sheet's arithmetic. Every mistake here is saved to the
 * database exactly as previewed, so the preview being wrong IS the bug.
 */

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

describe('planGroupSizes', () => {
  /** The example the instructor chose the rule from. */
  it('spreads leftovers: 42 in groups of 4 is eight of 4 and two of 5', () => {
    const sizes = planGroupSizes(42, 4)
    expect(sizes).toHaveLength(10)
    expect(sizes.filter((s) => s === 5)).toHaveLength(2)
    expect(sizes.filter((s) => s === 4)).toHaveLength(8)
  })

  /**
   * THE ONE THAT MATTERS. A trailing pair would have its comments withheld by
   * the three-rater rule forever. Across a range of class sizes, no group may
   * come out smaller than the size asked for once there are enough students to
   * fill one.
   */
  it('never produces a group smaller than the size once one group is filled', () => {
    for (let count = 4; count <= 60; count++) {
      const sizes = planGroupSizes(count, 4)
      expect(Math.min(...sizes), `count ${count}`).toBeGreaterThanOrEqual(4)
    }
  })

  it('places every student exactly once', () => {
    for (let count = 2; count <= 60; count++) {
      for (let size = 2; size <= 10; size++) {
        const sizes = planGroupSizes(count, size)
        expect(sum(sizes), `${count}/${size}`).toBe(count)
      }
    }
  })

  it('keeps sizes within one of each other', () => {
    for (let count = 2; count <= 60; count++) {
      const sizes = planGroupSizes(count, 3)
      expect(Math.max(...sizes) - Math.min(...sizes), `count ${count}`).toBeLessThanOrEqual(1)
    }
  })

  it('divides evenly when it can', () => {
    expect(planGroupSizes(40, 4)).toEqual(Array(10).fill(4))
  })

  it('makes one group from a pool smaller than a single group', () => {
    expect(planGroupSizes(3, 4)).toEqual([3])
  })

  it('makes nothing from fewer than two students, since one has nobody to rate', () => {
    expect(planGroupSizes(1, 4)).toEqual([])
    expect(planGroupSizes(0, 4)).toEqual([])
  })

  it('refuses a size below two', () => {
    expect(planGroupSizes(10, 1)).toEqual([])
  })
})

describe('shuffled', () => {
  it('never mutates its input and keeps every item', () => {
    const input = ['a', 'b', 'c', 'd', 'e']
    const copy = input.slice()
    const out = shuffled(input)
    expect(input).toEqual(copy)
    expect([...out].sort()).toEqual([...copy].sort())
  })

  it('follows the injected random source', () => {
    // rng 0 swaps each position with index 0: a deterministic rotation.
    expect(shuffled(['a', 'b', 'c'], () => 0)).toEqual(['b', 'c', 'a'])
  })
})

describe('nextGroupNames', () => {
  it('starts at Group 1 in an empty section', () => {
    expect(nextGroupNames([], 3)).toEqual(['Group 1', 'Group 2', 'Group 3'])
  })

  /**
   * Continuing from the COUNT would produce "Group 3" here, which the unique
   * index refuses — and the whole shuffle with it.
   */
  it('continues after the highest existing number, not the count', () => {
    expect(nextGroupNames(['Group 1', 'Group 3'], 2)).toEqual(['Group 4', 'Group 5'])
  })

  it('ignores names that are not "Group N" when numbering', () => {
    expect(nextGroupNames(['Team Alpha', 'The Coders'], 1)).toEqual(['Group 1'])
  })

  it('matches existing names the way the unique index does', () => {
    // "group 2" (any case, padded) is the same name to the index.
    expect(nextGroupNames(['  group 2 '], 1)).toEqual(['Group 3'])
  })
})

describe('buildGroupPlan', () => {
  const ids = Array.from({ length: 42 }, (_, i) => `s${i}`)

  it('places every student exactly once across named groups', () => {
    const plan = buildGroupPlan(ids, 4, [])
    const placed = plan.flatMap((g) => g.studentIds)
    expect(placed).toHaveLength(42)
    expect(new Set(placed).size).toBe(42)
    expect(plan.map((g) => g.name)).toEqual(
      Array.from({ length: 10 }, (_, i) => `Group ${i + 1}`),
    )
  })

  it('names new groups after the section’s existing ones', () => {
    const plan = buildGroupPlan(['a', 'b', 'c', 'd'], 2, ['Group 1', 'Group 2'])
    expect(plan.map((g) => g.name)).toEqual(['Group 3', 'Group 4'])
  })

  it('returns nothing for a single student', () => {
    expect(buildGroupPlan(['a'], 4, [])).toEqual([])
  })
})

describe('describeSizes', () => {
  it('reads smallest size first', () => {
    expect(describeSizes(planGroupSizes(42, 4))).toBe('8 groups of 4 and 2 of 5')
  })

  it('handles one group', () => {
    expect(describeSizes([3])).toBe('1 group of 3')
  })
})
