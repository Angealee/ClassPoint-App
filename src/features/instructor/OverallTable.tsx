import { useMemo } from 'react'
import { Chip } from '@/components/ui/Chip'
import { EmptyState } from '@/components/ui/EmptyState'
import { TableScroller } from '@/components/ui/TableScroller'
 import { displayGrade, termGrade } from '@/lib/grading'
import { finalGradeFor } from '@/lib/grade-impact'
import type { GradePolicy, GradeSumsRow, TermKey } from '@/lib/types'

/**
 * The final computed grade: Prelim·0.30 + Midterm·0.30 + Finals·0.40.
 *
 * This is the number the whole feature exists to produce, and the one place the
 * app says plainly when it CANNOT produce it. The spreadsheet quietly reports
 * 68.508 for a student with a 99.64 prelim and a 96.54 finals because the
 * Midterms column is empty; here that row reads "—" with the missing term
 * named, because a number that looks like a grade is worse than no number.
 *
 * Reads the aggregate RPC rather than raw cells: three terms of a section is
 * ~2,400 score rows, past PostgREST's silent 1000-row cap.
 */

const TERMS: TermKey[] = ['prelim', 'midterm', 'finals']
const TERM_LABEL: Record<TermKey, string> = {
  prelim: 'Prelim',
  midterm: 'Midterm',
  finals: 'Finals',
}

interface OverallTableProps {
  rows: GradeSumsRow[]
  policies: GradePolicy[]
}

interface Line {
  studentId: string
  fullName: string
  terms: Record<TermKey, number | null>
  final: number | null
  missing: TermKey[]
}

export function OverallTable({ rows, policies }: OverallTableProps) {
  const lines = useMemo<Line[]>(() => {
    const byStudent = new Map<string, GradeSumsRow[]>()
    for (const row of rows) {
      const list = byStudent.get(row.studentId)
      if (list) list.push(row)
      else byStudent.set(row.studentId, [row])
    }

    return [...byStudent.values()]
      .map((studentRows) => {
        const terms = {} as Record<TermKey, number | null>
        const missing: TermKey[] = []
        for (const term of TERMS) {
          const policy = policies.find((p) => p.term === term)
          const row = studentRows.find((r) => r.term === term)
          const grade = policy && row ? termGrade(row.sums, policy, 'official') : null
          terms[term] = grade
          // Only a term that CARRIES weight can be missing in a way that
          // matters — one weighted at 0% is deliberately not part of the grade.
          if (grade === null && (policy?.finalWeight ?? 0) > 0) missing.push(term)
        }
        return {
          studentId: studentRows[0].studentId,
          fullName: studentRows[0].fullName,
          terms,
          final: finalGradeFor(studentRows, policies),
          missing,
        }
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName))
  }, [rows, policies])

  if (lines.length === 0) {
    return <EmptyState>Nothing to total up yet.</EmptyState>
  }

  const complete = lines.filter((l) => l.final !== null).length

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        {complete} of {lines.length} students have a final grade.{' '}
        {complete < lines.length && (
          <>A dash means a term that still counts has no marks in it — the grade is withheld
          rather than computed as if that term were a zero.</>
        )}
      </p>

      <TableScroller className="pb-2">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 top-0 z-30 border-b border-line bg-card px-3 py-2 text-left font-semibold"
              >
                Student
              </th>
              {TERMS.map((t) => (
                <th
                  key={t}
                  scope="col"
                  className="sticky top-0 z-20 min-w-20 border-b border-line bg-card px-2 py-2 text-center font-semibold"
                >
                  {TERM_LABEL[t]}
                  <span className="block text-2xs font-normal text-muted">
                    {Math.round((policies.find((p) => p.term === t)?.finalWeight ?? 0) * 100)}%
                  </span>
                </th>
              ))}
              <th
                scope="col"
                className="sticky top-0 z-20 min-w-24 border-b border-line bg-card-2 px-2 py-2 text-center font-semibold"
              >
                Final
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.studentId} className="group">
                <th
                  scope="row"
                  className="sticky left-0 z-10 max-w-52 truncate border-b border-line bg-card px-3 py-2 text-left font-normal group-hover:bg-card-2"
                >
                  {line.fullName}
                </th>
                {TERMS.map((t) => (
                  <td
                    key={t}
                    className="border-b border-line px-2 py-2 text-center text-xs tabular-nums text-muted"
                  >
                    {displayGrade(line.terms[t])}
                  </td>
                ))}
                <td className="border-b border-line bg-card-2/50 px-2 py-2 text-center font-display font-bold tabular-nums">
                  {line.final === null ? (
                    <Chip tone="warn" size="sm">
                      {line.missing.length > 0
                        ? `No ${line.missing.map((t) => TERM_LABEL[t]).join(' / ')}`
                        : 'Check weights'}
                    </Chip>
                  ) : (
                    displayGrade(line.final)
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroller>
    </div>
  )
}
