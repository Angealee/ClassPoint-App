/**
 * The per-term attendance workbook (Phase G).
 *
 * ATTENDANCE ONLY, and that is the instructor's explicit rule rather than a
 * limitation: points are NEVER turned into a grade. Points reach a grade only
 * through an individually-approved redemption, never through a formula — so
 * there is no points column here, and no computed score of any kind. Raw
 * numbers; the instructor applies their own arithmetic.
 *
 * xlsx is dynamically imported so it stays off the main bundle.
 */
import { getTermAttendance } from '@/lib/api'
import type { Section, TermKey } from '@/lib/types'

const TERM_LABEL: Record<TermKey, string> = {
  prelim: 'Prelim',
  midterm: 'Midterm',
  finals: 'Finals',
}

/**
 * One sheet per section for a single term.
 *
 * Sections are fetched sequentially on purpose: this runs against the same
 * instructor-gated RPC for every section, and firing a dozen at once buys a
 * second of wall-clock at the cost of a burst that can trip rate limits.
 */
export async function exportTermWorkbook(
  sections: Section[],
  term: TermKey,
  semesterName: string,
): Promise<void> {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  let anyRows = false

  for (const section of sections) {
    let rows
    try {
      rows = await getTermAttendance(section.id, term)
    } catch {
      // A section whose semester has no dates for this term shouldn't kill the
      // whole export — skip it and keep going.
      continue
    }
    if (rows.length === 0) continue
    anyRows = true

    const sheet = rows.map((r) => ({
      Student: r.fullName,
      'Display name': r.displayName,
      Present: r.present,
      Late: r.late,
      Absent: r.absent,
      Excused: r.excused,
      Irregular: r.irregular,
      'Classes counted': r.counted,
      'Show-up rate %': r.showUpRate,
    }))

    // Excel sheet names cap at 31 chars and reject : \ / ? * [ ]
    const safe = section.name.replace(/[:\\/?*[\]]/g, '-').slice(0, 31)
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheet), safe)
  }

  if (!anyRows) {
    throw new Error(`No attendance recorded in ${TERM_LABEL[term]} yet.`)
  }

  const stamp = new Date().toISOString().slice(0, 10)
  const slug = semesterName.replace(/[^\w]+/g, '-').replace(/^-|-$/g, '')
  XLSX.writeFile(wb, `attendance-${slug}-${TERM_LABEL[term].toLowerCase()}-${stamp}.xlsx`)
}
