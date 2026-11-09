import { useMemo } from 'react'
import { Navigate } from 'react-router-dom'
import { EmptyState } from '@/components/ui/EmptyState'
import { ScreenTitle } from '@/components/ui/ScreenTitle'
import { readGradeScope, type GradeScope } from '@/lib/grade-scope'
import { useInstructor } from './InstructorLayout'

/**
 * `/teach/grades` resolves to a sheet; it is not a screen of its own any more.
 *
 * ── WHAT THIS REPLACES ─────────────────────────────────────────────────────
 * `GradesConsole`: a wall of cards, one per section × subject, each carrying
 * three term links and a small Weights button. With two subjects across several
 * sections that is a dozen cards and thirty links, and the only thing it told
 * you that the sheet does not was whether a subject's weights add up — which is
 * now a chip on the Subject picker, where the subject actually is.
 *
 * The instructor's report was that the grade area is confusing. A menu whose
 * every entry leads to the same screen with different parameters is the
 * confusing part: it makes choosing a scope feel like navigating, when the
 * scope is just two dropdowns.
 *
 * ── WHY A REDIRECT RATHER THAN RENDERING THE SHEET HERE ────────────────────
 * The scope has to stay in the PATH. `Shell` only ever sees `pathname`, and
 * that is what lets `routeWidth` give the grid the full window; a sheet
 * rendered at `/teach/grades` with its scope in state would be stuck in the
 * 672px reading column. It also keeps one grade sheet a real deep link.
 *
 * So this resolves and leaves: last scope if it is still valid, otherwise the
 * first section × subject pairing that exists.
 */
export function GradesEntry() {
  const { sections, subjectsForSection, semester } = useInstructor()

  const target = useMemo<GradeScope | null>(() => {
    const pairs = sections.flatMap((s) =>
      subjectsForSection(s.id).map((sub) => ({ sectionId: s.id, subjectId: sub.id })),
    )
    if (pairs.length === 0) return null

    // Remembered scope, but only if BOTH halves still exist — a section can be
    // deleted and a subject unassigned between visits, and navigating to a
    // stale pairing lands on a sheet that can only show its error state.
    const saved = readGradeScope()
    if (saved && pairs.some((p) => p.sectionId === saved.sectionId && p.subjectId === saved.subjectId)) {
      return saved
    }
    return { ...pairs[0], term: saved?.term ?? 'prelim' }
  }, [sections, subjectsForSection])

  if (!semester) {
    return (
      <div className="space-y-4">
        <ScreenTitle title="Grades" />
        <EmptyState>No active semester yet.</EmptyState>
      </div>
    )
  }

  if (!target) {
    return (
      <div className="space-y-4">
        <ScreenTitle
          title="Grades"
          subtitle={`Prelim, Midterm and Finals for ${semester.name}. Points never feed a grade.`}
        />
        <EmptyState description="Assign a subject to a section in Semesters first — a grade sheet belongs to one section and one subject.">
          No section has a subject yet.
        </EmptyState>
      </div>
    )
  }

  return (
    <Navigate
      to={`/teach/grades/${target.sectionId}/${target.subjectId}/${target.term}`}
      replace
    />
  )
}
