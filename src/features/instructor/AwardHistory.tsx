import { useCallback, useEffect, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Sheet } from '@/components/ui/Sheet'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { TrashIcon } from '@/components/ui/icons'
import { useInstructor } from './InstructorLayout'
import { deletePointEvent, listRecentAwards } from '@/lib/api'
import { timeAgo } from '@/lib/time'
import { cn } from '@/lib/cn'
import type { AwardRecord } from '@/lib/types'

export function AwardHistory() {
  const { sections } = useInstructor()
  const { toast } = useToast()

  const [records, setRecords] = useState<AwardRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [target, setTarget] = useState<AwardRecord>()
  const [undoing, setUndoing] = useState(false)

  const sectionName = (id: string) => sections.find((s) => s.id === id)?.name ?? ''

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      setRecords(await listRecentAwards(40))
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function onUndo() {
    if (!target) return
    setUndoing(true)
    try {
      await deletePointEvent(target.id)
      toast('Award reverted.', 'success')
      setTarget(undefined)
      await refresh()
    } catch {
      toast('Could not revert that award.', 'error')
    } finally {
      setUndoing(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-xl font-bold">Recent activity</h1>
        <p className="text-sm text-muted">Last 40 awards & penalties · undo any mistake.</p>
      </div>

      {loading ? (
        <ListSkeleton rows={6} />
      ) : error ? (
        <Card className="p-6 text-center">
          <p className="text-sm text-brand-500">Could not load activity.</p>
          <Button variant="outline" className="mt-4" onClick={() => void refresh()}>
            Try again
          </Button>
        </Card>
      ) : records.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">
          No awards yet — points you give will appear here.
        </Card>
      ) : (
        <Card className="divide-y divide-line">
          {records.map((r) => {
            const negative = r.points < 0
            return (
              <div key={r.id} className="flex items-center gap-3 p-3.5">
                <span
                  className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-display text-sm font-bold',
                    negative
                      ? 'bg-red-500/10 text-red-500'
                      : r.category === 'activity'
                        ? 'bg-brand-500/10 text-brand-500'
                        : 'bg-gold-400/15 text-gold-600 dark:text-gold-400',
                  )}
                >
                  {negative ? r.points : `+${r.points}`}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{r.student_name}</p>
                  <p className="truncate text-xs capitalize text-muted">
                    {sectionName(r.section_id)} · {r.category} · {timeAgo(r.created_at)}
                    {r.note ? ` · ${r.note}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setTarget(r)}
                  aria-label={`Undo ${r.points} for ${r.student_name}`}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-brand-500/10 hover:text-brand-500"
                >
                  <TrashIcon className="h-4.5 w-4.5" />
                </button>
              </div>
            )
          })}
        </Card>
      )}

      <Sheet open={!!target} onClose={() => setTarget(undefined)} title="Undo this award?">
        <p className="text-sm text-muted">
          This removes{' '}
          <span className="font-semibold text-ink">
            {target && target.points < 0 ? target.points : `+${target?.points}`}
          </span>{' '}
          from <span className="font-semibold text-ink">{target?.student_name}</span>. Their total
          recomputes automatically.
        </p>
        <div className="mt-5 flex gap-3">
          <Button variant="outline" className="flex-1" onClick={() => setTarget(undefined)}>
            Cancel
          </Button>
          <Button
            className="flex-1 bg-brand-600 hover:bg-brand-700"
            onClick={onUndo}
            disabled={undoing}
          >
            {undoing ? 'Undoing…' : 'Undo'}
          </Button>
        </div>
      </Sheet>
    </div>
  )
}
