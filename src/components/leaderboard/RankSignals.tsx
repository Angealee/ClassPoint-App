import { FlameIcon } from '@/components/ui/icons'
import { cn } from '@/lib/cn'
import type { LeaderboardEntry } from '@/lib/types'

const DAY_MS = 86_400_000

export function daysHeld(rankSince: string): number {
  const ms = Date.now() - new Date(rankSince).getTime()
  return ms <= 0 ? 0 : Math.floor(ms / DAY_MS)
}

export function rankDelta(entry: LeaderboardEntry): number | null {
  if (entry.previous_rank === null) return null
  return entry.previous_rank - entry.rank
}

export function biggestClimber(
  entries: readonly LeaderboardEntry[],
): { name: string; places: number } | null {
  let best: { name: string; places: number } | null = null
  for (const e of entries) {
    const moved = rankDelta(e)
    if (moved === null || moved <= 0) continue
    if (!best || moved > best.places) best = { name: e.display_name, places: moved }
  }
  return best
}

export function RankDelta({
  entry,
  className,
  onPlate = false,
}: {
  entry: LeaderboardEntry
  className?: string
  /** Colours for the fixed dark scoreboard plate instead of the themed roles. */
  onPlate?: boolean
}) {
  return <RankDeltaValue delta={rankDelta(entry)} className={className} onPlate={onPlate} />
}

export function RankDeltaValue({
  delta,
  verbose = false,
  className,
  onPlate = false,
}: {
  delta: number | null
  /** Show "new" / "— same" instead of rendering nothing. */
  verbose?: boolean
  className?: string
  onPlate?: boolean
}) {
  if (delta === null)
    return verbose ? <p className="text-2xs font-medium text-muted">new</p> : null
  if (delta === 0)
    return verbose ? <p className="text-2xs font-medium text-muted">- same</p> : null

  const up = delta > 0
  return (
    <span
      title={`${up ? 'Up' : 'Down'} ${Math.abs(delta)} since the last update`}
      className={cn(
        'inline-flex shrink-0 items-center gap-0.5 rounded-lg px-1.5 py-0.5 text-xs font-bold tabular-nums',
        onPlate
          ? up
            ? 'bg-plate-up/15 text-plate-up'
            : 'bg-plate-down/15 text-plate-down'
          : up
            ? 'bg-success-solid/10 text-success'
            : 'bg-danger-solid/10 text-danger',
        className,
      )}
    >
      <span aria-hidden>{up ? '▲' : '▼'}</span>
      {Math.abs(delta)}
    </span>
  )
}

export function RankTenure({
  entry,
  className,
  onPlate = false,
}: {
  entry: LeaderboardEntry
  className?: string
  onPlate?: boolean
}) {
  const days = daysHeld(entry.rank_since)
  if (days < 1) return null

  const hot = days >= 5
  return (
    <span
      title={`Holding rank ${entry.rank} or better for ${days} day${days === 1 ? '' : 's'}`}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-lg px-1.5 py-0.5 text-xs font-bold tabular-nums',
        onPlate
          ? hot
            ? 'bg-plate-hot/15 text-plate-hot'
            : 'bg-white/10 text-white/65'
          : hot
            ? 'bg-streak-solid/15 text-streak'
            : 'bg-card-2 text-muted',
        className,
      )}
    >
      <FlameIcon
        aria-hidden
        className={cn(
          'h-3.5 w-3.5 shrink-0',
          hot ? 'cp-flame' : 'opacity-70',
        )}
      />
      {days}d
    </span>
  )
}
