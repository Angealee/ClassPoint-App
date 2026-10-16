import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  getSectionGradeSums,
  getStudent,
  listGradePolicies,
  listSections,
  listSubjects,
  loadTermCalendar,
} from '@/lib/api'
import { displayGrade, termGrade } from '@/lib/grading'
import { finalGradeFor } from '@/lib/grade-impact'
import { errorText } from '@/lib/errors'
import { useForcedLightTheme, PrintChrome } from './printChrome'
import { StudentGradeBreakdown } from './StudentGradeBreakdown'
import type {
  GradePolicy,
  GradeSumsRow,
  InstructorStudentDetail,
  Subject,
  TermKey,
} from '@/lib/types'

const TERMS: TermKey[] = ['prelim', 'midterm', 'finals']
const TERM_LABEL: Record<TermKey, string> = {
  prelim: 'Prelim',
  midterm: 'Midterm',
  finals: 'Finals',
}

/**
 * The class grade sheet, for signing and submitting.
 *
 * Names down, the three term grades across, the final computed grade, and a
 * note naming any term that is still missing. PORTRAIT: five columns fit
 * comfortably, and this is the sheet that actually gets handed in — the full
 * item-by-item working lives on a student's own printout instead.
 *
 * Registered OUTSIDE InstructorLayout (the StudentReport precedent), so it must
 * load the term calendar itself — a route under the layout gets that for free,
 * and this one would otherwise print against term.ts's fallback dates.
 */
export function GradesPrint() {
  const { sectionId = '', subjectId = '' } = useParams()
  const navigate = useNavigate()
  useForcedLightTheme()

  const [sectionName, setSectionName] = useState('')
  const [subject, setSubject] = useState<Subject | null>(null)
  const [rows, setRows] = useState<GradeSumsRow[]>([])
  const [policies, setPolicies] = useState<GradePolicy[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function run() {
      try {
        await loadTermCalendar()
        const [sections, sums, pols] = await Promise.all([
          listSections(),
          getSectionGradeSums(sectionId, subjectId),
          listGradePolicies(subjectId),
        ])
        const section = sections.find((s) => s.id === sectionId)
        const subs = section ? await listSubjects(section.semesterId) : []
        if (cancelled) return
        setSectionName(section?.name ?? '')
        setSubject(subs.find((s) => s.id === subjectId) ?? null)
        setRows(sums)
        setPolicies(pols)
      } catch (e) {
        if (!cancelled) setLoadError(errorText(e, 'Could not load these grades.'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [sectionId, subjectId])

  const lines = groupLines(rows, policies)

  return (
    <PrintChrome
      title={`Grade sheet · ${subject?.code ?? ''} ${sectionName}`.trim()}
      subtitle={subject?.name}
      onBack={() => navigate(-1)}
      loading={loading}
      // Printed ON the paper, not just on screen: a page of dashes otherwise
      // reads as "nobody has a grade" rather than "this failed to load".
      loadError={loadError}
    >
      <table className="gp-table">
        <thead>
          <tr>
            <th className="gp-left">Student</th>
            {TERMS.map((t) => (
              <th key={t}>
                {TERM_LABEL[t]}
                <span className="gp-weight">
                  {Math.round((policies.find((p) => p.term === t)?.finalWeight ?? 0) * 100)}%
                </span>
              </th>
            ))}
            <th>Final</th>
            <th className="gp-left">Note</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.studentId}>
              <td className="gp-left">{line.fullName}</td>
              {TERMS.map((t) => (
                <td key={t}>{displayGrade(line.terms[t])}</td>
              ))}
              <td className="gp-strong">{displayGrade(line.final)}</td>
              <td className="gp-left gp-note">{line.note}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {lines.length === 0 && !loading && !loadError && (
        <p className="gp-muted">No students in this section.</p>
      )}

      <div className="gp-signatures">
        <div>
          <div className="gp-rule" />
          Instructor
        </div>
        <div>
          <div className="gp-rule" />
          Department Head
        </div>
      </div>
    </PrintChrome>
  )
}

interface Line {
  studentId: string
  fullName: string
  terms: Record<TermKey, number | null>
  final: number | null
  note: string
}

function groupLines(rows: GradeSumsRow[], policies: GradePolicy[]): Line[] {
  const byStudent = new Map<string, GradeSumsRow[]>()
  for (const row of rows) {
    const list = byStudent.get(row.studentId)
    if (list) list.push(row)
    else byStudent.set(row.studentId, [row])
  }

  return [...byStudent.values()]
    .map((studentRows) => {
      const terms = {} as Record<TermKey, number | null>
      const missing: string[] = []
      for (const term of TERMS) {
        const policy = policies.find((p) => p.term === term)
        const r = studentRows.find((x) => x.term === term)
        const grade = policy && r ? termGrade(r.sums, policy, 'official') : null
        terms[term] = grade
        if (grade === null && (policy?.finalWeight ?? 0) > 0) missing.push(TERM_LABEL[term])
      }
      return {
        studentId: studentRows[0].studentId,
        fullName: studentRows[0].fullName,
        terms,
        final: finalGradeFor(studentRows, policies),
        note: missing.length > 0 ? `No ${missing.join(' / ')}` : '',
      }
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName))
}

/**
 * One student's full working, printed.
 *
 * Shares `StudentGradeBreakdown` with the record page rather than carrying a
 * second copy of the arithmetic — `useForcedLightTheme` is what makes that safe
 * on paper, so no component needs a print-only branch.
 */
export function StudentGradesPrint() {
  const { studentId = '' } = useParams()
  const navigate = useNavigate()
  useForcedLightTheme()

  const [student, setStudent] = useState<InstructorStudentDetail | null>(null)
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function run() {
      try {
        await loadTermCalendar()
        const s = await getStudent(studentId)
        if (!s) throw new Error('That student no longer exists.')
        const sections = await listSections()
        const section = sections.find((x) => x.id === s.sectionId)
        const subs = section ? await listSubjects(section.semesterId) : []
        if (cancelled) return
        setStudent(s)
        setSubjects(subs)
      } catch (e) {
        if (!cancelled) setLoadError(errorText(e, 'Could not load this record.'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [studentId])

  return (
    <PrintChrome
      title={student ? `Grade breakdown · ${student.fullName}` : 'Grade breakdown'}
      subtitle={student?.sectionName}
      onBack={() => navigate(-1)}
      loading={loading}
      loadError={loadError}
    >
      {student && (
        <StudentGradeBreakdown
          studentId={student.id}
          sectionId={student.sectionId}
          subjects={subjects}
          expanded
        />
      )}
    </PrintChrome>
  )
}
