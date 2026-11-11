import { describe, expect, it } from 'vitest'
import { resolveGroupTargets, type SectionGroupState } from './peer-audience'

const ready = (...ids: string[]): SectionGroupState => ({
  status: 'ready',
  groups: ids.map((id) => ({ id })),
})

const none = new Set<string>()

describe('resolveGroupTargets', () => {
  it('ignores groups entirely for a section-wide evaluation', () => {
    const r = resolveGroupTargets({
      scope: 'section',
      sectionIds: ['A'],
      groupsBySection: { A: ready('a1', 'a2') },
      unpicked: new Set(['a1']),
    })
    expect(r).toEqual({ narrowed: false, groupIds: null, error: null })
  })

  it('sends no list when every group is left ticked', () => {
    const r = resolveGroupTargets({
      scope: 'group',
      sectionIds: ['A', 'B'],
      groupsBySection: { A: ready('a1', 'a2'), B: ready('b1') },
      unpicked: none,
    })
    expect(r).toEqual({ narrowed: false, groupIds: null, error: null })
  })

  it('never blocks an all-groups evaluation on a slow or failed fetch', () => {
    const r = resolveGroupTargets({
      scope: 'group',
      sectionIds: ['A', 'B'],
      groupsBySection: { A: { status: 'loading', groups: [] }, B: { status: 'error', groups: [] } },
      unpicked: none,
    })
    expect(r.error).toBeNull()
    expect(r.groupIds).toBeNull()
  })

  it('sends exactly the remaining groups once one is unticked', () => {
    const r = resolveGroupTargets({
      scope: 'group',
      sectionIds: ['A'],
      groupsBySection: { A: ready('a1', 'a2', 'a3') },
      unpicked: new Set(['a2']),
    })
    expect(r).toEqual({ narrowed: true, groupIds: ['a1', 'a3'], error: null })
  })

  it('keeps every group of an untouched section when narrowing another', () => {
    const r = resolveGroupTargets({
      scope: 'group',
      sectionIds: ['A', 'B'],
      groupsBySection: { A: ready('a1', 'a2'), B: ready('b1', 'b2') },
      unpicked: new Set(['a1']),
    })
    expect(r.groupIds).toEqual(['a2', 'b1', 'b2'])
    expect(r.error).toBeNull()
  })

  it('does not count an untick left over from a section no longer ticked', () => {
    const r = resolveGroupTargets({
      scope: 'group',
      sectionIds: ['B'],
      groupsBySection: { A: ready('a1', 'a2'), B: ready('b1') },
      unpicked: new Set(['a1']),
    })
    expect(r).toEqual({ narrowed: false, groupIds: null, error: null })
  })

  it('refuses when every group has been unticked', () => {
    const r = resolveGroupTargets({
      scope: 'group',
      sectionIds: ['A'],
      groupsBySection: { A: ready('a1', 'a2') },
      unpicked: new Set(['a1', 'a2']),
    })
    expect(r.error).toBe('Pick at least one group.')
    expect(r.groupIds).toBeNull()
  })

  it('refuses a narrowed list while a ticked section is still loading', () => {
    const r = resolveGroupTargets({
      scope: 'group',
      sectionIds: ['A', 'B'],
      groupsBySection: { A: ready('a1', 'a2'), B: { status: 'loading', groups: [] } },
      unpicked: new Set(['a1']),
    })
    expect(r.error).toMatch(/still loading/)
  })

  it('refuses a narrowed list when a ticked section failed to load', () => {
    const r = resolveGroupTargets({
      scope: 'group',
      sectionIds: ['A', 'B'],
      groupsBySection: { A: ready('a1', 'a2'), B: { status: 'error', groups: [] } },
      unpicked: new Set(['a1']),
    })
    expect(r.error).toMatch(/still loading/)
  })

  it('lets a section with no groups contribute nobody once narrowed', () => {
    const r = resolveGroupTargets({
      scope: 'group',
      sectionIds: ['A', 'B'],
      groupsBySection: { A: ready('a1', 'a2'), B: ready() },
      unpicked: new Set(['a1']),
    })
    expect(r).toEqual({ narrowed: true, groupIds: ['a2'], error: null })
  })
})
