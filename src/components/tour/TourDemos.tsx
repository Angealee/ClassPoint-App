import type { ReactNode } from 'react'
import { motion, type Transition } from 'framer-motion'
import { CheckIcon, CrownIcon, TicketIcon } from '@/components/ui/icons'
import { TONE } from '@/lib/tone'
import { cn } from '@/lib/cn'

/**
 * The four miniature demos the tour shows instead of paragraphs.
 *
 * The brief was "students tend to skip wordy instructions", so each card
 * animates the real thing in miniature and the words stay to a title and one
 * line. That is also why these are not screenshots: a screenshot ages the day
 * the screen is redesigned, and these are built from the same tokens the real
 * screens use, so they follow the theme and a retuned `--accent` for free.
 *
 * ── ONE CONSTRAINT: COMPOSITOR ONLY ─────────────────────────────────────────
 * Opacity and transform, nothing else. Animating `width`, `top` or `height`
 * would force layout every frame on exactly the low-end phones this app is
 * installed on, in the first thirty seconds a student ever spends in it. So the
 * XP bar fills by `scaleX`, the scan line sweeps by `y` in pixels, and the
 * podium rises by `scaleY` — which is also why every box below has a FIXED
 * pixel height: `y` in pixels only means something against a known size.
 *
 * ── LOOPS ARE KEYFRAMES WITH `times`, NOT `delay` ───────────────────────────
 * `delay` applies to the first iteration only, so a staggered loop built on it
 * is in sync for one cycle and drifts out of step from the second. The stagger
 * is baked into each element's `times` array instead, which repeats exactly.
 *
 * `<MotionConfig reducedMotion="user">` (App.tsx) turns every transform here
 * into an instant jump to its final value, so a motion-sensitive student sees a
 * still, complete picture rather than a broken one — and nothing in this file
 * needs its own guard.
 */

const loop = (duration: number, times: number[]): Transition => ({
  duration,
  times,
  repeat: Infinity,
  ease: 'easeInOut',
})

/** The frame every demo sits in: a fixed-height card on the canvas. */
function Stage({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div
      role="img"
      aria-label={label}
      className="relative h-52 w-full max-w-xs overflow-hidden rounded-3xl border border-line bg-card shadow-sm"
    >
      {children}
    </div>
  )
}

/** Crossfade between two states over one loop: A shows first, B after `at`. */
function swap(at: number, back = 0.96) {
  return {
    a: { opacity: [1, 1, 0, 0, 1], times: [0, at, at + 0.03, back, 1] },
    b: { opacity: [0, 0, 1, 1, 0], times: [0, at, at + 0.03, back, 1] },
  }
}

// ── 1 · Earn points, level up ────────────────────────────────────────────────

export function PointsDemo() {
  const D = 4.4
  const levelSwap = swap(0.55)
  return (
    <Stage label="A points bar filling up and the level going from 1 to 2">
      {/* +5 floats up out of the bar. */}
      <motion.span
        className={cn(
          // top-11 (44px) + a 28px pill ends at 72px, clear of the badge at 80px at
          // the moment it reaches full opacity. At top-14 it ended at 84px and
          // touched the badge exactly when it became fully visible.
          'absolute left-1/2 top-11 -ml-6 rounded-full px-3 py-1 font-display text-sm font-bold',
          TONE.reward.chip,
        )}
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: [0, 1, 1, 0], y: [14, 0, -18, -18] }}
        transition={loop(D, [0, 0.12, 0.45, 0.55])}
      >
        +5
      </motion.span>

      {/* The level badge. Two labels stacked and crossfaded: swapping the text
          itself would reflow, and a reflow is not compositor work. */}
      <motion.div
        className="absolute left-1/2 top-20 -ml-8 flex h-16 w-16 items-center justify-center rounded-full bg-reward-solid font-display text-lg font-bold text-brand-950"
        animate={{ scale: [1, 1, 1.28, 1, 1] }}
        transition={loop(D, [0, 0.5, 0.6, 0.72, 1])}
      >
        <motion.span
          className="absolute"
          animate={{ opacity: levelSwap.a.opacity }}
          transition={loop(D, levelSwap.a.times)}
        >
          Lv 1
        </motion.span>
        <motion.span
          className="absolute"
          animate={{ opacity: levelSwap.b.opacity }}
          transition={loop(D, levelSwap.b.times)}
        >
          Lv 2
        </motion.span>
      </motion.div>

      {/* The XP rail: scaleX from the left, never `width`. */}
      <div className="absolute inset-x-8 bottom-9 h-3 overflow-hidden rounded-full bg-card-2">
        <motion.div
          className="h-full w-full origin-left rounded-full bg-reward-solid"
          initial={{ scaleX: 0.3 }}
          animate={{ scaleX: [0.3, 0.3, 1, 1, 0.3] }}
          transition={loop(D, [0, 0.15, 0.55, 0.9, 1])}
        />
      </div>
    </Stage>
  )
}

