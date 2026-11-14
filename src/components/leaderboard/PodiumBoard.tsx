import type { CSSProperties } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Avatar } from '@/components/ui/Avatar'
import { TicketIcon } from '@/components/ui/icons'
import { RankDelta, RankTenure, biggestClimber } from '@/components/leaderboard/RankSignals'
import { SpacePodium } from '@/components/leaderboard/SpacePodium'
import { sectionColor } from '@/lib/sectionColor'
import { getLevelProgress } from '@/lib/leveling'
import { glide } from '@/lib/motion'
import { cn } from '@/lib/cn'
import type { LeaderboardEntry } from '@/lib/types'

interface PodiumBoardProps {
  entries: LeaderboardEntry[]
  /** The viewing student's id, so their own card/row stands out. */
  meId?: string | null
  /** Resolve a section id to its display name. */
  sectionName?: (id: string) => string
  showSection?: boolean
  pinnedSelf?: LeaderboardEntry | null
  onSelect?: (entry: LeaderboardEntry) => void
  rankSignals?: boolean
  metric?: 'points' | 'spent'
}

type Metric = 'points' | 'spent'

/*
 * Ranks 1-3 are the space podium (SpacePodium.tsx): a night sky, three collectible cards on
 * launch-pad risers. Ranks 4-10 are a quiet crew manifest on the same fixed dark plate the
 * home scoreboard uses: rank, face, name, points, and a dotted divider. No bars and no gap
 * figures (the instructor's call): the numbers say how close it is.
 */
function spentSharePct(entry: LeaderboardEntry): number {
  const earned = entry.spent_points + entry.points
  return earned > 0 ? (entry.spent_points / earned) * 100 : 0
}

const valueOf = (e: LeaderboardEntry, m: Metric) => (m === 'spent' ? e.spent_points : e.points)

export function PodiumBoard({
  entries,
  meId,
  sectionName,
  showSection = false,
  pinnedSelf = null,
  onSelect,
  rankSignals = false,
  metric = 'points',
}: PodiumBoardProps) {
  const reduced = useReducedMotion() ?? false

  if (entries.length === 0) return null

  const label = (id: string) => (showSection ? (sectionName?.(id) ?? '') : '')
  const pick = onSelect ? (entry: LeaderboardEntry) => () => onSelect(entry) : undefined
  const climber = biggestClimber(entries)
  const spend = metric === 'spent'
  const rest = entries.slice(3)

  return (
    <div className="space-y-3">
      <SpacePodium
        entries={entries.slice(0, 3)}
        meId={meId}
        metric={metric}
        rankSignals={rankSignals}
        reduced={reduced}
        revealKey={meId ?? 'guest'}
        onSelect={onSelect}
      />

      {(rest.length > 0 || pinnedSelf) && (
        <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-plate-2 to-plate text-white shadow-lg shadow-black/25 ring-1 ring-white/10">
          <div
            className={cn(
              'flex items-center justify-between px-3.5 py-2 text-2xs font-semibold uppercase tracking-widest text-white/55',
              spend ? 'border-b border-dashed border-white/25' : 'border-b border-white/10',
            )}
          >
            <span>Rank</span>
            {spend && <TicketIcon aria-hidden className="h-3.5 w-3.5 text-white/45" />}
            <span>{spend ? 'Points used' : 'Points'}</span>
          </div>

          {rest.length > 0 && (
            <ol className="divide-y divide-dotted divide-white/20">
              {rest.map((entry, i) => (
                <li key={entry.student_id}>
                  <CompactRow
                    entry={entry}
                    place={i + 4}
                    isMe={meId === entry.student_id}
                    sectionLabel={label(entry.section_id)}
                    index={i}
                    reduced={reduced}
                    rankSignals={rankSignals}
                    metric={metric}
                    onClick={pick?.(entry)}
                  />
                </li>
              ))}
            </ol>
          )}

          {pinnedSelf && (
            <div>
              <p
                aria-hidden
                className="border-t border-dashed border-white/25 px-3.5 py-1.5 text-2xs font-semibold uppercase tracking-widest text-white/55"
              >
                Your standing
              </p>
              <CompactRow
                entry={pinnedSelf}
                place={pinnedSelf.rank}
                isMe
                sectionLabel={label(pinnedSelf.section_id)}
                index={0}
                reduced={reduced}
                rankSignals
                metric={metric}
                onClick={pick?.(pinnedSelf)}
              />
            </div>
          )}
        </div>
      )}

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
    </div>
  )
}

