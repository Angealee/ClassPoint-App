
export const SHUFFLE_MIN_SIZE = 2
export const SHUFFLE_MAX_SIZE = 10

/** Mirrors the CHECK on `peer_groups.name`. */
const NAME_MAX = 40

export interface PlannedGroup {
  name: string
  studentIds: string[]
}

export function planGroupSizes(count: number, size: number): number[] {
  if (!Number.isInteger(count) || !Number.isInteger(size)) return []
  if (count < SHUFFLE_MIN_SIZE || size < SHUFFLE_MIN_SIZE) return []

  const groups = Math.max(1, Math.floor(count / size))
  const base = Math.floor(count / groups)
  const extra = count % groups

  return Array.from({ length: groups }, (_, i) => base + (i < extra ? 1 : 0))
}

export function shuffled<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export function nextGroupNames(existing: readonly string[], count: number): string[] {
  const taken = new Set(existing.map((n) => n.trim().toLowerCase()))

  let highest = 0
  for (const name of existing) {
    const m = /^group\s+(\d+)$/i.exec(name.trim())
    if (m) highest = Math.max(highest, Number(m[1]))
  }

  const out: string[] = []
  let n = highest
  while (out.length < count) {
    n += 1
    const name = `Group ${n}`
    if (name.length > NAME_MAX) break
    if (taken.has(name.toLowerCase())) continue
    out.push(name)
  }
  return out
}

export function buildGroupPlan(
  studentIds: readonly string[],
  size: number,
  existingNames: readonly string[],
  rng: () => number = Math.random,
): PlannedGroup[] {
  const sizes = planGroupSizes(studentIds.length, size)
  if (sizes.length === 0) return []

  const pool = shuffled(studentIds, rng)
  const names = nextGroupNames(existingNames, sizes.length)
  if (names.length < sizes.length) return []

  const plan: PlannedGroup[] = []
  let at = 0
  sizes.forEach((n, i) => {
    plan.push({ name: names[i], studentIds: pool.slice(at, at + n) })
    at += n
  })
  return plan
}

/** "8 groups of 4 and 2 of 5" — the preview's one-line summary. */
export function describeSizes(sizes: readonly number[]): string {
  if (sizes.length === 0) return 'No groups'
  const bySize = new Map<number, number>()
  for (const s of sizes) bySize.set(s, (bySize.get(s) ?? 0) + 1)

  const parts = [...bySize.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([s, n], i) =>
      i === 0 ? `${n} group${n === 1 ? '' : 's'} of ${s}` : `${n} of ${s}`,
    )
  return parts.join(' and ')
}
