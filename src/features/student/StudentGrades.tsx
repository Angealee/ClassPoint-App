import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card, Rows } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState, ErrorState } from '@/components/ui/EmptyState'
import { PullToRefresh } from '@/components/ui/PullToRefresh'
import { ScreenTitle } from '@/components/ui/ScreenTitle'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Select } from '@/components/ui/Select'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { TableIcon } from '@/components/ui/icons'
import { listMyRedemptions, requestGradeBoost } from '@/lib/api'
import { errorText } from '@/lib/errors'
import { boostState, formatMarks, type BoostState } from '@/lib/grade-boost'
import { displayGrade } from '@/lib/grading'
import {
  TERM_TITLE,
  boostableCount,
  latestSoFar,
  summarizeTerm,
  termsWithItems,
} from '@/lib/student-grades'
import {
  MAX_PENDING_REDEMPTIONS,
  type MyGradeItem,
  type Redemption,
  type TermKey,
} from '@/lib/types'
import { useStudentData } from './StudentData'

type Available = Extract<BoostState, { kind: 'available' }>

/**
 * The student's own grades.
 *
 * ── WHAT THIS SCREEN WILL NOT SHOW ─────────────────────────────────────────
 * Never the official figure — the one that counts an unmarked column as a zero.
 * `student-grades.ts` has no path to it. What it shows is each mark, each
 * component, and a "so far" figure that is the SAME number the instructor's own
 * sheet shows under its So-far toggle.
 *
 * ── DATA ───────────────────────────────────────────────────────────────────
 * From `StudentData`, which fetches it once off the critical path, and which the
 * Home card reads too. This screen fires no grade query of its own. It does
 * read the student's redemption list — not for grades, but because "can I afford
 * this, and do I already have three waiting" is answered by requests that are
 * not boosts at all.
 *
 * Everything the screen offers is a PREVIEW of what `request_grade_boost` will
 * accept (see `grade-boost.ts`); the server is the authority and re-checks all
 * of it.
 */
