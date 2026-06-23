import { type CSSProperties, useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Card } from '@/components/ui/Card'
import { Avatar } from '@/components/ui/Avatar'
import { CrownIcon } from '@/components/ui/icons'
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
}

type Place = 1 | 2 | 3

/** Per-tier metal treatment for the top three. */
const TIER: Record<
  Place,
  { border: string; tint: string; ring: string; badge: string }
> = {
  1: {
    border: 'border-gold-400/70!',
    tint: 'from-gold-400/25 via-gold-500/5',
    ring: 'ring-gold-400',
    badge: 'bg-gradient-to-b from-gold-200 to-gold-500 text-brand-950',
  },
  2: {
    border: 'border-zinc-400/60!',
    tint: 'from-zinc-300/20 via-zinc-400/5',
    ring: 'ring-zinc-300',
    badge: 'bg-gradient-to-b from-zinc-100 to-zinc-400 text-zinc-800',
  },
  3: {
    border: 'border-amber-700/60!',
    tint: 'from-amber-600/25 via-amber-700/5',
    ring: 'ring-amber-600',
    badge: 'bg-gradient-to-b from-amber-400 to-amber-700 text-amber-950',
  },
}

export function PodiumBoard({
  entries,
  meId,
  sectionName,
  showSection = false,
  pinnedSelf = null,
}: PodiumBoardProps) {
  const reduced = useReducedMotion() ?? false
  if (entries.length === 0) return null

  const label = (id: string) => (showSection ? sectionName?.(id) ?? '' : '')
  const top3 = entries.slice(0, 3).map((entry, i) => ({ entry, place: (i + 1) as Place }))
  const rest = entries.slice(3)

  // Visually raise #1 in the centre: [#2, #1, #3]. Fewer than three → natural order.
  const podiumOrder = top3.length >= 3 ? [top3[1], top3[0], top3[2]] : top3

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-center gap-2 px-1 pt-12 sm:gap-3">
        {podiumOrder.map(({ entry, place }) => (
          <PodiumCard
            key={entry.student_id}
            entry={entry}
            place={place}
            isMe={meId === entry.student_id}
            sectionLabel={label(entry.section_id)}
            reduced={reduced}
          />
        ))}
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
}: {
  entry: LeaderboardEntry
  place: Place
  isMe: boolean
  sectionLabel: string
  reduced: boolean
}) {
  const tier = TIER[place]
  const level = getLevelProgress(entry.lifetime_points).level
  const champ = place === 1

  return (
    <motion.div
      initial={reduced ? false : { y: 44, opacity: 0, scale: 0.92 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 22, delay: 0.08 * place }}
      className={cn('relative flex-1', champ ? 'max-w-[12rem]' : 'max-w-[10rem]')}
    >
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
          'relative flex flex-col items-center gap-2 overflow-hidden border px-3 text-center',
          tier.border,
          champ ? 'pb-4 pt-8' : 'pb-3.5 pt-6',
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

        <span
          className={cn(
            'relative z-[1] flex h-7 w-7 items-center justify-center rounded-full font-display text-sm font-bold shadow-sm',
            tier.badge,
          )}
        >
          {place}
        </span>

        <Avatar
          name={entry.display_name}
          url={entry.avatar_url}
          className={cn(
            'relative z-[1] ring-2 ring-offset-2 ring-offset-card',
            tier.ring,
            champ ? 'h-20! w-20!' : 'h-16! w-16!',
          )}
          textClassName={champ ? 'text-xl' : 'text-lg'}
        />

        <div className="relative z-[1] w-full min-w-0">
          <p className="truncate text-sm font-semibold">
            {entry.display_name}
            {isMe && <span className="text-brand-500"> (you)</span>}
          </p>
          <p className="truncate text-xs text-muted">
            {sectionLabel ? `${sectionLabel} · ` : ''}Lv {level}
          </p>
        </div>

        <div className="relative z-[1] flex items-baseline gap-1">
          <CountUp
            value={entry.lifetime_points}
            reduced={reduced}
            className="font-display text-2xl font-bold text-gold-400"
          />
          <span className="text-xs font-medium text-muted">pts</span>
        </div>
      </Card>
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
}: {
  entry: LeaderboardEntry
  place: number
  isMe: boolean
  sectionLabel: string
  index: number
  reduced: boolean
}) {
  const level = getLevelProgress(entry.lifetime_points).level
  return (
    <motion.div
      layout
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.3) }}
    >
      <Card
        className={cn(
          'relative flex items-center gap-3 overflow-hidden p-3',
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
