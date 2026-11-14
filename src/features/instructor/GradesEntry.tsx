import { useMemo } from 'react'
import { Navigate } from 'react-router-dom'
import { EmptyState } from '@/components/ui/EmptyState'
import { ScreenTitle } from '@/components/ui/ScreenTitle'
import { readGradeScope, type GradeScope } from '@/lib/grade-scope'
import { useInstructor } from './InstructorLayout'

export function GradesEntry() {
  const { sections, subjectsForSection, semester } = useInstructor()

  const target = useMemo<GradeScope | null>(() => {
    const pairs = sections.flatMap((s) =>
      subjectsForSection(s.id).map((sub) => ({ sectionId: s.id, subjectId: sub.id })),
    )
    if (pairs.length === 0) return null

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
        <EmptyState description="Assign a subject to a section in Semesters first, a grade sheet belongs to one section and one subject.">
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
