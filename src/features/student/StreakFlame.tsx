import { FlameIcon } from '@/components/ui/icons'
import { cn } from '@/lib/cn'
import { useStudentData } from './StudentData'

/**
 * The attendance streak, made permanently visible.
 *
 * Uses `present_streak` (0036): classes in a row marked PRESENT. A late resets
 * it, and so does an absence. That is deliberately stricter than the `streak`
 * metric behind the badges, which only breaks on an absence — the badge one has
 * to be forgiving because it's a permanent award, while this one is a live
 * "how am I doing right now?" number and should mean exactly what it says.
 *
 * excused/irregular are neutral in both: a legitimate excuse never breaks a run.
 *
 * ZERO IS SHOWN, not hidden. The first version returned null below 1, which
 * meant the flame vanished for precisely the students who most needed a nudge —
 * you could only see it once you were already doing well. An unlit flame with
 * an invitation is more useful than nothing.
 *
 * @param variant `compact` for a header row, `full` for a standalone card.
 */
export function StreakFlame({ variant = 'full' }: { variant?: 'compact' | 'full' }) {
  const { achievementProgress } = useStudentData()
  const streak = achievementProgress?.present_streak ?? null

  // Null means the metric hasn't loaded yet (or the database is behind the
  // client) — that's the one case where rendering nothing is right.
  if (streak === null) return null

  const lit = streak >= 1
  const hot = streak >= 5

  if (variant === 'compact') {
    return (
      <span
        title={lit ? `${streak} classes in a row, all present` : 'No streak yet'}
        className={cn(
          'flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-bold tabular-nums',
          hot
            ? 'bg-streak-solid/15 text-streak'
            : lit
              ? 'bg-card-2 text-ink'
              : 'bg-card-2 text-muted',
        )}
      >
        <Flame hot={hot} lit={lit} className="h-3.5 w-3.5" />
        {streak}
      </span>
    )
  }

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-2xl border p-4',
        hot ? 'border-streak-solid/30 bg-streak-solid/10' : 'border-line bg-card',
      )}
    >
      <span
        className={cn(
          'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl',
          hot ? 'bg-streak-solid/20' : 'bg-card-2',
        )}
      >
        <Flame hot={hot} lit={lit} className="h-6 w-6" />
      </span>
      <div className="min-w-0 flex-1">
        {lit ? (
          <>
            <p className="font-display text-base font-bold">
              {streak} class{streak === 1 ? '' : 'es'} in a row
            </p>
            <p className="text-sm text-muted">
              {hot
                ? 'All present, no lates. Don’t break it now.'
                : 'All present, no lates. Keep it going.'}
            </p>
          </>
        ) : (
          <>
            <p className="font-display text-base font-bold text-muted">No streak yet</p>
            <p className="text-sm text-muted">
              Be present at your next class to start one. Arriving late resets it.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

/**
 * The flame itself.
 *
 * An SVG rather than a 🔥 emoji: the emoji renders differently on every
 * platform, cannot take the surrounding text colour, and sat awkwardly on the
 * text baseline. This one inherits `currentColor` and flickers via a CSS
 * keyframe (see `.cp-flame` in index.css), which reduced-motion switches off.
 */
function Flame({ hot, lit, className }: { hot: boolean; lit: boolean; className?: string }) {
  return (
    <FlameIcon
      aria-hidden
      className={cn(
        className,
        !lit && 'opacity-30',
        // Only a hot streak moves — a flicker on "1 in a row" is noise.
        hot && 'cp-flame',
      )}
    />
  )
}
