import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  INSTRUCTOR_LIMITS,
  instructorName,
  instructorTitle,
  profileError,
} from './instructor-identity'

describe('instructor identity', () => {
  it('falls back to the role when nothing is set, never to an empty string', () => {
    expect(instructorName(null)).toBe('Instructor')
    expect(
      instructorName({ displayName: '   ', title: null, bio: null, avatarUrl: null }),
    ).toBe('Instructor')
    expect(instructorTitle(null)).toBe('Instructor')
  })

  it('uses what the instructor wrote, trimmed', () => {
    const p = { displayName: '  Koby Macale ', title: ' Instructor, IT ', bio: null, avatarUrl: null }
    expect(instructorName(p)).toBe('Koby Macale')
    expect(instructorTitle(p)).toBe('Instructor, IT')
  })
})

describe('profileError mirrors update_instructor_profile', () => {
  const ok = { displayName: 'Koby Macale', title: 'Instructor', bio: 'Hi' }

  it('accepts a normal profile and an empty name (which means "use the role")', () => {
    expect(profileError(ok)).toBeNull()
    expect(profileError({ ...ok, displayName: '' })).toBeNull()
  })

  it('enforces the same name length the SQL does, on the trimmed value', () => {
    expect(profileError({ ...ok, displayName: 'K' })).not.toBeNull()
    expect(profileError({ ...ok, displayName: ' K ' })).not.toBeNull()
    expect(profileError({ ...ok, displayName: 'x'.repeat(INSTRUCTOR_LIMITS.nameMax) })).toBeNull()
    expect(
      profileError({ ...ok, displayName: 'x'.repeat(INSTRUCTOR_LIMITS.nameMax + 1) }),
    ).not.toBeNull()
  })

  it('enforces the title and bio ceilings', () => {
    expect(
      profileError({ ...ok, title: 'x'.repeat(INSTRUCTOR_LIMITS.titleMax + 1) }),
    ).not.toBeNull()
    expect(profileError({ ...ok, bio: 'x'.repeat(INSTRUCTOR_LIMITS.bioMax + 1) })).not.toBeNull()
    expect(profileError({ ...ok, bio: 'x'.repeat(INSTRUCTOR_LIMITS.bioMax) })).toBeNull()
  })

  it('stays in step with the migration: the numbers in 0071 are the numbers here', () => {
    // A cheap drift guard: the SQL file states each ceiling in its own words.
    const sql = readFileSync(
      join(process.cwd(), 'supabase/migrations/0071_instructor_profile.sql'),
      'utf8',
    )
    expect(sql).toMatch(
      new RegExp(`between ${INSTRUCTOR_LIMITS.nameMin} and ${INSTRUCTOR_LIMITS.nameMax}`),
    )
    expect(sql).toMatch(new RegExp(`<= ${INSTRUCTOR_LIMITS.titleMax}`))
    expect(sql).toMatch(new RegExp(`<= ${INSTRUCTOR_LIMITS.bioMax}`))
  })
})
