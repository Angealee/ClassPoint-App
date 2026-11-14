import { describe, expect, it } from 'vitest'
import type { PeerCriterionResult } from '@/lib/types'
import { headlinePct, reportRows } from './peer-report'

const crit = (over: Partial<PeerCriterionResult>): PeerCriterionResult => ({
  id: 'c1',
  label: 'Teamwork',
  avg: 4,
  pct: 75,
  scaleMin: 1,
  scaleMax: 5,
  ...over,
})

describe('reportRows', () => {
  it('rounds the percentage and derives the bar fill from it', () => {
    const [r] = reportRows([crit({ pct: 81.6 })])
    expect(r.pct).toBe(82)
    expect(r.fill).toBe(0.82)
  })

  it('never lets a bar leave its track, whatever the server sent', () => {
    const rows = reportRows([crit({ pct: 103.4 }), crit({ id: 'c2', pct: -2 })])
    expect(rows.map((r) => r.pct)).toEqual([100, 0])
    expect(rows.every((r) => r.fill >= 0 && r.fill <= 1)).toBe(true)
  })

  it('treats a missing percentage as an empty bar, not NaN', () => {
    const [r] = reportRows([crit({ pct: Number.NaN })])
    expect(r.pct).toBe(0)
    expect(r.fill).toBe(0)
  })

  it('writes the raw average on the question’s own scale', () => {
    expect(reportRows([crit({ avg: 4.25, scaleMax: 5 })])[0].raw).toBe('4.3 / 5')
    expect(reportRows([crit({ avg: 4, scaleMax: 5 })])[0].raw).toBe('4 / 5')
  })

  it('keeps the questions in the order they came', () => {
    const rows = reportRows([crit({ id: 'a', label: 'A' }), crit({ id: 'b', label: 'B' })])
    expect(rows.map((r) => r.label)).toEqual(['A', 'B'])
  })
})

describe('headlinePct', () => {
  it('rounds to a whole percent', () => {
    expect(headlinePct(87.5)).toBe(88)
  })

  it('is null when there is nothing to headline', () => {
    expect(headlinePct(null)).toBeNull()
    expect(headlinePct(Number.NaN)).toBeNull()
  })

  it('is held to 0 to 100', () => {
    expect(headlinePct(140)).toBe(100)
    expect(headlinePct(-5)).toBe(0)
  })
})
