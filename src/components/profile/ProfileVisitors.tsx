import { useEffect, useState } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { getProfileViews } from '@/lib/api'
import type { ProfileViews } from '@/lib/types'

/**
 * "Who viewed your profile" — a Messenger-style strip of recent visitors plus a
 * total view counter. Only meaningful for your OWN profile (the RPC returns
 * empty for anyone else), so render it only when `isMe`. Fails silent: if the
 * views RPC isn't available yet, the section simply doesn't appear.
 */
export function ProfileVisitors({ studentId }: { studentId: string }) {
  const [views, setViews] = useState<ProfileViews | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')

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

  // If the feature isn't wired up server-side yet, stay out of the way.
  if (state === 'error') return null

  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
        Profile views
      </p>
      {state === 'loading' || !views ? (
        <div className="h-[4.25rem] animate-pulse rounded-xl bg-card-2" />
      ) : views.total === 0 ? (
        <p className="rounded-xl bg-card-2 px-4 py-3 text-sm text-muted">
          No profile views yet. Only you can see this.
        </p>
      ) : (
        <div className="flex items-center gap-3 rounded-xl bg-card-2 px-4 py-3">
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
        </div>
      )}
    </div>
  )
}

/** "Seen by El Gabriel, Juan +3 more" from the recent visitors + distinct count. */
function caption({ recent, visitors }: ProfileViews): string {
  if (recent.length === 0) return `${visitors} ${visitors === 1 ? 'person' : 'people'}`
  const [a, b] = recent
  if (visitors === 1) return `Seen by ${a.displayName}`
  if (visitors === 2 && b) return `Seen by ${a.displayName} and ${b.displayName}`
  if (b) return `Seen by ${a.displayName}, ${b.displayName} +${visitors - 2} more`
  return `Seen by ${a.displayName} +${visitors - 1} more`
}
