import type { PeerCriterionResult } from '@/lib/types'

/*
 * What the student's feedback report draws for each question. Pure, because every number on that
 * screen is somebody's opinion of a classmate, and a bar that overflows its track or a percentage
 * that reads 103 is the kind of mistake that gets screenshotted.
 */
export interface ReportRow {
  id: string
  label: string
  /** The normalised percentage, rounded and held to 0 to 100. */
  pct: number
  /** The same figure as a 0 to 1 bar fill. */
  fill: number
  /** The average on the question's own scale, for the small caption: "4.2 / 5". */
  raw: string
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/** One decimal at most, and "4" rather than "4.0". */
const short = (n: number) => String(Math.round(n * 10) / 10)

export function reportRows(criteria: readonly PeerCriterionResult[]): ReportRow[] {
  return criteria.map((c) => {
    const pct = Number.isFinite(c.pct) ? clamp(Math.round(c.pct), 0, 100) : 0
    return {
      id: c.id,
      label: c.label,
      pct,
      fill: pct / 100,
      raw: `${short(c.avg)} / ${short(c.scaleMax)}`,
    }
  })
}

/** The headline figure: a whole percent, or null when nobody's rating produced one. */
export function headlinePct(overallPct: number | null): number | null {
  if (overallPct === null || !Number.isFinite(overallPct)) return null
  return clamp(Math.round(overallPct), 0, 100)
}
