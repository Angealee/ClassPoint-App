import { useEffect, useState, type CSSProperties } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Card, Rows } from '@/components/ui/Card'
import { Avatar } from '@/components/ui/Avatar'
import { CrownIcon, TicketIcon } from '@/components/ui/icons'
import { ConfettiBurst } from '@/components/leaderboard/ConfettiBurst'
import { RankDelta, RankTenure, biggestClimber } from '@/components/leaderboard/RankSignals'
import { sectionColor } from '@/lib/sectionColor'
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
  /**
   * Show the rank-movement arrow and tenure flame (0037).
   *
   * MUST be false on a filtered view. `previous_rank` and `rank_since` describe
   * a student's position on the WHOLE board, while a section view renumbers
   * rows by their position within that section — so a row could read "#4 ▲3"
   * when the position on screen never moved. Rather than silently mixing two
   * different rankings, the signals are simply omitted where they can't be
   * stated truthfully.
   */
  rankSignals?: boolean
  /**
   * Which number this board ranks on (0038).
   *
   * `'spent'` is NOT a cosmetic swap. This component derives a level from
   * `entry.points` for the XP ring and the "Lv N" label, and spend totals run
   * through the level curve produce a CONFIDENTLY WRONG level for every
   * student. So the spend board skips the level computation entirely — plain
   * ring, no level line — rather than showing a number that means nothing.
   *
   * Varying the board instead of copying it is deliberate: this codebase has
   * paid five times over for duplicating the show-up-rate rule and four times
   * for duplicating the points row, discovering each time that the copies had
   * drifted apart.
   */
  metric?: 'points' | 'spent'
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

/**
 * The spend board's own ramp — a TICKET STUB rather than a medal.
 *
 * You did not win third place at spending; you cashed something in. So the
 * champion wears a ticket instead of a crown, the stands carry punched notches,
 * and the metal ramps give way to a violet family that is unmistakably not
 * gold. That last part is the point: a student who lands on a board should know
 * which one it is from a glance at a screenshot, without reading a word.
 *
 * Raw palette values, exactly like the medal ramps above — PodiumBoard is one
 * of the three declared token-free art islands (see tone.test.ts). A two-stop
 * gradient plus the ink that sits on it is not something a flat role token can
 * express, which is why --silver and --bronze were removed in Phase 4.
 *
 * Violet to indigo to slate is a DESCENDING ramp, so it still reads as 1-2-3.
 */
const TIER_SPEND: typeof TIER = {
  1: {
    border: 'border-violet-400/70!',
    tint: 'from-violet-400/25 via-violet-500/5',
    pedestal: 'from-violet-300 to-violet-600',
    pedestalBorder: 'border-violet-600/50',
    pedestalInk: 'text-violet-950',
  },
  2: {
    border: 'border-indigo-400/60!',
    tint: 'from-indigo-300/20 via-indigo-400/5',
    pedestal: 'from-indigo-200 to-indigo-500',
    pedestalBorder: 'border-indigo-500/50',
    pedestalInk: 'text-indigo-900',
  },
  3: {
    border: 'border-slate-400/60!',
    tint: 'from-slate-400/20 via-slate-500/5',
    pedestal: 'from-slate-300 to-slate-500',
    pedestalBorder: 'border-slate-500/50',
    pedestalInk: 'text-slate-800',
  },
}

/**
 * What share of everything they earned this semester they have actually spent.
 *
 * `points` is the balance still on the board and `spent_points` is what left, so the
 * two together are what they earned — the same arithmetic UsePoints already
 * shows you about yourself ("you've cashed in 12 of the 40 you've earned").
 *
 * It fills the ring that level progress leaves empty on this board, and it is
 * the most interesting figure on it: who is all-in versus who is hoarding.
 */
