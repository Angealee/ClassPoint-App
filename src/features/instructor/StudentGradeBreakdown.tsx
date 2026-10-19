import { useCallback, useEffect, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { EmptyState, ErrorState } from '@/components/ui/EmptyState'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { listGradeItems, listGradePolicies, listGradeScores } from '@/lib/api'
import {
  cellKey,
  classStanding,
  componentScores,
  COMPONENT_LABEL,
  displayGrade,
  finalGrade,
  GRADE_COMPONENTS,
  orderedItems,
  sumsFromScores,
  termGrade,
} from '@/lib/grading'
import { errorText } from '@/lib/errors'
import type { GradeComponent, GradeItem, GradePolicy, Subject, TermKey } from '@/lib/types'

const TERMS: TermKey[] = ['prelim', 'midterm', 'finals']
const TERM_LABEL: Record<TermKey, string> = {
  prelim: 'Prelim',
  midterm: 'Midterm',
  finals: 'Finals',
}

/**
 * One student's full working, for every subject their section takes.
 *
 * This is the screen you open when a student asks why their grade is what it
 * is, so it shows every mark rather than the components alone — anything less
 * sends you back to the grid with their name in your head.
 *
 * It is the SAME component on the record page and on the printed sheet. The
 * print route forces the light theme on `documentElement` instead of this
 * carrying a second set of hardcoded styles, so the two cannot drift.
 *
 * ⚠ It reads the student's scores ONLY (`listGradeScores(ids, studentId)`).
 * Without that filter one record page would pull the whole class's marks for
 * every item of every term — roughly 4,800 rows to render one person.
 */

interface TermLine {
  term: TermKey
  policy: GradePolicy | null
  items: GradeItem[]
  scores: Map<string, number>
  grade: number | null
}

interface SubjectBlock {
  subject: Subject
  policies: GradePolicy[]
  terms: TermLine[]
  final: number | null
  missing: TermKey[]
}

interface Props {
  studentId: string
  sectionId: string
  subjects: Subject[]
  /** Print opens everything; the record page keeps each subject collapsed. */
  expanded?: boolean
}

export function StudentGradeBreakdown({ studentId, sectionId, subjects, expanded }: Props) {
  const [blocks, setBlocks] = useState<SubjectBlock[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!studentId || !sectionId || subjects.length === 0) {
      setLoading(false)
      return
    }
    setLoading(true)
    setLoadError(null)
    try {
      const built = await Promise.all(
        subjects.map(async (subject): Promise<SubjectBlock> => {
          const [policies, allItems] = await Promise.all([
            listGradePolicies(subject.id),
            listGradeItems(sectionId, subject.id),
          ])
          const live = allItems.filter((i) => i.archivedAt === null)
          const rows = await listGradeScores(
            live.map((i) => i.id),
            studentId,
          )
          const scores = new Map<string, number>()
          for (const r of rows) scores.set(cellKey(r.itemId, r.studentId), r.score)

          const terms: TermLine[] = TERMS.map((term) => {
            const policy = policies.find((p) => p.term === term) ?? null
            const items = orderedItems(live.filter((i) => i.term === term))
            const marked = new Map<string, number>()
            for (const item of items) {
              const v = scores.get(cellKey(item.id, studentId))
              if (v !== undefined) marked.set(item.id, v)
            }
            const sums = sumsFromScores(items, marked)
            return {
              term,
              policy,
              items,
              scores,
              grade: policy ? termGrade(sums, policy, 'official') : null,
            }
          })

          const missing = terms
            .filter((t) => t.grade === null && (t.policy?.finalWeight ?? 0) > 0)
            .map((t) => t.term)

          const final = policies.length === TERMS.length
            ? finalGrade(
                terms.map((t) => ({ grade: t.grade, weight: t.policy?.finalWeight ?? 0 })),
              )
            : null

          return { subject, policies, terms, final, missing }
        }),
      )
      setBlocks(built)
    } catch (e) {
      // Its own try/catch (the 0034 SectionGrid precedent): before 0057 is
      // applied this must cost the grades card alone, not the record page.
      setLoadError(errorText(e, 'Could not load grades.'))
    } finally {
      setLoading(false)
    }
  }, [studentId, sectionId, subjects])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) return <ListSkeleton rows={3} />
  if (loadError) {
    return (
      <ErrorState onRetry={() => void load()} detail="Grades need migration 0057 applied.">
        {loadError}
      </ErrorState>
    )
  }
  if (blocks.length === 0) {
    return <EmptyState>This section has no subjects assigned.</EmptyState>
  }

  return (
    <div className="space-y-3">
      {blocks.map((block) => (
        <Card key={block.subject.id} pad="tight" className="space-y-3">
          <details open={expanded} className="group/subject">
            <summary className="flex cursor-pointer items-center gap-2 list-none">
              <div className="min-w-0 flex-1">
                <p className="truncate font-display font-bold">{block.subject.code}</p>
                <p className="truncate text-xs text-muted">{block.subject.name}</p>
              </div>
              {block.final === null ? (
                <Chip tone="warn" size="sm">
                  {block.missing.length > 0
                    ? `No ${block.missing.map((t) => TERM_LABEL[t]).join(' / ')}`
                    : 'Check weights'}
                </Chip>
              ) : (
                <span className="shrink-0 font-display text-lg font-bold tabular-nums">
                  {displayGrade(block.final)}
                </span>
              )}
            </summary>

            <div className="mt-3 space-y-4">
              {block.terms.map((line) => (
                <TermDetail key={line.term} line={line} studentId={studentId} />
              ))}
            </div>
          </details>
        </Card>
      ))}
    </div>
  )
}

