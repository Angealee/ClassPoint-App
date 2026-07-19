import type { AttendanceRosterRow, SectionRegister, StudentAttendanceStat } from '@/lib/types'

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

/** One-letter status codes for the register matrix (blank = no record). */
const STATUS_LETTER: Record<string, string> = {
  present: 'P',
  late: 'L',
  absent: 'A',
  excused: 'E',
  irregular: 'I',
}

/**
 * The traditional class-record matrix: a row per student, a column per session
 * (dated), cells P/L/A/E/I, plus per-student totals + rate. Two header rows
 * (dates, then topics) via aoa_to_sheet.
 */
export async function exportSectionRegister(
  sectionName: string,
  register: SectionRegister,
): Promise<void> {
  const XLSX = await import('xlsx')
  const { sessions, students, statuses } = register

  const shortDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

  const dateRow = ['Student', ...sessions.map((s) => shortDate(s.startedAt)), 'P', 'L', 'A', 'Rate']
  const topicRow = ['', ...sessions.map((s) => s.topic ?? ''), '', '', '', '']

  const body = students.map((stu) => {
    const row: (string | number)[] = [stu.fullName]
    let p = 0
    let l = 0
    let a = 0
    let counted = 0
    for (const sess of sessions) {
      const st = statuses[stu.id]?.[sess.id]
      row.push(st ? STATUS_LETTER[st] ?? '' : '')
      if (st === 'present') p++
      if (st === 'late') l++
      if (st === 'absent') a++
      // Neutral (excused/irregular) excluded from the rate, as everywhere.
      if (st === 'present' || st === 'late' || st === 'absent') counted++
    }
    row.push(p, l, a, counted ? `${Math.round(((p + l) / counted) * 100)}%` : '—')
    return row
  })

  const sheet = XLSX.utils.aoa_to_sheet([dateRow, topicRow, ...body])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheet, 'Register')
  const safeSection = (sectionName || 'section').replace(/[^\w-]+/g, '_')
  const stamp = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `classpoint-register-${safeSection}-${stamp}.xlsx`)
}
