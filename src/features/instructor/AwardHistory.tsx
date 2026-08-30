import { EmptyState } from '@/components/ui/EmptyState'
import { IconButton } from '@/components/ui/IconButton'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, Rows } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { TrashIcon } from '@/components/ui/icons'
import { useInstructor } from './InstructorLayout'
import { deletePointEvent, listRecentAwards } from '@/lib/api'
import { timeAgo } from '@/lib/time'
import { cn } from '@/lib/cn'
import { Select } from '@/components/ui/Select'
import type { AwardRecord, PointCategory } from '@/lib/types'

const PAGE = 40

const CATEGORIES: { value: string; label: string }[] = [
  { value: '', label: 'All types' },
  { value: 'recitation', label: 'Recitation' },
  { value: 'activity', label: 'Activity' },
  { value: 'penalty', label: 'Penalty' },
]

/** `embedded` hides the page header when rendered inside the History tabs. */
export function AwardHistory({ embedded = false }: { embedded?: boolean } = {}) {
  const { sections } = useInstructor()
  const { toast } = useToast()

  const [records, setRecords] = useState<AwardRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState(false)
  const [target, setTarget] = useState<AwardRecord>()
  const [undoing, setUndoing] = useState(false)
  // '' = every section / every category.
  const [sectionFilter, setSectionFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')

  const sectionName = (id: string) => sections.find((s) => s.id === id)?.name ?? ''

  const filters = useMemo(
    () => ({
      sectionId: sectionFilter || undefined,
      category: (categoryFilter || undefined) as PointCategory | undefined,
    }),
    [sectionFilter, categoryFilter],
  )

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const first = await listRecentAwards(PAGE, filters)
      setRecords(first)
      setHasMore(first.length === PAGE)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [filters])

  /**
   * Offset paging is fine here (keyset is not worth it): this list is the
   * instructor's own recent activity, and a new award landing mid-scroll is
   * an award they just made themselves.
   */
  async function loadMore() {
    setLoadingMore(true)
    try {
      const next = await listRecentAwards(PAGE, { ...filters, offset: records.length })
      setRecords((prev) => [...prev, ...next])
      setHasMore(next.length === PAGE)
    } catch {
      setError(true)
    } finally {
      setLoadingMore(false)
    }
  }

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
      {!embedded && (
        <div>
          <h1 className="font-display text-xl font-bold">Recent activity</h1>
          <p className="text-sm text-muted">Awards & penalties · undo any mistake.</p>
        </div>
      )}

      {/* Filters. Changing either re-runs the query rather than filtering in
          memory — the list is paged, so a client-side filter would only ever
          search the rows already downloaded. */}
      <div className="flex gap-2">
        <Select
          value={sectionFilter}
          onChange={(e) => setSectionFilter(e.target.value)}
          aria-label="Filter by section"
          className="flex-1"
        >
          <option value="">All sections</option>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <Select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          aria-label="Filter by type"
          className="flex-1"
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </Select>
      </div>

      {loading ? (
        <ListSkeleton rows={6} />
      ) : error ? (
        <Card className="p-6 text-center">
          <p className="text-sm text-accent">Could not load activity.</p>
          <Button variant="outline" className="mt-4" onClick={() => void refresh()}>
            Try again
          </Button>
        </Card>
      ) : records.length === 0 ? (
        <EmptyState>{sectionFilter || categoryFilter
            ? 'Nothing matches those filters.'
            : 'No awards yet — points you give will appear here.'}</EmptyState>
      ) : (
        <Rows>
          {records.map((r) => {
            const negative = r.points < 0
            return (
              <div key={r.id} className="flex items-center gap-3 p-3.5">
                <span
                  className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-display text-sm font-bold',
                    negative
                      ? 'bg-danger-solid/10 text-danger'
                      : r.category === 'activity'
                        ? 'bg-danger-solid/10 text-danger'
                        : 'bg-gold-400/15 text-reward',
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
                                <IconButton
                  label={`Undo ${r.points} for ${r.student_name}`}
                  variant="danger"
                  onClick={() => setTarget(r)}
                  icon={<TrashIcon className="h-4.5 w-4.5" />}
                />
              </div>
            )
          })}
        </Rows>
      )}

      {!loading && !error && hasMore && (
        <Button
          variant="outline"
          className="w-full"
          disabled={loadingMore}
          onClick={() => void loadMore()}
        >
          {loadingMore ? 'Loading…' : 'Load older'}
        </Button>
      )}

      <ConfirmDialog
        open={!!target}
        title="Undo this award?"
        message={
          <>
            This removes{' '}
            <span className="font-semibold text-ink">
              {target && target.points < 0 ? target.points : `+${target?.points}`}
            </span>{' '}
            from <span className="font-semibold text-ink">{target?.student_name}</span>. Their
            total recomputes automatically.
          </>
        }
        confirmLabel="Undo award"
        busy={undoing}
        onConfirm={onUndo}
        onClose={() => setTarget(undefined)}
      />
    </div>
  )
}
