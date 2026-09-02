import { motion } from 'framer-motion'
import type { CSSProperties } from 'react'
import { AnimatedNumber } from '@/components/ui/AnimatedNumber'
import { FlameIcon } from '@/components/ui/icons'
import { getLevelProgress } from '@/lib/leveling'
import { ease, spring } from '@/lib/motion'
import { cn } from '@/lib/cn'

/**
 * The hero's centrepiece: the app's own scoreboard, running as a demo.
 *
 * ── WHY SHOW THE PRODUCT INSTEAD OF DESCRIBING IT ──────────────────────────
 * The page this replaced explained a gamified XP app using three bordered boxes
 * of text, with no XP anywhere on screen. This is the same `--color-plate`
 * surface a student sees every day on Home, so the landing page and the app
 * agree about what ClassPoint looks like before anyone has signed in.
 *
 * It is a sibling of `HomeHero`, deliberately NOT a reuse of it. HomeHero takes
 * a real student's numbers and carries product decisions (not tappable, exact
 * label wording, a rank note about snapshot timing) that a marketing mock has
 * no business either inheriting or quietly diverging from. Copying five values
 * is cheaper than bending a live component into a demo prop.
 *
 * ── THE NUMBERS ARE DERIVED, NOT INVENTED ──────────────────────────────────
 * Everything below comes out of `getLevelProgress(DEMO_POINTS)`, the same
 * function the app uses. Hand-writing "Level 3 · 58%" would have been fewer
 * lines and would silently become a lie the moment anyone touched the curve —
 * and this screen is the first impression of exactly that curve.
 *
 * ── WHAT MOVES, AND ON WHOSE BUDGET ────────────────────────────────────────
 * One-shot, framer, on arrival: the points roll up, the XP rail fills, the
 * level pops in.
 * Forever, CSS, on the compositor: the sheen, the "+3" award chips, the streak
 * flame. Nothing runs a JS spring after the first second.
 *
 * The rail fills with `scaleX`, never `width`. A width animation relayouts the
 * bar on every frame; a transform does not touch layout at all.
 */

/**
 * Chosen to land mid-level: a full-looking rail reads better than a near-empty
 * one, and a near-full one implies a level-up that never arrives.
 *
 * Exported because the leaderboard preview further down the landing page places
 * "You" using these same two numbers. Two mocks of one student that disagreed
 * about their own points would be the first thing a reader noticed — and it is
 * exactly the drift that hit the points row four separate times before it was
 * given one definition.
 */
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
        // In light mode this sits on a near-white canvas, so it needs a real
        // edge or it reads as a hole punched in the page.
        'shadow-xl shadow-black/25 ring-1 ring-white/10',
        className,
      )}
    >
      {/* Gold bloom behind the level, so the plate is not a flat rectangle. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-10 -top-16 h-44 w-44 rounded-full bg-gold-400/15 blur-3xl"
      />

      {/* The occasional glint. A skewed, pre-painted gradient strip translating
          across is the cheapest possible sweep — no repaint, no layout. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="cp-sheen absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </div>

      <div className="relative p-5">
        {/* Eyebrow, with a Preview tag so nobody reads 190 as their own total. */}
        <div className="mb-4 flex items-center justify-between">
          <span className="text-2xs font-semibold uppercase tracking-widest text-white/55">
            Your scoreboard
          </span>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-2xs font-medium text-white/70">
            Preview
          </span>
        </div>

        {/* Level and points on one line: they are the same quantity in
            different clothes, and the rail below is what says so. */}
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

        {/* The XP rail — the bridge between the two figures above. */}
        <div className="mt-4">
          <div className="relative h-2.5 overflow-hidden rounded-full bg-white/10">
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: progress.progressPct / 100 }}
              transition={{ ...ease, duration: 1.1, delay: 0.15 }}
              style={{ transformOrigin: 'left' }}
              className="relative h-full rounded-full bg-gradient-to-r from-gold-500 to-gold-300"
            >
              {/* The same travelling highlight the real XP bar uses. */}
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

        {/* Footer: rank and streak. Real, but not what you open the app for. */}
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

      {/* Live awards landing on the plate.

          Two chips on one keyframe, offset so something arrives every few
          seconds without either repeating quickly enough to read as a loop.
          Absolute and `pointer-events-none`, so they can neither disturb the
          layout nor swallow a tap. */}
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
