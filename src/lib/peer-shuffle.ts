/**
 * Random group plans for the shuffle sheet (0054).
 *
 * The CLIENT draws the groups so the instructor can preview and reshuffle;
 * `apply_peer_group_plan` then saves exactly what was previewed. A server-side
 * draw would save a different random result from the one on screen.
 *
 * ── LEFTOVERS SPREAD, THEY NEVER FORM A SMALL GROUP (the instructor's call) ──
 * The number of groups is `floor(students / size)`, and students are dealt as
 * evenly as possible across them, so sizes differ by at most one and no group
 * is smaller than the size asked for (the one exception: fewer students than a
 * single group, who simply become that group). 42 in groups of 4 is ten groups:
 * eight of 4 and two of 5. The alternative, a trailing pair, would have its
 * comments withheld forever by the three-rater rule.
 *
 * The honest cost shows up in a small pool: 11 in groups of 4 is two groups of
 * 6 and 5. The preview prints the real sizes, so the instructor sees that and
 * can pick a different size, rather than the rule quietly inventing a third,
 * smaller group.
 */

export const SHUFFLE_MIN_SIZE = 2
export const SHUFFLE_MAX_SIZE = 10

/** Mirrors the CHECK on `peer_groups.name`. */
const NAME_MAX = 40

export interface PlannedGroup {
  name: string
  studentIds: string[]
}

/**
 * Group sizes for `count` students in groups of `size`, largest first.
 *
 * Empty when there are fewer than two students — a group of one has nobody to
 * rate, and the server refuses it.
 */
export function planGroupSizes(count: number, size: number): number[] {
  if (!Number.isInteger(count) || !Number.isInteger(size)) return []
  if (count < SHUFFLE_MIN_SIZE || size < SHUFFLE_MIN_SIZE) return []

  const groups = Math.max(1, Math.floor(count / size))
  const base = Math.floor(count / groups)
  const extra = count % groups

  // The first `extra` groups take one more. Largest first reads naturally in
  // the preview: "2 groups of 5, 8 groups of 4".
  return Array.from({ length: groups }, (_, i) => base + (i < extra ? 1 : 0))
}

/**
 * Fisher–Yates, with the random source injected so the test can pin an order.
 * Never mutates the input.
 */
export function shuffled<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * "Group N" names that collide with nothing already live in the section.
 *
 * Numbering continues after the highest existing "Group N" rather than after
 * the COUNT of groups, and skips any name already taken — so a section that
 * holds "Group 1" and "Group 3" gets "Group 4" next, not a second "Group 3" the
 * server would refuse. Compared case-insensitively and trimmed, matching the
 * unique index `(section_id, lower(btrim(name)))`.
 */
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

/**
 * The whole plan: shuffle the pool, cut it into the planned sizes, name each.
 *
 * `existingNames` are the LIVE groups that will still exist after saving — in
 * replace mode that is none, because they are archived first, which is what
 * lets a reshuffle start again at "Group 1".
 */
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
