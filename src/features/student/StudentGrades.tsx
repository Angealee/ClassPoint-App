import { Suspense, lazy, useMemo, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import { PointsPicker, useBoostRequest, useSpendBudget } from '@/components/points/BoostSpend'
import { ReportPlate } from '@/components/grades/ReportPlate'
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
import { boostState, formatMarks, pointsGain } from '@/lib/grade-boost'
import { displayGrade } from '@/lib/grading'
import { TONE } from '@/lib/tone'
import {
  TERM_TITLE,
  type AvailableBoost,
  type BoostColumn,
  breakdownSegments,
  explainTerm,
  latestSoFar,
  markTone,
  sortItems,
  summarizeTerm,
  termsWithItems,
} from '@/lib/student-grades'
import { cn } from '@/lib/cn'
import type { GradeComponent, MyGradeItem, MyGradeSubject, TermKey } from '@/lib/types'
import { useStudentData } from './StudentData'

const GradeShareSheet = lazy(() =>
  import('@/components/grades/GradeShareSheet').then((m) => ({ default: m.GradeShareSheet })),
)

type Order = 'order' | 'lowest' | 'assist'

export function StudentGrades() {
  const { me, grades, gradesLoading, gradesError, reloadGrades, refresh, semesterEnded } =
    useStudentData()
  const budget = useSpendBudget()
  const { ask, dialog } = useBoostRequest(() => void budget.reload())
  const reduced = useReducedMotion() ?? false
  const [openId, setOpenId] = useState<string | null>(null)

  const subjects = useMemo(() => grades?.subjects ?? [], [grades])

  const [pickedSubject, setPickedSubject] = useState<string | null>(null)
  const [pickedTerm, setPickedTerm] = useState<TermKey | null>(null)
  const [explainOpen, setExplainOpen] = useState(false)
  const [order, setOrder] = useState<Order>('order')
  const [shareOpen, setShareOpen] = useState(false)
  const [shareMounted, setShareMounted] = useState(false)
  // Grade FIGURES start hidden on every visit (instructor's call): plain component
  // state on purpose, so leaving and returning hides them again.
  const [reveal, setReveal] = useState(false)
  const mask = (v: string) => (reveal ? v : '•••')

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
  const explanation = figures && reveal ? explainTerm(subject, term) : null
  const segments = figures ? breakdownSegments(subject, term) : null
  const weightOf = (c: GradeComponent) => segments?.find((s) => s.component === c)?.weightPct ?? null

  // A card is offered only when the figure is on screen and there is a figure to put on it.
  const cardSegments = segments ?? []
  const canShare = figures && reveal && summary.soFar !== null && cardSegments.length > 0

  const note = !reveal
    ? 'Grades are hidden. Tap the eye to show them.'
    : summary.soFar === null
      ? `Nothing in ${TERM_TITLE[term]} has been marked yet.`
      : 'Based on what’s marked so far. Parts your instructor hasn’t marked yet count at the 60 minimum, so this moves as marks come in.'

  const pickPart = (c: GradeComponent) => {
    const el = document.getElementById(`part-${c}`)
    if (!el) return
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' })
  }

  const assistable = (i: MyGradeItem) => !semesterEnded && boostState(i).kind === 'available'

  const visibleParts = summary.components.filter((c) =>
    c.component === 'recitation'
      ? c.possible > 0
      : summary.items.some((i) => i.component === c.component),
  )
  const partRows = (component: GradeComponent) => {
    const all = summary.items.filter((i) => i.component === component)
    return order === 'assist' ? all.filter(assistable) : all
  }
  const anyInView =
    order !== 'assist' ||
    visibleParts.some((c) => c.component !== 'recitation' && partRows(c.component).length > 0)

  return (
    <PullToRefresh onRefresh={onRefresh}>
      <div className="space-y-4 pb-4">
        {header}

        {gradesError && (
          <p className="rounded-lg bg-card-2 px-3 py-2 text-xs text-muted">
            Couldn’t refresh just now, these are the marks from a moment ago.{' '}
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
          <ReportPlate
            termTitle={TERM_TITLE[term]}
            figure={summary.soFar === null ? '-' : displayGrade(summary.soFar)}
            reveal={reveal}
            onToggle={() => setReveal((v) => !v)}
            marked={summary.marked}
            total={summary.total}
            segments={segments}
            note={note}
            reduced={reduced}
            onPickPart={pickPart}
            onShare={
              canShare
                ? () => {
                    setShareMounted(true)
                    setShareOpen(true)
                  }
                : undefined
            }
          />
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

        <SegmentedControl
          label="Show the scores"
          tone="quiet"
          size="sm"
          value={order}
          onChange={setOrder}
          options={[
            { value: 'order', label: 'In order' },
            { value: 'lowest', label: 'Lowest first' },
            { value: 'assist', label: 'Can use points' },
          ]}
          className="w-full sm:w-96"
        />

        {!anyInView && (
          <EmptyState compact>No column can use points right now.</EmptyState>
        )}

        {visibleParts.map((c) => {
          const weight = weightOf(c.component)
          const heading = (
            <div className="mb-1.5 flex items-baseline justify-between px-1">
              <h2 className="text-sm font-semibold">
                {c.label}
                {weight !== null && <span className="font-normal text-muted"> · {weight}%</span>}
              </h2>
              {figures && (
                <span className="text-xs tabular-nums text-muted">
                  {c.score === null ? '-' : mask(displayGrade(c.score))}
                </span>
              )}
            </div>
          )

          if (c.component === 'recitation') {
            if (order === 'assist') return null
            return (
              <div key={c.component} id="part-recitation" className="scroll-mt-20">
                {heading}
                <Rows>
                  <div className="p-3.5">
                    <p className="text-sm font-medium">Attendance</p>
                    <p className="text-xs tabular-nums text-muted">
                      {c.earned} of {c.possible} class{c.possible === 1 ? '' : 'es'} attended. Your
                      attendance rate is your Recitation grade.
                    </p>
                  </div>
                </Rows>
              </div>
            )
          }

          const rows = partRows(c.component)
          if (rows.length === 0) return null
          const waiting = rows.filter((i) => i.score === null && !i.absent)
          const shown = sortItems(
            rows.filter((i) => i.score !== null || i.absent),
            order === 'lowest' ? 'lowest' : 'order',
          )

          return (
            <div key={c.component} id={`part-${c.component}`} className="scroll-mt-20">
              {heading}
              <Rows>
                {shown.map((item) => (
                  <ItemRow
                    key={item.id}
                    subject={subject}
                    item={item}
                    locked={semesterEnded}
                    open={openId === item.id}
                    onToggle={() => setOpenId((cur) => (cur === item.id ? null : item.id))}
                    available={budget.available}
                    tooMany={budget.tooMany}
                    onPick={ask}
                  />
                ))}
                {waiting.length > 0 && <WaitingRow items={waiting} locked={semesterEnded} />}
              </Rows>
            </div>
          )
        })}
      </div>
      {dialog}

      {shareMounted && canShare && segments && summary.soFar !== null && (
        <Suspense fallback={null}>
          <GradeShareSheet
            open={shareOpen}
            onClose={() => setShareOpen(false)}
            card={{
              termTitle: TERM_TITLE[term],
              figure: displayGrade(summary.soFar),
              marked: summary.marked,
              total: summary.total,
              segments,
            }}
            subjectLabel={`${subject.code} · ${subject.name}`}
            studentName={me?.display_name ?? ''}
          />
        </Suspense>
      )}
    </PullToRefresh>
  )
}

/** Columns with no mark yet, folded into one quiet line so they stop padding the list. */
function WaitingRow({ items, locked }: { items: MyGradeItem[]; locked: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="px-3.5 py-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="cp-tap-y flex w-full items-center justify-between gap-2 text-left text-sm text-muted"
      >
        <span>Waiting for marks ({items.length})</span>
        <ChevronDownIcon className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="pb-2.5">
          <ul className="space-y-1 text-xs text-muted">
            {items.map((i) => (
              <li key={i.id} className="truncate" title={i.name}>
                {i.name}
              </li>
            ))}
          </ul>
          {!locked && (
            <p className="mt-2 text-xs text-muted">Points assist opens once a mark is in.</p>
          )}
        </div>
      )}
    </div>
  )
}

function ItemRow({
  subject,
  item,
  locked,
  open,
  onToggle,
  available,
  tooMany,
  onPick,
}: {
  subject: MyGradeSubject
  item: MyGradeItem
  locked: boolean
  open: boolean
  onToggle: () => void
  available: number
  tooMany: boolean
  onPick: (column: BoostColumn<AvailableBoost>, points: number) => void
}) {
  const state = boostState(item)
  const [chosen, setChosen] = useState<number | null>(null)
  const cap = state.kind === 'available' ? Math.min(state.maxPoints, available) : 0
  const gain =
    open && state.kind === 'available' && item.score !== null
      ? pointsGain(Math.max(0, Math.min(chosen ?? cap, cap)), item.score, item.maxScore)
      : 0

  const pct = item.score !== null && item.maxScore > 0 ? (item.score / item.maxScore) * 100 : null
  const tone = pct === null ? null : markTone(pct)

  return (
    <div className="px-3.5 py-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="min-w-0 truncate text-sm font-medium" title={item.name}>
              {item.name}
            </p>
            <p className="shrink-0 text-sm tabular-nums text-muted">
              {item.score === null ? (
                item.absent ? (
                  'Absent'
                ) : (
                  'Not marked yet'
                )
              ) : (
                <>
                  <span className={cn('font-semibold', tone ? TONE[tone].text : 'text-ink')}>
                    {formatMarks(item.score)}
                  </span>
                  {gain > 0 && (
                    <>
                      <span className="px-1">→</span>
                      <span className="font-semibold text-ink">{formatMarks(item.score + gain)}</span>
                    </>
                  )}{' '}
                  / {formatMarks(item.maxScore)}
                </>
              )}
            </p>
          </div>
          {pct !== null && (
            <Meter
              value={pct}
              max={100}
              size="sm"
              tone={tone ?? 'neutral'}
              label={`${item.name}: ${Math.round(pct)}%`}
              className="mt-1.5"
            />
          )}
          {state.kind === 'boosted' && (
            <p className="mt-1 text-xs tabular-nums text-muted">was {formatMarks(state.before)}</p>
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
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            className="cp-tap-y inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-ink underline-offset-2 hover:underline"
          >
            <TicketIcon className="h-4 w-4 text-reward" aria-hidden />
            {open ? 'Close' : 'Use points'}
          </button>
        )}
      </div>
      {open && state.kind === 'available' && !locked && (
        <PointsPicker
          column={{ subject, item, state }}
          available={available}
          tooMany={tooMany}
          locked={locked}
          onPick={(points) => onPick({ subject, item, state }, points)}
          onChosen={setChosen}
        />
      )}
    </div>
  )
}
