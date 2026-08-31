/**
 * A stable identity colour per section.
 *
 * ── WHY A SEPARATE PALETTE ─────────────────────────────────────────────────
 * These are NOT the role tokens and must never be. A role colour means
 * something — success, warn, danger, reward — and a section is not a status.
 * Reusing `--success` for "BSIT 2A" would mean the same green says "present" in
 * one place and "your class" in another.
 *
 * So this is a small closed set of hues chosen to avoid every role: no green
 * (success), no red or crimson (accent/danger), no amber or gold (warn/reward),
 * no orange (streak). What is left reads as identity — violet, cyan, indigo,
 * fuchsia, teal, slate-blue.
 *
 * Returned as hex for an inline style rather than a Tailwind class, for two
 * reasons: the class would have to be a complete literal for the scanner to see
 * it (so a lookup table of classes, not an interpolation), and a raw-palette
 * class would trip the guard in tone.test.ts — correctly, since it is not a
 * role.
 */

/** Light-mode and dark-mode pairs, so the dot stays visible on either ground. */
const PALETTE: ReadonlyArray<{ light: string; dark: string }> = [
  { light: '#7c3aed', dark: '#a78bfa' }, // violet
  { light: '#0891b2', dark: '#22d3ee' }, // cyan
  { light: '#4f46e5', dark: '#818cf8' }, // indigo
  { light: '#c026d3', dark: '#e879f9' }, // fuchsia
  { light: '#0d9488', dark: '#2dd4bf' }, // teal
  { light: '#6366f1', dark: '#a5b4fc' }, // slate-blue
]

/**
 * Deterministic index from a section id.
 *
 * FNV-1a, then a xorshift-multiply finalizer — and the finalizer is not
 * decoration. FNV's low bits are poorly distributed, and `% 6` reads exactly
 * those: with the raw hash, every anagram pair tested landed in the SAME slot
 * despite having different hashes. The finalizer mixes the high bits down, after
 * which those pairs separate at the expected 1-in-6 rate.
 *
 * With only six slots two sections can still share a colour. That is pigeonhole,
 * not a defect — the dot is a scanning aid, not an identifier.
 */
function hash(id: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  h >>>= 0
  h ^= h >>> 16
  h = Math.imul(h, 0x7feb352d)
  h ^= h >>> 15
  h = Math.imul(h, 0x846ca68b)
  h ^= h >>> 16
  return h >>> 0
}

/** The colour for a section, in the requested theme. */
export function sectionColor(sectionId: string, dark: boolean): string {
  if (!sectionId) return dark ? '#a1a1aa' : '#6b7280'
  const entry = PALETTE[hash(sectionId) % PALETTE.length]
  return dark ? entry.dark : entry.light
}

/** How many distinct colours exist — exported so a test can pin the spread. */
export const SECTION_COLOR_COUNT = PALETTE.length
