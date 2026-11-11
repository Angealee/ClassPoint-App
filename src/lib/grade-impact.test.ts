import { describe, expect, it } from 'vitest'
import { computeImpact, finalGradeFor, VISIBLE_DELTA } from './grade-impact'
import { defaultPolicy } from './grading'
import type { GradePolicy, GradeSumsRow, TermKey, TermSums } from './types'

/**
 * Pins the weight-change preview.
 *
 * The load-bearing test is "reports nothing when the weights are unchanged".
 * Re-saving the same numbers produces deltas around 1e-15 in floating point, so
 * without the visibility threshold the confirm dialog would announce that all
 * forty grades move every time the instructor opened it and pressed Save —
 * which trains them to ignore the one time it is telling the truth.
 *
 * The second is that a grade APPEARING or VANISHING is counted apart from one
 * that moves. Averaging "null became 78" as a delta is meaningless, and it is
 * the loudest thing a weight change can do.
 */

const ALL: TermKey[] = ['prelim', 'midterm', 'finals']
const policies = (): GradePolicy[] => ALL.map((t) => defaultPolicy('sub', t))

/** Every component fully marked at the given fraction of its total. */
function sums(fraction: number): TermSums {
  const part = { sumScore: 100 * fraction, sumMax: 100, sumMaxMarked: 100 }
  return {
    performance_task: { ...part },
    quiz: { ...part },
    recitation: { ...part },
    exam: { ...part },
  }
}

function rows(
  studentId: string,
  fullName: string,
  byTerm: Partial<Record<TermKey, number>>,
): GradeSumsRow[] {
  return ALL.filter((t) => byTerm[t] !== undefined).map((term) => ({
    studentId,
    fullName,
    term,
    sums: sums(byTerm[term] as number),
  }))
}

describe('finalGradeFor', () => {
  it('weights the three terms at 30/30/40', () => {
    // Every component at 100% transmutes to 100, so every term grade is 100
    // and the final grade is 100 whatever the split.
    expect(finalGradeFor(rows('s1', 'A', { prelim: 1, midterm: 1, finals: 1 }), policies())).toBe(
      100,
    )
  })

  it('is null when a term has no marks at all', () => {
    // The spreadsheet bug: a missing midterm must not quietly cost 30 points.
    expect(finalGradeFor(rows('s1', 'A', { prelim: 1, finals: 1 }), policies())).toBeNull()
  })

  it('is null when the subject is only part-configured', () => {
    const partial = policies().filter((p) => p.term !== 'midterm')
    expect(
      finalGradeFor(rows('s1', 'A', { prelim: 1, midterm: 1, finals: 1 }), partial),
    ).toBeNull()
  })
})

