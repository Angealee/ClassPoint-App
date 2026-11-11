
const PALETTE: ReadonlyArray<{ light: string; dark: string }> = [
  { light: '#7c3aed', dark: '#a78bfa' }, // violet
  { light: '#0891b2', dark: '#22d3ee' }, // cyan
  { light: '#4f46e5', dark: '#818cf8' }, // indigo
  { light: '#c026d3', dark: '#e879f9' }, // fuchsia
  { light: '#0d9488', dark: '#2dd4bf' }, // teal
  { light: '#6366f1', dark: '#a5b4fc' }, // slate-blue
]

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

export const SECTION_COLOR_COUNT = PALETTE.length
