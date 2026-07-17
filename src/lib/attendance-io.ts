import type { AttendanceRosterRow, StudentAttendanceStat } from '@/lib/types'

// `xlsx` (SheetJS) is heavy, so — like roster-io.ts — it's imported dynamically
// and this module is only pulled in when the instructor actually exports.

const STATUS_LABEL: Record<string, string> = {
  present: 'Present',
  late: 'Late',
  absent: 'Absent',
  excused: 'Excused',
  irregular: 'Irregular',
}

/**
 * Download one class session's attendance as an .xlsx: a row per student with
 * their status and check-in time.
 */
export async function exportSessionAttendance(
  sectionName: string,
  sessionLabel: string,
  startedAt: string,
  rows: AttendanceRosterRow[],
): Promise<void> {
  const XLSX = await import('xlsx')
  const data = rows.map((r) => ({
    Student: r.fullName,
    Status: r.status ? STATUS_LABEL[r.status] : '—',
    'Checked in': r.scannedAt ? new Date(r.scannedAt).toLocaleString() : '',
  }))
  const sheet = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheet, 'Attendance')
  const safeSection = (sectionName || 'section').replace(/[^\w-]+/g, '_')
  const safeLabel = (sessionLabel || 'session').replace(/[^\w-]+/g, '_')
  const stamp = new Date(startedAt).toISOString().slice(0, 10)
  XLSX.writeFile(wb, `classpoint-attendance-${safeSection}-${safeLabel}-${stamp}.xlsx`)
}

/**
 * Download the whole-term summary: a row per student with their per-status
 * totals and show-up rate. Excused/irregular are reported but excluded from
 * the rate, matching how the app computes it everywhere else.
 */
export async function exportAttendanceSummary(
  sectionName: string,
  stats: StudentAttendanceStat[],
): Promise<void> {
  const XLSX = await import('xlsx')
  const data = stats.map((s) => ({
    Student: s.fullName,
    Present: s.present,
    Late: s.late,
    Absent: s.absent,
    Excused: s.excused,
    Irregular: s.irregular,
    'Sessions counted': s.counted,
    'Attendance %': s.rate === null ? '—' : Math.round(s.rate * 100),
  }))
  const sheet = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheet, 'Summary')
  const safeSection = (sectionName || 'section').replace(/[^\w-]+/g, '_')
  const stamp = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `classpoint-attendance-summary-${safeSection}-${stamp}.xlsx`)
}
