import type { TermKey } from '@/lib/types'

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
