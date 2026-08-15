import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { SuccessTick } from '@/components/ui/SuccessTick'
import { useToast } from '@/components/ui/Toast'
import { awardPoints } from '@/lib/api'
import { errorText } from '@/lib/errors'
import { cn } from '@/lib/cn'
import type { PointCategory } from '@/lib/types'

const POINTS = [1, 2, 3, 4, 5]
/** Largest magnitude a single award may carry — matches the point_events CHECK (0011). */
const MAX_POINTS = 100
/** Above this, a single-student deduction still asks for confirmation. */
const BIG_PENALTY = 5

type Mode = 'reward' | 'penalty'

const CATEGORIES: Array<{ value: PointCategory; label: string }> = [
  { value: 'recitation', label: 'Recitation' },
  { value: 'activity', label: 'Activity' },
]

interface Props {
  /** Students currently ticked in the roster. The bar hides when empty. */
  selectedIds: string[]
  onClear: () => void
  /** Called after a successful award so the roster can refresh its totals. */
  onAwarded: (awardedIds: string[]) => void
}

/**
 * The award controls, docked above the roster.
 *
 * Awarding used to be its own tab; it now lives where the students are. The bulk
 * flow is the point of this component — tick several students, choose the amount
 * once, award them all — so sign, amount and category stay on the quick path and
 * only the custom amount and note hide behind "More".
 *
 * Positioned to sit ABOVE the mobile tab bar (Shell renders that fixed at
 * bottom-0), so navigation is never blocked while a selection is active.
 */
