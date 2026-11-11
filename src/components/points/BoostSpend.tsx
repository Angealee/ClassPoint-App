import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { useStudentData } from '@/features/student/StudentData'
import { listMyRedemptions, requestGradeBoost } from '@/lib/api'
import { errorText } from '@/lib/errors'
import { formatMarks, pointsGain } from '@/lib/grade-boost'
import type { AvailableBoost, BoostColumn } from '@/lib/student-grades'
import { MAX_PENDING_REDEMPTIONS } from '@/lib/types'

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

function heldFrom(rows: Array<{ status: string; points: number }>) {
  const pending = rows.filter((r) => r.status === 'pending')
  return { points: pending.reduce((n, r) => n + r.points, 0), count: pending.length }
}

/** Free points and the pending-request cap, for screens that spend. */
export function useSpendBudget() {
  const { me } = useStudentData()
  const studentId = me?.id
  const [held, setHeld] = useState({ points: 0, count: 0 })

  const reload = useCallback(async () => {
    if (!studentId) return
    try {
      setHeld(heldFrom(await listMyRedemptions(studentId)))
    } catch {
      // server re-checks every request
    }
  }, [studentId])

  useEffect(() => {
    if (!studentId) return
    let alive = true
    listMyRedemptions(studentId)
      .then((rows) => alive && setHeld(heldFrom(rows)))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [studentId])

  return {
    available: Math.max(0, (me?.semester_points ?? 0) - held.points),
    tooMany: held.count >= MAX_PENDING_REDEMPTIONS,
    reload,
  }
}

/** Confirm + send flow for a points-assist request. Render `dialog` once. */
export function useBoostRequest(onRequested?: () => void): {
  ask: (column: BoostColumn<AvailableBoost>, points: number) => void
  dialog: ReactNode
} {
  const { me, reloadGrades } = useStudentData()
  const { toast } = useToast()
  const [target, setTarget] = useState<{ column: BoostColumn<AvailableBoost>; points: number } | null>(
    null,
  )
  const [submitting, setSubmitting] = useState(false)

  async function onConfirm() {
    if (!target) return
    setSubmitting(true)
    try {
      await requestGradeBoost(target.column.item.id, target.points)
      toast('Request sent — your instructor will decide.', 'success')
      setTarget(null)
      await reloadGrades()
      onRequested?.()
    } catch (e) {
      toast(errorText(e, 'Could not send that request. Try again.'), 'error')
      setTarget(null)
      void reloadGrades()
    } finally {
      setSubmitting(false)
    }
  }

  const gain = target
    ? pointsGain(target.points, target.column.state.score, target.column.item.maxScore)
    : 0

  const dialog = (
    <ConfirmDialog
      open={!!target}
      variant="default"
      title={target ? `Use ${plural(target.points, 'point')} on ${target.column.item.name}?` : ''}
      message={
        target ? (
          <>
            Spend <span className="font-semibold text-ink">{plural(target.points, 'point')}</span> to add{' '}
            <span className="font-semibold text-ink">{plural(gain, 'mark')}</span> (
            {formatMarks(target.column.state.score)} →{' '}
            <span className="font-semibold text-ink">
              {formatMarks(target.column.state.score + gain)}
            </span>{' '}
            of {formatMarks(target.column.item.maxScore)}). If your instructor approves, your points drop to{' '}
            {Math.max(0, (me?.semester_points ?? 0) - target.points)} and your level and rank drop with them.
          </>
        ) : null
      }
      confirmLabel="Send request"
      busy={submitting}
      onConfirm={onConfirm}
      onClose={() => setTarget(null)}
    />
  )

  return { ask: (column, points) => setTarget({ column, points }), dialog }
}

/** The − / number / + stepper and its button. */
export function PointsPicker({
  column,
  available,
  tooMany,
  locked,
  onPick,
  onChosen,
}: {
  column: BoostColumn<AvailableBoost>
  available: number
  tooMany: boolean
  locked: boolean
  onPick: (points: number) => void
  onChosen?: (points: number) => void
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

  const hint = useMemo(
    () =>
      limit > 0
        ? `up to ${limit}${limit < state.maxPoints ? ' (all you have free)' : ''}${reachesFull ? ' · full marks' : ''}`
        : null,
    [limit, state.maxPoints, reachesFull],
  )

  function step(delta: number) {
    setDraft(null)
    const next = clamp(chosen + delta)
    setPoints(next)
    onChosen?.(next)
  }

  return (
    <div className="mt-3 space-y-3 border-t border-line pt-3">
      <div
        role="group"
        aria-label={`Points to use on ${item.name}`}
        className="flex items-center justify-between gap-3"
      >
        <span className="text-xs text-muted">
          Points to use
          {hint && <span className="block text-2xs">{hint}</span>}
        </span>
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
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, '').slice(0, 2)
              setDraft(v)
              if (v) onChosen?.(clamp(Number(v)))
            }}
            onBlur={() => {
              if (draft !== null) {
                const next = clamp(Number(draft))
                setPoints(next)
                onChosen?.(next)
              }
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
              : `Use ${plural(chosen, 'point')}`}
      </Button>
    </div>
  )
}