// ── 2 · Scan to record attendance ────────────────────────────────────────────

/**
 * A fixed pseudo-QR: three finder squares and a deterministic scatter.
 *
 * Deterministic on purpose — `Math.random()` here would give a different code
 * on every render and would trip the react-hooks purity rule that the confetti
 * is already the only exemption for.
 */
const QR_N = 11
function qrCells(): Array<[number, number]> {
  const cells: Array<[number, number]> = []
  const finder = (x: number, y: number) =>
    x < 3 && y < 3
      ? true
      : x >= QR_N - 3 && y < 3
        ? true
        : x < 3 && y >= QR_N - 3
          ? true
          : false
  for (let y = 0; y < QR_N; y += 1) {
    for (let x = 0; x < QR_N; x += 1) {
      if (finder(x, y) || (x * 7 + y * 13 + x * y) % 3 === 0) cells.push([x, y])
    }
  }
  return cells
}
const QR_CELLS = qrCells()

export function ScanDemo() {
  const D = 4.8
  return (
    <Stage label="A QR code being scanned, then a check mark saying attendance is recorded">
      {/* The code dims once it has been read. */}
      <motion.svg
        viewBox={`0 0 ${QR_N} ${QR_N}`}
        className="absolute left-1/2 top-6 -ml-14 h-28 w-28 text-ink"
        initial={{ opacity: 1 }}
        animate={{ opacity: [1, 1, 0.18, 0.18, 1] }}
        transition={loop(D, [0, 0.5, 0.6, 0.92, 1])}
        shapeRendering="crispEdges"
      >
        {QR_CELLS.map(([x, y]) => (
          <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="currentColor" />
        ))}
      </motion.svg>

      {/* Viewfinder corners, the same four the real scanner draws. */}
      <div className="pointer-events-none absolute left-1/2 top-3 -ml-[4.25rem] h-[8.5rem] w-[8.5rem]">
        <span className="absolute left-0 top-0 h-5 w-5 rounded-tl-lg border-l-[3px] border-t-[3px] border-accent-solid" />
        <span className="absolute right-0 top-0 h-5 w-5 rounded-tr-lg border-r-[3px] border-t-[3px] border-accent-solid" />
        <span className="absolute bottom-0 left-0 h-5 w-5 rounded-bl-lg border-b-[3px] border-l-[3px] border-accent-solid" />
        <span className="absolute bottom-0 right-0 h-5 w-5 rounded-br-lg border-b-[3px] border-r-[3px] border-accent-solid" />
        {/* The sweep: `y` in px across a fixed 136px box, never `top`. */}
        <motion.span
          className="absolute inset-x-2 top-0 h-[3px] rounded-full bg-accent-solid"
          animate={{ y: [6, 126, 6, 126, 126], opacity: [1, 1, 1, 1, 0] }}
          transition={loop(D, [0, 0.22, 0.44, 0.58, 0.62])}
        />
      </div>

      {/* The result: pops after the second sweep. */}
      <motion.div
        className="absolute inset-x-0 bottom-4 flex flex-col items-center gap-2"
        animate={{ opacity: [0, 0, 1, 1, 0] }}
        transition={loop(D, [0, 0.58, 0.64, 0.92, 1])}
      >
        <motion.span
          className={cn('flex h-9 w-9 items-center justify-center rounded-full', TONE.success.solid)}
          animate={{ scale: [0.4, 0.4, 1.15, 1, 1] }}
          transition={loop(D, [0, 0.58, 0.68, 0.74, 1])}
        >
          <CheckIcon className="h-5 w-5" />
        </motion.span>
        <span className={cn('rounded-full px-3 py-1 text-xs font-semibold', TONE.success.chip)}>
          Attendance recorded
        </span>
      </motion.div>
    </Stage>
  )
}

// ── 3 · Climb the leaderboard ────────────────────────────────────────────────