describe('computeImpact', () => {
  it('reports nothing when the weights are unchanged', () => {
    // Floating point makes this the default failure mode, not an edge case.
    const data = [
      ...rows('s1', 'Ana', { prelim: 0.5, midterm: 0.8, finals: 1 }),
      ...rows('s2', 'Ben', { prelim: 1, midterm: 0.2, finals: 0.4 }),
    ]
    const impact = computeImpact(data, policies(), policies())
    expect(impact.changed).toBe(0)
    expect(impact.movers).toEqual([])
    expect(impact.averageDelta).toBeNull()
    expect(impact.total).toBe(2)
  })

  it('ignores a change too small to see at two decimals', () => {
    // Shift a sliver BETWEEN two terms, so the three still sum to 1 — nudging
    // one weight on its own breaks that rule instead, which is the next test.
    const after = policies().map((p) => {
      if (p.term === 'prelim') return { ...p, finalWeight: p.finalWeight + 0.00001 }
      if (p.term === 'midterm') return { ...p, finalWeight: p.finalWeight - 0.00001 }
      return p
    })
    // Terms of 60 and 100, so the sliver is worth 0.00001 × 40 = 0.0004.
    const data = rows('s1', 'Ana', { prelim: 0, midterm: 1, finals: 0.5 })
    expect(computeImpact(data, policies(), after).changed).toBe(0)
    expect(VISIBLE_DELTA).toBeLessThan(0.01)
  })

  it('makes every grade vanish when the term weights stop adding up', () => {
    // Found by a test that meant to nudge one weight harmlessly. Raising one
    // alone takes the three to 100.001%, and `grading.ts` refuses a
    // misconfigured policy outright rather than renormalising it — so the
    // preview must report this as grades DISAPPEARING, loudly, and not as a
    // rounding-sized move.
    const after = policies().map((p) =>
      p.term === 'prelim' ? { ...p, finalWeight: p.finalWeight + 0.00001 } : p,
    )
    const data = [
      ...rows('s1', 'Ana', { prelim: 0.5, midterm: 0.5, finals: 0.5 }),
      ...rows('s2', 'Ben', { prelim: 1, midterm: 1, finals: 1 }),
    ]
    const impact = computeImpact(data, policies(), after)
    expect(impact.disappearing).toBe(2)
    expect(impact.changed).toBe(2)
    expect(impact.movers.every((m) => m.after === null)).toBe(true)
  })

  it('finds who moves, and sorts the biggest move first', () => {
    // Shift the whole weight onto Finals. A student who did better in Finals
    // than in Prelim gains; one who did worse loses.
    const after = policies().map((p) => ({
      ...p,
      finalWeight: p.term === 'finals' ? 1 : 0,
    }))
    const data = [
      // Ana: weak prelim, perfect finals → gains the most.
      ...rows('s1', 'Ana', { prelim: 0, midterm: 0.5, finals: 1 }),
      // Ben: identical every term → cannot move however the weights shift.
      ...rows('s2', 'Ben', { prelim: 0.5, midterm: 0.5, finals: 0.5 }),
      // Cy: strong prelim, weak finals → loses.
      ...rows('s3', 'Cy', { prelim: 1, midterm: 0.5, finals: 0.2 }),
    ]

    const impact = computeImpact(data, policies(), after)
    expect(impact.total).toBe(3)
    expect(impact.changed).toBe(2)
    expect(impact.movers.map((m) => m.fullName)).toEqual(['Ana', 'Cy'])
    expect(impact.movers[0].delta).toBeGreaterThan(0)
    expect(impact.movers[1].delta).toBeLessThan(0)
    // A student with the same result in every term is untouched by any split.
    expect(impact.movers.some((m) => m.fullName === 'Ben')).toBe(false)
  })

  it('averages the movers with their sign, not their size', () => {
    // One up 4, one down 4 is a redistribution, not a four-point inflation —
    // the summary line has to be able to say so.
    const after = policies().map((p) => ({ ...p, finalWeight: p.term === 'finals' ? 1 : 0 }))
    const data = [
      ...rows('s1', 'Up', { prelim: 0, midterm: 0.5, finals: 1 }),
      ...rows('s2', 'Down', { prelim: 1, midterm: 0.5, finals: 0 }),
    ]
    const impact = computeImpact(data, policies(), after)
    expect(impact.changed).toBe(2)
    expect(impact.averageDelta).toBeCloseTo(0, 8)
  })

  it('counts a grade that appears separately from one that moves', () => {
    // Before: finals carries weight and this student has no finals marks, so
    // there is no grade at all. After: finals carries none, so a grade exists.
    const before = policies()
    const after = policies().map((p) => ({
      ...p,
      finalWeight: p.term === 'finals' ? 0 : 0.5,
    }))
    const data = rows('s1', 'Ana', { prelim: 0.5, midterm: 0.5 })

    const impact = computeImpact(data, before, after)
    expect(impact.appearing).toBe(1)
    expect(impact.disappearing).toBe(0)
    expect(impact.movers[0].before).toBeNull()
    expect(impact.movers[0].after).not.toBeNull()
    // It is NOT averaged in — there is no delta to average.
    expect(impact.movers[0].delta).toBeNull()
    expect(impact.averageDelta).toBeNull()
  })

  it('counts a grade that vanishes', () => {
    const before = policies().map((p) => ({
      ...p,
      finalWeight: p.term === 'finals' ? 0 : 0.5,
    }))
    const after = policies()
    const data = rows('s1', 'Ana', { prelim: 0.5, midterm: 0.5 })

    const impact = computeImpact(data, before, after)
    expect(impact.disappearing).toBe(1)
    expect(impact.appearing).toBe(0)
  })

  it('puts an appearing grade above every ordinary move', () => {
    const before = policies()
    const after = policies().map((p) => ({
      ...p,
      finalWeight: p.term === 'finals' ? 0 : 0.5,
    }))
    const data = [
      ...rows('s1', 'Mover', { prelim: 0, midterm: 1, finals: 1 }),
      ...rows('s2', 'Appears', { prelim: 0.5, midterm: 0.5 }),
    ]
    const impact = computeImpact(data, before, after)
    expect(impact.movers[0].fullName).toBe('Appears')
  })

  it('ignores a student with no grade either way', () => {
    const data = rows('s1', 'Ana', { prelim: 0.5 })
    const impact = computeImpact(data, policies(), policies())
    expect(impact.total).toBe(1)
    expect(impact.changed).toBe(0)
  })
})
