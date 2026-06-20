import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/Toast'
import { CheckIcon } from '@/components/ui/icons'
import { useInstructor } from './InstructorLayout'
import { awardPoints, listRoster } from '@/lib/api'
import { cn } from '@/lib/cn'
import type { PointCategory, RosterStudent } from '@/lib/types'

const POINTS = [1, 2, 3, 4, 5]

export function Award() {
  const { sections, selectedSectionId, setSelectedSectionId } = useInstructor()
  const { toast } = useToast()

  const [students, setStudents] = useState<RosterStudent[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [points, setPoints] = useState<number | null>(null)
  const [category, setCategory] = useState<PointCategory>('recitation')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const sectionName = sections.find((s) => s.id === selectedSectionId)?.name ?? ''

  async function refresh() {
    if (!selectedSectionId) return
    setLoading(true)
    try {
      setStudents(await listRoster(selectedSectionId))
    } catch {
      toast('Could not load students.', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setSelected(new Set())
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSectionId])

  const allSelected = students.length > 0 && selected.size === students.length

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(students.map((s) => s.id)))
  }

  const canAward = selected.size > 0 && points !== null && !submitting

  async function onAward() {
    if (points === null || selected.size === 0) return
    setSubmitting(true)
    const count = selected.size
    try {
      await awardPoints({
        studentIds: [...selected],
        points,
        category,
        note: note.trim() || undefined,
      })
      toast(`+${points} to ${count} student${count > 1 ? 's' : ''}`, 'success')
      setSelected(new Set())
      setPoints(null)
      setNote('')
      await refresh()
    } catch {
      toast('Could not award points.', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const sorted = useMemo(() => students, [students])

  return (
    <div className="space-y-4">
      <Select
        label="Section"
        value={selectedSectionId}
        onChange={(e) => setSelectedSectionId(e.target.value)}
        className="max-w-[10rem]"
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

      {loading ? (
        <p className="py-10 text-center text-sm text-muted">Loading…</p>
      ) : students.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">
          No students in {sectionName} yet — add some in the Students tab.
        </Card>
      ) : (
        <Card className="divide-y divide-line">
          {sorted.map((s) => {
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
            className="fixed inset-x-0 bottom-[4.75rem] z-30 mx-auto w-full max-w-2xl px-4 md:bottom-6 md:left-60 md:right-0"
          >
            <Card className="space-y-3 p-4 shadow-xl">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">{selected.size} selected</span>
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
              </div>

              <div className="flex gap-2">
                {POINTS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPoints(p)}
                    className={cn(
                      'flex h-11 flex-1 items-center justify-center rounded-xl font-display text-lg font-bold transition-all',
                      points === p
                        ? 'bg-gold-400 text-brand-950 ring-2 ring-gold-500 ring-offset-2 ring-offset-card'
                        : 'bg-card-2 text-ink hover:bg-line',
                    )}
                  >
                    +{p}
                  </button>
                ))}
              </div>

              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Note (optional) — e.g. Quiz 2, recited Big-O"
              />

              <Button size="lg" className="w-full" onClick={onAward} disabled={!canAward}>
                {submitting
                  ? 'Awarding…'
                  : points === null
                    ? 'Pick points above'
                    : `Award +${points} to ${selected.size}`}
              </Button>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
