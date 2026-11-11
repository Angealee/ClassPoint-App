import { useEffect, useState } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { Skeleton } from '@/components/ui/Skeleton'
import { getProfileViews } from '@/lib/api'
import { VisitorsSheet } from './VisitorsSheet'
import type { ProfileViews, ProfileVisitorRow } from '@/lib/types'

export function ProfileVisitors({
  studentId,
  onOpenViewer,
}: {
  studentId: string
  onOpenViewer?: (row: ProfileVisitorRow) => void
}) {
  const [views, setViews] = useState<ProfileViews | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [listOpen, setListOpen] = useState(false)

  useEffect(() => {
    let active = true
    setState('loading')
    getProfileViews(studentId)
      .then((v) => {
        if (!active) return
        setViews(v)
        setState('ready')
      })
      .catch(() => active && setState('error'))
    return () => {
      active = false
    }
  }, [studentId])

  if (state === 'error') return null

  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
        Profile views
      </p>
      {state === 'loading' || !views ? (
        <Skeleton className="h-[4.25rem] rounded-xl" />
      ) : views.total === 0 ? (
        <p className="rounded-xl bg-card-2 px-4 py-3 text-sm text-muted">
          No profile views yet. Only you can see this.
        </p>
      ) : (
        <button
          type="button"
          onClick={() => setListOpen(true)}
          className="flex w-full items-center gap-3 rounded-xl bg-card-2 px-4 py-3 text-left transition-colors hover:bg-line/40"
        >
          {views.recent.length > 0 && (
            <div className="flex -space-x-2.5">
              {views.recent.slice(0, 5).map((v, i) => (
                <Avatar
                  key={`${v.displayName}-${i}`}
                  name={v.displayName}
                  url={v.avatarUrl}
                  className="h-8 w-8 ring-2 ring-canvas"
                  textClassName="text-xs"
                />
              ))}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold tabular-nums">
              {views.total} view{views.total === 1 ? '' : 's'}
            </p>
            <p className="truncate text-xs text-muted">{caption(views)}</p>
          </div>
          <span className="shrink-0 text-xs font-semibold text-accent">See all →</span>
        </button>
      )}

      <VisitorsSheet
        studentId={studentId}
        totalViews={views?.total ?? 0}
        open={listOpen}
        onClose={() => setListOpen(false)}
        onOpenViewer={
          onOpenViewer
            ? (row) => {
                setListOpen(false)
                onOpenViewer(row)
              }
            : undefined
        }
      />
    </div>
  )
}

function caption({ recent, visitors }: ProfileViews): string {
  if (recent.length === 0) return `${visitors} ${visitors === 1 ? 'person' : 'people'}`
  const [a, b] = recent
  if (visitors === 1) return `Seen by ${a.displayName}`
  if (visitors === 2 && b) return `Seen by ${a.displayName} and ${b.displayName}`
  if (b) return `Seen by ${a.displayName}, ${b.displayName} +${visitors - 2} more`
  return `Seen by ${a.displayName} +${visitors - 1} more`
}
