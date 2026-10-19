import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { EmptyState, ErrorState } from '@/components/ui/EmptyState'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { listGradePolicies } from '@/lib/api'
import { subjectPolicyError } from '@/lib/grading'
import { errorText } from '@/lib/errors'
import { useInstructor } from './InstructorLayout'
import { WeightsSheet } from './WeightsSheet'
import type { GradePolicy, Subject, TermKey } from '@/lib/types'

const TERMS: TermKey[] = ['prelim', 'midterm', 'finals']
const TERM_LABEL: Record<TermKey, string> = {
  prelim: 'Prelim',
  midterm: 'Midterm',
  finals: 'Finals',
}

/**
 * Which grade sheet do you want?
 *
 * Deliberately NOT a menu restating the nav: the one thing it adds is whether a
 * subject can actually produce a grade. A subject needs all three policy rows
 * and each has to add up, and 0057 seeds them — so the warning should never
 * fire. When it does, every figure on every sheet for that subject is withheld,
 * and the place to find that out is here rather than three taps in.
 *
 * It stays in the reading column; only a sheet itself goes full width.
 */
export function GradesConsole() {
  const { sections, subjects, subjectsForSection, semester } = useInstructor()
  const [policies, setPolicies] = useState<Record<string, GradePolicy[]>>({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [weightsFor, setWeightsFor] = useState<Subject | null>(null)

  const load = useCallback(async () => {
    if (subjects.length === 0) {
      setLoading(false)
      return
    }
    setLoading(true)
    setLoadError(null)
    try {
      const rows = await Promise.all(subjects.map((s) => listGradePolicies(s.id)))
      const map: Record<string, GradePolicy[]> = {}
      subjects.forEach((s, i) => {
        map[s.id] = rows[i]
      })
      setPolicies(map)
    } catch (e) {
      // 0034 SectionGrid precedent: 0057 may not be applied, and that must cost
      // this screen alone rather than the whole instructor area.
      setLoadError(errorText(e, 'Could not load grade settings.'))
    } finally {
      setLoading(false)
    }
  }, [subjects])

  useEffect(() => {
    void load()
  }, [load])

  const withSubjects = useMemo(
    () =>
      sections
        .map((section) => ({ section, subjects: subjectsForSection(section.id) }))
        .filter((row) => row.subjects.length > 0),
    [sections, subjectsForSection],
  )

  if (!semester) {
    return (
      <div className="space-y-4">
        <Header />
        <EmptyState>No active semester yet.</EmptyState>
      </div>
    )
  }

  return (
    <div className="space-y-5 pb-4">
      <Header semesterName={semester.name} />

      {loading ? (
        <ListSkeleton rows={4} />
      ) : loadError ? (
        <ErrorState onRetry={() => void load()} detail="Grades need migration 0057 applied.">
          {loadError}
        </ErrorState>
      ) : withSubjects.length === 0 ? (
        <EmptyState description="Assign a subject to a section in Semesters first — a grade sheet belongs to one section and one subject.">
          No section has a subject yet.
        </EmptyState>
      ) : (
        withSubjects.map(({ section, subjects: sectionSubjects }) => (
          <div key={section.id} className="space-y-2">
            <SectionLabel>{section.name}</SectionLabel>
            {sectionSubjects.map((subject) => {
              const problem = policies[subject.id]
                ? subjectPolicyError(policies[subject.id])
                : null
              return (
                <Card key={subject.id} pad="tight" className="space-y-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display font-bold">{subject.code}</p>
                      <p className="truncate text-xs text-muted">{subject.name}</p>
                    </div>
                    {problem && <Chip tone="warn">Check weights</Chip>}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setWeightsFor(subject)}
                      className="shrink-0"
                    >
                      Weights
                    </Button>
                  </div>

                  {problem && <p className="text-xs text-warn">{problem}</p>}

                  <div className="grid grid-cols-3 gap-2">
                    {TERMS.map((term) => (
                      <Link
                        key={term}
                        to={`/teach/grades/${section.id}/${subject.id}/${term}`}
                        className="rounded-xl border border-line px-2 py-2 text-center text-sm transition-colors hover:border-accent hover:bg-accent-solid/10"
                      >
                        {TERM_LABEL[term]}
                      </Link>
                    ))}
                  </div>
                </Card>
              )
            })}
          </div>
        ))
      )}

      {weightsFor && (
        <WeightsSheet
          open
          onClose={() => setWeightsFor(null)}
          subject={weightsFor}
          policies={policies[weightsFor.id] ?? []}
          // Every section taking this subject — the real reach of the change,
          // and what the confirm counts.
          sectionIds={sections
            .filter((s) => subjectsForSection(s.id).some((x) => x.id === weightsFor.id))
            .map((s) => s.id)}
          onSaved={() => void load()}
        />
      )}
    </div>
  )
}

function Header({ semesterName }: { semesterName?: string }) {
  return (
    <div>
      <h1 className="font-display text-xl font-bold">Grades</h1>
      <p className="text-sm text-muted">
        {semesterName
          ? `Prelim, Midterm and Finals for ${semesterName}. Points never feed a grade.`
          : 'Prelim, Midterm and Finals.'}
      </p>
    </div>
  )
}
