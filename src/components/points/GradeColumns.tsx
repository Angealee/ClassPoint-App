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

/**
 * The student's grade columns, as somewhere to spend points.
 *
 * ── AUTOMATIC, AND THE STUDENT CHOOSES THE AMOUNT (0064) ───────────────────
 * Nothing is set up by the instructor: every column is open the moment the
 * student's mark is in. 1 point = 1 mark, they pick how many (from 1 up to the
 * marks still missing to the maximum, and no more than their balance), and the
 * gain is capped so a mark can never pass the maximum. Still approved by hand.
 *
 * ── THIS IS THE ONE PLACE POINTS ARE USED ON A COLUMN ──────────────────────
 * The Grades screen only LINKS here (a banner, and a small link on each
 * boostable row, deep-linking with `?column=<id>`). Before this the confirm
 * dialog lived on Grades, so spending was split across two screens and the
 * warning and the rules existed twice. They exist once now.
 *
 * ── ACTIONABLE FIRST ───────────────────────────────────────────────────────
 * Most columns are not boostable (unmarked, already full, not offered). The
 * boostable ones are the screen; everything else is one collapsed list that
 * says WHY, so a student who cannot find the quiz they care about learns that it
 * is unmarked rather than wondering whether the app lost it.
 *
 * The data is StudentData's `grades` — the same slice the Grades screen and the
 * Home card read — so this fires no grade query of its own. Everything shown is
 * a PREVIEW of what `request_grade_boost` accepts (see `grade-boost.ts`); the
 * server is the authority and re-checks all of it.
 */
export function GradeColumns({
  available,
  tooMany,
  highlightId,
  onRequested,
}: {
  /** Points not already promised to a waiting request. */
  available: number
  /** The student already has the maximum number of requests waiting. */
  tooMany: boolean
  /** A column to bring into view and mark — from `?column=` on the link. */
  highlightId: string | null
  /** Called after a request goes through, so the parent can re-read its list. */
  onRequested: () => void
}) {
  const { me, grades, gradesLoading, gradesError, reloadGrades, semesterEnded } = useStudentData()
  const { toast } = useToast()

  const subjects = useMemo(() => grades?.subjects ?? [], [grades])
  const { actionable, other } = useMemo(() => boostColumns(subjects), [subjects])

  const [otherOpen, setOtherOpen] = useState(false)
  // The column the student is confirming, and how many points they chose for it.
  const [target, setTarget] = useState<{
    column: BoostColumn<AvailableBoost>
    points: number
  } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // A deep link to a column that is NOT actionable has to open the collapsed
  // list, or the highlight would point at something nobody can see.
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
      // The column may have changed under us (a new mark, a retired column).
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
        // The warning IS the validation: this trades leaderboard standing for
        // marks, and only the instructor can reverse it.
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

/** Boostable columns, grouped by subject and term in the grid's own order. */
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
  // One heading per subject + term. The columns arrive already ordered, so a
  // heading is just "the group changed".
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

  // The most they can use: the marks still missing (rounded up to a whole point,
  // capped at 50 — `state.maxPoints`), and never more than they have free.
  const limit = Math.max(0, Math.min(state.maxPoints, available))
  const [points, setPoints] = useState(limit)
  // A typed value is held as text so a half-typed number is not fought; it is
  // clamped when they leave the field or press a step.
  const [draft, setDraft] = useState<string | null>(null)

  const clamp = (n: number) => Math.max(1, Math.min(limit, Math.round(n) || 1))
  // If their balance or the mark moves under us (a refresh after a request),
  // keep the choice inside the new range rather than offering what the server
  // would refuse.
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
        // The column the student came from. A ring rather than a fill, so it
        // reads as "this one" without changing the card's own colours.
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

      {/* How many points. 1 point = 1 mark; the most you can pick is what takes you
          to the maximum, so a mark can never pass it. Steppers are real 44px
          targets, and the number is editable for a quick jump. */}
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

      {/* Filled when the student can act NOW, outline when they cannot. */}
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

