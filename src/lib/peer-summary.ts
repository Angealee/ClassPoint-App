/**
 * The class summary at the top of the instructor's results board.
 *
 * ── EACH STUDENT COUNTS ONCE ───────────────────────────────────────────────
 * A class average here is the mean of STUDENTS' averages, not the mean of every
 * rating in the evaluation. The two differ whenever rater counts differ: in a
 * group evaluation a student on a team of six is rated by five people and one
 * on a team of four by three, and pooling every rating would weight the big
 * team's members more heavily. "How is the class doing" is a question about
 * students, so each counts once.
 *
 * Students nobody rated are left out of every average rather than counted as
 * zero — that is a gap in the data, the same rule the board uses when it sorts
 * them last.
 *
 * Percentages are the comparable figure across mixed scales; raw averages are
 * carried per question only, where every student shares that question's scale.
 */

export interface SummaryRow {
  raterCount: number
  overallPct: number | null
  groupName?: string | null
  criteria: { id: string; label: string; pct: number; avg: number; scaleMax: number }[]
}

export interface ClassSummary {
  totalCount: number
  ratedCount: number
  /** Mean of rated students' overall percentages, or null when nobody was rated. */
  overallPct: number | null
  criteria: { id: string; label: string; pct: number; avg: number; scaleMax: number }[]
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

export function classSummary(rows: readonly SummaryRow[]): ClassSummary {
  const rated = rows.filter((r) => r.raterCount > 0 && r.overallPct !== null)

  // Question order comes from the first rated student, whose criteria arrive in
  // the evaluation's own order from the SQL.
  const order: { id: string; label: string; scaleMax: number }[] = []
  const pcts = new Map<string, number[]>()
  const avgs = new Map<string, number[]>()

  for (const r of rated) {
    for (const c of r.criteria) {
      if (!pcts.has(c.id)) {
        order.push({ id: c.id, label: c.label, scaleMax: c.scaleMax })
        pcts.set(c.id, [])
        avgs.set(c.id, [])
      }
      if (Number.isFinite(c.pct)) pcts.get(c.id)!.push(c.pct)
      if (Number.isFinite(c.avg)) avgs.get(c.id)!.push(c.avg)
    }
  }

  return {
    totalCount: rows.length,
    ratedCount: rated.length,
    overallPct: rated.length > 0 ? mean(rated.map((r) => r.overallPct as number)) : null,
    criteria: order
      .filter((c) => (pcts.get(c.id) ?? []).length > 0)
      .map((c) => ({
        ...c,
        pct: mean(pcts.get(c.id)!),
        avg: mean(avgs.get(c.id)!),
      })),
  }
}

/**
 * Rows split by team, for the "By team" view. Keeps the incoming order inside
 * each team (the board's lowest-first order), puts named teams in name order,
 * and "No team" last.
 */
export function byTeam<T extends SummaryRow>(rows: readonly T[]): { team: string; rows: T[]; pct: number | null }[] {
  const teams = new Map<string, T[]>()
  for (const r of rows) {
    const key = r.groupName ?? ''
    if (!teams.has(key)) teams.set(key, [])
    teams.get(key)!.push(r)
  }

  return [...teams.entries()]
    .sort(([a], [b]) => {
      if (a === '') return 1
      if (b === '') return -1
      return a.localeCompare(b, undefined, { numeric: true })
    })
    .map(([team, members]) => ({
      team: team || 'No team',
      rows: members,
      pct: classSummary(members).overallPct,
    }))
}
