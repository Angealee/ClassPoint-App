import { motion } from 'framer-motion'
import { cn } from '@/lib/cn'
import { useStudentData } from './StudentData'

/**
 * The attendance streak, made permanently visible (Phase F).
 *
 * The streak was the strongest retention hook in the app and the only place it
 * appeared was a progress bar on a locked badge — so it VANISHED the moment you
 * unlocked that badge, exactly when you'd earned the right to see it.
 *
 * The number comes from `achievementProgress.streak`, which is the DB's
 * authoritative value: `greatest(combined_run, best_per_subject_run)` since
 * 0030. Deliberately NOT recomputed client-side — a naive local count would be
 * combined-only and would quietly disagree with every badge in the trophy case.
 *
 * There is no "longest ever" figure because the schema doesn't track one, and
 * inventing it here would produce a second number nothing else in the app could
 * corroborate.
 *
 * @param variant `compact` for the Dashboard header row, `full` for the
 *   Attendance summary.
 */
export function StreakFlame({ variant = 'full' }: { variant?: 'compact' | 'full' }) {
  const { achievementProgress } = useStudentData()
  const streak = achievementProgress?.streak ?? null

  // Null means the metric hasn't loaded; 0 means a broken streak. Neither is
  // worth a flame — showing "🔥 0" would be a taunt, not a nudge.
  if (streak === null || streak < 1) return null

  const hot = streak >= 5

  if (variant === 'compact') {
    return (
      <span
        title={`${streak} classes in a row`}
        className={cn(
          'flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[0.7rem] font-bold tabular-nums',
          hot ? 'bg-orange-500/15 text-orange-500' : 'bg-card-2 text-muted',
        )}
      >
        <Flame hot={hot} />
        {streak}
      </span>
    )
  }

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-2xl border p-3',
        hot ? 'border-orange-500/30 bg-orange-500/10' : 'border-line bg-card',
      )}
    >
      <span
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg',
          hot ? 'bg-orange-500/20' : 'bg-card-2',
        )}
      >
        <Flame hot={hot} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-display text-sm font-bold">
          {streak} class{streak === 1 ? '' : 'es'} in a row
        </p>
        <p className="text-xs text-muted">
          {hot ? "You're on a roll — don't break it now." : 'Keep showing up to build your streak.'}
        </p>
      </div>
    </div>
  )
}

/** The flame itself. Animates only when the streak is genuinely hot. */
function Flame({ hot }: { hot: boolean }) {
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
