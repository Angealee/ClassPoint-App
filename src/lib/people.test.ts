import { describe, expect, it } from 'vitest'
import { filterPeople } from './people'
import type { SpacePerson } from './types'

const P = (id: string, displayName: string, sectionId: string | null): SpacePerson => ({
  id,
  displayName,
  avatarUrl: null,
  semesterPoints: 0,
  sectionId,
  rank: null,
})

const people = [
  P('1', 'Ana Reyes', 'A'),
  P('2', 'Juan Dela Cruz', 'A'),
  P('3', 'Niño Santos', 'B'),
  P('4', 'Maria Cruz', 'B'),
  P('5', 'No Section', null),
]

describe('filterPeople', () => {
  it('"my class" is exactly my section', () => {
    const r = filterPeople(people, { scope: 'class', mySectionId: 'A' })
    expect(r.map((p) => p.id)).toEqual(['1', '2'])
  })

  it('"my class" with no known section is EMPTY, never everyone', () => {
    expect(filterPeople(people, { scope: 'class', mySectionId: null })).toEqual([])
  })

  it('batch is everyone, and a section narrows it', () => {
    expect(filterPeople(people, { scope: 'batch', mySectionId: 'A' })).toHaveLength(5)
    const b = filterPeople(people, { scope: 'batch', mySectionId: 'A', sectionId: 'B' })
    expect(b.map((p) => p.id)).toEqual(['3', '4'])
  })

  it('every query word must match, in any order', () => {
    const r = filterPeople(people, { scope: 'batch', mySectionId: 'A', query: 'cruz juan' })
    expect(r.map((p) => p.id)).toEqual(['2'])
  })

  it('folds case and accents', () => {
    const r = filterPeople(people, { scope: 'batch', mySectionId: 'A', query: 'NINO' })
    expect(r.map((p) => p.id)).toEqual(['3'])
  })

  it('a blank query changes nothing and the server order is kept', () => {
    const r = filterPeople(people, { scope: 'batch', mySectionId: 'A', query: '   ' })
    expect(r.map((p) => p.id)).toEqual(['1', '2', '3', '4', '5'])
  })

  it('scope and query combine', () => {
    const r = filterPeople(people, { scope: 'class', mySectionId: 'B', query: 'cruz' })
    expect(r.map((p) => p.id)).toEqual(['4'])
  })
})
