import { FlameIcon } from '@/components/ui/icons'
import { cn } from '@/lib/cn'
import type { LeaderboardEntry } from '@/lib/types'

const DAY_MS = 86_400_000

/**
 * How many whole days a student has held their current run (0037).
 *
 * A "run" is holding this rank OR BETTER — climbing keeps it alive, only
 * dropping resets it. Floored, so it reads 0 until a full day has passed rather
 * than claiming "1 day" twenty minutes in.
 */
export function daysHeld(rankSince: string): number {
  const ms = Date.now() - new Date(rankSince).getTime()
  return ms <= 0 ? 0 : Math.floor(ms / DAY_MS)
}

/**
 * How far a student moved since the last refresh. Positive is a climb, because
 * rank 9 → 4 is an improvement of five places even though the number went down.
 * Null when there's nothing to compare against yet.
 */
export function rankDelta(entry: LeaderboardEntry): number | null {
  if (entry.previous_rank === null) return null
  return entry.previous_rank - entry.rank
}

/**
 * "▲ 3" / "▼ 2" — movement since the previous board.
 *
 * Renders nothing when a student is new to the board or hasn't moved: an
 * unbroken column of grey dashes is noise, and "no change" is the default a
 * reader already assumes.
 */
export function RankDelta({
  entry,
  className,
}: {
  entry: LeaderboardEntry
  className?: string
}) {
  const delta = rankDelta(entry)
  if (delta === null || delta === 0) return null

  const up = delta > 0
  return (
    <span
      title={`${up ? 'Up' : 'Down'} ${Math.abs(delta)} since the last update`}
      className={cn(
        'inline-flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[12px] font-bold tabular-nums',
        up
          ? 'bg-success-solid/10 text-success'
          : 'bg-brand-500/10 text-brand-500',
        className,
      )}
    >
      <span aria-hidden>{up ? '▲' : '▼'}</span>
      {Math.abs(delta)}
    </span>
  )
}

/**
 * Days holding this rank or better, marked with a flame.
 *
 * Hidden below one full day: on a board that settles twice daily, almost
 * everyone would otherwise carry a meaningless "0d". The flame only animates
 * once the run is genuinely long, so a wall of moving pills never appears.
 */
export function RankTenure({
  entry,
  className,
}: {
  entry: LeaderboardEntry
  className?: string
}) {
  const days = daysHeld(entry.rank_since)
  if (days < 1) return null

  const hot = days >= 5
  return (
    <span
      title={`Holding rank ${entry.rank} or better for ${days} day${days === 1 ? '' : 's'}`}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-bold tabular-nums',
        hot
          ? 'bg-streak-solid/15 text-streak'
          : 'bg-card-2 text-muted',
        className,
      )}
    >
      <FlameIcon
        aria-hidden
        className={cn(
          'h-3.5 w-3.5 shrink-0',
          // Only a genuinely long run flickers. Every row animating at once
          // turns the board into a wall of movement and stops meaning anything.
          hot ? 'cp-flame' : 'opacity-70',
        )}
      />
      {days}d
    </span>
  )
}
