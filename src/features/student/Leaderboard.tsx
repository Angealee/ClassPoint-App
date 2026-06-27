import { useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Select } from '@/components/ui/Select'
import { Avatar } from '@/components/ui/Avatar'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { SnapshotChip } from '@/components/ui/SnapshotStamp'
import { TrophyIcon } from '@/components/ui/icons'
import { PodiumBoard } from '@/components/leaderboard/PodiumBoard'
import { getLevelProgress } from '@/lib/leveling'
import { cn } from '@/lib/cn'
import type { LeaderboardEntry } from '@/lib/types'
import { useStudentData } from './StudentData'
import { StudentProfilePreview } from './StudentProfilePreview'

const TOP_N = 10
const GLOBAL = 'global'

export function Leaderboard() {
  const { loading, leaderboard, capturedAt, me, sections, sectionName } = useStudentData()
  const [selected, setSelected] = useState<LeaderboardEntry | null>(null)
  // Which board to show: the global ranking or a single section's. The snapshot
  // already carries every student + section, so a section view is just a filter
  // over `leaderboard` — no extra query.
  const [view, setView] = useState<string>(GLOBAL)

  const isGlobal = view === GLOBAL

  // Entries for the chosen view, kept in the snapshot's rank order.
  const ranked = useMemo(
    () => (isGlobal ? leaderboard : leaderboard.filter((e) => e.section_id === view)),
    [leaderboard, view, isGlobal],
  )

  const top = ranked.slice(0, TOP_N)
  const meIdx = me ? ranked.findIndex((e) => e.student_id === me.id) : -1
  const meEntry = meIdx >= 0 ? ranked[meIdx] : null
  // Position within the current view: in the global view this is the snapshot
  // rank; in a section view it's the place within that section.
  const myPos = meIdx + 1
  const delta = useRankDelta(me?.id, view, capturedAt, meEntry ? myPos : null)

  const subtitle = isGlobal ? `Top ${TOP_N}` : sectionName(view)

  return (
    <div className="space-y-4">
      {/* Compact header: title + slim chips on the left, picker on the right. */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold leading-tight">Leaderboard</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-card-2 px-2.5 py-1 text-xs font-semibold text-muted">
              <TrophyIcon className="h-3.5 w-3.5" />
              {subtitle}
            </span>
            <SnapshotChip capturedAt={capturedAt} />
          </div>
        </div>
        <Select
          value={view}
          onChange={(e) => setView(e.target.value)}
          aria-label="Choose leaderboard"
          className="max-w-34 shrink-0"
        >
          <option value={GLOBAL}>Global</option>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.id === me?.section_id ? ' (mine)' : ''}
            </option>
          ))}
        </Select>
      </div>

      {/* Your standing — a hero band so every student feels seen, not just top 3. */}
      {!loading && meEntry && (
        <YourRankCard
          entry={meEntry}
          position={myPos}
          delta={delta}
          sectionLabel={sectionName(meEntry.section_id)}
          inTop={meIdx < TOP_N}
          onClick={() => setSelected(meEntry)}
        />
      )}

      {loading ? (
        <ListSkeleton rows={8} />
      ) : top.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">
          {isGlobal
            ? 'No rankings yet — the board settles at 7:30 AM and 7:30 PM.'
            : `No ranked students in ${sectionName(view)} yet.`}
        </Card>
      ) : (
        <PodiumBoard
          entries={top}
          meId={me?.id}
          sectionName={sectionName}
          showSection={isGlobal}
          onSelect={(entry) => setSelected(entry)}
        />
      )}

      <StudentProfilePreview
        target={selected}
        open={!!selected}
        onClose={() => setSelected(null)}
        isMe={!!selected && me?.id === selected.student_id}
        sectionLabel={selected ? sectionName(selected.section_id) : ''}
      />
    </div>
  )
}

/** The viewer's own standing, highlighted above the podium. Tap to open profile. */
function YourRankCard({
  entry,
  position,
  delta,
  sectionLabel,
  inTop,
  onClick,
}: {
  entry: LeaderboardEntry
  position: number
  delta: number | null
  sectionLabel: string
  inTop: boolean
  onClick: () => void
}) {
  const level = getLevelProgress(entry.lifetime_points).level
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="View your profile"
      className="block w-full overflow-hidden rounded-2xl border border-gold-400/40 bg-linear-to-r from-brand-500/10 via-card to-gold-400/10 p-3.5 text-left transition-transform active:scale-[0.99]"
    >
      <div className="flex items-center gap-3">
        <div className="w-12 shrink-0 text-center">
          <p className="text-[0.58rem] font-semibold uppercase tracking-wider text-muted">
            Your rank
          </p>
          <p className="font-display text-3xl font-bold leading-none text-gold-600 dark:text-gold-400">
            #{position}
          </p>
          <RankDelta delta={delta} />
        </div>
        <div className="h-11 w-px shrink-0 bg-line" />
        <Avatar
          name={entry.display_name}
          url={entry.avatar_url}
          className="h-12! w-12! ring-2 ring-gold-400/50"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {entry.display_name} <span className="text-brand-500">(you)</span>
          </p>
          <p className="truncate text-xs text-muted">
            {sectionLabel} · Lv {level}
          </p>
          {inTop && (
            <p className="mt-0.5 text-xs font-semibold text-gold-600 dark:text-gold-400">
              In the Top {TOP_N}!
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="font-display text-xl font-bold text-gold-600 dark:text-gold-400">
            {entry.lifetime_points}
          </p>
          <p className="text-[0.65rem] uppercase tracking-wider text-muted">pts</p>
        </div>
      </div>
    </button>
  )
}

/** ▲/▼ movement since the last settle (or "new" / "no change"). */
function RankDelta({ delta }: { delta: number | null }) {
  if (delta == null) {
    return <p className="text-[0.62rem] font-medium text-muted">new</p>
  }
  if (delta === 0) {
    return <p className="text-[0.62rem] font-medium text-muted">— same</p>
  }
  const up = delta > 0
  return (
    <p className={cn('text-[0.66rem] font-bold', up ? 'text-emerald-500' : 'text-red-500')}>
      {up ? '▲' : '▼'} {Math.abs(delta)}
    </p>
  )
}

/**
 * How the viewer moved since the *previous* settle, for the current view.
 * Tracks per (student, view) in localStorage: when the snapshot's captured_at
 * advances we compute (old position − new position) — positive means climbed —
 * and remember it until the next settle so the arrow is stable between visits.
 */
function useRankDelta(
  studentId: string | undefined,
  view: string,
  capturedAt: string | null,
  currentPos: number | null,
): number | null {
  const [delta, setDelta] = useState<number | null>(null)
  useEffect(() => {
    if (!studentId || currentPos == null || !capturedAt) {
      setDelta(null)
      return
    }
    const key = `cp_rank_track_${studentId}_${view}`
    let stored: { capturedAt: string; rank: number; prevRank: number | null } | null = null
    try {
      stored = JSON.parse(localStorage.getItem(key) ?? 'null')
    } catch {
      stored = null
    }
    if (!stored) {
      setDelta(null)
      localStorage.setItem(key, JSON.stringify({ capturedAt, rank: currentPos, prevRank: null }))
      return
    }
    if (stored.capturedAt !== capturedAt) {
      const moved = stored.rank - currentPos
      setDelta(moved)
      localStorage.setItem(
        key,
        JSON.stringify({ capturedAt, rank: currentPos, prevRank: stored.rank }),
      )
    } else {
      setDelta(stored.prevRank != null ? stored.prevRank - stored.rank : null)
    }
  }, [studentId, view, capturedAt, currentPos])
  return delta
}
