import { useEffect, useState } from 'react'
import { ClockIcon } from '@/components/ui/icons'
import { countdownTo, nextSnapshotAt, snapshotLabel } from '@/lib/time'

/** Shared 1-minute ticking clock for the countdown. */
function useNow() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])
  return now
}

export function SnapshotStamp({ capturedAt }: { capturedAt: string | null }) {
  const now = useNow()
  return (
    <p className="text-xs text-muted">
      {capturedAt ? `Updated ${snapshotLabel(capturedAt)}` : 'Not settled yet'} · next in{' '}
      {countdownTo(nextSnapshotAt(now), now)}
    </p>
  )
}

export function SnapshotChip({ capturedAt }: { capturedAt: string | null }) {
  const now = useNow()
  return (
    <span
      title={capturedAt ? `Updated ${snapshotLabel(capturedAt)}` : 'Not settled yet'}
      className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-card-2 px-2.5 py-1 text-xs font-medium text-muted"
    >
      <ClockIcon className="h-3.5 w-3.5" />
      next {countdownTo(nextSnapshotAt(now), now)}
    </span>
  )
}
