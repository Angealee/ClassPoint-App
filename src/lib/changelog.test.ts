import { describe, expect, it } from 'vitest'
import { CHANGELOG, DRAFT_4_0_0, LATEST_VERSION, compareVersions } from './changelog'

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

describe('DRAFT_4_0_0', () => {
  it('stays OUT of the live changelog until the era is announced', () => {
    // The whole point of the draft: LATEST_VERSION reads CHANGELOG[0], so an
    // in-progress era must not be visible to students. If this fails, someone
    // moved the draft in early.
    expect(CHANGELOG.some((e) => e.version === DRAFT_4_0_0.version)).toBe(false)
    expect(compareVersions(DRAFT_4_0_0.version, LATEST_VERSION)).toBe(1)
  })

  it('is shaped like a real entry, so moving it in is a one-line change', () => {
    expect(DRAFT_4_0_0.sections?.length).toBeGreaterThan(0)
    expect(DRAFT_4_0_0.title.length).toBeGreaterThan(0)
  })
})
