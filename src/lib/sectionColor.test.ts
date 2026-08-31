import { describe, expect, it } from 'vitest'
import { SECTION_COLOR_COUNT, sectionColor } from './sectionColor'

describe('sectionColor', () => {
  it('is stable for the same id', () => {
    const id = '8f14e45f-ea8f-4b1a-9f2c-6d3e1a7b0c22'
    expect(sectionColor(id, false)).toBe(sectionColor(id, false))
    expect(sectionColor(id, true)).toBe(sectionColor(id, true))
  })

  it('gives light and dark variants of the same slot', () => {
    const id = 'section-a'
    expect(sectionColor(id, false)).not.toBe(sectionColor(id, true))
  })

  it('falls back to muted for a missing id', () => {
    expect(sectionColor('', false)).toBe('#6b7280')
    expect(sectionColor('', true)).toBe('#a1a1aa')
  })

  /**
   * FNV-1a's LOW bits are poorly distributed, and  reads exactly those.
   * Without the xorshift finalizer in hash(), every one of these pairs landed in
   * the same slot despite having different hashes — which is what this test
   * caught. With it they separate at the expected rate.
   */
  it('does not send every reordered id to the same slot', () => {
    const pairs = [['abcd', 'dcba'], ['sec-1a', 'a1-ces'], ['xyz9', '9zyx'], ['bsit2a', 'a2tisb']]
    const differing = pairs.filter(([x, y]) => sectionColor(x, false) !== sectionColor(y, false))
    expect(differing.length).toBeGreaterThan(0)
  })

  /** The real risk is everything landing in one slot, not which slot. */
  it('spreads a realistic set of section ids across the palette', () => {
    const ids = Array.from(
      { length: 40 },
      (_, i) => `1f2e3d4c-aa${String(i).padStart(2, '0')}-4b1a-9f2c-6d3e1a7b0c22`,
    )
    const used = new Set(ids.map((id) => sectionColor(id, false)))
    // Not a uniformity claim — just that it isn't degenerate.
    expect(used.size).toBeGreaterThanOrEqual(Math.min(4, SECTION_COLOR_COUNT))
  })

  /** These must never be the role colours: a section is identity, not status. */
  it('never returns a role colour', () => {
    const roles = new Set([
      '#059669', '#34d399', // success
      '#b15a08', '#ffcd4a', // warn
      '#9f1239', '#f1748f', // danger
      '#d67c05', '#ffba1f', // reward
      '#c40f1d', '#f76a72', '#e11d2a', // accent / brand
      '#ea580c', '#fb923c', // streak
    ])
    for (let i = 0; i < 60; i++) {
      expect(roles.has(sectionColor(`id-${i}`, false))).toBe(false)
      expect(roles.has(sectionColor(`id-${i}`, true))).toBe(false)
    }
  })
})
