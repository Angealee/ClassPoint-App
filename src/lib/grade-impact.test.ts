import { describe, expect, it } from 'vitest'
import { computeImpact, finalGradeFor, VISIBLE_DELTA } from './grade-impact'
import { defaultPolicy } from './grading'
import type { GradePolicy, GradeSumsRow, TermKey, TermSums } from './types'

const ALL: TermKey[] = ['prelim', 'midterm', 'finals']
const policies = (): GradePolicy[] => ALL.map((t) => defaultPolicy('sub', t))

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
    expect(finalGradeFor(rows('s1', 'A', { prelim: 1, midterm: 1, finals: 1 }), policies())).toBe(
      100,
    )
  })

  it('is null when a term has no marks at all', () => {
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
    const after = policies().map((p) => {
      if (p.term === 'prelim') return { ...p, finalWeight: p.finalWeight + 0.00001 }
      if (p.term === 'midterm') return { ...p, finalWeight: p.finalWeight - 0.00001 }
      return p
    })
    const data = rows('s1', 'Ana', { prelim: 0, midterm: 1, finals: 0.5 })
    expect(computeImpact(data, policies(), after).changed).toBe(0)
    expect(VISIBLE_DELTA).toBeLessThan(0.01)
  })

  it('makes every grade vanish when the term weights stop adding up', () => {
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
    const after = policies().map((p) => ({
      ...p,
      finalWeight: p.term === 'finals' ? 1 : 0,
    }))
    const data = [
      // Ana: weak prelim, perfect finals → gains the most.
      ...rows('s1', 'Ana', { prelim: 0, midterm: 0.5, finals: 1 }),
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
    expect(impact.movers.some((m) => m.fullName === 'Ben')).toBe(false)
  })

  it('averages the movers with their sign, not their size', () => {
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
