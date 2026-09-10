import { getPeerResults } from '@/lib/api'
import type { PeerEvaluationListItem } from '@/lib/types'

/**
 * The peer evaluation scores workbook.
 *
 * ── SCORES ONLY. COMMENTS STAY IN THE APP (decision 16) ────────────────────
 * A comment is a student's words about a classmate, written on a promise of
 * anonymity. A spreadsheet gets mailed, copied onto a shared drive and opened
 * on a projector; the app is where that promise can still be kept. The scores
 * are the part an instructor needs to compute anything with.
 *
 * ── COLUMN HEADERS COME FROM THE CRITERIA, NOT FROM A STUDENT'S ROW ────────
 * peer2peer built its header row from the first student's score array, so a
 * first student who happened to receive no ratings produced a sheet with no
 * columns. Here the criteria are read from whoever HAS results and every row is
 * filled against that list, so a student with nothing scored is an empty row
 * rather than a missing header.
 *
 * xlsx is dynamically imported so it stays off the main bundle.
 */
export async function exportPeerScores(
  evaluation: PeerEvaluationListItem,
  sectionId?: string,
): Promise<void> {
  const [XLSX, rows] = await Promise.all([
    import('xlsx'),
    getPeerResults(evaluation.id, sectionId),
  ])

  // The criteria list, in the order the instructor defined it. Taken from the
  // first student who actually has one — every row carries the same list, and
  // an unrated student carries none at all.
  const columns = rows.find((r) => r.criteria.length > 0)?.criteria ?? []

  const sheet = rows.map((r) => {
    const row: Record<string, string | number> = {
      Student: r.fullName,
      'Display name': r.displayName,
      Section: r.sectionName,
      Group: r.groupName ?? '',
      Raters: r.raterCount,
    }
    for (const c of columns) {
      const hit = r.criteria.find((x) => x.id === c.id)
      // Blank, not 0. A student nobody rated did not score zero, and a
      // spreadsheet that says 0 will be averaged as one.
      row[c.label] = hit ? hit.avg : ''
      row[`${c.label} %`] = hit ? hit.pct : ''
    }
    row['Overall %'] = r.overallPct ?? ''
    // Labelled raw and kept beside the percentage rather than instead of it.
    // When the criteria use different scales this is a mean across mixed units;
    // the header says raw so nobody reads it as a mark.
    row['Overall raw'] = r.overallRaw ?? ''
    return row
  })

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheet), 'Scores')

  const safe = evaluation.title.replace(/[^\w\s-]/g, '').trim() || 'peer-evaluation'
  XLSX.writeFile(wb, `${safe} — scores.xlsx`)
}
