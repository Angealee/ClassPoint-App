
export interface StrengthsInput {
  label: string
  pct: number
}

export interface Strengths {
  strongest: string[]
  roomToGrow: string[]
}

const TIE = 0.05

export function strengthsOf(criteria: readonly StrengthsInput[]): Strengths | null {
  const usable = criteria.filter((c) => Number.isFinite(c.pct))
  if (usable.length < 2) return null

  const max = Math.max(...usable.map((c) => c.pct))
  const min = Math.min(...usable.map((c) => c.pct))
  if (max - min < TIE) return null

  return {
    strongest: usable.filter((c) => max - c.pct < TIE).map((c) => c.label),
    roomToGrow: usable.filter((c) => c.pct - min < TIE).map((c) => c.label),
  }
}

export function joinLabels(labels: readonly string[]): string {
  if (labels.length <= 1) return labels[0] ?? ''
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`
}
