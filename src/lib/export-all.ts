import { fetchFullBackup } from '@/lib/api'
import { getLevelProgress } from '@/lib/leveling'

// Like attendance-io/roster-io, `xlsx` is heavy and dynamic-imported so this
// module costs nothing until the instructor actually taps "Backup all".

const dt = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString() : '')
const d = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString() : '')

/**
 * Download EVERYTHING as one dated workbook — the off-site half of the backup
 * story (the nightly in-database snapshots are the other half). Five sheets:
 * Roster, Points ledger, Attendance, Sessions, Redemptions.
 */
export async function exportAllData(): Promise<void> {
  const [XLSX, data] = await Promise.all([import('xlsx'), fetchFullBackup()])

  const sectionName = new Map(data.sections.map((s) => [s.id, s.name]))
  const studentName = new Map(data.students.map((s) => [s.id, s.full_name]))
  const secretByStudent = new Map(data.secrets.map((s) => [s.student_id, s]))
  const sessionById = new Map(data.sessions.map((s) => [s.id, s]))

  const roster = data.students.map((s) => ({
    Section: sectionName.get(s.section_id) ?? '',
    'Full name': s.full_name,
    'Display name': s.display_name,
    Username: secretByStudent.get(s.id)?.username ?? '',
    Claimed: secretByStudent.get(s.id)?.claimed_at ? 'Yes' : 'No',
    Points: s.lifetime_points,
    Level: getLevelProgress(s.lifetime_points).level,
    Archived: s.archived_at ? d(s.archived_at) : '',
  }))

  const ledger = data.events.map((e) => ({
    Student: studentName.get(e.student_id) ?? '(deleted)',
    Points: e.points,
    Category: e.category,
    Note: e.note ?? '',
    When: dt(e.created_at),
  }))

  const attendance = data.records.map((r) => {
    const session = sessionById.get(r.session_id)
    return {
      Student: studentName.get(r.student_id) ?? '(deleted)',
      Section: session ? sectionName.get(session.section_id) ?? '' : '',
      'Session date': session ? d(session.started_at) : '',
      Topic: session?.topic ?? '',
      Status: r.status,
      'Checked in': dt(r.scanned_at),
      Finalised: r.committed ? 'Yes' : 'No',
    }
  })

  const sessions = data.sessions.map((s) => ({
    Section: sectionName.get(s.section_id) ?? '',
    Date: d(s.started_at),
    Topic: s.topic ?? '',
    Started: dt(s.started_at),
    Ended: dt(s.ended_at),
    Status: s.status,
    Finalised: s.penalties_committed ? 'Yes' : 'No',
  }))

  const redemptions = data.redemptions.map((r) => ({
    Student: studentName.get(r.student_id) ?? '(deleted)',
    Points: r.points,
    For: r.kind,
    Note: r.note ?? '',
    Status: r.status,
    Requested: dt(r.requested_at),
    Decided: dt(r.decided_at),
    'Decision note': r.decision_note ?? '',
  }))

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(roster), 'Roster')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ledger), 'Points ledger')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(attendance), 'Attendance')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sessions), 'Sessions')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(redemptions), 'Redemptions')

  const stamp = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `classpoint-full-backup-${stamp}.xlsx`)
}
