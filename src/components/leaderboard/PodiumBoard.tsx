import { type CSSProperties, useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Card } from '@/components/ui/Card'
import { Avatar } from '@/components/ui/Avatar'
import { CrownIcon } from '@/components/ui/icons'
import { ConfettiBurst } from '@/components/leaderboard/ConfettiBurst'
import { getLevelProgress } from '@/lib/leveling'
import { cn } from '@/lib/cn'
import type { LeaderboardEntry } from '@/lib/types'

interface PodiumBoardProps {
  /** Already-sorted entries (rank ascending) for the current view. */
  entries: LeaderboardEntry[]
  /** The viewing student's id, so their own card/row stands out. */
  meId?: string | null
  /** Resolve a section id to its display name. */
  sectionName?: (id: string) => string
  /** Show the section name on cards/rows (handy on multi-section views). */
  showSection?: boolean
  /** A pinned "your standing" row for a viewer who sits outside `entries`. */
  pinnedSelf?: LeaderboardEntry | null
  /** Tapping a card/row calls this (e.g. to open a profile preview). */
  onSelect?: (entry: LeaderboardEntry) => void
  /** Soft gold spotlight behind the podium (on by default). */
  glow?: boolean
  /** One-shot confetti when the board first appears (on by default). */
  confetti?: boolean
}

type Place = 1 | 2 | 3

/** Per-tier metal treatment for the top three. */
const TIER: Record<
  Place,
  { border: string; tint: string; pedestal: string; pedestalBorder: string; pedestalInk: string }
> = {
  1: {
    border: 'border-gold-400/70!',
    tint: 'from-gold-400/25 via-gold-500/5',
    pedestal: 'from-gold-300 to-gold-600',
    pedestalBorder: 'border-gold-600/50',
    pedestalInk: 'text-brand-950',
  },
  2: {
    border: 'border-zinc-400/60!',
    tint: 'from-zinc-300/20 via-zinc-400/5',
    pedestal: 'from-zinc-200 to-zinc-500',
    pedestalBorder: 'border-zinc-500/50',
    pedestalInk: 'text-zinc-800',
  },
  3: {
    border: 'border-amber-700/60!',
    tint: 'from-amber-600/25 via-amber-700/5',
    pedestal: 'from-amber-400 to-amber-700',
    pedestalBorder: 'border-amber-800/50',
    pedestalInk: 'text-amber-950',
  },
}

/** Stand heights — #1 tallest, creating the classic winners' staircase. */
const PEDESTAL_H: Record<Place, string> = {
  1: 'h-14 sm:h-20',
  2: 'h-10 sm:h-12',
  3: 'h-7 sm:h-8',
}


export function PodiumBoard({
  entries,
  meId,
  sectionName,
  showSection = false,
  pinnedSelf = null,
  onSelect,
  glow = true,
  confetti = true,
}: PodiumBoardProps) {
  const reduced = useReducedMotion() ?? false
  // One-shot celebration when the board first mounts; auto-clears after ~2s.
  const [showConfetti, setShowConfetti] = useState(confetti)
  useEffect(() => {
    if (!confetti) return
    const t = setTimeout(() => setShowConfetti(false), 2200)
    return () => clearTimeout(t)
  }, [confetti])

  if (entries.length === 0) return null

  const label = (id: string) => (showSection ? sectionName?.(id) ?? '' : '')
  const pick = onSelect ? (entry: LeaderboardEntry) => () => onSelect(entry) : undefined
  const top3 = entries.slice(0, 3).map((entry, i) => ({ entry, place: (i + 1) as Place }))
  const rest = entries.slice(3)

  // Visually raise #1 in the centre: [#2, #1, #3]. Fewer than three → natural order.
  const podiumOrder = top3.length >= 3 ? [top3[1], top3[0], top3[2]] : top3

  return (
    <div className="space-y-3">
      <div className="relative">
        {/* Arena spotlight behind the stand. */}
        {glow && (
          <div
            className={cn(
              'pointer-events-none absolute left-1/2 top-6 h-44 w-[130%] -translate-x-1/2 rounded-[50%]',
              !reduced && 'cp-arena-glow',
            )}
            style={{
              background:
                'radial-gradient(ellipse at center, rgba(255,186,31,0.22), rgba(255,186,31,0) 70%)',
            }}
          />
        )}
        {showConfetti && <ConfettiBurst />}

        <div className="relative flex items-end justify-center gap-1.5 px-0.5 pt-12 sm:gap-3 sm:px-1">
          {podiumOrder.map(({ entry, place }) => (
            <PodiumCard
              key={entry.student_id}
              entry={entry}
              place={place}
              isMe={meId === entry.student_id}
              sectionLabel={label(entry.section_id)}
              reduced={reduced}
              onClick={pick?.(entry)}
            />
          ))}
        </div>

        {/* Shared stage floor — grounds the three stands so they read as one
            podium instead of floating bars. */}
        <div className="relative z-[1] -mt-px h-2.5 rounded-b-lg border border-t-0 border-line bg-gradient-to-b from-card-2 to-card shadow-sm" />
      </div>

      {rest.length > 0 && (
        <div className="space-y-2">
          {rest.map((entry, i) => (
            <RestRow
              key={entry.student_id}
              entry={entry}
              place={i + 4}
              isMe={meId === entry.student_id}
              sectionLabel={label(entry.section_id)}
              index={i}
              reduced={reduced}
              onClick={pick?.(entry)}
            />
          ))}
        </div>
      )}

      {pinnedSelf && (
        <div className="space-y-1 pt-1">
          <p className="text-center text-[0.65rem] uppercase tracking-wider text-muted">
            your standing
          </p>
          <RestRow
            entry={pinnedSelf}
            place={pinnedSelf.rank}
            isMe
            sectionLabel={label(pinnedSelf.section_id)}
            index={0}
            reduced={reduced}
            onClick={pick?.(pinnedSelf)}
          />
        </div>
      )}
    </div>
  )
}

