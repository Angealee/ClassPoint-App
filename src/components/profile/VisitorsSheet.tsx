import { useCallback, useEffect, useState } from 'react'
import { Sheet } from '@/components/ui/Sheet'
import { Button } from '@/components/ui/Button'
import { Avatar } from '@/components/ui/Avatar'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { getProfileVisitors } from '@/lib/api'
import { timeAgo } from '@/lib/time'
import type { ProfileVisitorRow } from '@/lib/types'

const PAGE = 20

/**
 * The full, paginated "who viewed me" list. Owner-only (the RPC returns empty
 * for anyone else). Header shows the grand totals; rows show name + when.
 */
export function VisitorsSheet({
  studentId,
  totalViews,
  open,
  onClose,
  onOpenViewer,
}: {
  studentId: string
  /** Total view *count* (repeat views included) — from the strip's summary. */
  totalViews: number
  open: boolean
  onClose: () => void
  /** Tap a visitor → open their profile. The owner (Profile) holds the preview
   *  sheet, so this just hands the row back (avoids a component→feature cycle). */
  onOpenViewer?: (row: ProfileVisitorRow) => void
}) {
  const [rows, setRows] = useState<ProfileVisitorRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)

  const loadFirst = useCallback(async () => {
    setLoading(true)
    try {
      const page = await getProfileVisitors(studentId, 0, PAGE)
      setRows(page.rows)
      setTotal(page.total)
    } catch {
      /* non-fatal — sheet just shows empty */
    } finally {
      setLoading(false)
    }
  }, [studentId])

  useEffect(() => {
    if (open) void loadFirst()
  }, [open, loadFirst])

  async function loadMore() {
    setLoadingMore(true)
    try {
      const page = await getProfileVisitors(studentId, rows.length, PAGE)
      setRows((prev) => [...prev, ...page.rows])
    } catch {
      /* keep what we have */
    } finally {
      setLoadingMore(false)
    }
  }

  const hasMore = rows.length < total

  return (
    <Sheet open={open} onClose={onClose} title="Who viewed you">
      <p className="mb-3 text-sm text-muted">
        {total > 0
          ? `Seen ${totalViews} time${totalViews === 1 ? '' : 's'} by ${total} ${
              total === 1 ? 'person' : 'people'
            }. Only you can see this.`
          : 'No profile views yet. Only you can see this.'}
      </p>

      {loading ? (
        <ListSkeleton rows={5} />
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">Nobody yet — go climb the leaderboard.</p>
      ) : (
        <div className="space-y-3">
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
            {rows.map((v, i) => (
              <li key={`${v.studentId}-${i}`}>
                <button
                  type="button"
                  disabled={!onOpenViewer}
                  onClick={onOpenViewer ? () => onOpenViewer(v) : undefined}
                  className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-card-2 disabled:cursor-default disabled:hover:bg-transparent"
                >
                  <Avatar name={v.displayName} url={v.avatarUrl} className="h-9 w-9" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {v.displayName}
                  </span>
                  <span className="shrink-0 text-xs text-muted">{timeAgo(v.lastViewedAt)}</span>
                </button>
              </li>
            ))}
          </ul>
          {hasMore && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => void loadMore()}
              disabled={loadingMore}
            >
              {loadingMore ? 'Loading…' : 'Load more'}
            </Button>
          )}
        </div>
      )}
    </Sheet>
  )
}
