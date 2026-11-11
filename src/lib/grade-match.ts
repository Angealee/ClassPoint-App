
export type MatchBucket = 'exact' | 'ambiguous' | 'fuzzy' | 'unmatched'

export interface SheetRow {
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
  candidates: MatchCandidate[]
}

export interface MatchReport {
  rows: MatchResult[]
  skipped: SheetRow[]
  missingFromSheet: MatchCandidate[]
}

const PARTICLES = new Set(['de', 'del', 'dela', 'delos', 'delas', 'la', 'las', 'los', 'san', 'santa', 'santo', 'st', 'mc', 'mac'])

const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv'])

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
  if (particle) out.push(particle)

  return out.sort()
}

/** The key two names must share to be an EXACT match. */
export function exactKey(raw: string): string {
  return nameTokens(raw).join(' ')
}

export function coreKey(raw: string): string {
  return nameTokens(raw)
    .filter((t) => t.length > 1)
    .join(' ')
}

export function isLikelyHeading(raw: string): boolean {
  const tokens = nameTokens(raw)
  if (tokens.length === 0) return true
  return tokens.every((t) => NOT_A_NAME.has(t))
}

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

  const missingFromSheet = students.filter((s) => !claimed.has(s.studentId))

  return { rows, skipped, missingFromSheet }
}

function push(map: Map<string, MatchCandidate[]>, key: string, value: MatchCandidate): void {
  if (key === '') return
  const list = map.get(key)
  if (list) list.push(value)
  else map.set(key, [value])
}
