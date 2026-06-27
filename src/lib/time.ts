/** Snapshot settle times (local clock): 12:30 PM and 7:30 PM. */
const SNAPSHOT_HOURS = [12, 19] as const
const SNAPSHOT_MINUTE = 30

/** The next moment the leaderboard will settle, from `from` (local time). */
export function nextSnapshotAt(from: Date = new Date()): Date {
  for (const h of SNAPSHOT_HOURS) {
    const t = new Date(from)
    t.setHours(h, SNAPSHOT_MINUTE, 0, 0)
    if (t > from) return t
  }
  // Past both of today's times → first slot tomorrow.
  const t = new Date(from)
  t.setDate(t.getDate() + 1)
  t.setHours(SNAPSHOT_HOURS[0], SNAPSHOT_MINUTE, 0, 0)
  return t
}

export function countdownTo(target: Date, from: Date = new Date()): string {
  const ms = target.getTime() - from.getTime()
  if (ms <= 0) return 'now'
  const totalMin = Math.floor(ms / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

/** "7:30 AM" — the clock time a snapshot was captured. */
export function snapshotLabel(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** Compact relative time for the points feed, e.g. "2h ago", "yesterday". */
export function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const sec = Math.round(ms / 1000)
  if (sec < 45) return 'just now'
  const min = Math.round(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.round(hr / 24)
  if (day === 1) return 'yesterday'
  if (day < 7) return `${day}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
