import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, Rows } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { EmptyState, ErrorState } from '@/components/ui/EmptyState'
import { PullToRefresh } from '@/components/ui/PullToRefresh'
import { ScreenTitle } from '@/components/ui/ScreenTitle'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Select } from '@/components/ui/Select'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { Meter } from '@/components/ui/Meter'
import { ChevronDownIcon, LockIcon, TableIcon, TicketIcon } from '@/components/ui/icons'
import { boostState, formatMarks } from '@/lib/grade-boost'
import { rateTone } from '@/lib/attendance'
import { displayGrade } from '@/lib/grading'
import { TONE } from '@/lib/tone'
import {
  TERM_TITLE,
  boostableCount,
  sortItems,
  explainTerm,
  latestSoFar,
  summarizeTerm,
  termsWithItems,
} from '@/lib/student-grades'
import { cn } from '@/lib/cn'
import type { MyGradeItem, TermKey } from '@/lib/types'
import { useStudentData } from './StudentData'

export function StudentGrades() {
  const { me, grades, gradesLoading, gradesError, reloadGrades, refresh, semesterEnded } =
    useStudentData()

  const subjects = useMemo(() => grades?.subjects ?? [], [grades])

  const [pickedSubject, setPickedSubject] = useState<string | null>(null)
  const [pickedTerm, setPickedTerm] = useState<TermKey | null>(null)
  const [explainOpen, setExplainOpen] = useState(false)
  const [order, setOrder] = useState<'order' | 'lowest'>('order')

  const subject = subjects.find((s) => s.subjectId === pickedSubject) ?? subjects[0] ?? null
  const terms = useMemo(() => (subject ? termsWithItems(subject) : []), [subject])
  const term =
    pickedTerm && terms.includes(pickedTerm)
      ? pickedTerm
      : subject
        ? (latestSoFar(subject)?.term ?? terms[0] ?? null)
        : null

  const onRefresh = async () => {
    await Promise.all([reloadGrades(), refresh()])
  }

  const header = (
    <ScreenTitle
      title="Grades"
      subtitle="Your marks, as your instructor enters them."
    />
  )

  if (gradesLoading && !grades) {
    return (
      <div className="space-y-4 pb-4">
        {header}
        <ListSkeleton rows={4} />
      </div>
    )
  }

  if (gradesError && !grades) {
    return (
      <div className="space-y-4 pb-4">
        {header}
        <ErrorState onRetry={() => void reloadGrades()}>Couldn’t load your grades.</ErrorState>
      </div>
    )
  }

  if (!grades?.enabled) {
    return (
      <div className="space-y-4 pb-4">
        {header}
        <EmptyState
          icon={<TableIcon />}
          description="Your instructor opens this when marks are ready. Check back soon."
        >
          Grades aren’t open yet.
        </EmptyState>
      </div>
    )
  }

  if (!subject || !term) {
    return (
      <div className="space-y-4 pb-4">
        {header}
        <EmptyState
          icon={<TableIcon />}
          description="Quizzes, activities and exams appear here as soon as your instructor sets them up."
        >
          Nothing has been set up for your class yet.
        </EmptyState>
      </div>
    )
  }

  const summary = summarizeTerm(subject, term)
  const figures = grades.figures
  const explanation = figures ? explainTerm(subject, term) : null
  const boostable = boostableCount(subjects)

  return (
    <PullToRefresh onRefresh={onRefresh}>
      <div className="space-y-4 pb-4">
        {header}

        {gradesError && (
          <p className="rounded-lg bg-card-2 px-3 py-2 text-xs text-muted">
            Couldn’t refresh just now — these are the marks from a moment ago.{' '}
            <button
              type="button"
              onClick={() => void reloadGrades()}
              className="font-semibold text-accent"
            >
              Try again
            </button>
          </p>
        )}

        {subjects.length > 1 ? (
          <Select
            aria-label="Subject"
            value={subject.subjectId}
            onChange={(e) => {
              setPickedSubject(e.target.value)
              setPickedTerm(null)
            }}
          >
            {subjects.map((s) => (
              <option key={s.subjectId} value={s.subjectId}>
                {s.code} · {s.name}
              </option>
            ))}
          </Select>
        ) : (
          <p className="text-sm font-semibold">
            {subject.code} <span className="font-normal text-muted">· {subject.name}</span>
          </p>
        )}

        {terms.length > 1 && (
          <SegmentedControl
            label="Term"
            value={term}
            onChange={setPickedTerm}
            options={terms.map((t) => ({ value: t, label: TERM_TITLE[t] }))}
          />
        )}

        {figures ? (
          <Card elevation="raised" className="p-5">
            <p className="text-xs text-muted">{TERM_TITLE[term]} · so far</p>
            <div className="mt-0.5 flex items-end justify-between gap-3">
              <p className="font-display text-4xl font-bold tabular-nums">
                {displayGrade(summary.soFar)}
              </p>
              <p className="pb-1 text-right text-xs tabular-nums text-muted">
                {summary.marked} of {summary.total} marked
              </p>
            </div>
            <p className="mt-2 text-xs text-muted">
              {summary.soFar === null
                ? `Nothing in ${TERM_TITLE[term]} has been marked yet.`
                : 'Based on what’s marked so far. Parts your instructor hasn’t marked yet count at the 60 minimum, so this moves as marks come in.'}
            </p>
          </Card>
        ) : (
          <Card pad="tight" className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-card-2 text-muted">
              <LockIcon className="h-5 w-5" />
            </span>
            <p className="min-w-0 flex-1 text-sm">
              <span className="font-semibold">Grades open soon.</span>{' '}
              <span className="text-muted">Your scores are below, and you can use points on them now.</span>
            </p>
          </Card>
        )}

        {explanation && (
          <div>
            <button
              type="button"
              onClick={() => setExplainOpen((o) => !o)}
              aria-expanded={explainOpen}
              className="cp-tap-y flex w-full items-center gap-1.5 px-1 text-left text-xs font-semibold text-accent"
            >
              How is this worked out?
              <ChevronDownIcon
                className={cn('h-3.5 w-3.5 transition-transform', explainOpen && 'rotate-180')}
              />
            </button>
            {explainOpen && (
              <Card pad="tight" className="mt-1 space-y-2">
                <p className="text-xs text-muted">What each part is worth in {TERM_TITLE[term]}:</p>
                <div className="divide-y divide-line">
                  {explanation.parts.map((p) => (
                    <div key={p.component} className="flex items-center justify-between py-1.5 text-sm">
                      <span>{p.label}</span>
                      <span className="font-semibold tabular-nums">{p.sharePct}%</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted">
                  Each part is scored out of 100: no marks earns {explanation.floor}, full marks
                  earns {explanation.ceiling}. Only marked columns count toward a part, and a part
                  with nothing marked yet counts as {explanation.floor}.
                </p>
              </Card>
            )}
          </div>
        )}

        <Link to="/app/points" className="block">
          <Card interactive>
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gold-400/15 text-reward">
                <TicketIcon className="h-5.5 w-5.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-display text-sm font-bold">Use your points</span>
                <span className="block text-xs text-muted">
                  {me?.semester_points ?? 0} point{(me?.semester_points ?? 0) === 1 ? "" : "s"}
                  {" · "}
                  {semesterEnded
                    ? "points assist is closed this semester"
                    : boostable > 0
                      ? boostable + " column" + (boostable === 1 ? "" : "s") + " open for points assist"
                      : "no column is open for points assist yet"}
                </span>
              </span>
              <span className="shrink-0 text-lg text-muted">›</span>
            </div>
          </Card>
        </Link>

                <SegmentedControl
          label="Order the scores"
          tone="quiet"
          size="sm"
          value={order}
          onChange={setOrder}
          options={[
            { value: 'order', label: 'In order' },
            { value: 'lowest', label: 'Lowest first' },
          ]}
          className="w-full sm:w-64"
        />

        {summary.components
          .filter((c) =>
            c.component === 'recitation'
              ? c.possible > 0
              : summary.items.some((i) => i.component === c.component),
          )
          .map((c) =>
            c.component === 'recitation' ? (
              <div key={c.component}>
                <div className="mb-1.5 flex items-baseline justify-between px-1">
                  <h2 className="text-sm font-semibold">{c.label}</h2>
                  {figures && (
                    <span className="text-xs tabular-nums text-muted">
                      {c.score === null ? '—' : displayGrade(c.score)}
                    </span>
                  )}
                </div>
                <Rows>
                  <div className="p-3.5">
                    <p className="text-sm font-medium">Attendance</p>
                    <p className="text-xs tabular-nums text-muted">
                      {c.earned} of {c.possible} class{c.possible === 1 ? '' : 'es'} attended —
                      your attendance rate is your Recitation grade.
                    </p>
                  </div>
                </Rows>
              </div>
            ) : (
            <div key={c.component}>
              <div className="mb-1.5 flex items-baseline justify-between px-1">
                <h2 className="text-sm font-semibold">{c.label}</h2>
                {figures && (
                  <span className="text-xs tabular-nums text-muted">
                    {c.score === null ? '—' : displayGrade(c.score)}
                  </span>
                )}
              </div>
              <Rows>
                {sortItems(
                  summary.items.filter((i) => i.component === c.component),
                  order,
                ).map((item) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      locked={semesterEnded}
                    />
                  ))}
              </Rows>
            </div>
            ),
          )}
      </div>

    </PullToRefresh>
  )
}

function ItemRow({ item, locked }: { item: MyGradeItem; locked: boolean }) {
  const state = boostState(item)

  const pct = item.score !== null && item.maxScore > 0 ? (item.score / item.maxScore) * 100 : null
  const tone = pct === null ? null : rateTone(pct)

  return (
    <div className="flex items-center gap-3 p-3.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" title={item.name}>
          {item.name}
        </p>
        <p className="text-xs tabular-nums text-muted">
          {item.score === null ? (
            item.absent ? 'Absent' : 'Not marked yet'
          ) : (
            <>
              <span className={cn('font-semibold', tone && TONE[tone].text)}>
                {formatMarks(item.score)}
              </span>{' '}
              / {formatMarks(item.maxScore)}
            </>
          )}
          {state.kind === 'boosted' && ` · was ${formatMarks(state.before)}`}
          {state.kind === 'unmarked' && !locked && ' · points assist opens once it’s marked'}
        </p>
        {pct !== null && tone && (
          <Meter
            value={pct}
            max={100}
            size="sm"
            tone={tone}
            label={`${item.name}: ${Math.round(pct)}%`}
            className="mt-1.5"
          />
        )}
      </div>

      {state.kind === 'boosted' && (
        <Chip tone="reward" size="sm">
          +{formatMarks(state.marks)} from {state.points} pts
        </Chip>
      )}

      {state.kind === 'pending' && (
        <Chip tone="warn" size="sm">
          Waiting
        </Chip>
      )}

      {state.kind === 'absent' && (
        <Chip tone="neutral" size="sm">
          Absent
        </Chip>
      )}

      {state.kind === 'available' && !locked && (
        <Link
          to={'/app/points?column=' + item.id}
          className="cp-tap-y inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-accent underline-offset-2 hover:underline"
        >
          <TicketIcon className="h-4 w-4" aria-hidden />
          Use points
        </Link>
      )}
    </div>
  )
}
