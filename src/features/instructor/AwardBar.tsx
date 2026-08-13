import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/Toast'
import { awardPoints } from '@/lib/api'
import { cn } from '@/lib/cn'
import type { PointCategory } from '@/lib/types'

const POINTS = [1, 2, 3, 4, 5]
/** Largest magnitude a single award may carry — matches the point_events CHECK (0011). */
const MAX_POINTS = 100

type Mode = 'reward' | 'penalty'

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
 * once, award them all — so the quick path (sign, amount, Award) stays on one
 * row and the rarely-changed bits (category, note) hide behind "More".
 *
 * Positioned to sit ABOVE the mobile tab bar (Shell renders that fixed at
 * bottom-0), so navigation is never blocked while a selection is active.
 */
export function AwardBar({ selectedIds, onClear, onAwarded }: Props) {
  const { toast } = useToast()
  const [mode, setMode] = useState<Mode>('reward')
  // Magnitude (1+); the sign comes from `mode` at award time.
  const [points, setPoints] = useState<number | null>(1)
  const [custom, setCustom] = useState('')
  const [category, setCategory] = useState<PointCategory>('recitation')
  const [note, setNote] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const penalty = mode === 'penalty'
  const count = selectedIds.length

  async function onAward() {
    if (points === null || count === 0) return
    setSubmitting(true)
    const signed = penalty ? -points : points
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
      onAwarded(selectedIds)
    } catch {
      toast('Could not award those points.', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
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
          <div className="theme-transition rounded-2xl border border-line bg-card p-3 shadow-lg shadow-black/20">
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

              <Button
                size="sm"
                className="shrink-0"
                disabled={submitting || points === null}
                onClick={onAward}
              >
                {submitting ? '…' : 'Award'}
              </Button>
            </div>

            {expanded && (
              <div className="mt-2 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    label="Custom points"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={MAX_POINTS}
                    value={custom}
                    onChange={(e) => {
                      const raw = e.target.value
                      setCustom(raw)
                      const n = parseInt(raw, 10)
                      setPoints(Number.isFinite(n) ? Math.min(MAX_POINTS, Math.max(1, n)) : null)
                    }}
                    placeholder="e.g. 10"
                  />
                  <Select
                    label="Category"
                    value={category}
                    disabled={penalty}
                    onChange={(e) => setCategory(e.target.value as PointCategory)}
                  >
                    <option value="recitation">Recitation</option>
                    <option value="activity">Activity</option>
                  </Select>
                </div>
                <Input
                  label="Note (optional)"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. answered the bonus question"
                />
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