export function AwardBar({ selectedIds, onClear, onAwarded }: Props) {
  const { toast } = useToast()
  const [mode, setMode] = useState<Mode>('reward')
  // Magnitude (1+); the sign comes from `mode` at award time. null = invalid,
  // which disables the action rather than silently guessing a number.
  const [points, setPoints] = useState<number | null>(1)
  const [custom, setCustom] = useState('')
  const [customError, setCustomError] = useState<string>()
  const [category, setCategory] = useState<PointCategory>('recitation')
  const [note, setNote] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [celebrate, setCelebrate] = useState(false)

  const penalty = mode === 'penalty'
  const count = selectedIds.length
  const ready = points !== null && count > 0

  /** Deductions are destructive: confirm any bulk one, or a large single one. */
  const needsConfirm = penalty && ready && (count > 1 || (points ?? 0) > BIG_PENALTY)

  const actionLabel = ready
    ? penalty
      ? `Deduct −${points} from ${count}`
      : `Award +${points} to ${count}`
    : 'Pick an amount'

  async function submit() {
    if (!ready) return
    setConfirming(false)
    setSubmitting(true)
    const signed = penalty ? -(points as number) : (points as number)
    try {
      await awardPoints({
        studentIds: selectedIds,
        points: signed,
        category: penalty ? 'penalty' : category,
        note: note.trim() || undefined,
      })
      const verb = penalty ? `−${points} from` : `+${points} to`
      toast(`${verb} ${count} student${count > 1 ? 's' : ''}`, 'success')
      setNote('')
      setCelebrate(true)
      onAwarded(selectedIds)
    } catch (e) {
      toast(errorText(e, 'Could not award those points.'), 'error')
    } finally {
      setSubmitting(false)
    }
  }

  function onCustomChange(raw: string) {
    setCustom(raw)
    if (raw.trim() === '') {
      // Empty simply falls back to the chips; not an error worth shouting about.
      setCustomError(undefined)
      setPoints(null)
      return
    }
    const n = Number(raw)
    // Reject rather than clamp — silently turning 500 into 100 is how a
    // mis-typed award becomes a real one nobody notices.
    if (!Number.isInteger(n) || n < 1 || n > MAX_POINTS) {
      setCustomError(`Enter a whole number from 1 to ${MAX_POINTS}.`)
      setPoints(null)
      return
    }
    setCustomError(undefined)
    setPoints(n)
  }

  return (
    <>
      <SuccessTick show={celebrate} onDone={() => setCelebrate(false)} />

      <AnimatePresence>
        {count > 0 && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            className={cn(
              'fixed inset-x-0 z-30 mx-auto w-full max-w-2xl px-4',
              // Clears the fixed mobile tab bar; on desktop the nav is a sidebar.
              'bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-6 md:px-8',
            )}
          >
            <div
              className={cn(
                'theme-transition rounded-2xl border bg-card p-3 shadow-lg shadow-black/20',
                // The whole bar turns red while deducting — the sign toggle alone
                // was too quiet for an action that takes points away.
                penalty ? 'border-brand-500 ring-1 ring-brand-500/40' : 'border-line',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">
                  {count} selected
                  {penalty && <span className="ml-1.5 text-brand-500">· deducting</span>}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setExpanded((v) => !v)}
                    className="rounded-lg px-2 py-1 text-xs font-medium text-muted transition-colors hover:text-ink"
                  >
                    {expanded ? 'Less' : 'More'}
                  </button>
                  <button
                    type="button"
                    onClick={onClear}
                    className="rounded-lg px-2 py-1 text-xs font-medium text-muted transition-colors hover:text-ink"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="mt-2 flex items-center gap-2">
                {/* Sign toggle — penalty forces category 'penalty' at award time. */}
                <div className="flex shrink-0 overflow-hidden rounded-lg border border-line">
                  {(['reward', 'penalty'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      aria-pressed={mode === m}
                      aria-label={m === 'reward' ? 'Award points' : 'Deduct points'}
                      onClick={() => setMode(m)}
                      className={cn(
                        'px-2.5 py-1.5 text-sm font-bold transition-colors',
                        mode === m
                          ? m === 'penalty'
                            ? 'bg-brand-500 text-white'
                            : 'bg-gold-400 text-brand-950'
                          : 'text-muted hover:text-ink',
                      )}
                    >
                      {m === 'reward' ? '+' : '−'}
                    </button>
                  ))}
                </div>

                <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
                  {POINTS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      aria-pressed={points === p && !custom}
                      onClick={() => {
                        setPoints(p)
                        setCustom('')
                        setCustomError(undefined)
                      }}
                      className={cn(
                        'h-9 w-9 shrink-0 rounded-lg border text-sm font-bold tabular-nums transition-colors',
                        points === p && !custom
                          ? 'border-brand-500 bg-brand-500/10 text-brand-500'
                          : 'border-line text-muted hover:text-ink',
                      )}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Category stays on the quick path (it changes per award); hidden
                  while deducting, where the category is always 'penalty'. */}
              {!penalty && (
                <div className="mt-2 flex gap-1.5">
                  {CATEGORIES.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      aria-pressed={category === c.value}
                      onClick={() => setCategory(c.value)}
                      className={cn(
                        'rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors',
                        category === c.value
                          ? 'border-brand-500 bg-brand-500/10 text-brand-500'
                          : 'border-line text-muted hover:text-ink',
                      )}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              )}

              {expanded && (
                <div className="mt-2 space-y-2">
                  <Input
                    label="Custom points"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={MAX_POINTS}
                    value={custom}
                    onChange={(e) => onCustomChange(e.target.value)}
                    placeholder={`1–${MAX_POINTS}`}
                    error={customError}
                  />
                  <Input
                    label="Note (optional)"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={
                      penalty ? 'Reason — e.g. late, disruptive' : 'e.g. answered the bonus question'
                    }
                  />
                </div>
              )}

              <Button
                size="md"
                className={cn('mt-2 w-full', penalty && 'bg-brand-500 hover:bg-brand-600')}
                disabled={submitting || !ready}
                onClick={() => (needsConfirm ? setConfirming(true) : void submit())}
              >
                {submitting ? 'Saving…' : actionLabel}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={confirming}
        title={`Deduct ${points} point${(points ?? 0) === 1 ? '' : 's'}?`}
        message={
          count > 1
            ? `${count} students will each lose ${points} point${(points ?? 0) === 1 ? '' : 's'}.`
            : `This student will lose ${points} points.`
        }
        detail={
          note.trim()
            ? `Reason: ${note.trim()}`
            : 'No reason noted — students see the deduction in their feed either way.'
        }
        confirmLabel={`Deduct −${points}`}
        busy={submitting}
        onClose={() => setConfirming(false)}
        onConfirm={() => void submit()}
      />
    </>
  )
}
