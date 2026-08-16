import { motion } from 'framer-motion'
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
          'flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[0.7rem] font-bold tabular-nums',
          hot
            ? 'bg-orange-500/15 text-orange-500'
            : lit
              ? 'bg-card-2 text-ink'
              : 'bg-card-2 text-muted',
        )}
      >
        <Flame hot={hot} lit={lit} />
        {streak}
      </span>
    )
  }

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-2xl border p-4',
        hot ? 'border-orange-500/30 bg-orange-500/10' : 'border-line bg-card',
      )}
    >
      <span
        className={cn(
          'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl',
          hot ? 'bg-orange-500/20' : 'bg-card-2',
        )}
      >
        <Flame hot={hot} lit={lit} />
      </span>
      <div className="min-w-0 flex-1">
        {lit ? (
          <>
            <p className="font-display text-base font-bold">
              {streak} class{streak === 1 ? '' : 'es'} in a row
            </p>
            <p className="text-[13px] text-muted">
              {hot
                ? 'All present, no lates. Don’t break it now.'
                : 'All present, no lates. Keep it going.'}
            </p>
          </>
        ) : (
          <>
            <p className="font-display text-base font-bold text-muted">No streak yet</p>
            <p className="text-[13px] text-muted">
              Be present at your next class to start one. Arriving late resets it.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

/** The flame. Greyed when unlit, and only animates when the streak is hot. */
function Flame({ hot, lit }: { hot: boolean; lit: boolean }) {
  if (!lit) {
    return (
      <span aria-hidden className="opacity-40 grayscale">
        🔥
      </span>
    )
  }
  if (!hot) return <span aria-hidden>🔥</span>
  return (
    <motion.span
      aria-hidden
      animate={{ scale: [1, 1.15, 1] }}
      transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
      className="inline-block"
    >
      🔥
    </motion.span>
  )
}
