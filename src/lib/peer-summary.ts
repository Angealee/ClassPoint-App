
export interface SummaryRow {
  raterCount: number
  overallPct: number | null
  groupName?: string | null
  criteria: { id: string; label: string; pct: number; avg: number; scaleMax: number }[]
}

export interface ClassSummary {
  totalCount: number
  ratedCount: number
  overallPct: number | null
  criteria: { id: string; label: string; pct: number; avg: number; scaleMax: number }[]
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

export function classSummary(rows: readonly SummaryRow[]): ClassSummary {
  const rated = rows.filter((r) => r.raterCount > 0 && r.overallPct !== null)

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
