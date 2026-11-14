import { getPeerResults } from '@/lib/api'
import type { PeerEvaluationListItem } from '@/lib/types'

export async function exportPeerScores(
  evaluation: PeerEvaluationListItem,
  sectionId?: string,
): Promise<void> {
  const [XLSX, rows] = await Promise.all([
    import('xlsx'),
    getPeerResults(evaluation.id, sectionId),
  ])

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
      row[c.label] = hit ? hit.avg : ''
      row[`${c.label} %`] = hit ? hit.pct : ''
    }
    row['Overall %'] = r.overallPct ?? ''
    row['Overall raw'] = r.overallRaw ?? ''
    return row
  })

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheet), 'Scores')

  const safe = evaluation.title.replace(/[^\w\s-]/g, '').trim() || 'peer-evaluation'
  XLSX.writeFile(wb, `${safe}, scores.xlsx`)
}
