import type { SectionStudent } from '@/lib/types'
import { getLevelProgress } from '@/lib/leveling'

// `xlsx` (SheetJS) is heavy, so it's imported dynamically here — this whole
// module is only pulled in when the instructor actually imports or exports,
// keeping it out of the initial bundle.

/**
 * Parse a roster file (.xlsx/.xls/.csv) into a list of student full names.
 *
 * Detection is forgiving:
 *  - If the first row contains a header cell matching /name|student/i, names are
 *    read from that column.
 *  - Otherwise the first column is treated as the names column.
 * Blank cells are skipped.
 */
export async function parseRosterNames(file: File): Promise<string[]> {
  const XLSX = await import('xlsx')
  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  if (!sheet) return []

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false })
  if (rows.length === 0) return []

  const header = rows[0].map((c) => String(c ?? '').trim())
  const nameColIdx = header.findIndex((h) => /name|student/i.test(h))
  const hasHeader = nameColIdx !== -1
  const col = hasHeader ? nameColIdx : 0
  const dataRows = hasHeader ? rows.slice(1) : rows

  return dataRows
    .map((r) => String(r[col] ?? '').trim())
    .filter((name) => name.length > 0)
}

/**
 * Download the current section's roster as an .xlsx file: one row per student
 * with their public/private names, claim status, level, points, and token.
 */
export async function exportRoster(
  sectionName: string,
  students: SectionStudent[],
): Promise<void> {
  const XLSX = await import('xlsx')
  const rows = students.map((s) => ({
    'Full name': s.full_name,
    'Display name': s.display_name,
    Username: s.username ?? '',
    Status: s.claimed_at ? 'Claimed' : 'Unclaimed',
    Level: getLevelProgress(s.lifetime_points).level,
    Points: s.lifetime_points,
    'Claim token': s.claimed_at ? '' : s.claim_token,
  }))
  const sheet = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheet, sectionName || 'Roster')
  const safe = (sectionName || 'roster').replace(/[^\w-]+/g, '_')
  const stamp = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `classpoint-${safe}-${stamp}.xlsx`)
}
