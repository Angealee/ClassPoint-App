import type { TermKey } from '@/lib/types'

/**
 * Which grade sheet you were last looking at.
 *
 * `/teach/grades` is a resolver, not a screen (see GradesEntry), so it needs
 * somewhere to resolve TO. localStorage rather than a table for the reason
 * `session-presets.ts` already records: one instructor, a personal convenience,
 * and losing it costs two taps.
 *
 * ⚠ Every read and write is wrapped and degrades silently — `localStorage`
 *   throws outright in some private-browsing modes, and a remembered scope is
 *   never worth taking the screen down for. A failed read simply means the
 *   resolver falls back to the first section × subject pairing.
 *
 * NOT scoped by semester, deliberately: `GradesEntry` validates the saved
 * pairing against the sections and subjects that currently exist, so a scope
 * left over from a finished semester is discarded there rather than here. One
 * place decides whether a scope is still real.
 */
const KEY = 'cp_grade_scope_v1'

export interface GradeScope {
  sectionId: string
  subjectId: string
  term: TermKey | 'overall'
}

const TERMS = new Set(['prelim', 'midterm', 'finals', 'overall'])

export function readGradeScope(): GradeScope | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<GradeScope>
    // Validated rather than trusted: a hand-edited or half-written entry would
    // otherwise put `undefined` into a URL and route to a 404 of our own making.
    if (
      typeof parsed.sectionId !== 'string' ||
      typeof parsed.subjectId !== 'string' ||
      typeof parsed.term !== 'string' ||
      !parsed.sectionId ||
      !parsed.subjectId ||
      !TERMS.has(parsed.term)
    ) {
      return null
    }
    return parsed as GradeScope
  } catch {
    return null
  }
}

export function writeGradeScope(scope: GradeScope): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(scope))
  } catch {
    /* a blocked store costs the convenience, never the screen */
  }
}