function spentSharePct(entry: LeaderboardEntry): number {
  const earned = entry.spent_points + entry.points
  return earned > 0 ? (entry.spent_points / earned) * 100 : 0
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
  rankSignals = false,
  metric = 'points',
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
  const climber = biggestClimber(entries)

  // Visually raise #1 in the centre: [#2, #1, #3]. Fewer than three → natural order.
  const podiumOrder = top3.length >= 3 ? [top3[1], top3[0], top3[2]] : top3

  return (
    <div className="space-y-3">
      <div className="relative">
        {/* A single STATIC wash grounds the podium. It used to breathe
            (cp-arena-glow); with comments now flying in front of the board, one
            more thing pulsing was one too many.
            The hue follows the board — a GOLD halo behind the violet spend
            podium was the one thing still saying "points" on a screen that had
            otherwise changed colour completely. */}
        {glow && (
          <div
            className="pointer-events-none absolute left-1/2 top-6 h-44 w-[130%] -translate-x-1/2 rounded-[50%]"
            style={{
              background:
                metric === 'spent'
                  ? 'radial-gradient(ellipse at center, rgba(167,139,250,0.16), rgba(167,139,250,0) 70%)'
                  : 'radial-gradient(ellipse at center, rgba(255,186,31,0.16), rgba(255,186,31,0) 70%)',
            }}
          />
        )}
        {/* Confetti stays: it fires ONCE on arrival, so it is a moment rather
            than ambient motion. */}
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
              rankSignals={rankSignals}
              metric={metric}
              onClick={pick?.(entry)}
            />
          ))}
        </div>

        {/* Shared stage floor — grounds the three stands so they read as one
            podium instead of floating bars. */}
        <div className="relative z-[1] -mt-px h-2.5 rounded-b-lg border border-t-0 border-line bg-gradient-to-b from-card-2 to-card shadow-sm" />
      </div>

      {/* Who moved most, sitting between the podium and the rest — which is
          exactly what it means: the bridge from "the winners" to "everyone
          else". Gated on rankSignals for the same reason the per-row arrows
          are: previous_rank describes the WHOLE board, so on a section view it
          would be mixing two different rankings. */}
      {rankSignals && climber && (
        <div className="flex items-center gap-2.5 rounded-xl bg-success-solid/10 px-3 py-2">
          <span className="text-sm font-bold text-success" aria-hidden>
            ▲
          </span>
          <p className="min-w-0 flex-1 truncate text-xs">
            <span className="font-semibold">{climber.name}</span>
            <span className="text-muted">
              {' '}
              climbed {climber.places} place{climber.places === 1 ? '' : 's'}
            </span>
          </p>
          <span className="shrink-0 text-2xs uppercase tracking-wider text-muted">
            biggest climb
          </span>
        </div>
      )}

      {/* One divided list, not seven floating cards. This is where most
          students actually find themselves, so it should read as a ranking —
          and it reclaims the vertical space seven card gaps were spending. */}
      {rest.length > 0 && (
        <Rows>
          {rest.map((entry, i) => (
            <RestRow
              key={entry.student_id}
              entry={entry}
              place={i + 4}
              isMe={meId === entry.student_id}
              sectionLabel={label(entry.section_id)}
              index={i}
              reduced={reduced}
              rankSignals={rankSignals}
              metric={metric}
              onClick={pick?.(entry)}
              // entries[i + 2] is the row directly above this one (place i+3).
              gapToAbove={
                meId === entry.student_id
                  ? Math.max(0, entries[i + 2].points - entry.points)
                  : null
              }
            />
          ))}
        </Rows>
      )}

      {pinnedSelf && (
        <div className="space-y-1 pt-1">
          <p className="text-center text-2xs uppercase tracking-wider text-muted">
            your standing
          </p>
          <Rows>
          <RestRow
            entry={pinnedSelf}
            place={pinnedSelf.rank}
            isMe
            sectionLabel={label(pinnedSelf.section_id)}
            index={0}
            reduced={reduced}
            metric={metric}
            // Safe even in a section view: this row is numbered by the real
            // global rank, not a position within the filtered list.
            rankSignals
            onClick={pick?.(pinnedSelf)}
          />
          </Rows>
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
  rankSignals,
  metric,
  onClick,
}: {
  entry: LeaderboardEntry
  place: Place
  isMe: boolean
  sectionLabel: string
  reduced: boolean
  rankSignals?: boolean
  metric: 'points' | 'spent'
  onClick?: () => void
}) {
  const spend = metric === 'spent'
  const tier = spend ? TIER_SPEND[place] : TIER[place]
  // On the spend board there is no level to show — see the `metric` doc above.
  const progress = spend ? null : getLevelProgress(entry.points)
  const value = spend ? entry.spent_points : entry.points
  // Gold level progress on the points board, share-of-earnings on the spend
  // board. Same ring, same geometry, so the two podiums read as siblings.
  const ringPct = spend ? spentSharePct(entry) : (progress?.progressPct ?? 0)
  const ringColor = spend ? '#a78bfa' : '#ffba1f'
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
          'cursor-pointer rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
      )}
    >
      {/* A crown for the top of the points board, a ticket for the top of the
          spend board. Same slot, same bob — the glyph is the tell. */}
      {champ && (
        <div className="pointer-events-none absolute -top-9 left-1/2 z-20 -translate-x-1/2">
          {spend ? (
            <TicketIcon
              className={cn('h-9 w-9 text-violet-400 drop-shadow-md', !reduced && 'cp-bob')}
            />
          ) : (
            <CrownIcon
              className={cn('h-9 w-9 text-gold-400 drop-shadow-md', !reduced && 'cp-bob')}
            />
          )}
        </div>
      )}

      <Card pad="none"
        className={cn(
          'relative flex flex-col items-center gap-1.5 overflow-hidden border px-2 text-center sm:gap-2 sm:px-3',
          tier.border,
          champ ? 'pb-3 pt-7 sm:pb-4 sm:pt-8' : 'pb-3 pt-5 sm:pb-3.5 sm:pt-6',
          // The champion's card carries a steady gold edge instead of a
          // breathing glow — still clearly the winner, no longer pulsing.
          champ && 'ring-1 ring-gold-400/40',
        )}
      >
        {/* Metal tint wash. */}
        <div
          className={cn('pointer-events-none absolute inset-0 bg-gradient-to-b to-transparent', tier.tint)}
        />
        {/* "You" tint. */}
        {isMe && <div className="pointer-events-none absolute inset-0 bg-accent-solid/10" />}

        {/* One ring, two meanings: level progress on the points board, and how
            much of everything they've earned they've cashed in on the spend
            board. It used to sit empty on the spend board, which read as
            something that had failed to load. */}
        <div
          className="relative z-[1] rounded-full p-[3px]"
          style={{
            background: `conic-gradient(${ringColor} ${ringPct}%, rgba(160,160,160,0.25) ${ringPct}%)`,
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
          <p className="truncate text-xs font-semibold sm:text-sm">
            {entry.display_name}
            {isMe && <span className="text-accent"> (you)</span>}
          </p>
          {/* The ring's number, written out — "Lv 3" on one board, "60%
              cashed in" on the other. Reading the same slot differently is
              itself a signal of which board you're on. */}
          <p className="truncate text-2xs text-muted sm:text-xs">
            {sectionLabel}
            {sectionLabel ? ' · ' : ''}
            {spend ? `${Math.round(ringPct)}% cashed in` : `Lv ${progress?.level ?? 1}`}
          </p>
        </div>

        <div className="relative z-[1] flex items-baseline gap-1">
          <CountUp
            value={value}
            reduced={reduced}
            className="font-display text-xl font-bold text-gold-400 sm:text-2xl"
          />
          {/* "used" rather than "spent": the shop screen is called Use points
              and the ledger writes "Used · …", so this is the word students
              already have for it. */}
          <span className="text-xs font-medium text-muted">
            {metric === 'spent' ? 'used' : 'pts'}
          </span>
        </div>

        {/* Movement + tenure (0037). Their own centred row rather than the name
            line: these cards are a third of the screen wide, and the top of the
            board is exactly where "held #1 for six days" is worth reading. Both
            render nothing when they have nothing to say, so the row collapses. */}
        {rankSignals && (
          <div className="relative z-[1] flex flex-wrap items-center justify-center gap-1">
            <RankDelta entry={entry} />
            <RankTenure entry={entry} />
          </div>
        )}
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
        {/* Punched notches — the stand becomes a torn ticket stub. Half of each
            circle sits outside the pedestal and is clipped away by its own
            overflow-hidden, so what shows is a bite out of the edge rather
            than a dot on top of it. Sized for the SHORTEST stand (#3 is h-7),
            or the notches would meet in the middle there. */}
        {spend && (
          <>
            <span
              aria-hidden
              className="absolute -left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-canvas"
            />
            <span
              aria-hidden
              className="absolute -right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-canvas"
            />
          </>
        )}
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
  rankSignals,
  metric,
  onClick,
  gapToAbove,
}: {
  entry: LeaderboardEntry
  place: number
  isMe: boolean
  sectionLabel: string
  index: number
  reduced: boolean
  rankSignals?: boolean
  metric: 'points' | 'spent'
  onClick?: () => void
  /**
   * Points needed to pass the row above — shown on YOUR row only.
   *
   * On every row it becomes ten small numbers competing with the points
   * column, and for someone forty points back it reads as discouraging rather
   * than motivating. On your own row it is the one figure you can act on.
   */
  gapToAbove?: number | null
}) {
  const spend = metric === 'spent'
  // Null on the spend board — see the `metric` doc on PodiumBoardProps.
  const level = spend ? null : getLevelProgress(entry.points).level
  const value = spend ? entry.spent_points : entry.points
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
        'relative',
        onClick &&
          'cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50',
      )}
    >
      <div
        className={cn(
          'relative flex items-center gap-3 overflow-hidden p-3 transition-colors',
          onClick && 'hover:bg-card-2',
        )}
      >
        {isMe && <div className="pointer-events-none absolute inset-0 bg-accent-solid/10" />}
        {/* The rank is the primary datum on a leaderboard, so it anchors the
            row. It used to be the quietest element in it — muted, and the same
            size as the points on the far right. */}
        <span className="relative z-[1] w-7 shrink-0 text-center font-display text-lg font-bold tabular-nums">
          {place}
        </span>
        <Avatar name={entry.display_name} url={entry.avatar_url} className="relative z-[1] h-9! w-9!" />
        <div className="relative z-[1] min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {entry.display_name}
            {isMe && <span className="text-accent"> (you)</span>}
          </p>
          {/* Section + level, then the two movement signals (0037). Both hide
              themselves when there's nothing to say — no arrow on an unchanged
              rank, no flame under a day — so this line stays quiet for most
              rows instead of becoming a column of dashes and zeroes. */}
          <p className="flex items-center gap-1.5 text-xs text-muted">
            {/* A stable colour per section, so you can find your own class among
                208 students on the global board. Both theme values ride as CSS
                variables rather than reading the theme once in JS, so the dot
                follows a theme switch like everything else. */}
            {sectionLabel && (
              <span
                aria-hidden
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--dot)] dark:bg-[var(--dot-dark)]"
                style={
                  {
                    '--dot': sectionColor(entry.section_id, false),
                    '--dot-dark': sectionColor(entry.section_id, true),
                  } as CSSProperties
                }
              />
            )}
            <span className="truncate">
              {sectionLabel}
              {sectionLabel ? ' · ' : ''}
              {spend
                ? `${Math.round(spentSharePct(entry))}% cashed in`
                : `Lv ${level ?? 1}`}
            </span>
            {rankSignals && (
              <>
                <RankDelta entry={entry} />
                <RankTenure entry={entry} />
              </>
            )}
          </p>
        </div>
        <span className="relative z-[1] shrink-0 text-right">
          <span className="block font-display text-base font-bold tabular-nums text-reward">
            {value}
          </span>
          {gapToAbove !== null && gapToAbove !== undefined && (
            <span className="block text-2xs tabular-nums text-muted">
              {gapToAbove === 0 ? `tied with #${place - 1}` : `${gapToAbove} to #${place - 1}`}
            </span>
          )}
        </span>
      </div>
    </motion.div>
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
