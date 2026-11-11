import { fileName } from '@/lib/attendance-io'
import {
  classStanding,
  componentScores,
  COMPONENT_LABEL,
  GRADE_COMPONENTS,
  orderedItems,
  sumsFromScores,
  termGrade,
  cellKey,
} from '@/lib/grading'
import { finalGradeFor } from '@/lib/grade-impact'
import type {
  GradeAttendance,
  GradeItem,
  GradePolicy,
  GradeSumsRow,
  RosterPerson,
  TermKey,
} from '@/lib/types'

const TERMS: TermKey[] = ['prelim', 'midterm', 'finals']
const TERM_LABEL: Record<TermKey, string> = {
  prelim: 'Prelim',
  midterm: 'Midterm',
  finals: 'Finals',
}

type Row = (string | number)[]

export function buildTermSheet(
  students: RosterPerson[],
  items: GradeItem[],
  scores: Map<string, number>,
  policy: GradePolicy,
  attendance?: Map<string, GradeAttendance>,
  absences?: Map<string, unknown>,
): Row[] {
  const live = orderedItems(items.filter((i) => i.archivedAt === null))

  const nameRow: Row = [
    'Student',
    ...live.map((i) => i.name),
    ...GRADE_COMPONENTS.map((c) => COMPONENT_LABEL[c]),
    'Class Standing',
    'Term Grade',
  ]
  const maxRow: Row = [
    'Out of',
    ...live.map((i) => i.maxScore),
    ...GRADE_COMPONENTS.map(() => ''),
    '',
    '',
  ]

  const body: Row[] = students.map((student) => {
    const marked = new Map<string, number>()
    const row: Row = [student.fullName]

    for (const item of live) {
      const v = scores.get(cellKey(item.id, student.id))
      row.push(
        v === undefined ? (absences?.has(cellKey(item.id, student.id)) ? 'A' : '') : v,
      )
      if (v !== undefined) marked.set(item.id, v)
    }

    const sums = sumsFromScores(live, marked, attendance?.get(student.id))
    const comps = componentScores(sums, policy, 'official')
    for (const c of GRADE_COMPONENTS) row.push(comps[c])
    row.push(classStanding(comps, policy))
    const grade = termGrade(sums, policy, 'official')
    row.push(grade === null ? '' : grade)
    return row
  })

  return [nameRow, maxRow, ...body]
}

export function buildOverallSheet(rows: GradeSumsRow[], policies: GradePolicy[]): Row[] {
  const byStudent = new Map<string, GradeSumsRow[]>()
  for (const row of rows) {
    const list = byStudent.get(row.studentId)
    if (list) list.push(row)
    else byStudent.set(row.studentId, [row])
  }

  const header: Row = ['Student', ...TERMS.map((t) => TERM_LABEL[t]), 'Final Grade', 'Note']
  const weights: Row = [
    'Weight',
    ...TERMS.map((t) => policies.find((p) => p.term === t)?.finalWeight ?? ''),
    '',
    '',
  ]

  const body = [...byStudent.values()]
    .map((studentRows) => {
      const row: Row = [studentRows[0].fullName]
      const missing: string[] = []

      for (const term of TERMS) {
        const policy = policies.find((p) => p.term === term)
        const r = studentRows.find((x) => x.term === term)
        const grade = policy && r ? termGrade(r.sums, policy, 'official') : null
        row.push(grade === null ? '' : grade)
        if (grade === null && (policy?.finalWeight ?? 0) > 0) missing.push(TERM_LABEL[term])
      }

      const final = finalGradeFor(studentRows, policies)
      row.push(final === null ? '' : final)
      row.push(missing.length > 0 ? `No ${missing.join(' / ')}` : '')
      return { name: studentRows[0].fullName, row }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((x) => x.row)

  return [header, weights, ...body]
}

function safeSheetName(name: string): string {
  return name.replace(/[:\\/?*[\]]/g, '-').slice(0, 31)
}

export async function exportTermGrades(
  sectionName: string,
  subjectCode: string,
  term: TermKey,
  students: RosterPerson[],
  items: GradeItem[],
  scores: Map<string, number>,
  policy: GradePolicy,
  attendance?: Map<string, GradeAttendance>,
  absences?: Map<string, unknown>,
): Promise<void> {
  const XLSX = await import('xlsx')
  const sheet = XLSX.utils.aoa_to_sheet(
    buildTermSheet(students, items, scores, policy, attendance, absences),
  )
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheet, safeSheetName(TERM_LABEL[term]))
  XLSX.writeFile(wb, fileName(`grades-${TERM_LABEL[term].toLowerCase()}`, sectionName, subjectCode))
}

export interface SubjectExportTerm {
  term: TermKey
  items: GradeItem[]
  scores: Map<string, number>
  policy: GradePolicy
  attendance?: Map<string, GradeAttendance>
  absences?: Map<string, unknown>
}

export async function exportSubjectGrades(
  sectionName: string,
  subjectCode: string,
  students: RosterPerson[],
  terms: SubjectExportTerm[],
  overallRows: GradeSumsRow[],
  policies: GradePolicy[],
): Promise<void> {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()

  for (const t of terms) {
    const sheet = XLSX.utils.aoa_to_sheet(
      buildTermSheet(students, t.items, t.scores, t.policy, t.attendance, t.absences),
    )
    XLSX.utils.book_append_sheet(wb, sheet, safeSheetName(TERM_LABEL[t.term]))
  }

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(buildOverallSheet(overallRows, policies)),
    'Overall',
  )

  XLSX.writeFile(wb, fileName('grades', sectionName, subjectCode))
}
