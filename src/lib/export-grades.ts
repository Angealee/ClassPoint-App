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
  GradeItem,
  GradePolicy,
  GradeSumsRow,
  RosterPerson,
  TermKey,
} from '@/lib/types'

// `xlsx` (SheetJS) is heavy, so — like roster-io.ts and attendance-io.ts — it is
// imported dynamically and this module is only pulled in when the instructor
// actually exports.

const TERMS: TermKey[] = ['prelim', 'midterm', 'finals']
const TERM_LABEL: Record<TermKey, string> = {
  prelim: 'Prelim',
  midterm: 'Midterm',
  finals: 'Finals',
}

/**
 * Grade workbooks.
 *
 * ⚠ TWO RULES, BOTH INHERITED FROM MISTAKES THIS CODEBASE ALREADY MADE:
 *
 * 1. **An unmarked cell is BLANK, never 0.** A spreadsheet 0 gets averaged as
 *    one, so writing zeros would turn "not marked yet" into a real mark the
 *    moment anyone put `=AVERAGE()` under the column. Same rule `export-peer.ts`
 *    follows for an unrated student.
 *
 * 2. **Computed figures are written UNROUNDED.** The app displays two decimals,
 *    but a spreadsheet is a place people re-check arithmetic — rounding on the
 *    way out means a hand-recomputed total disagrees with the column beside it.
 *    Excel formats what it is given; it cannot recover precision thrown away.
 */

type Row = (string | number)[]

/** The header pair and body for one term, as an array-of-arrays sheet. */
export function buildTermSheet(
  students: RosterPerson[],
  items: GradeItem[],
  scores: Map<string, number>,
  policy: GradePolicy,
): Row[] {
  const live = orderedItems(items.filter((i) => i.archivedAt === null))

  // Two header rows, the shape `exportSectionRegister` already uses: names,
  // then what each one is out of.
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
      // Blank, not zero — see the header note.
      row.push(v === undefined ? '' : v)
      if (v !== undefined) marked.set(item.id, v)
    }

    const sums = sumsFromScores(live, marked)
    const comps = componentScores(sums, policy, 'official')
    for (const c of GRADE_COMPONENTS) row.push(comps[c])
    row.push(classStanding(comps, policy))
    const grade = termGrade(sums, policy, 'official')
    row.push(grade === null ? '' : grade)
    return row
  })

  return [nameRow, maxRow, ...body]
}

/**
 * The whole-subject summary: a term grade per term, then the final.
 *
 * A withheld final is BLANK with the reason in its own column — writing "No
 * Midterm" into the grade column would put text where a number belongs and
 * break every formula pointed at it, and writing a number there would be the
 * exact lie this feature exists to stop.
 */
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

/** Excel caps a sheet name at 31 characters and rejects : \ / ? * [ ]. */
function safeSheetName(name: string): string {
  return name.replace(/[:\\/?*[\]]/g, '-').slice(0, 31)
}

/** One term, one sheet — the download from the grade sheet itself. */
export async function exportTermGrades(
  sectionName: string,
  subjectCode: string,
  term: TermKey,
  students: RosterPerson[],
  items: GradeItem[],
  scores: Map<string, number>,
  policy: GradePolicy,
): Promise<void> {
  const XLSX = await import('xlsx')
  const sheet = XLSX.utils.aoa_to_sheet(buildTermSheet(students, items, scores, policy))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheet, safeSheetName(TERM_LABEL[term]))
  XLSX.writeFile(wb, fileName(`grades-${TERM_LABEL[term].toLowerCase()}`, sectionName, subjectCode))
}

export interface SubjectExportTerm {
  term: TermKey
  items: GradeItem[]
  scores: Map<string, number>
  policy: GradePolicy
}

/**
 * The whole subject: three term sheets plus Overall, in one workbook.
 *
 * The caller assembles the per-term data because it already has the paged reads
 * — three terms of a section is ~2,400 score rows, well past PostgREST's silent
 * 1000-row cap, so they come through `listGradeScores`, which pages.
 */
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
    const sheet = XLSX.utils.aoa_to_sheet(buildTermSheet(students, t.items, t.scores, t.policy))
    XLSX.utils.book_append_sheet(wb, sheet, safeSheetName(TERM_LABEL[t.term]))
  }

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(buildOverallSheet(overallRows, policies)),
    'Overall',
  )

  XLSX.writeFile(wb, fileName('grades', sectionName, subjectCode))
}
