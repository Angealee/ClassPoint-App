import type { InstructorProfile } from '@/lib/types'

/*
 * Two identities (the instructor's call): "ClassPoint" is the official voice (the logo,
 * announcements, events, class updates) and the instructor is a person with a profile of their
 * own. ClassPoint needs no storage, so it is a constant here; the person is stored by 0071.
 */
export const CLASSPOINT = {
  name: 'ClassPoint',
  blurb: 'Announcements, events and class updates from the app.',
} as const

export const INSTRUCTOR_ROLE = 'Instructor'

/** The limits below MIRROR update_instructor_profile (0071). Change one side, change the other. */
export const INSTRUCTOR_LIMITS = { nameMin: 2, nameMax: 40, titleMax: 40, bioMax: 160 } as const

export const instructorName = (p: InstructorProfile | null): string =>
  p?.displayName?.trim() || INSTRUCTOR_ROLE

export const instructorTitle = (p: InstructorProfile | null): string =>
  p?.title?.trim() || INSTRUCTOR_ROLE

/** A sentence for the first rule broken, or null when the profile can be saved. */
export function profileError(input: {
  displayName: string
  title: string
  bio: string
}): string | null {
  const name = input.displayName.trim()
  const { nameMin, nameMax, titleMax, bioMax } = INSTRUCTOR_LIMITS
  if (name.length > 0 && (name.length < nameMin || name.length > nameMax)) {
    return `Your name needs ${nameMin} to ${nameMax} characters.`
  }
  if (input.title.trim().length > titleMax) return `Your title can be up to ${titleMax} characters.`
  if (input.bio.trim().length > bioMax) return `Your bio can be up to ${bioMax} characters.`
  return null
}
