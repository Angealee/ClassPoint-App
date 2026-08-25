import { describe, expect, it } from 'vitest'
import { CHANGELOG, LATEST_VERSION, compareVersions } from './changelog'

/**
 * The What's-New gate. `compareVersions` decides whether a student is shown a
 * release, and the CHANGELOG array's ordering decides what LATEST_VERSION is —
 * get either wrong and either everyone is spammed or nobody hears anything.
 */
describe('compareVersions', () => {
  it('orders by major, then minor, then patch', () => {
    expect(compareVersions('2.0.0', '1.9.9')).toBe(1)
    expect(compareVersions('1.2.0', '1.1.9')).toBe(1)
    expect(compareVersions('1.1.2', '1.1.1')).toBe(1)
    expect(compareVersions('1.0.0', '2.0.0')).toBe(-1)
  })

  it('treats equal versions as equal', () => {
    expect(compareVersions('3.0.0', '3.0.0')).toBe(0)
  })

  it('treats a missing segment as zero', () => {
    expect(compareVersions('4.0', '4.0.0')).toBe(0)
    expect(compareVersions('4', '4.0.0')).toBe(0)
    expect(compareVersions('4.0.1', '4.0')).toBe(1)
  })

  it('compares numerically, not as strings', () => {
    // The classic bug: '10' < '9' alphabetically.
    expect(compareVersions('1.10.0', '1.9.0')).toBe(1)
    expect(compareVersions('10.0.0', '9.0.0')).toBe(1)
  })

  it('degrades to zero on unparseable segments (documents current behaviour)', () => {
    // parseInt('rc') is NaN, coerced to 0 by the `|| 0`. So a pre-release tag
    // sorts as its base version. Pinned so a future semver-proper parser is a
    // deliberate change — today nothing in CHANGELOG uses tags.
    expect(compareVersions('4.0.0-rc', '4.0.0')).toBe(0)
  })
})

describe('CHANGELOG integrity', () => {
  it('is ordered newest-first', () => {
    for (let i = 1; i < CHANGELOG.length; i++) {
      expect(compareVersions(CHANGELOG[i - 1].version, CHANGELOG[i].version)).toBe(1)
    }
  })

  it('exposes the newest version as LATEST_VERSION', () => {
    expect(LATEST_VERSION).toBe(CHANGELOG[0].version)
  })

  it('has no duplicate versions', () => {
    const versions = CHANGELOG.map((e) => e.version)
    expect(new Set(versions).size).toBe(versions.length)
  })

  it('gives every entry a date and either items or sections', () => {
    for (const entry of CHANGELOG) {
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(entry.title.length).toBeGreaterThan(0)
      expect(Boolean(entry.items?.length) || Boolean(entry.sections?.length)).toBe(true)
    }
  })
})

describe('the 4.0.0 era, once announced', () => {
  it('leads the changelog', () => {
    // DRAFT_4_0_0 is gone: the era shipped, so it lives in CHANGELOG now. This
    // replaces the old guard that asserted the draft stayed OUT of the array.
    expect(CHANGELOG[0]?.version).toBe('4.0.0')
    expect(LATEST_VERSION).toBe('4.0.0')
  })

  it('stays short enough that a student actually reads it', () => {
    // The draft reached 19 sections and 72 bullets, which nobody reads. If a
    // future era drifts back past this, trim it before shipping rather than
    // raising the numbers.
    const entry = CHANGELOG[0]
    const sections = entry?.sections ?? []
    const bullets = sections.reduce((n, sec) => n + sec.items.length, 0)
    expect(sections.length).toBeLessThanOrEqual(8)
    expect(bullets).toBeLessThanOrEqual(24)
  })
})
