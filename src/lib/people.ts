import type { SpacePerson } from '@/lib/types'

export type PeopleScope = 'class' | 'batch'

export interface PeopleFilter {
  scope: PeopleScope
  /** The viewer's own section — what "My class" means. */
  mySectionId: string | null
  /** Batch only: narrow to one section. Empty / null = every section. */
  sectionId?: string | null
  query?: string
}

/** Lower-case and strip accents, so "ñ" matches "n" and a search is forgiving. */
function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * The People directory's one filtering rule.
 *
 *  - "My class" is exactly the viewer's own section. With no section known it is
 *    EMPTY rather than falling back to everyone — "my classmates" must never
 *    quietly become "the whole batch".
 *  - "Batch" is everyone the roster RPC returned; `sectionId` narrows it.
 *  - Every word of the query must appear in the name (order-free), so
 *    "cruz juan" finds "Juan Dela Cruz".
 *
 * Order is preserved: the server already sorts by name.
 */
export function filterPeople(people: SpacePerson[], f: PeopleFilter): SpacePerson[] {
  const words = fold(f.query ?? '').split(/\s+/).filter(Boolean)
  return people.filter((p) => {
    if (f.scope === 'class') {
      if (!f.mySectionId || p.sectionId !== f.mySectionId) return false
    } else if (f.sectionId && p.sectionId !== f.sectionId) {
      return false
    }
    if (words.length === 0) return true
    const name = fold(p.displayName)
    return words.every((w) => name.includes(w))
  })
}
