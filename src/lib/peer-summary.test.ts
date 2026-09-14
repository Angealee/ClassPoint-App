import { describe, expect, it } from 'vitest'
import { byTeam, classSummary, type SummaryRow } from './peer-summary'

const row = (
  overallPct: number | null,
  crit: [string, number, number][],
  raterCount = 3,
  groupName: string | null = null,
): SummaryRow => ({
  raterCount,
  overallPct,
  groupName,
  criteria: crit.map(([id, pct, avg]) => ({ id, label: id.toUpperCase(), pct, avg, scaleMax: 5 })),
})

describe('classSummary', () => {
  it('averages each student once', () => {
    const s = classSummary([
      // Whole-number inputs so the expected mean is exact in floating point.
      row(80, [['a', 80, 4]]),
      row(40, [['a', 40, 3]]),
    ])
    expect(s.overallPct).toBe(60)
    expect(s.criteria).toEqual([{ id: 'a', label: 'A', scaleMax: 5, pct: 60, avg: 3.5 }])
  })

  /**
   * THE ONE THAT MATTERS. A student nobody rated has a null average. Counting
   * them as zero would drag the class figure down for a gap in the data.
   */
  it('leaves unrated students out of every average, but counts them in the total', () => {
    const s = classSummary([
      row(90, [['a', 90, 4.6]]),
      row(null, [], 0),
    ])
    expect(s.overallPct).toBe(90)
    expect(s.ratedCount).toBe(1)
    expect(s.totalCount).toBe(2)
  })

  /**
   * Pooling every rating would weight a student rated by five people above one
   * rated by three. Rater count must not change a student's weight.
   */
  it('does not weight a student by how many people rated them', () => {
    const s = classSummary([row(100, [['a', 100, 5]], 5), row(0, [['a', 0, 1]], 3)])
    expect(s.overallPct).toBe(50)
  })

  it('keeps the questions in the evaluation’s order', () => {
    const s = classSummary([row(50, [['b', 50, 3], ['a', 50, 3]])])
    expect(s.criteria.map((c) => c.id)).toEqual(['b', 'a'])
  })

  it('is empty when nobody was rated', () => {
    const s = classSummary([row(null, [], 0)])
    expect(s.overallPct).toBeNull()
    expect(s.criteria).toEqual([])
  })
})

describe('byTeam', () => {
  it('groups by team in name order, keeps order inside each team, puts No team last', () => {
    const rows = [
      row(30, [['a', 30, 2]], 3, 'Group 2'),
      row(40, [['a', 40, 2.5]], 3, null),
      row(50, [['a', 50, 3]], 3, 'Group 10'),
      row(60, [['a', 60, 3.4]], 3, 'Group 2'),
    ]
    const teams = byTeam(rows)
    // Numeric-aware, so Group 10 follows Group 2 rather than preceding it.
    expect(teams.map((t) => t.team)).toEqual(['Group 2', 'Group 10', 'No team'])
    expect(teams[0].rows.map((r) => r.overallPct)).toEqual([30, 60])
    expect(teams[0].pct).toBe(45)
  })
})
