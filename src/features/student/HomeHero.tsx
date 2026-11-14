import { useEffect, useId, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { settle } from '@/lib/motion'
import { AnimatedNumber } from '@/components/ui/AnimatedNumber'
import { Avatar } from '@/components/ui/Avatar'
import { ChevronDownIcon, FlameIcon } from '@/components/ui/icons'
import { cn } from '@/lib/cn'
import { getLevelProgress } from '@/lib/leveling'

/** Fixed star positions (percent), so nothing reshuffles on render. */
const STARS: ReadonlyArray<[number, number, number, number]> = [
  [8, 18, 2, 0],
  [30, 78, 2, 1.4],
  [46, 12, 3, 2.2],
  [62, 84, 2, 0.8],
  [78, 22, 2, 1.9],
  [92, 70, 3, 2.7],
]

/** What the rank chip says when you hover or tap it, or null when there is nothing to say. */
function rankTip(rank: number | null, pointsToOvertake: number | null): string | null {
  if (rank === 1) return 'You are on top. Hold the spot.'
  if (rank === null || pointsToOvertake === null || pointsToOvertake <= 0) return null
  return `${pointsToOvertake} ${pointsToOvertake === 1 ? 'point' : 'points'} to pass the student above you.`
}

/**
 * The rank card. When there is something to say about the gap to the student above,
 * it is a button: hover reveals it with a mouse, a tap pins it on a phone (and a tap
 * anywhere else, or Escape, puts it away). The popover is a sibling of the chip, not
 * a child of the clipped decoration layer, so the card's rounded edge never cuts it.
 */
function RankChip({
  rank,
  rankNote,
  tip,
}: {
  rank: number | null
  rankNote?: string
  tip: string | null
}) {
  const [hover, setHover] = useState(false)
  const [pinned, setPinned] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const tipId = useId()
  const open = tip !== null && (hover || pinned)

  useEffect(() => {
    if (!pinned) return
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setPinned(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPinned(false)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [pinned])

  const body = (
    <>
      <span className="flex items-center justify-between gap-2">
        <span className="font-display text-sm font-bold leading-none tabular-nums text-white">
          {rank ? `#${rank}` : '-'}
        </span>
        {tip && (
          <ChevronDownIcon
            aria-hidden
            className={cn(
              'h-3 w-3 shrink-0 text-white/60 transition-transform',
              open && 'rotate-180',
            )}
          />
        )}
      </span>
      <span className="mt-0.5 block text-2xs text-white/60">
        {rank ? (rankNote ?? 'overall') : 'not ranked yet'}
      </span>
    </>
  )

  const chipClass =
    'block w-full rounded-lg bg-white/8 px-2.5 py-1.5 text-left ring-1 ring-white/10'

  return (
    <div
      ref={wrapRef}
      className="relative"
      onPointerEnter={(e) => {
        if (e.pointerType === 'mouse') setHover(true)
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === 'mouse') setHover(false)
      }}
    >
      {tip ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={tipId}
          onClick={() => setPinned((p) => !p)}
          className={cn(chipClass, 'cp-tap-y transition-colors hover:bg-white/12')}
        >
          {body}
        </button>
      ) : (
        <div className={chipClass}>{body}</div>
      )}

      {open && tip && (
        <motion.div
          id={tipId}
          role="tooltip"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15 }}
          className={cn(
            'absolute left-0 top-full z-30 mt-2 w-max max-w-[14rem] sm:left-auto sm:right-0',
            'rounded-xl bg-plate px-3 py-2 text-xs font-medium leading-snug text-white/90',
            'shadow-lg shadow-black/40 ring-1 ring-white/15',
          )}
        >
          {tip}
        </motion.div>
      )}
    </div>
  )
}

/**
 * The Level + Points scoreboard as an orbit.
 *
 * Your level is a planet; the XP ring around it fills as you climb, and your
 * avatar is the moon that rides the end of that arc, so progress reads as
 * "how far round the orbit" rather than as a bar. The moon is a rotating wrapper
 * with a counter-rotating avatar inside, which keeps your face upright and means
 * the whole animation is one `transform` (compositor only). Like the old plate it
 * is a FIXED dark surface that does not flip with the theme.
 *
 * Layout: from `sm` up it is planet | numbers | a column of rank and streak cards.
 * On a phone the two cards drop under the planet as an even pair, because a third
 * column would starve the points figure.
 */
