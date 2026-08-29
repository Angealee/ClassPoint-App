import { motion } from 'framer-motion'
import { AnimatedNumber } from '@/components/ui/AnimatedNumber'
import { FlameIcon } from '@/components/ui/icons'
import { cn } from '@/lib/cn'
import { getLevelProgress } from '@/lib/leveling'

/**
 * The home screen's scoreboard.
 *
 * ── WHY IT IS ALWAYS DARK ──────────────────────────────────────────────────
 * This is the one element in the app that does NOT flip with the theme. That is
 * the whole idea: a fixed dark plate reads as a scoreboard — an object — rather
 * than as one more card in a stack of cards, and it gives the screen a single
 * anchor without needing a large coloured fill to do it. Its surface comes from
 * `--color-plate`, declared in the FIXED @theme block for exactly that reason.
 *
 * It replaces a `from-brand-500 to-brand-700` gradient that was the largest
 * brand-red surface in the app and carried only the level number, while points
 * — the same quantity, since points ARE the XP — sat in a separate tile below.
 * Splitting one idea across two blocks is what made the old home screen feel
 * like a list of widgets.
 *
 * ── WHAT IT CARRIES, AND IN WHAT ORDER ─────────────────────────────────────
 * Level is the headline because it is the thing that changes rarely and means
 * the most. Points sit beside it because they are the same number in different
 * clothes and a student checks them constantly. The XP rail is the bridge: it
 * shows how one becomes the other. Rank and streak are the footer — real, but
 * not what you open the app for.
 *
 * Deliberately NOT a button. A previous version made the whole hero tappable,
 * which is a large target with no visible affordance; the feed's "See all" is
 * the way into the ledger.
 */
export function HomeHero({
  points,
  allTimePoints,
  rank,
  rankNote,
  streak,
  className,
}: {
  points: number
  allTimePoints: number
  rank: number | null
  /** e.g. "as of 12:30 PM" — the board is a snapshot, not live. */
  rankNote?: string
  /** `present_streak`: classes in a row, all present. Null while loading. */
  streak: number | null
  className?: string
}) {
  const progress = getLevelProgress(points)
  const hotStreak = (streak ?? 0) >= 5

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl',
        // A two-stop plate rather than a flat fill: enough dimension that the
        // object reads as raised, with no hue that would compete with the gold.
        'bg-gradient-to-br from-plate-2 to-plate',
        // In light mode this sits on a near-white canvas, so it needs a real
        // edge or it looks like a hole punched in the page.
        'shadow-lg shadow-black/25 ring-1 ring-white/10',
        className,
      )}
    >
      {/* A soft gold bloom behind the level, so the plate isn't uniformly flat. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-10 -top-16 h-44 w-44 rounded-full bg-gold-400/12 blur-3xl"
      />

      <div className="relative p-5">
        {/* Level + points — one line, two figures, related by the rail below. */}
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-2xs font-semibold uppercase tracking-widest text-white/60">Level</p>
            <p className="font-display text-6xl font-bold leading-[0.95] text-white">
              {progress.level}
            </p>
          </div>

          <div className="min-w-0 text-right">
            <p className="text-2xs font-semibold uppercase tracking-widest text-white/60">
              Points
            </p>
            <motion.p
              key={points}
              initial={{ scale: 1.25 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 18 }}
              className="origin-right font-display text-4xl font-bold leading-none tabular-nums text-gold-300"
            >
              <AnimatedNumber value={points} />
            </motion.p>
            <p className="mt-1 text-2xs tabular-nums text-white/55">
              {allTimePoints} all-time
            </p>
          </div>
        </div>

        {/* The rail: how points become the next level. */}
        <div className="mt-5">
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-white/10"
            role="progressbar"
            aria-label="Progress to the next level"
            aria-valuenow={Math.round(progress.progressPct)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-gold-500 via-gold-400 to-gold-300"
              initial={{ width: 0 }}
              animate={{ width: `${Math.max(0, Math.min(100, progress.progressPct))}%` }}
              transition={{ type: 'spring', stiffness: 120, damping: 20 }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-2xs tabular-nums">
            <span className="text-white/55">
              {progress.expIntoLevel} / {progress.expForLevel} XP
            </span>
            <span className="font-semibold text-white/85">
              {progress.expToNext} to Level {progress.level + 1}
            </span>
          </div>
        </div>

        {/* Footer marks — real, but not why you opened the app. */}
        <div className="mt-4 flex items-center gap-4 border-t border-white/10 pt-3">
          <div className="min-w-0">
            <p className="font-display text-base font-bold leading-none tabular-nums text-white">
              {rank ? `#${rank}` : '—'}
            </p>
            <p className="mt-0.5 truncate text-2xs text-white/55">
              {rank ? (rankNote ?? 'overall') : 'not ranked yet'}
            </p>
          </div>

          <span aria-hidden className="h-6 w-px shrink-0 bg-white/10" />

          <div className="min-w-0">
            <p className="flex items-center gap-1 font-display text-base font-bold leading-none tabular-nums text-white">
              <FlameIcon
                className={cn(
                  'h-4 w-4',
                  hotStreak ? 'cp-flame text-streak-solid' : 'text-white/35',
                )}
              />
              {streak ?? 0}
            </p>
            <p className="mt-0.5 truncate text-2xs text-white/55">
              {streak === 1 ? 'class in a row' : 'classes in a row'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * One line naming the nearest thing worth chasing.
 *
 * Compares points-to-next-level against points-to-overtake-the-rank-above and
 * names the SMALLER. Always showing the level would hide the fact that one
 * recitation sometimes gains a place — which is the more motivating of the two,
 * and the one a student can act on today.
 */
export function NextMilestone({
  points,
  pointsToOvertake,
  className,
}: {
  points: number
  /** Points needed to pass the student ranked directly above. Null if unknown. */
  pointsToOvertake: number | null
  className?: string
}) {
  const progress = getLevelProgress(points)
  const toLevel = progress.expToNext

  const chaseRank =
    pointsToOvertake !== null && pointsToOvertake > 0 && pointsToOvertake < toLevel

  const n = chaseRank ? pointsToOvertake : toLevel
  if (!n || n <= 0) return null

  return (
    <p className={cn('px-1 text-sm text-muted', className)}>
      <span className="font-semibold text-reward tabular-nums">{n}</span>{' '}
      {n === 1 ? 'point' : 'points'}{' '}
      {chaseRank ? 'to pass the student above you.' : `to reach Level ${progress.level + 1}.`}
    </p>
  )
}