function TermDetail({ line, studentId }: { line: TermLine; studentId: string }) {
  if (!line.policy) {
    return (
      <div className="text-sm text-warn">
        {TERM_LABEL[line.term]} has no weights set.
      </div>
    )
  }

  const marked = new Map<string, number>()
  for (const item of line.items) {
    const v = line.scores.get(cellKey(item.id, studentId))
    if (v !== undefined) marked.set(item.id, v)
  }
  const sums = sumsFromScores(line.items, marked)
  const comps = componentScores(sums, line.policy, 'official')
  const cs = classStanding(comps, line.policy)

  return (
    <div className="space-y-2 border-t border-line pt-3">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="font-display font-bold">
          {TERM_LABEL[line.term]}
          <span className="ml-2 text-xs font-normal text-muted">
            {Math.round(line.policy.finalWeight * 100)}% of the final
          </span>
        </h4>
        <span className="font-display font-bold tabular-nums">{displayGrade(line.grade)}</span>
      </div>

      {line.items.length === 0 ? (
        <p className="text-xs text-muted">No score columns in this term yet.</p>
      ) : (
        GRADE_COMPONENTS.map((component) => (
          <ComponentDetail
            key={component}
            component={component}
            items={line.items.filter((i) => i.component === component)}
            marked={marked}
            score={comps[component]}
            weight={componentWeight(component, line.policy as GradePolicy)}
          />
        ))
      )}

      <div className="flex items-center justify-between gap-2 pt-1 text-xs">
        <span className="text-muted">
          Class standing ({Math.round(line.policy.csWeight * 100)}%) · Exam (
          {Math.round(line.policy.examWeight * 100)}%)
        </span>
        <span className="tabular-nums text-muted">
          {displayGrade(cs)} · {displayGrade(comps.exam)}
        </span>
      </div>
    </div>
  )
}

/** The share a component has of CLASS STANDING — the exam is weighed separately. */
function componentWeight(component: GradeComponent, policy: GradePolicy): number | null {
  if (component === 'performance_task') return policy.ptWeight
  if (component === 'quiz') return policy.quizWeight
  if (component === 'recitation') return policy.recitWeight
  return null
}

function ComponentDetail({
  component,
  items,
  marked,
  score,
  weight,
}: {
  component: GradeComponent
  items: GradeItem[]
  marked: Map<string, number>
  score: number
  weight: number | null
}) {
  const raw = items.reduce((sum, i) => sum + (marked.get(i.id) ?? 0), 0)
  const total = items.reduce((sum, i) => sum + i.maxScore, 0)

  return (
    <div className="rounded-xl bg-card-2/50 px-3 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm">
          {COMPONENT_LABEL[component]}
          {weight !== null && (
            <span className="ml-1 text-2xs text-muted">{Math.round(weight * 100)}% of CS</span>
          )}
        </span>
        <span className="text-sm tabular-nums">
          <span className="text-muted">
            {total > 0 ? `${round2(raw)} / ${round2(total)} → ` : 'no columns → '}
          </span>
          <b>{displayGrade(score)}</b>
        </span>
      </div>

      {items.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {items.map((item) => {
            const v = marked.get(item.id)
            return (
              <li key={item.id} className="flex items-center justify-between gap-2 text-2xs">
                <span className="min-w-0 truncate text-muted">{item.name}</span>
                <span className="shrink-0 tabular-nums">
                  {v === undefined ? (
                    // Not marked yet — deliberately not shown as a zero, even
                    // though the official grade counts it as one.
                    <span className="text-muted">not marked</span>
                  ) : (
                    <>
                      {round2(v)}
                      <span className="text-muted"> / {round2(item.maxScore)}</span>
                    </>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
