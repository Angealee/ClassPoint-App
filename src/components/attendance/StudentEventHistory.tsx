import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { CheckIcon } from '@/components/ui/icons'
import { getMyEventHistory } from '@/lib/api'
import type { EventHistoryEntry } from '@/lib/types'

/**
 * A student's past GLOBAL EVENT check-ins (0055) — the same list on the event
 * scan screen, the student's Attendance history and the instructor's per-student
 * record, so there is ONE definition (no fourth copy to drift). Deliberately its
 * OWN section, kept apart from class attendance: an event never counts toward a
 * show-up rate, a streak or any achievement metric. Self-contained fetch, fails
 * silent (renders nothing), so a missing RPC never touches the screen it sits on.
 */
export function StudentEventHistory({
  studentId,
  title = 'Event check-ins',
}: {
  studentId?: string
  title?: string
}) {
  const [history, setHistory] = useState<EventHistoryEntry[]>([])
  useEffect(() => {
    if (!studentId) return
    let active = true
    getMyEventHistory(studentId)
      .then((h) => active && setHistory(h))
      .catch(() => {})
    return () => {
      active = false
    }
  }, [studentId])

  if (history.length === 0) return null

  return (
    <div>
      <p className="mb-2 px-1 text-sm font-semibold text-muted">{title}</p>
      <Card pad="none" className="divide-y divide-line">
        {history.slice(0, 10).map((e) => (
          <div key={e.eventId} className="flex items-center gap-3 p-3.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-reward-solid/15 text-reward">
              <CheckIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{e.name}</p>
              <p className="text-xs text-muted">
                {new Date(e.scannedAt).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                })}
                {e.manual ? ' · added by instructor' : ''}
              </p>
            </div>
            {e.points > 0 && (
              <span className="shrink-0 text-sm font-semibold text-reward">+{e.points}</span>
            )}
          </div>
        ))}
      </Card>
    </div>
  )
}