function PodiumCard({
  entry,
  place,
  isMe,
  sectionLabel,
  reduced,
  onClick,
}: {
  entry: LeaderboardEntry
  place: Place
  isMe: boolean
  sectionLabel: string
  reduced: boolean
  onClick?: () => void
}) {
  const tier = TIER[place]
  const progress = getLevelProgress(entry.lifetime_points)
  const level = progress.level
  const champ = place === 1

  // Tap a podium card → a brief celebratory spotlight, then open the profile.
  const [spot, setSpot] = useState(false)
  const activate = onClick
    ? () => {
        if (reduced) return onClick()
        setSpot(true)
        window.setTimeout(() => {
          setSpot(false)
          onClick()
        }, 450)
      }
    : undefined

  return (
    <motion.div
      layout={!reduced}
      initial={reduced ? false : { y: 44, opacity: 0, scale: 0.92 }}
      animate={{ y: 0, opacity: 1, scale: spot ? 1.08 : 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 22, delay: spot ? 0 : 0.08 * place }}
      whileHover={activate ? { y: -3 } : undefined}
      whileTap={activate ? { scale: 0.97 } : undefined}
      onClick={activate}
      role={activate ? 'button' : undefined}
      tabIndex={activate ? 0 : undefined}
      aria-label={activate ? `View ${entry.display_name}'s profile, rank ${place}` : undefined}
      onKeyDown={(e) => {
        if (activate && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          activate()
        }
      }}
      className={cn(
        'relative flex flex-1 flex-col',
        champ ? 'max-w-[12rem]' : 'max-w-[10rem]',
        activate &&
          'cursor-pointer rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50',
      )}
    >
      {/* Spotlight flash on tap. */}
      {spot && !reduced && (
        <motion.div
          className="pointer-events-none absolute inset-0 z-30 rounded-2xl"
          initial={{ opacity: 0.75 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.45 }}
          style={{
            background:
              'radial-gradient(circle at 50% 40%, rgba(255,255,255,0.7), rgba(255,186,31,0.25) 50%, transparent 75%)',
          }}
        />
      )}

      {/* Crown floats above the champion. */}
      {champ && (
        <div className="pointer-events-none absolute -top-9 left-1/2 z-20 -translate-x-1/2">
          <CrownIcon className={cn('h-9 w-9 text-gold-400 drop-shadow-md', !reduced && 'cp-bob')} />
        </div>
      )}

      {/* Sparkles drift up around the champion. */}
      {champ && !reduced && <Sparkles />}

      <Card
        className={cn(
          'relative flex flex-col items-center gap-1.5 overflow-hidden border px-2 text-center sm:gap-2 sm:px-3',
          tier.border,
          champ ? 'pb-3 pt-7 sm:pb-4 sm:pt-8' : 'pb-3 pt-5 sm:pb-3.5 sm:pt-6',
          champ && !reduced && 'cp-podium-glow',
        )}
      >
        {/* Metal tint wash. */}
        <div
          className={cn('pointer-events-none absolute inset-0 bg-gradient-to-b to-transparent', tier.tint)}
        />
        {/* Champion light sweep. */}
        {champ && !reduced && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="cp-shimmer absolute inset-y-0 -left-1/3 w-1/3 -skew-x-12 bg-white/10" />
          </div>
        )}
        {/* "You" tint. */}
        {isMe && <div className="pointer-events-none absolute inset-0 bg-brand-500/10" />}

        {/* Gold XP ring around the avatar shows level progress. */}
        <div
          className="relative z-[1] rounded-full p-[3px]"
          style={{
            background: `conic-gradient(#ffba1f ${progress.progressPct}%, rgba(160,160,160,0.25) ${progress.progressPct}%)`,
          }}
        >
          <div className="rounded-full bg-card p-[2px]">
            <Avatar
              name={entry.display_name}
              url={entry.avatar_url}
              className={cn(
                'block',
                champ ? 'h-14! w-14! sm:h-20! sm:w-20!' : 'h-11! w-11! sm:h-16! sm:w-16!',
              )}
              textClassName={champ ? 'text-base sm:text-xl' : 'text-sm sm:text-lg'}
            />
          </div>
        </div>

        <div className="relative z-[1] w-full min-w-0">
          <p className="truncate text-[0.78rem] font-semibold sm:text-sm">
            {entry.display_name}
            {isMe && <span className="text-brand-500"> (you)</span>}
          </p>
          <p className="truncate text-[0.65rem] text-muted sm:text-xs">
            {sectionLabel ? `${sectionLabel} · ` : ''}Lv {level}
          </p>
        </div>

        <div className="relative z-[1] flex items-baseline gap-1">
          <CountUp
            value={entry.lifetime_points}
            reduced={reduced}
            className="font-display text-xl font-bold text-gold-400 sm:text-2xl"
          />
          <span className="text-xs font-medium text-muted">pts</span>
        </div>
      </Card>

      {/* Winners' stand — attached to the card; its top border is the platform
          line, its open bottom merges into the shared floor below. */}
      <motion.div
        initial={reduced ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 220, damping: 24, delay: 0.1 + 0.08 * place }}
        className={cn(
          'relative -mt-1 w-full overflow-hidden rounded-t-md border border-b-0 bg-gradient-to-b',
          PEDESTAL_H[place],
          tier.pedestal,
          tier.pedestalBorder,
        )}
      >
        <div className="absolute inset-x-0 top-0 h-1 bg-white/30" />
        <span
          className={cn(
            'absolute inset-0 flex items-center justify-center font-display text-2xl font-bold sm:text-3xl',
            tier.pedestalInk,
          )}
        >
          {place}
        </span>
      </motion.div>
    </motion.div>
  )
}

