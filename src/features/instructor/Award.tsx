import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { CheckIcon } from '@/components/ui/icons'
import { useInstructor } from './InstructorLayout'
import { awardPoints, listStudents } from '@/lib/api'
import { cn } from '@/lib/cn'
import type { PointCategory, SectionStudent } from '@/lib/types'

const POINTS = [1, 2, 3, 4, 5]
// Largest magnitude a single award/penalty may carry. Must match the
// point_events check constraint in migration 0011 (points between -100 and 100).
const MAX_POINTS = 100
type Mode = 'reward' | 'penalty'

export function Award() {
  const { sections, selectedSectionId, setSelectedSectionId } = useInstructor()
  const { toast } = useToast()

  const [students, setStudents] = useState<SectionStudent[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [mode, setMode] = useState<Mode>('reward')
  // Magnitude (1+); the sign is decided by `mode` at award time.
  const [points, setPoints] = useState<number | null>(null)
  // Raw text of the custom-points field (empty unless a custom value is in use).
  const [custom, setCustom] = useState('')
  const [category, setCategory] = useState<PointCategory>('recitation')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const sectionName = sections.find((s) => s.id === selectedSectionId)?.name ?? ''

  async function refresh() {
    if (!selectedSectionId) return
    setLoading(true)
    try {
      setStudents(await listStudents(selectedSectionId))
    } catch {
      toast('Could not load students.', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setSelected(new Set())
    setQuery('')
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSectionId])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return students
    return students.filter((s) => s.full_name.toLowerCase().includes(q))
  }, [students, query])

  // "Select all" acts on the currently visible (filtered) students.
  const allSelected = filtered.length > 0 && filtered.every((s) => selected.has(s.id))

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allSelected) filtered.forEach((s) => next.delete(s.id))
      else filtered.forEach((s) => next.add(s.id))
      return next
    })
  }

  // Selecting a preset clears any custom value; typing a custom value clears presets.
  function pickPreset(p: number) {
    setCustom('')
    setPoints(p)
  }

  function onCustom(v: string) {
    setCustom(v)
    const n = parseInt(v, 10)
    // Valid only when a positive whole number within the allowed magnitude;
    // anything over MAX_POINTS is treated as not-yet-valid (the DB would reject it).
    setPoints(Number.isFinite(n) && n > 0 && n <= MAX_POINTS ? n : null)
  }

  // The custom field has text but it doesn't resolve to a usable amount.
  const customInvalid = custom.trim() !== '' && points === null

  const customActive = points !== null && !POINTS.includes(points)

  const canAward = selected.size > 0 && points !== null && !submitting

  const penalty = mode === 'penalty'

  async function onAward() {
    if (points === null || selected.size === 0) return
    setSubmitting(true)
    const count = selected.size
    const signed = penalty ? -points : points
    try {
      await awardPoints({
        studentIds: [...selected],
        points: signed,
        category: penalty ? 'penalty' : category,
        note: note.trim() || undefined,
      })
      const verb = penalty ? `−${points} from` : `+${points} to`
      toast(`${verb} ${count} student${count > 1 ? 's' : ''}`, 'success')
      setSelected(new Set())
      setPoints(null)
      setCustom('')
      setNote('')
      await refresh()
    } catch {
      toast(penalty ? 'Could not deduct points.' : 'Could not award points.', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={cn('space-y-4', selected.size > 0 && 'pb-80 md:pb-72')}>
      <Select
        label="Section"
        value={selectedSectionId}
        onChange={(e) => setSelectedSectionId(e.target.value)}
        className="max-w-40"
      >
        {sections.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </Select>

      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-bold">Award points</h1>
        {students.length > 0 && (
          <button
            type="button"
            onClick={toggleAll}
            className="text-sm font-medium text-brand-500 hover:underline"
          >
            {allSelected ? 'Clear all' : 'Select all'}
          </button>
        )}
      </div>

      {students.length > 0 && (
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search students…"
          aria-label="Search students"
        />
      )}

      {loading ? (
        <ListSkeleton rows={6} />
      ) : students.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">
          No students in {sectionName} yet — add some in the Students tab.
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">
          No students match “{query.trim()}”.
        </Card>
      ) : (
        <Card className="divide-y divide-line">
          {filtered.map((s) => {
            const isSel = selected.has(s.id)
            return (
              <button
                type="button"
                key={s.id}
                onClick={() => toggle(s.id)}
                className="flex w-full items-center gap-3 p-3.5 text-left transition-colors hover:bg-card-2"
              >
                <span
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-colors',
                    isSel ? 'border-brand-500 bg-brand-500 text-white' : 'border-line',
                  )}
                >
                  {isSel && <CheckIcon className="h-4 w-4" />}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{s.full_name}</span>
                <span className="font-display text-sm font-bold text-gold-600 dark:text-gold-400">
                  {s.lifetime_points}
                </span>
              </button>
            )
          })}
        </Card>
      )}

      {/* Sticky award panel */}
      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div
            initial={{ y: 120, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 120, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="fixed inset-x-0 bottom-19 z-30 mx-auto w-full max-w-2xl px-4 md:bottom-6 md:left-60 md:right-0"
          >
            <Card className="space-y-3 p-4 shadow-xl">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{selected.size} selected</span>
                {/* Reward / Penalty mode */}
                <div className="flex gap-1.5">
                  {(['reward', 'penalty'] as Mode[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMode(m)}
                      className={cn(
                        'rounded-lg px-3 py-1 text-xs font-semibold capitalize transition-colors',
                        mode === m
                          ? m === 'penalty'
                            ? 'bg-red-500 text-white'
                            : 'bg-brand-500 text-white'
                          : 'bg-card-2 text-muted hover:text-ink',
                      )}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              {/* Category only applies to rewards; penalties are their own category. */}
              {!penalty && (
                <div className="flex gap-1.5">
                  {(['recitation', 'activity'] as PointCategory[]).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCategory(c)}
                      className={cn(
                        'rounded-lg px-3 py-1 text-xs font-semibold capitalize transition-colors',
                        category === c
                          ? 'bg-brand-500 text-white'
                          : 'bg-card-2 text-muted hover:text-ink',
                      )}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                {POINTS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => pickPreset(p)}
                    className={cn(
                      'flex h-11 flex-1 items-center justify-center rounded-xl font-display text-lg font-bold transition-all',
                      points === p
                        ? penalty
                          ? 'bg-red-500 text-white ring-2 ring-red-600 ring-offset-2 ring-offset-card'
                          : 'bg-gold-400 text-brand-950 ring-2 ring-gold-500 ring-offset-2 ring-offset-card'
                        : 'bg-card-2 text-ink hover:bg-line',
                    )}
                  >
                    {penalty ? `−${p}` : `+${p}`}
                  </button>
                ))}
              </div>

              {/* Custom amount for anything beyond the presets. */}
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-xs font-semibold text-muted">Custom</span>
                <div className="relative flex-1">
                  <span
                    className={cn(
                      'pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 font-display text-lg font-bold',
                      customActive
                        ? penalty
                          ? 'text-red-500'
                          : 'text-gold-600 dark:text-gold-400'
                        : 'text-muted',
                    )}
                  >
                    {penalty ? '−' : '+'}
                  </span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={MAX_POINTS}
                    step={1}
                    value={custom}
                    onChange={(e) => onCustom(e.target.value)}
                    placeholder="e.g. 10"
                    aria-label="Custom points"
                    aria-invalid={customInvalid}
                    className={cn(
                      'h-11 w-full rounded-xl border bg-card pl-8 pr-3.5 font-display text-lg font-bold text-ink',
                      'placeholder:font-sans placeholder:text-base placeholder:font-normal placeholder:text-muted/70',
                      'transition-colors focus:outline-none focus:ring-2',
                      customInvalid
                        ? 'border-red-500 ring-2 ring-red-500/30'
                        : customActive
                          ? penalty
                            ? 'border-red-500 ring-2 ring-red-500/30'
                            : 'border-gold-500 ring-2 ring-gold-500/30'
                          : 'border-line focus:border-brand-500 focus:ring-brand-500/30',
                    )}
                  />
                </div>
              </div>
              {customInvalid && (
                <p className="-mt-1 text-xs font-medium text-red-500">
                  Enter a whole number from 1 to {MAX_POINTS}.
                </p>
              )}

              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={
                  penalty
                    ? 'Reason (optional) — e.g. late, disruptive'
                    : 'Note (optional) — e.g. Quiz 2, recited Big-O'
                }
              />

              <Button
                size="lg"
                className={cn('w-full', penalty && 'bg-red-500 hover:bg-red-600 active:bg-red-700')}
                onClick={onAward}
                disabled={!canAward}
              >
                {submitting
                  ? penalty
                    ? 'Deducting…'
                    : 'Awarding…'
                  : points === null
                    ? penalty
                      ? 'Pick a deduction above'
                      : 'Pick points above'
                    : penalty
                      ? `Deduct −${points} from ${selected.size}`
                      : `Award +${points} to ${selected.size}`}
              </Button>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
