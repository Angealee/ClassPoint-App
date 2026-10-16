/**
 * Matching the names in a spreadsheet to students in the app.
 *
 * ⚠ THIS IS THE RISKIEST CODE IN THE GRADES FEATURE. Everything else fails
 * loudly; a mis-matched name writes a real class's marks onto the wrong person
 * and nothing looks broken. So the rules here are deliberately conservative and
 * the screen above them never auto-resolves anything this file is unsure of.
 *
 * ⚠ `students.full_name` HAS NO UNIQUE CONSTRAINT anywhere in the schema, and
 * `create_students` never checked for duplicates — so two students with the
 * same name can already exist in one section today. Ambiguity is therefore a
 * first-class outcome, not an edge case.
 *
 * The one idea that does most of the work: compare a SORTED TOKEN SET rather
 * than a string. "Dela Cruz, Juan" and "Juan Dela Cruz" are the same set, which
 * removes the entire "Last, First" problem without a single special case.
 */

export type MatchBucket = 'exact' | 'ambiguous' | 'fuzzy' | 'unmatched'

export interface SheetRow {
  /** 0-based row index in the parsed sheet, for showing where it came from. */
  index: number
  rawName: string
}

export interface MatchCandidate {
  studentId: string
  fullName: string
}

export interface MatchResult {
  row: SheetRow
  bucket: MatchBucket
  /** One for exact and fuzzy, two or more for ambiguous, none for unmatched. */
  candidates: MatchCandidate[]
}

export interface MatchReport {
  rows: MatchResult[]
  /** Headings, totals and blanks — never shown as failures to match. */
  skipped: SheetRow[]
  /**
   * Students in the app with no row in the sheet.
   *
   * The bucket nobody asks for and the strongest signal the wrong file was
   * loaded — a silent omission here leaves someone ungraded.
   */
  missingFromSheet: MatchCandidate[]
}

/**
 * Filipino name particles, joined to the token that follows them.
 *
 * `de la cruz` → `delacruz`, so registrar spacing stops mattering. This is the
 * single most likely real mismatch in this roster.
 */
const PARTICLES = new Set(['de', 'del', 'dela', 'delos', 'delas', 'la', 'las', 'los', 'san', 'santa', 'santo', 'st', 'mc', 'mac'])

/** Generational suffixes carry no identity and are dropped. */
const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v'])

/**
 * Rows that are plainly not a person.
 *
 * A row is skipped only when EVERY token is one of these, so "Maria Student"
 * is still a person while "FULL NAME" — the literal header of the instructor's
 * sheet — is not.
 */
const NOT_A_NAME = new Set([
  'total',
  'totals',
  'name',
  'names',
  'full',
  'fullname',
  'student',
  'students',
  'no',
  'number',
  'id',
  'lrn',
  'section',
  'subject',
  'grade',
  'grades',
  'remarks',
  'rank',
  'average',
  'mean',
  'count',
  'summary',
])

/**
 * A name as a sorted token set.
 *
 * NFKD + mark-stripping so "Peña" and "Pena" agree; punctuation becomes a
 * separator so "Dela Cruz, Juan" and "Juan Dela Cruz" collapse to the same set.
 */
export function nameTokens(raw: string): string[] {
  const cleaned = raw
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  const out: string[] = []
  let particle = ''
  for (const token of cleaned) {
    if (SUFFIXES.has(token)) continue
    if (PARTICLES.has(token)) {
      particle += token
      continue
    }
    out.push(particle + token)
    particle = ''
  }
  // A trailing particle with nothing to attach to is still part of the name.
  if (particle) out.push(particle)

  return out.sort()
}

/** The key two names must share to be an EXACT match. */
export function exactKey(raw: string): string {
  return nameTokens(raw).join(' ')
}

/**
 * The key for a FUZZY match: the same set with single letters removed.
 *
 * ⚠ Dropping initials is a WEAKER claim, never an exact one. "Juan P. Dela
 * Cruz" and "Juan R. Dela Cruz" are two people and the initial is the only
 * thing telling them apart — so this key is only ever used to SUGGEST, and a
 * collision on it is reported as ambiguous rather than resolved.
 */
export function coreKey(raw: string): string {
  return nameTokens(raw)
    .filter((t) => t.length > 1)
    .join(' ')
}

/** Is this row a heading, a totals line or blank rather than a person? */
export function isLikelyHeading(raw: string): boolean {
  const tokens = nameTokens(raw)
  if (tokens.length === 0) return true
  return tokens.every((t) => NOT_A_NAME.has(t))
}

/**
 * Put every sheet row in a bucket.
 *
 * NOTHING here resolves an ambiguity or accepts a fuzzy match — both come back
 * for a person to decide. The screen pre-ticks `exact` and nothing else.
 */
export function matchRows(
  sheetNames: SheetRow[],
  students: MatchCandidate[],
): MatchReport {
  const byExact = new Map<string, MatchCandidate[]>()
  const byCore = new Map<string, MatchCandidate[]>()
  for (const student of students) {
    push(byExact, exactKey(student.fullName), student)
    push(byCore, coreKey(student.fullName), student)
  }

  const rows: MatchResult[] = []
  const skipped: SheetRow[] = []
  const claimed = new Set<string>()

  for (const row of sheetNames) {
    if (isLikelyHeading(row.rawName)) {
      skipped.push(row)
      continue
    }

    const exact = byExact.get(exactKey(row.rawName)) ?? []
    if (exact.length === 1) {
      rows.push({ row, bucket: 'exact', candidates: exact })
      claimed.add(exact[0].studentId)
      continue
    }
    if (exact.length > 1) {
      rows.push({ row, bucket: 'ambiguous', candidates: exact })
      continue
    }

    const core = byCore.get(coreKey(row.rawName)) ?? []
    if (core.length === 1) {
      rows.push({ row, bucket: 'fuzzy', candidates: core })
      continue
    }
    if (core.length > 1) {
      rows.push({ row, bucket: 'ambiguous', candidates: core })
      continue
    }

    rows.push({ row, bucket: 'unmatched', candidates: [] })
  }

  // Only EXACT matches count as covered. A student whose only row is fuzzy or
  // ambiguous is still at risk of being left out, and saying otherwise here
  // would hide them from the one list that exists to catch that.
  const missingFromSheet = students.filter((s) => !claimed.has(s.studentId))

  return { rows, skipped, missingFromSheet }
}

function push(map: Map<string, MatchCandidate[]>, key: string, value: MatchCandidate): void {
  if (key === '') return
  const list = map.get(key)
  if (list) list.push(value)
  else map.set(key, [value])
}