function RestRow({
  entry,
  place,
  isMe,
  sectionLabel,
  index,
  reduced,
  onClick,
}: {
  entry: LeaderboardEntry
  place: number
  isMe: boolean
  sectionLabel: string
  index: number
  reduced: boolean
  onClick?: () => void
}) {
  const level = getLevelProgress(entry.lifetime_points).level
  return (
    <motion.div
      layout
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.3) }}
      whileTap={onClick ? { scale: 0.99 } : undefined}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? `View ${entry.display_name}'s profile` : undefined}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onClick()
        }
      }}
      className={cn(
        onClick &&
          'cursor-pointer rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50',
      )}
    >
      <Card
        className={cn(
          'relative flex items-center gap-3 overflow-hidden p-3 transition-colors',
          onClick && 'hover:bg-card-2',
          isMe && 'ring-1 ring-brand-500/40',
        )}
      >
        {isMe && <div className="pointer-events-none absolute inset-0 bg-brand-500/10" />}
        <span className="relative z-[1] w-6 text-center font-display text-base font-bold text-muted">
          {place}
        </span>
        <Avatar name={entry.display_name} url={entry.avatar_url} className="relative z-[1] h-9! w-9!" />
        <div className="relative z-[1] min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {entry.display_name}
            {isMe && <span className="text-brand-500"> (you)</span>}
          </p>
          <p className="truncate text-xs text-muted">
            {sectionLabel ? `${sectionLabel} · ` : ''}Lv {level}
          </p>
        </div>
        <span className="relative z-[1] font-display text-base font-bold text-gold-600 dark:text-gold-400">
          {entry.lifetime_points}
        </span>
      </Card>
    </motion.div>
  )
}

/** Gold motes that rise and fade around the champion card. */
function Sparkles() {
  const motes = [
    { left: '10%', dur: '2.4s', delay: '0s' },
    { left: '26%', dur: '3s', delay: '0.7s' },
    { left: '46%', dur: '2.1s', delay: '1.2s' },
    { left: '64%', dur: '2.7s', delay: '0.35s' },
    { left: '82%', dur: '2.5s', delay: '1s' },
    { left: '92%', dur: '3.1s', delay: '1.6s' },
  ]
  return (
    <div className="pointer-events-none absolute inset-x-0 -top-3 bottom-2 z-0 overflow-visible">
      {motes.map((m, i) => (
        <span
          key={i}
          className="cp-sparkle absolute top-3 h-1.5 w-1.5 rounded-full bg-gold-300"
          style={
            {
              left: m.left,
              '--cp-dur': m.dur,
              '--cp-delay': m.delay,
            } as CSSProperties
          }
        />
      ))}
    </div>
  )
}

/** Eases a number from 0 up to `value` once on mount. */
function CountUp({
  value,
  reduced,
  className,
}: {
  value: number
  reduced: boolean
  className?: string
}) {
  const [n, setN] = useState(reduced ? value : 0)

  useEffect(() => {
    if (reduced) {
      setN(value)
      return
    }
    let raf = 0
    const start = performance.now()
    const duration = 900
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setN(Math.round(value * eased))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, reduced])

  return <span className={className}>{n}</span>
}
