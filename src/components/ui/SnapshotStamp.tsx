import { useEffect, useState } from 'react'
import { countdownTo, nextSnapshotAt, snapshotLabel } from '@/lib/time'

/** "Updated 7:30 AM · next in 5h 12m" — the leaderboard settle stamp. */
export function SnapshotStamp({ capturedAt }: { capturedAt: string | null }) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  return (
    <p className="text-xs text-muted">
      {capturedAt ? `Updated ${snapshotLabel(capturedAt)}` : 'Not settled yet'} · next in{' '}
      {countdownTo(nextSnapshotAt(now), now)}
    </p>
  )
}