const STANDS = [
  { place: 2, h: 'h-16', delay: 0.06 },
  { place: 1, h: 'h-24', delay: 0 },
  { place: 3, h: 'h-12', delay: 0.12 },
] as const

export function LeaderboardDemo() {
  const D = 4.8
  return (
    <Stage label="The top three standing on a podium, with a crown over first place">
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-center gap-2 px-6 pb-6">
        {STANDS.map((s) => {
          const champ = s.place === 1
          return (
            <div key={s.place} className={cn('relative w-[4.25rem]', s.h)}>
              {champ && (
                <motion.span
                  className="absolute -top-8 left-1/2 -ml-4"
                  animate={{ opacity: [0, 0, 1, 1, 0], y: [6, 6, 0, -3, 6] }}
                  transition={loop(D, [0, 0.4, 0.5, 0.75, 1])}
                >
                  <CrownIcon className="h-8 w-8 text-reward" />
                </motion.span>
              )}
              {/* The stand grows from its floor. Stagger is baked into `times`
                  so the loop stays in step past the first cycle. */}
              <motion.div
                className={cn(
                  'absolute inset-0 origin-bottom rounded-t-xl border border-b-0',
                  champ ? 'border-reward-solid bg-reward-solid' : 'border-line bg-card-2',
                )}
                initial={{ scaleY: 0 }}
                animate={{ scaleY: [0, 0, 1, 1, 0] }}
                transition={loop(D, [0, s.delay, s.delay + 0.22, 0.88, 1])}
              />
              {/* The number is NOT inside the scaled box: scaleY would squash
                  the glyph while it grows. */}
              <motion.span
                className={cn(
                  'absolute inset-x-0 bottom-2 text-center font-display text-xl font-bold',
                  champ ? 'text-brand-950' : 'text-ink',
                )}
                animate={{ opacity: [0, 0, 1, 1, 0] }}
                transition={loop(D, [0, s.delay + 0.1, s.delay + 0.28, 0.88, 1])}
              >
                {s.place}
              </motion.span>
            </div>
          )
        })}
      </div>
    </Stage>
  )
}

// ── 4 · Spend your points ────────────────────────────────────────────────────

export function SpendDemo() {
  const D = 4.8
  const points = swap(0.48)
  const rank = swap(0.5)
  return (
    <Stage label="Spending five points: the points go down and the rank drops from 4 to 6">
      {/* The request chip drops in. */}
      <motion.div
        className={cn(
          'absolute left-1/2 top-5 -ml-[4.5rem] flex w-36 items-center justify-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold',
          TONE.reward.chip,
        )}
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: [0, 1, 1, 0], y: [-12, 0, 0, -6] }}
        transition={loop(D, [0, 0.1, 0.55, 0.62])}
      >
        <TicketIcon className="h-4 w-4" />
        Quiz · 5 pts
      </motion.div>

      <div className="absolute inset-x-6 bottom-6 grid grid-cols-2 gap-3">
        {/* Points: 12 becomes 7. */}
        <div className="rounded-2xl border border-line bg-card-2 py-3 text-center">
          <p className="text-2xs font-semibold uppercase tracking-wider text-muted">Points</p>
          <div className="relative mx-auto mt-1 h-8 w-12 font-display text-2xl font-bold">
            <motion.span
              className="absolute inset-0 text-reward"
              animate={{ opacity: points.a.opacity }}
              transition={loop(D, points.a.times)}
            >
              12
            </motion.span>
            <motion.span
              className="absolute inset-0 text-reward"
              animate={{ opacity: points.b.opacity }}
              transition={loop(D, points.b.times)}
            >
              7
            </motion.span>
          </div>
        </div>

        {/* Rank: 4 becomes 6 — the cost, shown as the thing it is. */}
        <div className="rounded-2xl border border-line bg-card-2 py-3 text-center">
          <p className="text-2xs font-semibold uppercase tracking-wider text-muted">Rank</p>
          <div className="relative mx-auto mt-1 h-8 w-12 font-display text-2xl font-bold">
            <motion.span
              className="absolute inset-0 text-ink"
              animate={{ opacity: rank.a.opacity }}
              transition={loop(D, rank.a.times)}
            >
              #4
            </motion.span>
            <motion.span
              className={cn('absolute inset-0', TONE.danger.text)}
              animate={{ opacity: rank.b.opacity }}
              transition={loop(D, rank.b.times)}
            >
              #6
            </motion.span>
          </div>
        </div>
      </div>
    </Stage>
  )
}
