import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState, ErrorState } from '@/components/ui/EmptyState'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { ChevronDownIcon, TableIcon } from '@/components/ui/icons'
import { useStudentData } from '@/features/student/StudentData'
import { requestGradeBoost } from '@/lib/api'
import { cn } from '@/lib/cn'
import { errorText } from '@/lib/errors'
import { formatMarks, pointsGain } from '@/lib/grade-boost'
import {
  TERM_TITLE,
  boostColumns,
  boostReason,
  type AvailableBoost,
  type BoostColumn,
} from '@/lib/student-grades'
import { COMPONENT_LABEL } from '@/lib/grading'
import { MAX_PENDING_REDEMPTIONS } from '@/lib/types'

export function GradeColumns({
  available,
  tooMany,
  highlightId,
  onRequested,
}: {
  /** Points not already promised to a waiting request. */
  available: number
  tooMany: boolean
  highlightId: string | null
  onRequested: () => void
}) {
  const { me, grades, gradesLoading, gradesError, reloadGrades, semesterEnded } = useStudentData()
  const { toast } = useToast()

  const subjects = useMemo(() => grades?.subjects ?? [], [grades])
  const { actionable, other } = useMemo(() => boostColumns(subjects), [subjects])

  const [otherOpen, setOtherOpen] = useState(false)
  const [target, setTarget] = useState<{
    column: BoostColumn<AvailableBoost>
    points: number
  } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const highlightInOther = highlightId !== null && other.some((c) => c.item.id === highlightId)
  const showOther = otherOpen || highlightInOther

  // Bring the linked column into view, once per link.
  const rowRefs = useRef(new Map<string, HTMLElement>())
  const scrolledFor = useRef<string | null>(null)
  useEffect(() => {
    if (!highlightId || scrolledFor.current === highlightId) return
    const el = rowRefs.current.get(highlightId)
    if (!el) return
    scrolledFor.current = highlightId
    el.scrollIntoView({ block: 'center' })
  }, [highlightId, grades, showOther])

  async function onConfirm() {
    if (!target) return
    setSubmitting(true)
    try {
      await requestGradeBoost(target.column.item.id, target.points)
      toast('Request sent — your instructor will decide.', 'success')
      setTarget(null)
      await reloadGrades()
      onRequested()
    } catch (e) {
      toast(errorText(e, 'Could not send that request. Try again.'), 'error')
      setTarget(null)
      void reloadGrades()
    } finally {
      setSubmitting(false)
    }
  }

  const register = (id: string) => (el: HTMLElement | null) => {
    if (el) rowRefs.current.set(id, el)
    else rowRefs.current.delete(id)
  }

  return (
    <div>
      <SectionLabel>Your grade columns</SectionLabel>

      {gradesLoading && !grades ? (
        <ListSkeleton rows={2} />
      ) : gradesError && !grades ? (
        <ErrorState onRetry={() => void reloadGrades()}>Couldn’t load your grade columns.</ErrorState>
      ) : !grades?.enabled ? (
        <EmptyState
          icon={<TableIcon />}
          description="Quizzes, tasks and exams open for points assist appear here once your instructor opens grades."
        >
          Grades aren’t open yet.
        </EmptyState>
      ) : subjects.length === 0 ? (
        <EmptyState
          icon={<TableIcon />}
          description="Columns appear here as soon as your instructor sets them up."
        >
          Nothing has been set up for your class yet.
        </EmptyState>
      ) : (
        <div className="space-y-4">
          {semesterEnded && (
            <p className="rounded-lg bg-card-2 px-3 py-2 text-xs text-muted">
              This semester has ended, so points assist is closed.
            </p>
          )}

          {actionable.length === 0 ? (
            <EmptyState
              icon={<TableIcon />}
              description="A quiz, task or exam appears here as soon as your mark is in — 1 point adds 1 mark, up to the maximum. A column you were absent for can’t be assisted."
            >
              None of your columns can use points right now.
            </EmptyState>
          ) : (
            <ActionableList
              columns={actionable}
              available={available}
              tooMany={tooMany}
              locked={semesterEnded}
              highlightId={highlightId}
              register={register}
              onPick={(column, points) => setTarget({ column, points })}
            />
          )}

          {other.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setOtherOpen((o) => !o)}
                aria-expanded={showOther}
                className="cp-tap-y flex w-full items-center gap-1.5 px-1 text-left text-xs font-semibold text-muted"
              >
                Not available yet ({other.length})
                <ChevronDownIcon
                  className={cn('h-3.5 w-3.5 transition-transform', showOther && 'rotate-180')}
                />
              </button>
              {showOther && (
                <Card pad="none" className="mt-1 divide-y divide-line">
                  {other.map((c) => (
                    <OtherRow
                      key={c.item.id}
                      column={c}
                      highlighted={c.item.id === highlightId}
                      register={register(c.item.id)}
                    />
                  ))}
                </Card>
              )}
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!target}
        variant="danger"
        title={target ? `Use ${target.points} point${target.points === 1 ? '' : 's'} on ${target.column.item.name}?` : ''}
        message={
          target ? (
            <>
              You’re asking to spend{' '}
              <span className="font-semibold text-ink">
                {target.points} point{target.points === 1 ? '' : 's'}
              </span>{' '}
              to add{' '}
              <span className="font-semibold text-ink">
                {formatMarks(
                  pointsGain(target.points, target.column.state.score, target.column.item.maxScore),
                )}{' '}
                mark
                {pointsGain(target.points, target.column.state.score, target.column.item.maxScore) === 1
                  ? ''
                  : 's'}
              </span>
              :{' '}
              <span className="font-semibold text-ink">
                {formatMarks(target.column.state.score)}
              </span>{' '}
              becomes{' '}
              <span className="font-semibold text-ink">
                {formatMarks(
                  target.column.state.score +
                    pointsGain(target.points, target.column.state.score, target.column.item.maxScore),
                )}
              </span>{' '}
              out of {formatMarks(target.column.item.maxScore)}. Nothing is spent until your
              instructor approves it.
            </>
          ) : null
        }
        detail={
          target
            ? `If approved, your total drops to ${Math.max(0, (me?.semester_points ?? 0) - target.points)} — your level and leaderboard rank drop with it, and you climb the spend board. You can’t undo it yourself.`
            : undefined
        }
        confirmLabel="Send request"
        busy={submitting}
        onConfirm={onConfirm}
        onClose={() => setTarget(null)}
      />
    </div>
  )
}

function ActionableList({
  columns,
  available,
  tooMany,
  locked,
  highlightId,
  register,
  onPick,
}: {
  columns: Array<BoostColumn<AvailableBoost>>
  available: number
  tooMany: boolean
  locked: boolean
  highlightId: string | null
  register: (id: string) => (el: HTMLElement | null) => void
  onPick: (c: BoostColumn<AvailableBoost>, points: number) => void
}) {
  const groups: Array<{ key: string; title: string; items: Array<BoostColumn<AvailableBoost>> }> = []
  for (const c of columns) {
    const key = `${c.subject.subjectId}:${c.item.term}`
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.items.push(c)
    else
      groups.push({
        key,
        title: `${c.subject.code} · ${TERM_TITLE[c.item.term]}`,
        items: [c],
      })
  }

  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <div key={g.key} className="space-y-2">
          <p className="px-1 text-xs font-semibold text-muted">{g.title}</p>
          {g.items.map((c) => (
            <BoostCard
              key={c.item.id}
              column={c}
              available={available}
              tooMany={tooMany}
              locked={locked}
              highlighted={c.item.id === highlightId}
              register={register(c.item.id)}
              onPick={(points) => onPick(c, points)}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

function BoostCard({
  column,
  available,
  tooMany,
  locked,
  highlighted,
  register,
  onPick,
}: {
  column: BoostColumn<AvailableBoost>
  available: number
  tooMany: boolean
  locked: boolean
  highlighted: boolean
  register: (el: HTMLElement | null) => void
  onPick: (points: number) => void
}) {
  const { item, state } = column

  const limit = Math.max(0, Math.min(state.maxPoints, available))
  const [points, setPoints] = useState(limit)
  const [draft, setDraft] = useState<string | null>(null)

  const clamp = (n: number) => Math.max(1, Math.min(limit, Math.round(n) || 1))
  const chosen = limit === 0 ? 0 : Math.min(Math.max(points, 1), limit)
  const gain = pointsGain(chosen, state.score, item.maxScore)
  const reachesFull = chosen > 0 && state.score + gain >= item.maxScore
  const blocked = locked || tooMany || limit === 0

  function step(delta: number) {
    setDraft(null)
    setPoints(clamp(chosen + delta))
  }

  return (
    <div ref={register}>
    <Card
      pad="tight"
      className={cn(
        'space-y-3',
        highlighted && 'ring-2 ring-[var(--color-ring)]',
      )}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold" title={item.name}>
            {item.name}
          </p>
          <p className="text-xs text-muted">{COMPONENT_LABEL[item.component]}</p>
        </div>
      </div>

      <p className="text-sm tabular-nums">
        <span className="text-muted">{formatMarks(state.score)}</span>
        <span className="px-1.5 text-muted">→</span>
        <span className="font-semibold">{formatMarks(state.score + gain)}</span>
        <span className="text-muted"> / {formatMarks(item.maxScore)}</span>
        {reachesFull && <span className="block text-xs text-muted">That’s full marks.</span>}
      </p>

      <div
        role="group"
        aria-label={`Points to use on ${item.name}`}
        className="flex items-center justify-between gap-3"
      >
        <span className="text-xs text-muted">Points to use</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="One fewer point"
            disabled={blocked || chosen <= 1}
            onClick={() => step(-1)}
            className="h-11 w-11 rounded-xl border border-line text-lg font-semibold disabled:opacity-40"
          >
            −
          </button>
          <input
            // text-base: below 16px iOS Safari zooms the page on focus.
            className="h-11 w-14 rounded-xl border border-line bg-canvas text-center text-base tabular-nums focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)] disabled:opacity-60"
            inputMode="numeric"
            aria-label="Number of points"
            disabled={blocked}
            value={draft ?? String(chosen)}
            onChange={(e) => setDraft(e.target.value.replace(/\D/g, '').slice(0, 2))}
            onBlur={() => {
              if (draft !== null) setPoints(clamp(Number(draft)))
              setDraft(null)
            }}
            onFocus={(e) => e.currentTarget.select()}
          />
          <button
            type="button"
            aria-label="One more point"
            disabled={blocked || chosen >= limit}
            onClick={() => step(1)}
            className="h-11 w-11 rounded-xl border border-line text-lg font-semibold disabled:opacity-40"
          >
            +
          </button>
        </div>
      </div>
      {limit > 0 && (
        <p className="text-2xs text-muted">
          You can use up to {limit} point{limit === 1 ? '' : 's'} here
          {limit < state.maxPoints ? ' — that’s all you have free' : ' — that reaches full marks'}.
        </p>
      )}

      <Button
        className="w-full"
        variant={blocked ? 'outline' : 'primary'}
        disabled={blocked}
        onClick={() => onPick(draft !== null ? clamp(Number(draft)) : chosen)}
      >
        {locked
          ? 'Closed'
          : tooMany
            ? `${MAX_PENDING_REDEMPTIONS} requests waiting`
            : limit === 0
              ? 'You have no free points'
              : `Use ${chosen} point${chosen === 1 ? '' : 's'}`}
      </Button>
    </Card>
    </div>
  )
}

function OtherRow({
  column,
  highlighted,
  register,
}: {
  column: BoostColumn
  highlighted: boolean
  register: (el: HTMLElement | null) => void
}) {
  const { subject, item, state } = column
  const tone =
    state.kind === 'boosted' ? 'reward' : state.kind === 'pending' ? 'warn' : 'neutral'

  return (
    <div
      ref={register}
      className={cn(
        'flex items-center gap-3 p-3.5',
        highlighted && 'bg-accent-solid/8 ring-2 ring-inset ring-[var(--color-ring)]',
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" title={item.name}>
          {item.name}
        </p>
        <p className="truncate text-xs text-muted">
          {subject.code} · {TERM_TITLE[item.term]} · {COMPONENT_LABEL[item.component]}
        </p>
      </div>
      <Chip tone={tone} size="sm" className="max-w-[55%] truncate">
        {boostReason(state)}
      </Chip>
    </div>
  )
}

