import { motion } from 'framer-motion'
import type { CSSProperties } from 'react'
import { AnimatedNumber } from '@/components/ui/AnimatedNumber'
import { FlameIcon } from '@/components/ui/icons'
import { getLevelProgress } from '@/lib/leveling'
import { ease, spring } from '@/lib/motion'
import { cn } from '@/lib/cn'

export const DEMO_POINTS = 190
export const DEMO_RANK = 7
const DEMO_CLIMB = 2
const DEMO_STREAK = 6

export function ScoreboardDemo({ className }: { className?: string }) {
  const progress = getLevelProgress(DEMO_POINTS)

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl',
        'bg-gradient-to-br from-plate-2 to-plate',
        'shadow-xl shadow-black/25 ring-1 ring-white/10',
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -left-10 -top-16 h-44 w-44 rounded-full bg-gold-400/15 blur-3xl"
      />

      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="cp-sheen absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </div>

      <div className="relative p-5">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-2xs font-semibold uppercase tracking-widest text-white/55">
            Your scoreboard
          </span>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-2xs font-medium text-white/70">
            Preview
          </span>
        </div>

        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-2xs font-semibold uppercase tracking-widest text-white/60">Level</p>
            <motion.p
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ ...spring, delay: 0.55 }}
              className="font-display text-6xl font-bold leading-[0.95] text-gold-300"
            >
              {progress.level}
            </motion.p>
          </div>

          <div className="min-w-0 text-right">
            <p className="text-2xs font-semibold uppercase tracking-widest text-white/60">Points</p>
            <p className="font-display text-4xl font-bold leading-none text-white">
              <AnimatedNumber value={progress.totalExp} duration={1.1} />
            </p>
          </div>
        </div>

        <div className="mt-4">
          <div className="relative h-2.5 overflow-hidden rounded-full bg-white/10">
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: progress.progressPct / 100 }}
              transition={{ ...ease, duration: 1.1, delay: 0.15 }}
              style={{ transformOrigin: 'left' }}
              className="relative h-full rounded-full bg-gradient-to-r from-gold-500 to-gold-300"
            >
              <div className="absolute inset-0 overflow-hidden rounded-full">
                <div className="cp-shimmer h-full w-1/3 bg-white/30" />
              </div>
            </motion.div>
          </div>
          <div className="mt-1.5 flex items-center justify-between text-2xs text-white/60">
            <span>
              {progress.expIntoLevel} / {progress.expForLevel} XP
            </span>
            <span>
              {progress.expToNext} to Level {progress.level + 1}
            </span>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-4 border-t border-white/10 pt-3 text-sm">
          <span className="flex items-center gap-1.5 text-white/75">
            <span className="font-semibold text-white">#{DEMO_RANK}</span>
            <span className="text-success">▲{DEMO_CLIMB}</span>
          </span>
          <span className="flex items-center gap-1.5 text-white/75">
            <FlameIcon className="cp-flame h-4 w-4 text-gold-300" />
            <span className="font-semibold text-white">{DEMO_STREAK}</span> in a row
          </span>
        </div>
      </div>

      <div aria-hidden className="pointer-events-none absolute inset-0">
        <span
          style={{ '--cp-delay': '2.2s' } as CSSProperties}
          className="cp-award-pop absolute right-4 top-16 rounded-full bg-gold-400 px-2 py-0.5 text-2xs font-bold text-brand-950 shadow-lg"
        >
          +3 recitation
        </span>
        <span
          style={{ '--cp-delay': '5.7s' } as CSSProperties}
          className="cp-award-pop absolute right-8 top-24 rounded-full bg-success-solid px-2 py-0.5 text-2xs font-bold text-white shadow-lg"
        >
          +1 present
        </span>
      </div>
    </div>
  )
}