export function StudentGrades() {
  const { me, grades, gradesLoading, gradesError, reloadGrades, refresh, semesterEnded } =
    useStudentData()
  const { toast } = useToast()

  const subjects = useMemo(() => grades?.subjects ?? [], [grades])

  // Held only as the student's CHOICE; the effective value is derived below, so
  // a subject or term that disappears on a reload falls back instead of leaving
  // the screen pointing at nothing.
  const [pickedSubject, setPickedSubject] = useState<string | null>(null)
  const [pickedTerm, setPickedTerm] = useState<TermKey | null>(null)

  const subject = subjects.find((s) => s.subjectId === pickedSubject) ?? subjects[0] ?? null
  const terms = useMemo(() => (subject ? termsWithItems(subject) : []), [subject])
  const term =
    pickedTerm && terms.includes(pickedTerm)
      ? pickedTerm
      : subject
        ? (latestSoFar(subject)?.term ?? terms[0] ?? null)
        : null

  // ── spendable points ─────────────────────────────────────────────────────
  const studentId = me?.id
  const [history, setHistory] = useState<Redemption[]>([])
  useEffect(() => {
    if (!studentId) return
    let alive = true
    listMyRedemptions(studentId)
      .then((rows) => {
        if (alive) setHistory(rows)
      })
      // Best-effort: without it the buttons stay enabled and the server says no.
      .catch(() => {})
    return () => {
      alive = false
    }
    // `grades` is a dependency on purpose: a decision or a new request replaces
    // it (StudentData reloads on the point_redemptions event), and that is when
    // the pending total changes.
  }, [studentId, grades])

  const pending = useMemo(() => history.filter((r) => r.status === 'pending'), [history])
  const pendingPoints = pending.reduce((n, r) => n + r.points, 0)
  const available = Math.max(0, (me?.semester_points ?? 0) - pendingPoints)
  const tooMany = pending.length >= MAX_PENDING_REDEMPTIONS

  // ── the request ──────────────────────────────────────────────────────────
  const [target, setTarget] = useState<{ item: MyGradeItem; offer: Available } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onConfirm() {
    if (!target) return
    setSubmitting(true)
    try {
      await requestGradeBoost(target.item.id)
      toast('Request sent — your instructor will decide.', 'success')
      setTarget(null)
      await reloadGrades()
    } catch (e) {
      toast(errorText(e, 'Could not send that request. Try again.'), 'error')
      // The column may have changed under us (a new mark, a retired column).
      setTarget(null)
      void reloadGrades()
    } finally {
      setSubmitting(false)
    }
  }

  const onRefresh = async () => {
    await Promise.all([reloadGrades(), refresh()])
  }

  // ── states ───────────────────────────────────────────────────────────────
  const header = (
    <ScreenTitle
      title="Grades"
      subtitle={
        grades?.enabled
          ? `${available} point${available === 1 ? '' : 's'} available to spend`
          : 'Your marks, as your instructor enters them.'
      }
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
  const boostable = boostableCount(subjects)

  return (
    <PullToRefresh onRefresh={onRefresh}>
      <div className="space-y-4 pb-4">
        {header}

        {/* A failed RE-fetch leaves the last good marks on screen; say so rather
            than silently showing numbers that may be stale. */}
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

        {boostable > 0 && !semesterEnded && (
          <p className="rounded-lg bg-gold-400/10 px-3 py-2 text-xs font-medium text-warn">
            {boostable} column{boostable === 1 ? '' : 's'} can be boosted with points. Spending
            lowers your XP, level and rank.
          </p>
        )}

        {summary.components
          .filter((c) => summary.items.some((i) => i.component === c.component))
          .map((c) => (
            <div key={c.component}>
              <div className="mb-1.5 flex items-baseline justify-between px-1">
                <h2 className="text-sm font-semibold">{c.label}</h2>
                <span className="text-xs tabular-nums text-muted">
                  {c.score === null ? '—' : displayGrade(c.score)}
                </span>
              </div>
              <Rows>
                {summary.items
                  .filter((i) => i.component === c.component)
                  .map((item) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      available={available}
                      tooMany={tooMany}
                      locked={semesterEnded}
                      onBoost={(offer) => setTarget({ item, offer })}
                    />
                  ))}
              </Rows>
            </div>
          ))}
      </div>

      <ConfirmDialog
        open={!!target}
        variant="danger"
        title={target ? `Use ${target.offer.cost} points on ${target.item.name}?` : ''}
        message={
          target ? (
            <>
              You’re asking to spend{' '}
              <span className="font-semibold text-ink">{target.offer.cost} points</span> to add{' '}
              <span className="font-semibold text-ink">
                {formatMarks(target.offer.gain)} mark{target.offer.gain === 1 ? '' : 's'}
              </span>
              : <span className="font-semibold text-ink">{formatMarks(target.offer.score)}</span>{' '}
              becomes{' '}
              <span className="font-semibold text-ink">{formatMarks(target.offer.newScore)}</span> out
              of {formatMarks(target.item.maxScore)}.
              {target.offer.gain < target.offer.bonus && (
                <>
                  {' '}
                  The bonus is {formatMarks(target.offer.bonus)}, but this column tops out at{' '}
                  {formatMarks(target.item.maxScore)}, so you’d gain {formatMarks(target.offer.gain)}.
                </>
              )}{' '}
              Nothing is spent until your instructor approves it.
            </>
          ) : null
        }
        // The same words UsePoints uses, because the warning is the validation:
        // this is a trade of leaderboard standing for marks, and it is only
        // reversible by the instructor.
        detail={
          target
            ? `If approved, your total drops to ${Math.max(0, (me?.semester_points ?? 0) - target.offer.cost)} — your level and leaderboard rank drop with it, and you climb the spend board. You can’t undo it yourself.`
            : undefined
        }
        confirmLabel="Send request"
        busy={submitting}
        onConfirm={onConfirm}
        onClose={() => setTarget(null)}
      />
    </PullToRefresh>
  )
}

function ItemRow({
  item,
  available,
  tooMany,
  locked,
  onBoost,
}: {
  item: MyGradeItem
  available: number
  tooMany: boolean
  /** The semester has ended — no new requests, whatever the column says. */
  locked: boolean
  onBoost: (offer: Available) => void
}) {
  const state = boostState(item)

  const scoreLine =
    item.score === null
      ? 'Not marked yet'
      : `${formatMarks(item.score)} / ${formatMarks(item.maxScore)}`

  return (
    <div className="flex items-center gap-3 p-3.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" title={item.name}>
          {item.name}
        </p>
        <p className="text-xs tabular-nums text-muted">
          {scoreLine}
          {state.kind === 'boosted' && ` · was ${formatMarks(state.before)}`}
          {state.kind === 'unmarked' && !locked && ' · points can boost this once it’s marked'}
        </p>
      </div>

      {state.kind === 'boosted' && (
        // The indicator the instructor asked for: it must still read as boosted
        // when the mark is now AT the maximum, which is the usual case.
        <Chip tone="reward" size="sm">
          +{formatMarks(state.marks)} from {state.points} pts
        </Chip>
      )}

      {state.kind === 'pending' && (
        <Chip tone="warn" size="sm">
          Waiting
        </Chip>
      )}

      {state.kind === 'available' && !locked && (
        <Button
          size="sm"
          variant="outline"
          disabled={tooMany || state.cost > available}
          onClick={() => onBoost(state)}
        >
          {tooMany
            ? `${MAX_PENDING_REDEMPTIONS} waiting`
            : state.cost > available
              ? `Need ${state.cost - available} more`
              : `+${formatMarks(state.gain)} for ${state.cost} pts`}
        </Button>
      )}
    </div>
  )
}