function SectionDot({ sectionId }: { sectionId: string }) {
  return (
    <span
      aria-hidden
      className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--dot)]"
      style={{ '--dot': sectionColor(sectionId, true) } as CSSProperties}
    />
  )
}

function Meta({
  entry,
  sectionLabel,
  metric,
  rankSignals,
}: {
  entry: LeaderboardEntry
  sectionLabel: string
  metric: Metric
  rankSignals?: boolean
}) {
  const spend = metric === 'spent'
  return (
    <p className="flex min-w-0 items-center gap-1.5 text-2xs text-white/60 sm:text-xs">
      {sectionLabel && <SectionDot sectionId={entry.section_id} />}
      <span className="min-w-0 truncate">
        {sectionLabel}
        {sectionLabel ? ' · ' : ''}
        {spend ? `${Math.round(spentSharePct(entry))}% cashed in` : `Lv ${getLevelProgress(entry.points).level}`}
      </span>
      {rankSignals && (
        <>
          <RankDelta entry={entry} onPlate />
          <RankTenure entry={entry} onPlate />
        </>
      )}
    </p>
  )
}

const rowChrome = (onClick?: () => void, isMe?: boolean) =>
  cn(
    'relative flex items-center transition-colors',
    isMe && 'bg-white/[0.07]',
    onClick &&
      'cursor-pointer hover:bg-white/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold-300/70',
  )

function rowProps(entry: LeaderboardEntry, place: number, onClick?: () => void) {
  return {
    onClick,
    role: onClick ? ('button' as const) : undefined,
    tabIndex: onClick ? 0 : undefined,
    'aria-label': onClick ? `View ${entry.display_name}'s profile, rank ${place}` : undefined,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (onClick && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault()
        onClick()
      }
    },
  }
}

function CompactRow({
  entry,
  place,
  isMe,
  sectionLabel,
  index,
  reduced,
  rankSignals,
  metric,
  onClick,
}: {
  entry: LeaderboardEntry
  place: number
  isMe: boolean
  sectionLabel: string
  index: number
  reduced: boolean
  rankSignals?: boolean
  metric: Metric
  onClick?: () => void
}) {
  return (
    <motion.div
      layout={!reduced}
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...glide, delay: 0.2 + Math.min(index * 0.03, 0.3) }}
      whileTap={onClick ? { scale: 0.99 } : undefined}
      {...rowProps(entry, place, onClick)}
      className={cn(rowChrome(onClick, isMe), 'gap-3 px-3.5 py-3')}
    >
      <span className="w-7 shrink-0 text-center font-display text-lg font-bold tabular-nums text-white/60">
        {place}
      </span>
      <Avatar name={entry.display_name} url={entry.avatar_url} className="h-8! w-8!" textClassName="text-xs" />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="truncate text-sm font-semibold">
          {entry.display_name}
          {isMe && <span className="text-gold-300"> (you)</span>}
        </p>
        <Meta entry={entry} sectionLabel={sectionLabel} metric={metric} rankSignals={rankSignals} />
      </div>
      <span className="shrink-0 text-right">
        <span className="block font-display text-lg font-bold leading-none tabular-nums text-gold-300">
          {valueOf(entry, metric)}
        </span>
      </span>
    </motion.div>
  )
}

