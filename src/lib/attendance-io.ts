import type { AttendanceRosterRow, SectionRegister, StudentAttendanceStat } from '@/lib/types'

const STATUS_LABEL: Record<string, string> = {
  present: 'Present',
  late: 'Late',
  absent: 'Absent',
  excused: 'Excused',
  irregular: 'Irregular',
}

export async function exportSessionAttendance(
  sectionName: string,
  sessionLabel: string,
  startedAt: string,
  rows: AttendanceRosterRow[],
): Promise<void> {
  const XLSX = await import('xlsx')
  const data = rows.map((r) => ({
    Student: r.fullName,
    Status: r.status ? STATUS_LABEL[r.status] : '-',
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

export async function exportAttendanceSummary(
  sectionName: string,
  stats: StudentAttendanceStat[],
  subjectCode?: string | null,
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
    'Attendance %': s.rate === null ? '-' : Math.round(s.rate * 100),
  }))
  const sheet = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheet, 'Summary')
  XLSX.writeFile(wb, fileName('attendance-summary', sectionName, subjectCode))
}

const STATUS_LETTER: Record<string, string> = {
  present: 'P',
  late: 'L',
  absent: 'A',
  excused: 'E',
  irregular: 'I',
}

export async function exportSectionRegister(
  sectionName: string,
  register: SectionRegister,
  subjectCode?: string | null,
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
      if (st === 'present' || st === 'late' || st === 'absent') counted++
    }
    row.push(p, l, a, counted ? `${Math.round(((p + l) / counted) * 100)}%` : '-')
    return row
  })

  const mixed = new Set(sessions.map((s) => s.subjectCode ?? '')).size > 1
  const subjectRow = mixed
    ? [['', ...sessions.map((s) => s.subjectCode ?? '-'), '', '', '', '']]
    : []

  const sheet = XLSX.utils.aoa_to_sheet([dateRow, ...subjectRow, topicRow, ...body])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheet, 'Register')
  XLSX.writeFile(wb, fileName('register', sectionName, subjectCode))
}

export function fileName(kind: string, sectionName: string, subjectCode?: string | null): string {
  const safe = (v: string) => v.replace(/[^\w-]+/g, '_')
  const parts = [
    'classpoint',
    kind,
    safe(sectionName || 'section'),
    ...(subjectCode ? [safe(subjectCode)] : []),
    new Date().toISOString().slice(0, 10),
  ]
  return `${parts.join('-')}.xlsx`
}