export function HomeHero({
  points,
  avatarName,
  avatarUrl,
  rank,
  rankNote,
  pointsToOvertake,
  streak,
  className,
}: {
  points: number
  avatarName: string
  avatarUrl: string | null
  rank: number | null
  /** e.g. "as of 12:30 PM": the board is a snapshot, not live. */
  rankNote?: string
  /** Points needed to pass the student one place above; null when there is nobody above. */
  pointsToOvertake: number | null
  streak: number | null
  className?: string
}) {
  const progress = getLevelProgress(points)
  const hotStreak = (streak ?? 0) >= 5
  const pct = Math.max(0, Math.min(100, progress.progressPct))
  const angle = (pct / 100) * 360

  return (
    <div
      className={cn(
        // No overflow-hidden here: the rank popover must be free to leave the card.
        'relative rounded-2xl',
        'bg-gradient-to-br from-plate-2 to-plate',
        'shadow-lg shadow-black/25 ring-1 ring-white/10',
        className,
      )}
    >
      {/* All the decoration lives in its own clipped layer. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
        <div className="absolute -left-10 -top-16 h-44 w-44 rounded-full bg-gold-400/12 blur-3xl" />
        {STARS.map(([l, t, size, d], i) => (
          <span
            key={i}
            className="cp-twinkle absolute rounded-full bg-white"
            style={{ left: `${l}%`, top: `${t}%`, width: size, height: size, animationDelay: `${d}s` }}
          />
        ))}
        {/* A slow light sweep across the plate. Opacity/transform only. */}
        <div className="cp-sheen absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/8 to-transparent" />
      </div>

      <div
        className={cn(
          'relative grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-4 p-4',
          'min-[380px]:gap-x-4 min-[380px]:p-5',
          'sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-x-6',
        )}
      >
        {/* The orbit */}
        <div
          className="relative aspect-square w-28 shrink-0 min-[380px]:w-36 sm:w-40"
          role="img"
          aria-label={`Level ${progress.level}, ${progress.expIntoLevel} of ${progress.expForLevel} XP`}
        >
          <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
            <defs>
              <linearGradient id="home-orbit-fill" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#f59e0b" />
                <stop offset="100%" stopColor="#fde68a" />
              </linearGradient>
            </defs>
            <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3" />
            <motion.circle
              cx="50"
              cy="50"
              r="42"
              fill="none"
              stroke="url(#home-orbit-fill)"
              strokeWidth="3.5"
              strokeLinecap="round"
              transform="rotate(-90 50 50)"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: pct / 100 }}
              transition={settle}
            />
          </svg>

          {/* The planet */}
          <div
            className="absolute inset-[20%] flex flex-col items-center justify-center rounded-full"
            style={{
              background:
                'radial-gradient(circle at 32% 28%, #fde68a 0%, #f59e0b 48%, #b45309 100%)',
              boxShadow: '0 0 28px 4px rgba(245,158,11,0.35), inset -6px -8px 14px rgba(0,0,0,0.25)',
            }}
          >
            <span className="text-2xs font-bold uppercase tracking-widest text-brand-950/70">
              Level
            </span>
            <span className="font-display text-3xl font-bold leading-none text-brand-950 min-[380px]:text-4xl sm:text-5xl">
              {progress.level}
            </span>
          </div>

          {/* The moon: your avatar, riding the end of the XP arc */}
          <motion.div
            className="absolute inset-0"
            initial={{ rotate: 0 }}
            animate={{ rotate: angle }}
            transition={settle}
          >
            <motion.div
              className="absolute left-1/2 top-[8%] h-[23%] w-[23%] -translate-x-1/2 -translate-y-1/2"
              initial={{ rotate: 0 }}
              animate={{ rotate: -angle }}
              transition={settle}
            >
              <Avatar
                name={avatarName}
                url={avatarUrl}
                className="h-full w-full ring-2 ring-white/70 shadow-lg shadow-black/40"
                textClassName="text-2xs"
              />
            </motion.div>
          </motion.div>
        </div>

        {/* The numbers */}
        <div className="min-w-0">
          <p className="text-2xs font-semibold uppercase tracking-widest text-white/60">Points</p>
          <motion.p
            key={points}
            initial={{ scale: 1.25 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 18 }}
            className="w-fit origin-left font-display text-4xl font-bold leading-none tabular-nums text-gold-300 min-[380px]:text-5xl"
          >
            <AnimatedNumber value={points} />
          </motion.p>
          <p className="mt-2 text-2xs tabular-nums text-white/60">
            {progress.expIntoLevel} / {progress.expForLevel} XP
          </p>
          <p className="text-xs font-semibold tabular-nums text-white/85">
            {progress.expToNext} to Level {progress.level + 1}
          </p>
        </div>

        {/* Rank + streak: an even pair under the planet on a phone, a stacked column beside it from sm up */}
        <div className="col-span-2 grid grid-cols-2 gap-2 sm:col-span-1 sm:flex sm:w-36 sm:flex-col sm:self-start">
          <RankChip rank={rank} rankNote={rankNote} tip={rankTip(rank, pointsToOvertake)} />
          <div className="rounded-lg bg-white/8 px-2.5 py-1.5 ring-1 ring-white/10">
            <span className="flex items-center gap-1 font-display text-sm font-bold leading-none tabular-nums text-white">
              <FlameIcon
                className={cn(
                  'h-3.5 w-3.5',
                  hotStreak ? 'cp-flame text-streak-solid' : 'text-white/35',
                )}
              />
              {streak ?? 0}
            </span>
            <span className="mt-0.5 block text-2xs text-white/60">
              {streak === 1 ? 'class in a row' : 'classes in a row'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
